# Mount Frontend Into GeoNode Django Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cấu hình build frontend React Vite, tạo template `wind_management/app.html` hỗ trợ dual-mode (Vite HMR dev vs static production bundle), mount ứng dụng vào GeoNode và tích hợp thanh menu dropdown cùng toàn bộ giao diện homepage.

**Architecture:** Cấu hình Vite xuất static trực tiếp vào `src/geonode_project/static/wind_management/dist`, thiết lập `WindAppPortalView` truyền cờ `vite_dev_mode` từ biến môi trường/DEBUG vào template `app.html`, đăng ký URL `/wind-app/` & `/wind/app/` trong `src/geonode_project/urls.py`, và ghi đè các snippets giao diện MapStore của GeoNode (`brand_navbar.html`, `hero.html`, `head.html`, `footer.html`).

**Tech Stack:** Django (GeoNode Project), React 18, Vite 5, Python 3.12, HTML/CSS/Jinja-Django Templates.

## Global Constraints
- Đường dẫn static cho bundle frontend: `src/geonode_project/static/wind_management/dist`
- Tên file bundle: `wind_app.js` và `wind_app.css`
- URL chính: `/wind-app/`, URL phụ alias: `/wind/app/`
- Thẻ mount React container: `<div id="wind-app-root" data-user="..." data-is-staff="..." data-is-authenticated="..." data-api-base="/wind/api/v1">`
- Khi `vite_dev_mode=True`: nạp `http://localhost:5173/@vite/client` và `http://localhost:5173/src/main.jsx`
- Khi `vite_dev_mode=False`: nạp `{% static 'wind_management/dist/wind_app.js' %}` và `wind_app.css`

---

### Task 1: Cấu hình Vite Build và CORS cho Frontend

**Files:**
- Modify: `frontend/vite.config.js`
- Test: `frontend/package.json`

**Interfaces:**
- Consumes: Cấu hình hiện tại của Vite trong `frontend/vite.config.js`
- Produces: `src/geonode_project/static/wind_management/dist/{wind_app.js, wind_app.css, assets/*}`

- [ ] **Step 1: Cập nhật cấu hình Vite**

Chỉnh sửa `frontend/vite.config.js`:
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

- [ ] **Step 2: Thực thi build để xác thực**

Chạy lệnh trong PowerShell:
```powershell
cd frontend; npm run build; cd ..
```
Kỳ vọng: Lệnh kết thúc với mã 0 và tạo ra `src/geonode_project/static/wind_management/dist/wind_app.js` và `wind_app.css`.

- [ ] **Step 3: Kiểm tra tệp build**

Chạy lệnh:
```powershell
Test-Path src\geonode_project\static\wind_management\dist\wind_app.js
Test-Path src\geonode_project\static\wind_management\dist\wind_app.css
```
Kỳ vọng: Cả 2 đều trả về `True`.

- [ ] **Step 4: Commit**

```bash
git add frontend/vite.config.js
git commit -m "chore(frontend): configure vite output directory to geonode static and enable cors"
```

---

### Task 2: Đồng Bộ Tài Nguyên Tĩnh Nền Tảng (Portal CSS & Logo)

**Files:**
- Create: `src/geonode_project/static/wind_management/css/wind_portal.css`
- Create: `src/geonode_project/static/wind_management/images/wind_logo.svg`

**Interfaces:**
- Consumes: Nguồn từ `D:\GeonodeBK\wind_management_app\wind_management\static\wind_management\`
- Produces: Các tài nguyên tĩnh được nạp trong `head.html` và `brand_navbar.html`

- [ ] **Step 1: Tạo thư mục và sao chép tài nguyên tĩnh**

Chạy lệnh PowerShell:
```powershell
New-Item -ItemType Directory -Force -Path src\geonode_project\static\wind_management\css
New-Item -ItemType Directory -Force -Path src\geonode_project\static\wind_management\images
Copy-Item D:\GeonodeBK\wind_management_app\wind_management\static\wind_management\css\wind_portal.css src\geonode_project\static\wind_management\css\wind_portal.css
Copy-Item D:\GeonodeBK\wind_management_app\wind_management\static\wind_management\images\wind_logo.svg src\geonode_project\static\wind_management\images\wind_logo.svg
```

- [ ] **Step 2: Kiểm tra sự tồn tại của tệp**

Chạy:
```powershell
Test-Path src\geonode_project\static\wind_management\css\wind_portal.css
Test-Path src\geonode_project\static\wind_management\images\wind_logo.svg
```
Kỳ vọng: Cả 2 đều trả về `True`.

- [ ] **Step 3: Commit**

```bash
git add src/geonode_project/static/wind_management/
git commit -m "feat(geonode): add wind portal css and wind logo static assets"
```

---

### Task 3: Tạo WindAppPortalView và Đăng Ký URL Trong GeoNode Project

**Files:**
- Create: `src/geonode_project/views.py`
- Modify: `src/geonode_project/urls.py`
- Test: `tests/test_portal_views.py`

**Interfaces:**
- Consumes: `django.views.generic.TemplateView`, `django.conf.settings`
- Produces: `WindAppPortalView` với context `vite_dev_mode`, URL `/wind-app/` và `/wind/app/`

- [ ] **Step 1: Viết test kiểm tra View và URL resolution**

Tạo `tests/test_portal_views.py`:
```python
import os
import pytest
from django.test import RequestFactory
from django.urls import resolve, reverse
from src.geonode_project.views import WindAppPortalView


def test_portal_url_resolves():
    match = resolve("/wind-app/")
    assert match.func.view_class == WindAppPortalView
    
    match_alias = resolve("/wind/app/")
    assert match_alias.func.view_class == WindAppPortalView


def test_portal_view_context_dev_mode():
    factory = RequestFactory()
    request = factory.get("/wind-app/")
    
    # Test khi VITE_DEV_MODE=True
    os.environ["VITE_DEV_MODE"] = "True"
    view = WindAppPortalView()
    view.setup(request)
    context = view.get_context_data()
    assert context["vite_dev_mode"] is True

    # Test khi VITE_DEV_MODE=False
    os.environ["VITE_DEV_MODE"] = "False"
    context = view.get_context_data()
    assert context["vite_dev_mode"] is False
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Chạy:
```powershell
.venv\Scripts\python -m pytest tests/test_portal_views.py
```
Kỳ vọng: FAIL vì `src.geonode_project.views` chưa tồn tại.

- [ ] **Step 3: Tạo `src/geonode_project/views.py`**

```python
import os
from django.conf import settings
from django.views.generic import TemplateView


class WindAppPortalView(TemplateView):
    template_name = "wind_management/app.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        dev_env = os.getenv("VITE_DEV_MODE")
        if dev_env is not None:
            context["vite_dev_mode"] = dev_env.lower() in ("true", "1", "yes")
        else:
            context["vite_dev_mode"] = getattr(settings, "DEBUG", False)
        return context
```

- [ ] **Step 4: Cập nhật `src/geonode_project/urls.py`**

```python
# -*- coding: utf-8 -*-
from django.urls import path, re_path
from geonode.urls import urlpatterns, handler500  # noqa
from .views import WindAppPortalView

urlpatterns = [
    path("wind-app/", WindAppPortalView.as_view(), name="wind_app_portal"),
    re_path(r"^wind-app/.*$", WindAppPortalView.as_view(), name="wind_app_portal_subpath"),
    re_path(r"^wind/app/.*$", WindAppPortalView.as_view(), name="wind_app_portal_alias"),
] + urlpatterns
```

- [ ] **Step 5: Chạy lại test để xác nhận PASS**

Chạy:
```powershell
.venv\Scripts\python -m pytest tests/test_portal_views.py
```
Kỳ vọng: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/geonode_project/views.py src/geonode_project/urls.py tests/test_portal_views.py
git commit -m "feat(portal): add WindAppPortalView with vite_dev_mode context and url routing"
```

---

### Task 4: Triển Khai Template `app.html` Hỗ Trợ Dual-Mode

**Files:**
- Create: `src/geonode_project/templates/wind_management/app.html`
- Test: `tests/test_template_render.py`

**Interfaces:**
- Consumes: Template base `page.html` của GeoNode, biến context `vite_dev_mode`, thông tin user từ `request`
- Produces: Giao diện mount React `#wind-app-root`

- [ ] **Step 1: Viết test kiểm tra render template**

Tạo `tests/test_template_render.py`:
```python
import pytest
from django.template.loader import render_to_string
from django.test import RequestFactory
from django.contrib.auth.models import AnonymousUser, User


def test_app_template_renders_dev_mode():
    factory = RequestFactory()
    request = factory.get("/wind-app/")
    request.user = AnonymousUser()
    
    html = render_to_string("wind_management/app.html", {
        "request": request,
        "vite_dev_mode": True,
    })
    assert 'id="wind-app-root"' in html
    assert 'http://localhost:5173/@vite/client' in html
    assert 'http://localhost:5173/src/main.jsx' in html


def test_app_template_renders_prod_mode():
    factory = RequestFactory()
    request = factory.get("/wind-app/")
    user = User(username="wind_admin", is_staff=True)
    request.user = user
    
    html = render_to_string("wind_management/app.html", {
        "request": request,
        "vite_dev_mode": False,
    })
    assert 'id="wind-app-root"' in html
    assert 'data-user="wind_admin"' in html
    assert 'data-is-staff="true"' in html
    assert 'wind_management/dist/wind_app.css' in html
    assert 'wind_management/dist/wind_app.js' in html
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Chạy:
```powershell
.venv\Scripts\python -m pytest tests/test_template_render.py
```
Kỳ vọng: FAIL vì `wind_management/app.html` chưa tồn tại.

- [ ] **Step 3: Tạo `src/geonode_project/templates/wind_management/app.html`**

```html
{% extends "page.html" %}
{% load i18n %}
{% load static %}

{% block page_class %}gn-catalogue gn-wind-page{% endblock %}

{% block extra_style %}
    {% block extra_head %}
        {% if vite_dev_mode %}
            <script type="module" src="http://localhost:5173/@vite/client"></script>
        {% else %}
            <link rel="stylesheet" href="{% static 'wind_management/dist/wind_app.css' %}">
        {% endif %}
    {% endblock %}
{% endblock %}

{% block container %}
    {% block content %}
    <div 
        id="wind-app-root"
        data-user="{{ request.user.username|default:'' }}"
        data-is-staff="{{ request.user.is_staff|yesno:'true,false' }}"
        data-is-authenticated="{{ request.user.is_authenticated|yesno:'true,false' }}"
        data-api-base="/wind/api/v1"
    >
        <div class="text-center" style="padding: 60px 20px;">
            <i class="fa fa-spinner fa-spin fa-3x" style="color: #0284c7;"></i>
            <p style="margin-top: 15px; color: #64748b; font-weight: 500;">
                {% trans "Đang tải hệ thống ứng dụng trắc gió..." %}
            </p>
        </div>
    </div>
    {% endblock %}
{% endblock %}

{% block ms_scripts %}
{% endblock %}

{% block scripts %}
    {{ block.super }}
    {% block extra_script %}
        {% if vite_dev_mode %}
            <script type="module" src="http://localhost:5173/src/main.jsx"></script>
        {% else %}
            <script type="module" src="{% static 'wind_management/dist/wind_app.js' %}"></script>
        {% endif %}
    {% endblock %}
{% endblock %}
```

- [ ] **Step 4: Chạy lại test để xác nhận PASS**

Chạy:
```powershell
.venv\Scripts\python -m pytest tests/test_template_render.py
```
Kỳ vọng: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/geonode_project/templates/wind_management/app.html tests/test_template_render.py
git commit -m "feat(templates): implement dual-mode app.html for vite dev and static prod"
```

---

### Task 5: Tích Hợp Snippets Navbar Dropdown và Homepage GeoNode

**Files:**
- Create: `src/geonode_project/templates/geonode-mapstore-client/snippets/brand_navbar.html`
- Create: `src/geonode_project/templates/geonode-mapstore-client/snippets/hero.html`
- Create: `src/geonode_project/templates/geonode-mapstore-client/snippets/head.html`
- Create: `src/geonode_project/templates/geonode-mapstore-client/snippets/footer.html`
- Test: `tests/test_snippets_syntax.py`

**Interfaces:**
- Consumes: Templates từ `D:\GeonodeBK\wind_management_app\wind_management\templates\geonode-mapstore-client\snippets\`
- Produces: Các snippet override mặc định của MapStore trong GeoNode

- [ ] **Step 1: Sao chép các tệp snippet từ bản gốc**

Chạy lệnh PowerShell:
```powershell
New-Item -ItemType Directory -Force -Path src\geonode_project\templates\geonode-mapstore-client\snippets
Copy-Item D:\GeonodeBK\wind_management_app\wind_management\templates\geonode-mapstore-client\snippets\brand_navbar.html src\geonode_project\templates\geonode-mapstore-client\snippets\brand_navbar.html
Copy-Item D:\GeonodeBK\wind_management_app\wind_management\templates\geonode-mapstore-client\snippets\hero.html src\geonode_project\templates\geonode-mapstore-client\snippets\hero.html
Copy-Item D:\GeonodeBK\wind_management_app\wind_management\templates\geonode-mapstore-client\snippets\head.html src\geonode_project\templates\geonode-mapstore-client\snippets\head.html
Copy-Item D:\GeonodeBK\wind_management_app\wind_management\templates\geonode-mapstore-client\snippets\footer.html src\geonode_project\templates\geonode-mapstore-client\snippets\footer.html
```

- [ ] **Step 2: Viết test kiểm tra cú pháp và cấu trúc snippets**

Tạo `tests/test_snippets_syntax.py`:
```python
from pathlib import Path
import pytest


def test_snippets_files_exist_and_non_empty():
    snippets_dir = Path("src/geonode_project/templates/geonode-mapstore-client/snippets")
    expected_files = ["brand_navbar.html", "hero.html", "head.html", "footer.html"]
    
    for filename in expected_files:
        f = snippets_dir / filename
        assert f.exists(), f"{filename} does not exist"
        content = f.read_text(encoding="utf-8")
        assert len(content) > 100, f"{filename} is empty or too short"
        assert "{% load" in content or "<" in content


def test_brand_navbar_contains_wind_links():
    navbar = Path("src/geonode_project/templates/geonode-mapstore-client/snippets/brand_navbar.html").read_text(encoding="utf-8")
    assert "/wind-app/#/stations" in navbar
    assert "/wind-app/#/grid" in navbar
    assert "/wind-app/#/farms" in navbar
    assert "/wind-app/#/statistics" in navbar


def test_hero_contains_kpi_and_search():
    hero = Path("src/geonode_project/templates/geonode-mapstore-client/snippets/hero.html").read_text(encoding="utf-8")
    assert "gn-wind-hero" in hero
    assert "gn-wind-kpi-container" in hero
    assert "gn-wind-features-grid" in hero
```

- [ ] **Step 3: Chạy test kiểm tra**

Chạy:
```powershell
.venv\Scripts\python -m pytest tests/test_snippets_syntax.py
```
Kỳ vọng: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/geonode_project/templates/geonode-mapstore-client/snippets/ tests/test_snippets_syntax.py
git commit -m "feat(homepage): integrate wind navbar dropdown and customized hero/head/footer snippets"
```

---

### Task 6: Kiểm Thử Toàn Diện & Xác Thực Build

**Files:**
- Test: Tất cả các file trong `tests/`
- Build output: `src/geonode_project/static/wind_management/dist/`

**Interfaces:**
- Consumes: Toàn bộ code đã hoàn thành ở các Tasks 1-5
- Produces: Báo cáo xác thực hoàn tất và code sẵn sàng sử dụng

- [ ] **Step 1: Chạy build production frontend**

Chạy:
```powershell
cd frontend; npm run build; cd ..
```
Kỳ vọng: Output build thành công xuất vào `src/geonode_project/static/wind_management/dist/`.

- [ ] **Step 2: Chạy toàn bộ test suite**

Chạy:
```powershell
.venv\Scripts\python -m pytest tests/
```
Kỳ vọng: Tất cả tests đều passed 100%.

- [ ] **Step 3: Kiểm tra Django System Check**

Chạy:
```powershell
.venv\Scripts\python apps/manage.py check
```
Kỳ vọng: `System check identified no issues (0 silenced).`

- [ ] **Step 4: Commit tổng kết**

```bash
git status
git commit -am "chore: complete frontend mount and geonode template integration"
```
