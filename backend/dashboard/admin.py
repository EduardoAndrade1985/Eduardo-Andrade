from django.contrib import admin
from .models import ArquivoImportado, Movimentacao


@admin.register(ArquivoImportado)
class ArquivoImportadoAdmin(admin.ModelAdmin):
    list_display = ('nome', 'data_upload', 'total_registros', 'ativo')
    list_filter  = ('ativo',)
    actions      = ['ativar_arquivo']

    @admin.action(description='Ativar arquivo selecionado')
    def ativar_arquivo(self, request, queryset):
        ArquivoImportado.objects.update(ativo=False)
        queryset.update(ativo=True)


@admin.register(Movimentacao)
class MovimentacaoAdmin(admin.ModelAdmin):
    list_display  = ('item', 'grupo', 'cc', 'mes', 'valor', 'qtde')
    list_filter   = ('cc', 'grupo', 'mes', 'arquivo')
    search_fields = ('item', 'cc', 'grupo')
