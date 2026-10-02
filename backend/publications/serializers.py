from rest_framework import serializers

from .images import valider_et_traiter_image
from .models import Commentaire, Publication


class AuteurPublicationSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    prenom = serializers.CharField(read_only=True)
    nom = serializers.CharField(read_only=True)
    statut = serializers.CharField(read_only=True)
    annee_sortie = serializers.SerializerMethodField()
    situation_libelle = serializers.SerializerMethodField()

    def get_annee_sortie(self, user):
        profil = getattr(user, "profil", None)
        return getattr(profil, "annee_sortie", None) if profil else None

    def get_situation_libelle(self, user):
        profil = getattr(user, "profil", None)
        if not profil:
            return None
        sit = getattr(profil, "situation", None)
        if not sit:
            return None
        if sit.type == "emploi":
            return sit.poste or "En poste"
        if sit.type == "etudes":
            return sit.diplome or sit.etablissement or "Étudiant"
        if sit.type == "recherche":
            return "En recherche"
        return None


class CommentaireSerializer(serializers.ModelSerializer):
    auteur = AuteurPublicationSerializer(read_only=True)
    est_auteur = serializers.SerializerMethodField()

    class Meta:
        model = Commentaire
        fields = ("id", "publication", "auteur", "texte", "cree_le", "modifie_le", "est_auteur")
        read_only_fields = ("id", "publication", "auteur", "cree_le", "modifie_le", "est_auteur")

    def get_est_auteur(self, obj):
        req = self.context.get("request")
        return bool(req and req.user.is_authenticated and req.user.pk == obj.auteur_id)

    def validate_texte(self, val):
        t = (val or "").strip()
        if not t:
            raise serializers.ValidationError("Le commentaire ne peut pas être vide.")
        if len(t) > 1000:
            raise serializers.ValidationError("Le commentaire ne doit pas dépasser 1000 caractères.")
        return t


class PublicationSerializer(serializers.ModelSerializer):
    auteur = AuteurPublicationSerializer(read_only=True)
    est_auteur = serializers.SerializerMethodField()
    nb_likes = serializers.SerializerMethodField()
    nb_commentaires = serializers.SerializerMethodField()
    a_aime = serializers.SerializerMethodField()

    class Meta:
        model = Publication
        fields = (
            "id", "titre", "contenu", "image", "statut", "apercu_public",
            "cree_le", "modifie_le", "auteur", "est_auteur",
            "nb_likes", "nb_commentaires", "a_aime",
        )
        read_only_fields = fields

    def get_est_auteur(self, obj):
        req = self.context.get("request")
        return bool(req and req.user.is_authenticated and req.user.pk == obj.auteur_id)

    def get_nb_likes(self, obj):
        if hasattr(obj, "nb_likes_annote"):
            return obj.nb_likes_annote
        return obj.likes.count()

    def get_nb_commentaires(self, obj):
        if hasattr(obj, "nb_commentaires_annote"):
            return obj.nb_commentaires_annote
        return obj.commentaires.count()

    def get_a_aime(self, obj):
        if hasattr(obj, "a_aime_annote"):
            return bool(obj.a_aime_annote)
        req = self.context.get("request")
        if not req or not req.user.is_authenticated:
            return False
        return obj.likes.filter(user=req.user).exists()


class PublicationCreateUpdateSerializer(serializers.ModelSerializer):
    image = serializers.FileField(required=False, allow_null=True)
    supprimer_image = serializers.BooleanField(required=False, write_only=True, default=False)

    class Meta:
        model = Publication
        fields = ("titre", "contenu", "image", "statut", "apercu_public", "supprimer_image")

    def validate_titre(self, val):
        t = (val or "").strip()
        if len(t) < 3:
            raise serializers.ValidationError("Le titre doit comporter au moins 3 caractères.")
        if len(t) > 200:
            raise serializers.ValidationError("Le titre ne doit pas dépasser 200 caractères.")
        return t

    def validate_contenu(self, val):
        c = (val or "").strip()
        if len(c) < 5:
            raise serializers.ValidationError("Le contenu doit comporter au moins 5 caractères.")
        return c

    def validate_image(self, val):
        if val is None or val == "":
            return None
        return valider_et_traiter_image(val)

    def create(self, validated_data):
        validated_data.pop("supprimer_image", None)
        validated_data["auteur"] = self.context["request"].user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        supprimer = validated_data.pop("supprimer_image", False)
        if supprimer:
            if instance.image:
                instance.image.delete(save=False)
            instance.image = None
        return super().update(instance, validated_data)
