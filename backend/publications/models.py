from django.conf import settings
from django.db import models


class Publication(models.Model):
    class Statut(models.TextChoices):
        PUBLIE = "publie", "Publié"
        BROUILLON = "brouillon", "Brouillon"

    auteur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="publications")
    titre = models.CharField(max_length=200)
    contenu = models.TextField()
    image = models.ImageField(upload_to="publications/%Y/%m/", null=True, blank=True)
    statut = models.CharField(max_length=12, choices=Statut.choices, default=Statut.PUBLIE,
                              db_index=True)
    apercu_public = models.BooleanField(default=True)
    est_masque = models.BooleanField(default=False, db_index=True)
    cree_le = models.DateTimeField(auto_now_add=True, db_index=True)
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-cree_le"]
        indexes = [
            models.Index(fields=["statut", "est_masque", "-cree_le"]),
            models.Index(fields=["auteur", "statut", "-cree_le"]),
        ]

    def __str__(self):
        return f"{self.titre} ({self.auteur})"


class Like(models.Model):
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="likes_publications")
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["publication", "user"], name="unique_like_par_utilisateur")
        ]
        ordering = ["-cree_le"]

    def __str__(self):
        return f"{self.user} aime #{self.publication_id}"


class Commentaire(models.Model):
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="commentaires")
    auteur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="commentaires_publications")
    texte = models.TextField(max_length=1000)
    cree_le = models.DateTimeField(auto_now_add=True, db_index=True)
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["cree_le"]
        indexes = [
            models.Index(fields=["publication", "cree_le"]),
        ]

    def __str__(self):
        return f"Commentaire de {self.auteur} sur #{self.publication_id}"
