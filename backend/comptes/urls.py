from django.urls import path

from . import views

urlpatterns = [
    path("auth/inscription/", views.InscriptionView.as_view()),
    path("auth/connexion/", views.ConnexionView.as_view()),
    path("auth/rafraichir/", views.RafraichirView.as_view()),
    path("auth/deconnexion/", views.DeconnexionView.as_view()),
    path("auth/moi/", views.MoiView.as_view()),
]
