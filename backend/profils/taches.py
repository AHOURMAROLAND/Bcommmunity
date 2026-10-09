import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


@shared_task
def envoyer_cadeau_anniversaire(cadeau_id):
    from .models import CadeauAnniversaire

    cadeau = CadeauAnniversaire.objects.select_related("profil__user").filter(pk=cadeau_id).first()
    if cadeau is None:
        return
    user = cadeau.profil.user
    texte = (
        f"Bonjour {user.prenom},\n\n"
        f"{cadeau.message or 'Toute l’équipe vous souhaite un très bel anniversaire !'}\n\n"
        f"Votre bon : {cadeau.code_bon}\n\n"
        "Vous retrouverez aussi ce bon dans les paramètres de votre profil."
    )
    try:
        send_mail(
            "Un cadeau d’anniversaire de Bakhita Community",
            texte,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
        )
    except Exception:
        logger.exception("Envoi du bon d’anniversaire impossible pour le profil %s", cadeau.profil_id)
