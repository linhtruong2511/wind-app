import csv
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db.models import Avg, Count, Max, Min, Q
from django.db.models.functions import TruncDay, TruncMonth
from django.http import HttpResponse
from django_filters import rest_framework as filters
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_gis.filters import InBBoxFilter

from wind_core.utils import StandardResultsSetPagination
from .models import Observation, Station
from .serializers import (
    ObservationSerializer,
    StationGeoSerializer,
    StationSerializer,
)
from .services.province_service import get_province_geometry, get_provinces_wfs_data
from .services.station_service import (
    calculate_wind_rose_data,
    get_station_summary_data,
)


class StationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API ViewSet cho trạm quan trắc khí tượng gió.
    """
    queryset = Station.objects.filter(is_active=True).order_by("id")
    serializer_class = StationSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardResultsSetPagination
    bbox_filter_field = "geom"
    filter_backends = [filters.DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ["station_type", "dataset__code"]

    def get_queryset(self):
        qs = super().get_queryset()

        # Tìm kiếm theo tên hoặc mã trạm
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(station_code__icontains=search)
            )

        # Lọc theo tỉnh thành an toàn
        province_id = (
            self.request.query_params.get("province_id")
            or self.request.query_params.get("province_code")
            or self.request.query_params.get("province")
        )
        if province_id:
            try:
                province_geom = get_province_geometry(province_id)
                if province_geom:
                    qs = qs.filter(geom__within=province_geom)
            except Exception:
                pass

        return qs

    @action(detail=False, methods=["get"])
    def map(self, request):
        """
        [GET] /wind/api/v1/stations/map/
        Trả về danh sách trạm dưới dạng GeoJSON FeatureCollection phục vụ hiển thị trên bản đồ.
        """
        qs = self.filter_queryset(self.get_queryset())
        serializer = StationGeoSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def spatial_query(self, request):
        """
        [GET] /wind/api/v1/stations/spatial_query/?lat=...&lon=...&radius_km=...
        Truy vấn không gian các trạm quan trắc trong bán kính radius_km.
        """
        lat = request.query_params.get("lat")
        lon = request.query_params.get("lon")
        radius_km = request.query_params.get("radius_km", 10)

        if lat and lon:
            try:
                point = Point(float(lon), float(lat), srid=4326)
                stations = self.filter_queryset(self.get_queryset()).filter(
                    geom__distance_lte=(point, D(km=float(radius_km)))
                )
                page = self.paginate_queryset(stations)
                if page is not None:
                    serializer = self.get_serializer(page, many=True)
                    return self.get_paginated_response(serializer.data)

                serializer = self.get_serializer(stations, many=True)
                return Response(serializer.data)
            except (ValueError, TypeError) as e:
                return Response({"error": f"Invalid coordinates or radius: {e}"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"error": "Missing lat or lon parameters"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"], url_path="monthly-summary")
    def monthly_summary(self, request, pk=None):
        station = self.get_object()
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        data = get_station_summary_data(station, start_date, end_date, "monthly")
        return Response(data)

    @action(detail=True, methods=["get"], url_path="yearly-summary")
    def yearly_summary(self, request, pk=None):
        station = self.get_object()
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        data = get_station_summary_data(station, start_date, end_date, "yearly")
        return Response(data)


class ObservationFilter(filters.FilterSet):
    start_time = filters.DateTimeFilter(field_name="obs_time", lookup_expr="gte")
    end_time = filters.DateTimeFilter(field_name="obs_time", lookup_expr="lte")

    class Meta:
        model = Observation
        fields = ["station", "start_time", "end_time"]


class ObservationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API ViewSet cho dữ liệu quan trắc khí tượng gió.
    """
    queryset = (
        Observation.objects.select_related("station")
        .all()
        .order_by("-obs_time")
    )
    serializer_class = ObservationSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend]
    filterset_class = ObservationFilter


class StatisticsViewSet(viewsets.ViewSet):
    """
    API ViewSet cho Trung Tâm Thống Kê & Phân Tích Dữ Liệu Khí Tượng Gió Chuyên Sâu.
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    @action(detail=False, methods=["get"])
    def overview(self, request):
        qs_stations = Station.objects.filter(is_active=True)
        qs_obs = Observation.objects.all()

        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        if start_date:
            qs_obs = qs_obs.filter(obs_time__gte=start_date)
        if end_date:
            qs_obs = qs_obs.filter(obs_time__lte=end_date)

        total_stations = qs_stations.count()
        total_obs = qs_obs.count()
        time_bounds = qs_obs.aggregate(min_date=Min("obs_time"), max_date=Max("obs_time"))

        types_count = list(
            qs_stations.values("station_type")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        max_wind_obs = (
            qs_obs.filter(wind_speed__isnull=False)
            .select_related("station")
            .order_by("-wind_speed")
            .first()
        )
        max_wind_info = None
        if max_wind_obs:
            max_wind_info = {
                "wind_speed": float(max_wind_obs.wind_speed),
                "station_id": max_wind_obs.station_id,
                "station_name": max_wind_obs.station.name if max_wind_obs.station else "",
                "obs_time": max_wind_obs.obs_time.isoformat() if max_wind_obs.obs_time else ""
            }

        return Response({
            "total_stations": total_stations,
            "active_stations": total_stations,
            "total_observations": total_obs,
            "date_range": time_bounds,
            "stations_by_type": types_count,
            "max_wind_recorded": max_wind_info
        })

    @action(detail=False, methods=["get"])
    def rankings(self, request):
        metric = request.query_params.get("metric", "wind_speed_max")
        limit = int(request.query_params.get("limit", 10))
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        qs = Observation.objects.all()
        if start_date:
            qs = qs.filter(obs_time__gte=start_date)
        if end_date:
            qs = qs.filter(obs_time__lte=end_date)

        field_map = {
            "wind_speed_max": ("wind_speed", Max),
            "wind_speed_avg": ("wind_speed", Avg),
            "temp_max": ("temp_2m", Max),
            "temp_min": ("temp_2m", Min),
            "rain_24h_max": ("rain_24h", Max),
            "pressure_min": ("pressure", Min),
        }
        field_name, agg_func = field_map.get(metric, ("wind_speed", Max))
        is_ascending = metric in ["temp_min", "pressure_min"]

        aggregated = (
            qs.filter(**{f"{field_name}__isnull": False})
            .values("station_id", "station__name", "station__station_code")
            .annotate(val=agg_func(field_name))
            .order_by("val" if is_ascending else "-val")[:limit]
        )

        rankings = []
        for idx, row in enumerate(aggregated, 1):
            rankings.append({
                "rank": idx,
                "station_id": row["station_id"],
                "station_code": row["station__station_code"],
                "station_name": row["station__name"],
                "value": round(float(row["val"]), 2) if row["val"] is not None else None
            })

        return Response({"metric": metric, "rankings": rankings})

    @action(detail=False, methods=["get"], url_path="multi-station-compare")
    def multi_station_compare(self, request):
        station_ids_raw = request.query_params.get("station_ids", "")
        station_ids = [int(s) for s in station_ids_raw.split(",") if s.strip().isdigit()]
        metric = request.query_params.get("metric", "wind_speed")
        interval = request.query_params.get("interval", "month")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        trunc_func = TruncDay if interval == "day" else TruncMonth
        qs = Observation.objects.all()
        if station_ids:
            qs = qs.filter(station_id__in=station_ids)
        if start_date:
            qs = qs.filter(obs_time__gte=start_date)
        if end_date:
            qs = qs.filter(obs_time__lte=end_date)

        raw_data = (
            qs.annotate(period=trunc_func("obs_time"))
            .values("period", "station_id", "station__name")
            .annotate(avg_val=Avg(metric))
            .order_by("period")
        )

        timestamps_set = set()
        station_map = {}
        for row in raw_data:
            if not row["period"]:
                continue
            p_str = row["period"].strftime("%Y-%m-%d") if interval == "day" else row["period"].strftime("%Y-%m")
            timestamps_set.add(p_str)
            s_id = row["station_id"]
            if s_id not in station_map:
                station_map[s_id] = {
                    "station_id": s_id,
                    "station_name": row["station__name"] or f"Trạm {s_id}",
                    "data": {}
                }
            station_map[s_id]["data"][p_str] = round(float(row["avg_val"]), 2) if row["avg_val"] is not None else None

        sorted_timestamps = sorted(list(timestamps_set))
        series = []
        for s_id, s_info in station_map.items():
            series.append({
                "station_id": s_info["station_id"],
                "station_name": s_info["station_name"],
                "values": [s_info["data"].get(t, None) for t in sorted_timestamps]
            })

        return Response({
            "metric": metric,
            "interval": interval,
            "timestamps": sorted_timestamps,
            "series": series
        })

    @action(detail=False, methods=["get"], url_path="wind-rose")
    def wind_rose(self, request):
        station_id = request.query_params.get("station_id")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        qs = Observation.objects.filter(wind_speed__isnull=False, wind_dir__isnull=False)
        if station_id and str(station_id).isdigit():
            qs = qs.filter(station_id=int(station_id))
        if start_date:
            qs = qs.filter(obs_time__gte=start_date)
        if end_date:
            qs = qs.filter(obs_time__lte=end_date)

        data = calculate_wind_rose_data(qs)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="export-csv")
    def export_csv(self, request):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="wind_statistics_summary.csv"'
        writer = csv.writer(response)
        writer.writerow([
            "Station ID", "Station Code", "Station Name",
            "Wind Speed Avg (m/s)", "Wind Speed Max (m/s)",
            "Temp 2m Avg (C)", "Temp Max (C)", "Temp Min (C)",
            "Pressure Avg (hPa)", "Total Records"
        ])

        qs = Station.objects.filter(is_active=True).order_by("id")
        for st in qs:
            obs = Observation.objects.filter(station=st)
            agg = obs.aggregate(
                w_avg=Avg("wind_speed"), w_max=Max("wind_speed"),
                t_avg=Avg("temp_2m"), t_max=Max("temp_2m"), t_min=Min("temp_2m"),
                p_avg=Avg("pressure"), count=Count("id")
            )
            writer.writerow([
                st.id, st.station_code, st.name,
                round(agg["w_avg"] or 0, 2), round(agg["w_max"] or 0, 2),
                round(agg["t_avg"] or 0, 2), round(agg["t_max"] or 0, 2), round(agg["t_min"] or 0, 2),
                round(agg["p_avg"] or 0, 2), agg["count"]
            ])

        return response


class ProvinceWFSFallbackView(APIView):
    """
    Endpoint fallback WFS GeoJSON 63 tỉnh thành phục vụ Frontend MapStore Client
    khi GeoServer / GeoNode chưa được cấu hình.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        data = get_provinces_wfs_data(request)
        return Response(data)
