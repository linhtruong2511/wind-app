"""
URL configuration for wind project.
"""

from django.contrib import admin
from django.urls import include, path, re_path

from configs.api_router import router
from src.geonode_project.views import WindAppPortalView
from wind_stations.views import ProvinceWFSFallbackView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("wind-app/", WindAppPortalView.as_view(), name="wind_app_portal"),
    re_path(r"^wind-app/.*$", WindAppPortalView.as_view(), name="wind_app_portal_subpath"),
    re_path(r"^wind/app/.*$", WindAppPortalView.as_view(), name="wind_app_portal_alias"),

    # Central API Gateway - Primary frontend route
    path("wind/api/v1/", include(router.urls)),

    # Backward compatibility and API versioning aliases
    path("api/v1/wind/", include(router.urls)),
    path("api/v2/wind/", include(router.urls)),
    path("api/", include(router.urls)),

    # GeoServer WFS fallback endpoint for Vietnam province GeoJSON boundaries
    re_path(r"^geoserver/geonode/ows", ProvinceWFSFallbackView.as_view(), name="province_wfs_fallback"),
]
