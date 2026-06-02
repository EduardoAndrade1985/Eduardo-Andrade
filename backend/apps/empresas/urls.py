from django.urls import path
from .views import (
    MinhasEmpresasView, TrocarEmpresaView, EmpresaAtualView,
    MembrosView, MembroDetalheView, ChangePasswordView,
    EmpresasAdminView, EmpresaAdminDetalheView,
    UsuarioEmpresasView, TodosUsuariosView,
)

urlpatterns = [
    path('minhas/',                 MinhasEmpresasView.as_view(),      name='empresas_minhas'),
    path('trocar/',                 TrocarEmpresaView.as_view(),       name='empresas_trocar'),
    path('atual/',                  EmpresaAtualView.as_view(),         name='empresas_atual'),
    path('membros/',                MembrosView.as_view(),              name='empresas_membros'),
    path('membros/<int:pk>/',       MembroDetalheView.as_view(),       name='empresas_membro_detalhe'),
    path('change-password/',        ChangePasswordView.as_view(),      name='change_password'),
    path('admin/',                  EmpresasAdminView.as_view(),       name='empresas_admin_list'),
    path('admin/<int:pk>/',         EmpresaAdminDetalheView.as_view(), name='empresas_admin_detalhe'),
    path('admin/usuario-empresas/', UsuarioEmpresasView.as_view(),     name='usuario_empresas'),
    path('admin/todos-usuarios/',   TodosUsuariosView.as_view(),       name='todos_usuarios'),
]
