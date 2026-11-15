import math

from .observation_lake_service import get_period_summary


def calculate_circular_mean(angles, weights=None):
    """
    Tính trung bình góc (circular mean) cho chuỗi hướng gió (đơn vị độ [0, 360)).
    Hỗ trợ trọng số weights (ví dụ: tốc độ gió).
    """
    valid_pairs = []
    if weights is not None:
        for a, w in zip(angles, weights):
            if a is not None and w is not None:
                valid_pairs.append((float(a), float(w)))
    else:
        for a in angles:
            if a is not None:
                valid_pairs.append((float(a), 1.0))

    if not valid_pairs:
        return None

    sin_sum = sum(w * math.sin(math.radians(a)) for a, w in valid_pairs)
    cos_sum = sum(w * math.cos(math.radians(a)) for a, w in valid_pairs)

    if abs(sin_sum) < 1e-9 and abs(cos_sum) < 1e-9:
        return 0.0

    mean_rad = math.atan2(sin_sum, cos_sum)
    mean_deg = math.degrees(mean_rad)
    return round((mean_deg + 360) % 360, 2)


def get_station_summary_data(station, start_date=None, end_date=None, summary_type="monthly"):
    """
    Tính toán thống kê theo tháng hoặc năm cho một trạm khí tượng từ kho Parquet.
    start_date, end_date là datetime không múi giờ hoặc None.
    """
    return {
        "station_id": station.id,
        "station_name": station.name,
        "results": get_period_summary(station.station_code, summary_type, start_date, end_date),
    }
