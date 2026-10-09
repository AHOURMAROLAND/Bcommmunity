import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.hashers import (  # noqa: F401 — re-exported for OTPEmail usage
    check_password,
    make_password,
)
from django.contrib.auth.models import PermissionsMixin
from django.core.cache import cache
from django.db import models
from django.db.models import Q
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _creer(self, email, password, **extra):
        if not email:
            raise ValueError("L'e-mail est obligatoire.")
        user = self.model(email=email.strip().lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._creer(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True, valide=True, email_verifie=True)
        return self._creer(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    class Statut(models.TextChoices):
        ELEVE = "eleve", "Élève actuel"
        ANCIEN = "ancien", "Ancien élève"

    email = models.EmailField(unique=True, max_length=254)
    prenom = models.CharField(max_length=80)
    nom = models.CharField(max_length=80)
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.ELEVE)
    email_verifie = models.BooleanField(default=False)
    valide = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_inscription = models.DateTimeField(default=timezone.now)
    google_sub = models.CharField(max_length=64, unique=True, null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["prenom", "nom"]
    objects = UserManager()

    class Meta:
        indexes = [models.Index(fields=["valide", "is_active"])]

    def __str__(self):
        return f"{self.prenom} {self.nom} <{self.email}>"

    def blocage(self):
        """Retourne (code, fin, motif) avec code dans ok, suspendu ou banni."""
        s = (self.suspensions.filter(active=True)
             .filter(Q(definitive=True) | Q(fin__gt=timezone.now()))
             .order_by("-definitive", "-fin").first())
        if s:
            return ("banni", None, s.motif) if s.definitive else ("suspendu", s.fin, s.motif)
        return ("ok", None, "")


class Suspension(models.Model):
    user = models.ForeignKey(User, related_name="suspensions", on_delete=models.CASCADE)
    motif = models.CharField(max_length=255)
    debut = models.DateTimeField(default=timezone.now)
    fin = models.DateTimeField(null=True, blank=True)
    definitive = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    cree_par = models.ForeignKey(User, null=True, blank=True, related_name="+",
                                 on_delete=models.SET_NULL)

    class Meta:
        indexes = [models.Index(fields=["user", "active"])]
        constraints = [models.CheckConstraint(
            condition=Q(definitive=True) | Q(fin__isnull=False),
            name="suspension_fin_ou_definitive")]


@receiver([post_save, post_delete], sender=Suspension)
def _vider_cache_acces(sender, instance, **kwargs):
    cache.delete(f"blocage:{instance.user_id}")


class OTPEmail(models.Model):
    """One-time password sent by email for account verification."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otps")
    # Stores a hashed value — never the raw code
    code = models.CharField(max_length=128)
    expire_le = models.DateTimeField()
    utilise = models.BooleanField(default=False)

    class Meta:
        indexes = [models.Index(fields=["user", "utilise", "expire_le"])]

    def __str__(self):
        return f"OTP {self.user_id} — expire {self.expire_le} — utilisé {self.utilise}"

class Activite(models.Model):
    """Journal d'activité des membres : actions uniquement, jamais le contenu des messages privés."""

    class Action(models.TextChoices):
        CONNEXION = "connexion", "Connexion"
        INSCRIPTION = "inscription", "Inscription"
        PUBLICATION = "publication", "Publication créée"
        COMMENTAIRE = "commentaire", "Commentaire"
        SIGNALEMENT = "signalement", "Signalement envoyé"
        SUSPENSION = "suspension", "Suspension / bannissement"
        MOT_DE_PASSE = "mot_de_passe", "Mot de passe modifié"

    user = models.ForeignKey(User, null=True, blank=True, related_name="activites",
                             on_delete=models.CASCADE)  # compte supprimé : son journal l'est aussi
    action = models.CharField(max_length=20, choices=Action.choices)
    detail = models.CharField(max_length=255, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    appareil = models.CharField(max_length=200, blank=True)
    cree_le = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-cree_le"]
        verbose_name = "activité"
        verbose_name_plural = "journal d'activité"
        indexes = [models.Index(fields=["user", "-cree_le"]),
                   models.Index(fields=["action", "-cree_le"]),
                   models.Index(fields=["-cree_le"])]

    def __str__(self):
        return f"{self.get_action_display()} - {self.user_id} - {self.cree_le:%d/%m/%Y %H:%M}"


class SessionCompte(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, related_name="sessions_compte", on_delete=models.CASCADE)
    refresh_jti = models.CharField(max_length=255, unique=True)
    appareil = models.CharField(max_length=200, blank=True)
    adresse_ip = models.GenericIPAddressField(null=True, blank=True)
    cree_le = models.DateTimeField(default=timezone.now)
    derniere_activite = models.DateTimeField(default=timezone.now, db_index=True)
    active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["-derniere_activite", "-cree_le"]
        indexes = [models.Index(fields=["user", "active", "-derniere_activite"])]

    def __str__(self):
        return f"Session de {self.user} ({self.cree_le:%d/%m/%Y %H:%M})"
