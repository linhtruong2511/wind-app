# Kế Hoạch Triển Khai: Tách & Tích Hợp Module Gió Sang Kiến Trúc Micro-Apps Django

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clone toàn bộ API và luồng nghiệp vụ của module gió từ `D:\GeonodeBK\wind_management_app\wind_management` sang dự án Django mới tại `d:\Jobs\Wind\wind-management\apps` theo kiến trúc 6 micro-apps, đảm bảo 100% tương thích với React Frontend (`frontend/src/api/wind.js`).

**Architecture:** Tổ chức 6 micro-apps độc lập (`wind_core`, `wind_stations`, `wind_raster`, `wind_energy`, `wind_events`, `wind_cds`) với các bảng cơ sở dữ liệu vật lý giữ nguyên (`wind_...`). Một API Gateway Router tập trung tại `apps/configs/api_router.py` mount tại `/wind/api/v1/` và `/api/v1/wind/`. Tầng Service xử lý nghiệp vụ toán học khí tượng (hoa gió, vector trường gió NetCDF, phân tích ảnh hưởng bão).

**Tech Stack:** Django 6.x, Django REST Framework, PostGIS (GeoDjango), djangorestframework-gis, django-filter, django-cors-headers, xarray, netCDF4, numpy, pandas, cryptography (Fernet), celery / django-celery-beat.

## Global Constraints
- Đường dẫn cơ sở: `d:\Jobs\Wind\wind-management\apps`
- Môi trường ảo Python: `d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe`
- Prefix API chính: `/wind/api/v1/`
- Tên bảng vật lý cơ sở dữ liệu: `db_table = "wind_..."`
- Không làm thay đổi interface hay làm đứt gãy frontend React (`frontend/src/api/wind.js`)

---

### Task 1: Thiết Lập Môi Trường, Gói Thư Viện & Cấu Hình Settings Dự Án

**Files:**
- Modify: `d:\Jobs\Wind\wind-management\apps\configs\settings.py`
- Test: `tests/test_settings.py`

**Interfaces:**
- Produces: Cấu hình `INSTALLED_APPS`, `MIDDLEWARE` (CORS), PostGIS settings và REST_FRAMEWORK settings cho toàn bộ dự án.

- [ ] **Step 1: Cài đặt các gói thư viện Python cần thiết vào virtual environment**
Chạy lệnh cài đặt các package phục vụ REST GIS, lọc, CORS và xử lý dữ liệu khoa học khí tượng:
```powershell
& "d:\Jobs\Wind\wind-management\.venv\Scripts\pip.exe" install djangorestframework-gis django-filter django-cors-headers xarray netCDF4 numpy pandas cdsapi
```

- [ ] **Step 2: Viết test kiểm tra cấu hình settings**
Tạo file kiểm tra `d:\Jobs\Wind\wind-management\apps\configs\test_settings_init.py`:
```python
import os
import django
from django.conf import settings

def test_installed_apps_and_cors():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "configs.settings")
    django.setup()
    assert "rest_framework" in settings.INSTALLED_APPS
    assert "rest_framework_gis" in settings.INSTALLED_APPS
    assert "corsheaders" in settings.INSTALLED_APPS
    assert "wind_core" in settings.INSTALLED_APPS
    assert "wind_stations" in settings.INSTALLED_APPS
    assert "wind_raster" in settings.INSTALLED_APPS
    assert "wind_energy" in settings.INSTALLED_APPS
    assert "wind_events" in settings.INSTALLED_APPS
    assert "wind_cds" in settings.INSTALLED_APPS
```

- [ ] **Step 3: Cập nhật `apps/configs/settings.py`**
Cập nhật đầy đủ `INSTALLED_APPS`, `MIDDLEWARE`, `CORS_ALLOW_ALL_ORIGINS`, cấu hình GDAL/GEOS cho Windows PostGIS và cấu hình DRF (Pagination, FilterBackends, DateTime formatting).

- [ ] **Step 4: Chạy test kiểm tra cấu hình**
```powershell
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" -c "import os, django; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'configs.settings'); django.setup(); print('Django setup OK')"
```
Expected: `Django setup OK`

- [ ] **Step 5: Commit thay đổi Task 1**
```powershell
git add apps/configs/settings.py
git commit -m "chore: setup dependencies, cors and app configuration in settings"
```

---

### Task 2: Xây Dựng Micro-App `wind_core`

**Files:**
- Create: `d:\Jobs\Wind\wind-management\apps\wind_core\models.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_core\utils.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_core\serializers.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_core\views.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_core\urls.py`

**Interfaces:**
- Produces: `Dataset`, `DatasetVariable`, `DatasetAccessPolicy`, `AlertRule`, `AlertNotification`, `DownloadRequest`, `DownloadRequestItem`, `DownloadFile`, `UserQueryHistory`, `IngestionLog`, `SystemMetric`, `StandardResultsSetPagination`, `DatasetViewSet`.

- [ ] **Step 1: Viết test cho `wind_core` models và serializers**
Tạo test kiểm thử tạo Dataset, DatasetVariable và serialization:
```python
# apps/wind_core/tests.py
from django.test import TestCase
from wind_core.models import Dataset, DatasetVariable
from wind_core.serializers import DatasetSerializer, DatasetVariableSerializer

class DatasetTestCase(TestCase):
    def test_create_dataset_and_serialize(self):
        ds = Dataset.objects.create(code="ERA5_WIND", name="ERA5 Reanalysis Wind", category="GRIDDED")
        var = DatasetVariable.objects.create(dataset=ds, variable_code="u10", variable_name="10m U wind component", unit="m/s")
        serializer = DatasetSerializer(ds)
        self.assertEqual(serializer.data["code"], "ERA5_WIND")
```

- [ ] **Step 2: Triển khai `wind_core/utils.py`**
Định nghĩa `StandardResultsSetPagination` (page_size=20, max_page_size=1000) và các aggregate thống kê (`Median`).

- [ ] **Step 3: Triển khai `wind_core/models.py`**
Khai báo đầy đủ 10 models với đúng `db_table`:
- `wind_datasets`
- `wind_dataset_variables`
- `wind_dataset_access_policies`
- `wind_alert_rules`
- `wind_alert_notifications`
- `wind_download_requests`
- `wind_download_request_items`
- `wind_download_files`
- `wind_user_query_history`
- `wind_ingestion_logs`
- `wind_system_metrics`

- [ ] **Step 4: Triển khai `wind_core/serializers.py` & `views.py`**
- `DatasetSerializer`, `DatasetVariableSerializer`
- `DatasetViewSet` hỗ trợ actions: `time_steps`, `year_steps`, `month_steps`, `day_steps`, `get_variables`.

- [ ] **Step 5: Tạo và chạy migration cho `wind_core`**
```powershell
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py makemigrations wind_core
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py test wind_core
```
Expected: Tests pass.

- [ ] **Step 6: Commit Task 2**
```powershell
git add apps/wind_core
git commit -m "feat(core): implement wind_core models, serializers, pagination, and DatasetViewSet"
```

---

### Task 3: Xây Dựng Micro-App `wind_stations`

**Files:**
- Create: `d:\Jobs\Wind\wind-management\apps\wind_stations\models.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_stations\services\station_service.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_stations\services\province_service.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_stations\serializers.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_stations\views.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_stations\urls.py`

**Interfaces:**
- Consumes: `"wind_core.Dataset"`, `StandardResultsSetPagination`
- Produces: `Station`, `Observation`, `StationViewSet`, `ObservationViewSet`, `StatisticsViewSet`, `ProvinceWFSFallbackView`.

- [ ] **Step 1: Viết test cho `wind_stations`**
Test tạo trạm, bản ghi quan trắc, kiểm tra serializer GeoJSON (`lat`, `lon`, `latest_observation`) và logic tính hoa gió.
```python
# apps/wind_stations/tests.py
from django.test import TestCase
from django.contrib.gis.geos import Point
from wind_core.models import Dataset
from wind_stations.models import Station, Observation
from wind_stations.serializers import StationSerializer, StationGeoSerializer

class StationTestCase(TestCase):
    def test_station_geo_serializer(self):
        ds = Dataset.objects.create(code="STATION_DATA", name="Stations", category="STATION")
        station = Station.objects.create(dataset=ds, station_code="WS01", name="Trạm Bạch Long Vĩ", geom=Point(107.72, 20.13))
        serializer = StationGeoSerializer(station)
        self.assertEqual(serializer.data["type"], "Feature")
        self.assertEqual(serializer.data["geometry"]["coordinates"], [107.72, 20.13])
```

- [ ] **Step 2: Triển khai `wind_stations/models.py`**
- `Station`: `dataset = models.ForeignKey("wind_core.Dataset", ...)` kèm `db_table = "wind_stations"`.
- `Observation`: bảng lưu chuỗi quan trắc khí quyển (tốc độ gió, hướng gió, áp suất, độ ẩm, nhiệt độ, mưa) kèm `db_table = "wind_observations"`.

- [ ] **Step 3: Triển khai `wind_stations/services/station_service.py` & `province_service.py`**
- `get_station_summary_data`: tổng hợp trung bình, cực trị, median theo tháng/năm.
- Tính toán hoa gió 16 hướng x 6 cấp tốc độ gió.
- `province_service.py`: cơ chế lấy ranh giới tỉnh an toàn (không bị crash khi thiếu GeoNode).

- [ ] **Step 4: Triển khai `serializers.py` & `views.py`**
- `StationSerializer`, `StationGeoSerializer`, `ObservationSerializer`.
- `StationViewSet` với action `map` trả FeatureCollection GeoJSON.
- `ObservationViewSet` có filter theo trạm và khoảng thời gian.
- `StatisticsViewSet` với các action: `overview`, `rankings`, `multi-station-compare`, `wind-rose`, `export-csv`.
- `ProvinceWFSFallbackView`: phục vụ endpoint fallback WFS GeoJSON 63 tỉnh thành.

- [ ] **Step 5: Tạo migration & chạy test**
```powershell
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py makemigrations wind_stations
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py test wind_stations
```
Expected: Tests pass.

- [ ] **Step 6: Commit Task 3**
```powershell
git add apps/wind_stations
git commit -m "feat(stations): implement Station, Observation, station_service, and ViewSets"
```

---

### Task 4: Xây Dựng Micro-App `wind_raster`

**Files:**
- Create: `d:\Jobs\Wind\wind-management\apps\wind_raster\models.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_raster\services\netcdf_service.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_raster\services\raster_service.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_raster\services\raster_ingest.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_raster\serializers.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_raster\views.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_raster\urls.py`

**Interfaces:**
- Consumes: `"wind_core.Dataset"`, `"wind_core.DatasetVariable"`
- Produces: `RasterGranuleIndex`, `RasterGranuleIndexSerializer`, `RasterGranuleIndexViewSet`.

- [ ] **Step 1: Viết test cho `wind_raster` models & serializers**
```python
# apps/wind_raster/tests.py
from django.test import TestCase
from django.utils import timezone
from django.contrib.gis.geos import Polygon
from wind_core.models import Dataset
from wind_raster.models import RasterGranuleIndex
from wind_raster.serializers import RasterGranuleIndexSerializer

class RasterTestCase(TestCase):
    def test_raster_granule_serializer(self):
        ds = Dataset.objects.create(code="ERA5_GRID", name="ERA5 Grid", category="GRIDDED")
        poly = Polygon.from_bbox((102.0, 8.0, 110.0, 24.0))
        granule = RasterGranuleIndex.objects.create(dataset=ds, granule_time=timezone.now(), footprint=poly, file_location="/data/era5.nc")
        data = RasterGranuleIndexSerializer(granule).data
        self.assertEqual(data["file_location"], "/data/era5.nc")
```

- [ ] **Step 2: Triển khai `wind_raster/models.py`**
- `RasterGranuleIndex`: `dataset = models.ForeignKey("wind_core.Dataset", ...)` kèm `footprint = models.PolygonField()`, `db_table = "wind_raster_granules_index"`.

- [ ] **Step 3: Triển khai các dịch vụ `netcdf_service.py`, `raster_service.py`, `raster_ingest.py`**
- Bóc tách file NetCDF, tính vector gió tổng hợp $V = \sqrt{u^2 + v^2}$ và hướng gió $\theta$.
- Cắt lát không gian theo `bbox` và áp dụng bước nhảy `step`.

- [ ] **Step 4: Triển khai `serializers.py` & `views.py`**
- `RasterGranuleIndexSerializer`.
- `RasterGranuleIndexViewSet` hỗ trợ actions: `summary`, `data`, `point_metadata`.

- [ ] **Step 5: Tạo migration & chạy test**
```powershell
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py makemigrations wind_raster
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py test wind_raster
```
Expected: Tests pass.

- [ ] **Step 6: Commit Task 4**
```powershell
git add apps/wind_raster
git commit -m "feat(raster): implement RasterGranuleIndex, netcdf_service, and RasterGranuleIndexViewSet"
```

---

### Task 5: Xây Dựng Micro-App `wind_events`

**Files:**
- Create: `d:\Jobs\Wind\wind-management\apps\wind_events\models.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_events\serializers.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_events\views.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_events\urls.py`

**Interfaces:**
- Consumes: `"wind_stations.Station"`, `"wind_stations.Observation"`
- Produces: `MeteorologicalEvent`, `EventTrack`, `MeteorologicalEventViewSet`.

- [ ] **Step 1: Viết test cho `wind_events`**
Test tạo sự kiện bão, đường đi bão và action `impacted_observations` truy vấn các trạm nằm trong vùng ảnh hưởng.

- [ ] **Step 2: Triển khai `wind_events/models.py`**
- `MeteorologicalEvent`: `db_table = "wind_meteorological_events"`, `influence_area = models.PolygonField()`.
- `EventTrack`: `db_table = "wind_event_tracks"`, `geom = models.PointField()`.

- [ ] **Step 3: Triển khai `serializers.py` & `views.py`**
- `MeteorologicalEventSerializer`, `EventTrackSerializer`.
- `MeteorologicalEventViewSet` với action `impacted_observations` lọc trạm theo không gian `Station.geom__intersects=event.influence_area`.

- [ ] **Step 4: Tạo migration & chạy test**
```powershell
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py makemigrations wind_events
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py test wind_events
```
Expected: Tests pass.

- [ ] **Step 5: Commit Task 5**
```powershell
git add apps/wind_events
git commit -m "feat(events): implement MeteorologicalEvent, EventTrack, and MeteorologicalEventViewSet"
```

---

### Task 6: Hoàn Thiện Micro-App `wind_energy`

**Files:**
- Modify: `d:\Jobs\Wind\wind-management\apps\wind_energy\models.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_energy\serializers.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_energy\views.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_energy\urls.py`

**Interfaces:**
- Consumes: `"wind_stations.Station"`
- Produces: `WindFarmSerializer`, `WindTurbineSerializer`, `WindFarmViewSet`, `WindTurbineViewSet`.

- [ ] **Step 1: Viết test cho `wind_energy`**
Test liên kết tuabin với trang trại gió, serializers GeoJSON cho tuabin.

- [ ] **Step 2: Cập nhật `wind_energy/models.py`**
Đảm bảo khóa ngoại `station` trong `ExtremeEvent` trỏ chính xác đến `"wind_stations.Station"`.

- [ ] **Step 3: Triển khai `serializers.py` & `views.py`**
- `WindFarmSerializer`, `WindTurbineSerializer`, `WindTurbineGeoSerializer`.
- `WindFarmViewSet`, `WindTurbineViewSet`.

- [ ] **Step 4: Tạo migration & chạy test**
```powershell
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py makemigrations wind_energy
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py test wind_energy
```
Expected: Tests pass.

- [ ] **Step 5: Commit Task 6**
```powershell
git add apps/wind_energy
git commit -m "feat(energy): complete wind_energy serializers, views, and migrations"
```

---

### Task 7: Xây Dựng Micro-App `wind_cds`

**Files:**
- Create: `d:\Jobs\Wind\wind-management\apps\wind_cds\models.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_cds\services\cds_service.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_cds\tasks.py`
- Create: `d:\Jobs\Wind\wind-management\apps\wind_cds\cds_catalog.py`

**Interfaces:**
- Consumes: `"wind_core.Dataset"`, `"wind_core.IngestionLog"`, `"wind_raster.RasterGranuleIndex"`
- Produces: `CDSCredential`, `CDSDownloadJob`, `CDSJobRun`, `download_cds_granule` task.

- [ ] **Step 1: Viết test cho `wind_cds` mã hóa API key Fernet**
Test phương thức `set_key` và `get_key` bảo mật khóa API CDS.

- [ ] **Step 2: Triển khai `wind_cds/models.py`**
- `CDSCredential` với mã hóa Fernet đối xứng.
- `CDSDownloadJob` liên kết `"wind_core.Dataset"` và lịch Crontab.
- `CDSJobRun` theo dõi nhật ký tải và nạp.

- [ ] **Step 3: Triển khai `services/cds_service.py` & `tasks.py`**
Tích hợp `cdsapi.Client` và Celery task.

- [ ] **Step 4: Tạo migration & chạy test**
```powershell
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py makemigrations wind_cds
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py test wind_cds
```
Expected: Tests pass.

- [ ] **Step 5: Commit Task 7**
```powershell
git add apps/wind_cds
git commit -m "feat(cds): implement CDSCredential, download jobs, and cds_service"
```

---

### Task 8: Tích Hợp Central API Router & Cấu Hình URLs Dự Án

**Files:**
- Create: `d:\Jobs\Wind\wind-management\apps\configs\api_router.py`
- Modify: `d:\Jobs\Wind\wind-management\apps\configs\urls.py`

**Interfaces:**
- Consumes: Tất cả ViewSets từ 6 micro-apps.
- Produces: Hệ thống routing `/wind/api/v1/`, `/api/v1/wind/`, và fallback `/geoserver/geonode/ows`.

- [ ] **Step 1: Viết test tích hợp routing**
Tạo test kiểm thử resolver của toàn bộ danh mục endpoint `/wind/api/v1/...`:
```python
# apps/configs/test_api_routing.py
from django.test import SimpleTestCase
from django.urls import resolve, reverse

class ApiRoutingTestCase(SimpleTestCase):
    def test_routes_resolve(self):
        self.assertIsNotNone(resolve("/wind/api/v1/stations/"))
        self.assertIsNotNone(resolve("/wind/api/v1/stations/map/"))
        self.assertIsNotNone(resolve("/wind/api/v1/observations/"))
        self.assertIsNotNone(resolve("/wind/api/v1/datasets/"))
        self.assertIsNotNone(resolve("/wind/api/v1/events/"))
        self.assertIsNotNone(resolve("/wind/api/v1/raster-granules/"))
        self.assertIsNotNone(resolve("/wind/api/v1/statistics/overview/"))
        self.assertIsNotNone(resolve("/wind/api/v1/statistics/wind-rose/"))
```

- [ ] **Step 2: Triển khai `apps/configs/api_router.py`**
Đăng ký toàn bộ ViewSets vào DRF `DefaultRouter`:
- `datasets` -> `DatasetViewSet`
- `stations` -> `StationViewSet`
- `observations` -> `ObservationViewSet`
- `events` -> `MeteorologicalEventViewSet`
- `raster-granules` -> `RasterGranuleIndexViewSet`
- `statistics` -> `StatisticsViewSet`
- `farms` -> `WindFarmViewSet`
- `turbines` -> `WindTurbineViewSet`

- [ ] **Step 3: Cập nhật `apps/configs/urls.py`**
Mount router tại `/wind/api/v1/`, `/api/v1/wind/` và bổ sung route `/geoserver/geonode/ows`.

- [ ] **Step 4: Chạy test routing**
```powershell
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py test configs
```
Expected: Tests pass.

- [ ] **Step 5: Commit Task 8**
```powershell
git add apps/configs/api_router.py apps/configs/urls.py
git commit -m "feat(routing): integrate central API router and URL routes matching frontend"
```

---

### Task 9: Kiểm Thử Toàn Diện End-to-End & Xác Minh Tương Thích Frontend

**Files:**
- Create: `d:\Jobs\Wind\wind-management\apps\tests\test_e2e_frontend_contract.py`

**Interfaces:**
- Kiểm tra toàn bộ hợp đồng dữ liệu giữa backend và frontend React (`frontend/src/api/wind.js`).

- [ ] **Step 1: Viết script test E2E kiểm tra toàn bộ Contract của `wind.js`**
Tạo test client gọi lần lượt tất cả 16 API endpoints của frontend, xác nhận mã HTTP 200 và cấu trúc payload JSON.

- [ ] **Step 2: Chạy kiểm tra hệ thống Django**
```powershell
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py check
```
Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 3: Chạy test E2E**
```powershell
& "d:\Jobs\Wind\wind-management\.venv\Scripts\python.exe" apps/manage.py test tests
```
Expected: Tất cả API trả về chuẩn xác.

- [ ] **Step 4: Commit hoàn tất**
```powershell
git add apps/tests
git commit -m "test: add comprehensive e2e API contract tests for frontend compatibility"
```
