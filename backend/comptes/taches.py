import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.utils import timezone

from discussions.models import Message
from publications.models import Publication
from signalements.models import Signalement

from .models import Activite, Suspension, User

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


@shared_task
def envoyer_rapport_hebdomadaire():
    fin = timezone.now()
    debut = fin - timedelta(days=7)
    rapports = Signalement.objects.filter(cree_le__gte=debut, cree_le__lt=fin)
    traites = rapports.filter(traite_le__gte=debut, traite_le__lt=fin)
    utilisateurs_actifs = set(
        Activite.objects.filter(
            cree_le__gte=debut, cree_le__lt=fin, user__isnull=False, user__is_staff=False
        ).values_list("user_id", flat=True)
    )
    utilisateurs_actifs.update(
        Message.objects.filter(
            cree_le__gte=debut, cree_le__lt=fin, auteur__is_staff=False
        ).values_list("auteur_id", flat=True)
    )
    donnees = {
        "inscriptions": User.objects.filter(
            is_staff=False, date_inscription__gte=debut, date_inscription__lt=fin
        ).count(),
        "utilisateurs_actifs": len(utilisateurs_actifs),
        "publications": Publication.objects.filter(
            statut="publie", publie_le__gte=debut, publie_le__lt=fin
        ).count(),
        "messages": Message.objects.filter(cree_le__gte=debut, cree_le__lt=fin).count(),
        "signalements_recus": rapports.count(),
        "signalements_traites": traites.count(),
        "signalements_ouverts": Signalement.objects.filter(statut__in=["nouveau", "en_cours"]).count(),
    }
    destinataires = list(
        User.objects.filter(is_active=True, is_staff=True)
        .exclude(email="")
        .values_list("email", flat=True)
        .distinct()
    )
    if not destinataires:
        logger.warning("Rapport hebdomadaire non envoyé : aucun administrateur actif avec une adresse e-mail.")
        return {"envoye": False, **donnees}

    debut_formate = timezone.localtime(debut).strftime("%d/%m/%Y")
    fin_formatee = timezone.localtime(fin).strftime("%d/%m/%Y")
    lignes = [
        f"Rapport hebdomadaire Bakhita Community ({debut_formate} - {fin_formatee})",
        "",
        f"Utilisateurs actifs : {donnees['utilisateurs_actifs']}",
        f"Nouvelles inscriptions : {donnees['inscriptions']}",
        f"Publications : {donnees['publications']}",
        f"Messages : {donnees['messages']}",
        f"Signalements reçus : {donnees['signalements_recus']}",
        f"Signalements traités : {donnees['signalements_traites']}",
        f"Signalements encore ouverts : {donnees['signalements_ouverts']}",
    ]
    envoyes = send_mail(
        f"Rapport hebdomadaire Bakhita Community - {fin_formatee}",
        "\n".join(lignes),
        settings.DEFAULT_FROM_EMAIL,
        destinataires,
        fail_silently=False,
    )
    return {"envoye": bool(envoyes), **donnees}
