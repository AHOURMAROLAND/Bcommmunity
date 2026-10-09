import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


@shared_task
def alerter_admin(pk):
    from .models import Signalement
    s = Signalement.objects.filter(pk=pk).first()
    destinataires = getattr(settings, "ADMIN_EMAILS", []) or ([settings.ADMIN_EMAIL] if settings.ADMIN_EMAIL else [])
    if s is None or not destinataires:
        return
    en_attente = s.alerte_seuil
    if not en_attente:
        return
    try:
        send_mail(
            f"Seuil de {en_attente} signalements atteint - Bakhita Community",
            f"Le seuil de {en_attente} signalements en attente vient d’être atteint.\n"
            f"Dernier retour : {s.get_type_cible_display()} — {s.get_motif_display()}\n\n"
            f"{settings.SITE_URL.rstrip('/')}/{settings.ADMIN_URL}signalements/signalement/",
            settings.DEFAULT_FROM_EMAIL,
            destinataires,
        )
    except Exception:
        logger.exception("Alerte administrateur impossible")


@shared_task
def notifier_reponse_support(message_id):
    from .models import MessageSupport
    message = MessageSupport.objects.select_related("signalement__auteur").filter(
        pk=message_id, expediteur__is_staff=True,
    ).first()
    if message is None or message.signalement.auteur is None:
        return
    try:
        send_mail(
            "Réponse de l’équipe Bakhita Community",
            f"Bonjour {message.signalement.auteur.prenom},\n\n"
            f"L’équipe a répondu à votre retour :\n\n{message.texte}\n\n"
            "Retrouvez la conversation dans Paramètres > Assistance.",
            settings.DEFAULT_FROM_EMAIL,
            [message.signalement.auteur.email],
        )
    except Exception:
        logger.exception("Notification de réponse support impossible")


@shared_task
def notifier_admin_message_support(message_id):
    from .models import MessageSupport
    message = MessageSupport.objects.select_related("signalement__auteur").filter(
        pk=message_id, expediteur__is_staff=False,
    ).first()
    destinataires = getattr(settings, "ADMIN_EMAILS", []) or ([settings.ADMIN_EMAIL] if settings.ADMIN_EMAIL else [])
    if message is None or not destinataires:
        return
    auteur = message.signalement.auteur
    nom = f"{auteur.prenom} {auteur.nom}" if auteur else "Un membre"
    try:
        send_mail(
            f"Nouveau message de {nom} - Bakhita Community",
            f"Le membre {nom} a répondu au signalement #{message.signalement_id} :\n\n"
            f"{message.texte}\n\n"
            f"{settings.SITE_URL.rstrip('/')}/{settings.ADMIN_URL}"
            f"signalements/signalement/{message.signalement_id}/change/",
            settings.DEFAULT_FROM_EMAIL,
            destinataires,
        )
    except Exception:
        logger.exception("Notification administrateur d’un message support impossible")
