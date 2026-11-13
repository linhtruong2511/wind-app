from django.contrib.gis.db import models


class RasterGranuleIndex(models.Model):
    dataset = models.ForeignKey(
        "wind_core.Dataset",
        on_delete=models.CASCADE,
        related_name="raster_granules",
        verbose_name="Bộ dữ liệu",
    )
    file_location = models.TextField(verbose_name="Đường dẫn tệp tin")
    granule_time = models.DateTimeField(verbose_name="Thời gian quan trắc / mô phỏng")
    elevation = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Độ cao / Mức áp suất",
    )
    footprint = models.PolygonField(srid=4326, verbose_name="Phạm vi bao phủ")
    variable_code = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        verbose_name="Mã biến",
    )

    class Meta:
        db_table = "wind_raster_granules_index"
        verbose_name = "Chỉ mục dữ liệu Raster"
        verbose_name_plural = "Chỉ mục dữ liệu Raster"
        indexes = [
            models.Index(fields=["dataset", "granule_time"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["dataset", "granule_time"],
                name="uniq_raster_dataset_time",
            ),
        ]

    def __str__(self):
        dataset_name = getattr(self.dataset, "name", "Unknown") if self.dataset_id else "No Dataset"
        return f"{dataset_name} - {self.granule_time}"
