from django.urls import path

from . import views

urlpatterns = [
    path("publications/", views.FilView.as_view()),
    path("publications/mes/", views.MesPublicationsView.as_view()),
    path("publications/<int:pk>/", views.PublicationDetailView.as_view()),
    path("publications/<int:pk>/like/", views.LikeView.as_view()),
    path("publications/<int:pk>/commentaires/", views.CommentairesView.as_view()),
    path("commentaires/<int:pk>/", views.CommentaireDetailView.as_view()),
]
