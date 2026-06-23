from django.urls import path
from . import views

urlpatterns = [
    path('upload/',                  views.upload_excel,        name='upload_excel'),
    path('status/',                  views.api_status,          name='api_status'),
    path('arquivos/',                views.api_arquivos,        name='api_arquivos'),
    path('arquivos/<int:pk>/ativar/',  views.api_ativar_arquivo,  name='api_ativar'),
    path('arquivos/<int:pk>/deletar/', views.api_deletar_arquivo, name='api_deletar'),
    path('lancamentos/',             views.api_lancamentos,     name='api_lancamentos'),
    path('metas/',                   views.api_metas,           name='api_metas'),
    path('metas/padrao/',            views.api_metas_padrao,    name='api_metas_padrao'),
    path('metas/<str:mes>/',         views.api_meta_mes,        name='api_meta_mes'),
    path('ajustes/',                 views.api_ajustes,         name='api_ajustes'),
    path('ajustes/criar/',           views.api_ajuste_criar,    name='api_ajuste_criar'),
    path('ajustes/<int:pk>/deletar/', views.api_ajuste_deletar, name='api_ajuste_deletar'),
]
