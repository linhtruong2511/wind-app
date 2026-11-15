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

from .time_parsing import parse_time_from_filename

TIME_NAMES = ("valid_time", "time")
LAT_NAMES = ("latitude", "lat")
LON_NAMES = ("longitude", "lon")
IGNORED_VARS = ("number", "expver")
MAX_REPORTED_ERRORS = 5
NAME_HINT = "Hãy đặt tên tệp theo dạng 2021010100.nc (năm, tháng, ngày, giờ)."


class IngestError(ValueError):
    """Lỗi do dữ liệu người dùng nạp vào, thông báo đã viết sẵn để hiển thị cho người dùng."""


@dataclass
class IngestResult:
    granules: int = 0
    variables: list = field(default_factory=list)
    labels: list = field(default_factory=list)
    time_start: object = None
    time_end: object = None

    def summary(self):
        return (
            f"Đã nạp {self.granules} mốc giờ, từ {self.time_start:%d/%m/%Y %H:%M} "
            f"đến {self.time_end:%d/%m/%Y %H:%M} (UTC), gồm {', '.join(self.labels)}."
        )


@dataclass
class _FileInfo:
    path: str
    name: str
    time_name: object  # tên tọa độ thời gian trong tệp, None nếu lấy giờ từ tên tệp
    stamps: list
    var_names: list
    attrs: dict
    bounds: tuple  # (kinh độ nhỏ nhất, vĩ độ nhỏ nhất, kinh độ lớn nhất, vĩ độ lớn nhất)


def _optional_name(ds, candidates):
    for name in candidates:
        if name in ds.coords or name in ds.dims:
            return name
    return None


def _find_name(ds, candidates, label):
    name = _optional_name(ds, candidates)
    if name is None:
        raise IngestError(f"Tệp thiếu tọa độ {label} (một trong: {', '.join(candidates)}).")
    return name


def _collect_nc_files(path, workdir, source_name):
    """Trả về danh sách (đường dẫn, tên hiển thị). Tệp trong zip dùng tên của chính nó."""
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
            raise IngestError("Tệp zip không chứa tệp .nc nào.")
        return [(item, os.path.basename(item)) for item in files]
    if lower.endswith(".nc"):
        return [(path, source_name or os.path.basename(path))]
    raise IngestError("Chỉ hỗ trợ tệp .nc hoặc .zip.")


def _to_utc(stamp):
    return stamp.to_pydatetime().replace(tzinfo=dt_timezone.utc)


def _inspect_file(path, name):
    """Đọc thông tin của một tệp mà không ghi gì."""
    with xr.open_dataset(path) as ds:
        lat_name = _find_name(ds, LAT_NAMES, "vĩ độ")
        lon_name = _find_name(ds, LON_NAMES, "kinh độ")
        var_names = [
            n
            for n, v in ds.data_vars.items()
            if lat_name in v.dims and lon_name in v.dims and n not in IGNORED_VARS
        ]
        if not var_names:
            raise IngestError("Tệp không có biến dữ liệu lưới nào.")

        time_name = _optional_name(ds, TIME_NAMES)
        if time_name is not None:
            stamps = [_to_utc(s) for s in pd.to_datetime(np.atleast_1d(ds[time_name].values))]
        else:
            stamp = parse_time_from_filename(name)
            if stamp is None:
                raise IngestError(f"Không xác định được thời gian. {NAME_HINT}")
            stamps = [stamp]

        bounds = (
            float(ds[lon_name].min()),
            float(ds[lat_name].min()),
            float(ds[lon_name].max()),
            float(ds[lat_name].max()),
        )
        return _FileInfo(path, name, time_name, stamps, var_names, {n: dict(ds[n].attrs) for n in var_names}, bounds)


def _register_times(info, seen):
    """Phát hiện hai tệp cùng mốc giờ và cùng biến. Trả về thông báo lỗi hoặc None."""
    for stamp in info.stamps:
        for var in info.var_names:
            owner = seen.setdefault((stamp, var), info)
            if owner is not info:
                return f"{info.name}: trùng mốc {stamp:%d/%m/%Y %H:%M} và biến {var} với tệp {owner.name}."
    return None


def _inspect_all(files):
    infos, errors, seen = [], [], {}
    for path, name in files:
        try:
            info = _inspect_file(path, name)
        except IngestError as exc:
            errors.append(f"{name}: {exc}")
            continue
        except Exception:
            errors.append(f"{name}: Không đọc được nội dung tệp.")
            continue
        conflict = _register_times(info, seen)
        if conflict:
            errors.append(conflict)
        else:
            infos.append(info)

    if errors:
        shown = "\n".join(f"- {item}" for item in errors[:MAX_REPORTED_ERRORS])
        extra = len(errors) - MAX_REPORTED_ERRORS
        tail = f"\nvà {extra} lỗi khác." if extra > 0 else ""
        raise IngestError(f"Không thể nạp vì có {len(errors)} lỗi:\n{shown}{tail}")
    return infos


def _granule_path(dataset, stamp):
    code = get_valid_filename(dataset.code)
    media_root = getattr(settings, "MEDIA_ROOT", "media")
    return os.path.join(
        media_root, "wind_rasters", code, f"{stamp:%Y}", f"{stamp:%m}", f"{code}_{stamp:%Y%m%d%H}.nc"
    )


def _footprint(infos):
    footprint = Polygon.from_bbox(
        (
            min(i.bounds[0] for i in infos),
            min(i.bounds[1] for i in infos),
            max(i.bounds[2] for i in infos),
            max(i.bounds[3] for i in infos),
        )
    )
    footprint.srid = 4326
    return footprint


def _write_file(info, dataset, footprint, written):
    """Ghi từng mốc giờ của một tệp thành tệp riêng. Cùng mốc giờ đã ghi trước đó trong lần nạp này thì gộp biến."""
    with xr.open_dataset(info.path) as raw:
        loaded = raw[info.var_names].load()

    for index, stamp in enumerate(info.stamps):
        if info.time_name is not None and info.time_name in loaded.dims:
            part = loaded.isel({info.time_name: index})
        else:
            part = loaded
        if info.time_name is None:
            part = part.assign_coords(time=np.datetime64(stamp.replace(tzinfo=None), "ns"))

        if stamp in written:
            target = written[stamp]
            with xr.open_dataset(target) as existing:
                part = xr.merge([existing.load(), part], compat="override")
        else:
            target = _granule_path(dataset, stamp)
            os.makedirs(os.path.dirname(target), exist_ok=True)

        partial = target + ".tmp"
        part.to_netcdf(partial)
        os.replace(partial, target)
        written[stamp] = target

        RasterGranuleIndex.objects.update_or_create(
            dataset=dataset,
            granule_time=stamp,
            defaults={"file_location": target, "footprint": footprint, "variable_code": "multiple"},
        )


def _wind_role(attrs, name=""):
    standard = str(attrs.get("standard_name", "")).lower()
    long_name = str(attrs.get("long_name", "")).lower()
    if standard == "eastward_wind" or "u wind component" in long_name:
        return "U"
    if standard == "northward_wind" or "v wind component" in long_name:
        return "V"
    # Dự phòng cho tệp không có mô tả: u10m, v10m, u100m, v100m
    match = re.fullmatch(r"([uv])(\d+)m?", str(name).lower())
    if match:
        return match.group(1).upper()
    return None


def _height_key(name):
    match = re.search(r"\d+", name)
    return match.group(0) if match else ""


def _sync_variables(dataset, attrs_by_name):
    pairs = {}
    for name, attrs in attrs_by_name.items():
        role = _wind_role(attrs, name)
        if role:
            pairs.setdefault(_height_key(name), {})[role] = name

    paired = set()
    codes, labels = [], []
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
        labels.append(label)

    for name, attrs in attrs_by_name.items():
        unit = str(attrs.get("units") or "")[:32] or None
        label = str(attrs.get("long_name") or name)[:255]
        DatasetVariable.objects.update_or_create(
            dataset=dataset,
            variable_code=name,
            defaults={
                "variable_name": label,
                "unit": unit,
                "components": [name],
                "is_component": name in paired,
            },
        )
        codes.append(name)
        if name not in paired:
            labels.append(label)
    return codes, labels


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


def ingest_netcdf(path, dataset, source_name=None):
    """
    Nạp tệp .nc hoặc .zip thành từng tệp một mốc giờ, upsert RasterGranuleIndex và tự tạo/cập nhật
    DatasetVariable. Mốc giờ lấy từ tọa độ thời gian trong tệp, nếu không có thì từ tên tệp.
    `source_name` là tên tệp người dùng đã chọn (đường dẫn tạm không giữ tên gốc).
    Mọi tệp được kiểm tra trước, có lỗi thì không ghi gì.
    """
    workdir = tempfile.mkdtemp(prefix="raster_ingest_")
    try:
        infos = _inspect_all(_collect_nc_files(path, workdir, source_name))
        footprint = _footprint(infos)

        written = {}
        for info in infos:
            _write_file(info, dataset, footprint, written)

        attrs_by_name = {}
        for info in infos:
            for name in info.var_names:
                attrs_by_name.setdefault(name, info.attrs[name])
        codes, labels = _sync_variables(dataset, attrs_by_name)

        stamps = sorted(written)
        _update_dataset_bounds(dataset, stamps[0], stamps[-1], footprint)
        return IngestResult(
            granules=len(stamps), variables=codes, labels=labels, time_start=stamps[0], time_end=stamps[-1]
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
