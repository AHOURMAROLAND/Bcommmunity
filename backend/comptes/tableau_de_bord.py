from datetime import datetime, timedelta
from datetime import timezone as dt_tz

from django.contrib.admin.models import LogEntry
from django.db.models import Case, Count, IntegerField, Q, When
from django.db.models.functions import ExtractDay, ExtractMonth, TruncDate, TruncMonth
from django.utils import timezone

from discussions.models import InvitationDiscussion, Message
from profils.models import Profil
from publications.models import Publication
from scolarite.models import ParcoursBrouillon
from signalements.models import Signalement

from .models import Activite, Suspension, User

MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
        "juil.", "août", "sept.", "oct.", "nov.", "déc."]
SEUIL_INVITATIONS_MINEURS = 5


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
    debut_jour = now - timedelta(hours=24)
    debut_inscriptions = now - timedelta(days=30)
    date_debut_usage = timezone.localdate(now) - timedelta(days=6)
    debut_usage = timezone.make_aware(datetime.combine(date_debut_usage, datetime.min.time()))
    user = request.user
    permissions = {
        "can_comptes": _a_le_permission_de_lecture(user, "comptes.view_user"),
        "can_messages": _a_le_permission_de_lecture(user, "discussions.view_message"),
        "can_invites": _a_le_permission_de_lecture(user, "discussions.view_invitationdiscussion"),
        "can_profils": _a_le_permission_de_lecture(user, "profils.view_profil"),
        "can_signalements": _a_le_permission_de_lecture(user, "signalements.view_signalement"),
        "can_suspensions": _a_le_permission_de_lecture(user, "comptes.view_suspension"),
        "can_publications": _a_le_permission_de_lecture(user, "publications.view_publication"),
        "can_activite": _a_le_permission_de_lecture(user, "comptes.view_activite"),
        "can_actions_admin": _a_le_permission_de_lecture(user, "admin.view_logentry"),
    }
    stats = {}
    donnees = {}
    usage = {
        date_debut_usage + timedelta(days=i): {
            "label": (date_debut_usage + timedelta(days=i)).strftime("%d/%m"),
            "inscriptions": 0,
            "publications": 0,
            "messages": 0,
            "actifs": 0,
        }
        for i in range(7)
    }

    if permissions["can_comptes"]:
        for ligne in (
            User.objects.filter(
                is_staff=False, date_inscription__gte=debut_usage, date_inscription__lte=now
            )
            .annotate(jour=TruncDate("date_inscription"))
            .values("jour")
            .annotate(total=Count("pk"))
        ):
            if ligne["jour"] in usage:
                usage[ligne["jour"]]["inscriptions"] = ligne["total"]
        valides = User.objects.filter(valide=True, is_active=True)
        stats.update({
            "attente": User.objects.filter(email_verifie=False, is_active=True).count(),
            "membres": valides.count(),
            "inscriptions_24h": User.objects.filter(date_inscription__gte=debut_jour).count(),
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
        inscrits = User.objects.filter(date_inscription__gte=debut_inscriptions)
        comptes_avec_profil = Profil.objects.filter(user__in=inscrits)
        debuts_parcours = ParcoursBrouillon.objects.filter(
            profil__in=comptes_avec_profil,
            modifie_le__gte=debut_inscriptions,
        )
        donnees["entonnoir_inscription"] = {
            "periode": 30,
            "crees": inscrits.count(),
            "emails_verifies": inscrits.filter(email_verifie=True).count(),
            "parcours_commences": debuts_parcours.count(),
            "parcours_termines": comptes_avec_profil.filter(onboarding_termine=True).count(),
        }
        actions = []
        if stats["attente"]:
            actions.append({
                "titre": f"{stats['attente']} adresse(s) e-mail à vérifier",
                "href": f"{_url_admin('comptes_user_changelist')}?email_verifie__exact=0&is_active__exact=1",
                "urgence": True,
            })
        donnees["actions_prioritaires"] = actions

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
        stats["signalements_24h"] = Signalement.objects.filter(
            cree_le__gte=debut_jour
        ).count()
        if stats["signalements"]:
            donnees.setdefault("actions_prioritaires", []).append({
                "titre": f"{stats['signalements']} signalement(s) à traiter",
                "href": f"{_url_admin('signalements_signalement_changelist')}?traitement=ouvert",
                "urgence": True,
            })

    if permissions["can_suspensions"]:
        stats["suspendus"] = Suspension.objects.filter(active=True).filter(
            Q(definitive=True) | Q(fin__gt=now)).count()

    if permissions["can_publications"]:
        for ligne in (
            Publication.objects.filter(
                statut="publie", publie_le__gte=debut_usage, publie_le__lte=now
            )
            .annotate(jour=TruncDate("publie_le"))
            .values("jour")
            .annotate(total=Count("pk"))
        ):
            if ligne["jour"] in usage:
                usage[ligne["jour"]]["publications"] = ligne["total"]
        stats["publications_7j"] = Publication.objects.filter(
            statut="publie", cree_le__gte=now - timedelta(days=7)).count()
        stats["publications_24h"] = Publication.objects.filter(
            statut="publie", cree_le__gte=debut_jour).count()

    if permissions["can_messages"]:
        for ligne in (
            Message.objects.filter(cree_le__gte=debut_usage, cree_le__lte=now)
            .annotate(jour=TruncDate("cree_le"))
            .values("jour")
            .annotate(total=Count("pk"))
        ):
            if ligne["jour"] in usage:
                usage[ligne["jour"]]["messages"] = ligne["total"]
        stats["messages_24h"] = Message.objects.filter(cree_le__gte=debut_jour).count()

    if permissions["can_activite"] or permissions["can_messages"]:
        actifs_par_jour = {jour: set() for jour in usage}
        if permissions["can_activite"]:
            activites = Activite.objects.filter(
                cree_le__gte=debut_usage,
                cree_le__lte=now,
                user__isnull=False,
                user__is_staff=False,
            )
            for ligne in (
                activites.annotate(jour=TruncDate("cree_le"))
                .values("jour", "user_id")
                .distinct()
            ):
                if ligne["jour"] in actifs_par_jour:
                    actifs_par_jour[ligne["jour"]].add(ligne["user_id"])
        if permissions["can_messages"]:
            for ligne in (
                Message.objects.filter(
                    cree_le__gte=debut_usage,
                    cree_le__lte=now,
                    auteur__is_staff=False,
                )
                .annotate(jour=TruncDate("cree_le"))
                .values("jour", "auteur_id")
                .distinct()
            ):
                if ligne["jour"] in actifs_par_jour:
                    actifs_par_jour[ligne["jour"]].add(ligne["auteur_id"])
        for jour, utilisateurs in actifs_par_jour.items():
            usage[jour]["actifs"] = len(utilisateurs)
        stats["actifs_7j"] = len(set().union(*actifs_par_jour.values()))

    if permissions["can_comptes"] and permissions["can_invites"]:
        aujourd_hui = timezone.localdate()
        try:
            date_majorite = aujourd_hui.replace(year=aujourd_hui.year - 18)
        except ValueError:
            date_majorite = aujourd_hui.replace(year=aujourd_hui.year - 18, day=28)
        alertes = (
            InvitationDiscussion.objects.filter(
                cree_le__gte=now - timedelta(days=7),
                statut__in=["attente", "acceptee"],
                demandeur__statut="ancien",
                demandeur__profil__date_anniversaire__lte=date_majorite,
                destinataire__statut="eleve",
                destinataire__profil__date_anniversaire__gt=date_majorite,
            )
            .values(
                "demandeur_id",
                "demandeur__prenom",
                "demandeur__nom",
                "demandeur__email",
            )
            .annotate(total=Count("pk"))
            .filter(total__gte=SEUIL_INVITATIONS_MINEURS)
            .order_by("-total", "demandeur__nom", "demandeur__prenom")[:5]
        )
        donnees["alertes_adultes_mineurs"] = [
            {
                "nom": f"{alerte['demandeur__prenom']} {alerte['demandeur__nom']}",
                "total": alerte["total"],
                "href": (
                    f"{_url_admin('comptes_user_changelist')}?"
                    f"q={alerte['demandeur__email']}"
                ),
            }
            for alerte in alertes
        ]
        stats["alertes_adultes_mineurs"] = len(donnees["alertes_adultes_mineurs"])

    donnees["usage_7j"] = list(usage.values())

    if permissions["can_actions_admin"]:
        donnees["dernieres_actions"] = LogEntry.objects.select_related(
            "user", "content_type").order_by("-action_time")[:8]

    if permissions["can_activite"]:
        donnees["activite"] = Activite.objects.select_related("user")[:8]
        donnees["connexions_24h"] = Activite.objects.filter(
            action="connexion", cree_le__gte=now - timedelta(hours=24)).count()
        stats["connexions_24h"] = donnees["connexions_24h"]

    context.update(permissions)
    context.update(donnees)
    context["stats"] = stats
    return context


def _url_admin(route):
    from django.urls import reverse

    return reverse(f"admin:{route}")
