from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Classe, Cycle, Scolarite


@admin.register(Cycle)
class CycleAdmin(ModelAdmin):
    list_display = ("nom", "ordre")
    ordering = ("ordre",)


@admin.register(Classe)
class ClasseAdmin(ModelAdmin):
    list_display = ("nom", "filiere", "cycle", "ordre")
    list_filter = ("cycle",)
    search_fields = ("nom", "filiere")
    ordering = ("cycle__ordre", "ordre")
    list_select_related = ("cycle",)


@admin.register(Scolarite)
class ScolariteAdmin(ModelAdmin):
    list_display = ("profil", "classe", "annee_debut", "annee_fin")
    list_filter = ("classe__cycle", "classe")
    search_fields = ("profil__user__email", "profil__user__nom", "profil__user__prenom")
    raw_id_fields = ("profil",)
    list_select_related = ("profil__user", "classe")
