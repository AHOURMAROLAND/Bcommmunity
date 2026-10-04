from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Signalement
from .services import creer_signalement


class SignalementSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=Signalement.Cible.values)
    id = serializers.IntegerField(min_value=1)
    motif = serializers.ChoiceField(choices=Signalement.Motif.values)
    commentaire = serializers.CharField(max_length=500, allow_blank=True, required=False, default="")


class SignalerView(APIView):
    throttle_scope = "signalement"

    def post(self, request):
        ser = SignalementSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        _, cree = creer_signalement(request.user, d["type"], d["id"], d["motif"], d["commentaire"])
        return Response({"detail": "Merci, l'administrateur va examiner votre signalement."}, status=201 if cree else 200)
