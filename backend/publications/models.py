from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver


class Publication(models.Model):
    class Statut(models.TextChoices):
        BROUILLON = "brouillon", "Brouillon"
        PUBLIE = "publie", "Publiée"

    auteur = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="publications", on_delete=models.CASCADE)
    titre = models.CharField(max_length=150)
    contenu = models.TextField(blank=True)  # HTML déjà nettoyé
    extrait = models.CharField(max_length=300, blank=True)
    image = models.ImageField(upload_to="publications/%Y/%m/", null=True, blank=True)
    image_m = models.ImageField(upload_to="publications/%Y/%m/", null=True, blank=True)
    image_s = models.ImageField(upload_to="publications/%Y/%m/", null=True, blank=True)
    image_largeur = models.PositiveIntegerField(null=True, blank=True)
    image_hauteur = models.PositiveIntegerField(null=True, blank=True)
    apercu_public = models.BooleanField(default=True)
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.BROUILLON)
    masquee = models.BooleanField(default=False)
    cree_le = models.DateTimeField(auto_now_add=True)
    modifie_le = models.DateTimeField(auto_now=True)
    publie_le = models.DateTimeField(null=True, blank=True)
    nb_likes = models.PositiveIntegerField(default=0)
    nb_commentaires = models.PositiveIntegerField(default=0)

    class Meta:
        indexes = [models.Index(fields=["statut", "masquee", "-publie_le"]),
                   models.Index(fields=["auteur", "-cree_le"])]


class Like(models.Model):
    publication = models.ForeignKey(Publication, related_name="likes", on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["publication", "user"], name="like_unique")]


class Commentaire(models.Model):
    publication = models.ForeignKey(Publication, related_name="commentaires", on_delete=models.CASCADE)
    auteur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    texte = models.CharField(max_length=1000)
    cree_le = models.DateTimeField(auto_now_add=True)
    masque = models.BooleanField(default=False)

    class Meta:
        indexes = [models.Index(fields=["publication", "cree_le"])]


@receiver(post_delete, sender=Publication)
def supprimer_images(sender, instance, **kwargs):
    for champ in ("image", "image_m", "image_s"):
        f = getattr(instance, champ)
        if f:
            f.delete(save=False)
