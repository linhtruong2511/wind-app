import csv
import datetime
from django.contrib.gis.geos import Point
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from wind_core.models import Dataset
from wind_stations.models import Observation, Station
from wind_stations.serializers import (
    ObservationSerializer,
    StationGeoSerializer,
    StationSerializer,
)
from wind_stations.services.province_service import (
    get_province_geometry,
    get_provinces_wfs_data,
)
from wind_stations.services.station_service import (
    calculate_circular_mean,
    calculate_wind_rose_data,
    get_station_summary_data,
)


class StationModelAndSerializerTestCase(TestCase):
    def setUp(self):
        self.dataset = Dataset.objects.create(
            code="STATION_DATA",
            name="Stations Dataset",
            category="STATION",
        )
        self.station = Station.objects.create(
            dataset=self.dataset,
            station_code="WS01",
            name="Trạm Bạch Long Vĩ",
            geom=Point(107.72, 20.13),
            elevation=15.5,
            station_type="SYNOP",
            is_active=True,
        )

    def test_station_geo_serializer(self):
        serializer = StationGeoSerializer(self.station)
        data = serializer.data
        self.assertEqual(data["type"], "Feature")
        self.assertEqual(data["geometry"]["type"], "Point")
        self.assertEqual(data["geometry"]["coordinates"], [107.72, 20.13])
        self.assertEqual(data["properties"]["station_code"], "WS01")
        self.assertEqual(data["properties"]["name"], "Trạm Bạch Long Vĩ")
        self.assertEqual(data["properties"]["dataset_code"], "STATION_DATA")
        self.assertIsNone(data["properties"]["latest_observation"])

    def test_station_serializer(self):
        serializer = StationSerializer(self.station)
        data = serializer.data
        self.assertEqual(data["station_code"], "WS01")
        self.assertEqual(data["lat"], 20.13)
        self.assertEqual(data["lon"], 107.72)
        self.assertEqual(data["dataset_code"], "STATION_DATA")
        self.assertIsNone(data["latest_observation"])

    def test_observation_creation_and_latest_relation(self):
        now = timezone.now()
        obs1 = Observation.objects.create(
            station=self.station,
            obs_time=now - datetime.timedelta(hours=2),
            temp_2m=24.5,
            wind_speed=8.5,
            wind_dir=90.0,
            humidity=80.0,
            pressure=1013.2,
        )
        obs2 = Observation.objects.create(
            station=self.station,
            obs_time=now - datetime.timedelta(hours=1),
            temp_2m=26.0,
            wind_speed=12.0,
            wind_dir=120.0,
            humidity=75.0,
            pressure=1012.0,
        )

        self.assertEqual(str(self.station), "Trạm Bạch Long Vĩ (WS01)")
        self.assertIn("WS01 @", str(obs2))

        # Test latest_observation on StationSerializer
        serializer = StationSerializer(self.station)
        latest_data = serializer.data["latest_observation"]
        self.assertIsNotNone(latest_data)
        self.assertEqual(latest_data["id"], obs2.id)
        self.assertEqual(float(latest_data["wind_speed"]), 12.0)
        self.assertEqual(latest_data["station_code"], "WS01")

        # Test ObservationSerializer
        obs_serializer = ObservationSerializer(obs1)
        self.assertEqual(obs_serializer.data["station_code"], "WS01")
        self.assertEqual(float(obs_serializer.data["temp_2m"]), 24.5)


class StationServiceTestCase(TestCase):
    def setUp(self):
        self.dataset = Dataset.objects.create(
            code="SERVICE_TEST_DS",
            name="Service Test Dataset",
            category="STATION",
        )
        self.station = Station.objects.create(
            dataset=self.dataset,
            station_code="WS02",
            name="Trạm Cô Tô",
            geom=Point(107.75, 20.98),
            elevation=20.0,
            station_type="SYNOP",
            is_active=True,
        )
        base_time = timezone.make_aware(datetime.datetime(2026, 1, 15, 10, 0))
        # Create observations across months
        Observation.objects.create(
            station=self.station,
            obs_time=base_time,
            wind_speed=5.0,
            wind_dir=0.0,
            temp_2m=20.0,
            humidity=70.0,
            pressure=1015.0,
            rain_24h=2.0,
        )
        Observation.objects.create(
            station=self.station,
            obs_time=base_time + datetime.timedelta(hours=6),
            wind_speed=15.0,
            wind_dir=90.0,
            temp_2m=24.0,
            humidity=80.0,
            pressure=1010.0,
            rain_24h=8.0,
        )
        Observation.objects.create(
            station=self.station,
            obs_time=base_time + datetime.timedelta(days=40),
            wind_speed=0.2,  # Calm
            wind_dir=180.0,
            temp_2m=28.0,
            humidity=85.0,
            pressure=1008.0,
            rain_24h=0.0,
        )

    def test_circular_mean_calculation(self):
        # 0 deg and 90 deg -> 45 deg
        mean_45 = calculate_circular_mean([0.0, 90.0])
        self.assertAlmostEqual(mean_45, 45.0, places=1)

        # 350 deg and 10 deg -> 0.0 (or 360.0) deg
        mean_zero = calculate_circular_mean([350.0, 10.0])
        self.assertTrue(abs(mean_zero - 0.0) < 0.1 or abs(mean_zero - 360.0) < 0.1)

        # Weighted circular mean: heavy weight on 90 deg
        weighted = calculate_circular_mean([0.0, 90.0], weights=[1.0, 10.0])
        self.assertGreater(weighted, 45.0)

        # Empty or None input
        self.assertIsNone(calculate_circular_mean([]))
        self.assertIsNone(calculate_circular_mean([None, None]))

    def test_station_summary_data(self):
        monthly = get_station_summary_data(self.station, summary_type="monthly")
        self.assertEqual(monthly["station_id"], self.station.id)
        self.assertEqual(monthly["station_name"], self.station.name)
        self.assertEqual(len(monthly["results"]), 2)  # Jan and Feb

        yearly = get_station_summary_data(self.station, summary_type="yearly")
        self.assertEqual(len(yearly["results"]), 1)  # Year 2026
        result_2026 = yearly["results"][0]
        self.assertEqual(result_2026["total_records"], 3)
        self.assertEqual(float(result_2026["wind_speed_max"]), 15.0)
        self.assertEqual(float(result_2026["wind_speed_min"]), 0.2)

    def test_calculate_wind_rose_data(self):
        qs = Observation.objects.filter(station=self.station)
        data = calculate_wind_rose_data(qs)
        self.assertEqual(data["total_records"], 3)
        self.assertEqual(len(data["directions"]), 16)
        self.assertEqual(len(data["speed_bins"]), 6)
        self.assertAlmostEqual(data["calm_percent"], 33.33, places=1)
        self.assertIn("distribution", data)
        self.assertEqual(len(data["distribution"]["speed_ranges"]), 6)

        # Test empty queryset
        empty_data = calculate_wind_rose_data(Observation.objects.none())
        self.assertEqual(empty_data["total_records"], 0)
        self.assertEqual(empty_data["calm_percent"], 0.0)


class ProvinceServiceTestCase(TestCase):
    def test_safe_fallback_no_crash(self):
        # Province that does not exist should return None gracefully
        geom = get_province_geometry("NON_EXISTENT_PROVINCE_999")
        self.assertIsNone(geom)

        geom_none = get_province_geometry(None)
        self.assertIsNone(geom_none)

    def test_provinces_wfs_fallback_data(self):
        wfs_data = get_provinces_wfs_data()
        self.assertEqual(wfs_data["type"], "FeatureCollection")
        self.assertIn("features", wfs_data)
        self.assertIn("crs", wfs_data)


@override_settings(ROOT_URLCONF="wind_stations.urls")
class StationAndObservationApiTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dataset = Dataset.objects.create(
            code="SYNOP_STAT",
            name="Synoptic Stations",
            category="STATION",
        )
        self.station1 = Station.objects.create(
            dataset=self.dataset,
            station_code="48838",
            name="Bach Long Vi",
            geom=Point(107.72, 20.13),
            station_type="SYNOP",
            is_active=True,
        )
        self.station2 = Station.objects.create(
            dataset=self.dataset,
            station_code="48855",
            name="Co To",
            geom=Point(107.75, 20.98),
            station_type="SYNOP",
            is_active=True,
        )
        self.inactive_station = Station.objects.create(
            dataset=self.dataset,
            station_code="INACTIVE_01",
            name="Tram Cu",
            geom=Point(106.0, 20.0),
            station_type="SYNOP",
            is_active=False,
        )

        now = timezone.now()
        self.obs1 = Observation.objects.create(
            station=self.station1,
            obs_time=now - datetime.timedelta(hours=2),
            wind_speed=12.5,
            wind_dir=45.0,
            temp_2m=25.0,
            pressure=1012.0,
            rain_24h=5.0,
        )
        self.obs2 = Observation.objects.create(
            station=self.station1,
            obs_time=now - datetime.timedelta(hours=1),
            wind_speed=18.0,
            wind_dir=90.0,
            temp_2m=26.0,
            pressure=1010.0,
            rain_24h=10.0,
        )
        self.obs3 = Observation.objects.create(
            station=self.station2,
            obs_time=now - datetime.timedelta(hours=1),
            wind_speed=8.0,
            wind_dir=180.0,
            temp_2m=27.0,
            pressure=1011.0,
            rain_24h=0.0,
        )

    def test_list_stations_and_filters(self):
        res = self.client.get("/stations/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        # Inactive stations should be excluded
        self.assertEqual(data["count"], 2)

        # Search filter
        res_search = self.client.get("/stations/?search=Bach")
        self.assertEqual(res_search.status_code, 200)
        self.assertEqual(res_search.json()["count"], 1)

    def test_station_map_action(self):
        res = self.client.get("/stations/map/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["type"], "FeatureCollection")
        self.assertEqual(len(data["features"]), 2)
        feature_names = [f["properties"]["name"] for f in data["features"]]
        self.assertIn("Bach Long Vi", feature_names)

    def test_station_spatial_query(self):
        # Query near Bach Long Vi (107.72, 20.13) with radius 10km
        res = self.client.get("/stations/spatial_query/?lat=20.13&lon=107.72&radius_km=10")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        results = data.get("results", data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["station_code"], "48838")

        # Missing lat/lon returns 400
        res_err = self.client.get("/stations/spatial_query/")
        self.assertEqual(res_err.status_code, 400)

    def test_station_monthly_and_yearly_summary_actions(self):
        res_monthly = self.client.get(f"/stations/{self.station1.id}/monthly-summary/")
        self.assertEqual(res_monthly.status_code, 200)
        self.assertEqual(res_monthly.json()["station_id"], self.station1.id)
        self.assertIn("results", res_monthly.json())

        res_yearly = self.client.get(f"/stations/{self.station1.id}/yearly-summary/")
        self.assertEqual(res_yearly.status_code, 200)
        self.assertEqual(res_yearly.json()["station_id"], self.station1.id)
        self.assertIn("results", res_yearly.json())

    def test_observation_viewset_and_filtering(self):
        res = self.client.get("/observations/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["count"], 3)

        # Filter by station
        res_station = self.client.get(f"/observations/?station={self.station1.id}")
        self.assertEqual(res_station.status_code, 200)
        self.assertEqual(res_station.json()["count"], 2)


@override_settings(ROOT_URLCONF="wind_stations.urls")
class StatisticsViewSetTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dataset = Dataset.objects.create(
            code="SYNOP_STAT",
            name="Synoptic Stations",
            category="STATION",
        )
        self.station1 = Station.objects.create(
            dataset=self.dataset,
            station_code="48838",
            name="Bach Long Vi",
            geom=Point(107.72, 20.13),
            station_type="SYNOP",
            is_active=True,
        )
        self.station2 = Station.objects.create(
            dataset=self.dataset,
            station_code="48855",
            name="Co To",
            geom=Point(107.75, 20.98),
            station_type="SYNOP",
            is_active=True,
        )

        now = timezone.now()
        Observation.objects.create(
            station=self.station1,
            obs_time=now - datetime.timedelta(hours=2),
            wind_speed=12.5,
            wind_dir=45.0,
            temp_2m=25.0,
            pressure=1012.0,
            rain_24h=5.0,
        )
        Observation.objects.create(
            station=self.station1,
            obs_time=now - datetime.timedelta(hours=1),
            wind_speed=18.0,
            wind_dir=90.0,
            temp_2m=26.0,
            pressure=1010.0,
            rain_24h=10.0,
        )
        Observation.objects.create(
            station=self.station2,
            obs_time=now - datetime.timedelta(hours=1),
            wind_speed=8.0,
            wind_dir=180.0,
            temp_2m=27.0,
            pressure=1011.0,
            rain_24h=0.0,
        )

    def test_overview_endpoint(self):
        res = self.client.get("/statistics/overview/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_stations"], 2)
        self.assertEqual(data["total_observations"], 3)
        self.assertIn("max_wind_recorded", data)
        self.assertEqual(data["max_wind_recorded"]["wind_speed"], 18.0)
        self.assertEqual(data["max_wind_recorded"]["station_name"], "Bach Long Vi")

    def test_rankings_endpoint(self):
        res = self.client.get("/statistics/rankings/?metric=wind_speed_max&limit=5")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["rankings"]), 2)
        self.assertEqual(data["rankings"][0]["station_id"], self.station1.id)
        self.assertEqual(data["rankings"][0]["value"], 18.0)

    def test_multi_station_compare_endpoint(self):
        res = self.client.get(
            f"/statistics/multi-station-compare/?station_ids={self.station1.id},{self.station2.id}&metric=wind_speed&interval=day"
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["series"]), 2)
        self.assertIn("timestamps", data)

    def test_wind_rose_endpoint(self):
        res = self.client.get(f"/statistics/wind-rose/?station_id={self.station1.id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["directions"]), 16)
        self.assertEqual(len(data["speed_bins"]), 6)
        self.assertIn("distribution", data)

    def test_export_csv_endpoint(self):
        res = self.client.get("/statistics/export-csv/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "text/csv")
        content = res.content.decode("utf-8")
        self.assertIn("Bach Long Vi", content)
        self.assertIn("Co To", content)
        self.assertIn("Wind Speed Avg (m/s)", content)

    def test_province_wfs_fallback_endpoint(self):
        res = self.client.get("/ows")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["type"], "FeatureCollection")


class DataLakeTestCase(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.admin_user = User.objects.create_superuser(
            username="admin_datalake_test",
            email="admin@datalake.com",
            password="testpassword123"
        )
        self.client = APIClient()

        self.station = Station.objects.create(
            station_code="TEST_STATION",
            name="Trạm Test Parquet",
            geom=Point(108.0, 15.0),
            is_active=True,
        )

    def test_datalake_ingest_and_overview(self):
        import pandas as pd
        from wind_stations.services.duckdb_storage_service import (
            ingest_dataframe_to_parquet,
            get_data_lake_overview,
            list_data_lake_partitions,
            calculate_wind_rose_from_parquet,
            execute_safe_duckdb_query,
            delete_partition,
        )

        # 1. Ingest test data
        df = pd.DataFrame({
            "station_code": ["TEST_STATION", "TEST_STATION", "TEST_STATION"],
            "obs_time": ["2025-01-01 00:00:00", "2025-01-01 01:00:00", "2025-01-01 02:00:00"],
            "wind_speed": [4.5, 7.2, 9.8],
            "wind_dir": [90.0, 180.0, 270.0],
            "temp_2m": [25.0, 26.5, 27.0],
        })

        res = ingest_dataframe_to_parquet(df)
        self.assertTrue(res["success"])
        self.assertEqual(res["total_rows_ingested"], 3)

        # 2. Check overview
        ov = get_data_lake_overview()
        self.assertGreaterEqual(ov["total_stations"], 1)
        self.assertGreaterEqual(ov["total_records"], 3)

        # 3. Check partitions
        parts = list_data_lake_partitions(station_code="TEST_STATION")
        self.assertEqual(len(parts), 1)
        self.assertEqual(parts[0]["station_code"], "TEST_STATION")
        self.assertEqual(parts[0]["year"], 2025)
        self.assertEqual(parts[0]["record_count"], 3)

        # 4. Check wind rose calculation via DuckDB
        wr = calculate_wind_rose_from_parquet(station_code="TEST_STATION")
        self.assertEqual(wr["total_records"], 3)
        self.assertAlmostEqual(wr["avg_wind_speed"], 7.17, places=1)

        # 5. Check safe SQL execution
        sql_res = execute_safe_duckdb_query("SELECT count(*) as total FROM observations WHERE station_code = 'TEST_STATION'")
        self.assertEqual(sql_res["total_rows"], 1)
        self.assertEqual(sql_res["data"][0]["total"], 3)

        # 6. Test API endpoints
        self.client.force_authenticate(user=self.admin_user)
        res_ov = self.client.get("/wind/api/v1/datalake/overview/")
        self.assertEqual(res_ov.status_code, 200)

        res_parts = self.client.get("/wind/api/v1/datalake/partitions/?station_code=TEST_STATION")
        self.assertEqual(res_parts.status_code, 200)

        # 7. Cleanup
        delete_partition("TEST_STATION", 2025)

    def _ingest_sample(self):
        import pandas as pd
        from wind_stations.services.duckdb_storage_service import ingest_dataframe_to_parquet

        df = pd.DataFrame({
            "station_code": ["TEST_STATION", "TEST_STATION"],
            "obs_time": ["2025-01-01 00:00:00", "2025-01-01 01:00:00"],
            "wind_speed": [4.5, 7.2],
            "wind_dir": [90.0, 180.0],
        })
        ingest_dataframe_to_parquet(df)
        self.addCleanup(self._cleanup_partition)

    def _cleanup_partition(self):
        from wind_stations.services.duckdb_storage_service import delete_partition
        delete_partition("TEST_STATION", 2025)

    def test_download_partition_parquet(self):
        self._ingest_sample()
        res = self.client.get(
            "/wind/api/v1/datalake/download/?file_format=parquet&station_code=TEST_STATION&year=2025"
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("TEST_STATION_2025.parquet", res["Content-Disposition"])
        content = b"".join(res.streaming_content)
        self.assertTrue(content.startswith(b"PAR1"))

    def test_download_csv(self):
        self._ingest_sample()
        res = self.client.get("/wind/api/v1/datalake/download/?file_format=csv&station_code=TEST_STATION")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "text/csv")
        lines = res.content.decode("utf-8").strip().splitlines()
        self.assertEqual(len(lines), 3)  # tiêu đề + 2 dòng dữ liệu

    def test_download_filtered_parquet_without_year(self):
        self._ingest_sample()
        res = self.client.get(
            "/wind/api/v1/datalake/download/?file_format=parquet&station_code=TEST_STATION&start_date=2025-01-01"
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content.startswith(b"PAR1"))

    def test_download_rejects_invalid_input(self):
        res = self.client.get("/wind/api/v1/datalake/download/?file_format=xlsx")
        self.assertEqual(res.status_code, 400)
        res = self.client.get("/wind/api/v1/datalake/download/?file_format=csv&station_code=../etc")
        self.assertEqual(res.status_code, 400)
        res = self.client.get("/wind/api/v1/datalake/download/?file_format=parquet&station_code=TEST_STATION&year=abc")
        self.assertEqual(res.status_code, 400)

    def test_import_file_goes_to_lake_only(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from wind_stations.models import Observation

        self.client.force_authenticate(user=self.admin_user)
        csv_bytes = (
            "station_code,obs_time,wind_speed,wind_dir\n"
            "TEST_STATION,2025-01-01 00:00:00,4.5,90\n"
            "TEST_STATION,2025-01-01 01:00:00,7.2,180\n"
        ).encode("utf-8")
        upload = SimpleUploadedFile("obs.csv", csv_bytes, content_type="text/csv")
        res = self.client.post("/wind/api/v1/datalake/import-file/", {"file": upload}, format="multipart")
        self.assertEqual(res.status_code, 200)
        self.addCleanup(self._cleanup_partition)
        self.assertEqual(Observation.objects.count(), 0)

        # Luồng nạp trực tiếp vào cơ sở dữ liệu quan hệ đã bị gỡ bỏ
        upload2 = SimpleUploadedFile("obs.csv", csv_bytes, content_type="text/csv")
        res_old = self.client.post("/wind/api/v1/observations/import-file/", {"file": upload2}, format="multipart")
        self.assertIn(res_old.status_code, (404, 405))

