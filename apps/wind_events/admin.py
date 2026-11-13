from django.contrib import admin
from django.contrib.gis import admin as gis_admin

from .models import EventTrack, MeteorologicalEvent


class EventTrackInline(gis_admin.TabularInline):
    model = EventTrack
    extra = 0


@admin.register(MeteorologicalEvent)
class MeteorologicalEventAdmin(gis_admin.GISModelAdmin):
    list_display = (
        "id",
        "event_name",
        "event_type",
        "start_date",
        "end_date",
        "max_intensity",
        "created_at",
    )
    list_filter = ("event_type", "start_date")
    search_fields = ("event_name", "max_intensity")
    inlines = [EventTrackInline]


@admin.register(EventTrack)
class EventTrackAdmin(gis_admin.GISModelAdmin):
    list_display = (
        "id",
        "event",
        "track_time",
        "intensity",
        "central_pressure",
        "moving_speed_kmh",
        "moving_direction",
    )
    list_filter = ("event", "track_time")
    search_fields = ("event__event_name", "intensity")
