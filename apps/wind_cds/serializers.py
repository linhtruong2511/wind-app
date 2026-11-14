from rest_framework import serializers

from .models import CDSCredential, CDSDownloadJob, CDSJobRun


class CDSCredentialSerializer(serializers.ModelSerializer):
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    masked_key = serializers.CharField(read_only=True)

    class Meta:
        model = CDSCredential
        fields = [
            "id",
            "name",
            "url",
            "api_key",
            "masked_key",
            "is_active",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        key = validated_data.pop("api_key", None)
        instance = super().create(validated_data)
        if key is not None:
            instance.set_key(key)
            instance.save(update_fields=["encrypted_key"])
        return instance

    def update(self, instance, validated_data):
        key = validated_data.pop("api_key", None)
        instance = super().update(instance, validated_data)
        if key is not None:
            instance.set_key(key)
            instance.save(update_fields=["encrypted_key"])
        return instance


class CDSDownloadJobSerializer(serializers.ModelSerializer):
    credential_name = serializers.CharField(source="credential.name", read_only=True)
    dataset_code = serializers.CharField(source="dataset.code", read_only=True)
    runs_count = serializers.IntegerField(source="runs.count", read_only=True)

    class Meta:
        model = CDSDownloadJob
        fields = [
            "id",
            "name",
            "credential",
            "credential_name",
            "dataset",
            "dataset_code",
            "dataset_name",
            "request_params",
            "mode",
            "schedule",
            "periodic_task",
            "auto_latest",
            "lag_days",
            "status",
            "last_run_at",
            "runs_count",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["periodic_task", "last_run_at", "created_at"]


class CDSJobRunSerializer(serializers.ModelSerializer):
    job_name = serializers.CharField(source="job.name", read_only=True)

    class Meta:
        model = CDSJobRun
        fields = [
            "id",
            "job",
            "job_name",
            "status",
            "request_snapshot",
            "file_path",
            "ingestion_log",
            "error_message",
            "started_at",
            "finished_at",
        ]
        read_only_fields = ["started_at", "finished_at"]
