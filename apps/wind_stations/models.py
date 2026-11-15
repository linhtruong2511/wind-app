from django.contrib.gis.db import models


class Station(models.Model):
    station_code = models.CharField(max_length=32, verbose_name="Mã trạm")
    name = models.CharField(max_length=255, verbose_name="Tên trạm")
    geom = models.PointField(srid=4326, verbose_name="Tọa độ vị trí")
    elevation = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True, verbose_name="Độ cao địa hình (m)"
    )
    station_type = models.CharField(max_length=32, null=True, blank=True, verbose_name="Loại trạm")
    is_active = models.BooleanField(default=True, verbose_name="Đang hoạt động")

    class Meta:
        db_table = "wind_stations"
        verbose_name = "Trạm quan trắc"
        verbose_name_plural = "Danh sách trạm quan trắc"

    def __str__(self):
        return f"{self.name} ({self.station_code})"


class Observation(models.Model):
    station = models.ForeignKey(
        Station,
        on_delete=models.CASCADE,
        related_name="observations",
        verbose_name="Trạm quan trắc",
    )
    obs_time = models.DateTimeField(verbose_name="Thời gian quan trắc")
    rain_06h = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True, verbose_name="Lượng mưa 6h (mm)"
    )
    rain_24h = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True, verbose_name="Lượng mưa 24h (mm)"
    )
    temp_2m = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, verbose_name="Nhiệt độ 2m (°C)"
    )
    temp_min = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, verbose_name="Nhiệt độ thấp nhất (°C)"
    )
    temp_max = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, verbose_name="Nhiệt độ cao nhất (°C)"
    )
    humidity = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, verbose_name="Độ ẩm (%)"
    )
    pressure = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True, verbose_name="Khí áp (hPa)"
    )
    wind_dir = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True, verbose_name="Hướng gió (độ)"
    )
    wind_speed = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, verbose_name="Tốc độ gió (m/s)"
    )

    class Meta:
        db_table = "wind_observations"
        verbose_name = "Dữ liệu quan trắc"
        verbose_name_plural = "Dữ liệu quan trắc"
        indexes = [
            models.Index(fields=["station", "obs_time"]),
        ]

    def __str__(self):
        return f"{self.station.station_code} @ {self.obs_time}"
