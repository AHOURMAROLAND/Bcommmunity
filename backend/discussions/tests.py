import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from comptes.models import User
from profils.models import Profil, SituationActuelle

from .consumers import HubConsumer
from .models import Conversation, Message, Participant


@pytest.fixture
def discussion(db):
    users = []
    for prenom in ("Alice", "Bob"):
        user = User.objects.create_user(
            f"{prenom.lower()}@example.com",
            "MotDePasseSecurise123!",
            prenom=prenom,
            nom="Test",
            valide=True,
        )
        profil = Profil.objects.create(user=user, onboarding_termine=True)
        SituationActuelle.objects.create(profil=profil)
        users.append(user)

    conversation = Conversation.objects.create()
    Participant.objects.bulk_create([
        Participant(conversation=conversation, user=user) for user in users
    ])
    return conversation, users


def client(user):
    api = APIClient()
    api.force_authenticate(user)
    return api


@pytest.mark.django_db
def test_media_message_reply_reaction_toggle_and_serialization(discussion, settings, tmp_path):
    conversation, (alice, bob) = discussion
    settings.MEDIA_ROOT = tmp_path
    original = Message.objects.create(
        conversation=conversation, auteur=bob, texte="À regarder",
    )
    fichier = SimpleUploadedFile("capture.png", b"\x89PNG\r\n\x1a\nimage", content_type="image/png")

    response = client(alice).post(
        f"/api/conversations/{conversation.pk}/messages/media/",
        {
            "fichier": fichier,
            "en_reponse_a_id": str(original.pk),
        },
        format="multipart",
    )

    assert response.status_code == 201
    assert response.data["type"] == "image"
    assert response.data["nom_fichier"] == "capture.png"
    assert response.data["en_reponse_a"] == {
        "id": original.pk,
        "texte": "À regarder",
        "auteur_id": bob.pk,
    }
    message_id = response.data["id"]

    reaction_url = f"/api/conversations/{conversation.pk}/messages/{message_id}/reactions/"
    assert client(bob).post(reaction_url, {"emoji": "❤️"}, format="json").status_code == 201
    messages = client(alice).get(f"/api/conversations/{conversation.pk}/messages/")
    image_message = next(item for item in messages.data["results"] if item["id"] == message_id)
    assert image_message["reactions"] == [{"emoji": "❤️", "nb": 1, "moi": False}]

    assert client(alice).delete(reaction_url, {"emoji": "❤️"}, format="json").status_code == 204


@pytest.mark.django_db
def test_reaction_endpoint_rejects_message_from_another_conversation(discussion):
    conversation, (alice, bob) = discussion
    autre = Conversation.objects.create()
    message = Message.objects.create(conversation=autre, auteur=bob, texte="Privé")

    response = client(alice).post(
        f"/api/conversations/{conversation.pk}/messages/{message.pk}/reactions/",
        {"emoji": "👍"},
        format="json",
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_rejouer_message_hors_ligne_ne_cree_pas_de_doublon(discussion):
    conversation, (alice, _) = discussion
    endpoint = f"/api/conversations/{conversation.pk}/messages/"
    payload = {"texte": "Envoyé hors ligne", "cid": "offline-message-1"}

    first = client(alice).post(endpoint, payload, format="json")
    replay = client(alice).post(endpoint, payload, format="json")

    assert first.status_code == replay.status_code == 201
    assert first.data["id"] == replay.data["id"]
    assert Message.objects.filter(conversation=conversation, auteur=alice).count() == 1


@pytest.mark.django_db
def test_voice_message_persists_valid_waveform_and_rejects_invalid_bins(discussion, settings, tmp_path):
    conversation, (alice, _) = discussion
    settings.MEDIA_ROOT = tmp_path
    audio = SimpleUploadedFile("voice.webm", b"audio", content_type="audio/webm")
    endpoint = f"/api/conversations/{conversation.pk}/messages/media/"

    response = client(alice).post(
        endpoint,
        {"fichier": audio, "forme_onde": "[0.1, 0.5, 1]"},
        format="multipart",
    )

    assert response.status_code == 201
    assert response.data["forme_onde"] == [0.1, 0.5, 1]
    assert Message.objects.get(pk=response.data["id"]).forme_onde == [0.1, 0.5, 1]

    audio = SimpleUploadedFile("voice.webm", b"audio", content_type="audio/webm")
    invalid = client(alice).post(
        endpoint,
        {"fichier": audio, "forme_onde": "[0.1, 1.5]"},
        format="multipart",
    )
    assert invalid.status_code == 400


@pytest.mark.asyncio
@pytest.mark.django_db
async def test_typing_consumer_broadcasts_voice_activity_and_stop(discussion):
    conversation, (alice, bob) = discussion
    consumer = HubConsumer(scope={"type": "websocket"})
    consumer.user = SimpleNamespace(pk=alice.pk)
    consumer.typing = {}
    consumer.autres = {conversation.pk: (time.monotonic(), [bob.pk])}
    consumer._diffuser = AsyncMock()

    await consumer._typing({
        "conversation": conversation.pk,
        "activite": "vocal",
        "actif": True,
    })
    await consumer._typing({
        "conversation": conversation.pk,
        "activite": "vocal",
        "actif": False,
    })

    assert consumer._diffuser.await_args_list[0].args[1] == {
        "type": "typing",
        "conversation": conversation.pk,
        "user": alice.pk,
        "activite": "vocal",
        "actif": True,
    }
    assert consumer._diffuser.await_args_list[1].args[1]["actif"] is False
    assert conversation.pk not in consumer.typing
