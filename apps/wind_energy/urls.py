from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AnalysisJobViewSet,
    ExtremeEventViewSet,
    WindFarmViewSet,
    WindTurbineViewSet,
)

router = DefaultRouter()
router.register(r"farms", WindFarmViewSet, basename="windfarm")
router.register(r"turbines", WindTurbineViewSet, basename="windturbine")
router.register(r"analysis-jobs", AnalysisJobViewSet, basename="analysisjob")
router.register(r"extreme-events", ExtremeEventViewSet, basename="extremeevent")

urlpatterns = [
    path("", include(router.urls)),
]
