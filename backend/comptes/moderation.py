from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from discussions.services import diffuser
from notifications.services import evenement, lancer

from . import journal
from .models import Suspension
from .taches import notifier_avertissement, notifier_suspension

MOTIFS_PUBLICS = {
    "harcelement": "Comportement de harcèlement ou d'intimidation",
    "contenu_inapproprie": "Contenu inapproprié",
    "faux_profil": "Faux profil",
    "spam": "Spam ou publicité",
    "autre": "Non-respect des règles de la communauté",
}


def appliquer_effets(s):
    """Rend la suspension effective tout de suite : sessions coupées, temps réel fermé, e-mail."""
    cache.delete(f"blocage:{s.user_id}")
    for t in OutstandingToken.objects.filter(user_id=s.user_id):
        BlacklistedToken.objects.get_or_create(token=t)
    diffuser([s.user_id], {"type": "compte.suspendu"})
    lancer(notifier_suspension, s.pk)


def suspendre(user, motif, par, jours=None, definitive=False):
    if not definitive and not jours:
        raise ValueError("Durée obligatoire pour une suspension temporaire.")
    s = Suspension.objects.create(
        user=user, motif=motif[:255], cree_par=par, definitive=definitive,
        fin=None if definitive else timezone.now() + timedelta(days=jours))
    appliquer_effets(s)
    return s


def lever(user_ids):
    ids = list(user_ids)
    return lever_suspensions(Suspension.objects.filter(user_id__in=ids))


def lever_suspensions(queryset):
    with transaction.atomic():
        suspensions = list(queryset.filter(active=True).select_for_update().select_related("user"))
        if not suspensions:
            return 0
        ids = [s.pk for s in suspensions]
        n = Suspension.objects.filter(pk__in=ids, active=True).update(active=False)
        if n:
            membres = {s.user_id: s.user for s in suspensions}
            for user in membres.values():
                journal.enregistrer(user, "suspension", "Suspension levée")
            for uid in membres:
                cache.delete(f"blocage:{uid}")
        return n


def avertir(user, motif):
    evenement([user.pk], "avertissement")
    lancer(notifier_avertissement, user.pk, motif)
