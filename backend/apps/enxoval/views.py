import json
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from datetime import timedelta
from django.utils import timezone

from .models import (
    TipoEnxoval, ColetorEnxoval, PecaEnxoval, MovimentacaoEnxoval, ItemMovimentacao,
    SessaoLeitura,
)


def _empresa(request):
    return getattr(request, 'empresa', None)


def _err(msg, status=400):
    return JsonResponse({'ok': False, 'erro': msg}, status=status)


def _pode_gerir(request):
    """Administrar o módulo — tipos e coletores — é de quem responde pelo setor.
    Operar o leitor (saída, entrada, descarte) continua liberado a todos."""
    user = getattr(request, 'user', None)
    if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
        return True
    membro = getattr(request, 'membro', None)
    return bool(membro and membro.papel in ('admin', 'gerente'))


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

    if not _pode_gerir(request):
        return _err('sem permissão para alterar tipos de enxoval', 403)

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

    if not _pode_gerir(request):
        return _err('sem permissão para alterar tipos de enxoval', 403)

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


# ── Coletores ──────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_coletores(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    if request.method == 'GET':
        qs = ColetorEnxoval.objects.filter(empresa=empresa)
        if request.GET.get('ativos') == '1':
            qs = qs.filter(ativo=True)
        return JsonResponse({'coletores': [
            {'id': c.id, 'nome': c.nome, 'ativo': c.ativo} for c in qs
        ]})

    if not _pode_gerir(request):
        return _err('sem permissão para alterar a lista de coletores', 403)

    data = json.loads(request.body or '{}')
    nome = (data.get('nome') or '').strip()
    if not nome:
        return _err('nome obrigatório')
    if ColetorEnxoval.objects.filter(empresa=empresa, nome__iexact=nome).exists():
        return _err('já existe um coletor com esse nome')

    coletor = ColetorEnxoval.objects.create(empresa=empresa, nome=nome, ativo=True)
    return JsonResponse(
        {'ok': True, 'coletor': {'id': coletor.id, 'nome': coletor.nome, 'ativo': coletor.ativo}},
        status=201,
    )


@csrf_exempt
@require_http_methods(['PUT', 'DELETE'])
def api_coletor_detail(request, pk):
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    if not _pode_gerir(request):
        return _err('sem permissão para alterar a lista de coletores', 403)

    try:
        coletor = ColetorEnxoval.objects.get(pk=pk, empresa=empresa)
    except ColetorEnxoval.DoesNotExist:
        return _err('coletor não encontrado', 404)

    if request.method == 'DELETE':
        # o nome já pode constar em rols emitidos: inativa em vez de apagar
        coletor.ativo = False
        coletor.save(update_fields=['ativo'])
        return JsonResponse({'ok': True, 'inativado': True})

    data = json.loads(request.body or '{}')
    if 'nome' in data:
        coletor.nome = (data['nome'] or '').strip()
    if 'ativo' in data:
        coletor.ativo = bool(data['ativo'])
    coletor.save()
    return JsonResponse(
        {'ok': True, 'coletor': {'id': coletor.id, 'nome': coletor.nome, 'ativo': coletor.ativo}}
    )


# ── Sessões de leitura ─────────────────────────────────────────────────────────

# Depois disso a sessão é entulho: alguém saiu no meio e não vale mais mostrar
SESSAO_VIVA = timedelta(minutes=30)


def _sessao_dict(s, tipos_por_codigo):
    """Agrupa por tipo aqui, não no cliente: o notebook só precisa do placar."""
    contagem = {}
    for epc in s.epcs:
        tipo = tipos_por_codigo.get(epc[4:8].upper())
        nome = tipo.nome if tipo else 'Tipo desconhecido'
        contagem[nome] = contagem.get(nome, 0) + 1
    return {
        'id':          s.id,
        'tipo_mov':    s.tipo_mov,
        'responsavel': s.responsavel,
        'usuario':     s.usuario.username,
        'total':       len(s.epcs),
        'epcs':        s.epcs,
        'por_tipo':    sorted(
            [{'nome': n, 'qtd': q} for n, q in contagem.items()],
            key=lambda x: (-x['qtd'], x['nome']),
        ),
        'atualizado_em': s.atualizado_em.strftime('%H:%M:%S'),
    }


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_sessoes(request):
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    if request.method == 'GET':
        corte = timezone.now() - SESSAO_VIVA
        qs = SessaoLeitura.objects.select_related('usuario').filter(
            empresa=empresa, aberta=True, atualizado_em__gte=corte,
        )
        tipos_por_codigo = {
            t.codigo.upper(): t for t in TipoEnxoval.objects.filter(empresa=empresa)
        }
        return JsonResponse({
            'sessoes': [_sessao_dict(s, tipos_por_codigo) for s in qs]
        })

    data = json.loads(request.body or '{}')
    epcs = list(dict.fromkeys(_norm_epc(e) for e in data.get('epcs', []) if e))

    sessao, _ = SessaoLeitura.objects.get_or_create(
        empresa=empresa, usuario=request.user, aberta=True,
        defaults={'tipo_mov': data.get('tipo_mov') or ''},
    )
    sessao.tipo_mov    = data.get('tipo_mov') or sessao.tipo_mov
    sessao.responsavel = data.get('responsavel') or sessao.responsavel
    sessao.epcs        = epcs
    if data.get('encerrar'):
        sessao.aberta = False
    sessao.save()
    return JsonResponse({'ok': True, 'id': sessao.id, 'total': len(epcs)})


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

        # busca por trecho do EPC: serve para identificar uma etiqueta avulsa
        # a partir do que se consegue ler dela
        busca = _norm_epc(request.GET.get('q'))
        if busca:
            qs = qs.filter(epc__contains=busca)

        qs = qs.order_by('tipo__nome', 'serial')
        total = qs.count()

        try:
            limite = min(int(request.GET.get('limite', 200)), 500)
            inicio = max(int(request.GET.get('inicio', 0)), 0)
        except ValueError:
            limite, inicio = 200, 0

        return JsonResponse({
            'pecas':  [_peca_dict(p) for p in qs[inicio:inicio + limite]],
            'total':  total,
            'inicio': inicio,
            'limite': limite,
        })

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
        # o EPC é único no sistema inteiro, então a busca é global de propósito:
        # uma etiqueta de outra empresa é conflito, não peça a ser assumida
        existentes = {
            p.epc: p for p in
            PecaEnxoval.objects.select_related('tipo', 'empresa').filter(epc__in=epcs_norm)
        }

        # Uma etiqueta já cadastrada não pode trocar de item: o código do tipo
        # está gravado dentro do EPC, então mudar só no banco faria a etiqueta
        # física e o cadastro discordarem. Recusamos e avisamos qual é o motivo.
        conflitos = []
        for epc, peca in existentes.items():
            if peca.empresa_id != empresa.id:
                conflitos.append({'epc': epc, 'motivo': 'já cadastrada em outra empresa'})
            elif peca.tipo_id != tipo.id:
                conflitos.append({'epc': epc, 'motivo': f'já cadastrada como {peca.tipo.nome}'})

        conflitantes = {c['epc'] for c in conflitos}

        novos = []
        for epc in epcs_norm:
            if epc in existentes or epc in conflitantes:
                continue
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

    return JsonResponse({
        'ok':        True,
        'criadas':   len(novos),
        # já existiam com o mesmo tipo: reenvio do mesmo lote não é erro
        'repetidas': len(existentes) - len(conflitos),
        'conflitos': conflitos,
        'total':     len(epcs_norm),
    })


@csrf_exempt
@require_http_methods(['POST'])
def api_pecas_baixa(request):
    """Tira peças de circulação. A etiqueta continua válida e pode ser regravada
    para outra peça depois — o que se descarta é o tecido, não o transponder."""
    empresa = _empresa(request)
    if not empresa:
        return _err('empresa required', 400)

    # baixa de peça é baixa de ativo: quem valida a perda é a controladoria
    if not _pode_gerir(request):
        return _err('descarte precisa ser validado pela gerência ou controladoria', 403)

    data   = json.loads(request.body or '{}')
    epcs   = list(dict.fromkeys(_norm_epc(e) for e in data.get('epcs', []) if e))
    motivo = (data.get('motivo') or '').strip()

    if not epcs:
        return _err('lista de epcs vazia')

    with transaction.atomic():
        encontradas = {
            p.epc: p for p in
            PecaEnxoval.objects.select_related('tipo').filter(empresa=empresa, epc__in=epcs)
        }
        desconhecidas = [e for e in epcs if e not in encontradas]
        ja_baixadas   = [e for e, p in encontradas.items() if p.status == PecaEnxoval.BAIXADA]

        alvos = [p for p in encontradas.values() if p.status != PecaEnxoval.BAIXADA]
        for p in alvos:
            p.status = PecaEnxoval.BAIXADA
            if motivo:
                p.observacoes = motivo
        if alvos:
            PecaEnxoval.objects.bulk_update(alvos, ['status', 'observacoes'])

    return JsonResponse({
        'ok':            True,
        'baixadas':      len(alvos),
        'ja_baixadas':   len(ja_baixadas),
        'desconhecidas': desconhecidas,
        'itens':         [{'epc': p.epc, 'tipo_nome': p.tipo.nome} for p in alvos],
        'total':         len(epcs),
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
