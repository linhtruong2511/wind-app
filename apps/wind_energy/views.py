from django.db.models import Q
from django_filters import rest_framework as django_filters
from rest_framework import filters as drf_filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.renderers import BrowsableAPIRenderer, JSONRenderer
from rest_framework.response import Response
from rest_framework_gis.filters import InBBoxFilter

from wind_core.utils import StandardResultsSetPagination
from .models import (
    AnalysisJob,
    AnalysisResult,
    ExtremeEvent,
    WindFarm,
    WindTurbine,
)
from .serializers import (
    AnalysisJobSerializer,
    AnalysisResultSerializer,
    ExtremeEventSerializer,
    WindFarmDetailSerializer,
    WindFarmSerializer,
    WindTurbineGeoSerializer,
    WindTurbineSerializer,
)


class GeoJSONRenderer(JSONRenderer):
    format = "geojson"
    media_type = "application/geo+json"


class WindEnergyPagination(StandardResultsSetPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 1000

    def get_page_size(self, request):
        if "pageSize" in request.query_params:
            try:
                return min(int(request.query_params["pageSize"]), self.max_page_size)
            except (ValueError, TypeError):
                pass
        return super().get_page_size(request)


class WindFarmViewSet(viewsets.ModelViewSet):
    """
    API ViewSet cho Trang trại gió (Wind Farm).
    """

    queryset = WindFarm.objects.all().order_by("id")
    serializer_class = WindFarmSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = WindEnergyPagination
    renderer_classes = [JSONRenderer, BrowsableAPIRenderer, GeoJSONRenderer]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        drf_filters.SearchFilter,
        drf_filters.OrderingFilter,
    ]
    filterset_fields = ["status", "code"]
    search_fields = ["code", "name", "location_name", "description"]
    ordering_fields = ["code", "name", "total_capacity_mw", "created_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return WindFarmDetailSerializer
        return WindFarmSerializer

    @action(detail=True, methods=["get"])
    def turbines(self, request, pk=None):
        """
        [GET] /api/energy/farms/{id}/turbines/
        Lấy danh sách tuabin thuộc trang trại gió này.
        """
        farm = self.get_object()
        turbines_qs = farm.turbines.all().order_by("point_id")

        format_param = request.query_params.get("format")
        geojson_param = request.query_params.get("geojson")
        as_geojson_param = request.query_params.get("as_geojson")
        output_param = request.query_params.get("output")

        if (
            format_param == "geojson"
            or geojson_param in ["true", "1", True]
            or as_geojson_param in ["true", "1", True]
            or output_param == "geojson"
        ):
            serializer = WindTurbineGeoSerializer(turbines_qs, many=True)
            return Response(serializer.data)

        page = self.paginate_queryset(turbines_qs)
        if page is not None:
            serializer = WindTurbineSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = WindTurbineSerializer(turbines_qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def map(self, request):
        """
        [GET] /api/energy/farms/map/
        Trả về GeoJSON FeatureCollection của các tuabin theo farm_code/farm_id hoặc toàn bộ.
        """
        farm_code = request.query_params.get("farm_code")
        farm_id = request.query_params.get("farm") or request.query_params.get("farm_id")

        turbines_qs = WindTurbine.objects.select_related("farm").all().order_by("point_id")
        if farm_code:
            turbines_qs = turbines_qs.filter(farm__code=farm_code)
        if farm_id:
            turbines_qs = turbines_qs.filter(farm_id=farm_id)

        serializer = WindTurbineGeoSerializer(turbines_qs, many=True)
        return Response(serializer.data)


class WindTurbineViewSet(viewsets.ModelViewSet):
    """
    API ViewSet cho Tuabin gió (Wind Turbine).
    Hỗ trợ lọc theo công suất, độ sâu, loại móng cố định/móng nổi, vùng biển, và không gian (BBox).
    """

    queryset = WindTurbine.objects.select_related("farm").all().order_by("id")
    serializer_class = WindTurbineSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = WindEnergyPagination
    renderer_classes = [JSONRenderer, BrowsableAPIRenderer, GeoJSONRenderer]
    bbox_filter_field = "geom"
    filter_backends = [
        django_filters.DjangoFilterBackend,
        InBBoxFilter,
        drf_filters.OrderingFilter,
    ]
    filterset_fields = ["farm", "status"]
    ordering_fields = [
        "point_id",
        "predicted_power_mw",
        "wind_speed_100m",
        "sea_depth",
        "capacity_factor",
    ]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        # 1. Tìm kiếm tổng hợp (mã điểm nếu số, hoặc tên trang trại, vùng biển, mã trang trại nếu chữ)
        search = params.get("search")
        if search:
            search_str = search.strip()
            if search_str.isdigit():
                qs = qs.filter(point_id=int(search_str))
            else:
                qs = qs.filter(
                    Q(farm__name__icontains=search_str)
                    | Q(farm__location_name__icontains=search_str)
                    | Q(farm__code__icontains=search_str)
                )

        # 2. Lọc theo trang trại
        farm_id = params.get("farm") or params.get("farm_id")
        if farm_id:
            qs = qs.filter(farm_id=farm_id)

        farm_code = params.get("farm_code")
        if farm_code:
            qs = qs.filter(farm__code=farm_code)

        # 3. Lọc theo công suất (minPower / min_power, maxPower / max_power)
        min_power = params.get("min_power") or params.get("minPower")
        if min_power is not None and min_power != "":
            try:
                qs = qs.filter(predicted_power_mw__gte=float(min_power))
            except (ValueError, TypeError):
                pass

        max_power = params.get("max_power") or params.get("maxPower")
        if max_power is not None and max_power != "":
            try:
                qs = qs.filter(predicted_power_mw__lte=float(max_power))
            except (ValueError, TypeError):
                pass

        # 4. Lọc theo độ sâu (maxDepth / max_depth, minDepth / min_depth)
        min_depth = params.get("min_depth") or params.get("minDepth")
        if min_depth is not None and min_depth != "":
            try:
                qs = qs.filter(sea_depth__gte=float(min_depth))
            except (ValueError, TypeError):
                pass

        max_depth = params.get("max_depth") or params.get("maxDepth")
        if max_depth is not None and max_depth != "":
            try:
                qs = qs.filter(sea_depth__lte=float(max_depth))
            except (ValueError, TypeError):
                pass

        # 5. Lọc theo loại móng (fixed: <= 50m, floating: > 50m)
        foundation_type = params.get("foundation_type") or params.get("foundationType")
        if foundation_type:
            ft = foundation_type.strip().lower()
            if ft == "fixed":
                qs = qs.filter(sea_depth__lte=50)
            elif ft == "floating":
                qs = qs.filter(sea_depth__gt=50)

        # 6. Lọc theo vùng biển (zone)
        zone = params.get("zone")
        if zone:
            qs = qs.filter(farm__location_name__icontains=zone.strip())

        return qs

    @action(detail=False, methods=["get"])
    def map(self, request):
        """
        [GET] /api/energy/turbines/map/
        Trả về GeoJSON FeatureCollection của các tuabin theo bộ lọc.
        """
        qs = self.filter_queryset(self.get_queryset())
        serializer = WindTurbineGeoSerializer(qs, many=True)
        return Response(serializer.data)


class AnalysisJobViewSet(viewsets.ModelViewSet):
    """
    API ViewSet cho Tác vụ phân tích (AnalysisJob).
    """

    queryset = AnalysisJob.objects.all().order_by("-created_at")
    serializer_class = AnalysisJobSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = WindEnergyPagination
    filter_backends = [django_filters.DjangoFilterBackend, drf_filters.SearchFilter]
    filterset_fields = ["status", "analysis_type"]
    search_fields = ["analysis_type"]


class ExtremeEventViewSet(viewsets.ModelViewSet):
    """
    API ViewSet cho Sự kiện cực đoan (ExtremeEvent).
    """

    queryset = (
        ExtremeEvent.objects.select_related("station", "job")
        .all()
        .order_by("-start_time")
    )
    serializer_class = ExtremeEventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = WindEnergyPagination
    filter_backends = [django_filters.DjangoFilterBackend, drf_filters.SearchFilter]
    filterset_fields = ["extreme_type", "station"]
    search_fields = ["extreme_type", "station__station_code", "station__name"]
