import logging

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.utils import timezone

from .models import Suspension, User

logger = logging.getLogger(__name__)


def _mail(user, sujet, corps):
    try:
        send_mail(sujet, corps, settings.DEFAULT_FROM_EMAIL, [user.email])
    except Exception:
        logger.exception("E-mail impossible vers l'utilisateur %s", user.pk)


@shared_task
def notifier_suspension(pk):
    s = Suspension.objects.select_related("user").filter(pk=pk).first()
    if s is None:
        return
    duree = "Votre accès est retiré définitivement." if s.definitive \
        else f"Votre accès est suspendu jusqu'au {s.fin:%d/%m/%Y à %H:%M} (UTC). Il sera rétabli automatiquement."
    _mail(s.user, "Votre compte Bakhita Community est suspendu",
          f"Bonjour {s.user.prenom},\n\n{duree}\nMotif : {s.motif}\n\n"
          "Si vous pensez qu'il s'agit d'une erreur, contactez l'école.")


@shared_task
def notifier_avertissement(user_id, motif):
    u = User.objects.filter(pk=user_id).first()
    if u:
        _mail(u, "Avertissement - Bakhita Community",
              f"Bonjour {u.prenom},\n\nL'administrateur vous adresse un avertissement.\nMotif : {motif}\n\n"
              "Merci de respecter les règles de la communauté. Une récidive peut entraîner une suspension.")


@shared_task
def lever_suspensions_expirees():
    """Range les suspensions échues et prévient les personnes dont l'accès est rétabli."""
    echues = list(Suspension.objects.filter(active=True, definitive=False, fin__lte=timezone.now())
                  .values_list("pk", "user_id"))
    if not echues:
        return 0
    Suspension.objects.filter(pk__in=[pk for pk, _ in echues]).update(active=False)
    for uid in {u for _, u in echues}:
        cache.delete(f"blocage:{uid}")
        user = User.objects.filter(pk=uid).first()
        if user and user.blocage()[0] == "ok":
            _mail(user, "Votre accès à Bakhita Community est rétabli",
                  f"Bonjour {user.prenom},\n\nVotre suspension est terminée, vous pouvez vous reconnecter.")
    return len(echues)
