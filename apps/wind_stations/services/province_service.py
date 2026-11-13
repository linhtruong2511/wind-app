import logging
from django.apps import apps
from django.contrib.gis.geos import GEOSGeometry

logger = logging.getLogger(__name__)


def get_province_geometry(province_id):
    """
    Lấy geometry ranh giới tỉnh từ province_id an toàn.
    Hỗ trợ fallback khi co2_management hoặc geonode không được cài đặt,
    đảm bảo API không bị crash.
    """
    if not province_id:
        return None

    # 1. Thử gọi từ co2_management nếu module có sẵn
    try:
        from co2_management.services.station_service import get_province_geometry as co2_get_geom  # type: ignore
        geom = co2_get_geom(province_id)
        if geom:
            return geom
    except Exception as e:
        logger.debug(f"co2_management.services.station_service not available: {e}")

    # 2. Thử tìm kiếm model Province trong các installed apps nếu có
    for app_label in ["co2_management", "geonode", "wind_stations", "wind_core"]:
        try:
            ProvinceModel = apps.get_model(app_label, "Province")
            if ProvinceModel:
                filter_kwargs = {}
                if str(province_id).isdigit():
                    filter_kwargs["id"] = int(province_id)
                else:
                    filter_kwargs["code"] = str(province_id)
                instance = ProvinceModel.objects.filter(**filter_kwargs).first()
                if instance and hasattr(instance, "geom"):
                    return instance.geom
        except (LookupError, Exception):
            continue

    return None


def get_provinces_wfs_data(request=None):
    """
    Phục vụ dữ liệu GeoJSON FeatureCollection danh sách tỉnh thành (WFS fallback)
    cho frontend MapStore client khi GeoServer/GeoNode chưa kết nối.
    """
    # Cấu trúc chuẩn GeoJSON FeatureCollection tương thích GeoServer WFS response
    fallback_response = {
        "type": "FeatureCollection",
        "totalFeatures": 0,
        "features": [],
        "crs": {
            "type": "name",
            "properties": {
                "name": "urn:ogc:def:crs:EPSG::4326"
            }
        }
    }

    # Nếu có model Province trong hệ thống, nạp dữ liệu vào features
    for app_label in ["co2_management", "geonode"]:
        try:
            ProvinceModel = apps.get_model(app_label, "Province")
            if ProvinceModel:
                features = []
                for p in ProvinceModel.objects.all():
                    if hasattr(p, "geom") and p.geom:
                        features.append({
                            "type": "Feature",
                            "id": f"viet_nam_tinh_thanh_63.{p.id}",
                            "geometry": p.geom.geojson,
                            "properties": {
                                "id": p.id,
                                "name": getattr(p, "name", ""),
                                "code": getattr(p, "code", ""),
                            }
                        })
                if features:
                    fallback_response["features"] = features
                    fallback_response["totalFeatures"] = len(features)
                    return fallback_response
        except (LookupError, Exception):
            continue

    return fallback_response
