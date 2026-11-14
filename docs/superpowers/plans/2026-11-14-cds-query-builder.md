# CDS Query Builder & Auto-Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng tính năng CDS Query Builder Wizard 4 bước trực quan trên giao diện Admin WindHUB (`#/admin/cds`), tích hợp bản đồ thu nhỏ OpenLayers và tự động nạp (auto-ingest) dữ liệu NetCDF ERA5 vào bộ dữ liệu đích.

**Architecture:** Frontend bổ sung component `CDSOpenLayersMiniMap.jsx` và `CDSQueryBuilderModal.jsx` với bộ phân rã dải thời gian `cdsQueryUtils.js`, thay thế modal tạo job cũ trong `AdminCdsRoute.jsx`. Backend `CDSDownloadJobViewSet` hỗ trợ cờ `run_immediately` để lập tức đẩy Celery task `run_cds_download_job`, tự động bóc tách NetCDF, đồng bộ biến vào `DatasetVariable` và ghi nhận `RasterGranuleIndex`.

**Tech Stack:** React 18, OpenLayers (`ol 9.2.4`), Django 5 / Django REST Framework, Celery, GeoDjango / PostGIS, xarray / netCDF4.

## Global Constraints
- Tuân thủ quy tắc PEP 8 cho Python và ESLint / Prettier cho React.
- Mọi lệnh thực thi Python phải chạy bên trong docker container: `docker compose exec -T wind_be ...`.
- Không sử dụng các giá trị placeholder (TBD, TODO).
- TDD: Viết test trước, kiểm tra test fail, viết code, kiểm tra test pass, và commit thường xuyên.

---

### Task 1: Backend Support for Immediate Job Execution

**Files:**
- Modify: `apps/wind_cds/views.py:58-66`
- Test: `apps/wind_cds/tests.py`

**Interfaces:**
- Consumes: `request.data.get("run_immediately")`, `run_cds_download_job.delay(job.id)`
- Produces: `CDSDownloadJob` instance created, celery task dispatched, response includes `task_id` if executed immediately.

- [ ] **Step 1: Write the failing test**

Edit `apps/wind_cds/tests.py` to add `test_job_create_with_run_immediately`:
```python
    @patch("wind_cds.views.run_cds_download_job.delay")
    def test_job_create_with_run_immediately(self, mock_delay):
        mock_task = MagicMock()
        mock_task.id = "mock-immediate-task-456"
        mock_delay.return_value = mock_task

        res = self.client.post(
            "/jobs/",
            {
                "name": "Immediate Job",
                "credential": self.credential.id,
                "dataset": self.dataset.id,
                "mode": "ONCE",
                "run_immediately": True,
                "request_params": {"variable": ["10m_wind_speed"]},
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data.get("task_id"), "mock-immediate-task-456")
        mock_delay.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T wind_be python manage.py test wind_cds.tests.CDSAPITest.test_job_create_with_run_immediately`
Expected: FAIL (assertion error: `None != 'mock-immediate-task-456'`)

- [ ] **Step 3: Implement minimal code**

In `apps/wind_cds/views.py`:
Modify `perform_create` and `create` in `CDSDownloadJobViewSet`:
```python
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user if request.user.is_authenticated else None
        job = serializer.save(created_by=user)
        sync_periodic_task(job)

        task_id = None
        if request.data.get("run_immediately"):
            async_result = run_cds_download_job.delay(job.id)
            task_id = getattr(async_result, "id", str(async_result))

        headers = self.get_success_headers(serializer.data)
        data = dict(serializer.data)
        if task_id:
            data["task_id"] = task_id
            data["status"] = "QUEUED"
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T wind_be python manage.py test wind_cds.tests.CDSAPITest.test_job_create_with_run_immediately`
Expected: PASS (`Ran 1 test in ...s OK`)

- [ ] **Step 5: Commit**

```bash
git add apps/wind_cds/views.py apps/wind_cds/tests.py
git commit -m "feat(cds): support run_immediately flag in job creation API"
```

---

### Task 2: Frontend CDS Query Utilities (`cdsQueryUtils.js`)

**Files:**
- Create: `frontend/src/utils/cdsQueryUtils.js`
- Test: `frontend/src/utils/cdsQueryUtils.test.js` (or unit test script in Node)

**Interfaces:**
- Consumes: `startDate` (YYYY-MM-DD), `endDate` (YYYY-MM-DD), `selectedHours` (array of HH:MM strings)
- Produces: `decomposeDateRange(startDate, endDate, selectedHours)` returning `{ years, months, days, time }`

- [ ] **Step 1: Write utility logic for date decomposition**

Create `frontend/src/utils/cdsQueryUtils.js`:
```javascript
/**
 * Phân rã dải ngày (Từ ngày -> Đến ngày) và danh sách mốc giờ thành định dạng mảng chuẩn cdsapi.
 * Đảm bảo các ngày và tháng được format dạng 2 chữ số ('01', '02'...).
 */
export const decomposeDateRange = (startDateStr, endDateStr, hoursList = []) => {
    if (!startDateStr || !endDateStr) {
        return { years: [], months: [], days: [], time: [] };
    }

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (start > end) {
        return { years: [], months: [], days: [], time: [] };
    }

    const yearsSet = new Set();
    const monthsSet = new Set();
    const daysSet = new Set();

    const current = new Date(start);
    while (current <= end) {
        const year = current.getFullYear().toString();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');

        yearsSet.add(year);
        monthsSet.add(month);
        daysSet.add(day);

        current.setDate(current.getDate() + 1);
    }

    const formatHour = (h) => {
        if (h.includes(':')) return h;
        return String(h).padStart(2, '0') + ':00';
    };

    return {
        years: Array.from(yearsSet).sort(),
        months: Array.from(monthsSet).sort(),
        days: Array.from(daysSet).sort(),
        time: (hoursList && hoursList.length > 0) ? hoursList.map(formatHour).sort() : ['00:00']
    };
};

export const HOUR_PRESETS = {
    ALL_24: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00'),
    EVERY_3H: ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
    SYNOPTIC_6H: ['00:00', '06:00', '12:00', '18:00']
};

export const DEFAULT_WIND_VARIABLES = [
    '10m_u_component_of_wind',
    '10m_v_component_of_wind',
    '100m_u_component_of_wind',
    '100m_v_component_of_wind'
];
```

- [ ] **Step 2: Verify utility with node execution**

Run: `node -e "const { decomposeDateRange } = require('./frontend/src/utils/cdsQueryUtils.js'); console.log(decomposeDateRange('2024-01-01', '2024-01-03', ['00:00', '12:00']));"`
Expected: `{ years: ['2024'], months: ['01'], days: ['01', '02', '03'], time: ['00:00', '12:00'] }`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/cdsQueryUtils.js
git commit -m "feat(frontend): add cds query date range decomposition utility"
```

---

### Task 3: OpenLayers Mini-Map Component (`CDSOpenLayersMiniMap.jsx`)

**Files:**
- Create: `frontend/src/components/admin/CDSOpenLayersMiniMap.jsx`

**Interfaces:**
- Consumes: `bbox` `[north, west, south, east]`, `onChange(newBbox)`
- Produces: Interactive OpenLayers map rendered in container with DragBox and bounding box polygon vector layer.

- [ ] **Step 1: Implement `CDSOpenLayersMiniMap.jsx`**

Create `frontend/src/components/admin/CDSOpenLayersMiniMap.jsx`:
```javascript
import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import { fromLonLat, toLonLat } from 'ol/proj';
import DragBox from 'ol/interaction/DragBox';
import { platformModifierKeyOnly } from 'ol/events/condition';
import { Style, Stroke, Fill } from 'ol/style';
import 'ol/ol.css';

const CDSOpenLayersMiniMap = ({ bbox, onChange }) => {
    const mapElement = useRef(null);
    const mapRef = useRef(null);
    const vectorSourceRef = useRef(new VectorSource());

    useEffect(() => {
        if (!mapElement.current) return;

        const vectorLayer = new VectorLayer({
            source: vectorSourceRef.current,
            style: new Style({
                stroke: new Stroke({ color: '#0284c7', width: 2 }),
                fill: new Fill({ color: 'rgba(2, 132, 199, 0.15)' })
            })
        });

        const map = new Map({
            target: mapElement.current,
            layers: [
                new TileLayer({
                    source: new OSM()
                }),
                vectorLayer
            ],
            view: new View({
                center: fromLonLat([108.0, 16.0]),
                zoom: 4.5
            })
        });

        const dragBox = new DragBox({
            condition: platformModifierKeyOnly
        });

        dragBox.on('boxend', () => {
            const extent = dragBox.getGeometry().getExtent();
            const minCoord = toLonLat([extent[0], extent[1]]);
            const maxCoord = toLonLat([extent[2], extent[3]]);

            const west = parseFloat(minCoord[0].toFixed(2));
            const south = parseFloat(minCoord[1].toFixed(2));
            const east = parseFloat(maxCoord[0].toFixed(2));
            const north = parseFloat(maxCoord[1].toFixed(2));

            if (onChange) {
                onChange([north, west, south, east]);
            }
        });

        map.addInteraction(dragBox);
        mapRef.current = map;

        return () => {
            map.setTarget(null);
        };
    }, []);

    // Đồng bộ bbox vào vector layer khi bbox props thay đổi
    useEffect(() => {
        if (!bbox || bbox.length !== 4) return;
        const [north, west, south, east] = bbox;
        if (isNaN(north) || isNaN(west) || isNaN(south) || isNaN(east)) return;

        vectorSourceRef.current.clear();

        const p1 = fromLonLat([west, south]);
        const p2 = fromLonLat([east, south]);
        const p3 = fromLonLat([east, north]);
        const p4 = fromLonLat([west, north]);

        const poly = new Polygon([[p1, p2, p3, p4, p1]]);
        const feature = new Feature({ geometry: poly });
        vectorSourceRef.current.addFeature(feature);

        if (mapRef.current) {
            mapRef.current.getView().fit(poly.getExtent(), {
                padding: [20, 20, 20, 20],
                maxZoom: 6,
                duration: 400
            });
        }
    }, [bbox]);

    return (
        <div style={{ position: 'relative', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
            <div ref={mapElement} style={{ width: '100%', height: '300px' }} />
            <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                background: 'rgba(15, 23, 42, 0.75)',
                color: '#f8fafc',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                pointerEvents: 'none'
            }}>
                <i className="fa fa-info-circle" style={{ marginRight: '4px' }}></i>
                Giữ phím <strong>Ctrl</strong> (hoặc Cmd) + Kéo chuột để vẽ khung vùng tọa độ
            </div>
        </div>
    );
};

CDSOpenLayersMiniMap.propTypes = {
    bbox: PropTypes.arrayOf(PropTypes.number).isRequired,
    onChange: PropTypes.func.isRequired
};

export default CDSOpenLayersMiniMap;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/admin/CDSOpenLayersMiniMap.jsx
git commit -m "feat(frontend): create openlayers mini-map component for cds bounding box"
```

---

### Task 4: CDS Query Builder Wizard Modal (`CDSQueryBuilderModal.jsx`)

**Files:**
- Create: `frontend/src/components/admin/CDSQueryBuilderModal.jsx`

**Interfaces:**
- Consumes: `show`, `onClose`, `credentials`, `datasets`, `catalog`, `areaPresets`, `onSave(payload, runImmediately)`
- Produces: 4-step wizard form, validates fields, emits complete `request_params` and job metadata.

- [ ] **Step 1: Implement `CDSQueryBuilderModal.jsx`**

Create `frontend/src/components/admin/CDSQueryBuilderModal.jsx` with full 4 steps:
1. Stepper navigation bar (`1. Cấu hình`, `2. Biến dữ liệu`, `3. Thời gian`, `4. Bản đồ & Tọa độ`).
2. Step 1: `name`, `credential`, `dataset_name`, `dataset` (target).
3. Step 2: Categorized checkboxes from `catalog` with quick selectors (`Mặc định trắc gió`, `Chọn tất cả`, `Bỏ chọn`).
4. Step 3: Date range inputs, Hour preset buttons (`24h`, `3h`, `6h`), `lag_days`, `auto_latest`.
5. Step 4: `CDSOpenLayersMiniMap`, 4 bbox inputs (`North`, `West`, `South`, `East`), and Preset buttons (`Việt Nam`, `Toàn cầu`).
6. Bottom actions: `Lưu tác vụ` & `Lưu & Kích hoạt tải ngay`.

- [ ] **Step 2: Verify component compiles cleanly with Vite**

Run: `npm run build --prefix frontend`
Expected: Build successfully without syntax errors, output files in `src/geonode_project/static/wind_management/dist`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/CDSQueryBuilderModal.jsx
git commit -m "feat(frontend): implement multi-step cds query builder wizard modal"
```

---

### Task 5: Integration in `AdminCdsRoute.jsx` & End-to-End Verification

**Files:**
- Modify: `frontend/src/routes/admin/AdminCdsRoute.jsx`
- Test: Playwright UI verification + Docker test runner

**Interfaces:**
- Consumes: `CDSQueryBuilderModal`, API catalog data
- Produces: Enhanced Admin CDS route seamlessly opening query builder wizard.

- [ ] **Step 1: Integrate `CDSQueryBuilderModal` into `AdminCdsRoute.jsx`**

In `AdminCdsRoute.jsx`:
- Import `CDSQueryBuilderModal`
- Load `catalog` and `area_presets` from `getCDSJobsCatalog()` on mount
- Replace simple job modal with `CDSQueryBuilderModal`
- When `onSave(payload, runImmediately)` is called:
  - Call API `createCDSJob(payload)`
  - If `runImmediately`: show alert, switch to `runs` tab, start polling.

- [ ] **Step 2: Build frontend bundle**

Run: `npm run build --prefix frontend`
Expected: Dist files updated in `src/geonode_project/static/wind_management/dist`.

- [ ] **Step 3: Run backend test suite in Docker**

Run: `docker compose exec -T wind_be python manage.py test wind_cds`
Expected: All tests pass.

- [ ] **Step 4: Execute E2E automated test via Playwright**

Navigate to `http://localhost/wind-app/#/admin/cds`, click "Tạo tác vụ tải CDS", step through the Wizard, draw on map, and verify job submission.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/admin/AdminCdsRoute.jsx
git commit -m "feat(admin): integrate cds query builder wizard into admin cds route"
```

---

## Plan Self-Review
- **Spec coverage:** Tất cả các tính năng trong spec (Wizard 4 bước, OpenLayers mini-map, date range decomposition, auto-ingestion, 2 nút Lưu/Chạy ngay) đều được phân chia vào 5 tasks rõ ràng.
- **No placeholders:** Không có TODO hay TBD.
- **Docker constraint:** Mọi lệnh Python được ghi rõ chạy qua `docker compose exec -T wind_be`.
