"""
Unit and integration tests for Central API Gateway Router and Project URLs.
Verifies full route resolution, ViewSet binding, alias support, and GeoServer fallback.
"""

from django.test import SimpleTestCase, TestCase
from django.urls import resolve, reverse
from rest_framework.test import APIClient

from wind_cds.views import (
    CDSCredentialViewSet,
    CDSDownloadJobViewSet,
    CDSJobRunViewSet,
)
from wind_core.views import DatasetViewSet
from wind_energy.views import WindFarmViewSet, WindTurbineViewSet
from wind_events.views import MeteorologicalEventViewSet
from wind_raster.views import RasterGranuleIndexViewSet
from wind_stations.views import (
    ObservationViewSet,
    ProvinceWFSFallbackView,
    StationViewSet,
    StatisticsViewSet,
)


class ApiRoutingTestCase(SimpleTestCase):
    """
    Validates URL resolution for all frontend endpoints and alias routes.
    """

    def test_frontend_wind_api_v1_routes_resolve(self):
        """
        Ensure all endpoints called by frontend/src/api/wind.js resolve successfully.
        """
        # Wind Stations
        res_stations = resolve("/wind/api/v1/stations/")
        self.assertIsNotNone(res_stations)
        self.assertEqual(res_stations.func.cls, StationViewSet)

        res_stations_map = resolve("/wind/api/v1/stations/map/")
        self.assertIsNotNone(res_stations_map)
        self.assertEqual(res_stations_map.func.cls, StationViewSet)

        res_station_detail = resolve("/wind/api/v1/stations/1/")
        self.assertIsNotNone(res_station_detail)
        self.assertEqual(res_station_detail.func.cls, StationViewSet)

        res_station_monthly = resolve("/wind/api/v1/stations/1/monthly-summary/")
        self.assertIsNotNone(res_station_monthly)
        self.assertEqual(res_station_monthly.func.cls, StationViewSet)

        res_station_yearly = resolve("/wind/api/v1/stations/1/yearly-summary/")
        self.assertIsNotNone(res_station_yearly)
        self.assertEqual(res_station_yearly.func.cls, StationViewSet)

        # Observations
        res_obs = resolve("/wind/api/v1/observations/")
        self.assertIsNotNone(res_obs)
        self.assertEqual(res_obs.func.cls, ObservationViewSet)

        # Datasets
        res_datasets = resolve("/wind/api/v1/datasets/")
        self.assertIsNotNone(res_datasets)
        self.assertEqual(res_datasets.func.cls, DatasetViewSet)

        res_ds_timesteps = resolve("/wind/api/v1/datasets/1/time_steps/")
        self.assertIsNotNone(res_ds_timesteps)
        self.assertEqual(res_ds_timesteps.func.cls, DatasetViewSet)

        res_ds_vars = resolve("/wind/api/v1/datasets/1/get_variables/")
        self.assertIsNotNone(res_ds_vars)
        self.assertEqual(res_ds_vars.func.cls, DatasetViewSet)

        # Raster Granules
        res_raster = resolve("/wind/api/v1/raster-granules/")
        self.assertIsNotNone(res_raster)
        self.assertEqual(res_raster.func.cls, RasterGranuleIndexViewSet)

        res_raster_summary = resolve("/wind/api/v1/raster-granules/summary/")
        self.assertIsNotNone(res_raster_summary)
        self.assertEqual(res_raster_summary.func.cls, RasterGranuleIndexViewSet)

        res_raster_data = resolve("/wind/api/v1/raster-granules/data/")
        self.assertIsNotNone(res_raster_data)
        self.assertEqual(res_raster_data.func.cls, RasterGranuleIndexViewSet)

        # Statistics
        res_stat_overview = resolve("/wind/api/v1/statistics/overview/")
        self.assertIsNotNone(res_stat_overview)
        self.assertEqual(res_stat_overview.func.cls, StatisticsViewSet)

        res_stat_rankings = resolve("/wind/api/v1/statistics/rankings/")
        self.assertIsNotNone(res_stat_rankings)
        self.assertEqual(res_stat_rankings.func.cls, StatisticsViewSet)

        res_stat_compare = resolve("/wind/api/v1/statistics/multi-station-compare/")
        self.assertIsNotNone(res_stat_compare)
        self.assertEqual(res_stat_compare.func.cls, StatisticsViewSet)

        res_stat_rose = resolve("/wind/api/v1/statistics/wind-rose/")
        self.assertIsNotNone(res_stat_rose)
        self.assertEqual(res_stat_rose.func.cls, StatisticsViewSet)

        res_stat_export = resolve("/wind/api/v1/statistics/export-csv/")
        self.assertIsNotNone(res_stat_export)
        self.assertEqual(res_stat_export.func.cls, StatisticsViewSet)

        # Events
        res_events = resolve("/wind/api/v1/events/")
        self.assertIsNotNone(res_events)
        self.assertEqual(res_events.func.cls, MeteorologicalEventViewSet)

        # Wind Energy
        res_farms = resolve("/wind/api/v1/farms/")
        self.assertIsNotNone(res_farms)
        self.assertEqual(res_farms.func.cls, WindFarmViewSet)

        res_farms_map = resolve("/wind/api/v1/farms/map/")
        self.assertIsNotNone(res_farms_map)
        self.assertEqual(res_farms_map.func.cls, WindFarmViewSet)

        res_turbines = resolve("/wind/api/v1/turbines/")
        self.assertIsNotNone(res_turbines)
        self.assertEqual(res_turbines.func.cls, WindTurbineViewSet)

        res_turbines_map = resolve("/wind/api/v1/turbines/map/")
        self.assertIsNotNone(res_turbines_map)
        self.assertEqual(res_turbines_map.func.cls, WindTurbineViewSet)

        # CDS Micro-app
        res_cds_creds = resolve("/wind/api/v1/cds-credentials/")
        self.assertIsNotNone(res_cds_creds)
        self.assertEqual(res_cds_creds.func.cls, CDSCredentialViewSet)

        res_cds_jobs = resolve("/wind/api/v1/cds-jobs/")
        self.assertIsNotNone(res_cds_jobs)
        self.assertEqual(res_cds_jobs.func.cls, CDSDownloadJobViewSet)

        res_cds_runs = resolve("/wind/api/v1/cds-runs/")
        self.assertIsNotNone(res_cds_runs)
        self.assertEqual(res_cds_runs.func.cls, CDSJobRunViewSet)

    def test_geoserver_wfs_fallback_resolves(self):
        """
        Verify /geoserver/geonode/ows routes directly to ProvinceWFSFallbackView.
        """
        match = resolve("/geoserver/geonode/ows")
        self.assertIsNotNone(match)
        self.assertEqual(match.func.view_class, ProvinceWFSFallbackView)
        self.assertEqual(match.url_name, "province_wfs_fallback")

    def test_version_and_legacy_aliases_resolve(self):
        """
        Verify /api/v1/wind/, /api/v2/wind/, and /api/ alias routes resolve properly.
        """
        self.assertEqual(resolve("/api/v1/wind/stations/").func.cls, StationViewSet)
        self.assertEqual(resolve("/api/v2/wind/stations/").func.cls, StationViewSet)
        self.assertEqual(resolve("/api/datasets/").func.cls, DatasetViewSet)

    def test_reverse_routing(self):
        """
        Verify reverse URL lookup functions for router basenames and GeoServer fallback.
        """
        self.assertTrue(reverse("station-list").endswith("/stations/"))
        self.assertTrue(reverse("dataset-list").endswith("/datasets/"))
        self.assertTrue(reverse("raster-granule-list").endswith("/raster-granules/"))
        self.assertEqual(reverse("province_wfs_fallback"), "/geoserver/geonode/ows")


class GeoServerWFSIntegrationTest(TestCase):
    """
    Verifies HTTP GET request to /geoserver/geonode/ows fallback endpoint returns GeoJSON.
    """

    def setUp(self):
        self.client = APIClient()

    def test_geoserver_ows_endpoint_returns_json(self):
        response = self.client.get(
            "/geoserver/geonode/ows",
            {
                "service": "WFS",
                "version": "1.0.0",
                "request": "GetFeature",
                "typeName": "geonode:viet_nam_tinh_thanh_63",
                "outputFormat": "application/json",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/json", response.get("Content-Type", ""))
        data = response.json()
        self.assertEqual(data.get("type"), "FeatureCollection")
        self.assertIn("features", data)
