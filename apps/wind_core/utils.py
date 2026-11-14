from django.db.models import Aggregate
from rest_framework import permissions
from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 1000


class Median(Aggregate):
    function = "PERCENTILE_CONT"
    template = "%(function)s(0.5) WITHIN GROUP (ORDER BY %(expressions)s)"


class IsAdminUserOrReadOnly(permissions.BasePermission):
    """Allow safe GET/HEAD/OPTIONS for all, require staff/superuser for write operations."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser))

