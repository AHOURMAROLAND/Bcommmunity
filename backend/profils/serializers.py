import phonenumbers
from django.utils import timezone
from rest_framework import serializers

from scolarite.models import Classe, Cycle, Filiere, Scolarite

from .models import Domaine, Profil, SituationActuelle


class ClasseSerializer(serializers.ModelSerializer):
    cycle = serializers.CharField(source="cycle.nom", read_only=True)

    class Meta:
        model = Classe
        fields = ("id", "nom", "filiere", "filiere_ref", "cycle")


class CycleSerializer(serializers.ModelSerializer):
    classes = ClasseSerializer(many=True, read_only=True)

    class Meta:
        model = Cycle
        fields = ("id", "nom", "classes")


class FiliereSerializer(serializers.ModelSerializer):
    class Meta:
        model = Filiere
        fields = ("id", "type_lycee", "nom", "ordre")


class DomaineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Domaine
        fields = ("id", "nom")


class SituationSerializer(serializers.ModelSerializer):
    domaine_nom = serializers.CharField(source="domaine.nom", read_only=True, default=None)

    class Meta:
        model = SituationActuelle
        exclude = ("id", "profil")

    def validate(self, a):
        type_ = a.get("type", getattr(self.instance, "type", "autre"))
        err = {}
        if type_ == "emploi" and not a.get("poste"):
            err["poste"] = "Le poste est obligatoire."
        if type_ == "etudes":
            if not a.get("type_formation"):
                err["type_formation"] = "Choisissez le type de formation."
            if not a.get("etablissement"):
                err["etablissement"] = "L'établissement est obligatoire."
            if a.get("type_formation") == "universite":
                for champ in ("faculte", "domaine", "diplome"):
                    if not a.get(champ):
                        err[champ] = "Obligatoire pour l'université."
        if err:
            raise serializers.ValidationError(err)
        return a


class ScolariteSerializer(serializers.ModelSerializer):
    classe_detail = ClasseSerializer(source="classe", read_only=True)

    class Meta:
        model = Scolarite
        fields = ("id", "classe", "classe_detail", "annee_debut", "annee_fin")

    def validate(self, a):
        debut = a.get("annee_debut", getattr(self.instance, "annee_debut", None))
        fin = a.get("annee_fin", getattr(self.instance, "annee_fin", None))
        if debut is not None:
            if debut < 1950 or debut > timezone.now().year:
                raise serializers.ValidationError("Années hors limites.")
        if fin is not None:
            if fin > timezone.now().year + 1:
                raise serializers.ValidationError("Années hors limites.")
            if debut is not None and fin < debut:
                raise serializers.ValidationError("L'année de fin précède l'année de début.")
        return a


class ProfilSerializer(serializers.ModelSerializer):
    prenom = serializers.CharField(source="user.prenom", read_only=True)
    nom = serializers.CharField(source="user.nom", read_only=True)
    statut = serializers.CharField(source="user.statut", read_only=True)
    photo = serializers.SerializerMethodField()
    photo_mini = serializers.SerializerMethodField()
    situation = SituationSerializer(read_only=True, allow_null=True)
    scolarites = ScolariteSerializer(many=True, read_only=True)
    galerie = serializers.SerializerMethodField()
    cadeaux_anniversaire = serializers.SerializerMethodField()

    class Meta:
        model = Profil
        fields = ("id", "prenom", "nom", "statut", "photo", "photo_mini", "bio", "ville", "annee_sortie",
                  "onboarding_termine", "visibilite_profil", "visibilite_parcours",
                  "visibilite_situation", "qui_peut_inviter", "whatsapp", "whatsapp_visibilite",
                  "situation", "scolarites", "date_anniversaire", "galerie", "cadeaux_anniversaire")

    def get_photo(self, o):
        return o.photo.url if o.photo else None

    def get_photo_mini(self, o):
        return o.url_mini

    def get_galerie(self, o):
        return [photo.image.url for photo in o.galerie.all()]

    def get_cadeaux_anniversaire(self, o):
        return [{
            "id": cadeau.pk,
            "code": cadeau.code_bon,
            "message": cadeau.message,
            "cree_le": cadeau.cree_le,
        } for cadeau in o.cadeaux_anniversaire.all()]

    def validate_date_anniversaire(self, valeur):
        if valeur and valeur > timezone.localdate():
            raise serializers.ValidationError("La date d’anniversaire ne peut pas être dans le futur.")
        if valeur and valeur.year < 1900:
            raise serializers.ValidationError("La date d’anniversaire est invalide.")
        return valeur

    def validate_annee_sortie(self, valeur):
        if valeur and valeur > timezone.now().year + 1:
            raise serializers.ValidationError("Année invalide.")
        return valeur

    def validate_whatsapp(self, valeur):
        valeur = valeur.strip()
        if not valeur:
            return ""
        if not valeur.startswith("+"):
            raise serializers.ValidationError("Utilisez le format international, par exemple +22890000000.")
        try:
            numero = phonenumbers.parse(valeur, None)
        except phonenumbers.NumberParseException as erreur:
            raise serializers.ValidationError("Numéro international invalide.") from erreur
        if not phonenumbers.is_valid_number(numero):
            raise serializers.ValidationError("Numéro international invalide.")
        if phonenumbers.number_type(numero) not in (
            phonenumbers.PhoneNumberType.MOBILE,
            phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE,
        ):
            raise serializers.ValidationError("Saisissez un numéro mobile.")
        return phonenumbers.format_number(numero, phonenumbers.PhoneNumberFormat.E164)
