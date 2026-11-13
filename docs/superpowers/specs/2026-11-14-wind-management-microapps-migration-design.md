# Thiết Kế Chi Tiết: Tách & Tích Hợp Module Gió Sang Kiến Trúc Micro-Apps Django

- **Ngày tạo**: 2026-11-14
- **Trạng thái**: Đã phê duyệt (Approved)
- **Tác giả**: Antigravity & User

---

## 1. Bối cảnh & Mục tiêu (Context & Objectives)

### 1.1 Bối cảnh
Dự án quản lý trắc gió và năng lượng gió trước đây được xây dựng dưới dạng một module nguyên khối (`wind_management`) tích hợp sâu vào hệ thống GeoNode tại đường dẫn `D:\GeonodeBK\wind_management_app\wind_management`. 
Để tối ưu hóa quản lý, bảo trì và khả năng mở rộng, hệ thống được tách ra thành một dự án Django độc lập tại thư mục `apps/` trong workspace `d:\Jobs\Wind\wind-management\apps`, gồm các micro-apps chuyên biệt.

### 1.2 Mục tiêu cốt lõi
1. **Bảo toàn 100% API & Luồng nghiệp vụ**: Không làm đứt gãy giao diện người dùng React (`frontend/src/api/wind.js`). Giữ nguyên các endpoints, các tham số truy vấn và định dạng dữ liệu JSON/GeoJSON trả về.
2. **Kiến trúc Micro-Apps độc lập, tường minh**: Phân tách rõ ràng các miền nghiệp vụ thành 6 micro-apps: `wind_core`, `wind_stations`, `wind_raster`, `wind_energy`, `wind_events`, `wind_cds`.
3. **Loại bỏ phụ thuộc cứng vào GeoNode**: Tạo cơ chế fallback an toàn cho các tác vụ lấy ranh giới tỉnh, GeoServer WFS để server Django độc lập vẫn phục vụ trọn vẹn mọi tính năng cho Frontend.
4. **Bảo toàn dữ liệu (Database Integrity)**: Giữ nguyên toàn bộ `db_table = "wind_..."` ở tất cả các models để tương thích hoàn toàn với database PostGIS hiện có.

---

## 2. Kiến trúc Hệ Thống Micro-Apps (System Architecture)

### 2.1 Danh sách Micro-Apps & Trách nhiệm

```
d:\Jobs\Wind\wind-management\apps\
├── configs/                   # Cấu hình dự án (settings, urls, api_router, asgi, wsgi)
├── wind_core/                 # Quản lý bộ dữ liệu, phân quyền, nhật ký và tiện ích chung
├── wind_stations/             # Quản lý trạm quan trắc, chuỗi số liệu thời gian, thống kê hoa gió
├── wind_raster/               # Chỉ mục dữ liệu raster, đọc NetCDF, trích xuất trường gió
├── wind_energy/               # Trang trại gió, tuabin, phân tích năng lượng & sự kiện cực đoan
├── wind_events/               # Hiện tượng khí tượng (bão, không khí lạnh) & phân tích ảnh hưởng
├── wind_cds/                  # Tải dữ liệu tự động từ Copernicus CDS & Celery tasks
└── manage.py                  # Điểm thực thi lệnh quản trị Django
```

#### Chi tiết từng App:

1. **`wind_core`**:
   - **Models**:
     - `Dataset`: Quản lý danh mục các bộ dữ liệu (GRIDDED, STATION, SATELLITE, EVENT).
     - `DatasetVariable`: Biến đo đạc kèm danh sách thành phần vector (`[u, v]`).
     - `DatasetAccessPolicy`: Chính sách phân quyền truy cập theo nhóm người dùng.
     - `AlertRule`, `AlertNotification`: Cấu hình quy tắc cảnh báo và thông báo.
     - `DownloadRequest`, `DownloadRequestItem`, `DownloadFile`: Quản lý yêu cầu tải dữ liệu.
     - `UserQueryHistory`, `IngestionLog`, `SystemMetric`: Nhật ký vận hành và chỉ số hệ thống.
   - **Dùng chung**: `StandardResultsSetPagination`, các hàm aggregate PostGIS và hàm tính toán thống kê (`Median`, `CircularMean`).
   - **API Views**: `DatasetViewSet` (danh sách dataset, `time_steps`, `year_steps`, `month_steps`, `day_steps`, `get_variables`).

2. **`wind_stations`**:
   - **Models**:
     - `Station`: Thông tin trạm đo gió (mã trạm, tên, tọa độ Point 4326, độ cao, loại trạm, FK -> `"wind_core.Dataset"`).
     - `Observation`: Bản ghi quan trắc theo thời gian (tốc độ gió, hướng gió, nhiệt độ, khí áp, lượng mưa, FK -> `Station`).
   - **Serializers**: `StationSerializer`, `StationGeoSerializer` (GeoFeatureModelSerializer), `ObservationSerializer`.
   - **Services**: `station_service.py` (tính trung bình tháng/năm, median, circular mean cho góc gió, tính phân bố hoa gió Wind Rose).
   - **API Views**:
     - `StationViewSet`: CRUD trạm, tìm kiếm, lọc theo bbox, action `map/` trả GeoJSON.
     - `ObservationViewSet`: Lọc dữ liệu quan trắc theo trạm và dải thời gian `start_time` - `end_time`.
     - `StatisticsViewSet`: Tổng quan (`overview`), xếp hạng (`rankings`), so sánh trạm (`multi-station-compare`), hoa gió (`wind-rose`), xuất file (`export-csv`).

3. **`wind_raster`**:
   - **Models**:
     - `RasterGranuleIndex`: Vết metadata tệp NetCDF (thời gian, độ cao/áp suất, footprint đa giác, FK -> `"wind_core.Dataset"`).
   - **Serializers**: `RasterGranuleIndexSerializer`.
   - **Services**:
     - `netcdf_service.py`: Đọc file NetCDF bằng `xarray`/`numpy`, ghép vector $u, v$ thành độ lớn gió $V = \sqrt{u^2 + v^2}$ và hướng gió, cắt theo bbox và bước nhảy `step`.
     - `raster_ingest.py`: Đọc tệp `.nc`, bóc tách chiều không gian/thời gian và tạo bản ghi index tự động.
     - `raster_service.py`: Điều phối truy vấn dữ liệu raster theo yêu cầu API.
   - **API Views**: `RasterGranuleIndexViewSet` (danh sách granules, `summary`, `data`, `point_metadata`).

4. **`wind_energy`**:
   - **Models** *(đã khởi tạo trong workspace)*:
     - `WindFarm`: Trang trại gió (mã, tên, ranh giới Polygon, tổng công suất MW).
     - `WindTurbine`: Tuabin gió (mã điểm, tọa độ Point, độ sâu đáy biển GEBCO, công suất dự kiến MW, hệ số công suất).
     - `AnalysisJob`, `AnalysisResult`, `ExtremeEvent`: Tác vụ phân tích chuyên sâu tài nguyên năng lượng và hiện tượng cực đoan (FK -> `"wind_stations.Station"`).
   - **Serializers**: `WindFarmSerializer`, `WindTurbineSerializer`, `WindTurbineGeoSerializer`.
   - **API Views**: `WindFarmViewSet`, `WindTurbineViewSet` phục vụ quản lý năng lượng gió.

5. **`wind_events`**:
   - **Models**:
     - `MeteorologicalEvent`: Sự kiện bão, áp thấp nhiệt đới, không khí lạnh kèm vùng ảnh hưởng `influence_area` (Polygon 4326).
     - `EventTrack`: Vết quỹ đạo di chuyển (thời điểm, tọa độ Point, áp suất tâm, tốc độ di chuyển).
   - **Serializers**: `MeteorologicalEventSerializer`, `EventTrackSerializer`.
   - **API Views**: `MeteorologicalEventViewSet` (danh sách sự kiện, action `impacted_observations` truy vấn các trạm quan trắc chịu ảnh hưởng của bão).

6. **`wind_cds`**:
   - **Models**:
     - `CDSCredential`: Tài khoản API CDS Copernicus, mã hóa khóa bằng mật mã Fernet.
     - `CDSDownloadJob`: Cấu hình tác vụ tải dữ liệu (chế độ một lần hoặc định kỳ Cron, FK -> `"wind_core.Dataset"`).
     - `CDSJobRun`: Nhật ký thực thi tải và nạp file.
   - **Services & Tasks**: `cds_service.py` gọi thư viện `cdsapi.Client`, Celery task tự động nạp file NetCDF vào `wind_raster`.

---

## 3. Điều Hướng API & Tương Thích Frontend (API Gateway)

### 3.1 Cấu hình Routing Tập Trung
Tại `apps/configs/api_router.py`:
```python
from rest_framework.routers import DefaultRouter
from wind_core.views import DatasetViewSet
from wind_stations.views import StationViewSet, ObservationViewSet, StatisticsViewSet
from wind_events.views import MeteorologicalEventViewSet
from wind_raster.views import RasterGranuleIndexViewSet
from wind_energy.views import WindFarmViewSet, WindTurbineViewSet

router = DefaultRouter()
router.register(r"datasets", DatasetViewSet, basename="dataset")
router.register(r"stations", StationViewSet, basename="station")
router.register(r"observations", ObservationViewSet, basename="observation")
router.register(r"events", MeteorologicalEventViewSet, basename="event")
router.register(r"raster-granules", RasterGranuleIndexViewSet, basename="raster-granule")
router.register(r"statistics", StatisticsViewSet, basename="statistics")
router.register(r"farms", WindFarmViewSet, basename="farm")
router.register(r"turbines", WindTurbineViewSet, basename="turbine")
```

Tại `apps/configs/urls.py`:
```python
from django.contrib import admin
from django.urls import path, include
from configs.api_router import router
from wind_stations.views import ProvinceWFSFallbackView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Frontend gọi tiền tố chính:
    path("wind/api/v1/", include(router.urls)),
    # Đường dẫn dự phòng tương thích ngược:
    path("api/v1/wind/", include(router.urls)),
    path("api/v2/wind/", include(router.urls)),
    # Fallback cho WFS ranh giới tỉnh nếu Geoserver chưa chạy:
    path("geoserver/geonode/ows", ProvinceWFSFallbackView.as_view(), name="province_wfs_fallback"),
]
```

### 3.2 Bảng Đối Soát Chi Tiết Frontend Calls (`frontend/src/api/wind.js`)

| Hàm trong `wind.js` | Endpoint gọi thực tế | Trả về (Payload Contract) | Micro-app xử lý |
|---|---|---|---|
| `getStations(params)` | `GET /wind/api/v1/stations/` | DRF paginated `{ count, next, previous, results: [...] }` | `wind_stations` |
| `getStationsMap(params)` | `GET /wind/api/v1/stations/map/` | GeoJSON `{ type: "FeatureCollection", features: [...] }` | `wind_stations` |
| `getStationDetail(id)` | `GET /wind/api/v1/stations/{id}/` | Object `{ id, station_code, name, lat, lon, latest_observation, ... }` | `wind_stations` |
| `getStationObservations(params)` | `GET /wind/api/v1/observations/` | DRF paginated kết quả quan trắc đo gió | `wind_stations` |
| `getStationSummary(id, mode, params)` | `GET /wind/api/v1/stations/{id}/{mode}/` | Mảng dữ liệu gộp theo tháng/năm `{ period, avg_speed, max_speed, ... }` | `wind_stations` |
| `getGridSummary()` | `GET /wind/api/v1/raster-granules/summary/` | Thống kê số granule raster `{ total_granules, datasets: [...] }` | `wind_raster` |
| `getDatasets(params)` | `GET /wind/api/v1/datasets/` | DRF paginated danh sách bộ dữ liệu | `wind_core` |
| `getDatasetTimeSteps(datasetId)` | `GET /wind/api/v1/datasets/{id}/time_steps/` | `{ time_steps: ["2026-01-01T00:00:00Z", ...] }` | `wind_core` |
| `getDatasetVariables(datasetId)` | `GET /wind/api/v1/datasets/{id}/get_variables/` | `{ variables: [{ variable_code, variable_name, unit }, ...] }` | `wind_core` |
| `getRasterGranuleData(params)` | `GET /wind/api/v1/raster-granules/data/` | Ma trận lưới raster trường gió `{ lats, lons, values, ... }` | `wind_raster` |
| `getStatisticsOverview(params)` | `GET /wind/api/v1/statistics/overview/` | `{ total_stations, active_stations, total_observations, date_range, ... }` | `wind_stations` |
| `getStatisticsRankings(params)` | `GET /wind/api/v1/statistics/rankings/` | Bảng xếp hạng trạm theo tốc độ gió `{ top_avg, top_max }` | `wind_stations` |
| `getMultiStationComparison(params)` | `GET /wind/api/v1/statistics/multi-station-compare/` | Mảng so sánh giá trị theo mốc thời gian giữa các trạm | `wind_stations` |
| `getWindRoseData(params)` | `GET /wind/api/v1/statistics/wind-rose/` | Dữ liệu hoa gió 16 hướng x 6 cấp tốc độ gió | `wind_stations` |
| `getStatisticsExportUrl(params)` | `GET /wind/api/v1/statistics/export-csv/` | Tệp tin đính kèm Content-Disposition: attachment; filename="*.csv" | `wind_stations` |
| `getProvinceWfsData()` | `GET /geoserver/geonode/ows?...` | GeoJSON FeatureCollection ranh giới 63 tỉnh | Fallback View |

---

## 4. Dịch Vụ Cốt Lõi & Luồng Xử Lý (Core Services & Business Logic)

### 4.1 Tính Toán Hoa Gió (Wind Rose Service)
- **Đầu vào**: Danh sách các bản ghi `Observation` (được lọc theo trạm hoặc vùng địa lý, khoảng thời gian).
- **Quy tắc phân loại**:
  - Hướng gió: Chia thành 16 góc $22.5^\circ$ ($[348.75^\circ, 11.25^\circ] \to \text{N}$, $[11.25^\circ, 33.75^\circ] \to \text{NNE}$,...).
  - Dải tốc độ: 6 dải gồm `< 2 m/s`, `2 - 4 m/s`, `4 - 6 m/s`, `6 - 8 m/s`, `8 - 10 m/s`, `> 10 m/s`.
- **Đầu ra**: Tần suất (%) của từng hướng và từng dải tốc độ, tỉ lệ phần trăm lặng gió (calm wind frequency).

### 4.2 Xử Lý NetCDF Đa Chiều (Raster Service)
- Mở tệp NetCDF bằng `xarray.open_dataset()`.
- Trích xuất biến thành phần $u$ (kinh hướng) và $v$ (vĩ hướng).
- Tính vận tốc gió tổng hợp: $V = \sqrt{u^2 + v^2}$.
- Hướng gió: $\theta = (180 + \frac{180}{\pi} \cdot \text{atan2}(u, v)) \pmod{360}$.
- Cắt lát không gian theo BBOX và bước nhảy (`step`) để tối ưu băng thông mạng.

### 4.3 Phân Tích Hiện Tượng Khí Tượng Cực Đoan (Event Service)
- Nhận diện không gian: PostGIS `geom__intersects` giữa vùng ảnh hưởng bão (`influence_area`) và tọa độ trạm (`Station.geom`).
- Khớp thời gian: Lọc các bản ghi `Observation` nằm trong khoảng $[start\_date, end\_date]$.

---

## 5. Cấu Hình Hệ Thống & Thư Viện Cần Thiết

### 5.1 Thư viện trong Python Virtual Environment (`.venv`)
Cần đảm bảo cài đặt các gói:
```
djangorestframework>=3.14.0
djangorestframework-gis>=1.0
django-filter>=24.0
django-cors-headers>=4.0
xarray>=2024.0.0
netCDF4>=1.6.0
numpy>=1.26.0
pandas>=2.0.0
cdsapi>=0.7.0
cryptography>=42.0.0
```

### 5.2 Cấu hình Django Settings (`apps/configs/settings.py`)
- **`INSTALLED_APPS`**:
  ```python
  INSTALLED_APPS = [
      "django.contrib.admin",
      "django.contrib.auth",
      "django.contrib.contenttypes",
      "django.contrib.sessions",
      "django.contrib.messages",
      "django.contrib.staticfiles",
      "django.contrib.gis",
      
      # Third-party apps
      "rest_framework",
      "rest_framework_gis",
      "django_filters",
      "corsheaders",
      "django_celery_beat",
      
      # Micro-apps
      "wind_core",
      "wind_stations",
      "wind_raster",
      "wind_events",
      "wind_energy",
      "wind_cds",
  ]
  ```
- **`MIDDLEWARE`**:
  Thêm `corsheaders.middleware.CorsMiddleware` ở đầu danh sách middleware.
- **`CORS_ALLOW_ALL_ORIGINS`**: `True` (trong chế độ phát triển).

---

## 6. Kế Hoạch Xác Thực (Verification Plan)

| Bước | Hành động kiểm tra | Kết quả kỳ vọng |
|---|---|---|
| 1 | `python manage.py check` | Trả về 0 lỗi cú pháp hoặc mô hình (System check identified no issues). |
| 2 | `python manage.py showmigrations` | Tất cả migration của 6 micro-apps hiển thị đầy đủ, không xung đột. |
| 3 | Kiểm thử API Trạm | `GET /wind/api/v1/stations/` và `GET /wind/api/v1/stations/map/` trả về đúng cấu trúc dữ liệu và GeoJSON. |
| 4 | Kiểm thử API Thống kê | `GET /wind/api/v1/statistics/overview/` và `GET /wind/api/v1/statistics/wind-rose/` tính toán đúng kết quả. |
| 5 | Kiểm thử API Dataset & Raster | `GET /wind/api/v1/datasets/` và `GET /wind/api/v1/raster-granules/summary/` phản hồi HTTP 200 kèm metadata. |
| 6 | Kiểm thử API Sự kiện bão | `GET /wind/api/v1/events/` và action `impacted_observations` hoạt động chính xác. |
| 7 | Kiểm tra tích hợp Frontend | Chạy dev server Django port 8000 và kiểm tra kết nối từ Vite dev server port 5173. |
