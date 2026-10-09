from django.contrib import admin
from django.db.models import Q
from django.shortcuts import render
from django.urls import reverse

from publications.models import Publication
from signalements.models import Signalement

from .models import User


def _peut_consulter(request, model):
    permission = f"{model._meta.app_label}.view_{model._meta.model_name}"
    modification = f"{model._meta.app_label}.change_{model._meta.model_name}"
    return request.user.has_perm(permission) or request.user.has_perm(modification)


def rechercher_globale(request):
    terme = request.GET.get("q", "").strip()[:100]
    resultats = []
    if len(terme) >= 2:
        if _peut_consulter(request, User):
            membres = User.objects.filter(
                Q(email__icontains=terme)
                | Q(prenom__icontains=terme)
                | Q(nom__icontains=terme)
            )
            if terme.isdecimal() and len(terme) <= 18:
                membres = membres | User.objects.filter(pk=int(terme))
            resultats.extend(
                {
                    "type": "Compte",
                    "titre": f"{user.prenom} {user.nom}",
                    "detail": user.email,
                    "url": reverse("admin:comptes_user_change", args=[user.pk]),
                }
                for user in membres.order_by("-date_inscription")[:10]
            )
        if _peut_consulter(request, Publication):
            publications = Publication.objects.filter(
                Q(titre__icontains=terme)
                | Q(extrait__icontains=terme)
                | Q(auteur__email__icontains=terme)
                | Q(auteur__prenom__icontains=terme)
                | Q(auteur__nom__icontains=terme)
            )
            if terme.isdecimal() and len(terme) <= 18:
                publications = publications | Publication.objects.filter(pk=int(terme))
            resultats.extend(
                {
                    "type": "Publication",
                    "titre": publication.titre,
                    "detail": f"{publication.auteur} · {publication.get_statut_display()}",
                    "url": reverse("admin:publications_publication_change", args=[publication.pk]),
                }
                for publication in publications.select_related("auteur").order_by("-cree_le")[:10]
            )
        if _peut_consulter(request, Signalement):
            signalements = Signalement.objects.filter(
                Q(commentaire__icontains=terme)
                | Q(auteur__email__icontains=terme)
                | Q(utilisateur_cible__email__icontains=terme)
                | Q(decision__icontains=terme)
            )
            if terme.isdecimal() and len(terme) <= 18:
                signalements = signalements | Signalement.objects.filter(pk=int(terme))
            resultats.extend(
                {
                    "type": "Signalement",
                    "titre": f"#{signalement.pk} · {signalement.get_motif_display()}",
                    "detail": f"{signalement.get_statut_display()} · {signalement.cree_le:%d/%m/%Y}",
                    "url": reverse("admin:signalements_signalement_change", args=[signalement.pk]),
                }
                for signalement in signalements.order_by("-cree_le")[:10]
            )
    return render(
        request,
        "admin/recherche_globale.html",
        {
            **admin.site.each_context(request),
            "titre": "Recherche globale",
            "terme": terme,
            "resultats": resultats,
        },
    )
