# Design Spec: Docker Configuration for Wind Backend (wind_be), Worker (wind_worker), and Frontend Integration

- **Date**: 2026-11-14
- **Topic**: Dockerize Custom Apps Backend (`wind_be`), Celery Worker (`wind_worker`), and Frontend Static Mount into Nginx
- **Status**: Approved by User

---

## 1. Context & Motivation

Dự án hiện đang vận hành cụm GeoNode trên Docker (`docker-compose.yml`) bao gồm PostGIS (`db`), Redis (`redis`), GeoServer (`geoserver`), GeoNode Django (`django`), Celery (`celery`), Nginx (`nginx`), và Let's Encrypt (`letsencrypt`).

Phần ứng dụng trắc gió tùy biến (Wind Management) gồm hai cấu phần chính:
1. **Backend Custom Apps (`apps/`)**: Cụm Django micro-apps (`wind_core`, `wind_stations`, `wind_raster`, `wind_events`, `wind_energy`, `wind_cds`, `configs`), cung cấp REST API, xử lý không gian GIS, phân tích dữ liệu NetCDF và các background tasks tải CDS ECMWF.
2. **Frontend (`frontend/`)**: React 18 + Vite SPA, OpenLayers và Plotly, được thiết kế để nhúng trực tiếp vào trang Portal GeoNode tại route `/wind-app/`.

Mục tiêu của thiết kế này là đóng gói `apps/` thành các container Docker chuẩn mực (`wind_be` và `wind_worker`), tích hợp dùng chung Database PostGIS và Redis với GeoNode, đồng thời cấu hình Nginx làm reverse proxy cho API và phục vụ bản build tĩnh của Frontend mà không cần tạo thêm container riêng cho frontend.

---

## 2. Architecture & Service Topology

```
[ Browser / Client ]
         │
         ▼ (Port 80 / 443)
┌────────────────────────────────────────────────────────────────────────┐
│                              NGINX CONTAINER                           │
│  - /wind-app/          ──> Proxy tới GeoNode Django (render portal)    │
│  - /static/wind_mgmt/  ──> Phục vụ trực tiếp file React build (Mount)  │
│  - /wind/api/*         ──> Proxy tới WIND_BE (Port 8001)               │
│  - /geoserver/*        ──> Proxy tới GeoServer (Port 8080)             │
│  - Các route khác      ──> Proxy tới GeoNode Django (Port 8000)        │
└───────────────────┬──────────────────────────┬─────────────────────────┘
                    │                          │
         ┌──────────┴──────────┐    ┌──────────┴──────────┐
         ▼                     ▼    ▼                     │
┌──────────────────┐  ┌──────────────────┐                │
│  GEONODE DJANGO  │  │     WIND_BE      │                │
│  (Port 8000)     │  │  (Port 8001)     │                │
│  - Portal page   │  │  - DRF APIs      │                │
│  - Auth & Admin  │  │  - Wind logic    │                │
└────────┬─────────┘  └────────┬─────────┘                │
         │                     │                          │
         └──────────┬──────────┴──────────────────────────┤
                    ▼                                     ▼
        ┌───────────────────────┐            ┌─────────────────────────┐
        │   POSTGRES / POSTGIS  │            │     REDIS CONTAINER     │
        │  Database:            │            │  - Broker & Result      │
        │  `geonode_project`    │            │    Backend              │
        │  (Bảng GeoNode +      │            └────────────┬────────────┘
        │   Bảng Wind apps)     │                         │
        └───────────────────────┘                         ▼
                                             ┌─────────────────────────┐
                                             │       WIND_WORKER       │
                                             │  - Celery Worker        │
                                             │  - Tải CDS, nạp NetCDF  │
                                             └─────────────────────────┘
```

### Nguyên tắc liên kết:
1. **Mạng nội bộ**: Tất cả service chạy trong default bridge network của docker-compose, phân giải tên miền nội bộ qua Docker DNS (`wind_be`, `wind_worker`, `db`, `redis`, `django`, `nginx`).
2. **Xác thực và cơ sở dữ liệu dùng chung (Shared DB & Zero-latency Auth)**:
   - `wind_be` kết nối trực tiếp vào database `geonode_project` của PostGIS (`db`).
   - Sử dụng chung `SECRET_KEY` với GeoNode Django giúp giải mã đồng nhất Session Cookie.
   - Nhận diện user GeoNode tức thì qua `request.user`, kiểm tra `is_staff` và quyền trực tiếp trên bảng `auth_user` và `people_profile`.
3. **Queue tác vụ nền**: `wind_be` đẩy task vào Redis database 0, `wind_worker` lắng nghe thực thi.

---

## 3. Detailed Component Specifications

### 3.1. Requirements File (`apps/requirements.txt`)
Chứa toàn bộ thư viện cần thiết cho cụm micro-apps trắc gió:
- Web & REST Framework: `Django>=5.0`, `djangorestframework>=3.14.0`, `djangorestframework-gis>=1.0`, `django-filter>=23.0`, `django-cors-headers>=4.0`.
- Task Queue: `celery>=5.3.0`, `redis>=5.0.0`, `django-celery-beat>=2.5.0`.
- GIS & Khí tượng: `psycopg[binary]>=3.1.0`, `xarray>=2023.0`, `netCDF4>=1.6.0`, `cdsapi>=0.7.0`, `pandas>=2.0.0`, `numpy>=1.24.0`, `ecmwf-datastores-client>=0.6.0`.
- WSGI Application Server: `gunicorn>=21.0.0`.

### 3.2. Dockerfile cho Backend (`docker/wind_be/Dockerfile`)
- Kế thừa từ base image của GeoNode: `geonode/geonode-base:latest-ubuntu-26.04` (đã có sẵn thư viện C của GDAL 3.x, GEOS, PROJ).
- Cài đặt các gói từ `apps/requirements.txt`.
- Copy thư mục `apps/` vào `/usr/src/apps`.
- Thiết lập thư mục làm việc `/usr/src/apps`.

### 3.3. Dịch vụ `wind_be` trong `docker-compose.yml`
- **Build**: Context `./`, Dockerfile `docker/wind_be/Dockerfile`.
- **Tên container**: `wind_be4${COMPOSE_PROJECT_NAME}`.
- **Biến môi trường**:
  - `DJANGO_SETTINGS_MODULE=configs.settings`
  - `DATABASE_HOST=db`, `DATABASE_PORT=5432`
  - `WIND_DATABASE=${GEONODE_DATABASE:-geonode_project}`
  - `POSTGRES_USER=${GEONODE_DATABASE_USER:-geonode_project}`
  - `POSTGRES_PASSWORD=${GEONODE_DATABASE_PASSWORD}`
  - `CELERY_BROKER_URL=redis://redis:6379/0`
  - `CELERY_RESULT_BACKEND=redis://redis:6379/1`
  - `SECRET_KEY=${SECRET_KEY}`
  - `PYTHONPATH=/usr/src/apps`
- **Volume Mounts**:
  - `./apps:/usr/src/apps` (cho phép live code reload khi dev)
  - `./src:/usr/src/src` (liên kết template/static nếu cần)
  - `./wind_rasters:/usr/src/wind_rasters` (lưu trữ file raster NetCDF)
  - `statics:/mnt/volumes/statics`
- **Phụ thuộc**: `db` (healthy), `redis` (healthy).
- **Command**:
  ```bash
  sh -c "python manage.py migrate --noinput && gunicorn configs.wsgi:application --bind 0.0.0.0:8001 --workers 3 --timeout 300 --reload"
  ```

### 3.4. Dịch vụ `wind_worker` trong `docker-compose.yml`
- **Build**: Sử dụng chung image với `wind_be`.
- **Tên container**: `wind_worker4${COMPOSE_PROJECT_NAME}`.
- **Biến môi trường**: Tương tự `wind_be`.
- **Volume Mounts**: `./apps:/usr/src/apps`, `./wind_rasters:/usr/src/wind_rasters`, `statics:/mnt/volumes/statics`.
- **Phụ thuộc**: `db` (healthy), `redis` (healthy), `wind_be` (started).
- **Command**:
  ```bash
  celery -A configs worker -l INFO -c 2 -Q default
  ```

---

## 4. Nginx Reverse Proxy & Frontend Integration

### 4.1. Nginx Routing Configuration (`docker/nginx/sites-enabled/wind_be.conf`)
File cấu hình được nạp vào Nginx container thông qua thư mục `sites-enabled/`:
```nginx
# Proxy các API của ứng dụng Trắc gió tới container wind_be
location /wind/api/ {
    set $upstream_wind_be wind_be:8001;

    proxy_pass http://$upstream_wind_be;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
}

# Alias tương thích ngược
location /api/v1/wind/ {
    set $upstream_wind_be wind_be:8001;
    proxy_pass http://$upstream_wind_be;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 4.2. Frontend Build & Static Serving
1. **Build trên Host**:
   - `frontend/vite.config.js` xuất build ra `src/geonode_project/static/wind_management/dist/` (`wind_app.js`, `wind_app.css`).
2. **Mount tĩnh vào Nginx**:
   - Cấu hình volume trong `nginx` service của `docker-compose.yml`:
     ```yaml
     - './src/geonode_project/static/wind_management/dist:/mnt/volumes/statics/static/wind_management/dist:ro'
     ```
   - Nginx có sẵn location `/static/` trỏ tới `/mnt/volumes/statics/static/`, do đó bản build mới sẽ lập tức khả dụng tại `/static/wind_management/dist/wind_app.js` mà không cần khởi động lại Nginx.
3. **Portal Route**:
   - Truy cập `http://localhost/wind-app/` được Nginx chuyển về `django:8000` (`WindAppPortalView`), nạp bundle tĩnh từ `/static/wind_management/dist/wind_app.js`.

---

## 5. Data Flow & Security

1. **User Authentication Flow**:
   - Người dùng đăng nhập qua GeoNode (`/account/login/`). Phiên đăng nhập được lưu trong session cookie của trình duyệt.
   - Khi frontend gửi request tới `/wind/api/v1/...`, cookie phiên được gửi kèm qua Nginx tới `wind_be`.
   - `wind_be` giải mã session cookie bằng shared `SECRET_KEY`, tự động nạp `request.user` từ bảng `auth_user` trong database `geonode_project`.
2. **CDS NetCDF Processing Flow**:
   - API trigger CDS job -> `wind_be` ghi record vào `CDSDownloadJob` và dispatch task `run_cds_download_job` tới Redis.
   - `wind_worker` nhận task, gọi CDS API tải file `.nc` về `./wind_rasters/`, gọi module `ingest_netcdf` của `wind_raster` để nạp dữ liệu raster.

---

## 6. Verification & Validation Steps

1. **Kiểm tra Frontend Build**:
   ```bash
   cd frontend && npm run build
   # Xác nhận file wind_app.js và wind_app.css đã tồn tại trong src/geonode_project/static/wind_management/dist/
   ```
2. **Build và khởi động Container**:
   ```bash
   docker compose build wind_be wind_worker nginx
   docker compose up -d wind_be wind_worker nginx
   ```
3. **Kiểm tra trạng thái Service**:
   ```bash
   docker compose ps
   # Xác nhận wind_be và wind_worker ở trạng thái Up (running)
   ```
4. **Kiểm tra Nginx Proxy tới `wind_be`**:
   ```bash
   curl -i http://localhost/wind/api/v1/
   # Kết quả trả về HTTP 200 OK với DRF API root
   ```
5. **Kiểm tra phục vụ Static bundle**:
   ```bash
   curl -i http://localhost/static/wind_management/dist/wind_app.js
   # Kết quả trả về HTTP 200 OK với content JavaScript
   ```
6. **Kiểm tra Portal Page**:
   - Mở trình duyệt tại `http://localhost/wind-app/`, kiểm tra giao diện bản đồ và công cụ tải lên bình thường.
7. **Kiểm tra Celery Worker**:
   ```bash
   docker exec -it wind_worker4geonode_project celery -A configs inspect ping
   # Kết quả nhận được pong từ wind_worker
   ```
