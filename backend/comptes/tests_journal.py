from datetime import timedelta
from urllib.parse import parse_qs, urlsplit

import pytest
from django.contrib import admin
from django.contrib.staticfiles import finders
from django.core.cache import cache
from django.db import connection
from django.test import RequestFactory, override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from comptes import moderation
from comptes.admin import UserAdmin
from comptes.journal import _ip
from comptes.models import Activite, Suspension, User
from comptes.tableau_de_bord import contexte
from publications.models import Publication
from signalements.models import Signalement

pytestmark = pytest.mark.django_db
MDP = "Un-mot-de-passe-solide-42"


@pytest.fixture(autouse=True)
def cache_propre():
    cache.clear()


def test_connexion_est_journalisee():
    User.objects.create_user(
        "awa@example.com", MDP, prenom="Awa", nom="D", valide=True, email_verifie=True
    )
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
        assert b"/static/comptes/admin/favicon.svg" in r.content
        assert b"/static/comptes/admin/navigation.css" in r.content
        assert b"/static/comptes/admin/navigation.js" in r.content
        assert b'id="bk-admin-loading"' in r.content

    assert finders.find("comptes/admin/favicon.svg")
    assert finders.find("comptes/admin/navigation.css")
    assert finders.find("comptes/admin/navigation.js")


def test_etat_admin_signale_un_compte_desactive():
    user = User.objects.create_user("inactive@example.com", MDP, is_active=False)
    assert UserAdmin(User, admin.site).etat(user) == "Désactivé"


def test_lien_journal_encode_le_terme_de_recherche():
    user = User.objects.create_user("awa+bk@example.com", MDP)
    lien = UserAdmin(User, admin.site).journal(user)
    href = str(lien).split('href="', 1)[1].split('"', 1)[0]
    assert parse_qs(urlsplit(href).query) == {"q": [user.email]}


def test_levee_des_suspensions_selectionnees_est_journalisee():
    user = User.objects.create_user("suspendu@example.com", MDP)
    fin = timezone.now() + timedelta(days=1)
    choisie = Suspension.objects.create(user=user, motif="Test", fin=fin)
    autre = Suspension.objects.create(user=user, motif="Autre", fin=fin)

    assert moderation.lever_suspensions(Suspension.objects.filter(pk=choisie.pk)) == 1

    assert not Suspension.objects.get(pk=choisie.pk).active
    assert Suspension.objects.get(pk=autre.pk).active
    assert Activite.objects.filter(
        user=user, action="suspension", detail="Suspension levée"
    ).count() == 1


def test_ip_utilise_remote_addr_sauf_si_le_proxy_est_fiable():
    request = RequestFactory().get(
        "/", REMOTE_ADDR="203.0.113.10", HTTP_X_FORWARDED_FOR="198.51.100.99"
    )
    with override_settings(TRUSTED_PROXY_IPS=[]):
        assert _ip(request) == "203.0.113.10"

    request = RequestFactory().get(
        "/",
        REMOTE_ADDR="10.0.0.3",
        HTTP_X_FORWARDED_FOR="198.51.100.99, 192.0.2.12, 10.0.0.2",
    )
    with override_settings(TRUSTED_PROXY_IPS=["10.0.0.0/8"]):
        assert _ip(request) == "192.0.2.12"


def test_tableau_de_bord_ne_charge_pas_les_donnees_sans_permissions(client, settings):
    settings.STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
    staff = User.objects.create_user("staff@example.com", MDP, is_staff=True)
    request = RequestFactory().get("/admin/")
    request.user = staff
    context = {}

    with CaptureQueriesContext(connection) as queries:
        contexte(request, context)

    assert context["stats"] == {}
    assert not any(name in context for name in (
        "activite", "en_attente", "derniers_signalements", "dernieres_actions"
    ))
    sql = " ".join(query["sql"].lower() for query in queries)
    assert "comptes_activite" not in sql
    assert "signalements_signalement" not in sql

    Activite.objects.create(user=staff, action="mot_de_passe", detail="PRIVE-NE-PAS-AFFICHER")
    client.force_login(staff)
    response = client.get(reverse("admin:index"))
    assert response.status_code == 200
    assert b"PRIVE-NE-PAS-AFFICHER" not in response.content
    assert b"Journal d'activit" not in response.content


def test_liens_du_tableau_de_bord_utilisent_les_filtres_associes(client, settings):
    settings.STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
    client.force_login(User.objects.create_superuser("root@example.com", MDP))

    response = client.get(reverse("admin:index"))
    html = response.content.decode()

    assert "?email_verifie__exact=0&amp;is_active__exact=1" in html
    assert "?valide__exact=1&amp;is_active__exact=1" in html
    assert "?traitement=ouvert" in html
    assert "?etat=en_cours" in html


def test_compteurs_signalements_et_suspensions_correspondent_aux_listes(client, settings):
    settings.STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
    auteur = User.objects.create_user("auteur@example.com", MDP)
    for index, statut in enumerate(("nouveau", "en_cours", "traite")):
        cible = User.objects.create_user(f"cible{index}@example.com", MDP)
        Signalement.objects.create(
            auteur=auteur, type_cible="utilisateur", utilisateur_cible=cible,
            motif="autre", statut=statut,
        )

    maintenant = timezone.now()
    for index, fin in enumerate((
        maintenant + timedelta(days=1),
        maintenant - timedelta(days=1),
    )):
        membre = User.objects.create_user(f"suspendu{index}@example.com", MDP)
        Suspension.objects.create(user=membre, motif="Test", fin=fin)

    client.force_login(User.objects.create_superuser("root@example.com", MDP))
    tableau = client.get(reverse("admin:index"))

    assert tableau.context["stats"]["signalements"] == 2
    assert tableau.context["stats"]["suspendus"] == 1

    signalements = client.get(
        reverse("admin:signalements_signalement_changelist"), {"traitement": "ouvert"}
    )
    assert {s.statut for s in signalements.context["cl"].result_list} == {"nouveau", "en_cours"}

    suspensions = client.get(
        reverse("admin:comptes_suspension_changelist"), {"etat": "en_cours"}
    )
    assert [s.user.email for s in suspensions.context["cl"].result_list] == ["suspendu0@example.com"]
