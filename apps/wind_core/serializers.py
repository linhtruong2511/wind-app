from rest_framework import serializers

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


class DatasetSerializer(serializers.ModelSerializer):
    variables = DatasetVariableSerializer(many=True, read_only=True)

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
            "is_active",
            "created_at",
            "updated_at",
            "variables",
        ]


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
