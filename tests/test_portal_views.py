import os
import django
from django.conf import settings
from django.test import RequestFactory


def setup_django():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "configs.settings")
    if not settings.configured:
        django.setup()
    else:
        try:
            django.setup()
        except RuntimeError:
            pass


def test_portal_view_context_dev_mode():
    setup_django()
    from src.geonode_project.views import WindAppPortalView
    
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


def test_geonode_project_urls_structure():
    setup_django()
    from src.geonode_project import urls
    
    # Check urlpatterns in geonode_project.urls has wind_app_portal
    names = [getattr(pattern, "name", None) for pattern in urls.urlpatterns]
    assert "wind_app_portal" in names
    assert "wind_app_portal_subpath" in names
    assert "wind_app_portal_alias" in names
