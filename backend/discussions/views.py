import json

import urllib3
from django.db import transaction
from django.db.models import Count, F, OuterRef, Prefetch, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination, PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from amis.services import ids_bloques

from .apercu_lien import lire_apercu
from .models import (
    InvitationDiscussion,
    Message,
    MessageFavori,
    Participant,
    ReactionMessage,
)
from .services import (
    accepter,
    contexte,
    definir_epingle,
    definir_favori,
    diffuser,
    envoyer_message,
    inviter,
    marquer_lu,
    modifier_message,
    resume,
    serialiser_message,
    supprimer_message,
    transferer_message,
    verifier_ecriture,
)

TAILLE_MAX_MEDIA = 10 * 1024 * 1024


class ApercuLienView(APIView):
    throttle_scope = "link_preview"

    def get(self, request):
        url = request.query_params.get("url", "")
        if not url:
            raise ValidationError({"url": "Un lien est obligatoire."})
        try:
            return Response(lire_apercu(url))
        except (OSError, TimeoutError, urllib3.exceptions.HTTPError) as erreur:
            raise ApercuIndisponible() from erreur


class ApercuIndisponible(APIException):
    status_code = 502
    default_detail = "Impossible de charger l’aperçu de ce lien."
    default_code = "apercu_indisponible"
EXTENSIONS_INTERDITES = {".bat", ".com", ".exe", ".htm", ".html", ".js", ".msi", ".svg"}


def type_depuis_fichier(fichier):
    content_type = (getattr(fichier, "content_type", "") or "").lower()
    extension = fichier.name.rsplit(".", 1)[-1].lower() if "." in fichier.name else ""
    if fichier.size > TAILLE_MAX_MEDIA:
        raise ValidationError({"fichier": "Fichier trop volumineux (10 Mo maximum)."})
    if f".{extension}" in EXTENSIONS_INTERDITES:
        raise ValidationError({"fichier": "Ce type de fichier n'est pas autorisé."})
    if content_type.startswith("image/") and content_type != "image/svg+xml":
        return "image"
    if content_type.startswith("audio/"):
        return "vocal"
    return "fichier"


def entier_optionnel(valeur, champ, minimum=0, maximum=2**63 - 1):
    if valeur in (None, ""):
        return None
    try:
        resultat = int(valeur)
    except (TypeError, ValueError):
        raise ValidationError({champ: "Valeur invalide."})
    if not minimum <= resultat <= maximum:
        raise ValidationError({champ: "Valeur hors limites."})
    return resultat


def forme_onde_optionnelle(valeur):
    if valeur in (None, ""):
        return []
    if isinstance(valeur, str):
        try:
            valeur = json.loads(valeur)
        except (TypeError, ValueError):
            raise ValidationError({"forme_onde": "Forme d'onde invalide."})
    if (
        not isinstance(valeur, list)
        or len(valeur) > 96
        or any(
            isinstance(niveau, bool)
            or not isinstance(niveau, (int, float))
            or not 0 <= niveau <= 1
            for niveau in valeur
        )
    ):
        raise ValidationError({"forme_onde": "Forme d'onde invalide."})
    return valeur


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
                   .exclude(masques__user=moi)
                   .exclude(supprime_pour_tous=True)
                   .exclude(conversation__participants__user_id__in=bloques)
                   .count())
        return Response({"invitations": inv, "non_lus": non_lus})


class ConversationsView(APIView):
    def get(self, request):
        moi = request.user
        bloques = ids_bloques(moi)
        dernier = (Message.objects.filter(conversation=OuterRef("conversation"))
                   .exclude(masques__user=moi)
                   .order_by("-id"))
        non_lus = (Message.objects
                   .filter(conversation=OuterRef("conversation"),
                           id__gt=OuterRef("dernier_lu"))
                   .exclude(auteur=OuterRef("user"))
                   .exclude(masques__user=moi)
                   .exclude(supprime_pour_tous=True)
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
                  d_type=Subquery(dernier.values("type")[:1]),
                  d_supprime=Subquery(dernier.values("supprime_pour_tous")[:1]),
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
                "dernier": {
                    "texte": p.d_texte,
                    "auteur": p.d_auteur,
                    "cree_le": str(p.d_date),
                    "type": p.d_type,
                    "supprime_pour_tous": p.d_supprime,
                } if p.d_date else None,
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
        qs = (Message.objects.filter(conversation_id=pk)
              .exclude(masques__user=request.user)
              .select_related("en_reponse_a", "auteur")
              .prefetch_related(
                  "reactions",
                  Prefetch(
                      "favoris",
                      queryset=MessageFavori.objects.filter(user=request.user),
                      to_attr="_favoris_moi",
                  ),
              ))
        page = pag.paginate_queryset(qs, request, view=self)
        return pag.get_paginated_response([
            serialiser_message(m, user_id=request.user.pk) for m in page
        ])

    def post(self, request, pk):
        _, autres = contexte(request.user, pk)
        if set(autres) & ids_bloques(request.user):
            raise NotFound()
        fichier = request.FILES.get("fichier")
        type_msg = str(request.data.get("type") or "texte")
        texte = request.data.get("texte", "")
        if fichier:
            type_msg = type_depuis_fichier(fichier)
        data, ids = envoyer_message(
            request.user,
            pk,
            texte=texte,
            type=type_msg,
            cid=request.data.get("cid"),
            fichier=fichier,
            nom_fichier=fichier.name if fichier else "",
            taille_fichier=fichier.size if fichier else None,
            duree_vocale=entier_optionnel(
                request.data.get("duree_vocale"), "duree_vocale", maximum=3600
            ),
            forme_onde=forme_onde_optionnelle(request.data.get("forme_onde")),
            en_reponse_a_id=entier_optionnel(
                request.data.get("en_reponse_a_id"), "en_reponse_a_id", minimum=1
            ),
        )
        transaction.on_commit(lambda: diffuser(ids, data))
        return Response(data["message"], status=201)


class MessagesMediaView(APIView):
    def get_throttles(self):
        self.throttle_scope = "message"
        return super().get_throttles()

    def post(self, request, pk):
        _, autres = contexte(request.user, pk)
        if set(autres) & ids_bloques(request.user):
            raise NotFound()
        fichier = request.FILES.get("fichier")
        if fichier is None:
            raise ValidationError({"fichier": "Aucun fichier fourni."})
        type_msg = type_depuis_fichier(fichier)
        data, ids = envoyer_message(
            request.user,
            pk,
            texte=request.data.get("texte", ""),
            cid=request.data.get("cid"),
            type=type_msg,
            fichier=fichier,
            nom_fichier=fichier.name,
            taille_fichier=fichier.size,
            duree_vocale=entier_optionnel(
                request.data.get("duree_vocale"), "duree_vocale", maximum=3600
            ),
            forme_onde=forme_onde_optionnelle(request.data.get("forme_onde")),
            en_reponse_a_id=entier_optionnel(
                request.data.get("en_reponse_a_id"), "en_reponse_a_id", minimum=1
            ),
        )
        transaction.on_commit(lambda: diffuser(ids, data))
        return Response(data["message"], status=201)


class MessageActionView(APIView):
    def get_throttles(self):
        if self.request.method == "PATCH":
            self.throttle_scope = "message"
        return super().get_throttles()

    def patch(self, request, pk, msg_id):
        data, ids = modifier_message(
            request.user, pk, msg_id, request.data.get("texte"),
        )
        transaction.on_commit(lambda: diffuser(ids, data))
        return Response(data["message"])

    def delete(self, request, pk, msg_id):
        # Legacy endpoint retained for existing clients.
        pour = request.query_params.get("pour", "moi")
        if pour not in ("moi", "tous"):
            raise ValidationError({"pour": "Utilisez 'moi' ou 'tous'."})
        data, ids = supprimer_message(
            request.user, pk, msg_id, pour_tous=pour == "tous",
        )
        if data is not None:
            transaction.on_commit(lambda: diffuser(ids, data))
        return Response(status=204)


class MessageSuppressionView(APIView):
    def post(self, request, pk, msg_id):
        portee = request.data.get("portee", "moi")
        if portee not in ("moi", "tous"):
            raise ValidationError({"portee": "Utilisez 'moi' ou 'tous'."})
        data, ids = supprimer_message(
            request.user, pk, msg_id, pour_tous=portee == "tous",
        )
        if data is not None:
            transaction.on_commit(lambda: diffuser(ids, data))
        return Response(status=204)


class MessageFavoriView(APIView):
    def post(self, request, pk, msg_id):
        result = definir_favori(request.user, pk, msg_id, True)
        return Response(result, status=201 if result["created"] else 200)

    def delete(self, request, pk, msg_id):
        definir_favori(request.user, pk, msg_id, False)
        return Response(status=204)


class MessageEpingleView(APIView):
    def post(self, request, pk, msg_id):
        data, ids = definir_epingle(request.user, pk, msg_id, True)
        transaction.on_commit(lambda: diffuser(ids, data))
        return Response({"epingle": True})

    def delete(self, request, pk, msg_id):
        data, ids = definir_epingle(request.user, pk, msg_id, False)
        transaction.on_commit(lambda: diffuser(ids, data))
        return Response(status=204)


class MessageTransfertView(APIView):
    def get_throttles(self):
        self.throttle_scope = "message"
        return super().get_throttles()

    def post(self, request, pk, msg_id):
        destination = request.data.get("conversation_ids")
        if destination is None:
            destination = request.data.get("conversation_id")
        data, ids = transferer_message(
            request.user,
            pk,
            msg_id,
            destination,
            client_id=request.data.get("cid"),
        )
        evenements = data.pop("_evenements", None)
        if evenements is None:
            transaction.on_commit(lambda: diffuser(ids, data))
            return Response(data["message"], status=201)
        for evenement, destinataires in evenements:
            transaction.on_commit(
                lambda evenement=evenement, destinataires=destinataires:
                    diffuser(destinataires, evenement)
            )
        return Response(data, status=201)


class ReactionView(APIView):
    @staticmethod
    def _message(pk, msg_id, user):
        contexte(user, pk)
        message = Message.objects.filter(pk=msg_id, conversation_id=pk).first()
        if message is None:
            raise NotFound()
        if message.auteur_id in ids_bloques(user):
            raise NotFound()
        return message

    def post(self, request, pk, msg_id):
        _, autres = contexte(request.user, pk)
        if set(autres) & ids_bloques(request.user):
            raise NotFound()
        emoji = str(request.data.get("emoji") or "").strip()
        if not emoji or len(emoji) > 8:
            raise ValidationError({"emoji": "Réaction invalide."})
        self._message(pk, msg_id, request.user)
        with transaction.atomic():
            Message.objects.select_for_update().get(pk=msg_id, conversation_id=pk)
            actuelle = (
                ReactionMessage.objects.select_for_update()
                .filter(message_id=msg_id, user=request.user)
                .first()
            )
            remplace = actuelle.emoji if actuelle and actuelle.emoji != emoji else None
            created = actuelle is None
            if actuelle is None:
                ReactionMessage.objects.create(
                    message_id=msg_id, user=request.user, emoji=emoji,
                )
            elif remplace:
                actuelle.emoji = emoji
                actuelle.save(update_fields=["emoji"])
            data = {
                "type": "reaction.maj",
                "conversation": pk,
                "message_id": msg_id,
                "emoji": emoji,
                "remplace": remplace,
                "created": created,
            }
            transaction.on_commit(lambda: diffuser([*autres, request.user.pk], data))
        return Response(
            {"emoji": emoji, "created": created, "remplace": remplace},
            status=201 if created else 200,
        )

    def delete(self, request, pk, msg_id):
        _, autres = contexte(request.user, pk)
        if set(autres) & ids_bloques(request.user):
            raise NotFound()
        emoji = str(request.data.get("emoji") or "").strip()
        if not emoji or len(emoji) > 8:
            raise ValidationError({"emoji": "Réaction invalide."})
        self._message(pk, msg_id, request.user)
        n = ReactionMessage.objects.filter(
            message_id=msg_id, user=request.user, emoji=emoji,
        ).delete()[0]
        data = {"type": "reaction.maj", "conversation": pk, "message_id": msg_id, "emoji": emoji, "deleted": n}
        transaction.on_commit(lambda: diffuser([*autres, request.user.pk], data))
        return Response(status=204)


class LuView(APIView):
    def post(self, request, pk):
        try:
            res = marquer_lu(request.user, pk, int(request.data.get("jusqua", 0)))
        except (TypeError, ValueError):
            res = None
        if res:
            transaction.on_commit(lambda: diffuser(res[1], res[0]))
        return Response(status=204)
