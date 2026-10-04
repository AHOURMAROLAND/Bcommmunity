from django.contrib import admin

from .models import Classe, Cycle, Scolarite


@admin.register(Cycle)
class CycleAdmin(admin.ModelAdmin):
    list_display = ("nom", "ordre")
    ordering = ("ordre",)


@admin.register(Classe)
class ClasseAdmin(admin.ModelAdmin):
    list_display = ("nom", "filiere", "cycle", "ordre")
    list_filter = ("cycle",)
    search_fields = ("nom", "filiere")
    ordering = ("cycle__ordre", "ordre")


@admin.register(Scolarite)
class ScolariteAdmin(admin.ModelAdmin):
    list_display = ("profil", "classe", "annee_debut", "annee_fin")
    list_filter = ("classe__cycle", "classe")
    search_fields = ("profil__user__email", "profil__user__nom", "profil__user__prenom")
    raw_id_fields = ("profil",)
