from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from wind_core.models import (
    AlertNotification,
    AlertRule,
    Dataset,
    DatasetAccessPolicy,
    DatasetVariable,
    DownloadFile,
    DownloadRequest,
    DownloadRequestItem,
    IngestionLog,
    SystemMetric,
    UserQueryHistory,
)
from wind_core.serializers import DatasetSerializer, DatasetVariableSerializer
from wind_core.utils import Median, StandardResultsSetPagination

User = get_user_model()


class DatasetTestCase(TestCase):
    def test_create_dataset_and_serialize(self):
        ds = Dataset.objects.create(code="ERA5_WIND", name="ERA5 Reanalysis Wind", category="GRIDDED")
        var = DatasetVariable.objects.create(
            dataset=ds, variable_code="u10", variable_name="10m U wind component", unit="m/s"
        )
        serializer = DatasetSerializer(ds)
        self.assertEqual(serializer.data["code"], "ERA5_WIND")
        self.assertEqual(len(serializer.data["variables"]), 1)
        self.assertEqual(serializer.data["variables"][0]["variable_code"], "u10")
        self.assertEqual(str(ds), "ERA5 Reanalysis Wind")
        self.assertEqual(str(var), "10m U wind component")


class CoreModelsTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="password123")
        self.dataset = Dataset.objects.create(code="GLOBAL_WIND", name="Global Wind Atlas", category="GRIDDED")

    def test_dataset_access_policy(self):
        group = Group.objects.create(name="Researchers")
        policy = DatasetAccessPolicy.objects.create(
            dataset=self.dataset,
            group=group,
            can_view=True,
            can_query=True,
            can_download=False,
        )
        self.assertEqual(str(policy), f"{group.name} - {self.dataset.name}")
        self.assertTrue(policy.can_view)
        self.assertFalse(policy.can_download)

    def test_alert_rule_and_notification(self):
        rule = AlertRule.objects.create(
            user=self.user,
            dataset=self.dataset,
            conditions=[{"var": "wind_speed", "op": ">", "val": 25}],
            is_active=True,
        )
        self.assertIn("testuser", str(rule))
        notif = AlertNotification.objects.create(
            rule=rule,
            triggered_at=timezone.now(),
            triggered_value={"wind_speed": 28.5},
        )
        self.assertIn("Thông báo", str(notif))

    def test_download_models(self):
        req = DownloadRequest.objects.create(
            user=self.user,
            time_start=timezone.now(),
            time_end=timezone.now(),
            status="PENDING",
            estimated_size_mb=12.50,
        )
        self.assertIn("Yêu cầu tải", str(req))

        item = DownloadRequestItem.objects.create(
            request=req,
            dataset=self.dataset,
            variable_codes=["u10", "v10"],
            export_format="NETCDF",
        )
        self.assertEqual(str(item), f"{self.dataset.name} (NETCDF)")

        file_obj = DownloadFile.objects.create(
            request=req,
            file_path="/downloads/wind_data.nc",
            file_size_mb=11.20,
        )
        self.assertIn("11.2", str(file_obj))

    def test_operations_models(self):
        history = UserQueryHistory.objects.create(
            user=self.user,
            query_type="POINT_TIMESERIES",
            parameters={"lat": 16.0, "lon": 108.0},
        )
        self.assertIn("POINT_TIMESERIES", str(history))

        log = IngestionLog.objects.create(
            dataset=self.dataset,
            source_file="era5_2024.nc",
            status="SUCCESS",
            records_processed=1000,
        )
        self.assertIn("era5_2024.nc", str(log))

        metric = SystemMetric.objects.create(
            metric_name="cpu_usage_pct",
            metric_value=45.5,
        )
        self.assertIn("cpu_usage_pct", str(metric))


class UtilsTestCase(TestCase):
    def test_pagination_settings(self):
        pagination = StandardResultsSetPagination()
        self.assertEqual(pagination.page_size, 20)
        self.assertEqual(pagination.page_size_query_param, "page_size")
        self.assertEqual(pagination.max_page_size, 1000)

    def test_median_aggregate(self):
        median = Median("field_name")
        self.assertEqual(median.function, "PERCENTILE_CONT")
        self.assertIn("WITHIN GROUP (ORDER BY", median.template)


class DatasetViewSetTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ds1 = Dataset.objects.create(code="ERA5", name="ERA5", category="GRIDDED", is_active=True)
        self.ds2 = Dataset.objects.create(code="STATION_DAILY", name="Station Daily", category="STATION", is_active=True)
        self.inactive_ds = Dataset.objects.create(code="OBSOLETE", name="Obsolete", category="GRIDDED", is_active=False)

        self.var1 = DatasetVariable.objects.create(
            dataset=self.ds1, variable_code="wind_speed", variable_name="Wind Speed", is_component=False
        )
        self.var2 = DatasetVariable.objects.create(
            dataset=self.ds1, variable_code="u10", variable_name="U 10m", is_component=True
        )

    def test_list_datasets(self):
        response = self.client.get("/api/datasets/")
        # If url is mounted at /api/datasets/ or /datasets/
        if response.status_code == 404:
            response = self.client.get("/datasets/")
        self.assertEqual(response.status_code, 200)
        # Should include active datasets, exclude inactive
        codes = [item["code"] for item in response.data.get("results", response.data)]
        self.assertIn("ERA5", codes)
        self.assertIn("STATION_DAILY", codes)
        self.assertNotIn("OBSOLETE", codes)

    def test_get_variables_action(self):
        response = self.client.get(f"/api/datasets/{self.ds1.id}/get_variables/")
        if response.status_code == 404:
            response = self.client.get(f"/datasets/{self.ds1.id}/get_variables/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("variables", response.data)
        self.assertEqual(len(response.data["variables"]), 2)

        # Filter is_component=true
        response_comp = self.client.get(f"/datasets/{self.ds1.id}/get_variables/?is_component=true")
        if response_comp.status_code == 404:
            response_comp = self.client.get(f"/api/datasets/{self.ds1.id}/get_variables/?is_component=true")
        self.assertEqual(len(response_comp.data["variables"]), 1)
        self.assertEqual(response_comp.data["variables"][0]["variable_code"], "u10")

    def test_granule_steps_actions(self):
        for action in ["time_steps", "year_steps", "month_steps", "day_steps"]:
            response = self.client.get(f"/datasets/{self.ds1.id}/{action}/")
            if response.status_code == 404:
                response = self.client.get(f"/api/datasets/{self.ds1.id}/{action}/")
            self.assertEqual(response.status_code, 200)
            self.assertIn(action, response.data)
