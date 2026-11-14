# Docker Wind Backend (wind_be), Worker, and Frontend Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cấu hình Docker cho ứng dụng trắc gió tùy biến gồm service backend `wind_be` (Django REST Framework), Celery worker `wind_worker` (tải CDS & xử lý NetCDF), định tuyến Nginx reverse proxy cho `/wind/api/`, và nạp bản build tĩnh của Frontend React vào Nginx phục vụ qua template portal `/wind-app/`.

**Architecture:** Sử dụng kiến trúc container phân tán kết nối trong cùng mạng `docker-compose.yml`. `wind_be` và `wind_worker` cùng kế thừa từ `geonode/geonode-base` để đồng nhất thư viện GIS nhị phân (GDAL, GEOS, PROJ) và chia sẻ chung database PostGIS (`geonode_project`) cùng Redis broker với GeoNode. Nginx định tuyến prefix `/wind/api/` sang `wind_be:8001`, phục vụ file bundle React từ volume mount tĩnh `/mnt/volumes/statics/static/wind_management/dist/`, và chuyển tiếp portal `/wind-app/` sang GeoNode Django (`django:8000`).

**Tech Stack:** Docker, Docker Compose, Nginx, Python 3.10+, Django, Django REST Framework, Celery, Redis, PostGIS, GDAL, NetCDF4, xarray, Vite, React 18.

## Global Constraints
- Database chung: `geonode_project` trên container `db` (PostgreSQL 15 + PostGIS 3.5).
- Shared `SECRET_KEY` từ file `.env` cho cả GeoNode và `wind_be`.
- Port nội bộ `wind_be`: `8001`.
- API base route: `/wind/api/` (cùng alias `/api/v1/wind/`).
- Frontend build output: `src/geonode_project/static/wind_management/dist/`.
- Frontend Portal URL: `http://localhost/wind-app/`.

---

### Task 1: Tạo file dependencies `apps/requirements.txt`

**Files:**
- Create: `apps/requirements.txt`

**Interfaces:**
- Consumes: None
- Produces: `apps/requirements.txt` phục vụ cài đặt thư viện trong Dockerfile của `wind_be` và `wind_worker`.

- [ ] **Step 1: Viết nội dung `apps/requirements.txt`**

Tạo file `apps/requirements.txt` chứa đầy đủ các thư viện cần thiết:

```text
# Django & REST Framework
Django>=5.0,<6.2
djangorestframework>=3.14.0
djangorestframework-gis>=1.0
django-filter>=23.0
django-cors-headers>=4.0

# Database & Celery
psycopg[binary]>=3.1.0
celery>=5.3.0
redis>=5.0.0
django-celery-beat>=2.5.0

# Scientific & Spatial libraries
xarray>=2023.0
netCDF4>=1.6.0
cdsapi>=0.7.0
ecmwf-datastores-client>=0.6.0
pandas>=2.0.0
numpy>=1.24.0

# Application Server
gunicorn>=21.0.0
```

- [ ] **Step 2: Kiểm tra cú pháp và sự tồn tại của file**

Run: `Test-Path apps/requirements.txt`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add apps/requirements.txt
git commit -m "chore(wind_be): add requirements.txt for custom apps backend"
```

---

### Task 2: Tạo Dockerfile cho `wind_be` và `wind_worker`

**Files:**
- Create: `docker/wind_be/Dockerfile`

**Interfaces:**
- Consumes: `apps/requirements.txt`, image base `geonode/geonode-base:latest-ubuntu-26.04`
- Produces: Docker image chứa runtime Python GIS và mã nguồn `apps/`.

- [ ] **Step 1: Viết nội dung `docker/wind_be/Dockerfile`**

Tạo file `docker/wind_be/Dockerfile`:

```dockerfile
FROM geonode/geonode-base:latest-ubuntu-26.04

ENV LC_ALL=C.UTF-8 \
    LANG=C.UTF-8 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /usr/src/apps

# Cập nhật pip và công cụ build cơ bản
RUN python -m pip install --no-cache-dir -U pip setuptools wheel

# Cài đặt requirements trước để tận dụng Docker layer cache
COPY apps/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Sao chép mã nguồn apps vào image
COPY apps/ /usr/src/apps/

EXPOSE 8001
```

- [ ] **Step 2: Kiểm tra sự tồn tại của Dockerfile**

Run: `Test-Path docker/wind_be/Dockerfile`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add docker/wind_be/Dockerfile
git commit -m "feat(docker): add Dockerfile for wind_be and wind_worker"
```

---

### Task 3: Cấu hình định tuyến Nginx Reverse Proxy cho `wind_be`

**Files:**
- Create: `docker/nginx/sites-enabled/wind_be.conf`
- Modify: `docker/nginx/Dockerfile`

**Interfaces:**
- Consumes: Nginx GeoNode base image
- Produces: Nginx định tuyến các request `/wind/api/` sang `wind_be:8001`.

- [ ] **Step 1: Viết cấu hình `docker/nginx/sites-enabled/wind_be.conf`**

Tạo file `docker/nginx/sites-enabled/wind_be.conf`:

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

# Alias tương thích ngược nếu frontend hoặc client gọi dạng /api/v1/wind/
location /api/v1/wind/ {
    set $upstream_wind_be wind_be:8001;

    proxy_pass http://$upstream_wind_be;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

- [ ] **Step 2: Cập nhật `docker/nginx/Dockerfile`**

Chỉnh sửa `docker/nginx/Dockerfile` để copy file cấu hình vào image:

```dockerfile
ARG BASE_IMAGE_VERSION
FROM geonode/nginx:${BASE_IMAGE_VERSION}

COPY sites-enabled/wind_be.conf /etc/nginx/sites-enabled/wind_be.conf
```

- [ ] **Step 3: Commit**

```bash
git add docker/nginx/sites-enabled/wind_be.conf docker/nginx/Dockerfile
git commit -m "feat(nginx): configure reverse proxy routing for wind_be API"
```

---

### Task 4: Khai báo Services `wind_be`, `wind_worker` và Volume Mount trong `docker-compose.yml`

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `docker/wind_be/Dockerfile`, database `db`, redis `redis`, nginx `nginx`
- Produces: Stack Docker Compose hoàn chỉnh có thêm `wind_be`, `wind_worker` và static mount cho `nginx`.

- [ ] **Step 1: Thêm volume mount frontend static vào service `nginx`**

Trong `docker-compose.yml`, tìm phần `volumes:` của service `nginx`:
```yaml
    volumes:
      - nginx-confd:/etc/nginx
      - nginx-certificates:/geonode-certificates
      - statics:/mnt/volumes/statics
```
Thêm dòng:
```yaml
      - './src/geonode_project/static/wind_management/dist:/mnt/volumes/statics/static/wind_management/dist:ro'
```

- [ ] **Step 2: Khai báo service `wind_be` và `wind_worker` trong `docker-compose.yml`**

Thêm định nghĩa 2 service vào phần `services:`:

```yaml
  # Custom Backend cho Wind Apps
  wind_be:
    build:
      context: ./
      dockerfile: docker/wind_be/Dockerfile
    container_name: wind_be4${COMPOSE_PROJECT_NAME}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - DJANGO_SETTINGS_MODULE=configs.settings
      - DATABASE_HOST=db
      - DATABASE_PORT=5432
      - WIND_DATABASE=${GEONODE_DATABASE:-geonode_project}
      - POSTGRES_USER=${GEONODE_DATABASE_USER:-geonode_project}
      - POSTGRES_PASSWORD=${GEONODE_DATABASE_PASSWORD}
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/1
      - PYTHONPATH=/usr/src/apps
    volumes:
      - './apps:/usr/src/apps'
      - './src:/usr/src/src'
      - './wind_rasters:/usr/src/wind_rasters'
      - statics:/mnt/volumes/statics
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: >
      sh -c "python manage.py migrate --noinput &&
             gunicorn configs.wsgi:application --bind 0.0.0.0:8001 --workers 3 --timeout 300 --reload"

  # Celery Worker cho Wind Apps
  wind_worker:
    build:
      context: ./
      dockerfile: docker/wind_be/Dockerfile
    container_name: wind_worker4${COMPOSE_PROJECT_NAME}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - DJANGO_SETTINGS_MODULE=configs.settings
      - DATABASE_HOST=db
      - DATABASE_PORT=5432
      - WIND_DATABASE=${GEONODE_DATABASE:-geonode_project}
      - POSTGRES_USER=${GEONODE_DATABASE_USER:-geonode_project}
      - POSTGRES_PASSWORD=${GEONODE_DATABASE_PASSWORD}
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/1
      - PYTHONPATH=/usr/src/apps
    volumes:
      - './apps:/usr/src/apps'
      - './wind_rasters:/usr/src/wind_rasters'
      - statics:/mnt/volumes/statics
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
      wind_be:
        condition: service_started
    command: celery -A configs worker -l INFO -c 2 -Q default
```

- [ ] **Step 3: Kiểm tra tính hợp lệ cú pháp của docker-compose**

Run: `docker compose config -q`
Expected: Thoát với mã 0 (không có lỗi cú pháp YAML).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker-compose): add wind_be and wind_worker services with static mount"
```

---

### Task 5: Build Frontend Bundle và xác thực file tĩnh

**Files:**
- Directory: `frontend/`
- Output: `src/geonode_project/static/wind_management/dist/`

**Interfaces:**
- Consumes: Mã nguồn `frontend/`
- Produces: `wind_app.js`, `wind_app.css`

- [ ] **Step 1: Chạy build frontend trên host**

Run:
```powershell
Set-Location frontend; npm run build; Set-Location ..
```
Expected: Quá trình Vite build thành công, tạo ra `wind_app.js` và `wind_app.css`.

- [ ] **Step 2: Kiểm tra file xuất ra**

Run:
```powershell
Get-ChildItem -Path src/geonode_project/static/wind_management/dist/
```
Expected: Thấy xuất hiện file `wind_app.js` và `wind_app.css`.

- [ ] **Step 3: Commit**

```bash
git add src/geonode_project/static/wind_management/dist/
git commit -m "build(frontend): generate production bundle for static mounting"
```

---

### Task 6: Build Container, Khởi chạy và Kiểm thử toàn diện (End-to-End Verification)

**Files:**
- Verification only

**Interfaces:**
- Consumes: Tất cả các file đã cấu hình ở các Task 1-5.
- Produces: Hệ thống Docker hoạt động hoàn chỉnh, API phản hồi 200, Nginx serve static và Celery worker ping thành công.

- [ ] **Step 1: Build Docker images cho `wind_be`, `wind_worker` và `nginx`**

Run:
```powershell
docker compose build wind_be wind_worker nginx
```
Expected: Build thành công cả 3 service.

- [ ] **Step 2: Khởi động các service mới và reload nginx**

Run:
```powershell
docker compose up -d wind_be wind_worker nginx
```
Expected: Containers `wind_be4...`, `wind_worker4...`, `nginx4...` ở trạng thái Up.

- [ ] **Step 3: Kiểm tra trạng thái container**

Run:
```powershell
docker compose ps
```
Expected: `wind_be4...` và `wind_worker4...` đều đang running.

- [ ] **Step 4: Kiểm tra Nginx proxy tới `wind_be`**

Run:
```powershell
Invoke-WebRequest -Uri "http://localhost/wind/api/v1/" -Method Get
```
Expected: Trả về HTTP 200 OK kèm payload JSON API root của DRF.

- [ ] **Step 5: Kiểm tra phục vụ static bundle qua Nginx**

Run:
```powershell
Invoke-WebRequest -Uri "http://localhost/static/wind_management/dist/wind_app.js" -Method Head
```
Expected: Trả về HTTP 200 OK với Content-Type `application/javascript`.

- [ ] **Step 6: Kiểm tra phản hồi của Celery worker**

Run:
```powershell
docker exec wind_worker4geonode_project celery -A configs inspect ping
```
(Hoặc thay thế bằng tên container thực tế theo `$COMPOSE_PROJECT_NAME`)
Expected: Nhận được phản hồi `pong` từ worker.

- [ ] **Step 7: Kiểm tra trang Portal `/wind-app/`**

Run:
```powershell
Invoke-WebRequest -Uri "http://localhost/wind-app/" -Method Get
```
Expected: Trả về HTTP 200 OK với HTML chứa `<div id="wind-app-root">`.
