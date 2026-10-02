from django.conf import settings
from rest_framework import generics, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .auth import verifier_acces
from .models import User
from .serializers import ConnexionSerializer, InscriptionSerializer, UtilisateurSerializer

COOKIE = "bk_refresh"
CHEMIN_COOKIE = "/api/auth/"


def poser_cookie(reponse, refresh):
    reponse.set_cookie(
        COOKIE, str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True, secure=not settings.DEBUG,
        samesite=settings.REFRESH_COOKIE_SAMESITE, path=CHEMIN_COOKIE)


class PublicView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []


class InscriptionView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = InscriptionSerializer
    throttle_scope = "inscription"

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        self.perform_create(ser)
        return Response({"detail": "Compte créé. Il sera activé après validation par l'école."},
                        status=status.HTTP_201_CREATED)


class ConnexionView(PublicView):
    throttle_scope = "connexion"

    def post(self, request):
        ser = ConnexionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.validated_data["user"]
        refresh = RefreshToken.for_user(user)
        rep = Response({"access": str(refresh.access_token),
                        "utilisateur": UtilisateurSerializer(user).data})
        poser_cookie(rep, refresh)
        return rep


class RafraichirView(PublicView):
    throttle_scope = "connexion"

    def post(self, request):
        brut = request.COOKIES.get(COOKIE)
        if not brut:
            raise AuthenticationFailed("Session expirée.")
        try:
            user = User.objects.get(pk=RefreshToken(brut)["user_id"])
            verifier_acces(user)
            ser = TokenRefreshSerializer(data={"refresh": brut})
            ser.is_valid(raise_exception=True)
        except (TokenError, User.DoesNotExist):
            raise AuthenticationFailed("Session expirée.")
        rep = Response({"access": ser.validated_data["access"]})
        if "refresh" in ser.validated_data:
            poser_cookie(rep, ser.validated_data["refresh"])
        return rep


class DeconnexionView(PublicView):
    def post(self, request):
        brut = request.COOKIES.get(COOKIE)
        if brut:
            try:
                RefreshToken(brut).blacklist()
            except TokenError:
                pass
        rep = Response(status=status.HTTP_204_NO_CONTENT)
        rep.delete_cookie(COOKIE, path=CHEMIN_COOKIE)
        return rep


class MoiView(generics.RetrieveAPIView):
    serializer_class = UtilisateurSerializer

    def get_object(self):
        return self.request.user
