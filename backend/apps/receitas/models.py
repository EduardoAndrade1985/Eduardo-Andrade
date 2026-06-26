from django.db import models
from apps.empresas.base import EmpresaBaseModel


class ArquivoImportado(EmpresaBaseModel):
    nome             = models.CharField(max_length=255)
    data_upload      = models.DateTimeField(auto_now_add=True)
    total_registros  = models.IntegerField(default=0)
    ativo            = models.BooleanField(default=True)

    class Meta:
        ordering = ['-data_upload']
        verbose_name        = 'Arquivo Importado'
        verbose_name_plural = 'Arquivos Importados'
        indexes = [
            models.Index(fields=['empresa', 'ativo']),
        ]

    def __str__(self):
        return f'{self.nome} ({self.total_registros} registros)'


class LancamentoDiario(models.Model):
    arquivo = models.ForeignKey(
        ArquivoImportado, on_delete=models.CASCADE, related_name='lancamentos'
    )
    data    = models.DateField()
    mes     = models.CharField(max_length=7)  # YYYY-MM
    hosp    = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    ab      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    outros  = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total   = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        ordering = ['data']
        unique_together = [('arquivo', 'data')]
        indexes = [
            models.Index(fields=['arquivo', 'data']),
            models.Index(fields=['mes']),
        ]
        verbose_name        = 'Lançamento Diário'
        verbose_name_plural = 'Lançamentos Diários'

    def __str__(self):
        return f'{self.data} | {self.total}'


class ConfiguracaoReceita(EmpresaBaseModel):
    orcado_padrao   = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    forecast_padrao = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        verbose_name        = 'Configuração de Receita'
        verbose_name_plural = 'Configurações de Receita'

    def __str__(self):
        return f'Configuração · {self.empresa_id}'


class MetaMensal(EmpresaBaseModel):
    mes      = models.CharField(max_length=7)  # YYYY-MM
    orcado   = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    forecast = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    class Meta:
        unique_together = [('empresa', 'mes')]
        ordering = ['mes']
        verbose_name        = 'Meta Mensal'
        verbose_name_plural = 'Metas Mensais'

    def __str__(self):
        return f'{self.mes} · orçado={self.orcado} forecast={self.forecast}'


class LancamentoAdicional(EmpresaBaseModel):
    CATEGORIA_CHOICES = [('hosp', 'Hospedagem'), ('ab', 'A&B'), ('outros', 'Outros')]

    mes        = models.CharField(max_length=7)  # YYYY-MM
    descricao  = models.CharField(max_length=255, blank=True)
    valor      = models.DecimalField(max_digits=14, decimal_places=2)
    categoria  = models.CharField(max_length=10, choices=CATEGORIA_CHOICES, default='outros')
    criado_em  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-criado_em']
        indexes = [
            models.Index(fields=['empresa', 'mes']),
        ]
        verbose_name        = 'Lançamento Adicional'
        verbose_name_plural = 'Lançamentos Adicionais'

    def __str__(self):
        return f'{self.mes} · {self.descricao} · {self.valor}'
