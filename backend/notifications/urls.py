from django.urls import path

from . import views

urlpatterns = [
    path("",             views.NotificationsView.as_view()),
    path("compteur/",    views.CompteurView.as_view()),
    path("lu/",          views.LuView.as_view()),
    path("preferences/", views.PreferencesView.as_view()),
    path("push/cle/",    views.PushCleView.as_view()),
    path("push/web/",    views.PushWebView.as_view()),
    path("push/fcm/",    views.PushFcmView.as_view()),
    path("push/reply/",  views.PushReponseView.as_view()),
    path("push/",        views.PushRetirerView.as_view()),
]
