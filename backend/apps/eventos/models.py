from django.db import models
from apps.empresas.base import EmpresaBaseModel


class Evento(EmpresaBaseModel):
    STATUS_CHOICES = [
        ('A', 'Atendido'),
        ('C', 'Confirmado'),
        ('O', 'Contrato'),
        ('G', 'Negociação'),
    ]

    codigo    = models.CharField(max_length=50, blank=True, default='', db_index=True)
    nome      = models.CharField(max_length=200)
    inicio    = models.DateField()
    fim       = models.DateField()
    status    = models.CharField(max_length=2, choices=STATUS_CHOICES, default='C')

    exec_nome = models.CharField(max_length=100, blank=True, default='')
    resp      = models.CharField(max_length=100, blank=True, default='')
    cliente   = models.CharField(max_length=200, blank=True, default='')
    ramo      = models.CharField(max_length=100, blank=True, default='')
    segmento  = models.CharField(max_length=100, blank=True, default='')

    # Previsão
    prev_hosp   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    prev_sala   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    prev_aeb    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    prev_outros = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Realizado
    real_hosp   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    real_sala   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    real_aeb    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    real_outros = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    rn     = models.IntegerField(default=0)
    diaria = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering            = ['inicio', 'nome']
        verbose_name        = 'Evento'
        verbose_name_plural = 'Eventos'
        indexes = [
            models.Index(fields=['empresa', 'inicio']),
            models.Index(fields=['empresa', 'status']),
            models.Index(fields=['empresa', 'inicio', 'fim']),
        ]

    def __str__(self):
        return f'{self.nome} ({self.inicio} → {self.fim})'

    @property
    def status_label(self):
        return dict(self.STATUS_CHOICES).get(self.status, self.status)

    @property
    def prev_total(self):
        return float(self.prev_hosp) + float(self.prev_sala) + float(self.prev_aeb) + float(self.prev_outros)
