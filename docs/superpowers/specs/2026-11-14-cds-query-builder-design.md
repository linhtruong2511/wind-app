# Thiết kế Tính năng CDS Query Builder & Auto-Ingestion cho Quản trị viên WindHUB

- **Ngày tạo**: 2026-11-14
- **Trạng thái**: Đã phê duyệt (Approved)
- **Tác giả / Nhóm phụ trách**: Wind Management Engineering Team
- **Phạm vi**: Ứng dụng Quản trị CDS (`wind_cds`), Lập chỉ mục dữ liệu lưới (`wind_raster`), và Giao diện Web Portal (`frontend`)

---

## 1. Mục tiêu & Bối cảnh

### 1.1. Bối cảnh
Hệ thống hiện tại đã có ứng dụng `wind_cds` hỗ trợ lưu trữ khóa xác thực Copernicus CDS (`CDSCredential`), khai báo tác vụ tải (`CDSDownloadJob`) và theo dõi tiến trình chạy (`CDSJobRun`). Tuy nhiên, giao diện tạo tác vụ trong `AdminCdsRoute.jsx` còn thô sơ (chỉ có các ô nhập chuỗi đơn giản, chưa cho phép tùy biến chi tiết biến dữ liệu, dải thời gian hay phạm vi không gian địa lý).

### 1.2. Mục tiêu
Nâng cấp trải nghiệm quản trị viên với công cụ **CDS Query Builder Wizard** trực quan tương tự như cổng thông tin Copernicus Climate Data Store (CDS), kết hợp khả năng tự động hóa cao:
1. Cho phép Admin trực quan chọn Dataset ERA5, nhóm biến khí tượng/trắc gió, dải ngày và mốc giờ quan sát.
2. Tích hợp bản đồ thu nhỏ tương tác (**OpenLayers Mini-Map**) cho phép kéo vẽ hoặc chọn preset vùng bounding box (Việt Nam & Biển Đông, Toàn cầu...).
3. Tự động hóa hoàn toàn quy trình tải NetCDF từ CDS và kích hoạt pipeline **Auto-Ingestion** để bóc tách granules theo mốc giờ, lập chỉ mục không gian và đồng bộ biến vào `Dataset` chỉ định.

---

## 2. Kiến trúc Tổng thể & Luồng Dữ liệu (Architecture & Data Flow)

```
[Admin UI: CDSQueryBuilderModal]
       │
       ▼ (1) Gửi POST /wind/api/v1/cds-jobs/ (payload có run_immediately: true)
[Django API Gateway (wind_cds)]
       │
       ▼ (2) Lưu bản ghi CDSDownloadJob (chế độ ONCE / RECURRING)
       ▼ (3) Đẩy task vào hàng đợi Celery `run_cds_download_job.delay(job.id)`
[Celery Worker (wind_worker)]
       │
       ▼ (4) Giải mã API token từ DB & khởi tạo cdsapi.Client
       ▼ (5) Gửi request tải file NetCDF về thư mục đệm `/usr/src/apps/media/wind_uploads/temp/`
       ▼ (6) Gọi hàm `ingest_netcdf(temp_path, job.dataset)`
             ├── Đọc metadata và các chiều không gian (lat, lon, time) bằng xarray
             ├── Tự động đồng bộ các biến NetCDF (u10, v10, t2m...) vào `DatasetVariable`
             ├── Tách từng mốc giờ thành file granule riêng lẻ, lập chỉ mục `RasterGranuleIndex`
             └── Ghi nhận `IngestionLog` (số granules nạp, trạng thái SUCCESS)
       │
       ▼ (7) Xóa file NetCDF tạm, chuyển trạng thái `CDSJobRun` và `CDSDownloadJob` sang SUCCESS
[Admin UI: Tab Lịch sử tải]
       │
       ▲ Tự động refresh cập nhật tiến trình và số lượng granules đã sẵn sàng
```

---

## 3. Thiết kế Giao diện Người dùng (Frontend: `CDSQueryBuilderModal.jsx`)

Component `CDSQueryBuilderModal.jsx` được thiết kế dưới dạng **Modal Wizard 4 bước** với thanh điều hướng Stepper:

### 3.1. Thanh Stepper (Stepper Header)
- 4 bước có số thứ tự và icon trực quan:
  - `Bước 1: Cấu hình chung` $\rightarrow$ `Bước 2: Biến dữ liệu` $\rightarrow$ `Bước 3: Thời gian` $\rightarrow$ `Bước 4: Tọa độ & Bản đồ`
- Bước hiện tại highlight màu xanh chủ đạo (`#0284c7`), bước đã xong có tick xanh (`#10b981`).

### 3.2. Nội dung các bước của Wizard:

#### Bước 1: Cấu hình chung & Bộ dữ liệu
- **Tên tác vụ** (Bắt buộc): Chuỗi nhận diện tác vụ (VD: *Tải gió ERA5 Nam Trung Bộ T1/2024*).
- **Tài khoản xác thực CDS** (Bắt buộc): Dropdown chọn từ danh sách `CDSCredential` đang hoạt động (`is_active=true`).
- **Mã Dataset Copernicus**: 
  - Dropdown các bộ dữ liệu phổ biến: `reanalysis-era5-single-levels` (mặc định), `reanalysis-era5-land`.
  - Tùy chọn *Khác...*: Cho phép nhập text tự do dataset ID Copernicus.
- **Bộ dữ liệu đích trong hệ thống (`Dataset`)**:
  - Dropdown chọn `Dataset` thuộc danh mục dữ liệu lưới (`GRIDDED`). Granules và biến tải về sẽ tự động nạp vào bộ dữ liệu này.

#### Bước 2: Chọn Biến dữ liệu (Variables Selection)
- Lấy danh mục tự động từ endpoint `GET /wind/api/v1/cds-jobs/catalog/`.
- Hiển thị theo 4 thẻ chuyên đề:
  1. 🌀 **Trường gió & Tốc độ gió**: `10m U wind (u10)`, `10m V wind (v10)`, `10m Wind speed (si10)`, `10m Wind gust (fg10)`, `100m U wind (u100)`, `100m V wind (v100)`.
  2. 🌡️ **Nhiệt độ & Độ ẩm**: `2m Temperature (t2m)`, `2m Dewpoint (d2m)`, `Skin Temperature (skt)`.
  3. ⏱️ **Khí áp**: `Mean sea level pressure (msl)`, `Surface pressure (sp)`.
  4. 🌧️ **Mưa & Mây**: `Total precipitation (tp)`, `Total cloud cover (tcc)`.
- Thanh công cụ chọn nhanh:
  - Nút *"Mặc định trắc gió"* (tự động chọn u10, v10, u100, v100).
  - Nút *"Chọn tất cả gió"* / *"Bỏ chọn tất cả"*.
- Badge thống kê tổng số biến đang chọn: `Đã chọn: X biến`.

#### Bước 3: Khoảng thời gian (Temporal Extent)
- **Chế độ thực thi**:
  - **Một lần (`ONCE`)**:
    - **Dải ngày**: Input *Từ ngày* $\rightarrow$ *Đến ngày* (HTML5 date picker).
    - **Mốc giờ quan sát**: Nút chọn nhanh:
      - *"24 giờ (mỗi giờ)"*: Đủ 24 mốc từ `00:00` đến `23:00`.
      - *"Mỗi 3 giờ"*: `00:00`, `03:00`, `06:00`, `09:00`, `12:00`, `15:00`, `18:00`, `21:00`.
      - *"Giờ chính (synoptic)"*: `00:00`, `06:00`, `12:00`, `18:00`.
      - Hoặc click checkbox từng mốc giờ cụ thể.
    - Hiển thị thông báo dự tính: `Ước tính: N ngày x M mốc giờ = K granules`.
  - **Định kỳ (`RECURRING`)**:
    - Checkbox *"Tự động tải số liệu mới nhất đến hôm nay"* (`auto_latest=true`).
    - Nhập số ngày trễ số liệu (`lag_days`, mặc định 5 ngày).

#### Bước 4: Phạm vi Không gian với OpenLayers Mini-Map
- Tích hợp component bản đồ OpenLayers (`ol/Map`, `ol/View`, `ol/layer/Tile`, `ol/source/OSM`, `ol/interaction/DragBox`).
- **Tương tác trực quan hai chiều**:
  - Giữ phím Shift hoặc bật chế độ *"Vẽ khung"*, rê chuột kéo hình chữ nhật trên bản đồ.
  - Khi vẽ xong, hình chữ nhật hiển thị viền xanh và tự động điền tọa độ vào 4 ô: **Bắc (North)**, **Tây (West)**, **Nam (South)**, **Đông (East)**.
  - Ngược lại: Khi Admin chỉnh sửa số trong 4 ô, bản đồ tự động vẽ lại khung và di chuyển/zoom tới vùng tương ứng.
- **Nút Preset nhanh**:
  - *"🇻🇳 Việt Nam & Biển Đông"*: `[24.0, 102.0, 8.0, 118.0]`.
  - *"🌐 Toàn cầu"*: `[90.0, -180.0, -90.0, 180.0]`.

### 3.3. Footer điều khiển & Các nút Hành động
- Nút *"Quay lại"* và *"Tiếp theo"*.
- Ở bước 4, hiển thị 2 nút hoàn tất:
  - 💾 **"Lưu tác vụ"**: Lưu cấu hình job vào DB (cho việc chạy sau hoặc chạy định kỳ Celery Beat).
  - 🚀 **"Lưu & Kích hoạt tải ngay"**: Lưu cấu hình $\rightarrow$ gọi API kích hoạt Celery Worker tải và nạp tự động $\rightarrow$ đóng modal, hiển thị toast thông báo và chuyển tab sang *Lịch sử tải*.

---

## 4. Chuẩn hóa Cấu trúc `request_params` cho CDS API

Frontend đóng gói cấu trúc tham số tuân thủ chuẩn `cdsapi` của Copernicus:
```json
{
  "product_type": ["reanalysis"],
  "variable": [
    "10m_u_component_of_wind",
    "10m_v_component_of_wind",
    "100m_u_component_of_wind",
    "100m_v_component_of_wind"
  ],
  "year": ["2024"],
  "month": ["01"],
  "day": ["01", "02", "03", "04", "05"],
  "time": [
    "00:00", "03:00", "06:00", "09:00", 
    "12:00", "15:00", "18:00", "21:00"
  ],
  "area": [24.0, 102.0, 8.0, 118.0],
  "data_format": "netcdf",
  "download_format": "unarchived"
}
```

---

## 5. Thiết kế Backend & Pipeline Tự Động Nạp Dữ Liệu

### 5.1. ViewSet `CDSDownloadJobViewSet`
- Mở rộng xử lý khi tạo tác vụ:
  ```python
  def perform_create(self, serializer):
      user = self.request.user if self.request.user.is_authenticated else None
      job = serializer.save(created_by=user)
      sync_periodic_task(job)
      
      run_immediately = self.request.data.get("run_immediately", False)
      if run_immediately:
          run_cds_download_job.delay(job.id)
  ```

### 5.2. Pipeline Ingestion (`apps/wind_raster/services/raster_ingest.py`)
Hàm `ingest_netcdf(path, dataset)` xử lý tự động:
1. Mở file NetCDF gộp (`_open_merged`), xác định các trục tọa độ `time`, `lat`, `lon`.
2. Duyệt qua tất cả các biến dữ liệu dạng lưới 2D/3D.
3. Đồng bộ vào bảng `wind_dataset_variables` (`DatasetVariable`) nếu biến chưa tồn tại trong `dataset`.
4. Tách từng mốc thời gian thành file `.nc` riêng lẻ trong thư mục media, tính toán đa giác `footprint` (SRID 4326), upsert vào `RasterGranuleIndex`.
5. Cập nhật `IngestionLog` với trạng thái `SUCCESS` và số lượng granules đã nạp.

---

## 6. Xử lý Ngoại lệ & Giám sát Lỗi

### 6.1. Client-side Validation (Frontend)
- Kiểm tra tính hợp lệ của dải ngày: `startDate <= endDate`.
- Kiểm tra Bounding Box: $North > South$ và $-90 \le lat \le 90$, $-180 \le lon \le 180$.
- Bắt buộc chọn ít nhất 1 biến dữ liệu trước khi chuyển bước.

### 6.2. Server & Worker Exception Handling
Dịch các mã lỗi phổ biến từ máy chủ ECMWF/Copernicus thành thông báo thân thiện bằng tiếng Việt trong `tasks.py`:
- **403 Forbidden**: Thông báo tài khoản chưa đồng ý Điều khoản sử dụng ERA5 trên cổng CDS.
- **400 Bad Request**: Bóc tách ngày mới nhất hiện có từ thông báo lỗi của CDS để hướng dẫn Admin điều chỉnh khoảng ngày.
- **401 Unauthorized**: Thông báo khóa API bị sai hoặc hết hạn.

### 6.3. Polling trạng thái trên Giao diện
- Khi kích hoạt tải ngay, giao diện tự động bật cờ auto-refresh (mỗi 5s gọi `getCDSJobRuns()`) ở tab *Lịch sử tải* cho đến khi tác vụ hoàn thành.

---

## 7. Kế hoạch Kiểm thử (Testing Strategy)

| Tầng kiểm thử | Kịch bản kiểm thử | Kết quả mong đợi |
| :--- | :--- | :--- |
| **Unit Test (Backend)** | Phân rã date range thành mảng `year`, `month`, `day`, `time` | Mảng chuẩn format chuỗi 2 chữ số (`01` thay vì `1`) |
| **Integration Test** | Tạo job kèm `run_immediately=true` qua API | Trả về 201 Created, task Celery được enqueue thành công |
| **Ingestion Pipeline Test** | Giả lập nạp NetCDF ERA5 mẫu với biến gió 10m/100m | `DatasetVariable` tự động được tạo, `RasterGranuleIndex` có bản ghi mới |
| **Frontend E2E Test (Playwright)** | Mở modal $\rightarrow$ Chọn biến $\rightarrow$ Chọn ngày $\rightarrow$ Kéo khung bản đồ $\rightarrow$ Lưu & Chạy ngay | Tạo job thành công, hiển thị trong danh sách và tab Lịch sử tải |

---

## 8. Kết luận & Các bước Tiếp theo
Tài liệu thiết kế đã xác định đầy đủ các giao diện, cấu trúc dữ liệu, cơ chế nạp tự động và xử lý lỗi. Sau khi được phê duyệt, bước tiếp theo là chuyển sang lập Kế hoạch Triển khai (Implementation Plan) chi tiết.
