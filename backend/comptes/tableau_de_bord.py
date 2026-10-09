from datetime import datetime, timedelta
from datetime import timezone as dt_tz

from django.contrib.admin.models import LogEntry
from django.db.models import Case, Count, IntegerField, Q, When
from django.db.models.functions import ExtractDay, ExtractMonth, TruncMonth
from django.utils import timezone

from profils.models import Profil
from publications.models import Publication
from signalements.models import Signalement

from .models import Activite, Suspension, User

MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
        "juil.", "août", "sept.", "oct.", "nov.", "déc."]


def _a_le_permission_de_lecture(user, permission):
    app, code = permission.split(".", 1)
    if code.startswith("view_"):
        permission_modification = f"{app}.change_{code[5:]}"
        return user.has_perm(permission) or user.has_perm(permission_modification)
    return user.has_perm(permission)


def _six_derniers_mois(now):
    mois = []
    a, m = now.year, now.month
    for _ in range(6):
        mois.append((a, m))
        m -= 1
        if m == 0:
            a, m = a - 1, 12
    return list(reversed(mois))


def contexte(request, context):
    now = timezone.now()
    user = request.user
    permissions = {
        "can_comptes": _a_le_permission_de_lecture(user, "comptes.view_user"),
        "can_profils": _a_le_permission_de_lecture(user, "profils.view_profil"),
        "can_signalements": _a_le_permission_de_lecture(user, "signalements.view_signalement"),
        "can_suspensions": _a_le_permission_de_lecture(user, "comptes.view_suspension"),
        "can_publications": _a_le_permission_de_lecture(user, "publications.view_publication"),
        "can_activite": _a_le_permission_de_lecture(user, "comptes.view_activite"),
        "can_actions_admin": _a_le_permission_de_lecture(user, "admin.view_logentry"),
    }
    stats = {}
    donnees = {}

    if permissions["can_comptes"]:
        valides = User.objects.filter(valide=True, is_active=True)
        stats.update({
            "attente": User.objects.filter(email_verifie=False, is_active=True).count(),
            "membres": valides.count(),
        })

        periode = _six_derniers_mois(now)
        debut = datetime(periode[0][0], periode[0][1], 1, tzinfo=dt_tz.utc)
        comptes = {(d["m"].year, d["m"].month): d["n"] for d in
                   User.objects.filter(date_inscription__gte=debut)
                   .annotate(m=TruncMonth("date_inscription")).values("m").annotate(n=Count("id"))}
        valeurs = [comptes.get(p, 0) for p in periode]
        maxi = max(valeurs) or 1
        inscriptions = [{"label": MOIS[m - 1], "n": n,
                         "pct": max(round(100 * n / maxi), 4 if n else 0)}
                        for (_, m), n in zip(periode, valeurs)]

        eleves = valides.filter(statut="eleve").count()
        anciens = valides.filter(statut="ancien").count()
        total = eleves + anciens
        donnees.update({
            "inscriptions": inscriptions,
            "inscriptions_total": sum(valeurs),
            "repartition": {"eleves": eleves, "anciens": anciens,
                            "pct_eleves": round(100 * eleves / total) if total else 0},
            "en_attente": User.objects.filter(email_verifie=False, is_active=True)
            .order_by("-date_inscription")[:5],
        })

    if permissions["can_comptes"] and permissions["can_profils"]:
        jours = [timezone.localdate() + timedelta(days=i) for i in range(8)]
        correspondances = Q()
        rang = []
        for index, jour in enumerate(jours):
            correspondances |= Q(mois_anniversaire=jour.month, jour_anniversaire=jour.day)
            rang.append(When(
                mois_anniversaire=jour.month,
                jour_anniversaire=jour.day,
                then=index,
            ))
        donnees["anniversaires_semaine"] = (
            Profil.objects.filter(
                user__valide=True,
                user__is_active=True,
                date_anniversaire__isnull=False,
            )
            .annotate(
                mois_anniversaire=ExtractMonth("date_anniversaire"),
                jour_anniversaire=ExtractDay("date_anniversaire"),
            )
            .filter(correspondances)
            .annotate(rang_anniversaire=Case(
                *rang,
                default=len(jours),
                output_field=IntegerField(),
            ))
            .select_related("user")
            .order_by("rang_anniversaire", "user__prenom", "user__nom")[:10]
        )

    if permissions["can_signalements"]:
        stats["signalements"] = Signalement.objects.filter(
            statut__in=["nouveau", "en_cours"]).count()
        donnees["derniers_signalements"] = (
            Signalement.objects.filter(statut="nouveau").select_related("auteur")
            .order_by("-cree_le")[:5])

    if permissions["can_suspensions"]:
        stats["suspendus"] = Suspension.objects.filter(active=True).filter(
            Q(definitive=True) | Q(fin__gt=now)).count()

    if permissions["can_publications"]:
        stats["publications_7j"] = Publication.objects.filter(
            statut="publie", cree_le__gte=now - timedelta(days=7)).count()

    if permissions["can_actions_admin"]:
        donnees["dernieres_actions"] = LogEntry.objects.select_related(
            "user", "content_type").order_by("-action_time")[:8]

    if permissions["can_activite"]:
        donnees["activite"] = Activite.objects.select_related("user")[:8]
        donnees["connexions_24h"] = Activite.objects.filter(
            action="connexion", cree_le__gte=now - timedelta(hours=24)).count()

    context.update(permissions)
    context.update(donnees)
    context["stats"] = stats
    return context
