from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed

from .models import SessionCompte, User

MAX_SESSIONS_PAR_COMPTE = 4
DUREE_INACTIVITE_SESSION = timedelta(days=7)
INTERVALLE_MAJ_ACTIVITE = timedelta(minutes=5)


def _nettoyer_sessions(user, maintenant):
    SessionCompte.objects.filter(
        user=user,
        active=True,
        derniere_activite__lte=maintenant - DUREE_INACTIVITE_SESSION,
    ).update(active=False)


def creer_session(user, refresh, request):
    maintenant = timezone.now()
    with transaction.atomic():
        if transaction.get_connection().vendor == "postgresql":
            User.objects.select_for_update().get(pk=user.pk)
        _nettoyer_sessions(user, maintenant)
        session = SessionCompte.objects.create(
            user=user,
            refresh_jti=str(refresh["jti"]),
            appareil=request.META.get("HTTP_USER_AGENT", "")[:200],
            adresse_ip=request.META.get("REMOTE_ADDR"),
            cree_le=maintenant,
            derniere_activite=maintenant,
        )
        refresh["sid"] = str(session.pk)
        ids_a_garder = list(
            SessionCompte.objects.filter(user=user, active=True)
            .order_by("-derniere_activite", "-cree_le")
            .values_list("pk", flat=True)[:MAX_SESSIONS_PAR_COMPTE]
        )
        SessionCompte.objects.filter(user=user, active=True).exclude(
            pk__in=ids_a_garder
        ).update(active=False)
    return session


def obtenir_session(user_id, sid):
    try:
        session = SessionCompte.objects.get(pk=sid, user_id=user_id, active=True)
    except (SessionCompte.DoesNotExist, ValueError):
        raise AuthenticationFailed("Cette session a expiré ou a été déconnectée.")

    maintenant = timezone.now()
    if session.derniere_activite <= maintenant - DUREE_INACTIVITE_SESSION:
        raise AuthenticationFailed("Cette session a expiré après une période d’inactivité.")
    if session.derniere_activite <= maintenant - INTERVALLE_MAJ_ACTIVITE:
        SessionCompte.objects.filter(pk=session.pk, active=True).update(
            derniere_activite=maintenant
        )
    return session


def revoquer_sessions(user, sauf=None):
    sessions = SessionCompte.objects.filter(user=user, active=True)
    if sauf is not None:
        sessions = sessions.exclude(pk=sauf)
    sessions.update(active=False)
