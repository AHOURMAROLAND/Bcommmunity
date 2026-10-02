import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from comptes.models import User
from profils.models import Profil, SituationActuelle
from scolarite.models import Classe, Cycle, Scolarite

from .models import Amitie


@pytest.fixture(autouse=True)
def cache_propre():
    cache.clear()


@pytest.fixture
def classes(db):
    cycle = Cycle.objects.create(nom="Collège")
    return [Classe.objects.create(cycle=cycle, nom=n) for n in ("6e", "5e", "4e")]


def membre(prenom, **profil):
    u = User.objects.create_user(f"{prenom.lower()}@example.com", "x" * 12,
                                 prenom=prenom, nom="Test", valide=True)
    p = Profil.objects.create(user=u, onboarding_termine=True, **profil)
    SituationActuelle.objects.create(profil=p)
    return u


def api(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def ligne(u, classe, debut, fin):
    Scolarite.objects.create(profil=u.profil, classe=classe, annee_debut=debut, annee_fin=fin)


def ids(r):
    return [x["id"] for x in r.data["results"]]


def test_suggestions_classes_communes_et_annees_qui_se_chevauchent(classes):
    a, b, c = membre("Alice"), membre("Bob"), membre("Chloe")
    ligne(a, classes[0], 2008, 2009)
    ligne(a, classes[1], 2009, 2010)
    ligne(b, classes[0], 2008, 2009)
    ligne(b, classes[1], 2009, 2010)  # 2 classes en commun
    ligne(c, classes[0], 2015, 2016)  # même classe, autre période : pas en commun
    r = api(a).get("/api/amis/suggestions/")
    assert ids(r) == [b.pk] and r.data["results"][0]["classes_communes"] == 2


def test_utilisateur_bloque_invisible_partout(classes):
    a, b = membre("Alice"), membre("Bob")
    assert b.pk in ids(api(a).get("/api/annuaire/"))
    assert api(a).post("/api/blocages/", {"user": b.pk}, format="json").status_code == 201
    assert b.pk not in ids(api(a).get("/api/annuaire/"))
    assert a.pk not in ids(api(b).get("/api/annuaire/"))
    assert api(a).get(f"/api/profils/{b.pk}/").status_code == 404
    assert api(b).get(f"/api/profils/{a.pk}/").status_code == 404


def test_profil_masque_absent_de_l_annuaire(classes):
    a, b = membre("Alice"), membre("Bob", visibilite_profil="personne")
    assert b.pk not in ids(api(a).get("/api/annuaire/"))
    assert api(a).get(f"/api/profils/{b.pk}/").status_code == 404


def test_filtre_situation_ne_revele_pas_une_situation_masquee(classes):
    a, b = membre("Alice"), membre("Bob", visibilite_situation="personne")
    SituationActuelle.objects.filter(profil=b.profil).update(type="emploi", poste="Architecte")
    assert ids(api(a).get("/api/annuaire/?situation=emploi")) == []


def test_profil_reserve_aux_amis_est_restreint(classes):
    a, b = membre("Alice"), membre("Bob", visibilite_profil="amis")
    r = api(a).get(f"/api/profils/{b.pk}/")
    assert r.status_code == 200 and r.data["restreint"] is True and "bio" not in r.data


def test_parcours_marque_les_classes_en_commun(classes):
    a, b = membre("Alice"), membre("Bob")
    ligne(a, classes[0], 2008, 2009)
    ligne(b, classes[0], 2008, 2009)
    ligne(b, classes[2], 2012, 2013)
    parcours = api(a).get(f"/api/profils/{b.pk}/").data["parcours"]
    assert [x["en_commun"] for x in parcours] == [False, True]  # tri : plus récent d'abord


def test_cycle_de_vie_d_une_amitie(classes):
    a, b = membre("Alice"), membre("Bob")
    assert api(a).post("/api/amis/demandes/", {"user": b.pk}, format="json").status_code == 201
    assert api(a).post("/api/amis/demandes/", {"user": b.pk}, format="json").status_code == 400
    demande = Amitie.objects.get()
    assert api(b).get("/api/amis/compteurs/").data["demandes_recues"] == 1
    assert api(b).post(f"/api/amis/demandes/{demande.pk}/accepter/").status_code == 204
    assert ids(api(a).get("/api/amis/")) == [b.pk]
    assert api(a).delete(f"/api/amis/{b.pk}/").status_code == 204
    assert ids(api(a).get("/api/amis/")) == []


def test_demande_croisee_acceptee_automatiquement(classes):
    a, b = membre("Alice"), membre("Bob")
    api(a).post("/api/amis/demandes/", {"user": b.pk}, format="json")
    r = api(b).post("/api/amis/demandes/", {"user": a.pk}, format="json")
    assert r.status_code == 200 and Amitie.objects.get().statut == "acceptee"


def test_renvoi_apres_refus_bloque_pendant_30_jours(classes):
    a, b = membre("Alice"), membre("Bob")
    api(a).post("/api/amis/demandes/", {"user": b.pk}, format="json")
    api(b).post(f"/api/amis/demandes/{Amitie.objects.get().pk}/refuser/")
    assert api(a).post("/api/amis/demandes/", {"user": b.pk}, format="json").status_code == 400


def test_on_ne_peut_pas_accepter_la_demande_d_un_autre(classes):
    a, b, c = membre("Alice"), membre("Bob"), membre("Chloe")
    api(a).post("/api/amis/demandes/", {"user": b.pk}, format="json")
    assert api(c).post(f"/api/amis/demandes/{Amitie.objects.get().pk}/accepter/").status_code == 404
