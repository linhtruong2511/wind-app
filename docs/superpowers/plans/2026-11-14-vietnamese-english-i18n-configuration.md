# Vietnamese and English i18n Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port full Vietnamese and English translation configuration from `D:\GeonodeBK\wind_management_app` to `d:\Jobs\Wind\wind-management`, making Vietnamese the default language with seamless English switching.

**Architecture:** Copy MapStore translations (`data.vi-VN.json`, cookie fragment) into `src/geonode_project/static/mapstore/`, copy Django gettext `.po`/`.mo` into `src/geonode_project/locale/vi/LC_MESSAGES/`, add `search_bar.html` snippet override, configure `MAPSTORE_DEFAULT_LANGUAGES` and safe `LANGUAGES` evaluation in `src/geonode_project/settings.py`, configure `.env`, sync `apps/configs/settings.py`, and run Docker compilation and static collection commands.

**Tech Stack:** Python, Django 5.x/GeoNode 5.1.0, Docker Compose, MapStore 2 JSON i18n, Gettext PO/MO.

## Global Constraints

- DO NOT run python or django-admin management commands directly on the host machine. All Django commands MUST run inside the Docker container (`docker compose exec django ...`).
- DO NOT run `npm run compile`.
- Preserve existing configurations and template overrides in `src/geonode_project`.
- Ensure clean fallback to English for any missing translation keys.

---

### Task 1: Port MapStore Client Vietnamese Translation Files

**Files:**
- Create: `src/geonode_project/static/mapstore/gn-translations/data.vi-VN.json`
- Create: `src/geonode_project/static/mapstore/ms-translations/data.vi-VN.json`
- Create: `src/geonode_project/static/mapstore/ms-translations/fragments/cookie/cookieDetails-vi-VN.html`

**Interfaces:**
- Consumes: Files from `D:\GeonodeBK\wind_management_app\geonode\static\mapstore\`.
- Produces: Static JSON files served by Nginx at `/static/mapstore/gn-translations/data.vi-VN.json` and `/static/mapstore/ms-translations/data.vi-VN.json`.

- [ ] **Step 1: Create target directories**

Run:
```powershell
New-Item -ItemType Directory -Force -Path "src\geonode_project\static\mapstore\gn-translations"
New-Item -ItemType Directory -Force -Path "src\geonode_project\static\mapstore\ms-translations\fragments\cookie"
```
Expected: Directories created successfully.

- [ ] **Step 2: Copy translation files from backup**

Run:
```powershell
Copy-Item "D:\GeonodeBK\wind_management_app\geonode\static\mapstore\gn-translations\data.vi-VN.json" "src\geonode_project\static\mapstore\gn-translations\data.vi-VN.json"
Copy-Item "D:\GeonodeBK\wind_management_app\geonode\static\mapstore\ms-translations\data.vi-VN.json" "src\geonode_project\static\mapstore\ms-translations\data.vi-VN.json"
Copy-Item "D:\GeonodeBK\wind_management_app\geonode\static\mapstore\ms-translations\fragments\cookie\cookieDetails-vi-VN.html" "src\geonode_project\static\mapstore\ms-translations\fragments\cookie\cookieDetails-vi-VN.html"
```

- [ ] **Step 3: Validate copied JSON syntax**

Run:
```powershell
Get-Content -Raw "src\geonode_project\static\mapstore\gn-translations\data.vi-VN.json" | ConvertFrom-Json | Out-Null
Get-Content -Raw "src\geonode_project\static\mapstore\ms-translations\data.vi-VN.json" | ConvertFrom-Json | Out-Null
```
Expected: No errors (valid JSON).

- [ ] **Step 4: Commit translation static assets**

```bash
git add src/geonode_project/static/mapstore
git commit -m "feat(i18n): add MapStore Vietnamese translation assets and cookie fragment"
```

---

### Task 2: Port Django Gettext PO and MO Files

**Files:**
- Create: `src/geonode_project/locale/vi/LC_MESSAGES/django.po`
- Create: `src/geonode_project/locale/vi/LC_MESSAGES/django.mo`

**Interfaces:**
- Consumes: Gettext PO/MO from `D:\GeonodeBK\wind_management_app\geonode\locale\vi\LC_MESSAGES\`.
- Produces: Overridden Vietnamese translations loaded via `settings.LOCALE_PATHS`.

- [ ] **Step 1: Create locale directories**

Run:
```powershell
New-Item -ItemType Directory -Force -Path "src\geonode_project\locale\vi\LC_MESSAGES"
```

- [ ] **Step 2: Copy PO and MO files from backup**

Run:
```powershell
Copy-Item "D:\GeonodeBK\wind_management_app\geonode\locale\vi\LC_MESSAGES\django.po" "src\geonode_project\locale\vi\LC_MESSAGES\django.po"
Copy-Item "D:\GeonodeBK\wind_management_app\geonode\locale\vi\LC_MESSAGES\django.mo" "src\geonode_project\locale\vi\LC_MESSAGES\django.mo"
```

- [ ] **Step 3: Verify PO file contains custom translated strings**

Run:
```powershell
Select-String -Path "src\geonode_project\locale\vi\LC_MESSAGES\django.po" -Pattern 'msgstr "Mục yêu thích"|msgstr "Tất cả tài nguyên"'
```
Expected: Matches found.

- [ ] **Step 4: Commit locale files**

```bash
git add src/geonode_project/locale
git commit -m "feat(i18n): add Django Vietnamese gettext po and mo files"
```

---

### Task 3: Add Search Bar Template Snippet Override

**Files:**
- Create: `src/geonode_project/templates/geonode-mapstore-client/snippets/search_bar.html`

**Interfaces:**
- Consumes: Django `django.templatetags.i18n`.
- Produces: Navbar search bar input with translated placeholder `{% trans "Search" %}`.

- [ ] **Step 1: Copy `search_bar.html` from backup**

Run:
```powershell
Copy-Item "D:\GeonodeBK\wind_management_app\geonode_mapstore_client\templates\geonode-mapstore-client\snippets\search_bar.html" "src\geonode_project\templates\geonode-mapstore-client\snippets\search_bar.html"
```

- [ ] **Step 2: Verify `search_bar.html` content**

Verify the file contains `{% load i18n %}` and `placeholder="{% trans "Search" %}"`.

- [ ] **Step 3: Commit template snippet**

```bash
git add src/geonode_project/templates/geonode-mapstore-client/snippets/search_bar.html
git commit -m "feat(ui): add search_bar template snippet with i18n trans placeholder"
```

---

### Task 4: Configure Django Settings, Environment Variables, and Micro-apps

**Files:**
- Modify: `src/geonode_project/settings.py`
- Modify: `.env`
- Modify: `apps/configs/settings.py`

**Interfaces:**
- Consumes: `os.getenv("LANGUAGES")`, `os.getenv("LANGUAGE_CODE")`, `os.getenv("TIME_ZONE")`.
- Produces: `settings.MAPSTORE_DEFAULT_LANGUAGES` containing `("vi-vn", "Tiếng Việt")`, `settings.LANGUAGES` containing `vi-vn` and `en-us`, `settings.LANGUAGE_CODE = "vi-vn"`, `settings.TIME_ZONE = "Asia/Ho_Chi_Minh"`.

- [ ] **Step 1: Update `src/geonode_project/settings.py`**

In `src/geonode_project/settings.py`, import `ast`, set `TIME_ZONE = os.getenv("TIME_ZONE", "Asia/Ho_Chi_Minh")`, extend `MAPSTORE_DEFAULT_LANGUAGES` with `("vi-vn", "Tiếng Việt")`, implement robust `ast.literal_eval` with surrogate escape handling, and set `LANGUAGE_CODE = os.getenv("LANGUAGE_CODE", "vi-vn")`.

- [ ] **Step 2: Update `.env`**

Add or update in `.env`:
```env
LANGUAGE_CODE=vi-vn
LANGUAGES=(('vi-vn','Tiếng Việt'),('en-us','English'))
TIME_ZONE=Asia/Ho_Chi_Minh
```

- [ ] **Step 3: Update `apps/configs/settings.py`**

Update `apps/configs/settings.py`:
```python
LANGUAGE_CODE = os.getenv("LANGUAGE_CODE", "vi-vn")
TIME_ZONE = os.getenv("TIME_ZONE", "Asia/Ho_Chi_Minh")
```

- [ ] **Step 4: Commit configuration updates**

```bash
git add src/geonode_project/settings.py apps/configs/settings.py .env.sample
git commit -m "feat(i18n): configure Vietnamese as default language in settings and env"
```

---

### Task 5: Execute Docker Compilation, Static Collection, and Verification

**Files:**
- Output target: `/mnt/volumes/statics/static/mapstore/gn-translations/data.vi-VN.json`
- Output target: `/mnt/volumes/statics/static/mapstore/ms-translations/data.vi-VN.json`

**Interfaces:**
- Consumes: Django management commands inside `django` container.
- Produces: Recompiled `.mo` files, updated static assets in Nginx volume, restarted Django container.

- [ ] **Step 1: Compile Django gettext messages in Docker container**

Run:
```bash
docker compose exec django python manage.py compilemessages -l vi
```
Expected output: `processing file django.po in ...` with exit code 0.

- [ ] **Step 2: Run collectstatic to sync MapStore JSON translations**

Run:
```bash
docker compose exec django python manage.py collectstatic --noinput
```
Expected output: Static files copied/linked, including `mapstore/gn-translations/data.vi-VN.json`.

- [ ] **Step 3: Restart Django service**

Run:
```bash
docker compose restart django
```
Expected output: Container `django4wind` restarted and healthy.

- [ ] **Step 4: Verify Django settings in container**

Run:
```bash
docker compose exec django python manage.py shell -c "from django.conf import settings; print('LANG:', settings.LANGUAGE_CODE); print('LANGUAGES:', settings.LANGUAGES); print('TIME_ZONE:', settings.TIME_ZONE)"
```
Expected output:
`LANG: vi-vn`
`LANGUAGES: (('vi-vn', 'Tiếng Việt'), ('en-us', 'English'))`
`TIME_ZONE: Asia/Ho_Chi_Minh`

- [ ] **Step 5: Verify homepage HTML configuration**

Run:
```bash
docker compose exec django python -c "
import urllib.request
res = urllib.request.urlopen('http://localhost:8000/').read().decode('utf-8', errors='ignore')
print('Language code is vi-vn:', \"'languageCode': 'vi-vn'\" in res or '\"languageCode\":\"vi-vn\"' in res or \"'languageCode': 'vi'\" in res)
print('Dropdown has Tiếng Việt:', 'Tiếng Việt' in res)
print('Dropdown has English:', 'English' in res)
"
```
Expected output: All True.

- [ ] **Step 6: Verify Nginx static endpoint**

Run:
```bash
docker compose exec django curl -s "http://nginx/static/mapstore/gn-translations/data.vi-VN.json" | head -n 10
```
Expected output: Valid JSON with `"locale": "vi-VN"`.
