import csv
import io
import re
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db.models import Avg, Count, Max, Min, Q
from django.db.models.functions import TruncDay, TruncMonth
from django.http import FileResponse, HttpResponse
from django_filters import rest_framework as filters
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_gis.filters import InBBoxFilter

from wind_core.utils import IsAdminUserOrReadOnly, StandardResultsSetPagination
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
from .services.duckdb_storage_service import (
    get_data_lake_overview,
    list_data_lake_partitions,
    delete_partition,
    get_partition_file_path,
    ingest_dataframe_to_parquet,
    export_lake_data,
    calculate_wind_rose_from_parquet,
    execute_safe_duckdb_query,
)


class StationViewSet(viewsets.ModelViewSet):
    """
    API ViewSet cho trạm quan trắc khí tượng gió.
    """
    queryset = Station.objects.filter(is_active=True).order_by("id")
    serializer_class = StationSerializer
    permission_classes = [IsAdminUserOrReadOnly]
    pagination_class = StandardResultsSetPagination
    bbox_filter_field = "geom"
    filter_backends = [filters.DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ["station_type"]

    def get_queryset(self):
        user = getattr(self.request, "user", None)
        is_staff = user and user.is_authenticated and (user.is_staff or user.is_superuser)
        include_all = str(self.request.query_params.get("all", "")).lower() in ("true", "1")
        if is_staff and include_all:
            qs = Station.objects.all().order_by("id")
        else:
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
        allowed_metrics = {
            "wind_speed", "temp_2m", "temp_min", "temp_max",
            "humidity", "pressure", "rain_06h", "rain_24h", "wind_dir"
        }
        if metric not in allowed_metrics:
            metric = "wind_speed"
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


class DataLakeViewSet(viewsets.ViewSet):
    """
    API ViewSet Quản lý Kho Dữ Liệu Quan Trắc Khí Tượng (DuckDB + Apache Parquet).
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    @action(detail=False, methods=["get"])
    def overview(self, request):
        data = get_data_lake_overview()
        return Response(data)

    @action(detail=False, methods=["get"])
    def partitions(self, request):
        station_code = request.query_params.get("station_code")
        year = request.query_params.get("year")
        year_int = int(year) if year and year.isdigit() else None
        data = list_data_lake_partitions(station_code=station_code, year=year_int)
        return Response(data)

    @action(detail=False, methods=["post"], url_path="import-file", permission_classes=[permissions.IsAdminUser])
    def import_file(self, request):
        uploaded_file = request.FILES.get("file")
        dry_run = str(request.data.get("dry_run", "false")).lower() in ("true", "1")
        if not uploaded_file:
            return Response({"error": "Vui lòng chọn tệp CSV hoặc Excel."}, status=status.HTTP_400_BAD_REQUEST)

        import pandas as pd
        try:
            if uploaded_file.name.endswith(".csv"):
                df = pd.read_csv(uploaded_file)
            else:
                df = pd.read_excel(uploaded_file)
        except Exception as e:
            return Response({"error": f"Không thể đọc tệp: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        cols_lower = [str(c).strip().lower() for c in df.columns]
        if "station_code" not in cols_lower or "obs_time" not in cols_lower:
            return Response({"error": "Tệp thiếu các cột bắt buộc: 'station_code' và 'obs_time'."}, status=status.HTTP_400_BAD_REQUEST)

        obs_col = [c for c in df.columns if str(c).strip().lower() == "obs_time"][0]
        st_col = [c for c in df.columns if str(c).strip().lower() == "station_code"][0]
        parsed_dates = pd.to_datetime(df[obs_col], errors="coerce")
        valid_rows = parsed_dates.notnull() & df[st_col].notnull()

        if dry_run:
            sample_df = df[valid_rows].head(10)
            years = [int(y) for y in parsed_dates[valid_rows].dt.year.unique().tolist() if pd.notnull(y)]
            stations = df[st_col][valid_rows].astype(str).str.strip().unique().tolist()
            preview_df = sample_df.astype(object).where(sample_df.notnull(), None)
            preview = preview_df.to_dict(orient="records")
            
            return Response({
                "valid": True,
                "total_rows": int(valid_rows.sum()),
                "stations_affected": stations,
                "years_affected": years,
                "preview": preview,
            })

        try:
            res = ingest_dataframe_to_parquet(df[valid_rows])
            return Response(res)
        except Exception as e:
            return Response({"error": f"Lỗi khi nạp dữ liệu vào kho Parquet: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=["get"])
    def download(self, request):
        # Lưu ý: không dùng tên tham số "format" vì DRF dành riêng tham số này để chọn bộ render
        # (?format=csv / ?format=parquet sẽ bị trả về 404 "Không tìm thấy." trước khi vào view).
        station_code = request.query_params.get("station_code")
        year = request.query_params.get("year")
        fmt = request.query_params.get("file_format", "parquet").lower()

        if fmt not in ("parquet", "csv"):
            return Response({"error": "Định dạng tệp không hợp lệ. Chỉ hỗ trợ parquet hoặc csv."}, status=status.HTTP_400_BAD_REQUEST)

        if station_code and (not re.fullmatch(r"[\w\-.]+", station_code) or station_code in (".", "..")):
            return Response({"error": "Mã trạm không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)
        if year and not year.isdigit():
            return Response({"error": "Năm không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

        # Tải nguyên tệp phân vùng khi chỉ định đủ trạm và năm
        if fmt == "parquet" and station_code and year:
            file_path = get_partition_file_path(station_code, int(year))
            if not file_path or not file_path.exists():
                return Response({"error": "Tệp phân vùng không tồn tại."}, status=status.HTTP_404_NOT_FOUND)
            response = FileResponse(open(file_path, "rb"), content_type="application/octet-stream")
            response["Content-Disposition"] = f'attachment; filename="{station_code}_{year}.parquet"'
            return response

        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        cols_param = request.query_params.get("columns")
        cols = [c.strip() for c in cols_param.split(",") if c.strip()] if cols_param else None

        df = export_lake_data(station_code=station_code, start_date=start_date, end_date=end_date, columns=cols, fmt=fmt)
        if df is None or df.empty:
            return Response({"error": "Không có dữ liệu thỏa mãn điều kiện lọc."}, status=status.HTTP_404_NOT_FOUND)

        fname_base = f"{station_code or 'all_stations'}_export"
        if fmt == "parquet":
            buffer = io.BytesIO()
            df.to_parquet(buffer, index=False)
            response = HttpResponse(buffer.getvalue(), content_type="application/octet-stream")
            response["Content-Disposition"] = f'attachment; filename="{fname_base}.parquet"'
            return response

        response = HttpResponse(df.to_csv(index=False), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{fname_base}.csv"'
        return response

    @action(detail=False, methods=["delete", "post"], url_path="delete-partition", permission_classes=[permissions.IsAdminUser])
    def delete_partition_action(self, request):
        station_code = request.query_params.get("station_code") or request.data.get("station_code")
        year = request.query_params.get("year") or request.data.get("year")
        if not station_code or not year:
            return Response({"error": "Thiếu tham số station_code hoặc year."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ok = delete_partition(station_code, int(year))
            if ok:
                return Response({"message": f"Đã xóa thành công phân vùng {station_code} năm {year}."})
            return Response({"error": "Không tìm thấy tệp phân vùng để xóa."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=["post"], url_path="query")
    def query_analytics(self, request):
        template = request.data.get("template")
        station_code = request.data.get("station_code")
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")
        sql = request.data.get("sql")

        try:
            if template == "wind_rose":
                data = calculate_wind_rose_from_parquet(station_code, start_date, end_date)
                return Response(data)
            elif sql:
                data = execute_safe_duckdb_query(sql)
                return Response(data)
            else:
                return Response({"error": "Vui lòng chọn mẫu phân tích hoặc cung cấp câu lệnh SQL."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": f"Lỗi phân tích DuckDB: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["post"], url_path="sync-from-db", permission_classes=[permissions.IsAdminUser])
    def sync_from_db(self, request):
        from .models import Observation
        qs = Observation.objects.select_related("station").all()
        if not qs.exists():
            return Response({"message": "Không có dữ liệu trong bảng Observation để đồng bộ.", "count": 0})

        import pandas as pd
        records = []
        for obs in qs:
            records.append({
                "station_code": obs.station.station_code,
                "obs_time": obs.obs_time,
                "wind_speed": float(obs.wind_speed) if obs.wind_speed is not None else None,
                "wind_dir": float(obs.wind_dir) if obs.wind_dir is not None else None,
                "temp_2m": float(obs.temp_2m) if obs.temp_2m is not None else None,
                "temp_min": float(obs.temp_min) if obs.temp_min is not None else None,
                "temp_max": float(obs.temp_max) if obs.temp_max is not None else None,
                "humidity": float(obs.humidity) if obs.humidity is not None else None,
                "pressure": float(obs.pressure) if obs.pressure is not None else None,
                "rain_06h": float(obs.rain_06h) if obs.rain_06h is not None else None,
                "rain_24h": float(obs.rain_24h) if obs.rain_24h is not None else None,
            })
        df = pd.DataFrame(records)
        res = ingest_dataframe_to_parquet(df)
        return Response({"message": f"Đã đồng bộ {len(records)} bản ghi từ CSDL sang Kho Parquet.", "result": res})

