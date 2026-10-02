from django.contrib import admin

from .models import Classe, Cycle

admin.site.register(Cycle)


@admin.register(Classe)
class ClasseAdmin(admin.ModelAdmin):
    list_display = ("nom", "filiere", "cycle", "ordre")
    list_filter = ("cycle",)
