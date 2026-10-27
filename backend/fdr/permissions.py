"""
FDREase — Custom permissions.
"""
from rest_framework.permissions import BasePermission


class IsInstitutionUser(BasePermission):
    """Allows access to users who have an associated Institution record."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            hasattr(request.user, 'institution')
        )


class IsOfficialUser(BasePermission):
    """Allows access to staff/superuser accounts (AICTE officials)."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            (request.user.is_staff or request.user.is_superuser)
        )


class IsInstitutionOrOfficial(BasePermission):
    """Read: any authenticated user. Write: institution or official depending on view."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)
