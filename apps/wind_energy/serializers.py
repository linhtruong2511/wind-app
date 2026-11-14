from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import (
    AnalysisJob,
    AnalysisResult,
    ExtremeEvent,
    WindFarm,
    WindTurbine,
)


class WindTurbineSerializer(serializers.ModelSerializer):
    farm_code = serializers.CharField(source="farm.code", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    zone = serializers.CharField(source="farm.location_name", read_only=True)
    depth_m = serializers.FloatField(source="sea_depth", read_only=True)

    class Meta:
        model = WindTurbine
        fields = [
            "id",
            "farm",
            "farm_code",
            "farm_name",
            "point_id",
            "latitude",
            "longitude",
            "wind_speed_100m",
            "wind_direction",
            "sea_depth",
            "depth_m",
            "predicted_power_mw",
            "capacity_factor",
            "zone",
            "status",
            "created_at",
            "updated_at",
        ]


class WindTurbineGeoSerializer(GeoFeatureModelSerializer):
    farm_code = serializers.CharField(source="farm.code", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    zone = serializers.CharField(source="farm.location_name", read_only=True)
    depth_m = serializers.FloatField(source="sea_depth", read_only=True)

    class Meta:
        model = WindTurbine
        geo_field = "geom"
        fields = [
            "id",
            "farm",
            "farm_code",
            "farm_name",
            "point_id",
            "latitude",
            "longitude",
            "wind_speed_100m",
            "wind_direction",
            "sea_depth",
            "depth_m",
            "predicted_power_mw",
            "capacity_factor",
            "zone",
            "status",
        ]


class WindFarmSerializer(serializers.ModelSerializer):
    turbine_count = serializers.IntegerField(source="turbines.count", read_only=True)
    dataset_code = serializers.CharField(source="dataset.code", read_only=True)

    class Meta:
        model = WindFarm
        fields = [
            "id",
            "code",
            "name",
            "description",
            "location_name",
            "status",
            "total_capacity_mw",
            "dataset",
            "dataset_code",
            "turbine_count",
            "created_at",
            "updated_at",
        ]


class WindFarmDetailSerializer(WindFarmSerializer):
    turbines = WindTurbineSerializer(many=True, read_only=True)

    class Meta(WindFarmSerializer.Meta):
        fields = WindFarmSerializer.Meta.fields + ["turbines"]


class AnalysisResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnalysisResult
        fields = "__all__"


class AnalysisJobSerializer(serializers.ModelSerializer):
    results = AnalysisResultSerializer(many=True, read_only=True)

    class Meta:
        model = AnalysisJob
        fields = "__all__"


class ExtremeEventSerializer(serializers.ModelSerializer):
    station_code = serializers.CharField(source="station.station_code", read_only=True)
    station_name = serializers.CharField(source="station.name", read_only=True)

    class Meta:
        model = ExtremeEvent
        fields = [
            "id",
            "job",
            "station",
            "station_code",
            "station_name",
            "extreme_type",
            "start_time",
            "end_time",
            "peak_value",
            "threshold_used",
        ]
