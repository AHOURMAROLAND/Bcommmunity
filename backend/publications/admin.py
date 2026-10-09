from django.contrib import admin
from unfold.admin import ModelAdmin
from unfold.decorators import display

from .models import Commentaire, Publication


@admin.register(Publication)
class PublicationAdmin(ModelAdmin):
    list_display = ("titre", "auteur", "etat", "publie_le", "nb_likes", "nb_commentaires")
    list_filter = ("statut", "masquee")
    search_fields = ("titre", "auteur__email", "auteur__nom")
    readonly_fields = ("nb_likes", "nb_commentaires", "cree_le", "publie_le")
    raw_id_fields = ("auteur",)
    list_select_related = ("auteur",)
    date_hierarchy = "cree_le"
    actions = ["masquer", "reafficher"]

    @display(description="État", label={
        "Publiée": "success", "Programmée": "info", "Masquée": "danger", "Brouillon": "warning",
    })
    def etat(self, p):
        if p.masquee:
            return "Masquée"
        return {
            "publie": "Publiée",
            "programmee": "Programmée",
            "brouillon": "Brouillon",
        }[p.statut]

    @admin.action(description="Masquer les publications")
    def masquer(self, request, queryset):
        self.message_user(request, f"{queryset.update(masquee=True)} publication(s) masquée(s).")

    @admin.action(description="Réafficher les publications")
    def reafficher(self, request, queryset):
        self.message_user(request, f"{queryset.update(masquee=False)} publication(s) réaffichée(s).")


@admin.register(Commentaire)
class CommentaireAdmin(ModelAdmin):
    list_display = ("texte", "auteur", "publication", "etat", "cree_le")
    list_filter = ("masque",)
    search_fields = ("texte", "auteur__email")
    raw_id_fields = ("auteur", "publication")
    list_select_related = ("auteur", "publication")
    date_hierarchy = "cree_le"
    actions = ["masquer", "reafficher"]

    @display(description="État", label={"Visible": "success", "Masqué": "danger"})
    def etat(self, c):
        return "Masqué" if c.masque else "Visible"

    @admin.action(description="Masquer les commentaires")
    def masquer(self, request, queryset):
        self.message_user(request, f"{queryset.update(masque=True)} commentaire(s) masqué(s).")

    @admin.action(description="Réafficher les commentaires")
    def reafficher(self, request, queryset):
        self.message_user(request, f"{queryset.update(masque=False)} commentaire(s) réaffiché(s).")
