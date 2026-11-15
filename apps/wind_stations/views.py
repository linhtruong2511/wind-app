import csv
import io
import re
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db.models import Count, Q
from django.http import FileResponse, HttpResponse
from django_filters import rest_framework as filters
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_gis.filters import InBBoxFilter

from wind_core.utils import IsAdminUserOrReadOnly, StandardResultsSetPagination
from .models import Station
from .serializers import (
    StationGeoSerializer,
    StationSerializer,
)
from .services import observation_lake_service as lake
from .services import station_csv_service as station_csv
from .services.province_service import get_province_geometry, get_provinces_wfs_data
from .services.station_service import get_station_summary_data
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


def _time_range(params, start_key="start_date", end_key="end_date"):
    """Đọc khoảng thời gian từ query params, trả về lỗi 400 nếu định dạng không hợp lệ."""
    try:
        return lake.parse_time_filter(params.get(start_key)), lake.parse_time_filter(params.get(end_key))
    except ValueError as exc:
        raise ValidationError({"detail": str(exc)})


def _csv_response(content, filename):
    response = HttpResponse(content, content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


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

    @action(detail=False, methods=["get"], url_path="download-template")
    def download_template(self, request):
        """
        [GET] /wind/api/v1/stations/download-template/
        Tải tệp CSV mẫu để điền danh sách trạm.
        """
        return _csv_response(station_csv.build_template_csv(), "mau_danh_sach_tram_do.csv")

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """
        [GET] /wind/api/v1/stations/export/
        Xuất toàn bộ trạm (không phân trang) ra tệp CSV, áp dụng cùng bộ lọc với danh sách:
        all, search, station_type, province_id.
        """
        qs = self.filter_queryset(self.get_queryset())
        return _csv_response(station_csv.build_export_csv(qs), "danh_sach_tram_do.csv")

    @action(
        detail=False,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_stations(self, request):
        """
        [POST] /wind/api/v1/stations/import/  (multipart: file, dry_run)
        Thêm mới hoặc cập nhật trạm theo mã trạm từ tệp CSV.
        dry_run=true chỉ kiểm tra tệp và trả kết quả dự kiến, không ghi dữ liệu.
        """
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"error": "Vui lòng chọn tệp CSV."}, status=status.HTTP_400_BAD_REQUEST)
        dry_run = str(request.data.get("dry_run", "false")).lower() in ("true", "1")
        try:
            result = station_csv.import_stations_from_csv(uploaded_file, dry_run=dry_run)
        except station_csv.StationCsvError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

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
        start_date, end_date = _time_range(request.query_params)
        data = get_station_summary_data(station, start_date, end_date, "monthly")
        return Response(data)

    @action(detail=True, methods=["get"], url_path="yearly-summary")
    def yearly_summary(self, request, pk=None):
        station = self.get_object()
        start_date, end_date = _time_range(request.query_params)
        data = get_station_summary_data(station, start_date, end_date, "yearly")
        return Response(data)


class ObservationViewSet(viewsets.ViewSet):
    """
    API danh sách số liệu quan trắc khí tượng gió, đọc từ kho dữ liệu quan trắc.
    Hỗ trợ lọc theo station (id trạm), start_time, end_time và phân trang.
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def list(self, request):
        code_to_id = lake.get_station_code_map()
        station_param = request.query_params.get("station")
        if station_param not in (None, ""):
            id_to_code = {station_id: code for code, station_id in code_to_id.items()}
            code = id_to_code.get(int(station_param)) if str(station_param).isdigit() else None
            station_codes = [code] if code else []
        else:
            station_codes = list(code_to_id.keys())

        start_time, end_time = _time_range(request.query_params, "start_time", "end_time")
        rows = lake.ObservationRows(station_codes, code_to_id, start_time, end_time, descending=True)

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response(page)


class StatisticsViewSet(viewsets.ViewSet):
    """
    API ViewSet cho Trung Tâm Thống Kê & Phân Tích Dữ Liệu Khí Tượng Gió Chuyên Sâu.
    Số liệu được đọc từ kho dữ liệu quan trắc, chỉ tính các trạm có trong danh sách trạm.
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    @action(detail=False, methods=["get"])
    def overview(self, request):
        qs_stations = Station.objects.filter(is_active=True)
        start_date, end_date = _time_range(request.query_params)

        code_to_id = lake.get_station_code_map()
        summary = lake.get_overview(list(code_to_id.keys()), start_date, end_date)

        total_stations = qs_stations.count()
        types_count = list(
            qs_stations.values("station_type")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        max_wind_info = None
        top = summary["max_wind"]
        if top:
            station = Station.objects.filter(station_code=top["station_code"]).first()
            max_wind_info = {
                "wind_speed": top["wind_speed"],
                "station_id": code_to_id.get(top["station_code"]),
                "station_name": station.name if station else "",
                "obs_time": top["obs_time"] or "",
            }

        return Response({
            "total_stations": total_stations,
            "active_stations": total_stations,
            "total_observations": summary["total_observations"],
            "date_range": {"min_date": summary["min_date"], "max_date": summary["max_date"]},
            "stations_by_type": types_count,
            "max_wind_recorded": max_wind_info,
        })

    @action(detail=False, methods=["get"])
    def rankings(self, request):
        metric = request.query_params.get("metric", "wind_speed_max")
        try:
            limit = int(request.query_params.get("limit", 10))
        except (TypeError, ValueError):
            raise ValidationError({"detail": "Giá trị limit không hợp lệ."})
        start_date, end_date = _time_range(request.query_params)

        stations = {s.station_code: s for s in Station.objects.all()}
        ranked = lake.get_rankings(list(stations.keys()), metric, limit, start_date, end_date)

        rankings = []
        for idx, row in enumerate(ranked, 1):
            station = stations[row["station_code"]]
            rankings.append({
                "rank": idx,
                "station_id": station.id,
                "station_code": station.station_code,
                "station_name": station.name,
                "value": row["value"],
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
        start_date, end_date = _time_range(request.query_params)

        stations_qs = Station.objects.all()
        if station_ids:
            stations_qs = stations_qs.filter(id__in=station_ids)
        stations = {s.station_code: s for s in stations_qs}

        raw_data = lake.get_period_averages(list(stations.keys()), metric, interval, start_date, end_date)

        timestamps_set = set()
        station_map = {}
        for row in raw_data:
            if not row["period"]:
                continue
            p_str = row["period"].strftime("%Y-%m-%d") if interval == "day" else row["period"].strftime("%Y-%m")
            timestamps_set.add(p_str)
            station = stations[row["station_code"]]
            if station.id not in station_map:
                station_map[station.id] = {
                    "station_id": station.id,
                    "station_name": station.name or f"Trạm {station.id}",
                    "data": {}
                }
            avg_val = row["avg_val"]
            station_map[station.id]["data"][p_str] = round(float(avg_val), 2) if avg_val is not None else None

        sorted_timestamps = sorted(timestamps_set)
        series = []
        for s_info in station_map.values():
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
        start_date, end_date = _time_range(request.query_params)

        stations_qs = Station.objects.all()
        if station_id and str(station_id).isdigit():
            stations_qs = stations_qs.filter(id=int(station_id))
        station_codes = list(stations_qs.values_list("station_code", flat=True))

        return Response(lake.get_wind_rose(station_codes, start_date, end_date))

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

        stations = list(Station.objects.filter(is_active=True).order_by("id"))
        aggregates = lake.get_station_aggregates([st.station_code for st in stations])
        for st in stations:
            agg = aggregates.get(st.station_code, {})
            writer.writerow([
                st.id, st.station_code, st.name,
                round(agg.get("w_avg") or 0, 2), round(agg.get("w_max") or 0, 2),
                round(agg.get("t_avg") or 0, 2), round(agg.get("t_max") or 0, 2), round(agg.get("t_min") or 0, 2),
                round(agg.get("p_avg") or 0, 2), int(agg.get("cnt") or 0)
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

