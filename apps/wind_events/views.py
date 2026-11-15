from django_filters import rest_framework as filters
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from wind_core.utils import StandardResultsSetPagination
from wind_stations.models import Station
from wind_stations.services import observation_lake_service as lake
from .models import MeteorologicalEvent
from .serializers import MeteorologicalEventSerializer


class MeteorologicalEventViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API cho Nhóm A3: Đường đi bão/KKL (Hiển thị quỹ đạo và vùng ảnh hưởng của sự kiện).
    """

    queryset = MeteorologicalEvent.objects.all().order_by("id")
    serializer_class = MeteorologicalEventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["event_type"]

    @action(detail=True, methods=["get"])
    def impacted_observations(self, request, pk=None):
        """
        API cho Nhóm B3: Truy vấn theo sự kiện (Lấy dữ liệu trạm quan trắc nằm trong vùng ảnh hưởng và khoảng thời gian của bão/KKL).
        """
        event = self.get_object()
        if not event.influence_area or not event.start_date:
            return Response(
                {"error": "Event lacks spatial or temporal data"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        end_date = event.end_date
        if not end_date:
            last_track = event.tracks.order_by("track_time").last()
            end_date = getattr(last_track, "track_time", None)

        # 1. Tìm các trạm nằm trong vùng ảnh hưởng
        impacted_stations = Station.objects.filter(
            geom__intersects=event.influence_area
        )

        # 2. Lấy dữ liệu quan trắc của các trạm đó trong thời gian sự kiện diễn ra từ kho dữ liệu quan trắc
        code_to_id = dict(impacted_stations.values_list("station_code", "id"))
        obs_rows = lake.ObservationRows(
            list(code_to_id.keys()),
            code_to_id,
            start=lake.parse_time_filter(event.start_date),
            end=lake.parse_time_filter(end_date),
            descending=False,
        )

        page = self.paginate_queryset(obs_rows)
        if page is not None:
            return self.get_paginated_response(page)

        return Response(obs_rows[0:])
