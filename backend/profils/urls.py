from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

routeur = DefaultRouter()
routeur.register("scolarites", views.ScolariteViewSet, basename="scolarite")

urlpatterns = [
    path("profils/me/", views.ProfilMoiView.as_view()),
    path("profils/me/situation/", views.SituationMoiView.as_view()),
    path("referentiels/", views.ReferentielsView.as_view()),
    path("", include(routeur.urls)),
]
