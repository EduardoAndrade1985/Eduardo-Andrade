import secrets
from django.db import models
from apps.empresas.base import EmpresaBaseModel


def gen_token():
    return secrets.token_urlsafe(32)


class TVConfig(EmpresaBaseModel):
    """Dispositivo de TV — múltiplos por empresa."""
    token  = models.CharField(max_length=64, unique=True, db_index=True, default=gen_token)
    nome   = models.CharField(max_length=100, default='TV Principal')
    local  = models.CharField(max_length=100, blank=True, help_text='Ex: Recepção, Diretoria')
    ativo  = models.BooleanField(default=True)
    playlist = models.JSONField(default=list)

    class Meta:
        verbose_name        = 'Dispositivo TV'
        verbose_name_plural = 'Dispositivos TV'
        ordering            = ['nome']

    def __str__(self):
        return f'{self.empresa} — {self.nome}'


class TVMidia(EmpresaBaseModel):
    """Mídia compartilhada entre todos os dispositivos da empresa."""
    TIPOS = [('imagem', 'Imagem'), ('video', 'Vídeo')]

    titulo      = models.CharField(max_length=200, blank=True)
    tipo        = models.CharField(max_length=10, choices=TIPOS)
    url         = models.URLField(max_length=1000)
    duracao     = models.IntegerField(default=15, help_text='Segundos')
    ordem       = models.IntegerField(default=0)
    ativo       = models.BooleanField(default=True)
    data_inicio = models.DateField(null=True, blank=True, help_text='Exibir a partir de (vazio = sempre)')
    data_fim    = models.DateField(null=True, blank=True, help_text='Exibir até (vazio = sem limite)')
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering            = ['ordem', 'created_at']
        verbose_name        = 'Mídia TV'
        verbose_name_plural = 'Mídias TV'

    def __str__(self):
        return self.titulo or self.url[:60]
