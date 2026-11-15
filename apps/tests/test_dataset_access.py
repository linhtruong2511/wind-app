from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser, Group
from django.contrib.gis.geos import Polygon
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from wind_core.access import accessible_datasets, can_download_dataset
from wind_core.models import Dataset, DatasetAccessPolicy, DatasetVariable
from wind_raster.models import RasterGranuleIndex

User = get_user_model()
API = "/wind/api/v1"


class DatasetAccessTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.group = Group.objects.create(name="Nhóm phân tích")
        self.other_group = Group.objects.create(name="Nhóm khác")
        self.member = User.objects.create_user("member", password="pass12345")
        self.member.groups.add(self.group)
        self.outsider = User.objects.create_user("outsider", password="pass12345")
        self.outsider.groups.add(self.other_group)
        self.staff = User.objects.create_superuser("root", "root@test.com", "pass12345")

        self.public = Dataset.objects.create(code="PUB", name="Công khai", category="GRIDDED", access_level="PUBLIC")
        self.internal = Dataset.objects.create(code="INT", name="Nội bộ", category="GRIDDED", access_level="INTERNAL")
        self.restricted = Dataset.objects.create(
            code="RES", name="Theo nhóm", category="GRIDDED", access_level="RESTRICTED"
        )
        DatasetAccessPolicy.objects.create(
            dataset=self.restricted, group=self.group, can_view=True, can_query=True, can_download=False
        )
        DatasetAccessPolicy.objects.create(
            dataset=self.restricted, group=self.other_group, can_view=False, can_query=False, can_download=False
        )

        self.moment = timezone.now().replace(microsecond=0)
        poly = Polygon.from_bbox((102.0, 8.0, 110.0, 24.0))
        poly.srid = 4326
        for dataset in (self.public, self.internal, self.restricted):
            RasterGranuleIndex.objects.create(
                dataset=dataset,
                granule_time=self.moment,
                footprint=poly,
                file_location="/data/x.nc",
                variable_code="wind_10m",
                elevation=10.0,
            )

    def _expected_by_user(self):
        return [
            (None, {"PUB"}),
            (self.outsider, {"PUB", "INT"}),
            (self.member, {"PUB", "INT", "RES"}),
            (self.staff, {"PUB", "INT", "RES"}),
        ]

    def test_accessible_datasets_by_user(self):
        for user, expected in self._expected_by_user():
            with self.subTest(user=getattr(user, "username", "anonymous")):
                codes = set(accessible_datasets(user or AnonymousUser()).values_list("code", flat=True))
                self.assertEqual(codes, expected)

    def test_can_download_dataset(self):
        self.assertTrue(can_download_dataset(None, self.public))
        self.assertFalse(can_download_dataset(None, self.internal))
        self.assertTrue(can_download_dataset(self.outsider, self.internal))
        self.assertFalse(can_download_dataset(self.member, self.restricted))
        self.assertTrue(can_download_dataset(self.staff, self.restricted))
        DatasetAccessPolicy.objects.filter(dataset=self.restricted, group=self.group).update(can_download=True)
        self.assertTrue(can_download_dataset(self.member, self.restricted))
        self.assertFalse(can_download_dataset(self.outsider, self.restricted))

    def _create_payload(self, **extra):
        payload = {
            "code": "NEW",
            "name": "Mới",
            "category": "GRIDDED",
            "access_level": "RESTRICTED",
            "access_policies": [{"group": self.group.id, "can_view": True, "can_download": True}],
        }
        payload.update(extra)
        return payload

    def test_admin_saves_policies_with_dataset(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(f"{API}/datasets/", self._create_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        policy = DatasetAccessPolicy.objects.get(dataset_id=response.data["id"])
        self.assertTrue(policy.can_view)
        self.assertTrue(policy.can_query)
        self.assertTrue(policy.can_download)
        self.assertEqual(response.data["access_policies"][0]["group_name"], self.group.name)

    def test_patch_replaces_policies_only_when_key_is_sent(self):
        self.client.force_authenticate(user=self.staff)
        url = f"{API}/datasets/{self.restricted.id}/"

        self.client.patch(url, {"name": "Đổi tên"}, format="json")
        self.assertEqual(self.restricted.access_policies.count(), 2)

        response = self.client.patch(
            url, {"access_policies": [{"group": self.other_group.id, "can_view": True}]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            list(self.restricted.access_policies.values_list("group_id", "can_view")),
            [(self.other_group.id, True)],
        )

        self.client.patch(url, {"access_policies": []}, format="json")
        self.assertEqual(self.restricted.access_policies.count(), 0)

    def test_duplicate_group_is_rejected(self):
        self.client.force_authenticate(user=self.staff)
        item = {"group": self.group.id, "can_view": True, "can_download": False}
        response = self.client.post(
            f"{API}/datasets/", self._create_payload(access_policies=[item, item]), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Dataset.objects.filter(code="NEW").exists())

    def test_policies_are_hidden_from_non_staff(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.get(f"{API}/datasets/{self.public.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("access_policies", response.data)

        self.client.force_authenticate(user=self.staff)
        response = self.client.get(f"{API}/datasets/{self.restricted.id}/")
        self.assertEqual(len(response.data["access_policies"]), 2)

    def test_policy_endpoint_is_admin_only(self):
        for user in (None, self.member):
            self.client.force_authenticate(user=user)
            response = self.client.get(f"{API}/dataset-access-policies/")
            self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.client.force_authenticate(user=self.staff)
        self.assertEqual(self.client.get(f"{API}/dataset-access-policies/").status_code, status.HTTP_200_OK)

    def test_user_groups_endpoint_is_admin_only(self):
        for user in (None, self.member):
            self.client.force_authenticate(user=user)
            response = self.client.get(f"{API}/user-groups/")
            self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(f"{API}/user-groups/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual({item["name"] for item in response.data}, {"Nhóm phân tích", "Nhóm khác"})
