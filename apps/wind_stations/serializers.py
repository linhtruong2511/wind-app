from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import Observation, Station


class ObservationSerializer(serializers.ModelSerializer):
    station_code = serializers.CharField(source="station.station_code", read_only=True)

    class Meta:
        model = Observation
        fields = [
            "id",
            "station",
            "station_code",
            "obs_time",
            "rain_06h",
            "rain_24h",
            "temp_2m",
            "temp_min",
            "temp_max",
            "humidity",
            "pressure",
            "wind_dir",
            "wind_speed",
        ]


class StationSerializer(serializers.ModelSerializer):
    dataset_code = serializers.CharField(source="dataset.code", read_only=True)
    latest_observation = serializers.SerializerMethodField()
    lat = serializers.SerializerMethodField()
    lon = serializers.SerializerMethodField()

    class Meta:
        model = Station
        fields = [
            "id",
            "station_code",
            "name",
            "elevation",
            "station_type",
            "is_active",
            "dataset_code",
            "lat",
            "lon",
            "latest_observation",
        ]

    def get_latest_observation(self, obj):
        latest = obj.observations.order_by("-obs_time").first()
        if latest:
            return ObservationSerializer(latest).data
        return None

    def get_lat(self, obj):
        return obj.geom.y if obj.geom else None

    def get_lon(self, obj):
        return obj.geom.x if obj.geom else None


class StationGeoSerializer(GeoFeatureModelSerializer):
    dataset_code = serializers.CharField(source="dataset.code", read_only=True)
    latest_observation = serializers.SerializerMethodField()

    class Meta:
        model = Station
        geo_field = "geom"
        fields = [
            "id",
            "station_code",
            "name",
            "elevation",
            "station_type",
            "is_active",
            "dataset_code",
            "latest_observation",
        ]

    def get_latest_observation(self, obj):
        latest = obj.observations.order_by("-obs_time").first()
        if latest:
            return ObservationSerializer(latest).data
        return None
