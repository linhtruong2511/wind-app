from datetime import datetime, timezone as dt_timezone
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Polygon
from django.test import TestCase, override_settings
from django_celery_beat.models import CrontabSchedule, PeriodicTask
from rest_framework import status
from rest_framework.test import APIClient

from wind_core.models import Dataset, IngestionLog
from wind_raster.models import RasterGranuleIndex

User = get_user_model()


class CDSCredentialModelTest(TestCase):
    def test_credential_encryption_and_decryption(self):
        from wind_cds.models import CDSCredential

        raw_key = "12345678-abcd-ef01-2345-6789abcdef01"
        cred = CDSCredential(name="Copernicus ERA5 Account")
        cred.set_key(raw_key)
        cred.save()

        # Reload from database to ensure binary field persistence
        cred.refresh_from_db()

        self.assertNotEqual(cred.encrypted_key, b"")
        self.assertNotEqual(bytes(cred.encrypted_key).decode("utf-8", errors="ignore"), raw_key)
        self.assertEqual(cred.get_key(), raw_key)

    def test_credential_masked_key(self):
        from wind_cds.models import CDSCredential

        cred = CDSCredential(name="Copernicus Account")
        cred.set_key("12345678-abcd-ef01-2345-6789abcdef01")
        self.assertTrue(cred.masked_key.startswith("12345678-"))
        self.assertTrue(cred.masked_key.endswith("ef01"))
        self.assertIn("****", cred.masked_key)

        # Short key or empty key
        cred.set_key("short")
        self.assertEqual(cred.masked_key, "********")

        cred.set_key("")
        self.assertEqual(cred.masked_key, "********")
        self.assertEqual(cred.get_key(), "")

    def test_credential_str_representation(self):
        from wind_cds.models import CDSCredential

        cred = CDSCredential(name="Copernicus Key")
        cred.set_key("12345678-abcd-ef01-2345-6789abcdef01")
        self.assertIn("Copernicus Key", str(cred))
        self.assertIn("****", str(cred))


class CDSDownloadJobModelTest(TestCase):
    def setUp(self):
        from wind_cds.models import CDSCredential

        self.user = User.objects.create_user(username="cds_admin", password="password")
        self.dataset = Dataset.objects.create(code="era5_hourly", name="ERA5 Hourly", category="GRIDDED")
        self.credential = CDSCredential.objects.create(name="Default CDS")
        self.credential.set_key("test-token-123456789")
        self.credential.save()

    def test_create_download_job_and_run(self):
        from wind_cds.models import CDSDownloadJob, CDSJobRun

        job = CDSDownloadJob.objects.create(
            name="Daily Vietnam Wind ERA5",
            credential=self.credential,
            dataset=self.dataset,
            mode="RECURRING",
            request_params={"variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"]},
            auto_latest=True,
            lag_days=5,
            created_by=self.user,
        )

        self.assertEqual(job.status, "IDLE")
        self.assertEqual(str(job), "Daily Vietnam Wind ERA5 [Lặp lại theo lịch]")

        ingestion_log = IngestionLog.objects.create(
            dataset=self.dataset,
            source_file="CDS_test.nc",
            status="PENDING",
        )

        run = CDSJobRun.objects.create(
            job=job,
            status="PENDING",
            request_snapshot=job.request_params,
            ingestion_log=ingestion_log,
        )

        self.assertEqual(run.status, "PENDING")
        self.assertEqual(job.runs.count(), 1)
        self.assertIn(f"Run #{run.id}", str(run))

    def test_periodic_task_deleted_when_job_deleted(self):
        from wind_cds.models import CDSDownloadJob
        from wind_cds.services.cds_service import sync_periodic_task

        schedule = CrontabSchedule.objects.create(
            minute="0", hour="3", day_of_week="*", day_of_month="*", month_of_year="*"
        )
        job = CDSDownloadJob.objects.create(
            name="Job with schedule",
            credential=self.credential,
            dataset=self.dataset,
            mode="RECURRING",
            schedule=schedule,
        )

        sync_periodic_task(job)
        job.refresh_from_db()
        self.assertIsNotNone(job.periodic_task)
        periodic_task_id = job.periodic_task_id

        self.assertTrue(PeriodicTask.objects.filter(id=periodic_task_id).exists())
        job.delete()
        self.assertFalse(PeriodicTask.objects.filter(id=periodic_task_id).exists())


class CDSServiceTest(TestCase):
    def setUp(self):
        from wind_cds.models import CDSCredential

        self.dataset = Dataset.objects.create(code="era5_srv", name="ERA5 Service Test", category="GRIDDED")
        self.credential = CDSCredential.objects.create(name="Key")
        self.credential.set_key("my-token")
        self.credential.save()

    def test_build_cds_request_fixed_params(self):
        from wind_cds.models import CDSDownloadJob
        from wind_cds.services.cds_service import build_cds_request

        job = CDSDownloadJob.objects.create(
            name="Job Fixed",
            credential=self.credential,
            dataset=self.dataset,
            request_params={
                "variable": ["10m_wind_speed"],
                "year": ["2026"],
                "month": ["08"],
                "day": ["01"],
                "time": ["00:00"],
            },
        )
        params = build_cds_request(job)
        self.assertEqual(params["product_type"], "reanalysis")
        self.assertEqual(params["format"], "netcdf")
        self.assertEqual(params["variable"], ["10m_wind_speed"])

    def test_build_cds_request_auto_latest_with_granules(self):
        from wind_cds.models import CDSDownloadJob
        from wind_cds.services.cds_service import build_cds_request

        RasterGranuleIndex.objects.create(
            dataset=self.dataset,
            granule_time=datetime(2026, 8, 1, 12, tzinfo=dt_timezone.utc),
            file_location="/test.nc",
            variable_code="multiple",
            footprint=Polygon.from_bbox((102.0, 8.0, 118.0, 24.0)),
        )

        job = CDSDownloadJob.objects.create(
            name="Job Auto Latest",
            credential=self.credential,
            dataset=self.dataset,
            mode="RECURRING",
            auto_latest=True,
            lag_days=5,
            request_params={"variable": ["10m_wind_speed"], "time": ["00:00"]},
        )

        ref_time = datetime(2026, 8, 10, tzinfo=dt_timezone.utc)
        params = build_cds_request(job, reference_time=ref_time)
        self.assertIn("2026", params["year"])
        self.assertIn("08", params["month"])
        self.assertEqual(params["day"], ["02", "03", "04", "05"])

    def test_build_cds_request_auto_latest_empty_when_already_latest(self):
        from wind_cds.models import CDSDownloadJob
        from wind_cds.services.cds_service import build_cds_request

        RasterGranuleIndex.objects.create(
            dataset=self.dataset,
            granule_time=datetime(2026, 8, 10, 12, tzinfo=dt_timezone.utc),
            file_location="/test.nc",
            variable_code="multiple",
            footprint=Polygon.from_bbox((102.0, 8.0, 118.0, 24.0)),
        )

        job = CDSDownloadJob.objects.create(
            name="Job Up To Date",
            credential=self.credential,
            dataset=self.dataset,
            mode="RECURRING",
            auto_latest=True,
            lag_days=5,
            request_params={"variable": ["10m_wind_speed"], "time": ["00:00"]},
        )

        ref_time = datetime(2026, 8, 10, tzinfo=dt_timezone.utc)
        params = build_cds_request(job, reference_time=ref_time)
        self.assertEqual(params, {})

    @patch("wind_cds.services.cds_service.cdsapi.Client")
    def test_test_cds_connection_success(self, mock_client):
        from wind_cds.services.cds_service import test_cds_connection

        mock_client.return_value = MagicMock()
        ok, msg = test_cds_connection("https://cds.climate.copernicus.eu/api", "valid-key")
        self.assertTrue(ok)
        self.assertIn("thành công", msg)

    @patch("wind_cds.services.cds_service.cdsapi.Client")
    def test_test_cds_connection_failure(self, mock_client):
        from wind_cds.services.cds_service import test_cds_connection

        mock_client.side_effect = Exception("403 Forbidden: license missing")
        ok, msg = test_cds_connection("https://cds.climate.copernicus.eu/api", "valid-key")
        self.assertFalse(ok)
        self.assertIn("403", msg)

    def test_test_cds_connection_missing_key(self):
        from wind_cds.services.cds_service import test_cds_connection

        ok, msg = test_cds_connection("https://cds.climate.copernicus.eu/api", "")
        self.assertFalse(ok)
        self.assertIn("Thiếu khóa API", msg)


class CDSTasksTest(TestCase):
    def setUp(self):
        from wind_cds.models import CDSCredential, CDSDownloadJob

        self.dataset = Dataset.objects.create(code="era5_task", name="ERA5 Task", category="GRIDDED")
        self.credential = CDSCredential.objects.create(name="Key")
        self.credential.set_key("my-token")
        self.credential.save()
        self.job = CDSDownloadJob.objects.create(
            name="Job Task",
            credential=self.credential,
            dataset=self.dataset,
            request_params={
                "variable": ["10m_wind_speed"],
                "year": ["2026"],
                "month": ["01"],
                "day": ["01"],
                "time": ["00:00"],
            },
        )

    @patch("wind_cds.tasks.ingest_netcdf")
    @patch("wind_cds.tasks.cdsapi.Client")
    def test_run_cds_download_job_success(self, mock_client, mock_ingest):
        from wind_cds.tasks import download_cds_granule, run_cds_download_job

        mock_client.return_value = MagicMock()
        mock_result = MagicMock()
        mock_result.granules = 3
        mock_ingest.return_value = mock_result

        result = run_cds_download_job(self.job.id)
        self.assertTrue(result["success"])
        self.assertEqual(result["granules"], 3)

        self.job.refresh_from_db()
        self.assertEqual(self.job.status, "SUCCESS")
        run = self.job.runs.first()
        self.assertIsNotNone(run)
        self.assertEqual(run.status, "SUCCESS")
        self.assertIsNotNone(run.ingestion_log)
        self.assertEqual(run.ingestion_log.status, "SUCCESS")
        self.assertEqual(run.ingestion_log.records_processed, 3)

        # Test alias task download_cds_granule
        alias_result = download_cds_granule(self.job.id)
        self.assertTrue(alias_result["success"])

    @patch("wind_cds.tasks.cdsapi.Client")
    def test_run_cds_download_job_failure(self, mock_client):
        from wind_cds.tasks import run_cds_download_job

        mock_client.side_effect = Exception("403 Forbidden")
        result = run_cds_download_job(self.job.id)
        self.assertFalse(result["success"])
        self.assertIn("403", result["error"])

        self.job.refresh_from_db()
        self.assertEqual(self.job.status, "FAILED")
        run = self.job.runs.first()
        self.assertEqual(run.status, "FAILED")
        self.assertIn("403", run.error_message)

    def test_run_cds_download_job_not_found(self):
        from wind_cds.tasks import run_cds_download_job

        result = run_cds_download_job(999999)
        self.assertFalse(result["success"])
        self.assertIn("Không tìm thấy", result["error"])

    @patch("wind_cds.tasks.build_cds_request", return_value={})
    def test_run_cds_download_job_empty_request(self, mock_build):
        from wind_cds.tasks import run_cds_download_job

        result = run_cds_download_job(self.job.id)
        self.assertTrue(result["success"])
        self.assertIn("mới nhất", result["message"])


@override_settings(ROOT_URLCONF="wind_cds.urls")
class CDSAPITest(TestCase):
    def setUp(self):
        from wind_cds.models import CDSCredential, CDSDownloadJob

        self.client = APIClient()
        self.user = User.objects.create_user(username="api_user", password="password")
        self.client.force_authenticate(user=self.user)

        self.dataset = Dataset.objects.create(code="cds_api_ds", name="CDS API Dataset", category="GRIDDED")
        self.credential = CDSCredential.objects.create(name="API Key")
        self.credential.set_key("my-super-secret-key-123456")
        self.credential.save()

    def test_credential_list_and_create(self):
        # List
        res = self.client.get("/credentials/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", res.data)
        self.assertEqual(len(results), 1)
        self.assertIn("masked_key", results[0])
        self.assertNotIn("key", results[0])

        # Create
        create_res = self.client.post(
            "/credentials/",
            {
                "name": "New Credential",
                "url": "https://cds.climate.copernicus.eu/api",
                "key": "new-api-token-987654321",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        self.assertIn("masked_key", create_res.data)

    @patch("wind_cds.views.test_cds_connection", return_value=(True, "Connected"))
    def test_credential_test_connection_action(self, mock_test):
        res = self.client.post(f"/credentials/{self.credential.id}/test-connection/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["connected"])

    def test_job_create_and_trigger_run(self):
        create_res = self.client.post(
            "/jobs/",
            {
                "name": "API ERA5 Job",
                "credential": self.credential.id,
                "dataset": self.dataset.id,
                "mode": "ONCE",
                "request_params": {"variable": ["10m_wind_speed"]},
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        job_id = create_res.data["id"]

        with patch("wind_cds.views.run_cds_download_job.delay") as mock_delay:
            mock_task = MagicMock()
            mock_task.id = "mock-task-id-123"
            mock_delay.return_value = mock_task

            run_res = self.client.post(f"/jobs/{job_id}/run/")
            self.assertEqual(run_res.status_code, status.HTTP_200_OK)
            self.assertEqual(run_res.data["task_id"], "mock-task-id-123")
            mock_delay.assert_called_once_with(job_id)

    @patch("wind_cds.views.run_cds_download_job.delay")
    def test_job_create_with_run_immediately(self, mock_delay):
        mock_task = MagicMock()
        mock_task.id = "mock-immediate-task-456"
        mock_delay.return_value = mock_task

        res = self.client.post(
            "/jobs/",
            {
                "name": "Immediate Job",
                "credential": self.credential.id,
                "dataset": self.dataset.id,
                "mode": "ONCE",
                "run_immediately": True,
                "request_params": {"variable": ["10m_wind_speed"]},
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data.get("task_id"), "mock-immediate-task-456")
        mock_delay.assert_called_once()

    def test_job_sync_schedule_action(self):
        from wind_cds.models import CDSDownloadJob

        schedule = CrontabSchedule.objects.create(minute="0", hour="1")
        job = CDSDownloadJob.objects.create(
            name="Scheduled Job",
            credential=self.credential,
            dataset=self.dataset,
            mode="RECURRING",
            schedule=schedule,
        )
        res = self.client.post(f"/jobs/{job.id}/sync-schedule/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])

    def test_catalog_endpoint(self):
        res = self.client.get("/jobs/catalog/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("catalog", res.data)
        self.assertIn("area_presets", res.data)

    def test_job_runs_list(self):
        from wind_cds.models import CDSDownloadJob, CDSJobRun

        job = CDSDownloadJob.objects.create(
            name="Job for run test",
            credential=self.credential,
            dataset=self.dataset,
        )
        CDSJobRun.objects.create(job=job, status="SUCCESS")

        res = self.client.get("/runs/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["status"], "SUCCESS")
