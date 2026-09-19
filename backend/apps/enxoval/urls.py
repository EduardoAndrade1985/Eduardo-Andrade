from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/',                      views.api_dashboard,            name='enxoval-dashboard'),
    path('tipos/',                          views.api_tipos,                name='enxoval-tipos'),
    path('tipos/<int:pk>/',                 views.api_tipo_detail,          name='enxoval-tipo-detail'),
    path('pecas/',                          views.api_pecas,                name='enxoval-pecas'),
    path('pecas/epc/<str:epc>/',            views.api_peca_por_epc,         name='enxoval-peca-por-epc'),
    path('movimentacoes/',                  views.api_movimentacoes,        name='enxoval-movimentacoes'),
    path('movimentacoes/<int:pk>/',         views.api_movimentacao_detail,  name='enxoval-mov-detail'),
]
