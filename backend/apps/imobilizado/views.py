import io
import json
import uuid
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from .models import CategoriaBem, Departamento, LocalizacaoBem, Bem, Inventario, ItemInventario
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
            'id':            b.id,
            'plaqueta':      b.plaqueta,
            'descricao':     b.descricao,
            'localizacao':   b.localizacao,
            'foto_url':      foto_url,
            'categoria':     {'id': b.categoria_id, 'nome': b.categoria.nome} if b.categoria_id else None,
            'departamento':  {'id': b.departamento_id, 'nome': b.departamento.nome} if b.departamento_id else None,
            'valor_aquisicao': float(b.valor_aquisicao) if b.valor_aquisicao is not None else None,
        }

    foto_prov_url = None
    if request and item.foto_provisoria:
        try:
            foto_prov_url = request.build_absolute_uri(item.foto_provisoria.url)
        except Exception:
            pass

    foto_leitura_url = None
    if request and item.foto_leitura:
        try:
            foto_leitura_url = request.build_absolute_uri(item.foto_leitura.url)
        except Exception:
            pass

    return {
        'id':                         item.id,
        'plaqueta_lida':              item.plaqueta_lida,
        'situacao':                   item.situacao,
        'bem':                        bem_data,
        'localizacao_encontrada':     item.localizacao_encontrada,
        'contado_por':                item.contado_por,
        'contado_em':                 item.contado_em.isoformat(),
        'observacao':                 item.observacao,
        'quantidade':                 item.quantidade,
        'descricao_provisoria':       item.descricao_provisoria,
        'foto_provisoria_url':        foto_prov_url,
        'foto_leitura_url':           foto_leitura_url,
        'categoria_provisoria_id':    item.categoria_provisoria_id,
        'departamento_provisorio_id': item.departamento_provisorio_id,
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


# ─── LOCALIZAÇÕES ────────────────────────────────────────────────────────────

@csrf_exempt
def api_localizacoes(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    if request.method == 'GET':
        qs = LocalizacaoBem.objects.filter(empresa=empresa, ativo=True)
        return JsonResponse([{'id': l.id, 'nome': l.nome} for l in qs], safe=False)

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            return _err('JSON inválido')
        nome = (data.get('nome') or '').strip()
        if not nome:
            return _err('Nome obrigatório')
        l, _ = LocalizacaoBem.objects.get_or_create(empresa=empresa, nome=nome, defaults={'ativo': True})
        l.ativo = True
        l.save(update_fields=['ativo'])
        return JsonResponse({'ok': True, 'id': l.id, 'nome': l.nome})

    if request.method == 'DELETE':
        pk = request.GET.get('id')
        LocalizacaoBem.objects.filter(pk=pk, empresa=empresa).update(ativo=False)
        return JsonResponse({'ok': True})

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

    is_multi = request.content_type and 'multipart' in request.content_type
    if is_multi:
        try:
            cab   = json.loads(request.POST.get('cabecalho', '{}'))
            itens = json.loads(request.POST.get('itens', '[]'))
        except Exception:
            return _err('Dados inválidos no formulário')
    else:
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
        for i, item in enumerate(itens):
            plaqueta  = item.get('plaqueta', '').strip().upper()
            descricao = item.get('descricao', '').strip()
            loc_item  = (item.get('localizacao') or localizacao).strip()
            valor     = _parse_valor(str(item.get('valor') or ''))
            b = Bem(
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
            foto_file = request.FILES.get(f'foto_{i}')
            if foto_file:
                b.foto = foto_file
            b.save()
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
                'token':       str(inv.token),
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


@csrf_exempt
def api_inventario_detalhe(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    try:
        inv = Inventario.objects.get(pk=pk, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)

    if request.method == 'DELETE':
        inv.delete()
        return JsonResponse({'ok': True})

    itens = inv.itens.select_related('bem', 'bem__categoria', 'bem__departamento').all()
    return JsonResponse({
        'id':          inv.id,
        'token':       str(inv.token),
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

    inv.status = Inventario.AGUARDANDO
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

    if inv.status != Inventario.ABERTO:
        return _err('Inventário não está aberto para leituras')

    is_multi = request.content_type and 'multipart' in request.content_type
    if is_multi:
        data = request.POST
    else:
        try:
            data = json.loads(request.body)
        except Exception:
            return _err('JSON inválido')

    plaqueta = (data.get('plaqueta') or '').strip()
    if not plaqueta:
        return _err('Plaqueta obrigatória')

    cat_id = data.get('categoria_provisoria_id')
    dep_id = data.get('departamento_provisorio_id')
    qtd    = data.get('quantidade', 1)

    item, created = registrar_leitura(
        inventario                 = inv,
        plaqueta                   = plaqueta,
        localizacao_encontrada     = data.get('localizacao_encontrada', ''),
        contado_por                = data.get('contado_por', ''),
        observacao                 = data.get('observacao', ''),
        descricao_provisoria       = data.get('descricao_provisoria', ''),
        foto_provisoria            = request.FILES.get('foto_provisoria') if is_multi else None,
        foto_leitura               = request.FILES.get('foto_leitura') if is_multi else None,
        categoria_provisoria_id    = int(cat_id) if cat_id else None,
        departamento_provisorio_id = int(dep_id) if dep_id else None,
        quantidade                 = int(qtd) if qtd else 1,
    )
    return JsonResponse({'ok': True, 'criado': created, 'item': _item_dict(item, request)})


def api_bem_buscar(request):
    """Busca um bem pela plaqueta exata — sem registrar leitura. Usado na confirmação mobile."""
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    plaqueta = (request.GET.get('plaqueta') or '').strip().upper()
    if not plaqueta:
        return _err('Plaqueta obrigatória')
    try:
        bem = Bem.objects.select_related('categoria', 'departamento').get(
            plaqueta__iexact=plaqueta, empresa=empresa
        )
        return JsonResponse({'encontrado': True, 'bem': _bem_dict(bem, request)})
    except Bem.DoesNotExist:
        return JsonResponse({'encontrado': False, 'plaqueta': plaqueta})


@csrf_exempt
def api_inventario_por_token(request, token):
    """Acesso público ao inventário via UUID token — só funciona se status=ABERTO."""
    empresa = _empresa(request)
    if not empresa:
        return _err('Link inválido ou inventário já finalizado', 401)
    try:
        inv = Inventario.objects.get(token=token, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)

    itens = inv.itens.select_related('bem', 'bem__categoria', 'bem__departamento').all()
    return JsonResponse({
        'id':          inv.id,
        'token':       str(inv.token),
        'data':        inv.data.isoformat(),
        'local_area':  inv.local_area,
        'responsavel': inv.responsavel,
        'status':      inv.status,
        'observacoes': inv.observacoes,
        'criado_em':   inv.criado_em.isoformat(),
        'itens':       [_item_dict(i, request) for i in itens],
    })


@csrf_exempt
def api_inventario_novo_link(request, pk):
    """Gera um novo UUID token para o inventário, invalidando o link anterior."""
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    if request.method != 'POST':
        return _err('Método não permitido', 405)
    try:
        inv = Inventario.objects.get(pk=pk, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)

    inv.token = uuid.uuid4()
    inv.save(update_fields=['token'])
    return JsonResponse({'ok': True, 'token': str(inv.token)})


@csrf_exempt
def api_inventario_conciliar(request, pk):
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

    with transaction.atomic():
        for dec in data.get('nao_cadastrados', []):
            try:
                item = ItemInventario.objects.select_related('bem').get(
                    pk=dec['item_id'], inventario=inv
                )
            except (ItemInventario.DoesNotExist, KeyError):
                continue

            if dec.get('acao') != 'incorporar':
                continue

            descricao = (dec.get('descricao') or item.descricao_provisoria or '').strip()
            cat_id    = dec.get('categoria_id') or item.categoria_provisoria_id
            dep_id    = dec.get('departamento_id') or item.departamento_provisorio_id

            if not descricao or not cat_id or not dep_id:
                continue

            try:
                cat = CategoriaBem.objects.get(id=cat_id, empresa=empresa)
                dep = Departamento.objects.get(id=dep_id, empresa=empresa)
            except (CategoriaBem.DoesNotExist, Departamento.DoesNotExist):
                continue

            valor_aq  = _parse_valor(str(dec.get('valor_aquisicao') or ''))
            nota_fisc = (dec.get('nota_fiscal') or '').strip()
            plaquetas_list = [p.strip().upper() for p in (dec.get('plaquetas') or []) if str(p).strip()]

            if plaquetas_list:
                # Lote de sobras: cria um Bem para cada plaqueta informada
                ultimo_bem = None
                for plq in plaquetas_list:
                    if Bem.objects.filter(plaqueta=plq).exists():
                        continue
                    b = Bem(
                        empresa         = empresa,
                        plaqueta        = plq,
                        descricao       = descricao,
                        categoria       = cat,
                        departamento    = dep,
                        localizacao     = item.localizacao_encontrada,
                        nota_fiscal     = nota_fisc,
                        valor_aquisicao = valor_aq,
                    )
                    if item.foto_provisoria:
                        b.foto = item.foto_provisoria
                    b.save()
                    ultimo_bem = b
                item.bem      = ultimo_bem
                item.situacao = ItemInventario.LOCALIZADO
                item.save(update_fields=['bem', 'situacao'])
            else:
                # Item unitário (quantidade=1): usa plaqueta_lida como plaqueta
                if Bem.objects.filter(plaqueta=item.plaqueta_lida).exists():
                    continue
                bem = Bem(
                    empresa         = empresa,
                    plaqueta        = item.plaqueta_lida,
                    descricao       = descricao,
                    categoria       = cat,
                    departamento    = dep,
                    localizacao     = item.localizacao_encontrada,
                    nota_fiscal     = nota_fisc,
                    valor_aquisicao = valor_aq,
                )
                if item.foto_provisoria:
                    bem.foto = item.foto_provisoria
                bem.save()
                item.bem      = bem
                item.situacao = ItemInventario.LOCALIZADO
                item.save(update_fields=['bem', 'situacao'])

        for dec in data.get('divergentes', []):
            if not dec.get('atualizar_local'):
                continue
            try:
                item = ItemInventario.objects.get(pk=dec['item_id'], inventario=inv)
            except (ItemInventario.DoesNotExist, KeyError):
                continue
            if item.bem_id and item.localizacao_encontrada:
                Bem.objects.filter(pk=item.bem_id).update(localizacao=item.localizacao_encontrada)

        inv.status = Inventario.FINALIZADO
        inv.save(update_fields=['status'])

    return JsonResponse({'ok': True})


@csrf_exempt
def api_bens_exportar(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    if request.method != 'GET':
        return _err('Método não permitido', 405)

    import pandas as pd

    qs = Bem.objects.filter(empresa=empresa).select_related('categoria', 'departamento')

    situacao = request.GET.get('situacao')
    cat_id   = request.GET.get('categoria_id')
    dep_id   = request.GET.get('departamento_id')
    q        = request.GET.get('q', '').strip()
    pendente = request.GET.get('pendente')

    if situacao:  qs = qs.filter(situacao=situacao)
    if cat_id:    qs = qs.filter(categoria_id=cat_id)
    if dep_id:    qs = qs.filter(departamento_id=dep_id)
    if q:         qs = qs.filter(Q(plaqueta__icontains=q) | Q(descricao__icontains=q) | Q(nota_fiscal__icontains=q))
    if pendente == '1':
        qs = qs.filter(Q(valor_aquisicao__isnull=True) | Q(nota_fiscal=''))

    rows = []
    for b in qs:
        rows.append({
            'Plaqueta':       b.plaqueta,
            'Descrição':      b.descricao,
            'Categoria':      b.categoria.nome if b.categoria_id else '',
            'Departamento':   b.departamento.nome if b.departamento_id else '',
            'Localização':    b.localizacao,
            'Responsável':    b.responsavel,
            'Nota Fiscal':    b.nota_fiscal,
            'Fornecedor':     b.fornecedor,
            'Data Aquisição': b.data_aquisicao.isoformat() if b.data_aquisicao else '',
            'Valor Aquisição': float(b.valor_aquisicao) if b.valor_aquisicao is not None else '',
            'Situação':       dict(Bem.SITUACAO_CHOICES).get(b.situacao, b.situacao),
        })

    df  = pd.DataFrame(rows) if rows else pd.DataFrame(columns=[
        'Plaqueta', 'Descrição', 'Categoria', 'Departamento', 'Localização',
        'Responsável', 'Nota Fiscal', 'Fornecedor', 'Data Aquisição', 'Valor Aquisição', 'Situação',
    ])
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Bens')
    buf.seek(0)

    resp = HttpResponse(
        buf.read(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    resp['Content-Disposition'] = 'attachment; filename="bens_imobilizado.xlsx"'
    return resp


@csrf_exempt
def api_bens_importar(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    if request.method != 'POST':
        return _err('Método não permitido', 405)

    arquivo = request.FILES.get('arquivo')
    if not arquivo:
        return _err('Arquivo obrigatório')

    import pandas as pd

    try:
        df = pd.read_excel(arquivo)
    except Exception as exc:
        return _err(f'Erro ao ler arquivo: {exc}')

    erros   = []
    criados = 0
    ignorados = 0

    with transaction.atomic():
        for idx, row in df.iterrows():
            linha = idx + 2
            plaqueta  = str(row.get('Plaqueta') or '').strip().upper()
            descricao = str(row.get('Descrição') or '').strip()
            if not plaqueta or not descricao:
                erros.append(f'Linha {linha}: Plaqueta e Descrição são obrigatórias')
                continue

            if Bem.objects.filter(plaqueta=plaqueta).exists():
                ignorados += 1
                continue

            cat_nome = str(row.get('Categoria') or '').strip()
            dep_nome = str(row.get('Departamento') or '').strip()

            cat, _ = CategoriaBem.objects.get_or_create(
                empresa=empresa, nome=cat_nome or 'Outros', defaults={'ativo': True}
            )
            dep, _ = Departamento.objects.get_or_create(
                empresa=empresa, nome=dep_nome or 'Geral', defaults={'ativo': True}
            )

            valor = None
            raw_val = row.get('Valor Aquisição')
            if raw_val is not None and str(raw_val).strip() not in ('', 'nan'):
                valor = _parse_valor(str(raw_val).replace(',', '.'))

            data_aq = None
            raw_dt = row.get('Data Aquisição')
            if raw_dt is not None and str(raw_dt).strip() not in ('', 'nan'):
                try:
                    data_aq = pd.to_datetime(raw_dt).date()
                except Exception:
                    pass

            Bem.objects.create(
                empresa         = empresa,
                plaqueta        = plaqueta,
                descricao       = descricao,
                categoria       = cat,
                departamento    = dep,
                localizacao     = str(row.get('Localização') or '').strip(),
                responsavel     = str(row.get('Responsável') or '').strip(),
                nota_fiscal     = str(row.get('Nota Fiscal') or '').strip(),
                fornecedor      = str(row.get('Fornecedor') or '').strip(),
                data_aquisicao  = data_aq,
                valor_aquisicao = valor,
            )
            criados += 1

    return JsonResponse({'ok': True, 'criados': criados, 'ignorados': ignorados, 'erros': erros})


def api_inventario_relatorio_exportar(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    try:
        inv = Inventario.objects.get(pk=pk, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)

    import pandas as pd

    r = reconciliar(inv)
    rows = []

    def add_item(item, sit_label):
        bem = item.bem
        rows.append({
            'Situação':         sit_label,
            'Plaqueta':         item.plaqueta_lida,
            'Descrição':        bem.descricao if bem else (item.descricao_provisoria or '—'),
            'Categoria':        (bem.categoria.nome if bem and bem.categoria_id else None) or '—',
            'Departamento':     (bem.departamento.nome if bem and bem.departamento_id else None) or '—',
            'Local no Sistema': (bem.localizacao if bem else None) or '—',
            'Local Encontrado': item.localizacao_encontrada or '—',
            'Valor':            float(bem.valor_aquisicao) if bem and bem.valor_aquisicao else None,
            'Contado Por':      item.contado_por or '—',
        })

    for item in r['localizados']:     add_item(item, 'Localizado')
    for item in r['divergentes']:     add_item(item, 'Local Divergente')
    for item in r['nao_cadastrados']: add_item(item, 'Não Cadastrado')
    for b in r['fantasmas']:
        rows.append({
            'Situação':         'Não Localizado',
            'Plaqueta':         b.plaqueta,
            'Descrição':        b.descricao,
            'Categoria':        b.categoria.nome if b.categoria_id else '—',
            'Departamento':     b.departamento.nome if b.departamento_id else '—',
            'Local no Sistema': b.localizacao or '—',
            'Local Encontrado': '—',
            'Valor':            float(b.valor_aquisicao) if b.valor_aquisicao else None,
            'Contado Por':      '—',
        })

    cols = ['Situação','Plaqueta','Descrição','Categoria','Departamento','Local no Sistema','Local Encontrado','Valor','Contado Por']
    df  = pd.DataFrame(rows) if rows else pd.DataFrame(columns=cols)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Relatório')
    buf.seek(0)

    resp = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    resp['Content-Disposition'] = f'attachment; filename="relatorio_{inv.data}.xlsx"'
    return resp


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
