from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from wind_core.models import Dataset

User = get_user_model()


class AdminEndpointsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.normal_user = User.objects.create_user(username="normal", password="password123")
        self.admin_user = User.objects.create_superuser(username="admin", password="password123", email="admin@test.com")
        self.dataset = Dataset.objects.create(code="TEST_DS", name="Test Dataset", category="GRIDDED")

    def test_dashboard_stats_requires_admin(self):
        response = self.client.get("/wind/api/v1/datasets/dashboard-stats/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/wind/api/v1/datasets/dashboard-stats/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("total_stations", response.data)
        self.assertIn("total_granules", response.data)

    def test_station_mutation_permission(self):
        payload = {
            "station_code": "ST_TEST",
            "name": "Station Test",
            "geom": "SRID=4326;POINT(106 10)",
            "is_active": True,
        }
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.post("/wind/api/v1/stations/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post("/wind/api/v1/stations/", payload, format="json")
        self.assertIn(response.status_code, [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST])
