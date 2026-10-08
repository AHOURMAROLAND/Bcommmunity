from django.db import models
from django.db.models import F, Q


class Cycle(models.Model):
    nom = models.CharField(max_length=60, unique=True)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre"]

    def __str__(self):
        return self.nom


class Filiere(models.Model):
    class TypeLycee(models.TextChoices):
        MODERNE = "moderne", "Lycée moderne"
        TECHNIQUE = "technique", "Lycée technique"

    type_lycee = models.CharField(max_length=12, choices=TypeLycee.choices)
    nom = models.CharField(max_length=80)
    active = models.BooleanField(default=True)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["type_lycee", "ordre", "nom"]
        constraints = [
            models.UniqueConstraint(fields=["type_lycee", "nom"], name="filiere_type_nom_unique")
        ]

    def __str__(self):
        return f"{self.get_type_lycee_display()} — {self.nom}"


class Classe(models.Model):
    cycle = models.ForeignKey(Cycle, related_name="classes", on_delete=models.CASCADE)
    nom = models.CharField(max_length=60)
    filiere = models.CharField(max_length=80, blank=True)
    filiere_ref = models.ForeignKey(
        Filiere, related_name="classes", null=True, blank=True, on_delete=models.PROTECT
    )
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
    annee_fin = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["annee_debut"]
        constraints = [
            models.CheckConstraint(
                condition=Q(annee_fin__isnull=True) | Q(annee_fin__gte=F("annee_debut")),
                name="scolarite_annees_ok",
            ),
            models.UniqueConstraint(fields=["profil", "classe", "annee_debut"], name="scolarite_unique"),
        ]
        indexes = [models.Index(fields=["classe", "annee_debut", "annee_fin"])]


class ParcoursBrouillon(models.Model):
    profil = models.OneToOneField(
        "profils.Profil", related_name="parcours_brouillon", on_delete=models.CASCADE
    )
    etape = models.PositiveSmallIntegerField(default=0)
    donnees = models.JSONField(default=dict, blank=True)
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-modifie_le"]
