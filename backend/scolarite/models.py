from django.db import models
from django.db.models import F, Q


class Cycle(models.Model):
    nom = models.CharField(max_length=60, unique=True)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre"]

    def __str__(self):
        return self.nom


class Classe(models.Model):
    cycle = models.ForeignKey(Cycle, related_name="classes", on_delete=models.CASCADE)
    nom = models.CharField(max_length=60)
    filiere = models.CharField(max_length=80, blank=True)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["cycle__ordre", "ordre"]
        constraints = [models.UniqueConstraint(fields=["cycle", "nom", "filiere"], name="classe_unique")]

    def __str__(self):
        return f"{self.nom} {self.filiere}".strip()


class Scolarite(models.Model):
    profil = models.ForeignKey("profils.Profil", related_name="scolarites", on_delete=models.CASCADE)
    classe = models.ForeignKey(Classe, related_name="scolarites", on_delete=models.PROTECT)
    annee_debut = models.PositiveSmallIntegerField()
    annee_fin = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["annee_debut"]
        constraints = [
            models.CheckConstraint(condition=Q(annee_fin__gte=F("annee_debut")), name="scolarite_annees_ok"),
            models.UniqueConstraint(fields=["profil", "classe", "annee_debut"], name="scolarite_unique"),
        ]
        indexes = [models.Index(fields=["classe", "annee_debut", "annee_fin"])]
