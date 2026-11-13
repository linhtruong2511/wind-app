from django.contrib import admin

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


@admin.register(Dataset)
class DatasetAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "category", "access_level", "is_active", "created_at")
    list_filter = ("category", "access_level", "is_active")
    search_fields = ("code", "name")


@admin.register(DatasetVariable)
class DatasetVariableAdmin(admin.ModelAdmin):
    list_display = ("variable_code", "variable_name", "dataset", "unit", "is_component")
    list_filter = ("dataset", "is_component")
    search_fields = ("variable_code", "variable_name")


@admin.register(DatasetAccessPolicy)
class DatasetAccessPolicyAdmin(admin.ModelAdmin):
    list_display = ("dataset", "group", "can_view", "can_query", "can_download")
    list_filter = ("dataset", "group")


@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = ("user", "dataset", "is_active", "created_at")
    list_filter = ("is_active",)


@admin.register(AlertNotification)
class AlertNotificationAdmin(admin.ModelAdmin):
    list_display = ("rule", "triggered_at", "is_read")
    list_filter = ("is_read",)


@admin.register(DownloadRequest)
class DownloadRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "status", "estimated_size_mb", "requested_at")
    list_filter = ("status",)


@admin.register(DownloadRequestItem)
class DownloadRequestItemAdmin(admin.ModelAdmin):
    list_display = ("request", "dataset", "export_format")


@admin.register(DownloadFile)
class DownloadFileAdmin(admin.ModelAdmin):
    list_display = ("id", "request", "file_size_mb", "created_at")


@admin.register(UserQueryHistory)
class UserQueryHistoryAdmin(admin.ModelAdmin):
    list_display = ("user", "query_type", "created_at")
    list_filter = ("query_type",)


@admin.register(IngestionLog)
class IngestionLogAdmin(admin.ModelAdmin):
    list_display = ("dataset", "source_file", "status", "records_processed", "started_at")
    list_filter = ("status",)


@admin.register(SystemMetric)
class SystemMetricAdmin(admin.ModelAdmin):
    list_display = ("metric_name", "metric_value", "recorded_at")
    list_filter = ("metric_name",)
