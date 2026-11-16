# Hướng dẫn nạp dữ liệu demo

Bản có hình minh họa: `huong-dan-nap-du-lieu-demo.html`, mở bằng trình duyệt.

## 1. Cập nhật và chạy lại dự án

Cần Docker Desktop, Git, Node.js và đã từng chạy dự án trên máy này. Chạy lần đầu thì làm theo mục Quick Docker Start trong `README.md`.

```bash
git pull origin main

# Dựng lại giao diện, phần này không nằm trong git
cd frontend
npm install
npm run build
cd ..

docker compose up -d --build
docker compose restart wind_be wind_worker   # áp dụng thay đổi cơ sở dữ liệu mới
docker compose ps                            # các dịch vụ phải ở trạng thái Up hoặc healthy
```

Chờ 1 đến 2 phút, mở `http://localhost/wind-app/`, đăng nhập `admin` với mật khẩu là `ADMIN_PASSWORD` trong tệp `.env`. Mở `http://localhost/wind-app/#/admin/dashboard`, thấy mục **Dữ liệu lưới** ở menu bên trái là đã chạy đúng.

## 2. Chuẩn bị dữ liệu

| Tệp | Nội dung | Giải nén? |
| --- | --- | --- |
| `era5_demo.zip` | Gió ERA5 năm 2021, 1455 mốc giờ | Không |
| `wrf3km_demo_data.zip` | Gió WRF 3 km từ 11/05 đến 31/12/2021, 933 mốc giờ | Không |
| `danh_sach_tram.csv` | Danh sách 172 trạm đo | Không |
| `station_observation.zip` | Số liệu quan trắc 2000 đến 12/2025, mỗi trạm một tệp | **Có** |

## 3. Nạp dữ liệu

Làm đúng thứ tự. Phải có trạm trước khi nạp số liệu quan trắc.

**Bước 1. Tạo hai bộ dữ liệu.** Vào **Bộ dữ liệu và phân quyền**, bấm **Tạo bộ dữ liệu mới**, điền rồi bấm **Lưu bộ dữ liệu**. Ở mục **Ai được xem** chọn **Công khai**.

| Ô nhập | Lần 1 | Lần 2 |
| --- | --- | --- |
| Mã định danh | `ERA5_DEMO` | `WRF3KM_DEMO` |
| Tên hiển thị | Gió ERA5 năm 2021 | Gió WRF 3 km năm 2021 |

**Bước 2. Nạp dữ liệu lưới.** Vào **Dữ liệu lưới**. Chọn bộ dữ liệu, kéo thả tệp `.zip` tương ứng, bấm **Bắt đầu nạp dữ liệu** và chờ thông báo xanh. Làm cho ERA5 rồi WRF. Chọn đúng bộ trước khi tải tệp. Tệp WRF có thể mất vài phút.

**Bước 3. Nhập danh sách trạm.** Vào **Trạm đo và quan trắc**, tab **Danh sách trạm đo**, bấm **Nhập từ tệp**, chọn `danh_sach_tram.csv`, kiểm tra rồi bấm **Nhập 172 trạm**.

**Bước 4. Nạp số liệu quan trắc.** Giải nén `station_observation.zip`. Mỗi lần nạp một tệp, bản demo chỉ cần 3 đến 5 trạm, ví dụ `48-01_Muong_Te.csv`, `48-02_Sin_Ho.csv`, `48-03_Tam_Duong.csv`, `48-25_Moc_Chau.csv`, `48917_Phu_Quoc.csv`. Với mỗi tệp, vào tab **Nạp số liệu**: **Chọn tệp từ máy tính**, **Kiểm tra cấu trúc**, rồi **Nạp dữ liệu**.

**Không nạp `mẫu chuẩn.csv`.** Đó là số liệu trạm Muong Te ghi mã khác, sẽ tạo trạm trùng.

Kiểm tra kết quả ở tab **Kho dữ liệu**.

## 4. Lộ trình demo, khoảng 10 phút

Thoát trang quản trị bằng nút **Quay lại**, hoặc mở `http://localhost/wind-app/`.

1. **Trang chủ, 1 phút.** Giới thiệu ba nhóm dữ liệu: trạm quan trắc, dữ liệu lưới, thống kê.
2. **Bản đồ trạm, 2 phút.** Tìm một trạm, bấm **Chi tiết** của Muong Te để xem biểu đồ và bảng số liệu, đổi chỉ tiêu gió, nhiệt độ.
3. **Bản đồ gió lưới, 3 phút.** Chọn ERA5, ngày 11/05/2021 lúc 12:00, bấm phát. Đổi lớp gió 10 m và 100 m. Đổi sang WRF với cùng mốc giờ để so độ chi tiết.
4. **Thống kê, 2 phút.** Chọn vài trạm đã nạp, bấm **Cập nhật số liệu**, đi qua bốn tab: tổng quan, so sánh nhiều trạm, hoa gió, báo cáo.
5. **Phân quyền, 2 phút.** Trong **Bộ dữ liệu và phân quyền**, đổi một bộ từ **Công khai** sang **Cần đăng nhập**, mở cửa sổ ẩn danh để thấy bộ đó không còn hiện. Làm xong đặt lại như cũ.

Mục **Trang trại và tiềm năng gió** cần dữ liệu riêng, không có trong bộ demo.

## 5. Gặp lỗi

| Hiện tượng | Cách xử lý |
| --- | --- |
| Nạp lưới báo lỗi | Hệ thống không ghi gì khi có lỗi. Đọc thông báo rồi nạp lại. |
| Nạp lưới quá lâu hoặc bị ngắt | Chia `.zip` theo tháng rồi nạp lần lượt vào cùng bộ. Nạp lại mốc giờ cũ sẽ cập nhật, không trùng. |
| Danh sách bộ dữ liệu trống | Quay lại bước 1. |
| Trạm không có số liệu | Kiểm tra đã nhập danh sách trạm ở bước 3. |
| Giao diện không đổi sau cập nhật | Chạy lại `npm run build` rồi tải lại trang bằng Ctrl + F5. |
| Nạp lại số liệu một trạm | Tab **Kho dữ liệu**, xóa năm cần nạp lại rồi nạp lại tệp. |
