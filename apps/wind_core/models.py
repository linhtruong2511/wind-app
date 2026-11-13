from django.conf import settings
from django.contrib.auth.models import Group
from django.contrib.gis.db import models


class Dataset(models.Model):
    CATEGORY_CHOICES = [
        ("GRIDDED", "Lưới tọa độ"),
        ("STATION", "Trạm quan trắc"),
        ("SATELLITE", "Vệ tinh"),
        ("EVENT", "Hiện tượng cực đoan"),
    ]
    ACCESS_LEVEL_CHOICES = [
        ("PUBLIC", "Công khai"),
        ("INTERNAL", "Nội bộ"),
        ("RESTRICTED", "Giới hạn"),
    ]

    code = models.CharField(max_length=64, unique=True, verbose_name="Mã bộ dữ liệu")
    name = models.CharField(max_length=255, verbose_name="Tên bộ dữ liệu")
    category = models.CharField(max_length=32, choices=CATEGORY_CHOICES, verbose_name="Phân loại dữ liệu")
    description = models.TextField(null=True, blank=True, verbose_name="Mô tả")
    source_provider = models.CharField(max_length=255, null=True, blank=True, verbose_name="Nguồn / Đơn vị cung cấp")
    spatial_extent = models.PolygonField(srid=4326, null=True, blank=True, verbose_name="Phạm vi không gian")
    time_start = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian bắt đầu")
    time_end = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian kết thúc")
    temporal_resolution = models.CharField(max_length=32, null=True, blank=True, verbose_name="Độ phân giải thời gian")
    access_level = models.CharField(
        max_length=16, choices=ACCESS_LEVEL_CHOICES, default="INTERNAL", verbose_name="Cấp độ truy cập"
    )
    is_active = models.BooleanField(default=True, verbose_name="Đang hoạt động")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian tạo")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Thời gian cập nhật")

    class Meta:
        db_table = "wind_datasets"
        verbose_name = "Bộ dữ liệu"
        verbose_name_plural = "Danh sách bộ dữ liệu"
        indexes = [
            models.Index(fields=["category"]),
            models.Index(fields=["access_level"]),
        ]

    def __str__(self):
        return self.name


class DatasetVariable(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name="variables", verbose_name="Bộ dữ liệu")
    variable_code = models.CharField(max_length=64, verbose_name="Mã biến")
    variable_name = models.CharField(max_length=255, verbose_name="Tên biến")
    unit = models.CharField(max_length=32, null=True, blank=True, verbose_name="Đơn vị đo")
    components = models.JSONField(
        default=list,
        blank=True,
        help_text="Mã biến thành phần trong file NetCDF: [u, v] cho trường gió, [mã] cho biến vô hướng",
        verbose_name="Biến thành phần",
    )
    is_component = models.BooleanField(
        default=False,
        help_text="Bật để ẩn biến khỏi danh sách hiển thị (vd: u10, v10 đã nằm trong wind_10m)",
        verbose_name="Là thành phần của biến khác",
    )

    class Meta:
        db_table = "wind_dataset_variables"
        verbose_name = "Biến dữ liệu"
        verbose_name_plural = "Danh sách biến dữ liệu"
        unique_together = ("dataset", "variable_code")

    def __str__(self):
        return self.variable_name


class DatasetAccessPolicy(models.Model):
    dataset = models.ForeignKey(
        Dataset, on_delete=models.CASCADE, related_name="access_policies", verbose_name="Bộ dữ liệu"
    )
    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="dataset_policies", verbose_name="Nhóm người dùng"
    )
    can_view = models.BooleanField(default=True, verbose_name="Được xem")
    can_query = models.BooleanField(default=True, verbose_name="Được truy vấn")
    can_download = models.BooleanField(default=False, verbose_name="Được tải về")

    class Meta:
        db_table = "wind_dataset_access_policies"
        verbose_name = "Chính sách truy cập dữ liệu"
        verbose_name_plural = "Chính sách truy cập dữ liệu"
        unique_together = ("dataset", "group")

    def __str__(self):
        return f"{self.group.name} - {self.dataset.name}"


class AlertRule(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="alert_rules", verbose_name="Người dùng"
    )
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, null=True, blank=True, verbose_name="Bộ dữ liệu")
    conditions = models.JSONField(
        help_text="Support multiple variables. e.g. [{'var': 'wind_speed', 'op': '>', 'val': 20}]",
        verbose_name="Điều kiện cảnh báo",
    )
    area = models.PolygonField(srid=4326, null=True, blank=True, verbose_name="Khu vực giám sát")
    is_active = models.BooleanField(default=True, verbose_name="Đang kích hoạt")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian tạo")

    class Meta:
        db_table = "wind_alert_rules"
        verbose_name = "Quy tắc cảnh báo"
        verbose_name_plural = "Danh sách quy tắc cảnh báo"
        indexes = [
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"Cảnh báo của {self.user} ({'Hoạt động' if self.is_active else 'Tắt'})"


class AlertNotification(models.Model):
    rule = models.ForeignKey(
        AlertRule, on_delete=models.CASCADE, related_name="notifications", verbose_name="Quy tắc cảnh báo"
    )
    triggered_at = models.DateTimeField(verbose_name="Thời gian kích hoạt")
    triggered_value = models.JSONField(
        null=True, blank=True, help_text="Values that triggered the alert", verbose_name="Giá trị kích hoạt"
    )
    location = models.PointField(srid=4326, null=True, blank=True, verbose_name="Vị trí cảnh báo")
    is_read = models.BooleanField(default=False, verbose_name="Đã đọc")

    class Meta:
        db_table = "wind_alert_notifications"
        verbose_name = "Thông báo cảnh báo"
        verbose_name_plural = "Danh sách thông báo cảnh báo"
        indexes = [
            models.Index(fields=["rule", "-triggered_at"]),
        ]

    def __str__(self):
        return f"Thông báo [{self.triggered_at}] - {self.rule}"


class DownloadRequest(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="download_requests", verbose_name="Người dùng"
    )
    aoi_geom = models.GeometryField(srid=4326, null=True, blank=True, verbose_name="Khu vực quan tâm")
    station_ids = models.JSONField(
        null=True, blank=True, help_text="List of station IDs", verbose_name="Danh sách mã trạm"
    )
    time_start = models.DateTimeField(verbose_name="Thời gian bắt đầu")
    time_end = models.DateTimeField(verbose_name="Thời gian kết thúc")
    status = models.CharField(max_length=16, default="PENDING", verbose_name="Trạng thái")
    estimated_size_mb = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="Dung lượng ước tính (MB)"
    )
    requested_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian yêu cầu")
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian hoàn tất")
    expires_at = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian hết hạn")

    class Meta:
        db_table = "wind_download_requests"
        verbose_name = "Yêu cầu tải dữ liệu"
        verbose_name_plural = "Danh sách yêu cầu tải dữ liệu"
        indexes = [
            models.Index(fields=["user", "-requested_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"Yêu cầu tải #{self.id} ({self.user}) - {self.status}"


class DownloadRequestItem(models.Model):
    request = models.ForeignKey(
        DownloadRequest, on_delete=models.CASCADE, related_name="items", verbose_name="Yêu cầu tải"
    )
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, verbose_name="Bộ dữ liệu")
    variable_codes = models.JSONField(help_text="List of variable codes", verbose_name="Danh sách mã biến")
    export_format = models.CharField(max_length=16, verbose_name="Định dạng xuất")

    class Meta:
        db_table = "wind_download_request_items"
        verbose_name = "Mục dữ liệu tải về"
        verbose_name_plural = "Chi tiết mục dữ liệu tải về"

    def __str__(self):
        return f"{self.dataset.name} ({self.export_format})"


class DownloadFile(models.Model):
    request = models.ForeignKey(
        DownloadRequest, on_delete=models.CASCADE, related_name="files", verbose_name="Yêu cầu tải"
    )
    file_path = models.TextField(verbose_name="Đường dẫn tệp tin")
    file_size_mb = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="Kích thước tệp (MB)"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian tạo")

    class Meta:
        db_table = "wind_download_files"
        verbose_name = "Tệp tin tải về"
        verbose_name_plural = "Danh sách tệp tin tải về"

    def __str__(self):
        return f"File #{self.id} - {self.file_size_mb} MB"


class UserQueryHistory(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="query_history", verbose_name="Người dùng"
    )
    query_type = models.CharField(max_length=32, verbose_name="Loại truy vấn")
    parameters = models.JSONField(verbose_name="Tham số truy vấn")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian thực hiện")

    class Meta:
        db_table = "wind_user_query_history"
        verbose_name = "Lịch sử truy vấn người dùng"
        verbose_name_plural = "Lịch sử truy vấn người dùng"
        indexes = [
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.user} - {self.query_type} ({self.created_at})"


class IngestionLog(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, null=True, blank=True, verbose_name="Bộ dữ liệu")
    source_file = models.TextField(null=True, blank=True, verbose_name="Tệp nguồn")
    status = models.CharField(max_length=16, verbose_name="Trạng thái")
    records_processed = models.IntegerField(null=True, blank=True, verbose_name="Số bản ghi đã xử lý")
    error_message = models.TextField(null=True, blank=True, verbose_name="Thông báo lỗi")
    started_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian bắt đầu")
    finished_at = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian kết thúc")

    class Meta:
        db_table = "wind_ingestion_logs"
        verbose_name = "Nhật ký nạp dữ liệu"
        verbose_name_plural = "Nhật ký nạp dữ liệu"

    def __str__(self):
        return f"Nạp {self.source_file or 'Dữ liệu'} ({self.status})"


class SystemMetric(models.Model):
    metric_name = models.CharField(max_length=64, verbose_name="Tên chỉ số")
    metric_value = models.DecimalField(max_digits=15, decimal_places=4, verbose_name="Giá trị chỉ số")
    recorded_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời điểm ghi nhận")

    class Meta:
        db_table = "wind_system_metrics"
        verbose_name = "Chỉ số hệ thống"
        verbose_name_plural = "Chỉ số hệ thống"
        indexes = [
            models.Index(fields=["metric_name", "-recorded_at"]),
        ]

    def __str__(self):
        return f"{self.metric_name}: {self.metric_value}"


__all__ = [
    "Dataset",
    "DatasetVariable",
    "DatasetAccessPolicy",
    "AlertRule",
    "AlertNotification",
    "DownloadRequest",
    "DownloadRequestItem",
    "DownloadFile",
    "UserQueryHistory",
    "IngestionLog",
    "SystemMetric",
]
