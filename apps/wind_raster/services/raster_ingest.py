import os
import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass, field
from datetime import timezone as dt_timezone

import numpy as np
import pandas as pd
import xarray as xr
from django.conf import settings
from django.contrib.gis.geos import Polygon
from django.utils.text import get_valid_filename

from wind_core.models import DatasetVariable
from wind_raster.models import RasterGranuleIndex

TIME_NAMES = ("valid_time", "time")
LAT_NAMES = ("latitude", "lat")
LON_NAMES = ("longitude", "lon")
IGNORED_VARS = ("number", "expver")


@dataclass
class IngestResult:
    granules: int = 0
    variables: list = field(default_factory=list)


def _find_name(ds, candidates, label):
    for name in candidates:
        if name in ds.coords or name in ds.dims:
            return name
    raise ValueError(f"Tệp NetCDF thiếu tọa độ {label} (một trong: {', '.join(candidates)}).")


def _collect_nc_files(path, workdir):
    lower = path.lower()
    if lower.endswith(".zip"):
        with zipfile.ZipFile(path) as archive:
            archive.extractall(workdir)
        files = sorted(
            os.path.join(root, name)
            for root, _, names in os.walk(workdir)
            for name in names
            if name.lower().endswith(".nc")
        )
        if not files:
            raise ValueError("Tệp zip không chứa tệp .nc nào.")
        return files
    if lower.endswith(".nc"):
        return [path]
    raise ValueError("Chỉ hỗ trợ tệp .nc hoặc .zip.")


def _open_merged(files):
    datasets = [xr.open_dataset(f) for f in files]
    try:
        merged = datasets[0] if len(datasets) == 1 else xr.merge(datasets, compat="override", join="outer")
        drop = [name for name in IGNORED_VARS if name in merged.variables]
        return merged.drop_vars(drop).load()
    finally:
        for ds in datasets:
            ds.close()


def _granule_path(dataset, stamp):
    code = get_valid_filename(dataset.code)
    media_root = getattr(settings, "MEDIA_ROOT", "media")
    return os.path.join(
        media_root, "wind_rasters", code, f"{stamp:%Y}", f"{stamp:%m}", f"{code}_{stamp:%Y%m%d%H}.nc"
    )


def _wind_role(attrs):
    standard = str(attrs.get("standard_name", "")).lower()
    long_name = str(attrs.get("long_name", "")).lower()
    if standard == "eastward_wind" or "u wind component" in long_name:
        return "U"
    if standard == "northward_wind" or "v wind component" in long_name:
        return "V"
    return None


def _height_key(name):
    match = re.search(r"\d+", name)
    return match.group(0) if match else ""


def _sync_variables(dataset, ds, names):
    pairs = {}
    for name in names:
        role = _wind_role(ds[name].attrs)
        if role:
            pairs.setdefault(_height_key(name), {})[role] = name

    paired = set()
    codes = []
    for key, pair in sorted(pairs.items()):
        if "U" not in pair or "V" not in pair:
            continue
        paired.update(pair.values())
        code = f"wind_{key}m" if key else "wind"
        label = f"Gió {key}m" if key else "Gió"
        DatasetVariable.objects.update_or_create(
            dataset=dataset,
            variable_code=code,
            defaults={
                "variable_name": label,
                "unit": "m/s",
                "components": [pair["U"], pair["V"]],
                "is_component": False,
            },
        )
        codes.append(code)

    for name in names:
        attrs = ds[name].attrs
        unit = str(attrs.get("units") or "")[:32] or None
        DatasetVariable.objects.update_or_create(
            dataset=dataset,
            variable_code=name,
            defaults={
                "variable_name": str(attrs.get("long_name") or name)[:255],
                "unit": unit,
                "components": [name],
                "is_component": name in paired,
            },
        )
        codes.append(name)
    return codes


def _update_dataset_bounds(dataset, first, last, footprint):
    update_fields = []
    if dataset.time_start is None or first < dataset.time_start:
        dataset.time_start = first
        update_fields.append("time_start")
    if dataset.time_end is None or last > dataset.time_end:
        dataset.time_end = last
        update_fields.append("time_end")
    if not dataset.spatial_extent:
        dataset.spatial_extent = footprint
        update_fields.append("spatial_extent")
    if update_fields:
        update_fields.append("updated_at")
        dataset.save(update_fields=update_fields)


def ingest_netcdf(path, dataset):
    """
    Tách NetCDF (.nc hoặc .zip) thành từng file 1 mốc giờ, upsert RasterGranuleIndex
    và tự tạo/cập nhật DatasetVariable. Trả về IngestResult.
    """
    workdir = tempfile.mkdtemp(prefix="raster_ingest_")
    try:
        ds = _open_merged(_collect_nc_files(path, workdir))
        time_name = _find_name(ds, TIME_NAMES, "thời gian")
        lat_name = _find_name(ds, LAT_NAMES, "vĩ độ")
        lon_name = _find_name(ds, LON_NAMES, "kinh độ")

        names = [n for n, v in ds.data_vars.items() if lat_name in v.dims and lon_name in v.dims]
        if not names:
            raise ValueError("Tệp NetCDF không có biến dữ liệu lưới nào.")

        footprint = Polygon.from_bbox(
            (
                float(ds[lon_name].min()),
                float(ds[lat_name].min()),
                float(ds[lon_name].max()),
                float(ds[lat_name].max()),
            )
        )
        footprint.srid = 4326

        sliced = ds[names]
        stamps = pd.to_datetime(np.atleast_1d(ds[time_name].values))
        granule_times = []
        for index, stamp in enumerate(stamps):
            part = sliced.isel({time_name: index}) if time_name in sliced.dims else sliced
            granule_time = stamp.to_pydatetime().replace(tzinfo=dt_timezone.utc)
            target = _granule_path(dataset, granule_time)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            partial = target + ".tmp"
            part.to_netcdf(partial)
            os.replace(partial, target)
            RasterGranuleIndex.objects.update_or_create(
                dataset=dataset,
                granule_time=granule_time,
                defaults={"file_location": target, "footprint": footprint, "variable_code": "multiple"},
            )
            granule_times.append(granule_time)

        codes = _sync_variables(dataset, ds, names)
        _update_dataset_bounds(dataset, min(granule_times), max(granule_times), footprint)
        ds.close()
        return IngestResult(granules=len(granule_times), variables=codes)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
