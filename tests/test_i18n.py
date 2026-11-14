import json
import os
import django
from django.conf import settings
from django.test import Client


def setup_django():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "geonode_project.settings")
    if not settings.configured:
        django.setup()
    else:
        try:
            django.setup()
        except RuntimeError:
            pass


def test_i18n_settings():
    setup_django()
    assert settings.LANGUAGE_CODE == "vi"
    assert settings.TIME_ZONE == "Asia/Ho_Chi_Minh"
    
    lang_dict = dict(settings.LANGUAGES)
    assert "vi-vn" in lang_dict
    assert "en-us" in lang_dict
    assert lang_dict["vi-vn"] == "Tiếng Việt"
    assert lang_dict["en-us"] == "English"


def test_mapstore_translation_files():
    setup_django()
    from geonode_project.settings import LOCAL_ROOT
    static_mapstore = os.path.join(LOCAL_ROOT, "static", "mapstore")
    
    gn_file = os.path.join(static_mapstore, "gn-translations", "data.vi-VN.json")
    ms_file = os.path.join(static_mapstore, "ms-translations", "data.vi-VN.json")
    cookie_file = os.path.join(static_mapstore, "ms-translations", "fragments", "cookie", "cookieDetails-vi-VN.html")
    
    assert os.path.exists(gn_file)
    assert os.path.exists(ms_file)
    assert os.path.exists(cookie_file)
    
    with open(gn_file, encoding="utf-8") as f:
        gn_data = json.load(f)
    assert gn_data.get("locale") == "vi-VN"
    assert "messages" in gn_data
    assert "gnhome" in gn_data["messages"]
    
    with open(ms_file, encoding="utf-8") as f:
        ms_data = json.load(f)
    assert ms_data.get("locale") == "vi-VN"
    assert "messages" in ms_data


def test_locale_gettext_files():
    setup_django()
    from geonode_project.settings import LOCAL_ROOT
    locale_dir = os.path.join(LOCAL_ROOT, "locale", "vi", "LC_MESSAGES")
    
    po_file = os.path.join(locale_dir, "django.po")
    mo_file = os.path.join(locale_dir, "django.mo")
    
    assert os.path.exists(po_file)
    assert os.path.exists(mo_file)
    assert os.path.getsize(mo_file) > 0
    
    with open(po_file, encoding="utf-8") as f:
        po_content = f.read()
    assert 'msgstr "Mục yêu thích"' in po_content
    assert 'msgstr "Tất cả tài nguyên"' in po_content


def test_homepage_language_and_switching():
    setup_django()
    client = Client(SERVER_NAME="localhost")
    
    # 1. Default request
    res = client.get("/")
    assert res.status_code == 200
    content = res.content.decode("utf-8")
    assert "languageCode: 'vi-vn'" in content
    assert "gn-language-selector" in content
    
    # 2. Switch language to English
    res_switch = client.post("/i18n/setlang/", {"language": "en-us"})
    assert res_switch.status_code == 302
    assert client.cookies.get("django_language").value == "en-us"
    
    # 3. GET with English language cookie
    res_en = client.get("/")
    assert res_en.status_code == 200
    content_en = res_en.content.decode("utf-8")
    assert 'data-lang-code="vi-vn"' in content_en
    
    # 4. Switch back to Vietnamese
    res_switch_vi = client.post("/i18n/setlang/", {"language": "vi-vn"})
    assert res_switch_vi.status_code == 302
    assert client.cookies.get("django_language").value == "vi-vn"
