from datetime import timedelta

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import ReadOnlyPasswordHashField
from django.core.cache import cache
from django.utils import timezone

from profils.models import Profil

from . import moderation
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
    n = 0
    for u in queryset.exclude(pk=request.user.pk).exclude(is_staff=True):
        moderation.suspendre(u, "Décision de l'administrateur", request.user, jours=jours)
        n += 1
    modeladmin.message_user(request, f"{n} compte(s) suspendu(s) {jours} jour(s).")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    ordering = ("-date_inscription",)
    list_display = ("email", "prenom", "nom", "statut", "email_verifie", "is_active", "date_inscription")
    list_filter = ("email_verifie", "statut", "is_active")
    search_fields = ("email", "prenom", "nom")
    inlines = [ProfilInline, SuspensionInline]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Identité", {"fields": ("prenom", "nom", "statut")}),
        ("Accès", {"fields": ("email_verifie", "is_active", "is_staff",
                              "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": (
        "email", "prenom", "nom", "statut", "password1", "password2")}),)
    actions = ["suspendre_24h", "suspendre_7j", "suspendre_30j", "bannir", "lever_suspensions"]

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f"blocage:{obj.pk}")

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
        n = 0
        for u in queryset.exclude(pk=request.user.pk).exclude(is_staff=True):
            moderation.suspendre(u, "Bannissement", request.user, definitive=True)
            n += 1
        self.message_user(request, f"{n} compte(s) banni(s).")

    @admin.action(description="Lever toutes les suspensions")
    def lever_suspensions(self, request, queryset):
        n = moderation.lever(queryset.values_list("pk", flat=True))
        self.message_user(request, f"{n} suspension(s) levée(s).")


@admin.register(Suspension)
class SuspensionAdmin(admin.ModelAdmin):
    list_display = ("user", "motif", "debut", "fin", "definitive", "etat")
    list_filter = ("active", "definitive")
    search_fields = ("user__email", "user__nom", "motif")
    raw_id_fields = ("user",)
    readonly_fields = ("debut", "cree_par")
    actions = ["lever", "prolonger_7j"]

    @admin.display(description="État")
    def etat(self, s):
        ok = s.active and (s.definitive or (s.fin and s.fin > timezone.now()))
        return "En cours" if ok else "Terminée"

    def save_model(self, request, obj, form, change):
        obj.cree_par = obj.cree_par or request.user
        super().save_model(request, obj, form, change)
        if not change:
            moderation.appliquer_effets(obj)

    @admin.action(description="Lever les suspensions sélectionnées")
    def lever(self, request, queryset):
        n = moderation.lever(set(queryset.values_list("user_id", flat=True)))
        self.message_user(request, f"{n} suspension(s) levée(s).")

    @admin.action(description="Prolonger de 7 jours")
    def prolonger_7j(self, request, queryset):
        for s in queryset.filter(definitive=False):
            s.fin = max(s.fin or timezone.now(), timezone.now()) + timedelta(days=7)
            s.active = True
            s.save(update_fields=["fin", "active"])
