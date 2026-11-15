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


TURBINE_STATUS_ALIASES = {"OPERATING": "OPERATIONAL"}


class WindTurbineSerializer(serializers.ModelSerializer):
    farm_code = serializers.CharField(source="farm.code", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    depth_m = serializers.FloatField(source="sea_depth", required=False)
    capacity_mw = serializers.FloatField(source="predicted_power_mw", required=False)
    geom = serializers.CharField(required=False, write_only=True)

    latitude = serializers.FloatField(required=False)
    longitude = serializers.FloatField(required=False)
    foundation_type = serializers.ChoiceField(choices=WindTurbine.FOUNDATION_CHOICES, required=False)
    foundation_type_display = serializers.CharField(source="get_foundation_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = WindTurbine
        fields = [
            "id",
            "farm",
            "farm_code",
            "farm_name",
            "point_id",
            "name",
            "zone",
            "latitude",
            "longitude",
            "wind_speed_100m",
            "wind_direction",
            "sea_depth",
            "depth_m",
            "foundation_type",
            "foundation_type_display",
            "predicted_power_mw",
            "capacity_mw",
            "capacity_factor",
            "status",
            "status_display",
            "geom",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "sea_depth": {"required": False},
            "predicted_power_mw": {"required": False},
        }

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)

        # 1. Mã điểm dạng chuỗi (ví dụ "TB_1234") -> số 1234 (user: Tôi nghĩ là cái này không cần thiết đâu)
        # raw_point_id = data.get("point_id")
        # if isinstance(raw_point_id, str):
        #     digits = re.findall(r"\d+", raw_point_id)
        #     if digits:
        #         data["point_id"] = int("".join(digits))

        # 2. Lấy tọa độ từ geom (WKT/EWKT) nếu thiếu vĩ độ, kinh độ
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

        # 3. Ánh xạ tên trường thay thế
        if "capacity_mw" in data and "predicted_power_mw" not in data:
            data["predicted_power_mw"] = data["capacity_mw"]
        if "depth_m" in data and "sea_depth" not in data:
            data["sea_depth"] = data["depth_m"]

        # 4. Chuẩn hóa trạng thái (OPERATING -> OPERATIONAL)
        status_val = data.get("status")
        if status_val:
            status_val = str(status_val).upper()
            data["status"] = TURBINE_STATUS_ALIASES.get(status_val, status_val)

        return super().to_internal_value(data)

    def validate(self, attrs):
        if self.instance is None:
            missing = [f for f in ("sea_depth", "predicted_power_mw") if attrs.get(f) is None]
            if missing:
                raise serializers.ValidationError(
                    {f: "Trường này là bắt buộc." for f in missing}
                )
            if attrs.get("latitude") is None and attrs.get("longitude") is None and not attrs.get("geom"):
                raise serializers.ValidationError({"geom": "Cần cung cấp tọa độ."})
        return attrs

    def create(self, validated_data):
        geom_val = validated_data.pop("geom", None)
        if geom_val:
            geom_str = str(geom_val).split(";", 1)[-1]
            validated_data["geom"] = GEOSGeometry(geom_str, srid=4326)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("geom", None)
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["capacity_mw"] = instance.predicted_power_mw
        ret["depth_m"] = instance.sea_depth
        return ret


class WindTurbineGeoSerializer(GeoFeatureModelSerializer):
    farm_code = serializers.CharField(source="farm.code", read_only=True)
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    depth_m = serializers.FloatField(source="sea_depth", read_only=True)
    latitude = serializers.FloatField(read_only=True)
    longitude = serializers.FloatField(read_only=True)
    foundation_type_display = serializers.CharField(source="get_foundation_type_display", read_only=True)

    class Meta:
        model = WindTurbine
        geo_field = "geom"
        fields = [
            "id",
            "farm",
            "farm_code",
            "farm_name",
            "point_id",
            "name",
            "zone",
            "latitude",
            "longitude",
            "wind_speed_100m",
            "wind_direction",
            "sea_depth",
            "depth_m",
            "foundation_type",
            "foundation_type_display",
            "predicted_power_mw",
            "capacity_factor",
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
