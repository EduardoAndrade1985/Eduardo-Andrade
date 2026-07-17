from django.urls import path
from . import views

urlpatterns = [
    path('categorias/',                          views.api_categorias),
    path('departamentos/',                       views.api_departamentos),
    path('bens/buscar/',                         views.api_bem_buscar),
    path('bens/',                                views.api_bens),
    path('bens/<int:pk>/',                       views.api_bem_detalhe),
    path('bens/<int:pk>/baixar/',                views.api_bem_baixar),
    path('lancamento/',                          views.api_lancamento),
    path('inventarios/',                         views.api_inventarios),
    path('inventarios/<int:pk>/',                views.api_inventario_detalhe),
    path('inventarios/<int:pk>/finalizar/',      views.api_inventario_finalizar),
    path('inventarios/<int:pk>/leitura/',        views.api_inventario_leitura),
    path('inventarios/<int:pk>/relatorio/',      views.api_inventario_relatorio),
]
