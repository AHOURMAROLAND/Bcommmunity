import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


@shared_task
def alerter_admin(pk):
    from .models import Signalement
    s = Signalement.objects.filter(pk=pk).first()
    if s is None or not settings.ADMIN_EMAIL:
        return
    try:
        send_mail("Nouveau signalement - Bakhita Community",
                  f"Type : {s.get_type_cible_display()}\nMotif : {s.get_motif_display()}\n\n"
                  f"{settings.SITE_URL}/{settings.ADMIN_URL}signalements/signalement/{pk}/change/",
                  settings.DEFAULT_FROM_EMAIL, [settings.ADMIN_EMAIL])
    except Exception:
        logger.exception("Alerte administrateur impossible")
