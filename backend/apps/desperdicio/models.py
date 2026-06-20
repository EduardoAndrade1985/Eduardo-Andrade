import random
import secrets
import string

from django.conf import settings
from django.db import models
from apps.empresas.base import EmpresaBaseModel


def gen_token():
    return secrets.token_urlsafe(32)


def gen_pair_code():
    """Código curto legível pro operador digitar: 3 letras + 3 números, ex: ABX-472."""
    letras  = ''.join(random.choices(string.ascii_uppercase, k=3))
    numeros = ''.join(random.choices(string.digits, k=3))
    return f'{letras}-{numeros}'


class Unidade(EmpresaBaseModel):
    nome  = models.CharField(max_length=200)
    ativo = models.BooleanField(default=True)

    class Meta:
        ordering = ['nome']
        verbose_name = 'Unidade'
        verbose_name_plural = 'Unidades'
        indexes = [
            models.Index(fields=['empresa', 'ativo']),
        ]

    def __str__(self):
        return f'{self.nome} ({self.empresa})'


class Setor(models.Model):
    unidade = models.ForeignKey(Unidade, on_delete=models.CASCADE, related_name='setores')
    nome    = models.CharField(max_length=100)
    ativo   = models.BooleanField(default=True)

    class Meta:
        ordering = ['nome']
        verbose_name = 'Setor'
        verbose_name_plural = 'Setores'

    def __str__(self):
        return f'{self.nome} — {self.unidade}'


class CategoriaAlimento(EmpresaBaseModel):
    MODO_CUSTO_CHOICES = [
        ('manual',         'Valor digitado manualmente'),
        ('estoque_medio',  'Custo médio do Estoque (Entrada de Notas)'),
        ('estoque_ultimo', 'Último preço pago no Estoque (Entrada de Notas)'),
    ]

    nome           = models.CharField(max_length=150)
    custo_kg_medio = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                                          help_text='Usado quando modo_custo=manual, ou como fallback se não houver dado no Estoque.')
    modo_custo     = models.CharField(max_length=20, choices=MODO_CUSTO_CHOICES, default='manual')
    estoque_classe = models.CharField(max_length=200, blank=True, default='',
                                       help_text='Classe do item no módulo Estoque (Entrada de Notas) usada para buscar o custo. Ex: "Carnes Bovinas".')
    ativo          = models.BooleanField(default=True)

    class Meta:
        ordering = ['nome']
        verbose_name = 'Categoria de Alimento'
        verbose_name_plural = 'Categorias de Alimento'
        indexes = [
            models.Index(fields=['empresa', 'ativo']),
        ]

    def __str__(self):
        return f'{self.nome} (R${self.custo_kg_medio}/kg)'


class TipoPerda(EmpresaBaseModel):
    nome  = models.CharField(max_length=100)
    ativo = models.BooleanField(default=True)

    class Meta:
        ordering = ['nome']
        verbose_name = 'Tipo de Perda'
        verbose_name_plural = 'Tipos de Perda'
        indexes = [
            models.Index(fields=['empresa', 'ativo']),
        ]

    def __str__(self):
        return self.nome


class ContagemClientes(models.Model):
    unidade    = models.ForeignKey(Unidade, on_delete=models.CASCADE, related_name='contagens')
    data       = models.DateField()
    n_clientes = models.IntegerField(default=0)

    class Meta:
        unique_together = ['unidade', 'data']
        ordering = ['-data']
        verbose_name = 'Contagem de Clientes'
        verbose_name_plural = 'Contagens de Clientes'

    def __str__(self):
        return f'{self.unidade} — {self.data}: {self.n_clientes} clientes'


class RegistroDesperdicio(models.Model):
    TURNO_CHOICES = [
        ('manha', 'Manhã'),
        ('tarde', 'Tarde'),
        ('noite', 'Noite'),
    ]

    unidade     = models.ForeignKey(Unidade, on_delete=models.CASCADE, related_name='registros')
    setor       = models.ForeignKey(Setor, on_delete=models.SET_NULL, null=True, blank=True, related_name='registros')
    tipo_perda  = models.ForeignKey(TipoPerda, on_delete=models.SET_NULL, null=True, blank=True, related_name='registros')

    foto        = models.ImageField(upload_to='desperdicio/%Y/%m/', null=True, blank=True)
    alimento_ia = models.CharField(max_length=200, blank=True, default='')
    confianca_ia = models.FloatField(null=True, blank=True)

    categoria   = models.ForeignKey(CategoriaAlimento, on_delete=models.SET_NULL, null=True, blank=True, related_name='registros')
    peso_kg     = models.DecimalField(max_digits=8, decimal_places=3, default=0)
    custo_kg    = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    valor_perda = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    turno       = models.CharField(max_length=10, choices=TURNO_CHOICES, default='manha')
    criado_por  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='registros_desperdicio')
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Registro de Desperdício'
        verbose_name_plural = 'Registros de Desperdício'
        indexes = [
            models.Index(fields=['unidade', 'created_at']),
            models.Index(fields=['unidade', 'setor']),
        ]

    def __str__(self):
        return f'{self.alimento_ia or "—"} — {self.peso_kg}kg ({self.unidade})'


class Dispositivo(EmpresaBaseModel):
    """Tablet/celular pareado pra lançar desperdício sem precisar logar —
    mesma ideia do pareamento de TV (apps.tv.TVConfig)."""
    token      = models.CharField(max_length=64, unique=True, db_index=True, default=gen_token)
    nome       = models.CharField(max_length=100, default='Tablet Cozinha')
    unidade    = models.ForeignKey(Unidade, on_delete=models.CASCADE, related_name='dispositivos')
    setor      = models.ForeignKey(Setor, on_delete=models.SET_NULL, null=True, blank=True, related_name='dispositivos')
    ativo      = models.BooleanField(default=True)
    last_seen  = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nome']
        verbose_name = 'Dispositivo'
        verbose_name_plural = 'Dispositivos'

    def __str__(self):
        return f'{self.nome} — {self.unidade}'


class DispositivoPairingCode(models.Model):
    """Código temporário pra parear um dispositivo sem precisar digitar URL/token longo."""
    code        = models.CharField(max_length=10, unique=True, db_index=True, default=gen_pair_code)
    dispositivo = models.ForeignKey(Dispositivo, on_delete=models.CASCADE, null=True, blank=True, related_name='pairing_codes')
    created_at  = models.DateTimeField(auto_now_add=True)
    expires_at  = models.DateTimeField()
    usado       = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Código de Pareamento'

    def __str__(self):
        return f'{self.code} → {self.dispositivo or "aguardando"}'

    @property
    def expirado(self):
        from django.utils.timezone import now
        return now() > self.expires_at
