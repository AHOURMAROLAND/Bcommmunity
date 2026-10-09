from dataclasses import dataclass, field

from django.db.models import Case, Count, Exists, F, IntegerField, OuterRef, Q, Subquery, When
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
            .select_related("user", "situation__domaine")
            .prefetch_related("user__badges"))


def profils_visibles(user, rel, bloques):
    return (profils_actifs().exclude(user_id=user.pk).exclude(user_id__in=bloques)
            .filter(Q(visibilite_profil="tous") | Q(visibilite_profil="amis", user_id__in=list(rel.amis))))


def suggestions(user, rel, bloques):
    """Classe les personnes par proximité scolaire, promotion, domaine et amis communs."""
    mes = Scolarite.objects.filter(profil__user=user)
    communes = (Scolarite.objects.filter(profil=OuterRef("pk"))
                .filter(Exists(mes.filter(classe=OuterRef("classe"),
                                          annee_debut__lte=OuterRef("annee_fin"),
                                          annee_fin__gte=OuterRef("annee_debut"))))
                .order_by().values("profil").annotate(n=Count("pk")).values("n"))
    profil = Profil.objects.filter(user=user).select_related("situation__domaine").first()
    annee = profil.annee_sortie if profil else None
    domaine_id = (
        profil.situation.domaine_id
        if profil and hasattr(profil, "situation") and profil.situation
        else None
    )
    amis = list(rel.amis)
    relations_amis = (
        Amitie.objects.filter(statut="acceptee")
        .filter(Q(demandeur_id__in=amis) | Q(destinataire_id__in=amis))
        .annotate(
            candidat_id=Case(
                When(demandeur_id__in=amis, then=F("destinataire_id")),
                default=F("demandeur_id"),
                output_field=IntegerField(),
            )
        )
        .order_by()
        .values("candidat_id")
        .annotate(n=Count("pk"))
        .filter(candidat_id=OuterRef("user_id"))
        .values("n")
    )
    qs = (profils_visibles(user, rel, bloques)
            .exclude(user_id__in=list(rel.engages))
            .annotate(communes=Case(
                When(visibilite_parcours="tous", then=Coalesce(Subquery(communes), 0)),
                default=0,
                output_field=IntegerField(),
            ))
            .annotate(amis_communs=Coalesce(Subquery(relations_amis), 0))
            .annotate(
                meme_promo=Case(
                    *([When(annee_sortie=annee, then=1)] if annee else []),
                    default=0,
                    output_field=IntegerField(),
                ),
                meme_domaine=Case(
                    *([When(
                        situation__domaine_id=domaine_id,
                        visibilite_situation="tous",
                        then=1,
                    )] if domaine_id else []),
                    default=0,
                    output_field=IntegerField(),
                ),
            )
    )
    return (qs.filter(
        Q(communes__gt=0)
        | Q(meme_promo=1)
        | Q(meme_domaine=1)
        | Q(amis_communs__gt=0)
    ).order_by("-meme_promo", "-meme_domaine", "-amis_communs", "-communes",
               "user__nom", "user__prenom", "pk"))


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
            "photo": p.url_mini,
            "annee_sortie": p.annee_sortie, "ville": p.ville,
            "badges": [{"type": badge.type, "libelle": badge.get_type_display()}
                       for badge in u.badges.all()],
            "relation": relation, "demande_id": demande_id,
            "situation": resume_situation(p, u.pk in rel.amis)}
    if communes is not None:
        data["classes_communes"] = communes
        data["amis_communs"] = getattr(p, "amis_communs", 0)
        data["meme_promo"] = bool(getattr(p, "meme_promo", 0))
        data["meme_domaine"] = bool(getattr(p, "meme_domaine", 0))
    return data
