import math
from django.db.models import Avg, Count, Max, Min
from django.db.models.functions import TruncMonth, TruncYear
from wind_core.utils import Median
from wind_stations.models import Observation


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
    Tính toán thống kê theo tháng hoặc năm cho một trạm khí tượng.
    """
    observations = Observation.objects.filter(station=station)

    if start_date:
        observations = observations.filter(obs_time__gte=start_date)
    if end_date:
        observations = observations.filter(obs_time__lte=end_date)

    trunc_field = "month" if summary_type == "monthly" else "year"
    trunc_func = TruncMonth if summary_type == "monthly" else TruncYear

    summary = (
        observations.annotate(**{trunc_field: trunc_func("obs_time")})
        .values(trunc_field)
        .annotate(
            total_records=Count("id"),
            temp_2m_min=Min("temp_2m"),
            temp_2m_max=Max("temp_2m"),
            temp_2m_avg=Avg("temp_2m"),
            temp_2m_median=Median("temp_2m"),
            temp_min_min=Min("temp_min"),
            temp_min_max=Max("temp_min"),
            temp_min_avg=Avg("temp_min"),
            temp_min_median=Median("temp_min"),
            temp_max_min=Min("temp_max"),
            temp_max_max=Max("temp_max"),
            temp_max_avg=Avg("temp_max"),
            temp_max_median=Median("temp_max"),
            humidity_min=Min("humidity"),
            humidity_max=Max("humidity"),
            humidity_avg=Avg("humidity"),
            humidity_median=Median("humidity"),
            pressure_min=Min("pressure"),
            pressure_max=Max("pressure"),
            pressure_avg=Avg("pressure"),
            pressure_median=Median("pressure"),
            wind_speed_min=Min("wind_speed"),
            wind_speed_max=Max("wind_speed"),
            wind_speed_avg=Avg("wind_speed"),
            wind_speed_median=Median("wind_speed"),
            rain_06h_min=Min("rain_06h"),
            rain_06h_max=Max("rain_06h"),
            rain_06h_avg=Avg("rain_06h"),
            rain_06h_median=Median("rain_06h"),
            rain_24h_min=Min("rain_24h"),
            rain_24h_max=Max("rain_24h"),
            rain_24h_avg=Avg("rain_24h"),
            rain_24h_median=Median("rain_24h"),
        )
        .order_by(trunc_field)
    )

    return {
        "station_id": station.id,
        "station_name": station.name,
        "results": list(summary),
    }


def calculate_wind_rose_data(observations_qs):
    """
    Tính toán phân bố hoa gió (16 hướng x 6 cấp tốc độ) từ queryset Observation.
    """
    qs = observations_qs.filter(wind_speed__isnull=False, wind_dir__isnull=False)
    total_records = qs.count()
    directions = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
    ]
    bins_labels = [
        "0 - 2 m/s", "2 - 4 m/s", "4 - 6 m/s",
        "6 - 8 m/s", "8 - 10 m/s", "> 10 m/s"
    ]

    if total_records == 0:
        return {
            "total_records": 0,
            "calm_percent": 0.0,
            "avg_wind_speed": 0.0,
            "directions": directions,
            "speed_bins": [{"label": l, "values": [0.0] * 16} for l in bins_labels],
            "distribution": {
                "speed_ranges": ["0-2", "2-4", "4-6", "6-8", "8-10", ">10"],
                "counts": [0] * 6,
                "percentiles": {"p50": 0.0, "p75": 0.0, "p90": 0.0, "p99": 0.0},
            },
        }

    grid = [[0 for _ in range(16)] for _ in range(6)]
    calm_count = 0
    speed_sum = 0.0
    speeds = []

    for row in qs.values_list("wind_speed", "wind_dir"):
        w_speed, w_dir = float(row[0]), float(row[1])
        speed_sum += w_speed
        speeds.append(w_speed)
        if w_speed < 0.5:
            calm_count += 1
            continue

        dir_idx = int(((w_dir + 11.25) % 360) / 22.5) % 16
        if w_speed < 2.0:
            bin_idx = 0
        elif w_speed < 4.0:
            bin_idx = 1
        elif w_speed < 6.0:
            bin_idx = 2
        elif w_speed < 8.0:
            bin_idx = 3
        elif w_speed < 10.0:
            bin_idx = 4
        else:
            bin_idx = 5
        grid[bin_idx][dir_idx] += 1

    speed_bins = []
    for idx, label in enumerate(bins_labels):
        speed_bins.append({
            "label": label,
            "values": [round((val / total_records) * 100.0, 2) for val in grid[idx]],
        })

    speeds.sort()
    p50 = round(speeds[int(len(speeds) * 0.50)], 2) if speeds else 0.0
    p75 = round(speeds[int(len(speeds) * 0.75)], 2) if speeds else 0.0
    p90 = round(speeds[int(len(speeds) * 0.90)], 2) if speeds else 0.0
    p99 = round(speeds[int(len(speeds) * 0.99)], 2) if speeds else 0.0

    return {
        "total_records": total_records,
        "calm_percent": round((calm_count / total_records) * 100.0, 2),
        "avg_wind_speed": round(speed_sum / total_records, 2),
        "directions": directions,
        "speed_bins": speed_bins,
        "distribution": {
            "speed_ranges": ["0-2", "2-4", "4-6", "6-8", "8-10", ">10"],
            "counts": [sum(grid[b]) for b in range(6)],
            "percentiles": {"p50": p50, "p75": p75, "p90": p90, "p99": p99},
        },
    }
