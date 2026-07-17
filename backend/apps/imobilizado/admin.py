from django.contrib import admin
from apps.empresas.admin_base import EmpresaModelAdmin
from .models import CategoriaBem, Departamento, Bem, Inventario, ItemInventario


@admin.register(CategoriaBem)
class CategoriaBemAdmin(EmpresaModelAdmin):
    list_display  = ('nome', 'ativo')
    list_filter   = ('ativo',)
    search_fields = ('nome',)


@admin.register(Departamento)
class DepartamentoAdmin(EmpresaModelAdmin):
    list_display  = ('nome', 'ativo')
    list_filter   = ('ativo',)
    search_fields = ('nome',)


class ItemInventarioInline(admin.TabularInline):
    model           = ItemInventario
    extra           = 0
    readonly_fields = ('plaqueta_lida', 'bem', 'situacao', 'localizacao_encontrada', 'contado_por', 'contado_em')
    can_delete      = False


@admin.register(Bem)
class BemAdmin(EmpresaModelAdmin):
    list_display    = ('plaqueta', 'descricao', 'categoria', 'departamento', 'situacao', 'completo')
    list_filter     = ('situacao', 'categoria', 'departamento')
    search_fields   = ('plaqueta', 'descricao', 'nota_fiscal', 'fornecedor')
    readonly_fields = ('criado_em', 'atualizado_em')

    @admin.display(boolean=True, description='Completo')
    def completo(self, obj):
        return obj.cadastro_completo


@admin.register(Inventario)
class InventarioAdmin(EmpresaModelAdmin):
    list_display    = ('data', 'local_area', 'responsavel', 'status', 'criado_em')
    list_filter     = ('status',)
    search_fields   = ('local_area', 'responsavel')
    readonly_fields = ('criado_em',)
    inlines         = [ItemInventarioInline]


@admin.register(ItemInventario)
class ItemInventarioAdmin(admin.ModelAdmin):
    list_display  = ('plaqueta_lida', 'inventario', 'bem', 'situacao', 'contado_em')
    list_filter   = ('situacao',)
    search_fields = ('plaqueta_lida',)
    readonly_fields = ('contado_em',)
