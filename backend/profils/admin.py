from django.contrib import admin

from .models import Domaine, Profil

admin.site.register(Domaine)


@admin.register(Profil)
class ProfilAdmin(admin.ModelAdmin):
    list_display = ("user", "annee_sortie", "ville", "onboarding_termine")
    search_fields = ("user__email", "user__nom", "user__prenom")
    raw_id_fields = ("user",)
