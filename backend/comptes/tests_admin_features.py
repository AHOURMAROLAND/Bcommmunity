import asyncio
import csv
from io import StringIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from django.contrib import admin
from django.contrib.auth.models import Permission
from django.core import mail
from django.test import RequestFactory, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from comptes.admin import UserAdmin
from comptes.models import Activite, BadgeUtilisateur, NoteInterne, User
from comptes.tableau_de_bord import contexte
from comptes.taches import envoyer_rapport_hebdomadaire
from discussions.consumers import HubConsumer
from discussions.models import ConfigurationDiscussion, InvitationDiscussion
from profils.models import Profil
from publications.models import Publication
from signalements.admin import SignalementAdmin
from signalements.models import Signalement

pytestmark = pytest.mark.django_db
MDP = "Un-mot-de-passe-solide-42"


@pytest.fixture(autouse=True)
def utiliser_stockage_statique_sans_manifest(settings):
    settings.STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }


def _superadmin():
    return User.objects.create_superuser(
        "admin@example.com", MDP, prenom="Admin", nom="Bakhita"
    )


def test_recherche_globale_retrouve_comptes_publications_et_signalements(client):
    admin = _superadmin()
    auteur = User.objects.create_user(
        "awa@example.com", MDP, prenom="Awa", nom="Diallo"
    )
    publication = Publication.objects.create(
        auteur=auteur, titre="Campagne rentrée", statut="publie"
    )
    signalement = Signalement.objects.create(
        auteur=admin,
        type_cible="retour",
        motif="bug",
        commentaire="Campagne : le bouton ne répond pas",
    )
    client.force_login(admin)

    response = client.get(reverse("admin-global-search"), {"q": "Campagne"})

    assert response.status_code == 200
    assert reverse("admin:publications_publication_change", args=[publication.pk]) in response.content.decode()
    assert reverse("admin:signalements_signalement_change", args=[signalement.pk]) in response.content.decode()

    response = client.get(reverse("admin-global-search"), {"q": "awa@example.com"})
    assert reverse("admin:comptes_user_change", args=[auteur.pk]) in response.content.decode()


@pytest.mark.parametrize("permission", ["view_user", "change_user"])
def test_recherche_globale_ne_montre_que_les_modeles_autorises(client, permission):
    staff = User.objects.create_user(
        "staff@example.com", MDP, prenom="Equipe", nom="Admin", is_staff=True
    )
    staff.user_permissions.add(Permission.objects.get(codename=permission))
    cible = User.objects.create_user("secret@example.com", MDP, prenom="Secret", nom="Profil")
    client.force_login(staff)

    response = client.get(reverse("admin-global-search"), {"q": "secret@example.com"})

    assert response.status_code == 200
    assert reverse("admin:comptes_user_change", args=[cible.pk]) in response.content.decode()
    assert "Publication" not in response.content.decode()


def test_export_csv_comptes_et_signalements():
    admin_user = _superadmin()
    membre = User.objects.create_user(
        "awa@example.com", MDP, prenom="Awa", nom="Diallo", email_verifie=True
    )
    signalement = Signalement.objects.create(
        auteur=admin_user,
        type_cible="retour",
        motif="suggestion",
        commentaire="Ajouter un filtre",
    )
    request = RequestFactory().post("/")

    response_comptes = UserAdmin(User, admin.site).exporter_csv(
        request, User.objects.filter(pk=membre.pk)
    )
    comptes = list(csv.reader(StringIO(response_comptes.content.decode("utf-8-sig"))))
    assert comptes[1][1:4] == ["awa@example.com", "Awa", "Diallo"]
    assert response_comptes["Content-Disposition"].endswith('"comptes-bakhita.csv"')

    response_signalements = SignalementAdmin(Signalement, admin.site).exporter_csv(
        request, Signalement.objects.filter(pk=signalement.pk)
    )
    signalements = list(csv.reader(StringIO(response_signalements.content.decode("utf-8-sig"))))
    assert signalements[1][0] == str(signalement.pk)
    assert signalements[1][4] == "Ajouter un filtre"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_rapport_hebdomadaire_envoie_les_indicateurs_aux_admins():
    administrateur = _superadmin()
    membre = User.objects.create_user(
        "membre@example.com", MDP, prenom="Awa", nom="Diallo"
    )
    maintenant = timezone.now()
    Activite.objects.create(user=membre, action="connexion", cree_le=maintenant)
    Activite.objects.create(user=membre, action="publication", cree_le=maintenant)
    Publication.objects.create(
        auteur=membre, titre="Actualité", statut="publie", publie_le=maintenant
    )
    signalement = Signalement.objects.create(
        auteur=membre,
        type_cible="retour",
        motif="bug",
        commentaire="Erreur",
        statut="traite",
        traite_le=maintenant,
        traite_par=administrateur,
    )
    User.objects.filter(pk=membre.pk).update(date_inscription=maintenant)

    resultat = envoyer_rapport_hebdomadaire()

    assert resultat == {
        "envoye": True,
        "inscriptions": 1,
        "utilisateurs_actifs": 1,
        "publications": 1,
        "messages": 0,
        "signalements_recus": 1,
        "signalements_traites": 1,
        "signalements_ouverts": 0,
    }
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [administrateur.email]
    assert "Nouvelles inscriptions : 1" in mail.outbox[0].body
    assert signalement.pk


def test_dashboard_expose_usage_hebdomadaire():
    _superadmin()
    membre = User.objects.create_user(
        "membre@example.com", MDP, prenom="Awa", nom="Diallo"
    )
    maintenant = timezone.now()
    Activite.objects.create(user=membre, action="connexion", cree_le=maintenant)
    Activite.objects.create(user=membre, action="publication", cree_le=maintenant)
    requete = RequestFactory().get("/admin/")
    requete.user = User.objects.get(email="admin@example.com")

    context = contexte(requete, {})
    aujourd_hui = timezone.localdate(maintenant).strftime("%d/%m")
    ligne = next(jour for jour in context["usage_7j"] if jour["label"] == aujourd_hui)

    assert len(context["usage_7j"]) == 7
    assert ligne["inscriptions"] == 1
    assert ligne["actifs"] == 1
    assert context["stats"]["actifs_7j"] == 1


def test_rapport_hebdomadaire_est_planifie_le_lundi_a_8h(settings):
    schedule = settings.CELERY_BEAT_SCHEDULE["rapport-hebdomadaire"]["schedule"]

    assert schedule.day_of_week == {1}
    assert schedule.hour == {8}
    assert schedule.minute == {0}


def test_mode_lecture_seule_bloque_les_ecritures_api_mais_pas_les_lectures(client):
    membre = User.objects.create_user(
        "lecture@example.com", MDP, prenom="Awa", nom="Diallo", lecture_seule=True
    )
    api = APIClient()
    api.force_authenticate(membre)

    lecture = api.get("/api/auth/moi/")
    ecriture = api.post("/api/discussions/configuration-securite/", {}, format="json")

    assert lecture.status_code == 200
    assert lecture.data["lecture_seule"] is True
    assert ecriture.status_code == 403
    assert "lecture seule" in str(ecriture.data["detail"]).lower()


def test_mode_lecture_seule_est_contourne_pour_les_administrateurs(client):
    administrateur = User.objects.create_user(
        "staff@example.com", MDP, prenom="Equipe", nom="Admin",
        is_staff=True, lecture_seule=True,
    )
    api = APIClient()
    api.force_authenticate(administrateur)

    response = api.post("/api/discussions/configuration-securite/", {}, format="json")

    assert response.status_code == 405


def test_websocket_refuse_les_messages_d_un_compte_en_lecture_seule():
    consumer = HubConsumer()
    consumer.user = SimpleNamespace(pk=5, lecture_seule=True)
    consumer.send_json = AsyncMock()

    asyncio.run(consumer.receive_json({
        "type": "message.send", "cid": "client-1", "conversation": 10,
    }))

    consumer.send_json.assert_awaited_once()
    assert "lecture seule" in consumer.send_json.await_args.args[0]["detail"].lower()


def test_alertes_dashboard_signalent_les_invitations_adultes_vers_mineurs():
    administrateur = _superadmin()
    date_majorite = timezone.localdate().replace(year=timezone.localdate().year - 18)
    adulte = User.objects.create_user(
        "ancien@example.com", MDP, prenom="Ancien", nom="Adulte", statut="ancien"
    )
    profil_adulte, _ = Profil.objects.get_or_create(user=adulte)
    profil_adulte.date_anniversaire = date_majorite.replace(year=1990)
    profil_adulte.save(update_fields=["date_anniversaire"])
    eleves = [
        User.objects.create_user(
            f"eleve-{i}@example.com", MDP, prenom=f"Élève{i}", nom="Test", statut="eleve"
        )
        for i in range(5)
    ]
    for i, eleve in enumerate(eleves):
        profil_eleve, _ = Profil.objects.get_or_create(user=eleve)
        profil_eleve.date_anniversaire = date_majorite.replace(year=2012)
        profil_eleve.save(update_fields=["date_anniversaire"])
        InvitationDiscussion.objects.create(
            demandeur=adulte,
            destinataire=eleve,
            statut="attente",
        )
    requete = RequestFactory().get("/admin/")
    requete.user = administrateur

    context = contexte(requete, {})

    assert context["stats"]["alertes_adultes_mineurs"] == 1
    assert context["alertes_adultes_mineurs"][0]["nom"] == "Ancien Adulte"
    assert context["alertes_adultes_mineurs"][0]["total"] == 5


def test_badges_sont_attribues_manuellement_et_visibles_sur_le_profil(client):
    membre = User.objects.create_user(
        "ancien@example.com", MDP, prenom="Awa", nom="Diallo", statut="ancien", valide=True
    )
    admin_user = _superadmin()
    profil, _ = Profil.objects.get_or_create(user=membre)
    profil.onboarding_termine = True
    profil.save(update_fields=["onboarding_termine"])
    BadgeUtilisateur.objects.create(
        user=membre,
        type=BadgeUtilisateur.Type.ANCIEN_VERIFIE,
        attribue_par=admin_user,
    )
    lecteur = User.objects.create_user("lecteur@example.com", MDP, valide=True)
    api = APIClient()
    api.force_authenticate(lecteur)

    response = api.get(f"/api/profils/{membre.pk}/")

    assert response.status_code == 200
    assert response.data["badges"] == [
        {"type": "ancien_verifie", "libelle": "Ancien vérifié"}
    ]


def test_notes_internes_sont_accessibles_dans_l_admin_seulement(client):
    admin_user = _superadmin()
    membre = User.objects.create_user("membre@example.com", MDP)
    NoteInterne.objects.create(user=membre, auteur=admin_user, texte="Suivi confidentiel")
    client.force_login(admin_user)

    response = client.get(reverse("admin:comptes_user_change", args=[membre.pk]))

    assert response.status_code == 200
    assert b"Suivi confidentiel" in response.content


def test_reglage_de_captures_discussion_est_modifiable_dans_admin(client):
    admin_user = _superadmin()
    configuration = ConfigurationDiscussion.objects.get(pk=1)
    assert configuration.bloquer_captures_ecran is False
    configuration.bloquer_captures_ecran = True
    configuration.save()
    api = APIClient()
    api.force_authenticate(admin_user)

    response = api.get("/api/discussions/configuration-securite/")

    assert response.status_code == 200
    assert response.data == {"bloquer_captures_ecran": True}

    client.force_login(admin_user)
    page_admin = client.get(reverse("admin:discussions_configurationdiscussion_change", args=[1]))
    assert page_admin.status_code == 200


@override_settings(SITE_URL="https://community.example.test")
def test_aperçu_profils_publics_inclut_photo_et_balises_sociales(client):
    membre = User.objects.create_user(
        "awa@example.com", MDP, prenom="Awa", nom="Diallo", statut="ancien",
        valide=True,
    )
    profil, _ = Profil.objects.get_or_create(user=membre)
    profil.onboarding_termine = True
    profil.visibilite_profil = "tous"
    profil.photo.name = "profils/awa.jpg"
    profil.save()

    response = client.get(f"/profil-partage/{membre.pk}/")

    assert response.status_code == 200
    assert b'property="og:type" content="profile"' in response.content
    assert b'property="og:title" content="Awa Diallo"' in response.content
    assert b'property="og:image" content="https://community.example.test/media/profils/awa.jpg"' in response.content
    assert b'<meta name="twitter:image"' in response.content


@override_settings(SITE_URL="https://community.example.test")
def test_aperçu_publication_utilise_image_publication_ou_avatar_auteur(client):
    auteur = User.objects.create_user(
        "auteur@example.com", MDP, prenom="Awa", nom="Diallo", valide=True
    )
    profil, _ = Profil.objects.get_or_create(user=auteur)
    profil.photo.name = "profils/auteur.jpg"
    profil.save()
    publication = Publication.objects.create(
        auteur=auteur, titre="Une nouvelle", statut="publie", extrait="Résumé"
    )

    response = client.get(f"/p/{publication.pk}/")

    assert response.status_code == 200
    assert b'property="og:type" content="article"' in response.content
    assert b'property="og:image" content="https://community.example.test/media/profils/auteur.jpg"' in response.content
    assert b'<meta name="twitter:image"' in response.content
