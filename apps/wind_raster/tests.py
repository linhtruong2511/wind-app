import os
import tempfile
import zipfile
from datetime import datetime, timezone as dt_timezone

import numpy as np
import pandas as pd
import xarray as xr
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Polygon
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from wind_core.models import Dataset, DatasetVariable, IngestionLog
from wind_raster.models import RasterGranuleIndex
from wind_raster.serializers import (
    RasterGranuleIndexGeoSerializer,
    RasterGranuleIndexSerializer,
)
from wind_raster.services.netcdf_service import (
    calculate_wind_speed_direction,
    get_netcdf_data,
)
from wind_raster.services.raster_ingest import IngestError, ingest_netcdf
from wind_raster.services.raster_service import _parse_bbox
from wind_raster.services.time_parsing import parse_time_from_filename


@override_settings(ROOT_URLCONF="wind_raster.urls")
class RasterTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.now = timezone.now().replace(microsecond=0)
        self.dataset = Dataset.objects.create(
            code="ERA5_GRID",
            name="ERA5 Grid",
            category="GRIDDED",
        )
        self.poly = Polygon.from_bbox((102.0, 8.0, 110.0, 24.0))
        self.poly.srid = 4326

        self.granule = RasterGranuleIndex.objects.create(
            dataset=self.dataset,
            granule_time=self.now,
            footprint=self.poly,
            file_location="/data/era5.nc",
            variable_code="wind_10m",
            elevation=10.0,
        )

    def test_raster_granule_serializer(self):
        """Kiểm tra serialize dữ liệu RasterGranuleIndex theo Task 4 Step 1."""
        data = RasterGranuleIndexSerializer(self.granule).data
        self.assertEqual(data["file_location"], "/data/era5.nc")
        self.assertEqual(data["dataset_code"], "ERA5_GRID")
        self.assertEqual(data["variable_code"], "wind_10m")

    def test_raster_granule_geo_serializer(self):
        """Kiểm tra RasterGranuleIndexGeoSerializer chuẩn GeoJSON feature."""
        data = RasterGranuleIndexGeoSerializer(self.granule).data
        self.assertEqual(data["type"], "Feature")
        self.assertIn("geometry", data)
        self.assertEqual(data["properties"]["file_location"], "/data/era5.nc")

    def test_calculate_wind_speed_direction(self):
        """Kiểm tra hàm tính toán vector tốc độ và hướng gió."""
        # 3-4-5 triangle
        speed, direction = calculate_wind_speed_direction(3.0, 4.0)
        self.assertEqual(speed, 5.0)
        self.assertAlmostEqual(direction, 216.87, places=2)

        # None / NaN inputs
        s_none, d_none = calculate_wind_speed_direction(None, 4.0)
        self.assertIsNone(s_none)
        self.assertIsNone(d_none)

        s_nan, d_nan = calculate_wind_speed_direction(float("nan"), 4.0)
        self.assertIsNone(s_nan)
        self.assertIsNone(d_nan)

        # Array calculation
        speeds, directions = calculate_wind_speed_direction([3.0, 0.0], [4.0, 0.0])
        self.assertEqual(len(speeds), 2)
        self.assertEqual(speeds[0], 5.0)
        self.assertEqual(speeds[1], 0.0)

    def test_parse_bbox(self):
        """Kiểm tra tiện ích phân tích chuỗi bounding box."""
        self.assertIsNone(_parse_bbox(None))
        self.assertIsNone(_parse_bbox(""))
        self.assertIsNone(_parse_bbox("102,8,110"))
        self.assertIsNone(_parse_bbox("invalid,bbox,data,here"))
        bbox = _parse_bbox("102.0,8.0,110.0,24.0")
        self.assertEqual(bbox, [102.0, 8.0, 110.0, 24.0])

    def test_netcdf_service_not_found(self):
        """Kiểm tra bắt lỗi nếu file NetCDF không tồn tại trên đĩa."""
        with self.assertRaises(FileNotFoundError):
            get_netcdf_data("/nonexistent/path/file.nc")

    def test_netcdf_service_with_synthetic_file(self):
        """Kiểm tra get_netcdf_data với file NetCDF tự tạo."""
        lats = np.array([10.0, 11.0, 12.0, 13.0])
        lons = np.array([105.0, 106.0, 107.0, 108.0])
        u_vals = np.array([
            [3.0, 3.0, 3.0, 3.0],
            [3.0, 3.0, 3.0, 3.0],
            [3.0, 3.0, 3.0, 3.0],
            [3.0, 3.0, 3.0, 3.0],
        ])
        v_vals = np.array([
            [4.0, 4.0, 4.0, 4.0],
            [4.0, 4.0, 4.0, 4.0],
            [4.0, 4.0, 4.0, 4.0],
            [4.0, 4.0, 4.0, 4.0],
        ])

        with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            ds = xr.Dataset(
                data_vars={
                    "u10": (("latitude", "longitude"), u_vals),
                    "v10": (("latitude", "longitude"), v_vals),
                },
                coords={
                    "latitude": lats,
                    "longitude": lons,
                },
            )
            ds.to_netcdf(tmp_path)
            ds.close()

            # 1. Đọc dữ liệu đầy đủ
            res = get_netcdf_data(tmp_path, u="u10", v="v10")
            self.assertEqual(len(res["lats"]), 4)
            self.assertEqual(len(res["lons"]), 4)
            self.assertEqual(res["u"][0][0], 3.0)
            self.assertEqual(res["v"][0][0], 4.0)
            self.assertEqual(res["speed"][0][0], 5.0)
            self.assertAlmostEqual(res["direction"][0][0], 216.87, places=2)

            # 2. Downsampling với step = 2
            res_step = get_netcdf_data(tmp_path, step=2, u="u10", v="v10")
            self.assertEqual(len(res_step["lats"]), 2)
            self.assertEqual(len(res_step["lons"]), 2)

            # 3. Bounding box slice
            res_bbox = get_netcdf_data(tmp_path, bbox=[105.5, 10.5, 107.5, 12.5], u="u10", v="v10")
            self.assertTrue(len(res_bbox["lats"]) > 0)
            self.assertTrue(len(res_bbox["lons"]) > 0)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_summary_action(self):
        """Kiểm tra action summary của RasterGranuleIndexViewSet."""
        res = self.client.get("/raster-granules/summary/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_granules"], 1)
        self.assertIsNotNone(data["min_granule_time"])
        self.assertIsNotNone(data["max_granule_time"])
        self.assertEqual(len(data["datasets"]), 1)
        self.assertEqual(data["datasets"][0]["dataset_code"], "ERA5_GRID")
        self.assertIn("wind_10m", data["unique_variable_codes"])

    def test_point_metadata_action(self):
        """Kiểm tra action point_metadata của RasterGranuleIndexViewSet."""
        # Thiếu tham số -> 400
        res_missing = self.client.get("/raster-granules/point_metadata/")
        self.assertEqual(res_missing.status_code, 400)

        # Tham số không hợp lệ -> 400
        res_invalid = self.client.get(
            "/raster-granules/point_metadata/?lat=invalid&lon=invalid&time=2026-01-01T00:00:00Z&dataset_code=ERA5_GRID"
        )
        self.assertEqual(res_invalid.status_code, 400)

        # Điểm nằm trong phạm vi footprint
        iso_time = self.now.isoformat()
        res_inside = self.client.get(
            f"/raster-granules/point_metadata/?lat=15.0&lon=106.0&time={iso_time}&dataset_code=ERA5_GRID"
        )
        self.assertEqual(res_inside.status_code, 200)
        inside_data = res_inside.json()
        results = inside_data.get("results", inside_data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["file_location"], "/data/era5.nc")

        # Điểm nằm ngoài footprint
        res_outside = self.client.get(
            f"/raster-granules/point_metadata/?lat=1.0&lon=1.0&time={iso_time}&dataset_code=ERA5_GRID"
        )
        self.assertEqual(res_outside.status_code, 200)
        outside_data = res_outside.json()
        out_results = outside_data.get("results", outside_data)
        self.assertEqual(len(out_results), 0)

    def test_data_action_validation_and_execution(self):
        """Kiểm tra action data của RasterGranuleIndexViewSet."""
        # 1. Thiếu dataset_id
        res = self.client.get("/raster-granules/data/")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Thiếu tham số dataset_id", res.json()["error"])

        # 2. Thiếu variable
        res = self.client.get(f"/raster-granules/data/?dataset_id={self.dataset.id}")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Thiếu tham số variable", res.json()["error"])

        # 3. dataset_id không hợp lệ
        res = self.client.get("/raster-granules/data/?dataset_id=abc&variable=wind_10m")
        self.assertEqual(res.status_code, 400)

        # 4. Biến chưa được đăng ký trong DatasetVariable
        res = self.client.get(f"/raster-granules/data/?dataset_id={self.dataset.id}&variable=unknown_var")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Biến không hợp lệ", res.json()["error"])

        # Tạo DatasetVariable với components
        DatasetVariable.objects.create(
            dataset=self.dataset,
            variable_code="wind_10m",
            variable_name="Gió 10m",
            unit="m/s",
            components=["u10", "v10"],
            is_component=False,
        )

        # 5. File không tồn tại trên ổ cứng -> Bắt lỗi 400 an toàn
        res = self.client.get(f"/raster-granules/data/?dataset_id={self.dataset.id}&variable=wind_10m")
        self.assertEqual(res.status_code, 400)
        self.assertIn("NetCDF file not found", res.json()["error"])

        # 6. Tạo file thật và kiểm tra thành công
        with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            ds = xr.Dataset(
                data_vars={
                    "u10": (("latitude", "longitude"), [[2.0, 2.0], [2.0, 2.0]]),
                    "v10": (("latitude", "longitude"), [[0.0, 0.0], [0.0, 0.0]]),
                },
                coords={
                    "latitude": [10.0, 11.0],
                    "longitude": [105.0, 106.0],
                },
            )
            ds.to_netcdf(tmp_path)
            ds.close()

            self.granule.file_location = tmp_path
            self.granule.save(update_fields=["file_location"])

            res_ok = self.client.get(
                f"/raster-granules/data/?dataset_id={self.dataset.id}&variable=wind_10m&time={self.now.isoformat()}&step=1"
            )
            self.assertEqual(res_ok.status_code, 200)
            data_ok = res_ok.json()
            self.assertIn("lats", data_ok)
            self.assertIn("lons", data_ok)
            self.assertIn("u", data_ok)
            self.assertIn("v", data_ok)
            self.assertIn("speed", data_ok)
            self.assertEqual(data_ok["speed"][0][0], 2.0)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_ingest_netcdf_service(self):
        """Kiểm tra ingest_netcdf service bóc tách file NetCDF và tạo granule index."""
        with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            time_val = pd.date_range("2026-01-01 00:00", periods=2, freq="1h")
            ds = xr.Dataset(
                data_vars={
                    "u10": (
                        ("time", "latitude", "longitude"),
                        [[[2.0, 2.0], [2.0, 2.0]], [[3.0, 3.0], [3.0, 3.0]]],
                        {"standard_name": "eastward_wind", "long_name": "10m U wind component"},
                    ),
                    "v10": (
                        ("time", "latitude", "longitude"),
                        [[[0.0, 0.0], [0.0, 0.0]], [[4.0, 4.0], [4.0, 4.0]]],
                        {"standard_name": "northward_wind", "long_name": "10m V wind component"},
                    ),
                },
                coords={
                    "time": time_val,
                    "latitude": [10.0, 11.0],
                    "longitude": [105.0, 106.0],
                },
            )
            ds.to_netcdf(tmp_path)
            ds.close()

            result = ingest_netcdf(tmp_path, self.dataset)
            self.assertEqual(result.granules, 2)
            self.assertIn("wind_10m", result.variables)

            # Kiểm tra granules được tạo trong database
            granules_count = RasterGranuleIndex.objects.filter(dataset=self.dataset).count()
            # setUp có 1 granule, ingest thêm 2
            self.assertEqual(granules_count, 3)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)


class FilenameTimeTest(SimpleTestCase):
    def test_parses_supported_patterns(self):
        expected = datetime(2021, 1, 1, 6, tzinfo=dt_timezone.utc)
        names = (
            "2021010106.nc",
            "20210101_06.nc",
            "2021-01-01_06.nc",
            "wrfout_d01_2021-01-01_06:00:00.nc",
            "wrf3km_2021010106_cut.nc",
            "D:/Data/2021/2021010106.nc",
        )
        for name in names:
            with self.subTest(name=name):
                self.assertEqual(parse_time_from_filename(name), expected)

    def test_parses_minutes(self):
        self.assertEqual(
            parse_time_from_filename("202101010630.nc"),
            datetime(2021, 1, 1, 6, 30, tzinfo=dt_timezone.utc),
        )

    def test_returns_none_when_name_has_no_valid_time(self):
        for name in ("abc.nc", "2021133100.nc", "20210101.nc", "202101010600123.nc", ""):
            with self.subTest(name=name):
                self.assertIsNone(parse_time_from_filename(name))


def _write_grid_file(path, names=("u10m", "v10m", "u100m", "v100m"), value=1.0):
    """Tạo tệp lưới giống dữ liệu WRF đã cắt: không có trục thời gian, biến không có mô tả."""
    ds = xr.Dataset(
        data_vars={n: (("lat", "lon"), np.full((2, 2), value, dtype="float32")) for n in names},
        coords={"lat": [10.0, 11.0], "lon": [105.0, 106.0]},
    )
    ds.to_netcdf(path)
    ds.close()


class IngestWithoutTimeTest(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        media = override_settings(MEDIA_ROOT=os.path.join(self.tmp.name, "media"))
        media.enable()
        self.addCleanup(media.disable)
        self.dataset = Dataset.objects.create(
            code="WRF3KM", name="WRF 3km", category="GRIDDED", access_level="PUBLIC"
        )

    def _path(self, name):
        return os.path.join(self.tmp.name, name)

    def _grid(self, name, **kwargs):
        path = self._path(name)
        _write_grid_file(path, **kwargs)
        return path

    def _zip(self, zip_name, members):
        zip_path = self._path(zip_name)
        with zipfile.ZipFile(zip_path, "w") as archive:
            for member in members:
                archive.write(member, arcname=os.path.basename(member))
        return zip_path

    def test_single_file_takes_time_from_source_name(self):
        path = self._grid("upload_tmp.nc")
        result = ingest_netcdf(path, self.dataset, source_name="2021010106.nc")
        expected = datetime(2021, 1, 1, 6, tzinfo=dt_timezone.utc)
        self.assertEqual(result.granules, 1)
        self.assertEqual(result.time_start, expected)
        self.assertIn("wind_10m", result.variables)
        self.assertIn("wind_100m", result.variables)
        wind = DatasetVariable.objects.get(dataset=self.dataset, variable_code="wind_10m")
        self.assertEqual(wind.components, ["u10m", "v10m"])
        self.assertTrue(RasterGranuleIndex.objects.filter(dataset=self.dataset, granule_time=expected).exists())

    def test_file_without_time_or_dated_name_fails_with_clear_message(self):
        path = self._grid("upload_tmp.nc")
        with self.assertRaisesMessage(IngestError, "Không xác định được thời gian"):
            ingest_netcdf(path, self.dataset, source_name="abc.nc")
        self.assertEqual(RasterGranuleIndex.objects.filter(dataset=self.dataset).count(), 0)

    def test_zip_with_many_files_creates_one_granule_per_time(self):
        members = [self._grid(f"{stamp}.nc") for stamp in ("2021010100", "2021010106", "2021010112")]
        result = ingest_netcdf(self._zip("year.zip", members), self.dataset, source_name="year.zip")
        self.assertEqual(result.granules, 3)
        self.assertEqual(result.time_end, datetime(2021, 1, 1, 12, tzinfo=dt_timezone.utc))
        self.assertEqual(RasterGranuleIndex.objects.filter(dataset=self.dataset).count(), 3)
        self.dataset.refresh_from_db()
        self.assertEqual(self.dataset.time_start, result.time_start)
        self.assertIn("3 mốc giờ", result.summary())

    def test_zip_with_a_bad_file_writes_nothing(self):
        members = [self._grid("2021010100.nc"), self._grid("bad.nc")]
        with self.assertRaises(IngestError) as ctx:
            ingest_netcdf(self._zip("mixed.zip", members), self.dataset, source_name="mixed.zip")
        self.assertIn("bad.nc", str(ctx.exception))
        self.assertEqual(RasterGranuleIndex.objects.filter(dataset=self.dataset).count(), 0)

    def test_files_with_same_time_and_different_variables_are_merged(self):
        members = [
            self._grid("2021010100.nc", names=("u10m", "v10m")),
            self._grid("2021010100_100m.nc", names=("u100m", "v100m")),
        ]
        result = ingest_netcdf(self._zip("split.zip", members), self.dataset, source_name="split.zip")
        self.assertEqual(result.granules, 1)
        granule = RasterGranuleIndex.objects.get(dataset=self.dataset)
        with xr.open_dataset(granule.file_location) as merged:
            self.assertEqual(set(merged.data_vars), {"u10m", "v10m", "u100m", "v100m"})

    def test_files_with_same_time_and_same_variables_are_rejected(self):
        members = [self._grid("2021010100.nc"), self._grid("2021010100_dup.nc")]
        with self.assertRaisesMessage(IngestError, "trùng"):
            ingest_netcdf(self._zip("dup.zip", members), self.dataset, source_name="dup.zip")


@override_settings(ROOT_URLCONF="wind_raster.urls")
class UploadEndpointTest(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        media = override_settings(MEDIA_ROOT=os.path.join(self.tmp.name, "media"))
        media.enable()
        self.addCleanup(media.disable)
        self.client = APIClient()
        self.client.force_authenticate(
            user=get_user_model().objects.create_superuser("root", "root@test.com", "pass12345")
        )
        self.dataset = Dataset.objects.create(
            code="WRF3KM", name="WRF 3km", category="GRIDDED", access_level="PUBLIC"
        )

    def _upload(self, upload_name):
        path = os.path.join(self.tmp.name, "source.nc")
        _write_grid_file(path)
        with open(path, "rb") as handle:
            content = handle.read()
        return self.client.post(
            "/raster-granules/upload/",
            {"file": SimpleUploadedFile(upload_name, content), "dataset_id": self.dataset.id},
            format="multipart",
        )

    def test_upload_reads_time_from_file_name(self):
        response = self._upload("2021010106.nc")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Đã nạp 1 mốc giờ", response.json()["message"])

    def test_upload_without_time_returns_clear_error_and_logs_failure(self):
        response = self._upload("abc.nc")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Không xác định được thời gian", response.json()["error"])
        self.assertEqual(IngestionLog.objects.get(dataset=self.dataset).status, "FAILED")
