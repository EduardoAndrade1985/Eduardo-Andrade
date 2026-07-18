from django.urls import path
from . import views

urlpatterns = [
    path('categorias/',                              views.api_categorias),
    path('departamentos/',                           views.api_departamentos),
    path('localizacoes/',                            views.api_localizacoes),
    path('bens/buscar/',                             views.api_bem_buscar),
    path('bens/exportar/',                           views.api_bens_exportar),
    path('bens/importar/',                           views.api_bens_importar),
    path('bens/',                                    views.api_bens),
    path('bens/<int:pk>/',                           views.api_bem_detalhe),
    path('bens/<int:pk>/baixar/',                    views.api_bem_baixar),
    path('lancamento/',                              views.api_lancamento),
    path('inventarios/',                             views.api_inventarios),
    path('inventarios/token/<uuid:token>/',          views.api_inventario_por_token),
    path('inventarios/<int:pk>/',                    views.api_inventario_detalhe),
    path('inventarios/<int:pk>/finalizar/',          views.api_inventario_finalizar),
    path('inventarios/<int:pk>/leitura/',            views.api_inventario_leitura),
    path('inventarios/<int:pk>/relatorio/',          views.api_inventario_relatorio),
    path('inventarios/<int:pk>/conciliar/',          views.api_inventario_conciliar),
    path('inventarios/<int:pk>/novo-link/',          views.api_inventario_novo_link),
]
