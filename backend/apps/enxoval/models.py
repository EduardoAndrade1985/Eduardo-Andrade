from django.db import models
from apps.empresas.base import EmpresaBaseModel


class TipoEnxoval(EmpresaBaseModel):
    nome            = models.CharField(max_length=100)
    codigo          = models.CharField(max_length=4)  # 4-hex usado no EPC: A100{codigo}{serial}
    cor             = models.CharField(max_length=7, default='#6366f1', blank=True)
    estoque_minimo  = models.PositiveIntegerField(default=0)
    ativo           = models.BooleanField(default=True)

    class Meta:
        ordering        = ['nome']
        unique_together = [('empresa', 'codigo'), ('empresa', 'nome')]
        verbose_name    = 'Tipo de Enxoval'
        verbose_name_plural = 'Tipos de Enxoval'
        indexes = [
            models.Index(fields=['empresa', 'ativo'], name='enxoval_tip_emp_ati_idx'),
        ]

    def __str__(self):
        return f'{self.nome} ({self.codigo})'


class PecaEnxoval(EmpresaBaseModel):
    EM_HOTEL       = 'EM_HOTEL'
    NA_LAVANDERIA  = 'NA_LAVANDERIA'
    BAIXADA        = 'BAIXADA'
    STATUS_CHOICES = [
        (EM_HOTEL,      'Em Hotel'),
        (NA_LAVANDERIA, 'Na Lavanderia'),
        (BAIXADA,       'Baixada'),
    ]

    epc            = models.CharField(max_length=24, unique=True, db_index=True)
    tipo           = models.ForeignKey(TipoEnxoval, on_delete=models.PROTECT, related_name='pecas')
    serial         = models.PositiveBigIntegerField(default=0)
    status         = models.CharField(max_length=15, choices=STATUS_CHOICES, default=EM_HOTEL)
    observacoes    = models.TextField(blank=True)
    criado_em      = models.DateTimeField(auto_now_add=True)
    atualizado_em  = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name        = 'Peça de Enxoval'
        verbose_name_plural = 'Peças de Enxoval'
        indexes = [
            models.Index(fields=['empresa', 'status'], name='enxoval_pec_emp_sta_idx'),
            models.Index(fields=['empresa', 'tipo'],   name='enxoval_pec_emp_tip_idx'),
        ]

    def __str__(self):
        return f'{self.tipo.nome} · {self.epc}'


class MovimentacaoEnxoval(EmpresaBaseModel):
    SAIDA   = 'SAIDA'
    ENTRADA = 'ENTRADA'
    TIPO_CHOICES = [
        (SAIDA,   'Saída para Lavanderia'),
        (ENTRADA, 'Entrada da Lavanderia'),
    ]

    tipo_mov    = models.CharField(max_length=10, choices=TIPO_CHOICES)
    numero      = models.PositiveIntegerField(default=0)
    responsavel = models.CharField(max_length=120, blank=True)
    observacoes = models.TextField(blank=True)
    finalizado  = models.BooleanField(default=False)
    criado_em   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering            = ['-criado_em']
        verbose_name        = 'Movimentação de Enxoval'
        verbose_name_plural = 'Movimentações de Enxoval'

    def __str__(self):
        return f'#{self.numero} {self.get_tipo_mov_display()} ({self.criado_em:%d/%m/%Y})'


class ItemMovimentacao(models.Model):
    RECONHECIDA  = 'RECONHECIDA'
    DESCONHECIDA = 'DESCONHECIDA'
    SUSPEITA     = 'SUSPEITA'
    STATUS_CHOICES = [
        (RECONHECIDA,  'Reconhecida'),
        (DESCONHECIDA, 'Desconhecida'),
        (SUSPEITA,     'Suspeita'),
    ]

    movimentacao  = models.ForeignKey(MovimentacaoEnxoval, on_delete=models.CASCADE, related_name='itens')
    peca          = models.ForeignKey(PecaEnxoval, on_delete=models.SET_NULL, null=True, blank=True, related_name='movimentacoes')
    tipo_enxoval  = models.ForeignKey(TipoEnxoval, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    epc_lido      = models.CharField(max_length=24)
    rssi          = models.FloatField(null=True, blank=True)
    contagem      = models.PositiveIntegerField(default=1)
    status_item   = models.CharField(max_length=15, choices=STATUS_CHOICES, default=RECONHECIDA)

    class Meta:
        unique_together     = [('movimentacao', 'epc_lido')]
        verbose_name        = 'Item de Movimentação'
        verbose_name_plural = 'Itens de Movimentação'

    def __str__(self):
        return f'{self.epc_lido} – {self.get_status_item_display()}'
