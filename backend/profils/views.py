from django.conf import settings
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db import IntegrityError, transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from rest_framework import generics, viewsets
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from amis.services import carte, ids_bloques, profils_actifs, relations
from config.imagerie import ImageInvalide, preparer_avatar, preparer_image
from discussions.services import etat_discussion
from scolarite.models import Classe, Cycle, Filiere, ParcoursBrouillon, Scolarite

from .models import Domaine, PhotoGalerie, Profil, SituationActuelle
from .serializers import (
    CycleSerializer,
    DomaineSerializer,
    FiliereSerializer,
    ProfilSerializer,
    ScolariteSerializer,
    SituationSerializer,
)

MAX_LIGNES_PARCOURS = 40


def profil_de(user):
    profil, _ = Profil.objects.get_or_create(user=user)
    return profil


def partage_profil(request, user_id):
    profil = (
        profils_actifs()
        .filter(user_id=user_id, visibilite_profil="tous", onboarding_termine=True)
        .first()
    )
    base_site = settings.SITE_URL.rstrip("/")
    ctx = {
        "ouvert": profil is not None,
        "url": f"{base_site}/profil-partage/{user_id}/",
        "lien_app": f"{base_site}/profil/{user_id}",
        "type_og": "profile",
        "image_alt": "Photo de profil Bakhita Community",
    }
    if profil:
        image = profil.photo.url if profil.photo else None
        if image and not image.startswith("http"):
            image = f"{base_site}{image}"
        ctx.update(
            titre=f"{profil.user.prenom} {profil.user.nom}",
            description=profil.bio[:160] or (
                "Ancien élève" if profil.user.statut == "ancien" else "Élève"
            ) + " · Bakhita Community",
            image=image,
            image_alt=f"Photo de {profil.user.prenom} {profil.user.nom}",
        )
    reponse = render(request, "publications/partage.html", ctx)
    reponse["Cache-Control"] = "public, max-age=300" if profil else "no-store"
    return reponse


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
                "filieres": FiliereSerializer(Filiere.objects.filter(active=True), many=True).data,
            }
            cache.set("referentiels", data, 600)
        return Response(data)


class ParcoursBrouillonView(APIView):
    def get(self, request):
        profil = profil_de(request.user)
        brouillon, _ = ParcoursBrouillon.objects.get_or_create(profil=profil)
        return Response({"etape": brouillon.etape, "donnees": brouillon.donnees})

    def put(self, request):
        etape = request.data.get("etape")
        donnees = request.data.get("donnees")
        if not isinstance(etape, int) or not 0 <= etape <= 4:
            raise ValidationError({"etape": "Étape invalide."})
        if not isinstance(donnees, dict):
            raise ValidationError({"donnees": "Le brouillon doit être un objet JSON."})
        if len(str(donnees)) > 50_000:
            raise ValidationError({"donnees": "Le brouillon est trop volumineux."})
        brouillon, _ = ParcoursBrouillon.objects.update_or_create(
            profil=profil_de(request.user),
            defaults={"etape": etape, "donnees": donnees},
        )
        return Response({"etape": brouillon.etape, "donnees": brouillon.donnees})


class ValiderParcoursView(APIView):
    def post(self, request):
        cycles = request.data.get("cycles")
        toujours = request.data.get("toujours_a_ecole", False)
        if not isinstance(cycles, list) or not isinstance(toujours, bool):
            raise ValidationError({"detail": "Parcours invalide."})
        if len(cycles) > 4:
            raise ValidationError({"cycles": "Trop de cycles."})

        type_lycee = request.data.get("type_lycee")
        filiere = None
        if type_lycee is not None:
            if type_lycee not in Filiere.TypeLycee.values:
                raise ValidationError({"type_lycee": "Type de lycée invalide."})
            filiere_id = request.data.get("filiere_id")
            filiere = Filiere.objects.filter(
                pk=filiere_id, type_lycee=type_lycee, active=True
            ).first()
            if not filiere:
                raise ValidationError({"filiere_id": "Choisissez une filière active."})

        annee_courante = timezone.now().year
        debut_cycle = None
        lignes = []
        dernier_index_cycle = max(
            (i for i, choix in enumerate(cycles) if isinstance(choix, dict) and choix.get("saute") is not True),
            default=-1,
        )
        for index, choix in enumerate(cycles):
            if not isinstance(choix, dict):
                raise ValidationError({"cycles": "Un cycle est invalide."})
            if choix.get("saute") is True:
                debut_cycle = None
                continue
            try:
                cycle = Cycle.objects.get(pk=int(choix["cycle_id"]))
                premiere_id = int(choix["premiere_classe_id"])
                derniere_id = int(choix["derniere_classe_id"])
                annee_arrivee = int(choix["annee_arrivee"])
            except (KeyError, TypeError, ValueError, Cycle.DoesNotExist) as erreur:
                raise ValidationError({"cycles": "Les informations du cycle sont incomplètes."}) from erreur
            if annee_arrivee < 1950 or annee_arrivee > annee_courante:
                raise ValidationError({"annee_arrivee": "L'année d'arrivée est hors limites."})
            classes_qs = Classe.objects.filter(cycle=cycle).order_by("ordre", "pk")
            if cycle.nom.casefold() == "lycée":
                if not filiere:
                    raise ValidationError({"filiere_id": "Choisissez d'abord une filière active."})
                classes_qs = classes_qs.filter(filiere_ref=filiere)
            classes = list(classes_qs)
            ids = [classe.pk for classe in classes]
            if premiere_id not in ids or derniere_id not in ids:
                raise ValidationError({"classes": "Les classes ne correspondent pas au cycle choisi."})
            premier_index, dernier_index = ids.index(premiere_id), ids.index(derniere_id)
            if premier_index > dernier_index:
                raise ValidationError({"classes": "La classe de départ vient après la dernière classe."})
            classe_ids = choix.get("classe_ids")
            if classe_ids is None:
                classes_retenues = classes[premier_index:dernier_index + 1]
            else:
                if (
                    not isinstance(classe_ids, list)
                    or not classe_ids
                    or any(isinstance(classe_id, bool) or not isinstance(classe_id, int)
                           for classe_id in classe_ids)
                    or len(set(classe_ids)) != len(classe_ids)
                ):
                    raise ValidationError({"classes": "La sélection des classes est invalide."})
                indices = [ids.index(classe_id) if classe_id in ids else -1 for classe_id in classe_ids]
                if (
                    indices[0] != premier_index
                    or indices[-1] != dernier_index
                    or any(index < 0 for index in indices)
                    or indices != sorted(indices)
                ):
                    raise ValidationError({"classes": "Les classes sélectionnées ne correspondent pas au cycle."})
                classes_retenues = [classes[index] for index in indices]
            durees = choix.get("durees", {})
            if not isinstance(durees, dict):
                raise ValidationError({"durees": "Durées de classe invalides."})
            annee = annee_arrivee
            index_precedent = None
            for classe in classes_retenues:
                index_classe = ids.index(classe.pk)
                if index_precedent is not None:
                    annee += index_classe - index_precedent - 1
                index_precedent = index_classe
                duree = durees.get(str(classe.pk), durees.get(classe.pk, 1))
                if isinstance(duree, bool) or not isinstance(duree, int) or duree not in (1, 2):
                    raise ValidationError({"durees": "Chaque classe doit durer un ou deux ans."})
                en_cours = toujours and index == dernier_index_cycle and classe.pk == derniere_id
                fin = None if en_cours else annee + duree
                if fin is not None and fin > annee_courante + 1:
                    raise ValidationError({"annee_arrivee": "Le parcours ne peut pas se terminer dans le futur."})
                lignes.append({
                    "classe": classe,
                    "annee_debut": annee,
                    "annee_fin": fin,
                })
                if fin is None:
                    debut_cycle = None
                else:
                    annee = fin
                    debut_cycle = fin
            if index < dernier_index_cycle and debut_cycle is None:
                raise ValidationError({"cycles": "Un cycle en cours doit être le dernier du parcours."})
        if len(lignes) > MAX_LIGNES_PARCOURS:
            raise ValidationError({"cycles": "Nombre maximal de classes dépassé."})

        profil = profil_de(request.user)
        with transaction.atomic():
            Scolarite.objects.filter(profil=profil).delete()
            Scolarite.objects.bulk_create([
                Scolarite(profil=profil, **ligne) for ligne in lignes
            ])
            ParcoursBrouillon.objects.filter(profil=profil).delete()
        return Response(ScolariteSerializer(
            Scolarite.objects.filter(profil=profil).select_related("classe__cycle"),
            many=True,
        ).data)


class ProfilPublicView(APIView):
    def get(self, request, user_id):
        moi = request.user
        if user_id == moi.pk or user_id in ids_bloques(moi):
            raise NotFound()
        rel = relations(moi)
        profil = get_object_or_404(
            profils_actifs().prefetch_related("scolarites__classe__cycle", "galerie"), user_id=user_id)
        est_ami = user_id in rel.amis
        if profil.visibilite_profil == "personne":
            raise NotFound()
        restreint = profil.visibilite_profil == "amis" and not est_ami

        data = carte(profil, rel)
        data["photo_grande"] = profil.photo.url if profil.photo else None
        data["restreint"] = restreint
        data["discussion"] = etat_discussion(moi, user_id, profil, rel)
        if restreint:
            data["photo"] = None
            data["situation"] = None
            return Response(data)

        data.update(bio=profil.bio, ville=profil.ville)
        data["galerie"] = [photo.image.url for photo in profil.galerie.all()]
        vis_whatsapp = profil.whatsapp_visibilite
        if profil.whatsapp and (
            vis_whatsapp == "tous" or (vis_whatsapp == "amis" and est_ami)
        ):
            data["whatsapp"] = profil.whatsapp
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


class GalerieProfilView(APIView):
    parser_classes = [MultiPartParser]
    throttle_scope = "photo"

    def get(self, request):
        profil = profil_de(request.user)
        return Response([{"id": p.pk, "image": p.image.url} for p in profil.galerie.all()])

    def post(self, request):
        fichier = request.FILES.get("image")
        if not fichier:
            raise ValidationError({"image": "Choisissez une image."})
        try:
            variantes = preparer_image(fichier, verifier_ratio=False)
        except ImageInvalide as erreur:
            raise ValidationError({"image": str(erreur)}) from erreur
        profil = profil_de(request.user)
        with transaction.atomic():
            profil = Profil.objects.select_for_update().get(pk=profil.pk)
            if profil.galerie.count() >= 10:
                raise ValidationError({"image": "La galerie est limitée à 10 photos."})
            ordre = (profil.galerie.aggregate(dernier=Max("ordre"))["dernier"] or -1) + 1
            image = variantes["grande"]
            photo = PhotoGalerie(profil=profil, ordre=ordre)
            photo.image.save(image.name, image, save=True)
        return Response({"id": photo.pk, "image": photo.image.url}, status=201)

    def delete(self, request, photo_id):
        deleted, _ = PhotoGalerie.objects.filter(profil__user=request.user, pk=photo_id).delete()
        if not deleted:
            raise NotFound()
        return Response(status=204)

    def patch(self, request, photo_id):
        fichier = request.FILES.get("image")
        if not fichier:
            raise ValidationError({"image": "Choisissez une image."})
        try:
            variantes = preparer_image(fichier, verifier_ratio=False)
        except ImageInvalide as erreur:
            raise ValidationError({"image": str(erreur)}) from erreur
        photo = PhotoGalerie.objects.filter(profil__user=request.user, pk=photo_id).first()
        if photo is None:
            raise NotFound()
        ancien = photo.image.name
        image = variantes["grande"]
        photo.image.save(image.name, image, save=True)
        if ancien:
            default_storage.delete(ancien)
        return Response({"id": photo.pk, "image": photo.image.url})


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
