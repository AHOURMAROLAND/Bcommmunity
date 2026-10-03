import io
from datetime import timedelta

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from amis.tests import api, membre
from comptes.models import Suspension
from profils.models import Profil

from .models import Publication

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def isole(settings, tmp_path):
    cache.clear()
    settings.MEDIA_ROOT = tmp_path


def png(taille=(3000, 2000)):
    b = io.BytesIO()
    Image.new("RGB", taille, "navy").save(b, "PNG")
    return b.getvalue()


def publier(u, **extra):
    corps = {"titre": "Retrouvailles", "contenu": "<p>Bonjour</p>", "statut": "publie",
             "apercu_public": "true", **extra}
    return api(u).post("/api/publications/", corps, format="multipart")


def ids(r):
    return [x["id"] for x in r.data["results"]]


def test_brouillon_invisible_puis_visible_apres_publication():
    a, b = membre("Alice"), membre("Bob")
    pid = publier(a, statut="brouillon").data["id"]
    assert ids(api(b).get("/api/publications/")) == []
    assert api(b).get(f"/api/publications/{pid}/").status_code == 404
    assert api(a).patch(f"/api/publications/{pid}/", {"statut": "publie"}, format="multipart").status_code == 200
    assert ids(api(b).get("/api/publications/")) == [pid]


def test_html_nettoye():
    a = membre("Alice")
    r = publier(a, contenu='<p onclick="x()">Salut</p><script>alert(1)</script>'
                           '<a href="javascript:alert(1)">piege</a><a href="https://ok.fr">ok</a>')
    c = r.data["contenu"]
    assert "script" not in c and "onclick" not in c and "javascript:" not in c
    assert 'href="https://ok.fr"' in c


def test_image_invalide_rejetee_et_valide_en_trois_tailles():
    a = membre("Alice")
    faux = SimpleUploadedFile("a.png", b"pas une image", content_type="image/png")
    assert publier(a, image=faux).status_code == 400
    bon = SimpleUploadedFile("a.png", png((3000, 2000)), content_type="image/png")
    r = publier(a, image=bon)
    assert r.status_code == 201
    img = r.data["image"]
    assert img["src"].endswith(".webp") and (img["largeur"], img["hauteur"]) == (2048, 1365)
    assert img["moyenne"] and img["mini"] and "480w" in img["srcset"] and "1080w" in img["srcset"]


def test_petite_image_non_agrandie_et_sans_variantes_inutiles():
    a = membre("Alice")
    petite = SimpleUploadedFile("a.png", png((400, 300)), content_type="image/png")
    img = publier(a, image=petite).data["image"]
    assert (img["largeur"], img["hauteur"]) == (400, 300) and img["moyenne"] is None and img["mini"] is None


def test_ratio_extreme_et_image_trop_petite_refuses():
    a = membre("Alice")
    large = SimpleUploadedFile("a.png", png((3000, 600)), content_type="image/png")
    assert publier(a, image=large).status_code == 400
    mini = SimpleUploadedFile("b.png", png((100, 100)), content_type="image/png")
    assert publier(a, image=mini).status_code == 400


def test_like_idempotent_et_compteur():
    a, b = membre("Alice"), membre("Bob")
    pid = publier(a).data["id"]
    for _ in range(2):
        assert api(b).post(f"/api/publications/{pid}/like/").status_code in (200, 201)
    assert Publication.objects.get().nb_likes == 1
    assert api(b).delete(f"/api/publications/{pid}/like/").status_code == 204
    assert Publication.objects.get().nb_likes == 0


def test_publications_d_un_bloque_ou_d_un_suspendu_invisibles():
    a, b, c = membre("Alice"), membre("Bob"), membre("Chloe")
    publier(a)
    api(b).post("/api/blocages/", {"user": a.pk}, format="json")
    assert ids(api(b).get("/api/publications/")) == []
    Suspension.objects.create(user=a, motif="test", fin=timezone.now() + timedelta(days=1))
    cache.clear()
    assert ids(api(c).get("/api/publications/")) == []


def test_pas_de_modification_ni_suppression_par_autrui():
    a, b = membre("Alice"), membre("Bob")
    pid = publier(a).data["id"]
    assert api(b).patch(f"/api/publications/{pid}/", {"titre": "Piraté"}, format="multipart").status_code == 404
    assert api(b).delete(f"/api/publications/{pid}/").status_code == 404
    assert Publication.objects.filter(pk=pid).exists()


def test_page_de_partage_apercu_seulement_si_public():
    a = membre("Alice")
    pid = publier(a, titre="Titre secret").data["id"]
    rep = APIClient().get(f"/p/{pid}/")
    assert b"og:title" in rep.content and b"Titre secret" in rep.content
    api(a).patch(f"/api/publications/{pid}/", {"apercu_public": "false"}, format="multipart")
    assert b"Titre secret" not in APIClient().get(f"/p/{pid}/").content
    assert APIClient().get("/p/99999/").status_code == 200


def test_commentaires_et_compteur():
    a, b = membre("Alice"), membre("Bob")
    pid = publier(a).data["id"]
    cid = api(b).post(f"/api/publications/{pid}/commentaires/", {"texte": "Bravo"}, format="json").data["id"]
    assert Publication.objects.get().nb_commentaires == 1
    assert api(a).delete(f"/api/commentaires/{cid}/").status_code == 404
    assert api(b).delete(f"/api/commentaires/{cid}/").status_code == 204
    assert Publication.objects.get().nb_commentaires == 0


def test_commentaire_impossible_sur_un_brouillon_d_autrui():
    a, b = membre("Alice"), membre("Bob")
    pid = publier(a, statut="brouillon").data["id"]
    assert api(b).post(f"/api/publications/{pid}/commentaires/", {"texte": "x"}, format="json").status_code == 404


def test_photo_de_profil_carree_en_deux_tailles():
    a = membre("Alice")
    fichier = SimpleUploadedFile("p.png", png((1600, 1200)), content_type="image/png")
    r = api(a).post("/api/profils/me/photo/", {"image": fichier}, format="multipart")
    assert r.status_code == 200
    p = Profil.objects.get(user=a)
    with Image.open(p.photo.path) as g, Image.open(p.photo_s.path) as m:
        assert g.size == (800, 800) and m.size == (160, 160)
