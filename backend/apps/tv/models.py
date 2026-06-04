import secrets
from django.db import models
from apps.empresas.base import EmpresaBaseModel


def gen_token():
    return secrets.token_urlsafe(32)


class TVConfig(EmpresaBaseModel):
    """Uma configuração de TV por empresa."""
    token  = models.CharField(max_length=64, unique=True, db_index=True, default=gen_token)
    nome   = models.CharField(max_length=100, default='TV Principal')
    ativo  = models.BooleanField(default=True)
    # Lista ordenada: [{tipo: 'ocupacao'|'custos'|'cartoes'|'estoque'|'midia', duracao: 30, midia_id?: int}]
    playlist = models.JSONField(default=list)

    class Meta:
        verbose_name        = 'Configuração de TV'
        verbose_name_plural = 'Configurações de TV'

    def __str__(self):
        return f'{self.empresa} — {self.nome}'


class TVMidia(EmpresaBaseModel):
    """Mídia (imagem ou vídeo) para exibição na TV."""
    TIPOS = [('imagem', 'Imagem'), ('video', 'Vídeo')]

    titulo  = models.CharField(max_length=200, blank=True)
    tipo    = models.CharField(max_length=10, choices=TIPOS)
    url     = models.URLField(max_length=1000)
    duracao = models.IntegerField(default=15, help_text='Segundos')
    ordem   = models.IntegerField(default=0)
    ativo   = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering            = ['ordem', 'created_at']
        verbose_name        = 'Mídia TV'
        verbose_name_plural = 'Mídias TV'

    def __str__(self):
        return self.titulo or self.url[:60]
