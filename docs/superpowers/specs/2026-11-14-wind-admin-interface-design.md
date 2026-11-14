# Thiết kế Kỹ thuật Giao diện Quản trị Dữ liệu Gió (WindHUB Admin)

- **Ngày tạo:** 14/11/2026
- **Trạng thái:** Đã phê duyệt (Approved)
- **Tác giả:** Antigravity AI Assistant & Engineering Team
- **Dự án:** Wind Management System (`wind-management`)

---

## 1. Mục tiêu & Bối cảnh

### 1.1. Mục tiêu
Xây dựng phân hệ Quản trị Dữ liệu (**WindHUB Admin**) hoàn chỉnh, hiện đại dành cho quản trị viên và chuyên gia khí tượng thủy văn nhằm:
1. Quản lý, nạp và giám sát toàn bộ các nguồn dữ liệu khí tượng & năng lượng gió thuộc hệ sinh thái các micro-apps `wind_*` (`wind_core`, `wind_stations`, `wind_raster`, `wind_events`, `wind_energy`, `wind_cds`).
2. Tách biệt hoàn toàn giao diện quản trị khỏi khung trang mặc định của GeoNode, cung cấp trải nghiệm toàn màn hình (Fullscreen 100vw x 100vh) với **thanh điều hướng dọc (Vertical Sidebar Navbar)** chuyên nghiệp.
3. Tích hợp trực tiếp vào menu **WindHUB** sẵn có trên thanh điều hướng GeoNode và áp dụng cơ chế kiểm tra quyền Admin (`is_staff` / `is_superuser`) 2 lớp (Client Route Guard & Backend DRF Permissions).

### 1.2. Hiện trạng mã nguồn
- Hệ thống backend `wind_be` (Django 6.1 / DRF / GeoDjango) chạy trên container cổng 8001, chia sẻ cơ sở dữ liệu PostGIS với GeoNode và Celery worker `wind_worker`.
- Frontend chạy trên Vite + React 18, được nhúng vào GeoNode qua view `WindAppPortalView` (`/wind-app/`).
- Đã có sẵn các service xử lý lõi:
  - `apps/wind_raster/services/raster_ingest.py`: Cắt lát file NetCDF theo từng mốc giờ, sinh footprint polygon, tạo/đồng bộ biến thành phần `DatasetVariable` và chỉ mục `RasterGranuleIndex`.
  - `apps/wind_cds/services/cds_service.py` & `tasks.py`: Tự động hóa tải dữ liệu ERA5 từ Copernicus CDS, đồng bộ `django_celery_beat.PeriodicTask`.
  - `apps/wind_stations/services/station_service.py`: Tính toán hoa gió (Wind Rose), tóm tắt thống kê chuỗi thời gian quan trắc.

---

## 2. Kiến trúc Định tuyến & Bảo vệ Quyền (Routing & Security)

### 2.1. Cấu hình Menu WindHUB trên GeoNode
- **Tệp nguồn:** `src/geonode_project/templates/geonode-mapstore-client/snippets/brand_navbar_default_right_menu_items.html`.
- **Cập nhật:** Sửa đường dẫn mục WindHUB thành link trực tiếp tới giao diện Admin:
  ```html
  <li><a href="/wind-app/#/admin"><i class="fa fa-cogs" style="margin-right: 6px;"></i>WindHUB Admin</a></li>
  ```
- **Khai báo thuộc tính:** Bổ sung `data-is-superuser="{{ request.user.is_superuser|yesno:'true,false' }}"` vào thẻ container `#wind-app-root` trong `src/geonode_project/templates/wind_management/app.html`.

### 2.2. Cơ chế Dynamic Fullscreen Shell
Khi người dùng truy cập bất kỳ route nào thuộc không gian `/admin/*`:
1. Component `AdminLayout` trong React tự động thêm class `wind-admin-fullscreen-active` vào thẻ `document.body`.
2. Khi thoát khỏi phân hệ Admin (ví dụ quay lại `#/stations`), class này được gỡ bỏ trong hàm dọn dẹp `useEffect cleanup`.
3. Bộ quy tắc CSS toàn cục:
   ```css
   body.wind-admin-fullscreen-active #gn-brand-navbar,
   body.wind-admin-fullscreen-active footer,
   body.wind-admin-fullscreen-active #gn-brand-navbar-bottom {
       display: none !important;
   }
   body.wind-admin-fullscreen-active #wind-app-root {
       position: fixed;
       inset: 0;
       width: 100vw;
       height: 100vh;
       z-index: 9999;
       margin: 0 !important;
       padding: 0 !important;
       background-color: #0f172a;
       overflow: hidden;
   }
   ```

### 2.3. Kiểm tra Quyền Admin (Admin Route Guard)
Component `<AdminRouteGuard config={config}>` bao bọc toàn bộ các route admin:
- **Chưa đăng nhập:** Chuyển hướng người dùng tới trang đăng nhập GeoNode `/account/login/?next=/wind-app/%23/admin`.
- **Đã đăng nhập nhưng không có quyền (`isStaff === false && isSuperuser === false`):** Hiển thị màn hình lỗi **403 Forbidden**:
  - Biểu tượng khiên bảo mật đỏ kèm thông báo *"Truy cập bị từ chối - Yêu cầu đặc quyền Quản trị viên"*.
  - Nút bấm *"Quay lại trang bản đồ"* điều hướng về `#/stations`.
- **Hợp lệ:** Render `AdminLayout` cùng các module chức năng.

---

## 3. Thiết kế Bố cục Giao diện (Layout & UX)

### 3.1. Bố cục 2 Cột (Split-screen Structure)
- **Cột trái - Sidebar cố định (Width: 260px, thu gọn 72px):**
  - Màu nền: Slate 900 (`#0f172a`), viền phân cách `#1e293b`.
  - Đỉnh Sidebar: Logo gió màu xanh cyan (`#38bdf8`), tiêu đề **WINDHUB ADMIN**, phụ đề *"Control Center"*.
  - Thân Sidebar: Danh sách các menu chức năng với icon FontAwesome/SVG rõ nét, trạng thái Active nổi bật (`bg-sky-600 text-white font-medium shadow`).
  - Chân Sidebar: Card tóm tắt tài khoản (Avatar, username, badge Superuser/Staff) + Nút **"Về cổng công cộng"** (icon `fa-sign-out`).
- **Cột phải - Vùng làm việc chính (Main Content Area):**
  - **Topbar (Cao 56px, nền trắng `#ffffff`, viền đáy `#e2e8f0`):**
    - Nút Toggle Collapse Sidebar.
    - Breadcrumbs động phản ánh trang hiện tại.
    - Trạng thái kết nối backend (`wind_be: Online`, Celery worker status).
    - Nút chuyển nhanh về bản đồ công cộng.
  - **Content Body:** Cuộn độc lập (`overflow-y: auto`), nền sáng nhạt (`#f8fafc`), padding 24px - 32px.

---

## 4. Chi tiết các Phân hệ Màn hình Admin

```text
/wind-app/#/admin
  ├── /dashboard            -> Tổng quan hệ thống dữ liệu & nhật ký nạp
  ├── /cds                  -> Quản lý tài khoản API, lịch tải tự động & Job Runs
  ├── /rasters              -> Quản lý chỉ mục dữ liệu lưới & Upload NetCDF/ZIP
  ├── /stations             -> Quản lý trạm đo & Import số liệu Excel/CSV
  ├── /farms                -> Quản lý trang trại gió & Import danh sách tuabin
  └── /datasets             -> Quản lý Metadata bộ dữ liệu & Phân quyền nhóm
```

### 4.1. Màn hình Tổng quan (`#/admin/dashboard`)
- **4 Thẻ thống kê KPI:**
  1. Trạm quan trắc: Tổng số trạm đang hoạt động / Tổng số bản ghi đo mới trong tháng.
  2. Dữ liệu lưới: Tổng số mốc thời gian (granules) NetCDF / Dung lượng đĩa sử dụng.
  3. Tác vụ CDS: Số job đang kích hoạt / Lần chạy gần nhất (Thành công / Thất bại).
  4. Năng lượng gió: Tổng số trang trại gió / Tổng số tuabin đã số hóa.
- **Bảng Nhật ký Nạp dữ liệu gần nhất:** Truy vấn trực tiếp từ `wind_core.IngestionLog`, hiển thị tên tệp, bộ dữ liệu, số bản ghi xử lý, trạng thái và lỗi chi tiết nếu có.

### 4.2. Màn hình Quản lý Thu thập tự động CDS ERA5 (`#/admin/cds`)
Bao gồm 3 tab chức năng:
1. **Tài khoản API (Credentials):** Quản lý danh sách API Key Copernicus CDS (đã mã hóa Fernet), nút "Kiểm tra kết nối" (Test Connection) phản hồi tức thì qua Toast.
2. **Tác vụ Tải Dữ liệu (Download Jobs):** Danh sách các job tải định kỳ hoặc một lần. Form cấu hình vùng biên (Preset Việt Nam, Biển Đông hoặc Bounding Box), danh sách biến gió, tùy chọn `auto_latest` với `lag_days`. Nút "Chạy ngay" (Trigger manual run) gửi task Celery.
3. **Lịch sử & Tiến trình (Job Runs):** Theo dõi trạng thái từng lần chạy (`PENDING`, `DOWNLOADING`, `IMPORTING`, `SUCCESS`, `FAILED`), hiển thị tệp tạm và thời gian thực thi.

### 4.3. Màn hình Quản lý Dữ liệu Lưới & Tải lên NetCDF (`#/admin/rasters`)
- **Khu vực Upload NetCDF / ZIP:** Kéo thả tệp `.nc` hoặc `.zip`, chọn bộ dữ liệu đích (`Dataset`), hiển thị thanh tiến trình tải lên (%).
- **Xử lý Ingestion:** Sau khi upload, backend gọi `ingest_netcdf()`, cắt lát tự động vào `wind_rasters/`, cập nhật `DatasetVariable` và chỉ mục `RasterGranuleIndex`.
- **Bảng Tra cứu Chỉ mục:** Lọc theo mốc thời gian, bộ dữ liệu, biến; xem phạm vi không gian và xóa/nạp lại khi cần.

### 4.4. Màn hình Quản lý Trạm đo & Nhập số liệu Quan trắc (`#/admin/stations`)
- **Quản lý Danh mục Trạm:** Bảng danh sách trạm khí tượng (mã trạm, tên, loại, độ cao, tọa độ). Modal thêm/sửa tích hợp bản đồ OpenLayers thu nhỏ (click để tự điền kinh độ/vĩ độ).
- **Import Số liệu Quan trắc Hàng loạt:**
  - Nút tải tệp Excel/CSV mẫu chuẩn (`station_code, obs_time, wind_speed, wind_dir, temp_2m, humidity, pressure, rain_24h`).
  - Kéo thả file -> Xem trước 10 dòng đầu tiên -> Kiểm tra tính hợp lệ (`dry_run=true`).
  - Nút nạp chính thức với `Observation.objects.bulk_create(..., ignore_conflicts=True)` kèm báo cáo kết quả.

### 4.5. Màn hình Quản lý Trang trại Gió & Tuabin (`#/admin/farms`)
- **Danh sách Trang trại:** Quản lý tên, mã, công suất MW, trạng thái (Lập kế hoạch, Đánh giá, Vận hành), xem và chỉnh sửa ranh giới vùng bao polygon.
- **Import Tọa độ Tuabin Hàng loạt:** Cho phép tải lên tệp Excel/CSV chứa danh sách tuabin (`point_id, lat, lon, wind_speed_100m, sea_depth, predicted_power_mw`) để nạp nhanh hàng loạt vào trang trại.

### 4.6. Màn hình Quản lý Bộ dữ liệu & Phân quyền (`#/admin/datasets`)
- **Metadata Bộ dữ liệu:** Cấu hình `Dataset` (mã, tên, phân loại, cấp độ truy cập) và `DatasetVariable` (đơn vị, nhãn hiển thị tiếng Việt, biến thành phần vector gió $u, v$).
- **Ma trận Phân quyền:** Giao diện ma trận trực quan cho từng Django Group đối với từng bộ dữ liệu: Cột checkbox [Được xem] - [Được truy vấn] - [Được tải về].

---

## 5. Thiết kế Kỹ thuật Backend (API & Phân quyền)

### 5.1. Phân quyền API 2 tầng
Tạo lớp quyền cơ sở trong `wind_core/utils.py` hoặc viewset tương ứng:
```python
from rest_framework import permissions

class IsAdminUserOrReadOnly(permissions.BasePermission):
    """Cho phép GET công khai, bắt buộc Staff/Superuser đối với POST/PUT/PATCH/DELETE."""
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_staff)
```
Áp dụng cho tất cả các ViewSets: `DatasetViewSet`, `StationViewSet`, `ObservationViewSet`, `RasterGranuleIndexViewSet`, `WindFarmViewSet`, `WindTurbineViewSet`.

### 5.2. Các Endpoints Mới / Nâng cấp
1. `POST /wind/api/v1/raster-granules/upload/`: Nhận file `.nc`/`.zip`, gọi `ingest_netcdf()`, trả về kết quả số granules và biến đã nạp.
2. `POST /wind/api/v1/observations/import_file/`: Nhận file `.xlsx`/`.csv`, hỗ trợ cờ `dry_run=true|false`, thực hiện `bulk_create`.
3. `POST /wind/api/v1/turbines/import_file/`: Nhận file `.xlsx`/`.csv`, nạp danh sách tuabin theo `farm_id`.
4. `GET /wind/api/v1/admin/dashboard-stats/`: Trả về số lượng tổng quan phục vụ Dashboard.

### 5.3. Xác thực & CSRF
- Sử dụng Session Authentication đồng bộ với GeoNode.
- Client React tự động lấy cookie `csrftoken` và gửi kèm trong header `X-CSRFToken` khi gọi các phương thức thay đổi dữ liệu.

---

## 6. Tiêu chí Nghiệm thu (Verification & Acceptance Criteria)
1. **Kiểm tra Giao diện & Layout:**
   - Truy cập `/#/admin` hiển thị giao diện full-screen, ẩn 100% navbar/footer của GeoNode.
   - Thanh Sidebar dọc hiển thị đầy đủ 6 menu chức năng, hỗ trợ thu gọn/mở rộng mượt mà.
   - Nút "Về cổng công cộng" đưa người dùng về lại `#/stations` và hiển thị lại giao diện GeoNode hoàn chỉnh.
2. **Kiểm tra Phân quyền:**
   - Tài khoản Superuser/Staff truy cập thành công vào Admin.
   - Người dùng chưa đăng nhập hoặc không phải Staff bị chặn với màn hình 403 Forbidden chuẩn.
   - API ở backend từ chối các request POST/PUT/DELETE từ tài khoản không có quyền Staff (trả về HTTP 403).
3. **Kiểm tra Chức năng:**
   - Upload file NetCDF/ZIP nạp thành công vào hệ thống và hiển thị trong danh sách chỉ mục.
   - Import dữ liệu quan trắc trạm từ file Excel/CSV mẫu nạp đúng vào database `wind_observations`.
   - Kết nối và kích hoạt job CDS hoạt động chính xác với Celery worker.
