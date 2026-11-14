import os
import django
from django.conf import settings


def test_installed_apps_and_cors():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "configs.settings")
    django.setup()

    # Core third-party apps
    assert "rest_framework" in settings.INSTALLED_APPS
    assert "rest_framework_gis" in settings.INSTALLED_APPS
    assert "django_filters" in settings.INSTALLED_APPS
    assert "corsheaders" in settings.INSTALLED_APPS
    assert "django_celery_beat" in settings.INSTALLED_APPS

    # Wind micro-apps
    assert "wind_core" in settings.INSTALLED_APPS
    assert "wind_stations" in settings.INSTALLED_APPS
    assert "wind_raster" in settings.INSTALLED_APPS
    assert "wind_energy" in settings.INSTALLED_APPS
    assert "wind_events" in settings.INSTALLED_APPS
    assert "wind_cds" in settings.INSTALLED_APPS

    # Middleware
    assert "corsheaders.middleware.CorsMiddleware" in settings.MIDDLEWARE

    # CORS settings
    assert getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False) is True

    # REST Framework settings
    assert "DEFAULT_PAGINATION_CLASS" in settings.REST_FRAMEWORK
    assert "DEFAULT_FILTER_BACKENDS" in settings.REST_FRAMEWORK


if __name__ == "__main__":
    test_installed_apps_and_cors()
    print("test_installed_apps_and_cors passed successfully.")
