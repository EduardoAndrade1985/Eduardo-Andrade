from django.db import models
from apps.empresas.models import Empresa


class TransacaoOperadora(models.Model):
    """
    Uma transação de cartão vinda de Cielo, Rede ou outra operadora.
    Campos de reconciliação (vs, df, vb, vn, va…) são preenchidos
    pelo frontend após rodar o algoritmo de conciliação e então
    enviados de volta via POST /conciliar/.
    """
    STATUS_CHOICES = [
        ('pendente',     'Pendente'),
        ('conciliado',   'Conciliado'),
        ('divergente',   'Divergente'),
        ('arredondavel', 'Arredondável'),
        ('ajustado',     'Ajustado'),
        ('arredondado',  'Arredondado'),
        ('somente_op',   'Só Operadora'),
        ('agrupado',     'Agrupado'),
        ('pix_ignorado', 'PIX Ignorado'),
    ]

    empresa    = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name='transacoes_cartao')

    # ── Dados da operadora (vêm do Excel) ────────────────────────────
    operadora  = models.CharField(max_length=50)
    data       = models.DateField()
    hora       = models.CharField(max_length=10, blank=True)
    autorizacao = models.CharField(max_length=100)
    nsu        = models.CharField(max_length=100, blank=True)
    bandeira   = models.CharField(max_length=50, blank=True)
    modalidade = models.CharField(max_length=100, blank=True)
    num_cartao = models.CharField(max_length=50, blank=True)
    valor_operadora = models.DecimalField(max_digits=12, decimal_places=2)
    taxa       = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    valor_liquido   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    parcelas   = models.IntegerField(default=0)
    status_venda = models.CharField(max_length=50, blank=True)

    # ── Resultado da conciliação (atualizado pelo frontend) ───────────
    valor_sistema   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    diferenca       = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    qtd_operadora   = models.IntegerField(default=1)
    qtd_sistema     = models.IntegerField(default=0)
    agrupamento     = models.CharField(max_length=100, blank=True)
    tipo_match      = models.CharField(max_length=50, blank=True)
    tipo_grupo      = models.CharField(max_length=50, blank=True)
    soma_positivos  = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    soma_negativos  = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    num_controle    = models.CharField(max_length=100, blank=True)   # Seq_NF
    num_doc_sis     = models.CharField(max_length=100, blank=True)   # Num_Doc_Pagto
    bandeira_sistema = models.CharField(max_length=100, blank=True)  # Inst_Pagto
    hospede         = models.CharField(max_length=200, blank=True)
    usuario_sistema = models.CharField(max_length=100, blank=True)
    info_sistema    = models.CharField(max_length=500, blank=True)
    valida_auth     = models.BooleanField(default=True)
    valida_nsu      = models.BooleanField(default=True)
    valida_bandeira = models.BooleanField(default=True)

    # ── Status e trava ───────────────────────────────────────────────
    status  = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pendente')
    locked  = models.BooleanField(default=False)

    # ── Ajuste (JSON completo do objeto ajuste do frontend) ──────────
    ajuste  = models.JSONField(null=True, blank=True)

    criado_em     = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['data', 'operadora', 'autorizacao']
        verbose_name = 'Transação Operadora'
        verbose_name_plural = 'Transações Operadoras'
        # Chave de deduplicação: empresa + operadora + auth + data + nsu + valor
        unique_together = [['empresa', 'operadora', 'autorizacao', 'data', 'nsu', 'valor_operadora']]

    def __str__(self):
        return f'{self.operadora} | {self.autorizacao} | {self.data} | R${self.valor_operadora}'


class TransacaoSistema(models.Model):
    """
    Registros brutos do ERP (Sistema).
    São substituídos a cada nova importação do arquivo do ERP.
    O algoritmo de conciliação usa esses registros para fazer o match.
    """
    empresa        = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name='transacoes_sistema')
    cod_autorizacao = models.CharField(max_length=100)
    valor_pago     = models.DecimalField(max_digits=12, decimal_places=2)
    num_parcela    = models.IntegerField(default=0)
    num_doc        = models.CharField(max_length=100, blank=True)
    seq_nf         = models.CharField(max_length=100, blank=True)
    obs            = models.CharField(max_length=500, blank=True)
    hospede        = models.CharField(max_length=200, blank=True)
    inst_pagto     = models.CharField(max_length=100, blank=True)
    codinome       = models.CharField(max_length=100, blank=True)
    data           = models.DateField(null=True, blank=True)
    arquivo_nome   = models.CharField(max_length=200, blank=True)
    importado_em   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['data', 'cod_autorizacao']
        verbose_name = 'Transação Sistema'
        verbose_name_plural = 'Transações Sistema'

    def __str__(self):
        return f'ERP | {self.cod_autorizacao} | R${self.valor_pago}'


class PeriodoConciliado(models.Model):
    """Um dia (ou intervalo) de conciliação fechado/travado."""
    empresa           = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name='periodos_conciliados')
    data_ate          = models.DateField()
    total_transacoes  = models.IntegerField(default=0)
    total_ok          = models.IntegerField(default=0)
    observacao        = models.TextField(blank=True)
    fechado_em        = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['data_ate']
        verbose_name = 'Período Conciliado'
        verbose_name_plural = 'Períodos Conciliados'

    def __str__(self):
        return f'{self.empresa} | até {self.data_ate}'


class LogConciliacao(models.Model):
    """Auditoria de ações realizadas na conciliação."""
    empresa   = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name='logs_conciliacao')
    icone     = models.CharField(max_length=10, blank=True)
    descricao = models.TextField()
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-criado_em']
        verbose_name = 'Log Conciliação'
        verbose_name_plural = 'Logs Conciliação'
