from django.urls import path

from . import views

urlpatterns = [
    path("auth/inscription/", views.InscriptionView.as_view()),
    path("auth/connexion/", views.ConnexionView.as_view()),
    path("auth/google/", views.GoogleView.as_view()),
    path("auth/mot-de-passe-oublie/", views.OubliView.as_view()),
    path("auth/reinitialiser/", views.ReinitialisationView.as_view()),
    path("auth/rafraichir/", views.RafraichirView.as_view()),
    path("auth/deconnexion/", views.DeconnexionView.as_view()),
    path("auth/moi/", views.MoiView.as_view()),
    path("auth/sessions/", views.SessionsView.as_view()),
    path("auth/sessions/<uuid:session_id>/", views.RevoquerSessionView.as_view()),
    path("auth/compte/", views.SupprimerCompteView.as_view()),
    path("auth/mot-de-passe/", views.ChangerMotDePasseView.as_view()),
    path("auth/otp/envoyer/", views.EnvoyerOTPView.as_view()),
    path("auth/otp/verifier/", views.VerifierOTPView.as_view()),
]
