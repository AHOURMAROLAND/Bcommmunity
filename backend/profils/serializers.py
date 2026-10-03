from django.utils import timezone
from rest_framework import serializers

from scolarite.models import Classe, Cycle, Scolarite

from .models import Domaine, Profil, SituationActuelle


class ClasseSerializer(serializers.ModelSerializer):
    cycle = serializers.CharField(source="cycle.nom", read_only=True)

    class Meta:
        model = Classe
        fields = ("id", "nom", "filiere", "cycle")


class CycleSerializer(serializers.ModelSerializer):
    classes = ClasseSerializer(many=True, read_only=True)

    class Meta:
        model = Cycle
        fields = ("id", "nom", "classes")


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
        if debut is not None and fin is not None:
            if debut < 1950 or fin > timezone.now().year + 1:
                raise serializers.ValidationError("Années hors limites.")
            if fin < debut:
                raise serializers.ValidationError("L'année de fin précède l'année de début.")
        return a


class ProfilSerializer(serializers.ModelSerializer):
    prenom = serializers.CharField(source="user.prenom", read_only=True)
    nom = serializers.CharField(source="user.nom", read_only=True)
    statut = serializers.CharField(source="user.statut", read_only=True)
    photo = serializers.SerializerMethodField()
    situation = SituationSerializer(read_only=True, allow_null=True)
    scolarites = ScolariteSerializer(many=True, read_only=True)

    class Meta:
        model = Profil
        fields = ("id", "prenom", "nom", "statut", "photo", "bio", "ville", "annee_sortie",
                  "onboarding_termine", "visibilite_profil", "visibilite_parcours",
                  "visibilite_situation", "qui_peut_inviter", "situation", "scolarites")

    def get_photo(self, o):
        return o.photo.url if o.photo else None

    def validate_annee_sortie(self, valeur):
        if valeur and valeur > timezone.now().year + 1:
            raise serializers.ValidationError("Année invalide.")
        return valeur
