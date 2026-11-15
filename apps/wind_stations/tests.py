import csv
from django.contrib.gis.geos import Point
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from wind_stations.models import Station
from wind_stations.serializers import (
    StationGeoSerializer,
    StationSerializer,
)
from wind_stations.services import observation_lake_service as lake
from wind_stations.services.province_service import (
    get_province_geometry,
    get_provinces_wfs_data,
)
from wind_stations.services.station_service import (
    calculate_circular_mean,
    get_station_summary_data,
)
from wind_stations.testing import LakeTestMixin


class StationModelAndSerializerTestCase(LakeTestMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.station = Station.objects.create(
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
        self.assertIsNone(data["properties"]["latest_observation"])

    def test_station_serializer_without_observation(self):
        serializer = StationSerializer(self.station)
        data = serializer.data
        self.assertEqual(data["station_code"], "WS01")
        self.assertEqual(data["lat"], 20.13)
        self.assertEqual(data["lon"], 107.72)
        self.assertIsNone(data["latest_observation"])

    def test_latest_observation_comes_from_lake(self):
        self.write_observations([
            {"station_code": "WS01", "obs_time": "2026-01-01 08:00:00", "temp_2m": 24.5, "wind_speed": 8.5},
            {"station_code": "WS01", "obs_time": "2026-01-01 09:00:00", "temp_2m": 26.0, "wind_speed": 12.0},
        ])
        self.assertEqual(str(self.station), "Trạm Bạch Long Vĩ (WS01)")

        latest = StationSerializer(self.station).data["latest_observation"]
        self.assertIsNotNone(latest)
        self.assertEqual(latest["station"], self.station.id)
        self.assertEqual(latest["station_code"], "WS01")
        self.assertEqual(latest["obs_time"], "2026-01-01T09:00:00")
        self.assertEqual(latest["wind_speed"], 12.0)

    def test_latest_observation_refreshes_after_new_import(self):
        self.write_observations([{"station_code": "WS01", "obs_time": "2026-01-01 08:00:00", "wind_speed": 1.0}])
        self.assertEqual(StationSerializer(self.station).data["latest_observation"]["wind_speed"], 1.0)

        self.write_observations([{"station_code": "WS01", "obs_time": "2026-01-02 08:00:00", "wind_speed": 3.0}])
        self.assertEqual(StationSerializer(self.station).data["latest_observation"]["wind_speed"], 3.0)


class StationServiceTestCase(LakeTestMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.station = Station.objects.create(
            station_code="WS02",
            name="Trạm Cô Tô",
            geom=Point(107.75, 20.98),
            elevation=20.0,
            station_type="SYNOP",
            is_active=True,
        )
        self.write_observations([
            {
                "station_code": "WS02", "obs_time": "2026-01-15 10:00:00",
                "wind_speed": 5.0, "wind_dir": 0.0, "temp_2m": 20.0,
                "humidity": 70.0, "pressure": 1015.0, "rain_24h": 2.0,
            },
            {
                "station_code": "WS02", "obs_time": "2026-01-15 16:00:00",
                "wind_speed": 15.0, "wind_dir": 90.0, "temp_2m": 24.0,
                "humidity": 80.0, "pressure": 1010.0, "rain_24h": 8.0,
            },
            {
                # Lặng gió
                "station_code": "WS02", "obs_time": "2026-02-24 10:00:00",
                "wind_speed": 0.2, "wind_dir": 180.0, "temp_2m": 28.0,
                "humidity": 85.0, "pressure": 1008.0, "rain_24h": 0.0,
            },
        ])

    def test_circular_mean_calculation(self):
        mean_45 = calculate_circular_mean([0.0, 90.0])
        self.assertAlmostEqual(mean_45, 45.0, places=1)

        mean_zero = calculate_circular_mean([350.0, 10.0])
        self.assertTrue(abs(mean_zero - 0.0) < 0.1 or abs(mean_zero - 360.0) < 0.1)

        weighted = calculate_circular_mean([0.0, 90.0], weights=[1.0, 10.0])
        self.assertGreater(weighted, 45.0)

        self.assertIsNone(calculate_circular_mean([]))
        self.assertIsNone(calculate_circular_mean([None, None]))

    def test_station_summary_data(self):
        monthly = get_station_summary_data(self.station, summary_type="monthly")
        self.assertEqual(monthly["station_id"], self.station.id)
        self.assertEqual(monthly["station_name"], self.station.name)
        self.assertEqual(len(monthly["results"]), 2)  # Tháng 1 và tháng 2
        self.assertEqual(monthly["results"][0]["month"], "2026-01-01T00:00:00")
        self.assertEqual(monthly["results"][0]["total_records"], 2)
        self.assertEqual(monthly["results"][0]["wind_speed_avg"], 10.0)

        yearly = get_station_summary_data(self.station, summary_type="yearly")
        self.assertEqual(len(yearly["results"]), 1)
        result_2026 = yearly["results"][0]
        self.assertEqual(result_2026["year"], "2026-01-01T00:00:00")
        self.assertEqual(result_2026["total_records"], 3)
        self.assertEqual(result_2026["wind_speed_max"], 15.0)
        self.assertEqual(result_2026["wind_speed_min"], 0.2)

    def test_station_summary_respects_time_range(self):
        start = lake.parse_time_filter("2026-02-01T00:00:00Z")
        monthly = get_station_summary_data(self.station, start, None, "monthly")
        self.assertEqual(len(monthly["results"]), 1)
        self.assertEqual(monthly["results"][0]["total_records"], 1)

    def test_wind_rose_counts_calm_only_in_total(self):
        data = lake.get_wind_rose(["WS02"])
        self.assertEqual(data["total_records"], 3)
        self.assertEqual(len(data["directions"]), 16)
        self.assertEqual(len(data["speed_bins"]), 6)
        self.assertAlmostEqual(data["calm_percent"], 33.33, places=1)
        self.assertEqual(data["distribution"]["counts"], [0, 0, 1, 0, 0, 1])
        self.assertEqual(len(data["distribution"]["speed_ranges"]), 6)
        # 5 m/s hướng 0 độ rơi vào hướng N, cấp 4 - 6 m/s
        self.assertAlmostEqual(data["speed_bins"][2]["values"][0], 33.33, places=1)

    def test_wind_rose_empty(self):
        for codes in ([], ["KHONG_CO_DU_LIEU"]):
            data = lake.get_wind_rose(codes)
            self.assertEqual(data["total_records"], 0)
            self.assertEqual(data["calm_percent"], 0.0)

    def test_parse_time_filter(self):
        self.assertIsNone(lake.parse_time_filter(None))
        self.assertIsNone(lake.parse_time_filter(""))
        self.assertEqual(lake.parse_time_filter("2026-03-04").isoformat(), "2026-03-04T00:00:00")
        self.assertIsNone(lake.parse_time_filter("2026-03-04T10:00:00").tzinfo)
        with self.assertRaises(ValueError):
            lake.parse_time_filter("khong-phai-ngay")


class ProvinceServiceTestCase(TestCase):
    def test_safe_fallback_no_crash(self):
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
class StationAndObservationApiTestCase(LakeTestMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.station1 = Station.objects.create(
            station_code="48838",
            name="Bach Long Vi",
            geom=Point(107.72, 20.13),
            station_type="SYNOP",
            is_active=True,
        )
        self.station2 = Station.objects.create(
            station_code="48855",
            name="Co To",
            geom=Point(107.75, 20.98),
            station_type="SYNOP",
            is_active=True,
        )
        self.inactive_station = Station.objects.create(
            station_code="INACTIVE_01",
            name="Tram Cu",
            geom=Point(106.0, 20.0),
            station_type="SYNOP",
            is_active=False,
        )

        self.write_observations([
            {"station_code": "48838", "obs_time": "2026-01-10 08:00:00", "wind_speed": 12.5, "wind_dir": 45.0,
             "temp_2m": 25.0, "pressure": 1012.0, "rain_24h": 5.0},
            {"station_code": "48838", "obs_time": "2026-01-10 09:00:00", "wind_speed": 18.0, "wind_dir": 90.0,
             "temp_2m": 26.0, "pressure": 1010.0, "rain_24h": 10.0},
            {"station_code": "48855", "obs_time": "2026-01-10 09:00:00", "wind_speed": 8.0, "wind_dir": 180.0,
             "temp_2m": 27.0, "pressure": 1011.0, "rain_24h": 0.0},
        ])

    def test_list_stations_and_filters(self):
        res = self.client.get("/stations/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        # Trạm ngừng hoạt động không được liệt kê
        self.assertEqual(data["count"], 2)

        res_search = self.client.get("/stations/?search=Bach")
        self.assertEqual(res_search.status_code, 200)
        self.assertEqual(res_search.json()["count"], 1)

    def test_station_list_includes_latest_observation(self):
        res = self.client.get("/stations/?search=Bach")
        latest = res.json()["results"][0]["latest_observation"]
        self.assertEqual(latest["wind_speed"], 18.0)
        self.assertEqual(latest["obs_time"], "2026-01-10T09:00:00")

    def test_station_map_action(self):
        res = self.client.get("/stations/map/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["type"], "FeatureCollection")
        self.assertEqual(len(data["features"]), 2)
        feature_names = [f["properties"]["name"] for f in data["features"]]
        self.assertIn("Bach Long Vi", feature_names)

    def test_station_spatial_query(self):
        res = self.client.get("/stations/spatial_query/?lat=20.13&lon=107.72&radius_km=10")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        results = data.get("results", data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["station_code"], "48838")

        res_err = self.client.get("/stations/spatial_query/")
        self.assertEqual(res_err.status_code, 400)

    def test_station_monthly_and_yearly_summary_actions(self):
        res_monthly = self.client.get(f"/stations/{self.station1.id}/monthly-summary/")
        self.assertEqual(res_monthly.status_code, 200)
        self.assertEqual(res_monthly.json()["station_id"], self.station1.id)
        results = res_monthly.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["total_records"], 2)
        self.assertEqual(results[0]["wind_speed_max"], 18.0)

        res_yearly = self.client.get(f"/stations/{self.station1.id}/yearly-summary/")
        self.assertEqual(res_yearly.status_code, 200)
        self.assertEqual(res_yearly.json()["station_id"], self.station1.id)
        self.assertEqual(len(res_yearly.json()["results"]), 1)

    def test_summary_rejects_invalid_date(self):
        res = self.client.get(f"/stations/{self.station1.id}/monthly-summary/?start_date=abc")
        self.assertEqual(res.status_code, 400)

    def test_observation_list_and_filtering(self):
        res = self.client.get("/observations/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["count"], 3)

        res_station = self.client.get(f"/observations/?station={self.station1.id}")
        self.assertEqual(res_station.status_code, 200)
        data = res_station.json()
        self.assertEqual(data["count"], 2)
        # Mới nhất xếp trước
        self.assertEqual([r["wind_speed"] for r in data["results"]], [18.0, 12.5])
        self.assertEqual(data["results"][0]["station"], self.station1.id)
        self.assertEqual(data["results"][0]["station_code"], "48838")

    def test_observation_list_time_filter_and_pagination(self):
        res = self.client.get(f"/observations/?station={self.station1.id}&start_time=2026-01-10T08:30:00")
        self.assertEqual(res.json()["count"], 1)

        res_page = self.client.get(f"/observations/?station={self.station1.id}&page_size=1&page=2")
        self.assertEqual(res_page.status_code, 200)
        page = res_page.json()
        self.assertEqual(page["count"], 2)
        self.assertEqual(len(page["results"]), 1)
        self.assertEqual(page["results"][0]["wind_speed"], 12.5)

    def test_observation_list_unknown_station_is_empty(self):
        res = self.client.get("/observations/?station=999999")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["count"], 0)

        res_bad = self.client.get("/observations/?start_time=abc")
        self.assertEqual(res_bad.status_code, 400)


@override_settings(ROOT_URLCONF="wind_stations.urls")
class StatisticsViewSetTestCase(LakeTestMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.station1 = Station.objects.create(
            station_code="48838",
            name="Bach Long Vi",
            geom=Point(107.72, 20.13),
            station_type="SYNOP",
            is_active=True,
        )
        self.station2 = Station.objects.create(
            station_code="48855",
            name="Co To",
            geom=Point(107.75, 20.98),
            station_type="SYNOP",
            is_active=True,
        )
        self.empty_station = Station.objects.create(
            station_code="NO_DATA",
            name="Tram Chua Co So Lieu",
            geom=Point(106.5, 20.5),
            station_type="SYNOP",
            is_active=True,
        )

        self.write_observations([
            {"station_code": "48838", "obs_time": "2026-01-10 08:00:00", "wind_speed": 12.5, "wind_dir": 45.0,
             "temp_2m": 25.0, "pressure": 1012.0, "rain_24h": 5.0},
            {"station_code": "48838", "obs_time": "2026-01-10 09:00:00", "wind_speed": 18.0, "wind_dir": 90.0,
             "temp_2m": 26.0, "pressure": 1010.0, "rain_24h": 10.0},
            {"station_code": "48855", "obs_time": "2026-02-10 09:00:00", "wind_speed": 8.0, "wind_dir": 180.0,
             "temp_2m": 27.0, "pressure": 1011.0, "rain_24h": 0.0},
            # Mã trạm không có trong danh sách trạm nên không được tính
            {"station_code": "KHONG_CO_TRONG_DANH_SACH", "obs_time": "2026-01-10 09:00:00", "wind_speed": 99.0,
             "wind_dir": 10.0, "temp_2m": 40.0, "pressure": 900.0, "rain_24h": 500.0},
        ])

    def test_overview_endpoint(self):
        res = self.client.get("/statistics/overview/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_stations"], 3)
        self.assertEqual(data["total_observations"], 3)
        self.assertEqual(data["date_range"]["min_date"], "2026-01-10T08:00:00")
        self.assertEqual(data["date_range"]["max_date"], "2026-02-10T09:00:00")
        self.assertEqual(data["max_wind_recorded"]["wind_speed"], 18.0)
        self.assertEqual(data["max_wind_recorded"]["station_id"], self.station1.id)
        self.assertEqual(data["max_wind_recorded"]["station_name"], "Bach Long Vi")

    def test_overview_with_date_range(self):
        res = self.client.get(
            "/statistics/overview/?start_date=2026-02-01T00:00:00Z&end_date=2026-02-28T23:59:59Z"
        )
        data = res.json()
        self.assertEqual(data["total_observations"], 1)
        self.assertEqual(data["max_wind_recorded"]["station_name"], "Co To")

    def test_overview_without_any_data(self):
        res = self.client.get("/statistics/overview/?start_date=2030-01-01")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_observations"], 0)
        self.assertIsNone(data["max_wind_recorded"])
        self.assertIsNone(data["date_range"]["min_date"])

    def test_rankings_endpoint(self):
        res = self.client.get("/statistics/rankings/?metric=wind_speed_max&limit=5")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["rankings"]), 2)
        self.assertEqual(data["rankings"][0]["rank"], 1)
        self.assertEqual(data["rankings"][0]["station_id"], self.station1.id)
        self.assertEqual(data["rankings"][0]["station_name"], "Bach Long Vi")
        self.assertEqual(data["rankings"][0]["value"], 18.0)

    def test_rankings_ascending_metric_and_limit(self):
        res = self.client.get("/statistics/rankings/?metric=temp_min&limit=1")
        rankings = res.json()["rankings"]
        self.assertEqual(len(rankings), 1)
        self.assertEqual(rankings[0]["station_code"], "48838")
        self.assertEqual(rankings[0]["value"], 25.0)

        res_bad = self.client.get("/statistics/rankings/?limit=abc")
        self.assertEqual(res_bad.status_code, 400)

    def test_multi_station_compare_endpoint(self):
        res = self.client.get(
            f"/statistics/multi-station-compare/?station_ids={self.station1.id},{self.station2.id}"
            "&metric=wind_speed&interval=day"
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["series"]), 2)
        self.assertEqual(data["timestamps"], ["2026-01-10", "2026-02-10"])
        by_id = {s["station_id"]: s["values"] for s in data["series"]}
        self.assertEqual(by_id[self.station1.id], [15.25, None])
        self.assertEqual(by_id[self.station2.id], [None, 8.0])

    def test_multi_station_compare_monthly(self):
        res = self.client.get(f"/statistics/multi-station-compare/?station_ids={self.station1.id}&metric=temp_2m")
        data = res.json()
        self.assertEqual(data["timestamps"], ["2026-01"])
        self.assertEqual(data["series"][0]["values"], [25.5])

    def test_wind_rose_endpoint(self):
        res = self.client.get(f"/statistics/wind-rose/?station_id={self.station1.id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_records"], 2)
        self.assertEqual(len(data["directions"]), 16)
        self.assertEqual(len(data["speed_bins"]), 6)
        self.assertIn("distribution", data)

    def test_wind_rose_all_stations_ignores_unknown_codes(self):
        res = self.client.get("/statistics/wind-rose/")
        self.assertEqual(res.json()["total_records"], 3)

    def test_export_csv_endpoint(self):
        res = self.client.get("/statistics/export-csv/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "text/csv")
        content = res.content.decode("utf-8")
        self.assertIn("Wind Speed Avg (m/s)", content)

        rows = {r[2]: r for r in csv.reader(content.splitlines())}
        self.assertEqual(rows["Bach Long Vi"][4], "18.0")
        self.assertEqual(rows["Bach Long Vi"][9], "2")
        self.assertEqual(rows["Co To"][9], "1")
        # Trạm chưa có số liệu vẫn có dòng, các giá trị bằng 0
        self.assertEqual(rows["Tram Chua Co So Lieu"][9], "0")

    def test_statistics_with_empty_lake(self):
        from wind_stations.services.duckdb_storage_service import delete_partition

        for code in ("48838", "48855", "KHONG_CO_TRONG_DANH_SACH"):
            delete_partition(code, 2026)

        self.assertEqual(self.client.get("/statistics/overview/").json()["total_observations"], 0)
        self.assertEqual(self.client.get("/statistics/rankings/").json()["rankings"], [])
        self.assertEqual(self.client.get("/statistics/wind-rose/").json()["total_records"], 0)
        self.assertEqual(self.client.get("/statistics/multi-station-compare/").json()["series"], [])
        self.assertEqual(self.client.get("/statistics/export-csv/").status_code, 200)

    def test_province_wfs_fallback_endpoint(self):
        res = self.client.get("/ows")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["type"], "FeatureCollection")


class DataLakeTestCase(LakeTestMixin, TestCase):
    def setUp(self):
        super().setUp()
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



class LakeStationCodeTestCase(LakeTestMixin, TestCase):
    def test_ingest_sanitizes_station_code_like_station_serializer(self):
        from wind_stations.services.duckdb_storage_service import get_storage_root

        self.write_observations([
            {"station_code": "48/10", "obs_time": "2026-03-01 07:00:00", "wind_speed": 4.0, "wind_dir": 90.0},
            {"station_code": "AB 01", "obs_time": "2026-03-01 07:00:00", "wind_speed": 2.0, "wind_dir": 90.0},
        ])
        folders = sorted(p.name for p in get_storage_root().iterdir())
        self.assertEqual(folders, ["48_10", "AB_01"])
        self.assertEqual(lake.get_wind_rose(["48_10"])["total_records"], 1)

    def test_station_code_comes_from_folder_not_file_content(self):
        """Tệp nạp trước đây có thể ghi mã chưa chuẩn hóa (48/10) trong thư mục 48_10."""
        import pandas as pd
        from wind_stations.services.duckdb_storage_service import get_storage_root

        folder = get_storage_root() / "48_10"
        folder.mkdir(parents=True)
        pd.DataFrame({
            "station_code": ["48/10", "48/10"],
            "obs_time": pd.to_datetime(["2020-01-01 07:00:00", "2020-01-01 08:00:00"]),
            "wind_speed": [3.0, 5.0],
            "wind_dir": [10.0, 20.0],
            "temp_2m": [None, None],
        }).to_parquet(folder / "2020.parquet", index=False)

        overview = lake.get_overview(["48_10"])
        self.assertEqual(overview["total_observations"], 2)
        self.assertEqual(overview["max_wind"]["station_code"], "48_10")
        self.assertEqual(lake.get_overview(["48/10"])["total_observations"], 0)

        rows = lake.ObservationRows(["48_10"], {"48_10": 7})
        self.assertEqual(rows.count(), 2)
        self.assertEqual(rows[0:1][0]["station"], 7)
        self.assertEqual(lake.get_station_aggregates(["48_10"])["48_10"]["cnt"], 2)


class StationCsvApiTestCase(TestCase):
    base = "/wind/api/v1/stations/"

    def setUp(self):
        from django.contrib.auth import get_user_model

        self.admin_user = get_user_model().objects.create_superuser(
            username="station_csv_admin", email="station_csv@example.com", password="pass12345"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin_user)
        self.existing = Station.objects.create(
            station_code="OLD_01", name="Tram cu", geom=Point(100.0, 10.0), station_type="SURFACE", is_active=True
        )

    def _upload(self, content, dry_run=False):
        from django.core.files.uploadedfile import SimpleUploadedFile

        upload = SimpleUploadedFile("tram.csv", content.encode("utf-8"), content_type="text/csv")
        return self.client.post(
            self.base + "import/", {"file": upload, "dry_run": str(dry_run).lower()}, format="multipart"
        )

    def test_list_pagination_returns_total_count(self):
        for i in range(25):
            Station.objects.create(station_code=f"S{i}", name=f"Tram {i}", geom=Point(100.0, 10.0))
        res = self.client.get(self.base + "?all=true&page=2&page_size=10")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["count"], 26)
        self.assertEqual(len(res.json()["results"]), 10)

    def test_download_template(self):
        res = self.client.get(self.base + "download-template/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("attachment", res["Content-Disposition"])
        text = res.content.decode("utf-8-sig")
        self.assertTrue(text.startswith("station_code,name,station_type,elevation,lat,lon,is_active"))

    def test_export_includes_all_stations_and_respects_search(self):
        for i in range(25):
            Station.objects.create(station_code=f"S{i}", name=f"Tram {i}", geom=Point(100.0, 10.0))
        res = self.client.get(self.base + "export/?all=true")
        rows = list(csv.reader(res.content.decode("utf-8-sig").splitlines()))
        self.assertEqual(len(rows), 1 + 26)  # tiêu đề + toàn bộ trạm, không bị cắt theo trang

        res = self.client.get(self.base + "export/?all=true&search=OLD")
        rows = list(csv.reader(res.content.decode("utf-8-sig").splitlines()))
        self.assertEqual([r[0] for r in rows[1:]], ["OLD_01"])

    def test_export_then_import_round_trip(self):
        exported = self.client.get(self.base + "export/?all=true").content.decode("utf-8-sig")
        res = self._upload(exported)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["updated"], 1)
        self.assertEqual(res.json()["created"], 0)
        self.assertEqual(res.json()["errors"], [])

    def test_import_creates_and_updates(self):
        content = (
            "station_code,name,station_type,elevation,lat,lon,is_active\n"
            'OLD_01,"Tram, da doi ten",Cột khí tượng,12.5,11,101,0\n'
            "NEW 02,Tram moi,BUOY,,12,102,1\n"
        )
        res = self._upload(content)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual((data["created"], data["updated"]), (1, 1))

        self.existing.refresh_from_db()
        self.assertEqual(self.existing.name, "Tram, da doi ten")
        self.assertEqual(self.existing.station_type, "MET_MAST")
        self.assertFalse(self.existing.is_active)
        self.assertEqual(self.existing.geom.y, 11.0)
        created = Station.objects.get(station_code="NEW_02")
        self.assertEqual(created.station_type, "BUOY")
        self.assertIsNone(created.elevation)

    def test_import_dry_run_does_not_write(self):
        content = "station_code,name,lat,lon\nNEW_03,Tram moi,12,102\n"
        res = self._upload(content, dry_run=True)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["created"], 1)
        self.assertFalse(Station.objects.filter(station_code="NEW_03").exists())

    def test_import_skips_invalid_rows_and_reports_them(self):
        content = (
            "station_code,name,lat,lon\n"
            "OK_1,Tram tot,10,100\n"
            "OK_1,Trung ma,10,100\n"
            "BAD_LAT,Sai vi do,95,100\n"
            ",Thieu ma,10,100\n"
        )
        res = self._upload(content)
        data = res.json()
        self.assertEqual(data["created"], 1)
        self.assertEqual([e["line"] for e in data["errors"]], [3, 4, 5])
        self.assertTrue(Station.objects.filter(station_code="OK_1").exists())
        self.assertFalse(Station.objects.filter(station_code="BAD_LAT").exists())

    def test_import_rejects_missing_columns_and_missing_file(self):
        res = self._upload("station_code,name\nA,B\n")
        self.assertEqual(res.status_code, 400)
        self.assertIn("lat", res.json()["error"])

        res = self.client.post(self.base + "import/", {}, format="multipart")
        self.assertEqual(res.status_code, 400)

    def test_import_requires_admin(self):
        self.client.force_authenticate(user=None)
        res = self._upload("station_code,name,lat,lon\nA,B,1,2\n")
        self.assertIn(res.status_code, (401, 403))
