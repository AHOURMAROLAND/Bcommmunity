import pytest
from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APIClient

from comptes.models import Activite, User
from publications.models import Publication

pytestmark = pytest.mark.django_db
MDP = "Un-mot-de-passe-solide-42"


@pytest.fixture(autouse=True)
def cache_propre():
    cache.clear()


def test_connexion_est_journalisee():
    User.objects.create_user("awa@example.com", MDP, prenom="Awa", nom="D", valide=True)
    r = APIClient().post("/api/auth/connexion/", {"email": "awa@example.com", "password": MDP},
                         format="json", HTTP_USER_AGENT="test-agent")
    assert r.status_code == 200
    a = Activite.objects.get(action="connexion")
    assert a.user.email == "awa@example.com" and a.appareil == "test-agent"


def test_inscription_et_publication_sont_journalisees():
    u = User.objects.create_user("b@example.com", MDP, prenom="B", nom="B", valide=True)
    Publication.objects.create(auteur=u, titre="Bonjour", contenu="x", extrait="x", statut="publie")
    assert Activite.objects.filter(user=u, action="inscription").exists()
    assert Activite.objects.filter(user=u, action="publication", detail__contains="Bonjour").exists()


def test_pages_admin_se_chargent(client, settings):
    # Stockage statique simple : pas besoin de collectstatic pour afficher les pages
    settings.STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
    admin = User.objects.create_superuser("root@example.com", MDP, prenom="R", nom="R")
    client.force_login(admin)
    for nom in ["index", "comptes_user_changelist", "comptes_suspension_changelist",
                "comptes_activite_changelist", "signalements_signalement_changelist",
                "publications_publication_changelist", "publications_commentaire_changelist",
                "profils_profil_changelist", "scolarite_scolarite_changelist"]:
        r = client.get(reverse(f"admin:{nom}"), follow=True)
        assert r.status_code == 200, nom
