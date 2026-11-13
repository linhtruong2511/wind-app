from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import RasterGranuleIndex


class RasterGranuleIndexSerializer(serializers.ModelSerializer):
    dataset_code = serializers.CharField(source="dataset.code", read_only=True)
    dataset_name = serializers.CharField(source="dataset.name", read_only=True)

    class Meta:
        model = RasterGranuleIndex
        fields = [
            "id",
            "dataset",
            "dataset_code",
            "dataset_name",
            "file_location",
            "granule_time",
            "elevation",
            "footprint",
            "variable_code",
        ]


class RasterGranuleIndexGeoSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = RasterGranuleIndex
        geo_field = "footprint"
        fields = [
            "id",
            "dataset",
            "file_location",
            "granule_time",
            "elevation",
            "variable_code",
        ]
