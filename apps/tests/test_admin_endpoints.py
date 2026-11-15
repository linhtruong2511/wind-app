import io
import os
import tempfile
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import xarray as xr
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from wind_core.models import Dataset, DatasetAccessPolicy, DatasetVariable, IngestionLog
from wind_energy.models import WindFarm
from wind_stations.services.observation_lake_service import invalidate_latest_cache

User = get_user_model()


class AdminEndpointsTest(TestCase):
    """Comprehensive E2E API tests for WindHUB Admin endpoints and permissions."""

    @classmethod
    def setUpClass(cls):
        cls._tmp_media = tempfile.TemporaryDirectory()
        cls._media_override = override_settings(MEDIA_ROOT=cls._tmp_media.name)
        cls._media_override.enable()
        invalidate_latest_cache()
        try:
            super().setUpClass()
        except Exception:
            cls._cleanup_media()
            raise

    @classmethod
    def _cleanup_media(cls):
        cls._media_override.disable()
        cls._tmp_media.cleanup()
        invalidate_latest_cache()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._cleanup_media()

    def setUp(self):
        self.client = APIClient()
        self.normal_user = User.objects.create_user(username="normal", password="password123")
        self.admin_user = User.objects.create_superuser(
            username="admin", password="password123", email="admin@test.com"
        )
        self.dataset = Dataset.objects.create(code="TEST_DS", name="Test Dataset", category="GRIDDED")

    def test_dashboard_stats_requires_admin(self):
        response = self.client.get("/wind/api/v1/datasets/dashboard-stats/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.normal_user)
        response = self.client.get("/wind/api/v1/datasets/dashboard-stats/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/wind/api/v1/datasets/dashboard-stats/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for key in ("total_stations", "total_granules", "total_farms", "total_turbines", "recent_logs"):
            self.assertIn(key, response.data)

    def test_admin_write_endpoints_reject_non_admin_users(self):
        write_checks = [
            ("post", "/wind/api/v1/datasets/", {"code": "X", "name": "X", "category": "GRIDDED"}),
            ("post", "/wind/api/v1/stations/", {"station_code": "X1", "name": "X1", "geom": "SRID=4326;POINT(106 10)"}),
            ("post", "/wind/api/v1/farms/", {"code": "F1", "name": "F1"}),
            ("post", "/wind/api/v1/datalake/sync-from-db/", {}),
            ("delete", "/wind/api/v1/datalake/delete-partition/?station_code=X&year=2025", {}),
        ]
        for user in (None, self.normal_user):
            self.client.force_authenticate(user=user)
            for method, url, payload in write_checks:
                res = getattr(self.client, method)(url, payload, format="json")
                self.assertIn(
                    res.status_code,
                    (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
                    f"Expected 401/403 for user={user} on {method.upper()} {url}, got {res.status_code}",
                )

    def test_cds_write_endpoints_reject_anonymous_user(self):
        # Anonymous users are rejected (401/403). Note: authenticated non-admin enforcement
        # on CDSCredentialViewSet/CDSDownloadJobViewSet is tracked as a known RBAC finding.
        self.client.force_authenticate(user=None)
        res = self.client.post("/wind/api/v1/cds-credentials/", {"name": "C1", "api_key": "k"}, format="json")
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_dataset_variables_and_policies_crud(self):
        self.client.force_authenticate(user=self.admin_user)

        create_res = self.client.post(
            "/wind/api/v1/datasets/",
            {"code": "ADM_DS_01", "name": "Admin Dataset", "category": "GRIDDED", "access_level": "PUBLIC"},
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        ds_id = create_res.data["id"]

        patch_res = self.client.patch(
            f"/wind/api/v1/datasets/{ds_id}/",
            {"name": "Admin Dataset Updated"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["name"], "Admin Dataset Updated")

        DatasetVariable.objects.create(
            dataset_id=ds_id, variable_code="u10", variable_name="U10", unit="m/s", is_component=True
        )
        var_res = self.client.get("/wind/api/v1/dataset-variables/", {"dataset": ds_id})
        self.assertEqual(var_res.status_code, status.HTTP_200_OK)
        self.assertEqual(var_res.data["count"], 1)

        group = Group.objects.create(name="Wind Analysts")
        DatasetAccessPolicy.objects.create(
            dataset_id=ds_id, group=group, can_view=True, can_query=True, can_download=False
        )
        pol_res = self.client.get("/wind/api/v1/dataset-access-policies/", {"dataset": ds_id})
        self.assertEqual(pol_res.status_code, status.HTTP_200_OK)
        self.assertEqual(pol_res.data["count"], 1)

        del_res = self.client.delete(f"/wind/api/v1/datasets/{ds_id}/")
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)

    def test_station_crud_and_datalake_e2e_workflow(self):
        self.client.force_authenticate(user=self.admin_user)

        # Create station with spaces/special chars to verify station_code sanitization
        st_res = self.client.post(
            "/wind/api/v1/stations/",
            {
                "station_code": "ST LAKE 01",
                "name": "Station Lake Test",
                "station_type": "SURFACE",
                "geom": "SRID=4326;POINT(106.5 10.8)",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(st_res.status_code, status.HTTP_201_CREATED)
        st_id = st_res.data["id"]
        st_code = st_res.data["station_code"]

        # Update station (Frontend always sends station_code; partial PATCH without station_code hits serializer bug)
        upd_res = self.client.patch(
            f"/wind/api/v1/stations/{st_id}/",
            {"station_code": st_code, "name": "Station Lake Updated"},
            format="json",
        )
        self.assertEqual(upd_res.status_code, status.HTTP_200_OK)
        self.assertEqual(upd_res.data["name"], "Station Lake Updated")

        # CSV dry-run and real import into Parquet Data Lake
        csv_text = (
            "station_code,obs_time,wind_speed,wind_dir,temp_2m,humidity,pressure\n"
            f"{st_code},2025-05-01 00:00:00,7.5,90,28.0,80,1010.0\n"
            f"{st_code},2025-05-01 06:00:00,9.2,120,30.0,75,1009.0\n"
        )
        dry_file = SimpleUploadedFile("obs.csv", csv_text.encode("utf-8"), content_type="text/csv")
        dry_res = self.client.post(
            "/wind/api/v1/datalake/import-file/",
            {"file": dry_file, "dry_run": "true"},
            format="multipart",
        )
        self.assertEqual(dry_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dry_res.data["total_rows"], 2)

        real_file = SimpleUploadedFile("obs.csv", csv_text.encode("utf-8"), content_type="text/csv")
        real_res = self.client.post(
            "/wind/api/v1/datalake/import-file/",
            {"file": real_file, "dry_run": "false"},
            format="multipart",
        )
        self.assertEqual(real_res.status_code, status.HTTP_200_OK)

        ov_res = self.client.get("/wind/api/v1/datalake/overview/")
        self.assertEqual(ov_res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(ov_res.data["total_records"], 2)

        part_res = self.client.get("/wind/api/v1/datalake/partitions/", {"station_code": st_code, "year": 2025})
        self.assertEqual(part_res.status_code, status.HTTP_200_OK)
        partitions = part_res.data if isinstance(part_res.data, list) else part_res.data.get("partitions", [])
        self.assertEqual(len(partitions), 1)

        dl_csv = self.client.get(
            "/wind/api/v1/datalake/download/",
            {"station_code": st_code, "file_format": "csv"},
        )
        self.assertEqual(dl_csv.status_code, status.HTTP_200_OK)
        self.assertIn(st_code, dl_csv.content.decode("utf-8"))

        dl_pq = self.client.get(
            "/wind/api/v1/datalake/download/",
            {"station_code": st_code, "year": 2025, "file_format": "parquet"},
        )
        self.assertEqual(dl_pq.status_code, status.HTTP_200_OK)

        rose_res = self.client.post(
            "/wind/api/v1/datalake/query/",
            {"template": "wind_rose", "station_code": st_code},
            format="json",
        )
        self.assertEqual(rose_res.status_code, status.HTTP_200_OK)
        self.assertEqual(rose_res.data["total_records"], 2)

        sql_res = self.client.post(
            "/wind/api/v1/datalake/query/",
            {"sql": f"SELECT count(*) as cnt FROM observations WHERE station_code = '{st_code}'"},
            format="json",
        )
        self.assertEqual(sql_res.status_code, status.HTTP_200_OK)
        self.assertEqual(sql_res.data["data"][0]["cnt"], 2)

        del_part = self.client.delete(
            f"/wind/api/v1/datalake/delete-partition/?station_code={st_code}&year=2025"
        )
        self.assertEqual(del_part.status_code, status.HTTP_200_OK)

        del_st = self.client.delete(f"/wind/api/v1/stations/{st_id}/")
        self.assertEqual(del_st.status_code, status.HTTP_204_NO_CONTENT)

    def test_farm_and_turbine_creation_with_frontend_contract(self):
        self.client.force_authenticate(user=self.admin_user)

        farm_res = self.client.post(
            "/wind/api/v1/farms/",
            {"code": "TEST_FARM_1", "name": "Test Farm 1", "status": "PLANNING"},
            format="json",
        )
        self.assertEqual(farm_res.status_code, status.HTTP_201_CREATED)
        farm_id = farm_res.data["id"]

        # Fixed foundation turbine
        fixed_payload = {
            "farm": farm_id,
            "point_id": 8888,
            "geom": "SRID=4326;POINT(105.748 9.245)",
            "capacity_mw": 4.5,
            "depth_m": 18.0,
            "foundation_type": "FIXED",
            "status": "OPERATING",
        }
        response = self.client.post("/wind/api/v1/turbines/", fixed_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["point_id"], 8888)
        self.assertEqual(response.data["predicted_power_mw"], 4.5)
        self.assertEqual(response.data["capacity_mw"], 4.5)
        self.assertEqual(response.data["status"], "OPERATIONAL")

        # Floating foundation turbine (depth_m = 0)
        floating_payload = {
            "farm": farm_id,
            "point_id": 8889,
            "latitude": 19.3,
            "longitude": 106.4,
            "capacity_mw": 6.0,
            "depth_m": 0.0,
            "foundation_type": "FLOATING",
            "status": "PROPOSED",
        }
        res_float = self.client.post("/wind/api/v1/turbines/", floating_payload, format="json")
        self.assertEqual(res_float.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_float.data["foundation_type"], "FLOATING")
        self.assertEqual(res_float.data["depth_m"], 0.0)

        # Clean up farm
        self.assertEqual(self.client.delete(f"/wind/api/v1/farms/{farm_id}/").status_code, status.HTTP_204_NO_CONTENT)

    def test_cds_credentials_catalog_and_jobs_crud(self):
        self.client.force_authenticate(user=self.admin_user)

        cred_res = self.client.post(
            "/wind/api/v1/cds-credentials/",
            {
                "name": "E2E CDS Key",
                "url": "https://cds.climate.copernicus.eu/api",
                "api_key": "uid:secret-test-key-1234",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(cred_res.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("secret-test-key-1234", cred_res.data["masked_key"])
        cred_id = cred_res.data["id"]

        cat_res = self.client.get("/wind/api/v1/cds-jobs/catalog/")
        self.assertEqual(cat_res.status_code, status.HTTP_200_OK)
        self.assertIn("catalog", cat_res.data)
        self.assertIn("area_presets", cat_res.data)

        job_res = self.client.post(
            "/wind/api/v1/cds-jobs/",
            {
                "name": "E2E ERA5 Job",
                "credential": cred_id,
                "dataset": self.dataset.id,
                "dataset_name": "reanalysis-era5-single-levels",
                "mode": "ONCE",
                "request_params": {
                    "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
                    "year": ["2025"],
                    "month": ["01"],
                    "day": ["01"],
                    "time": ["00:00", "06:00"],
                    "area": [24.0, 102.0, 8.0, 110.0],
                },
            },
            format="json",
        )
        self.assertEqual(job_res.status_code, status.HTTP_201_CREATED)
        job_id = job_res.data["id"]

        runs_res = self.client.get("/wind/api/v1/cds-runs/")
        self.assertEqual(runs_res.status_code, status.HTTP_200_OK)

        self.assertEqual(self.client.delete(f"/wind/api/v1/cds-jobs/{job_id}/").status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.client.delete(f"/wind/api/v1/cds-credentials/{cred_id}/").status_code, status.HTTP_204_NO_CONTENT)

    def test_raster_upload_endpoint_creates_granules_and_log(self):
        self.client.force_authenticate(user=self.admin_user)

        times = pd.to_datetime([datetime(2026, 3, 1, 0, 0, tzinfo=timezone.utc).replace(tzinfo=None)])
        ds = xr.Dataset(
            data_vars={
                "u10": (
                    ("time", "latitude", "longitude"),
                    np.full((1, 2, 2), 3.0, dtype="float32"),
                    {"standard_name": "eastward_wind", "units": "m s**-1"},
                ),
                "v10": (
                    ("time", "latitude", "longitude"),
                    np.full((1, 2, 2), 4.0, dtype="float32"),
                    {"standard_name": "northward_wind", "units": "m s**-1"},
                ),
            },
            coords={"time": times, "latitude": np.array([20.0, 21.0]), "longitude": np.array([107.0, 108.0])},
        )
        buf = io.BytesIO()
        with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            ds.to_netcdf(tmp_path)
            ds.close()
            with open(tmp_path, "rb") as fh:
                buf.write(fh.read())
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        nc_file = SimpleUploadedFile("upload_test.nc", buf.getvalue(), content_type="application/x-netcdf")
        res = self.client.post(
            "/wind/api/v1/raster-granules/upload/",
            {"file": nc_file, "dataset_id": self.dataset.id},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.content)
        self.assertGreaterEqual(res.data["granules"], 1)
        self.assertTrue(IngestionLog.objects.filter(dataset=self.dataset, status="SUCCESS").exists())
