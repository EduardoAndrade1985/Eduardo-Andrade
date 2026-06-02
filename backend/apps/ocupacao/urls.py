from django.urls import path
from . import views

urlpatterns = [
    path('',        views.ocupacao_list,     name='ocupacao-list'),
    path('importar/', views.ocupacao_importar, name='ocupacao-importar'),
    path('limpar/',   views.ocupacao_limpar,   name='ocupacao-limpar'),
    path('resumo/',   views.ocupacao_resumo,   name='ocupacao-resumo'),
]
