import csv
from datetime import timedelta
from urllib.parse import urlencode

from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.db.models import Exists, OuterRef, Q
from django.http import HttpResponse
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
from .models import Activite, BadgeUtilisateur, NoteInterne, Suspension, User

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


class BadgeUtilisateurInline(TabularInline):
    model = BadgeUtilisateur
    fk_name = "user"
    extra = 0
    fields = ("type", "attribue_par", "attribue_le")
    readonly_fields = ("attribue_par", "attribue_le")


class NoteInterneInline(TabularInline):
    model = NoteInterne
    fk_name = "user"
    extra = 0
    fields = ("texte", "auteur", "cree_le")
    readonly_fields = ("auteur", "cree_le")


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
    list_display = (
        "email", "prenom", "nom", "statut", "etat", "email_verifie", "lecture_seule",
        "date_inscription", "journal",
    )
    list_filter = ("valide", "statut", "is_active", "email_verifie", "is_staff", "lecture_seule")
    search_fields = ("email", "prenom", "nom")
    date_hierarchy = "date_inscription"
    inlines = [ProfilInline, SuspensionInline, BadgeUtilisateurInline, NoteInterneInline]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Identité", {"fields": ("prenom", "nom", "statut")}),
        ("Accès", {"fields": ("email_verifie", "is_active", "is_staff",
                              "lecture_seule", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": (
        "email", "prenom", "nom", "statut", "password1", "password2")}),)
    actions = [
        "exporter_csv", "suspendre_24h", "suspendre_7j", "suspendre_30j", "bannir",
        "lever_suspensions",
    ]

    @admin.action(description="Exporter les comptes sélectionnés en CSV")
    def exporter_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="comptes-bakhita.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow([
            "id", "email", "prenom", "nom", "statut", "email_verifie", "valide",
            "actif", "date_inscription",
        ])
        for user in queryset.order_by("pk").iterator():
            writer.writerow([
                user.pk,
                user.email,
                user.prenom,
                user.nom,
                user.statut,
                user.email_verifie,
                user.valide,
                user.is_active,
                user.date_inscription.isoformat(),
            ])
        return response

    def get_queryset(self, request):
        # Un seul calcul SQL pour toute la liste (pas une requête par ligne)
        actives = Suspension.objects.filter(user=OuterRef("pk"), active=True).filter(
            Q(definitive=True) | Q(fin__gt=timezone.now()))
        return super().get_queryset(request).annotate(
            _banni=Exists(actives.filter(definitive=True)),
            _suspendu=Exists(actives.filter(definitive=False)))

    @display(description="État", label={
        "Actif": "success", "Désactivé": "danger", "En attente": "warning",
        "Suspendu": "danger", "Banni": "danger"})
    def etat(self, u):
        if not u.is_active:
            return "Désactivé"
        if not u.valide:
            return "En attente"
        if u._banni:
            return "Banni"
        if u._suspendu:
            return "Suspendu"
        return "Actif"

    @display(description="Activité")
    def journal(self, u):
        query = urlencode({"q": u.email})
        return format_html('<a href="{}?{}">Voir</a>', reverse("admin:comptes_activite_changelist"), query)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f"blocage:{obj.pk}")

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for instance in formset.deleted_objects:
            instance.delete()
        for instance in instances:
            if isinstance(instance, BadgeUtilisateur):
                instance.attribue_par = request.user
            elif isinstance(instance, NoteInterne):
                instance.auteur = request.user
            instance.save()
        formset.save_m2m()

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


class SuspensionEtatFilter(admin.SimpleListFilter):
    title = "État"
    parameter_name = "etat"

    def lookups(self, request, model_admin):
        return (("en_cours", "En cours"), ("terminee", "Terminée"))

    def queryset(self, request, queryset):
        maintenant = timezone.now()
        en_cours = Q(active=True) & (Q(definitive=True) | Q(fin__gt=maintenant))
        if self.value() == "en_cours":
            return queryset.filter(en_cours)
        if self.value() == "terminee":
            return queryset.exclude(en_cours)
        return queryset


@admin.register(Suspension)
class SuspensionAdmin(ModelAdmin):
    list_display = ("user", "motif", "debut", "fin", "definitive", "etat")
    list_filter = ("active", "definitive", SuspensionEtatFilter)
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
        n = moderation.lever_suspensions(queryset)
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
