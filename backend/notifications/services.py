import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from amis.services import ids_bloques
from .models import Notification, Preferences
from .presence import presents
from .push import pousser

logger = logging.getLogger(__name__)

FENETRE_PUBLICATIONS = timedelta(minutes=30)

# Cle de preference par type de notification
PREF = {
    "publication":        "publications",
    "like":               "likes",
    "commentaire":        "commentaires",
    "demande_ami":        "amis",
    "ami_accepte":        "amis",
    "invitation":         "discussions",
    "invitation_acceptee":"discussions",
}

# Types qui declenchent un push
PUSH = {
    "publication", "commentaire", "demande_ami", "ami_accepte",
    "invitation", "invitation_acceptee", "resume",
}

TITRES = {
    "publication":         "Nouvelle publication",
    "commentaire":         "Nouveau commentaire",
    "demande_ami":         "Demande d'ami",
    "ami_accepte":         "Demande acceptee",
    "invitation":          "Invitation a discuter",
    "invitation_acceptee": "Invitation acceptee",
    "resume":              "Resume du jour",
    "like":                "Nouveau j'aime",
}


def lancer(tache, *args):
    """Lance une tache Celery sans jamais faire echouer la requete courante."""
    try:
        tache.delay(*args)
    except Exception:
        logger.exception("Impossible de lancer la tache %s", getattr(tache, "name", tache))


def prefs_de(ids):
    trouvees = {p.user_id: p for p in Preferences.objects.filter(user_id__in=list(ids))}
    return {u: trouvees.get(u) or Preferences(user_id=u) for u in ids}


def _autorise(p, type_):
    cle = PREF.get(type_)
    if cle is None:
        return True
    v = getattr(p, cle)
    # Pour les publications, "immediat" = True ; les autres sont des booleens
    return v == "immediat" if type_ == "publication" else bool(v)


def notifier(destinataires, type_, acteur=None, publication=None):
    """
    Cree ou regroupe des notifications.
    Retourne (pks_crees, pks_regroupes).
    """
    ids = set(destinataires)
    if acteur is not None:
        ids -= {acteur.pk} | ids_bloques(acteur)
    prefs = prefs_de(list(ids))
    ids = [u for u in ids if _autorise(prefs[u], type_)]
    if not ids:
        return [], []

    maintenant = timezone.now()
    regroupees = []

    if type_ in ("publication", "like", "commentaire"):
        qs = Notification.objects.filter(destinataire_id__in=ids, type=type_, lue=False)
        if type_ == "publication":
            qs = qs.filter(modifie_le__gt=maintenant - FENETRE_PUBLICATIONS)
        else:
            qs = qs.filter(publication=publication)
        existantes = {n.destinataire_id: n.pk for n in qs.only("id", "destinataire_id")}
        if existantes:
            Notification.objects.filter(pk__in=existantes.values()).update(
                nb=F("nb") + 1,
                acteur=acteur,
                publication=publication,
                modifie_le=maintenant,
            )
            regroupees = list(existantes.values())
            ids = [u for u in ids if u not in existantes]

    crees = Notification.objects.bulk_create([
        Notification(destinataire_id=u, type=type_, acteur=acteur, publication=publication)
        for u in ids
    ])
    return [n.pk for n in crees], regroupees


def evenement(destinataires, type_, acteur=None, publication=None):
    """
    Point d'entree depuis les vues : cree + livre apres le commit.
    """
    from .taches import diffuser_notifications
    crees, regroupees = notifier(destinataires, type_, acteur, publication)
    if crees or regroupees:
        transaction.on_commit(lambda: lancer(diffuser_notifications, crees, regroupees))


def _nom(n):
    return f"{n.acteur.prenom} {n.acteur.nom}" if n.acteur else "Quelqu'un"


def texte(n):
    autres = n.nb - 1
    plus   = f" et {autres} autre{'s' if autres > 1 else ''}" if autres else ""
    a      = _nom(n)
    verbe  = "ont" if autres else "a"
    t      = n.type
    if t == "publication":
        return (f"{a} a publie : {n.publication.titre}"
                if n.nb == 1 and n.publication else f"{n.nb} nouvelles publications")
    if t == "like":
        return f"{a}{plus} {verbe} aime votre publication"
    if t == "commentaire":
        return f"{a}{plus} {verbe} commente votre publication"
    if t == "demande_ami":
        return f"{a} vous a envoye une demande d'ami"
    if t == "ami_accepte":
        return f"{a} a accepte votre demande d'ami"
    if t == "invitation":
        return f"{a} vous invite a discuter"
    if t == "invitation_acceptee":
        return f"{a} a accepte de discuter avec vous"
    # resume
    return ("1 nouvelle publication aujourd'hui"
            if n.nb == 1 else f"{n.nb} nouvelles publications aujourd'hui")


def url_notif(n):
    if n.type in ("publication", "like", "commentaire") and n.publication_id and n.nb == 1:
        return f"/publications/{n.publication_id}"
    return {
        "demande_ami":         "/amis",
        "ami_accepte":         f"/profil/{n.acteur_id}" if n.acteur_id else "/amis",
        "invitation":          "/messages",
        "invitation_acceptee": "/messages",
    }.get(n.type, "/fil")


def charge_push(n):
    return {
        "titre": TITRES[n.type],
        "corps": texte(n)[:140],
        "url":   url_notif(n),
        "tag":   f"n-{n.type}-{n.pk}",
    }


def serialiser(n):
    a = n.acteur
    return {
        "id":    n.pk,
        "type":  n.type,
        "texte": texte(n),
        "url":   url_notif(n),
        "lue":   n.lue,
        "nb":    n.nb,
        "date":  n.modifie_le,
        "acteur": {
            "id":     a.pk,
            "prenom": a.prenom,
            "nom":    a.nom,
            "photo":  a.profil.photo_s.url if (hasattr(a, "profil") and a.profil.photo_s) else None,
        } if a else None,
    }


def livrer(crees, regroupees):
    """Temps reel pour tous, push seulement pour les nouvelles notifications et les absents."""
    from discussions.services import diffuser
    notifs = list(
        Notification.objects
        .filter(pk__in=[*crees, *regroupees])
        .select_related("acteur__profil", "publication")
    )
    for n in notifs:
        diffuser([n.destinataire_id], {
            "type":      "notification.nouvelle",
            "id":        n.pk,
            "sous_type": n.type,
        })

    nouvelles = [n for n in notifs if n.pk in set(crees) and n.type in PUSH]
    if not nouvelles:
        return

    uids   = [n.destinataire_id for n in nouvelles]
    prefs  = prefs_de(uids)
    absents = set(uids) - presents(uids)
    pousser([
        (n.destinataire_id, charge_push(n))
        for n in nouvelles
        if n.destinataire_id in absents and prefs[n.destinataire_id].push
    ])
