import ipaddress
import logging

from django.conf import settings
from django.db import transaction

from .models import Activite

logger = logging.getLogger(__name__)


def _ip(request):
    if request is None:
        return None
    brut = request.META.get("REMOTE_ADDR", "").strip()
    try:
        adresse = ipaddress.ip_address(brut)
    except ValueError:
        return None
    proxies = tuple(
        ipaddress.ip_network(proxy.strip(), strict=False)
        for proxy in getattr(settings, "TRUSTED_PROXY_IPS", ())
    )
    if not any(adresse in proxy for proxy in proxies):
        return str(adresse)
    transferts = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")
    for valeur in reversed(transferts):
        try:
            candidate = ipaddress.ip_address(valeur.strip())
        except ValueError:
            return str(adresse)
        if not any(candidate in proxy for proxy in proxies):
            return str(candidate)
    return str(adresse)


def enregistrer(user, action, detail="", request=None):
    """Ajoute une ligne au journal. Ne doit jamais faire échouer l'action d'origine."""
    try:
        with transaction.atomic():
            Activite.objects.create(
                user=user, action=action, detail=detail[:255], ip=_ip(request),
                appareil=request.META.get("HTTP_USER_AGENT", "")[:200] if request is not None else "")
    except Exception:
        logger.exception("Journal d'activité : écriture impossible")
