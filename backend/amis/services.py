from dataclasses import dataclass, field

from django.db.models import Count, Exists, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone

from comptes.models import Suspension
from profils.models import Profil
from scolarite.models import Scolarite

from .models import Amitie, Blocage

OBJECTIFS = {"emploi": "un emploi", "stage": "un stage", "formation": "une formation"}


@dataclass
class Relations:
    amis: set = field(default_factory=set)
    envoyees: dict = field(default_factory=dict)  # id utilisateur -> id de la demande
    recues: dict = field(default_factory=dict)

    def de(self, uid):
        if uid in self.amis:
            return "amis", None
        if uid in self.envoyees:
            return "envoyee", self.envoyees[uid]
        if uid in self.recues:
            return "recue", self.recues[uid]
        return "aucune", None

    @property
    def engages(self):
        return self.amis | set(self.envoyees) | set(self.recues)


def relations(user):
    rel = Relations()
    lignes = (Amitie.objects.filter(Q(demandeur=user) | Q(destinataire=user),
                                    statut__in=["attente", "acceptee"])
              .values_list("pk", "demandeur_id", "destinataire_id", "statut"))
    for pk, d, dest, statut in lignes:
        autre = dest if d == user.pk else d
        if statut == "acceptee":
            rel.amis.add(autre)
        elif d == user.pk:
            rel.envoyees[autre] = pk
        else:
            rel.recues[autre] = pk
    return rel


def ids_bloques(user):
    """Utilisateurs bloqués par moi ou qui m'ont bloqué : invisibles dans les deux sens."""
    ids = set()
    for a, b in Blocage.objects.filter(Q(bloqueur=user) | Q(bloque=user)).values_list("bloqueur_id", "bloque_id"):
        ids.update((a, b))
    ids.discard(user.pk)
    return ids


def profils_actifs():
    """Profils de comptes validés, actifs, non suspendus, onboarding terminé."""
    suspendus = (Suspension.objects.filter(user=OuterRef("user_id"), active=True)
                 .filter(Q(definitive=True) | Q(fin__gt=timezone.now())))
    return (Profil.objects
            .filter(user__valide=True, user__is_active=True, onboarding_termine=True)
            .filter(~Exists(suspendus))
            .select_related("user", "situation__domaine"))


def profils_visibles(user, rel, bloques):
    return (profils_actifs().exclude(user_id=user.pk).exclude(user_id__in=bloques)
            .filter(Q(visibilite_profil="tous") | Q(visibilite_profil="amis", user_id__in=list(rel.amis))))


def suggestions(user, rel, bloques):
    """Profils partageant au moins une classe sur des années qui se chevauchent."""
    mes = Scolarite.objects.filter(profil__user=user)
    communes = (Scolarite.objects.filter(profil=OuterRef("pk"))
                .filter(Exists(mes.filter(classe=OuterRef("classe"),
                                          annee_debut__lte=OuterRef("annee_fin"),
                                          annee_fin__gte=OuterRef("annee_debut"))))
                .order_by().values("profil").annotate(n=Count("pk")).values("n"))
    return (profils_visibles(user, rel, bloques)
            .exclude(user_id__in=list(rel.engages))
            .filter(visibilite_parcours="tous")
            .annotate(communes=Coalesce(Subquery(communes), 0))
            .filter(communes__gt=0)
            .order_by("-communes", "user__nom", "user__prenom", "pk"))


def resume_situation(p, est_ami):
    v = p.visibilite_situation
    if v == "personne" or (v == "amis" and not est_ami):
        return None
    s = getattr(p, "situation", None)
    if s is None or s.type == "autre":
        return None
    if s.type == "emploi":
        texte = f"{s.poste} chez {s.entreprise}" if s.poste and s.entreprise else s.poste
    elif s.type == "etudes":
        texte = ", ".join(x for x in (s.domaine.nom if s.domaine else "", s.etablissement) if x)
    else:
        texte = f"Recherche {OBJECTIFS.get(s.objectif, '')}".strip()
    return {"type": s.type, "texte": texte}


def carte(p, rel, communes=None):
    u = p.user
    relation, demande_id = rel.de(u.pk)
    data = {"id": u.pk, "prenom": u.prenom, "nom": u.nom, "statut": u.statut,
            "annee_sortie": p.annee_sortie, "ville": p.ville,
            "relation": relation, "demande_id": demande_id,
            "situation": resume_situation(p, u.pk in rel.amis)}
    if communes is not None:
        data["classes_communes"] = communes
    return data
