from django.urls import path

from .views import (
    CommentaireDetailView,
    CommentaireListCreateView,
    LikeToggleView,
    PublicationDetailView,
    PublicationListCreateView,
)

urlpatterns = [
    path("publications/", PublicationListCreateView.as_view(), name="publication-liste-creer"),
    path("publications/<int:pk>/", PublicationDetailView.as_view(), name="publication-detail"),
    path("publications/<int:pk>/like/", LikeToggleView.as_view(), name="publication-like"),
    path("publications/<int:pk>/commentaires/", CommentaireListCreateView.as_view(),
         name="publication-commentaires"),
    path("commentaires/<int:pk>/", CommentaireDetailView.as_view(), name="commentaire-detail"),
]
