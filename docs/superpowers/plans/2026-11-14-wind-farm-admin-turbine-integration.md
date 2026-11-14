# Wind Farm Admin Turbine Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix API contract mismatch and UI synchronization for Wind Farm and Turbine management in WindHUB Admin, enabling admins to seamlessly create, view, filter, and delete turbines.

**Architecture:** 
1. Upgrade `WindTurbineSerializer` in DRF to accept frontend aliases (`capacity_mw`, `depth_m`), normalize status (`OPERATING` -> `OPERATIONAL`), auto-extract `latitude`/`longitude` from `geom` or string `point_id`, and provide safe defaults for required physical metrics (`wind_speed_100m`, `wind_direction`, `capacity_factor`).
2. Add `deleteTurbine` API endpoint client in `frontend/src/api/admin.js` and wire up the Action column with delete button in `AdminFarmsRoute.jsx`.
3. Fix turbine capacity display in `AdminFarmsRoute.jsx` and ensure `loadAll()` refreshes upon tab switching.

**Tech Stack:** Django 5 / Django REST Framework, GeoDjango / PostGIS, React 18, Playwright E2E.

---

### Task 1: Backend Serializer Upgrade for WindTurbine (`apps/wind_energy/serializers.py`)

**Files:**
- Modify: `apps/wind_energy/serializers.py:13-40`
- Test: `apps/tests/test_admin_endpoints.py`

**Interfaces:**
- Consumes: `payload = {"farm": id, "point_id": "TB_9999", "geom": "SRID=4326;POINT(105.7 9.2)", "capacity_mw": 4.0, "status": "OPERATING"}`
- Produces: `WindTurbine` instance with valid `point_id` (int), `latitude`, `longitude`, `predicted_power_mw`, `sea_depth`, `status="OPERATIONAL"`.

- [ ] **Step 1: Write backend test for turbine creation with frontend payload format**

In `apps/tests/test_admin_endpoints.py`:
```python
    def test_turbine_creation_with_frontend_contract(self):
        from wind_energy.models import WindFarm
        farm = WindFarm.objects.create(code="TEST_FARM_1", name="Test Farm 1")
        payload = {
            "farm": farm.id,
            "point_id": "TB_8888",
            "geom": "SRID=4326;POINT(105.748 9.245)",
            "capacity_mw": 4.5,
            "depth_m": 18.0,
            "status": "OPERATING",
        }
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post("/wind/api/v1/turbines/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["point_id"], 8888)
        self.assertEqual(response.data["predicted_power_mw"], 4.5)
        self.assertEqual(response.data["capacity_mw"], 4.5)
        self.assertEqual(response.data["status"], "OPERATIONAL")
```

- [ ] **Step 2: Run test in docker container to verify it fails**

Run: `docker compose exec -T wind_be python manage.py test apps.tests.test_admin_endpoints.AdminEndpointsTest.test_turbine_creation_with_frontend_contract`
Expected: FAIL with 400 Bad Request

- [ ] **Step 3: Update `WindTurbineSerializer` in `apps/wind_energy/serializers.py`**

Support:
- `capacity_mw`: FloatField alias on input/output
- Auto-extract `lat`/`lon` from `geom` or string `point_id`
- Normalize status `OPERATING` to `OPERATIONAL`
- Default values for missing environmental fields
- Add `delete` permission check

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T wind_be python manage.py test apps.tests.test_admin_endpoints.AdminEndpointsTest.test_turbine_creation_with_frontend_contract`
Expected: PASS

---

### Task 2: Frontend API Client & UI Component Update (`AdminFarmsRoute.jsx` & `admin.js`)

**Files:**
- Modify: `frontend/src/api/admin.js:148-157`
- Modify: `frontend/src/routes/admin/AdminFarmsRoute.jsx`

- [ ] **Step 1: Add `deleteTurbine` in `frontend/src/api/admin.js`**

```javascript
export const deleteTurbine = (id) => {
    return axios.delete(`${BASE_URL}/turbines/${id}/`, authConfig());
};
```

- [ ] **Step 2: Update `AdminFarmsRoute.jsx`**

1. Import `deleteTurbine`.
2. In `handleDeleteTurbine(id)`: prompt confirm and call `deleteTurbine(id)`.
3. In `table`:
   - Add column `Thao tác` with Delete button for each turbine.
   - Fix `Công suất (MW)` column to display `t.capacity_mw ?? t.predicted_power_mw ? `${t.capacity_mw ?? t.predicted_power_mw} MW` : '-'`.
4. Add `useEffect` on `activeTab` or call `loadAll()` when tab changes.

- [ ] **Step 3: Verify frontend bundle build/lint**

Run: `docker compose exec -T wind_be sh -c "cd /usr/src/frontend && npm run build --dry-run || true"` or verify Vite dev server loads changes cleanly.

---

### Task 3: Full E2E Automated Verification with Playwright

**Files:**
- Test via Playwright in browser

- [ ] **Step 1: Navigate to `/#/admin/farms` as Admin**
- [ ] **Step 2: Switch to "Danh sách Tuabin" tab**
- [ ] **Step 3: Click "Thêm tuabin gió", fill Lon/Lat/Capacity, and click "Lưu tuabin"**
- [ ] **Step 4: Verify green success banner "Thêm tuabin gió thành công!"**
- [ ] **Step 5: Verify turbine appears in table with correct capacity (4 MW) and status (OPERATIONAL)**
- [ ] **Step 6: Click Delete turbine button, confirm, and verify turbine is removed**
- [ ] **Step 7: Capture screenshot of successful turbine creation & deletion**
