"""
Central API Router for Wind Management System.

Aggregates and registers ViewSets from all micro-apps into a unified DRF router:
- wind_core (datasets)
- wind_stations (stations, observations, statistics)
- wind_raster (raster granules)
- wind_events (extreme meteorological events)
- wind_energy (wind farms, wind turbines, analysis jobs, extreme events)
- wind_cds (CDS credentials, download jobs, job runs)
"""

from rest_framework.routers import DefaultRouter

from wind_cds.views import (
    CDSCredentialViewSet,
    CDSDownloadJobViewSet,
    CDSJobRunViewSet,
)
from wind_core.views import (
    DatasetAccessPolicyViewSet,
    DatasetVariableViewSet,
    DatasetViewSet,
    IngestionLogViewSet,
)
from wind_energy.views import (
    AnalysisJobViewSet,
    ExtremeEventViewSet,
    WindFarmViewSet,
    WindTurbineViewSet,
)
from wind_events.views import MeteorologicalEventViewSet
from wind_raster.views import RasterGranuleIndexViewSet
from wind_stations.views import (
    ObservationViewSet,
    StationViewSet,
    StatisticsViewSet,
)

router = DefaultRouter()

# wind_core micro-app
router.register(r"datasets", DatasetViewSet, basename="dataset")
router.register(r"dataset-variables", DatasetVariableViewSet, basename="dataset-variable")
router.register(r"dataset-access-policies", DatasetAccessPolicyViewSet, basename="dataset-access-policy")
router.register(r"ingestion-logs", IngestionLogViewSet, basename="ingestion-log")

# wind_stations micro-app
router.register(r"stations", StationViewSet, basename="station")
router.register(r"observations", ObservationViewSet, basename="observation")
router.register(r"statistics", StatisticsViewSet, basename="statistics")

# wind_events micro-app
router.register(r"events", MeteorologicalEventViewSet, basename="event")

# wind_raster micro-app
router.register(r"raster-granules", RasterGranuleIndexViewSet, basename="raster-granule")

# wind_energy micro-app
router.register(r"farms", WindFarmViewSet, basename="farm")
router.register(r"turbines", WindTurbineViewSet, basename="turbine")
router.register(r"analysis-jobs", AnalysisJobViewSet, basename="analysis-job")
router.register(r"extreme-events", ExtremeEventViewSet, basename="extreme-event")

# wind_cds micro-app
router.register(r"cds-credentials", CDSCredentialViewSet, basename="cds-credential")
router.register(r"cds-jobs", CDSDownloadJobViewSet, basename="cds-job")
router.register(r"cds-runs", CDSJobRunViewSet, basename="cds-run")

api_router = router
urlpatterns = router.urls
