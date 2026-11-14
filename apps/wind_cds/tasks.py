import logging
import os
import uuid

import cdsapi
from celery import shared_task
from django.conf import settings
from django.utils import timezone

from wind_cds.models import CDSDownloadJob, CDSJobRun
from wind_cds.services.cds_service import build_cds_request
from wind_core.models import IngestionLog
from wind_raster.services import ingest_netcdf

logger = logging.getLogger(__name__)


@shared_task(bind=True, name="wind_cds.tasks.run_cds_download_job", queue="default")
def run_cds_download_job(self, job_id: int):
    """Tải NetCDF từ CDS rồi nạp các granule vào hệ thống."""
    job = CDSDownloadJob.objects.filter(id=job_id).select_related("credential", "dataset").first()
    if not job:
        return {"success": False, "error": f"Không tìm thấy job id={job_id}"}

    job.status = "RUNNING"
    job.last_run_at = timezone.now()
    job.save(update_fields=["status", "last_run_at"])

    request_params = build_cds_request(job)
    if not request_params:
        job.status = "SUCCESS" if job.mode == "ONCE" else "IDLE"
        job.save(update_fields=["status"])
        return {"success": True, "message": "Dữ liệu đã ở mốc mới nhất, không cần tải thêm."}

    run = CDSJobRun.objects.create(job=job, status="PENDING", request_snapshot=request_params)

    media_root = getattr(settings, "MEDIA_ROOT", None)
    if not media_root:
        media_root = os.path.join(str(settings.BASE_DIR), "media")
    temp_dir = os.path.join(media_root, "wind_uploads", "temp")
    os.makedirs(temp_dir, exist_ok=True)

    dataset_code = getattr(job.dataset, "code", "dataset")
    temp_filename = f"cds_{dataset_code}_{uuid.uuid4().hex}.nc"
    temp_path = os.path.join(temp_dir, temp_filename)
    ingestion_log = None

    try:
        run.status = "DOWNLOADING"
        run.file_path = temp_path
        run.save(update_fields=["status", "file_path"])

        client = cdsapi.Client(url=job.credential.url, key=job.credential.get_key(), quiet=False)
        client.retrieve(job.dataset_name, request_params, temp_path)

        run.status = "IMPORTING"
        run.save(update_fields=["status"])
        ingestion_log = IngestionLog.objects.create(
            dataset=job.dataset,
            source_file=f"CDS_{job.dataset_name}_{temp_filename}",
            status="PENDING",
        )
        run.ingestion_log = ingestion_log
        run.save(update_fields=["ingestion_log"])

        result = ingest_netcdf(temp_path, job.dataset)
        ingestion_log.status = "SUCCESS"
        ingestion_log.records_processed = result.granules
        ingestion_log.finished_at = timezone.now()
        ingestion_log.save(update_fields=["status", "records_processed", "finished_at"])

        run.status = "SUCCESS"
        run.finished_at = timezone.now()
        run.save(update_fields=["status", "finished_at"])
        job.status = "SUCCESS" if job.mode == "ONCE" else "IDLE"
        job.save(update_fields=["status"])
        return {"success": True, "granules": result.granules}
    except Exception as exc:
        error_message = str(exc)
        if "403" in error_message:
            error_message = "Lỗi 403: Tài khoản CDS chưa chấp nhận Điều khoản sử dụng bộ dữ liệu ERA5."
        logger.exception("CDS download job failed (job_id=%s): %s", job_id, error_message)
        if ingestion_log:
            ingestion_log.status = "FAILED"
            ingestion_log.error_message = error_message
            ingestion_log.finished_at = timezone.now()
            ingestion_log.save(update_fields=["status", "error_message", "finished_at"])
        run.status = "FAILED"
        run.error_message = error_message
        run.finished_at = timezone.now()
        run.save(update_fields=["status", "error_message", "finished_at"])
        job.status = "FAILED"
        job.save(update_fields=["status"])
        return {"success": False, "error": error_message}
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


@shared_task(bind=True, name="wind_cds.tasks.download_cds_granule", queue="default")
def download_cds_granule(self, job_id: int):
    """Alias cho run_cds_download_job để hỗ trợ interface download_cds_granule task."""
    return run_cds_download_job(job_id)
