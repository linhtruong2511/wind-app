import csv
import hashlib
import json

import numpy as np
from django.core.cache import cache
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Count, Max, Q
from django_filters import rest_framework as django_filters
from rest_framework import filters as drf_filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.renderers import BrowsableAPIRenderer, JSONRenderer
from rest_framework.response import Response
from rest_framework_gis.filters import InBBoxFilter

from wind_core.utils import IsAdminUserOrReadOnly, StandardResultsSetPagination
from . import interpolation
from .models import (
    AnalysisJob,
    AnalysisResult,
    ExtremeEvent,
    WindFarm,
    WindTurbine,
)
from .serializers import (
    AnalysisJobSerializer,
    AnalysisResultSerializer,
    ExtremeEventSerializer,
    WindFarmDetailSerializer,
    WindFarmSerializer,
    WindTurbineGeoSerializer,
    WindTurbineSerializer,
)


class GeoJSONRenderer(JSONRenderer):
    format = "geojson"
    media_type = "application/geo+json"


class WindEnergyPagination(StandardResultsSetPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 1000

    def get_page_size(self, request):
        if "pageSize" in request.query_params:
            try:
                return min(int(request.query_params["pageSize"]), self.max_page_size)
            except (ValueError, TypeError):
                pass
        return super().get_page_size(request)


class WindFarmViewSet(viewsets.ModelViewSet):
    """
    API ViewSet cho Trang trại gió (Wind Farm).
    """

    queryset = WindFarm.objects.all().order_by("id")
    serializer_class = WindFarmSerializer
    permission_classes = [IsAdminUserOrReadOnly]
    pagination_class = WindEnergyPagination
    renderer_classes = [JSONRenderer, BrowsableAPIRenderer, GeoJSONRenderer]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        drf_filters.SearchFilter,
        drf_filters.OrderingFilter,
    ]
    filterset_fields = ["status", "code"]
    search_fields = ["code", "name", "location_name", "description"]
    ordering_fields = ["code", "name", "total_capacity_mw", "created_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return WindFarmDetailSerializer
        return WindFarmSerializer

    @action(detail=True, methods=["get"])
    def turbines(self, request, pk=None):
        """
        [GET] /api/energy/farms/{id}/turbines/
        Lấy danh sách tuabin thuộc trang trại gió này.
        """
        farm = self.get_object()
        turbines_qs = farm.turbines.all().order_by("point_id")

        format_param = request.query_params.get("format")
        geojson_param = request.query_params.get("geojson")
        as_geojson_param = request.query_params.get("as_geojson")
        output_param = request.query_params.get("output")

        if (
            format_param == "geojson"
            or geojson_param in ["true", "1", True]
            or as_geojson_param in ["true", "1", True]
            or output_param == "geojson"
        ):
            serializer = WindTurbineGeoSerializer(turbines_qs, many=True)
            return Response(serializer.data)

        page = self.paginate_queryset(turbines_qs)
        if page is not None:
            serializer = WindTurbineSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = WindTurbineSerializer(turbines_qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def map(self, request):
        """
        [GET] /api/energy/farms/map/
        Trả về GeoJSON FeatureCollection của các tuabin theo farm_code/farm_id hoặc toàn bộ.
        """
        farm_code = request.query_params.get("farm_code")
        farm_id = request.query_params.get("farm") or request.query_params.get("farm_id")

        turbines_qs = WindTurbine.objects.select_related("farm").all().order_by("point_id")
        if farm_code:
            turbines_qs = turbines_qs.filter(farm__code=farm_code)
        if farm_id:
            turbines_qs = turbines_qs.filter(farm_id=farm_id)

        serializer = WindTurbineGeoSerializer(turbines_qs, many=True)
        return Response(serializer.data)


class WindTurbineViewSet(viewsets.ModelViewSet):
    """
    API ViewSet cho Tuabin gió (Wind Turbine).
    Hỗ trợ lọc theo công suất, độ sâu, loại móng cố định/móng nổi, vùng biển, và không gian (BBox).
    """

    queryset = WindTurbine.objects.select_related("farm").all().order_by("point_id", "id")
    serializer_class = WindTurbineSerializer
    permission_classes = [IsAdminUserOrReadOnly]
    pagination_class = WindEnergyPagination
    renderer_classes = [JSONRenderer, BrowsableAPIRenderer, GeoJSONRenderer]
    bbox_filter_field = "geom"
    filter_backends = [
        django_filters.DjangoFilterBackend,
        InBBoxFilter,
        drf_filters.OrderingFilter,
    ]
    filterset_fields = ["farm", "status"]
    ordering_fields = [
        "point_id",
        "predicted_power_mw",
        "wind_speed_100m",
        "sea_depth",
        "capacity_factor",
    ]

    EXPORT_COLUMNS = [
        ("ma_trang_trai", lambda t: t.farm.code),
        ("ten_trang_trai", lambda t: t.farm.name),
        ("ma_tuabin", lambda t: t.point_id),
        ("ten_diem", lambda t: t.name),
        ("vung_bien", lambda t: t.zone),
        ("kinh_do", lambda t: t.longitude),
        ("vi_do", lambda t: t.latitude),
        ("toc_do_gio_100m", lambda t: t.wind_speed_100m),
        ("huong_gio", lambda t: t.wind_direction),
        ("do_sau_m", lambda t: t.sea_depth),
        ("loai_mong", lambda t: t.get_foundation_type_display()),
        ("cong_suat_mw", lambda t: t.predicted_power_mw),
        ("he_so_cong_suat", lambda t: t.capacity_factor),
        ("trang_thai", lambda t: t.get_status_display()),
    ]

    @staticmethod
    def _float_param(params, *names):
        for name in names:
            value = params.get(name)
            if value not in (None, ""):
                try:
                    return float(value)
                except (ValueError, TypeError):
                    return None
        return None

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        # 1. Tìm kiếm tổng hợp (mã điểm nếu số; tên điểm, vùng biển, trang trại nếu chữ)
        search = params.get("search")
        if search:
            search_str = search.strip()
            if search_str.isdigit():
                qs = qs.filter(point_id=int(search_str))
            elif search_str:
                qs = qs.filter(
                    Q(name__icontains=search_str)
                    | Q(zone__icontains=search_str)
                    | Q(farm__name__icontains=search_str)
                    | Q(farm__code__icontains=search_str)
                )

        # 2. Lọc theo trang trại
        farm_id = params.get("farm") or params.get("farm_id")
        if farm_id:
            qs = qs.filter(farm_id=farm_id)

        farm_code = params.get("farm_code")
        if farm_code:
            qs = qs.filter(farm__code=farm_code)

        # 3. Lọc theo công suất
        min_power = self._float_param(params, "min_power", "minPower")
        if min_power is not None:
            qs = qs.filter(predicted_power_mw__gte=min_power)

        max_power = self._float_param(params, "max_power", "maxPower")
        if max_power is not None:
            qs = qs.filter(predicted_power_mw__lte=max_power)

        # 4. Lọc theo độ sâu
        min_depth = self._float_param(params, "min_depth", "minDepth")
        if min_depth is not None:
            qs = qs.filter(sea_depth__gte=min_depth)

        max_depth = self._float_param(params, "max_depth", "maxDepth")
        if max_depth is not None:
            qs = qs.filter(sea_depth__lte=max_depth)

        # 5. Lọc theo loại móng (fixed / floating)
        foundation_type = params.get("foundation_type") or params.get("foundationType")
        if foundation_type:
            ft = foundation_type.strip().upper()
            if ft in ("FIXED", "FLOATING"):
                qs = qs.filter(foundation_type=ft)

        # 6. Lọc theo vùng biển
        zone = params.get("zone")
        if zone and zone.strip():
            qs = qs.filter(zone__iexact=zone.strip())

        return qs

    @action(detail=False, methods=["get"])
    def map(self, request):
        """
        [GET] /api/energy/turbines/map/
        Trả về GeoJSON FeatureCollection của các tuabin theo bộ lọc.
        """
        qs = self.filter_queryset(self.get_queryset())
        serializer = WindTurbineGeoSerializer(qs, many=True)
        return Response(serializer.data)

    # ------------------------------------------------------------------
    # Nội suy không gian
    # ------------------------------------------------------------------
    # Chỉ số nội suy -> trường dữ liệu của tuabin
    INTERPOLATION_METRICS = {
        "predicted_power_mw": "predicted_power_mw",
        "wind_speed_100m": "wind_speed_100m",
        "depth_m": "sea_depth",
    }
    INTERPOLATION_DEFAULT_SIZE = (140, 160)
    INTERPOLATION_MAX_SIZE = 400
    INTERPOLATION_PAD_DEG = 0.15
    INTERPOLATION_POINT_MAX_KM = (
        interpolation.DEFAULT_MAX_DISTANCE_KM + interpolation.DEFAULT_FADE_KM
    )
    INTERPOLATION_CACHE_SECONDS = 60 * 60

    @staticmethod
    def _interpolation_filter_params(params):
        """Các tham số lọc dữ liệu, dùng để tạo khóa bộ nhớ đệm."""
        # Các tham số này đã nằm trong phần còn lại của khóa sau khi chuẩn hóa, không đưa vào hai lần
        ignored = {"method", "metric", "width", "height", "bbox", "lon", "lat"}
        return sorted((k, v) for k, v in params.items() if k not in ignored)

    def _interpolation_cache_key(self, kind, request, qs, extra):
        stats = qs.aggregate(total=Count("id"), latest=Max("updated_at"))
        raw = json.dumps(
            [kind, self._interpolation_filter_params(request.query_params), extra, stats["total"], str(stats["latest"])],
            default=str,
        )
        return f"wind_energy:interpolation:{hashlib.sha1(raw.encode()).hexdigest()}"

    @staticmethod
    def _parse_interpolation_method(params):
        method = (params.get("method") or "idw").strip().lower()
        if method not in interpolation.METHODS:
            raise ValueError("Phương pháp nội suy không hợp lệ.")
        return method

    def _parse_interpolation_metric(self, params):
        metric = (params.get("metric") or "predicted_power_mw").strip()
        if metric not in self.INTERPOLATION_METRICS:
            raise ValueError("Chỉ số nội suy không hợp lệ.")
        return metric

    @staticmethod
    def _interpolation_rows(qs):
        return list(
            qs.values(
                "id",
                "point_id",
                "name",
                "farm__code",
                "longitude",
                "latitude",
                "predicted_power_mw",
                "wind_speed_100m",
                "sea_depth",
            )
        )

    @staticmethod
    def _metric_array(rows, field):
        """Mảng (n, 3) gồm kinh độ, vĩ độ, giá trị; bỏ các điểm thiếu giá trị."""
        data = [
            (float(r["longitude"]), float(r["latitude"]), float(r[field]))
            for r in rows
            if r[field] is not None
        ]
        return np.array(data, dtype=float).reshape(-1, 3)

    @action(detail=False, methods=["get"], url_path="interpolation/grid")
    def interpolation_grid(self, request):
        """
        [GET] /api/energy/turbines/interpolation/grid/
        Nội suy IDW hoặc Kriging ra lưới giá trị trên các tuabin khớp bộ lọc.

        Tham số: method (idw|kriging), metric, width, height, bbox (min_lon,min_lat,max_lon,max_lat),
        cùng các bộ lọc như danh sách tuabin. Nếu không có bbox thì dùng phạm vi dữ liệu cộng vùng đệm.
        Giá trị và độ đậm là mảng phẳng theo hàng, từ bắc xuống nam; giá trị null là ô trống.
        """
        params = request.query_params
        try:
            method = self._parse_interpolation_method(params)
            metric = self._parse_interpolation_metric(params)
            default_w, default_h = self.INTERPOLATION_DEFAULT_SIZE
            width = int(params.get("width") or default_w)
            height = int(params.get("height") or default_h)
            bbox = None
            if params.get("bbox"):
                bbox = [float(v) for v in params["bbox"].split(",")]
                if len(bbox) != 4 or bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
                    raise ValueError("Vùng nội suy không hợp lệ.")
        except (ValueError, TypeError) as exc:
            return Response({"detail": str(exc) or "Tham số không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

        max_size = self.INTERPOLATION_MAX_SIZE
        if not (2 <= width <= max_size and 2 <= height <= max_size):
            return Response(
                {"detail": f"Kích thước lưới phải từ 2 đến {max_size}."}, status=status.HTTP_400_BAD_REQUEST
            )

        qs = self.filter_queryset(self.get_queryset())
        cache_key = self._interpolation_cache_key("grid", request, qs, [method, metric, width, height, bbox])
        payload = cache.get(cache_key)
        if payload is not None:
            return Response(payload)

        data = self._metric_array(self._interpolation_rows(qs), self.INTERPOLATION_METRICS[metric])
        if data.shape[0] == 0:
            return Response({"detail": "Không có điểm dữ liệu để nội suy."}, status=status.HTTP_404_NOT_FOUND)

        if bbox is None:
            pad = self.INTERPOLATION_PAD_DEG
            bbox = [
                float(data[:, 0].min() - pad),
                float(data[:, 1].min() - pad),
                float(data[:, 0].max() + pad),
                float(data[:, 1].max() + pad),
            ]

        values, alphas = interpolation.build_grid(data, method, bbox, width, height)
        empty = (alphas == 0) | ~np.isfinite(values)
        values = np.round(values, 3).astype(object)
        values[empty] = None

        payload = {
            "method": method,
            "metric": metric,
            "bbox": bbox,
            "width": width,
            "height": height,
            "point_count": int(data.shape[0]),
            "values": values.tolist(),
            "alphas": alphas.tolist(),
        }
        cache.set(cache_key, payload, self.INTERPOLATION_CACHE_SECONDS)
        return Response(payload)

    @action(detail=False, methods=["get"], url_path="interpolation/point")
    def interpolation_point(self, request):
        """
        [GET] /api/energy/turbines/interpolation/point/
        Giá trị nội suy tại một toạ độ, dùng cùng thuật toán với lưới nên hai kết quả luôn khớp.

        Tham số: lon, lat, method (idw|kriging), cùng các bộ lọc như danh sách tuabin.
        Nếu toạ độ quá xa các điểm đo thì trả về available = false.
        """
        params = request.query_params
        try:
            method = self._parse_interpolation_method(params)
            lon = float(params["lon"])
            lat = float(params["lat"])
        except KeyError:
            return Response({"detail": "Thiếu toạ độ lon và lat."}, status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError) as exc:
            return Response({"detail": str(exc) or "Tham số không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            return Response({"detail": "Toạ độ không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

        qs = self.filter_queryset(self.get_queryset())
        rows = self._interpolation_rows(qs)
        if not rows:
            return Response({"available": False})

        # Điểm đo gần nhất, tính trên toàn bộ điểm khớp bộ lọc
        projection = interpolation.LocalProjection(lon, lat)
        coords = projection.to_km([float(r["longitude"]) for r in rows], [float(r["latitude"]) for r in rows])
        distances = np.hypot(coords[:, 0], coords[:, 1])
        nearest_idx = int(distances.argmin())
        nearest_km = float(distances[nearest_idx])
        if nearest_km > self.INTERPOLATION_POINT_MAX_KM:
            return Response({"available": False})

        nearest = rows[nearest_idx]
        result = {
            "available": True,
            "method": method,
            "longitude": lon,
            "latitude": lat,
            "closest_distance_km": round(nearest_km, 1),
            "closest_point": {
                "id": nearest["id"],
                "point_id": nearest["point_id"],
                "name": nearest["name"],
                "farm_code": nearest["farm__code"],
                "longitude": float(nearest["longitude"]),
                "latitude": float(nearest["latitude"]),
            },
        }
        for metric, field in self.INTERPOLATION_METRICS.items():
            data = self._metric_array(rows, field)
            if data.shape[0] == 0:
                result[metric] = None
                continue
            value, _ = interpolation.evaluate_point(data, method, lon, lat)
            result[metric] = round(value, 3)
        return Response(result)

    @action(detail=False, methods=["get"])
    def export(self, request):
        """
        [GET] /api/energy/turbines/export/?output=csv|geojson
        Xuất toàn bộ tuabin khớp bộ lọc hiện tại (không phân trang).
        """
        output = (request.query_params.get("output") or "csv").lower()
        if output not in ("csv", "geojson"):
            return Response(
                {"detail": "Định dạng xuất không hợp lệ. Chỉ hỗ trợ csv hoặc geojson."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = self.filter_queryset(self.get_queryset())
        stamp = timezone.localtime().strftime("%Y%m%d")

        if output == "geojson":
            data = WindTurbineGeoSerializer(qs, many=True).data
            response = HttpResponse(
                json.dumps(data, ensure_ascii=False), content_type="application/geo+json; charset=utf-8"
            )
            response["Content-Disposition"] = f'attachment; filename="tuabin_gio_{stamp}.geojson"'
            return response

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="tuabin_gio_{stamp}.csv"'
        response.write("\ufeff")  # BOM để Excel nhận đúng tiếng Việt
        writer = csv.writer(response)
        writer.writerow([name for name, _ in self.EXPORT_COLUMNS])
        for turbine in qs.iterator(chunk_size=500):
            writer.writerow(
                ["" if (value := getter(turbine)) is None else value for _, getter in self.EXPORT_COLUMNS]
            )
        return response


class AnalysisJobViewSet(viewsets.ModelViewSet):
    """
    API ViewSet cho Tác vụ phân tích (AnalysisJob).
    """

    queryset = AnalysisJob.objects.all().order_by("-created_at")
    serializer_class = AnalysisJobSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = WindEnergyPagination
    filter_backends = [django_filters.DjangoFilterBackend, drf_filters.SearchFilter]
    filterset_fields = ["status", "analysis_type"]
    search_fields = ["analysis_type"]


class ExtremeEventViewSet(viewsets.ModelViewSet):
    """
    API ViewSet cho Sự kiện cực đoan (ExtremeEvent).
    """

    queryset = (
        ExtremeEvent.objects.select_related("station", "job")
        .all()
        .order_by("-start_time")
    )
    serializer_class = ExtremeEventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    pagination_class = WindEnergyPagination
    filter_backends = [django_filters.DjangoFilterBackend, drf_filters.SearchFilter]
    filterset_fields = ["extreme_type", "station"]
    search_fields = ["extreme_type", "station__station_code", "station__name"]
