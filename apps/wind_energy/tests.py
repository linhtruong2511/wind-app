import datetime
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point, Polygon
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from wind_core.models import Dataset
from wind_energy.models import (
    AnalysisJob,
    AnalysisResult,
    ExtremeEvent,
    WindFarm,
    WindTurbine,
)
from wind_energy.serializers import (
    AnalysisJobSerializer,
    AnalysisResultSerializer,
    ExtremeEventSerializer,
    WindFarmDetailSerializer,
    WindFarmSerializer,
    WindTurbineGeoSerializer,
    WindTurbineSerializer,
)
from wind_stations.models import Station

User = get_user_model()


class WindEnergyModelTest(TestCase):
    def setUp(self):
        self.dataset = Dataset.objects.create(
            code="OFFSHORE_WIND_2026",
            name="Bộ dữ liệu tiềm năng điện gió 2026",
            category="GRIDDED",
        )
        self.farm = WindFarm.objects.create(
            code="WF_VINH_BAC_BO",
            name="Trang trại gió ngoài khơi Vịnh Bắc Bộ",
            location_name="Bắc Vịnh Bắc Bộ",
            status="ASSESSMENT",
            total_capacity_mw=150.75,
            dataset=self.dataset,
        )
        self.station = Station.objects.create(
            station_code="ST_BACH_LONG_VI",
            name="Trạm Bạch Long Vĩ",
            geom=Point(107.72, 20.13, srid=4326),
            elevation=12.0,
            station_type="SYNOP",
            is_active=True,
        )

    def test_wind_farm_creation_and_str(self):
        self.assertEqual(
            str(self.farm),
            "Trang trại gió ngoài khơi Vịnh Bắc Bộ (WF_VINH_BAC_BO)",
        )
        self.assertEqual(self.farm._meta.db_table, "wind_farms")
        self.assertEqual(self.farm.dataset, self.dataset)
        self.assertEqual(self.farm.status, "ASSESSMENT")
        self.assertEqual(float(self.farm.total_capacity_mw), 150.75)

    def test_wind_turbine_creation_and_str(self):
        turbine = WindTurbine.objects.create(
            farm=self.farm,
            point_id=1,
            geom=Point(106.38057, 19.25825, srid=4326),
            wind_speed_100m=7.7,
            wind_direction=15.0,
            sea_depth=28.5,
            predicted_power_mw=45.2,
            capacity_factor=32.1,
            status="PROPOSED",
        )
        self.assertEqual(turbine._meta.db_table, "wind_turbines")
        self.assertEqual(turbine.farm, self.farm)
        self.assertEqual(turbine.point_id, 1)
        self.assertEqual(float(turbine.latitude), 19.25825)
        self.assertEqual(float(turbine.longitude), 106.38057)
        self.assertIn("Tuabin 1", str(turbine))
        self.assertIn("WF_VINH_BAC_BO", str(turbine))

    def test_wind_farm_turbines_relationship(self):
        WindTurbine.objects.create(
            farm=self.farm,
            point_id=10,
            geom=Point(106.5, 19.5, srid=4326),
            wind_speed_100m=8.1,
            wind_direction=20.0,
            sea_depth=35.0,
            predicted_power_mw=48.0,
            capacity_factor=34.0,
        )
        WindTurbine.objects.create(
            farm=self.farm,
            point_id=11,
            geom=Point(106.6, 19.6, srid=4326),
            wind_speed_100m=8.3,
            wind_direction=22.0,
            sea_depth=55.0,
            predicted_power_mw=52.0,
            capacity_factor=36.0,
        )
        self.assertEqual(self.farm.turbines.count(), 2)

    def test_analysis_job_and_result_creation(self):
        job = AnalysisJob.objects.create(
            analysis_type="WIND_RESOURCE_ASSESSMENT",
            parameters={"model": "RandomForest", "elevation": 100},
            status="SUCCESS",
            result_summary={"mean_power_mw": 48.5},
        )
        self.assertEqual(job._meta.db_table, "wind_analysis_jobs")
        self.assertIn("WIND_RESOURCE_ASSESSMENT", str(job))

        result = AnalysisResult.objects.create(
            job=job,
            result_time=timezone.now(),
            geom=Point(106.5, 19.5, srid=4326),
            metric_name="AEP_GWh",
            metric_value=125.4321,
        )
        self.assertEqual(result._meta.db_table, "wind_analysis_results")
        self.assertEqual(job.results.count(), 1)
        self.assertIn("AEP_GWh", str(result))

    def test_extreme_event_creation(self):
        job = AnalysisJob.objects.create(
            analysis_type="EXTREME_WIND_DETECTION",
            parameters={"threshold_ms": 25.0},
            status="SUCCESS",
        )
        start_time = timezone.now() - datetime.timedelta(hours=6)
        end_time = timezone.now()

        event = ExtremeEvent.objects.create(
            job=job,
            station=self.station,
            extreme_type="GALE",
            start_time=start_time,
            end_time=end_time,
            peak_value=32.5,
            threshold_used=25.0,
        )
        self.assertEqual(event._meta.db_table, "wind_extreme_events")
        self.assertEqual(event.station, self.station)
        self.assertEqual(float(event.peak_value), 32.5)
        self.assertIn("GALE", str(event))
        self.assertIn(str(self.station), str(event))


class WindEnergySerializerTest(TestCase):
    def setUp(self):
        self.dataset = Dataset.objects.create(
            code="OFFSHORE_TEST",
            name="Offshore Test Dataset",
            category="GRIDDED",
        )
        self.farm = WindFarm.objects.create(
            code="WF_NAM_DINH",
            name="Trang trại Nam Định",
            location_name="Nam Vịnh Bắc Bộ",
            status="OPERATING",
            total_capacity_mw=200.0,
            dataset=self.dataset,
        )
        self.turbine = WindTurbine.objects.create(
            farm=self.farm,
            point_id=5,
            geom=Point(106.8, 19.8, srid=4326),
            wind_speed_100m=8.5,
            wind_direction=45.0,
            sea_depth=42.0,
            predicted_power_mw=51.5,
            capacity_factor=35.8,
            status="OPERATIONAL",
        )
        self.station = Station.objects.create(
            station_code="WS_TEST",
            name="Trạm Test",
            geom=Point(106.8, 19.8, srid=4326),
        )

    def test_wind_turbine_serializer(self):
        serializer = WindTurbineSerializer(self.turbine)
        data = serializer.data
        self.assertEqual(data["point_id"], 5)
        self.assertEqual(data["farm"], self.farm.id)
        self.assertEqual(data["farm_code"], "WF_NAM_DINH")
        self.assertEqual(data["farm_name"], "Trang trại Nam Định")
        self.assertEqual(data["zone"], "Nam Vịnh Bắc Bộ")
        self.assertEqual(data["sea_depth"], 42.0)
        self.assertEqual(data["depth_m"], 42.0)
        self.assertEqual(data["predicted_power_mw"], 51.5)
        self.assertEqual(data["capacity_factor"], 35.8)
        self.assertEqual(data["status"], "OPERATIONAL")

    def test_wind_turbine_geo_serializer(self):
        serializer = WindTurbineGeoSerializer(self.turbine)
        data = serializer.data
        self.assertEqual(data["type"], "Feature")
        self.assertEqual(data["geometry"]["type"], "Point")
        self.assertEqual(data["geometry"]["coordinates"], [106.8, 19.8])
        props = data["properties"]
        self.assertEqual(props["point_id"], 5)
        self.assertEqual(props["farm_code"], "WF_NAM_DINH")
        self.assertEqual(props["depth_m"], 42.0)
        self.assertEqual(props["zone"], "Nam Vịnh Bắc Bộ")

    def test_wind_farm_serializer(self):
        serializer = WindFarmSerializer(self.farm)
        data = serializer.data
        self.assertEqual(data["code"], "WF_NAM_DINH")
        self.assertEqual(data["name"], "Trang trại Nam Định")
        self.assertEqual(data["turbine_count"], 1)
        self.assertEqual(data["dataset"], self.dataset.id)
        self.assertEqual(data["dataset_code"], "OFFSHORE_TEST")

    def test_wind_farm_detail_serializer(self):
        serializer = WindFarmDetailSerializer(self.farm)
        data = serializer.data
        self.assertIn("turbines", data)
        self.assertEqual(len(data["turbines"]), 1)
        self.assertEqual(data["turbines"][0]["point_id"], 5)

    def test_extreme_event_serializer(self):
        event = ExtremeEvent.objects.create(
            station=self.station,
            extreme_type="STORM",
            start_time=timezone.now(),
            peak_value=30.0,
            threshold_used=24.0,
        )
        serializer = ExtremeEventSerializer(event)
        data = serializer.data
        self.assertEqual(data["station_code"], "WS_TEST")
        self.assertEqual(data["station_name"], "Trạm Test")
        self.assertEqual(data["extreme_type"], "STORM")


@override_settings(ROOT_URLCONF="wind_energy.urls")
class WindEnergyViewSetApiTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.farm = WindFarm.objects.create(
            code="WF_VBB_01",
            name="Vịnh Bắc Bộ Farm 1",
            location_name="Bắc Vịnh Bắc Bộ",
            status="OPERATING",
            total_capacity_mw=120.0,
        )
        # Fixed turbine (<= 50m)
        self.turbine_fixed = WindTurbine.objects.create(
            farm=self.farm,
            point_id=1,
            geom=Point(106.2, 19.2, srid=4326),
            wind_speed_100m=7.5,
            wind_direction=10.0,
            sea_depth=30.0,
            predicted_power_mw=38.0,
            capacity_factor=30.0,
            status="OPERATIONAL",
        )
        # Floating turbine (> 50m)
        self.turbine_floating = WindTurbine.objects.create(
            farm=self.farm,
            point_id=2,
            geom=Point(107.5, 20.5, srid=4326),
            wind_speed_100m=9.0,
            wind_direction=25.0,
            sea_depth=65.0,
            predicted_power_mw=55.0,
            capacity_factor=38.0,
            status="PLANNED",
        )

    def test_wind_farm_list(self):
        response = self.client.get("/farms/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["code"], "WF_VBB_01")
        self.assertEqual(results[0]["turbine_count"], 2)

    def test_wind_farm_detail(self):
        response = self.client.get(f"/farms/{self.farm.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["code"], "WF_VBB_01")
        self.assertIn("turbines", response.data)
        self.assertEqual(len(response.data["turbines"]), 2)

    def test_wind_farm_turbines_action(self):
        response = self.client.get(f"/farms/{self.farm.id}/turbines/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

        # GeoJSON format
        response_geo = self.client.get(f"/farms/{self.farm.id}/turbines/?format=geojson")
        self.assertEqual(response_geo.status_code, status.HTTP_200_OK)
        self.assertEqual(response_geo.data["type"], "FeatureCollection")
        self.assertEqual(len(response_geo.data["features"]), 2)

    def test_wind_farm_map_action(self):
        response = self.client.get("/farms/map/?farm_code=WF_VBB_01")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["type"], "FeatureCollection")
        self.assertEqual(len(response.data["features"]), 2)

    def test_wind_turbine_list(self):
        response = self.client.get("/turbines/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_wind_turbine_filter_power(self):
        # minPower = 40 MW -> only turbine_floating (55 MW)
        response = self.client.get("/turbines/?minPower=40")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["point_id"], 2)

    def test_wind_turbine_filter_foundation(self):
        # fixed -> <= 50m
        response_fixed = self.client.get("/turbines/?foundationType=fixed")
        self.assertEqual(response_fixed.status_code, status.HTTP_200_OK)
        self.assertEqual(response_fixed.data["count"], 1)
        self.assertEqual(response_fixed.data["results"][0]["point_id"], 1)

        # floating -> > 50m
        response_floating = self.client.get("/turbines/?foundationType=floating")
        self.assertEqual(response_floating.status_code, status.HTTP_200_OK)
        self.assertEqual(response_floating.data["count"], 1)
        self.assertEqual(response_floating.data["results"][0]["point_id"], 2)

    def test_wind_turbine_filter_depth(self):
        response = self.client.get("/turbines/?maxDepth=40")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["point_id"], 1)

    def test_wind_turbine_filter_zone_and_search(self):
        response = self.client.get("/turbines/?zone=Bắc Vịnh Bắc Bộ")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

        # Search by point_id
        response_search = self.client.get("/turbines/?search=1")
        self.assertEqual(response_search.status_code, status.HTTP_200_OK)
        self.assertEqual(response_search.data["count"], 1)
        self.assertEqual(response_search.data["results"][0]["point_id"], 1)

    def test_wind_turbine_map_action(self):
        response = self.client.get("/turbines/map/?minPower=40")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["type"], "FeatureCollection")
        self.assertEqual(len(response.data["features"]), 1)
        self.assertEqual(response.data["features"][0]["properties"]["point_id"], 2)

    def test_wind_turbine_bbox_filter(self):
        # in_bbox=minLon,minLat,maxLon,maxLat
        response = self.client.get("/turbines/?in_bbox=106.0,19.0,106.5,19.5")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["point_id"], 1)
