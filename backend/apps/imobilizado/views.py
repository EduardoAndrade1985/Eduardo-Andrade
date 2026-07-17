import json
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from .models import CategoriaBem, Departamento, Bem, Inventario, ItemInventario
from .services import registrar_leitura, reconciliar


def _empresa(request):
    return getattr(request, 'empresa', None)


def _err(msg, status=400):
    return JsonResponse({'ok': False, 'erro': msg}, status=status)


def _parse_valor(texto):
    texto = (texto or '').strip()
    if not texto:
        return None
    normalizado = texto.replace('.', '').replace(',', '.')
    try:
        return Decimal(normalizado)
    except InvalidOperation:
        return None


def _bem_dict(bem, request=None):
    foto_url = None
    if request and bem.foto:
        try:
            foto_url = request.build_absolute_uri(bem.foto.url)
        except Exception:
            pass
    return {
        'id':                bem.id,
        'plaqueta':          bem.plaqueta,
        'descricao':         bem.descricao,
        'categoria':         {'id': bem.categoria_id, 'nome': bem.categoria.nome},
        'departamento':      {'id': bem.departamento_id, 'nome': bem.departamento.nome},
        'localizacao':       bem.localizacao,
        'responsavel':       bem.responsavel,
        'nota_fiscal':       bem.nota_fiscal,
        'fornecedor':        bem.fornecedor,
        'data_aquisicao':    bem.data_aquisicao.isoformat() if bem.data_aquisicao else None,
        'valor_aquisicao':   float(bem.valor_aquisicao) if bem.valor_aquisicao is not None else None,
        'situacao':          bem.situacao,
        'data_baixa':        bem.data_baixa.isoformat() if bem.data_baixa else None,
        'motivo_baixa':      bem.motivo_baixa,
        'observacoes':       bem.observacoes,
        'foto_url':          foto_url,
        'cadastro_completo': bem.cadastro_completo,
        'criado_em':         bem.criado_em.isoformat(),
        'atualizado_em':     bem.atualizado_em.isoformat(),
    }


def _item_dict(item, request=None):
    bem_data = None
    if item.bem_id:
        b = item.bem
        foto_url = None
        if request and b.foto:
            try:
                foto_url = request.build_absolute_uri(b.foto.url)
            except Exception:
                pass
        bem_data = {
            'id':          b.id,
            'plaqueta':    b.plaqueta,
            'descricao':   b.descricao,
            'localizacao': b.localizacao,
            'foto_url':    foto_url,
        }
    return {
        'id':                    item.id,
        'plaqueta_lida':         item.plaqueta_lida,
        'situacao':              item.situacao,
        'bem':                   bem_data,
        'localizacao_encontrada': item.localizacao_encontrada,
        'contado_por':           item.contado_por,
        'contado_em':            item.contado_em.isoformat(),
        'observacao':            item.observacao,
    }


# ─── CATEGORIAS ───────────────────────────────────────────────────────────────

@csrf_exempt
def api_categorias(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    if request.method == 'GET':
        qs = CategoriaBem.objects.filter(empresa=empresa, ativo=True)
        return JsonResponse([{'id': c.id, 'nome': c.nome} for c in qs], safe=False)

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            return _err('JSON inválido')
        nome = (data.get('nome') or '').strip()
        if not nome:
            return _err('Nome obrigatório')
        c, _ = CategoriaBem.objects.get_or_create(empresa=empresa, nome=nome, defaults={'ativo': True})
        c.ativo = True
        c.save(update_fields=['ativo'])
        return JsonResponse({'ok': True, 'id': c.id, 'nome': c.nome})

    return _err('Método não permitido', 405)


# ─── DEPARTAMENTOS ────────────────────────────────────────────────────────────

@csrf_exempt
def api_departamentos(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    if request.method == 'GET':
        qs = Departamento.objects.filter(empresa=empresa, ativo=True)
        return JsonResponse([{'id': d.id, 'nome': d.nome} for d in qs], safe=False)

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            return _err('JSON inválido')
        nome = (data.get('nome') or '').strip()
        if not nome:
            return _err('Nome obrigatório')
        d, _ = Departamento.objects.get_or_create(empresa=empresa, nome=nome, defaults={'ativo': True})
        d.ativo = True
        d.save(update_fields=['ativo'])
        return JsonResponse({'ok': True, 'id': d.id, 'nome': d.nome})

    return _err('Método não permitido', 405)


# ─── BENS ─────────────────────────────────────────────────────────────────────

@csrf_exempt
def api_bens(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    if request.method == 'GET':
        qs = Bem.objects.filter(empresa=empresa).select_related('categoria', 'departamento')

        situacao = request.GET.get('situacao')
        cat_id   = request.GET.get('categoria_id')
        dep_id   = request.GET.get('departamento_id')
        q        = request.GET.get('q', '').strip()
        pendente = request.GET.get('pendente')

        if situacao:
            qs = qs.filter(situacao=situacao)
        if cat_id:
            qs = qs.filter(categoria_id=cat_id)
        if dep_id:
            qs = qs.filter(departamento_id=dep_id)
        if q:
            qs = qs.filter(Q(plaqueta__icontains=q) | Q(descricao__icontains=q) | Q(nota_fiscal__icontains=q))
        if pendente == '1':
            qs = qs.filter(Q(valor_aquisicao__isnull=True) | Q(nota_fiscal=''))

        return JsonResponse([_bem_dict(b, request) for b in qs], safe=False)

    if request.method == 'POST':
        is_multi = request.content_type and 'multipart' in request.content_type
        data = request.POST if is_multi else {}
        if not is_multi:
            try:
                data = json.loads(request.body)
            except Exception:
                return _err('JSON inválido')

        plaqueta        = (data.get('plaqueta') or '').strip().upper()
        descricao       = (data.get('descricao') or '').strip()
        categoria_id    = data.get('categoria_id')
        departamento_id = data.get('departamento_id')

        erros = []
        if not plaqueta:        erros.append('Plaqueta obrigatória')
        if not descricao:       erros.append('Descrição obrigatória')
        if not categoria_id:    erros.append('Categoria obrigatória')
        if not departamento_id: erros.append('Departamento obrigatório')
        if erros:
            return JsonResponse({'ok': False, 'erros': erros}, status=400)

        if Bem.objects.filter(plaqueta=plaqueta).exists():
            return _err(f'Plaqueta {plaqueta} já cadastrada')

        try:
            cat = CategoriaBem.objects.get(id=categoria_id, empresa=empresa)
            dep = Departamento.objects.get(id=departamento_id, empresa=empresa)
        except (CategoriaBem.DoesNotExist, Departamento.DoesNotExist):
            return _err('Categoria ou departamento não encontrado')

        bem = Bem(
            empresa         = empresa,
            plaqueta        = plaqueta,
            descricao       = descricao,
            categoria       = cat,
            departamento    = dep,
            localizacao     = (data.get('localizacao') or '').strip(),
            responsavel     = (data.get('responsavel') or '').strip(),
            nota_fiscal     = (data.get('nota_fiscal') or '').strip(),
            fornecedor      = (data.get('fornecedor') or '').strip(),
            data_aquisicao  = data.get('data_aquisicao') or None,
            valor_aquisicao = _parse_valor(str(data.get('valor_aquisicao') or '')),
            observacoes     = (data.get('observacoes') or '').strip(),
        )
        if 'foto' in request.FILES:
            bem.foto = request.FILES['foto']
        bem.save()
        return JsonResponse({'ok': True, 'id': bem.id})

    return _err('Método não permitido', 405)


@csrf_exempt
def api_bem_detalhe(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    try:
        bem = Bem.objects.select_related('categoria', 'departamento').get(pk=pk, empresa=empresa)
    except Bem.DoesNotExist:
        return _err('Bem não encontrado', 404)

    if request.method == 'GET':
        return JsonResponse(_bem_dict(bem, request))

    if request.method in ('PUT', 'PATCH'):
        is_multi = request.content_type and 'multipart' in request.content_type
        data = request.POST if is_multi else {}
        if not is_multi:
            try:
                data = json.loads(request.body)
            except Exception:
                return _err('JSON inválido')

        if 'descricao' in data:      bem.descricao      = data['descricao'].strip()
        if 'localizacao' in data:    bem.localizacao    = data['localizacao'].strip()
        if 'responsavel' in data:    bem.responsavel    = data['responsavel'].strip()
        if 'nota_fiscal' in data:    bem.nota_fiscal    = data['nota_fiscal'].strip()
        if 'fornecedor' in data:     bem.fornecedor     = data['fornecedor'].strip()
        if 'data_aquisicao' in data: bem.data_aquisicao = data['data_aquisicao'] or None
        if 'valor_aquisicao' in data:
            bem.valor_aquisicao = _parse_valor(str(data['valor_aquisicao']))
        if 'observacoes' in data:    bem.observacoes    = data['observacoes'].strip()
        if 'situacao' in data:       bem.situacao       = data['situacao']
        if 'categoria_id' in data:
            try:
                bem.categoria = CategoriaBem.objects.get(id=data['categoria_id'], empresa=empresa)
            except CategoriaBem.DoesNotExist:
                return _err('Categoria não encontrada')
        if 'departamento_id' in data:
            try:
                bem.departamento = Departamento.objects.get(id=data['departamento_id'], empresa=empresa)
            except Departamento.DoesNotExist:
                return _err('Departamento não encontrado')
        if 'foto' in request.FILES:
            bem.foto = request.FILES['foto']
        bem.save()
        return JsonResponse({'ok': True})

    if request.method == 'DELETE':
        bem.delete()
        return JsonResponse({'ok': True})

    return _err('Método não permitido', 405)


@csrf_exempt
def api_bem_baixar(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    if request.method != 'POST':
        return _err('Método não permitido', 405)

    try:
        bem = Bem.objects.get(pk=pk, empresa=empresa)
    except Bem.DoesNotExist:
        return _err('Bem não encontrado', 404)

    try:
        data = json.loads(request.body)
    except Exception:
        return _err('JSON inválido')

    motivo = data.get('motivo_baixa', '').strip()
    if motivo not in dict(Bem.MOTIVO_BAIXA_CHOICES):
        return _err('Motivo de baixa inválido')

    obs_extra = (data.get('observacoes') or '').strip()
    bem.situacao     = Bem.BAIXADO
    bem.data_baixa   = data.get('data_baixa') or timezone.now().date().isoformat()
    bem.motivo_baixa = motivo
    if obs_extra:
        bem.observacoes = (bem.observacoes + '\n' + obs_extra).strip()
    bem.save()
    return JsonResponse({'ok': True})


# ─── LANÇAMENTO EM LOTE ───────────────────────────────────────────────────────

@csrf_exempt
def api_lancamento(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    if request.method != 'POST':
        return _err('Método não permitido', 405)

    try:
        payload = json.loads(request.body)
    except Exception:
        return _err('JSON inválido')

    cab   = payload.get('cabecalho', {})
    itens = payload.get('itens', [])

    if not itens:
        return _err('Nenhum item enviado')

    categoria_id    = cab.get('categoria_id')
    departamento_id = cab.get('departamento_id')
    if not categoria_id or not departamento_id:
        return _err('Categoria e departamento obrigatórios no cabeçalho')

    try:
        cat = CategoriaBem.objects.get(id=categoria_id, empresa=empresa)
        dep = Departamento.objects.get(id=departamento_id, empresa=empresa)
    except (CategoriaBem.DoesNotExist, Departamento.DoesNotExist):
        return _err('Categoria ou departamento não encontrado')

    # Validar todos os itens antes de salvar qualquer coisa
    plaquetas_lote = set()
    erros = []
    for i, item in enumerate(itens):
        plaqueta  = (item.get('plaqueta') or '').strip().upper()
        descricao = (item.get('descricao') or '').strip()
        if not plaqueta:
            erros.append(f'Linha {i + 1}: plaqueta obrigatória')
            continue
        if not descricao:
            erros.append(f'Linha {i + 1}: descrição obrigatória')
        if plaqueta in plaquetas_lote:
            erros.append(f'Linha {i + 1}: plaqueta {plaqueta} duplicada no lote')
        else:
            plaquetas_lote.add(plaqueta)
        if Bem.objects.filter(plaqueta=plaqueta).exists():
            erros.append(f'Linha {i + 1}: plaqueta {plaqueta} já existe no sistema')

    if erros:
        return JsonResponse({'ok': False, 'erros': erros}, status=400)

    nota_fiscal    = (cab.get('nota_fiscal') or '').strip()
    fornecedor     = (cab.get('fornecedor') or '').strip()
    data_aquisicao = cab.get('data_aquisicao') or None
    responsavel    = (cab.get('responsavel') or '').strip()
    localizacao    = (cab.get('localizacao') or '').strip()

    with transaction.atomic():
        criados = []
        for item in itens:
            plaqueta  = item.get('plaqueta', '').strip().upper()
            descricao = item.get('descricao', '').strip()
            loc_item  = (item.get('localizacao') or localizacao).strip()
            valor     = _parse_valor(str(item.get('valor') or ''))
            b = Bem.objects.create(
                empresa         = empresa,
                plaqueta        = plaqueta,
                descricao       = descricao,
                categoria       = cat,
                departamento    = dep,
                localizacao     = loc_item,
                responsavel     = responsavel,
                nota_fiscal     = nota_fiscal,
                fornecedor      = fornecedor,
                data_aquisicao  = data_aquisicao,
                valor_aquisicao = valor,
            )
            criados.append({'id': b.id, 'plaqueta': b.plaqueta})

    return JsonResponse({'ok': True, 'total': len(criados), 'bens': criados})


# ─── INVENTÁRIOS ──────────────────────────────────────────────────────────────

@csrf_exempt
def api_inventarios(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    if request.method == 'GET':
        qs = Inventario.objects.filter(empresa=empresa)
        data = [
            {
                'id':          inv.id,
                'data':        inv.data.isoformat(),
                'local_area':  inv.local_area,
                'responsavel': inv.responsavel,
                'status':      inv.status,
                'total_itens': inv.itens.count(),
                'criado_em':   inv.criado_em.isoformat(),
            }
            for inv in qs
        ]
        return JsonResponse(data, safe=False)

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            return _err('JSON inválido')
        data_inv = data.get('data')
        if not data_inv:
            return _err('Data obrigatória')
        inv = Inventario.objects.create(
            empresa     = empresa,
            data        = data_inv,
            local_area  = (data.get('local_area') or '').strip(),
            responsavel = (data.get('responsavel') or '').strip(),
            observacoes = (data.get('observacoes') or '').strip(),
        )
        return JsonResponse({'ok': True, 'id': inv.id})

    return _err('Método não permitido', 405)


def api_inventario_detalhe(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    try:
        inv = Inventario.objects.get(pk=pk, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)

    itens = inv.itens.select_related('bem', 'bem__categoria', 'bem__departamento').all()
    return JsonResponse({
        'id':          inv.id,
        'data':        inv.data.isoformat(),
        'local_area':  inv.local_area,
        'responsavel': inv.responsavel,
        'status':      inv.status,
        'observacoes': inv.observacoes,
        'criado_em':   inv.criado_em.isoformat(),
        'itens':       [_item_dict(i, request) for i in itens],
    })


@csrf_exempt
def api_inventario_finalizar(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    if request.method != 'POST':
        return _err('Método não permitido', 405)

    try:
        inv = Inventario.objects.get(pk=pk, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)

    inv.status = Inventario.FINALIZADO
    inv.save(update_fields=['status'])
    return JsonResponse({'ok': True})


@csrf_exempt
def api_inventario_leitura(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    if request.method != 'POST':
        return _err('Método não permitido', 405)

    try:
        inv = Inventario.objects.get(pk=pk, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)

    if inv.status == Inventario.FINALIZADO:
        return _err('Inventário já finalizado')

    try:
        data = json.loads(request.body)
    except Exception:
        return _err('JSON inválido')

    plaqueta = (data.get('plaqueta') or '').strip()
    if not plaqueta:
        return _err('Plaqueta obrigatória')

    item, created = registrar_leitura(
        inventario             = inv,
        plaqueta               = plaqueta,
        localizacao_encontrada = data.get('localizacao_encontrada', ''),
        contado_por            = data.get('contado_por', ''),
        observacao             = data.get('observacao', ''),
    )
    return JsonResponse({'ok': True, 'criado': created, 'item': _item_dict(item, request)})


def api_inventario_relatorio(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    try:
        inv = Inventario.objects.get(pk=pk, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)

    r = reconciliar(inv)

    def _b(b):
        return {
            'id':              b.id,
            'plaqueta':        b.plaqueta,
            'descricao':       b.descricao,
            'categoria':       b.categoria.nome if b.categoria_id else '',
            'departamento':    b.departamento.nome if b.departamento_id else '',
            'localizacao':     b.localizacao,
            'valor_aquisicao': float(b.valor_aquisicao) if b.valor_aquisicao else None,
        }

    return JsonResponse({
        'inventario':         {'id': inv.id, 'data': inv.data.isoformat(), 'local_area': inv.local_area},
        'localizados':        [_item_dict(i, request) for i in r['localizados']],
        'divergentes':        [_item_dict(i, request) for i in r['divergentes']],
        'nao_cadastrados':    [_item_dict(i, request) for i in r['nao_cadastrados']],
        'fantasmas':          [_b(b) for b in r['fantasmas']],
        'total_esperados':    r['total_esperados'],
        'total_contados':     r['total_contados'],
        'indice_localizacao': r['indice_localizacao'],
        'valor_fantasmas':    r['valor_fantasmas'],
    })
