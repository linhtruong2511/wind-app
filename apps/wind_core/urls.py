from django.urls import include, path
from rest_framework.routers import DefaultRouter

from wind_core.views import DatasetViewSet

router = DefaultRouter()
router.register(r"datasets", DatasetViewSet, basename="dataset")

urlpatterns = [
    path("", include(router.urls)),
]
