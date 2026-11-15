"""Nhập, xuất và tạo tệp mẫu CSV cho danh sách trạm quan trắc."""

import csv
import io

from django.contrib.gis.geos import Point
from django.db import transaction

from wind_stations.models import Station

CSV_COLUMNS = ["station_code", "name", "station_type", "elevation", "lat", "lon", "is_active"]
REQUIRED_COLUMNS = ["station_code", "name", "lat", "lon"]
DEFAULT_STATION_TYPE = "SURFACE"
STATION_CODE_MAX_LENGTH = 32
STATION_TYPE_MAX_LENGTH = 32
STATION_NAME_MAX_LENGTH = 255
PREVIEW_LIMIT = 50

TEMPLATE_ROWS = [
    ["PHU_QUY", "Trạm khí tượng Phú Quý", "SURFACE", "15.5", "10.518", "108.932", "1"],
    ["COT_DO_01", "Cột đo gió số 1", "MET_MAST", "42", "11.254", "109.101", "1"],
    ["PHAO_01", "Phao quan trắc số 1", "BUOY", "", "9.876", "107.654", "0"],
]

# Chấp nhận cả mã loại trạm lẫn tên hiển thị tiếng Việt
STATION_TYPE_ALIASES = {
    "bề mặt": "SURFACE",
    "cột khí tượng": "MET_MAST",
    "phao biển": "BUOY",
}
TRUE_VALUES = {"1", "true", "yes", "có", "hoạt động", "đang vận hành"}
FALSE_VALUES = {"0", "false", "no", "không", "tắt"}

# BOM giúp Excel nhận đúng UTF-8 khi mở tệp
UTF8_BOM = chr(0xFEFF)


class StationCsvError(Exception):
    """Lỗi chung của tệp (không đọc được, thiếu cột bắt buộc...)."""


def normalize_station_code(code):
    """Chuẩn hóa mã trạm giống cách StationSerializer lưu mã."""
    return str(code).replace(" ", "_").replace("/", "_").strip()


def build_csv(rows):
    """Ghép các dòng thành nội dung CSV UTF-8 có BOM."""
    buffer = io.StringIO()
    buffer.write(UTF8_BOM)
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(CSV_COLUMNS)
    writer.writerows(rows)
    return buffer.getvalue()


def build_template_csv():
    return build_csv(TEMPLATE_ROWS)


def _format_number(value):
    if value is None:
        return ""
    return format(value.normalize(), "f") if hasattr(value, "normalize") else str(value)


def build_export_csv(stations):
    rows = []
    for station in stations:
        rows.append([
            station.station_code,
            station.name,
            station.station_type or DEFAULT_STATION_TYPE,
            _format_number(station.elevation),
            station.geom.y if station.geom else "",
            station.geom.x if station.geom else "",
            1 if station.is_active else 0,
        ])
    return build_csv(rows)


def _read_rows(uploaded_file):
    """Đọc tệp CSV thành danh sách (số dòng, dict cột -> giá trị)."""
    raw = uploaded_file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise StationCsvError("Tệp phải được lưu ở định dạng UTF-8.")

    first_line = text.splitlines()[0] if text.strip() else ""
    delimiter = ";" if ";" in first_line and "," not in first_line else ","

    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    try:
        header = next(reader)
    except StopIteration:
        raise StationCsvError("Tệp không có dữ liệu.")
    header = [h.strip().lower() for h in header]

    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        raise StationCsvError(f"Tệp thiếu các cột bắt buộc: {', '.join(missing)}.")

    rows = []
    for cells in reader:
        if not any(c.strip() for c in cells):
            continue
        record = {col: (cells[i].strip() if i < len(cells) else "") for i, col in enumerate(header)}
        rows.append((reader.line_num, record))
    return rows


def _to_float(value, low, high):
    if value == "":
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    if number != number or not low <= number <= high:  # NaN hoặc ngoài phạm vi
        return None
    return number


def _validate_row(record):
    """Trả về (dữ liệu đã chuẩn hóa, danh sách lỗi)."""
    problems = []

    code = normalize_station_code(record.get("station_code", ""))
    if not code:
        problems.append("thiếu mã trạm")
    elif len(code) > STATION_CODE_MAX_LENGTH:
        problems.append(f"mã trạm dài quá {STATION_CODE_MAX_LENGTH} ký tự")

    name = record.get("name", "")
    if not name:
        problems.append("thiếu tên trạm")
    elif len(name) > STATION_NAME_MAX_LENGTH:
        problems.append(f"tên trạm dài quá {STATION_NAME_MAX_LENGTH} ký tự")

    type_raw = record.get("station_type", "")
    station_type = STATION_TYPE_ALIASES.get(type_raw.lower(), type_raw) or DEFAULT_STATION_TYPE
    if len(station_type) > STATION_TYPE_MAX_LENGTH:
        problems.append(f"loại trạm dài quá {STATION_TYPE_MAX_LENGTH} ký tự")

    lat = _to_float(record.get("lat", ""), -90, 90)
    if lat is None:
        problems.append("vĩ độ không hợp lệ")
    lon = _to_float(record.get("lon", ""), -180, 180)
    if lon is None:
        problems.append("kinh độ không hợp lệ")

    elevation = None
    if record.get("elevation", "") != "":
        # Cột độ cao của trạm lưu tối đa 8 chữ số, trong đó 2 chữ số thập phân
        elevation = _to_float(record["elevation"], -999999, 999999)
        if elevation is None:
            problems.append("độ cao không hợp lệ")

    is_active = True
    active_raw = record.get("is_active", "").lower()
    if active_raw:
        if active_raw in TRUE_VALUES:
            is_active = True
        elif active_raw in FALSE_VALUES:
            is_active = False
        else:
            problems.append("trạng thái hoạt động không hợp lệ")

    data = {
        "station_code": code,
        "name": name,
        "station_type": station_type,
        "elevation": elevation,
        "lat": lat,
        "lon": lon,
        "is_active": is_active,
    }
    return data, problems


def import_stations_from_csv(uploaded_file, dry_run=False):
    """
    Thêm mới hoặc cập nhật trạm theo mã trạm từ tệp CSV.
    Dòng lỗi được bỏ qua, các dòng hợp lệ vẫn được xử lý.
    Khi dry_run=True chỉ kiểm tra và trả kết quả dự kiến, không ghi dữ liệu.
    """
    rows = _read_rows(uploaded_file)

    existing = {}
    for station in Station.objects.order_by("-id"):  # trạm id nhỏ nhất ghi đè sau cùng
        existing[station.station_code.lower()] = station

    errors = []
    valid = []
    seen = set()
    for line, record in rows:
        data, problems = _validate_row(record)
        if not problems and data["station_code"].lower() in seen:
            problems.append(f"mã trạm {data['station_code']} bị trùng trong tệp")
        if problems:
            errors.append({"line": line, "message": "; ".join(problems)})
            continue
        seen.add(data["station_code"].lower())
        valid.append((line, data))

    to_create, to_update, preview = [], [], []
    for line, data in valid:
        station = existing.get(data["station_code"].lower())
        point = Point(data["lon"], data["lat"], srid=4326)
        if station:
            station.name = data["name"]
            station.station_type = data["station_type"]
            station.elevation = data["elevation"]
            station.geom = point
            station.is_active = data["is_active"]
            to_update.append(station)
        else:
            to_create.append(Station(
                station_code=data["station_code"],
                name=data["name"],
                station_type=data["station_type"],
                elevation=data["elevation"],
                geom=point,
                is_active=data["is_active"],
            ))
        if len(preview) < PREVIEW_LIMIT:
            preview.append({
                "line": line,
                "station_code": data["station_code"],
                "name": data["name"],
                "station_type": data["station_type"],
                "action": "update" if station else "create",
            })

    if not dry_run:
        with transaction.atomic():
            Station.objects.bulk_create(to_create)
            Station.objects.bulk_update(
                to_update, ["name", "station_type", "elevation", "geom", "is_active"]
            )

    return {
        "dry_run": dry_run,
        "total_rows": len(rows),
        "created": len(to_create),
        "updated": len(to_update),
        "errors": errors,
        "preview": preview,
    }
