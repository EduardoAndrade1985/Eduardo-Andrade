import json
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import TipoEnxoval, PecaEnxoval, MovimentacaoEnxoval, ItemMovimentacao


def _empresa(request):
    return getattr(request, 'empresa', None)


def _err(msg, status=400):
    return JsonResponse({'ok': False, 'erro': msg}, status=status)


def _norm_epc(epc):
    return (epc or '').strip().upper()


def _tipo_dict(tipo):
    return {
        'id':              tipo.id,
        'nome':            tipo.nome,
        'codigo':          tipo.codigo,
        'cor':             tipo.cor,
        'estoque_minimo':  tipo.estoque_minimo,
        'ativo':           tipo.ativo,
    }


def _peca_dict(peca):
    return {
        'id':           peca.id,
        'epc':          peca.epc,
        'serial':       peca.serial,
        'status':       peca.status,
        'tipo_id':      peca.tipo_id,
        'tipo_nome':    peca.tipo.nome if peca.tipo_id else None,
        'tipo_cor':     peca.tipo.cor  if peca.tipo_id else None,
        'observacoes':  peca.observacoes,
        'criado_em':    peca.criado_em.strftime('%d/%m/%Y %H:%M'),
        'atualizado_em': peca.atualizado_em.strftime('%d/%m/%Y %H:%M'),
    }


def _mov_dict(mov, itens=False):
    d = {
        'id':          mov.id,
        'tipo_mov':    mov.tipo_mov,
        'numero':      mov.numero,
        'responsavel': mov.responsavel,
        'observacoes': mov.observacoes,
        'finalizado':  mov.finalizado,
        'criado_em':   mov.criado_em.strftime('%d/%m/%Y %H:%M'),
        'total_itens': mov.itens.count(),
    }
    if itens:
        d['itens'] = [
            {
                'id':          it.id,
                'epc_lido':    it.epc_lido,
                'rssi':        it.rssi,
                'contagem':    it.contagem,
                'status_item': it.status_item,
                'peca_id':     it.peca_id,
                'tipo_nome':   (it.peca.tipo.nome if it.peca_id else (it.tipo_enxoval.nome if it.tipo_enxoval_id else None)),
                'tipo_cor':    (it.peca.tipo.cor  if it.peca_id else (it.tipo_enxoval.cor  if it.tipo_enxoval_id else None)),
            }
            for it in mov.itens.select_related('peca__tipo', 'tipo_enxoval').order_by('epc_lido')
        ]
    return d


# ── Dashboard ──────────────────────────────────────────────────────────────────

@require_http_methods(['GET'])
def api_dashboard(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    tipos  = TipoEnxoval.objects.filter(empresa=empresa, ativo=True)
    pecas  = PecaEnxoval.objects.filter(empresa=empresa)

    tipo_stats = []
    for tipo in tipos:
        qs        = pecas.filter(tipo=tipo)
        total     = qs.count()
        em_hotel  = qs.filter(status=PecaEnxoval.EM_HOTEL).count()
        na_lav    = qs.filter(status=PecaEnxoval.NA_LAVANDERIA).count()
        baixadas  = qs.filter(status=PecaEnxoval.BAIXADA).count()
        tipo_stats.append({
            **_tipo_dict(tipo),
            'total':          total,
            'em_hotel':       em_hotel,
            'na_lavanderia':  na_lav,
            'baixadas':       baixadas,
        })

    movs_recentes = MovimentacaoEnxoval.objects.filter(empresa=empresa).order_by('-criado_em')[:5]

    return JsonResponse({
        'tipos':               tipo_stats,
        'total_pecas':         pecas.count(),
        'total_em_hotel':      pecas.filter(status=PecaEnxoval.EM_HOTEL).count(),
        'total_na_lavanderia': pecas.filter(status=PecaEnxoval.NA_LAVANDERIA).count(),
        'movimentacoes_recentes': [_mov_dict(m) for m in movs_recentes],
    })


# ── Tipos ──────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_tipos(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    if request.method == 'GET':
        tipos = TipoEnxoval.objects.filter(empresa=empresa).order_by('nome')
        return JsonResponse({'tipos': [_tipo_dict(t) for t in tipos]})

    data    = json.loads(request.body or '{}')
    nome    = (data.get('nome') or '').strip()
    codigo  = (data.get('codigo') or '').strip().upper()

    if not nome:
        return _err('nome obrigatório')
    if not codigo or len(codigo) != 4:
        return _err('codigo deve ter exatamente 4 caracteres hex (ex: 0001)')

    tipo = TipoEnxoval.objects.create(
        empresa=empresa,
        nome=nome,
        codigo=codigo,
        cor=data.get('cor') or '#6366f1',
        estoque_minimo=int(data.get('estoque_minimo') or 0),
        ativo=True,
    )
    return JsonResponse({'ok': True, 'tipo': _tipo_dict(tipo)}, status=201)


@csrf_exempt
@require_http_methods(['PUT', 'DELETE'])
def api_tipo_detail(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    try:
        tipo = TipoEnxoval.objects.get(pk=pk, empresa=empresa)
    except TipoEnxoval.DoesNotExist:
        return _err('tipo não encontrado', 404)

    if request.method == 'DELETE':
        if tipo.pecas.exists():
            return _err('tipo possui peças cadastradas, inative-o ao invés de excluir')
        tipo.delete()
        return JsonResponse({'ok': True})

    data = json.loads(request.body or '{}')
    if 'nome' in data:
        tipo.nome = data['nome'].strip()
    if 'codigo' in data:
        tipo.codigo = data['codigo'].strip().upper()
    if 'cor' in data:
        tipo.cor = data['cor']
    if 'estoque_minimo' in data:
        tipo.estoque_minimo = int(data['estoque_minimo'])
    if 'ativo' in data:
        tipo.ativo = bool(data['ativo'])
    tipo.save()
    return JsonResponse({'ok': True, 'tipo': _tipo_dict(tipo)})


# ── Peças ──────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_pecas(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    if request.method == 'GET':
        qs = PecaEnxoval.objects.filter(empresa=empresa).select_related('tipo')
        if request.GET.get('status'):
            qs = qs.filter(status=request.GET['status'])
        if request.GET.get('tipo'):
            qs = qs.filter(tipo_id=request.GET['tipo'])
        return JsonResponse({'pecas': [_peca_dict(p) for p in qs[:500]]})

    data   = json.loads(request.body or '{}')
    epc    = _norm_epc(data.get('epc'))
    tipo_id = data.get('tipo_id')

    if not epc:
        return _err('epc obrigatório')

    try:
        tipo = TipoEnxoval.objects.get(pk=tipo_id, empresa=empresa)
    except TipoEnxoval.DoesNotExist:
        return _err('tipo não encontrado')

    try:
        serial = int(epc[8:16], 16) if len(epc) >= 16 else 0
    except Exception:
        serial = 0

    peca, created = PecaEnxoval.objects.get_or_create(
        epc=epc,
        defaults={
            'empresa':     empresa,
            'tipo':        tipo,
            'serial':      serial,
            'status':      PecaEnxoval.EM_HOTEL,
            'observacoes': data.get('observacoes') or '',
        },
    )
    if not created:
        peca.tipo        = tipo
        peca.observacoes = data.get('observacoes') or peca.observacoes
        peca.save(update_fields=['tipo', 'observacoes', 'atualizado_em'])

    return JsonResponse({'ok': True, 'peca': _peca_dict(peca), 'created': created},
                        status=201 if created else 200)


@require_http_methods(['GET'])
def api_peca_por_epc(request, epc):
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    epc = _norm_epc(epc)
    try:
        peca = PecaEnxoval.objects.select_related('tipo').get(epc=epc, empresa=empresa)
        return JsonResponse({'found': True, 'peca': _peca_dict(peca)})
    except PecaEnxoval.DoesNotExist:
        return JsonResponse({'found': False})


# ── Movimentações ──────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_movimentacoes(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    if request.method == 'GET':
        qs = MovimentacaoEnxoval.objects.filter(empresa=empresa)
        if request.GET.get('tipo'):
            qs = qs.filter(tipo_mov=request.GET['tipo'])
        return JsonResponse({'movimentacoes': [_mov_dict(m) for m in qs[:100]]})

    data    = json.loads(request.body or '{}')
    tipo_mov = data.get('tipo_mov')
    if tipo_mov not in ('SAIDA', 'ENTRADA'):
        return _err('tipo_mov deve ser SAIDA ou ENTRADA')

    tags = data.get('tags', [])  # [{epc, rssi, contagem}, ...]

    with transaction.atomic():
        ultimo  = MovimentacaoEnxoval.objects.filter(empresa=empresa).order_by('-numero').first()
        numero  = (ultimo.numero + 1) if ultimo else 1

        mov = MovimentacaoEnxoval.objects.create(
            empresa=empresa,
            tipo_mov=tipo_mov,
            numero=numero,
            responsavel=data.get('responsavel') or '',
            observacoes=data.get('observacoes') or '',
            finalizado=False,
        )

        epcs = [_norm_epc(t['epc']) for t in tags]
        pecas_map = {
            p.epc: p
            for p in PecaEnxoval.objects.filter(empresa=empresa, epc__in=epcs).select_related('tipo')
        }
        tipos_map = {
            t.codigo: t
            for t in TipoEnxoval.objects.filter(empresa=empresa)
        }

        itens = []
        for tag in tags:
            epc  = _norm_epc(tag['epc'])
            peca = pecas_map.get(epc)

            tipo_enxoval = None
            if not peca and len(epc) >= 8:
                tipo_enxoval = tipos_map.get(epc[4:8])

            if peca or tipo_enxoval:
                status_item = ItemMovimentacao.RECONHECIDA
            else:
                status_item = ItemMovimentacao.DESCONHECIDA

            itens.append(ItemMovimentacao(
                movimentacao=mov,
                peca=peca,
                tipo_enxoval=tipo_enxoval if not peca else None,
                epc_lido=epc,
                rssi=tag.get('rssi'),
                contagem=tag.get('contagem', 1),
                status_item=status_item,
            ))

        ItemMovimentacao.objects.bulk_create(itens, ignore_conflicts=True)

        # auto-finalize: update piece statuses immediately
        novo_status = PecaEnxoval.NA_LAVANDERIA if tipo_mov == 'SAIDA' else PecaEnxoval.EM_HOTEL
        peca_ids    = [p.id for p in pecas_map.values()]
        if peca_ids:
            PecaEnxoval.objects.filter(id__in=peca_ids).update(status=novo_status)

        mov.finalizado = True
        mov.save(update_fields=['finalizado'])

    # com itens: a tela emite o rol logo após confirmar, sem outra requisição
    return JsonResponse({'ok': True, 'movimentacao': _mov_dict(mov, itens=True)}, status=201)


@csrf_exempt
@require_http_methods(['POST'])
def api_pecas_lote(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    data    = json.loads(request.body or '{}')
    tipo_id = data.get('tipo_id')
    epcs    = data.get('epcs', [])

    if not epcs:
        return _err('lista de epcs vazia')

    try:
        tipo = TipoEnxoval.objects.get(pk=tipo_id, empresa=empresa)
    except TipoEnxoval.DoesNotExist:
        return _err('tipo não encontrado')

    epcs_norm = list(dict.fromkeys(_norm_epc(e) for e in epcs if e))
    if not epcs_norm:
        return _err('nenhum EPC válido')

    with transaction.atomic():
        existentes = {p.epc: p for p in PecaEnxoval.objects.filter(epc__in=epcs_norm)}

        novos = []
        for epc in epcs_norm:
            if epc not in existentes:
                try:
                    serial = int(epc[8:16], 16) if len(epc) >= 16 else 0
                except Exception:
                    serial = 0
                novos.append(PecaEnxoval(
                    empresa=empresa,
                    tipo=tipo,
                    epc=epc,
                    serial=serial,
                    status=PecaEnxoval.EM_HOTEL,
                ))

        if novos:
            PecaEnxoval.objects.bulk_create(novos, ignore_conflicts=True)

        ids_atualizar = [p.id for p in existentes.values() if p.tipo_id != tipo.id]
        if ids_atualizar:
            PecaEnxoval.objects.filter(id__in=ids_atualizar).update(tipo=tipo)

    return JsonResponse({
        'ok':          True,
        'criadas':     len(novos),
        'atualizadas': len(ids_atualizar),
        'total':       len(epcs_norm),
    })


@require_http_methods(['GET'])
def api_movimentacao_detail(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    try:
        mov = MovimentacaoEnxoval.objects.get(pk=pk, empresa=empresa)
    except MovimentacaoEnxoval.DoesNotExist:
        return _err('movimentação não encontrada', 404)

    return JsonResponse({'movimentacao': _mov_dict(mov, itens=True)})
