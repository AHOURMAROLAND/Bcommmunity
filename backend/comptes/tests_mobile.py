import pytest
from django.conf import settings
from django.core.cache import cache
from rest_framework.test import APIClient

from amis.tests import api, membre
from comptes.models import User
from profils.models import Profil
from publications.models import Publication

pytestmark = pytest.mark.django_db
CONNEXION = {"email": "awa@example.com", "password": "Ancien-mot-de-passe-1"}


@pytest.fixture(autouse=True)
def isole():
    cache.clear()


@pytest.fixture
def awa(db):
    return User.objects.create_user("awa@example.com", CONNEXION["password"], prenom="Awa", nom="D",
                                    valide=True, email_verifie=True)


def test_mode_natif_jeton_dans_le_corps_et_web_garde_le_cookie(awa):
    c = APIClient()
    r = c.post("/api/auth/connexion/", CONNEXION, format="json", HTTP_X_CLIENT="natif")
    assert "refresh" in r.data and "bk_refresh" not in r.cookies
    r2 = c.post("/api/auth/rafraichir/", {"refresh": r.data["refresh"]}, format="json", HTTP_X_CLIENT="natif")
    assert r2.status_code == 200 and "access" in r2.data
    if "sqlite" in settings.DATABASES["default"]["ENGINE"]:
        assert "refresh" not in r2.data
        r3 = c.post("/api/auth/rafraichir/", {"refresh": r.data["refresh"]}, format="json", HTTP_X_CLIENT="natif")
        assert r3.status_code == 200 and "access" in r3.data
    else:
        assert "refresh" in r2.data
    web = APIClient().post("/api/auth/connexion/", CONNEXION, format="json")
    assert "bk_refresh" in web.cookies and "refresh" not in web.data


def test_refresh_dans_le_corps_ignore_en_mode_web(awa):
    r = APIClient().post("/api/auth/connexion/", CONNEXION, format="json", HTTP_X_CLIENT="natif")
    web = APIClient().post("/api/auth/rafraichir/", {"refresh": r.data["refresh"]}, format="json")
    assert web.status_code == 401  # le web n'accepte que le cookie


def test_google_refuse_un_jeton_destine_a_une_autre_application(settings, monkeypatch):
    settings.GOOGLE_CLIENT_IDS = ["notre-id"]
    monkeypatch.setattr("comptes.google.id_token.verify_oauth2_token",
                        lambda c, r: {"aud": "autre-app", "sub": "1", "email": "x@example.com", "email_verified": True})
    assert APIClient().post("/api/auth/google/", {"credential": "x"}, format="json").status_code == 401
    monkeypatch.setattr("comptes.google.id_token.verify_oauth2_token",
                        lambda c, r: {"aud": "notre-id", "sub": "1", "email": "x@example.com", "email_verified": True})
    assert APIClient().post("/api/auth/google/", {"credential": "x"}, format="json").status_code == 404  # inscription requise


def test_suppression_de_compte_exige_le_mot_de_passe_et_efface_tout(awa):
    Profil.objects.create(user=awa)
    Publication.objects.create(auteur=awa, titre="T", contenu="<p>x</p>", extrait="x", statut="publie")
    assert api(awa).delete("/api/auth/compte/", {"password": "faux"}, format="json").status_code == 400
    assert User.objects.filter(pk=awa.pk).exists()
    assert api(awa).delete("/api/auth/compte/", {"password": CONNEXION["password"]}, format="json").status_code == 204
    assert not User.objects.filter(pk=awa.pk).exists() and not Publication.objects.exists()


def test_un_administrateur_ne_se_supprime_pas_ici():
    admin = membre("Admin")
    admin.is_staff = True
    admin.save()
    assert api(admin).delete("/api/auth/compte/", {"password": "x" * 12}, format="json").status_code == 403
