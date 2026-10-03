from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, viewsets
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from amis.services import carte, ids_bloques, profils_actifs, relations
from config.imagerie import ImageInvalide, preparer_avatar
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


class ProfilPublicView(APIView):
    def get(self, request, user_id):
        moi = request.user
        if user_id == moi.pk or user_id in ids_bloques(moi):
            raise NotFound()
        rel = relations(moi)
        profil = get_object_or_404(
            profils_actifs().prefetch_related("scolarites__classe__cycle"), user_id=user_id)
        est_ami = user_id in rel.amis
        if profil.visibilite_profil == "personne":
            raise NotFound()
        restreint = profil.visibilite_profil == "amis" and not est_ami

        data = carte(profil, rel)
        data["photo_grande"] = profil.photo.url if profil.photo else None
        data["restreint"] = restreint
        if restreint:
            data["photo"] = None
            data["situation"] = None
            return Response(data)

        data.update(bio=profil.bio, ville=profil.ville)
        v = profil.visibilite_parcours
        if v == "tous" or (v == "amis" and est_ami):
            mes = list(Scolarite.objects.filter(profil__user=moi)
                       .values_list("classe_id", "annee_debut", "annee_fin"))
            lignes = []
            for s in sorted(profil.scolarites.all(), key=lambda x: -x.annee_debut):
                commun = any(c == s.classe_id and d <= s.annee_fin and f >= s.annee_debut for c, d, f in mes)
                lignes.append({"id": s.pk, "classe": s.classe.nom, "filiere": s.classe.filiere,
                               "cycle": s.classe.cycle.nom, "annee_debut": s.annee_debut,
                               "annee_fin": s.annee_fin, "en_commun": commun})
            data["parcours"] = lignes
            data["classes_communes"] = sum(1 for x in lignes if x["en_commun"])
        else:
            data["parcours"] = None
        return Response(data)


class PhotoProfilView(APIView):
    parser_classes = [MultiPartParser]
    throttle_scope = "photo"

    def post(self, request):
        fichier = request.FILES.get("image")
        if not fichier:
            raise ValidationError({"image": "Choisissez une image."})
        try:
            v = preparer_avatar(fichier)
        except ImageInvalide as e:
            raise ValidationError({"image": str(e)})
        profil = profil_de(request.user)
        anciens = [f.name for f in (profil.photo, profil.photo_s) if f]
        profil.photo.save(v["grande"].name, v["grande"], save=False)
        profil.photo_s.save(v["mini"].name, v["mini"], save=False)
        profil.save(update_fields=["photo", "photo_s"])
        for nom in anciens:
            default_storage.delete(nom)
        return Response({"photo": profil.photo.url, "photo_mini": profil.photo_s.url})

    def delete(self, request):
        profil = profil_de(request.user)
        anciens = [f.name for f in (profil.photo, profil.photo_s) if f]
        profil.photo = None
        profil.photo_s = None
        profil.save(update_fields=["photo", "photo_s"])
        for nom in anciens:
            default_storage.delete(nom)
        return Response(status=204)

