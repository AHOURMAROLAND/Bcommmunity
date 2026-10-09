from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission


class PasLectureSeule(BasePermission):
    message = "Ce compte est en lecture seule : les modifications sont désactivées."
    code = "lecture_seule"

    def has_permission(self, request, view):
        user = request.user
        if request.method in SAFE_METHODS or request.path == "/api/auth/deconnexion/":
            return True
        if user.is_authenticated and (user.is_staff or not user.lecture_seule):
            return True
        if user.is_authenticated and user.lecture_seule:
            raise PermissionDenied(detail=self.message, code=self.code)
        return True
