from django.contrib import admin
from apps.empresas.admin_base import EmpresaModelAdmin
from .models import (
    ArquivoImportado, LancamentoDiario, ConfiguracaoReceita,
    MetaMensal, LancamentoAdicional,
)


@admin.register(ArquivoImportado)
class ArquivoImportadoAdmin(EmpresaModelAdmin):
    list_display = ('nome', 'data_upload', 'total_registros', 'ativo')
    list_filter  = ('ativo',)
    actions      = ['ativar_arquivo']

    @admin.action(description='Ativar arquivo selecionado')
    def ativar_arquivo(self, request, queryset):
        ArquivoImportado.objects.filter(empresa=queryset.first().empresa).update(ativo=False)
        queryset.update(ativo=True)


@admin.register(LancamentoDiario)
class LancamentoDiarioAdmin(admin.ModelAdmin):
    list_display  = ('data', 'mes', 'hosp', 'ab', 'outros', 'total', 'arquivo')
    list_filter   = ('mes', 'arquivo')


@admin.register(ConfiguracaoReceita)
class ConfiguracaoReceitaAdmin(EmpresaModelAdmin):
    list_display = ('empresa', 'orcado_padrao', 'forecast_padrao')


@admin.register(MetaMensal)
class MetaMensalAdmin(EmpresaModelAdmin):
    list_display = ('empresa', 'mes', 'orcado', 'forecast')
    list_filter  = ('mes',)


@admin.register(LancamentoAdicional)
class LancamentoAdicionalAdmin(EmpresaModelAdmin):
    list_display = ('empresa', 'mes', 'descricao', 'valor', 'criado_em')
    list_filter  = ('mes',)
