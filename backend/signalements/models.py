from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

U = settings.AUTH_USER_MODEL


class Signalement(models.Model):
    class Motif(models.TextChoices):
        HARCELEMENT = "harcelement", "Harcèlement ou intimidation"
        CONTENU = "contenu_inapproprie", "Contenu inapproprié"
        FAUX_PROFIL = "faux_profil", "Faux profil"
        SPAM = "spam", "Spam ou publicité"
        AUTRE = "autre", "Autre"
        BUG = "bug", "Bug"
        SUGGESTION = "suggestion", "Suggestion"

    class Statut(models.TextChoices):
        NOUVEAU = "nouveau", "Nouveau"
        EN_COURS = "en_cours", "En cours"
        TRAITE = "traite", "Traité"
        IGNORE = "ignore", "Ignoré"

    class Cible(models.TextChoices):
        UTILISATEUR = "utilisateur", "Utilisateur"
        PUBLICATION = "publication", "Publication"
        CONVERSATION = "conversation", "Conversation"
        RETOUR = "retour", "Retour de test"

    auteur = models.ForeignKey(U, null=True, on_delete=models.SET_NULL, related_name="signalements_faits")
    type_cible = models.CharField(max_length=12, choices=Cible.choices)
    utilisateur_cible = models.ForeignKey(U, null=True, blank=True, on_delete=models.SET_NULL, related_name="signalements_recus")
    publication_cible = models.ForeignKey("publications.Publication", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    conversation_cible = models.ForeignKey("discussions.Conversation", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    motif = models.CharField(max_length=20, choices=Motif.choices)
    commentaire = models.TextField(max_length=2000, blank=True)
    extrait = models.JSONField(default=dict, blank=True)  # copie du contenu au moment du signalement
    contexte = models.JSONField(default=dict, blank=True)
    adresse_ip = models.GenericIPAddressField(null=True, blank=True)
    alerte_seuil = models.PositiveSmallIntegerField(default=0)
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.NOUVEAU, db_index=True)
    decision = models.CharField(max_length=200, blank=True)
    cree_le = models.DateTimeField(default=timezone.now)
    traite_le = models.DateTimeField(null=True, blank=True)
    traite_par = models.ForeignKey(U, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["auteur", "utilisateur_cible"], condition=Q(type_cible="utilisateur"), name="signalement_user_unique"),
            models.UniqueConstraint(fields=["auteur", "publication_cible"], condition=Q(type_cible="publication"), name="signalement_pub_unique"),
            models.UniqueConstraint(fields=["auteur", "conversation_cible"], condition=Q(type_cible="conversation"), name="signalement_conv_unique"),
        ]
        indexes = [models.Index(fields=["statut", "-cree_le"])]


class PieceJointeSignalement(models.Model):
    signalement = models.ForeignKey(Signalement, related_name="pieces_jointes", on_delete=models.CASCADE)
    fichier = models.FileField(
        upload_to="signalements/%Y/%m/",
        validators=[FileExtensionValidator(["jpg", "jpeg", "png", "webp", "mp4", "webm", "mov"])],
    )
    type_contenu = models.CharField(max_length=100)
    cree_le = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Pièce jointe du signalement {self.signalement_id}"


class ConfigurationSupport(models.Model):
    bouton_actif = models.BooleanField(default=True)
    ouvert_a_tous = models.BooleanField(default=True)
    utilisateurs_autorises = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="autorisations_support"
    )

    class Meta:
        verbose_name = "configuration du support"
        verbose_name_plural = "configuration du support"

    def __str__(self):
        return "Configuration du bouton de support"


class MessageSupport(models.Model):
    signalement = models.ForeignKey(Signalement, related_name="messages_support", on_delete=models.CASCADE)
    expediteur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    texte = models.CharField(max_length=2000)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["cree_le", "pk"]

    def __str__(self):
        return f"Message sur le signalement {self.signalement_id}"
