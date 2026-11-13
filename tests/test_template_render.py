import os
from pathlib import Path
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "configs.settings")
django.setup()

from django.conf import settings
from django.template.loader import render_to_string
from django.test import RequestFactory
from django.contrib.auth.models import AnonymousUser, User

# Ensure test template directory is included
test_templates_dir = str(Path(__file__).parent / "templates")
if test_templates_dir not in settings.TEMPLATES[0]["DIRS"]:
    settings.TEMPLATES[0]["DIRS"].append(test_templates_dir)


def test_app_template_exists():
    template_path = Path("src/geonode_project/templates/wind_management/app.html")
    assert template_path.exists(), "app.html must exist"
    content = template_path.read_text(encoding="utf-8")
    assert 'id="wind-app-root"' in content
    assert 'data-user="{{ request.user.username|default:\'\' }}"' in content
    assert 'data-is-staff="{{ request.user.is_staff|yesno:\'true,false\' }}"' in content
    assert 'data-is-authenticated="{{ request.user.is_authenticated|yesno:\'true,false\' }}"' in content
    assert 'data-api-base="/wind/api/v1"' in content


def test_app_template_renders_dev_mode():
    factory = RequestFactory()
    request = factory.get("/wind-app/")
    user = User(username="test_wind_user", is_staff=True)
    request.user = user

    html = render_to_string("wind_management/app.html", {
        "request": request,
        "vite_dev_mode": True,
    })

    assert 'id="wind-app-root"' in html
    assert 'http://localhost:5173/@vite/client' in html
    assert 'http://localhost:5173/src/main.jsx' in html
    assert 'data-user="test_wind_user"' in html
    assert 'data-is-staff="true"' in html
    assert 'data-is-authenticated="true"' in html


def test_app_template_renders_prod_mode():
    factory = RequestFactory()
    request = factory.get("/wind-app/")
    request.user = AnonymousUser()

    html = render_to_string("wind_management/app.html", {
        "request": request,
        "vite_dev_mode": False,
    })

    assert 'id="wind-app-root"' in html
    assert 'wind_management/dist/wind_app.css' in html
    assert 'wind_management/dist/wind_app.js' in html
    assert 'http://localhost:5173' not in html
    assert 'data-user=""' in html
    assert 'data-is-staff="false"' in html
    assert 'data-is-authenticated="false"' in html
