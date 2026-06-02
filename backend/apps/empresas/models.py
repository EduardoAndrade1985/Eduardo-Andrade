from django.db import models
from django.conf import settings


class Empresa(models.Model):
    nome          = models.CharField(max_length=200)
    nome_fantasia = models.CharField(max_length=200, blank=True)
    cnpj          = models.CharField(max_length=18, unique=True)
    slug          = models.SlugField(unique=True)

    endereco   = models.TextField(blank=True)
    cidade     = models.CharField(max_length=100, blank=True)
    estado     = models.CharField(max_length=2, blank=True)
    telefone   = models.CharField(max_length=20, blank=True)
    email      = models.EmailField(blank=True)
    total_uhs  = models.IntegerField(default=0, help_text='Total de unidades habitacionais')

    logo         = models.ImageField(upload_to='empresas/logos/', null=True, blank=True)
    cor_primaria = models.CharField(max_length=7, default='#2dd4a0')
    fuso_horario = models.CharField(max_length=50, default='America/Sao_Paulo')
    moeda        = models.CharField(max_length=3, default='BRL')

    ativo      = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nome']
        verbose_name = 'Empresa'
        verbose_name_plural = 'Empresas'

    def __str__(self):
        return self.nome_fantasia or self.nome


class MembroEmpresa(models.Model):
    PAPEIS = [
        ('admin',       'Administrador'),
        ('gerente',     'Gerente'),
        ('operacional', 'Operacional'),
        ('visualizador','Visualizador'),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='empresas_membro',
    )
    empresa = models.ForeignKey(
        Empresa,
        on_delete=models.CASCADE,
        related_name='membros',
    )
    papel              = models.CharField(max_length=20, choices=PAPEIS, default='operacional')
    must_change_password = models.BooleanField(default=False)
    modulos_permitidos = models.JSONField(
        default=list,
        blank=True,
        help_text='Lista de módulos acessíveis, ex: ["custos","compras"]. Vazio = todos.',
    )
    ativo      = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['usuario', 'empresa']
        ordering        = ['empresa', 'usuario']
        verbose_name        = 'Membro'
        verbose_name_plural = 'Membros'

    def __str__(self):
        return f'{self.usuario} → {self.empresa} ({self.papel})'

    def tem_acesso_modulo(self, modulo):
        if self.papel in ('admin', 'gerente'):
            return True
        if not self.modulos_permitidos:
            return True
        return modulo in self.modulos_permitidos
