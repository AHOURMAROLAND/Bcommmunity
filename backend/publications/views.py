from django.conf import settings
from django.db.models import Count, Exists, OuterRef
from django.http import Http404
from django.shortcuts import get_object_or_404, render
from django.views import View
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from amis.services import ids_bloques

from .models import Commentaire, Like, Publication
from .permissions import IsAuteurOuLectureSeule
from .serializers import (
    CommentaireSerializer,
    PublicationCreateUpdateSerializer,
    PublicationSerializer,
)


def _queryset_publications_base(user):
    """Queryset de base avec annotations et exclusion des utilisateurs bloqués."""
    bloques = ids_bloques(user) if user.is_authenticated else set()
    qs = (
        Publication.objects.filter(est_masque=False)
        .exclude(auteur_id__in=bloques)
        .select_related("auteur", "auteur__profil", "auteur__profil__situation")
        .annotate(
            nb_likes_annote=Count("likes", distinct=True),
            nb_commentaires_annote=Count("commentaires", distinct=True),
        )
    )
    if user.is_authenticated:
        qs = qs.annotate(
            a_aime_annote=Exists(Like.objects.filter(publication=OuterRef("pk"), user=user))
        )
    return qs


class PublicationListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PublicationCreateUpdateSerializer
        return PublicationSerializer

    def get_queryset(self):
        user = self.request.user
        qs = _queryset_publications_base(user)

        auteur_param = self.request.query_params.get("auteur")
        statut_param = self.request.query_params.get("statut")

        if auteur_param == "me":
            qs = qs.filter(auteur=user)
            if statut_param in ("publie", "brouillon"):
                qs = qs.filter(statut=statut_param)
        elif auteur_param:
            try:
                auteur_id = int(auteur_param)
                qs = qs.filter(auteur_id=auteur_id, statut=Publication.Statut.PUBLIE)
            except ValueError:
                return qs.none()
        else:
            # Fil d'actualité général : uniquement les publications publiées
            qs = qs.filter(statut=Publication.Statut.PUBLIE)

        return qs.order_by("-cree_le")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        # Réponse détaillée
        detail_serializer = PublicationSerializer(instance, context={"request": request})
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)


class PublicationDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsAuteurOuLectureSeule]

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return PublicationCreateUpdateSerializer
        return PublicationSerializer

    def get_queryset(self):
        user = self.request.user
        qs = _queryset_publications_base(user)
        return qs

    def get_object(self):
        obj = super().get_object()
        # Un brouillon ne peut être vu que par son propre auteur
        if obj.statut == Publication.Statut.BROUILLON and obj.auteur != self.request.user:
            raise PermissionDenied("Cette publication n'est pas encore publiée.")
        return obj

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", True)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial,
                                         context={"request": request})
        serializer.is_valid(raise_exception=True)
        updated_instance = serializer.save()
        detail_serializer = PublicationSerializer(updated_instance, context={"request": request})
        return Response(detail_serializer.data)


class LikeToggleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        bloques = ids_bloques(user)
        try:
            pub = Publication.objects.exclude(auteur_id__in=bloques).get(pk=pk, est_masque=False)
        except Publication.DoesNotExist:
            raise Http404("Publication introuvable.")

        if pub.statut == Publication.Statut.BROUILLON and pub.auteur != user:
            raise PermissionDenied("Impossible de liker un brouillon.")

        like, cree = Like.objects.get_or_create(publication=pub, user=user)
        if not cree:
            like.delete()
            aime = False
        else:
            aime = True

        nb_likes = pub.likes.count()
        return Response({"aime": aime, "nb_likes": nb_likes})


class CommentaireListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CommentaireSerializer

    def get_publication(self):
        user = self.request.user
        bloques = ids_bloques(user)
        pub_id = self.kwargs["pk"]
        try:
            pub = Publication.objects.exclude(auteur_id__in=bloques).get(pk=pub_id, est_masque=False)
        except Publication.DoesNotExist:
            raise Http404("Publication introuvable.")

        if pub.statut == Publication.Statut.BROUILLON and pub.auteur != user:
            raise PermissionDenied("Impossible d'accéder aux commentaires d'un brouillon.")
        return pub

    def get_queryset(self):
        pub = self.get_publication()
        bloques = ids_bloques(self.request.user)
        return (
            Commentaire.objects.filter(publication=pub)
            .exclude(auteur_id__in=bloques)
            .select_related("auteur", "auteur__profil", "auteur__profil__situation")
            .order_by("cree_le")
        )

    def perform_create(self, serializer):
        pub = self.get_publication()
        serializer.save(publication=pub, auteur=self.request.user)


class CommentaireDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsAuteurOuLectureSeule]
    serializer_class = CommentaireSerializer

    def get_queryset(self):
        user = self.request.user
        bloques = ids_bloques(user)
        return (
            Commentaire.objects.filter(publication__est_masque=False)
            .exclude(auteur_id__in=bloques)
            .exclude(publication__auteur_id__in=bloques)
            .select_related("auteur", "auteur__profil", "auteur__profil__situation")
        )


class PartageOpenGraphView(View):
    """
    Page publique /p/{id} générée côté serveur avec les balises Open Graph
    pour les robots de partage (WhatsApp, Facebook, Twitter, iMessage, etc.).
    """

    def get(self, request, id):
        pub = get_object_or_404(
            Publication.objects.select_related("auteur", "auteur__profil"),
            pk=id,
            statut=Publication.Statut.PUBLIE,
            est_masque=False,
        )

        og_image = request.build_absolute_uri(pub.image.url) if pub.image else ""
        og_url = request.build_absolute_uri()
        frontend_url = settings.FRONTEND_URL.rstrip("/")
        app_pub_url = f"{frontend_url}/fil#pub-{pub.id}"

        # Aperçu tronqué pour les non-connectés
        contenu_apercu = pub.contenu[:280] + ("..." if len(pub.contenu) > 280 else "")

        contexte = {
            "pub": pub,
            "og_image": og_image,
            "og_url": og_url,
            "frontend_url": frontend_url,
            "app_pub_url": app_pub_url,
            "contenu_apercu": contenu_apercu,
        }
        return render(request, "publications/partage.html", contexte)
