from django.contrib import admin
from .models import TipoEnxoval, PecaEnxoval, MovimentacaoEnxoval, ItemMovimentacao


class ItemInline(admin.TabularInline):
    model  = ItemMovimentacao
    extra  = 0
    fields = ('epc_lido', 'peca', 'tipo_enxoval', 'rssi', 'contagem', 'status_item')


@admin.register(TipoEnxoval)
class TipoEnxovalAdmin(admin.ModelAdmin):
    list_display   = ('nome', 'codigo', 'empresa', 'estoque_minimo', 'ativo')
    list_filter    = ('empresa', 'ativo')
    search_fields  = ('nome', 'codigo')


@admin.register(PecaEnxoval)
class PecaEnxovalAdmin(admin.ModelAdmin):
    list_display   = ('epc', 'tipo', 'status', 'empresa', 'criado_em')
    list_filter    = ('empresa', 'status', 'tipo')
    search_fields  = ('epc',)


@admin.register(MovimentacaoEnxoval)
class MovimentacaoEnxovalAdmin(admin.ModelAdmin):
    list_display   = ('numero', 'tipo_mov', 'empresa', 'responsavel', 'finalizado', 'criado_em')
    list_filter    = ('empresa', 'tipo_mov', 'finalizado')
    inlines        = [ItemInline]
