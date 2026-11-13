from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import EventTrack, MeteorologicalEvent


class EventTrackSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = EventTrack
        geo_field = "geom"
        fields = [
            "id",
            "track_time",
            "intensity",
            "central_pressure",
            "moving_speed_kmh",
            "moving_direction",
        ]


class MeteorologicalEventSerializer(GeoFeatureModelSerializer):
    tracks = EventTrackSerializer(many=True, read_only=True)

    class Meta:
        model = MeteorologicalEvent
        geo_field = "influence_area"
        fields = [
            "id",
            "event_name",
            "event_type",
            "start_date",
            "end_date",
            "max_intensity",
            "tracks",
        ]
