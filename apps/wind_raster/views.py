from django.contrib.gis.geos import Point
from django.db.models import Count, Max, Min
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django_filters import rest_framework as filters
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_gis.filters import InBBoxFilter

from wind_core.access import accessible_datasets
from wind_core.utils import StandardResultsSetPagination
from .models import RasterGranuleIndex
from .serializers import RasterGranuleIndexSerializer
from .services import get_raster_granule_data_service


class RasterGranuleIndexViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API hỗ trợ truy vấn chỉ mục raster, tổng hợp số liệu (summary)
    và trích xuất dữ liệu mảng raster (data) phục vụ vẽ vector gió/heatmap.
    """

    queryset = RasterGranuleIndex.objects.all().order_by("id")
    serializer_class = RasterGranuleIndexSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardResultsSetPagination
    bbox_filter_field = "footprint"
    filter_backends = [filters.DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ["dataset", "variable_code", "granule_time"]

    def get_queryset(self):
        allowed = accessible_datasets(self.request.user)
        return RasterGranuleIndex.objects.filter(dataset__in=allowed).order_by("id")

    @action(detail=False, methods=["post"], url_path="upload", permission_classes=[permissions.IsAdminUser])
    def upload_raster(self, request):
        uploaded_file = request.FILES.get("file")
        dataset_id = request.data.get("dataset_id")
        if not uploaded_file:
            return Response({"error": "Vui lòng chọn tệp .nc hoặc .zip."}, status=status.HTTP_400_BAD_REQUEST)

        from wind_core.models import Dataset, IngestionLog

        dataset = Dataset.objects.filter(id=dataset_id).first()
        if not dataset:
            return Response({"error": "Bộ dữ liệu không tồn tại."}, status=status.HTTP_400_BAD_REQUEST)

        import os
        import tempfile
        from wind_raster.services.raster_ingest import IngestError, ingest_netcdf

        suffix = os.path.splitext(uploaded_file.name)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            for chunk in uploaded_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        log = IngestionLog.objects.create(dataset=dataset, source_file=uploaded_file.name, status="RUNNING")
        try:
            result = ingest_netcdf(tmp_path, dataset, source_name=uploaded_file.name)
        except Exception as exc:
            log.status = "FAILED"
            log.error_message = str(exc)
            log.save()
            if isinstance(exc, IngestError):
                message = str(exc)
            else:
                message = "Không thể xử lý tệp dữ liệu. Chi tiết đã được ghi trong nhật ký nạp dữ liệu."
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)
        else:
            log.status = "SUCCESS"
            log.records_processed = result.granules
            log.save()
            return Response(
                {
                    "message": result.summary(),
                    "granules": result.granules,
                    "variables": result.variables,
                }
            )
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    @action(detail=False, methods=["get"])
    def point_metadata(self, request):
        """
        API cho Nhóm B4: Truy vấn metadata của raster tại tọa độ (lat, lon) và thời gian cụ thể.
        """
        lat = request.query_params.get("lat")
        lon = request.query_params.get("lon")
        time_param = request.query_params.get("time")
        dataset_code = request.query_params.get("dataset_code")

        if not all([lat, lon, time_param, dataset_code]):
            return Response(
                {"error": "Missing lat, lon, time or dataset_code"}, status=400
            )

        try:
            point = Point(float(lon), float(lat), srid=4326)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid lat or lon coordinates"}, status=400
            )

        parsed_time = parse_datetime(time_param)
        if parsed_time is None and " " in time_param:
            parsed_time = parse_datetime(time_param.replace(" ", "+"))
        if parsed_time is None:
            return Response(
                {"error": "Invalid time format"}, status=400
            )
        if timezone.is_naive(parsed_time):
            parsed_time = timezone.make_aware(parsed_time, timezone.utc)

        granules = self.get_queryset().filter(
            dataset__code=dataset_code,
            footprint__intersects=point,
            granule_time=parsed_time,
        )

        page = self.paginate_queryset(granules)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(granules, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """
        API tổng hợp số liệu thống kê chỉ mục raster (total_granules, min/max time, datasets, unique_vars).
        """
        queryset = self.filter_queryset(self.get_queryset())

        # 1. Tổng số granules
        total_granules = queryset.count()

        # 2. Thời gian sớm nhất và muộn nhất
        time_bounds = queryset.aggregate(
            min_time=Min("granule_time"), max_time=Max("granule_time")
        )
        min_granule_time = time_bounds.get("min_time")
        max_granule_time = time_bounds.get("max_time")

        # 3. Thống kê theo bộ dữ liệu
        dataset_counts = (
            queryset.values("dataset__code", "dataset__name")
            .annotate(count=Count("id"))
            .order_by("dataset__code")
        )
        datasets = [
            {
                "dataset_code": item["dataset__code"],
                "dataset_name": item["dataset__name"],
                "count": item["count"],
            }
            for item in dataset_counts
        ]

        # 4. Danh sách mã biến duy nhất
        unique_variable_codes = list(
            queryset.order_by()
            .values_list("variable_code", flat=True)
            .distinct()
            .exclude(variable_code__isnull=True)
            .exclude(variable_code="")
        )

        return Response(
            {
                "total_granules": total_granules,
                "min_granule_time": min_granule_time,
                "max_granule_time": max_granule_time,
                "datasets": datasets,
                "unique_variable_codes": unique_variable_codes,
            }
        )

    @action(detail=False, methods=["get"])
    def data(self, request):
        """
        API trích xuất giá trị lưới NetCDF (vector u/v hoặc biến vô hướng)
        phục vụ vẽ trường gió và bản đồ nhiệt (heatmap).
        """
        return get_raster_granule_data_service(request.query_params, user=request.user)
