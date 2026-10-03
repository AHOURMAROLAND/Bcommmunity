from django.utils import timezone
from rest_framework import serializers

from config.imagerie import ImageInvalide, nettoyer_image

from .models import Commentaire, Publication
from .texte import extrait, nettoyer_html, texte_brut


def resume_auteur(u):
    p = getattr(u, "profil", None)
    return {"id": u.pk, "prenom": u.prenom, "nom": u.nom, "statut": u.statut,
            "photo": p.photo.url if p and p.photo else None}


class PublicationSerializer(serializers.ModelSerializer):
    auteur = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    a_aime = serializers.SerializerMethodField()
    est_auteur = serializers.SerializerMethodField()

    class Meta:
        model = Publication
        fields = ("id", "titre", "extrait", "image", "auteur", "statut", "masquee", "apercu_public",
                  "publie_le", "cree_le", "nb_likes", "nb_commentaires", "a_aime", "est_auteur")

    def get_auteur(self, o):
        return resume_auteur(o.auteur)

    def get_image(self, o):
        return o.image.url if o.image else None

    def get_a_aime(self, o):
        return bool(getattr(o, "a_aime", False))

    def get_est_auteur(self, o):
        return o.auteur_id == self.context["request"].user.pk


class PublicationDetailSerializer(PublicationSerializer):
    class Meta(PublicationSerializer.Meta):
        fields = PublicationSerializer.Meta.fields + ("contenu",)


class PublicationEcritureSerializer(serializers.Serializer):
    titre = serializers.CharField(min_length=3, max_length=150)
    contenu = serializers.CharField(max_length=20000, allow_blank=True, trim_whitespace=False)
    statut = serializers.ChoiceField(choices=["brouillon", "publie"], default="brouillon")
    apercu_public = serializers.BooleanField(default=True)
    image = serializers.FileField(required=False, allow_null=True)
    supprimer_image = serializers.BooleanField(default=False)

    def validate_contenu(self, v):
        return nettoyer_html(v)

    def validate_image(self, f):
        if f is None:
            return None
        try:
            return nettoyer_image(f)
        except ImageInvalide as e:
            raise serializers.ValidationError(str(e))

    @staticmethod
    def _pret(statut, contenu):
        if statut == "publie" and not texte_brut(contenu):
            raise serializers.ValidationError({"contenu": "Écrivez du contenu avant de publier."})

    def creer(self, auteur):
        d = self.validated_data
        self._pret(d["statut"], d["contenu"])
        pub = Publication(auteur=auteur, titre=d["titre"], contenu=d["contenu"], extrait=extrait(d["contenu"]),
                          apercu_public=d["apercu_public"], statut=d["statut"])
        if d["statut"] == "publie":
            pub.publie_le = timezone.now()
        if d.get("image"):
            pub.image.save(d["image"].name, d["image"], save=False)
        pub.save()
        return pub

    def modifier(self, pub):
        d = self.validated_data
        if d.get("statut") == "brouillon" and pub.statut == "publie":
            raise serializers.ValidationError({"statut": "Une publication publiée ne peut pas repasser en brouillon."})
        for champ in ("titre", "contenu", "apercu_public", "statut"):
            if champ in d:
                setattr(pub, champ, d[champ])
        self._pret(pub.statut, pub.contenu)
        if pub.statut == "publie" and pub.publie_le is None:
            pub.publie_le = timezone.now()
        ancien = pub.image.name if pub.image else None
        if d.get("supprimer_image") and not d.get("image"):
            pub.image = None
        if d.get("image"):
            pub.image.save(d["image"].name, d["image"], save=False)
        pub.extrait = extrait(pub.contenu)
        pub.save()
        if ancien and ancien != (pub.image.name if pub.image else None):
            pub.image.storage.delete(ancien)
        return pub


class TexteSerializer(serializers.Serializer):
    texte = serializers.CharField(min_length=1, max_length=1000)


class CommentaireSerializer(serializers.ModelSerializer):
    auteur = serializers.SerializerMethodField()
    est_auteur = serializers.SerializerMethodField()

    class Meta:
        model = Commentaire
        fields = ("id", "texte", "cree_le", "auteur", "est_auteur")

    def get_auteur(self, o):
        return resume_auteur(o.auteur)

    def get_est_auteur(self, o):
        return o.auteur_id == self.context["request"].user.pk
