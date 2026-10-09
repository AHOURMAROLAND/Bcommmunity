from django.core.cache import cache
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

from .sessions import obtenir_session

TTL_BLOCAGE = 15  # secondes : délai maximal avant qu'une suspension prenne effet


def verifier_acces(user):
    """Lève 403 avec un code exploitable par le front si l'accès est bloqué."""
    code, fin, motif = cache.get_or_set(f"blocage:{user.pk}", user.blocage, TTL_BLOCAGE)
    if code != "ok":
        raise PermissionDenied({"code": code, "fin": fin.isoformat() if fin else None, "motif": motif})


class ReseauJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        resultat = super().authenticate(request)
        if resultat is None:
            return None
        sid = resultat[1].get("sid")
        if sid:
            obtenir_session(resultat[0].pk, sid)
        verifier_acces(resultat[0])
        return resultat
