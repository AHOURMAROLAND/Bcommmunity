import re

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from comptes.models import User


@pytest.fixture(autouse=True)
def cache_propre():
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def awa(db):
    return User.objects.create_user("awa@example.com", "Ancien-mot-de-passe-1",
                                    prenom="Awa", nom="Diallo", valide=True, email_verifie=True)


def test_reinitialisation_complete_et_lien_a_usage_unique(client, awa, mailoutbox):
    r = client.post("/api/auth/mot-de-passe-oublie/", {"email": "AWA@example.com"}, format="json")
    assert r.status_code == 200 and len(mailoutbox) == 1
    uid, token = re.search(r"uid=([^&\s]+)&token=(\S+)", mailoutbox[0].body).groups()
    corps = {"uid": uid, "token": token, "password": "Nouveau-mot-de-passe-77"}
    assert client.post("/api/auth/reinitialiser/", corps, format="json").status_code == 204
    r = client.post("/api/auth/connexion/",
                    {"email": "awa@example.com", "password": "Nouveau-mot-de-passe-77"}, format="json")
    assert r.status_code == 200
    assert client.post("/api/auth/reinitialiser/", corps, format="json").status_code == 400


def test_oubli_adresse_inconnue_meme_reponse_sans_mail(client, db, mailoutbox):
    r = client.post("/api/auth/mot-de-passe-oublie/", {"email": "inconnu@example.com"}, format="json")
    assert r.status_code == 200 and len(mailoutbox) == 0


def test_google_inscription_puis_connexion(client, db, monkeypatch):
    monkeypatch.setattr("comptes.google.verifier", lambda c: {
        "sub": "g123", "email": "new@example.com", "given_name": "Yanis", "family_name": "Kone"})
    r = client.post("/api/auth/google/", {"credential": "x"}, format="json")
    assert r.status_code == 404 and r.data["code"] == "inscription_requise"
    creation = client.post("/api/auth/google/", {"credential": "x", "statut": "ancien"},
                           format="json")
    assert creation.status_code == 201 and "access" in creation.data
    user = User.objects.get(email="new@example.com")
    assert user.valide and user.email_verifie
    r = client.post("/api/auth/google/", {"credential": "x"}, format="json")
    assert r.status_code == 200 and "access" in r.data


def test_google_lie_le_compte_et_neutralise_le_mot_de_passe(client, awa, monkeypatch):
    awa.email_verifie = False
    awa.save(update_fields=["email_verifie"])
    monkeypatch.setattr("comptes.google.verifier",
                        lambda c: {"sub": "g9", "email": "awa@example.com"})
    assert client.post("/api/auth/google/", {"credential": "x"}, format="json").status_code == 200
    awa.refresh_from_db()
    assert awa.google_sub == "g9" and not awa.has_usable_password()
