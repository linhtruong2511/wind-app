from django.contrib import admin
from django.contrib.gis import admin as gis_admin

from .models import Observation, Station


@admin.register(Station)
class StationAdmin(gis_admin.GISModelAdmin):
    list_display = (
        "station_code",
        "name",
        "dataset",
        "station_type",
        "elevation",
        "is_active",
    )
    list_filter = ("is_active", "station_type", "dataset")
    search_fields = ("station_code", "name")


@admin.register(Observation)
class ObservationAdmin(admin.ModelAdmin):
    list_display = (
        "station",
        "obs_time",
        "wind_speed",
        "wind_dir",
        "temp_2m",
        "humidity",
        "pressure",
    )
    list_filter = ("station", "obs_time")
    search_fields = ("station__station_code", "station__name")
    date_hierarchy = "obs_time"
