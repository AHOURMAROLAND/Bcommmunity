import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from amis.models import Blocage
from comptes.models import User
from profils.models import Profil
from publications.models import Commentaire, Publication


def creer_image_test(format="JPEG", taille=(100, 100), couleur=(255, 0, 0)):
    buf = io.BytesIO()
    img = Image.new("RGB", taille, couleur)
    img.save(buf, format=format)
    buf.seek(0)
    return SimpleUploadedFile("test_img.jpg", buf.getvalue(), content_type=f"image/{format.lower()}")


@pytest.fixture
def user_a(db):
    u = User.objects.create_user(email="alice@test.local", password="Password123!", prenom="Alice", nom="A")
    u.valide = True
    u.save()
    Profil.objects.create(user=u, onboarding_termine=True)
    return u


@pytest.fixture
def user_b(db):
    u = User.objects.create_user(email="bob@test.local", password="Password123!", prenom="Bob", nom="B")
    u.valide = True
    u.save()
    Profil.objects.create(user=u, onboarding_termine=True)
    return u


@pytest.fixture
def client_a(user_a):
    c = APIClient()
    c.force_authenticate(user=user_a)
    return c


@pytest.fixture
def client_b(user_b):
    c = APIClient()
    c.force_authenticate(user=user_b)
    return c


@pytest.mark.django_db
def test_creation_publication(client_a, user_a):
    res = client_a.post("/api/publications/", {
        "titre": "Bienvenue a tous",
        "contenu": "Voici le premier article officiel sur le reseau !",
        "apercu_public": True,
    })
    assert res.status_code == 201
    assert res.data["titre"] == "Bienvenue a tous"
    assert res.data["auteur"]["id"] == user_a.id
    assert res.data["nb_likes"] == 0
    assert res.data["nb_commentaires"] == 0
    assert res.data["est_auteur"] is True


@pytest.mark.django_db
def test_upload_image_securise(client_a):
    img = creer_image_test(format="JPEG", taille=(800, 600))
    res = client_a.post("/api/publications/", {
        "titre": "Article avec photo",
        "contenu": "Regardez cette photo de classe !",
        "image": img,
    }, format="multipart")
    assert res.status_code == 201
    assert res.data["image"] is not None
    assert res.data["image"].endswith(".webp")


@pytest.mark.django_db
def test_upload_image_invalide_rejete(client_a):
    fichier_invalide = SimpleUploadedFile("fake.jpg", b"ceci n'est pas une image", content_type="image/jpeg")
    res = client_a.post("/api/publications/", {
        "titre": "Faux article",
        "contenu": "Contenu de test pour upload faux",
        "image": fichier_invalide,
    }, format="multipart")
    assert res.status_code == 400
    assert "image" in res.data


@pytest.mark.django_db
def test_modification_et_suppression_par_auteur_uniquement(client_a, client_b, user_a):
    pub = Publication.objects.create(
        auteur=user_a,
        titre="Article original",
        contenu="Texte original tres interessant",
    )
    # Bob essaie de modifier -> 403
    res_b = client_b.patch(f"/api/publications/{pub.id}/", {"titre": "Hacked"})
    assert res_b.status_code == 403

    # Alice modifie -> 200
    res_a = client_a.patch(f"/api/publications/{pub.id}/", {"titre": "Article mis a jour"})
    assert res_a.status_code == 200
    assert res_a.data["titre"] == "Article mis a jour"

    # Bob essaie de supprimer -> 403
    del_b = client_b.delete(f"/api/publications/{pub.id}/")
    assert del_b.status_code == 403

    # Alice supprime -> 204
    del_a = client_a.delete(f"/api/publications/{pub.id}/")
    assert del_a.status_code == 204
    assert not Publication.objects.filter(id=pub.id).exists()


@pytest.mark.django_db
def test_brouillon_invisible_aux_autres(client_a, client_b, user_a):
    Publication.objects.create(
        auteur=user_a,
        titre="Mon brouillon prive",
        contenu="Pas encore termine",
        statut="brouillon",
    )
    # Dans le fil public, Bob ne le voit pas
    res_fil_b = client_b.get("/api/publications/")
    assert len(res_fil_b.data["results"]) == 0

    # Alice peut voir ses propres brouillons avec ?auteur=me
    res_alice_brouillons = client_a.get("/api/publications/?auteur=me&statut=brouillon")
    assert len(res_alice_brouillons.data["results"]) == 1


@pytest.mark.django_db
def test_like_toggle(client_a, client_b, user_a):
    pub = Publication.objects.create(
        auteur=user_a,
        titre="Publication a liker",
        contenu="Aimez si vous etes d'accord !",
    )
    # Bob like
    res1 = client_b.post(f"/api/publications/{pub.id}/like/")
    assert res1.status_code == 200
    assert res1.data["aime"] is True
    assert res1.data["nb_likes"] == 1

    # Bob vérifie dans le fil qu'il a liké
    fil_b = client_b.get("/api/publications/")
    assert fil_b.data["results"][0]["a_aime"] is True
    assert fil_b.data["results"][0]["nb_likes"] == 1

    # Alice voit 1 like mais a_aime est False pour elle
    fil_a = client_a.get("/api/publications/")
    assert fil_a.data["results"][0]["a_aime"] is False
    assert fil_a.data["results"][0]["nb_likes"] == 1

    # Bob unlike
    res2 = client_b.post(f"/api/publications/{pub.id}/like/")
    assert res2.status_code == 200
    assert res2.data["aime"] is False
    assert res2.data["nb_likes"] == 0


@pytest.mark.django_db
def test_commentaires_crud(client_a, client_b, user_a, user_b):
    pub = Publication.objects.create(
        auteur=user_a,
        titre="Sujet de discussion",
        contenu="Donnez votre avis en commentaire.",
    )

    # Bob commente
    res = client_b.post(f"/api/publications/{pub.id}/commentaires/", {"texte": "Super initiative !"})
    assert res.status_code == 201
    com_id = res.data["id"]
    assert res.data["auteur"]["nom"] == "B"

    # Alice lit les commentaires
    list_com = client_a.get(f"/api/publications/{pub.id}/commentaires/")
    assert len(list_com.data["results"]) == 1
    assert list_com.data["results"][0]["est_auteur"] is False

    # Bob peut modifier son commentaire
    res_mod = client_b.patch(f"/api/commentaires/{com_id}/", {"texte": "Super initiative ! (modifie)"})
    assert res_mod.status_code == 200

    # Alice ne peut pas modifier le commentaire de Bob
    res_mod_a = client_a.patch(f"/api/commentaires/{com_id}/", {"texte": "Interdit"})
    assert res_mod_a.status_code == 403

    # Bob supprime son commentaire
    res_del = client_b.delete(f"/api/commentaires/{com_id}/")
    assert res_del.status_code == 204
    assert not Commentaire.objects.filter(id=com_id).exists()


@pytest.mark.django_db
def test_isolation_blocage(client_a, client_b, user_a, user_b):
    Publication.objects.create(
        auteur=user_a,
        titre="Publication d'Alice",
        contenu="Bob ne doit pas voir ca si blocage.",
    )
    # Sans blocage, Bob voit la publication
    assert len(client_b.get("/api/publications/").data["results"]) == 1

    # Bob bloque Alice
    Blocage.objects.create(bloqueur=user_b, bloque=user_a)

    # Bob ne voit plus les publications d'Alice
    assert len(client_b.get("/api/publications/").data["results"]) == 0

    # Alice ne voit pas non plus d'éventuelles publications de Bob
    assert len(client_a.get("/api/publications/").data["results"]) == 1  # seulement les siennes


@pytest.mark.django_db
def test_partage_opengraph_public(client, user_a):
    pub = Publication.objects.create(
        auteur=user_a,
        titre="Titre Partage Test",
        contenu="Ceci est le texte public partageable avec Open Graph.",
        apercu_public=True,
    )
    res = client.get(f"/p/{pub.id}/")
    assert res.status_code == 200
    html = res.content.decode("utf-8")
    assert "Titre Partage Test" in html
    assert "og:title" in html
    assert "Ceci est le texte public" in html


@pytest.mark.django_db
def test_partage_opengraph_reserve(client, user_a):
    pub = Publication.objects.create(
        auteur=user_a,
        titre="Secret Promo",
        contenu="Texte reserve confidentiel.",
        apercu_public=False,
    )
    res = client.get(f"/p/{pub.id}/")
    assert res.status_code == 200
    html = res.content.decode("utf-8")
    assert "Secret Promo" in html
    assert "Texte reserve confidentiel" not in html
    assert "Contenu réservé aux membres" in html
