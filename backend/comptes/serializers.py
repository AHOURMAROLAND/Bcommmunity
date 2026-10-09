from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .auth import verifier_acces
from .models import User
from .services import creer_compte


class UtilisateurSerializer(serializers.ModelSerializer):
    a_mot_de_passe = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "prenom", "nom", "statut", "a_mot_de_passe", "lecture_seule")
        read_only_fields = fields

    def get_a_mot_de_passe(self, o):
        return o.has_usable_password()


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
        return creer_compte(**donnees)


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


class GoogleSerializer(serializers.Serializer):
    credential = serializers.CharField(max_length=4096)
    statut = serializers.ChoiceField(choices=User.Statut.choices, required=False)


class OubliSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ReinitialisationSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=40)
    token = serializers.CharField(max_length=100)
    password = serializers.CharField(max_length=128, trim_whitespace=False)

    def validate(self, a):
        invalide = serializers.ValidationError({"detail": "Lien invalide ou expiré."})
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(a["uid"])))
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise invalide
        if not default_token_generator.check_token(user, a["token"]):
            raise invalide
        validate_password(a["password"], user=user)
        a["user"] = user
        return a
