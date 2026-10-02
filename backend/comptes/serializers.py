from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from profils.models import Profil, SituationActuelle

from .auth import verifier_acces
from .models import User


class UtilisateurSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "prenom", "nom", "statut")
        read_only_fields = fields


class InscriptionSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(max_length=254, validators=[
        UniqueValidator(queryset=User.objects.all(), lookup="iexact",
                        message="Cette adresse est déjà utilisée.")])
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)

    class Meta:
        model = User
        fields = ("email", "prenom", "nom", "statut", "password")

    def validate_email(self, valeur):
        return valeur.strip().lower()

    def validate(self, attrs):
        brouillon = User(email=attrs["email"], prenom=attrs["prenom"], nom=attrs["nom"])
        validate_password(attrs["password"], user=brouillon)
        return attrs

    def create(self, donnees):
        user = User.objects.create_user(**donnees)  # valide = False par défaut
        profil = Profil.objects.create(user=user)
        SituationActuelle.objects.create(profil=profil)
        return user


class ConnexionSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, max_length=128)

    def validate(self, attrs):
        user = authenticate(email=attrs["email"].strip().lower(), password=attrs["password"])
        if user is None:
            raise serializers.ValidationError({"detail": "Identifiants invalides."})
        verifier_acces(user)
        attrs["user"] = user
        return attrs
