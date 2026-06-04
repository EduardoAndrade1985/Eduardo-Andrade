from django.urls import path
from .views import (
    TVConfigListView, TVConfigDetailView, TVTokenRegenView,
    TVMidiaListView, TVMidiaDetailView, TVMidiaUploadView, TVPublicView,
)

urlpatterns = [
    # Dispositivos
    path('config/',               TVConfigListView.as_view(),   name='tv_config_list'),
    path('config/<int:pk>/',      TVConfigDetailView.as_view(), name='tv_config_detail'),
    path('config/<int:pk>/token/',TVTokenRegenView.as_view(),   name='tv_token_regen'),
    # Mídia
    path('midia/upload/',         TVMidiaUploadView.as_view(),  name='tv_midia_upload'),
    path('midia/',                TVMidiaListView.as_view(),    name='tv_midia_list'),
    path('midia/<int:pk>/',       TVMidiaDetailView.as_view(),  name='tv_midia_detail'),
    # Público
    path('public/<str:token>/',   TVPublicView.as_view(),       name='tv_public'),
]
