from django.contrib.gis.db import models


class MeteorologicalEvent(models.Model):
    event_name = models.CharField(max_length=255, verbose_name="Tên hiện tượng")
    event_type = models.CharField(max_length=32, verbose_name="Loại hiện tượng")
    start_date = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian bắt đầu")
    end_date = models.DateTimeField(null=True, blank=True, verbose_name="Thời gian kết thúc")
    influence_area = models.PolygonField(srid=4326, null=True, blank=True, verbose_name="Khu vực ảnh hưởng")
    max_intensity = models.CharField(max_length=64, null=True, blank=True, verbose_name="Cường độ tối đa")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Thời gian tạo")

    class Meta:
        db_table = "wind_meteorological_events"
        verbose_name = "Hiện tượng khí tượng"
        verbose_name_plural = "Danh sách hiện tượng khí tượng"
        indexes = [
            models.Index(fields=["event_type"]),
        ]

    def __str__(self):
        return self.event_name


class EventTrack(models.Model):
    event = models.ForeignKey(
        MeteorologicalEvent,
        on_delete=models.CASCADE,
        related_name="tracks",
        verbose_name="Hiện tượng khí tượng",
    )
    track_time = models.DateTimeField(verbose_name="Thời điểm ghi nhận")
    geom = models.PointField(srid=4326, verbose_name="Vị trí tọa độ")
    intensity = models.CharField(max_length=64, null=True, blank=True, verbose_name="Cường độ")
    central_pressure = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True, verbose_name="Khí áp tâm (hPa)"
    )
    moving_speed_kmh = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True, verbose_name="Tốc độ di chuyển (km/h)"
    )
    moving_direction = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True, verbose_name="Hướng di chuyển (độ)"
    )

    class Meta:
        db_table = "wind_event_tracks"
        verbose_name = "Quỹ đạo di chuyển hiện tượng"
        verbose_name_plural = "Quỹ đạo di chuyển hiện tượng"
        indexes = [
            models.Index(fields=["event", "track_time"]),
        ]

    def __str__(self):
        return f"{self.event.event_name} @ {self.track_time}"
