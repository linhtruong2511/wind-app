"""
Truy vấn số liệu quan trắc trực tiếp từ kho Parquet bằng DuckDB.

Mọi API thống kê và danh sách quan trắc đều đọc từ đây, giữ nguyên định dạng phản hồi
trước đây (trạm được nhận diện qua station_id, được ánh xạ từ station_code của Parquet).
"""

import time
from datetime import datetime

import duckdb
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from wind_stations.models import Station
from .duckdb_storage_service import get_storage_root

METRIC_COLUMNS = [
    "wind_speed",
    "wind_dir",
    "temp_2m",
    "temp_min",
    "temp_max",
    "humidity",
    "pressure",
    "rain_06h",
    "rain_24h",
]

# Các chỉ số có thống kê min/max/trung bình/trung vị theo tháng, năm
SUMMARY_METRICS = [
    "temp_2m",
    "temp_min",
    "temp_max",
    "humidity",
    "pressure",
    "wind_speed",
    "rain_06h",
    "rain_24h",
]

WIND_DIRECTIONS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
WIND_SPEED_LABELS = ["0 - 2 m/s", "2 - 4 m/s", "4 - 6 m/s", "6 - 8 m/s", "8 - 10 m/s", "> 10 m/s"]
WIND_SPEED_RANGES = ["0-2", "2-4", "4-6", "6-8", "8-10", ">10"]

RANKING_METRICS = {
    "wind_speed_max": ("wind_speed", "max"),
    "wind_speed_avg": ("wind_speed", "avg"),
    "temp_max": ("temp_2m", "max"),
    "temp_min": ("temp_2m", "min"),
    "rain_24h_max": ("rain_24h", "max"),
    "pressure_min": ("pressure", "min"),
}
ASCENDING_RANKINGS = {"temp_min", "pressure_min"}

LATEST_CACHE_TTL_SECONDS = 60
_latest_cache = {"root": None, "at": 0.0, "data": {}}


# ---------------------------------------------------------------------------
# Tiện ích dùng chung
# ---------------------------------------------------------------------------
def parse_time_filter(value):
    """
    Chuyển chuỗi ngày giờ (ISO, có thể kèm múi giờ) thành datetime không múi giờ theo giờ địa phương,
    cùng quy ước với số liệu trong kho Parquet. Trả về None nếu giá trị rỗng.
    """
    if value in (None, ""):
        return None

    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        dt = parse_datetime(text)
        if dt is None:
            day = parse_date(text)
            if day is None:
                raise ValueError(f"Thời gian không hợp lệ: {value}")
            dt = datetime(day.year, day.month, day.day)

    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    return dt.replace(tzinfo=None)


def get_station_code_map():
    """Trả về dict station_code -> station_id của các trạm trong cơ sở dữ liệu."""
    return dict(Station.objects.values_list("station_code", "id"))


def _escape(text):
    return str(text).replace("'", "''")


def _lake_source(station_codes):
    """
    Trả về biểu thức read_parquet cho các tệp cần đọc, hoặc None nếu không có tệp nào.
    station_codes=None nghĩa là đọc toàn bộ kho.
    """
    root = get_storage_root()
    if station_codes is None:
        if not any(root.glob("*/*.parquet")):
            return None
        pattern = (root / "*" / "*.parquet").as_posix()
        return f"read_parquet('{_escape(pattern)}', union_by_name=true, filename=true)"

    files = []
    for code in station_codes:
        code = str(code)
        if not code or code in (".", "..") or "/" in code or "\\" in code:
            continue
        files.extend(sorted((root / code).glob("*.parquet")))
    if not files:
        return None
    file_list = ", ".join(f"'{_escape(f.as_posix())}'" for f in files)
    return f"read_parquet([{file_list}], union_by_name=true, filename=true)"


def _base_cte(source, available_columns):
    # Mã trạm lấy theo tên thư mục chứa tệp, giống cách kho dữ liệu liệt kê và xóa phân vùng.
    # Không dựa vào cột station_code trong tệp vì các tệp nạp từ trước có thể ghi mã chưa chuẩn hóa (ví dụ 48/10).
    # Chỉ số nào không có trong tệp nào thì coi là rỗng.
    metric_cols = ", ".join(
        f"TRY_CAST({c} AS DOUBLE) AS {c}" if c in available_columns else f"CAST(NULL AS DOUBLE) AS {c}"
        for c in METRIC_COLUMNS
    )
    return (
        "WITH obs AS ("
        "SELECT regexp_extract(filename, '([^/]+)/[^/]+$', 1) AS station_code, "
        f"CAST(obs_time AS TIMESTAMP) AS obs_time, {metric_cols} FROM {source})"
    )


def _where(station_codes, start=None, end=None, extra=None):
    clauses = []
    params = []
    if station_codes is not None:
        codes = list(station_codes)
        if not codes:
            clauses.append("FALSE")
        else:
            clauses.append(f"station_code IN ({', '.join('?' for _ in codes)})")
            params.extend(str(c) for c in codes)
    if start is not None:
        clauses.append("obs_time >= ?")
        params.append(start)
    if end is not None:
        clauses.append("obs_time <= ?")
        params.append(end)
    if extra:
        clauses.extend(extra)
    sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return sql, params


def _execute(body_sql, params, station_codes):
    """Chạy truy vấn trên bảng ảo obs, trả về danh sách dict. Kho trống thì trả về danh sách rỗng."""
    source = _lake_source(station_codes)
    if source is None:
        return []

    con = duckdb.connect()
    try:
        available = {row[0] for row in con.execute(f"DESCRIBE SELECT * FROM {source}").fetchall()}
        result = con.execute(f"{_base_cte(source, available)} {body_sql}", params)
        columns = [d[0] for d in result.description]
        return [dict(zip(columns, row)) for row in result.fetchall()]
    finally:
        con.close()


def _iso(value):
    return value.isoformat() if value is not None else None


def _round(value, digits=2):
    return round(float(value), digits) if value is not None else None


# ---------------------------------------------------------------------------
# Thống kê tổng quan, xếp hạng, so sánh
# ---------------------------------------------------------------------------
def get_overview(station_codes, start=None, end=None):
    where, params = _where(station_codes, start, end)
    rows = _execute(
        f"SELECT count(*) AS total, min(obs_time) AS min_date, max(obs_time) AS max_date FROM obs {where}",
        params,
        station_codes,
    )
    summary = rows[0] if rows else {"total": 0, "min_date": None, "max_date": None}

    where_wind, params_wind = _where(station_codes, start, end, extra=["wind_speed IS NOT NULL"])
    top_rows = _execute(
        f"SELECT station_code, wind_speed, obs_time FROM obs {where_wind} "
        "ORDER BY wind_speed DESC, obs_time ASC LIMIT 1",
        params_wind,
        station_codes,
    )
    top = top_rows[0] if top_rows else None

    return {
        "total_observations": int(summary["total"] or 0),
        "min_date": _iso(summary["min_date"]),
        "max_date": _iso(summary["max_date"]),
        "max_wind": (
            {
                "station_code": top["station_code"],
                "wind_speed": float(top["wind_speed"]),
                "obs_time": _iso(top["obs_time"]),
            }
            if top
            else None
        ),
    }


def get_rankings(station_codes, metric, limit, start=None, end=None):
    column, func = RANKING_METRICS.get(metric, ("wind_speed", "max"))
    ascending = metric in ASCENDING_RANKINGS
    where, params = _where(station_codes, start, end, extra=[f"{column} IS NOT NULL"])
    rows = _execute(
        f"SELECT station_code, {func}({column}) AS val FROM obs {where} "
        f"GROUP BY station_code ORDER BY val {'ASC' if ascending else 'DESC'}, station_code "
        f"LIMIT {max(int(limit), 0)}",
        params,
        station_codes,
    )
    return [{"station_code": r["station_code"], "value": _round(r["val"])} for r in rows]


def get_period_averages(station_codes, metric, interval, start=None, end=None):
    """Trung bình theo ngày hoặc tháng của một chỉ số cho từng trạm. metric phải thuộc METRIC_COLUMNS."""
    if metric not in METRIC_COLUMNS:
        raise ValueError(f"Chỉ số không hợp lệ: {metric}")
    unit = "day" if interval == "day" else "month"
    where, params = _where(station_codes, start, end)
    return _execute(
        f"SELECT date_trunc('{unit}', obs_time) AS period, station_code, avg({metric}) AS avg_val "
        f"FROM obs {where} GROUP BY 1, 2 ORDER BY 1, 2",
        params,
        station_codes,
    )


def get_station_aggregates(station_codes):
    """Tổng hợp tốc độ gió, nhiệt độ, khí áp và số bản ghi cho từng trạm."""
    where, params = _where(station_codes)
    rows = _execute(
        "SELECT station_code, avg(wind_speed) AS w_avg, max(wind_speed) AS w_max, "
        "avg(temp_2m) AS t_avg, max(temp_2m) AS t_max, min(temp_2m) AS t_min, "
        f"avg(pressure) AS p_avg, count(*) AS cnt FROM obs {where} GROUP BY station_code",
        params,
        station_codes,
    )
    return {r["station_code"]: r for r in rows}


# ---------------------------------------------------------------------------
# Thống kê theo tháng, năm của một trạm
# ---------------------------------------------------------------------------
def get_period_summary(station_code, summary_type="monthly", start=None, end=None):
    unit = "month" if summary_type == "monthly" else "year"
    metric_sql = ", ".join(
        f"min({m}) AS {m}_min, max({m}) AS {m}_max, avg({m}) AS {m}_avg, quantile_cont({m}, 0.5) AS {m}_median"
        for m in SUMMARY_METRICS
    )
    where, params = _where([station_code], start, end)
    rows = _execute(
        f"SELECT date_trunc('{unit}', obs_time) AS period, count(*) AS total_records, {metric_sql} "
        f"FROM obs {where} GROUP BY 1 ORDER BY 1",
        params,
        [station_code],
    )

    results = []
    for row in rows:
        item = {unit: _iso(row["period"]), "total_records": int(row["total_records"])}
        for m in SUMMARY_METRICS:
            for stat in ("min", "max", "avg", "median"):
                item[f"{m}_{stat}"] = _round(row[f"{m}_{stat}"], 3)
        results.append(item)
    return results


# ---------------------------------------------------------------------------
# Hoa gió
# ---------------------------------------------------------------------------
def _empty_wind_rose():
    return {
        "total_records": 0,
        "calm_percent": 0.0,
        "avg_wind_speed": 0.0,
        "directions": WIND_DIRECTIONS,
        "speed_bins": [{"label": label, "values": [0.0] * 16} for label in WIND_SPEED_LABELS],
        "distribution": {
            "speed_ranges": WIND_SPEED_RANGES,
            "counts": [0] * 6,
            "percentiles": {"p50": 0.0, "p75": 0.0, "p90": 0.0, "p99": 0.0},
        },
    }


def get_wind_rose(station_codes, start=None, end=None):
    """Phân bố hoa gió 16 hướng x 6 cấp tốc độ. Các mốc lặng gió (dưới 0,5 m/s) chỉ tính vào tổng."""
    where, params = _where(station_codes, start, end, extra=["wind_speed IS NOT NULL", "wind_dir IS NOT NULL"])

    overall = _execute(
        "SELECT count(*) AS total, avg(wind_speed) AS avg_speed, "
        "count(CASE WHEN wind_speed < 0.5 THEN 1 END) AS calm, "
        "quantile_cont(wind_speed, 0.50) AS p50, quantile_cont(wind_speed, 0.75) AS p75, "
        "quantile_cont(wind_speed, 0.90) AS p90, quantile_cont(wind_speed, 0.99) AS p99 "
        f"FROM obs {where}",
        params,
        station_codes,
    )
    if not overall or not overall[0]["total"]:
        return _empty_wind_rose()
    ov = overall[0]
    total = int(ov["total"])

    cells = _execute(
        "SELECT CAST(floor(((wind_dir + 11.25) % 360) / 22.5) AS INTEGER) % 16 AS dir_idx, "
        "CASE WHEN wind_speed < 2.0 THEN 0 WHEN wind_speed < 4.0 THEN 1 WHEN wind_speed < 6.0 THEN 2 "
        "WHEN wind_speed < 8.0 THEN 3 WHEN wind_speed < 10.0 THEN 4 ELSE 5 END AS bin_idx, "
        f"count(*) AS cnt FROM obs {where} AND wind_speed >= 0.5 GROUP BY 1, 2",
        params,
        station_codes,
    )

    grid = [[0] * 16 for _ in range(6)]
    for cell in cells:
        if 0 <= cell["dir_idx"] < 16 and 0 <= cell["bin_idx"] < 6:
            grid[cell["bin_idx"]][cell["dir_idx"]] += int(cell["cnt"])

    return {
        "total_records": total,
        "calm_percent": round(int(ov["calm"]) / total * 100.0, 2),
        "avg_wind_speed": round(float(ov["avg_speed"]), 2),
        "directions": WIND_DIRECTIONS,
        "speed_bins": [
            {"label": label, "values": [round(v / total * 100.0, 2) for v in grid[idx]]}
            for idx, label in enumerate(WIND_SPEED_LABELS)
        ],
        "distribution": {
            "speed_ranges": WIND_SPEED_RANGES,
            "counts": [sum(row) for row in grid],
            "percentiles": {
                "p50": round(float(ov["p50"]), 2),
                "p75": round(float(ov["p75"]), 2),
                "p90": round(float(ov["p90"]), 2),
                "p99": round(float(ov["p99"]), 2),
            },
        },
    }


# ---------------------------------------------------------------------------
# Danh sách quan trắc có phân trang
# ---------------------------------------------------------------------------
def _observation_payload(row, code_to_id):
    code = row["station_code"]
    obs_time = _iso(row["obs_time"])
    payload = {
        "id": f"{code}:{obs_time}",
        "station": code_to_id.get(code),
        "station_code": code,
        "obs_time": obs_time,
    }
    for column in ("rain_06h", "rain_24h", "temp_2m", "temp_min", "temp_max", "humidity", "pressure", "wind_dir", "wind_speed"):
        payload[column] = row[column]
    return payload


class ObservationRows:
    """
    Tập quan trắc đọc từ kho Parquet, hỗ trợ count() và cắt lát để dùng với bộ phân trang của DRF.
    """

    def __init__(self, station_codes, code_to_id, start=None, end=None, descending=True):
        self.station_codes = list(station_codes)
        self.code_to_id = code_to_id
        self.start = start
        self.end = end
        self.descending = descending
        self._count = None

    def count(self):
        if self._count is None:
            where, params = _where(self.station_codes, self.start, self.end)
            rows = _execute(f"SELECT count(*) AS total FROM obs {where}", params, self.station_codes)
            self._count = int(rows[0]["total"]) if rows else 0
        return self._count

    def __len__(self):
        return self.count()

    def __getitem__(self, key):
        if not isinstance(key, slice):
            raise TypeError("ObservationRows chỉ hỗ trợ cắt lát.")
        offset = key.start or 0
        sql_limit = f"LIMIT {max(key.stop - offset, 0)} OFFSET {offset}" if key.stop is not None else (
            f"OFFSET {offset}" if offset else ""
        )
        where, params = _where(self.station_codes, self.start, self.end)
        direction = "DESC" if self.descending else "ASC"
        rows = _execute(
            f"SELECT * FROM obs {where} ORDER BY obs_time {direction}, station_code {sql_limit}",
            params,
            self.station_codes,
        )
        return [_observation_payload(row, self.code_to_id) for row in rows]


# ---------------------------------------------------------------------------
# Quan trắc mới nhất của từng trạm
# ---------------------------------------------------------------------------
def invalidate_latest_cache():
    _latest_cache["root"] = None
    _latest_cache["data"] = {}


def _load_latest_observations():
    code_to_id = get_station_code_map()
    rows = _execute(
        "SELECT * FROM obs QUALIFY row_number() OVER (PARTITION BY station_code ORDER BY obs_time DESC) = 1",
        [],
        None,
    )
    return {row["station_code"]: _observation_payload(row, code_to_id) for row in rows}


def get_latest_observation(station_code):
    """Quan trắc mới nhất của một trạm, lưu đệm ngắn hạn để danh sách trạm không phải đọc kho nhiều lần."""
    root = str(get_storage_root())
    now = time.monotonic()
    if _latest_cache["root"] != root or now - _latest_cache["at"] > LATEST_CACHE_TTL_SECONDS:
        _latest_cache["data"] = _load_latest_observations()
        _latest_cache["root"] = root
        _latest_cache["at"] = now
    return _latest_cache["data"].get(station_code)
