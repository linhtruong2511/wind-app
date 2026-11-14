import json
from datetime import datetime, timedelta

import cdsapi
from django.utils import timezone
from django_celery_beat.models import PeriodicTask

from wind_cds.models import CDSDownloadJob
from wind_raster.models import RasterGranuleIndex


def test_cds_connection(url: str, key: str) -> tuple[bool, str]:
    """Khởi tạo client để kiểm tra cấu hình xác thực CDS cơ bản."""
    if not key:
        return False, "Thiếu khóa API CDS."
    try:
        cdsapi.Client(url=url, key=key, wait_until_complete=False, quiet=True)
        return True, "Kết nối CDS thành công."
    except Exception as exc:
        message = str(exc)
        if "403" in message:
            message = "Lỗi 403: Vui lòng chấp thuận điều khoản bộ dữ liệu ERA5 trên Copernicus CDS."
        return False, message


def build_cds_request(job: CDSDownloadJob, reference_time: datetime | None = None) -> dict:
    """Xây dựng tham số cdsapi cho một tác vụ tải dữ liệu."""
    request_params = dict(job.request_params)
    request_params.setdefault("product_type", "reanalysis")
    request_params.setdefault("format", "netcdf")

    if not job.auto_latest:
        return request_params

    now = reference_time or timezone.now()
    end_date = (now - timedelta(days=job.lag_days)).date()
    latest_granule = RasterGranuleIndex.objects.filter(dataset=job.dataset).order_by("-granule_time").first()
    if latest_granule:
        start_date = (latest_granule.granule_time + timedelta(days=1)).date()
    else:
        start_date = end_date - timedelta(days=6)

    if start_date > end_date:
        return {}

    years, months, days = set(), set(), set()
    current_date = start_date
    while current_date <= end_date:
        years.add(f"{current_date.year:04d}")
        months.add(f"{current_date.month:02d}")
        days.add(f"{current_date.day:02d}")
        current_date += timedelta(days=1)

    request_params["year"] = sorted(years)
    request_params["month"] = sorted(months)
    request_params["day"] = sorted(days)
    return request_params


def sync_periodic_task(job: CDSDownloadJob):
    """Đồng bộ PeriodicTask của Celery Beat theo cấu hình một CDS job."""
    if job.mode == "RECURRING" and job.schedule and job.status != "PAUSED":
        periodic_task, _ = PeriodicTask.objects.update_or_create(
            name=f"cds_job_{job.id}",
            defaults={
                "task": "wind_cds.tasks.run_cds_download_job",
                "crontab": job.schedule,
                "args": json.dumps([job.id]),
                "enabled": True,
            },
        )
        if job.periodic_task_id != periodic_task.id:
            job.periodic_task = periodic_task
            job.save(update_fields=["periodic_task"])
    elif job.periodic_task:
        job.periodic_task.enabled = False
        job.periodic_task.save(update_fields=["enabled"])
