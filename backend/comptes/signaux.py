"""Alimente le journal d'activité (actions uniquement, jamais le contenu des messages privés)."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from publications.models import Commentaire, Publication
from signalements.models import Signalement

from . import journal
from .models import Suspension, User


@receiver(post_save, sender=User)
def _inscription(sender, instance, created, raw=False, **kwargs):
    if created and not raw and not instance.is_staff:
        journal.enregistrer(instance, "inscription", f"Statut : {instance.get_statut_display()}")


@receiver(post_save, sender=Publication)
def _publication(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        journal.enregistrer(instance.auteur, "publication", f"« {instance.titre[:100]} »")


@receiver(post_save, sender=Commentaire)
def _commentaire(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        journal.enregistrer(instance.auteur, "commentaire", f"sur « {instance.publication.titre[:80]} »")


@receiver(post_save, sender=Signalement)
def _signalement(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        journal.enregistrer(instance.auteur, "signalement",
                            f"{instance.get_type_cible_display()} · {instance.get_motif_display()}")


@receiver(post_save, sender=Suspension)
def _suspension(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        genre = "Bannissement" if instance.definitive else "Suspension"
        journal.enregistrer(instance.user, "suspension", f"{genre} : {instance.motif}")
