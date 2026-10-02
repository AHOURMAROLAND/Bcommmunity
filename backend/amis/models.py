from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Greatest, Least

Utilisateur = settings.AUTH_USER_MODEL


class Amitie(models.Model):
    class Statut(models.TextChoices):
        ATTENTE = "attente", "En attente"
        ACCEPTEE = "acceptee", "Acceptée"
        REFUSEE = "refusee", "Refusée"

    demandeur = models.ForeignKey(Utilisateur, related_name="demandes_envoyees", on_delete=models.CASCADE)
    destinataire = models.ForeignKey(Utilisateur, related_name="demandes_recues", on_delete=models.CASCADE)
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.ATTENTE)
    cree_le = models.DateTimeField(auto_now_add=True)
    repondue_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=~Q(demandeur=F("destinataire")), name="amitie_pas_soi_meme"),
            # Une seule ligne par paire, quel que soit le sens de la demande.
            models.UniqueConstraint(Least("demandeur", "destinataire"),
                                    Greatest("demandeur", "destinataire"), name="amitie_paire_unique"),
        ]
        indexes = [models.Index(fields=["destinataire", "statut"]),
                   models.Index(fields=["demandeur", "statut"])]


class Blocage(models.Model):
    bloqueur = models.ForeignKey(Utilisateur, related_name="blocages_faits", on_delete=models.CASCADE)
    bloque = models.ForeignKey(Utilisateur, related_name="blocages_recus", on_delete=models.CASCADE)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["bloqueur", "bloque"], name="blocage_unique"),
            models.CheckConstraint(condition=~Q(bloqueur=F("bloque")), name="blocage_pas_soi_meme"),
        ]
        indexes = [models.Index(fields=["bloque"])]
