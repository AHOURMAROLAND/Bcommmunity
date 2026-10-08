from datetime import timedelta

from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.db.models import Exists, OuterRef, Q
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html
from unfold.admin import ModelAdmin, StackedInline, TabularInline
from unfold.decorators import display
from unfold.forms import AdminPasswordChangeForm
from unfold.forms import UserChangeForm as BaseUserChangeForm
from unfold.forms import UserCreationForm as BaseUserCreationForm

from profils.models import Profil

from . import moderation
from .models import Activite, Suspension, User

# --- Groupes : même style que le reste de l'interface ---
admin.site.unregister(Group)


@admin.register(Group)
class GroupAdmin(BaseGroupAdmin, ModelAdmin):
    pass


# --- Formulaires ---
class UserChangeForm(BaseUserChangeForm):
    class Meta:
        model = User
        fields = "__all__"


class UserCreationForm(BaseUserCreationForm):
    class Meta:
        model = User
        fields = ("email", "prenom", "nom", "statut")


# --- Blocs intégrés à la fiche d'un membre ---
class SuspensionInline(TabularInline):
    model = Suspension
    fk_name = "user"
    extra = 0
    readonly_fields = ("debut", "cree_par")


class ProfilInline(StackedInline):
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
class UserAdmin(BaseUserAdmin, ModelAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm
    ordering = ("-date_inscription",)
    list_display = ("email", "prenom", "nom", "statut", "etat", "email_verifie", "date_inscription", "journal")
    list_filter = ("valide", "statut", "is_active", "email_verifie", "is_staff")
    search_fields = ("email", "prenom", "nom")
    date_hierarchy = "date_inscription"
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

    def get_queryset(self, request):
        # Un seul calcul SQL pour toute la liste (pas une requête par ligne)
        actives = Suspension.objects.filter(user=OuterRef("pk"), active=True).filter(
            Q(definitive=True) | Q(fin__gt=timezone.now()))
        return super().get_queryset(request).annotate(
            _banni=Exists(actives.filter(definitive=True)),
            _suspendu=Exists(actives.filter(definitive=False)))

    @display(description="État", label={
        "Actif": "success", "En attente": "warning", "Suspendu": "danger", "Banni": "danger"})
    def etat(self, u):
        if not u.valide:
            return "En attente"
        if u._banni:
            return "Banni"
        if u._suspendu:
            return "Suspendu"
        return "Actif"

    @display(description="Activité")
    def journal(self, u):
        return format_html('<a href="{}?q={}">Voir</a>', reverse("admin:comptes_activite_changelist"), u.email)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f"blocage:{obj.pk}")

    @admin.action(description="Valider les comptes sélectionnés")
    def valider(self, request, queryset):
        ids = list(queryset.values_list("pk", flat=True))
        n = queryset.update(valide=True, email_verifie=True)
        for pk in ids:
            cache.delete(f"blocage:{pk}")
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
class SuspensionAdmin(ModelAdmin):
    list_display = ("user", "motif", "debut", "fin", "definitive", "etat")
    list_filter = ("active", "definitive")
    search_fields = ("user__email", "user__nom", "motif")
    raw_id_fields = ("user",)
    readonly_fields = ("debut", "cree_par")
    list_select_related = ("user",)
    actions = ["lever", "prolonger_7j"]

    @display(description="État", label={"En cours": "danger", "Terminée": "success"})
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
        # Uniquement les lignes cochées (et non toutes celles des membres concernés)
        membres = set(queryset.values_list("user_id", flat=True))
        n = queryset.filter(active=True).update(active=False)
        for uid in membres:
            cache.delete(f"blocage:{uid}")
        self.message_user(request, f"{n} suspension(s) levée(s).")

    @admin.action(description="Prolonger de 7 jours")
    def prolonger_7j(self, request, queryset):
        for s in queryset.filter(definitive=False):
            s.fin = max(s.fin or timezone.now(), timezone.now()) + timedelta(days=7)
            s.active = True
            s.save(update_fields=["fin", "active"])


@admin.register(Activite)
class ActiviteAdmin(ModelAdmin):
    list_display = ("cree_le", "user", "type_action", "detail", "ip")
    list_filter = ("action", "cree_le")
    search_fields = ("user__email", "user__nom", "user__prenom", "detail", "ip")
    date_hierarchy = "cree_le"
    list_select_related = ("user",)
    list_per_page = 50

    @display(description="Action", label={
        "Connexion": "success", "Inscription": "info", "Publication créée": "info", "Commentaire": "info",
        "Signalement envoyé": "warning", "Suspension / bannissement": "danger", "Mot de passe modifié": "warning"})
    def type_action(self, a):
        return a.get_action_display()

    # Journal en lecture seule ; seul un superutilisateur peut supprimer (nécessaire pour supprimer un compte).
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser
