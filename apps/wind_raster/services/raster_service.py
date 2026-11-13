from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.response import Response

from wind_core.models import DatasetVariable
from wind_raster.models import RasterGranuleIndex
from .netcdf_service import get_netcdf_data


def _parse_bbox(bbox_str):
    if not bbox_str:
        return None
    try:
        bbox = [float(x) for x in bbox_str.split(",")]
    except (ValueError, TypeError):
        return None
    return bbox if len(bbox) == 4 else None


def get_raster_granule_data_service(query_params):
    """
    Trích xuất dữ liệu NetCDF cho RasterGranuleIndexViewSet.data
    theo dataset_id + variable và tùy chọn time, bbox, step.
    """
    dataset_id = query_params.get("dataset_id")
    variable_code = query_params.get("variable")
    if not dataset_id:
        return Response({"error": "Thiếu tham số dataset_id."}, status=400)
    if not variable_code:
        return Response({"error": "Thiếu tham số variable."}, status=400)
    try:
        dataset_id = int(dataset_id)
    except (ValueError, TypeError):
        return Response({"error": "dataset_id không hợp lệ."}, status=400)

    variable = DatasetVariable.objects.filter(
        dataset_id=dataset_id, variable_code=variable_code
    ).first()
    if variable is None:
        return Response({"error": f"Biến không hợp lệ: {variable_code}"}, status=400)

    granules = RasterGranuleIndex.objects.filter(dataset_id=dataset_id)
    time_str = query_params.get("time")
    if time_str:
        moment = parse_datetime(time_str)
        if moment is None and " " in time_str:
            moment = parse_datetime(time_str.replace(" ", "+"))
        if moment is None:
            return Response({"error": "Tham số time không hợp lệ."}, status=400)
        if timezone.is_naive(moment):
            moment = timezone.make_aware(moment, timezone.utc)
        granules = granules.filter(granule_time__lte=moment)

    granule = granules.order_by("-granule_time").first()
    if granule is None:
        return Response({"error": "No granules found"}, status=404)

    try:
        step = max(int(query_params.get("step", 1)), 1)
    except (ValueError, TypeError):
        step = 1

    bbox = _parse_bbox(query_params.get("bbox"))

    components = variable.components or [variable.variable_code]
    u_code = components[0]
    v_code = components[1] if len(components) > 1 else None

    try:
        data = get_netcdf_data(
            granule.file_location,
            bbox=bbox,
            step=step,
            u=u_code,
            v=v_code,
        )
    except Exception as exc:
        return Response({"error": str(exc)}, status=400)

    payload = {
        "lats": data["lats"],
        "lons": data["lons"],
        "variable": variable.variable_code,
    }
    if v_code:
        payload["u"] = data["u"]
        payload["v"] = data["v"]
        if data.get("speed") is not None:
            payload["speed"] = data["speed"]
        if data.get("direction") is not None:
            payload["direction"] = data["direction"]
    else:
        payload["values"] = data["u"]

    return Response(payload)
