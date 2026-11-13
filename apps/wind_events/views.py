from django_filters import rest_framework as filters
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from wind_core.utils import StandardResultsSetPagination
from wind_stations.models import Observation, Station
from wind_stations.serializers import ObservationSerializer
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

        # 2. Lấy dữ liệu quan trắc của các trạm đó trong thời gian sự kiện diễn ra
        obs_qs = (
            Observation.objects.filter(
                station__in=impacted_stations,
                obs_time__gte=event.start_date,
            )
            .select_related("station")
            .order_by("obs_time")
        )
        if end_date:
            obs_qs = obs_qs.filter(obs_time__lte=end_date)

        page = self.paginate_queryset(obs_qs)
        if page is not None:
            serializer = ObservationSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = ObservationSerializer(obs_qs, many=True)
        return Response(serializer.data)
