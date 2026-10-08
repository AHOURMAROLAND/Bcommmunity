import ipaddress
import logging

from django.db import transaction

from .models import Activite

logger = logging.getLogger(__name__)


def _ip(request):
    if request is None:
        return None
    brut = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR", "")
    try:
        return str(ipaddress.ip_address(brut))
    except ValueError:
        return None


def enregistrer(user, action, detail="", request=None):
    """Ajoute une ligne au journal. Ne doit jamais faire échouer l'action d'origine."""
    try:
        with transaction.atomic():
            Activite.objects.create(
                user=user, action=action, detail=detail[:255], ip=_ip(request),
                appareil=request.META.get("HTTP_USER_AGENT", "")[:200] if request is not None else "")
    except Exception:
        logger.exception("Journal d'activité : écriture impossible")
