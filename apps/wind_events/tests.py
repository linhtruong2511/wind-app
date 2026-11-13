import datetime
from django.contrib.gis.geos import Point, Polygon
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from wind_core.models import Dataset
from wind_events.models import EventTrack, MeteorologicalEvent
from wind_events.serializers import (
    EventTrackSerializer,
    MeteorologicalEventSerializer,
)
from wind_stations.models import Observation, Station


class MeteorologicalEventModelTest(TestCase):
    def setUp(self):
        self.polygon = Polygon(
            (
                (105.0, 18.0),
                (110.0, 18.0),
                (110.0, 22.0),
                (105.0, 22.0),
                (105.0, 18.0),
            )
        )
        self.start_date = timezone.now() - datetime.timedelta(days=2)
        self.end_date = timezone.now()

        self.event = MeteorologicalEvent.objects.create(
            event_name="Bão Yagi",
            event_type="TYPHOON",
            start_date=self.start_date,
            end_date=self.end_date,
            influence_area=self.polygon,
            max_intensity="Cấp 14",
        )

    def test_meteorological_event_creation_and_str(self):
        self.assertEqual(str(self.event), "Bão Yagi")
        self.assertEqual(
            MeteorologicalEvent._meta.db_table, "wind_meteorological_events"
        )
        self.assertEqual(self.event.event_type, "TYPHOON")
        self.assertEqual(self.event.max_intensity, "Cấp 14")
        self.assertEqual(self.event.influence_area.geom_type, "Polygon")

    def test_event_track_creation_and_str(self):
        track_time = self.start_date + datetime.timedelta(hours=6)
        track = EventTrack.objects.create(
            event=self.event,
            track_time=track_time,
            geom=Point(107.5, 19.5),
            intensity="Cấp 12",
            central_pressure=965.5,
            moving_speed_kmh=25.0,
            moving_direction=295.0,
        )

        self.assertEqual(str(track), f"Bão Yagi @ {track_time}")
        self.assertEqual(EventTrack._meta.db_table, "wind_event_tracks")
        self.assertEqual(self.event.tracks.count(), 1)
        self.assertEqual(self.event.tracks.first().intensity, "Cấp 12")
        self.assertEqual(track.geom.geom_type, "Point")


class MeteorologicalEventSerializerTest(TestCase):
    def setUp(self):
        self.polygon = Polygon(
            (
                (105.0, 18.0),
                (110.0, 18.0),
                (110.0, 22.0),
                (105.0, 22.0),
                (105.0, 18.0),
            )
        )
        self.start_date = timezone.now() - datetime.timedelta(days=1)
        self.end_date = timezone.now()

        self.event = MeteorologicalEvent.objects.create(
            event_name="Bão Son Tinh",
            event_type="TYPHOON",
            start_date=self.start_date,
            end_date=self.end_date,
            influence_area=self.polygon,
            max_intensity="Cấp 11",
        )

        self.track = EventTrack.objects.create(
            event=self.event,
            track_time=self.start_date + datetime.timedelta(hours=4),
            geom=Point(108.0, 19.0),
            intensity="Cấp 10",
            central_pressure=980.0,
            moving_speed_kmh=20.0,
            moving_direction=280.0,
        )

    def test_event_track_serializer(self):
        serializer = EventTrackSerializer(self.track)
        data = serializer.data
        self.assertEqual(data["type"], "Feature")
        self.assertEqual(data["geometry"]["type"], "Point")
        self.assertEqual(data["geometry"]["coordinates"], [108.0, 19.0])
        self.assertEqual(data["properties"]["intensity"], "Cấp 10")
        self.assertEqual(data["properties"]["central_pressure"], "980.00")
        self.assertEqual(data["properties"]["moving_speed_kmh"], "20.00")
        self.assertEqual(data["properties"]["moving_direction"], "280.0")

    def test_meteorological_event_serializer(self):
        serializer = MeteorologicalEventSerializer(self.event)
        data = serializer.data
        self.assertEqual(data["type"], "Feature")
        self.assertEqual(data["geometry"]["type"], "Polygon")
        self.assertEqual(data["properties"]["event_name"], "Bão Son Tinh")
        self.assertEqual(data["properties"]["event_type"], "TYPHOON")
        self.assertEqual(data["properties"]["max_intensity"], "Cấp 11")
        self.assertIn("tracks", data["properties"])
        tracks_data = data["properties"]["tracks"]
        self.assertEqual(tracks_data["type"], "FeatureCollection")
        self.assertEqual(len(tracks_data["features"]), 1)
        track_data = tracks_data["features"][0]
        self.assertEqual(track_data["type"], "Feature")
        self.assertEqual(track_data["geometry"]["coordinates"], [108.0, 19.0])

    def test_meteorological_event_serializer_without_geometry(self):
        event_no_geom = MeteorologicalEvent.objects.create(
            event_name="Không khí lạnh tăng cường",
            event_type="COLD_SURGE",
            start_date=self.start_date,
            end_date=self.end_date,
        )
        serializer = MeteorologicalEventSerializer(event_no_geom)
        data = serializer.data
        self.assertEqual(data["type"], "Feature")
        self.assertIsNone(data["geometry"])
        self.assertEqual(
            data["properties"]["event_name"], "Không khí lạnh tăng cường"
        )


@override_settings(ROOT_URLCONF="wind_events.urls")
class MeteorologicalEventViewSetApiTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.polygon = Polygon(
            (
                (106.0, 19.0),
                (109.0, 19.0),
                (109.0, 21.0),
                (106.0, 21.0),
                (106.0, 19.0),
            )
        )
        self.now = timezone.now()
        self.start_date = self.now - datetime.timedelta(days=2)
        self.end_date = self.now - datetime.timedelta(days=1)

        self.event1 = MeteorologicalEvent.objects.create(
            event_name="Bão Prapiroon",
            event_type="TYPHOON",
            start_date=self.start_date,
            end_date=self.end_date,
            influence_area=self.polygon,
            max_intensity="Cấp 10",
        )

        self.event2 = MeteorologicalEvent.objects.create(
            event_name="KKL Đợt 1",
            event_type="COLD_SURGE",
            start_date=self.now - datetime.timedelta(days=5),
            end_date=self.now - datetime.timedelta(days=4),
            influence_area=self.polygon,
            max_intensity="Cấp 6",
        )

        self.track1 = EventTrack.objects.create(
            event=self.event1,
            track_time=self.start_date + datetime.timedelta(hours=6),
            geom=Point(107.5, 20.0),
            intensity="Cấp 9",
            central_pressure=985.0,
            moving_speed_kmh=15.0,
            moving_direction=300.0,
        )

        # Setup stations:
        # Station 1 inside polygon (107.72, 20.13)
        self.dataset = Dataset.objects.create(
            code="SYNOP_TEST", name="Synoptic Stations", category="STATION"
        )
        self.station_inside = Station.objects.create(
            dataset=self.dataset,
            station_code="48838",
            name="Trạm Bạch Long Vĩ",
            geom=Point(107.72, 20.13),
            station_type="SYNOP",
            is_active=True,
        )
        # Station 2 outside polygon (108.20, 16.05) - Da Nang
        self.station_outside = Station.objects.create(
            dataset=self.dataset,
            station_code="48855",
            name="Trạm Đà Nẵng",
            geom=Point(108.20, 16.05),
            station_type="SYNOP",
            is_active=True,
        )

        # Observations for Station 1 (inside)
        # Obs 1: inside time range -> SHOULD BE INCLUDED
        self.obs_valid = Observation.objects.create(
            station=self.station_inside,
            obs_time=self.start_date + datetime.timedelta(hours=12),
            wind_speed=22.5,
            wind_dir=80.0,
            temp_2m=24.0,
            pressure=990.0,
            rain_24h=50.0,
        )
        # Obs 2: before start_date -> SHOULD BE EXCLUDED
        self.obs_before = Observation.objects.create(
            station=self.station_inside,
            obs_time=self.start_date - datetime.timedelta(hours=2),
            wind_speed=8.0,
            wind_dir=90.0,
            temp_2m=28.0,
            pressure=1008.0,
            rain_24h=0.0,
        )
        # Obs 3: after end_date -> SHOULD BE EXCLUDED
        self.obs_after = Observation.objects.create(
            station=self.station_inside,
            obs_time=self.end_date + datetime.timedelta(hours=2),
            wind_speed=9.0,
            wind_dir=100.0,
            temp_2m=27.0,
            pressure=1006.0,
            rain_24h=5.0,
        )

        # Observations for Station 2 (outside)
        # Obs 4: within time range, but outside polygon -> SHOULD BE EXCLUDED
        self.obs_outside_geom = Observation.objects.create(
            station=self.station_outside,
            obs_time=self.start_date + datetime.timedelta(hours=12),
            wind_speed=5.0,
            wind_dir=120.0,
            temp_2m=30.0,
            pressure=1010.0,
            rain_24h=0.0,
        )

    def test_list_events(self):
        res = self.client.get("/events/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data["count"], 2)
        results = data["results"]
        self.assertEqual(results["type"], "FeatureCollection")
        self.assertEqual(len(results["features"]), 2)

    def test_filter_events_by_type(self):
        res = self.client.get("/events/?event_type=TYPHOON")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data["count"], 1)
        results = data["results"]
        self.assertEqual(len(results["features"]), 1)
        self.assertEqual(
            results["features"][0]["properties"]["event_name"], "Bão Prapiroon"
        )

    def test_retrieve_event(self):
        res = self.client.get(f"/events/{self.event1.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data["type"], "Feature")
        self.assertEqual(data["properties"]["event_name"], "Bão Prapiroon")
        tracks_data = data["properties"]["tracks"]
        self.assertEqual(tracks_data["type"], "FeatureCollection")
        self.assertEqual(len(tracks_data["features"]), 1)

    def test_impacted_observations_action(self):
        res = self.client.get(f"/events/{self.event1.id}/impacted_observations/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        # Should be paginated response
        self.assertIn("results", data)
        self.assertEqual(data["count"], 1)
        results = data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], self.obs_valid.id)
        self.assertEqual(results[0]["station_code"], "48838")
        self.assertEqual(float(results[0]["wind_speed"]), 22.5)

    def test_impacted_observations_end_date_fallback_to_tracks(self):
        # Create event with end_date=None, but having a track
        event_no_end = MeteorologicalEvent.objects.create(
            event_name="Bão Đang Hoạt Động",
            event_type="TYPHOON",
            start_date=self.start_date,
            end_date=None,
            influence_area=self.polygon,
        )
        last_track_time = self.start_date + datetime.timedelta(hours=18)
        EventTrack.objects.create(
            event=event_no_end,
            track_time=last_track_time,
            geom=Point(107.0, 20.0),
        )

        res = self.client.get(
            f"/events/{event_no_end.id}/impacted_observations/"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        # obs_valid is at start_date + 12h <= last_track_time (start_date + 18h)
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["id"], self.obs_valid.id)

    def test_impacted_observations_missing_influence_area(self):
        event_no_geom = MeteorologicalEvent.objects.create(
            event_name="Sự kiện không tọa độ",
            event_type="OTHER",
            start_date=self.start_date,
            end_date=self.end_date,
            influence_area=None,
        )
        res = self.client.get(
            f"/events/{event_no_geom.id}/impacted_observations/"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", res.json())

    def test_impacted_observations_missing_start_date(self):
        event_no_start = MeteorologicalEvent.objects.create(
            event_name="Sự kiện không ngày bắt đầu",
            event_type="OTHER",
            start_date=None,
            end_date=self.end_date,
            influence_area=self.polygon,
        )
        res = self.client.get(
            f"/events/{event_no_start.id}/impacted_observations/"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", res.json())
