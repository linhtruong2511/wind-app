from django.contrib.auth import get_user_model
from django.contrib.gis.db import models

User = get_user_model()


# ==========================================
# 1. WIND FARM & TURBINES
# ==========================================

class WindFarm(models.Model):
    STATUS_CHOICES = [
        ("PLANNING", "Đang lập kế hoạch"),
        ("ASSESSMENT", "Đánh giá tài nguyên"),
        ("CONSTRUCTION", "Đang xây dựng"),
        ("OPERATING", "Đang hoạt động"),
    ]

    code = models.CharField(max_length=64, unique=True, verbose_name="Mã trang trại")
    name = models.CharField(max_length=255, verbose_name="Tên trang trại")
    description = models.TextField(null=True, blank=True, verbose_name="Mô tả")
    location_name = models.CharField(max_length=255, default="Vịnh Bắc Bộ", verbose_name="Vị trí địa lý")
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="PLANNING", verbose_name="Trạng thái")
    boundary = models.PolygonField(srid=4326, null=True, blank=True, verbose_name="Vùng bao")
    total_capacity_mw = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="Năng lượng dự báo"
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Ngày tạo")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Ngày cập nhật")

    class Meta:
        db_table = "wind_farms"
        verbose_name = "Trang trại gió"
        verbose_name_plural = "Danh sách trang trại gió"
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


# Ngưỡng độ sâu (m) phân biệt móng cố định và móng nổi
FIXED_FOUNDATION_MAX_DEPTH = 50


class WindTurbine(models.Model):
    STATUS_CHOICES = [
        ("PROPOSED", "Đề xuất"),
        ("PLANNED", "Đã lên kế hoạch"),
        ("INSTALLED", "Đã lắp đặt"),
        ("OPERATIONAL", "Đang vận hành"),
    ]
    FOUNDATION_CHOICES = [
        ("FIXED", "Móng cố định"),
        ("FLOATING", "Móng nổi"),
    ]

    farm = models.ForeignKey(
        WindFarm, on_delete=models.CASCADE, related_name="turbines", verbose_name="Trang trại gió"
    )
    point_id = models.IntegerField(verbose_name="Mã điểm/tuabin")
    name = models.CharField(max_length=255, blank=True, default="", verbose_name="Tên điểm")
    zone = models.CharField(max_length=64, blank=True, default="", verbose_name="Vùng biển")
    geom = models.PointField(srid=4326, verbose_name="Tọa độ không gian (Geometry)")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, verbose_name="Vĩ độ")
    longitude = models.DecimalField(max_digits=9, decimal_places=6, verbose_name="Kinh độ")
    wind_speed_100m = models.FloatField(null=True, blank=True, verbose_name="Tốc độ gió ở độ cao 100m (m/s)")
    wind_direction = models.FloatField(null=True, blank=True, verbose_name="Hướng gió (độ)")
    sea_depth = models.FloatField(verbose_name="Độ sâu đáy biển GEBCO (m)")
    foundation_type = models.CharField(
        max_length=16, choices=FOUNDATION_CHOICES, blank=True, default="", verbose_name="Loại móng"
    )
    predicted_power_mw = models.FloatField(verbose_name="Công suất dự kiến (MW)")
    capacity_factor = models.FloatField(null=True, blank=True, verbose_name="Hệ số công suất (%)")
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="PROPOSED", verbose_name="Trạng thái")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian tạo")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Thời gian cập nhật")

    class Meta:
        db_table = "wind_turbines"
        unique_together = ("farm", "point_id")
        verbose_name = "Tuabin gió"
        verbose_name_plural = "Danh sách tuabin gió"
        indexes = [
            models.Index(fields=["farm", "point_id"]),
            models.Index(fields=["predicted_power_mw"]),
            models.Index(fields=["zone"]),
            models.Index(fields=["foundation_type"]),
        ]

    def __str__(self):
        return f"Tuabin {self.point_id} - {self.farm.code} ({self.predicted_power_mw:.1f} MW)"

    @staticmethod
    def foundation_for_depth(depth):
        if depth is None:
            return ""
        return "FIXED" if depth <= FIXED_FOUNDATION_MAX_DEPTH else "FLOATING"

    def save(self, *args, **kwargs):
        if self.geom and (self.latitude is None or self.longitude is None):
            self.latitude = round(self.geom.y, 6)
            self.longitude = round(self.geom.x, 6)
        elif self.latitude is not None and self.longitude is not None and not self.geom:
            from django.contrib.gis.geos import Point
            self.geom = Point(float(self.longitude), float(self.latitude), srid=4326)
        if not self.zone and self.farm_id:
            self.zone = self.farm.location_name or ""
        if not self.foundation_type:
            self.foundation_type = self.foundation_for_depth(self.sea_depth)
        super().save(*args, **kwargs)


# ==========================================
# 2. ANALYSIS & EXTREME EVENTS
# ==========================================

class AnalysisJob(models.Model):
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Người dùng thực hiện"
    )
    analysis_type = models.CharField(max_length=32, verbose_name="Loại phân tích")
    parameters = models.JSONField(verbose_name="Tham số phân tích")
    status = models.CharField(max_length=16, default="PENDING", verbose_name="Trạng thái")
    result_summary = models.JSONField(null=True, blank=True, verbose_name="Tổng hợp kết quả")
    error_message = models.TextField(null=True, blank=True, verbose_name="Thông báo lỗi")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian tạo")
    finished_at = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian hoàn tất")

    class Meta:
        db_table = "wind_analysis_jobs"
        verbose_name = "Tác vụ phân tích"
        verbose_name_plural = "Danh sách tác vụ phân tích"
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.analysis_type} ({self.status}) - {self.pk}"


class AnalysisResult(models.Model):
    job = models.ForeignKey(
        AnalysisJob, on_delete=models.CASCADE, related_name="results", verbose_name="Tác vụ phân tích"
    )
    result_time = models.DateTimeField(null=True, blank=True, verbose_name="Thời điểm phân tích")
    geom = models.GeometryField(srid=4326, null=True, blank=True, verbose_name="Vị trí không gian")
    metric_name = models.CharField(max_length=64, null=True, blank=True, verbose_name="Tên chỉ số")
    metric_value = models.DecimalField(
        max_digits=15, decimal_places=4, null=True, blank=True, verbose_name="Giá trị chỉ số"
    )

    class Meta:
        db_table = "wind_analysis_results"
        verbose_name = "Kết quả phân tích"
        verbose_name_plural = "Kết quả phân tích"
        indexes = [
            models.Index(fields=["job", "result_time"]),
        ]

    def __str__(self):
        return f"{self.metric_name}: {self.metric_value}"


class ExtremeEvent(models.Model):
    job = models.ForeignKey(
        AnalysisJob, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Tác vụ phân tích"
    )
    station = models.ForeignKey(
        "wind_stations.Station", on_delete=models.CASCADE, null=True, blank=True, verbose_name="Trạm quan trắc"
    )
    extreme_type = models.CharField(max_length=32, verbose_name="Loại hiện tượng cực đoan")
    start_time = models.DateTimeField(verbose_name="Thời gian bắt đầu")
    end_time = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian kết thúc")
    peak_value = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="Giá trị đỉnh"
    )
    threshold_used = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="Ngưỡng áp dụng"
    )

    class Meta:
        db_table = "wind_extreme_events"
        verbose_name = "Sự kiện thời tiết cực đoan"
        verbose_name_plural = "Sự kiện thời tiết cực đoan"
        indexes = [
            models.Index(fields=["station", "start_time"]),
        ]

    def __str__(self):
        return f"{self.extreme_type} ({self.station}): {self.peak_value}"
