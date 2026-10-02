from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models import Q
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
        """Retourne (code, fin) avec code dans ok, non_valide, suspendu, banni."""
        if not self.valide:
            return ("non_valide", None)
        maintenant = timezone.now()
        s = (self.suspensions.filter(active=True)
             .filter(Q(definitive=True) | Q(fin__gt=maintenant))
             .order_by("-definitive", "-fin").first())
        if s:
            return ("banni", None) if s.definitive else ("suspendu", s.fin)
        return ("ok", None)


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
