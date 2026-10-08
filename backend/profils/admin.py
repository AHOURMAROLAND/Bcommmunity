from django.contrib import admin
from unfold.admin import ModelAdmin, StackedInline, TabularInline

from scolarite.models import Scolarite

from .models import Domaine, Profil, SituationActuelle


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
    list_display = ("user", "annee_sortie", "ville", "whatsapp", "whatsapp_visibilite", "onboarding_termine")
    list_filter = ("onboarding_termine",)
    search_fields = ("user__email", "user__nom", "user__prenom", "ville")
    raw_id_fields = ("user",)
    list_select_related = ("user",)
    inlines = [SituationInline, ScolariteInline]
