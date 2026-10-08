from django.core.validators import MinValueValidator
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver

from comptes.models import User


class Domaine(models.Model):
    nom = models.CharField(max_length=80, unique=True)

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class Visibilite(models.TextChoices):
    TOUS = "tous", "Tout le monde"
    AMIS = "amis", "Mes amis"
    PERSONNE = "personne", "Personne"


class Profil(models.Model):
    user = models.OneToOneField(User, related_name="profil", on_delete=models.CASCADE)
    photo = models.ImageField(upload_to="profils/", null=True, blank=True)
    photo_s = models.ImageField(upload_to="profils/", null=True, blank=True)

    @property
    def url_mini(self):
        f = self.photo_s or self.photo
        return f.url if f else None
    bio = models.CharField(max_length=500, blank=True)
    ville = models.CharField(max_length=100, blank=True)
    whatsapp = models.CharField(max_length=16, blank=True)
    whatsapp_visibilite = models.CharField(
        max_length=10, choices=Visibilite.choices, default=Visibilite.AMIS
    )
    annee_sortie = models.PositiveSmallIntegerField(null=True, blank=True,
                                                    validators=[MinValueValidator(1950)])
    onboarding_termine = models.BooleanField(default=False)
    visibilite_profil = models.CharField(max_length=10, choices=Visibilite.choices, default="tous")
    visibilite_parcours = models.CharField(max_length=10, choices=Visibilite.choices, default="tous")
    visibilite_situation = models.CharField(max_length=10, choices=Visibilite.choices, default="tous")
    qui_peut_inviter = models.CharField(max_length=10, choices=Visibilite.choices, default="tous")

    def __str__(self):
        return f"Profil de {self.user}"


class SituationActuelle(models.Model):
    class Type(models.TextChoices):
        EMPLOI = "emploi", "Emploi"
        ETUDES = "etudes", "Études / formation"
        RECHERCHE = "recherche", "Recherche d'emploi"
        AUTRE = "autre", "Autre"

    class Formation(models.TextChoices):
        UNIVERSITE = "universite", "Université"
        ECOLE = "ecole", "École supérieure"
        PROFESSIONNELLE = "professionnelle", "Formation professionnelle"
        AUTRE = "autre", "Autre"

    class Objectif(models.TextChoices):
        EMPLOI = "emploi", "Emploi"
        STAGE = "stage", "Stage"
        FORMATION = "formation", "Formation"

    profil = models.OneToOneField(Profil, related_name="situation", on_delete=models.CASCADE)
    type = models.CharField(max_length=10, choices=Type.choices, default=Type.AUTRE, db_index=True)
    # emploi
    poste = models.CharField(max_length=120, blank=True)
    entreprise = models.CharField(max_length=120, blank=True)
    secteur = models.CharField(max_length=120, blank=True)
    ville_emploi = models.CharField(max_length=100, blank=True)
    depuis = models.PositiveSmallIntegerField(null=True, blank=True)
    independant = models.BooleanField(default=False)
    # études
    type_formation = models.CharField(max_length=20, choices=Formation.choices, blank=True)
    etablissement = models.CharField(max_length=160, blank=True)
    faculte = models.CharField(max_length=160, blank=True)
    domaine = models.ForeignKey(Domaine, null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="situations")
    diplome = models.CharField(max_length=120, blank=True)
    niveau = models.CharField(max_length=60, blank=True)
    annee_debut = models.PositiveSmallIntegerField(null=True, blank=True)
    annee_fin_prevue = models.PositiveSmallIntegerField(null=True, blank=True)
    lieu_etudes = models.CharField(max_length=120, blank=True)
    # recherche
    objectif = models.CharField(max_length=10, choices=Objectif.choices, blank=True)

    def __str__(self):
        return f"Situation de {self.profil.user}"


@receiver(post_delete, sender=Profil)
def supprimer_photos(sender, instance, **kwargs):
    for f in (instance.photo, instance.photo_s):
        if f:
            f.delete(save=False)
