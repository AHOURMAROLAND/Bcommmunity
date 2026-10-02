from rest_framework import permissions


class IsAuteurOuLectureSeule(permissions.BasePermission):
    """
    Autorise la lecture à tout utilisateur authentifié.
    L'écriture (modification, suppression) n'est autorisée qu'à l'auteur de l'objet.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        auteur = getattr(obj, "auteur", None) or getattr(obj, "user", None)
        return bool(request.user and request.user.is_authenticated and auteur == request.user)
