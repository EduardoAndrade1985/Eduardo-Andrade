from decimal import Decimal
from .models import Bem, ItemInventario


def registrar_leitura(inventario, plaqueta, localizacao_encontrada='', contado_por='', observacao=''):
    plaqueta = plaqueta.strip().upper()

    try:
        bem = Bem.objects.get(plaqueta__iexact=plaqueta, empresa=inventario.empresa)
    except Bem.DoesNotExist:
        bem = None

    if bem is None:
        situacao = ItemInventario.NAO_CADASTRADO
    elif (bem.localizacao and localizacao_encontrada
          and bem.localizacao.strip().lower() != localizacao_encontrada.strip().lower()):
        situacao = ItemInventario.LOCAL_DIVERGENTE
    else:
        situacao = ItemInventario.LOCALIZADO

    item, created = ItemInventario.objects.update_or_create(
        inventario=inventario,
        plaqueta_lida=plaqueta,
        defaults={
            'bem': bem,
            'situacao': situacao,
            'localizacao_encontrada': localizacao_encontrada,
            'contado_por': contado_por,
            'observacao': observacao,
        }
    )
    return item, created


def reconciliar(inventario):
    bens_esperados = list(
        Bem.objects
        .filter(empresa=inventario.empresa, situacao__in=[Bem.EM_USO, Bem.MANUTENCAO])
        .select_related('categoria', 'departamento')
    )

    itens = list(
        ItemInventario.objects
        .filter(inventario=inventario)
        .select_related('bem', 'bem__categoria', 'bem__departamento')
    )

    localizados     = [i for i in itens if i.situacao == ItemInventario.LOCALIZADO]
    divergentes     = [i for i in itens if i.situacao == ItemInventario.LOCAL_DIVERGENTE]
    nao_cadastrados = [i for i in itens if i.situacao == ItemInventario.NAO_CADASTRADO]

    bens_contados_ids = {i.bem_id for i in itens if i.bem_id}
    fantasmas = [b for b in bens_esperados if b.id not in bens_contados_ids]

    total_esperados = len(bens_esperados)
    total_contados  = len(localizados) + len(divergentes)
    indice = round(total_contados / total_esperados * 100, 1) if total_esperados else 0.0
    valor_fantasmas = sum(b.valor_aquisicao or Decimal('0') for b in fantasmas)

    return {
        'localizados':        localizados,
        'divergentes':        divergentes,
        'nao_cadastrados':    nao_cadastrados,
        'fantasmas':          fantasmas,
        'total_esperados':    total_esperados,
        'total_contados':     total_contados,
        'indice_localizacao': indice,
        'valor_fantasmas':    float(valor_fantasmas),
    }
