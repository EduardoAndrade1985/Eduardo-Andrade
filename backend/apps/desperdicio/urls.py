from django.urls import path
from . import views

urlpatterns = [
    path('unidades/',               views.UnidadeListView.as_view(),         name='desperdicio-unidades'),
    path('unidades/<int:pk>/',      views.UnidadeDetailView.as_view(),       name='desperdicio-unidade-detail'),
    path('setores/',                views.SetorListView.as_view(),           name='desperdicio-setores'),
    path('setores/<int:pk>/',       views.SetorDetailView.as_view(),         name='desperdicio-setor-detail'),
    path('tipos-perda/',            views.TipoPerdaListView.as_view(),       name='desperdicio-tipos-perda'),
    path('tipos-perda/<int:pk>/',   views.TipoPerdaDetailView.as_view(),     name='desperdicio-tipo-perda-detail'),
    path('refeicoes/',              views.RefeicaoListView.as_view(),        name='desperdicio-refeicoes'),
    path('refeicoes/<int:pk>/',     views.RefeicaoDetailView.as_view(),      name='desperdicio-refeicao-detail'),
    path('categorias/',             views.CategoriaListView.as_view(),       name='desperdicio-categorias'),
    path('categorias/<int:pk>/',    views.CategoriaDetailView.as_view(),     name='desperdicio-categoria-detail'),
    path('classificar/',            views.ClassificarView.as_view(),         name='desperdicio-classificar'),
    path('registros/',              views.RegistroListView.as_view(),        name='desperdicio-registros'),
    path('registros/<int:pk>/',     views.RegistroDetailView.as_view(),      name='desperdicio-registro-detail'),
    path('contagem-clientes/',      views.ContagemClientesView.as_view(),    name='desperdicio-contagem'),
    path('dashboard/',              views.DashboardView.as_view(),           name='desperdicio-dashboard'),

    # Dispositivos (tablets pareados)
    path('dispositivos/',                views.DispositivoListView.as_view(),         name='desperdicio-dispositivos'),
    path('dispositivos/<int:pk>/',       views.DispositivoDetailView.as_view(),       name='desperdicio-dispositivo-detail'),
    path('dispositivos/pair/request/',   views.DispositivoPairRequestView.as_view(),  name='desperdicio-pair-request'),
    path('dispositivos/pair/status/',    views.DispositivoPairStatusView.as_view(),   name='desperdicio-pair-status'),
    path('dispositivos/pair/confirm/',   views.DispositivoPairConfirmView.as_view(),  name='desperdicio-pair-confirm'),
    path('dispositivos/pair/pending/',   views.DispositivoPairPendingView.as_view(),  name='desperdicio-pair-pending'),
    path('dispositivos/heartbeat/',      views.DispositivoHeartbeatView.as_view(),    name='desperdicio-heartbeat'),
    path('dispositivos/public/<str:token>/', views.DispositivoPublicView.as_view(),   name='desperdicio-dispositivo-public'),
]
