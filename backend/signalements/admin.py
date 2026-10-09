from django.contrib import admin, messages
from django.db import transaction
from django.db.models import Q
from django.shortcuts import redirect
from django.utils import timezone
from django.utils.html import format_html, format_html_join
from unfold.admin import ModelAdmin
from unfold.decorators import display

from comptes import moderation
from comptes.moderation import MOTIFS_PUBLICS
from publications.models import Publication

from .models import ConfigurationSupport, MessageSupport, PieceJointeSignalement, Signalement

OUVERTS = ["nouveau", "en_cours"]


class PieceJointeInline(admin.TabularInline):
    model = PieceJointeSignalement
    extra = 0
    fields = ("fichier", "type_contenu", "cree_le")
    readonly_fields = fields
    can_delete = False


class MessageSupportInline(admin.TabularInline):
    model = MessageSupport
    extra = 1
    fields = ("texte", "cree_le")
    readonly_fields = ("cree_le",)


class SignalementTraitementFilter(admin.SimpleListFilter):
    title = "Traitement"
    parameter_name = "traitement"

    def lookups(self, request, model_admin):
        return (("ouvert", "Nouveau et en cours"),)

    def queryset(self, request, queryset):
        if self.value() == "ouvert":
            return queryset.filter(statut__in=OUVERTS)
        return queryset


@admin.register(Signalement)
class SignalementAdmin(ModelAdmin):
    list_display = ("id", "type_cible", "cible", "motif", "etat", "nb_sur_cible", "auteur", "cree_le")
    list_filter = ("statut", SignalementTraitementFilter, "type_cible", "motif")
    list_select_related = ("auteur", "utilisateur_cible", "publication_cible", "traite_par")
    date_hierarchy = "cree_le"
    search_fields = ("auteur__email", "utilisateur_cible__email", "publication_cible__titre", "commentaire")
    fields = ("statut", "decision", "type_cible", "cible", "motif", "commentaire", "auteur", "cree_le",
              "traite_par", "traite_le", "apercu", "contexte", "adresse_ip")
    readonly_fields = ("type_cible", "cible", "motif", "commentaire", "auteur", "cree_le", "traite_par",
                       "traite_le", "apercu", "contexte", "adresse_ip")
    inlines = (PieceJointeInline, MessageSupportInline)
    actions = ["en_cours", "ignorer", "masquer_publication", "supprimer_publication", "avertir",
               "suspendre_24h", "suspendre_7j", "suspendre_30j", "bannir"]

    def has_add_permission(self, request):
        return False

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for instance in formset.deleted_objects:
            instance.delete()
        for instance in instances:
            nouveau = instance.pk is None
            if isinstance(instance, MessageSupport) and nouveau:
                instance.expediteur = request.user
            instance.save()
            if isinstance(instance, MessageSupport) and nouveau:
                from notifications.services import lancer

                from .taches import notifier_reponse_support
                transaction.on_commit(lambda pk=instance.pk: lancer(notifier_reponse_support, pk))
        formset.save_m2m()

    def get_inline_instances(self, request, obj=None):
        instances = super().get_inline_instances(request, obj)
        if obj and obj.type_cible != "retour":
            instances = [inline for inline in instances if not isinstance(inline, MessageSupportInline)]
        return instances

    def changelist_view(self, request, extra_context=None):
        if not request.GET:  # par défaut : seulement ce qui attend une décision
            return redirect(f"{request.path}?statut__exact=nouveau")
        return super().changelist_view(request, extra_context)

    # --- affichage ---
    @display(description="Statut", label={
        "Nouveau": "danger", "En cours": "warning", "Traité": "success", "Ignoré": "info"})
    def etat(self, s):
        return s.get_statut_display()

    @admin.display(description="Cible")
    def cible(self, s):
        if s.type_cible == "retour":
            return s.contexte.get("chemin", "Retour utilisateur")
        if s.type_cible == "publication":
            return s.extrait.get("titre", "(publication supprimée)")
        nom = s.extrait.get("nom") or (f"{s.utilisateur_cible.prenom} {s.utilisateur_cible.nom}" if s.utilisateur_cible else "(supprimé)")
        return f"Conversation avec {nom}" if s.type_cible == "conversation" else nom

    @admin.display(description="Signalements sur cette cible")
    def nb_sur_cible(self, s):
        return Signalement.objects.filter(self._memes(s)).count()

    @admin.display(description="Contenu signalé (copie au moment du signalement)")
    def apercu(self, s):
        if s.type_cible == "retour":
            return format_html("{}", s.commentaire or "Aucun commentaire (pièce jointe seulement).")
        e = s.extrait or {}
        if s.type_cible == "conversation":
            lignes = ((m["auteur"], m["texte"], m["date"][:16].replace("T", " ")) for m in e.get("messages", []))
            return format_html("<table>{}</table>", format_html_join(
                "", "<tr><td><b>{}</b></td><td>{}</td><td>{}</td></tr>", lignes))
        if s.type_cible == "publication":
            return format_html("<b>{}</b><br>{}<br><i>Auteur : {}</i>", e.get("titre", ""), e.get("extrait", ""), e.get("auteur", ""))
        return format_html("{} ({})", e.get("nom", ""), e.get("email", ""))

    # --- logique commune ---
    @staticmethod
    def _memes(s):
        if s.type_cible == "publication" and s.publication_cible_id:
            return Q(type_cible="publication", publication_cible_id=s.publication_cible_id)
        if s.type_cible != "publication" and s.utilisateur_cible_id:
            return Q(type_cible=s.type_cible, utilisateur_cible_id=s.utilisateur_cible_id)
        return Q(pk=s.pk)

    @staticmethod
    def _vise(s):
        if s.utilisateur_cible_id:
            return s.utilisateur_cible
        return s.publication_cible.auteur if s.publication_cible_id else None

    def _cloturer(self, request, s, statut, decision):
        Signalement.objects.filter(self._memes(s), statut__in=OUVERTS).update(
            statut=statut, decision=decision, traite_par=request.user, traite_le=timezone.now())
        self.log_change(request, s, decision)

    def _sanction(self, request, queryset, decision, agir):
        deja, n = set(), 0
        for s in queryset.select_related("utilisateur_cible", "publication_cible__auteur"):
            u = self._vise(s)
            if u is None or u.is_staff or u.pk == request.user.pk:
                self.message_user(request, f"Signalement {s.pk} : personne à sanctionner introuvable ou protégée.", messages.WARNING)
                continue
            if u.pk in deja:
                continue
            deja.add(u.pk)
            agir(u, MOTIFS_PUBLICS[s.motif])
            self._cloturer(request, s, "traite", decision)
            n += 1
        if n:
            self.message_user(request, f"{n} personne(s) concernée(s) : {decision}.")

    # --- actions ---
    @admin.action(description="Passer en cours de traitement")
    def en_cours(self, request, queryset):
        queryset.filter(statut="nouveau").update(statut="en_cours")

    @admin.action(description="Ignorer (aucune suite)")
    def ignorer(self, request, queryset):
        for s in queryset:
            self._cloturer(request, s, "ignore", "Ignoré")
        self.message_user(request, "Signalements ignorés.")

    @admin.action(description="Masquer la publication")
    def masquer_publication(self, request, queryset):
        ids = [s.publication_cible_id for s in queryset if s.type_cible == "publication" and s.publication_cible_id]
        Publication.objects.filter(pk__in=ids).update(masquee=True)
        for s in queryset.filter(publication_cible_id__in=ids):
            self._cloturer(request, s, "traite", "Publication masquée")
        self.message_user(request, f"{len(ids)} publication(s) masquée(s).")

    @admin.action(description="Supprimer la publication")
    def supprimer_publication(self, request, queryset):
        pubs = Publication.objects.filter(pk__in=[s.publication_cible_id for s in queryset if s.publication_cible_id])
        for s in queryset.filter(type_cible="publication", publication_cible__isnull=False):
            self._cloturer(request, s, "traite", "Publication supprimée")
        n = pubs.count()
        pubs.delete()
        self.message_user(request, f"{n} publication(s) supprimée(s).")

    @admin.action(description="Avertir l'utilisateur")
    def avertir(self, request, queryset):
        self._sanction(request, queryset, "Avertissement", lambda u, m: moderation.avertir(u, m))

    @admin.action(description="Suspendre 24 heures")
    def suspendre_24h(self, request, queryset):
        self._sanction(request, queryset, "Suspension 24 h", lambda u, m: moderation.suspendre(u, m, request.user, jours=1))

    @admin.action(description="Suspendre 7 jours")
    def suspendre_7j(self, request, queryset):
        self._sanction(request, queryset, "Suspension 7 jours", lambda u, m: moderation.suspendre(u, m, request.user, jours=7))

    @admin.action(description="Suspendre 30 jours")
    def suspendre_30j(self, request, queryset):
        self._sanction(request, queryset, "Suspension 30 jours", lambda u, m: moderation.suspendre(u, m, request.user, jours=30))

    @admin.action(description="Bannir définitivement")
    def bannir(self, request, queryset):
        self._sanction(request, queryset, "Bannissement", lambda u, m: moderation.suspendre(u, m, request.user, definitive=True))


@admin.register(ConfigurationSupport)
class ConfigurationSupportAdmin(ModelAdmin):
    list_display = ("bouton_actif", "ouvert_a_tous")
    filter_horizontal = ("utilisateurs_autorises",)

    def has_add_permission(self, request):
        return not ConfigurationSupport.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
