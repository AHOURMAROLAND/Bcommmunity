from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from comptes.models import User
from notifications.services import evenement
from scolarite.models import Scolarite

from .models import Amitie, Blocage
from .services import (
    carte,
    ids_bloques,
    profils_actifs,
    profils_visibles,
    relations,
    suggestions,
)

DELAI_REFUS = timedelta(days=30)
MAX_ENVOYEES = 50
SITUATIONS = {"emploi", "etudes", "recherche"}


def paginer(request, qs, fabrique):
    pag = PageNumberPagination()
    page = pag.paginate_queryset(qs, request)
    return pag.get_paginated_response([fabrique(p) for p in page])


def _int(valeur):
    try:
        return int(valeur)
    except (TypeError, ValueError):
        return None


class CibleSerializer(serializers.Serializer):
    user = serializers.IntegerField(min_value=1)


class AnnuaireView(APIView):
    def get(self, request):
        moi, p = request.user, request.query_params
        rel, bloques = relations(moi), ids_bloques(moi)
        amis = list(rel.amis)
        qs = profils_visibles(moi, rel, bloques)
        # Un filtre ne doit jamais révéler une information que la personne a masquée.
        vis_situation = Q(visibilite_situation="tous") | Q(visibilite_situation="amis", user_id__in=amis)
        vis_parcours = Q(visibilite_parcours="tous") | Q(visibilite_parcours="amis", user_id__in=amis)

        for mot in (p.get("q") or "").strip()[:120].split()[:8]:
            membres = Q(user__prenom__icontains=mot) | Q(user__nom__icontains=mot)
            public = Q(bio__icontains=mot) | Q(ville__icontains=mot)
            situation = (
                Q(situation__poste__icontains=mot)
                | Q(situation__entreprise__icontains=mot)
                | Q(situation__secteur__icontains=mot)
                | Q(situation__ville_emploi__icontains=mot)
                | Q(situation__etablissement__icontains=mot)
                | Q(situation__faculte__icontains=mot)
                | Q(situation__domaine__nom__icontains=mot)
                | Q(situation__diplome__icontains=mot)
                | Q(situation__niveau__icontains=mot)
            )
            parcours = Exists(
                Scolarite.objects.filter(profil=OuterRef("pk")).filter(
                    Q(classe__nom__icontains=mot)
                    | Q(classe__cycle__nom__icontains=mot)
                    | Q(classe__filiere__icontains=mot)
                    | Q(classe__filiere_ref__nom__icontains=mot)
                )
            )
            qs = qs.filter(
                membres | public | (vis_situation & situation) | (vis_parcours & parcours)
            )
        if (promo := _int(p.get("promo"))):
            qs = qs.filter(annee_sortie=promo)
        if p.get("statut") in ("eleve", "ancien"):
            qs = qs.filter(user__statut=p["statut"])

        filtre_sc = {}
        if (cycle := _int(p.get("cycle"))):
            filtre_sc["classe__cycle_id"] = cycle
        if (classe := _int(p.get("classe"))):
            filtre_sc["classe_id"] = classe
        if (filiere := (p.get("filiere") or "").strip()[:80]):
            filtre_sc["classe__filiere"] = filiere
        if filtre_sc:
            qs = qs.filter(vis_parcours).filter(
                Exists(Scolarite.objects.filter(profil=OuterRef("pk"), **filtre_sc)))

        if p.get("situation") in SITUATIONS:
            qs = qs.filter(vis_situation, situation__type=p["situation"])
        if (domaine := _int(p.get("domaine"))):
            qs = qs.filter(vis_situation, situation__domaine_id=domaine)
        if (etab := (p.get("etablissement") or "").strip()[:80]):
            qs = qs.filter(vis_situation, situation__etablissement__icontains=etab)

        qs = qs.order_by("user__nom", "user__prenom", "pk")  # ordre stable pour la pagination
        return paginer(request, qs, lambda x: carte(x, rel))


class SuggestionsView(APIView):
    def get(self, request):
        rel, bloques = relations(request.user), ids_bloques(request.user)
        qs = suggestions(request.user, rel, bloques)
        return paginer(request, qs, lambda x: carte(x, rel, x.communes))


class AmisListeView(APIView):
    def get(self, request):
        rel = relations(request.user)
        bloques = ids_bloques(request.user)
        qs = (profils_actifs().filter(user_id__in=list(rel.amis))
              .exclude(user_id__in=bloques)
              .order_by("user__nom", "user__prenom", "pk"))
        for mot in (request.query_params.get("q") or "").strip()[:120].split()[:8]:
            qs = qs.filter(Q(user__prenom__icontains=mot) | Q(user__nom__icontains=mot))
        return paginer(request, qs, lambda x: carte(x, rel))


class CompteursView(APIView):
    def get(self, request):
        n = Amitie.objects.filter(destinataire=request.user, statut="attente").count()
        return Response({"demandes_recues": n})


class DemandesView(APIView):
    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "demande_ami"
        return super().get_throttles()

    def get(self, request):
        rel, bloques = relations(request.user), ids_bloques(request.user)
        ids = rel.envoyees if request.query_params.get("type") == "envoyees" else rel.recues
        qs = profils_actifs().filter(user_id__in=list(ids)).exclude(user_id__in=bloques).order_by("-pk")
        return paginer(request, qs, lambda x: carte(x, rel))

    def post(self, request):
        ser = CibleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        moi, cible = request.user, ser.validated_data["user"]
        if cible == moi.pk:
            raise ValidationError({"detail": "Action impossible."})
        if cible in ids_bloques(moi) or not User.objects.filter(pk=cible, valide=True, is_active=True).exists():
            raise NotFound()
        try:
            with transaction.atomic():
                existante = (Amitie.objects.select_for_update()
                             .filter(Q(demandeur=moi, destinataire_id=cible) | Q(demandeur_id=cible, destinataire=moi))
                             .first())
                if existante is None:
                    if Amitie.objects.filter(demandeur=moi, statut="attente").count() >= MAX_ENVOYEES:
                        raise ValidationError({"detail": "Trop de demandes en attente."})
                    Amitie.objects.create(demandeur=moi, destinataire_id=cible)
                    evenement([cible], "demande_ami", moi)
                    return Response({"detail": "Demande envoyée."}, status=201)
                if existante.statut == "acceptee":
                    raise ValidationError({"detail": "Vous êtes déjà amis."})
                if existante.statut == "attente":
                    if existante.demandeur_id == cible:  # la demande existait dans l'autre sens
                        existante.statut, existante.repondue_le = "acceptee", timezone.now()
                        existante.save(update_fields=["statut", "repondue_le"])
                        evenement([cible], "ami_accepte", moi)
                        return Response({"detail": "Vous êtes maintenant amis."})
                    raise ValidationError({"detail": "Demande déjà envoyée."})
                if (existante.demandeur_id == moi.pk and existante.repondue_le
                        and timezone.now() - existante.repondue_le < DELAI_REFUS):
                    raise ValidationError({"detail": "Vous pourrez renvoyer une demande plus tard."})
                existante.demandeur, existante.destinataire_id = moi, cible
                existante.statut, existante.repondue_le = "attente", None
                existante.save()
                evenement([cible], "demande_ami", moi)
                return Response({"detail": "Demande envoyée."}, status=201)
        except IntegrityError:
            raise ValidationError({"detail": "Demande déjà existante."})


class DemandeActionView(APIView):
    def post(self, request, pk, action):
        try:
            demande = Amitie.objects.get(pk=pk, destinataire=request.user, statut="attente")
        except Amitie.DoesNotExist:
            raise NotFound()
        demande.statut = "acceptee" if action == "accepter" else "refusee"
        demande.repondue_le = timezone.now()
        demande.save(update_fields=["statut", "repondue_le"])
        if action == "accepter":
            evenement([demande.demandeur_id], "ami_accepte", request.user)
        return Response(status=204)


class DemandeAnnulerView(APIView):
    def delete(self, request, pk):
        n, _ = Amitie.objects.filter(pk=pk, demandeur=request.user, statut="attente").delete()
        if not n:
            raise NotFound()
        return Response(status=204)


class AmiRetirerView(APIView):
    def delete(self, request, user_id):
        moi = request.user
        n, _ = (Amitie.objects.filter(statut="acceptee")
                .filter(Q(demandeur=moi, destinataire_id=user_id) | Q(demandeur_id=user_id, destinataire=moi))
                .delete())
        if not n:
            raise NotFound()
        return Response(status=204)


class BlocagesView(APIView):
    def get(self, request):
        lignes = (Blocage.objects.filter(bloqueur=request.user).select_related("bloque")
                  .order_by("-cree_le")[:200])
        return Response([{"id": b.bloque_id, "prenom": b.bloque.prenom, "nom": b.bloque.nom} for b in lignes])

    def post(self, request):
        ser = CibleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        moi, cible = request.user, ser.validated_data["user"]
        if cible == moi.pk or not User.objects.filter(pk=cible, is_active=True).exists():
            raise NotFound()
        Blocage.objects.get_or_create(bloqueur=moi, bloque_id=cible)
        Amitie.objects.filter(Q(demandeur=moi, destinataire_id=cible)
                              | Q(demandeur_id=cible, destinataire=moi)).delete()
        return Response(status=201)


class BlocageDetailView(APIView):
    def delete(self, request, user_id):
        n, _ = Blocage.objects.filter(bloqueur=request.user, bloque_id=user_id).delete()
        if not n:
            raise NotFound()
        return Response(status=204)
