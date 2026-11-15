"""
Comprehensive End-to-End API Contract Tests for Wind Management System.

Verifies that every single API endpoint called by `frontend/src/api/wind.js`
succeeds with HTTP 200 and matches the expected JSON / GeoJSON schema.

Tested endpoints:
1.  /wind/api/v1/stations/
2.  /wind/api/v1/stations/map/
3.  /wind/api/v1/stations/{id}/
4.  /wind/api/v1/stations/{id}/monthly-summary/
5.  /wind/api/v1/stations/{id}/yearly-summary/
6.  /wind/api/v1/observations/
7.  /geoserver/geonode/ows
8.  /wind/api/v1/raster-granules/summary/
9.  /wind/api/v1/datasets/
10. /wind/api/v1/datasets/{id}/time_steps/
11. /wind/api/v1/datasets/{id}/get_variables/
12. /wind/api/v1/raster-granules/data/
13. /wind/api/v1/statistics/overview/
14. /wind/api/v1/statistics/rankings/
15. /wind/api/v1/statistics/multi-station-compare/
16. /wind/api/v1/statistics/wind-rose/
17. /wind/api/v1/statistics/export-csv/
18. /wind/api/v1/events/
19. /wind/api/v1/events/{id}/impacted_observations/
20. /wind/api/v1/farms/ & /wind/api/v1/turbines/
"""

import os
import tempfile
from datetime import datetime, timezone
import numpy as np
import pandas as pd
import xarray as xr
from django.contrib.gis.geos import Point, Polygon
from django.test import TestCase, override_settings
from django.utils import timezone as dj_timezone
from rest_framework.test import APIClient

from wind_core.models import Dataset, DatasetVariable
from wind_energy.models import WindFarm, WindTurbine
from wind_events.models import EventTrack, MeteorologicalEvent
from wind_raster.models import RasterGranuleIndex
from wind_stations.models import Station
from wind_stations.services.duckdb_storage_service import ingest_dataframe_to_parquet
from wind_stations.services.observation_lake_service import invalidate_latest_cache


def _obs(station_code, obs_time, **metrics):
    """Một dòng quan trắc cho kho dữ liệu, thời gian quy về giờ địa phương không múi giờ."""
    local_time = dj_timezone.localtime(obs_time).replace(tzinfo=None)
    return {"station_code": station_code, "obs_time": local_time, **metrics}


class FrontendE2EContractTestCase(TestCase):
    """
    E2E integration test suite verifying backend API contracts
    against frontend expectations defined in frontend/src/api/wind.js.
    """

    @classmethod
    def setUpClass(cls):
        # Kho dữ liệu quan trắc riêng cho cả lớp test, tránh ghi vào kho thật
        cls._lake_dir = tempfile.TemporaryDirectory()
        cls._lake_override = override_settings(MEDIA_ROOT=cls._lake_dir.name)
        cls._lake_override.enable()
        invalidate_latest_cache()
        try:
            super().setUpClass()
        except Exception:
            cls._cleanup_lake()
            raise

    @classmethod
    def _cleanup_lake(cls):
        cls._lake_override.disable()
        cls._lake_dir.cleanup()
        invalidate_latest_cache()

    @classmethod
    def setUpTestData(cls):
        """
        Seed realistic test data across all micro-apps:
        - Gridded & Station Datasets with Variables
        - Realistic Meteorological Stations & Multi-period Observations
        - Extreme Meteorological Events with EventTracks
        - NetCDF Raster Granule Index with synthetic NetCDF file
        - Offshore Wind Farm and Wind Turbines
        """
        cls.client = APIClient()

        # -------------------------------------------------------------
        # 1. Dataset & DatasetVariables (wind_core)
        # -------------------------------------------------------------
        cls.grid_dataset = Dataset.objects.create(
            code="ERA5_GRID",
            name="Bộ dữ liệu tái phân tích ERA5",
            category="GRIDDED",
            description="Dữ liệu lưới trường gió tái phân tích ECMWF ERA5",
            source_provider="ECMWF",
            spatial_extent=Polygon.from_bbox((100.0, 5.0, 120.0, 25.0)),
            time_start=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            time_end=datetime(2026, 12, 31, 23, 0, tzinfo=timezone.utc),
            temporal_resolution="hourly",
            access_level="PUBLIC",
            is_active=True,
        )

        cls.var_wind_10m = DatasetVariable.objects.create(
            dataset=cls.grid_dataset,
            variable_code="wind_10m",
            variable_name="Gió bề mặt 10m",
            unit="m/s",
            components=["u10", "v10"],
            is_component=False,
        )

        cls.var_u10 = DatasetVariable.objects.create(
            dataset=cls.grid_dataset,
            variable_code="u10",
            variable_name="Thành phần U gió 10m",
            unit="m/s",
            components=[],
            is_component=True,
        )

        cls.var_v10 = DatasetVariable.objects.create(
            dataset=cls.grid_dataset,
            variable_code="v10",
            variable_name="Thành phần V gió 10m",
            unit="m/s",
            components=[],
            is_component=True,
        )

        cls.var_t2m = DatasetVariable.objects.create(
            dataset=cls.grid_dataset,
            variable_code="temp_2m",
            variable_name="Nhiệt độ 2m",
            unit="degC",
            components=["t2m"],
            is_component=False,
        )

        cls.station_dataset = Dataset.objects.create(
            code="VN_STATIONS",
            name="Mạng lưới trạm khí tượng bề mặt Việt Nam",
            category="STATION",
            description="Chuỗi số liệu quan trắc trạm khí tượng bề mặt",
            source_provider="Tổng cục Khí tượng Thủy văn",
            spatial_extent=Polygon.from_bbox((102.0, 8.0, 110.0, 24.0)),
            access_level="PUBLIC",
            is_active=True,
        )

        # -------------------------------------------------------------
        # 2. Stations & Observations (wind_stations)
        # -------------------------------------------------------------
        # Station 1: Bạch Long Vĩ (Hải Phòng - Island)
        cls.station_blv = Station.objects.create(
            station_code="48839",
            name="Bạch Long Vĩ",
            geom=Point(107.72, 20.13, srid=4326),
            elevation=15.0,
            station_type="ISLAND",
            is_active=True,
        )

        # Station 2: Cô Tô (Quảng Ninh - Island)
        cls.station_coto = Station.objects.create(
            station_code="48838",
            name="Cô Tô",
            geom=Point(107.75, 20.95, srid=4326),
            elevation=10.0,
            station_type="ISLAND",
            is_active=True,
        )

        # Station 3: Phú Quốc (Kiên Giang - Coastal / Island South)
        cls.station_pq = Station.objects.create(
            station_code="48914",
            name="Phú Quốc",
            geom=Point(103.96, 10.22, srid=4326),
            elevation=8.0,
            station_type="COASTAL",
            is_active=True,
        )

        # Observations across January and February 2026, nạp vào kho dữ liệu quan trắc
        ingest_dataframe_to_parquet(pd.DataFrame([
            # Bạch Long Vĩ observations
            _obs("48839", datetime(2026, 1, 15, 0, 0, tzinfo=timezone.utc),
                 wind_speed=8.5, wind_dir=45.0, temp_2m=21.5, temp_min=19.0, temp_max=24.0,
                 humidity=82.0, pressure=1016.0, rain_06h=0.0, rain_24h=0.0),
            _obs("48839", datetime(2026, 1, 15, 6, 0, tzinfo=timezone.utc),
                 wind_speed=12.0, wind_dir=50.0, temp_2m=22.8, temp_min=20.0, temp_max=25.0,
                 humidity=78.0, pressure=1014.5, rain_06h=1.2, rain_24h=1.2),
            _obs("48839", datetime(2026, 2, 10, 12, 0, tzinfo=timezone.utc),
                 wind_speed=18.5, wind_dir=60.0, temp_2m=18.0, temp_min=16.0, temp_max=20.0,
                 humidity=85.0, pressure=1020.0, rain_06h=5.0, rain_24h=15.0),
            # Cô Tô observations
            _obs("48838", datetime(2026, 1, 15, 6, 0, tzinfo=timezone.utc),
                 wind_speed=11.2, wind_dir=40.0, temp_2m=20.5, temp_min=18.0, temp_max=23.0,
                 humidity=80.0, pressure=1015.0, rain_06h=0.5, rain_24h=0.5),
            _obs("48838", datetime(2026, 2, 10, 12, 0, tzinfo=timezone.utc),
                 wind_speed=16.0, wind_dir=55.0, temp_2m=17.5, temp_min=15.0, temp_max=19.5,
                 humidity=88.0, pressure=1019.0, rain_06h=8.0, rain_24h=20.0),
            # Phú Quốc observations
            _obs("48914", datetime(2026, 1, 15, 6, 0, tzinfo=timezone.utc),
                 wind_speed=5.4, wind_dir=210.0, temp_2m=28.5, temp_min=25.0, temp_max=32.0,
                 humidity=75.0, pressure=1010.0, rain_06h=0.0, rain_24h=0.0),
        ]))

        # -------------------------------------------------------------
        # 3. Meteorological Events & Tracks (wind_events)
        # -------------------------------------------------------------
        cls.influence_poly = Polygon.from_bbox((105.0, 18.0, 110.0, 22.0))
        cls.influence_poly.srid = 4326

        cls.event = MeteorologicalEvent.objects.create(
            event_name="Bão Yagi (Bão số 3)",
            event_type="TYPHOON",
            start_date=datetime(2026, 1, 10, 0, 0, tzinfo=timezone.utc),
            end_date=datetime(2026, 1, 20, 23, 59, tzinfo=timezone.utc),
            influence_area=cls.influence_poly,
            max_intensity="Cấp 14",
        )

        cls.track = EventTrack.objects.create(
            event=cls.event,
            track_time=datetime(2026, 1, 15, 6, 0, tzinfo=timezone.utc),
            geom=Point(107.5, 20.0, srid=4326),
            intensity="Cấp 12",
            central_pressure=975.0,
            moving_speed_kmh=25.0,
            moving_direction=290.0,
        )

        # -------------------------------------------------------------
        # 4. Raster Granule Index & Synthetic NetCDF (wind_raster)
        # -------------------------------------------------------------
        with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp_nc:
            cls.tmp_nc_path = tmp_nc.name

        lats = np.array([20.0, 21.0], dtype=np.float32)
        lons = np.array([107.0, 108.0], dtype=np.float32)
        u_vals = np.array([[3.0, 4.0], [5.0, 6.0]], dtype=np.float32)
        v_vals = np.array([[4.0, 3.0], [2.0, 1.0]], dtype=np.float32)
        t_vals = np.array([[294.0, 295.0], [293.5, 294.5]], dtype=np.float32)

        ds_synth = xr.Dataset(
            data_vars={
                "u10": (("latitude", "longitude"), u_vals),
                "v10": (("latitude", "longitude"), v_vals),
                "t2m": (("latitude", "longitude"), t_vals),
            },
            coords={
                "latitude": lats,
                "longitude": lons,
            },
        )
        ds_synth.to_netcdf(cls.tmp_nc_path)
        ds_synth.close()

        cls.raster_footprint = Polygon.from_bbox((106.0, 19.0, 109.0, 22.0))
        cls.raster_footprint.srid = 4326

        cls.granule_time = datetime(2026, 1, 15, 6, 0, tzinfo=timezone.utc)
        cls.granule = RasterGranuleIndex.objects.create(
            dataset=cls.grid_dataset,
            granule_time=cls.granule_time,
            footprint=cls.raster_footprint,
            file_location=cls.tmp_nc_path,
            variable_code="wind_10m",
            elevation=10.0,
        )

        # -------------------------------------------------------------
        # 5. Wind Farm & Wind Turbines (wind_energy)
        # -------------------------------------------------------------
        cls.farm = WindFarm.objects.create(
            code="WF_BLV",
            name="Trang trại điện gió Bạch Long Vĩ",
            location_name="Vịnh Bắc Bộ",
            status="OPERATING",
            total_capacity_mw=120.0,
            boundary=Polygon.from_bbox((107.5, 20.0, 108.0, 20.5)),
        )

        cls.turbine_1 = WindTurbine.objects.create(
            farm=cls.farm,
            point_id=1,
            geom=Point(107.72, 20.13, srid=4326),
            wind_speed_100m=9.5,
            wind_direction=60.0,
            sea_depth=25.0,
            predicted_power_mw=4.5,
            capacity_factor=42.0,
            status="OPERATIONAL",
        )

        cls.turbine_2 = WindTurbine.objects.create(
            farm=cls.farm,
            point_id=2,
            geom=Point(107.75, 20.15, srid=4326),
            wind_speed_100m=10.2,
            wind_direction=65.0,
            sea_depth=65.0,
            predicted_power_mw=5.5,
            capacity_factor=45.0,
            status="OPERATIONAL",
        )

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._cleanup_lake()
        if hasattr(cls, "tmp_nc_path") and os.path.exists(cls.tmp_nc_path):
            try:
                os.remove(cls.tmp_nc_path)
            except OSError:
                pass

    # =========================================================================
    # CONTRACT TESTS FOR EVERY FRONTEND API FUNCTION
    # =========================================================================

    def test_01_get_stations_contract(self):
        """
        [GET] /wind/api/v1/stations/
        Matches frontend `getStations(params)`:
        Expects HTTP 200, paginated results array with station fields.
        """
        response = self.client.get("/wind/api/v1/stations/")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("count", data)
        self.assertIn("results", data)
        self.assertGreaterEqual(data["count"], 3)

        first_station = data["results"][0]
        for key in ["id", "station_code", "name", "station_type", "elevation", "lat", "lon", "is_active"]:
            self.assertIn(key, first_station)

        # Test search filter
        search_res = self.client.get("/wind/api/v1/stations/", {"search": "Bạch Long Vĩ"})
        self.assertEqual(search_res.status_code, 200)
        search_data = search_res.json()
        self.assertEqual(search_data["count"], 1)
        self.assertEqual(search_data["results"][0]["name"], "Bạch Long Vĩ")

        # Test station_type filter
        type_res = self.client.get("/wind/api/v1/stations/", {"station_type": "ISLAND"})
        self.assertEqual(type_res.status_code, 200)
        self.assertEqual(type_res.json()["count"], 2)

    def test_02_get_stations_map_contract(self):
        """
        [GET] /wind/api/v1/stations/map/
        Matches frontend `getStationsMap(params)`:
        Expects HTTP 200, GeoJSON FeatureCollection format.
        """
        response = self.client.get("/wind/api/v1/stations/map/")
        self.assertEqual(response.status_code, 200)

        geojson = response.json()
        self.assertEqual(geojson.get("type"), "FeatureCollection")
        self.assertIn("features", geojson)
        self.assertGreaterEqual(len(geojson["features"]), 3)

        feature = geojson["features"][0]
        self.assertEqual(feature.get("type"), "Feature")
        self.assertIn("geometry", feature)
        self.assertEqual(feature["geometry"].get("type"), "Point")
        self.assertEqual(len(feature["geometry"].get("coordinates")), 2)

        props = feature.get("properties", {})
        for key in ["station_code", "name", "station_type", "elevation", "is_active"]:
            self.assertIn(key, props)

    def test_03_get_station_detail_contract(self):
        """
        [GET] /wind/api/v1/stations/{id}/
        Matches frontend `getStationDetail(id)`:
        Expects HTTP 200, single station object.
        """
        response = self.client.get(f"/wind/api/v1/stations/{self.station_blv.id}/")
        self.assertEqual(response.status_code, 200)

        station = response.json()
        self.assertEqual(station["id"], self.station_blv.id)
        self.assertEqual(station["station_code"], "48839")
        self.assertEqual(station["name"], "Bạch Long Vĩ")
        self.assertEqual(station["station_type"], "ISLAND")
        self.assertEqual(float(station["elevation"]), 15.0)

    def test_04_get_station_summary_contract(self):
        """
        [GET] /wind/api/v1/stations/{id}/monthly-summary/
        Matches frontend `getStationSummary(id, 'monthly-summary', params)`:
        Frontend expects response.data.results || response.data || []
        """
        response = self.client.get(f"/wind/api/v1/stations/{self.station_blv.id}/monthly-summary/")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("station_id", data)
        self.assertIn("station_name", data)
        self.assertIn("results", data)
        self.assertIsInstance(data["results"], list)
        self.assertGreaterEqual(len(data["results"]), 1)

        summary_month = data["results"][0]
        for key in [
            "month", "total_records",
            "wind_speed_avg", "wind_speed_max", "wind_speed_min",
            "temp_2m_avg", "temp_2m_max", "temp_2m_min",
            "humidity_avg", "pressure_avg", "rain_24h_avg"
        ]:
            self.assertIn(key, summary_month)

        # Also verify yearly-summary action
        yearly_res = self.client.get(f"/wind/api/v1/stations/{self.station_blv.id}/yearly-summary/")
        self.assertEqual(yearly_res.status_code, 200)
        self.assertIn("results", yearly_res.json())

    def test_05_get_observations_contract(self):
        """
        [GET] /wind/api/v1/observations/
        Matches frontend `getStationObservations(params)`:
        Expects HTTP 200, paginated results array with observation metrics.
        """
        response = self.client.get("/wind/api/v1/observations/")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("count", data)
        self.assertIn("results", data)
        self.assertGreaterEqual(data["count"], 6)

        obs = data["results"][0]
        for key in [
            "id", "station", "station_code",
            "obs_time", "wind_speed", "wind_dir", "temp_2m",
            "humidity", "pressure", "rain_06h", "rain_24h"
        ]:
            self.assertIn(key, obs)

        # Test filter by station ID
        filtered_res = self.client.get(
            "/wind/api/v1/observations/",
            {"station": self.station_blv.id}
        )
        self.assertEqual(filtered_res.status_code, 200)
        self.assertEqual(filtered_res.json()["count"], 3)

    def test_06_get_province_wfs_data_contract(self):
        """
        [GET] /geoserver/geonode/ows
        Matches frontend `getProvinceWfsData()`:
        Expects HTTP 200 GeoJSON FeatureCollection of Vietnam provincial boundaries.
        """
        response = self.client.get(
            "/geoserver/geonode/ows",
            {
                "service": "WFS",
                "version": "1.0.0",
                "request": "GetFeature",
                "typeName": "geonode:viet_nam_tinh_thanh_63",
                "maxFeatures": 100,
                "outputFormat": "application/json",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/json", response.get("Content-Type", ""))

        data = response.json()
        self.assertEqual(data.get("type"), "FeatureCollection")
        self.assertIn("features", data)
        self.assertIsInstance(data["features"], list)

    def test_07_get_grid_summary_contract(self):
        """
        [GET] /wind/api/v1/raster-granules/summary/
        Matches frontend `getGridSummary()`:
        Expects HTTP 200, overview of raster granules and datasets.
        """
        response = self.client.get("/wind/api/v1/raster-granules/summary/")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        for key in ["total_granules", "min_granule_time", "max_granule_time", "datasets", "unique_variable_codes"]:
            self.assertIn(key, data)

        self.assertGreaterEqual(data["total_granules"], 1)
        self.assertIn("wind_10m", data["unique_variable_codes"])
        self.assertEqual(data["datasets"][0]["dataset_code"], "ERA5_GRID")

    def test_08_get_datasets_contract(self):
        """
        [GET] /wind/api/v1/datasets/
        Matches frontend `getDatasets(params = { category: 'GRIDDED' })`:
        Expects HTTP 200, paginated results array of datasets.
        """
        response = self.client.get("/wind/api/v1/datasets/", {"category": "GRIDDED"})
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("count", data)
        self.assertIn("results", data)
        self.assertEqual(data["count"], 1)

        dataset = data["results"][0]
        self.assertEqual(dataset["code"], "ERA5_GRID")
        self.assertEqual(dataset["category"], "GRIDDED")
        for key in ["id", "code", "name", "category", "access_level", "is_active"]:
            self.assertIn(key, dataset)

    def test_09_get_dataset_time_steps_contract(self):
        """
        [GET] /wind/api/v1/datasets/{id}/time_steps/
        Matches frontend `getDatasetTimeSteps(datasetId)`:
        Expects HTTP 200, dict containing `time_steps` array.
        """
        response = self.client.get(f"/wind/api/v1/datasets/{self.grid_dataset.id}/time_steps/")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("time_steps", data)
        self.assertIsInstance(data["time_steps"], list)
        self.assertGreaterEqual(len(data["time_steps"]), 1)

    def test_10_get_dataset_variables_contract(self):
        """
        [GET] /wind/api/v1/datasets/{id}/get_variables/
        Matches frontend `getDatasetVariables(datasetId)`:
        Expects HTTP 200, dict containing `variables` array, filtered by is_component.
        """
        response = self.client.get(
            f"/wind/api/v1/datasets/{self.grid_dataset.id}/get_variables/",
            {"is_component": "false"}
        )
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("variables", data)
        self.assertIsInstance(data["variables"], list)

        var_codes = [v["variable_code"] for v in data["variables"]]
        self.assertIn("wind_10m", var_codes)
        self.assertIn("temp_2m", var_codes)
        # Components u10, v10 should be filtered out
        self.assertNotIn("u10", var_codes)
        self.assertNotIn("v10", var_codes)

        var = data["variables"][0]
        for key in ["id", "variable_code", "variable_name", "unit", "components", "is_component"]:
            self.assertIn(key, var)

    def test_11_get_raster_granule_data_contract(self):
        """
        [GET] /wind/api/v1/raster-granules/data/
        Matches frontend `getRasterGranuleData({ dataset_id, variable, time, bbox, step })`:
        Expects HTTP 200, extracting u/v arrays and vector wind speed/direction.
        """
        response = self.client.get(
            "/wind/api/v1/raster-granules/data/",
            {
                "dataset_id": self.grid_dataset.id,
                "variable": "wind_10m",
                "time": self.granule_time.isoformat(),
            }
        )
        self.assertEqual(response.status_code, 200)

        data = response.json()
        for key in ["lats", "lons", "variable", "u", "v", "speed", "direction"]:
            self.assertIn(key, data)

        self.assertEqual(data["variable"], "wind_10m")
        self.assertEqual(len(data["lats"]), 2)
        self.assertEqual(len(data["lons"]), 2)
        self.assertIsInstance(data["u"], list)
        self.assertIsInstance(data["v"], list)
        self.assertIsInstance(data["speed"], list)

    def test_12_get_statistics_overview_contract(self):
        """
        [GET] /wind/api/v1/statistics/overview/
        Matches frontend `getStatisticsOverview(params)`:
        Expects HTTP 200 with overall system meteorology statistics.
        """
        response = self.client.get("/wind/api/v1/statistics/overview/")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        for key in ["total_stations", "active_stations", "total_observations", "date_range", "stations_by_type", "max_wind_recorded"]:
            self.assertIn(key, data)

        self.assertGreaterEqual(data["total_stations"], 3)
        self.assertGreaterEqual(data["total_observations"], 6)
        self.assertIsNotNone(data["date_range"]["min_date"])
        self.assertIsNotNone(data["date_range"]["max_date"])
        self.assertIsNotNone(data["max_wind_recorded"])
        self.assertIn("wind_speed", data["max_wind_recorded"])
        self.assertIn("station_name", data["max_wind_recorded"])

    def test_13_get_statistics_rankings_contract(self):
        """
        [GET] /wind/api/v1/statistics/rankings/
        Matches frontend `getStatisticsRankings(params)`:
        Expects HTTP 200, ranked array of stations by specified metric.
        """
        response = self.client.get(
            "/wind/api/v1/statistics/rankings/",
            {"metric": "wind_speed_max", "limit": 10}
        )
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertEqual(data["metric"], "wind_speed_max")
        self.assertIn("rankings", data)
        self.assertIsInstance(data["rankings"], list)
        self.assertGreaterEqual(len(data["rankings"]), 1)

        top_rank = data["rankings"][0]
        self.assertEqual(top_rank["rank"], 1)
        for key in ["rank", "station_id", "station_code", "station_name", "value"]:
            self.assertIn(key, top_rank)

        # Bạch Long Vĩ has highest wind speed (18.5 m/s)
        self.assertEqual(top_rank["station_code"], "48839")
        self.assertEqual(top_rank["value"], 18.5)

    def test_14_get_multi_station_compare_contract(self):
        """
        [GET] /wind/api/v1/statistics/multi-station-compare/
        Matches frontend `getMultiStationComparison(params)`:
        Expects HTTP 200, time series comparison matrix across stations.
        """
        station_ids = f"{self.station_blv.id},{self.station_coto.id}"
        response = self.client.get(
            "/wind/api/v1/statistics/multi-station-compare/",
            {
                "station_ids": station_ids,
                "metric": "wind_speed",
                "interval": "month",
            }
        )
        self.assertEqual(response.status_code, 200)

        data = response.json()
        for key in ["metric", "interval", "timestamps", "series"]:
            self.assertIn(key, data)

        self.assertEqual(data["metric"], "wind_speed")
        self.assertEqual(data["interval"], "month")
        self.assertIsInstance(data["timestamps"], list)
        self.assertIsInstance(data["series"], list)
        self.assertEqual(len(data["series"]), 2)

        for s in data["series"]:
            for key in ["station_id", "station_name", "values"]:
                self.assertIn(key, s)
            self.assertEqual(len(s["values"]), len(data["timestamps"]))

    def test_15_get_wind_rose_data_contract(self):
        """
        [GET] /wind/api/v1/statistics/wind-rose/
        Matches frontend `getWindRoseData(params)`:
        Expects HTTP 200 with 16 directions, 6 speed bins, and percentile distribution.
        """
        response = self.client.get(
            "/wind/api/v1/statistics/wind-rose/",
            {"station_id": self.station_blv.id}
        )
        self.assertEqual(response.status_code, 200)

        data = response.json()
        for key in ["total_records", "calm_percent", "avg_wind_speed", "directions", "speed_bins", "distribution"]:
            self.assertIn(key, data)

        self.assertEqual(data["total_records"], 3)
        self.assertEqual(len(data["directions"]), 16)
        self.assertEqual(len(data["speed_bins"]), 6)
        self.assertIn("percentiles", data["distribution"])

        for bin_item in data["speed_bins"]:
            self.assertIn("label", bin_item)
            self.assertIn("values", bin_item)
            self.assertEqual(len(bin_item["values"]), 16)

    def test_16_get_statistics_export_csv_contract(self):
        """
        [GET] /wind/api/v1/statistics/export-csv/
        Matches frontend `getStatisticsExportUrl(params)`:
        Expects HTTP 200, Content-Type text/csv, and attachment disposition.
        """
        response = self.client.get("/wind/api/v1/statistics/export-csv/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn("attachment; filename=", response["Content-Disposition"])

        content = response.content.decode("utf-8")
        self.assertIn("Station ID,Station Code,Station Name", content)
        self.assertIn("Bạch Long Vĩ", content)
        self.assertIn("Cô Tô", content)

    def test_17_get_events_contract(self):
        """
        [GET] /wind/api/v1/events/
        Expects HTTP 200, GeoJSON FeatureCollection of extreme meteorological events with tracks.
        """
        response = self.client.get("/wind/api/v1/events/")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("count", data)
        self.assertIn("results", data)
        self.assertGreaterEqual(data["count"], 1)

        results = data["results"]
        self.assertEqual(results.get("type"), "FeatureCollection")
        self.assertIn("features", results)
        self.assertGreaterEqual(len(results["features"]), 1)

        event_feature = results["features"][0]
        self.assertEqual(event_feature.get("type"), "Feature")
        self.assertIn("geometry", event_feature)
        props = event_feature.get("properties", {})
        for key in ["event_name", "event_type", "start_date", "end_date", "max_intensity", "tracks"]:
            self.assertIn(key, props)

        self.assertEqual(props["event_name"], "Bão Yagi (Bão số 3)")
        tracks_geojson = props["tracks"]
        self.assertEqual(tracks_geojson.get("type"), "FeatureCollection")
        self.assertGreaterEqual(len(tracks_geojson.get("features", [])), 1)

        track_feature = tracks_geojson["features"][0]
        track_props = track_feature.get("properties", {})
        for key in ["track_time", "intensity", "central_pressure", "moving_speed_kmh", "moving_direction"]:
            self.assertIn(key, track_props)

    def test_18_get_event_impacted_observations_contract(self):
        """
        [GET] /wind/api/v1/events/{id}/impacted_observations/
        Expects HTTP 200, observations belonging to stations spatially within event influence area
        and temporally within event start/end bounds.
        """
        response = self.client.get(f"/wind/api/v1/events/{self.event.id}/impacted_observations/")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("count", data)
        self.assertIn("results", data)

        # Stations BLV (48839) and Cô Tô (48838) are inside the influence polygon, Phú Quốc (48914) is outside.
        # Observations during Jan 10 - Jan 20: BLV (2), Cô Tô (1) = 3 total
        impacted_station_codes = {obs["station_code"] for obs in data["results"]}
        self.assertIn("48839", impacted_station_codes)
        self.assertIn("48838", impacted_station_codes)
        self.assertNotIn("48914", impacted_station_codes)

    def test_19_wind_energy_farms_and_turbines_contract(self):
        """
        [GET] /wind/api/v1/farms/ and /wind/api/v1/turbines/
        Verifies backend endpoints for wind power planning and offshore turbine analysis.
        """
        # 1. Farms list
        farms_res = self.client.get("/wind/api/v1/farms/")
        self.assertEqual(farms_res.status_code, 200)
        self.assertGreaterEqual(farms_res.json()["count"], 1)

        # 2. Farms map GeoJSON
        farm_map_res = self.client.get("/wind/api/v1/farms/map/")
        self.assertEqual(farm_map_res.status_code, 200)
        farm_map_geojson = farm_map_res.json()
        self.assertEqual(farm_map_geojson["type"], "FeatureCollection")
        self.assertGreaterEqual(len(farm_map_geojson["features"]), 2)

        # 3. Farm turbines detail
        farm_turbines_res = self.client.get(
            f"/wind/api/v1/farms/{self.farm.id}/turbines/",
            {"format": "geojson"}
        )
        self.assertEqual(farm_turbines_res.status_code, 200)
        self.assertEqual(farm_turbines_res.json()["type"], "FeatureCollection")

        # 4. Turbines list and filtering
        turbines_res = self.client.get(
            "/wind/api/v1/turbines/",
            {"min_power": 5.0}
        )
        self.assertEqual(turbines_res.status_code, 200)
        self.assertEqual(turbines_res.json()["count"], 1)
        self.assertEqual(turbines_res.json()["results"][0]["point_id"], 2)

        # 5. Turbines map GeoJSON
        turbines_map_res = self.client.get("/wind/api/v1/turbines/map/")
        self.assertEqual(turbines_map_res.status_code, 200)
        turbines_geojson = turbines_map_res.json()
        self.assertEqual(turbines_geojson["type"], "FeatureCollection")
        self.assertGreaterEqual(len(turbines_geojson["features"]), 2)

    def test_20_api_versioning_and_legacy_route_aliases(self):
        """
        Verifies backward compatibility aliases (/api/v1/wind/, /api/v2/wind/, /api/)
        return identical HTTP 200 responses.
        """
        res_v1_alias = self.client.get("/api/v1/wind/stations/")
        self.assertEqual(res_v1_alias.status_code, 200)
        self.assertIn("results", res_v1_alias.json())

        res_v2_alias = self.client.get("/api/v2/wind/stations/")
        self.assertEqual(res_v2_alias.status_code, 200)
        self.assertIn("results", res_v2_alias.json())

        res_api_alias = self.client.get("/api/datasets/")
        self.assertEqual(res_api_alias.status_code, 200)
        self.assertIn("results", res_api_alias.json())
