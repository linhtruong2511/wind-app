"""
URL configuration for wind project.
"""

from django.contrib import admin
from django.urls import path, re_path, include
from src.geonode_project.views import WindAppPortalView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("wind-app/", WindAppPortalView.as_view(), name="wind_app_portal"),
    re_path(r"^wind-app/.*$", WindAppPortalView.as_view(), name="wind_app_portal_subpath"),
    re_path(r"^wind/app/.*$", WindAppPortalView.as_view(), name="wind_app_portal_alias"),
    path("api/", include("wind_core.urls")),
    path("api/stations", include("wind_stations.urls")),
]
