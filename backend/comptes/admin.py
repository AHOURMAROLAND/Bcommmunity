from datetime import timedelta

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils import timezone

from .models import Suspension, User


class SuspensionInline(admin.TabularInline):
    model = Suspension
    fk_name = "user"
    extra = 0
    readonly_fields = ("debut", "cree_par")


def _suspendre(modeladmin, request, queryset, jours):
    fin = timezone.now() + timedelta(days=jours)
    Suspension.objects.bulk_create([
        Suspension(user=u, motif="Décision de l'administrateur", fin=fin, cree_par=request.user)
        for u in queryset.exclude(pk=request.user.pk)])
    modeladmin.message_user(request, f"{queryset.count()} compte(s) suspendu(s) {jours} jour(s).")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("-date_inscription",)
    list_display = ("email", "prenom", "nom", "statut", "valide", "is_active", "date_inscription")
    list_filter = ("valide", "statut", "is_active")
    search_fields = ("email", "prenom", "nom")
    inlines = [SuspensionInline]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Identité", {"fields": ("prenom", "nom", "statut")}),
        ("Accès", {"fields": ("valide", "email_verifie", "is_active", "is_staff",
                              "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": (
        "email", "prenom", "nom", "statut", "password1", "password2")}),)
    actions = ["valider", "suspendre_24h", "suspendre_7j", "suspendre_30j", "bannir", "lever_suspensions"]

    @admin.action(description="Valider les comptes sélectionnés")
    def valider(self, request, queryset):
        n = queryset.update(valide=True)
        self.message_user(request, f"{n} compte(s) validé(s).")

    @admin.action(description="Suspendre 24 heures")
    def suspendre_24h(self, request, queryset):
        _suspendre(self, request, queryset, 1)

    @admin.action(description="Suspendre 7 jours")
    def suspendre_7j(self, request, queryset):
        _suspendre(self, request, queryset, 7)

    @admin.action(description="Suspendre 30 jours")
    def suspendre_30j(self, request, queryset):
        _suspendre(self, request, queryset, 30)

    @admin.action(description="Bannir définitivement")
    def bannir(self, request, queryset):
        Suspension.objects.bulk_create([
            Suspension(user=u, motif="Bannissement", definitive=True, cree_par=request.user)
            for u in queryset.exclude(pk=request.user.pk)])
        self.message_user(request, "Comptes bannis.")

    @admin.action(description="Lever toutes les suspensions")
    def lever_suspensions(self, request, queryset):
        Suspension.objects.filter(user__in=queryset, active=True).update(active=False)
        self.message_user(request, "Suspensions levées.")
