from django.urls import path

from .views import SignalerView

urlpatterns = [path("signalements/", SignalerView.as_view())]
