from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth.hashers import check_password
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from comptes.models import OTPEmail, Suspension, User
from scolarite.models import Classe, Cycle

DONNEES = {"email": "Awa@Example.com", "prenom": "Awa", "nom": "Diallo",
           "statut": "ancien", "password": "Un-mot-de-passe-solide-42"}
CONNEXION = {"email": "awa@example.com", "password": DONNEES["password"]}


@pytest.fixture(autouse=True)
def cache_propre():
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


def inscrire(client):
    return client.post("/api/auth/inscription/", DONNEES, format="json")


@pytest.mark.django_db
def test_inscription_cree_un_compte_non_valide(client):
    assert inscrire(client).status_code == 201
    user = User.objects.get(email="awa@example.com")
    assert user.valide is False and hasattr(user, "profil")


@pytest.mark.django_db
def test_connexion_ne_demande_pas_otp_pour_un_compte_existant(client):
    inscrire(client)
    r = client.post("/api/auth/connexion/", CONNEXION, format="json")
    assert r.status_code == 200 and "access" in r.data
    assert User.objects.get(email="awa@example.com").email_verifie is False


@pytest.mark.django_db
def test_compte_verifie_peut_entrer_sans_validation_administrative(client):
    user = User.objects.create_user(
        "verified@example.com",
        DONNEES["password"],
        prenom="Awa",
        nom="Diallo",
        email_verifie=True,
        valide=False,
    )
    reponse = client.post(
        "/api/auth/connexion/",
        {"email": user.email, "password": DONNEES["password"]},
        format="json",
    )
    assert reponse.status_code == 200
    assert "access" in reponse.data


@pytest.mark.django_db
def test_connexion_puis_suspension(client):
    inscrire(client)
    User.objects.filter(email="awa@example.com").update(valide=True, email_verifie=True)
    r = client.post("/api/auth/connexion/", CONNEXION, format="json")
    assert r.status_code == 200 and "bk_refresh" in r.cookies
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
    assert client.get("/api/auth/moi/").status_code == 200
    user = User.objects.get(email="awa@example.com")
    Suspension.objects.create(user=user, motif="test", fin=timezone.now() + timedelta(days=1))
    cache.clear()
    r = client.get("/api/auth/moi/")
    assert r.status_code == 403 and r.data["code"] == "suspendu"


@pytest.mark.django_db
def test_routes_protegees_sans_jeton(client):
    assert client.get("/api/profils/me/").status_code == 401


@pytest.mark.django_db
def test_otp_developpement_est_123456_et_peut_etre_verifie(client):
    user = User.objects.create_user("otp@example.com", "Un-mot-de-passe-solide-42",
                                    prenom="Awa", nom="Diallo", valide=False)
    with patch("comptes.views.brevo.envoyer_otp"):
        envoi = client.post("/api/auth/otp/envoyer/", {"email": user.email}, format="json")
    otp = OTPEmail.objects.get(user=user, utilise=False)
    assert envoi.status_code == 200
    assert check_password("123456", otp.code)

    verification = client.post(
        "/api/auth/otp/verifier/",
        {"email": user.email, "code": "123456"},
        format="json",
    )
    assert verification.status_code == 200
    user.refresh_from_db()
    otp.refresh_from_db()
    assert user.email_verifie and user.valide and otp.utilise


@pytest.mark.django_db
def test_otp_ne_permet_pas_de_se_connecter_a_un_compte_deja_verifie(client):
    user = User.objects.create_user(
        "already-verified@example.com",
        "Un-mot-de-passe-solide-42",
        prenom="Awa",
        nom="Diallo",
        email_verifie=True,
        valide=True,
    )
    envoi = client.post("/api/auth/otp/envoyer/", {"email": user.email}, format="json")
    verification = client.post(
        "/api/auth/otp/verifier/",
        {"email": user.email, "code": "123456"},
        format="json",
    )
    assert envoi.status_code == 200
    assert verification.status_code == 400
    assert not OTPEmail.objects.filter(user=user).exists()


@pytest.mark.django_db
@override_settings(DEBUG=False, DEV_OTP_CODE=None)
def test_otp_en_production_reste_aleatoire(client):
    user = User.objects.create_user("prod-otp@example.com", "Un-mot-de-passe-solide-42",
                                    prenom="Awa", nom="Diallo", valide=False)
    with patch("comptes.views.secrets.randbelow", return_value=12345), \
         patch("comptes.views.brevo.envoyer_otp"):
        reponse = client.post("/api/auth/otp/envoyer/", {"email": user.email}, format="json")

    otp = OTPEmail.objects.get(user=user, utilise=False)
    assert reponse.status_code == 200
    assert check_password("012345", otp.code)
    assert not check_password("123456", otp.code)


@pytest.mark.django_db
def test_on_ne_voit_pas_le_parcours_d_autrui(client):
    classe = Classe.objects.create(cycle=Cycle.objects.create(nom="Collège"), nom="6e")
    autre = User.objects.create_user("b@example.com", "x" * 12, prenom="B", nom="B", valide=True)
    from profils.models import Profil
    from scolarite.models import Scolarite
    ligne = Scolarite.objects.create(profil=Profil.objects.create(user=autre), classe=classe,
                                     annee_debut=2010, annee_fin=2011)
    moi = User.objects.create_user("c@example.com", "x" * 12, prenom="C", nom="C", valide=True)
    client.force_authenticate(moi)
    assert client.get(f"/api/scolarites/{ligne.pk}/").status_code == 404
    assert client.delete(f"/api/scolarites/{ligne.pk}/").status_code == 404
