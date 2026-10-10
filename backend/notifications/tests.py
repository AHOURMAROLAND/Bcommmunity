import pytest
from django.core.cache import cache

from amis.tests import api, membre
from discussions.models import Conversation, Message, Participant
from publications.models import Publication

from . import push
from .models import Notification, Preferences, PushAbonnement
from .reponse_push import creer_jeton_reponse
from .services import notifier, texte
from .taches import annoncer_publication

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def isole():
    cache.clear()


def publication(auteur, titre="Retrouvailles"):
    return Publication.objects.create(
        auteur=auteur, titre=titre, contenu="<p>x</p>", extrait="x", statut="publie")


def test_j_aime_regroupes_par_publication():
    a, b, c = membre("Alice"), membre("Bob"), membre("Chloe")
    pub = publication(a)
    notifier([a.pk], "like", b, pub)
    notifier([a.pk], "like", c, pub)
    n = Notification.objects.get()
    assert n.nb == 2
    assert "et 1 autre" in texte(n)
    assert "ont aime" in texte(n)


def test_on_ne_se_notifie_pas_soi_meme():
    a = membre("Alice")
    assert notifier([a.pk], "like", a, publication(a)) == ([], [])


def test_nouvelle_publication_pour_tous_sauf_exclus():
    a, b, c, d, e = (membre(n) for n in ("Alice", "Bob", "Chloe", "David", "Emma"))
    api(c).post("/api/blocages/", {"user": a.pk}, format="json")
    Preferences.objects.create(user=d, publications="desactive")
    Preferences.objects.create(user=e, publications="quotidien")
    annoncer_publication(publication(a).pk)
    assert set(Notification.objects.values_list("destinataire_id", flat=True)) == {b.pk}


def test_publications_proches_regroupees_tant_que_non_lues():
    a, b = membre("Alice"), membre("Bob")
    annoncer_publication(publication(a, "Une").pk)
    annoncer_publication(publication(a, "Deux").pk)
    n = Notification.objects.get(destinataire=b)
    assert n.nb == 2 and texte(n) == "2 nouvelles publications"
    api(b).post("/api/notifications/lu/", {"tout": True}, format="json")
    annoncer_publication(publication(a, "Trois").pk)
    assert Notification.objects.filter(destinataire=b).count() == 2


def test_liste_compteur_et_lecture():
    a, b = membre("Alice"), membre("Bob")
    notifier([a.pk], "demande_ami", b)
    assert api(a).get("/api/notifications/compteur/").data["non_lues"] == 1
    item = api(a).get("/api/notifications/").data["results"][0]
    assert item["url"] == "/amis"
    api(a).post("/api/notifications/lu/", {"ids": [item["id"]]}, format="json")
    assert api(a).get("/api/notifications/compteur/").data["non_lues"] == 0


def test_preferences():
    a = membre("Alice")
    r = api(a).patch(
        "/api/notifications/preferences/",
        {"publications": "quotidien", "likes": False},
        format="json",
    )
    assert r.status_code == 200
    assert r.data["publications"] == "quotidien"
    assert r.data["likes"] is False


def test_abonnement_push_refuse_les_adresses_internes():
    a = membre("Alice")
    cles = {"p256dh": "k" * 80, "auth": "a" * 22}
    for mauvaise in (
        "http://localhost/x",
        "https://169.254.169.254/x",
        "https://exemple.fr/x",
    ):
        r = api(a).post(
            "/api/notifications/push/web/",
            {"endpoint": mauvaise, "keys": cles},
            format="json",
        )
        assert r.status_code == 400

    ok = api(a).post(
        "/api/notifications/push/web/",
        {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": cles},
        format="json",
    )
    assert ok.status_code == 201
    assert PushAbonnement.objects.count() == 1


def test_abonnement_onesignal_valide_et_relie_au_compte():
    a = membre("Alice")
    subscription_id = "1dd608f2-c6a1-11e3-851d-000c2940e62c"
    reponse = api(a).post(
        "/api/notifications/push/onesignal/",
        {"subscription_id": subscription_id},
        format="json",
    )
    assert reponse.status_code == 201
    abonnement = PushAbonnement.objects.get(cible=subscription_id)
    assert abonnement.user == a
    assert abonnement.type == PushAbonnement.Type.ONESIGNAL

    invalide = api(a).post(
        "/api/notifications/push/onesignal/",
        {"subscription_id": "not-a-uuid"},
        format="json",
    )
    assert invalide.status_code == 400


def test_envoi_onesignal_utilise_l_identifiant_d_abonnement(monkeypatch, settings):
    a = membre("Alice")
    abonnement = PushAbonnement.objects.create(
        user=a,
        type=PushAbonnement.Type.ONESIGNAL,
        cible="1dd608f2-c6a1-11e3-851d-000c2940e62c",
    )
    settings.ONESIGNAL_APP_ID = "app-id"
    settings.ONESIGNAL_REST_API_KEY = "rest-key"
    settings.SITE_URL = "https://bakhita.example"

    class Reponse:
        ok = True
        status_code = 200

    def post(url, *, headers, json, timeout):
        assert url == "https://api.onesignal.com/notifications"
        assert headers == {"Authorization": "Key rest-key"}
        assert json["app_id"] == "app-id"
        assert json["include_subscription_ids"] == [abonnement.cible]
        assert json["contents"] == {"fr": "corps"}
        assert json["url"] == "https://bakhita.example/fil"
        assert timeout == 5
        return Reponse()

    monkeypatch.setattr(push.requests, "post", post)
    assert push._envoyer_onesignal(
        abonnement, {"titre": "titre", "corps": "corps", "url": "/fil"}
    ) == (abonnement.pk, None)


def test_abonnement_mort_supprime_et_echecs_desactivent(monkeypatch):
    a = membre("Alice")
    mort = PushAbonnement.objects.create(
        user=a, type="web", cible="https://fcm.googleapis.com/m", cles={})
    monkeypatch.setattr(push, "_envoyer_web", lambda ab, ch: (ab.pk, "mort"))
    push.pousser([(a.pk, {"titre": "t", "corps": "c"})])
    assert not PushAbonnement.objects.filter(pk=mort.pk).exists()

    fragile = PushAbonnement.objects.create(
        user=a, type="web", cible="https://fcm.googleapis.com/f", cles={}, echecs=4)
    monkeypatch.setattr(push, "_envoyer_web", lambda ab, ch: (ab.pk, "erreur"))
    push.pousser([(a.pk, {"titre": "t", "corps": "c"})])
    fragile.refresh_from_db()
    assert fragile.actif is False


def test_reponse_push_envoie_un_message_avec_citation():
    a, b = membre("Alice"), membre("Bob")
    conversation = Conversation.objects.create()
    Participant.objects.bulk_create([
        Participant(conversation=conversation, user=user) for user in (a, b)
    ])
    original = Message.objects.create(
        conversation=conversation, auteur=b, texte="Bonjour !")
    jeton = creer_jeton_reponse(a.pk, conversation.pk, original.pk)

    reponse = api(a).post(
        "/api/notifications/push/reply/",
        {"jeton": jeton, "texte": "Salut !"},
        format="json",
    )

    assert reponse.status_code == 201
    message = Message.objects.get(pk=reponse.data["id"])
    assert message.auteur == a
    assert message.texte == "Salut !"
    assert message.en_reponse_a_id == original.pk


def test_reponse_push_refuse_jeton_invalide_et_rejoue():
    a, b = membre("Alice"), membre("Bob")
    conversation = Conversation.objects.create()
    Participant.objects.bulk_create([
        Participant(conversation=conversation, user=user) for user in (a, b)
    ])
    original = Message.objects.create(
        conversation=conversation, auteur=b, texte="Bonjour !")
    jeton = creer_jeton_reponse(a.pk, conversation.pk, original.pk)

    invalide = api(a).post(
        "/api/notifications/push/reply/",
        {"jeton": "jeton-invalide", "texte": "Salut !"},
        format="json",
    )
    succes = api(a).post(
        "/api/notifications/push/reply/",
        {"jeton": jeton, "texte": "Salut !"},
        format="json",
    )
    rejoue = api(a).post(
        "/api/notifications/push/reply/",
        {"jeton": jeton, "texte": "Encore !"},
        format="json",
    )

    assert invalide.status_code == 403
    assert succes.status_code == 201
    assert rejoue.status_code == 403
