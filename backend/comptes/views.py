import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from google.auth.exceptions import GoogleAuthError
from rest_framework import generics, serializers, status
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from . import brevo, journal
from . import google as google_service
from .auth import verifier_acces
from .models import OTPEmail, SessionCompte, User
from .serializers import (
    ConnexionSerializer,
    GoogleSerializer,
    InscriptionSerializer,
    OubliSerializer,
    ReinitialisationSerializer,
    UtilisateurSerializer,
)
from .services import creer_compte
from .sessions import creer_session, obtenir_session, revoquer_sessions

logger = logging.getLogger(__name__)

COOKIE = "bk_refresh"
CHEMIN_COOKIE = "/api/auth/"


def poser_cookie(reponse, refresh):
    reponse.set_cookie(
        COOKIE, str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True, secure=not settings.DEBUG,
        samesite=settings.REFRESH_COOKIE_SAMESITE, path=CHEMIN_COOKIE)


def natif(request):
    return request.headers.get("X-Client") == "natif"


def reponse_connexion(user, request, nat=False):
    refresh = RefreshToken.for_user(user)
    creer_session(user, refresh, request)
    corps = {
        "access": str(refresh.access_token),
        "utilisateur": UtilisateurSerializer(user).data,
    }
    if nat:  # application Android : le jeton de session est stocké dans le Keystore, pas dans un cookie
        return Response({**corps, "refresh": str(refresh)})
    rep = Response(corps)
    poser_cookie(rep, refresh)
    return rep


class PublicView(APIView):
    permission_classes = [AllowAny]


class InscriptionView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = InscriptionSerializer
    throttle_scope = "inscription"

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        self.perform_create(ser)
        return Response({"detail": "Compte créé. Vérifiez votre adresse e-mail avec le code reçu."},
                        status=status.HTTP_201_CREATED)


class ConnexionView(PublicView):
    throttle_scope = "connexion"

    def post(self, request):
        ser = ConnexionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.validated_data["user"]
        journal.enregistrer(user, "connexion", "Mot de passe", request=request)
        return reponse_connexion(user, request, natif(request))


class GoogleView(PublicView):
    throttle_scope = "google"

    def post(self, request):
        ser = GoogleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            info = google_service.verifier(ser.validated_data["credential"])
        except (ValueError, GoogleAuthError):
            raise AuthenticationFailed("Connexion Google refusée.")

        sub, email = info["sub"], info["email"].strip().lower()
        user = (User.objects.filter(google_sub=sub).first()
                or User.objects.filter(email=email).first())

        if user is None:
            statut = ser.validated_data.get("statut")
            if not statut:  # le front demande alors "élève ou ancien ?" puis renvoie
                return Response({"code": "inscription_requise", "email": email,
                                 "prenom": info.get("given_name", ""),
                                 "nom": info.get("family_name", "")}, status=404)
            user = creer_compte(
                email=email,
                prenom=(info.get("given_name") or info.get("name") or "Membre")[:80],
                nom=(info.get("family_name") or "")[:80],
                statut=statut,
                google_sub=sub,
                email_verifie=True,
                valide=True,
            )
            reponse = reponse_connexion(user, request, natif(request))
            reponse.status_code = status.HTTP_201_CREATED
            return reponse

        if user.google_sub and user.google_sub != sub:
            raise PermissionDenied("Ce compte est lié à un autre compte Google.")
        if not user.google_sub:
            user.google_sub = sub
            if not user.email_verifie:
                # Anti-détournement : quelqu'un a pu créer ce compte avec l'e-mail d'autrui
                # et un mot de passe qu'il connaît. On neutralise ce mot de passe.
                user.set_unusable_password()
                user.email_verifie = True
            user.valide = True
            user.save(update_fields=["google_sub", "email_verifie", "password", "valide"])
            cache.delete(f"blocage:{user.pk}")
        verifier_acces(user)
        journal.enregistrer(user, "connexion", "Google", request=request)
        return reponse_connexion(user, request, natif(request))


def envoyer_lien_reinitialisation(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    lien = f"{settings.FRONTEND_URL}/reinitialiser?uid={uid}&token={token}"
    try:
        brevo.envoyer_reinitialisation(user.email, user.prenom, lien)
    except Exception:
        logger.exception("Échec d'envoi de l'e-mail de réinitialisation")


class OubliView(PublicView):
    throttle_scope = "reset"

    def post(self, request):
        ser = OubliSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=ser.validated_data["email"], is_active=True).first()
        if user:
            envoyer_lien_reinitialisation(user)
        # Même réponse que le compte existe ou non : pas de fuite d'information.
        return Response({"detail": "Si un compte existe pour cette adresse, un e-mail vient d'être envoyé."})


class ReinitialisationView(PublicView):
    throttle_scope = "reset"

    def post(self, request):
        ser = ReinitialisationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.validated_data["user"]
        user.set_password(ser.validated_data["password"])
        user.email_verifie = True  # l'accès à la boîte mail est prouvé
        user.valide = True
        user.save(update_fields=["password", "email_verifie", "valide"])
        journal.enregistrer(user, "mot_de_passe", "Réinitialisation", request=request)
        cache.delete(f"blocage:{user.pk}")
        revoquer_sessions(user)
        # Toutes les sessions existantes sont révoquées.
        for t in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=t)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RafraichirView(PublicView):
    throttle_scope = "rafraichir"

    def post(self, request):
        nat = natif(request)
        brut = request.data.get("refresh") if nat else request.COOKIES.get(COOKIE)
        if not isinstance(brut, str) or not brut:
            raise AuthenticationFailed("Session expirée.")
        try:
            refresh = RefreshToken(brut)
            user = User.objects.get(pk=refresh["user_id"])
            verifier_acces(user)
            sid = refresh.get("sid")
            if sid:
                session = obtenir_session(user.pk, sid)
            else:
                # Les sessions émises avant l'ajout du suivi sont renouvelées une fois.
                refresh.blacklist()
                nouveau = RefreshToken.for_user(user)
                creer_session(user, nouveau, request)
                corps = {
                    "access": str(nouveau.access_token),
                    **({"refresh": str(nouveau)} if nat else {}),
                }
                rep = Response(corps)
                if not nat:
                    poser_cookie(rep, nouveau)
                return rep
            ser = TokenRefreshSerializer(data={"refresh": brut})
            ser.is_valid(raise_exception=True)
        except (TokenError, User.DoesNotExist):
            raise AuthenticationFailed("Session expirée.")
        session.derniere_activite = timezone.now()
        corps = {"access": ser.validated_data["access"]}
        nouveau = ser.validated_data.get("refresh")
        if nouveau:
            refresh_renouvele = RefreshToken(nouveau)
            session.refresh_jti = str(refresh_renouvele["jti"])
            session.save(update_fields=["refresh_jti", "derniere_activite"])
            if nat:
                corps["refresh"] = nouveau
        else:
            session.save(update_fields=["derniere_activite"])
        rep = Response(corps)
        if nouveau and not nat:
            poser_cookie(rep, nouveau)
        return rep


class DeconnexionView(PublicView):
    def post(self, request):
        brut = request.data.get("refresh") if natif(request) else request.COOKIES.get(COOKIE)
        if isinstance(brut, str) and brut:
            try:
                refresh = RefreshToken(brut)
                sid = refresh.get("sid")
                if sid:
                    SessionCompte.objects.filter(
                        pk=sid, user_id=refresh.get("user_id"), active=True
                    ).update(active=False)
                else:
                    refresh.blacklist()
            except TokenError:
                pass
        rep = Response(status=status.HTTP_204_NO_CONTENT)
        rep.delete_cookie(COOKIE, path=CHEMIN_COOKIE)
        return rep


class SupprimerCompteView(APIView):
    """Droit à l'effacement : supprime le compte et tout ce qui lui appartient (exigé par Google Play)."""
    throttle_scope = "connexion"

    def delete(self, request):
        user = request.user
        if user.is_staff:
            raise PermissionDenied("Un compte administrateur ne peut pas être supprimé ici.")
        if user.has_usable_password():
            if not user.check_password(str(request.data.get("password") or "")):
                raise ValidationError({"password": "Mot de passe incorrect."})
        else:  # compte créé avec Google : nouvelle confirmation Google obligatoire
            try:
                info = google_service.verifier(str(request.data.get("credential") or ""))
            except (ValueError, GoogleAuthError):
                raise ValidationError({"credential": "Confirmation Google refusée."})
            if info.get("sub") != user.google_sub:
                raise ValidationError({"credential": "Ce n'est pas le compte Google lié."})
        user.delete()
        rep = Response(status=status.HTTP_204_NO_CONTENT)
        rep.delete_cookie(COOKIE, path=CHEMIN_COOKIE)
        return rep


class MoiView(generics.RetrieveAPIView):
    serializer_class = UtilisateurSerializer

    def get_object(self):
        return self.request.user


class SessionsView(APIView):
    def get(self, request):
        maintenant = timezone.now()
        SessionCompte.objects.filter(
            user=request.user,
            active=True,
            derniere_activite__lte=maintenant - timedelta(days=7),
        ).update(active=False)
        sid = request.auth.get("sid") if request.auth else None
        sessions = SessionCompte.objects.filter(user=request.user, active=True)
        return Response([
            {
                "id": str(session.pk),
                "appareil": session.appareil or "Appareil inconnu",
                "adresse_ip": session.adresse_ip,
                "cree_le": session.cree_le,
                "derniere_activite": session.derniere_activite,
                "actuelle": str(session.pk) == str(sid),
            }
            for session in sessions
        ])


class RevoquerSessionView(APIView):
    def delete(self, request, session_id):
        session = SessionCompte.objects.filter(
            pk=session_id, user=request.user, active=True
        ).first()
        if session is None:
            raise ValidationError({"detail": "Cette session n’est plus active."})
        sid = request.auth.get("sid") if request.auth else None
        if str(session.pk) == str(sid):
            raise ValidationError({
                "detail": "Pour fermer cette session, utilisez le bouton de déconnexion."
            })
        session.active = False
        session.save(update_fields=["active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class EnvoyerOTPView(PublicView):
    throttle_scope = "otp_envoyer"

    def post(self, request):
        email = str(request.data.get("email") or "").strip().lower()
        user = User.objects.filter(email__iexact=email, is_active=True, email_verifie=False).first()
        if user:
            # Expire all pending (non-used, non-expired) OTPs for this user
            OTPEmail.objects.filter(
                user=user, utilise=False, expire_le__gt=timezone.now()
            ).update(utilise=True)
            # Use a predictable code only in development; production always gets a random OTP.
            plain_code = settings.DEV_OTP_CODE or str(secrets.randbelow(1_000_000)).zfill(6)
            OTPEmail.objects.create(
                user=user,
                code=make_password(plain_code),
                expire_le=timezone.now() + timedelta(minutes=10),
            )
            brevo.envoyer_otp(user.email, user.prenom, plain_code)
        # Always return 200 — no user enumeration
        return Response({"detail": "Si un compte existe pour cette adresse, un code vient d'être envoyé."})


class VerifierOTPView(PublicView):
    throttle_scope = "otp_verifier"

    def post(self, request):
        email = str(request.data.get("email") or "").strip().lower()
        code = str(request.data.get("code") or "").strip()
        user = User.objects.filter(email__iexact=email, is_active=True, email_verifie=False).first()
        if user:
            otp = (OTPEmail.objects.filter(
                user=user, utilise=False, expire_le__gt=timezone.now()
            ).order_by("-expire_le").first())
            if otp and check_password(code, otp.code):
                otp.utilise = True
                otp.save(update_fields=["utilise"])
                user.email_verifie = True
                user.valide = True
                user.save(update_fields=["email_verifie", "valide"])
                cache.delete(f"blocage:{user.pk}")
                verifier_acces(user)
                journal.enregistrer(user, "connexion", "Code par e-mail", request=request)
                return reponse_connexion(user, request)
        return Response({"detail": "Code invalide ou expiré."}, status=status.HTTP_400_BAD_REQUEST)


class ChangerMotDePasseSerializer(serializers.Serializer):
    actuel = serializers.CharField(required=True)
    nouveau = serializers.CharField(min_length=8, required=True)


class ChangerMotDePasseView(APIView):
    def post(self, request):
        ser = ChangerMotDePasseSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(ser.validated_data["actuel"]):
            return Response({"detail": "Le mot de passe actuel est incorrect."}, status=400)
        user.set_password(ser.validated_data["nouveau"])
        user.save(update_fields=["password"])
        journal.enregistrer(user, "mot_de_passe", request=request)
        sid = request.auth.get("sid") if request.auth else None
        revoquer_sessions(user, sauf=sid)
        return Response({"detail": "Mot de passe modifié avec succès."})
