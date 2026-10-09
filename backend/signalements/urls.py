from django.urls import path

from .views import ConfigurationSupportView, MesSignalementsView, SignalerView

urlpatterns = [
    path("signalements/", SignalerView.as_view()),
    path("signalements/configuration/", ConfigurationSupportView.as_view()),
    path("signalements/mes/", MesSignalementsView.as_view()),
    path("signalements/mes/<int:signalement_id>/messages/", MesSignalementsView.as_view()),
]
