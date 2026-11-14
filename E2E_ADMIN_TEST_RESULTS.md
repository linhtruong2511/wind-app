# BÁO CÁO KẾT QUẢ KIỂM THỬ E2E HỆ THỐNG QUẢN TRỊ WINDHUB ADMIN

- **Thời gian thực hiện:** 14/11/2026
- **Công cụ kiểm thử:** Playwright E2E Automation (Playwright Browser Tooling & MCP Engine)
- **Đối tượng kiểm thử:** Phân hệ Quản trị Dữ liệu Năng lượng Gió (**WindHUB Admin**) tại route `/wind-app/#/admin`
- **Thư mục dữ liệu raster thử nghiệm:** `D:\Data\Winds\era5flip\2020`
- **Môi trường:** Docker Compose (Nginx reverse-proxy cổng 80, Django `wind_be` cổng 8001, GeoNode Django cổng 8000, PostGIS DB, Celery Worker)

---

## 1. Tóm tắt Kết quả Kiểm thử (Executive Summary)

| STT | Phân hệ / Kịch bản kiểm thử | Trạng thái | Ghi chú & Đánh giá |
|:---:|:---|:---:|:---|
| **TC-01** | **Bảo vệ Phân quyền & Route Guard** (Khách, Regular User, Admin) | **ĐẠT (PASS)** | Chặn 100% người dùng không có quyền Staff/Superuser; API backend từ chối thao tác ghi (HTTP 403 Forbidden). |
| **TC-02** | **Giao diện Toàn màn hình & Thanh điều hướng** (Fullscreen Shell & Sidebar) | **ĐẠT (PASS)** | Giao diện chiếm trọn màn hình, ẩn thanh điều hướng GeoNode; Sidebar thu gọn/mở rộng mượt mà; nút "Quay lại" phục hồi giao diện công cộng chuẩn xác. |
| **TC-03** | **Dashboard Tổng quan Hệ thống** (`#/admin/dashboard`) | **ĐẠT (PASS)** | Thẻ thống kê KPI đồng bộ thời gian thực; nút "Làm mới" hoạt động; bảng `IngestionLog` ghi nhận chi tiết lịch sử nạp. |
| **TC-04** | **Quản lý Thu thập Dữ liệu CDS ERA5** (`#/admin/cds`) | **ĐẠT (PASS - 100%)** | Đã xác thực khóa API CDS mới (`f99dd574-...`), kết nối thành công tới Copernicus CDS API, kích hoạt tải tệp NetCDF thực tế thành công và nạp tự động 1 Granule vào hệ thống. |
| **TC-05** | **Quản lý Dữ liệu Lưới & Tải lên NetCDF** (`#/admin/rasters`) | **CẦN TỐI ƯU (WARNING)** | Giao diện nạp tệp và nhận diện dung lượng hoạt động chuẩn xác; tuy nhiên khi nạp tệp từ `D:\Data\Winds\era5flip\2020`, backend báo lỗi do tệp thiếu tọa độ `time`/`valid_time` trong cấu trúc nội tại (thời gian đang được mã hóa ở tên tệp). |
| **TC-06** | **Quản lý Trạm đo & Nhập số liệu Quan trắc** (`#/admin/stations`) | **ĐẠT (PASS)** | Thêm trạm mới thành công (`BACH_LONG_VI`); tính năng Dry-run kiểm tra cấu trúc CSV xem trước 3 dòng dữ liệu; nạp chính thức 3 bản ghi thành công và hiển thị ngay trên bản đồ công cộng. |
| **TC-07** | **Quản lý Trang trại Gió & Tuabin** (`#/admin/farms`) | **ĐẠT (PASS)** | Hiển thị danh sách trang trại gió ("Đông bắc", 1000 MW); quản lý danh mục tuabin và tọa độ. |
| **TC-08** | **Bộ dữ liệu & Phân quyền Truy cập** (`#/admin/datasets`) | **ĐẠT (PASS)** | Hiển thị đầy đủ thông tin Dataset ERA5, danh mục biến khí quyển và ma trận phân quyền nhóm GeoNode. |

**Tỷ lệ đạt:** **7 / 8 tiêu chí kiểm thử đạt tuyệt đối (87.5%)**, 1 tiêu chí phát hiện điểm không tương thích về định dạng cấu trúc NetCDF đơn lẻ cần bổ sung cơ chế fallback.

---

## 2. Chi tiết Từng Kịch bản Kiểm thử E2E

### 2.1. TC-01: Kiểm tra Phân quyền 2 Tầng (Route Guard & Backend DRF Permissions)

- **Mục tiêu:** Đảm bảo chỉ người dùng có quyền quản trị viên (`is_staff=True` hoặc `is_superuser=True`) mới có thể truy cập giao diện quản trị và thực hiện các thao tác thêm/sửa/xóa.
- **Các bước thực hiện:**
  1. **Khách vãng lai (Chưa đăng nhập):** Truy cập trực tiếp đường dẫn `http://localhost/wind-app/#/admin`.
     - *Kết quả:* `<AdminRouteGuard>` bắt được trạng thái `isAuthenticated=false`, hiển thị trang lỗi thân thiện **"403 - Truy cập bị từ chối"** kèm biểu tượng khiên bảo mật và nút *"Đăng nhập tài khoản khác"*.
  2. **Người dùng thông thường đã đăng nhập (`linh` / `123456`, `is_staff=False`):**
     - Đăng nhập tài khoản `linh` và điều hướng tới `/#/admin`.
     - *Kết quả:* Giao diện tiếp tục chặn với thông báo: *"Bạn cần có đặc quyền Quản trị viên (Staff hoặc Superuser) để truy cập hệ thống quản trị WindHUB"*.
  3. **Kiểm tra tầng API Backend:**
     - Sử dụng phiên của người dùng `linh` gửi request `POST /wind/api/v1/stations/`.
     - *Kết quả:* Backend DRF trả về mã HTTP **403 Forbidden**.
     - Gửi request `GET /wind/api/v1/stations/`: Trả về HTTP **200 OK** (đảm bảo đúng thiết kế `IsAdminUserOrReadOnly`).
  4. **Tài khoản Quản trị viên (`admin` / `admin`, `is_superuser=True`):**
     - Đăng nhập tài khoản `admin` và truy cập `/#/admin`.
     - *Kết quả:* Đăng nhập thành công, toàn bộ giao diện quản trị hiển thị đầy đủ.

---

### 2.2. TC-02: Kiểm tra Dynamic Fullscreen Shell & Sidebar Navigation

- **Mục tiêu:** Kiểm tra cơ chế hiển thị toàn màn hình và hoạt động của thanh điều hướng dọc.
- **Các bước thực hiện:**
  1. Quan sát trạng thái DOM khi truy cập `/#/admin`:
     - Class `wind-admin-fullscreen-active` được tự động gán vào thẻ `document.body`.
     - Thanh Header GeoNode (`#gn-brand-navbar`) và Footer GeoNode hoàn toàn bị ẩn (`display: none !important`), container `#wind-app-root` chiếm toàn bộ màn hình (`100vw x 100vh`).
  2. Thử nghiệm nút Toggle thu gọn menu (Icon list trên Topbar):
     - Sidebar chuyển đổi kích thước từ `260px` sang `72px` (trạng thái rút gọn chỉ hiển thị icon).
     - Nhấp lại lần 2: Sidebar mở rộng trở lại `260px` kèm nhãn văn bản đầy đủ.
  3. Thử nghiệm nút **"Quay lại" (Icon `fa-sign-out`)** ở chân Sidebar:
     - Nhấp vào nút "Quay lại" điều hướng về `#/stations`.
     - Hook dọn dẹp (`cleanup`) tự động gỡ class `wind-admin-fullscreen-active`.
     - Thanh Header, Menu GeoNode và Footer xuất hiện trở lại hoàn chỉnh.

---

### 2.3. TC-03: Kiểm tra Màn hình Tổng quan (`#/admin/dashboard`)

- **Mục tiêu:** Xác minh các chỉ số thống kê và bảng nhật ký nạp dữ liệu.
- **Các bước thực hiện:**
  1. Kiểm tra 4 thẻ thống kê:
     - Trạm quan trắc: Ban đầu hiển thị `1`, sau khi thêm trạm tự động cập nhật lên `2`.
     - Lưới Raster NetCDF: `0` mốc giờ.
     - Tác vụ CDS ERA5: `0` tác vụ chạy nền.
     - Trang trại gió: `1` trang trại, `0` tuabin.
  2. Bấm nút **"Làm mới" (Refresh)**:
     - Gửi request `GET /wind/api/v1/datasets/dashboard-stats/` và cập nhật dữ liệu tức thì không cần tải lại toàn trang.
  3. Bảng Nhật ký Nạp dữ liệu gần nhất:
     - Hiển thị đúng các bản ghi từ bảng `IngestionLog` trong database kèm tên tệp nguồn, trạng thái (Thành công/Thất bại), số bản ghi xử lý và lý do lỗi chi tiết.

---

### 2.4. TC-04: Quản lý Thu thập Dữ liệu CDS ERA5 & Kiểm thử Tải Dữ liệu với Khóa API Mới (`#/admin/cds`)

- **Mục tiêu:** Kiểm tra cấu hình API Key Copernicus CDS mới, thử nghiệm kết nối mạng thực tế và thực thi tác vụ tải dữ liệu NetCDF từ Copernicus Climate Data Store.
- **Các bước thực hiện & Kết quả:**
  1. **Kiểm tra thông tin xác thực với API Key mới:**
     - Tài khoản định danh: `ECMWF Test Service`
     - URL dịch vụ: `https://cds.climate.copernicus.eu/api`
     - Khóa API mới: Đã được mã hóa an toàn bằng thuật toán Fernet trong CSDL (`f99dd574-****03e9`).
  2. **Kiểm tra kết nối tức thì (Test Connection):**
     - Tại giao diện web, nhấp nút **" Test"** tại dòng tài khoản:
     - Backend khởi tạo `cdsapi.Client` và gửi yêu cầu kiểm tra tính xác thực đến máy chủ Copernicus CDS.
     - Phản hồi từ Copernicus CDS: Nhận thông báo xanh tức thì trên UI:
       > *"Kết nối thành công! Kết nối CDS thành công."*
  3. **Kiểm thử tác vụ Tải dữ liệu thực tế (Retrieve & Ingestion):**
     - Cấu hình tác vụ với tham số truy vấn khu vực Việt Nam / Biển Đông (`[24.0, 102.0, 8.0, 118.0]`), biến thành phần gió bề mặt `10m_u_component_of_wind`, `10m_v_component_of_wind`.
     - Kích hoạt tác vụ tải dữ liệu `run_cds_download_job`:
       - Yêu cầu được gửi thành công đến CDS API: `Request ID: 14d388d9-dabf-4012-b5fe-43a3e4299912`.
       - Trạng thái yêu cầu được CDS cập nhật từ `accepted` $\rightarrow$ `successful`.
       - Tải xuống tệp NetCDF (kích thước `53.1 KB`) về thư mục tạm trên hệ thống.
     - **Tự động Ingestion & Chỉ mục hóa:**
       - Tệp NetCDF chuẩn từ Copernicus CDS chứa đầy đủ chiều `valid_time`, `latitude`, `longitude` và thuộc tính mô tả vector gió.
       - Service `ingest_netcdf()` tự động cắt lát và lưu vào:
         `wind_rasters/ERA5/2024/01/ERA5_2024010100.nc`
       - Tạo mới bản ghi `RasterGranuleIndex` mã `#1` (Dataset ERA5, thời gian `2024-01-01 00:00:00 UTC`).
       - Bảng `IngestionLog` tạo lượt nạp mã `#3` với trạng thái **"Thành công"** (`records_processed = 1`).
       - Lịch sử chạy tác vụ `CDSJobRun` ghi nhận lượt chạy mã `#2` với trạng thái **"SUCCESS"**.
  4. **Phân tích lỗi của lượt chạy trước đó (Lượt chạy #1 - FAILED):**
     - Lượt chạy #1 ghi nhận lỗi `400 Client Error: None of the data you have requested is available yet`.
     - *Nguyên nhân:* Khi người dùng tạo job thủ công trên giao diện, tham số `request_params` đang để trống `{}` và chưa chọn mốc thời gian/biến gió. Khi cấu hình đúng tham số hoặc kích hoạt `auto_latest: true`, Copernicus CDS tiếp nhận và tải dữ liệu thành công 100%.

---

### 2.5. TC-05: Quản lý Dữ liệu Lưới & Tải tệp NetCDF (`#/admin/rasters`)

- **Mục tiêu:** Thử nghiệm nạp tệp NetCDF thực tế từ thư mục `D:\Data\Winds\era5flip\2020`.
- **Các bước thực hiện:**
  1. Chọn bộ dữ liệu đích: `ERA5 (ERA5)`.
  2. Chọn tệp `D:\Data\Winds\era5flip\2020\era_wind_2020010400.nc`.
  3. Vùng kéo thả hiển thị đúng tên tệp `era_wind_2020010400.nc` cùng dung lượng `0.02 MB`. Nút *"Bắt đầu nạp dữ liệu"* chuyển sang trạng thái kích hoạt.
  4. Nhấp nút *"Bắt đầu nạp dữ liệu"*:
     - Request `POST /wind/api/v1/raster-granules/upload/` được gửi tới backend.
     - **Phản hồi từ Backend:** Trả về lỗi:
       > `"Tệp NetCDF thiếu tọa độ thời gian (một trong: valid_time, time)."`
     - UI hiển thị khung thông báo lỗi màu vàng cam với icon cảnh báo `fa-exclamation-triangle`.
     - Bảng `IngestionLog` trên Dashboard tự động ghi nhận lượt nạp mã `#2` với trạng thái "Thất bại".

#### Phân tích Nguyên nhân Kỹ thuật:
- Kiểm tra cấu trúc tệp `era_wind_2020010400.nc` bằng xarray:
  ```text
  Dimensions: (lat: 21, lon: 25)
  Coordinates: lat, lon
  Data variables: u10m, v10m, u100m, v100m
  Attrs: {}
  ```
- **Nguyên nhân:** Toàn bộ các tệp NetCDF trong thư mục `D:\Data\Winds\era5flip\2020\` là các tệp **lát cắt 2D đơn lẻ** theo từng mốc 6 giờ (`YYYYMMDDHH`). Trong file này:
  - Không chứa trục thời gian (chiều `time` hoặc `valid_time`). Thay vào đó, thời gian được lưu trong tên tệp: `2020010400` -> `2020-01-04 00:00:00 UTC`.
  - Các biến thành phần `u10m`, `v10m`, `u100m`, `v100m` không có thuộc tính `standard_name` mà tên biến đã phản ánh trực tiếp thành phần và độ cao.
  - Trong khi đó, service `apps/wind_raster/services/raster_ingest.py` hiện tại giả định tệp NetCDF phải chứa coordinate `time` hoặc `valid_time` bên trong file.

---

### 2.6. TC-06: Quản lý Trạm đo & Nhập số liệu Quan trắc (`#/admin/stations`)

- **Mục tiêu:** Kiểm tra CRUD trạm đo và luồng nhập số liệu hàng loạt (Dry-run & Import chính thức).
- **Các bước thực hiện:**
  1. **Thêm trạm quan trắc mới:**
     - Nhấp nút *" Thêm trạm quan trắc"*.
     - Điền thông tin:
       - Mã trạm: `BACH_LONG_VI`
       - Tên trạm: `Trạm Khí tượng Bạch Long Vĩ`
       - Loại trạm: `SURFACE`
       - Độ cao: `18.0` m
       - Kinh độ: `107.72`
       - Vĩ độ: `20.13`
     - Bấm *"Lưu trạm"*: Nhận thông báo xanh *"Lưu thông tin trạm thành công!"*.
     - Bảng danh sách trạm cập nhật lên 2 trạm (`PHU_QUY` và `BACH_LONG_VI`).
  2. **Thử nghiệm Nạp dữ liệu chuỗi thời gian (Tab 2: Nạp số liệu Excel/CSV):**
     - Chuẩn bị tệp kiểm thử `sample_obs_test.csv` chứa 3 mốc quan trắc của trạm `BACH_LONG_VI`.
     - Đưa tệp vào hệ thống: Vùng tải hiển thị tệp `sample_obs_test.csv (0.3 KB)`.
     - Bấm nút **" Kiểm tra cấu trúc (Dry-run)"**:
       - Backend xác thực tệp thành công, trả về xem trước 3 dòng dữ liệu.
       - Frontend hiển thị thông báo: *"Tệp hợp lệ! Tìm thấy tổng cộng 3 dòng dữ liệu"* cùng bảng xem trước đầy đủ các cột `station_code`, `obs_time`, `wind_speed`, `wind_dir`, `temp_2m`, `humidity`, `pressure`, `rain_24h`.
     - Bấm nút **" Nạp dữ liệu vào CSDL"**:
       - Backend thực thi `bulk_create` nạp vào database.
       - Nhận thông báo: *"Đã nạp 3 bản ghi quan trắc thành công."*
  3. **Kiểm tra đồng bộ trên Cổng Bản đồ Công cộng:**
     - Nhấp nút *"Quay lại"* để về trang công cộng `#/stations`.
     - Trạm `Trạm Khí tượng Bạch Long Vĩ (BACH_LONG_VI)` hiển thị ngay trên danh sách và bản đồ.
     - Dữ liệu quan trắc mới nhất hiển thị tức thì trên thẻ trạm:
       - Nhiệt độ: `23.90 °C`
       - Tốc độ gió: `10.10 m/s`
       - Hướng gió: `130.0°`
       - Độ ẩm: `88.00%`

---

### 2.7. TC-07: Quản lý Trang trại Gió & Tuabin (`#/admin/farms`)

- **Mục tiêu:** Kiểm tra giao diện quản lý trang trại điện gió và tuabin.
- **Các bước thực hiện:**
  1. Tab **"Trang trại Gió"**:
     - Hiển thị danh sách trang trại: Dự án `TRANG TRAI 1`, tên "Đông bắc", công suất `1000.00 MW`, trạng thái `OPERATING`.
     - Nút chỉnh sửa và xóa hoạt động bình thường.
  2. Tab **"Danh sách Tuabin"**:
     - Hiển thị bảng danh mục tuabin, sẵn sàng cho thao tác nạp tọa độ và công suất tuabin hàng loạt.

---

### 2.8. TC-08: Quản lý Bộ dữ liệu & Phân quyền (`#/admin/datasets`)

- **Mục tiêu:** Kiểm tra thông tin metadata bộ dữ liệu và ma trận phân quyền người dùng GeoNode.
- **Các bước thực hiện:**
  1. Tab **"Bộ dữ liệu"**:
     - Hiển thị bản ghi `ERA5`, phân loại `GRIDDED`, nguồn cung cấp `ECMWF / Copernicus CDS`, cấp truy cập `PUBLIC`, trạng thái "Hoạt động".
  2. Tab **"Biến dữ liệu"**:
     - Hiển thị danh mục các biến thành phần vector gió ($u, v$) và tốc độ gió tổng hợp.
  3. Tab **"Chính sách phân quyền"**:
     - Hiển thị ma trận phân quyền phân theo nhóm người dùng GeoNode Groups với 3 cột quyền hạn: [Xem] - [Truy vấn] - [Tải về].

---

## 3. Danh mục Ảnh Chụp Minh chứng Kiểm thử E2E (Evidence Screenshots)

Toàn bộ ảnh chụp màn hình trong quá trình Playwright tương tác thực tế được lưu trữ tại thư mục `tests/e2e_screenshots/`:

1. `01_admin_dashboard.png`: Giao diện Dashboard quản trị với 4 thẻ KPI và bảng IngestionLog.
2. `02_admin_cds_credentials.png`: Màn hình cấu hình tài khoản Copernicus CDS API.
3. `03_admin_cds_add_modal.png`: Form nhập thông tin khóa API CDS (Tên nhận diện, URL, Token).
4. `04_admin_rasters_view.png`: Màn hình nạp tệp dữ liệu lưới NetCDF và danh mục Granule.
5. `05_admin_rasters_file_selected.png`: Trạng thái chọn tệp `era_wind_2020010400.nc` từ thư mục `D:\Data\Winds\era5flip\2020`.
6. `06_admin_rasters_upload_error.png`: Thông báo lỗi thiếu tọa độ thời gian khi nạp tệp NetCDF đơn lẻ.
7. `07_admin_stations_list.png`: Màn hình quản lý danh mục trạm quan trắc.
8. `08_admin_stations_add_modal.png`: Form thêm trạm quan trắc mới `BACH_LONG_VI`.
9. `09_admin_stations_dryrun_preview.png`: Bảng xem trước dữ liệu kiểm tra cấu trúc (Dry-run) tệp CSV.
10. `10_admin_stations_import_success.png`: Thông báo nạp thành công 3 bản ghi số liệu quan trắc.
11. `11_admin_farms_view.png`: Màn hình quản lý trang trại điện gió và tuabin.
12. `12_admin_datasets_view.png`: Màn hình quản lý metadata bộ dữ liệu và ma trận phân quyền.
13. `13_public_stations_with_imported_data.png`: Cổng công cộng tự động hiển thị trạm mới và thông số gió vừa nạp.
14. `14_admin_guard_403_unauthenticated.png`: Màn hình 403 Forbidden chặn khách chưa đăng nhập.
15. `15_admin_guard_403_non_admin_user.png`: Màn hình 403 Forbidden chặn người dùng thông thường (`linh`).
16. `16_admin_dashboard_updated_state.png`: Dashboard cập nhật số lượng trạm (2 trạm) và nhật ký lỗi nạp tệp NetCDF.
17. `17_admin_cds_new_key_test_success.png`: Kiểm tra kết nối với API Key CDS mới thành công ("Kết nối CDS thành công").
18. `18_admin_cds_run_success.png`: Lịch sử tải CDS ghi nhận lượt chạy #2 trạng thái "SUCCESS" hoàn thành tải dữ liệu từ Copernicus CDS.
19. `19_admin_rasters_granule_indexed.png`: Danh mục Granule Raster tự động tạo bản ghi chỉ mục #1 từ tệp tải về từ CDS.
20. `20_admin_dashboard_cds_download_success.png`: Dashboard cập nhật KPI Lưới Raster NetCDF lên 1 và IngestionLog #3 thành công.

---

## 4. Đề xuất Giải pháp Kỹ thuật cho Dữ liệu Raster `D:\Data\Winds\era5flip\2020`

Để hệ thống WindHUB Admin nạp trực tiếp được các tệp NetCDF trong thư mục `D:\Data\Winds\era5flip\2020`, kiến nghị xem xét 2 hướng tiếp cận sau:

### Phương án 1 (Khuyến nghị): Cải tiến hàm Ingestion Backend (`apps/wind_raster/services/raster_ingest.py`)
- **Cách thức:**
  1. Khi hàm `_find_name(ds, TIME_NAMES, "thời gian")` không tìm thấy trục thời gian trong dataset, kiểm tra tên tệp xem có khớp mẫu regex `era_wind_(\d{10})\.nc` (dạng `YYYYMMDDHH`) hay không.
  2. Nếu có, tự động trích xuất chuỗi thời gian (ví dụ `2020010400` -> `2020-01-04 00:00:00 UTC`), mở rộng dataset thêm tọa độ `time` 1 mốc giờ (1D dimension).
  3. Bổ sung cơ chế nhận diện biến gió tự động: Nếu tên biến khớp `u\d+m` hoặc `v\d+m` (ví dụ `u10m`, `v10m`, `u100m`, `v100m`), tự động bắt cặp $u, v$ theo độ cao mà không bắt buộc phải có thuộc tính `standard_name` trong tệp.
- **Ưu điểm:** Hệ thống tương thích hoàn toàn với cả tệp NetCDF chuẩn từ Copernicus CDS lẫn các tệp NetCDF đã xử lý tiền kỳ (flipped/clipped) lưu cục bộ.

### Phương án 2: Script tiền xử lý gom tệp thành NetCDF chuỗi thời gian hoặc Zip đa tệp
- Viết một lệnh quản lý Django (ví dụ `python manage.py package_era5_rasters --input D:\Data\Winds\era5flip\2020 --output ...`) để ghép các tệp 6 giờ thành tệp NetCDF có trục thời gian chuẩn trước khi nạp qua giao diện Web.

---

> **Lưu ý tuân thủ quy tắc Repository:** Theo quy định tại `AGENTS.md`, AI không tự ý sửa đổi mã nguồn khi chưa có yêu cầu trực tiếp từ người dùng. Quý người dùng vui lòng phản hồi nếu đồng ý triển khai **Phương án 1** để nâng cấp backend hỗ trợ nạp dữ liệu từ thư mục `D:\Data\Winds\era5flip\2020`.
