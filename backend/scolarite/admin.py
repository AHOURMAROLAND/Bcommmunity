from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Classe, Cycle, Filiere, ParcoursBrouillon, Scolarite


@admin.register(Cycle)
class CycleAdmin(ModelAdmin):
    list_display = ("nom", "ordre")
    ordering = ("ordre",)


@admin.register(Classe)
class ClasseAdmin(ModelAdmin):
    list_display = ("nom", "filiere_ref", "filiere", "cycle", "ordre")
    list_filter = ("cycle",)
    search_fields = ("nom", "filiere", "filiere_ref__nom")
    ordering = ("cycle__ordre", "ordre")
    list_select_related = ("cycle",)


@admin.register(Filiere)
class FiliereAdmin(admin.ModelAdmin):
    list_display = ("nom", "type_lycee", "active", "ordre")
    list_filter = ("type_lycee", "active")
    search_fields = ("nom",)
    ordering = ("type_lycee", "ordre", "nom")


@admin.register(ParcoursBrouillon)
class ParcoursBrouillonAdmin(admin.ModelAdmin):
    list_display = ("profil", "etape", "modifie_le")
    search_fields = ("profil__user__email", "profil__user__nom")
    readonly_fields = ("modifie_le",)


@admin.register(Scolarite)
class ScolariteAdmin(ModelAdmin):
    list_display = ("profil", "classe", "annee_debut", "annee_fin")
    list_filter = ("classe__cycle", "classe")
    search_fields = ("profil__user__email", "profil__user__nom", "profil__user__prenom")
    raw_id_fields = ("profil",)
    list_select_related = ("profil__user", "classe")
