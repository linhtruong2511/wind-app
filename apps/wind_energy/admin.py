from django.contrib import admin

from .models import (
    AnalysisJob,
    AnalysisResult,
    ExtremeEvent,
    WindFarm,
    WindTurbine,
)


@admin.register(WindFarm)
class WindFarmAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "name",
        "location_name",
        "status",
        "total_capacity_mw",
        "created_at",
    )
    list_filter = ("status", "location_name")
    search_fields = ("code", "name", "location_name")


@admin.register(WindTurbine)
class WindTurbineAdmin(admin.ModelAdmin):
    list_display = (
        "point_id",
        "farm",
        "latitude",
        "longitude",
        "wind_speed_100m",
        "sea_depth",
        "predicted_power_mw",
        "capacity_factor",
        "status",
    )
    list_filter = ("status", "farm")
    search_fields = ("point_id", "farm__code", "farm__name")


@admin.register(AnalysisJob)
class AnalysisJobAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "analysis_type",
        "status",
        "created_at",
        "finished_at",
    )
    list_filter = ("status", "analysis_type")
    search_fields = ("analysis_type", "error_message")


@admin.register(AnalysisResult)
class AnalysisResultAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "job",
        "result_time",
        "metric_name",
        "metric_value",
    )
    list_filter = ("metric_name",)
    search_fields = ("metric_name",)


@admin.register(ExtremeEvent)
class ExtremeEventAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "extreme_type",
        "station",
        "start_time",
        "end_time",
        "peak_value",
        "threshold_used",
    )
    list_filter = ("extreme_type", "station")
    search_fields = ("extreme_type", "station__station_code", "station__name")
