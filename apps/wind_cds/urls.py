from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CDSCredentialViewSet, CDSDownloadJobViewSet, CDSJobRunViewSet

router = DefaultRouter()
router.register(r"credentials", CDSCredentialViewSet, basename="cds-credential")
router.register(r"jobs", CDSDownloadJobViewSet, basename="cds-job")
router.register(r"runs", CDSJobRunViewSet, basename="cds-run")

urlpatterns = [
    path("", include(router.urls)),
]
