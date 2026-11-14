import base64
import hashlib

from cryptography.fernet import Fernet
from django.conf import settings
from django.db import models
from django.db.models.signals import pre_delete
from django.dispatch import receiver


def _get_fernet():
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


class CDSCredential(models.Model):
    name = models.CharField(max_length=128, verbose_name="Tên định danh")
    url = models.CharField(
        max_length=255,
        default="https://cds.climate.copernicus.eu/api",
        verbose_name="URL dịch vụ CDS",
    )
    encrypted_key = models.BinaryField(default=b"", blank=True, verbose_name="Khóa API (đã mã hóa)")
    is_active = models.BooleanField(default=True, verbose_name="Kích hoạt")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Ngày tạo")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Ngày cập nhật")

    class Meta:
        db_table = "wind_cds_credentials"
        verbose_name = "Thông tin xác thực CDS"
        verbose_name_plural = "Danh sách thông tin xác thực CDS"

    def set_key(self, raw_key: str):
        if not raw_key:
            self.encrypted_key = b""
            return
        self.encrypted_key = _get_fernet().encrypt(raw_key.strip().encode("utf-8"))

    def get_key(self) -> str:
        if not self.encrypted_key:
            return ""
        try:
            return _get_fernet().decrypt(bytes(self.encrypted_key)).decode("utf-8")
        except Exception:
            return ""

    @property
    def masked_key(self) -> str:
        key = self.get_key()
        if not key or len(key) <= 8:
            return "********"
        prefix_len = min(9, len(key) - 4)
        return f"{key[:prefix_len]}****{key[-4:]}"

    def __str__(self):
        return f"{self.name} ({self.masked_key})"


class CDSDownloadJob(models.Model):
    MODE_CHOICES = (
        ("ONCE", "Một lần"),
        ("RECURRING", "Lặp lại theo lịch"),
    )
    STATUS_CHOICES = (
        ("IDLE", "Chờ chạy"),
        ("RUNNING", "Đang chạy"),
        ("PAUSED", "Tạm dừng"),
        ("FAILED", "Lỗi"),
        ("SUCCESS", "Thành công"),
    )

    name = models.CharField(max_length=255, verbose_name="Tên tác vụ")
    credential = models.ForeignKey(
        CDSCredential,
        on_delete=models.CASCADE,
        related_name="jobs",
        verbose_name="Tài khoản CDS",
    )
    dataset = models.ForeignKey(
        "wind_core.Dataset",
        on_delete=models.CASCADE,
        related_name="cds_jobs",
        verbose_name="Bộ dữ liệu đích",
    )
    dataset_name = models.CharField(
        max_length=255,
        default="reanalysis-era5-single-levels",
        verbose_name="Mã dataset CDS",
    )
    request_params = models.JSONField(default=dict, blank=True, verbose_name="Tham số truy vấn CDS")
    mode = models.CharField(max_length=16, choices=MODE_CHOICES, default="ONCE", verbose_name="Chế độ")
    schedule = models.ForeignKey(
        "django_celery_beat.CrontabSchedule",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="Lịch chạy Cron",
    )
    periodic_task = models.OneToOneField(
        "django_celery_beat.PeriodicTask",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="Periodic Task Celery",
    )
    auto_latest = models.BooleanField(
        default=False,
        help_text="Tự động tải các ngày mới nhất từ granule mới nhất đến hôm nay trừ độ trễ.",
        verbose_name="Tự động cập nhật dữ liệu mới",
    )
    lag_days = models.IntegerField(default=5, verbose_name="Độ trễ dữ liệu (ngày)")
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="IDLE", verbose_name="Trạng thái")
    last_run_at = models.DateTimeField(null=True, blank=True, verbose_name="Lần chạy gần nhất")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="Người tạo",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Ngày tạo")

    class Meta:
        db_table = "wind_cds_download_jobs"
        verbose_name = "Tác vụ tải CDS"
        verbose_name_plural = "Danh sách tác vụ tải CDS"

    def __str__(self):
        return f"{self.name} [{self.get_mode_display()}]"


class CDSJobRun(models.Model):
    STATUS_CHOICES = (
        ("PENDING", "Đang chờ"),
        ("DOWNLOADING", "Đang tải tệp"),
        ("IMPORTING", "Đang nạp dữ liệu"),
        ("SUCCESS", "Thành công"),
        ("FAILED", "Thất bại"),
    )

    job = models.ForeignKey(CDSDownloadJob, on_delete=models.CASCADE, related_name="runs", verbose_name="Tác vụ")
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="PENDING", verbose_name="Trạng thái")
    request_snapshot = models.JSONField(default=dict, blank=True, verbose_name="Bản chụp request")
    file_path = models.CharField(max_length=512, null=True, blank=True, verbose_name="Đường dẫn tệp tạm")
    ingestion_log = models.ForeignKey(
        "wind_core.IngestionLog",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="Nhật ký nạp",
    )
    error_message = models.TextField(null=True, blank=True, verbose_name="Thông báo lỗi")
    started_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian bắt đầu")
    finished_at = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian kết thúc")

    class Meta:
        db_table = "wind_cds_job_runs"
        ordering = ["-started_at"]
        verbose_name = "Lịch sử chạy tác vụ CDS"
        verbose_name_plural = "Danh sách lịch sử chạy tác vụ CDS"

    def __str__(self):
        return f"Run #{self.id} of {self.job.name} ({self.status})"


@receiver(pre_delete, sender=CDSDownloadJob)
def delete_periodic_task_for_cds_job(sender, instance, **kwargs):
    """Prevent an enabled Beat task from surviving deletion of its CDS job."""
    if instance.periodic_task_id:
        from django_celery_beat.models import PeriodicTask

        PeriodicTask.objects.filter(id=instance.periodic_task_id).delete()
