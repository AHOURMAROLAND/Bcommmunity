import asyncio
import time
from collections import deque

from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.core.cache import cache
from rest_framework.exceptions import APIException
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from comptes.models import User
from notifications.presence import marquer_present, retirer_presence
from .services import autres_de, envoyer_message, marquer_lu

presence = sync_to_async(marquer_present)
absence  = sync_to_async(retirer_presence)


@database_sync_to_async
def authentifier(token):
    try:
        user_id = AccessToken(token)["user_id"]
    except (TokenError, KeyError):
        return None
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        return None
    # blocage() retourne (code, fin, motif) ; code "ok" = acces autorise
    statut = cache.get(f"blocage_ws:{user_id}")
    if statut is None:
        statut = user.blocage()[0]
        cache.set(f"blocage_ws:{user_id}", statut, 15)
    return user, statut


@database_sync_to_async
def acces_ok(user):
    statut = cache.get(f"blocage_ws:{user.pk}")
    if statut is None:
        statut = user.blocage()[0]
        cache.set(f"blocage_ws:{user.pk}", statut, 15)
    return statut == "ok"


envoyer_sync = database_sync_to_async(envoyer_message)
lu_sync      = database_sync_to_async(marquer_lu)
autres_sync  = database_sync_to_async(autres_de)


class HubConsumer(AsyncJsonWebsocketConsumer):
    """
    Une seule connexion WS par utilisateur.
    Le jeton JWT est envoye dans le PREMIER message JSON (type: "auth"),
    pas dans l'URL, pour ne pas apparaitre dans les journaux.
    """
    MAX_OCTETS = 8192

    async def connect(self):
        self.user    = None
        self.recents = deque()
        self.typing  = {}
        self.autres  = {}
        await self.accept()
        self.delai = asyncio.create_task(self._delai_auth())

    async def _delai_auth(self):
        await asyncio.sleep(5)
        if self.user is None:
            await self.close(code=4401)

    async def disconnect(self, code):
        self.delai.cancel()
        if self.user:
            await absence(self.user.pk, self.channel_name)
            await self.channel_layer.group_discard(
                f"user_{self.user.pk}", self.channel_name)

    async def receive(self, text_data=None, bytes_data=None, **kwargs):
        if text_data and len(text_data) > self.MAX_OCTETS:
            return await self.close(code=1009)
        try:
            await super().receive(text_data=text_data, bytes_data=bytes_data, **kwargs)
        except ValueError:
            await self.close(code=1003)

    def _limite(self, n=20, fenetre=10):
        """Glissant : max n messages en fenetre secondes."""
        t = time.monotonic()
        while self.recents and t - self.recents[0] > fenetre:
            self.recents.popleft()
        if len(self.recents) >= n:
            return True
        self.recents.append(t)
        return False

    async def _diffuser(self, ids, data):
        for uid in set(ids):
            await self.channel_layer.group_send(
                f"user_{uid}", {"type": "evenement", "data": data})

    async def receive_json(self, c, **kwargs):
        if not isinstance(c, dict):
            return
        t = c.get("type")

        # Pas encore authentifie
        if self.user is None:
            if t != "auth":
                return await self.close(code=4401)
            res = await authentifier(str(c.get("token") or ""))
            if res is None:
                return await self.close(code=4401)
            user, statut = res
            if statut != "ok":
                return await self.close(code=4403)
            self.user = user
            self.delai.cancel()
            await self.channel_layer.group_add(f"user_{user.pk}", self.channel_name)
            await presence(self.user.pk, self.channel_name)
            return await self.send_json({"type": "auth.ok"})

        if t == "ping":
            if not await acces_ok(self.user):
                return await self.close(code=4403)
            await presence(self.user.pk, self.channel_name)
            return await self.send_json({"type": "pong"})
        if t == "message.send":
            return await self._envoyer(c)
        if t == "typing":
            return await self._typing(c)
        if t == "read":
            return await self._lu(c)

    async def _envoyer(self, c):
        cid  = str(c.get("cid") or "")[:40]
        conv = c.get("conversation")
        err  = {"type": "erreur", "cid": cid, "conversation": conv}
        if self._limite():
            return await self.send_json({**err, "detail": "Trop de messages."})
        if not isinstance(conv, int):
            return await self.send_json({**err, "detail": "Conversation invalide."})
        try:
            data, ids = await envoyer_sync(self.user, conv, c.get("texte"), cid)
        except APIException:
            return await self.send_json({**err, "detail": "Message refuse."})
        await self._diffuser(ids, data)

    async def _typing(self, c):
        conv = c.get("conversation")
        t    = time.monotonic()
        if not isinstance(conv, int) or t - self.typing.get(conv, 0) < 2:
            return
        self.typing[conv] = t
        ts, autres = self.autres.get(conv, (0, None))
        if t - ts > 60:
            autres = await autres_sync(self.user, conv)
            self.autres[conv] = (t, autres)
        if autres:
            await self._diffuser(
                autres, {"type": "typing", "conversation": conv, "user": self.user.pk})

    async def _lu(self, c):
        try:
            res = await lu_sync(
                self.user, int(c.get("conversation")), int(c.get("jusqua")))
        except (TypeError, ValueError, APIException):
            return
        if res:
            await self._diffuser(res[1], res[0])

    # Handler appele par channel_layer.group_send
    async def evenement(self, event):
        if event["data"].get("type") == "compte.suspendu":
            return await self.close(code=4403)
        await self.send_json(event["data"])
