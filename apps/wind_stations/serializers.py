from django.contrib.gis.geos import Point
from rest_framework import serializers
from rest_framework_gis.fields import GeometryField
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import Station
from .services.observation_lake_service import get_latest_observation


class StationSerializer(serializers.ModelSerializer):
    latest_observation = serializers.SerializerMethodField()
    lat = serializers.FloatField(required=False)
    lon = serializers.FloatField(required=False)
    geom = GeometryField(required=False)

    class Meta:
        model = Station
        fields = [
            "id",
            "station_code",
            "name",
            "elevation",
            "station_type",
            "is_active",
            "geom",
            "lat",
            "lon",
            "latest_observation",
        ]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["lat"] = instance.geom.y if instance.geom else None
        ret["lon"] = instance.geom.x if instance.geom else None
        return ret

    def create(self, validated_data):
        lat = validated_data.pop("lat", None)
        lon = validated_data.pop("lon", None)

        code = validated_data.pop("station_code", None)
        if code is not None:
            code = code.replace(" ", "_").replace("/", "_").strip()
            validated_data["station_code"] = code

        if "geom" not in validated_data and lat is not None and lon is not None:
            validated_data["geom"] = Point(float(lon), float(lat), srid=4326)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        lat = validated_data.pop("lat", None)
        lon = validated_data.pop("lon", None)

        code = validated_data.pop("station_code", None)
        if code is not None:
            code = code.replace(" ", "_").replace("/", "_").strip()
            validated_data["station_code"] = code

        if lat is not None and lon is not None:
            validated_data["geom"] = Point(float(lon), float(lat), srid=4326)
        return super().update(instance, validated_data)

    def get_latest_observation(self, obj):
        return get_latest_observation(obj.station_code)

    def get_lat(self, obj):
        return obj.geom.y if obj.geom else None

    def get_lon(self, obj):
        return obj.geom.x if obj.geom else None



class StationGeoSerializer(GeoFeatureModelSerializer):
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
            "latest_observation",
        ]

    def get_latest_observation(self, obj):
        return get_latest_observation(obj.station_code)
