from django.conf import settings
from django.db import models
from django.utils import timezone

U = settings.AUTH_USER_MODEL


class Notification(models.Model):
    class Type(models.TextChoices):
        PUBLICATION       = "publication"
        LIKE              = "like"
        COMMENTAIRE       = "commentaire"
        DEMANDE_AMI       = "demande_ami"
        AMI_ACCEPTE       = "ami_accepte"
        INVITATION        = "invitation"
        INVITATION_ACCEPTEE = "invitation_acceptee"
        RESUME            = "resume"
        AVERTISSEMENT     = "avertissement"

    destinataire = models.ForeignKey(U, related_name="notifications", on_delete=models.CASCADE)
    acteur       = models.ForeignKey(U, null=True, blank=True, related_name="+", on_delete=models.SET_NULL)
    type         = models.CharField(max_length=20, choices=Type.choices)
    publication  = models.ForeignKey(
        "publications.Publication", null=True, blank=True, related_name="+",
        on_delete=models.CASCADE)
    nb           = models.PositiveIntegerField(default=1)  # evenements regroupes
    lue          = models.BooleanField(default=False)
    cree_le      = models.DateTimeField(default=timezone.now)
    modifie_le   = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [
            models.Index(fields=["destinataire", "-modifie_le"]),
            models.Index(fields=["destinataire", "lue"]),
        ]

    def __str__(self):
        return f"{self.destinataire} | {self.type} | lu={self.lue}"


class Preferences(models.Model):
    class Publications(models.TextChoices):
        IMMEDIAT  = "immediat"
        QUOTIDIEN = "quotidien"
        DESACTIVE = "desactive"

    user          = models.OneToOneField(U, related_name="prefs_notifications", on_delete=models.CASCADE)
    publications  = models.CharField(max_length=10, choices=Publications.choices, default="immediat")
    likes         = models.BooleanField(default=True)
    commentaires  = models.BooleanField(default=True)
    amis          = models.BooleanField(default=True)
    discussions   = models.BooleanField(default=True)
    push          = models.BooleanField(default=True)

    def __str__(self):
        return f"Prefs de {self.user}"


class PushAbonnement(models.Model):
    class Type(models.TextChoices):
        WEB = "web"
        FCM = "fcm"

    user    = models.ForeignKey(U, related_name="abonnements_push", on_delete=models.CASCADE)
    type    = models.CharField(max_length=5, choices=Type.choices)
    cible   = models.TextField()          # endpoint (web) ou jeton (fcm)
    cles    = models.JSONField(null=True, blank=True)
    agent   = models.CharField(max_length=200, blank=True)
    actif   = models.BooleanField(default=True)
    echecs  = models.PositiveSmallIntegerField(default=0)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["cible"], name="push_cible_unique"),
        ]
        indexes = [
            models.Index(fields=["user", "actif"]),
        ]

    def __str__(self):
        return f"{self.user} [{self.type}] actif={self.actif}"
