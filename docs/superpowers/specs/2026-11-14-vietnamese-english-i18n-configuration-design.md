# Thiết kế kỹ thuật: Cấu hình Đa ngôn ngữ (Tiếng Việt & Tiếng Anh) cho Hệ thống GeoNode

- **Ngày tạo:** 2026-11-14
- **Trạng thái:** Đã phê duyệt (Approved)
- **Mục tiêu:** Di chuyển và đồng bộ toàn bộ cấu hình bản dịch Tiếng Việt và Tiếng Anh từ `D:\GeonodeBK\wind_management_app` sang dự án `d:\Jobs\Wind\wind-management`, thiết lập Tiếng Việt (`vi-vn`) làm ngôn ngữ mặc định và hỗ trợ chuyển đổi linh hoạt sang Tiếng Anh (`en-us`).

---

## 1. Bối cảnh & Mục tiêu (Context & Objectives)

### 1.1. Hiện trạng
- Dự án `d:\Jobs\Wind\wind-management` đang chạy trên nền Docker GeoNode với backend Django Python 3.14 và Nginx serving static assets.
- Cấu hình mặc định của GeoNode chỉ hỗ trợ 5 ngôn ngữ Châu Âu (`de-de`, `en-us`, `es-es`, `fr-fr`, `it-it`), ngôn ngữ mặc định là `en`.
- Dự án sao lưu tại `D:\GeonodeBK\wind_management_app` đã hoàn thiện toàn bộ bản dịch Tiếng Việt cho cả Django backend, MapStore client frontend, template snippets và cấu hình biến môi trường.

### 1.2. Mục tiêu kỹ thuật
1. Đồng bộ toàn bộ tệp tin bản dịch MapStore (`data.vi-VN.json`, `cookieDetails-vi-VN.html`) và Django gettext (`django.po`, `django.mo`) sang cấu trúc chuẩn của `src/geonode_project`.
2. Bổ sung template override `search_bar.html` để ô tìm kiếm trên thanh điều hướng hỗ trợ bản dịch i18n (`placeholder="{% trans "Search" %}"`).
3. Cập nhật `src/geonode_project/settings.py` mở rộng `MAPSTORE_DEFAULT_LANGUAGES` chứa `("vi-vn", "Tiếng Việt")` và xử lý an toàn giải mã biến môi trường `LANGUAGES`.
4. Cấu hình `.env` với `LANGUAGE_CODE=vi-vn`, `LANGUAGES=(('vi-vn','Tiếng Việt'),('en-us','English'))`, và `TIME_ZONE=Asia/Ho_Chi_Minh`.
5. Đồng bộ cấu hình micro-apps tại `apps/configs/settings.py`.
6. Thực thi quy trình biên dịch messages và collect static trong Docker container `django`, khởi động lại dịch vụ và kiểm thử end-to-end.

---

## 2. Chi tiết Thiết kế & Di chuyển Tệp tin

### 2.1. MapStore Client Translations (Static Assets)
- **Nguồn:** `D:\GeonodeBK\wind_management_app\geonode\static\mapstore\`
- **Đích:** `src/geonode_project/static/mapstore/`
- **Danh sách tệp tin:**
  - `gn-translations/data.vi-VN.json`: Bản dịch giao diện GeoNode MapStore client (menu, trang chủ gnhome, trình xem viewer, tài nguyên, nhóm, người dùng).
  - `ms-translations/data.vi-VN.json`: Bản dịch khung MapStore core catalog.
  - `ms-translations/fragments/cookie/cookieDetails-vi-VN.html`: Trang chi tiết điều khoản cookie bằng Tiếng Việt.

### 2.2. Django Backend Gettext (Locale Files)
- **Nguồn:** `D:\GeonodeBK\wind_management_app\geonode\locale\vi\LC_MESSAGES\`
- **Đích:** `src/geonode_project/locale/vi/LC_MESSAGES/`
- **Danh sách tệp tin:**
  - `django.po`: Định nghĩa chuỗi gốc và bản dịch tiếng Việt cho các nhãn hệ thống (Tập dữ liệu, Bản đồ, Thành viên, Trợ giúp, Đăng xuất, Mục yêu thích, v.v.).
  - `django.mo`: Tệp nhị phân đã biên dịch từ `.po`.

### 2.3. Template Override Snippets
- **Nguồn:** `D:\GeonodeBK\wind_management_app\geonode_mapstore_client\templates\geonode-mapstore-client\snippets\search_bar.html`
- **Đích:** `src/geonode_project/templates/geonode-mapstore-client/snippets/search_bar.html`
- **Nội dung:**
  ```html
  {% load i18n %}
  <div id="{{ search_bar_id }}" class="gn-search-bar">
      <div class="input-group">
          <div class="input-group-prepend">
              <span class="input-group-text" id="inputGroup-sizing-default">
                  <i class="fa fa-search"></i>
              </span>
          </div>

          <input
              placeholder="{% trans "Search" %}"
              class="form-control" value=""
              style="outline: none; box-shadow: none;"
          >
      </div>
  </div>
  ```

### 2.4. Cấu hình Backend Django (`src/geonode_project/settings.py`)
Mở rộng cấu hình sau phần import `geonode.settings`:
```python
import ast

TIME_ZONE = os.getenv("TIME_ZONE", "Asia/Ho_Chi_Minh")

# Bổ sung vi-vn vào MAPSTORE_DEFAULT_LANGUAGES để MapStore nhận diện và không lọc bỏ
MAPSTORE_DEFAULT_LANGUAGES = (
    ("vi-vn", "Tiếng Việt"),
    ("en-us", "English"),
    ("de-de", "Deutsch"),
    ("es-es", "Español"),
    ("fr-fr", "Français"),
    ("it-it", "Italiano"),
)

try:
    _raw_langs = os.getenv("LANGUAGES")
    if _raw_langs:
        _parsed_langs = ast.literal_eval(_raw_langs.encode("utf-8", "surrogateescape").decode("utf-8", "replace"))
        LANGUAGES = tuple(
            (k, v) for k, v in dict(MAPSTORE_DEFAULT_LANGUAGES).items() if any(m in k for m in dict(_parsed_langs).keys())
        )
    else:
        LANGUAGES = (("vi-vn", "Tiếng Việt"), ("en-us", "English"))
except Exception:
    LANGUAGES = (("vi-vn", "Tiếng Việt"), ("en-us", "English"))

LANGUAGE_CODE = os.getenv("LANGUAGE_CODE", "vi-vn")
```

### 2.5. Biến môi trường (`.env`)
Thêm cấu hình vào `.env`:
```env
LANGUAGE_CODE=vi-vn
LANGUAGES=(('vi-vn','Tiếng Việt'),('en-us','English'))
TIME_ZONE=Asia/Ho_Chi_Minh
```

### 2.6. Đồng bộ Micro-apps (`apps/configs/settings.py`)
Cập nhật:
```python
LANGUAGE_CODE = os.getenv("LANGUAGE_CODE", "vi-vn")
TIME_ZONE = os.getenv("TIME_ZONE", "Asia/Ho_Chi_Minh")
```

---

## 3. Quy trình Vận hành Docker & Đồng bộ

1. **Biên dịch gettext:**
   ```bash
   docker compose exec django python manage.py compilemessages -l vi
   ```
2. **Thu thập tệp tĩnh vào volume Nginx:**
   ```bash
   docker compose exec django python manage.py collectstatic --noinput
   ```
3. **Khởi động lại Django service:**
   ```bash
   docker compose restart django
   ```

---

## 4. Kế hoạch Kiểm thử & Xác minh (Verification Plan)

1. **Kiểm tra Django Settings trong Container:**
   - Chạy lệnh kiểm tra `settings.LANGUAGE_CODE` là `'vi-vn'`.
   - Chạy lệnh kiểm tra `settings.LANGUAGES` chứa đúng cặp `('vi-vn', 'Tiếng Việt')` và `('en-us', 'English')`.
2. **Kiểm tra HTML Homepage:**
   - Kiểm tra `window.__GEONODE_CONFIG__.languageCode` là `'vi-vn'`.
   - Kiểm tra dropdown ngôn ngữ hiển thị "Tiếng Việt" và "English".
   - Kiểm tra placeholder ô tìm kiếm trên navbar hiển thị "Tìm kiếm".
3. **Kiểm tra Nginx Static Translation Endpoint:**
   - Kiểm tra endpoint `/static/mapstore/gn-translations/data.vi-VN.json` trả về HTTP 200 và JSON hợp lệ với `"locale": "vi-VN"`.
4. **Kiểm tra Chuyển đổi Ngôn ngữ:**
   - Thực hiện yêu cầu POST đến `/i18n/setlang/` với `language=en-us` và `language=vi-vn` để xác nhận chuyển đổi cookie và render ngôn ngữ chính xác.
