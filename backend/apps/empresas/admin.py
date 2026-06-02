from django.contrib import admin
from .models import Empresa, MembroEmpresa


@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display  = ['nome', 'nome_fantasia', 'cnpj', 'cidade', 'estado', 'total_uhs', 'ativo']
    list_filter   = ['ativo', 'estado']
    search_fields = ['nome', 'nome_fantasia', 'cnpj']
    prepopulated_fields = {'slug': ('nome_fantasia',)}


@admin.register(MembroEmpresa)
class MembroEmpresaAdmin(admin.ModelAdmin):
    list_display  = ['usuario', 'empresa', 'papel', 'ativo']
    list_filter   = ['papel', 'ativo', 'empresa']
    search_fields = ['usuario__username', 'empresa__nome']
