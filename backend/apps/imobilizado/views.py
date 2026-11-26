import io
import json
import uuid
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.db.models import Q, Sum, Count
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from .models import CategoriaBem, Departamento, LocalizacaoBem, Bem, Inventario, ItemInventario, TransferenciaAtivo, LogAuditoria
from .services import registrar_leitura, reconciliar


def _get_usuario(request):
    if hasattr(request, 'user') and request.user.is_authenticated:
        return request.user.get_full_name() or request.user.username
    return 'Sistema'


def _log(empresa, acao, descricao, request):
    try:
        LogAuditoria.objects.create(
            empresa=empresa,
            acao=acao,
            descricao=descricao,
            usuario=_get_usuario(request),
        )
    except Exception:
        pass


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
        _log(empresa, LogAuditoria.CRIAR_BEM, f'Bem {bem.plaqueta} – {bem.descricao} criado', request)
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
        _log(empresa, LogAuditoria.EDITAR_BEM, f'Bem {bem.plaqueta} – {bem.descricao} editado', request)
        return JsonResponse({'ok': True})

    if request.method == 'DELETE':
        _log(empresa, LogAuditoria.EXCLUIR_BEM, f'Bem {bem.plaqueta} – {bem.descricao} excluído', request)
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
    _log(empresa, LogAuditoria.BAIXAR_BEM, f'Bem {bem.plaqueta} baixado por motivo: {motivo}', request)
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
                'link_ativo':  inv.link_ativo,
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
        _log(empresa, LogAuditoria.CRIAR_INV, f'Inventário {data_inv} criado – área: {inv.local_area or "geral"}', request)
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
    _log(empresa, LogAuditoria.FINALIZAR_INV, f'Inventário {inv.data} finalizado para conciliação', request)
    return JsonResponse({'ok': True})


@csrf_exempt
def api_inventario_reabrir(request, pk):
    """Reabre um inventário FINALIZADO para ajustes (volta para AGUARDANDO)."""
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    if request.method != 'POST':
        return _err('Método não permitido', 405)
    try:
        inv = Inventario.objects.get(pk=pk, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)
    if inv.status != Inventario.FINALIZADO:
        return _err('Somente inventários finalizados podem ser reabertos')
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

    import uuid as _uuid
    plaqueta = (data.get('plaqueta') or '').strip()
    if not plaqueta:
        plaqueta = f'SEM-{_uuid.uuid4().hex[:8].upper()}'

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
                item.bem             = ultimo_bem
                item.situacao        = ItemInventario.LOCALIZADO
                item.foi_incorporado = True
                item.save(update_fields=['bem', 'situacao', 'foi_incorporado'])
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
                item.bem              = bem
                item.situacao         = ItemInventario.LOCALIZADO
                item.foi_incorporado  = True
                item.save(update_fields=['bem', 'situacao', 'foi_incorporado'])

        for dec in data.get('divergentes', []):
            if not dec.get('atualizar_local'):
                continue
            try:
                item = ItemInventario.objects.get(pk=dec['item_id'], inventario=inv)
            except (ItemInventario.DoesNotExist, KeyError):
                continue
            if item.bem_id and item.localizacao_encontrada:
                Bem.objects.filter(pk=item.bem_id).update(localizacao=item.localizacao_encontrada)
                item.local_foi_atualizado = True
                item.save(update_fields=['local_foi_atualizado'])

        inv.status = Inventario.FINALIZADO
        inv.save(update_fields=['status'])
        _log(empresa, LogAuditoria.CONCILIAR_INV, f'Inventário {inv.data} conciliado e finalizado', request)

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

    # Mapeamento de aliases: nome alternativo → nome canônico
    _ALIASES = {
        'Placa':              'Plaqueta',
        'Descrição do bem':   'Descrição',
        'Descrição do local': 'Localização',
        'NF':                 'Nota Fiscal',
        'Data da Aquisição':  'Data Aquisição',
        'Valor':              'Valor Aquisição',
    }

    try:
        df = pd.read_excel(arquivo, sheet_name=0)
    except Exception as exc:
        return _err(f'Erro ao ler arquivo: {exc}')

    df.rename(columns=_ALIASES, inplace=True)

    erros   = []
    criados = 0
    ignorados = 0

    with transaction.atomic():
        for idx, row in df.iterrows():
            linha = idx + 2

            raw_val_plq  = row.get('Plaqueta')
            # pandas pode ler números inteiros como float (87 → 87.0); normaliza para string limpa
            if raw_val_plq is not None:
                try:
                    raw_plaqueta = str(int(float(raw_val_plq))).strip().upper()
                except (ValueError, TypeError):
                    raw_plaqueta = str(raw_val_plq).strip().upper()
            else:
                raw_plaqueta = ''

            descricao = str(row.get('Descrição') or '').strip()

            if not raw_plaqueta or raw_plaqueta in ('NAN', '') or not descricao or descricao == 'NAN':
                erros.append(f'Linha {linha}: Plaqueta e Descrição são obrigatórias')
                continue

            # Zero-pad para 6 dígitos quando a plaqueta for numérica pura
            if raw_plaqueta.isdigit():
                plaqueta = raw_plaqueta.zfill(6)
            else:
                plaqueta = raw_plaqueta

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


# ─── RELATÓRIO FINAL (Excel ou PDF) para assinatura do gestor ─────────────────

def _build_relatorio_final_data(inv, empresa):
    """Monta os dados das 3 seções para o relatório final."""
    import pandas as pd

    r = reconciliar(inv)

    # ── Aba 1: Diferenças ──
    diferencas = []
    for i in r['divergentes']:
        b = i.bem
        diferencas.append({
            'Tipo':             'Local Divergente',
            'Plaqueta':         i.plaqueta_lida,
            'Descrição':        b.descricao if b else '—',
            'Categoria':        (b.categoria.nome if b and b.categoria_id else None) or '—',
            'Departamento':     (b.departamento.nome if b and b.departamento_id else None) or '—',
            'Local no Sistema': (b.localizacao if b else None) or '—',
            'Local Encontrado': i.localizacao_encontrada or '—',
            'Valor (R$)':       float(b.valor_aquisicao) if b and b.valor_aquisicao else None,
        })
    for i in r['nao_cadastrados']:
        diferencas.append({
            'Tipo':             'Não Cadastrado',
            'Plaqueta':         i.plaqueta_lida,
            'Descrição':        i.descricao_provisoria or '—',
            'Categoria':        '—',
            'Departamento':     '—',
            'Local no Sistema': '—',
            'Local Encontrado': i.localizacao_encontrada or '—',
            'Valor (R$)':       None,
        })
    for b in r['fantasmas']:
        diferencas.append({
            'Tipo':             'Não Localizado',
            'Plaqueta':         b.plaqueta,
            'Descrição':        b.descricao,
            'Categoria':        b.categoria.nome if b.categoria_id else '—',
            'Departamento':     b.departamento.nome if b.departamento_id else '—',
            'Local no Sistema': b.localizacao or '—',
            'Local Encontrado': '—',
            'Valor (R$)':       float(b.valor_aquisicao) if b.valor_aquisicao else None,
        })

    # ── Aba 2: Ajustes Realizados ──
    ajustes = []
    itens_ajuste = ItemInventario.objects.filter(
        inventario=inv
    ).filter(
        models.Q(foi_incorporado=True) | models.Q(local_foi_atualizado=True)
    ).select_related('bem', 'bem__categoria', 'bem__departamento')

    for i in itens_ajuste:
        b = i.bem
        if i.foi_incorporado:
            tipo = 'Bem Incorporado ao Sistema'
        else:
            tipo = 'Localização Atualizada'
        ajustes.append({
            'Tipo de Ajuste':   tipo,
            'Plaqueta':         i.plaqueta_lida,
            'Descrição':        b.descricao if b else i.descricao_provisoria or '—',
            'Categoria':        (b.categoria.nome if b and b.categoria_id else None) or '—',
            'Departamento':     (b.departamento.nome if b and b.departamento_id else None) or '—',
            'Local Anterior':   '—' if i.foi_incorporado else (b.localizacao if b else '—'),
            'Local Atual':      i.localizacao_encontrada or '—',
            'Valor (R$)':       float(b.valor_aquisicao) if b and b.valor_aquisicao else None,
        })

    # ── Aba 3: Posição Atual ──
    bens_qs = Bem.objects.filter(
        empresa=empresa, situacao__in=[Bem.EM_USO, Bem.MANUTENCAO]
    ).select_related('categoria', 'departamento').order_by('plaqueta')

    posicao = []
    for b in bens_qs:
        posicao.append({
            'Plaqueta':      b.plaqueta,
            'Descrição':     b.descricao,
            'Situação':      b.get_situacao_display(),
            'Categoria':     b.categoria.nome if b.categoria_id else '—',
            'Departamento':  b.departamento.nome if b.departamento_id else '—',
            'Localização':   b.localizacao or '—',
            'Responsável':   b.responsavel or '—',
            'Nota Fiscal':   b.nota_fiscal or '—',
            'Valor (R$)':    float(b.valor_aquisicao) if b.valor_aquisicao else None,
        })

    total_valor = sum(b['Valor (R$)'] or 0 for b in posicao)

    return {
        'diferencas': diferencas,
        'ajustes':    ajustes,
        'posicao':    posicao,
        'total_valor': total_valor,
        'inv':         inv,
        'totais': {
            'divergentes':     len(r['divergentes']),
            'nao_cadastrados': len(r['nao_cadastrados']),
            'fantasmas':       len(r['fantasmas']),
            'total_bens':      len(posicao),
            'ajustes':         len(ajustes),
        },
    }


def _exportar_excel_final(dados, empresa):
    import io as _io
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, numbers
    from openpyxl.utils import get_column_letter

    inv  = dados['inv']
    tot  = dados['totais']

    AZUL_ESCURO = '1F4E79'
    AZUL_CLARO  = 'BDD7EE'
    AMARELO     = 'FFF2CC'
    VERDE       = 'E2EFDA'
    VERMELHO    = 'FCE4D6'
    CINZA       = 'F2F2F2'

    hf  = Font(name='Arial', bold=True, color='FFFFFF', size=10)
    sf  = Font(name='Arial', size=10)
    bf  = Font(name='Arial', bold=True, size=10)
    tit = Font(name='Arial', bold=True, size=14, color=AZUL_ESCURO)
    sub = Font(name='Arial', size=10, color='595959')

    def header_fill(cor): return PatternFill('solid', fgColor=cor)
    def thin_border():
        s = Side(style='thin', color='BFBFBF')
        return Border(left=s, right=s, top=s, bottom=s)

    def _write_header(ws, titulo, subtitulo, row_start=1):
        ws.merge_cells(f'A{row_start}:I{row_start}')
        c = ws[f'A{row_start}']
        c.value = titulo
        c.font  = tit
        c.alignment = Alignment(horizontal='left', vertical='center')
        ws.row_dimensions[row_start].height = 24

        ws.merge_cells(f'A{row_start+1}:I{row_start+1}')
        c2 = ws[f'A{row_start+1}']
        c2.value = subtitulo
        c2.font  = sub
        ws.row_dimensions[row_start+1].height = 16
        return row_start + 3

    def _write_table(ws, cols, rows, row_start, fill_cor=AZUL_ESCURO, widths=None):
        for ci, col in enumerate(cols, 1):
            c = ws.cell(row=row_start, column=ci, value=col)
            c.font   = hf
            c.fill   = header_fill(fill_cor)
            c.border = thin_border()
            c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            if widths:
                ws.column_dimensions[get_column_letter(ci)].width = widths[ci-1]
        ws.row_dimensions[row_start].height = 20

        fills_alt = [PatternFill('solid', fgColor='FFFFFF'), PatternFill('solid', fgColor=CINZA)]
        for ri, row in enumerate(rows, 1):
            for ci, col in enumerate(cols, 1):
                val = row.get(col)
                c   = ws.cell(row=row_start + ri, column=ci, value=val)
                c.font   = sf
                c.fill   = fills_alt[ri % 2]
                c.border = thin_border()
                c.alignment = Alignment(vertical='center', wrap_text=False)
                if col == 'Valor (R$)' and val is not None:
                    c.number_format = 'R$ #,##0.00'
            ws.row_dimensions[row_start + ri].height = 16

        return row_start + len(rows) + 1

    def _write_assinatura(ws, row_start):
        ws.row_dimensions[row_start].height = 30
        ws.row_dimensions[row_start+1].height = 14
        ws.row_dimensions[row_start+2].height = 30
        ws.row_dimensions[row_start+3].height = 14

        campos = [
            ('Responsável pelo Inventário', 'Data'),
            ('Gestor / Aprovação',          'Data'),
        ]
        for li, (nome, data_label) in enumerate(campos):
            r = row_start + li * 2
            ws.cell(row=r, column=1, value='_' * 50).font = sf
            ws.cell(row=r, column=5, value='_' * 20).font = sf
            ws.cell(row=r+1, column=1, value=nome).font = Font(name='Arial', bold=True, size=9)
            ws.cell(row=r+1, column=5, value=data_label).font = Font(name='Arial', bold=True, size=9)

    wb   = openpyxl.Workbook()
    sub_titulo = (
        f'Inventário: {inv.data.strftime("%d/%m/%Y")}'
        + (f'  |  Área: {inv.local_area}' if inv.local_area else '')
        + (f'  |  Responsável: {inv.responsavel}' if inv.responsavel else '')
        + f'  |  Empresa: {empresa.nome}'
    )

    # ── ABA 1: Diferenças ──
    ws1 = wb.active
    ws1.title = 'Diferenças'
    r = _write_header(ws1, 'Relatório de Diferenças — Inventário Físico', sub_titulo)
    ws1.cell(row=r-1, column=1,
             value=f'Divergentes: {tot["divergentes"]}  |  Não Cadastrados: {tot["nao_cadastrados"]}  |  Não Localizados: {tot["fantasmas"]}').font = bf
    cols1  = ['Tipo','Plaqueta','Descrição','Categoria','Departamento','Local no Sistema','Local Encontrado','Valor (R$)']
    widths1= [18, 12, 30, 20, 20, 24, 24, 14]
    r = _write_table(ws1, cols1, dados['diferencas'], r, AZUL_ESCURO, widths1)
    ws1.freeze_panes = 'A5'
    _write_assinatura(ws1, r + 2)

    # ── ABA 2: Ajustes ──
    ws2 = wb.create_sheet('Ajustes Realizados')
    r = _write_header(ws2, 'Relatório de Ajustes Realizados', sub_titulo)
    ws2.cell(row=r-1, column=1,
             value=f'Total de ajustes: {tot["ajustes"]}').font = bf
    cols2  = ['Tipo de Ajuste','Plaqueta','Descrição','Categoria','Departamento','Local Anterior','Local Atual','Valor (R$)']
    widths2= [22, 12, 30, 20, 20, 24, 24, 14]
    r = _write_table(ws2, cols2, dados['ajustes'], r, '375623', widths2)
    ws2.freeze_panes = 'A5'
    _write_assinatura(ws2, r + 2)

    # ── ABA 3: Posição Atual ──
    ws3 = wb.create_sheet('Posição Atual')
    r = _write_header(ws3, 'Posição Atual do Acervo', sub_titulo)
    ws3.cell(row=r-1, column=1,
             value=f'Total de bens ativos: {tot["total_bens"]}  |  Valor total: R$ {dados["total_valor"]:,.2f}').font = bf
    cols3  = ['Plaqueta','Descrição','Situação','Categoria','Departamento','Localização','Responsável','Nota Fiscal','Valor (R$)']
    widths3= [12, 30, 14, 20, 20, 24, 20, 14, 14]
    r = _write_table(ws3, cols3, dados['posicao'], r, '1F4E79', widths3)
    ws3.freeze_panes = 'A5'
    _write_assinatura(ws3, r + 2)

    buf = _io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def _exportar_pdf_final(dados, empresa):
    import io as _io
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                    Paragraph, Spacer, HRFlowable, PageBreak)
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

    inv = dados['inv']
    tot = dados['totais']

    AZUL   = colors.HexColor('#1F4E79')
    CINZA  = colors.HexColor('#F2F2F2')
    CINZA2 = colors.HexColor('#D9D9D9')
    BRANCO = colors.white
    VERDE  = colors.HexColor('#375623')

    buf  = _io.BytesIO()
    doc  = SimpleDocTemplate(buf, pagesize=landscape(A4),
                              leftMargin=1.5*cm, rightMargin=1.5*cm,
                              topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    s_tit  = ParagraphStyle('tit', fontName='Helvetica-Bold', fontSize=14, textColor=AZUL, spaceAfter=4)
    s_sub  = ParagraphStyle('sub', fontName='Helvetica', fontSize=9, textColor=colors.HexColor('#595959'), spaceAfter=8)
    s_inf  = ParagraphStyle('inf', fontName='Helvetica-Bold', fontSize=9, spaceAfter=6)
    s_body = ParagraphStyle('body', fontName='Helvetica', fontSize=8)
    s_ass  = ParagraphStyle('ass', fontName='Helvetica', fontSize=9, spaceAfter=2)
    s_ass_label = ParagraphStyle('assl', fontName='Helvetica-Bold', fontSize=9)

    sub_titulo = (
        f'Inventário: {inv.data.strftime("%d/%m/%Y")}'
        + (f'  |  Área: {inv.local_area}' if inv.local_area else '')
        + (f'  |  Responsável: {inv.responsavel}' if inv.responsavel else '')
        + f'  |  Empresa: {empresa.nome}'
    )

    def fmtR(v):
        if v is None: return '—'
        return f'R$ {v:,.2f}'

    def _table_style(header_color):
        return TableStyle([
            ('BACKGROUND',  (0,0), (-1,0), header_color),
            ('TEXTCOLOR',   (0,0), (-1,0), BRANCO),
            ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE',    (0,0), (-1,0), 8),
            ('ALIGN',       (0,0), (-1,0), 'CENTER'),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [BRANCO, CINZA]),
            ('FONTNAME',    (0,1), (-1,-1), 'Helvetica'),
            ('FONTSIZE',    (0,1), (-1,-1), 7.5),
            ('GRID',        (0,0), (-1,-1), 0.4, CINZA2),
            ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
            ('LEFTPADDING', (0,0), (-1,-1), 4),
            ('RIGHTPADDING',(0,0), (-1,-1), 4),
            ('TOPPADDING',  (0,0), (-1,-1), 3),
            ('BOTTOMPADDING',(0,0), (-1,-1), 3),
        ])

    def _assinatura_block():
        campos = [
            'Responsável pelo Inventário',
            'Gestor / Aprovação',
        ]
        story = [Spacer(1, 1*cm)]
        for campo in campos:
            story.append(HRFlowable(width='45%', thickness=0.8, color=colors.black, spaceAfter=2))
            story.append(Paragraph(campo, s_ass_label))
            story.append(Paragraph(f'Data: _____ / _____ / _______', s_ass))
            story.append(Spacer(1, 0.6*cm))
        return story

    story = []

    # ── SEÇÃO 1: Diferenças ──
    story.append(Paragraph('Relatório de Diferenças — Inventário Físico', s_tit))
    story.append(Paragraph(sub_titulo, s_sub))
    story.append(Paragraph(
        f'Divergentes: {tot["divergentes"]}  |  Não Cadastrados: {tot["nao_cadastrados"]}  |  Não Localizados: {tot["fantasmas"]}',
        s_inf))

    if dados['diferencas']:
        cols  = ['Tipo','Plaqueta','Descrição','Categoria','Departamento','Local Sistema','Local Encontrado','Valor (R$)']
        rows  = [[Paragraph(str(d.get(k) or '—'), s_body) for k in
                  ['Tipo','Plaqueta','Descrição','Categoria','Departamento','Local no Sistema','Local Encontrado','Valor (R$)']]
                 for d in dados['diferencas']]
        for r in rows:
            if isinstance(r[7], Paragraph):
                r[7] = Paragraph(fmtR(dados['diferencas'][rows.index(r)].get('Valor (R$)')), s_body)
        tbl = Table([cols] + [[str(d.get(c) or '—') for c in
                               ['Tipo','Plaqueta','Descrição','Categoria','Departamento',
                                'Local no Sistema','Local Encontrado','Valor (R$)']]
                              for d in dados['diferencas']],
                    colWidths=[3.5*cm,2.2*cm,5.5*cm,3.5*cm,3.5*cm,4*cm,4*cm,2.5*cm],
                    repeatRows=1)
        tbl.setStyle(_table_style(AZUL))
        story.append(tbl)
    else:
        story.append(Paragraph('Nenhuma diferença encontrada.', s_body))

    story += _assinatura_block()
    story.append(PageBreak())

    # ── SEÇÃO 2: Ajustes ──
    story.append(Paragraph('Relatório de Ajustes Realizados', s_tit))
    story.append(Paragraph(sub_titulo, s_sub))
    story.append(Paragraph(f'Total de ajustes: {tot["ajustes"]}', s_inf))

    if dados['ajustes']:
        cols2 = ['Tipo de Ajuste','Plaqueta','Descrição','Categoria','Departamento','Local Anterior','Local Atual','Valor (R$)']
        tbl2  = Table([cols2] + [[str(d.get(c) or '—') for c in cols2] for d in dados['ajustes']],
                      colWidths=[3.8*cm,2.2*cm,5.5*cm,3.2*cm,3.2*cm,3.8*cm,3.8*cm,2.5*cm],
                      repeatRows=1)
        tbl2.setStyle(_table_style(VERDE))
        story.append(tbl2)
    else:
        story.append(Paragraph('Nenhum ajuste realizado.', s_body))

    story += _assinatura_block()
    story.append(PageBreak())

    # ── SEÇÃO 3: Posição Atual ──
    story.append(Paragraph('Posição Atual do Acervo', s_tit))
    story.append(Paragraph(sub_titulo, s_sub))
    story.append(Paragraph(
        f'Total de bens ativos: {tot["total_bens"]}  |  Valor total: R$ {dados["total_valor"]:,.2f}',
        s_inf))

    if dados['posicao']:
        cols3 = ['Plaqueta','Descrição','Situação','Categoria','Departamento','Localização','Responsável','NF','Valor (R$)']
        tbl3  = Table([cols3] + [[str(d.get(c) or '—') for c in
                                  ['Plaqueta','Descrição','Situação','Categoria','Departamento',
                                   'Localização','Responsável','Nota Fiscal','Valor (R$)']]
                                 for d in dados['posicao']],
                      colWidths=[2*cm,5.5*cm,2.5*cm,3.2*cm,3.2*cm,4*cm,3.5*cm,2.5*cm,2.5*cm],
                      repeatRows=1)
        tbl3.setStyle(_table_style(AZUL))
        story.append(tbl3)

    story += _assinatura_block()

    doc.build(story)
    buf.seek(0)
    return buf.read()


@csrf_exempt
def api_inventario_relatorio_final(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    try:
        inv = Inventario.objects.get(pk=pk, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)

    if inv.status != Inventario.FINALIZADO:
        return _err('Apenas inventários finalizados podem gerar o relatório final')

    formato = request.GET.get('formato', 'excel').lower()
    dados   = _build_relatorio_final_data(inv, empresa)

    data_str = inv.data.strftime('%Y-%m-%d')

    if formato == 'pdf':
        conteudo = _exportar_pdf_final(dados, empresa)
        resp = HttpResponse(conteudo, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="relatorio_final_{data_str}.pdf"'
    else:
        conteudo = _exportar_excel_final(dados, empresa)
        resp = HttpResponse(conteudo, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        resp['Content-Disposition'] = f'attachment; filename="relatorio_final_{data_str}.xlsx"'

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


@csrf_exempt
def api_inventario_item(request, pk, item_pk):
    """PATCH: edita campos do ItemInventario. DELETE: remove item do inventário."""
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    try:
        inv = Inventario.objects.get(pk=pk, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)
    if inv.status == Inventario.FINALIZADO:
        return _err('Inventário finalizado não pode ser editado')
    try:
        item = ItemInventario.objects.get(pk=item_pk, inventario=inv)
    except ItemInventario.DoesNotExist:
        return _err('Item não encontrado', 404)

    if request.method == 'DELETE':
        item.delete()
        return JsonResponse({'ok': True})

    if request.method == 'PATCH':
        try:
            data = json.loads(request.body)
        except Exception:
            return _err('JSON inválido')
        update_fields = []
        for c in ['localizacao_encontrada', 'contado_por', 'observacao', 'descricao_provisoria']:
            if c in data:
                setattr(item, c, str(data[c]).strip())
                update_fields.append(c)
        if 'quantidade' in data:
            item.quantidade = max(1, int(data['quantidade'] or 1))
            update_fields.append('quantidade')
        for c in ['categoria_provisoria_id', 'departamento_provisorio_id']:
            if c in data:
                setattr(item, c, int(data[c]) if data[c] else None)
                update_fields.append(c)
        if update_fields:
            item.save(update_fields=update_fields)
        return JsonResponse({'ok': True, 'item': _item_dict(item, request)})

    return _err('Método não permitido', 405)


def api_comparativo(request):
    """GET: reconciliação do inventário FINALIZADO mais recente."""
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    inv_id = request.GET.get('inventario_id')
    if inv_id:
        try:
            inv = Inventario.objects.get(pk=inv_id, empresa=empresa, status=Inventario.FINALIZADO)
        except Inventario.DoesNotExist:
            return _err('Inventário não encontrado', 404)
    else:
        inv = Inventario.objects.filter(empresa=empresa, status=Inventario.FINALIZADO).order_by('-data', '-criado_em').first()
        if not inv:
            return JsonResponse({'inventario': None, 'localizados': [], 'divergentes': [],
                                 'nao_cadastrados': [], 'fantasmas': [],
                                 'total_esperados': 0, 'total_contados': 0,
                                 'indice_localizacao': 0.0, 'valor_fantasmas': 0.0,
                                 'inventarios_finalizados': []})

    r = reconciliar(inv)

    def _b(b):
        return {
            'id': b.id, 'plaqueta': b.plaqueta, 'descricao': b.descricao,
            'categoria': b.categoria.nome if b.categoria_id else '',
            'departamento': b.departamento.nome if b.departamento_id else '',
            'localizacao': b.localizacao,
            'valor_aquisicao': float(b.valor_aquisicao) if b.valor_aquisicao else None,
        }

    # lista de todos os inventários finalizados para o seletor
    finalizados = list(
        Inventario.objects.filter(empresa=empresa, status=Inventario.FINALIZADO)
        .order_by('-data', '-criado_em')
        .values('id', 'data', 'local_area', 'responsavel')
    )
    for f in finalizados:
        f['data'] = f['data'].isoformat()

    return JsonResponse({
        'inventario':         {'id': inv.id, 'data': inv.data.isoformat(), 'local_area': inv.local_area, 'responsavel': inv.responsavel},
        'localizados':        [_item_dict(i, request) for i in r['localizados']],
        'divergentes':        [_item_dict(i, request) for i in r['divergentes']],
        'nao_cadastrados':    [_item_dict(i, request) for i in r['nao_cadastrados']],
        'fantasmas':          [_b(b) for b in r['fantasmas']],
        'total_esperados':    r['total_esperados'],
        'total_contados':     r['total_contados'],
        'indice_localizacao': r['indice_localizacao'],
        'valor_fantasmas':    r['valor_fantasmas'],
        'inventarios_finalizados': finalizados,
    })


# ─── LINK ATIVO (toggle) ──────────────────────────────────────────────────────

@csrf_exempt
def api_inventario_toggle_link(request, pk):
    """Bloqueia ou libera o link público do inventário."""
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    if request.method != 'POST':
        return _err('Método não permitido', 405)
    try:
        inv = Inventario.objects.get(pk=pk, empresa=empresa)
    except Inventario.DoesNotExist:
        return _err('Inventário não encontrado', 404)

    inv.link_ativo = not inv.link_ativo
    inv.save(update_fields=['link_ativo'])

    acao = LogAuditoria.LIBERAR_LINK if inv.link_ativo else LogAuditoria.BLOQUEAR_LINK
    desc = f'Link do inventário {inv.data} {"liberado" if inv.link_ativo else "bloqueado"}'
    _log(empresa, acao, desc, request)

    return JsonResponse({'ok': True, 'link_ativo': inv.link_ativo})


# ─── TRANSFERÊNCIA DE ATIVOS ──────────────────────────────────────────────────

@csrf_exempt
def api_bem_transferir(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    if request.method != 'POST':
        return _err('Método não permitido', 405)

    try:
        bem = Bem.objects.select_related('categoria', 'departamento').get(pk=pk, empresa=empresa)
    except Bem.DoesNotExist:
        return _err('Bem não encontrado', 404)

    try:
        data = json.loads(request.body)
    except Exception:
        return _err('JSON inválido')

    de_dep  = bem.departamento.nome if bem.departamento_id else ''
    de_loc  = bem.localizacao or ''

    novo_dep_id  = data.get('departamento_id')
    nova_loc     = (data.get('localizacao') or '').strip()
    motivo       = (data.get('motivo') or '').strip()

    if not novo_dep_id and not nova_loc:
        return _err('Informe ao menos um destino (departamento ou localização)')

    para_dep_nome = de_dep
    if novo_dep_id:
        try:
            novo_dep = Departamento.objects.get(id=novo_dep_id, empresa=empresa)
        except Departamento.DoesNotExist:
            return _err('Departamento não encontrado')
        bem.departamento  = novo_dep
        para_dep_nome     = novo_dep.nome

    if nova_loc:
        bem.localizacao = nova_loc

    bem.save()

    TransferenciaAtivo.objects.create(
        bem               = bem,
        de_departamento   = de_dep,
        para_departamento = para_dep_nome,
        de_localizacao    = de_loc,
        para_localizacao  = nova_loc or de_loc,
        motivo            = motivo,
        transferido_por   = _get_usuario(request),
    )
    _log(empresa, LogAuditoria.TRANSFERIR_BEM,
         f'Bem {bem.plaqueta} transferido de "{de_dep}/{de_loc}" para "{para_dep_nome}/{nova_loc or de_loc}"',
         request)

    return JsonResponse({'ok': True})


@csrf_exempt
def api_bem_historico_transferencias(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)
    try:
        bem = Bem.objects.get(pk=pk, empresa=empresa)
    except Bem.DoesNotExist:
        return _err('Bem não encontrado', 404)

    data = [
        {
            'id':               t.id,
            'de_departamento':  t.de_departamento,
            'para_departamento':t.para_departamento,
            'de_localizacao':   t.de_localizacao,
            'para_localizacao': t.para_localizacao,
            'motivo':           t.motivo,
            'transferido_por':  t.transferido_por,
            'criado_em':        t.criado_em.isoformat(),
        }
        for t in bem.transferencias.all()
    ]
    return JsonResponse(data, safe=False)


# ─── AUDITORIA ────────────────────────────────────────────────────────────────

def api_auditoria(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    qs = LogAuditoria.objects.filter(empresa=empresa)

    acao    = request.GET.get('acao')
    usuario = request.GET.get('usuario', '').strip()
    de      = request.GET.get('de')
    ate     = request.GET.get('ate')

    if acao:    qs = qs.filter(acao=acao)
    if usuario: qs = qs.filter(usuario__icontains=usuario)
    if de:      qs = qs.filter(criado_em__date__gte=de)
    if ate:     qs = qs.filter(criado_em__date__lte=ate)

    data = [
        {
            'id':        l.id,
            'acao':      l.acao,
            'acao_label':l.get_acao_display(),
            'descricao': l.descricao,
            'usuario':   l.usuario,
            'criado_em': l.criado_em.isoformat(),
        }
        for l in qs[:500]
    ]
    return JsonResponse(data, safe=False)


# ─── DASHBOARD ────────────────────────────────────────────────────────────────

def api_dashboard(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    bens_qs = Bem.objects.filter(empresa=empresa)

    total_bens    = bens_qs.count()
    em_uso        = bens_qs.filter(situacao=Bem.EM_USO).count()
    manutencao    = bens_qs.filter(situacao=Bem.MANUTENCAO).count()
    baixados      = bens_qs.filter(situacao=Bem.BAIXADO).count()
    sem_cadastro  = bens_qs.filter(Q(valor_aquisicao__isnull=True) | Q(nota_fiscal='')).count()
    valor_total   = bens_qs.filter(situacao=Bem.EM_USO).aggregate(s=Sum('valor_aquisicao'))['s'] or 0

    # por categoria (top 8)
    por_categoria = list(
        bens_qs.filter(situacao=Bem.EM_USO)
        .values('categoria__nome')
        .annotate(total=Count('id'), valor=Sum('valor_aquisicao'))
        .order_by('-total')[:8]
    )

    # por departamento (top 8)
    por_departamento = list(
        bens_qs.filter(situacao=Bem.EM_USO)
        .values('departamento__nome')
        .annotate(total=Count('id'))
        .order_by('-total')[:8]
    )

    # último inventário
    ultimo_inv = Inventario.objects.filter(empresa=empresa).order_by('-data', '-criado_em').first()
    ultimo_inv_data = None
    if ultimo_inv:
        r = reconciliar(ultimo_inv)
        ultimo_inv_data = {
            'id':               ultimo_inv.id,
            'data':             ultimo_inv.data.isoformat(),
            'local_area':       ultimo_inv.local_area,
            'status':           ultimo_inv.status,
            'total_contados':   r['total_contados'],
            'total_esperados':  r['total_esperados'],
            'indice_localizacao': r['indice_localizacao'],
        }

    return JsonResponse({
        'total_bens':      total_bens,
        'em_uso':          em_uso,
        'manutencao':      manutencao,
        'baixados':        baixados,
        'sem_cadastro':    sem_cadastro,
        'valor_total':     float(valor_total),
        'por_categoria':   [{'nome': c['categoria__nome'] or 'Sem categoria', 'total': c['total'], 'valor': float(c['valor'] or 0)} for c in por_categoria],
        'por_departamento':[{'nome': d['departamento__nome'] or 'Sem dep.', 'total': d['total']} for d in por_departamento],
        'ultimo_inventario': ultimo_inv_data,
    })


# ─── RELATÓRIOS ───────────────────────────────────────────────────────────────

def api_relatorios(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('Sem empresa ativa', 401)

    tipo = request.GET.get('tipo', 'bens')

    if tipo == 'baixas':
        qs = Bem.objects.filter(empresa=empresa, situacao=Bem.BAIXADO).select_related('categoria', 'departamento').order_by('-data_baixa')
        data = [
            {
                'plaqueta':      b.plaqueta,
                'descricao':     b.descricao,
                'categoria':     b.categoria.nome if b.categoria_id else '',
                'departamento':  b.departamento.nome if b.departamento_id else '',
                'data_baixa':    b.data_baixa.isoformat() if b.data_baixa else None,
                'motivo_baixa':  dict(Bem.MOTIVO_BAIXA_CHOICES).get(b.motivo_baixa, b.motivo_baixa),
                'valor_aquisicao': float(b.valor_aquisicao) if b.valor_aquisicao else None,
                'observacoes':   b.observacoes,
            }
            for b in qs
        ]
        return JsonResponse({'tipo': 'baixas', 'registros': data})

    if tipo == 'transferencias':
        qs = TransferenciaAtivo.objects.filter(bem__empresa=empresa).select_related('bem').order_by('-criado_em')
        data = [
            {
                'plaqueta':          t.bem.plaqueta,
                'descricao':         t.bem.descricao,
                'de_departamento':   t.de_departamento,
                'para_departamento': t.para_departamento,
                'de_localizacao':    t.de_localizacao,
                'para_localizacao':  t.para_localizacao,
                'motivo':            t.motivo,
                'transferido_por':   t.transferido_por,
                'criado_em':         t.criado_em.isoformat(),
            }
            for t in qs
        ]
        return JsonResponse({'tipo': 'transferencias', 'registros': data})

    if tipo == 'inventarios':
        qs = Inventario.objects.filter(empresa=empresa).order_by('-data', '-criado_em')
        data = []
        for inv in qs:
            r = reconciliar(inv)
            data.append({
                'id':               inv.id,
                'data':             inv.data.isoformat(),
                'local_area':       inv.local_area,
                'responsavel':      inv.responsavel,
                'status':           inv.status,
                'link_ativo':       inv.link_ativo,
                'total_contados':   r['total_contados'],
                'total_esperados':  r['total_esperados'],
                'localizados':      len(r['localizados']),
                'divergentes':      len(r['divergentes']),
                'nao_cadastrados':  len(r['nao_cadastrados']),
                'fantasmas':        len(r['fantasmas']),
                'indice_localizacao': r['indice_localizacao'],
            })
        return JsonResponse({'tipo': 'inventarios', 'registros': data})

    # default: bens
    qs = Bem.objects.filter(empresa=empresa).select_related('categoria', 'departamento').order_by('plaqueta')
    situacao = request.GET.get('situacao')
    if situacao:
        qs = qs.filter(situacao=situacao)
    data = [
        {
            'plaqueta':        b.plaqueta,
            'descricao':       b.descricao,
            'categoria':       b.categoria.nome if b.categoria_id else '',
            'departamento':    b.departamento.nome if b.departamento_id else '',
            'localizacao':     b.localizacao,
            'responsavel':     b.responsavel,
            'situacao':        dict(Bem.SITUACAO_CHOICES).get(b.situacao, b.situacao),
            'valor_aquisicao': float(b.valor_aquisicao) if b.valor_aquisicao else None,
            'data_aquisicao':  b.data_aquisicao.isoformat() if b.data_aquisicao else None,
            'nota_fiscal':     b.nota_fiscal,
        }
        for b in qs
    ]
    return JsonResponse({'tipo': 'bens', 'registros': data})
