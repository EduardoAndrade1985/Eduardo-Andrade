from django.db import models
from apps.empresas.base import EmpresaBaseModel


class OcupacaoDiaria(EmpresaBaseModel):
    TIPO_CHOICES = [('historico', 'Histórico'), ('previsao', 'Previsão')]

    data  = models.DateField()
    tipo  = models.CharField(max_length=20, choices=TIPO_CHOICES, default='historico')

    # ── UHs ocupadas por categoria ────────────────────────────────
    ocup_n     = models.IntegerField(default=0)   # nacional
    ocup_a     = models.IntegerField(default=0)   # apartamento/adulto
    ocup_f     = models.IntegerField(default=0)   # feminino
    ocup_u     = models.IntegerField(default=0)   # outros
    ocup_d     = models.IntegerField(default=0)   # day use
    ocup_t     = models.IntegerField(default=0)   # total UHs ocupadas
    ocup_n_chd = models.IntegerField(default=0)   # crianças
    ocup_n_ant = models.IntegerField(default=0)   # período anterior

    # ── Hóspedes por categoria ────────────────────────────────────
    hosp_n         = models.IntegerField(default=0)
    hosp_a         = models.IntegerField(default=0)
    hosp_f         = models.IntegerField(default=0)
    hosp_u         = models.IntegerField(default=0)
    hosp_d         = models.IntegerField(default=0)
    hosp_t         = models.IntegerField(default=0)   # total hóspedes
    hosp_check_in  = models.IntegerField(default=0)
    hosp_check_out = models.IntegerField(default=0)

    # ── Movimentações operacionais ────────────────────────────────
    check_in  = models.IntegerField(default=0)
    check_out = models.IntegerField(default=0)
    day_use   = models.IntegerField(default=0)
    no_show   = models.IntegerField(default=0)

    # ── Disponibilidade de UHs ────────────────────────────────────
    uh_manutencao  = models.IntegerField(default=0)
    uh_interditada = models.IntegerField(default=0)
    uh_rsv_tecnica = models.IntegerField(default=0)
    uh_total       = models.IntegerField(default=0)
    uh_disp_venda  = models.IntegerField(default=0)

    # ── Taxas e diárias ───────────────────────────────────────────
    taxa_ocup      = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    taxa_ocup_abs  = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    taxa_ocup_perc = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    diaria_n       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    diaria_n_bruta = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # ── Financeiro (regimes) ──────────────────────────────────────
    hp    = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # hospedagem pura
    ep    = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # estadia paga
    cp    = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # café pago
    map_v = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # meia pensão
    fap   = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # pensão completa
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    occ   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    occ_abs = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        unique_together = [['empresa', 'data', 'tipo']]
        ordering        = ['data']
        verbose_name        = 'Ocupação Diária'
        verbose_name_plural = 'Ocupações Diárias'
        indexes = [
            models.Index(fields=['empresa', 'data']),
            models.Index(fields=['empresa', 'tipo']),
        ]

    def __str__(self):
        return f'{self.empresa} — {self.data} ({self.tipo})'

    @property
    def revpar(self):
        if self.uh_disp_venda:
            return float(self.diaria_n) * float(self.taxa_ocup_perc) / 100
        return 0
