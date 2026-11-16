# Thiết kế: phân quyền bộ dữ liệu và nạp tệp lưới từ máy

Ngày: 2026-11-16

## Bối cảnh

Hai vấn đề ở khu vực quản trị dữ liệu lưới:

1. **Nạp tệp từ máy báo lỗi khó hiểu.** Tệp WRF 3km (ví dụ `D:\Data\Winds\wrf3km_cut\2021\2021010100.nc`) chỉ có tọa độ `lat`, `lon` và các biến `u10m`, `v10m`, `u100m`, `v100m`. Tệp không có trục thời gian, mốc giờ nằm trong tên tệp. `ingest_netcdf` (`apps/wind_raster/services/raster_ingest.py`) chỉ tìm tọa độ `time` hoặc `valid_time` nên báo lỗi thiếu tọa độ thời gian. Ngoài ra `_wind_role` chỉ ghép u/v theo `standard_name` hoặc `long_name`, mà tệp này không có, nên dù qua được bước thời gian vẫn không tạo được biến "Gió 10m".
2. **Giao diện và phân quyền bộ dữ liệu không khớp thực tế.** Chỉ dữ liệu lưới dùng `Dataset`, nhưng form cho chọn phân loại trạm quan trắc, vệ tinh, hiện tượng cực đoan. Chính sách phân quyền nằm ở tab riêng, chỉ đọc. `access_level` và `DatasetAccessPolicy` chưa được dùng để chặn ai.

## Phần A. Nạp tệp từ máy

### Xác định mốc thời gian của từng tệp, theo thứ tự

1. Tọa độ `time` hoặc `valid_time` trong tệp, giữ nguyên hành vi hiện tại.
2. Tên tệp, nhận các dạng: `2021010100`, `20210101_00`, `2021-01-01_00`, `wrfout_d01_2021-01-01_00:00:00`, có thể kèm phút. Mốc giờ hiểu là UTC.
3. Nếu không có, trả lỗi: *Không xác định được thời gian của tệp {tên}. Hãy đặt tên tệp theo dạng 2021010100.nc (năm, tháng, ngày, giờ).*

Logic nhận dạng tên tệp nằm trong một hàm riêng, có test độc lập.

### Nạp nhiều tệp bằng zip

- Mỗi tệp `.nc` trong zip tự xác định mốc thời gian riêng, sau đó được thêm trục thời gian rồi ghép: cùng mốc thì gộp biến, khác mốc thì nối theo thời gian. Không dùng `xr.merge(compat="override")` cho tệp không có trục thời gian vì sẽ ghi đè lẫn nhau.
- Kiểm tra mọi tệp trước khi ghi bất cứ thứ gì. Nếu có tệp lỗi thì không ghi gì, thông báo liệt kê tối đa 5 tệp lỗi kèm lý do.
- Thông báo thành công nêu số mốc giờ, khoảng thời gian UTC và các biến đã nhận.

### Ghép cặp gió u/v

Giữ cách cũ (`standard_name`, `long_name`) làm ưu tiên. Dự phòng theo tên biến: `u<độ cao>m` với `v<độ cao>m` (ví dụ `u10m`, `v10m`) thành biến "Gió <độ cao>m", đơn vị m/s.

### Rủi ro cần kiểm tra khi triển khai

Nạp 1460 tệp trong một request có thể vượt thời gian chờ của nginx hoặc uwsgi. Nếu vượt, chuyển việc nạp sang chạy nền và hiển thị tiến độ.

## Phần B. Trang bộ dữ liệu

- Bỏ tab "Chính sách phân quyền".
- Bỏ trường "Phân loại" khỏi form. Cột `category` trong cơ sở dữ liệu giữ nguyên, không cần migration. Bộ dữ liệu tạo mới từ giao diện mặc định là lưới.
- Form có mục **Ai được xem**: Công khai, Cần đăng nhập, Chọn nhóm. Với "Chọn nhóm", hiện danh sách nhóm kèm hai ô "Được xem" và "Được tải về". Quyền xem và truy vấn gộp làm một ở giao diện.
- API lưu bộ dữ liệu nhận danh sách chính sách theo nhóm và thay thế toàn bộ chính sách hiện có của bộ dữ liệu đó trong một lần lưu.
- Tab "Biến dữ liệu" giữ lại, chỉ đọc.
- Chữ trên giao diện theo quy ước trong `AGENTS.md`: không dùng thuật ngữ kỹ thuật, viết hoa kiểu câu, ít ngoặc đơn.

## Phần C. Áp dụng phân quyền thật

Các API dữ liệu lưới (danh sách granule, truy vấn điểm, dữ liệu bản đồ, tải về) chỉ trả dữ liệu của bộ dữ liệu mà người dùng được phép:

| Cấp | Điều kiện xem | Điều kiện tải về |
|---|---|---|
| Công khai | mọi người | mọi người |
| Cần đăng nhập | người đã đăng nhập | người đã đăng nhập |
| Chọn nhóm | người thuộc nhóm có quyền xem | người thuộc nhóm có quyền tải về |

Admin luôn có đầy đủ quyền. Logic đặt ở một hàm dùng chung trong `wind_core/access.py`, để các view gọi lại.

Các endpoint được chặn: danh sách và chi tiết bộ dữ liệu, biến dữ liệu, danh sách granule, tổng hợp, truy vấn điểm và dữ liệu lưới. API chính sách (`dataset-access-policies`) chuyển thành chỉ dành cho quản trị viên vì trước đó khách đọc được.

Hiện repo chưa có API tải dữ liệu lưới nào, nên quyền "Được tải về" được lưu và có hàm `can_download_dataset` sẵn nhưng chưa có chỗ nào chặn thực tế. Cần bổ sung khi có API tải về.

Bộ dữ liệu hiện có mặc định `INTERNAL` (cần đăng nhập) và trước đây không được áp dụng. Sau thay đổi này admin cần đặt lại "Công khai" cho các bộ dữ liệu muốn hiện trên trang công khai.

## Kiểm thử

- Nhận dạng thời gian từ tên tệp: từng dạng tên, tên sai dạng.
- Nạp tệp không có trục thời gian và tên hợp lệ.
- Nạp zip nhiều tệp: đủ số mốc giờ, một tệp lỗi thì không ghi gì.
- Ghép cặp u/v theo tên biến.
- Các mức phân quyền cho từng endpoint raster, với khách, người đăng nhập, thành viên nhóm, admin.
- Lưu bộ dữ liệu kèm danh sách chính sách nhóm.

Test đặt cạnh `apps/wind_raster/tests.py` và `apps/wind_core/tests.py`, chạy trong container bằng `bash test.sh`.

## Ngoài phạm vi

- Xóa cột `category` hoặc gộp bảng trạm quan trắc vào `Dataset`.
- Cho sửa biến dữ liệu thủ công.
