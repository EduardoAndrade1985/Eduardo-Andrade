from django.contrib import admin
from .models import (
    Unidade, Setor, CategoriaAlimento, TipoPerda, ContagemClientes, RegistroDesperdicio,
    Dispositivo, DispositivoPairingCode,
)


@admin.register(Unidade)
class UnidadeAdmin(admin.ModelAdmin):
    list_display  = ['nome', 'empresa', 'ativo']
    list_filter   = ['ativo', 'empresa']
    search_fields = ['nome']


@admin.register(Setor)
class SetorAdmin(admin.ModelAdmin):
    list_display  = ['nome', 'unidade', 'ativo']
    list_filter   = ['ativo', 'unidade']
    search_fields = ['nome']


@admin.register(CategoriaAlimento)
class CategoriaAlimentoAdmin(admin.ModelAdmin):
    list_display  = ['nome', 'modo_custo', 'custo_kg_medio', 'estoque_classe', 'empresa', 'ativo']
    list_filter   = ['ativo', 'modo_custo', 'empresa']
    search_fields = ['nome', 'estoque_classe']


@admin.register(TipoPerda)
class TipoPerdaAdmin(admin.ModelAdmin):
    list_display  = ['nome', 'empresa', 'ativo']
    list_filter   = ['ativo', 'empresa']
    search_fields = ['nome']


@admin.register(ContagemClientes)
class ContagemClientesAdmin(admin.ModelAdmin):
    list_display = ['unidade', 'data', 'n_clientes']
    list_filter  = ['unidade']
    date_hierarchy = 'data'


@admin.register(RegistroDesperdicio)
class RegistroDesperdicioAdmin(admin.ModelAdmin):
    list_display  = ['unidade', 'setor', 'alimento_ia', 'categoria', 'peso_kg', 'valor_perda', 'turno', 'created_at']
    list_filter   = ['unidade', 'tipo_perda', 'turno', 'categoria']
    search_fields = ['alimento_ia']
    date_hierarchy = 'created_at'


@admin.register(Dispositivo)
class DispositivoAdmin(admin.ModelAdmin):
    list_display  = ['nome', 'unidade', 'setor', 'ativo', 'last_seen']
    list_filter   = ['ativo', 'unidade']
    search_fields = ['nome', 'token']
    readonly_fields = ['token', 'last_seen']


@admin.register(DispositivoPairingCode)
class DispositivoPairingCodeAdmin(admin.ModelAdmin):
    list_display = ['code', 'dispositivo', 'usado', 'expires_at']
    list_filter  = ['usado']
