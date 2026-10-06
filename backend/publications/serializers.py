from django.core.files.storage import default_storage
from django.utils import timezone
from rest_framework import serializers

from config.imagerie import ImageInvalide, preparer_image

from .models import Commentaire, Publication
from .texte import extrait, nettoyer_html, texte_brut

CHAMPS_IMAGE = (("image", "grande"), ("image_m", "moyenne"), ("image_s", "mini"))


def noms_images(pub):
    return [getattr(pub, c).name for c, _ in CHAMPS_IMAGE if getattr(pub, c)]


def poser_images(pub, v):
    for champ, cle in CHAMPS_IMAGE:
        f = v.get(cle)
        if f:
            getattr(pub, champ).save(f.name, f, save=False)
        else:
            setattr(pub, champ, None)
    pub.image_largeur, pub.image_hauteur = v["largeur"], v["hauteur"]


def retirer_images(pub):
    for champ, _ in CHAMPS_IMAGE:
        setattr(pub, champ, None)
    pub.image_largeur = pub.image_hauteur = None


def largeur_variante(larg, haut, cote):
    return round(larg * min(1, cote / max(larg, haut)))


def donnees_image(o):
    if not o.image:
        return None
    larg, haut = o.image_largeur, o.image_hauteur
    d = {"src": o.image.url, "moyenne": o.image_m.url if o.image_m else None,
         "mini": o.image_s.url if o.image_s else None, "largeur": larg, "hauteur": haut, "srcset": ""}
    if larg and haut:
        parts = []
        if o.image_s:
            parts.append(f"{o.image_s.url} {largeur_variante(larg, haut, 480)}w")
        if o.image_m:
            parts.append(f"{o.image_m.url} {largeur_variante(larg, haut, 1080)}w")
        parts.append(f"{o.image.url} {larg}w")
        d["srcset"] = ", ".join(parts)
    return d


def resume_auteur(u):
    p = getattr(u, "profil", None)
    return {"id": u.pk, "prenom": u.prenom, "nom": u.nom, "statut": u.statut,
            "photo": p.url_mini if p else None}


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
        return donnees_image(o)

    def get_a_aime(self, o):
        return bool(getattr(o, "a_aime", False))

    def get_est_auteur(self, o):
        return o.auteur_id == self.context["request"].user.pk


class PublicationDetailSerializer(PublicationSerializer):
    class Meta(PublicationSerializer.Meta):
        fields = PublicationSerializer.Meta.fields + ("contenu",)


class PublicationEcritureSerializer(serializers.Serializer):
    client_id = serializers.CharField(max_length=40, required=False, allow_blank=False, write_only=True)
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
            return preparer_image(f)
        except ImageInvalide as e:
            raise serializers.ValidationError(str(e))

    @staticmethod
    def _pret(statut, contenu):
        if statut == "publie" and not texte_brut(contenu):
            raise serializers.ValidationError({"contenu": "Écrivez du contenu avant de publier."})

    def creer(self, auteur):
        d = self.validated_data
        self._pret(d["statut"], d["contenu"])
        pub = Publication(auteur=auteur, client_id=d.get("client_id", ""),
                          titre=d["titre"], contenu=d["contenu"], extrait=extrait(d["contenu"]),
                          apercu_public=d["apercu_public"], statut=d["statut"])
        if d["statut"] == "publie":
            pub.publie_le = timezone.now()
        if d.get("image"):
            poser_images(pub, d["image"])
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

        anciens = noms_images(pub)
        change = False
        if d.get("image"):
            poser_images(pub, d["image"])
            change = True
        elif d.get("supprimer_image"):
            retirer_images(pub)
            change = True
        pub.extrait = extrait(pub.contenu)
        pub.save()
        if change:
            for nom in anciens:
                default_storage.delete(nom)
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
