from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from comptes.admin_views import rechercher_globale
from profils.views import partage_profil
from publications.views import partage

from .sante import sante, vivant

admin.site.site_header = "Bakhita Community"
admin.site.site_title = "Bakhita Community"
admin.site.index_title = "Administration"

urlpatterns = [
    path("api/vivant/", vivant),
    path("api/sante/", sante),
    path("profil-partage/<int:user_id>/", partage_profil),
    path(
        f"{settings.ADMIN_URL}recherche/",
        admin.site.admin_view(rechercher_globale),
        name="admin-global-search",
    ),
    path(settings.ADMIN_URL, admin.site.urls),
    path("p/<int:pk>/", partage),
    path("api/", include("comptes.urls")),
    path("api/", include("profils.urls")),
    path("api/", include("amis.urls")),
    path("api/", include("publications.urls")),
    path("api/", include("discussions.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/", include("signalements.urls")),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
