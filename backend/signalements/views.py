from django.conf import settings
from django.db import transaction
from rest_framework import serializers
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config.imagerie import ImageInvalide, preparer_image

from .models import ConfigurationSupport, MessageSupport, PieceJointeSignalement, Signalement
from .services import creer_signalement


class SignalementSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=Signalement.Cible.values)
    id = serializers.IntegerField(min_value=1)
    motif = serializers.ChoiceField(choices=Signalement.Motif.values)
    commentaire = serializers.CharField(max_length=500, allow_blank=True, required=False, default="")


class RetourTestSerializer(serializers.Serializer):
    motif = serializers.ChoiceField(choices=("bug", "suggestion"))
    commentaire = serializers.CharField(max_length=2000, allow_blank=True, required=False, default="")
    chemin = serializers.CharField(max_length=200, allow_blank=True, required=False, default="")


class MessageSupportSerializer(serializers.Serializer):
    texte = serializers.CharField(max_length=2000, trim_whitespace=True)


class SignalerView(APIView):
    throttle_scope = "signalement"
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def post(self, request):
        if request.data.get("type") == "retour":
            return self._creer_retour(request)
        ser = SignalementSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        _, cree = creer_signalement(request.user, d["type"], d["id"], d["motif"], d["commentaire"])
        return Response({"detail": "Merci, l'administrateur va examiner votre signalement."}, status=201 if cree else 200)

    def _creer_retour(self, request):
        serializer = RetourTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        donnees = serializer.validated_data
        texte = donnees["commentaire"]
        motif = donnees["motif"]
        if not texte and not request.FILES:
            raise serializers.ValidationError({"commentaire": "Ajoutez un message ou une pièce jointe."})
        if len(texte) > 2000:
            raise serializers.ValidationError({"commentaire": "Le message ne peut pas dépasser 2000 caractères."})
        fichiers = request.FILES.getlist("fichiers")
        if len(fichiers) > 5:
            raise serializers.ValidationError({"fichiers": "Vous pouvez joindre au maximum 5 fichiers."})
        taille_totale = sum(f.size for f in fichiers)
        if taille_totale > 20 * 1024 * 1024:
            raise serializers.ValidationError({"fichiers": "La taille totale des pièces jointes dépasse 20 Mo."})
        mime_extensions = {
            "image/jpeg": {"jpg", "jpeg"}, "image/png": {"png"}, "image/webp": {"webp"},
            "video/mp4": {"mp4"}, "video/webm": {"webm"}, "video/quicktime": {"mov"},
        }
        fichiers_prepares = []
        for fichier in fichiers:
            extension = fichier.name.rsplit(".", 1)[-1].lower() if "." in fichier.name else ""
            if extension not in mime_extensions.get(fichier.content_type, set()):
                raise serializers.ValidationError({"fichiers": "Formats acceptés : JPG, PNG, WebP, MP4, WebM et MOV."})
            if fichier.content_type.startswith("image/"):
                try:
                    fichier_prepare = preparer_image(fichier, verifier_ratio=False)["grande"]
                except ImageInvalide as erreur:
                    raise serializers.ValidationError({"fichiers": str(erreur)}) from erreur
                fichiers_prepares.append((fichier_prepare, "image/webp"))
                continue
            fichier.seek(0)
            signature = fichier.read(12)
            fichier.seek(0)
            valide = (
                signature[4:8] == b"ftyp"
                if fichier.content_type in ("video/mp4", "video/quicktime")
                else signature.startswith(b"\x1a\x45\xdf\xa3")
            )
            if not valide:
                raise serializers.ValidationError({"fichiers": "Le fichier vidéo semble invalide."})
            if fichier.size > 20 * 1024 * 1024:
                raise serializers.ValidationError({"fichiers": "Une vidéo ne peut pas dépasser 20 Mo."})
            fichiers_prepares.append((fichier, fichier.content_type))
        config = ConfigurationSupport.objects.prefetch_related("utilisateurs_autorises").first()
        if config and (
            not config.bouton_actif
            or (not config.ouvert_a_tous and not config.utilisateurs_autorises.filter(pk=request.user.pk).exists())
        ):
            return Response({"detail": "Le formulaire de retour n'est pas disponible."}, status=403)
        chemin = donnees["chemin"]
        contexte = {"chemin": str(chemin)[:200], "agent": request.META.get("HTTP_USER_AGENT", "")[:300]}
        with transaction.atomic():
            signalement = Signalement.objects.create(
                auteur=request.user,
                type_cible=Signalement.Cible.RETOUR,
                motif=motif,
                commentaire=texte,
                contexte=contexte,
                adresse_ip=self._adresse_ip(request),
            )
            for fichier, type_contenu in fichiers_prepares:
                PieceJointeSignalement.objects.create(
                    signalement=signalement, fichier=fichier, type_contenu=type_contenu,
                )
            en_attente = Signalement.objects.filter(statut__in=["nouveau", "en_cours"]).count()
            if en_attente and en_attente % settings.SEUIL_ALERTES_ADMIN == 0:
                signalement.alerte_seuil = en_attente
                signalement.save(update_fields=["alerte_seuil"])
        from notifications.services import lancer

        from .taches import alerter_admin
        lancer(alerter_admin, signalement.pk)
        return Response({"detail": "Merci, votre retour a bien été envoyé."}, status=201)

    @staticmethod
    def _adresse_ip(request):
        adresse = request.META.get("REMOTE_ADDR")
        return adresse or None


class ConfigurationSupportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = ConfigurationSupport.objects.prefetch_related("utilisateurs_autorises").first()
        actif = config is None or config.bouton_actif
        autorise = (
            config is None
            or config.ouvert_a_tous
            or config.utilisateurs_autorises.filter(pk=request.user.pk).exists()
        )
        return Response({"visible": actif and autorise})


class MesSignalementsView(APIView):
    def get(self, request):
        signalements = (
            Signalement.objects.filter(auteur=request.user, type_cible="retour")
            .prefetch_related("messages_support__expediteur")
            .order_by("-cree_le")[:30]
        )
        return Response([{
            "id": s.pk,
            "motif": s.get_motif_display(),
            "statut": s.get_statut_display(),
            "commentaire": s.commentaire,
            "cree_le": s.cree_le,
            "messages": [{
                "id": m.pk,
                "expediteur": "admin" if m.expediteur.is_staff else "moi",
                "texte": m.texte,
                "cree_le": m.cree_le,
            } for m in s.messages_support.all()],
        } for s in signalements])

    def post(self, request, signalement_id=None):
        if signalement_id is None:
            raise serializers.ValidationError({"detail": "Choisissez une conversation de support."})
        serializer = MessageSupportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        texte = serializer.validated_data["texte"]
        signalement = Signalement.objects.filter(
            pk=signalement_id, auteur=request.user, type_cible="retour",
        ).first()
        if signalement is None:
            return Response({"detail": "Conversation introuvable."}, status=404)
        message = MessageSupport.objects.create(signalement=signalement, expediteur=request.user, texte=texte)
        from notifications.services import lancer

        from .taches import notifier_admin_message_support
        lancer(notifier_admin_message_support, message.pk)
        return Response({
            "id": message.pk,
            "expediteur": "moi",
            "texte": message.texte,
            "cree_le": message.cree_le,
        }, status=201)
