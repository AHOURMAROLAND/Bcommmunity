import time
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from comptes.models import User
from profils.models import Profil, SituationActuelle

from .consumers import HubConsumer
from .models import Conversation, Message, Participant, ReactionMessage


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
    remplacement = client(bob).post(
        reaction_url, {"emoji": "👍"}, format="json",
    )
    assert remplacement.status_code == 200
    assert remplacement.data["remplace"] == "❤️"
    reactions_bob = ReactionMessage.objects.filter(
        message_id=message_id, user=bob,
    )
    assert reactions_bob.count() == 1
    assert reactions_bob.get().emoji == "👍"
    messages = client(alice).get(f"/api/conversations/{conversation.pk}/messages/")
    image_message = next(item for item in messages.data["results"] if item["id"] == message_id)
    assert image_message["reactions"] == [{"emoji": "👍", "nb": 1, "moi": False}]

    messages_bob = client(bob).get(f"/api/conversations/{conversation.pk}/messages/")
    image_message_bob = next(
        item for item in messages_bob.data["results"] if item["id"] == message_id
    )
    assert image_message_bob["reactions"] == [{"emoji": "👍", "nb": 1, "moi": True}]
    assert client(bob).delete(
        reaction_url, {"emoji": "👍"}, format="json",
    ).status_code == 204


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


@pytest.mark.django_db
def test_message_edit_requires_author_and_has_a_15_minute_deadline(discussion):
    conversation, (alice, bob) = discussion
    message = Message.objects.create(
        conversation=conversation, auteur=alice, texte="Avant",
    )
    endpoint = f"/api/conversations/{conversation.pk}/messages/{message.pk}/modifier/"

    edited = client(alice).patch(endpoint, {"texte": "Après"}, format="json")
    assert edited.status_code == 200
    assert edited.data["texte"] == "Après"
    assert edited.data["modifie_le"] is not None

    assert client(bob).patch(endpoint, {"texte": "Intrusion"}, format="json").status_code == 403

    message.cree_le = timezone.now() - timedelta(minutes=15, seconds=1)
    message.save(update_fields=["cree_le"])
    expired = client(alice).patch(endpoint, {"texte": "Trop tard"}, format="json")
    assert expired.status_code == 400
    message.refresh_from_db()
    assert message.texte == "Après"


@pytest.mark.django_db
def test_delete_for_me_is_private_and_delete_for_everyone_redacts(discussion):
    conversation, (alice, bob) = discussion
    private = Message.objects.create(
        conversation=conversation, auteur=bob, texte="Seulement masqué",
    )
    endpoint = f"/api/conversations/{conversation.pk}/messages/{private.pk}/suppression/"

    assert client(alice).post(endpoint, {"portee": "moi"}, format="json").status_code == 204
    assert client(alice).get(
        f"/api/conversations/{conversation.pk}/messages/"
    ).data["results"] == []
    assert client(bob).get(
        f"/api/conversations/{conversation.pk}/messages/"
    ).data["results"][0]["texte"] == "Seulement masqué"

    shared = Message.objects.create(
        conversation=conversation, auteur=bob, texte="À effacer",
    )
    suppression_url = f"/api/conversations/{conversation.pk}/messages/{shared.pk}/suppression/"
    deleted = client(bob).post(
        suppression_url, {"portee": "tous"}, format="json",
    )
    assert deleted.status_code == 204
    shown = client(alice).get(
        f"/api/conversations/{conversation.pk}/messages/"
    ).data["results"][0]
    assert shown["id"] == shared.pk
    assert shown["texte"] == ""
    assert shown["supprime_pour_tous"] is True
    assert client(alice).post(
        suppression_url, {"portee": "tous"}, format="json",
    ).status_code == 404


@pytest.mark.django_db
def test_delete_for_me_hides_message_from_conversation_preview_and_unread_count(discussion):
    conversation, (alice, bob) = discussion
    visible = Message.objects.create(
        conversation=conversation, auteur=bob, texte="Visible",
    )
    masked = Message.objects.create(
        conversation=conversation, auteur=bob, texte="Masqué",
    )

    response = client(alice).post(
        f"/api/conversations/{conversation.pk}/messages/{masked.pk}/suppression/",
        {"portee": "moi"},
        format="json",
    )

    assert response.status_code == 204
    conversations = client(alice).get("/api/conversations/").data["results"]
    assert conversations[0]["dernier"]["texte"] == visible.texte
    assert conversations[0]["non_lus"] == 1
    assert client(alice).get("/api/discussions/compteurs/").data["non_lus"] == 1


@pytest.mark.django_db
def test_conversation_preview_is_present_for_image_message_without_caption(discussion):
    conversation, (alice, bob) = discussion
    image = Message.objects.create(
        conversation=conversation,
        auteur=bob,
        type=Message.Type.IMAGE,
        nom_fichier="photo.jpg",
        taille_fichier=1024,
    )

    response = client(alice).get("/api/conversations/")

    assert response.status_code == 200
    preview = response.data["results"][0]["dernier"]
    assert preview["texte"] == ""
    assert preview["type"] == Message.Type.IMAGE
    assert preview["auteur"] == bob.pk
    assert preview["cree_le"]
    assert preview["supprime_pour_tous"] is False


@pytest.mark.django_db
def test_favorites_are_personal_and_pin_is_conversation_wide(discussion):
    conversation, (alice, bob) = discussion
    first = Message.objects.create(
        conversation=conversation, auteur=alice, texte="Premier",
    )
    second = Message.objects.create(
        conversation=conversation, auteur=bob, texte="Deuxième",
    )
    first_url = f"/api/conversations/{conversation.pk}/messages/{first.pk}"
    second_url = f"/api/conversations/{conversation.pk}/messages/{second.pk}"

    assert client(alice).post(f"{first_url}/favori/").data == {
        "favori": True, "created": True,
    }
    assert client(alice).delete(f"{first_url}/favori/").status_code == 204
    client(alice).post(f"{first_url}/favori/")
    client(bob).post(f"{first_url}/favori/")

    alice_items = client(alice).get(
        f"/api/conversations/{conversation.pk}/messages/"
    ).data["results"]
    bob_items = client(bob).get(
        f"/api/conversations/{conversation.pk}/messages/"
    ).data["results"]
    assert next(item for item in alice_items if item["id"] == first.pk)["favori"] is True
    assert next(item for item in bob_items if item["id"] == first.pk)["favori"] is True

    assert client(alice).post(f"{first_url}/epingler/").status_code == 200
    detail = client(alice).get(f"/api/conversations/{conversation.pk}/").data
    assert detail["message_epingle"]["id"] == first.pk
    assert client(bob).post(f"{second_url}/epingler/").status_code == 200
    detail = client(alice).get(f"/api/conversations/{conversation.pk}/").data
    assert detail["message_epingle"]["id"] == second.pk
    items = client(alice).get(
        f"/api/conversations/{conversation.pk}/messages/"
    ).data["results"]
    assert next(item for item in items if item["id"] == first.pk)["epingle"] is False
    assert next(item for item in items if item["id"] == second.pk)["epingle"] is True
    assert client(bob).delete(f"{second_url}/epingler/").status_code == 204


@pytest.mark.django_db
def test_forward_copies_message_and_exposes_forwarded_state(discussion):
    source_conversation, (alice, bob) = discussion
    destination = Conversation.objects.create()
    Participant.objects.bulk_create([
        Participant(conversation=destination, user=alice),
        Participant(conversation=destination, user=bob),
    ])
    source = Message.objects.create(
        conversation=source_conversation, auteur=bob, texte="À transférer",
    )
    response = client(alice).post(
        f"/api/conversations/{source_conversation.pk}/messages/{source.pk}/transferer/",
        {"conversation_id": destination.pk},
        format="json",
    )

    assert response.status_code == 201
    assert response.data["texte"] == "À transférer"
    assert response.data["transfere"] is True
    assert response.data["message_origine_id"] == source.pk
    copie = Message.objects.get(pk=response.data["id"])
    assert copie.conversation_id == destination.pk
    assert copie.auteur_id == alice.pk


@pytest.mark.django_db
def test_forward_rejects_nonparticipant_destination(discussion):
    conversation, (alice, bob) = discussion
    other_conversation = Conversation.objects.create()
    Participant.objects.create(conversation=other_conversation, user=bob)
    message = Message.objects.create(
        conversation=conversation, auteur=bob, texte="Privé",
    )

    response = client(alice).post(
        f"/api/conversations/{conversation.pk}/messages/{message.pk}/transferer/",
        {"conversation_id": other_conversation.pk},
        format="json",
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_forward_batch_limits_five_destinations_and_is_idempotent(discussion):
    source_conversation, (alice, bob) = discussion
    source = Message.objects.create(
        conversation=source_conversation, auteur=bob, texte="À transférer",
    )
    destinations = []
    for _ in range(6):
        destination = Conversation.objects.create()
        Participant.objects.bulk_create([
            Participant(conversation=destination, user=alice),
            Participant(conversation=destination, user=bob),
        ])
        destinations.append(destination.pk)
    url = f"/api/conversations/{source_conversation.pk}/messages/{source.pk}/transferer/"

    refuse = client(alice).post(
        url, {"conversation_ids": destinations, "cid": "forward-limit-1"}, format="json")
    assert refuse.status_code == 400
    assert not Message.objects.filter(message_origine=source).exists()

    payload = {"conversation_ids": destinations[:5], "cid": "forward-batch-1"}
    premier = client(alice).post(url, payload, format="json")
    second = client(alice).post(url, payload, format="json")
    assert premier.status_code == 201
    assert second.status_code == 201
    assert len(premier.data["messages"]) == 5
    assert [m["id"] for m in second.data["messages"]] == [
        m["id"] for m in premier.data["messages"]
    ]
    assert Message.objects.filter(message_origine=source).count() == 5


@pytest.mark.django_db
def test_link_preview_parses_open_graph_and_rejects_private_hosts(monkeypatch, discussion):
    from discussions import apercu_lien

    _, (alice, bob) = discussion
    hote_public = apercu_lien._hote_public
    monkeypatch.setattr(
        apercu_lien,
        "_telecharger_html",
        lambda url: (
            '<html><head><meta property="og:title" content="Une page">'
            '<meta property="og:description" content="Summary">'
            '<meta property="og:image" content="https://example.com/image.jpg">'
            "</head></html>",
            url,
        ),
    )
    monkeypatch.setattr(
        apercu_lien,
        "_hote_public",
        lambda host: "127.0.0.1" if host in {"127.0.0.1", "localhost"} else "93.184.216.34",
    )
    preview = client(alice).get(
        "/api/discussions/apercu-lien/?url=https%3A%2F%2Fexample.com%2Farticle"
    )
    monkeypatch.setattr(apercu_lien, "_hote_public", hote_public)
    blocked = client(bob).get(
        "/api/discussions/apercu-lien/?url=http%3A%2F%2F127.0.0.1%2Fadmin"
    )

    assert preview.status_code == 200
    assert preview.data["titre"] == "Une page"
    assert preview.data["description"] == "Summary"
    assert "image" not in preview.data
    assert blocked.status_code == 400


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
