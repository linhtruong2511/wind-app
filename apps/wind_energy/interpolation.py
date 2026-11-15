"""
Nội suy không gian cho các điểm tiềm năng điện gió (IDW và Kriging thường).

Chỉ dùng numpy. Toạ độ kinh/vĩ độ được quy đổi sang km trên mặt phẳng cục bộ
để khoảng cách không bị méo theo vĩ độ.
"""

import numpy as np

METHODS = ("idw", "kriging")

KM_PER_DEG_LAT = 110.574
KM_PER_DEG_LON_EQUATOR = 111.320

# Thông số mặc định, quy đổi từ bản nội suy trước đây chạy trên trình duyệt
DEFAULT_IDW_POWER = 2.0
DEFAULT_KRIGING_NEIGHBORS = 12
DEFAULT_KRIGING_RANGE_KM = 165.0
DEFAULT_KRIGING_NUGGET = 0.05
DEFAULT_MAX_DISTANCE_KM = 110.0  # Xa hơn mức này thì lớp màu mờ dần
DEFAULT_FADE_KM = 39.0  # Quãng mờ dần cho tới khi trong suốt hoàn toàn
EXACT_MATCH_KM = 0.1  # Gần hơn mức này thì lấy đúng giá trị tại điểm đo

# Giới hạn số phần tử ma trận khoảng cách tính trong một lần, để khống chế bộ nhớ
_CHUNK_ELEMENTS = 2_000_000


class LocalProjection:
    """Quy đổi kinh/vĩ độ sang km quanh một vĩ độ và kinh độ gốc."""

    def __init__(self, lon0, lat0):
        self.lon0 = float(lon0)
        self.lat0 = float(lat0)
        self.kx = KM_PER_DEG_LON_EQUATOR * np.cos(np.radians(self.lat0))
        self.ky = KM_PER_DEG_LAT

    @classmethod
    def centered_on(cls, lon_lat_values):
        """Gốc đặt ở trọng tâm các điểm đo, để lưới và điểm đơn lẻ cho cùng một kết quả."""
        return cls(np.mean(lon_lat_values[:, 0]), np.mean(lon_lat_values[:, 1]))

    def to_km(self, lon, lat):
        lon = np.asarray(lon, dtype=float)
        lat = np.asarray(lat, dtype=float)
        return np.column_stack(((lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky))


def _squared_distance_chunks(targets, points):
    """
    Sinh từng khối (chỉ số, ma trận bình phương khoảng cách km²) giữa các ô cần tính và các điểm đo.
    Giữ ở dạng bình phương để tránh lấy căn trên cả ma trận lớn.
    """
    n_targets = targets.shape[0]
    chunk = max(1, _CHUNK_ELEMENTS // max(1, points.shape[0]))
    for start in range(0, n_targets, chunk):
        part = targets[start : start + chunk]
        dx = part[:, 0:1] - points[None, :, 0]
        dy = part[:, 1:2] - points[None, :, 1]
        dx *= dx
        dy *= dy
        dx += dy
        yield slice(start, start + part.shape[0]), dx


def idw(targets, points, values, power=DEFAULT_IDW_POWER):
    """
    Nội suy theo nghịch đảo khoảng cách trên toàn bộ điểm đo.
    Trả về (giá trị nội suy, khoảng cách tới điểm đo gần nhất, km).
    """
    n_targets = targets.shape[0]
    result = np.empty(n_targets)
    nearest = np.empty(n_targets)

    for sl, dist_sq in _squared_distance_chunks(targets, points):
        idx = dist_sq.argmin(axis=1)
        min_dist = np.sqrt(dist_sq[np.arange(dist_sq.shape[0]), idx])
        np.maximum(dist_sq, 1e-18, out=dist_sq)
        if power == 2:
            weights = np.reciprocal(dist_sq, out=dist_sq)
        else:
            weights = np.power(dist_sq, -power / 2.0, out=dist_sq)
        z = (weights @ values) / weights.sum(axis=1)
        exact = min_dist < EXACT_MATCH_KM
        z[exact] = values[idx[exact]]
        result[sl] = z
        nearest[sl] = min_dist

    return result, nearest


def _spherical_variogram(h, nugget, sill, value_range):
    h = np.asarray(h, dtype=float)
    ratio = np.clip(h / value_range, 0.0, 1.0)
    gamma = nugget + (sill - nugget) * (1.5 * ratio - 0.5 * ratio**3)
    gamma = np.where(h >= value_range, sill, gamma)
    return np.where(h <= 0, 0.0, gamma)


def _solve_batch(matrices, rhs):
    """Giải hệ phương trình theo lô; nếu có ma trận suy biến thì dùng nghịch đảo giả."""
    try:
        return np.linalg.solve(matrices, rhs[..., None])[..., 0]
    except np.linalg.LinAlgError:
        return (np.linalg.pinv(matrices) @ rhs[..., None])[..., 0]


def kriging(
    targets,
    points,
    values,
    neighbors=DEFAULT_KRIGING_NEIGHBORS,
    value_range=DEFAULT_KRIGING_RANGE_KM,
    nugget=DEFAULT_KRIGING_NUGGET,
):
    """
    Kriging thường với k điểm lân cận gần nhất và variogram dạng cầu.
    Trả về (giá trị nội suy, khoảng cách tới điểm đo gần nhất, km).
    """
    n_targets = targets.shape[0]
    n_points = points.shape[0]
    k = min(int(neighbors), n_points)
    sill = max(float(np.var(values)) or 1.0, nugget * 1.5)

    result = np.empty(n_targets)
    nearest = np.empty(n_targets)

    for sl, dist_sq in _squared_distance_chunks(targets, points):
        rows = np.arange(dist_sq.shape[0])
        if k < n_points:
            idx = np.argpartition(dist_sq, k - 1, axis=1)[:, :k]
        else:
            idx = np.tile(np.arange(n_points), (dist_sq.shape[0], 1))
        neighbor_dist = np.sqrt(np.take_along_axis(dist_sq, idx, axis=1))
        nearest_local = neighbor_dist.argmin(axis=1)
        min_dist = neighbor_dist[rows, nearest_local]

        neighbor_xy = points[idx]  # (c, k, 2)
        diff = neighbor_xy[:, :, None, :] - neighbor_xy[:, None, :, :]
        pair_dist = np.sqrt((diff**2).sum(axis=-1))  # (c, k, k)

        size = dist_sq.shape[0]
        lhs = np.zeros((size, k + 1, k + 1))
        lhs[:, :k, :k] = _spherical_variogram(pair_dist, nugget, sill, value_range)
        lhs[:, :k, :k] += np.eye(k) * (1e-9 * sill)  # tránh suy biến khi có điểm đo trùng nhau
        lhs[:, :k, k] = 1.0
        lhs[:, k, :k] = 1.0
        rhs = np.zeros((size, k + 1))
        rhs[:, :k] = _spherical_variogram(neighbor_dist, nugget, sill, value_range)
        rhs[:, k] = 1.0

        weights = _solve_batch(lhs, rhs)[:, :k]
        z = (weights * values[idx]).sum(axis=1)

        exact = min_dist < EXACT_MATCH_KM
        z[exact] = values[idx[exact, nearest_local[exact]]]
        result[sl] = np.maximum(z, 0.0)  # các chỉ số này không âm
        nearest[sl] = min_dist

    return result, nearest


def interpolate(method, targets, points, values, **options):
    if method == "kriging":
        return kriging(targets, points, values, **options)
    if method == "idw":
        return idw(targets, points, values, **options)
    raise ValueError(f"Phương pháp nội suy không hợp lệ: {method}")


def fade_alpha(nearest_km, max_distance_km=DEFAULT_MAX_DISTANCE_KM, fade_km=DEFAULT_FADE_KM):
    """Độ đậm của lớp màu: đầy đủ trong vùng có điểm đo, mờ dần khi ra xa."""
    return np.clip(1.0 - (nearest_km - max_distance_km) / fade_km, 0.0, 1.0)


def build_grid(lon_lat_values, method, bbox, width, height):
    """
    Nội suy ra lưới width x height phủ bbox = (min_lon, min_lat, max_lon, max_lat).

    lon_lat_values: mảng (n, 3) gồm kinh độ, vĩ độ, giá trị.
    Trả về (giá trị, độ đậm 0 đến 255), đều là mảng phẳng theo hàng, từ bắc xuống nam.
    """
    min_lon, min_lat, max_lon, max_lat = bbox
    projection = LocalProjection.centered_on(lon_lat_values)

    lons = np.linspace(min_lon, max_lon, width)
    lats = np.linspace(max_lat, min_lat, height)
    grid_lon, grid_lat = np.meshgrid(lons, lats)
    targets = projection.to_km(grid_lon.ravel(), grid_lat.ravel())
    points = projection.to_km(lon_lat_values[:, 0], lon_lat_values[:, 1])

    values, nearest = interpolate(method, targets, points, lon_lat_values[:, 2])
    alpha = fade_alpha(nearest)
    return values, np.round(alpha * 255).astype(int)


def evaluate_point(lon_lat_values, method, lon, lat):
    """Nội suy tại một toạ độ. Trả về (giá trị, khoảng cách tới điểm đo gần nhất, km)."""
    projection = LocalProjection.centered_on(lon_lat_values)
    points = projection.to_km(lon_lat_values[:, 0], lon_lat_values[:, 1])
    targets = projection.to_km([lon], [lat])
    values, nearest = interpolate(method, targets, points, lon_lat_values[:, 2])
    return float(values[0]), float(nearest[0])
