"""Danh mục biến và preset tọa độ Copernicus CDS ERA5."""

ERA5_CATALOG = {
    "wind": {
        "title": "Trường gió & Tốc độ gió",
        "variables": [
            {"code": "10m_u_component_of_wind", "name": "10m U wind (u10)", "unit": "m/s"},
            {"code": "10m_v_component_of_wind", "name": "10m V wind (v10)", "unit": "m/s"},
            {"code": "10m_wind_speed", "name": "10m Wind speed (si10)", "unit": "m/s"},
            {
                "code": "10m_wind_gust_since_previous_post_processing",
                "name": "10m Wind gust (fg10)",
                "unit": "m/s",
            },
            {"code": "100m_u_component_of_wind", "name": "100m U wind (u100)", "unit": "m/s"},
            {"code": "100m_v_component_of_wind", "name": "100m V wind (v100)", "unit": "m/s"},
        ],
    },
    "temperature": {
        "title": "Nhiệt độ & Độ ẩm",
        "variables": [
            {"code": "2m_temperature", "name": "2m Temperature (t2m)", "unit": "K"},
            {"code": "2m_dewpoint_temperature", "name": "2m Dewpoint (d2m)", "unit": "K"},
            {"code": "skin_temperature", "name": "Skin Temperature (skt)", "unit": "K"},
        ],
    },
    "pressure": {
        "title": "Khí áp",
        "variables": [
            {"code": "mean_sea_level_pressure", "name": "Mean sea level pressure (msl)", "unit": "Pa"},
            {"code": "surface_pressure", "name": "Surface pressure (sp)", "unit": "Pa"},
        ],
    },
    "precipitation": {
        "title": "Mưa & Mây",
        "variables": [
            {"code": "total_precipitation", "name": "Total precipitation (tp)", "unit": "m"},
            {"code": "total_cloud_cover", "name": "Total cloud cover (tcc)", "unit": "0-1"},
        ],
    },
}

AREA_PRESETS = {
    "vietnam": {
        "name": "Vùng Việt Nam & Biển Đông",
        "area": [24.0, 102.0, 8.0, 118.0],
    },
    "global": {
        "name": "Toàn cầu",
        "area": [90.0, -180.0, -90.0, 180.0],
    },
}
