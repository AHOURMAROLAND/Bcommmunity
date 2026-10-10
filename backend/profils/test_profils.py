import io
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from comptes.models import User
from comptes.tableau_de_bord import contexte as contexte_admin
from profils.models import CadeauAnniversaire, PhotoGalerie, Profil
from profils.taches import envoyer_cadeau_anniversaire
from scolarite.models import Classe, Cycle, Scolarite

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def fichiers_temporaires(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def membre(nom):
    user = User.objects.create_user(
        f"{nom.lower()}@example.com", "mot-de-passe-solide-2026",
        prenom=nom, nom="Test", valide=True, email_verifie=True,
    )
    Profil.objects.create(user=user, onboarding_termine=True)
    return user


def client(user):
    resultat = APIClient()
    resultat.force_authenticate(user)
    return resultat


def fichier_image():
    sortie = io.BytesIO()
    Image.new("RGB", (256, 256), "purple").save(sortie, format="PNG")
    return SimpleUploadedFile("photo.png", sortie.getvalue(), content_type="image/png")


def test_anniversaire_est_modifiable_et_reste_prive():
    alice, bob = membre("Alice"), membre("Bob")
    date = timezone.localdate() - timedelta(days=1)
    response = client(alice).patch(
        "/api/profils/me/", {"date_anniversaire": date.isoformat()}, format="json",
    )
    assert response.status_code == 200
    assert response.data["date_anniversaire"] == date.isoformat()
    public = client(bob).get(f"/api/profils/{alice.pk}/")
    assert public.status_code == 200
    assert "date_anniversaire" not in public.data


def test_anniversaire_futur_refuse():
    alice = membre("Alice")
    demain = timezone.localdate() + timedelta(days=1)
    response = client(alice).patch(
        "/api/profils/me/", {"date_anniversaire": demain.isoformat()}, format="json",
    )
    assert response.status_code == 400


def test_bon_anniversaire_envoye_par_email_et_visible_seulement_au_beneficiaire(mailoutbox):
    alice, bob = membre("Alice"), membre("Bob")
    admin = User.objects.create_user(
        "admin@example.com", "mot-de-passe-solide-2026",
        prenom="admin", nom="Bakhita", is_staff=True,
    )
    cadeau = CadeauAnniversaire.objects.create(
        profil=alice.profil,
        administrateur=admin,
        code_bon="BON-TEST-2030",
        message="Joyeux anniversaire !",
    )
    envoyer_cadeau_anniversaire.run(cadeau.pk)
    assert len(mailoutbox) == 1 and mailoutbox[0].to == [alice.email]
    assert "BON-TEST-2030" in mailoutbox[0].body
    assert client(alice).get("/api/profils/me/").data["cadeaux_anniversaire"][0]["code"] == "BON-TEST-2030"
    assert "cadeaux_anniversaire" not in client(bob).get(f"/api/profils/{alice.pk}/").data


def test_tableau_admin_liste_les_anniversaires_des_huit_prochains_jours():
    admin = User.objects.create_superuser(
        "admin@example.com", "mot-de-passe-solide-2026", prenom="admin", nom="Bakhita",
    )
    alice = membre("Alice")
    alice.profil.date_anniversaire = timezone.localdate()
    alice.profil.save(update_fields=["date_anniversaire"])
    request = RequestFactory().get("/admin/")
    request.user = admin
    context = contexte_admin(request, {})
    assert [profil.pk for profil in context["anniversaires_semaine"]] == [alice.profil.pk]


def test_parcours_accepte_des_classes_deselectionnees_et_annee_arrivee_par_cycle():
    alice = membre("Alice")
    primaire = Cycle.objects.create(nom="Primaire", ordre=1)
    college = Cycle.objects.create(nom="Collège", ordre=2)
    ce1 = Classe.objects.create(cycle=primaire, nom="CE1", ordre=1)
    Classe.objects.create(cycle=primaire, nom="CE2", ordre=2)
    Classe.objects.create(cycle=primaire, nom="CM1", ordre=3)
    cm2 = Classe.objects.create(cycle=primaire, nom="CM2", ordre=4)
    sixieme = Classe.objects.create(cycle=college, nom="6e", ordre=1)

    response = client(alice).post(
        "/api/onboarding/valider/",
        {
            "cycles": [
                {
                    "cycle_id": primaire.pk,
                    "premiere_classe_id": ce1.pk,
                    "derniere_classe_id": cm2.pk,
                    "classe_ids": [ce1.pk, cm2.pk],
                    "annee_arrivee": 2012,
                    "durees": {},
                },
                {
                    "cycle_id": college.pk,
                    "premiere_classe_id": sixieme.pk,
                    "derniere_classe_id": sixieme.pk,
                    "classe_ids": [sixieme.pk],
                    "annee_arrivee": 2020,
                    "durees": {},
                },
            ],
            "toujours_a_ecole": False,
        },
        format="json",
    )

    assert response.status_code == 200
    assert list(
        Scolarite.objects.filter(profil=alice.profil)
        .order_by("annee_debut")
        .values_list("classe__nom", "annee_debut", "annee_fin")
    ) == [("CE1", 2012, 2013), ("CM2", 2015, 2016), ("6e", 2020, 2021)]


def test_parcours_refuse_une_selection_de_classes_non_ordonnees():
    alice = membre("Alice")
    primaire = Cycle.objects.create(nom="Primaire")
    ce1 = Classe.objects.create(cycle=primaire, nom="CE1", ordre=1)
    cm2 = Classe.objects.create(cycle=primaire, nom="CM2", ordre=2)
    response = client(alice).post(
        "/api/onboarding/valider/",
        {
            "cycles": [{
                "cycle_id": primaire.pk,
                "premiere_classe_id": ce1.pk,
                "derniere_classe_id": cm2.pk,
                "classe_ids": [cm2.pk, ce1.pk],
                "annee_arrivee": 2012,
                "durees": {},
            }],
            "toujours_a_ecole": False,
        },
        format="json",
    )
    assert response.status_code == 400
    assert not Scolarite.objects.filter(profil=alice.profil).exists()


def test_galerie_ajout_visible_sur_profil_et_suppression_privee():
    alice, bob = membre("Alice"), membre("Bob")
    response = client(alice).post(
        "/api/profils/me/galerie/", {"image": fichier_image()}, format="multipart",
    )
    assert response.status_code == 201
    assert len(client(alice).get("/api/profils/me/").data["galerie"]) == 1
    assert client(bob).get(f"/api/profils/{alice.pk}/").data["galerie"] == [response.data["image"]]
    assert client(bob).delete(f"/api/profils/me/galerie/{response.data['id']}/").status_code == 404
    assert PhotoGalerie.objects.filter(profil=alice.profil).count() == 1


def test_galerie_limitee_a_dix_photos():
    alice = membre("Alice")
    PhotoGalerie.objects.bulk_create([
        PhotoGalerie(profil=alice.profil, image=f"galerie/{index}.webp", ordre=index)
        for index in range(10)
    ])
    response = client(alice).post(
        "/api/profils/me/galerie/", {"image": fichier_image()}, format="multipart",
    )
    assert response.status_code == 400
    assert PhotoGalerie.objects.filter(profil=alice.profil).count() == 10
