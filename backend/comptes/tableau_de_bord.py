from datetime import datetime, timedelta
from datetime import timezone as dt_tz

from django.contrib.admin.models import LogEntry
from django.db.models import Count, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone

from publications.models import Publication
from signalements.models import Signalement

from .models import Activite, Suspension, User

MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
        "juil.", "août", "sept.", "oct.", "nov.", "déc."]


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
    valides = User.objects.filter(valide=True, is_active=True)

    # --- Cartes ---
    suspendus = (Suspension.objects.filter(active=True)
                 .filter(Q(definitive=True) | Q(fin__gt=now)).values("user").distinct().count())
    stats = {
        "attente": User.objects.filter(valide=False, is_active=True).count(),
        "signalements": Signalement.objects.filter(statut__in=["nouveau", "en_cours"]).count(),
        "membres": valides.count(),
        "suspendus": suspendus,
        "publications_7j": Publication.objects.filter(
            statut="publie", cree_le__gte=now - timedelta(days=7)).count(),
    }

    # --- Inscriptions par mois (6 derniers mois) ---
    periode = _six_derniers_mois(now)
    debut = datetime(periode[0][0], periode[0][1], 1, tzinfo=dt_tz.utc)
    comptes = {(d["m"].year, d["m"].month): d["n"] for d in
               User.objects.filter(date_inscription__gte=debut)
               .annotate(m=TruncMonth("date_inscription")).values("m").annotate(n=Count("id"))}
    valeurs = [comptes.get(p, 0) for p in periode]
    maxi = max(valeurs) or 1
    inscriptions = [{"label": MOIS[m - 1], "n": n, "pct": max(round(100 * n / maxi), 4 if n else 0)}
                    for (a, m), n in zip(periode, valeurs)]

    # --- Répartition élèves / anciens ---
    eleves = valides.filter(statut="eleve").count()
    anciens = valides.filter(statut="ancien").count()
    total = eleves + anciens
    repartition = {"eleves": eleves, "anciens": anciens,
                   "pct_eleves": round(100 * eleves / total) if total else 0}

    context.update({
        "stats": stats,
        "inscriptions": inscriptions,
        "inscriptions_total": sum(valeurs),
        "repartition": repartition,
        "en_attente": User.objects.filter(valide=False, is_active=True).order_by("-date_inscription")[:5],
        "derniers_signalements": (Signalement.objects.filter(statut="nouveau")
                                  .select_related("auteur").order_by("-cree_le")[:5]),
        "dernieres_actions": LogEntry.objects.select_related("user", "content_type")[:8],
        "activite": Activite.objects.select_related("user")[:8],
        "connexions_24h": Activite.objects.filter(
            action="connexion", cree_le__gte=now - timedelta(hours=24)).count(),
    })
    return context
