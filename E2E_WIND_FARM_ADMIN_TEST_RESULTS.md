# BÁO CÁO KẾT QUẢ KIỂM THỬ E2E CHỨC NĂNG QUẢN TRỊ TRANG TRẠI GIÓ & TUABIN (WIND FARM ADMIN)

- **Thời gian thực hiện:** 14/11/2026
- **Công cụ kiểm thử:** Playwright E2E Automation (Playwright Browser Tooling & MCP Engine) kết hợp Django Test Runner
- **Đối tượng kiểm thử:** Phân hệ Quản lý Trang trại Gió & Tuabin (**WindHUB Admin**) tại route `http://localhost/wind-app/#/admin/farms`
- **Môi trường:** Docker Compose (Nginx cổng 80, Django `wind_be` cổng 8001, GeoNode cổng 8000, PostGIS DB, Celery Worker)
- **Thư mục ảnh chụp minh chứng:** `tests/e2e_screenshots/`

---

## 1. Tóm tắt Kết quả Kiểm thử (Executive Summary)

| STT | Kịch bản kiểm thử | Trạng thái Ban đầu | Trạng thái Sau Fix | Ghi chú & Đánh giá |
|:---:|:---|:---:|:---:|:---|
| **TC-WF-01** | **Bảo vệ Phân quyền & Route Guard Admin** (Khách, Regular User, Superuser) | **ĐẠT (PASS)** | **ĐẠT (PASS)** | Chặn 100% người dùng không có quyền Staff/Superuser; giao diện chuyển về trang 403 thân thiện; API backend DRF từ chối thao tác ghi (HTTP 403 Forbidden). |
| **TC-WF-02** | **Giao diện Quản lý Trang trại Gió** (Tab 1: Trang trại Gió) | **ĐẠT (PASS)** | **ĐẠT (PASS)** | Hiển thị bảng danh mục trang trại với đầy đủ các cột: Mã dự án, Tên trang trại, Chủ đầu tư, Công suất (MW), Trạng thái, Năm COD, Thao tác. |
| **TC-WF-03** | **Thêm mới Trang trại Gió** (`POST /wind/api/v1/farms/`) | **ĐẠT (PASS)** | **ĐẠT (PASS)** | Thêm thành công `BAC_LIEU_2` (49.2 MW, OPERATING); hiển thị thông báo thành công tức thì; bảng cập nhật lên 2 trang trại; tab cập nhật số lượng `(2)`. |
| **TC-WF-04** | **Chỉnh sửa Thông tin Trang trại Gió** (`PATCH /wind/api/v1/farms/{id}/`) | **ĐẠT (PASS)** | **ĐẠT (PASS)** | Modal nạp dữ liệu cũ chính xác; cập nhật tên thành *"Nhà máy Điện gió Bạc Liêu GĐ 2 (Mở rộng)"* và công suất lên `99.2 MW` thành công. |
| **TC-WF-05** | **Xóa Trang trại Gió** (`DELETE /wind/api/v1/farms/{id}/`) | **ĐẠT (PASS)** | **ĐẠT (PASS)** | Hộp thoại xác nhận hiển thị; thực thi lệnh xóa thành công HTTP 204 No Content; bảng tự động đồng bộ trở về 1 trang trại. |
| **TC-WF-06** | **Quản lý Tuabin & Bộ lọc theo Trang trại** (Tab 2: Danh sách Tuabin) | CẦN TỐI ƯU | **ĐẠT (PASS)** | Cột Công suất (MW) đã hiển thị chuẩn xác giá trị `4 MW`; bổ sung nút xóa tuabin trực tiếp trên bảng. |
| **TC-WF-07** | **Thêm Tuabin Gió mới qua Giao diện** (`POST /wind/api/v1/turbines/`) | KHÔNG ĐẠT (400) | **ĐẠT (PASS)** | Đã nâng cấp `WindTurbineSerializer`: tự động map alias, chuyển đổi `point_id`, trích xuất tọa độ từ `geom`, gán giá trị mặc định cho thông số khí tượng. Thêm tuabin thành công 100%! |
| **TC-WF-08** | **Đồng bộ Chỉ số Dashboard Admin & Bản đồ Công cộng** (`#/admin/dashboard`, `#/farms`) | **ĐẠT (PASS)** | **ĐẠT (PASS)** | Thẻ KPI Dashboard hiển thị đúng số lượng trang trại và số lượng tuabin; Cổng bản đồ công cộng đồng bộ dữ liệu thời gian thực. |

**Tỷ lệ đạt hiện tại:** **8 / 8 tiêu chí kiểm thử đạt tuyệt đối (100% PASS)**.

---

## 2. Chi tiết Kết quả Kiểm thử Từng Kịch bản

### 2.1. TC-WF-01: Kiểm tra Phân quyền 2 Tầng (Route Guard & Backend DRF)
- **Mục tiêu:** Đảm bảo chỉ người dùng có quyền Quản trị viên mới có thể truy cập `/#/admin/farms` và thực thi các thao tác ghi (POST/PATCH/DELETE).
- **Thực thi & Kết quả:**
  1. **Khách vãng lai / Người dùng chưa đăng nhập:** Truy cập trực tiếp `http://localhost/wind-app/#/admin/farms`. Giao diện kích hoạt `<AdminRouteGuard>`, hiển thị trang lỗi 403 thân thiện với biểu tượng khiên bảo mật và liên kết *"Đăng nhập tài khoản khác"* điều hướng tới `/account/login/?next=/wind-app/%23/admin/farms`.
  2. **Người dùng thông thường (`linh`):** Truy cập bị từ chối với thông báo: *"Bạn cần có đặc quyền Quản trị viên (Staff hoặc Superuser) để truy cập hệ thống quản trị WindHUB"*. Request `POST /wind/api/v1/farms/` trả về **HTTP 403 Forbidden**.
  3. **Quản trị viên (`admin` / `admin`):** Đăng nhập thành công, truy cập toàn diện module quản trị trang trại gió.
- **Minh chứng:** `wf_00_admin_guard_403.png`

---

### 2.2. TC-WF-02: Kiểm tra Giao diện Quản lý Trang trại Gió (Tab 1)
- **Mục tiêu:** Đánh giá tính hoàn thiện của bảng dữ liệu và thanh công cụ.
- **Thực thi & Kết quả:**
  1. Giao diện toàn màn hình chiếm trọn màn hình (`wind-admin-fullscreen-active`), ẩn thanh điều hướng GeoNode mặc định.
  2. Bảng dữ liệu hiển thị bản ghi mặc định `TRANG TRAI 1` (Tên: "Đông bắc", Công suất: `1000.00 MW`, Trạng thái: `OPERATING`).
  3. Cột "Thao tác" trang bị đầy đủ 2 nút: Chỉnh sửa (icon bút chì) và Xóa (icon thùng rác).
- **Minh chứng:** `wf_01_admin_farms_tab.png`

---

### 2.3. TC-WF-03: Thêm mới Trang trại Gió (Create Farm)
- **Mục tiêu:** Kiểm tra form nhập liệu và API `POST /wind/api/v1/farms/`.
- **Thực thi & Kết quả:**
  1. Nhấp nút *" Thêm trang trại gió"*: Modal hiển thị với các trường: Mã trang trại, Tên trang trại, Chủ đầu tư, Tổng công suất, Trạng thái (dropdown), Năm vận hành COD.
  2. Nhập thông số kiểm thử:
     - Mã trang trại: `BAC_LIEU_2`
     - Tên trang trại: `Nhà máy Điện gió Bạc Liêu Giai đoạn 2`
     - Chủ đầu tư: `Công ty TNHH Xây dựng - Thương mại - Du lịch Công Lý`
     - Tổng công suất: `49.2 MW`
     - Trạng thái: `Đang vận hành (OPERATING)`
     - Năm COD: `2026`
  3. Nhấp *"Lưu trang trại"*:
     - Backend xử lý thành công, trả về HTTP **201 Created**.
     - Modal tự động đóng, hiển thị banner thông báo xanh: *"Lưu thông tin trang trại gió thành công!"*.
     - Bảng dữ liệu bổ sung ngay lập tức dòng dữ liệu thứ 2 (`BAC_LIEU_2`). Tab tiêu đề cập nhật số lượng thành `Trang trại Gió (2)`.
- **Minh chứng:** `wf_03_admin_add_farm_modal.png`, `wf_04_admin_add_farm_filled.png`, `wf_05_admin_add_farm_inputs.png`, `wf_06_admin_farm_created_success.png`, `wf_07_admin_farms_list_with_new_farm.png`

---

### 2.4. TC-WF-04: Chỉnh sửa Thông tin Trang trại Gió (Update Farm)
- **Mục tiêu:** Kiểm tra nạp lại dữ liệu cũ vào form và API `PATCH /wind/api/v1/farms/{id}/`.
- **Thực thi & Kết quả:**
  1. Nhấp nút "Chỉnh sửa" tại dòng `BAC_LIEU_2`: Modal mở ra với tiêu đề *"Chỉnh sửa trang trại gió"* và toàn bộ dữ liệu hiện tại được điền sẵn chính xác vào các ô input.
  2. Thay đổi:
     - Tên trang trại: `Nhà máy Điện gió Bạc Liêu Giai đoạn 2 (Mở rộng)`
     - Tổng công suất: `99.2 MW`
  3. Nhấp *"Lưu trang trại"*:
     - Backend DRF trả về HTTP **200 OK**.
     - Dòng `BAC_LIEU_2` trên bảng cập nhật ngay lập tức: tên mới và công suất `99.20 MW`.
- **Minh chứng:** `wf_08_admin_edit_farm_modal.png`, `wf_09_admin_farm_updated.png`

---

### 2.5. TC-WF-05: Xóa Trang trại Gió (Delete Farm)
- **Mục tiêu:** Kiểm tra luồng xác nhận và API `DELETE /wind/api/v1/farms/{id}/`.
- **Thực thi & Kết quả:**
  1. Nhấp nút "Xóa" tại dòng `BAC_LIEU_2`: Trình duyệt bật hộp thoại xác nhận: *"Bạn có chắc chắn muốn xóa trang trại gió này?"*.
  2. Xác nhận xóa:
     - Backend DRF thực thi xóa trong CSDL và trả về HTTP **204 No Content**.
     - Giao diện hiển thị thông báo: *"Đã xóa trang trại gió thành công."*.
     - Bảng danh sách loại bỏ dòng `BAC_LIEU_2`, tab tiêu đề tự động cập nhật về `Trang trại Gió (1)`.
- **Minh chứng:** `wf_12_admin_farm_deleted_success.png`

---

### 2.6. TC-WF-06: Quản lý Tuabin & Bộ lọc theo Trang trại (Tab 2)
- **Mục tiêu:** Kiểm tra chuyển đổi tab, hiển thị danh mục tuabin, hiển thị công suất và nút xóa tuabin.
- **Thực thi & Kết quả:**
  1. Chuyển sang tab *"Danh sách Tuabin"*: Nút thêm ở góc trên chuyển thành *" Thêm tuabin gió"*.
  2. Dropdown *"Lọc theo trang trại:"* liệt kê đầy đủ các trang trại hiện có trong hệ thống kèm mã code.
  3. Đã khắc phục hiển thị cột `Công suất (MW)`: hiển thị chuẩn xác `4 MW`.
  4. Đã bổ sung cột `Thao tác` với nút "Xóa tuabin" (icon thùng rác).
- **Minh chứng:** `wf_02_admin_turbines_tab.png`, `wf_13_admin_turbines_list_filtered.png`, `wf_16_admin_turbine_created_fixed_success.png`

---

### 2.7. TC-WF-07: Thêm Tuabin Gió mới qua Giao diện Quản trị (ĐÃ KHẮC PHỤC THÀNH CÔNG)
- **Mục tiêu:** Thử nghiệm tạo mới và xóa một tuabin gió gắn với trang trại thông qua form UI.
- **Thực thi & Kết quả:**
  1. Nâng cấp `WindTurbineSerializer` backend:
     - Chuyển đổi mã `point_id` từ dạng chuỗi (`TB_4154` $\rightarrow$ `4154`).
     - Tự động trích xuất `latitude`, `longitude` từ chuỗi `geom`.
     - Tự động map alias `capacity_mw` $\rightarrow$ `predicted_power_mw` và `depth_m` $\rightarrow$ `sea_depth`.
     - Chuẩn hóa trạng thái `"OPERATING"` $\rightarrow$ `"OPERATIONAL"`.
     - Cung cấp giá trị mặc định hợp lý cho các trường khí quyển khi khai báo thủ công.
  2. Thực nghiệm Playwright trên trình duyệt:
     - Nhấp nút *" Thêm tuabin gió"*. Điền tọa độ Lon `105.748`, Lat `9.245`, Công suất `4.0 MW`.
     - Bấm *"Lưu tuabin"*:
       - **Backend phản hồi:** HTTP **201 Created**.
       - **Frontend hiển thị:** Banner xanh *"Thêm tuabin gió thành công!"*.
       - **Bảng dữ liệu:** Thêm ngay lập tức bản ghi tuabin `#4154`, Công suất `4 MW`, Loại móng `Móng đơn`, Độ sâu `15 m`, Trạng thái `OPERATIONAL`.
     - Bấm nút "Xóa" tại dòng tuabin: Hộp thoại xác nhận hiển thị $\rightarrow$ Backend trả về HTTP **204 No Content** $\rightarrow$ Bảng cập nhật thành *"Chưa có tuabin nào được ghi nhận."* và thông báo *"Đã xóa tuabin thành công."*.
- **Minh chứng:** `wf_16_admin_turbine_created_fixed_success.png`, `wf_17_admin_turbine_deleted_success.png`

---

### 2.8. TC-WF-08: Đồng bộ Chỉ số Dashboard Admin & Bản đồ Công cộng
- **Mục tiêu:** Kiểm tra tính toàn vẹn và đồng bộ dữ liệu đa phân hệ.
- **Thực thi & Kết quả:**
  1. **Dashboard Admin (`/#/admin/dashboard`):** Thẻ KPI *"Trang trại gió"* hiển thị chính xác `1` trang trại và `1 tuabin đã định vị`. Nút thao tác nhanh *"Thêm trang trại gió"* điều hướng chuẩn xác về `/#/admin/farms`.
  2. **Bản đồ Công cộng (`/#/farms`):** Hiển thị bản đồ GIS tương tác, danh sách trang trại và tuabin đồng bộ tức thì không bị lỗi tải.
- **Minh chứng:** `wf_14_public_wind_farms_map.png`, `wf_15_admin_dashboard_kpi_farms_turbines.png`

---

## 3. Danh mục Minh chứng Kiểm thử E2E (Evidence Screenshots)

Toàn bộ ảnh chụp màn hình trong quá trình Playwright tương tác thực tế được lưu tại thư mục `tests/e2e_screenshots/`:

| Tên tệp ảnh | Nội dung minh chứng |
|:---|:---|
| `wf_00_admin_guard_403.png` | Màn hình 403 Forbidden bảo vệ phân quyền Admin khi chưa đăng nhập. |
| `wf_01_admin_farms_tab.png` | Giao diện Quản lý Trang trại Gió (Tab 1) với danh sách hiện tại. |
| `wf_02_admin_turbines_tab.png` | Giao diện Danh sách Tuabin (Tab 2) trước khi có tuabin. |
| `wf_03_admin_add_farm_modal.png` | Form Modal Thêm mới Trang trại Gió. |
| `wf_04_admin_add_farm_filled.png` | Form Thêm trang trại gió đã điền đầy đủ các thông số kỹ thuật. |
| `wf_05_admin_add_farm_inputs.png` | Kiểm tra chi tiết các trường input trước khi bấm Lưu. |
| `wf_06_admin_farm_created_success.png` | Trạng thái tạo trang trại thành công, thông báo xanh hiển thị. |
| `wf_07_admin_farms_list_with_new_farm.png` | Bảng danh sách trang trại cập nhật lên 2 dự án (`BAC_LIEU_2`). |
| `wf_08_admin_edit_farm_modal.png` | Modal Chỉnh sửa trang trại gió với dữ liệu cũ được điền sẵn. |
| `wf_09_admin_farm_updated.png` | Trang trại sau khi cập nhật công suất lên 99.2 MW thành công. |
| `wf_10_admin_add_turbine_modal.png` | Form Modal Thêm mới Tuabin gió. |
| `wf_11_admin_add_turbine_validation_error.png` | Minh chứng lỗi 400 Bad Request ban đầu do sai lệch hợp đồng API. |
| `wf_12_admin_farm_deleted_success.png` | Thông báo xóa trang trại thành công sau khi xác nhận hộp thoại. |
| `wf_13_admin_turbines_list_filtered.png` | Bảng tuabin sau khi lọc theo trang trại `TRANG TRAI 1`. |
| `wf_14_public_wind_farms_map.png` | Giao diện Bản đồ Năng lượng Gió công cộng đồng bộ dữ liệu. |
| `wf_15_admin_dashboard_kpi_farms_turbines.png` | Dashboard Admin cập nhật KPI: 1 trang trại, 1 tuabin đã định vị. |
| `wf_16_admin_turbine_created_fixed_success.png` | **Trạng thái Thêm mới Tuabin thành công sau khi sửa lỗi (Hiển thị đầy đủ thông số và nút Thao tác).** |
| `wf_17_admin_turbine_deleted_success.png` | **Thông báo Xóa tuabin thành công trực tiếp từ giao diện Admin.** |
