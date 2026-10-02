from django.conf import settings
from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "Bakhita Community"
admin.site.site_title = "Bakhita Community"
admin.site.index_title = "Administration"

urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),
    path("api/", include("comptes.urls")),
    path("api/", include("profils.urls")),
    path("api/", include("amis.urls")),
]
