import logging

from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django_redis import get_redis_connection

logger = logging.getLogger(__name__)


def vivant(request):
    return JsonResponse({"ok": True})


def sante(request):
    etat = {}
    try:
        with connection.cursor() as curseur:
            curseur.execute("SELECT 1")
        etat["bdd"] = True
    except Exception:
        logger.exception("Échec du contrôle de santé de la base de données.")
        etat["bdd"] = False

    if settings.REDIS_URL:
        try:
            get_redis_connection("default").ping()
            etat["redis"] = True
        except Exception:
            logger.exception("Échec du contrôle de santé de Redis.")
            etat["redis"] = False
    else:
        etat["redis"] = False

    return JsonResponse(etat, status=200 if all(etat.values()) else 503)
