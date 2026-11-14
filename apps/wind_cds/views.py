from django_filters import rest_framework as django_filters
from rest_framework import filters as drf_filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .cds_catalog import AREA_PRESETS, ERA5_CATALOG
from .models import CDSCredential, CDSDownloadJob, CDSJobRun
from .serializers import (
    CDSCredentialSerializer,
    CDSDownloadJobSerializer,
    CDSJobRunSerializer,
)
from .services.cds_service import sync_periodic_task, test_cds_connection
from .tasks import run_cds_download_job


class CDSCredentialViewSet(viewsets.ModelViewSet):
    """API ViewSet quản lý tài khoản xác thực CDS Copernicus."""

    queryset = CDSCredential.objects.all().order_by("-id")
    serializer_class = CDSCredentialSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        drf_filters.SearchFilter,
        drf_filters.OrderingFilter,
    ]
    search_fields = ["name", "url"]
    filterset_fields = ["is_active"]
    ordering_fields = ["id", "name", "created_at"]

    @action(detail=True, methods=["post"], url_path="test-connection")
    def test_connection(self, request, pk=None):
        """Kiểm tra kết nối và tính hợp lệ của khóa API CDS."""
        credential = self.get_object()
        connected, message = test_cds_connection(credential.url, credential.get_key())
        return Response(
            {"connected": connected, "message": message},
            status=status.HTTP_200_OK if connected else status.HTTP_400_BAD_REQUEST,
        )


class CDSDownloadJobViewSet(viewsets.ModelViewSet):
    """API ViewSet quản lý tác vụ tải dữ liệu CDS."""

    queryset = CDSDownloadJob.objects.select_related("credential", "dataset").all().order_by("-id")
    serializer_class = CDSDownloadJobSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        drf_filters.SearchFilter,
        drf_filters.OrderingFilter,
    ]
    filterset_fields = ["mode", "status", "dataset", "credential", "auto_latest"]
    search_fields = ["name", "dataset_name"]
    ordering_fields = ["id", "name", "status", "last_run_at", "created_at"]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user if request.user.is_authenticated else None
        job = serializer.save(created_by=user)
        sync_periodic_task(job)

        task_id = None
        if request.data.get("run_immediately"):
            async_result = run_cds_download_job.delay(job.id)
            task_id = getattr(async_result, "id", str(async_result))

        headers = self.get_success_headers(serializer.data)
        data = dict(serializer.data)
        if task_id:
            data["task_id"] = task_id
            data["status"] = "QUEUED"
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        job = serializer.save(created_by=user)
        sync_periodic_task(job)

    def perform_update(self, serializer):
        job = serializer.save()
        sync_periodic_task(job)

    @action(detail=True, methods=["post"])
    def run(self, request, pk=None):
        """Kích hoạt chạy tác vụ tải CDS ngay lập tức."""
        job = self.get_object()
        async_result = run_cds_download_job.delay(job.id)
        task_id = getattr(async_result, "id", str(async_result))
        return Response(
            {"status": "queued", "job_id": job.id, "task_id": task_id},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="sync-schedule")
    def sync_schedule(self, request, pk=None):
        """Đồng bộ lịch PeriodicTask Celery Beat cho job."""
        job = self.get_object()
        sync_periodic_task(job)
        return Response({"success": True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"])
    def catalog(self, request):
        """Lấy danh mục biến ERA5 và các thiết lập vùng tọa độ định sẵn."""
        return Response(
            {
                "catalog": ERA5_CATALOG,
                "area_presets": AREA_PRESETS,
            },
            status=status.HTTP_200_OK,
        )


class CDSJobRunViewSet(viewsets.ReadOnlyModelViewSet):
    """API ViewSet theo dõi lịch sử chạy tải CDS."""

    queryset = CDSJobRun.objects.select_related("job").all().order_by("-started_at")
    serializer_class = CDSJobRunSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        drf_filters.OrderingFilter,
    ]
    filterset_fields = ["job", "status"]
    ordering_fields = ["started_at", "finished_at", "status"]
