from django.db import models
from .managers import EmpresaManager


class EmpresaBaseModel(models.Model):
    empresa = models.ForeignKey(
        'empresas.Empresa',
        on_delete=models.CASCADE,
        related_name='%(app_label)s_%(class)s_set',
        db_index=True,
    )

    objects = EmpresaManager()

    class Meta:
        abstract = True
