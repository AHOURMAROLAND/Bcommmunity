from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db.models import Count
from django.utils import timezone

from amis.services import ids_bloques, profils_actifs

from .models import Notification, Preferences
from .presence import presents
from .push import pousser
from .reponse_push import creer_jeton_reponse
from .services import livrer, notifier, prefs_de


@shared_task
def diffuser_notifications(crees, regroupees):
    """Livre les notifications (temps reel + push) apres le commit."""
    livrer(crees, regroupees)


@shared_task
def annoncer_publication(pub_id):
    """
    Fan-out : cree une notification pour chaque membre actif.
    Exclusions : auteur, bloques, suspendus, preferences desactivees ou quotidiennes.
    Traite par lots de 500 pour ne pas bloquer Redis.
    """
    from publications.models import Publication
    pub = (Publication.objects
           .select_related("auteur")
           .filter(pk=pub_id, statut="publie", masquee=False)
           .first())
    if pub is None:
        return 0

    exclus = ids_bloques(pub.auteur) | {pub.auteur_id}
    cibles = list(
        profils_actifs()
        .exclude(user_id__in=exclus)
        .values_list("user_id", flat=True)
    )
    total = 0
    for i in range(0, len(cibles), 500):
        crees, regroupees = notifier(cibles[i:i + 500], "publication", pub.auteur, pub)
        livrer(crees, regroupees)
        total += len(crees) + len(regroupees)
    return total


@shared_task
def pousser_message(message_id):
    """
    Push "Nouveau message" (sans le contenu) pour les destinataires absents.
    Le contenu n'est jamais inclus : il apparaitrait sur l'ecran verrouille.
    """
    from discussions.models import Message, Participant
    m = Message.objects.select_related("auteur").filter(pk=message_id).first()
    if m is None:
        return
    bloques = ids_bloques(m.auteur)
    dest = [
        u for u in
        Participant.objects
        .filter(conversation_id=m.conversation_id)
        .exclude(user_id=m.auteur_id)
        .values_list("user_id", flat=True)
        if u not in bloques
    ]
    if not dest:
        return
    prefs   = prefs_de(dest)
    absents = set(dest) - presents(dest)
    charge = {
        "titre": f"{m.auteur.prenom} {m.auteur.nom}",
        "corps": "Nouveau message",
        "url":   f"/messages/{m.conversation_id}",
        "tag":   f"conv-{m.conversation_id}",
    }
    pousser([
        (u, {
            **charge,
            "reply_url": f"{settings.SITE_URL.rstrip('/')}/api/notifications/push/reply/",
            "reply_token": creer_jeton_reponse(u, m.conversation_id, m.pk),
        }) for u in absents
        if prefs[u].push and prefs[u].discussions
    ])


@shared_task
def resume_quotidien():
    """Envoie un resume aux utilisateurs qui ont choisi 'quotidien'."""
    from publications.models import Publication
    pubs = Publication.objects.filter(
        statut="publie", masquee=False,
        publie_le__gte=timezone.now() - timedelta(hours=24),
    )
    total = pubs.count()
    if not total:
        return 0

    par_auteur = dict(
        pubs.values("auteur_id").annotate(n=Count("id")).values_list("auteur_id", "n"))
    actifs = set(profils_actifs().values_list("user_id", flat=True))
    cibles = [
        u for u in
        Preferences.objects.filter(publications="quotidien").values_list("user_id", flat=True)
        if u in actifs
    ]
    crees = []
    for u in cibles:
        n = total - par_auteur.get(u, 0)
        if n > 0:
            crees.append(
                Notification.objects.create(destinataire_id=u, type="resume", nb=n).pk)
    livrer(crees, [])
    return len(crees)


@shared_task
def nettoyer():
    """Supprime les notifications lues de plus de 60 jours."""
    Notification.objects.filter(
        lue=True,
        modifie_le__lt=timezone.now() - timedelta(days=60),
    ).delete()
