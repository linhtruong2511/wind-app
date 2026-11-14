# -*- coding: utf-8 -*-
#########################################################################
#
# Copyright (C) 2017 OSGeo
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <http://www.gnu.org/licenses/>.
#
#########################################################################

# Django settings for the GeoNode project.
import ast
import os

# Load more settings from a file called local_settings.py if it exists
try:
    from geonode_project.local_settings import *
#    from geonode.local_settings import *
except ImportError:
    from geonode.settings import *

#
# General Django development settings
#
PROJECT_NAME = "geonode_project"

# add trailing slash to site url. geoserver url will be relative to this
if not SITEURL.endswith("/"):
    SITEURL = "{}/".format(SITEURL)

SITENAME = os.getenv("SITENAME", "geonode_project")

# Defines the directory that contains the settings file as the LOCAL_ROOT
# It is used for relative settings elsewhere.
LOCAL_ROOT = os.path.abspath(os.path.dirname(__file__))

WSGI_APPLICATION = "{}.wsgi.application".format(PROJECT_NAME)

TIME_ZONE = os.getenv("TIME_ZONE", "Asia/Ho_Chi_Minh")

# Extend MapStore default supported languages to include Vietnamese
MAPSTORE_DEFAULT_LANGUAGES = (
    ("vi-vn", "Tiếng Việt"),
    ("en-us", "English"),
    ("de-de", "Deutsch"),
    ("es-es", "Español"),
    ("fr-fr", "Français"),
    ("it-it", "Italiano"),
)

try:
    _raw_langs = os.getenv("LANGUAGES")
    if _raw_langs:
        _parsed_langs = ast.literal_eval(_raw_langs.encode("utf-8", "surrogateescape").decode("utf-8", "replace"))
        LANGUAGES = tuple(
            (k, v) for k, v in dict(MAPSTORE_DEFAULT_LANGUAGES).items() if any(m in k for m in dict(_parsed_langs).keys())
        )
    else:
        LANGUAGES = (("vi-vn", "Tiếng Việt"), ("en-us", "English"))
except Exception:
    LANGUAGES = (("vi-vn", "Tiếng Việt"), ("en-us", "English"))

PROFILE_LANGUAGE_CHOICES = tuple((k.split("-")[0], v) for k, v in LANGUAGES)

# Language code for this installation.
LANGUAGE_CODE = os.getenv("LANGUAGE_CODE", "vi-vn")

if PROJECT_NAME not in INSTALLED_APPS:
    INSTALLED_APPS += (PROJECT_NAME,)

# Location of url mappings
ROOT_URLCONF = os.getenv("ROOT_URLCONF", "{}.urls".format(PROJECT_NAME))

# Additional directories which hold static files
# - Give priority to local geonode-project ones
STATICFILES_DIRS = [
    os.path.join(LOCAL_ROOT, "static"),
] + STATICFILES_DIRS

# Location of locale files
LOCALE_PATHS = (os.path.join(LOCAL_ROOT, "locale"),) + LOCALE_PATHS

TEMPLATES[0]["DIRS"].insert(0, os.path.join(LOCAL_ROOT, "templates"))
loaders = TEMPLATES[0]["OPTIONS"].get("loaders") or [
    "django.template.loaders.filesystem.Loader",
    "django.template.loaders.app_directories.Loader",
]
# loaders.insert(0, 'apptemplates.Loader')
TEMPLATES[0]["OPTIONS"]["loaders"] = loaders
TEMPLATES[0].pop("APP_DIRS", None)


PROJECT_FIXTURES = [
    # List project-related fixture files here, in the order they should be loaded.
]
