from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from publications.views import partage

admin.site.site_header = "Bakhita Community"
admin.site.site_title = "Bakhita Community"
admin.site.index_title = "Administration"

urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),
    path("p/<int:pk>/", partage),
    path("api/", include("comptes.urls")),
    path("api/", include("profils.urls")),
    path("api/", include("amis.urls")),
    path("api/", include("publications.urls")),
    path("api/", include("discussions.urls")),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
