from datetime import timedelta

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import ReadOnlyPasswordHashField
from django.core.cache import cache
from django.utils import timezone

from profils.models import Profil
from .models import Suspension, User


class UserChangeForm(forms.ModelForm):
    password = ReadOnlyPasswordHashField(
        label="Mot de passe",
        help_text=(
            "Les mots de passe bruts ne sont pas stockés. "
            "Pour modifier le mot de passe, utilisez <a href=\"../password/\">ce formulaire</a>."
        ),
    )

    class Meta:
        model = User
        fields = "__all__"


class UserCreationForm(forms.ModelForm):
    password1 = forms.CharField(label="Mot de passe", widget=forms.PasswordInput)
    password2 = forms.CharField(label="Confirmation du mot de passe", widget=forms.PasswordInput)

    class Meta:
        model = User
        fields = ("email", "prenom", "nom", "statut")

    def clean_password2(self):
        p1 = self.cleaned_data.get("password1")
        p2 = self.cleaned_data.get("password2")
        if p1 and p2 and p1 != p2:
            raise forms.ValidationError("Les deux mots de passe ne correspondent pas.")
        return p2

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        if commit:
            user.save()
        return user


class SuspensionInline(admin.TabularInline):
    model = Suspension
    fk_name = "user"
    extra = 0
    readonly_fields = ("debut", "cree_par")


class ProfilInline(admin.StackedInline):
    model = Profil
    can_delete = False
    extra = 0


def _suspendre(modeladmin, request, queryset, jours):
    fin = timezone.now() + timedelta(days=jours)
    Suspension.objects.bulk_create([
        Suspension(user=u, motif="Décision de l'administrateur", fin=fin, cree_par=request.user)
        for u in queryset.exclude(pk=request.user.pk)])
    for u in queryset:
        cache.delete(f"blocage:{u.pk}")
    modeladmin.message_user(request, f"{queryset.count()} compte(s) suspendu(s) {jours} jour(s).")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    ordering = ("-date_inscription",)
    list_display = ("email", "prenom", "nom", "statut", "valide", "email_verifie", "is_active", "date_inscription")
    list_filter = ("valide", "statut", "is_active")
    search_fields = ("email", "prenom", "nom")
    inlines = [ProfilInline, SuspensionInline]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Identité", {"fields": ("prenom", "nom", "statut")}),
        ("Accès", {"fields": ("valide", "email_verifie", "is_active", "is_staff",
                              "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": (
        "email", "prenom", "nom", "statut", "password1", "password2")}),)
    actions = ["valider", "suspendre_24h", "suspendre_7j", "suspendre_30j", "bannir", "lever_suspensions"]

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f"blocage:{obj.pk}")

    @admin.action(description="Valider les comptes sélectionnés")
    def valider(self, request, queryset):
        n = queryset.update(valide=True, email_verifie=True)
        for u in queryset:
            cache.delete(f"blocage:{u.pk}")
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
