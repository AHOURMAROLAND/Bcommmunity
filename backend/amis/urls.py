from django.urls import path

from . import views

urlpatterns = [
    path("annuaire/", views.AnnuaireView.as_view()),
    path("amis/", views.AmisListeView.as_view()),
    path("amis/suggestions/", views.SuggestionsView.as_view()),
    path("amis/compteurs/", views.CompteursView.as_view()),
    path("amis/demandes/", views.DemandesView.as_view()),
    path("amis/demandes/<int:pk>/accepter/", views.DemandeActionView.as_view(), {"action": "accepter"}),
    path("amis/demandes/<int:pk>/refuser/", views.DemandeActionView.as_view(), {"action": "refuser"}),
    path("amis/demandes/<int:pk>/", views.DemandeAnnulerView.as_view()),
    path("amis/<int:user_id>/", views.AmiRetirerView.as_view()),
    path("blocages/", views.BlocagesView.as_view()),
    path("blocages/<int:user_id>/", views.BlocageDetailView.as_view()),
]
