import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from amis.tests import api, membre

from .models import ConfigurationSupport, MessageSupport, PieceJointeSignalement, Signalement
from .taches import notifier_reponse_support

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def media_temporaire(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def image_test():
    sortie = io.BytesIO()
    Image.new("RGB", (256, 256), "blue").save(sortie, format="PNG")
    return sortie.getvalue()


def test_retour_de_test_enregistre_contexte_et_image():
    user = membre("Alice")
    fichier = SimpleUploadedFile("capture.png", image_test(), content_type="image/png")
    response = api(user).post(
        "/api/signalements/",
        {
            "type": "retour",
            "motif": "bug",
            "commentaire": "Le bouton ne répond pas",
            "chemin": "/parametres",
            "fichiers": [fichier],
        },
        format="multipart",
    )
    assert response.status_code == 201
    signalement = Signalement.objects.get(auteur=user)
    assert signalement.contexte["chemin"] == "/parametres"
    assert signalement.adresse_ip == "127.0.0.1"
    piece = PieceJointeSignalement.objects.get(signalement=signalement)
    assert piece.type_contenu == "image/webp" and piece.fichier.name.endswith(".webp")


def test_configuration_support_limite_le_bouton_aux_membres_autorises():
    alice, bob = membre("Alice"), membre("Bob")
    configuration = ConfigurationSupport.objects.create(ouvert_a_tous=False)
    configuration.utilisateurs_autorises.add(bob)
    assert api(alice).get("/api/signalements/configuration/").data == {"visible": False}
    assert api(bob).get("/api/signalements/configuration/").data == {"visible": True}
    reponse = api(alice).post(
        "/api/signalements/",
        {"type": "retour", "motif": "suggestion", "commentaire": "Une idée"},
        format="multipart",
    )
    assert reponse.status_code == 403
    assert not Signalement.objects.exists()


def test_discussion_support_reservee_auteur_du_signalement():
    alice, bob = membre("Alice"), membre("Bob")
    signalement = Signalement.objects.create(
        auteur=alice, type_cible="retour", motif="bug", commentaire="Erreur",
    )
    assert api(alice).post(
        f"/api/signalements/mes/{signalement.pk}/messages/",
        {"texte": "J’ajoute un détail"},
        format="json",
    ).status_code == 201
    assert MessageSupport.objects.filter(signalement=signalement, expediteur=alice).count() == 1
    assert api(bob).get("/api/signalements/mes/").data == []
    assert api(bob).post(
        f"/api/signalements/mes/{signalement.pk}/messages/",
        {"texte": "Message non autorisé"},
        format="json",
    ).status_code == 404


def test_reponse_admin_affiche_admin_et_est_envoyee_par_email(mailoutbox):
    user, admin = membre("Alice"), membre("Admin")
    admin.is_staff = True
    admin.save(update_fields=["is_staff"])
    signalement = Signalement.objects.create(
        auteur=user, type_cible="retour", motif="bug", commentaire="Erreur",
    )
    message = MessageSupport.objects.create(
        signalement=signalement, expediteur=admin, texte="Nous corrigeons le problème.",
    )
    notifier_reponse_support.run(message.pk)
    conversation = api(user).get("/api/signalements/mes/").data[0]["messages"]
    assert conversation[0]["expediteur"] == "admin"
    assert mailoutbox[0].to == [user.email]
    assert "Nous corrigeons le problème." in mailoutbox[0].body


@override_settings(ADMIN_EMAILS=["admin1@example.com", "admin2@example.com"])
def test_alerte_envoyee_aux_deux_admins_au_seuil_de_dix(mailoutbox):
    for index in range(9):
        auteur = membre(f"Membre{index}")
        Signalement.objects.create(auteur=auteur, type_cible="retour", motif="bug")
    auteur = membre("Dixieme")
    response = api(auteur).post(
        "/api/signalements/",
        {"type": "retour", "motif": "bug", "commentaire": "Dixième retour"},
        format="multipart",
    )
    assert response.status_code == 201
    assert Signalement.objects.get(auteur=auteur).alerte_seuil == 10
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["admin1@example.com", "admin2@example.com"]
