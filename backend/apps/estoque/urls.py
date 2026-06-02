from django.urls import path
from . import views

urlpatterns = [
    path('status/',               views.api_status,          name='estoque-status'),
    path('upload/',               views.api_upload,          name='estoque-upload'),
    path('entradas/',             views.api_entradas,        name='estoque-entradas'),
    path('arquivos/',             views.api_arquivos,        name='estoque-arquivos'),
    path('arquivos/<int:pk>/ativar/',  views.api_ativar_arquivo,  name='estoque-ativar'),
    path('arquivos/<int:pk>/deletar/', views.api_deletar_arquivo, name='estoque-deletar'),
]
