from django.urls import path
from . import views

urlpatterns = [
    # Transações de operadoras
    path('transacoes/',           views.transacoes_list,      name='cartoes_transacoes_list'),
    path('transacoes/importar/',  views.transacoes_importar,  name='cartoes_transacoes_importar'),
    path('transacoes/conciliar/', views.transacoes_conciliar, name='cartoes_transacoes_conciliar'),
    path('transacoes/<int:pk>/',  views.transacao_atualizar,  name='cartoes_transacao_atualizar'),

    # Sistema (ERP)
    path('sistema/',             views.sistema_list,     name='cartoes_sistema_list'),
    path('sistema/importar/',    views.sistema_importar, name='cartoes_sistema_importar'),

    # Períodos conciliados
    path('periodos/',         views.periodos_list,  name='cartoes_periodos_list'),
    path('periodos/fechar/',  views.periodos_fechar, name='cartoes_periodos_fechar'),
    path('periodos/abrir/',   views.periodos_abrir,  name='cartoes_periodos_abrir'),

    # Limpeza
    path('limpar/', views.limpar, name='cartoes_limpar'),

    # Log de auditoria
    path('log/', views.log_view, name='cartoes_log'),
]
