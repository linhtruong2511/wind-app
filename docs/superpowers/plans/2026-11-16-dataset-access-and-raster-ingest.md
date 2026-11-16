# Phân quyền bộ dữ liệu và nạp tệp lưới từ máy: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nạp được tệp lưới không có trục thời gian (lấy giờ từ tên tệp, nạp nhiều tệp bằng zip), gộp phân quyền vào form bộ dữ liệu và áp dụng phân quyền thật cho dữ liệu lưới.

**Architecture:** `ingest_netcdf` được viết lại theo hai pha: pha kiểm tra đọc metadata của mọi tệp và gom lỗi, pha ghi xử lý từng tệp riêng rồi gộp các tệp cùng mốc giờ. Một module `wind_core/access.py` là nơi duy nhất quyết định bộ dữ liệu nào người dùng được xem, và các view raster và dataset gọi lại nó. Form bộ dữ liệu ở frontend gửi kèm danh sách nhóm được phép và API lưu cả hai trong một lần.

**Tech Stack:** Django 5 + DRF, xarray + netCDF4, React 18 (Vite), Playwright. Chạy test trong container `wind_be`.

**Quy ước chạy lệnh:** mọi lệnh Python chạy trong container (xem `AGENTS.md`), thư mục làm việc trong container là `/usr/src/apps`:
`docker compose exec -T wind_be python manage.py test <nhãn test>`.
Mỗi bước **Commit** chỉ chạy khi người dùng đồng ý; thêm dòng `Co-Authored-By` theo quy ước của phiên làm việc.

**Tài liệu thiết kế:** `docs/superpowers/specs/2026-11-16-dataset-access-and-raster-ingest-design.md`

---

## Cấu trúc tệp

| Tệp | Việc |
|---|---|
| `apps/wind_raster/services/time_parsing.py` (tạo mới) | Lấy mốc giờ UTC từ tên tệp |
| `apps/wind_raster/services/raster_ingest.py` (viết lại) | Nạp tệp `.nc` và `.zip` theo hai pha, lỗi dễ hiểu |
| `apps/wind_raster/services/__init__.py` | Xuất thêm `IngestError` |
| `apps/wind_raster/services/raster_service.py` | Chặn truy cập dữ liệu theo bộ dữ liệu |
| `apps/wind_raster/views.py` | Truyền tên tệp gốc, thông báo dễ hiểu, lọc theo quyền |
| `apps/wind_core/access.py` (tạo mới) | `accessible_datasets`, `can_download_dataset`, `is_staff_user` |
| `apps/wind_core/serializers.py` | `access_policies` ghi và đọc cùng bộ dữ liệu, `UserGroupSerializer` |
| `apps/wind_core/views.py` | Lọc bộ dữ liệu và biến theo quyền, khóa API chính sách, thêm API nhóm |
| `apps/configs/api_router.py` | Đăng ký `user-groups` |
| `apps/wind_raster/tests.py` | Test nhận dạng giờ, nạp tệp, upload |
| `apps/tests/test_dataset_access.py` (tạo mới) | Test phân quyền và API chính sách |
| `frontend/src/api/admin.js` | Thêm `getUserGroups`, bỏ `getDatasetAccessPolicies` |
| `frontend/src/routes/admin/AdminDatasetsRoute.jsx` | Bỏ tab chính sách và trường phân loại, thêm mục "Ai được xem" |
| `frontend/src/routes/admin/AdminRastersRoute.jsx` | Hướng dẫn về giờ và zip, hiển thị lỗi nhiều dòng |
| `frontend/e2e/admin-farms-datasets.spec.js` | Cập nhật theo giao diện mới |

---

### Task 1: Nhận dạng mốc giờ từ tên tệp

**Files:**
- Create: `apps/wind_raster/services/time_parsing.py`
- Test: `apps/wind_raster/tests.py`

- [ ] **Step 1: Viết test thất bại**

Thêm vào đầu `apps/wind_raster/tests.py`, cùng nhóm import:

```python
from datetime import datetime, timezone as dt_timezone

from django.test import SimpleTestCase

from wind_raster.services.time_parsing import parse_time_from_filename
```

Thêm vào cuối tệp:

```python
class FilenameTimeTest(SimpleTestCase):
    def test_parses_supported_patterns(self):
        expected = datetime(2021, 1, 1, 6, tzinfo=dt_timezone.utc)
        names = (
            "2021010106.nc",
            "20210101_06.nc",
            "2021-01-01_06.nc",
            "wrfout_d01_2021-01-01_06:00:00.nc",
            "wrf3km_2021010106_cut.nc",
            "D:/Data/2021/2021010106.nc",
        )
        for name in names:
            with self.subTest(name=name):
                self.assertEqual(parse_time_from_filename(name), expected)

    def test_parses_minutes(self):
        self.assertEqual(
            parse_time_from_filename("202101010630.nc"),
            datetime(2021, 1, 1, 6, 30, tzinfo=dt_timezone.utc),
        )

    def test_returns_none_when_name_has_no_valid_time(self):
        for name in ("abc.nc", "2021133100.nc", "20210101.nc", "202101010600123.nc", ""):
            with self.subTest(name=name):
                self.assertIsNone(parse_time_from_filename(name))
```

- [ ] **Step 2: Chạy test, phải thất bại**

Run: `docker compose exec -T wind_be python manage.py test wind_raster.tests.FilenameTimeTest`
Expected: lỗi `ModuleNotFoundError: No module named 'wind_raster.services.time_parsing'`

- [ ] **Step 3: Viết code tối thiểu**

Tạo `apps/wind_raster/services/time_parsing.py`:

```python
import os
import re
from datetime import datetime, timezone

# 2021-01-01_06, 20210101_06, 2021-01-01_06:00:00, wrfout_d01_2021-01-01_06:00:00
_SEPARATED = re.compile(r"(?<!\d)(\d{4})-?(\d{2})-?(\d{2})[_T ](\d{2})(?::?(\d{2}))?(?::?\d{2})?(?!\d)")
# 2021010106 (năm, tháng, ngày, giờ) hoặc 202101010630 (thêm phút)
_COMPACT = re.compile(r"(?<!\d)(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})?(?!\d)")


def parse_time_from_filename(name):
    """Trả về mốc giờ UTC suy ra từ tên tệp, hoặc None nếu tên không có mốc giờ hợp lệ."""
    stem = os.path.splitext(os.path.basename(name or ""))[0]
    for pattern in (_SEPARATED, _COMPACT):
        match = pattern.search(stem)
        if not match:
            continue
        year, month, day, hour, minute = (int(group) if group else 0 for group in match.groups())
        try:
            return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
        except ValueError:
            continue
    return None
```

- [ ] **Step 4: Chạy test, phải đạt**

Run: `docker compose exec -T wind_be python manage.py test wind_raster.tests.FilenameTimeTest`
Expected: `OK` (3 test)

- [ ] **Step 5: Commit**

```bash
git add apps/wind_raster/services/time_parsing.py apps/wind_raster/tests.py
git commit -m "feat: parse observation time from raster file names"
```

---

### Task 2: Viết lại phần nạp tệp lưới theo hai pha

**Files:**
- Modify: `apps/wind_raster/services/raster_ingest.py` (viết lại toàn bộ)
- Modify: `apps/wind_raster/services/__init__.py`
- Test: `apps/wind_raster/tests.py`

- [ ] **Step 1: Viết test thất bại**

Bổ sung import ở đầu `apps/wind_raster/tests.py` (gộp với import đã có):

```python
import zipfile

from wind_core.models import Dataset, DatasetVariable, IngestionLog
from wind_raster.services.raster_ingest import IngestError, ingest_netcdf
```

(dòng `from wind_raster.services.raster_ingest import ingest_netcdf` cũ được thay bằng dòng trên; dòng `from wind_core.models import Dataset, DatasetVariable` cũ thay bằng dòng có `IngestionLog`.)

Thêm vào cuối tệp:

```python
def _write_grid_file(path, names=("u10m", "v10m", "u100m", "v100m"), value=1.0):
    """Tạo tệp lưới giống dữ liệu WRF đã cắt: không có trục thời gian, biến không có mô tả."""
    ds = xr.Dataset(
        data_vars={n: (("lat", "lon"), np.full((2, 2), value, dtype="float32")) for n in names},
        coords={"lat": [10.0, 11.0], "lon": [105.0, 106.0]},
    )
    ds.to_netcdf(path)
    ds.close()


class IngestWithoutTimeTest(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        media = override_settings(MEDIA_ROOT=os.path.join(self.tmp.name, "media"))
        media.enable()
        self.addCleanup(media.disable)
        self.dataset = Dataset.objects.create(
            code="WRF3KM", name="WRF 3km", category="GRIDDED", access_level="PUBLIC"
        )

    def _path(self, name):
        return os.path.join(self.tmp.name, name)

    def _grid(self, name, **kwargs):
        path = self._path(name)
        _write_grid_file(path, **kwargs)
        return path

    def _zip(self, zip_name, members):
        zip_path = self._path(zip_name)
        with zipfile.ZipFile(zip_path, "w") as archive:
            for member in members:
                archive.write(member, arcname=os.path.basename(member))
        return zip_path

    def test_single_file_takes_time_from_source_name(self):
        path = self._grid("upload_tmp.nc")
        result = ingest_netcdf(path, self.dataset, source_name="2021010106.nc")
        expected = datetime(2021, 1, 1, 6, tzinfo=dt_timezone.utc)
        self.assertEqual(result.granules, 1)
        self.assertEqual(result.time_start, expected)
        self.assertIn("wind_10m", result.variables)
        self.assertIn("wind_100m", result.variables)
        wind = DatasetVariable.objects.get(dataset=self.dataset, variable_code="wind_10m")
        self.assertEqual(wind.components, ["u10m", "v10m"])
        self.assertTrue(RasterGranuleIndex.objects.filter(dataset=self.dataset, granule_time=expected).exists())

    def test_file_without_time_or_dated_name_fails_with_clear_message(self):
        path = self._grid("upload_tmp.nc")
        with self.assertRaisesMessage(IngestError, "Không xác định được thời gian"):
            ingest_netcdf(path, self.dataset, source_name="abc.nc")
        self.assertEqual(RasterGranuleIndex.objects.filter(dataset=self.dataset).count(), 0)

    def test_zip_with_many_files_creates_one_granule_per_time(self):
        members = [self._grid(f"{stamp}.nc") for stamp in ("2021010100", "2021010106", "2021010112")]
        result = ingest_netcdf(self._zip("year.zip", members), self.dataset, source_name="year.zip")
        self.assertEqual(result.granules, 3)
        self.assertEqual(result.time_end, datetime(2021, 1, 1, 12, tzinfo=dt_timezone.utc))
        self.assertEqual(RasterGranuleIndex.objects.filter(dataset=self.dataset).count(), 3)
        self.dataset.refresh_from_db()
        self.assertEqual(self.dataset.time_start, result.time_start)
        self.assertIn("3 mốc giờ", result.summary())

    def test_zip_with_a_bad_file_writes_nothing(self):
        members = [self._grid("2021010100.nc"), self._grid("bad.nc")]
        with self.assertRaises(IngestError) as ctx:
            ingest_netcdf(self._zip("mixed.zip", members), self.dataset, source_name="mixed.zip")
        self.assertIn("bad.nc", str(ctx.exception))
        self.assertEqual(RasterGranuleIndex.objects.filter(dataset=self.dataset).count(), 0)

    def test_files_with_same_time_and_different_variables_are_merged(self):
        members = [
            self._grid("2021010100.nc", names=("u10m", "v10m")),
            self._grid("2021010100_100m.nc", names=("u100m", "v100m")),
        ]
        result = ingest_netcdf(self._zip("split.zip", members), self.dataset, source_name="split.zip")
        self.assertEqual(result.granules, 1)
        granule = RasterGranuleIndex.objects.get(dataset=self.dataset)
        with xr.open_dataset(granule.file_location) as merged:
            self.assertEqual(set(merged.data_vars), {"u10m", "v10m", "u100m", "v100m"})

    def test_files_with_same_time_and_same_variables_are_rejected(self):
        members = [self._grid("2021010100.nc"), self._grid("2021010100_dup.nc")]
        with self.assertRaisesMessage(IngestError, "trùng"):
            ingest_netcdf(self._zip("dup.zip", members), self.dataset, source_name="dup.zip")


@override_settings(ROOT_URLCONF="wind_raster.urls")
class UploadEndpointTest(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        media = override_settings(MEDIA_ROOT=os.path.join(self.tmp.name, "media"))
        media.enable()
        self.addCleanup(media.disable)
        self.client = APIClient()
        self.client.force_authenticate(
            user=get_user_model().objects.create_superuser("root", "root@test.com", "pass12345")
        )
        self.dataset = Dataset.objects.create(
            code="WRF3KM", name="WRF 3km", category="GRIDDED", access_level="PUBLIC"
        )

    def _upload(self, upload_name):
        path = os.path.join(self.tmp.name, "source.nc")
        _write_grid_file(path)
        with open(path, "rb") as handle:
            content = handle.read()
        return self.client.post(
            "/raster-granules/upload/",
            {"file": SimpleUploadedFile(upload_name, content), "dataset_id": self.dataset.id},
            format="multipart",
        )

    def test_upload_reads_time_from_file_name(self):
        response = self._upload("2021010106.nc")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Đã nạp 1 mốc giờ", response.json()["message"])

    def test_upload_without_time_returns_clear_error_and_logs_failure(self):
        response = self._upload("abc.nc")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Không xác định được thời gian", response.json()["error"])
        self.assertEqual(IngestionLog.objects.get(dataset=self.dataset).status, "FAILED")
```

Thêm vào nhóm import: `from django.contrib.auth import get_user_model` và `from django.core.files.uploadedfile import SimpleUploadedFile`.

- [ ] **Step 2: Chạy test, phải thất bại**

Run: `docker compose exec -T wind_be python manage.py test wind_raster.tests.IngestWithoutTimeTest wind_raster.tests.UploadEndpointTest`
Expected: lỗi `ImportError: cannot import name 'IngestError'`

- [ ] **Step 3: Viết lại `apps/wind_raster/services/raster_ingest.py`**

Thay toàn bộ nội dung tệp bằng:

```python
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
```

- [ ] **Step 4: Xuất `IngestError`**

Trong `apps/wind_raster/services/__init__.py`, đổi dòng import và `__all__`:

```python
from .raster_ingest import IngestError, IngestResult, ingest_netcdf
```

và thêm `"IngestError",` vào `__all__`.

- [ ] **Step 5: Chạy test**

Run: `docker compose exec -T wind_be python manage.py test wind_raster.tests.IngestWithoutTimeTest`
Expected: PASS 6 test. `UploadEndpointTest` vẫn thất bại cho tới Task 3.

Run: `docker compose exec -T wind_be python manage.py test wind_raster.tests.RasterTestCase.test_ingest_netcdf_service wind_cds`
Expected: PASS. Test ERA5 cũ vẫn đạt và `wind_cds.tasks` gọi `ingest_netcdf(temp_path, job.dataset)` không đổi chữ ký.

- [ ] **Step 6: Commit**

```bash
git add apps/wind_raster/services apps/wind_raster/tests.py
git commit -m "feat: ingest grid files without time axis and zip archives with clear errors"
```

---

### Task 3: View upload dùng tên tệp gốc và thông báo dễ hiểu

**Files:**
- Modify: `apps/wind_raster/views.py:31-72`
- Test: `apps/wind_raster/tests.py` (`UploadEndpointTest` đã viết ở Task 2)

- [ ] **Step 1: Chạy test, phải thất bại**

Run: `docker compose exec -T wind_be python manage.py test wind_raster.tests.UploadEndpointTest`
Expected: FAIL (thông báo cũ là "Nạp thành công 1 granule(s)." và tên tệp gốc không được truyền)

- [ ] **Step 2: Sửa view**

Trong `apps/wind_raster/views.py`, thay hàm `upload_raster` (từ dòng `@action(... url_path="upload" ...)` tới hết hàm, kèm 2 dòng trống thừa phía sau) bằng:

```python
    @action(detail=False, methods=["post"], url_path="upload", permission_classes=[permissions.IsAdminUser])
    def upload_raster(self, request):
        uploaded_file = request.FILES.get("file")
        dataset_id = request.data.get("dataset_id")
        if not uploaded_file:
            return Response({"error": "Vui lòng chọn tệp .nc hoặc .zip."}, status=status.HTTP_400_BAD_REQUEST)

        from wind_core.models import Dataset, IngestionLog

        dataset = Dataset.objects.filter(id=dataset_id).first()
        if not dataset:
            return Response({"error": "Bộ dữ liệu không tồn tại."}, status=status.HTTP_400_BAD_REQUEST)

        import os
        import tempfile
        from wind_raster.services.raster_ingest import IngestError, ingest_netcdf

        suffix = os.path.splitext(uploaded_file.name)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            for chunk in uploaded_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        log = IngestionLog.objects.create(dataset=dataset, source_file=uploaded_file.name, status="RUNNING")
        try:
            result = ingest_netcdf(tmp_path, dataset, source_name=uploaded_file.name)
        except Exception as exc:
            log.status = "FAILED"
            log.error_message = str(exc)
            log.save()
            if isinstance(exc, IngestError):
                message = str(exc)
            else:
                message = "Không thể xử lý tệp dữ liệu. Chi tiết đã được ghi trong nhật ký nạp dữ liệu."
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)
        else:
            log.status = "SUCCESS"
            log.records_processed = result.granules
            log.save()
            return Response(
                {
                    "message": result.summary(),
                    "granules": result.granules,
                    "variables": result.variables,
                }
            )
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

```

- [ ] **Step 3: Chạy test, phải đạt**

Run: `docker compose exec -T wind_be python manage.py test wind_raster`
Expected: PASS toàn bộ app (kể cả test cũ).

- [ ] **Step 4: Commit**

```bash
git add apps/wind_raster/views.py
git commit -m "feat: upload keeps original file name and returns user-friendly messages"
```

---

### Task 4: Hàm kiểm tra quyền truy cập bộ dữ liệu

**Files:**
- Create: `apps/wind_core/access.py`
- Create: `apps/tests/test_dataset_access.py`

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/tests/test_dataset_access.py`:

```python
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.gis.geos import Polygon
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from wind_core.access import accessible_datasets, can_download_dataset
from wind_core.models import Dataset, DatasetAccessPolicy, DatasetVariable
from wind_raster.models import RasterGranuleIndex

User = get_user_model()
API = "/wind/api/v1"


class DatasetAccessTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.group = Group.objects.create(name="Nhóm phân tích")
        self.other_group = Group.objects.create(name="Nhóm khác")
        self.member = User.objects.create_user("member", password="pass12345")
        self.member.groups.add(self.group)
        self.outsider = User.objects.create_user("outsider", password="pass12345")
        self.outsider.groups.add(self.other_group)
        self.staff = User.objects.create_superuser("root", "root@test.com", "pass12345")

        self.public = Dataset.objects.create(code="PUB", name="Công khai", category="GRIDDED", access_level="PUBLIC")
        self.internal = Dataset.objects.create(code="INT", name="Nội bộ", category="GRIDDED", access_level="INTERNAL")
        self.restricted = Dataset.objects.create(
            code="RES", name="Theo nhóm", category="GRIDDED", access_level="RESTRICTED"
        )
        DatasetAccessPolicy.objects.create(
            dataset=self.restricted, group=self.group, can_view=True, can_query=True, can_download=False
        )
        DatasetAccessPolicy.objects.create(
            dataset=self.restricted, group=self.other_group, can_view=False, can_query=False, can_download=False
        )

        self.moment = timezone.now().replace(microsecond=0)
        poly = Polygon.from_bbox((102.0, 8.0, 110.0, 24.0))
        poly.srid = 4326
        for dataset in (self.public, self.internal, self.restricted):
            RasterGranuleIndex.objects.create(
                dataset=dataset,
                granule_time=self.moment,
                footprint=poly,
                file_location="/data/x.nc",
                variable_code="wind_10m",
                elevation=10.0,
            )

    def _expected_by_user(self):
        return [
            (None, {"PUB"}),
            (self.outsider, {"PUB", "INT"}),
            (self.member, {"PUB", "INT", "RES"}),
            (self.staff, {"PUB", "INT", "RES"}),
        ]

    def test_accessible_datasets_by_user(self):
        from django.contrib.auth.models import AnonymousUser

        for user, expected in self._expected_by_user():
            with self.subTest(user=getattr(user, "username", "anonymous")):
                codes = set(accessible_datasets(user or AnonymousUser()).values_list("code", flat=True))
                self.assertEqual(codes, expected)

    def test_can_download_dataset(self):
        self.assertTrue(can_download_dataset(None, self.public))
        self.assertFalse(can_download_dataset(None, self.internal))
        self.assertTrue(can_download_dataset(self.outsider, self.internal))
        self.assertFalse(can_download_dataset(self.member, self.restricted))
        self.assertTrue(can_download_dataset(self.staff, self.restricted))
        DatasetAccessPolicy.objects.filter(dataset=self.restricted, group=self.group).update(can_download=True)
        self.assertTrue(can_download_dataset(self.member, self.restricted))
        self.assertFalse(can_download_dataset(self.outsider, self.restricted))
```

- [ ] **Step 2: Chạy test, phải thất bại**

Run: `docker compose exec -T wind_be python manage.py test tests.test_dataset_access`
Expected: `ModuleNotFoundError: No module named 'wind_core.access'`

- [ ] **Step 3: Viết code**

Tạo `apps/wind_core/access.py`:

```python
from django.db.models import Q

from wind_core.models import Dataset, DatasetAccessPolicy


def is_staff_user(user):
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


def _group_ids(user):
    return list(user.groups.values_list("id", flat=True))


def accessible_datasets(user, queryset=None):
    """Các bộ dữ liệu mà người dùng được phép xem. Quản trị viên xem được tất cả."""
    datasets = Dataset.objects.all() if queryset is None else queryset
    if is_staff_user(user):
        return datasets

    condition = Q(access_level="PUBLIC")
    if user is not None and user.is_authenticated:
        allowed = DatasetAccessPolicy.objects.filter(group_id__in=_group_ids(user), can_view=True)
        condition |= Q(access_level="INTERNAL")
        condition |= Q(access_level="RESTRICTED", id__in=allowed.values("dataset_id"))
    return datasets.filter(condition)


def can_download_dataset(user, dataset):
    """Quyền tải về một bộ dữ liệu. Chưa có API tải về nào gọi hàm này, dùng khi bổ sung API đó."""
    if is_staff_user(user):
        return True
    if dataset.access_level == "PUBLIC":
        return True
    if user is None or not user.is_authenticated:
        return False
    if dataset.access_level == "INTERNAL":
        return True
    return DatasetAccessPolicy.objects.filter(
        dataset=dataset, group_id__in=_group_ids(user), can_download=True
    ).exists()
```

- [ ] **Step 4: Chạy test, phải đạt**

Run: `docker compose exec -T wind_be python manage.py test tests.test_dataset_access`
Expected: PASS 2 test

- [ ] **Step 5: Commit**

```bash
git add apps/wind_core/access.py apps/tests/test_dataset_access.py
git commit -m "feat: add dataset access helpers"
```

---

### Task 5: API lưu chính sách cùng bộ dữ liệu, API danh sách nhóm

**Files:**
- Modify: `apps/wind_core/serializers.py`
- Modify: `apps/wind_core/views.py`
- Modify: `apps/configs/api_router.py`
- Test: `apps/tests/test_dataset_access.py`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối class `DatasetAccessTest` trong `apps/tests/test_dataset_access.py`:

```python
    def _create_payload(self, **extra):
        payload = {
            "code": "NEW",
            "name": "Mới",
            "category": "GRIDDED",
            "access_level": "RESTRICTED",
            "access_policies": [{"group": self.group.id, "can_view": True, "can_download": True}],
        }
        payload.update(extra)
        return payload

    def test_admin_saves_policies_with_dataset(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(f"{API}/datasets/", self._create_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        policy = DatasetAccessPolicy.objects.get(dataset_id=response.data["id"])
        self.assertTrue(policy.can_view)
        self.assertTrue(policy.can_query)
        self.assertTrue(policy.can_download)
        self.assertEqual(response.data["access_policies"][0]["group_name"], self.group.name)

    def test_patch_replaces_policies_only_when_key_is_sent(self):
        self.client.force_authenticate(user=self.staff)
        url = f"{API}/datasets/{self.restricted.id}/"

        self.client.patch(url, {"name": "Đổi tên"}, format="json")
        self.assertEqual(self.restricted.access_policies.count(), 2)

        response = self.client.patch(
            url, {"access_policies": [{"group": self.other_group.id, "can_view": True}]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            list(self.restricted.access_policies.values_list("group_id", "can_view")),
            [(self.other_group.id, True)],
        )

        self.client.patch(url, {"access_policies": []}, format="json")
        self.assertEqual(self.restricted.access_policies.count(), 0)

    def test_duplicate_group_is_rejected(self):
        self.client.force_authenticate(user=self.staff)
        item = {"group": self.group.id, "can_view": True, "can_download": False}
        response = self.client.post(
            f"{API}/datasets/", self._create_payload(access_policies=[item, item]), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Dataset.objects.filter(code="NEW").exists())

    def test_policies_are_hidden_from_non_staff(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.get(f"{API}/datasets/{self.public.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("access_policies", response.data)

        self.client.force_authenticate(user=self.staff)
        response = self.client.get(f"{API}/datasets/{self.restricted.id}/")
        self.assertEqual(len(response.data["access_policies"]), 2)

    def test_policy_endpoint_is_admin_only(self):
        for user in (None, self.member):
            self.client.force_authenticate(user=user)
            response = self.client.get(f"{API}/dataset-access-policies/")
            self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.client.force_authenticate(user=self.staff)
        self.assertEqual(self.client.get(f"{API}/dataset-access-policies/").status_code, status.HTTP_200_OK)

    def test_user_groups_endpoint_is_admin_only(self):
        for user in (None, self.member):
            self.client.force_authenticate(user=user)
            response = self.client.get(f"{API}/user-groups/")
            self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(f"{API}/user-groups/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual({item["name"] for item in response.data}, {"Nhóm phân tích", "Nhóm khác"})
```

- [ ] **Step 2: Chạy test, phải thất bại**

Run: `docker compose exec -T wind_be python manage.py test tests.test_dataset_access`
Expected: FAIL (không có `access_policies`, không có `/user-groups/`, policy endpoint vẫn cho khách đọc)

- [ ] **Step 3: Sửa serializer**

Trong `apps/wind_core/serializers.py`, thêm import:

```python
from django.contrib.auth.models import Group
from django.db import transaction

from wind_core.access import is_staff_user
```

Thay class `DatasetSerializer` bằng:

```python
class DatasetPolicySerializer(serializers.Serializer):
    group = serializers.PrimaryKeyRelatedField(queryset=Group.objects.all())
    group_name = serializers.CharField(source="group.name", read_only=True)
    can_view = serializers.BooleanField(default=True)
    can_download = serializers.BooleanField(default=False)


class UserGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["id", "name"]


class DatasetSerializer(serializers.ModelSerializer):
    variables = DatasetVariableSerializer(many=True, read_only=True)
    access_policies = DatasetPolicySerializer(many=True, required=False)

    class Meta:
        model = Dataset
        fields = [
            "id",
            "code",
            "name",
            "category",
            "description",
            "source_provider",
            "spatial_extent",
            "time_start",
            "time_end",
            "temporal_resolution",
            "access_level",
            "access_policies",
            "is_active",
            "created_at",
            "updated_at",
            "variables",
        ]

    def validate_access_policies(self, value):
        group_ids = [item["group"].id for item in value]
        if len(group_ids) != len(set(group_ids)):
            raise serializers.ValidationError("Mỗi nhóm chỉ được chọn một lần.")
        return value

    def create(self, validated_data):
        policies = validated_data.pop("access_policies", None)
        with transaction.atomic():
            dataset = super().create(validated_data)
            self._replace_policies(dataset, policies)
        return dataset

    def update(self, instance, validated_data):
        policies = validated_data.pop("access_policies", None)
        with transaction.atomic():
            dataset = super().update(instance, validated_data)
            self._replace_policies(dataset, policies)
        return dataset

    @staticmethod
    def _replace_policies(dataset, policies):
        if policies is None:
            return
        dataset.access_policies.all().delete()
        DatasetAccessPolicy.objects.bulk_create(
            DatasetAccessPolicy(
                dataset=dataset,
                group=item["group"],
                can_view=item["can_view"],
                can_query=item["can_view"],
                can_download=item["can_download"],
            )
            for item in policies
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if not is_staff_user(getattr(request, "user", None)):
            data.pop("access_policies", None)
        return data
```

- [ ] **Step 4: Sửa view và router**

Trong `apps/wind_core/views.py`, thêm vào import:

```python
from django.contrib.auth.models import Group
```

và thêm `UserGroupSerializer` vào khối import từ `wind_core.serializers`.

Thay class `DatasetAccessPolicyViewSet`:

```python
class DatasetAccessPolicyViewSet(viewsets.ModelViewSet):
    queryset = DatasetAccessPolicy.objects.all().order_by("id")
    serializer_class = DatasetAccessPolicySerializer
    permission_classes = [permissions.IsAdminUser]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["dataset", "group", "can_view", "can_query", "can_download"]


class UserGroupViewSet(viewsets.ReadOnlyModelViewSet):
    """Danh sách nhóm người dùng để chọn trong form phân quyền bộ dữ liệu."""

    queryset = Group.objects.all().order_by("name")
    serializer_class = UserGroupSerializer
    permission_classes = [permissions.IsAdminUser]
    pagination_class = None
```

Trong `apps/configs/api_router.py`, thêm `UserGroupViewSet` vào import từ `wind_core.views` và đăng ký dưới dòng `ingestion-logs`:

```python
router.register(r"user-groups", UserGroupViewSet, basename="user-group")
```

- [ ] **Step 5: Chạy test, phải đạt**

Run: `docker compose exec -T wind_be python manage.py test tests wind_core`
Expected: PASS (gồm `test_dataset_variables_and_policies_crud` cũ trong `tests.test_admin_endpoints`).

- [ ] **Step 6: Commit**

```bash
git add apps/wind_core apps/configs/api_router.py apps/tests/test_dataset_access.py
git commit -m "feat: save dataset access policies with the dataset and expose user groups"
```

---

### Task 6: Áp dụng phân quyền cho API bộ dữ liệu và dữ liệu lưới

**Files:**
- Modify: `apps/wind_core/views.py` (`DatasetViewSet.get_queryset`, `DatasetVariableViewSet`)
- Modify: `apps/wind_raster/views.py` (`get_queryset`, `point_metadata`, `data`)
- Modify: `apps/wind_raster/services/raster_service.py`
- Modify: `apps/wind_raster/tests.py` (`RasterTestCase.setUp`)
- Test: `apps/tests/test_dataset_access.py`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối class `DatasetAccessTest`:

```python
    def _rows(self, response):
        return response.data["results"] if isinstance(response.data, dict) else response.data

    def test_dataset_list_and_detail_follow_access(self):
        for user, expected in self._expected_by_user():
            with self.subTest(user=getattr(user, "username", "anonymous")):
                self.client.force_authenticate(user=user)
                response = self.client.get(f"{API}/datasets/")
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual({row["code"] for row in self._rows(response)}, expected)

        self.client.force_authenticate(user=None)
        self.assertEqual(
            self.client.get(f"{API}/datasets/{self.restricted.id}/").status_code, status.HTTP_404_NOT_FOUND
        )
        self.client.force_authenticate(user=self.member)
        self.assertEqual(self.client.get(f"{API}/datasets/{self.restricted.id}/").status_code, status.HTTP_200_OK)

    def test_dataset_variables_follow_access(self):
        DatasetVariable.objects.create(dataset=self.public, variable_code="wind_10m", variable_name="Gió 10m")
        DatasetVariable.objects.create(dataset=self.restricted, variable_code="wind_10m", variable_name="Gió 10m")
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(f"{API}/dataset-variables/").data["count"], 1)
        self.client.force_authenticate(user=self.member)
        self.assertEqual(self.client.get(f"{API}/dataset-variables/").data["count"], 2)

    def test_raster_granule_list_and_summary_follow_access(self):
        for user, expected in self._expected_by_user():
            with self.subTest(user=getattr(user, "username", "anonymous")):
                self.client.force_authenticate(user=user)
                listing = self.client.get(f"{API}/raster-granules/")
                self.assertEqual({row["dataset_code"] for row in self._rows(listing)}, expected)
                summary = self.client.get(f"{API}/raster-granules/summary/")
                self.assertEqual(summary.data["total_granules"], len(expected))

    def test_raster_data_endpoint_checks_access(self):
        def status_for(user, dataset):
            self.client.force_authenticate(user=user)
            url = f"{API}/raster-granules/data/?dataset_id={dataset.id}&variable=wind_10m"
            return self.client.get(url).status_code

        self.assertEqual(status_for(None, self.internal), status.HTTP_403_FORBIDDEN)
        self.assertEqual(status_for(self.outsider, self.restricted), status.HTTP_403_FORBIDDEN)
        # Có quyền thì đi qua bước kiểm tra, dừng ở bước tìm biến chưa khai báo
        self.assertEqual(status_for(None, self.public), status.HTTP_400_BAD_REQUEST)
        self.assertEqual(status_for(self.member, self.restricted), status.HTTP_400_BAD_REQUEST)

    def test_point_metadata_follows_access(self):
        def count_for(user):
            self.client.force_authenticate(user=user)
            response = self.client.get(
                f"{API}/raster-granules/point_metadata/",
                {"lat": 10, "lon": 106, "time": self.moment.isoformat(), "dataset_code": "INT"},
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            return response.data["count"]

        self.assertEqual(count_for(None), 0)
        self.assertEqual(count_for(self.outsider), 1)
```

- [ ] **Step 2: Chạy test, phải thất bại**

Run: `docker compose exec -T wind_be python manage.py test tests.test_dataset_access`
Expected: FAIL ở 5 test vừa thêm (khách vẫn thấy tất cả).

- [ ] **Step 3: Lọc bộ dữ liệu và biến trong `wind_core/views.py`**

Thêm import: `from wind_core.access import accessible_datasets, is_staff_user`.

Thay `DatasetViewSet.get_queryset`:

```python
    def get_queryset(self):
        user = getattr(self.request, "user", None)
        if is_staff_user(user):
            include_all = str(self.request.query_params.get("all", "")).lower() in ("true", "1")
            if include_all:
                return Dataset.objects.all().order_by("id")
            return super().get_queryset()
        return accessible_datasets(user, super().get_queryset())
```

Thêm vào `DatasetVariableViewSet` (dưới `filterset_fields`):

```python
    def get_queryset(self):
        allowed = accessible_datasets(getattr(self.request, "user", None))
        return DatasetVariable.objects.filter(dataset__in=allowed).order_by("id")
```

- [ ] **Step 4: Lọc dữ liệu lưới trong `wind_raster/views.py`**

Thêm import: `from wind_core.access import accessible_datasets`.

Thêm vào `RasterGranuleIndexViewSet`, ngay dưới `filterset_fields`:

```python
    def get_queryset(self):
        allowed = accessible_datasets(self.request.user)
        return RasterGranuleIndex.objects.filter(dataset__in=allowed).order_by("id")
```

Trong `point_metadata`, đổi `granules = self.queryset.filter(` thành `granules = self.get_queryset().filter(`.

Đổi dòng cuối của `data`:

```python
        return get_raster_granule_data_service(request.query_params, user=request.user)
```

- [ ] **Step 5: Chặn trong `raster_service.py`**

Thêm import: `from wind_core.access import accessible_datasets` và `from wind_core.models import Dataset, DatasetVariable` (thay import `DatasetVariable` cũ).

Đổi chữ ký và thêm kiểm tra ngay sau khối `try: dataset_id = int(...)`:

```python
def get_raster_granule_data_service(query_params, user=None):
```

```python
    if (
        Dataset.objects.filter(id=dataset_id).exists()
        and not accessible_datasets(user).filter(id=dataset_id).exists()
    ):
        return Response({"error": "Bạn không có quyền xem bộ dữ liệu này."}, status=403)
```

Cập nhật docstring: thêm dòng "Chỉ trả dữ liệu khi người dùng được phép xem bộ dữ liệu."

- [ ] **Step 6: Sửa test cũ**

Trong `apps/wind_raster/tests.py`, `RasterTestCase.setUp`, thêm `access_level="PUBLIC",` vào lời gọi `Dataset.objects.create(code="ERA5_GRID", ...)` vì các test này gọi API không đăng nhập.

- [ ] **Step 7: Chạy toàn bộ test backend**

Run: `docker compose exec -T wind_be python manage.py test`
Expected: PASS toàn bộ. Nếu test nào khác thất bại do bộ dữ liệu tạo với `access_level` mặc định `INTERNAL` mà gọi API không đăng nhập (ví dụ trong `tests/test_e2e_frontend_contract.py` hoặc `wind_cds`), thêm `access_level="PUBLIC"` vào lời gọi `Dataset.objects.create` của test đó. Không đổi hành vi code.

- [ ] **Step 8: Commit**

```bash
git add apps
git commit -m "feat: enforce dataset access on dataset and raster APIs"
```

---

### Task 7: Giao diện bộ dữ liệu

**Files:**
- Modify: `frontend/src/api/admin.js:245-248`
- Modify: `frontend/src/routes/admin/AdminDatasetsRoute.jsx`

- [ ] **Step 1: Sửa API**

Trong `frontend/src/api/admin.js`, thay `getDatasetAccessPolicies` bằng:

```js
export const getUserGroups = () => {
    return axios.get(`${BASE_URL}/user-groups/`, authConfig())
        .then(res => res.data.results || res.data || []);
};
```

- [ ] **Step 2: Sửa phần đầu tệp `AdminDatasetsRoute.jsx` (dòng 1 tới hết `handleSaveDataset`)**

Thay từ dòng 1 tới hết hàm `handleSaveDataset` bằng:

```jsx
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    getAdminDatasets,
    createDataset,
    updateDataset,
    deleteDataset,
    getAdminDatasetVariables,
    getUserGroups
} from '../../api/admin';

const ACCESS_LABELS = {
    PUBLIC: 'Công khai',
    INTERNAL: 'Cần đăng nhập',
    RESTRICTED: 'Theo nhóm'
};

const ACCESS_OPTIONS = [
    { value: 'PUBLIC', title: 'Công khai', hint: 'Ai cũng xem được, không cần đăng nhập.' },
    { value: 'INTERNAL', title: 'Cần đăng nhập', hint: 'Chỉ người đã đăng nhập mới xem được.' },
    { value: 'RESTRICTED', title: 'Theo nhóm', hint: 'Chỉ các nhóm được chọn bên dưới xem được. Quản trị viên luôn xem được.' }
];

const emptyForm = () => ({
    id: null,
    code: '',
    name: '',
    description: '',
    source_provider: 'ECMWF / Copernicus',
    access_level: 'INTERNAL',
    is_active: true,
    policies: []
});

const AdminDatasetsRoute = () => {
    const [activeTab, setActiveTab] = useState('datasets'); // 'datasets' | 'variables'
    const [datasets, setDatasets] = useState([]);
    const [variables, setVariables] = useState([]);
    const [groups, setGroups] = useState([]);
    const [selectedDatasetFilter, setSelectedDatasetFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Modal Dataset
    const [showDatasetModal, setShowDatasetModal] = useState(false);
    const [datasetForm, setDatasetForm] = useState(emptyForm());

    const loadAll = () => {
        setLoading(true);
        Promise.allSettled([
            getAdminDatasets(),
            getAdminDatasetVariables(selectedDatasetFilter ? { dataset: selectedDatasetFilter } : {}),
            getUserGroups()
        ]).then(([dsRes, varRes, groupRes]) => {
            if (dsRes.status === 'fulfilled') {
                setDatasets(dsRes.value);
            } else {
                setFeedback({ type: 'danger', message: 'Lỗi tải bộ dữ liệu: ' + (dsRes.reason?.response?.data?.detail || dsRes.reason?.message) });
            }
            if (varRes.status === 'fulfilled') {
                setVariables(varRes.value);
            }
            if (groupRes.status === 'fulfilled') {
                setGroups(groupRes.value);
            }
            setLoading(false);
        });
    };

    useEffect(() => {
        loadAll();
    }, [selectedDatasetFilter]);

    const togglePolicyGroup = (groupId, checked) => {
        setDatasetForm(prev => ({
            ...prev,
            policies: checked
                ? [...prev.policies, { group: groupId, can_download: false }]
                : prev.policies.filter(p => p.group !== groupId)
        }));
    };

    const setPolicyDownload = (groupId, value) => {
        setDatasetForm(prev => ({
            ...prev,
            policies: prev.policies.map(p => (p.group === groupId ? { ...p, can_download: value } : p))
        }));
    };

    const openEditModal = (d) => {
        setDatasetForm({
            id: d.id,
            code: d.code,
            name: d.name,
            description: d.description || '',
            source_provider: d.source_provider || '',
            access_level: d.access_level,
            is_active: d.is_active,
            policies: (d.access_policies || []).map(p => ({ group: p.group, can_download: p.can_download }))
        });
        setShowDatasetModal(true);
    };

    const handleSaveDataset = (e) => {
        e.preventDefault();
        const payload = {
            code: datasetForm.code,
            name: datasetForm.name,
            description: datasetForm.description,
            source_provider: datasetForm.source_provider,
            access_level: datasetForm.access_level,
            is_active: datasetForm.is_active,
            access_policies: datasetForm.access_level === 'RESTRICTED'
                ? datasetForm.policies.map(p => ({ group: p.group, can_view: true, can_download: p.can_download }))
                : [],
            // Mọi bộ dữ liệu tạo ở đây đều là dữ liệu lưới
            ...(datasetForm.id ? {} : { category: 'GRIDDED' })
        };

        const promise = datasetForm.id
            ? updateDataset(datasetForm.id, payload)
            : createDataset(payload);

        promise.then(() => {
            setFeedback({ type: 'success', message: 'Lưu bộ dữ liệu thành công!' });
            setShowDatasetModal(false);
            loadAll();
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Không thể lưu: ' + JSON.stringify(err.response?.data || err.message) });
        });
    };
```

(giữ nguyên `handleDeleteDataset` ngay sau đó)

- [ ] **Step 3: Sửa tiêu đề, nút tạo, tab**

Trong phần `return`:
- Mô tả dưới tiêu đề: đổi thành `Quản lý các bộ dữ liệu gió dạng lưới, danh mục biến và người được xem từng bộ dữ liệu.`; tiêu đề đổi thành `Bộ dữ liệu và quyền xem`.
- Nút "Tạo bộ dữ liệu mới": `onClick={() => { setDatasetForm(emptyForm()); setShowDatasetModal(true); }}`.
- Xóa toàn bộ nút tab "Chính sách phân quyền" (khối `<button ... setActiveTab('policies') ...>` đến `</button>`) và toàn bộ khối `{/* TAB 3: Access Policies */} {activeTab === 'policies' && (...)}`.

- [ ] **Step 4: Sửa bảng bộ dữ liệu**

- Bỏ `<th>Phân loại</th>` và `<td>` chứa `CATEGORY_LABELS`; đổi `colSpan="7"` thành `colSpan="6"`.
- Đổi tiêu đề cột `Cấp truy cập` thành `Ai được xem`.
- Nút sửa: `onClick={() => openEditModal(d)}` (thay khối `setDatasetForm({...}); setShowDatasetModal(true);` cũ).

- [ ] **Step 5: Sửa form trong modal**

Xóa `<div className="form-group">` chứa select "Phân loại" và `<div className="form-group">` chứa select "Cấp độ truy cập" (khối lưới 2 cột thứ hai). Thay bằng khối sau, đặt ngay dưới khối lưới "Mã định danh" và "Tên hiển thị":

```jsx
<div className="form-group" style={{ marginBottom: '14px' }}>
    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Ai được xem</label>
    {ACCESS_OPTIONS.map(opt => (
        <label key={opt.value} style={{ display: 'block', fontWeight: 400, margin: '6px 0', cursor: 'pointer' }}>
            <input
                type="radio"
                name="dataset-access-level"
                checked={datasetForm.access_level === opt.value}
                onChange={() => setDatasetForm({ ...datasetForm, access_level: opt.value })}
                style={{ marginRight: '8px' }}
            />
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{opt.title}</span>
            <span style={{ color: '#64748b', fontSize: '12px', marginLeft: '8px' }}>{opt.hint}</span>
        </label>
    ))}
    {datasetForm.access_level === 'RESTRICTED' && (
        <div data-testid="dataset-group-list" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', marginTop: '8px', maxHeight: '180px', overflowY: 'auto' }}>
            {groups.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '13px' }}>Chưa có nhóm người dùng nào để chọn.</div>
            ) : (
                groups.map(g => {
                    const policy = datasetForm.policies.find(p => p.group === g.id);
                    return (
                        <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                            <label style={{ fontWeight: 500, margin: 0, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={!!policy}
                                    onChange={e => togglePolicyGroup(g.id, e.target.checked)}
                                    style={{ marginRight: '8px' }}
                                />
                                {g.name}
                            </label>
                            {policy && (
                                <label style={{ fontWeight: 400, fontSize: '12px', color: '#475569', margin: 0, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={policy.can_download}
                                        onChange={e => setPolicyDownload(g.id, e.target.checked)}
                                        style={{ marginRight: '6px' }}
                                    />
                                    Cho phép tải về
                                </label>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    )}
</div>
```

- [ ] **Step 6: Kiểm tra bản dựng**

Run: `cd frontend && npm run build`
Expected: build thành công, không có lỗi `getDatasetAccessPolicies is not exported` hay `CATEGORY_LABELS is not defined`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: merge dataset access settings into the dataset form"
```

---

### Task 8: Giao diện nạp tệp lưới

**Files:**
- Modify: `frontend/src/routes/admin/AdminRastersRoute.jsx`

- [ ] **Step 1: Hiển thị lỗi nhiều dòng**

Trong khối `{uploadResult && (<div className={...} style={{ borderRadius: '8px', marginTop: '16px', marginBottom: 0 }}>`, thêm `whiteSpace: 'pre-line'` vào `style`:

```jsx
style={{ borderRadius: '8px', marginTop: '16px', marginBottom: 0, whiteSpace: 'pre-line' }}
```

- [ ] **Step 2: Hướng dẫn về mốc giờ và nạp nhiều tệp**

Thay dòng chữ trong ô kéo thả (`Hỗ trợ tệp từ các mô hình ERA5, WRF, GFS theo mốc giờ hoặc chuỗi thời gian nhiều mốc`) bằng hai dòng:

```jsx
<div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
    Tệp có sẵn thời gian bên trong sẽ dùng thời gian đó. Tệp không có thì lấy giờ từ tên tệp, ví dụ 2021010100.nc.
</div>
<div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
    Muốn nạp nhiều mốc giờ một lần, hãy nén các tệp vào một tệp .zip.
</div>
```

(xóa thẻ `<div>` cũ chứa dòng chữ đã thay)

- [ ] **Step 3: Kiểm tra bản dựng**

Run: `cd frontend && npm run build`
Expected: build thành công.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/admin/AdminRastersRoute.jsx
git commit -m "feat: explain time detection and zip upload on the raster upload page"
```

---

### Task 9: Cập nhật e2e và kiểm tra toàn bộ

**Files:**
- Modify: `frontend/e2e/admin-farms-datasets.spec.js:103-135`

- [ ] **Step 1: Cập nhật test e2e**

Thay test `E2E-ADM-06b` bằng:

```js
    test('E2E-ADM-06b: Datasets CRUD with access settings and variables tab', async ({ page }) => {
        await navigateHash(page, '/admin/datasets');
        const dsCode = `E2E_DS_${Date.now().toString().slice(-5)}`;
        const dsName = `Bộ dữ liệu E2E ${dsCode}`;

        // Khu vực phân quyền nằm trong form, không còn tab riêng và trường phân loại
        await expect(page.getByRole('button', { name: /Chính sách phân quyền/i })).toHaveCount(0);

        // Create dataset
        await page.getByRole('button', { name: /Tạo bộ dữ liệu mới/i }).click();
        await expect(page.getByText('Phân loại')).toHaveCount(0);
        await page.getByPlaceholder(/Ví dụ: ERA5_HOURLY/i).fill(dsCode);
        await page.getByPlaceholder(/Ví dụ: Gió ERA5/i).fill(dsName);
        await page.getByLabel(/Theo nhóm/i).check();
        await expect(page.getByTestId('dataset-group-list')).toBeVisible();
        await page.getByLabel(/Công khai/i).check();
        await expect(page.getByTestId('dataset-group-list')).toHaveCount(0);
        await page.getByRole('button', { name: /Lưu bộ dữ liệu/i }).click();
        await expect(page.locator('table')).toContainText(dsCode);
        await expect(page.locator('tr', { hasText: dsCode })).toContainText('Công khai');

        // Edit dataset
        const dsRow = page.locator('tr', { hasText: dsCode });
        await dsRow.locator('button[title="Chỉnh sửa"], button:has(i.fa-pencil)').first().click();
        await page.getByPlaceholder(/Ví dụ: Gió ERA5/i).fill(`${dsName} (Updated)`);
        await page.getByRole('button', { name: /Lưu bộ dữ liệu/i }).click();
        await expect(page.locator('table')).toContainText(`${dsName} (Updated)`);

        // Delete test dataset
        page.once('dialog', (d) => d.accept());
        await page.locator('tr', { hasText: dsCode }).locator('button[title="Xóa"], button.btn-danger').first().click();
        await expect(page.locator('table')).not.toContainText(dsCode);

        // Variables tab & filter
        await page.getByRole('button', { name: /Biến dữ liệu/i }).click();
        await expect(page.locator('table')).toBeVisible();
        await saveEvidence(page, 'adm_06_datasets_variables.png');
    });
```

- [ ] **Step 2: Đảm bảo dữ liệu thử của e2e nạp tệp vẫn đúng**

Run: `grep -n "category\|createDataset\|datasets" frontend/e2e/admin-rasters.spec.js`
Nếu spec này tạo bộ dữ liệu bằng API, kiểm tra payload có `category: 'GRIDDED'` và `access_level` phù hợp. Nếu dùng giao diện thì không cần đổi.

- [ ] **Step 3: Chạy toàn bộ test backend**

Run: `docker compose exec -T wind_be python manage.py test`
Expected: PASS toàn bộ.

- [ ] **Step 4: Dựng lại frontend và chạy e2e**

Run: `cd frontend && npm run build && npx playwright test e2e/admin-farms-datasets.spec.js e2e/admin-rasters.spec.js e2e/public-grid-map.spec.js`
Expected: PASS. Nếu `public-grid-map` thất bại vì bộ dữ liệu thử đang `INTERNAL` mà trang công khai không đăng nhập, đặt bộ dữ liệu đó thành "Công khai" qua giao diện hoặc fixture, không đổi code ứng dụng.

- [ ] **Step 5: Kiểm tra thủ công với dữ liệu thật**

1. Tạo một tệp zip chứa vài tệp đầu tiên trong `D:\Data\Winds\wrf3km_cut\2021` (ví dụ 120 tệp, tương đương 30 ngày).
2. Trong giao diện quản trị, tạo bộ dữ liệu "Gió WRF 3km" với mục "Ai được xem" là "Công khai".
3. Vào trang nạp tệp, chọn bộ dữ liệu đó, thả tệp zip và bấm nạp. Kỳ vọng: thông báo `Đã nạp 120 mốc giờ, từ 01/01/2021 00:00 đến 30/01/2021 18:00 (UTC), gồm Gió 10m, Gió 100m.`
4. Nạp thử một tệp `.nc` lẻ đổi tên thành `abc.nc`. Kỳ vọng: thông báo `abc.nc: Không xác định được thời gian. Hãy đặt tên tệp theo dạng 2021010100.nc (năm, tháng, ngày, giờ).`
5. Ghi lại thời gian xử lý của bước 3. Nếu nạp 120 tệp mất trên 15 giây thì nạp 1460 tệp có nguy cơ vượt 300 giây (nginx và gunicorn đều đặt 300 giây). Khi đó cần một kế hoạch riêng để chuyển việc nạp sang chạy nền.
6. Mở trang bản đồ gió công khai khi chưa đăng nhập và xác nhận thấy bộ dữ liệu WRF; đổi bộ dữ liệu sang "Cần đăng nhập" rồi tải lại, xác nhận bộ dữ liệu biến mất.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e
git commit -m "test: update dataset e2e for the merged access settings"
```

---

## Rủi ro và việc ngoài kế hoạch

- **Quyền "Được tải về" chưa có tác dụng.** Repo không có API tải dữ liệu lưới nào. Quyền này được lưu và có hàm `can_download_dataset` sẵn, nhưng chưa có chỗ nào gọi.
- **Bộ dữ liệu hiện có mặc định "Cần đăng nhập".** Cột `access_level` mặc định là `INTERNAL` và trước đây không được áp dụng. Sau thay đổi này, các bộ dữ liệu cũ chưa đặt "Công khai" sẽ biến mất khỏi trang bản đồ công khai. Admin cần mở từng bộ dữ liệu và chọn lại.
- **Nhật ký nạp dữ liệu** (`/ingestion-logs/`) vẫn cho khách đọc, kèm tên tệp. Việc này có từ trước và nằm ngoài phạm vi.
- **Thời gian nạp 1460 tệp** có thể vượt 300 giây, xem Task 9 bước 5.
