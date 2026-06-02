from django.urls import path
from . import views

urlpatterns = [
    path('',                                    views.index,              name='index'),
    path('api/movimentacoes/',                  views.api_movimentacoes,  name='api_movimentacoes'),
    path('api/arquivos/',                       views.api_arquivos,       name='api_arquivos'),
    path('api/arquivos/<int:pk>/ativar/',       views.api_ativar_arquivo, name='api_ativar'),
    path('api/arquivos/<int:pk>/deletar/',      views.api_deletar_arquivo,name='api_deletar'),
    path('api/upload/',                         views.upload_excel,       name='upload_excel'),
    path('api/status/',                         views.api_status,         name='api_status'),
]
