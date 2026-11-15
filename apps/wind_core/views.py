from django.apps import apps
from django.contrib.auth.models import Group
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
    UserGroupSerializer,
    UserQueryHistorySerializer,
)
from wind_core.utils import IsAdminUserOrReadOnly, StandardResultsSetPagination


def get_raster_granule_model():
    try:
        return apps.get_model("wind_raster", "RasterGranuleIndex")
    except (LookupError, RuntimeError):
        return None


class DatasetViewSet(viewsets.ModelViewSet):
    queryset = Dataset.objects.filter(is_active=True).order_by("id")
    serializer_class = DatasetSerializer
    permission_classes = [IsAdminUserOrReadOnly]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["category"]

    def get_queryset(self):
        user = getattr(self.request, "user", None)
        is_staff = user and user.is_authenticated and (user.is_staff or user.is_superuser)
        include_all = str(self.request.query_params.get("all", "")).lower() in ("true", "1")
        if is_staff and include_all:
            return Dataset.objects.all().order_by("id")
        return super().get_queryset()

    @action(detail=False, methods=["get"], url_path="dashboard-stats", permission_classes=[permissions.IsAdminUser])
    def dashboard_stats(self, request):
        from wind_stations.models import Station, Observation
        from wind_raster.models import RasterGranuleIndex
        from wind_energy.models import WindFarm, WindTurbine
        from wind_cds.models import CDSDownloadJob
        from wind_core.models import IngestionLog

        data = {
            "total_stations": Station.objects.count(),
            "active_stations": Station.objects.filter(is_active=True).count(),
            "total_observations": Observation.objects.count(),
            "total_granules": RasterGranuleIndex.objects.count(),
            "total_farms": WindFarm.objects.count(),
            "total_turbines": WindTurbine.objects.count(),
            "active_cds_jobs": CDSDownloadJob.objects.filter(status="RUNNING").count(),
            "recent_logs": list(
                IngestionLog.objects.order_by("-started_at")[:8].values(
                    "id", "dataset__name", "source_file", "status", "records_processed", "error_message", "started_at"
                )
            ),
        }
        return Response(data)

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


class DatasetVariableViewSet(viewsets.ModelViewSet):
    queryset = DatasetVariable.objects.all().order_by("id")
    serializer_class = DatasetVariableSerializer
    permission_classes = [IsAdminUserOrReadOnly]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["dataset", "is_component"]


class DatasetAccessPolicyViewSet(viewsets.ModelViewSet):
    queryset = DatasetAccessPolicy.objects.all().order_by("id")
    serializer_class = DatasetAccessPolicySerializer
    permission_classes = [permissions.IsAdminUser]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["dataset", "group", "can_view", "can_query", "can_download"]


class UserGroupViewSet(viewsets.ReadOnlyModelViewSet):
    """Danh sách nhóm người dùng để chọn trong form phân quyền bộ dữ liệu."""

    queryset = Group.objects.all().order_by("name")
    serializer_class = UserGroupSerializer
    permission_classes = [permissions.IsAdminUser]
    pagination_class = None


class IngestionLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = IngestionLog.objects.all().order_by("-started_at")
    serializer_class = IngestionLogSerializer
    permission_classes = [IsAdminUserOrReadOnly]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["dataset", "status"]

