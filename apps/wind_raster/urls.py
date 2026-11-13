from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import RasterGranuleIndexViewSet

router = DefaultRouter()
router.register(r"raster-granules", RasterGranuleIndexViewSet, basename="raster-granule")

urlpatterns = [
    path("", include(router.urls)),
]
