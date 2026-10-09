from datetime import timedelta

import pytest
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from amis.tests import api, membre
from comptes.models import SessionCompte, User
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


def test_deconnexion_revoque_la_session_et_ses_access_tokens(awa):
    client = APIClient()
    connexion = client.post(
        "/api/auth/connexion/", CONNEXION, format="json", HTTP_X_CLIENT="natif"
    )
    session = SessionCompte.objects.get(user=awa, active=True)

    reponse = client.post(
        "/api/auth/deconnexion/",
        {"refresh": connexion.data["refresh"]},
        format="json",
        HTTP_X_CLIENT="natif",
    )

    assert reponse.status_code == 204
    session.refresh_from_db()
    assert not session.active
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {connexion.data['access']}")
    assert client.get("/api/auth/moi/").status_code == 401


def test_ancien_refresh_sans_identifiant_est_migre_une_seule_fois(awa):
    ancien_refresh = RefreshToken.for_user(awa)
    client = APIClient()

    migration = client.post(
        "/api/auth/rafraichir/",
        {"refresh": str(ancien_refresh)},
        format="json",
        HTTP_X_CLIENT="natif",
    )
    rejeu = client.post(
        "/api/auth/rafraichir/",
        {"refresh": str(ancien_refresh)},
        format="json",
        HTTP_X_CLIENT="natif",
    )

    assert migration.status_code == 200 and "refresh" in migration.data
    assert rejeu.status_code == 401
    assert SessionCompte.objects.filter(user=awa, active=True).count() == 1


def test_limite_de_quatre_sessions_et_revoquer_un_appareil(awa):
    connexions = []
    for _ in range(5):
        client = APIClient()
        response = client.post(
            "/api/auth/connexion/", CONNEXION, format="json", HTTP_X_CLIENT="natif"
        )
        connexions.append((client, response.data["access"]))

    assert SessionCompte.objects.filter(user=awa, active=True).count() == 4
    client_actuel, jeton_actuel = connexions[-1]
    client_actuel.credentials(HTTP_AUTHORIZATION=f"Bearer {jeton_actuel}")
    liste = client_actuel.get("/api/auth/sessions/")
    assert liste.status_code == 200 and len(liste.data) == 4
    assert sum(session["actuelle"] for session in liste.data) == 1

    ancien_client, ancien_jeton = connexions[0]
    ancien_client.credentials(HTTP_AUTHORIZATION=f"Bearer {ancien_jeton}")
    assert ancien_client.get("/api/auth/moi/").status_code == 401

    session_a_fermer = next(session for session in liste.data if not session["actuelle"])
    assert client_actuel.delete(
        f"/api/auth/sessions/{session_a_fermer['id']}/"
    ).status_code == 204
    assert SessionCompte.objects.filter(user=awa, active=True).count() == 3
    jeton_revoque = next(
        jeton for _, jeton in connexions
        if str(AccessToken(jeton)["sid"]) == session_a_fermer["id"]
    )
    client_actuel.credentials(HTTP_AUTHORIZATION=f"Bearer {jeton_revoque}")
    assert client_actuel.get("/api/auth/moi/").status_code == 401


def test_session_expiree_apres_sept_jours_sans_activite(awa):
    client = APIClient()
    connexion = client.post(
        "/api/auth/connexion/", CONNEXION, format="json", HTTP_X_CLIENT="natif"
    )
    session = SessionCompte.objects.get(user=awa, active=True)
    SessionCompte.objects.filter(pk=session.pk).update(
        derniere_activite=timezone.now() - timedelta(days=7, seconds=1)
    )
    assert str(AccessToken(connexion.data["access"])["sid"]) == str(session.pk)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {connexion.data['access']}")

    response = client.get("/api/auth/moi/")
    assert response.status_code == 401, response.data
    refresh = client.post(
        "/api/auth/rafraichir/",
        {"refresh": connexion.data["refresh"]},
        format="json",
        HTTP_X_CLIENT="natif",
    )
    assert refresh.status_code == 401
    client_sans_ancienne_session = APIClient()
    nouvelle_connexion = client_sans_ancienne_session.post(
        "/api/auth/connexion/", CONNEXION, format="json", HTTP_X_CLIENT="natif"
    )
    assert nouvelle_connexion.status_code == 200
    assert SessionCompte.objects.filter(user=awa, active=True).count() == 1


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
