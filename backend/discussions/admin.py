from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import ConfigurationDiscussion


@admin.register(ConfigurationDiscussion)
class ConfigurationDiscussionAdmin(ModelAdmin):
    list_display = ("bloquer_captures_ecran", "modifie_le")
    fields = ("bloquer_captures_ecran", "modifie_le")
    readonly_fields = ("modifie_le",)

    def get_queryset(self, request):
        return super().get_queryset(request).filter(pk=1)

    def has_add_permission(self, request):
        return not ConfigurationDiscussion.objects.filter(pk=1).exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        obj.pk = 1
        super().save_model(request, obj, form, change)
