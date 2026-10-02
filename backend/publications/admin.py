from django.contrib import admin

from .models import Commentaire, Like, Publication


@admin.action(description="Masquer les publications sélectionnées")
def masquer_publications(modeladmin, request, queryset):
    queryset.update(est_masque=True)


@admin.action(description="Rendre visibles les publications sélectionnées")
def demasquer_publications(modeladmin, request, queryset):
    queryset.update(est_masque=False)


@admin.register(Publication)
class PublicationAdmin(admin.ModelAdmin):
    list_display = ("titre", "auteur", "statut", "est_masque", "apercu_public", "cree_le")
    list_filter = ("statut", "est_masque", "apercu_public", "cree_le")
    search_fields = ("titre", "contenu", "auteur__nom", "auteur__prenom", "auteur__email")
    actions = [masquer_publications, demasquer_publications]
    raw_id_fields = ("auteur",)
    readonly_fields = ("cree_le", "modifie_le")


@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ("publication", "user", "cree_le")
    search_fields = ("user__nom", "user__prenom", "publication__titre")
    raw_id_fields = ("publication", "user")
    readonly_fields = ("cree_le",)


@admin.register(Commentaire)
class CommentaireAdmin(admin.ModelAdmin):
    list_display = ("publication", "auteur", "texte_court", "cree_le")
    search_fields = ("texte", "auteur__nom", "auteur__prenom", "publication__titre")
    raw_id_fields = ("publication", "auteur")
    readonly_fields = ("cree_le", "modifie_le")

    @admin.display(description="Commentaire")
    def texte_court(self, obj):
        return (obj.texte[:60] + "...") if len(obj.texte) > 60 else obj.texte
