from django.db import transaction
from django.db.models import Count, F, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.pagination import CursorPagination, PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from amis.services import ids_bloques

from .models import InvitationDiscussion, Message, Participant
from .services import (
    accepter,
    contexte,
    diffuser,
    envoyer_message,
    inviter,
    marquer_lu,
    resume,
    serialiser_message,
    verifier_ecriture,
)


class PaginationMessages(CursorPagination):
    page_size = 30
    ordering = "-id"


class InvitationsView(APIView):
    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "invitation"
        return super().get_throttles()

    def get(self, request):
        moi = request.user
        recues = request.query_params.get("type") != "envoyees"
        champ, autre = ("destinataire", "demandeur") if recues else ("demandeur", "destinataire")
        qs = (InvitationDiscussion.objects
              .filter(**{champ: moi}, statut="attente")
              .filter(**{f"{autre}__valide": True, f"{autre}__is_active": True})
              .exclude(**{f"{autre}_id__in": ids_bloques(moi)})
              .select_related(f"{autre}__profil")
              .order_by("-cree_le", "-pk"))
        pag = PageNumberPagination()
        page = pag.paginate_queryset(qs, request)
        return pag.get_paginated_response([
            {"id": i.pk, "message": i.message, "cree_le": i.cree_le,
             "utilisateur": resume(getattr(i, autre))}
            for i in page
        ])

    def post(self, request):
        cible = request.data.get("user")
        if not isinstance(cible, int):
            raise NotFound()
        inv, conv = inviter(request.user, cible, request.data.get("message"))
        if conv:
            return Response({"etat": "conversation", "conversation": conv.pk}, status=200)
        return Response({"etat": "envoyee", "invitation": inv.pk}, status=201)


class InvitationActionView(APIView):
    def post(self, request, pk, action):
        if action == "accepter":
            return Response({"conversation": accepter(request.user, pk).pk})
        n = InvitationDiscussion.objects.filter(
            pk=pk, destinataire=request.user, statut="attente",
        ).update(statut="refusee", repondue_le=timezone.now())
        if not n:
            raise NotFound()
        return Response(status=204)


class InvitationAnnulerView(APIView):
    def delete(self, request, pk):
        n = InvitationDiscussion.objects.filter(
            pk=pk, demandeur=request.user, statut="attente",
        ).update(statut="annulee", repondue_le=timezone.now())
        if not n:
            raise NotFound()
        return Response(status=204)


class CompteursView(APIView):
    def get(self, request):
        moi = request.user
        bloques = ids_bloques(moi)
        inv = (InvitationDiscussion.objects
               .filter(destinataire=moi, statut="attente")
               .exclude(demandeur_id__in=bloques)
               .count())
        non_lus = (Message.objects
                   .filter(conversation__participants__user=moi,
                           id__gt=F("conversation__participants__dernier_lu"))
                   .exclude(auteur=moi)
                   .exclude(conversation__participants__user_id__in=bloques)
                   .count())
        return Response({"invitations": inv, "non_lus": non_lus})


class ConversationsView(APIView):
    def get(self, request):
        moi = request.user
        bloques = ids_bloques(moi)
        dernier = Message.objects.filter(conversation=OuterRef("conversation")).order_by("-id")
        non_lus = (Message.objects
                   .filter(conversation=OuterRef("conversation"),
                           id__gt=OuterRef("dernier_lu"))
                   .exclude(auteur=OuterRef("user"))
                   .order_by()
                   .values("conversation")
                   .annotate(n=Count("id"))
                   .values("n"))
        qs = (Participant.objects
              .filter(user=moi, archive=False)
              .annotate(
                  d_texte=Subquery(dernier.values("texte")[:1]),
                  d_auteur=Subquery(dernier.values("auteur_id")[:1]),
                  d_date=Subquery(dernier.values("cree_le")[:1]),
                  nb=Coalesce(Subquery(non_lus), 0),
              )
              .order_by("-conversation__dernier_message_le", "-pk"))
        pag = PageNumberPagination()
        page = pag.paginate_queryset(qs, request)
        autres = {
            a.conversation_id: a
            for a in Participant.objects
            .filter(conversation_id__in=[p.conversation_id for p in page])
            .exclude(user=moi)
            .select_related("user__profil")
        }
        items = []
        for p in page:
            a = autres.get(p.conversation_id)
            if a is None or a.user_id in bloques:
                continue
            items.append({
                "id": p.conversation_id,
                "autre": resume(a.user),
                "non_lus": p.nb,
                "dernier": {"texte": p.d_texte, "auteur": p.d_auteur, "cree_le": str(p.d_date)}
                if p.d_texte else None,
            })
        return pag.get_paginated_response(items)


class ConversationDetailView(APIView):
    def get(self, request, pk):
        moi = request.user
        part, autres = contexte(moi, pk)
        autre = (Participant.objects
                 .filter(conversation_id=pk)
                 .exclude(user=moi)
                 .select_related("user__profil")
                 .first())
        if autre is None or autre.user_id in ids_bloques(moi):
            raise NotFound()
        try:
            verifier_ecriture(moi, autres)
            peut = True
        except PermissionDenied:
            peut = False
        return Response({
            "id": pk,
            "autre": resume(autre.user),
            "mon_dernier_lu": part.dernier_lu,
            "dernier_lu_autre": autre.dernier_lu,
            "peut_ecrire": peut,
        })


class MessagesView(APIView):
    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "message"
        return super().get_throttles()

    def get(self, request, pk):
        _, autres = contexte(request.user, pk)
        if set(autres) & ids_bloques(request.user):
            raise NotFound()
        pag = PaginationMessages()
        page = pag.paginate_queryset(
            Message.objects.filter(conversation_id=pk), request, view=self)
        return pag.get_paginated_response([serialiser_message(m) for m in page])

    def post(self, request, pk):
        data, ids = envoyer_message(
            request.user, pk, request.data.get("texte"), request.data.get("cid"))
        transaction.on_commit(lambda: diffuser(ids, data))
        return Response(data["message"], status=201)


class LuView(APIView):
    def post(self, request, pk):
        try:
            res = marquer_lu(request.user, pk, int(request.data.get("jusqua", 0)))
        except (TypeError, ValueError):
            res = None
        if res:
            transaction.on_commit(lambda: diffuser(res[1], res[0]))
        return Response(status=204)
