import json
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from .models import TransacaoOperadora, TransacaoSistema, PeriodoConciliado, LogConciliacao
from .serializers import (
    TransacaoOperadoraSerializer, TransacaoSistemaSerializer,
    PeriodoConciliadoSerializer, LogConciliacaoSerializer,
)


def _emp(request):
    return getattr(request, 'empresa', None)


def _err(msg, status=400):
    return JsonResponse({'ok': False, 'erro': msg}, status=status)


def _to_dec(v, default=0):
    try:
        return Decimal(str(v)).quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError):
        return Decimal(str(default))


# ─── TRANSAÇÕES OPERADORA ─────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def transacoes_list(request):
    """Retorna todas as transações de operadoras da empresa ativa."""
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)
    qs = TransacaoOperadora.objects.filter(empresa=emp)
    return JsonResponse(TransacaoOperadoraSerializer(qs, many=True).data, safe=False)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def transacoes_importar(request):
    """
    Importa registros de operadora em bulk.
    Cada item é inserido apenas se não existir ainda
    (dedup por empresa + operadora + autorizacao + data + nsu + valor_operadora).
    Retorna os objetos criados com seus IDs do banco.
    """
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    records = request.data if isinstance(request.data, list) else []
    criados = []
    ignorados = 0

    for r in records:
        data = r.get('d') or r.get('data')
        if not data:
            ignorados += 1
            continue
        try:
            with transaction.atomic():  # savepoint individual — erro num registro nao quebra os outros
                obj, created = TransacaoOperadora.objects.get_or_create(
                    empresa=emp,
                    operadora=str(r.get('o', '')),
                    autorizacao=str(r.get('a', '')),
                    data=data,
                    nsu=str(r.get('n', '')),
                    valor_operadora=_to_dec(r.get('vo', 0)),
                    defaults=dict(
                        hora=str(r.get('h', '')),
                        bandeira=str(r.get('b', '')),
                        modalidade=str(r.get('m', '')),
                        num_cartao=str(r.get('c', '')),
                        taxa=_to_dec(r.get('tx', 0)),
                        valor_liquido=_to_dec(r.get('vl', 0)),
                        parcelas=int(r.get('p', 0)),
                        status_venda=str(r.get('sv', '')),
                        status='pendente',
                    ),
                )
            if created:
                criados.append(obj)
            else:
                ignorados += 1
        except Exception:
            ignorados += 1

    data_out = TransacaoOperadoraSerializer(criados, many=True).data
    return JsonResponse({'ok': True, 'criados': len(criados), 'ignorados': ignorados, 'registros': data_out})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def transacoes_conciliar(request):
    """
    Recebe o resultado da conciliação feita no frontend e persiste no banco.
    Body: lista de objetos com id + campos de reconciliação.
    """
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    records = request.data if isinstance(request.data, list) else []
    atualizados = 0

    with transaction.atomic():
        for r in records:
            pk = r.get('id')
            if not pk:
                continue
            try:
                obj = TransacaoOperadora.objects.get(id=pk, empresa=emp)
                obj.valor_sistema   = _to_dec(r.get('vs', 0))
                obj.diferenca       = _to_dec(r.get('df', 0))
                obj.qtd_operadora   = int(r.get('nOp', 1))
                obj.qtd_sistema     = int(r.get('nSis', 0))
                obj.agrupamento     = str(r.get('ag', ''))
                obj.tipo_match      = str(r.get('mt', ''))
                obj.tipo_grupo      = str(r.get('gt', ''))
                obj.soma_positivos  = _to_dec(r.get('stP', 0))
                obj.soma_negativos  = _to_dec(r.get('stN', 0))
                obj.num_controle    = str(r.get('sd', ''))
                obj.num_doc_sis     = str(r.get('sn', ''))
                obj.bandeira_sistema = str(r.get('bi', ''))
                obj.hospede         = str(r.get('hp', ''))
                obj.usuario_sistema = str(r.get('usr', ''))
                obj.info_sistema    = str(r.get('si', ''))
                obj.valida_auth     = bool(r.get('va', True))
                obj.valida_nsu      = bool(r.get('vn', True))
                obj.valida_bandeira = bool(r.get('vb', True))
                obj.status          = str(r.get('st', 'pendente'))
                obj.locked          = bool(r.get('locked', False))
                obj.ajuste          = r.get('ajuste')
                obj.save(update_fields=[
                    'valor_sistema', 'diferenca', 'qtd_operadora', 'qtd_sistema',
                    'agrupamento', 'tipo_match', 'tipo_grupo', 'soma_positivos', 'soma_negativos',
                    'num_controle', 'num_doc_sis', 'bandeira_sistema', 'hospede',
                    'usuario_sistema', 'info_sistema', 'valida_auth', 'valida_nsu', 'valida_bandeira',
                    'status', 'locked', 'ajuste', 'atualizado_em',
                ])
                atualizados += 1
            except TransacaoOperadora.DoesNotExist:
                pass

    return JsonResponse({'ok': True, 'atualizados': atualizados})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def transacao_atualizar(request, pk):
    """Atualiza status/ajuste de uma única transação (ajuste, arredondamento, reversão)."""
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)
    try:
        obj = TransacaoOperadora.objects.get(id=pk, empresa=emp)
    except TransacaoOperadora.DoesNotExist:
        return _err('Transação não encontrada', 404)

    fields_to_update = []
    for field, attr in [('st', 'status'), ('locked', 'locked'), ('ajuste', 'ajuste'),
                        ('vo', 'valor_operadora'), ('vs', 'valor_sistema'), ('df', 'diferenca')]:
        if field in request.data:
            val = request.data[field]
            if attr in ('valor_operadora', 'valor_sistema', 'diferenca'):
                val = _to_dec(val)
            setattr(obj, attr, val)
            fields_to_update.append(attr)

    if fields_to_update:
        fields_to_update.append('atualizado_em')
        obj.save(update_fields=fields_to_update)

    return JsonResponse(TransacaoOperadoraSerializer(obj).data)


# ─── SISTEMA (ERP) ────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sistema_list(request):
    """Retorna todos os registros do ERP da empresa ativa."""
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)
    qs = TransacaoSistema.objects.filter(empresa=emp)
    return JsonResponse(TransacaoSistemaSerializer(qs, many=True).data, safe=False)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sistema_importar(request):
    """
    Substitui TODOS os registros do ERP da empresa pelo arquivo recém importado.
    O ERP sempre exporta acumulado (não incremental), então substituição é correta.
    """
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    records = request.data.get('registros', [])
    nome_arquivo = str(request.data.get('arquivo', ''))

    if not isinstance(records, list):
        return _err('Campo "registros" deve ser uma lista')

    def parse_date(v):
        if not v:
            return None
        try:
            from datetime import date
            if isinstance(v, str) and len(v) >= 10:
                return date.fromisoformat(v[:10])
        except Exception:
            pass
        return None

    with transaction.atomic():
        # Substituição total: apaga e recria
        TransacaoSistema.objects.filter(empresa=emp).delete()
        objs = [
            TransacaoSistema(
                empresa=emp,
                cod_autorizacao=str(r.get('Cod_Autorizacao_Cartao', '')).strip(),
                valor_pago=_to_dec(r.get('Valor_Pago', 0)),
                num_parcela=int(r.get('Num_Parcela', 0) or 0),
                num_doc=str(r.get('Num_Doc_Pagto', '')).strip(),
                seq_nf=str(r.get('Seq_NF', '')).strip(),
                obs=str(r.get('Obs', ''))[:500],
                hospede=str(r.get('Hospede', '')),
                inst_pagto=str(r.get('Inst_Pagto', '')),
                codinome=str(r.get('Codinome', '')).strip(),
                data=parse_date(r.get('Data')),
                arquivo_nome=nome_arquivo,
            )
            for r in records
            if str(r.get('Cod_Autorizacao_Cartao', '')).strip()
        ]
        TransacaoSistema.objects.bulk_create(objs, batch_size=500)

    return JsonResponse({'ok': True, 'importados': len(objs), 'arquivo': nome_arquivo})


# ─── PERÍODOS CONCILIADOS ─────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def periodos_list(request):
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)
    qs = PeriodoConciliado.objects.filter(empresa=emp)
    return JsonResponse(PeriodoConciliadoSerializer(qs, many=True).data, safe=False)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def periodos_fechar(request):
    """Registra o fechamento de um período e trava as transações até a data."""
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    data_ate = request.data.get('data_ate')
    if not data_ate:
        return _err('data_ate é obrigatório')

    with transaction.atomic():
        # Trava transações até a data
        TransacaoOperadora.objects.filter(empresa=emp, data__lte=data_ate).update(locked=True)
        # Cria o período
        periodo = PeriodoConciliado.objects.create(
            empresa=emp,
            data_ate=data_ate,
            total_transacoes=int(request.data.get('total', 0)),
            total_ok=int(request.data.get('ok', 0)),
            observacao=str(request.data.get('obs', '')),
        )

    return JsonResponse({'ok': True, 'periodo': PeriodoConciliadoSerializer(periodo).data})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def periodos_abrir(request):
    """Reabre um período: destrava transações e remove os períodos a partir da data."""
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    data_from = request.data.get('data_from')
    if not data_from:
        return _err('data_from é obrigatório')

    with transaction.atomic():
        TransacaoOperadora.objects.filter(empresa=emp, data__gte=data_from).update(locked=False)
        PeriodoConciliado.objects.filter(empresa=emp, data_ate__gte=data_from).delete()

    return JsonResponse({'ok': True})


# ─── LIMPEZA ──────────────────────────────────────────────────────────────────

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def limpar(request):
    """Remove todos os dados de conciliação da empresa."""
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)
    with transaction.atomic():
        TransacaoOperadora.objects.filter(empresa=emp).delete()
        TransacaoSistema.objects.filter(empresa=emp).delete()
        PeriodoConciliado.objects.filter(empresa=emp).delete()
        LogConciliacao.objects.filter(empresa=emp).delete()
    return JsonResponse({'ok': True})


# ─── LOG DE AUDITORIA ─────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def log_view(request):
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    if request.method == 'GET':
        qs = LogConciliacao.objects.filter(empresa=emp)[:200]
        return JsonResponse(LogConciliacaoSerializer(qs, many=True).data, safe=False)

    # POST: adiciona entradas em bulk
    entries = request.data if isinstance(request.data, list) else [request.data]
    objs = [
        LogConciliacao(empresa=emp, icone=str(e.get('ic', '')), descricao=str(e.get('d', '')))
        for e in entries if e.get('d')
    ]
    LogConciliacao.objects.bulk_create(objs)
    # Mantém só os últimos 500
    ids_manter = LogConciliacao.objects.filter(empresa=emp).values_list('id', flat=True)[:500]
    LogConciliacao.objects.filter(empresa=emp).exclude(id__in=list(ids_manter)).delete()
    return JsonResponse({'ok': True, 'criados': len(objs)})
