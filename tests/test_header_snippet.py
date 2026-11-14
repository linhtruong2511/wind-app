from pathlib import Path
import pytest


def test_header_snippet_exists_and_handles_hashes():
    header_path = Path("src/geonode_project/templates/geonode-mapstore-client/snippets/header.html")
    assert header_path.exists(), "header.html must exist to override base GeoNode header"
    content = header_path.read_text(encoding="utf-8")
    
    # Must include brand_navbar.html
    assert "{% include './brand_navbar.html' %}" in content
    
    # Must correctly handle hash routes instead of stripping them unconditionally
    assert "linkHash" in content or "currentHash" in content
    assert "classList.remove('active')" in content


def test_wind_portal_css_dropdown_active_and_no_underline():
    css_path = Path("src/geonode_project/static/wind_management/css/wind_portal.css")
    assert css_path.exists(), "wind_portal.css must exist"
    content = css_path.read_text(encoding="utf-8")
    
    # Check text-decoration: none !important for dropdown menu items
    assert ".gn-wind-dropdown .dropdown-menu > li > a" in content
    assert "text-decoration: none !important" in content
    
    # Check active styling for dropdown items
    assert ".gn-wind-dropdown .dropdown-menu > li.active > a" in content
