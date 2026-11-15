import os
import math
import re
from pathlib import Path
from datetime import datetime
import pandas as pd
import duckdb
from django.conf import settings
from wind_stations.models import Station


def get_storage_root() -> Path:
    """
    Trả về đường dẫn thư mục gốc lưu trữ các tệp Parquet của trạm quan trắc.
    Mặc định: apps/media/observations/
    """
    base_media = getattr(settings, "MEDIA_ROOT", None)
    if not base_media:
        base_media = Path(settings.BASE_DIR) / "media"
    else:
        base_media = Path(base_media)

    lake_dir = base_media / "observations"
    lake_dir.mkdir(parents=True, exist_ok=True)
    return lake_dir


STANDARD_COLUMNS = [
    "station_code",
    "obs_time",
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


def _invalidate_latest_observation_cache():
    # Import muộn để tránh vòng lặp import giữa hai service
    from .observation_lake_service import invalidate_latest_cache

    invalidate_latest_cache()


def normalize_observation_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Chuẩn hóa dữ liệu đầu vào:
    - Làm sạch tên cột
    - Ép kiểu obs_time về datetime64[ns]
    - Ép kiểu các chỉ số khí tượng về float
    """
    df = df.copy()
    # Chuẩn hóa tên cột
    df.columns = [str(c).strip().lower() for c in df.columns]

    if "station_code" not in df.columns or "obs_time" not in df.columns:
        raise ValueError("Tệp dữ liệu bắt buộc phải có 2 cột: 'station_code' và 'obs_time'.")

    # Chuẩn hóa mã trạm giống StationSerializer để khớp mã trạm trong danh sách trạm
    # và không tạo thư mục lồng nhau khi mã có dấu gạch chéo.
    df["station_code"] = (
        df["station_code"].astype(str).str.strip().str.replace(r"[\s/\\]", "_", regex=True)
    )
    df["obs_time"] = pd.to_datetime(df["obs_time"], errors="coerce")
    df = df.dropna(subset=["station_code", "obs_time"])

    # Chuẩn hóa các cột đo đạc
    for col in STANDARD_COLUMNS:
        if col in ["station_code", "obs_time"]:
            continue
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        else:
            df[col] = None

    # Chỉ giữ các cột tiêu chuẩn
    cols_to_keep = [col for col in STANDARD_COLUMNS if col in df.columns]
    return df[cols_to_keep]


def ingest_dataframe_to_parquet(df: pd.DataFrame) -> dict:
    """
    Nạp dữ liệu DataFrame vào kho Parquet (phân vùng theo station_code và năm).
    Nếu tệp đã tồn tại, tự động Upsert (ghi đè trùng lặp theo obs_time, bổ sung mốc đo mới).
    """
    df = normalize_observation_df(df)
    if df.empty:
        return {"success": False, "message": "Không có dữ liệu hợp lệ để nạp.", "affected_partitions": []}

    storage_root = get_storage_root()
    df["_year"] = df["obs_time"].dt.year

    affected = []
    con = duckdb.connect()

    try:
        grouped = df.groupby(["station_code", "_year"])
        for (st_code, yr), group in grouped:
            st_folder = storage_root / str(st_code)
            st_folder.mkdir(parents=True, exist_ok=True)
            target_file = st_folder / f"{yr}.parquet"
            sub_df = group.drop(columns=["_year"])

            con.register("new_batch", sub_df)

            if target_file.exists():
                # Upsert với dữ liệu cũ đã có
                con.execute(f"CREATE OR REPLACE TEMPORARY TABLE existing_data AS SELECT * FROM read_parquet('{target_file.as_posix()}')")
                merged = con.execute("""
                    SELECT * EXCLUDE (rn, priority) FROM (
                        SELECT *, 2 as priority, ROW_NUMBER() OVER (PARTITION BY obs_time ORDER BY 1) as rn
                        FROM (
                            SELECT *, 2 as priority FROM new_batch
                            UNION ALL
                            SELECT *, 1 as priority FROM existing_data
                            WHERE obs_time NOT IN (SELECT obs_time FROM new_batch)
                        )
                    )
                    ORDER BY obs_time ASC
                """).df()
                con.execute(f"COPY merged TO '{target_file.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
                total_file_rows = len(merged)
            else:
                # Tạo mới hoàn toàn
                dedup = con.execute("""
                    SELECT * EXCLUDE (rn) FROM (
                        SELECT *, ROW_NUMBER() OVER (PARTITION BY obs_time ORDER BY 1) as rn
                        FROM new_batch
                    ) WHERE rn = 1
                    ORDER BY obs_time ASC
                """).df()
                con.execute(f"COPY dedup TO '{target_file.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
                total_file_rows = len(dedup)

            affected.append({
                "station_code": str(st_code),
                "year": int(yr),
                "rows_added": len(sub_df),
                "total_rows_in_partition": total_file_rows,
                "file_path": str(target_file.relative_to(storage_root)),
            })

    finally:
        con.close()
        _invalidate_latest_observation_cache()

    total_rows = sum(a["rows_added"] for a in affected)
    return {
        "success": True,
        "message": f"Nạp thành công {total_rows} bản ghi vào {len(affected)} phân vùng tệp Parquet.",
        "total_rows_ingested": total_rows,
        "affected_partitions": affected,
    }


def format_bytes(size_bytes: int) -> str:
    if size_bytes <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {units[i]}"


def get_data_lake_overview() -> dict:
    """
    Thống kê tổng quan Kho Dữ Liệu Parquet.
    """
    storage_root = get_storage_root()
    parquet_files = list(storage_root.glob("*/*.parquet"))

    if not parquet_files:
        return {
            "total_stations": 0,
            "total_files": 0,
            "total_records": 0,
            "total_size_bytes": 0,
            "total_size_formatted": "0 B",
            "saved_storage_estimate": "0 B",
            "min_date": None,
            "max_date": None,
        }

    total_size = sum(f.stat().st_size for f in parquet_files)
    glob_pattern = (storage_root / "*" / "*.parquet").as_posix()

    con = duckdb.connect()
    try:
        query = f"""
            SELECT 
                count(distinct station_code) as st_count,
                count(*) as rec_count,
                min(obs_time) as min_t,
                max(obs_time) as max_t
            FROM read_parquet('{glob_pattern}')
        """
        res = con.execute(query).fetchone()
        st_count = res[0] or 0
        rec_count = res[1] or 0
        min_t = res[2].isoformat() if res[2] else None
        max_t = res[3].isoformat() if res[3] else None
    except Exception:
        st_count = len(set(f.parent.name for f in parquet_files))
        rec_count = 0
        min_t = None
        max_t = None
    finally:
        con.close()

    # Ước tính dung lượng tiết kiệm (PostgreSQL row-based thường lớn gấp 8-10 lần so với Parquet ZSTD)
    estimated_pg_size = total_size * 9

    return {
        "total_stations": st_count,
        "total_files": len(parquet_files),
        "total_records": rec_count,
        "total_size_bytes": total_size,
        "total_size_formatted": format_bytes(total_size),
        "saved_storage_estimate": format_bytes(max(0, estimated_pg_size - total_size)),
        "min_date": min_t,
        "max_date": max_t,
    }


def list_data_lake_partitions(station_code: str = None, year: int = None) -> list:
    """
    Liệt kê chi tiết từng phân vùng (tệp Parquet) trong kho dữ liệu, kèm độ đầy đủ dữ liệu.
    """
    storage_root = get_storage_root()
    if station_code:
        pattern = f"{station_code}/*.parquet"
    else:
        pattern = "*/*.parquet"

    parquet_files = sorted(list(storage_root.glob(pattern)), key=lambda f: (f.parent.name, f.stem), reverse=True)

    if not parquet_files:
        return []

    # Lấy thông tin tên trạm từ CSDL Django
    station_names = dict(Station.objects.values_list("station_code", "name"))

    results = []
    con = duckdb.connect()
    try:
        for f in parquet_files:
            st_code = f.parent.name
            try:
                f_year = int(f.stem)
            except ValueError:
                continue

            if year and f_year != year:
                continue

            f_size = f.stat().st_size
            f_mtime = datetime.fromtimestamp(f.stat().st_mtime).isoformat()

            try:
                stats = con.execute(f"""
                    SELECT count(*), min(obs_time), max(obs_time)
                    FROM read_parquet('{f.as_posix()}')
                """).fetchone()
                count = stats[0] or 0
                min_t = stats[1].isoformat() if stats[1] else None
                max_t = stats[2].isoformat() if stats[2] else None
            except Exception:
                count = 0
                min_t = None
                max_t = None

            # Tính toán % mức độ đầy đủ của số liệu trong năm
            # Giả định chuẩn đo 1 giờ/lần (8.760 mốc/năm) hoặc 10 phút/lần (52.560 mốc/năm)
            is_leap = (f_year % 4 == 0 and f_year % 100 != 0) or (f_year % 400 == 0)
            expected_hours = 8784 if is_leap else 8760
            if count > expected_hours * 2:
                # Dữ liệu tần suất 10 phút hoặc cao hơn
                expected_records = expected_hours * 6
            else:
                expected_records = expected_hours

            completeness = round(min(100.0, (count / expected_records) * 100.0), 1) if expected_records > 0 else 0.0

            results.append({
                "station_code": st_code,
                "station_name": station_names.get(st_code, st_code),
                "year": f_year,
                "file_path": str(f.relative_to(storage_root)),
                "file_size_bytes": f_size,
                "file_size_formatted": format_bytes(f_size),
                "record_count": count,
                "completeness_pct": completeness,
                "min_time": min_t,
                "max_time": max_t,
                "last_modified": f_mtime,
            })
    finally:
        con.close()

    return results


def delete_partition(station_code: str, year: int) -> bool:
    """
    Xóa một tệp phân vùng Parquet khỏi kho dữ liệu.
    """
    storage_root = get_storage_root()
    target_file = storage_root / str(station_code) / f"{year}.parquet"
    if target_file.exists():
        target_file.unlink()
        parent_dir = target_file.parent
        # Nếu thư mục trạm không còn file nào thì dọn dẹp thư mục
        if not any(parent_dir.iterdir()):
            parent_dir.rmdir()
        _invalidate_latest_observation_cache()
        return True
    return False


def get_partition_file_path(station_code: str, year: int) -> Path:
    """
    Trả về đường dẫn tuyệt đối tới tệp phân vùng Parquet.
    """
    storage_root = get_storage_root()
    target_file = storage_root / str(station_code) / f"{year}.parquet"
    if target_file.exists():
        return target_file
    return None


def export_lake_data(
    station_code: str = None,
    start_date: str = None,
    end_date: str = None,
    columns: list = None,
    fmt: str = "csv"
):
    """
    Truy vấn và xuất dữ liệu từ các tệp Parquet ra định dạng CSV hoặc Parquet.
    """
    storage_root = get_storage_root()
    if station_code:
        pattern = (storage_root / station_code / "*.parquet").as_posix()
    else:
        pattern = (storage_root / "*" / "*.parquet").as_posix()

    if not list(storage_root.glob("*/*.parquet")):
        return None

    select_cols = "*"
    if columns:
        valid_cols = [c for c in columns if c in STANDARD_COLUMNS]
        if valid_cols:
            select_cols = ", ".join(valid_cols)

    where_clauses = []
    if station_code:
        where_clauses.append(f"station_code = '{station_code}'")
    if start_date:
        where_clauses.append(f"obs_time >= '{start_date}'")
    if end_date:
        where_clauses.append(f"obs_time <= '{end_date}'")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    query = f"""
        SELECT {select_cols}
        FROM read_parquet('{pattern}')
        {where_sql}
        ORDER BY station_code, obs_time
    """

    con = duckdb.connect()
    try:
        df = con.execute(query).df()
        return df
    finally:
        con.close()


def calculate_wind_rose_from_parquet(
    station_code: str = None,
    start_date: str = None,
    end_date: str = None
) -> dict:
    """
    Tính toán hoa gió 16 hướng x 6 cấp tốc độ gió siêu tốc trực tiếp từ DuckDB.
    """
    storage_root = get_storage_root()
    pattern = (storage_root / (station_code if station_code else "*") / "*.parquet").as_posix()

    if not list(storage_root.glob("*/*.parquet")):
        return {"total_records": 0, "message": "Kho dữ liệu chưa có tệp Parquet nào."}

    where_clauses = ["wind_speed IS NOT NULL", "wind_dir IS NOT NULL"]
    if station_code:
        where_clauses.append(f"station_code = '{station_code}'")
    if start_date:
        where_clauses.append(f"obs_time >= '{start_date}'")
    if end_date:
        where_clauses.append(f"obs_time <= '{end_date}'")

    where_sql = "WHERE " + " AND ".join(where_clauses)

    con = duckdb.connect()
    try:
        stats_query = f"""
            WITH raw_data AS (
                SELECT 
                    wind_speed,
                    wind_dir,
                    CAST(floor((((wind_dir + 11.25) % 360) / 22.5)) AS INT) % 16 AS dir_idx,
                    CASE 
                        WHEN wind_speed < 2.0 THEN 0
                        WHEN wind_speed < 4.0 THEN 1
                        WHEN wind_speed < 6.0 THEN 2
                        WHEN wind_speed < 8.0 THEN 3
                        WHEN wind_speed < 10.0 THEN 4
                        ELSE 5
                    END AS bin_idx
                FROM read_parquet('{pattern}')
                {where_sql}
            )
            SELECT 
                dir_idx,
                bin_idx,
                count(*) as cnt
            FROM raw_data
            GROUP BY dir_idx, bin_idx
        """
        matrix_rows = con.execute(stats_query).fetchall()

        overall_query = f"""
            SELECT 
                count(*) as total,
                avg(wind_speed) as avg_spd,
                count(case when wind_speed < 0.5 then 1 end) as calm_cnt,
                quantile_cont(wind_speed, 0.50) as p50,
                quantile_cont(wind_speed, 0.75) as p75,
                quantile_cont(wind_speed, 0.90) as p90,
                quantile_cont(wind_speed, 0.99) as p99
            FROM read_parquet('{pattern}')
            {where_sql}
        """
        ov = con.execute(overall_query).fetchone()

        total_records = ov[0] or 0
        avg_speed = round(float(ov[1] or 0.0), 2)
        calm_percent = round((float(ov[2] or 0) / total_records * 100.0), 2) if total_records > 0 else 0.0
        p50 = round(float(ov[3] or 0.0), 2)
        p75 = round(float(ov[4] or 0.0), 2)
        p90 = round(float(ov[5] or 0.0), 2)
        p99 = round(float(ov[6] or 0.0), 2)

    finally:
        con.close()

    directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    bins_labels = ["0 - 2 m/s", "2 - 4 m/s", "4 - 6 m/s", "6 - 8 m/s", "8 - 10 m/s", "> 10 m/s"]

    grid = [[0 for _ in range(16)] for _ in range(6)]
    bin_counts = [0] * 6
    for dir_idx, bin_idx, cnt in matrix_rows:
        if 0 <= dir_idx < 16 and 0 <= bin_idx < 6:
            grid[bin_idx][dir_idx] = cnt
            bin_counts[bin_idx] += cnt

    speed_bins = []
    for idx, label in enumerate(bins_labels):
        speed_bins.append({
            "label": label,
            "values": [round((val / total_records) * 100.0, 2) if total_records > 0 else 0.0 for val in grid[idx]],
        })

    return {
        "total_records": total_records,
        "calm_percent": calm_percent,
        "avg_wind_speed": avg_speed,
        "directions": directions,
        "speed_bins": speed_bins,
        "distribution": {
            "speed_ranges": ["0-2", "2-4", "4-6", "6-8", "8-10", ">10"],
            "counts": bin_counts,
            "percentiles": {"p50": p50, "p75": p75, "p90": p90, "p99": p99},
        },
    }


def execute_safe_duckdb_query(custom_sql: str) -> dict:
    """
    Thực thi câu lệnh SQL phân tích an toàn trên kho tệp Parquet.
    Chỉ cho phép các câu lệnh SELECT đọc dữ liệu.
    """
    cleaned = custom_sql.strip()
    # Kiểm tra an toàn: cấm các lệnh ghi, xóa, drop, alter, pragma, attach
    disallowed = r"\b(drop|delete|insert|update|create|alter|copy|vacuum|pragma|attach|detach|import|export)\b"
    if re.search(disallowed, cleaned, re.IGNORECASE):
        raise ValueError("Chỉ hỗ trợ các truy vấn đọc dữ liệu (SELECT query).")

    storage_root = get_storage_root()
    glob_pattern = (storage_root / "*" / "*.parquet").as_posix()

    # Tự động thay thế bảng 'observations' bằng read_parquet(...)
    sql_to_run = re.sub(
        r"\bobservations\b",
        f"read_parquet('{glob_pattern}')",
        cleaned,
        flags=re.IGNORECASE
    )

    con = duckdb.connect()
    try:
        df = con.execute(sql_to_run).df()
        # Giới hạn tối đa 500 dòng preview trên trình duyệt để tránh quá tải
        preview_rows = df.head(500)
        return {
            "total_rows": len(df),
            "columns": list(df.columns),
            "data": preview_rows.to_dict(orient="records"),
        }
    finally:
        con.close()
