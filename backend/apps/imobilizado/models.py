import uuid
from django.db import models
from apps.empresas.base import EmpresaBaseModel


class CategoriaBem(EmpresaBaseModel):
    nome                   = models.CharField(max_length=120)
    taxa_depreciacao_anual = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    ativo                  = models.BooleanField(default=True)

    class Meta:
        ordering            = ['nome']
        unique_together     = [('empresa', 'nome')]
        verbose_name        = 'Categoria de Bem'
        verbose_name_plural = 'Categorias de Bens'

    def __str__(self):
        return self.nome


class Departamento(EmpresaBaseModel):
    nome  = models.CharField(max_length=120)
    ativo = models.BooleanField(default=True)

    class Meta:
        ordering            = ['nome']
        unique_together     = [('empresa', 'nome')]
        verbose_name        = 'Departamento'
        verbose_name_plural = 'Departamentos'

    def __str__(self):
        return self.nome


class LocalizacaoBem(EmpresaBaseModel):
    nome  = models.CharField(max_length=120)
    ativo = models.BooleanField(default=True)

    class Meta:
        ordering            = ['nome']
        unique_together     = [('empresa', 'nome')]
        verbose_name        = 'Localização'
        verbose_name_plural = 'Localizações'

    def __str__(self):
        return self.nome


class Bem(EmpresaBaseModel):
    EM_USO     = 'EM_USO'
    MANUTENCAO = 'MANUTENCAO'
    BAIXADO    = 'BAIXADO'
    SITUACAO_CHOICES = [
        (EM_USO,     'Em Uso'),
        (MANUTENCAO, 'Em Manutenção'),
        (BAIXADO,    'Baixado'),
    ]
    MOTIVO_BAIXA_CHOICES = [
        ('VENDA',  'Venda'),
        ('PERDA',  'Perda'),
        ('ROUBO',  'Roubo'),
        ('SUCATA', 'Sucateamento'),
        ('DOACAO', 'Doação'),
        ('OUTRO',  'Outro'),
    ]

    plaqueta        = models.CharField(max_length=40, unique=True, db_index=True)
    descricao       = models.CharField(max_length=200)
    categoria       = models.ForeignKey(CategoriaBem, on_delete=models.PROTECT, related_name='bens')
    departamento    = models.ForeignKey(Departamento, on_delete=models.PROTECT, related_name='bens')
    localizacao     = models.CharField(max_length=120, blank=True)
    responsavel     = models.CharField(max_length=120, blank=True)
    nota_fiscal     = models.CharField(max_length=40, blank=True)
    fornecedor      = models.CharField(max_length=160, blank=True)
    data_aquisicao  = models.DateField(null=True, blank=True)
    valor_aquisicao = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    situacao        = models.CharField(max_length=20, choices=SITUACAO_CHOICES, default=EM_USO)
    data_baixa      = models.DateField(null=True, blank=True)
    motivo_baixa    = models.CharField(max_length=10, choices=MOTIVO_BAIXA_CHOICES, blank=True)
    observacoes     = models.TextField(blank=True)
    foto            = models.ImageField(upload_to='imobilizado/fotos/', null=True, blank=True)
    criado_em       = models.DateTimeField(auto_now_add=True)
    atualizado_em   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering            = ['plaqueta']
        verbose_name        = 'Bem'
        verbose_name_plural = 'Bens'
        indexes = [
            models.Index(fields=['empresa', 'situacao']),
            models.Index(fields=['empresa', 'categoria']),
            models.Index(fields=['empresa', 'departamento']),
        ]

    def __str__(self):
        return f'{self.plaqueta} – {self.descricao}'

    @property
    def cadastro_completo(self):
        return bool(self.valor_aquisicao is not None and self.nota_fiscal)

    @property
    def valor_contabil(self):
        return self.valor_aquisicao or 0


class Inventario(EmpresaBaseModel):
    ABERTO     = 'ABERTO'
    AGUARDANDO = 'AGUARDANDO'
    FINALIZADO = 'FINALIZADO'
    STATUS_CHOICES = [
        (ABERTO,     'Aberto'),
        (AGUARDANDO, 'Aguardando Conciliação'),
        (FINALIZADO, 'Finalizado'),
    ]

    token       = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    data        = models.DateField()
    local_area  = models.CharField(max_length=120, blank=True)
    responsavel = models.CharField(max_length=120, blank=True)
    status      = models.CharField(max_length=15, choices=STATUS_CHOICES, default=ABERTO)
    observacoes = models.TextField(blank=True)
    criado_em   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering            = ['-data', '-criado_em']
        verbose_name        = 'Inventário'
        verbose_name_plural = 'Inventários'

    def __str__(self):
        area = f' – {self.local_area}' if self.local_area else ''
        return f'Inventário {self.data}{area} ({self.get_status_display()})'


class ItemInventario(models.Model):
    LOCALIZADO       = 'LOCALIZADO'
    LOCAL_DIVERGENTE = 'LOCAL_DIVERGENTE'
    NAO_CADASTRADO   = 'NAO_CADASTRADO'
    SITUACAO_CHOICES = [
        (LOCALIZADO,       'Localizado'),
        (LOCAL_DIVERGENTE, 'Local Divergente'),
        (NAO_CADASTRADO,   'Não Cadastrado'),
    ]

    inventario               = models.ForeignKey(Inventario, on_delete=models.CASCADE, related_name='itens')
    bem                      = models.ForeignKey(Bem, on_delete=models.SET_NULL, null=True, blank=True, related_name='leituras')
    plaqueta_lida            = models.CharField(max_length=40)
    situacao                 = models.CharField(max_length=20, choices=SITUACAO_CHOICES)
    localizacao_encontrada   = models.CharField(max_length=120, blank=True)
    contado_por              = models.CharField(max_length=120, blank=True)
    contado_em               = models.DateTimeField(auto_now=True)
    observacao               = models.CharField(max_length=200, blank=True)
    quantidade                 = models.PositiveIntegerField(default=1)
    descricao_provisoria       = models.CharField(max_length=200, blank=True)
    foto_provisoria            = models.ImageField(upload_to='imobilizado/fotos/', null=True, blank=True)
    foto_leitura               = models.ImageField(upload_to='imobilizado/fotos/', null=True, blank=True)
    categoria_provisoria_id    = models.IntegerField(null=True, blank=True)
    departamento_provisorio_id = models.IntegerField(null=True, blank=True)

    class Meta:
        unique_together     = [('inventario', 'plaqueta_lida')]
        verbose_name        = 'Item de Inventário'
        verbose_name_plural = 'Itens de Inventário'

    def __str__(self):
        return f'{self.plaqueta_lida} – {self.get_situacao_display()}'
