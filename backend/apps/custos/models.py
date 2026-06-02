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


class Movimentacao(models.Model):
    arquivo    = models.ForeignKey(
        ArquivoImportado, on_delete=models.CASCADE, related_name='movimentacoes'
    )
    item       = models.CharField(max_length=500)
    grupo      = models.CharField(max_length=255, default='Sem categoria')
    cc         = models.CharField(max_length=255, default='Sem CC', verbose_name='Centro de Custo')
    mes        = models.CharField(max_length=7)  # YYYY-MM
    valor      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    qtde       = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    preco_unit = models.DecimalField(max_digits=14, decimal_places=4, default=0)

    class Meta:
        indexes = [
            models.Index(fields=['arquivo', 'mes']),
            models.Index(fields=['cc']),
            models.Index(fields=['grupo']),
        ]
        verbose_name        = 'Movimentação'
        verbose_name_plural = 'Movimentações'

    def __str__(self):
        return f'{self.item} | {self.cc} | {self.mes}'
