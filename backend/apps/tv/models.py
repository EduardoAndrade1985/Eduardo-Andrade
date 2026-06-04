import secrets
import random
import string
from django.db import models
from apps.empresas.base import EmpresaBaseModel


def gen_token():
    return secrets.token_urlsafe(32)


def gen_pair_code():
    """Gera código curto legível: 3 letras + 3 números ex: ABX-472"""
    letras  = ''.join(random.choices(string.ascii_uppercase, k=3))
    numeros = ''.join(random.choices(string.digits, k=3))
    return f'{letras}-{numeros}'


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


class TVPairingCode(models.Model):
    """Código temporário para parear uma TV sem precisar digitar URL longa."""
    code       = models.CharField(max_length=10, unique=True, db_index=True, default=gen_pair_code)
    tv_config  = models.ForeignKey(TVConfig, on_delete=models.CASCADE, null=True, blank=True, related_name='pairing_codes')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    usado      = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Código de Pareamento'

    def __str__(self):
        return f'{self.code} → {self.tv_config or "aguardando"}'

    @property
    def expirado(self):
        from django.utils.timezone import now
        return now() > self.expires_at
