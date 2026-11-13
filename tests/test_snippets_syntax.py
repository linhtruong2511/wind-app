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
