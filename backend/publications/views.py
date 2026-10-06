from django.conf import settings
from django.db import transaction
from django.db.models import Exists, F, OuterRef, Q
from django.shortcuts import render
from django.utils import timezone
from rest_framework import generics
from rest_framework.exceptions import NotFound
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from amis.services import ids_bloques
from comptes.models import Suspension
from notifications.services import evenement, lancer
from notifications.taches import annoncer_publication

from .models import Commentaire, Like, Publication
from .serializers import (
    CommentaireSerializer,
    PublicationDetailSerializer,
    PublicationEcritureSerializer,
    PublicationSerializer,
    TexteSerializer,
)


def annoncer(pub):
    """Lance la tache fan-out apres le commit."""
    transaction.on_commit(lambda: lancer(annoncer_publication, pub.pk))


class PaginationFil(CursorPagination):
    page_size = 10
    ordering = "-publie_le"


class PaginationMes(CursorPagination):
    page_size = 20
    ordering = "-cree_le"


class PaginationCommentaires(CursorPagination):
    page_size = 20
    ordering = "cree_le"


def avec_likes(qs, user):
    return qs.select_related("auteur__profil").annotate(
        a_aime=Exists(Like.objects.filter(publication=OuterRef("pk"), user=user)))


def visibles(user):
    suspendus = (Suspension.objects.filter(user=OuterRef("auteur_id"), active=True)
                 .filter(Q(definitive=True) | Q(fin__gt=timezone.now())))
    qs = (Publication.objects
          .filter(statut="publie", masquee=False, auteur__valide=True, auteur__is_active=True)
          .exclude(auteur_id__in=ids_bloques(user)).filter(~Exists(suspendus)))
    return avec_likes(qs, user)


def publication_accessible(user, pk):
    """Les siennes (tous statuts) ou les publications visibles par tous."""
    pub = (avec_likes(Publication.objects.filter(auteur=user), user).filter(pk=pk).first()
           or visibles(user).filter(pk=pk).first())
    if pub is None:
        raise NotFound()
    return pub


def detail(pub, request):
    return PublicationDetailSerializer(pub, context={"request": request}).data


class FilView(generics.ListCreateAPIView):
    pagination_class = PaginationFil
    serializer_class = PublicationSerializer

    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "publier"
        return super().get_throttles()

    def get_queryset(self):
        qs = visibles(self.request.user)
        auteur = self.request.query_params.get("auteur", "")
        return qs.filter(auteur_id=int(auteur)) if auteur.isdigit() else qs

    def create(self, request, *args, **kwargs):
        ser = PublicationEcritureSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        client_id = ser.validated_data.get("client_id")
        if client_id:
            existing = Publication.objects.filter(auteur=request.user, client_id=client_id).first()
            if existing:
                return Response(detail(publication_accessible(request.user, existing.pk), request))
        pub = ser.creer(request.user)
        if pub.statut == "publie":
            annoncer(pub)
        return Response(detail(publication_accessible(request.user, pub.pk), request), status=201)


class MesPublicationsView(generics.ListAPIView):
    serializer_class = PublicationSerializer
    pagination_class = PaginationMes

    def get_queryset(self):
        qs = avec_likes(Publication.objects.filter(auteur=self.request.user), self.request.user)
        statut = self.request.query_params.get("statut")
        return qs.filter(statut=statut) if statut in ("brouillon", "publie") else qs


class PublicationDetailView(APIView):
    def get_throttles(self):
        if self.request.method == "PATCH":
            self.throttle_scope = "publier"
        return super().get_throttles()

    def get(self, request, pk):
        return Response(detail(publication_accessible(request.user, pk), request))

    def patch(self, request, pk):
        pub = Publication.objects.filter(auteur=request.user, pk=pk).first()
        if pub is None:
            raise NotFound()
        ser = PublicationEcritureSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        etait_publiee = pub.statut == "publie"
        ser.modifier(pub)
        if not etait_publiee and pub.statut == "publie":
            annoncer(pub)
        return Response(detail(publication_accessible(request.user, pk), request))

    def delete(self, request, pk):
        n, _ = Publication.objects.filter(auteur=request.user, pk=pk).delete()
        if not n:
            raise NotFound()
        return Response(status=204)


class LikeView(APIView):
    throttle_scope = "like"

    def post(self, request, pk):
        pub = publication_accessible(request.user, pk)
        if pub.statut != "publie" or pub.masquee:
            raise NotFound()
        with transaction.atomic():
            _, cree = Like.objects.get_or_create(publication_id=pub.pk, user=request.user)
            if cree:
                Publication.objects.filter(pk=pub.pk).update(nb_likes=F("nb_likes") + 1)
                evenement([pub.auteur_id], "like", request.user, pub)
        pub.refresh_from_db(fields=["nb_likes"])
        return Response({"a_aime": True, "nb_likes": pub.nb_likes}, status=201 if cree else 200)

    def delete(self, request, pk):
        with transaction.atomic():
            n, _ = Like.objects.filter(publication_id=pk, user=request.user).delete()
            if n:
                Publication.objects.filter(pk=pk).update(nb_likes=F("nb_likes") - 1)
        return Response(status=204)


class CommentairesView(generics.ListCreateAPIView):
    serializer_class = CommentaireSerializer
    pagination_class = PaginationCommentaires

    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "commenter"
        return super().get_throttles()

    def get_queryset(self):
        publication_accessible(self.request.user, self.kwargs["pk"])
        return (Commentaire.objects.filter(publication_id=self.kwargs["pk"], masque=False)
                .exclude(auteur_id__in=ids_bloques(self.request.user))
                .exclude(auteur_id__in=Suspension.objects.filter(active=True)
                         .filter(Q(definitive=True) | Q(fin__gt=timezone.now())).values("user_id"))
                .select_related("auteur__profil"))

    def create(self, request, *args, **kwargs):
        pub = publication_accessible(request.user, kwargs["pk"])
        if pub.statut != "publie" or pub.masquee:
            raise NotFound()
        ser = TexteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        with transaction.atomic():
            c = Commentaire.objects.create(publication_id=pub.pk, auteur=request.user,
                                           texte=ser.validated_data["texte"])
            Publication.objects.filter(pk=pub.pk).update(nb_commentaires=F("nb_commentaires") + 1)
            evenement([pub.auteur_id], "commentaire", request.user, pub)
        return Response(CommentaireSerializer(c, context={"request": request}).data, status=201)


class CommentaireDetailView(APIView):
    def patch(self, request, pk):
        c = (Commentaire.objects.filter(pk=pk, auteur=request.user, masque=False)
             .select_related("auteur__profil").first())
        if c is None:
            raise NotFound()
        ser = TexteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        c.texte = ser.validated_data["texte"]
        c.save(update_fields=["texte"])
        return Response(CommentaireSerializer(c, context={"request": request}).data)

    def delete(self, request, pk):
        with transaction.atomic():
            c = Commentaire.objects.select_for_update().filter(pk=pk, auteur=request.user).first()
            if c is None:
                raise NotFound()
            Publication.objects.filter(pk=c.publication_id).update(nb_commentaires=F("nb_commentaires") - 1)
            c.delete()
        return Response(status=204)


def partage(request, pk):
    """Page légère avec balises Open Graph pour les aperçus WhatsApp. Inconnue, masquée ou non
    publique : même page générique, donc aucune fuite sur l'existence de la publication."""
    pub = Publication.objects.filter(pk=pk, statut="publie", masquee=False, apercu_public=True,
                                     auteur__valide=True, auteur__is_active=True).first()
    ctx = {"ouvert": pub is not None, "url": f"{settings.SITE_URL}/p/{pk}", "lien_app": f"/publications/{pk}"}
    if pub:
        img = (pub.image_m or pub.image) if pub.image else None
        if img:
            url_img = img.url
            # Avec R2, l'URL est deja absolue (https://cdn...)
            image_abs = url_img if url_img.startswith("http") else f"{settings.SITE_URL}{url_img}"
        else:
            image_abs = None
        ctx.update(titre=pub.titre, description=pub.extrait[:160], image=image_abs)
    rep = render(request, "publications/partage.html", ctx)
    rep["Cache-Control"] = "public, max-age=300" if pub else "no-store"
    return rep
