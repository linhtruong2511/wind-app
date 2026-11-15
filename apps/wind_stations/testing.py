"""Tiện ích dùng chung cho test cần số liệu quan trắc trong kho Parquet."""

import tempfile

import pandas as pd
from django.test import override_settings

from wind_stations.services.duckdb_storage_service import ingest_dataframe_to_parquet
from wind_stations.services.observation_lake_service import invalidate_latest_cache


class LakeTestMixin:
    """
    Dùng thư mục tạm làm kho dữ liệu quan trắc cho từng test.
    Đặt mixin trước TestCase trong danh sách kế thừa.
    """

    def setUp(self):
        super().setUp()
        tmp = tempfile.TemporaryDirectory()
        override = override_settings(MEDIA_ROOT=tmp.name)
        override.enable()
        self.addCleanup(tmp.cleanup)
        self.addCleanup(override.disable)
        self.addCleanup(invalidate_latest_cache)
        invalidate_latest_cache()

    def write_observations(self, rows):
        """rows: danh sách dict có station_code, obs_time và các chỉ số khí tượng."""
        result = ingest_dataframe_to_parquet(pd.DataFrame(rows))
        self.assertTrue(result["success"])
        return result
