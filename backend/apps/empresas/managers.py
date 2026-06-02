from django.db import models


class EmpresaQuerySet(models.QuerySet):
    def da_empresa(self, empresa):
        if empresa:
            return self.filter(empresa=empresa)
        return self.none()


class EmpresaManager(models.Manager):
    def get_queryset(self):
        return EmpresaQuerySet(self.model, using=self._db)

    def da_empresa(self, empresa):
        return self.get_queryset().da_empresa(empresa)
