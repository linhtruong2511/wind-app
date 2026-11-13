import math
import os
import numpy as np
import xarray as xr


def calculate_wind_speed_direction(u, v):
    """
    Tính vector gió tổng hợp V = sqrt(u^2 + v^2) và hướng gió theta (độ).
    theta là hướng gió khí tượng (hướng gió thổi tới):
    theta = (atan2(-u, -v) * 180 / pi) % 360
    """
    if u is None or v is None:
        return None, None
    if isinstance(u, (int, float)) and isinstance(v, (int, float)):
        if math.isnan(u) or math.isnan(v):
            return None, None
        speed = math.sqrt(u ** 2 + v ** 2)
        direction = (math.degrees(math.atan2(-u, -v))) % 360.0
        return round(speed, 2), round(direction, 2)

    u_arr = np.asarray(u, dtype=float)
    v_arr = np.asarray(v, dtype=float)
    speed = np.sqrt(u_arr ** 2 + v_arr ** 2)
    direction = (np.degrees(np.arctan2(-u_arr, -v_arr))) % 360.0
    return speed, direction


def get_netcdf_data(file_location, bbox=None, step=1, u=None, v=None):
    """
    Đọc tệp NetCDF, cắt lát theo bounding box, lấy mẫu theo step,
    và trả về cấu trúc dữ liệu lưới phục vụ trực quan hóa vector & heatmap:
    {
        "lats": [...],
        "lons": [...],
        "u": [[...]],
        "v": [[...]],
        "speed": [[...]],
        "direction": [[...]],
        "u_var_name": "...",
        "v_var_name": "..."
    }
    """
    if not os.path.exists(file_location):
        raise FileNotFoundError(f"NetCDF file not found at: {file_location}")

    with xr.open_dataset(file_location) as ds:
        # Nhận diện tên tọa độ vĩ độ và kinh độ
        if "longitude" in ds.coords and "latitude" in ds.coords:
            lon_name = "longitude"
            lat_name = "latitude"
        else:
            lon_name = "lon" if "lon" in ds.coords else "longitude"
            lat_name = "lat" if "lat" in ds.coords else "latitude"

        sub_ds = ds

        # Lấy lát cắt đầu tiên cho các chiều khác lat/lon (như time, level, height)
        sel_kwargs = {}
        for dim in sub_ds.dims:
            if dim not in [lat_name, lon_name]:
                if sub_ds.sizes[dim] > 0:
                    sel_kwargs[dim] = 0

        if sel_kwargs:
            sub_ds = sub_ds.isel(**sel_kwargs)

        # Cắt lát không gian theo bounding box nếu được cung cấp: [min_lon, min_lat, max_lon, max_lat]
        if bbox:
            min_lon, min_lat, max_lon, max_lat = bbox
            # Thêm đệm 1.0 độ để không bị mất viền khi phóng to bản đồ
            min_lon -= 1.0
            min_lat -= 1.0
            max_lon += 1.0
            max_lat += 1.0

            # Kiểm tra thứ tự tọa độ (tăng dần hay giảm dần) để cắt lát đúng chiều
            lat_coords = sub_ds[lat_name].values
            if len(lat_coords) > 1 and lat_coords[0] > lat_coords[-1]:
                lat_slice = slice(max_lat, min_lat)
            else:
                lat_slice = slice(min_lat, max_lat)

            lon_coords = sub_ds[lon_name].values
            if len(lon_coords) > 1 and lon_coords[0] > lon_coords[-1]:
                lon_slice = slice(max_lon, min_lon)
            else:
                lon_slice = slice(min_lon, max_lon)

            sub_ds = sub_ds.sel({lon_name: lon_slice, lat_name: lat_slice})

        # Áp dụng bước nhảy lấy mẫu (downsampling step)
        step = max(int(step or 1), 1)
        if step > 1:
            sub_ds = sub_ds.isel({
                lon_name: slice(None, None, step),
                lat_name: slice(None, None, step),
            })

        lats = [float(y) for y in sub_ds[lat_name].values.tolist()]
        lons = [float(x) for x in sub_ds[lon_name].values.tolist()]

        def _format_2d(var_name):
            if not var_name or var_name not in sub_ds:
                return None
            vals = sub_ds[var_name].values
            if vals.ndim != 2:
                vals = np.atleast_2d(vals)
            return [
                [None if np.isnan(val) else float(val) for val in row]
                for row in vals
            ]

        u_list = _format_2d(u)
        v_list = _format_2d(v)

        speed_list = None
        dir_list = None
        if u_list is not None and v_list is not None:
            speed_list = []
            dir_list = []
            for u_row, v_row in zip(u_list, v_list):
                s_row = []
                d_row = []
                for u_val, v_val in zip(u_row, v_row):
                    s, d = calculate_wind_speed_direction(u_val, v_val)
                    s_row.append(s)
                    d_row.append(d)
                speed_list.append(s_row)
                dir_list.append(d_row)

        return {
            "lats": lats,
            "lons": lons,
            "u": u_list,
            "v": v_list,
            "speed": speed_list,
            "direction": dir_list,
            "u_var_name": u,
            "v_var_name": v,
        }
