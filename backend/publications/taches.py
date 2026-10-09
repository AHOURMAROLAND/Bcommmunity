from celery import shared_task
from django.db import transaction
from django.utils import timezone

from notifications.services import lancer
from notifications.taches import annoncer_publication

from .models import Publication


@shared_task
def publier_programmees():
    maintenant = timezone.now()
    ids = list(
        Publication.objects.filter(
            statut="programmee",
            date_programmee__lte=maintenant,
        ).order_by("date_programmee").values_list("pk", flat=True)[:100]
    )
    publiees = 0
    for publication_id in ids:
        with transaction.atomic():
            modifiees = Publication.objects.filter(
                pk=publication_id,
                statut="programmee",
                date_programmee__lte=maintenant,
            ).update(statut="publie", publie_le=maintenant, date_programmee=None)
            if modifiees:
                transaction.on_commit(lambda pk=publication_id: lancer(annoncer_publication, pk))
                publiees += 1
    return publiees
