"""
Envoi des notifications push : Web Push (VAPID) et FCM.
Anti-SSRF : seules les adresses des vrais services push sont acceptees.
"""
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

from django.conf import settings
from django.db.models import F

from .models import PushAbonnement

logger = logging.getLogger(__name__)

SERVICES_PUSH = (
    "googleapis.com", "mozilla.com", "mozaws.net",
    "push.apple.com", "windows.com",
)
MAX_ECHECS = 5

_fcm_app = None  # instance firebase_admin, initialisee une seule fois


def adresse_push_valide(url):
    """Renvoie True seulement si l'URL pointe vers un service push connu."""
    try:
        p = urlparse(url)
    except ValueError:
        return False
    h = (p.hostname or "").lower()
    return (
        p.scheme == "https"
        and len(url) <= 2000
        and any(h == d or h.endswith("." + d) for d in SERVICES_PUSH)
    )


def _envoyer_web(a, charge):
    from pywebpush import WebPushException, webpush
    try:
        webpush(
            subscription_info={"endpoint": a.cible, "keys": a.cles},
            data=json.dumps(charge),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{settings.VAPID_ADMIN_EMAIL}"},
            ttl=3600,
            timeout=5,
        )
        return a.pk, None
    except WebPushException as e:
        code = getattr(e.response, "status_code", None)
        return a.pk, "mort" if code in (404, 410) else "erreur"
    except Exception:
        logger.exception("Erreur envoi Web Push pk=%s", a.pk)
        return a.pk, "erreur"


def _envoyer_fcm(a, charge):
    global _fcm_app
    try:
        import firebase_admin
        from firebase_admin import credentials, messaging
        if _fcm_app is None:
            if not settings.FCM_SERVICE_ACCOUNT_JSON:
                return a.pk, "erreur"
            _fcm_app = firebase_admin.initialize_app(
                credentials.Certificate(json.loads(settings.FCM_SERVICE_ACCOUNT_JSON)))
        messaging.send(
            messaging.Message(
                token=a.cible,
                data={k: str(v) for k, v in charge.items()},
                android=messaging.AndroidConfig(
                    priority="high",
                    collapse_key=charge.get("tag"),
                ),
            ),
            app=_fcm_app,
        )
        return a.pk, None
    except Exception as e:
        return a.pk, "mort" if "Unregistered" in e.__class__.__name__ else "erreur"


def pousser(paires):
    """
    paires : liste de (user_id, charge).
    Envoie en parallele, supprime les abonnements morts, desactive les fragiles.
    """
    charges = {}
    for uid, charge in paires:
        charges.setdefault(uid, []).append(charge)
    if not charges:
        return

    from amis.services import profils_actifs
    autorises = set(profils_actifs().filter(user_id__in=list(charges)).values_list("user_id", flat=True))
    abonnements = list(PushAbonnement.objects.filter(user_id__in=autorises, actif=True))
    travaux = [(a, c) for a in abonnements for c in charges[a.user_id]]
    if not travaux:
        return

    fn = lambda t: (_envoyer_web if t[0].type == "web" else _envoyer_fcm)(*t)  # noqa: E731
    with ThreadPoolExecutor(max_workers=16) as pool:
        resultats = list(pool.map(fn, travaux))

    morts   = [pk for pk, r in resultats if r == "mort"]
    erreurs = [pk for pk, r in resultats if r == "erreur"]
    ok      = [pk for pk, r in resultats if r is None]

    if morts:
        PushAbonnement.objects.filter(pk__in=morts).delete()
    if erreurs:
        PushAbonnement.objects.filter(pk__in=erreurs).update(echecs=F("echecs") + 1)
        PushAbonnement.objects.filter(pk__in=erreurs, echecs__gte=MAX_ECHECS).update(actif=False)
    if ok:
        PushAbonnement.objects.filter(pk__in=ok, echecs__gt=0).update(echecs=0)
