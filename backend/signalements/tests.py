from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from amis.tests import api, membre
from comptes import moderation
from comptes.models import Suspension
from comptes.taches import lever_suspensions_expirees
from discussions.models import Conversation, Message, Participant
from discussions.services import cle
from publications.models import Publication
from .models import Signalement

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def isole():
    cache.clear()


def publication(auteur):
    return Publication.objects.create(auteur=auteur, titre="Titre", contenu="<p>x</p>", extrait="x", statut="publie")


def signaler(u, type_, id_, motif="spam"):
    return api(u).post("/api/signalements/", {"type": type_, "id": id_, "motif": motif}, format="json")


def avec_jeton(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return c


def test_signalement_publication_idempotent_et_pas_la_sienne():
    a, b = membre("Alice"), membre("Bob")
    pub = publication(a)
    assert signaler(b, "publication", pub.pk).status_code == 201
    assert signaler(b, "publication", pub.pk).status_code == 200
    assert Signalement.objects.count() == 1
    assert signaler(a, "publication", pub.pk).status_code == 404


def test_masquage_preventif_a_trois_signalements():
    a = membre("Alice")
    pub = publication(a)
    for nom in ("Bob", "Chloe"):
        signaler(membre(nom), "publication", pub.pk)
    pub.refresh_from_db()
    assert pub.masquee is False
    signaler(membre("David"), "publication", pub.pk)
    pub.refresh_from_db()
    assert pub.masquee is True


def test_signalement_conversation_copie_les_messages_et_refuse_un_tiers():
    a, b, c = membre("Alice"), membre("Bob"), membre("Chloe")
    conv = Conversation.objects.create(paire_cle=cle(a.pk, b.pk))
    Participant.objects.bulk_create([Participant(conversation=conv, user=a), Participant(conversation=conv, user=b)])
    Message.objects.create(conversation=conv, auteur=b, texte="Message litigieux")
    assert signaler(a, "conversation", conv.pk, "harcelement").status_code == 201
    s = Signalement.objects.get()
    assert s.utilisateur_cible_id == b.pk and s.extrait["messages"][0]["texte"] == "Message litigieux"
    assert signaler(c, "conversation", conv.pk).status_code == 404


def test_suspension_coupe_les_sessions_et_la_levee_rend_l_acces(mailoutbox):
    admin, u = membre("Admin"), membre("Bob")
    refresh = RefreshToken.for_user(u)
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    assert c.get("/api/auth/moi/").status_code == 200
    moderation.suspendre(u, "Contenu inapproprié", admin, jours=1)
    r = c.get("/api/auth/moi/")
    assert r.status_code == 403 and r.data["code"] == "suspendu" and r.data["motif"] == "Contenu inapproprié"
    assert BlacklistedToken.objects.filter(token__user=u).exists()
    assert len(mailoutbox) == 1 and "suspendu" in mailoutbox[0].subject
    moderation.lever([u.pk])
    assert avec_jeton(u).get("/api/auth/moi/").status_code == 200


def test_suspension_echue_levee_par_la_tache(mailoutbox):
    u = membre("Bob")
    Suspension.objects.create(user=u, motif="test", fin=timezone.now() - timedelta(minutes=1))
    cache.clear()
    assert avec_jeton(u).get("/api/auth/moi/").status_code == 200  # déjà terminée, même avant la tâche
    assert lever_suspensions_expirees() == 1
    assert not Suspension.objects.get().active
    assert len(mailoutbox) == 1 and "rétabli" in mailoutbox[0].subject


def test_bannissement_definitif():
    admin, u = membre("Admin"), membre("Bob")
    moderation.suspendre(u, "Spam", admin, definitive=True)
    r = avec_jeton(u).get("/api/auth/moi/")
    assert r.status_code == 403 and r.data["code"] == "banni"
