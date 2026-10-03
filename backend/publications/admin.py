from django.contrib import admin

from .models import Commentaire, Publication


@admin.register(Publication)
class PublicationAdmin(admin.ModelAdmin):
    list_display = ("titre", "auteur", "statut", "masquee", "publie_le", "nb_likes", "nb_commentaires")
    list_filter = ("statut", "masquee")
    search_fields = ("titre", "auteur__email", "auteur__nom")
    readonly_fields = ("nb_likes", "nb_commentaires", "cree_le", "publie_le")
    raw_id_fields = ("auteur",)
    actions = ["masquer", "reafficher"]

    @admin.action(description="Masquer les publications")
    def masquer(self, request, queryset):
        self.message_user(request, f"{queryset.update(masquee=True)} publication(s) masquée(s).")

    @admin.action(description="Réafficher les publications")
    def reafficher(self, request, queryset):
        self.message_user(request, f"{queryset.update(masquee=False)} publication(s) réaffichée(s).")


@admin.register(Commentaire)
class CommentaireAdmin(admin.ModelAdmin):
    list_display = ("texte", "auteur", "publication", "masque", "cree_le")
    list_filter = ("masque",)
    raw_id_fields = ("auteur", "publication")
    actions = ["masquer"]

    @admin.action(description="Masquer les commentaires")
    def masquer(self, request, queryset):
        queryset.update(masque=True)
