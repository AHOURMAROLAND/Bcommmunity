from django.contrib import admin
from django.db import transaction
from django.db.models.functions import ExtractDay, ExtractMonth
from django.utils import timezone
from unfold.admin import ModelAdmin, StackedInline, TabularInline

from notifications.services import lancer
from scolarite.models import Scolarite

from .models import CadeauAnniversaire, Domaine, Profil, SituationActuelle
from .taches import envoyer_cadeau_anniversaire


class AnniversaireAujourdhuiFilter(admin.SimpleListFilter):
    title = "Anniversaire"
    parameter_name = "anniversaire"

    def lookups(self, request, model_admin):
        return (("aujourdhui", "Aujourd’hui"),)

    def queryset(self, request, queryset):
        if self.value() == "aujourdhui":
            aujourd_hui = timezone.localdate()
            return queryset.annotate(
                mois_anniversaire=ExtractMonth("date_anniversaire"),
                jour_anniversaire=ExtractDay("date_anniversaire"),
            ).filter(mois_anniversaire=aujourd_hui.month, jour_anniversaire=aujourd_hui.day)
        return queryset


@admin.register(Domaine)
class DomaineAdmin(ModelAdmin):
    search_fields = ("nom",)


class SituationInline(StackedInline):
    model = SituationActuelle
    can_delete = False
    extra = 0


class ScolariteInline(TabularInline):
    model = Scolarite
    extra = 0


@admin.register(Profil)
class ProfilAdmin(ModelAdmin):
    list_display = ("user", "annee_sortie", "date_anniversaire", "ville", "whatsapp", "whatsapp_visibilite", "onboarding_termine")
    list_filter = ("onboarding_termine", AnniversaireAujourdhuiFilter)
    search_fields = ("user__email", "user__nom", "user__prenom", "ville")
    raw_id_fields = ("user",)
    list_select_related = ("user",)
    inlines = [SituationInline, ScolariteInline]


@admin.register(CadeauAnniversaire)
class CadeauAnniversaireAdmin(ModelAdmin):
    list_display = ("profil", "code_bon", "administrateur", "cree_le")
    list_select_related = ("profil__user", "administrateur")
    search_fields = ("profil__user__email", "profil__user__prenom", "profil__user__nom", "code_bon")
    readonly_fields = ("administrateur", "cree_le")

    def save_model(self, request, obj, form, change):
        obj.administrateur = request.user
        super().save_model(request, obj, form, change)
        if not change:
            transaction.on_commit(lambda: lancer(envoyer_cadeau_anniversaire, obj.pk))
