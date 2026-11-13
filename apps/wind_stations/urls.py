from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ObservationViewSet,
    ProvinceWFSFallbackView,
    StationViewSet,
    StatisticsViewSet,
)

router = DefaultRouter()
router.register(r"stations", StationViewSet, basename="station")
router.register(r"observations", ObservationViewSet, basename="observation")
router.register(r"statistics", StatisticsViewSet, basename="statistics")

urlpatterns = [
    path("", include(router.urls)),
    path("ows", ProvinceWFSFallbackView.as_view(), name="province_wfs_fallback"),
    path(
        "geoserver/geonode/ows",
        ProvinceWFSFallbackView.as_view(),
        name="geoserver_province_wfs_fallback",
    ),
]
