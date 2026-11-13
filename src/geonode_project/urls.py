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

from django.urls import path, re_path

# Do not remove handler500 import. It is required to re-export
# the custom error page handler for the GeoNode project
# related issue: https://github.com/GeoNode/geonode-project/issues/570
try:
    from geonode.urls import urlpatterns, handler500  # noqa
except ImportError:
    urlpatterns = []
    handler500 = None

from .views import WindAppPortalView

urlpatterns = [
    path("wind-app/", WindAppPortalView.as_view(), name="wind_app_portal"),
    re_path(r"^wind-app/.*$", WindAppPortalView.as_view(), name="wind_app_portal_subpath"),
    re_path(r"^wind/app/.*$", WindAppPortalView.as_view(), name="wind_app_portal_alias"),
] + urlpatterns
