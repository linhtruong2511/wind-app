from django.contrib.auth.models import Group
from django.db import transaction
from rest_framework import serializers

from wind_core.access import is_staff_user
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


class DatasetVariableSerializer(serializers.ModelSerializer):
    class Meta:
        model = DatasetVariable
        fields = ["id", "variable_code", "variable_name", "unit", "components", "is_component"]


class DatasetPolicySerializer(serializers.Serializer):
    group = serializers.PrimaryKeyRelatedField(queryset=Group.objects.all())
    group_name = serializers.CharField(source="group.name", read_only=True)
    can_view = serializers.BooleanField(default=True)
    can_download = serializers.BooleanField(default=False)


class UserGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["id", "name"]


class DatasetSerializer(serializers.ModelSerializer):
    variables = DatasetVariableSerializer(many=True, read_only=True)
    access_policies = DatasetPolicySerializer(many=True, required=False)

    class Meta:
        model = Dataset
        fields = [
            "id",
            "code",
            "name",
            "category",
            "description",
            "source_provider",
            "spatial_extent",
            "time_start",
            "time_end",
            "temporal_resolution",
            "access_level",
            "access_policies",
            "is_active",
            "created_at",
            "updated_at",
            "variables",
        ]

    def validate_access_policies(self, value):
        group_ids = [item["group"].id for item in value]
        if len(group_ids) != len(set(group_ids)):
            raise serializers.ValidationError("Mỗi nhóm chỉ được chọn một lần.")
        return value

    def create(self, validated_data):
        policies = validated_data.pop("access_policies", None)
        with transaction.atomic():
            dataset = super().create(validated_data)
            self._replace_policies(dataset, policies)
        return dataset

    def update(self, instance, validated_data):
        policies = validated_data.pop("access_policies", None)
        with transaction.atomic():
            dataset = super().update(instance, validated_data)
            self._replace_policies(dataset, policies)
        return dataset

    @staticmethod
    def _replace_policies(dataset, policies):
        if policies is None:
            return
        dataset.access_policies.all().delete()
        # Khi PATCH, serializer lồng chạy ở chế độ partial nên giá trị mặc định không được áp sẵn
        DatasetAccessPolicy.objects.bulk_create(
            DatasetAccessPolicy(
                dataset=dataset,
                group=item["group"],
                can_view=item.get("can_view", True),
                can_query=item.get("can_view", True),
                can_download=item.get("can_download", False),
            )
            for item in policies
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if not is_staff_user(getattr(request, "user", None)):
            data.pop("access_policies", None)
        return data


class DatasetAccessPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = DatasetAccessPolicy
        fields = ["id", "dataset", "group", "can_view", "can_query", "can_download"]


class AlertRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertRule
        fields = ["id", "user", "dataset", "conditions", "area", "is_active", "created_at"]


class AlertNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertNotification
        fields = ["id", "rule", "triggered_at", "triggered_value", "location", "is_read"]


class DownloadRequestItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = DownloadRequestItem
        fields = ["id", "request", "dataset", "variable_codes", "export_format"]


class DownloadFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = DownloadFile
        fields = ["id", "request", "file_path", "file_size_mb", "created_at"]


class DownloadRequestSerializer(serializers.ModelSerializer):
    items = DownloadRequestItemSerializer(many=True, read_only=True)
    files = DownloadFileSerializer(many=True, read_only=True)

    class Meta:
        model = DownloadRequest
        fields = [
            "id",
            "user",
            "aoi_geom",
            "station_ids",
            "time_start",
            "time_end",
            "status",
            "estimated_size_mb",
            "requested_at",
            "completed_at",
            "expires_at",
            "items",
            "files",
        ]


class UserQueryHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserQueryHistory
        fields = ["id", "user", "query_type", "parameters", "created_at"]


class IngestionLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = IngestionLog
        fields = [
            "id",
            "dataset",
            "source_file",
            "status",
            "records_processed",
            "error_message",
            "started_at",
            "finished_at",
        ]


class SystemMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemMetric
        fields = ["id", "metric_name", "metric_value", "recorded_at"]
