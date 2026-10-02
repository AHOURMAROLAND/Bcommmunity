from django.core.cache import cache
from django.db import IntegrityError, transaction
from rest_framework import generics, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from scolarite.models import Cycle, Scolarite

from .models import Domaine, Profil, SituationActuelle
from .serializers import (
    CycleSerializer,
    DomaineSerializer,
    ProfilSerializer,
    ScolariteSerializer,
    SituationSerializer,
)

MAX_LIGNES_PARCOURS = 40


def profil_de(user):
    profil, _ = Profil.objects.get_or_create(user=user)
    return profil


class ProfilMoiView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfilSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        profil_de(self.request.user)
        return (Profil.objects.select_related("user", "situation__domaine")
                .prefetch_related("scolarites__classe__cycle").get(user=self.request.user))


class SituationMoiView(generics.RetrieveUpdateAPIView):
    serializer_class = SituationSerializer
    http_method_names = ["get", "put", "head", "options"]

    def get_object(self):
        situation, _ = SituationActuelle.objects.select_related("domaine").get_or_create(
            profil=profil_de(self.request.user))
        return situation

    def perform_update(self, serializer):
        # PUT remplace tout : les champs non envoyés reviennent à leur valeur par défaut.
        vides = {f.name: f.get_default() for f in SituationActuelle._meta.fields
                 if f.name not in ("id", "profil") and f.name not in serializer.validated_data}
        serializer.save(**vides)


class ScolariteViewSet(viewsets.ModelViewSet):
    serializer_class = ScolariteSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):  # filtrage par propriétaire : pas d'accès aux lignes d'autrui
        return (Scolarite.objects.filter(profil__user=self.request.user)
                .select_related("classe__cycle"))

    def _sauver(self, serializer, **extra):
        try:
            with transaction.atomic():
                serializer.save(**extra)
        except IntegrityError:
            raise ValidationError({"detail": "Cette ligne existe déjà."})

    def perform_create(self, serializer):
        profil = profil_de(self.request.user)
        if profil.scolarites.count() >= MAX_LIGNES_PARCOURS:
            raise ValidationError({"detail": "Nombre maximal de lignes atteint."})
        self._sauver(serializer, profil=profil)

    def perform_update(self, serializer):
        self._sauver(serializer)


class ReferentielsView(APIView):
    def get(self, request):
        data = cache.get("referentiels")
        if data is None:
            data = {
                "cycles": CycleSerializer(Cycle.objects.prefetch_related("classes"), many=True).data,
                "domaines": DomaineSerializer(Domaine.objects.all(), many=True).data,
            }
            cache.set("referentiels", data, 600)
        return Response(data)
