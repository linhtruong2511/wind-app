import re
from django.contrib.gis.geos import GEOSGeometry, Point
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
    depth_m = serializers.FloatField(source="sea_depth", required=False)
    capacity_mw = serializers.FloatField(source="predicted_power_mw", required=False)
    geom = serializers.CharField(required=False, write_only=True)

    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    wind_speed_100m = serializers.FloatField(required=False, default=8.0)
    wind_direction = serializers.FloatField(required=False, default=90.0)
    sea_depth = serializers.FloatField(required=False, default=15.0)
    predicted_power_mw = serializers.FloatField(required=False, default=4.0)
    capacity_factor = serializers.FloatField(required=False, default=40.0)
    status = serializers.CharField(required=False, default="OPERATIONAL")

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
            "capacity_mw",
            "capacity_factor",
            "zone",
            "status",
            "geom",
            "created_at",
            "updated_at",
        ]

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)

        # 1. Map point_id if string (e.g. "TB_1234" -> 1234)
        raw_point_id = data.get("point_id")
        if raw_point_id is not None:
            if isinstance(raw_point_id, str):
                digits = re.findall(r"\d+", raw_point_id)
                if digits:
                    data["point_id"] = int("".join(digits))
                else:
                    data["point_id"] = 1
            elif not isinstance(raw_point_id, int):
                try:
                    data["point_id"] = int(raw_point_id)
                except (ValueError, TypeError):
                    data["point_id"] = 1

        # 2. Extract coordinates from geom if latitude/longitude missing
        geom_val = data.get("geom")
        if geom_val and (data.get("latitude") is None or data.get("longitude") is None):
            try:
                geom_str = str(geom_val)
                if ";" in geom_str:
                    geom_str = geom_str.split(";", 1)[1]
                p = GEOSGeometry(geom_str)
                data["longitude"] = round(p.x, 6)
                data["latitude"] = round(p.y, 6)
            except Exception:
                pass

        # 3. Map capacity_mw <-> predicted_power_mw
        if "capacity_mw" in data and "predicted_power_mw" not in data:
            data["predicted_power_mw"] = data["capacity_mw"]
        elif "predicted_power_mw" in data and "capacity_mw" not in data:
            data["capacity_mw"] = data["predicted_power_mw"]

        # 4. Map depth_m <-> sea_depth
        if "depth_m" in data and "sea_depth" not in data:
            data["sea_depth"] = data["depth_m"]

        # 5. Normalize status (OPERATING -> OPERATIONAL)
        status_val = str(data.get("status", "")).upper()
        if status_val in ["OPERATING", "OPERATIONAL"]:
            data["status"] = "OPERATIONAL"
        elif status_val in ["UNDER_CONSTRUCTION", "PLANNED", "PROPOSED", "INSTALLED"]:
            data["status"] = status_val
        else:
            data["status"] = "INSTALLED"

        return super().to_internal_value(data)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["capacity_mw"] = instance.predicted_power_mw
        ret["depth_m"] = instance.sea_depth
        return ret


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
