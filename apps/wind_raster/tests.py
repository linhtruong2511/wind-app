import os
import tempfile
from datetime import datetime, timezone as dt_timezone

import numpy as np
import pandas as pd
import xarray as xr
from django.contrib.gis.geos import Polygon
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from wind_core.models import Dataset, DatasetVariable
from wind_raster.models import RasterGranuleIndex
from wind_raster.serializers import (
    RasterGranuleIndexGeoSerializer,
    RasterGranuleIndexSerializer,
)
from wind_raster.services.netcdf_service import (
    calculate_wind_speed_direction,
    get_netcdf_data,
)
from wind_raster.services.raster_ingest import ingest_netcdf
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
