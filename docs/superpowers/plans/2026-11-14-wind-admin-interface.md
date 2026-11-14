# WindHUB Admin Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete fullscreen React-based Admin interface with a vertical sidebar navbar for managing all `wind_*` data modules, integrated with the GeoNode WindHUB menu and protected by two-tier admin permissions.

**Architecture:** Single React SPA integrating a dedicated Fullscreen Shell (`wind-admin-fullscreen-active`) that overrides GeoNode page chrome for `/admin/*` routes. Features a collapsible vertical sidebar (`AdminSidebar`), topbar breadcrumb navigation (`AdminTopbar`), client-side `AdminRouteGuard` checking `isStaff || isSuperuser`, and DRF ViewSets reinforced with `IsAdminUserOrReadOnly` permissions alongside custom endpoints for NetCDF upload and Excel/CSV imports.

**Tech Stack:** React 18, React Router v6, OpenLayers, Axios, Vite, Django 6.1 (GeoDjango / DRF), Celery, Docker Compose.

## Global Constraints

- DO NOT run python commands on the local host; ALWAYS run inside Docker container (`docker compose exec wind_be python ...` or `docker compose exec django python ...`).
- Respect existing PEP 8, 120-char line limit, and Vietnamese interface copy terminology.
- Build output of Vite must output to `src/geonode_project/static/wind_management/dist/`.
- All mutation endpoints (POST/PUT/PATCH/DELETE) must enforce Django `request.user.is_staff` permission.

---

### Task 1: Backend Admin Permissions & Custom Action Endpoints

**Files:**
- Modify: `apps/wind_core/utils.py`
- Modify: `apps/wind_core/views.py`
- Modify: `apps/wind_raster/views.py`
- Modify: `apps/wind_stations/views.py`
- Modify: `apps/wind_energy/views.py`
- Create: `apps/tests/test_admin_endpoints.py`

**Interfaces:**
- Consumes: `wind_raster.services.raster_ingest.ingest_netcdf`, `wind_stations.models.Observation`, `wind_core.models.IngestionLog`
- Produces:
  - Permission class `IsAdminUserOrReadOnly`
  - Endpoint `POST /wind/api/v1/raster-granules/upload/`
  - Endpoint `POST /wind/api/v1/observations/import_file/`
  - Endpoint `GET /wind/api/v1/datasets/dashboard-stats/`

- [x] **Step 1: Write tests for Admin permissions and custom endpoints**

Create `apps/tests/test_admin_endpoints.py`:
```python
import io
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from wind_core.models import Dataset

User = get_user_model()

class AdminEndpointsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.normal_user = User.objects.create_user(username="normal", password="password123")
        self.admin_user = User.objects.create_superuser(username="admin", password="password123", email="admin@test.com")
        self.dataset = Dataset.objects.create(code="TEST_DS", name="Test Dataset", category="GRIDDED")

    def test_dashboard_stats_requires_admin(self):
        response = self.client.get("/wind/api/v1/datasets/dashboard-stats/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/wind/api/v1/datasets/dashboard-stats/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("total_stations", response.data)
        self.assertIn("total_granules", response.data)

    def test_station_mutation_permission(self):
        payload = {"station_code": "ST_TEST", "name": "Station Test", "geom": "POINT(106 10)", "is_active": True}
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.post("/wind/api/v1/stations/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post("/wind/api/v1/stations/", payload, format="json")
        self.assertIn(response.status_code, [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST])
```

- [x] **Step 2: Run test in Docker to verify it fails**

Run: `docker compose exec wind_be python manage.py test tests.test_admin_endpoints`
Expected: FAIL with 404 or 403 because endpoints are not yet registered.

- [x] **Step 3: Implement `IsAdminUserOrReadOnly` in `apps/wind_core/utils.py`**

Add to `apps/wind_core/utils.py`:
```python
from rest_framework import permissions

class IsAdminUserOrReadOnly(permissions.BasePermission):
    """Allow safe GET/HEAD/OPTIONS for all, require staff/superuser for write operations."""
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and (request.user.is_staff or request.user.is_superuser))
```

- [x] **Step 4: Implement `dashboard-stats` action in `apps/wind_core/views.py`**

Add to `DatasetViewSet` in `apps/wind_core/views.py`:
```python
    @action(detail=False, methods=["get"], url_path="dashboard-stats", permission_classes=[permissions.IsAdminUser])
    def dashboard_stats(self, request):
        from wind_stations.models import Station, Observation
        from wind_raster.models import RasterGranuleIndex
        from wind_energy.models import WindFarm, WindTurbine
        from wind_cds.models import CDSDownloadJob
        from wind_core.models import IngestionLog

        data = {
            "total_stations": Station.objects.count(),
            "active_stations": Station.objects.filter(is_active=True).count(),
            "total_observations": Observation.objects.count(),
            "total_granules": RasterGranuleIndex.objects.count(),
            "total_farms": WindFarm.objects.count(),
            "total_turbines": WindTurbine.objects.count(),
            "active_cds_jobs": CDSDownloadJob.objects.filter(status="RUNNING").count(),
            "recent_logs": list(
                IngestionLog.objects.order_by("-started_at")[:8].values(
                    "id", "dataset__name", "source_file", "status", "records_processed", "error_message", "started_at"
                )
            ),
        }
        return Response(data)
```

- [x] **Step 5: Implement `upload` action in `apps/wind_raster/views.py`**

Add action in `RasterGranuleIndexViewSet` in `apps/wind_raster/views.py`:
```python
    @action(detail=False, methods=["post"], url_path="upload", permission_classes=[permissions.IsAdminUser])
    def upload_raster(self, request):
        uploaded_file = request.FILES.get("file")
        dataset_id = request.data.get("dataset_id")
        if not uploaded_file:
            return Response({"error": "Vui lòng chọn tệp .nc hoặc .zip."}, status=status.HTTP_400_BAD_REQUEST)
        
        from wind_core.models import Dataset, IngestionLog
        dataset = Dataset.objects.filter(id=dataset_id).first()
        if not dataset:
            return Response({"error": "Bộ dữ liệu không tồn tại."}, status=status.HTTP_400_BAD_REQUEST)

        import tempfile
        import os
        from wind_raster.services.raster_ingest import ingest_netcdf

        suffix = os.path.splitext(uploaded_file.name)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            for chunk in uploaded_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        log = IngestionLog.objects.create(dataset=dataset, source_file=uploaded_file.name, status="RUNNING")
        try:
            result = ingest_netcdf(tmp_path, dataset)
            log.status = "SUCCESS"
            log.records_processed = result.granules
            log.save()
            return Response({
                "message": f"Nạp thành công {result.granules} granule(s).",
                "granules": result.granules,
                "variables": result.variables,
            })
        except Exception as e:
            log.status = "FAILED"
            log.error_message = str(e)
            log.save()
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
```

- [x] **Step 6: Update `StationViewSet` to `ModelViewSet` and add `import_file` to `ObservationViewSet`**

In `apps/wind_stations/views.py`:
Change `StationViewSet(viewsets.ReadOnlyModelViewSet)` to `viewsets.ModelViewSet` with `permission_classes = [IsAdminUserOrReadOnly]`.
Add action in `ObservationViewSet`:
```python
    @action(detail=False, methods=["post"], url_path="import-file", permission_classes=[permissions.IsAdminUser])
    def import_file(self, request):
        uploaded_file = request.FILES.get("file")
        dry_run = request.data.get("dry_run", "false").lower() == "true"
        if not uploaded_file:
            return Response({"error": "Vui lòng chọn tệp CSV hoặc Excel."}, status=status.HTTP_400_BAD_REQUEST)
        
        import pandas as pd
        try:
            if uploaded_file.name.endswith(".csv"):
                df = pd.read_csv(uploaded_file)
            else:
                df = pd.read_excel(uploaded_file)
        except Exception as e:
            return Response({"error": f"Không thể đọc tệp: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        required_cols = ["station_code", "obs_time"]
        for col in required_cols:
            if col not in df.columns:
                return Response({"error": f"Thiếu cột bắt buộc: {col}"}, status=status.HTTP_400_BAD_REQUEST)

        if dry_run:
            preview = df.head(10).to_dict(orient="records")
            return Response({"valid": True, "total_rows": len(df), "preview": preview})

        from wind_stations.models import Station, Observation
        station_map = {s.station_code: s for s in Station.objects.all()}
        created_count = 0
        obs_to_create = []

        for _, row in df.iterrows():
            st = station_map.get(str(row["station_code"]).strip())
            if not st:
                continue
            obs_to_create.append(Observation(
                station=st,
                obs_time=pd.to_datetime(row["obs_time"]).to_pydatetime(),
                wind_speed=row.get("wind_speed"),
                wind_dir=row.get("wind_dir"),
                temp_2m=row.get("temp_2m"),
                humidity=row.get("humidity"),
                pressure=row.get("pressure"),
                rain_24h=row.get("rain_24h"),
            ))
            if len(obs_to_create) >= 2000:
                Observation.objects.bulk_create(obs_to_create, ignore_conflicts=True)
                created_count += len(obs_to_create)
                obs_to_create = []

        if obs_to_create:
            Observation.objects.bulk_create(obs_to_create, ignore_conflicts=True)
            created_count += len(obs_to_create)

        return Response({"message": f"Đã nạp {created_count} bản ghi quan trắc thành công."})
```

- [x] **Step 7: Run test to verify it passes**

Run: `docker compose exec wind_be python manage.py test tests.test_admin_endpoints`
Expected: PASS (2 tests pass).

- [x] **Step 8: Commit Task 1**

```bash
git add apps/wind_core/utils.py apps/wind_core/views.py apps/wind_raster/views.py apps/wind_stations/views.py apps/tests/test_admin_endpoints.py
git commit -m "feat(api): add admin permission guards and import/upload endpoints"
```

---

### Task 2: GeoNode Template Integration & Fullscreen CSS Shell

**Files:**
- Modify: `src/geonode_project/templates/geonode-mapstore-client/snippets/brand_navbar_default_right_menu_items.html`
- Modify: `src/geonode_project/templates/wind_management/app.html`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/styles/wind_hybrid.css`

**Interfaces:**
- Consumes: Django user session attributes (`request.user.is_superuser`, `request.user.is_staff`)
- Produces:
  - `config.isSuperuser` passed to `App.jsx`
  - `.wind-admin-fullscreen-active` CSS rules in `wind_hybrid.css`
  - Updated GeoNode WindHUB menu link pointing to `/wind-app/#/admin`

- [x] **Step 1: Update WindHUB menu item in `brand_navbar_default_right_menu_items.html`**

Update lines 26-28 of `src/geonode_project/templates/geonode-mapstore-client/snippets/brand_navbar_default_right_menu_items.html`:
```html
                    {% if request.user.is_staff or request.user.is_superuser %}
                        <li><a href="/admin/">{% trans "Admin" %}</a></li>
                        <li><a href="/wind-app/#/admin"><i class="fa fa-cogs" style="margin-right: 5px; color: #0284c7;"></i>WindHUB Admin</a></li>
                        <li><a href="{{ settings.GEOSERVER_WEB_UI_LOCATION }}">{% trans "GeoServer" %}</a></li>
                        <li role="separator" class="divider"></li>
                    {% endif %}
```

- [x] **Step 2: Update container attributes in `src/geonode_project/templates/wind_management/app.html`**

In `src/geonode_project/templates/wind_management/app.html`, add `data-is-superuser`:
```html
    <div 
        id="wind-app-root"
        data-user="{{ request.user.username|default:'' }}"
        data-is-staff="{{ request.user.is_staff|yesno:'true,false' }}"
        data-is-superuser="{{ request.user.is_superuser|yesno:'true,false' }}"
        data-is-authenticated="{{ request.user.is_authenticated|yesno:'true,false' }}"
        data-api-base="/wind/api/v1"
    >
```

- [x] **Step 3: Update `frontend/src/main.jsx`**

Read `isSuperuser` dataset property:
```javascript
        const config = {
            user: container.dataset.user || '',
            isStaff: container.dataset.isStaff === 'true',
            isSuperuser: container.dataset.isSuperuser === 'true',
            isAuthenticated: container.dataset.isAuthenticated === 'true',
            apiBase: container.dataset.apiBase || '/wind/api/v1'
        };
```

- [x] **Step 4: Add Fullscreen Shell & Sidebar styles in `frontend/src/styles/wind_hybrid.css`**

Add at the end of `frontend/src/styles/wind_hybrid.css`:
```css
/* ============================================================
   WINDHUB ADMIN FULLSCREEN SHELL & VERTICAL SIDEBAR LAYOUT
   ============================================================ */
body.wind-admin-fullscreen-active #gn-brand-navbar,
body.wind-admin-fullscreen-active footer,
body.wind-admin-fullscreen-active #gn-brand-navbar-bottom {
    display: none !important;
}

body.wind-admin-fullscreen-active #wind-app-root {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 99999 !important;
    margin: 0 !important;
    padding: 0 !important;
    background-color: #0f172a !important;
    overflow: hidden !important;
}

.wind-admin-layout {
    display: flex;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background-color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.wind-admin-sidebar {
    width: 260px;
    height: 100%;
    background-color: #0f172a;
    border-right: 1px solid #1e293b;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: width 0.2s ease-in-out;
}

.wind-admin-sidebar.collapsed {
    width: 72px;
}

.wind-admin-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background-color: #f8fafc;
}

.wind-admin-topbar {
    height: 56px;
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    flex-shrink: 0;
}

.wind-admin-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
}
```

- [x] **Step 5: Commit Task 2**

```bash
git add src/geonode_project/templates/ frontend/src/main.jsx frontend/src/styles/wind_hybrid.css
git commit -m "feat(admin): configure dynamic fullscreen shell and WindHUB admin link"
```

---

### Task 3: React Admin Core Shell, Route Guard & Vertical Sidebar Layout

**Files:**
- Create: `frontend/src/components/admin/AdminRouteGuard.jsx`
- Create: `frontend/src/components/admin/AdminSidebar.jsx`
- Create: `frontend/src/components/admin/AdminTopbar.jsx`
- Create: `frontend/src/components/admin/AdminLayout.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `config.isStaff`, `config.isSuperuser`, `config.user`, React Router `NavLink`, `useLocation`
- Produces: `<AdminLayout />` wrapper, active menu styling, collapse toggle, permission denial screen

- [x] **Step 1: Create `frontend/src/components/admin/AdminRouteGuard.jsx`**

```jsx
import React from 'react';
import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';

const AdminRouteGuard = ({ config, children }) => {
    const isAuthorized = config && (config.isStaff || config.isSuperuser);

    if (!isAuthorized) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                padding: '20px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '64px', color: '#ef4444', marginBottom: '20px' }}>
                    <i className="fa fa-shield"></i>
                </div>
                <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '10px' }}>
                    403 - Truy cập bị từ chối
                </h1>
                <p style={{ color: '#94a3b8', maxWidth: '480px', marginBottom: '25px', lineHeight: 1.6 }}>
                    Bạn cần có đặc quyền Quản trị viên (Staff hoặc Superuser) để truy cập hệ thống quản trị WindHUB.
                </p>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <NavLink to="/stations" className="btn btn-primary" style={{ padding: '10px 20px', borderRadius: '6px' }}>
                        <i className="fa fa-arrow-left" style={{ marginRight: '8px' }}></i>Về trang bản đồ
                    </NavLink>
                    <a href="/account/login/?next=/wind-app/%23/admin" className="btn btn-default" style={{ padding: '10px 20px', borderRadius: '6px' }}>
                        Đăng nhập tài khoản khác
                    </a>
                </div>
            </div>
        );
    }

    return children;
};

AdminRouteGuard.propTypes = {
    config: PropTypes.object.isRequired,
    children: PropTypes.node.isRequired
};

export default AdminRouteGuard;
```

- [x] **Step 2: Create `frontend/src/components/admin/AdminSidebar.jsx`**

```jsx
import React from 'react';
import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
    { to: '/admin/dashboard', icon: 'fa-th-large', label: 'Tổng quan' },
    { to: '/admin/cds', icon: 'fa-cloud-download', label: 'Thu thập CDS ERA5' },
    { to: '/admin/rasters', icon: 'fa-cubes', label: 'Dữ liệu Lưới & NetCDF' },
    { to: '/admin/stations', icon: 'fa-map-marker', label: 'Trạm đo & Quan trắc' },
    { to: '/admin/farms', icon: 'fa-bolt', label: 'Trang trại & Tuabin' },
    { to: '/admin/datasets', icon: 'fa-database', label: 'Bộ dữ liệu & Phân quyền' },
];

const AdminSidebar = ({ collapsed, config }) => {
    return (
        <aside className={`wind-admin-sidebar ${collapsed ? 'collapsed' : ''}`}>
            {/* Header */}
            <div style={{
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                padding: collapsed ? '0 20px' : '0 20px',
                borderBottom: '1px solid #1e293b',
                gap: '12px'
            }}>
                <i className="fa fa-flag" style={{ fontSize: '22px', color: '#0284c7' }}></i>
                {!collapsed && (
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '15px', color: '#f8fafc', letterSpacing: '-0.3px' }}>
                            WINDHUB ADMIN
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Control Center</div>
                    </div>
                )}
            </div>

            {/* Menu items */}
            <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto' }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {NAV_ITEMS.map((item) => (
                        <li key={item.to}>
                            <NavLink
                                to={item.to}
                                style={({ isActive }) => ({
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    textDecoration: 'none',
                                    fontSize: '14px',
                                    fontWeight: isActive ? 600 : 500,
                                    color: isActive ? '#ffffff' : '#94a3b8',
                                    backgroundColor: isActive ? '#0284c7' : 'transparent',
                                    transition: 'all 0.15s ease',
                                    whiteSpace: 'nowrap'
                                })}
                                title={collapsed ? item.label : undefined}
                            >
                                <i className={`fa ${item.icon}`} style={{ width: '20px', textAlign: 'center', fontSize: '16px' }}></i>
                                {!collapsed && <span>{item.label}</span>}
                            </NavLink>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* Footer */}
            <div style={{ padding: '16px 12px', borderTop: '1px solid #1e293b' }}>
                {!collapsed && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', padding: '0 6px' }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: '#1e293b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#38bdf8',
                            fontWeight: 700
                        }}>
                            {(config.user || 'A')[0].toUpperCase()}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                {config.user || 'Admin'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#10b981' }}>Quản trị viên</div>
                        </div>
                    </div>
                )}
                <NavLink
                    to="/stations"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#1e293b',
                        color: '#cbd5e1',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 500
                    }}
                    title="Về cổng bản đồ công cộng"
                >
                    <i className="fa fa-sign-out" style={{ width: '16px', textAlign: 'center' }}></i>
                    {!collapsed && <span>Về cổng bản đồ</span>}
                </NavLink>
            </div>
        </aside>
    );
};

AdminSidebar.propTypes = {
    collapsed: PropTypes.bool.isRequired,
    config: PropTypes.object.isRequired
};

export default AdminSidebar;
```

- [x] **Step 3: Create `frontend/src/components/admin/AdminTopbar.jsx`**

```jsx
import React from 'react';
import PropTypes from 'prop-types';
import { useLocation, NavLink } from 'react-router-dom';

const ROUTE_TITLES = {
    '/admin': 'Tổng quan',
    '/admin/dashboard': 'Tổng quan hệ thống',
    '/admin/cds': 'Quản lý thu thập CDS ERA5',
    '/admin/rasters': 'Quản lý Dữ liệu Lưới & Tệp NetCDF',
    '/admin/stations': 'Quản lý Trạm đo & Số liệu quan trắc',
    '/admin/farms': 'Quản lý Trang trại gió & Tuabin',
    '/admin/datasets': 'Bộ dữ liệu & Phân quyền truy cập',
};

const AdminTopbar = ({ collapsed, onToggleSidebar, config }) => {
    const location = useLocation();
    const title = ROUTE_TITLES[location.pathname] || 'Quản trị';

    return (
        <header className="wind-admin-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                    onClick={onToggleSidebar}
                    className="btn btn-default"
                    style={{ border: 'none', background: 'transparent', padding: '6px 10px', fontSize: '16px', color: '#475569' }}
                    title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
                >
                    <i className={`fa ${collapsed ? 'fa-indent' : 'fa-outdent'}`}></i>
                </button>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>WindHUB Admin</span>
                    <span style={{ margin: '0 8px' }}>/</span>
                    <span style={{ color: '#0284c7', fontWeight: 500 }}>{title}</span>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#10b981', background: '#ecfdf5', padding: '4px 10px', borderRadius: '12px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                    <span>wind_be: Online</span>
                </div>
                <NavLink to="/stations" className="btn btn-sm btn-outline-secondary" style={{ fontSize: '12px', borderRadius: '6px' }}>
                    <i className="fa fa-map" style={{ marginRight: '6px' }}></i>Xem bản đồ
                </NavLink>
            </div>
        </header>
    );
};

AdminTopbar.propTypes = {
    collapsed: PropTypes.bool.isRequired,
    onToggleSidebar: PropTypes.func.isRequired,
    config: PropTypes.object.isRequired
};

export default AdminTopbar;
```

- [x] **Step 4: Create `frontend/src/components/admin/AdminLayout.jsx`**

```jsx
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminTopbar from './AdminTopbar';

const AdminLayout = ({ config }) => {
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        document.body.classList.add('wind-admin-fullscreen-active');
        return () => {
            document.body.classList.remove('wind-admin-fullscreen-active');
        };
    }, []);

    return (
        <div className="wind-admin-layout">
            <AdminSidebar collapsed={collapsed} config={config} />
            <div className="wind-admin-main">
                <AdminTopbar collapsed={collapsed} onToggleSidebar={() => setCollapsed(!collapsed)} config={config} />
                <main className="wind-admin-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

AdminLayout.propTypes = {
    config: PropTypes.object.isRequired
};

export default AdminLayout;
```

- [x] **Step 5: Register Admin routes in `frontend/src/App.jsx`**

Update `frontend/src/App.jsx` to register `/admin/*` routes wrapped in `<AdminRouteGuard>`:
```jsx
import AdminRouteGuard from './components/admin/AdminRouteGuard';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboardRoute from './routes/admin/AdminDashboardRoute';
import AdminCdsRoute from './routes/admin/AdminCdsRoute';
import AdminRastersRoute from './routes/admin/AdminRastersRoute';
import AdminStationsRoute from './routes/admin/AdminStationsRoute';
import AdminFarmsRoute from './routes/admin/AdminFarmsRoute';
import AdminDatasetsRoute from './routes/admin/AdminDatasetsRoute';
```
And inside `<Routes>`:
```jsx
    <Route
        path="/admin"
        element={
            <AdminRouteGuard config={config}>
                <AdminLayout config={config} />
            </AdminRouteGuard>
        }
    >
        <Route index element={<AdminDashboardRoute config={config} />} />
        <Route path="dashboard" element={<AdminDashboardRoute config={config} />} />
        <Route path="cds" element={<AdminCdsRoute config={config} />} />
        <Route path="rasters" element={<AdminRastersRoute config={config} />} />
        <Route path="stations" element={<AdminStationsRoute config={config} />} />
        <Route path="farms" element={<AdminFarmsRoute config={config} />} />
        <Route path="datasets" element={<AdminDatasetsRoute config={config} />} />
    </Route>
```

- [x] **Step 6: Commit Task 3**

```bash
git add frontend/src/components/admin/ frontend/src/App.jsx
git commit -m "feat(admin): create admin layout, sidebar navigation, and route guard"
```

---

### Task 4: React Admin Module Pages

**Files:**
- Create: `frontend/src/routes/admin/AdminDashboardRoute.jsx`
- Create: `frontend/src/routes/admin/AdminCdsRoute.jsx`
- Create: `frontend/src/routes/admin/AdminRastersRoute.jsx`
- Create: `frontend/src/routes/admin/AdminStationsRoute.jsx`
- Create: `frontend/src/routes/admin/AdminFarmsRoute.jsx`
- Create: `frontend/src/routes/admin/AdminDatasetsRoute.jsx`

**Interfaces:**
- Consumes: `/wind/api/v1/datasets/dashboard-stats/`, `/wind/api/v1/cds-credentials/`, `/wind/api/v1/cds-jobs/`, `/wind/api/v1/raster-granules/upload/`, `/wind/api/v1/observations/import-file/`
- Produces: 6 complete functional admin views

- [x] **Step 1: Create `frontend/src/routes/admin/AdminDashboardRoute.jsx`**
Build KPI cards (Trạm đo, Lưới raster, Tác vụ CDS, Trang trại gió) and the table of recent `IngestionLog` items with status badges.

- [x] **Step 2: Create `frontend/src/routes/admin/AdminCdsRoute.jsx`**
Build 3 tabs: Credentials (with "Test connection" action), Download Jobs (list & modal form to configure area and schedule), and Job Runs history.

- [x] **Step 3: Create `frontend/src/routes/admin/AdminRastersRoute.jsx`**
Build Drag & Drop upload zone for `.nc` / `.zip` files with upload progress bar, and Granule Index filterable data table.

- [x] **Step 4: Create `frontend/src/routes/admin/AdminStationsRoute.jsx`**
Build Station Management table + Observation Excel/CSV batch importer with preview and validation.

- [x] **Step 5: Create `frontend/src/routes/admin/AdminFarmsRoute.jsx`**
Build Wind Farm list, capacity editor, and Wind Turbine batch coordinate importer.

- [x] **Step 6: Create `frontend/src/routes/admin/AdminDatasetsRoute.jsx`**
Build Dataset metadata list, DatasetVariable component configuration, and Group Access Policy matrix.

- [x] **Step 7: Commit Task 4**


```bash
git add frontend/src/routes/admin/
git commit -m "feat(admin): implement 6 admin module management views"
```

---

### Task 5: Frontend Build & Verification

**Files:**
- Run: `npm run build` in `frontend/`
- Verify: `src/geonode_project/static/wind_management/dist/wind_app.js` and `wind_app.css`
- Run: Django backend test suite via Docker

- [x] **Step 1: Execute Vite production build**

Run: `cd frontend; npm run build`
Expected output: Built successfully without errors, producing `src/geonode_project/static/wind_management/dist/wind_app.js`.

- [x] **Step 2: Run backend tests in Docker**

Run: `docker compose exec wind_be python manage.py test tests`
Expected output: All tests pass.

- [x] **Step 3: Verify Admin route accessibility**

Confirm that navigating to `http://localhost/wind-app/#/admin` loads the fullscreen admin layout for staff users, and blocks unauthenticated/non-staff users with 403 Forbidden.

- [x] **Step 4: Commit Task 5**

```bash
git add src/geonode_project/static/wind_management/dist/
git commit -m "build: compile frontend bundle including admin portal"
```
