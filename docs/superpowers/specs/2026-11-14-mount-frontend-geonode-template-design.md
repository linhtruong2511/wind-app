# Thiết Kế Chi Tiết: Cấu Hình Frontend & Tích Hợp Vào Django Template Của GeoNode

- **Ngày tạo**: 2026-11-14
- **Trạng thái**: Đã phê duyệt (Approved)
- **Tác giả**: Antigravity & User

---

## 1. Bối cảnh & Mục tiêu (Context & Objectives)

### 1.1 Bối cảnh
Hệ thống quản lý dữ liệu gió bao gồm:
- **Backend**: Micro-apps Django chuyên biệt (`apps/`) và GeoNode Project wrapper (`src/geonode_project/`).
- **Frontend**: Ứng dụng Single Page Application (SPA) viết bằng React 18, Vite, OpenLayers, Plotly (`frontend/`).
- **Bản mẫu chuẩn trước đây**: Nằm tại `D:\GeonodeBK\wind_management_app\wind_management`, đã có hệ thống template MapStore hoàn thiện với thanh menu điều hướng và giao diện trang chủ tùy biến.

### 1.2 Mục tiêu cốt lõi
1. **Mount Frontend vào Template GeoNode**:
   - Nhúng ứng dụng React SPA vào template `wind_management/app.html` mở rộng từ `page.html` của GeoNode MapStore Client.
   - Nạp context người dùng (`data-user`, `data-is-staff`, `data-is-authenticated`, `data-api-base`) vào DOM element `#wind-app-root`.
2. **Cơ Chế Nạp Song Song (Dual-Mode Loading)**:
   - **Dev Mode**: Kết nối trực tiếp tới Vite Dev Server (`http://localhost:5173`) với đầy đủ cơ chế Hot Module Replacement (HMR).
   - **Production Mode**: Sử dụng static bundle tĩnh đã build qua `npm run build` (`wind_app.js`, `wind_app.css`).
3. **Đồng Bộ Giao Diện Trang Chủ & Menu GeoNode**:
   - Mang toàn bộ các snippets tùy biến từ `D:\GeonodeBK` sang `src/geonode_project/templates/geonode-mapstore-client/snippets/`:
     - `brand_navbar.html`: Menu dropdown "Năng Lượng Gió" điều hướng nhanh tới các route chuyên đề (`#/stations`, `#/grid`, `#/farms`, `#/statistics`).
     - `hero.html`: Hero banner, thanh tìm kiếm dataset/trạm đo, 4 thẻ chỉ số KPI nổi và 4 thẻ tính năng trực quan.
     - `head.html`: Font chữ (Inter, Montserrat), `wind_portal.css` và favicon `wind_logo.svg`.
     - `footer.html`: Chân trang phong cách nền tảng năng lượng gió.
4. **Chuẩn Kiến Trúc GeoNode Project**:
   - Tối ưu hóa cấu trúc trong `src/geonode_project` để container Docker `django4geonode` nhận diện ngay lập tức mà không cần sửa cấu hình volume mount.

---

## 2. Kiến Trúc & Tổ Chức Thư Mục (Architecture & Directory Layout)

```
wind-management/
├── frontend/                                   # Ứng dụng React 18 + Vite
│   ├── vite.config.js                          # Cập nhật outDir trỏ về src/geonode_project/static/wind_management/dist
│   └── src/
│       ├── main.jsx                            # Điểm mount vào #wind-app-root
│       └── ...
├── src/                                        # GeoNode Project wrapper (Mount vào Docker /usr/src/project)
│   └── geonode_project/
│       ├── views.py                            # Khởi tạo WindAppPortalView
│       ├── urls.py                             # Đăng ký route /wind-app/ và /wind/app/
│       ├── settings.py                         # Cấu hình STATICFILES_DIRS & TEMPLATES
│       ├── templates/
│       │   ├── wind_management/
│       │   │   └── app.html                    # Template mount React SPA với cơ chế Dual-Mode
│       │   └── geonode-mapstore-client/
│       │       ├── _geonode_config.html        # Override cấu hình MapStore
│       │       └── snippets/
│       │           ├── brand_navbar.html       # Dropdown menu Năng Lượng Gió
│       │           ├── hero.html               # Banner trang chủ, KPI cards, Feature cards
│       │           ├── head.html               # Font chữ, portal CSS, favicon
│       │           └── footer.html             # Chân trang nền tảng
│       └── static/
│           └── wind_management/
│               ├── css/
│               │   └── wind_portal.css         # CSS tùy biến cho Homepage GeoNode & Navbar
│               ├── images/
│               │   └── wind_logo.svg           # Logo icon cánh quạt gió
│               └── dist/                       # Output build của Vite
│                   ├── wind_app.js
│                   ├── wind_app.css
│                   └── ...
```

---

## 3. Chi Tiết Triển Khai Kỹ Thuật (Technical Implementation Details)

### 3.1 Cấu Hình Vite (`frontend/vite.config.js`)
- Cập nhật đường dẫn xuất bản (`outDir`) hướng tới `src/geonode_project/static/wind_management/dist`.
- Kích hoạt CORS và cấu hình `origin` để Django template nạp script từ port 5173 không bị chặn bởi trình duyệt.

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    base: '/static/wind_management/dist/',
    build: {
        outDir: path.resolve(__dirname, '../src/geonode_project/static/wind_management/dist'),
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: 'wind_app.js',
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name && assetInfo.name.endsWith('.css')) {
                        return 'wind_app.css';
                    }
                    return 'assets/[name]-[hash][extname]';
                }
            }
        }
    },
    server: {
        port: 5173,
        cors: true,
        origin: 'http://localhost:5173',
        hmr: {
            host: 'localhost',
        },
        proxy: {
            '/wind/api': 'http://localhost:8000',
            '/geoserver': 'http://localhost:8000'
        }
    }
});
```

### 3.2 View Xử Lý Portal (`src/geonode_project/views.py`)
- Kế thừa `TemplateView` của Django.
- Cung cấp biến context `vite_dev_mode` nhằm xác định việc nạp script từ máy chủ phát triển Vite hay bundle tĩnh.

```python
import os
from django.conf import settings
from django.views.generic import TemplateView


class WindAppPortalView(TemplateView):
    template_name = "wind_management/app.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Bật dev mode nếu có cờ VITE_DEV_MODE hoặc khi DEBUG=True
        context["vite_dev_mode"] = os.getenv(
            "VITE_DEV_MODE",
            str(settings.DEBUG)
        ).lower() in ("true", "1", "yes")
        return context
```

### 3.3 Định Tuyến URL (`src/geonode_project/urls.py`)
- Đăng ký URL cho ứng dụng trước các URL mặc định của GeoNode.
- Cung cấp cả `/wind-app/` và `/wind/app/` (kèm wildcard cho các subpath nếu có).

```python
from django.urls import path, re_path
from geonode.urls import urlpatterns, handler500  # noqa
from .views import WindAppPortalView

urlpatterns = [
    path("wind-app/", WindAppPortalView.as_view(), name="wind_app_portal"),
    re_path(r"^wind-app/.*$", WindAppPortalView.as_view(), name="wind_app_portal_match"),
    re_path(r"^wind/app/.*$", WindAppPortalView.as_view(), name="wind_app_portal_alias"),
] + urlpatterns
```

### 3.4 Django Template Mount (`src/geonode_project/templates/wind_management/app.html`)
- Mở rộng từ `page.html` để tái sử dụng toàn bộ khung sườn của GeoNode MapStore (thanh tiêu đề, xác thực, menu).
- Khối `extra_style`:
  - Khi Dev: Nạp Vite client HMR từ `http://localhost:5173/@vite/client`.
  - Khi Prod: Nạp CSS tĩnh `{% static 'wind_management/dist/wind_app.css' %}`.
- Khối `content`:
  - Thẻ `div#wind-app-root` chứa các dataset `data-user`, `data-is-staff`, `data-is-authenticated`, `data-api-base`.
  - Khung tải ban đầu (loading spinner) với thông điệp rõ ràng cho người dùng.
- Khối `scripts`:
  - Khi Dev: Nạp module React từ `http://localhost:5173/src/main.jsx`.
  - Khi Prod: Nạp module đã bundle `{% static 'wind_management/dist/wind_app.js' %}`.

### 3.5 Tích Hợp Snippets Giao Diện Homepage & Navbar GeoNode
1. **`brand_navbar.html`**:
   - Menu dropdown "Năng Lượng Gió" liên kết tới các trang con theo URL hash:
     - `#/stations`: Bản đồ trạm đo
     - `#/grid`: Bản đồ trường gió raster ERA5
     - `#/farms`: Quản lý trang trại gió & tuabin
     - `#/statistics`: Phân tích thống kê & hoa gió
     - `/wind-app/`: Trang tổng quan
     - Các chức năng quản trị dữ liệu nếu người dùng là `is_staff` / `is_superuser`.
2. **`hero.html`**:
   - Banner đón tiếp với thanh tìm kiếm tích hợp cho kho dữ liệu GeoNode.
   - 4 thẻ KPI động: Trạm đo gió, Lớp chuyên đề, ERA5 CDS, OGC Ready.
   - 4 thẻ tính năng chính dẫn trực tiếp vào ứng dụng trắc gió.
3. **`head.html` & `footer.html`**:
   - Tải font Inter & Montserrat, nhúng `wind_portal.css`, logo thương hiệu `wind_logo.svg`.

---

## 4. Kế Hoạch Xác Thực (Verification Plan)

| STT | Bước thực hiện | Kết quả kỳ vọng |
|---|---|---|
| 1 | `npm run build` trong `frontend/` | Thành công tạo ra `src/geonode_project/static/wind_management/dist/wind_app.js` và `wind_app.css`. |
| 2 | Kiểm tra cú pháp Django Project (`python manage.py check`) | Không phát hiện lỗi cấu hình, views hay urls. |
| 3 | Kiểm tra tính tồn tại của các tệp tĩnh | `wind_portal.css`, `wind_logo.svg`, `wind_app.js`, `wind_app.css` nằm đúng đường dẫn static. |
| 4 | Kiểm tra render template | Template `app.html` hiển thị đầy đủ container `#wind-app-root` kèm dữ liệu context, các snippet `hero.html`, `brand_navbar.html` được nạp đúng. |
| 5 | Kiểm tra chế độ Dev (Vite HMR) vs Prod | Template nạp đúng script tương ứng với giá trị cờ `vite_dev_mode`. |
