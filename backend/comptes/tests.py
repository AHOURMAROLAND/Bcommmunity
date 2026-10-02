from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from comptes.models import Suspension, User
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
def test_connexion_refusee_tant_que_non_valide(client):
    inscrire(client)
    r = client.post("/api/auth/connexion/", CONNEXION, format="json")
    assert r.status_code == 403 and r.data["code"] == "non_valide"


@pytest.mark.django_db
def test_connexion_puis_suspension(client):
    inscrire(client)
    User.objects.filter(email="awa@example.com").update(valide=True)
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
