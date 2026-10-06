from django.urls import path

from . import views

urlpatterns = [
    path("discussions/invitations/",
         views.InvitationsView.as_view()),
    path("discussions/invitations/<int:pk>/accepter/",
         views.InvitationActionView.as_view(), {"action": "accepter"}),
    path("discussions/invitations/<int:pk>/refuser/",
         views.InvitationActionView.as_view(), {"action": "refuser"}),
    path("discussions/invitations/<int:pk>/",
         views.InvitationAnnulerView.as_view()),
    path("discussions/compteurs/",
         views.CompteursView.as_view()),
    path("conversations/",
         views.ConversationsView.as_view()),
    path("conversations/<int:pk>/",
         views.ConversationDetailView.as_view()),
    path("conversations/<int:pk>/messages/",
         views.MessagesView.as_view()),
    path("conversations/<int:pk>/messages/media/",
         views.MessagesMediaView.as_view()),
    path("conversations/<int:pk>/messages/<int:msg_id>/reactions/",
         views.ReactionView.as_view()),
    path("conversations/<int:pk>/lu/",
         views.LuView.as_view()),
]
