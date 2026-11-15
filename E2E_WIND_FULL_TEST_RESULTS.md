# Báo cáo kết quả kiểm thử E2E toàn diện — Phân hệ Wind

> **Trạng thái cuối cùng:** Đã sửa toàn bộ 7 nhóm lỗi phát hiện từ giai đoạn kiểm thử ban đầu, build lại bundle frontend (`vite build`), khởi động lại `wind_be`/`wind_worker` và chạy xác nhận lại toàn bộ bộ test backend + trình duyệt: **PASS 100%** (không còn `test.fail`, không bỏ qua test case nào).

---

## 1. Tổng quan thực thi sau khi sửa lỗi

| Hạng mục kiểm thử | Công cụ / Lệnh thực thi | Phạm vi | Kết quả quan sát | Thời lượng |
| :--- | :--- | :--- | :--- | :---: |
| **Backend Toàn Phân Hệ (`wind_be`)** | `docker compose exec -T -e POSTGRES_USER=postgres wind_be python manage.py test tests.test_e2e_frontend_contract tests.test_admin_endpoints wind_core wind_stations wind_raster wind_events wind_cds wind_energy --noinput --verbosity=1` | Hợp đồng Frontend/Admin + Unit & API tests của toàn bộ 6 micro-app Wind | **193/193 PASSED (`OK`)** | `23.896s` |
| **Frontend Production Build** | `cd D:\Jobs\Wind\wind-management\frontend; npm run build` | Build bundle React (`wind_app.js`, `wind_app.css`) xuất ra `src/geonode_project/static/wind_management/dist` | **0 lỗi** (`862` modules) | `48.78s` |
| **Playwright Browser E2E** | `cd D:\Jobs\Wind\wind-management\frontend; npm run test:e2e` | 12 tuyến Public + WindHUB Admin, RBAC guard, CRUD, Upload `.nc`/`.csv`, Data Lake SQL, Export không lọc & Audit UI | **17/17 PASSED (`17 passed`)** | `1.7m` |

---

## 2. Kết quả chi tiết Playwright Browser E2E (`17/17 PASSED`)

Chạy tuần tự với 1 worker (`viewport: 1440x900`) vào `http://localhost/wind-app/` (không dùng `test.fail` hay `expect.soft`):

| # | Project | File kịch bản | Mã & Tên kịch bản | Trạng thái | Thời gian | Ảnh minh chứng (`tests/e2e_screenshots/`) |
| :-: | :--- | :--- | :--- | :---: | :---: | :--- |
| 1 | `setup` | [auth.setup.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/auth.setup.js) | Đăng nhập GeoNode `/account/login/` lưu session `admin.json` | PASS | `4.6s` | — |
| 2 | `public` | [public-dashboard-stations.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/public-dashboard-stations.spec.js) | `E2E-PUB-01`: Dashboard KPI cards & điều hướng route (bao gồm nút **"Mở bản đồ trạm"** -> `#/stations`) | PASS | `3.7s` | `pub_01_dashboard.png` |
| 3 | `public` | [public-dashboard-stations.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/public-dashboard-stations.spec.js) | `E2E-PUB-02`: Danh sách trạm, bộ lọc, bản đồ OpenLayers & điều hướng chi tiết | PASS | `4.3s` | `pub_02_stations.png` |
| 4 | `public` | [public-farms.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/public-farms.spec.js) | `E2E-PUB-05`: Trang trại điện gió, bộ lọc tuabin, nội suy KDE/IDW/Kriging, truy vấn điểm & xuất CSV/GeoJSON | PASS | `8.6s` | `pub_05_farms.png` |
| 5 | `public` | [public-grid-map.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/public-grid-map.spec.js) | `E2E-PUB-04`: Bản đồ gió lưới, điều khiển lớp, thanh thời gian & popup biểu đồ điểm | PASS | `5.4s` | `pub_04_grid_map.png` |
| 6 | `public` | [public-station-detail.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/public-station-detail.spec.js) | `E2E-PUB-03`: Chi tiết trạm, chế độ xem năm/tháng/chi tiết, chọn biến & biểu đồ Plotly | PASS | `4.3s` | `pub_03_station_detail.png` |
| 7 | `public` | [public-statistics.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/public-statistics.spec.js) | `E2E-PUB-06`: Thống kê 4 tab, bộ lọc dùng chung & xuất báo cáo CSV | PASS | `5.6s` | `pub_06_statistics_overview.png`, `pub_06_statistics_report.png` |
| 8 | `admin-guard` | [admin-guard.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/admin-guard.spec.js) | `E2E-ADM-01` (Guest): Chặn `#/admin` với 403 trên UI và API trả 401/403 (bao gồm `/wind/api/v1/stations/`, `/cds-credentials/`, `/cds-jobs/`) | PASS | `2.8s` | `adm_00_guard_403.png` |
| 9 | `admin-guard` | [admin-guard.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/admin-guard.spec.js) | `E2E-ADM-01` (Admin): Giao diện toàn màn hình WindHUB, thu gọn/mở rộng sidebar & liên kết quay lại | PASS | `2.6s` | `adm_01_shell.png` |
| 10 | `admin` | [admin-cds.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/admin-cds.spec.js) | `E2E-ADM-03`: 3 tab quản lý ERA5, wizard tạo tác vụ 4 bước + MiniMap & dọn dẹp tác vụ | PASS | `4.4s` | `adm_03_cds_credentials.png`, `adm_03_cds_wizard_step4.png` |
| 11 | `admin` | [admin-dashboard.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/admin-dashboard.spec.js) | `E2E-ADM-02`: Dashboard quản trị KPI cards, tác vụ nhanh, làm mới & nhật ký nạp | PASS | `3.1s` | `adm_02_dashboard.png` |
| 12 | `admin` | [admin-farms-datasets.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/admin-farms-datasets.spec.js) | `E2E-ADM-06a`: CRUD trang trại gió, khóa độ sâu 0 khi chọn móng nổi (`FLOATING`), nhập CSV tuabin, xuất CSV & dọn dẹp | PASS | `4.7s` | `adm_06_farms_turbines.png` |
| 13 | `admin` | [admin-farms-datasets.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/admin-farms-datasets.spec.js) | `E2E-ADM-06b`: CRUD bộ dữ liệu, tab biến dữ liệu & tab chính sách phân quyền | PASS | `3.6s` | `adm_06_datasets_variables.png` |
| 14 | `admin` | [admin-rasters.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/admin-rasters.spec.js) | `E2E-ADM-04`: Nạp tệp `sample_wind.nc` vào bộ dữ liệu cô lập, kiểm tra kết quả & dọn dẹp | PASS | `4.0s` | `adm_04_rasters_uploaded.png` |
| 15 | `admin` | [admin-stations.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/admin-stations.spec.js) | `E2E-ADM-05`: CRUD trạm đo, tải tệp CSV mẫu, kiểm tra cấu trúc trước khi nạp, nạp vào kho Parquet, xuất dữ liệu trạm `48_10`, xóa phân vùng `E2E_LAKE_STN`, Hoa gió & 3 mẫu SQL tổng hợp | PASS | `12.6s` | `adm_05_stations_crud.png`, `adm_05_datalake.png`, `adm_05_analytics_sql.png` |
| 16 | `admin` | [admin-stations.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/admin-stations.spec.js) | `E2E-ADM-05b`: Xuất toàn bộ kho dữ liệu (không lọc trạm -> HTTP 200), xuất trạm chưa có tệp Parquet -> HTTP 404 & chạy mẫu SQL **"Mười mốc gió mạnh nhất"** thành công | PASS | `5.1s` | — |
| 17 | `admin` | [ui-guidelines-audit.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/ui-guidelines-audit.spec.js) | Kiểm tra 12 tuyến giao diện (bao gồm `/stations/:id/detail`): không lỗi JS/HTTP 5xx và kiểm tra từ cấm theo UI Rule #4 | PASS | `14.3s` | — |

### Kiểm tra độ sạch dữ liệu sau lần chạy cuối (`wind_be`)
- `Datasets`: `2` (`E2E`: `0`)
- `Stations`: `175` (`E2E`: `0`)
- `WindFarm`: `3` (`E2E`: `0`)
- `WindTurbine`: `999` (`E2E >= 99000`: `0`)
- `CDSDownloadJob`: `1` (`E2E`: `0`)
- `RasterGranuleIndex`: `24`
- Thư mục `/usr/src/apps/media/observations/E2E_LAKE_STN`: `False` (đã xóa sạch).

---

## 3. Tóm tắt các lỗi đã khắc phục

1. **RBAC Endpoints quản trị CDS ([views.py](file:///D:/Jobs/Wind/wind-management/apps/wind_cds/views.py#L22-L121)):** Đổi `permission_classes` của `CDSCredentialViewSet`, `CDSDownloadJobViewSet` và `CDSJobRunViewSet` từ `IsAuthenticatedOrReadOnly` sang `permissions.IsAdminUser`; cập nhật test quyền admin trong [tests.py](file:///D:/Jobs/Wind/wind-management/apps/wind_cds/tests.py#L318-L349) và [test_admin_endpoints.py](file:///D:/Jobs/Wind/wind-management/apps/tests/test_admin_endpoints.py#L89-L108).
2. **HTTP 500 Data Lake Export / Wind Rose / Overview ([duckdb_storage_service.py](file:///D:/Jobs/Wind/wind-management/apps/wind_stations/services/duckdb_storage_service.py#L111-L455)):**
   - Sửa câu lệnh upsert trong `ingest_dataframe_to_parquet` dùng `UNION ALL BY NAME` và bỏ cột `2 as priority` bị trùng gây sinh cột `priority_1`.
   - Thêm helper `_resolve_lake_glob` + `_escape_sql_literal`, giới hạn kiểm tra tệp `.parquet` theo `station_code` khi có lọc (trả `None` / HTTP 404 thay vì `_duckdb.IOException`) và bật `union_by_name=True` trong `get_data_lake_overview`, `export_lake_data`, `calculate_wind_rose_from_parquet`.
3. **HTTP 500 Data Lake SQL `NaN` Serialization ([duckdb_storage_service.py](file:///D:/Jobs/Wind/wind-management/apps/wind_stations/services/duckdb_storage_service.py#L518-L553)):** Bật `union_by_name=True` khi thay thế bảng `observations`, xử lý kho rỗng trả 0 dòng và chuẩn hóa toàn bộ `NaN` / `NaT` / `Inf` về `None` trước khi render JSON.
4. **HTTP 500 `PATCH` trạm đo không gửi `station_code` ([serializers.py](file:///D:/Jobs/Wind/wind-management/apps/wind_stations/serializers.py#L37-L61)):** Thêm kiểm tra `if code is not None:` trong `create()` và `update()` của `StationSerializer`, kèm test hồi quy trong [test_admin_endpoints.py](file:///D:/Jobs/Wind/wind-management/apps/tests/test_admin_endpoints.py#L168-L173).
5. **UX & Validation Form Trang trại / Tuabin ([AdminFarmsRoute.jsx](file:///D:/Jobs/Wind/wind-management/frontend/src/routes/admin/AdminFarmsRoute.jsx#L1005-L1149)):** Thêm dấu `*` + `required` cho trường **"Vùng biển *"** và hiển thị thông báo lỗi API (`farmModalError`, `turbineModalError`) ngay trong modal thay vì bị che phía sau nền mờ.
6. **Dead Link trên Dashboard công khai ([WindDashboardRoute.jsx](file:///D:/Jobs/Wind/wind-management/frontend/src/routes/WindDashboardRoute.jsx#L74-L78)):** Sửa nút thẻ **"Lập bản đồ"** chuyển từ route không tồn tại `/stations/new` sang `#/stations` (**"Mở bản đồ trạm"**).
7. **Sửa 15 test lỗi có sẵn trong `wind_energy` ([views.py](file:///D:/Jobs/Wind/wind-management/apps/wind_energy/views.py#L265-L267), [tests.py](file:///D:/Jobs/Wind/wind-management/apps/wind_energy/tests.py#L385-L560)):**
   - Gắn `@override_settings(ROOT_URLCONF="wind_energy.urls")` cho `WindTurbineInterpolationApiTest`.
   - Di chuyển `test_turbine_create_keeps_explicit_floating_foundation_with_zero_depth` từ `LoadWindTurbinesCommandTest` về đúng lớp `WindEnergyViewSetApiTest` (nơi có `APIClient` và `self.farm`).
   - Cập nhật `test_turbine_create_requires_admin` gửi `point_id` số nguyên `77` (đồng thời giữ kiểm tra `"TB_77"` bị từ chối với `400 Bad Request`) theo đúng thiết kế `IntegerField` hiện tại.
   - Đồng bộ `INTERPOLATION_POINT_MAX_KM` trong `WindTurbineViewSet` bằng `interpolation.DEFAULT_MAX_DISTANCE_KM + interpolation.DEFAULT_FADE_KM` (`149.0` km) để khớp vùng hiển thị của lưới nội suy.
8. **Dọn dẹp cô lập E2E ([admin-rasters.spec.js](file:///D:/Jobs/Wind/wind-management/frontend/e2e/admin-rasters.spec.js#L21-L67)):** Đảm bảo dataset tạm và bản ghi raster sinh ra trong quá trình upload `.nc` luôn được xóa sạch hoàn toàn trong khối `finally`.
