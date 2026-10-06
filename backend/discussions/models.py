from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

U = settings.AUTH_USER_MODEL


class InvitationDiscussion(models.Model):
    class Statut(models.TextChoices):
        ATTENTE  = "attente"
        ACCEPTEE = "acceptee"
        REFUSEE  = "refusee"
        ANNULEE  = "annulee"

    demandeur    = models.ForeignKey(U, related_name="invitations_envoyees", on_delete=models.CASCADE)
    destinataire = models.ForeignKey(U, related_name="invitations_recues",   on_delete=models.CASCADE)
    message      = models.CharField(max_length=200, blank=True)
    statut       = models.CharField(max_length=10, choices=Statut.choices, default=Statut.ATTENTE)
    cree_le      = models.DateTimeField(auto_now_add=True)
    repondue_le  = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(demandeur=F("destinataire")),
                name="invitation_pas_soi_meme",
            ),
            models.UniqueConstraint(
                fields=["demandeur", "destinataire"],
                condition=Q(statut="attente"),
                name="invitation_attente_unique",
            ),
        ]
        indexes = [
            models.Index(fields=["destinataire", "statut", "-cree_le"]),
            models.Index(fields=["demandeur", "statut"]),
        ]

    def __str__(self):
        return f"{self.demandeur} -> {self.destinataire} [{self.statut}]"


class Conversation(models.Model):
    class Type(models.TextChoices):
        DIRECT = "direct"
        GROUPE = "groupe"

    type       = models.CharField(max_length=10, choices=Type.choices, default=Type.DIRECT)
    # Cle unique pour eviter les doublons entre deux utilisateurs
    paire_cle  = models.CharField(max_length=40, unique=True, null=True, blank=True)
    cree_le    = models.DateTimeField(auto_now_add=True)
    dernier_message_le = models.DateTimeField(default=timezone.now, db_index=True)

    def __str__(self):
        return f"Conversation {self.pk} [{self.type}]"


class Participant(models.Model):
    conversation = models.ForeignKey(Conversation, related_name="participants", on_delete=models.CASCADE)
    user         = models.ForeignKey(U, related_name="participations", on_delete=models.CASCADE)
    dernier_lu   = models.BigIntegerField(default=0)  # id du dernier message lu
    archive      = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["conversation", "user"], name="participant_unique"),
        ]
        indexes = [
            models.Index(fields=["user", "archive"]),
        ]

    def __str__(self):
        return f"{self.user} dans {self.conversation}"


class Message(models.Model):
    class Type(models.TextChoices):
        TEXTE = "texte", "Texte"
        IMAGE = "image", "Image"
        FICHIER = "fichier", "Fichier"
        VOCAL = "vocal", "Vocal"

    conversation = models.ForeignKey(Conversation, related_name="messages", on_delete=models.CASCADE)
    auteur       = models.ForeignKey(U, on_delete=models.CASCADE)
    texte        = models.TextField(max_length=2000, blank=True, default="")
    type         = models.CharField(max_length=10, choices=Type.choices, default=Type.TEXTE)
    fichier      = models.FileField(upload_to="messages/%Y/%m/", null=True, blank=True)
    nom_fichier  = models.CharField(max_length=255, blank=True)
    taille_fichier = models.PositiveIntegerField(null=True, blank=True)
    duree_vocale = models.PositiveSmallIntegerField(null=True, blank=True)
    forme_onde   = models.JSONField(default=list, blank=True)
    client_id    = models.CharField(max_length=40, blank=True, default="")
    en_reponse_a = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="reponses")
    message_origine = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="transferts"
    )
    modifie_le = models.DateTimeField(null=True, blank=True)
    transfere = models.BooleanField(default=False)
    supprime_pour_tous = models.BooleanField(default=False)
    epingle = models.BooleanField(default=False)
    cree_le      = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [
            models.Index(fields=["conversation", "id"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["conversation", "auteur", "client_id"],
                condition=~Q(client_id=""),
                name="message_client_id_unique",
            ),
        ]

    def __str__(self):
        return f"Msg {self.pk} de {self.auteur} dans {self.conversation}"


class ReactionMessage(models.Model):
    message = models.ForeignKey(Message, related_name="reactions", on_delete=models.CASCADE)
    user = models.ForeignKey(U, on_delete=models.CASCADE)
    emoji = models.CharField(max_length=8)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["message", "user"], name="reaction_unique"),
        ]
        indexes = [
            models.Index(fields=["message"]),
        ]

    def __str__(self):
        return f"{self.user} {self.emoji} sur {self.message_id}"


class MessageFavori(models.Model):
    message = models.ForeignKey(Message, related_name="favoris", on_delete=models.CASCADE)
    user = models.ForeignKey(U, related_name="messages_favoris", on_delete=models.CASCADE)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["message", "user"], name="message_favori_unique"),
        ]
        indexes = [
            models.Index(fields=["user", "-cree_le"], name="msgfav_user_created_idx"),
        ]


class MessageMasque(models.Model):
    message = models.ForeignKey(Message, related_name="masques", on_delete=models.CASCADE)
    user = models.ForeignKey(U, related_name="messages_masques", on_delete=models.CASCADE)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["message", "user"], name="message_masque_unique"),
        ]
        indexes = [
            models.Index(fields=["user", "message"], name="msgmask_user_msg_idx"),
        ]
