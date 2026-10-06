from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from rest_framework import generics, serializers
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from amis.services import ids_bloques

from .models import Notification, Preferences, PushAbonnement
from .push import adresse_push_valide
from .reponse_push import (
    consommer_jeton_reponse,
    lire_jeton_reponse,
)
from .services import serialiser


class PaginationNotifs(CursorPagination):
    page_size = 20
    ordering = ("-modifie_le", "-id")


def visibles(user):
    return (Notification.objects
            .filter(destinataire=user)
            .exclude(acteur_id__in=ids_bloques(user)))


class NotificationsView(APIView):
    def get(self, request):
        qs = visibles(request.user).select_related("acteur__profil", "publication")
        pag = PaginationNotifs()
        page = pag.paginate_queryset(qs, request, view=self)
        return pag.get_paginated_response([serialiser(n) for n in page])


class CompteurView(APIView):
    def get(self, request):
        return Response({"non_lues": visibles(request.user).filter(lue=False).count()})


class LuView(APIView):
    def post(self, request):
        qs = Notification.objects.filter(destinataire=request.user, lue=False)
        ids = request.data.get("ids")
        if isinstance(ids, list):
            qs = qs.filter(pk__in=[i for i in ids if isinstance(i, int)][:200])
        elif not request.data.get("tout"):
            raise ValidationError({"detail": "Precisez les notifications a marquer."})
        qs.update(lue=True)
        return Response(status=204)


class PreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = Preferences
        fields = ("publications", "likes", "commentaires", "amis", "discussions", "push")


class PreferencesView(generics.RetrieveUpdateAPIView):
    serializer_class = PreferencesSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return Preferences.objects.get_or_create(user=self.request.user)[0]


class PushCleView(APIView):
    def get(self, request):
        return Response({"cle": settings.VAPID_PUBLIC_KEY})


class PushWebView(APIView):
    throttle_scope = "push"

    def post(self, request):
        endpoint = request.data.get("endpoint")
        cles     = request.data.get("keys")
        if (not isinstance(endpoint, str)
                or not adresse_push_valide(endpoint)
                or not isinstance(cles, dict)
                or not all(
                    isinstance(cles.get(k), str) and len(cles[k]) < 400
                    for k in ("p256dh", "auth"))):
            raise ValidationError({"detail": "Abonnement invalide."})
        PushAbonnement.objects.update_or_create(
            cible=endpoint,
            defaults={
                "user": request.user,
                "type": "web",
                "cles": {"p256dh": cles["p256dh"], "auth": cles["auth"]},
                "agent": request.headers.get("User-Agent", "")[:200],
                "actif": True,
                "echecs": 0,
            })
        return Response(status=201)


class PushFcmView(APIView):
    throttle_scope = "push"

    def post(self, request):
        jeton = request.data.get("jeton")
        if not isinstance(jeton, str) or not 20 <= len(jeton) <= 500:
            raise ValidationError({"detail": "Jeton invalide."})
        PushAbonnement.objects.update_or_create(
            cible=jeton,
            defaults={
                "user": request.user,
                "type": "fcm",
                "cles": None,
                "agent": "android",
                "actif": True,
                "echecs": 0,
            })
        return Response(status=201)


class PushRetirerView(APIView):
    def delete(self, request):
        PushAbonnement.objects.filter(
            user=request.user, cible=request.data.get("cible")).delete()
        return Response(status=204)


class PushReponseView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "push_reply"

    def post(self, request):
        jeton = request.data.get("jeton")
        texte = request.data.get("texte")
        if not isinstance(jeton, str) or not isinstance(texte, str):
            raise ValidationError({"detail": "Reponse invalide."})
        texte = texte.strip()
        if not texte or len(texte) > 2000:
            raise ValidationError({"texte": "La reponse doit contenir entre 1 et 2000 caracteres."})
        try:
            charge = lire_jeton_reponse(jeton)
        except signing.BadSignature:
            raise PermissionDenied("Ce lien de reponse a expire ou n'est pas valide.")

        User = get_user_model()
        user = User.objects.filter(
            pk=charge["u"], is_active=True, valide=True,
        ).first()
        if user is None:
            raise PermissionDenied("Ce compte ne peut plus envoyer de message.")

        from amis.services import profils_actifs
        from discussions.models import Message
        from discussions.services import contexte, envoyer_message, verifier_ecriture

        if not profils_actifs().filter(user_id=user.pk).exists():
            raise PermissionDenied("Ce compte ne peut plus envoyer de message.")
        _, autres = contexte(user, charge["c"])
        verifier_ecriture(user, autres)
        if not Message.objects.filter(
            pk=charge["m"],
            conversation_id=charge["c"],
            supprime_pour_tous=False,
        ).exclude(masques__user=user).exists():
            raise NotFound()
        if not consommer_jeton_reponse(charge["n"]):
            raise PermissionDenied("Cette reponse a deja ete envoyee.")

        data, ids = envoyer_message(
            user,
            charge["c"],
            texte=texte,
            cid=f"push-{charge['n']}",
            en_reponse_a_id=charge["m"],
        )
        from django.db import transaction

        from discussions.services import diffuser

        transaction.on_commit(lambda: diffuser(ids, data))
        return Response(data["message"], status=201)
