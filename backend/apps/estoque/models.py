from django.db import models
from apps.empresas.base import EmpresaBaseModel


class ArquivoEstoque(EmpresaBaseModel):
    nome            = models.CharField(max_length=255)
    data_upload     = models.DateTimeField(auto_now_add=True)
    total_registros = models.IntegerField(default=0)
    ativo           = models.BooleanField(default=True)

    class Meta:
        ordering = ['-data_upload']
        verbose_name = 'Arquivo de Estoque'
        verbose_name_plural = 'Arquivos de Estoque'
        indexes = [
            models.Index(fields=['empresa', 'ativo']),
        ]

    def __str__(self):
        return f'{self.nome} ({self.empresa})'


class EntradaNota(models.Model):
    arquivo    = models.ForeignKey(ArquivoEstoque, on_delete=models.CASCADE, related_name='entradas')
    data       = models.DateField()
    item       = models.CharField(max_length=500, blank=True, default='')
    classe     = models.CharField(max_length=200, blank=True, default='')
    almox      = models.CharField(max_length=200, blank=True, default='')
    fornecedor = models.CharField(max_length=300, blank=True, default='')
    nf         = models.CharField(max_length=100, blank=True, default='')
    qtde       = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    preco      = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    valor_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    unidade    = models.CharField(max_length=50, blank=True, default='')
    controlado = models.CharField(max_length=1, blank=True, default='')

    class Meta:
        indexes = [
            models.Index(fields=['arquivo', 'data']),
            models.Index(fields=['arquivo', 'classe']),
            models.Index(fields=['arquivo', 'almox']),
        ]

    def __str__(self):
        return f'{self.item} — {self.data}'
