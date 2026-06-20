import re
import unicodedata
from decimal import Decimal

from django.db.models import Sum

from ..models import CategoriaAlimento


def _norm(s: str) -> str:
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s.lower()).strip()


def match_categoria(alimento_texto: str, empresa) -> CategoriaAlimento | None:
    """Tenta achar a CategoriaAlimento cujo nome aparece no texto do alimento
    identificado (ou vice-versa). Nível 3 da hierarquia de custos (Fase 1)."""
    if not alimento_texto or not empresa:
        return None

    alvo = _norm(alimento_texto)
    categorias = CategoriaAlimento.objects.filter(empresa=empresa, ativo=True)

    for cat in categorias:
        nome_cat = _norm(cat.nome)
        if nome_cat and (nome_cat in alvo or alvo in nome_cat):
            return cat
    return None


def _custo_do_estoque(categoria: CategoriaAlimento) -> Decimal | None:
    """Busca o custo por kg a partir do arquivo de Estoque ativo da empresa,
    filtrando pela classe vinculada na categoria. Assume que a unidade dos
    itens da classe é compatível com kg — categorias vinculadas a itens
    vendidos em outra unidade (caixa, litro etc.) não devem usar este modo."""
    from apps.estoque.models import EntradaNota

    if not categoria.estoque_classe:
        return None

    qs = EntradaNota.objects.filter(
        arquivo__empresa=categoria.empresa,
        arquivo__ativo=True,
        classe__iexact=categoria.estoque_classe,
    )

    if categoria.modo_custo == 'estoque_ultimo':
        ultima = qs.order_by('-data').first()
        return ultima.preco if ultima else None

    agregado = qs.aggregate(total_valor=Sum('valor_total'), total_qtde=Sum('qtde'))
    total_valor = agregado['total_valor'] or Decimal('0')
    total_qtde  = agregado['total_qtde'] or Decimal('0')
    if total_qtde <= 0:
        return None
    return (total_valor / total_qtde).quantize(Decimal('0.01'))


def calcular_custo(categoria: CategoriaAlimento | None) -> Decimal:
    """Custo por kg a aplicar no lançamento. Categoria com modo_custo='manual'
    (ou sem dado no Estoque) usa o valor digitado; 'estoque_medio'/'estoque_ultimo'
    buscam o preço real da Entrada de Notas, com o valor manual como fallback."""
    if categoria is None:
        return Decimal('0')
    if categoria.modo_custo != 'manual':
        custo_estoque = _custo_do_estoque(categoria)
        if custo_estoque is not None:
            return custo_estoque
    return categoria.custo_kg_medio
