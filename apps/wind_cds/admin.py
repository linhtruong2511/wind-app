from django.contrib import admin

from .models import CDSCredential, CDSDownloadJob, CDSJobRun


@admin.register(CDSCredential)
class CDSCredentialAdmin(admin.ModelAdmin):
    list_display = ("name", "url", "masked_key", "is_active", "updated_at")
    search_fields = ("name", "url")
    list_filter = ("is_active",)


@admin.register(CDSDownloadJob)
class CDSDownloadJobAdmin(admin.ModelAdmin):
    list_display = ("name", "credential", "dataset", "mode", "status", "last_run_at", "auto_latest")
    list_filter = ("mode", "status", "auto_latest")
    search_fields = ("name", "dataset_name")


@admin.register(CDSJobRun)
class CDSJobRunAdmin(admin.ModelAdmin):
    list_display = ("id", "job", "status", "started_at", "finished_at")
    list_filter = ("status", "started_at")
    search_fields = ("job__name",)
    readonly_fields = ("started_at", "finished_at")
