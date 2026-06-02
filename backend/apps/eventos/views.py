import unicodedata
from decimal import Decimal, InvalidOperation
from datetime import date
from django.db import transaction
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from .models import Evento
from .serializers import EventoSerializer


def _emp(request):
    return getattr(request, 'empresa', None)

def _err(msg, status=400):
    return JsonResponse({'ok': False, 'erro': msg}, status=status)

def _dec(v, default=0):
    try:
        return Decimal(str(v)).quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError):
        return Decimal(str(default))

def _int(v, default=0):
    try:
        return int(float(str(v))) if v not in (None, '', 'None', 'nan') else default
    except (ValueError, TypeError):
        return default

def _date(v):
    if not v:
        return None
    if isinstance(v, date):
        return v
    s = str(v).strip()
    if not s or s in ('None', 'nan'):
        return None
    if len(s) >= 10 and s[2] == '/':
        try:
            d, m, y = s[:10].split('/')
            return date(int(y), int(m), int(d))
        except Exception:
            pass
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None

def _norm_key(k):
    """Normalize a key: remove accents, lowercase, strip spaces/punctuation."""
    s = unicodedata.normalize('NFD', str(k))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    for ch in (' ', '_', '-', '&', '.', ',', '/', '(', ')'):
        s = s.replace(ch, '')
    return s.lower()

def _normalize_row(r):
    """Return dict with all keys normalized (no accents, lowercase, no spaces)."""
    result = {}
    for k, v in r.items():
        nk = _norm_key(k)
        if nk not in result:
            result[nk] = v
    return result

def _nget(nr, *norm_keys, default=None):
    """Get value from a normalized-key row dict."""
    for k in norm_keys:
        v = nr.get(k)
        if v is not None and str(v).strip() not in ('', 'None', 'nan'):
            return v
    return default

_STATUS_MAP = {
    'a': 'A', 'atendido': 'A',
    'c': 'C', 'confirmado': 'C',
    'o': 'O', 'contrato': 'O',
    'g': 'G', 'negociacao': 'G',
}

def _status(v):
    if not v:
        return 'C'
    s = _norm_key(str(v).strip())
    return _STATUS_MAP.get(s, 'C')


# ── LISTA ─────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def eventos_list(request):
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    qs = Evento.objects.filter(empresa=emp)

    data_ini = request.query_params.get('data_ini')
    data_fim = request.query_params.get('data_fim')
    status   = request.query_params.get('status')

    if data_ini:
        qs = qs.filter(fim__gte=data_ini)
    if data_fim:
        qs = qs.filter(inicio__lte=data_fim)
    if status:
        qs = qs.filter(status=status.upper())

    data = EventoSerializer(qs, many=True).data
    return JsonResponse(data, safe=False)


# ── IMPORTAR ──────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def eventos_importar(request):
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    registros  = request.data.get('registros', [])
    substituir = request.data.get('substituir', False)

    if not isinstance(registros, list) or not registros:
        return _err('"registros" deve ser uma lista não vazia')

    colunas_orig = list(registros[0].keys()) if registros else []

    criados = atualizados = ignorados = 0

    with transaction.atomic():
        for r in registros:
            nr = _normalize_row(r)

            inicio = _date(_nget(nr,
                'inicio', 'datainicio', 'datainicial', 'datadeinicio',
                'dataentrada', 'checkin', 'datachegada',
            ))
            fim = _date(_nget(nr,
                'fim', 'datafim', 'datafinal', 'datatermino', 'datadetermino',
                'termino', 'saida', 'checkout', 'datasaida',
            ))

            if not inicio or not fim:
                ignorados += 1
                continue

            if fim < inicio:
                fim = inicio

            # Seq_Evento → seqevento como ID externo para deduplicação
            codigo = str(_nget(nr, 'seqevento', 'numreserva', 'id', 'codigo', 'cod', default='') or '').strip()

            defaults = dict(
                nome      = str(_nget(nr, 'identificacao', 'nome', 'evento', 'nomeevento', 'nomegrupo', 'grupo', default='Sem nome')),
                inicio    = inicio,
                fim       = fim,
                status    = _status(_nget(nr, 'status', 'situacao', 'fase')),
                exec_nome = str(_nget(nr, 'execvendas1', 'execvendas', 'exec', 'executivo', 'execnome', 'execvendas2', 'vendedor', default='') or ''),
                resp      = str(_nget(nr, 'respcomercial', 'resp', 'responsavel', 'coordenador', default='') or ''),
                cliente   = str(_nget(nr, 'nomeclisol', 'cliente', 'nomecliente', 'empresacliente', 'grupoorigem', 'empresa', default='') or ''),
                ramo      = str(_nget(nr, 'ramoatividadeclisol', 'ramo', 'ramoatividade', 'segmentomercado', default='') or ''),
                segmento  = str(_nget(nr, 'segmento', 'qualificacaoclisol', default='') or ''),
                # nomes exatos do Excel: Valor_Previsao_XXX / Valor_Realizado_XXX
                prev_hosp   = _dec(_nget(nr, 'valorprevisaohosp', 'prevhosp', 'previsaohosp', 'hospedagem', 'hosp', default=0)),
                prev_sala   = _dec(_nget(nr, 'valorprevisaosala', 'prevsala', 'previsaosala', 'sala', 'salas', default=0)),
                prev_aeb    = _dec(_nget(nr, 'valorprevisaoaeb', 'prevaeb', 'prevab', 'previsaoaeb', 'aeb', 'ab', 'alimentacao', default=0)),
                prev_outros = _dec(_nget(nr, 'valorprevisaooutros', 'prevoutros', 'previsaooutros', 'outros', default=0)),
                real_hosp   = _dec(_nget(nr, 'valorrealizadohosp', 'realhosp', 'realizadohosp', default=0)),
                real_sala   = _dec(_nget(nr, 'valorrealizadosala', 'realsala', 'realizadosala', default=0)),
                real_aeb    = _dec(_nget(nr, 'valorrealizadoaeb', 'realaeb', 'realizadoaeb', default=0)),
                real_outros = _dec(_nget(nr, 'valorrealizadooutros', 'realoutros', 'realizadooutros', default=0)),
                rn     = _int(_nget(nr, 'qtdetotalrn', 'rn', 'roomnights', 'pernoites', 'apartamentos', default=0)),
                diaria = _dec(_nget(nr, 'valortotaldia', 'diaria', 'diarias', 'valordiaria', 'tarifamedia', default=0)),
            )

            if codigo:
                defaults['codigo'] = codigo
                obj, created = Evento.objects.get_or_create(
                    empresa=emp, codigo=codigo, defaults=defaults
                )
                if created:
                    criados += 1
                elif substituir:
                    for k, v in defaults.items():
                        setattr(obj, k, v)
                    obj.save()
                    atualizados += 1
                else:
                    ignorados += 1
            else:
                Evento.objects.create(empresa=emp, **defaults)
                criados += 1

    return JsonResponse({
        'ok': True,
        'criados': criados,
        'atualizados': atualizados,
        'ignorados': ignorados,
        'colunas_encontradas': colunas_orig,
    })


# ── LIMPAR ────────────────────────────────────────────────────────────────────

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def eventos_limpar(request):
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    status = request.query_params.get('status')
    qs = Evento.objects.filter(empresa=emp)
    if status:
        qs = qs.filter(status=status.upper())

    count, _ = qs.delete()
    return JsonResponse({'ok': True, 'deletados': count})
