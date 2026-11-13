from django.contrib.gis import admin
from .models import RasterGranuleIndex


@admin.register(RasterGranuleIndex)
class RasterGranuleIndexAdmin(admin.GISModelAdmin):
    list_display = (
        "id",
        "dataset",
        "granule_time",
        "elevation",
        "variable_code",
        "file_location",
    )
    list_filter = ("dataset", "variable_code", "granule_time")
    search_fields = ("dataset__name", "dataset__code", "file_location")
    ordering = ("-granule_time",)
