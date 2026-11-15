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
