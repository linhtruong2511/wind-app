from django.apps import apps
from django.db.models.functions import TruncDay, TruncMonth, TruncYear
from django_filters import rest_framework as filters
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from wind_core.models import (
    AlertNotification,
    AlertRule,
    Dataset,
    DatasetAccessPolicy,
    DatasetVariable,
    DownloadRequest,
    IngestionLog,
    SystemMetric,
    UserQueryHistory,
)
from wind_core.serializers import (
    AlertNotificationSerializer,
    AlertRuleSerializer,
    DatasetAccessPolicySerializer,
    DatasetSerializer,
    DatasetVariableSerializer,
    DownloadRequestSerializer,
    IngestionLogSerializer,
    SystemMetricSerializer,
    UserQueryHistorySerializer,
)
from wind_core.utils import StandardResultsSetPagination


def get_raster_granule_model():
    try:
        return apps.get_model("wind_raster", "RasterGranuleIndex")
    except (LookupError, RuntimeError):
        return None


class DatasetViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Dataset.objects.filter(is_active=True).order_by("id")
    serializer_class = DatasetSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["category"]

    @action(detail=True, methods=["get"])
    def time_steps(self, request, pk=None):
        dataset = self.get_object()
        RasterGranuleIndex = get_raster_granule_model()
        if not RasterGranuleIndex:
            return Response({"time_steps": []})
        granules = (
            RasterGranuleIndex.objects.filter(dataset=dataset)
            .order_by("granule_time")
            .values_list("granule_time", flat=True)
            .distinct()
        )
        return Response({"time_steps": list(granules)})

    @action(detail=True, methods=["get"])
    def year_steps(self, request, pk=None):
        dataset = self.get_object()
        RasterGranuleIndex = get_raster_granule_model()
        if not RasterGranuleIndex:
            return Response({"year_steps": []})
        granules = (
            RasterGranuleIndex.objects.filter(dataset=dataset)
            .annotate(year=TruncYear("granule_time"))
            .order_by("year")
            .values_list("year", flat=True)
            .distinct()
        )
        return Response({"year_steps": list(granules)})

    @action(detail=True, methods=["get"])
    def month_steps(self, request, pk=None):
        dataset = self.get_object()
        RasterGranuleIndex = get_raster_granule_model()
        if not RasterGranuleIndex:
            return Response({"month_steps": []})
        granules = (
            RasterGranuleIndex.objects.filter(dataset=dataset)
            .annotate(month=TruncMonth("granule_time"))
            .order_by("month")
            .values_list("month", flat=True)
            .distinct()
        )
        return Response({"month_steps": list(granules)})

    @action(detail=True, methods=["get"])
    def day_steps(self, request, pk=None):
        dataset = self.get_object()
        RasterGranuleIndex = get_raster_granule_model()
        if not RasterGranuleIndex:
            return Response({"day_steps": []})
        granules = (
            RasterGranuleIndex.objects.filter(dataset=dataset)
            .annotate(day=TruncDay("granule_time"))
            .order_by("day")
            .values_list("day", flat=True)
            .distinct()
        )
        return Response({"day_steps": list(granules)})

    @action(detail=True, methods=["get"])
    def get_variables(self, request, pk=None):
        dataset = self.get_object()
        variables = dataset.variables.order_by("variable_code")
        is_component = request.query_params.get("is_component")
        if is_component is not None:
            variables = variables.filter(is_component=is_component.lower() in ("1", "true"))
        return Response({"variables": DatasetVariableSerializer(variables, many=True).data})
