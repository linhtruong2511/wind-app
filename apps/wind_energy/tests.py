import datetime
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point, Polygon
import csv
import io
import json
import os
import tempfile

import numpy as np
from django.core.cache import cache
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from wind_core.models import Dataset
from wind_energy import interpolation
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
            name="Điểm tua-bin #5",
            zone="Nam Vịnh Bắc Bộ",
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
            zone="Bắc Vịnh Bắc Bộ",
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
            zone="Bắc Vịnh Bắc Bộ",
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

    # ---- Loại móng, trường mới và ghi dữ liệu ----

    def test_foundation_type_derived_from_depth(self):
        self.turbine_fixed.refresh_from_db()
        self.turbine_floating.refresh_from_db()
        self.assertEqual(self.turbine_fixed.foundation_type, "FIXED")
        self.assertEqual(self.turbine_floating.foundation_type, "FLOATING")

    def test_turbine_list_returns_numeric_coordinates_and_display_fields(self):
        response = self.client.get("/turbines/?search=1")
        item = response.data["results"][0]
        self.assertIsInstance(item["latitude"], float)
        self.assertIsInstance(item["longitude"], float)
        self.assertEqual(item["zone"], "Bắc Vịnh Bắc Bộ")
        self.assertEqual(item["foundation_type_display"], "Móng cố định")

    def test_turbine_filter_by_zone_is_exact(self):
        self.assertEqual(self.client.get("/turbines/?zone=Nam Vịnh Bắc Bộ").data["count"], 0)
        self.assertEqual(self.client.get("/turbines/?zone=Bắc Vịnh Bắc Bộ").data["count"], 2)

    def test_turbine_create_requires_admin(self):
        payload = {
            "farm": self.farm.id,
            "point_id": "TB_77",
            "geom": "SRID=4326;POINT(106.9 19.9)",
            "capacity_mw": 4.0,
            "depth_m": 20.0,
        }
        self.assertIn(
            self.client.post("/turbines/", payload, format="json").status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
        admin = User.objects.create_superuser("admin_wind", "a@example.com", "pw12345!")
        self.client.force_authenticate(admin)
        response = self.client.post("/turbines/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["point_id"], 77)
        self.assertEqual(response.data["status"], "PROPOSED")
        self.assertEqual(response.data["foundation_type"], "FIXED")
        self.assertAlmostEqual(response.data["longitude"], 106.9)

    # ---- Xuất dữ liệu ----

    def test_export_csv_respects_filters(self):
        response = self.client.get("/turbines/export/?output=csv&minPower=40")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response["Content-Type"].startswith("text/csv"))
        self.assertIn("attachment", response["Content-Disposition"])
        text = response.content.decode("utf-8")
        self.assertTrue(text.startswith("﻿"))
        rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
        self.assertEqual(rows[0][:3], ["ma_trang_trai", "ten_trang_trai", "ma_tuabin"])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][2], "2")
        self.assertEqual(rows[1][10], "Móng nổi")

    def test_export_csv_is_not_paginated(self):
        response = self.client.get("/turbines/export/?page_size=1")
        rows = list(csv.reader(io.StringIO(response.content.decode("utf-8").lstrip("﻿"))))
        self.assertEqual(len(rows), 3)

    def test_export_geojson(self):
        response = self.client.get("/turbines/export/?output=geojson&foundationType=fixed")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("attachment", response["Content-Disposition"])
        data = json.loads(response.content)
        self.assertEqual(data["type"], "FeatureCollection")
        self.assertEqual(len(data["features"]), 1)
        self.assertEqual(data["features"][0]["properties"]["point_id"], 1)

    def test_export_rejects_unknown_output(self):
        self.assertEqual(
            self.client.get("/turbines/export/?output=xlsx").status_code, status.HTTP_400_BAD_REQUEST
        )


class InterpolationAlgorithmTest(SimpleTestCase):
    def setUp(self):
        # Hai điểm đo cách nhau 20 km theo trục x
        self.points = np.array([[0.0, 0.0], [20.0, 0.0]])
        self.values = np.array([10.0, 30.0])

    def test_idw_midpoint_is_average(self):
        z, nearest = interpolation.idw(np.array([[10.0, 0.0]]), self.points, self.values)
        self.assertAlmostEqual(z[0], 20.0)
        self.assertAlmostEqual(nearest[0], 10.0)

    def test_idw_returns_exact_value_at_sample_point(self):
        z, nearest = interpolation.idw(np.array([[0.0, 0.0], [20.0, 0.0]]), self.points, self.values)
        np.testing.assert_allclose(z, [10.0, 30.0])
        np.testing.assert_allclose(nearest, [0.0, 0.0])

    def test_idw_closer_point_has_more_weight(self):
        z, _ = interpolation.idw(np.array([[5.0, 0.0]]), self.points, self.values)
        self.assertLess(z[0], 20.0)
        self.assertGreater(z[0], 10.0)

    def test_kriging_returns_exact_value_at_sample_point(self):
        z, _ = interpolation.kriging(np.array([[0.0, 0.0], [20.0, 0.0]]), self.points, self.values)
        np.testing.assert_allclose(z, [10.0, 30.0])

    def test_kriging_constant_field_stays_constant(self):
        rng = np.random.default_rng(1)
        points = rng.uniform(0, 100, size=(30, 2))
        z, _ = interpolation.kriging(rng.uniform(0, 100, size=(50, 2)), points, np.full(30, 7.5))
        np.testing.assert_allclose(z, 7.5, atol=1e-6)

    def test_kriging_stays_within_reasonable_range(self):
        rng = np.random.default_rng(2)
        points = rng.uniform(0, 100, size=(40, 2))
        values = rng.uniform(5, 50, size=40)
        z, _ = interpolation.kriging(rng.uniform(0, 100, size=(60, 2)), points, values)
        self.assertTrue(np.all(np.isfinite(z)))
        self.assertGreaterEqual(z.min(), 0.0)

    def test_kriging_handles_duplicate_points(self):
        points = np.array([[0.0, 0.0], [0.0, 0.0], [30.0, 0.0], [0.0, 30.0]])
        values = np.array([5.0, 5.0, 15.0, 25.0])
        z, _ = interpolation.kriging(np.array([[10.0, 10.0]]), points, values)
        self.assertTrue(np.all(np.isfinite(z)))

    def test_kriging_uses_all_points_when_fewer_than_neighbors(self):
        z, _ = interpolation.kriging(np.array([[10.0, 0.0]]), self.points, self.values, neighbors=50)
        self.assertTrue(np.isfinite(z[0]))

    def test_chunked_result_matches_single_pass(self):
        rng = np.random.default_rng(3)
        points = rng.uniform(0, 100, size=(25, 2))
        values = rng.uniform(5, 50, size=25)
        targets = rng.uniform(0, 100, size=(40, 2))
        full, _ = interpolation.idw(targets, points, values)
        with override_chunk(60):
            chunked, _ = interpolation.idw(targets, points, values)
        np.testing.assert_allclose(full, chunked)

    def test_fade_alpha_decays_beyond_max_distance(self):
        alpha = interpolation.fade_alpha(
            np.array([0.0, 110.0, 110.0 + 39.0 / 2, 110.0 + 39.0, 500.0]), max_distance_km=110.0, fade_km=39.0
        )
        np.testing.assert_allclose(alpha, [1.0, 1.0, 0.5, 0.0, 0.0])

    def test_build_grid_shape_and_edges(self):
        data = np.array([[106.0, 19.0, 10.0], [107.0, 20.0, 30.0]])
        values, alphas = interpolation.build_grid(data, "idw", (105.5, 18.5, 107.5, 20.5), 6, 5)
        self.assertEqual(values.shape, (30,))
        self.assertEqual(alphas.shape, (30,))
        self.assertTrue(np.all((alphas >= 0) & (alphas <= 255)))


class override_chunk:
    """Đổi tạm số phần tử mỗi khối để kiểm tra việc tính theo khối."""

    def __init__(self, elements):
        self.elements = elements

    def __enter__(self):
        self.original = interpolation._CHUNK_ELEMENTS
        interpolation._CHUNK_ELEMENTS = self.elements

    def __exit__(self, *exc):
        interpolation._CHUNK_ELEMENTS = self.original


class WindTurbineInterpolationApiTest(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.farm = WindFarm.objects.create(
            code="WF_INTERP",
            name="Trang trại nội suy",
            location_name="Vịnh Bắc Bộ",
            status="OPERATING",
            total_capacity_mw=100.0,
        )
        samples = [
            (1, 106.2, 19.2, 7.5, 30.0, 38.0),
            (2, 107.5, 20.5, 9.0, 65.0, 55.0),
            (3, 106.2, 20.5, 8.0, 45.0, 44.0),
            (4, 107.5, 19.2, 8.5, 55.0, 50.0),
        ]
        for point_id, lon, lat, wind, depth, power in samples:
            WindTurbine.objects.create(
                farm=self.farm,
                point_id=point_id,
                name=f"Điểm {point_id}",
                zone="Vịnh Bắc Bộ",
                geom=Point(lon, lat, srid=4326),
                wind_speed_100m=wind,
                sea_depth=depth,
                predicted_power_mw=power,
            )

    def _grid(self, **params):
        return self.client.get("/turbines/interpolation/grid/", params)

    def _point(self, **params):
        return self.client.get("/turbines/interpolation/point/", params)

    def test_grid_returns_flat_values_and_default_bbox(self):
        response = self._grid(method="idw", width=10, height=8)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data["method"], "idw")
        self.assertEqual(data["metric"], "predicted_power_mw")
        self.assertEqual((data["width"], data["height"]), (10, 8))
        self.assertEqual(len(data["values"]), 80)
        self.assertEqual(len(data["alphas"]), 80)
        self.assertEqual(data["point_count"], 4)
        # Phạm vi dữ liệu cộng vùng đệm 0,15 độ
        self.assertEqual(data["bbox"], [106.2 - 0.15, 19.2 - 0.15, 107.5 + 0.15, 20.5 + 0.15])
        self.assertTrue(all(v is not None for v in data["values"]))
        self.assertTrue(all(0 <= v <= 255 for v in data["alphas"]))

    def test_grid_kriging_and_other_metrics(self):
        for metric in ("predicted_power_mw", "wind_speed_100m", "depth_m"):
            response = self._grid(method="kriging", metric=metric, width=6, height=6)
            self.assertEqual(response.status_code, status.HTTP_200_OK, metric)
            self.assertEqual(response.data["metric"], metric)
            self.assertTrue(all(v is None or np.isfinite(v) for v in response.data["values"]))

    def test_grid_corners_match_sample_values(self):
        response = self._grid(method="idw", width=2, height=2, bbox="106.2,19.2,107.5,20.5")
        # Thứ tự: tây bắc, đông bắc, tây nam, đông nam
        self.assertEqual(response.data["values"], [44.0, 55.0, 38.0, 50.0])

    def test_grid_respects_filters(self):
        response = self._grid(method="idw", width=4, height=4, minPower=50)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["point_count"], 2)

    def test_grid_skips_turbines_missing_the_metric(self):
        WindTurbine.objects.filter(point_id=1).update(wind_speed_100m=None)
        response = self._grid(method="idw", metric="wind_speed_100m", width=4, height=4)
        self.assertEqual(response.data["point_count"], 3)

    def test_grid_rejects_invalid_parameters(self):
        self.assertEqual(self._grid(method="spline").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._grid(metric="unknown").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._grid(width=1000).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._grid(width="abc").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._grid(bbox="1,2,3").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._grid(bbox="107,20,106,19").status_code, status.HTTP_400_BAD_REQUEST)

    def test_grid_without_matching_turbines_returns_404(self):
        self.assertEqual(self._grid(minPower=999).status_code, status.HTTP_404_NOT_FOUND)

    def test_grid_is_cached_and_refreshes_when_data_changes(self):
        first = self._grid(method="idw", width=4, height=4)
        self.assertEqual(first.data["point_count"], 4)
        with self.assertNumQueries(1):  # chỉ truy vấn thống kê để tạo khóa bộ nhớ đệm
            cached = self._grid(method="idw", width=4, height=4)
        self.assertEqual(cached.data, first.data)

        WindTurbine.objects.create(
            farm=self.farm,
            point_id=5,
            geom=Point(106.8, 19.8, srid=4326),
            sea_depth=40.0,
            predicted_power_mw=20.0,
        )
        refreshed = self._grid(method="idw", width=4, height=4)
        self.assertEqual(refreshed.data["point_count"], 5)

    def test_point_at_sample_location_returns_sample_values(self):
        response = self._point(method="idw", lon=106.2, lat=19.2)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["available"])
        self.assertEqual(response.data["predicted_power_mw"], 38.0)
        self.assertEqual(response.data["wind_speed_100m"], 7.5)
        self.assertEqual(response.data["depth_m"], 30.0)
        self.assertEqual(response.data["closest_point"]["point_id"], 1)
        self.assertEqual(response.data["closest_distance_km"], 0.0)

    def test_point_at_center_is_average_for_symmetric_layout(self):
        response = self._point(method="idw", lon=106.85, lat=19.85)
        self.assertAlmostEqual(response.data["predicted_power_mw"], 46.75, places=1)

    def test_point_matches_grid_cell(self):
        for method in ("idw", "kriging"):
            grid = self._grid(method=method, width=5, height=5, bbox="106.0,19.0,107.7,20.7").data
            min_lon, min_lat, max_lon, max_lat = grid["bbox"]
            for row, col in ((1, 1), (2, 3), (3, 2)):
                lon = min_lon + col * (max_lon - min_lon) / 4
                lat = max_lat - row * (max_lat - min_lat) / 4
                point = self._point(method=method, lon=lon, lat=lat).data
                self.assertAlmostEqual(grid["values"][row * 5 + col], point["predicted_power_mw"], places=2)

    def test_point_far_from_data_is_unavailable(self):
        response = self._point(method="idw", lon=100.0, lat=10.0)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["available"])

    def test_point_respects_filters(self):
        response = self._point(method="idw", lon=106.2, lat=19.2, minPower=50)
        self.assertTrue(response.data["available"])
        # Chỉ còn điểm 2 và điểm 4 sau khi lọc; điểm 4 gần toạ độ hỏi hơn
        self.assertEqual(response.data["closest_point"]["point_id"], 4)

    def test_point_rejects_invalid_parameters(self):
        self.assertEqual(self._point(method="idw", lat=19.0).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._point(method="idw", lon="x", lat=19.0).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._point(method="idw", lon=500, lat=19.0).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._point(method="spline", lon=106, lat=19).status_code, status.HTTP_400_BAD_REQUEST)


class LoadWindTurbinesCommandTest(TestCase):
    def _write_fixture(self):
        items = [
            {"id": i, "point_id": i, "name": f"Điểm #{i}", "latitude": 19.0 + i / 10, "longitude": 106.0 + i / 10,
             "wind_speed_100m": 7.0, "wind_direction": 10.0, "depth_m": depth, "predicted_power_mw": power,
             "capacity_factor": 30.0, "zone": zone}
            for i, (zone, depth, power) in enumerate(
                [("Bắc Vịnh Bắc Bộ", 30.0, 40.0), ("Trung Vịnh Bắc Bộ", 60.0, 30.0), ("Nam Vịnh Bắc Bộ", 20.0, 20.0)],
                start=1,
            )
        ]
        handle, path = tempfile.mkstemp(suffix=".json")
        with os.fdopen(handle, "w", encoding="utf-8") as fh:
            json.dump(items, fh)
        self.addCleanup(os.remove, path)
        return path

    def test_load_creates_farms_per_zone_and_is_idempotent(self):
        path = self._write_fixture()
        call_command("load_wind_turbines", file=path, stdout=io.StringIO())
        call_command("load_wind_turbines", file=path, stdout=io.StringIO())
        self.assertEqual(WindFarm.objects.filter(code__startswith="VBB_").count(), 3)
        self.assertEqual(WindTurbine.objects.count(), 3)
        farm = WindFarm.objects.get(code="VBB_TRUNG")
        self.assertEqual(float(farm.total_capacity_mw), 30.0)
        self.assertEqual(farm.turbines.get().foundation_type, "FLOATING")

    def test_turbine_create_keeps_explicit_floating_foundation_with_zero_depth(self):
        admin = User.objects.create_superuser("admin_found", "f@example.com", "pw12345!")
        self.client.force_authenticate(admin)
        response = self.client.post(
            "/turbines/",
            {
                "farm": self.farm.id,
                "point_id": 88,
                "geom": "SRID=4326;POINT(106.9 19.9)",
                "capacity_mw": 5.0,
                "depth_m": 0,
                "foundation_type": "FLOATING",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["foundation_type"], "FLOATING")
        self.assertEqual(response.data["depth_m"], 0.0)
        self.assertEqual(self.client.get("/turbines/?foundationType=floating").data["count"], 2)
