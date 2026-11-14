import sys
from django.contrib.auth.models import AbstractUser
from django.db import models


class Profile(AbstractUser):
    organization = models.CharField(max_length=255, blank=True, null=True)
    profile = models.TextField(blank=True, null=True)
    position = models.CharField(max_length=255, blank=True, null=True)
    voice = models.CharField(max_length=255, blank=True, null=True)
    fax = models.CharField(max_length=255, blank=True, null=True)
    delivery = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=255, blank=True, null=True)
    area = models.CharField(max_length=255, blank=True, null=True)
    zipcode = models.CharField(max_length=255, blank=True, null=True)
    country = models.CharField(max_length=3, blank=True, null=True)
    language = models.CharField(max_length=10, default="vi")
    timezone = models.CharField(max_length=100, default="Asia/Ho_Chi_Minh")
    extra_data = models.JSONField(default=dict)

    class Meta:
        db_table = "people_profile"
        managed = "test" in sys.argv or "pytest" in sys.modules

    def __str__(self):
        return self.username
