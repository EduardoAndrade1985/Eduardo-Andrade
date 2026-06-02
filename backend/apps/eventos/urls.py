from django.urls import path
from . import views

urlpatterns = [
    path('',          views.eventos_list,     name='eventos-list'),
    path('importar/', views.eventos_importar, name='eventos-importar'),
    path('limpar/',   views.eventos_limpar,   name='eventos-limpar'),
]
