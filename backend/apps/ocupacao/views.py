from decimal import Decimal, InvalidOperation
from datetime import date
from django.db import transaction
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from .models import OcupacaoDiaria
from .serializers import OcupacaoDiariaSerializer


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
        return int(float(str(v))) if v not in (None, '', 'None') else default
    except (ValueError, TypeError):
        return default

def _date(v):
    if not v:
        return None
    if isinstance(v, date):
        return v
    s = str(v).strip()
    # DD/MM/YYYY
    if len(s) == 10 and s[2] == '/':
        try:
            d, m, y = s.split('/')
            return date(int(y), int(m), int(d))
        except Exception:
            pass
    # YYYY-MM-DD
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None


# ── LISTA / DASHBOARD ──────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ocupacao_list(request):
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    qs = OcupacaoDiaria.objects.filter(empresa=emp)

    # filtros opcionais
    tipo       = request.query_params.get('tipo')
    data_ini   = request.query_params.get('data_ini')
    data_fim   = request.query_params.get('data_fim')
    mes        = request.query_params.get('mes')   # YYYY-MM
    ano        = request.query_params.get('ano')

    if tipo:
        qs = qs.filter(tipo=tipo)
    if data_ini:
        qs = qs.filter(data__gte=data_ini)
    if data_fim:
        qs = qs.filter(data__lte=data_fim)
    if mes:
        qs = qs.filter(data__startswith=mes)
    if ano:
        qs = qs.filter(data__year=ano)

    data = OcupacaoDiariaSerializer(qs, many=True).data
    return JsonResponse(data, safe=False)


# ── IMPORTAÇÃO ─────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ocupacao_importar(request):
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    registros   = request.data.get('registros', [])
    substituir  = request.data.get('substituir', False)

    if not isinstance(registros, list) or not registros:
        return _err('"registros" deve ser uma lista não vazia')

    criados = atualizados = ignorados = 0

    with transaction.atomic():
        for r in registros:
            dt   = _date(r.get('Data') or r.get('data'))
            tipo = 'previsao' if r.get('PREVISÃO') or r.get('previsao') else 'historico'

            if not dt:
                ignorados += 1
                continue

            defaults = dict(
                ocup_n      = _int(r.get('Ocup_N')),
                ocup_a      = _int(r.get('Ocup_A')),
                ocup_f      = _int(r.get('Ocup_F')),
                ocup_u      = _int(r.get('Ocup_U')),
                ocup_d      = _int(r.get('Ocup_D')),
                ocup_t      = _int(r.get('Ocup_T')),
                ocup_n_chd  = _int(r.get('Ocup_N_CHD')),
                ocup_n_ant  = _int(r.get('Ocup_N_Ant')),
                hosp_n      = _int(r.get('Hosp_N')),
                hosp_a      = _int(r.get('Hosp_A')),
                hosp_f      = _int(r.get('Hosp_F')),
                hosp_u      = _int(r.get('Hosp_U')),
                hosp_d      = _int(r.get('Hosp_D')),
                hosp_t      = _int(r.get('Hosp_T')),
                hosp_check_in  = _int(r.get('Hosp_Check_In')),
                hosp_check_out = _int(r.get('Hosp_Check_Out')),
                check_in    = _int(r.get('Check_In')),
                check_out   = _int(r.get('Check_Out')),
                day_use     = _int(r.get('Day_Use')),
                no_show     = _int(r.get('No_Show')),
                uh_manutencao  = _int(r.get('UH_Manutencao')),
                uh_interditada = _int(r.get('UH_Interditada')),
                uh_rsv_tecnica = _int(r.get('UH_Rsv_Tecnica')),
                uh_total       = _int(r.get('UH_Total')),
                uh_disp_venda  = _int(r.get('UH_Disp_Venda')),
                taxa_ocup      = _dec(r.get('Taxa_Ocup')),
                taxa_ocup_abs  = _dec(r.get('Taxa_Ocup_Abs')),
                taxa_ocup_perc = _dec(r.get('Taxa_Ocup_Perc')),
                diaria_n       = _dec(r.get('Diaria_N')),
                diaria_n_bruta = _dec(r.get('Diaria_N_Bruta')),
                hp      = _dec(r.get('HP')),
                ep      = _dec(r.get('EP')),
                cp      = _dec(r.get('CP')),
                map_v   = _dec(r.get('MAP')),
                fap     = _dec(r.get('FAP')),
                total   = _dec(r.get('Total')),
                occ     = _dec(r.get('Occ')),
                occ_abs = _dec(r.get('Occ_Abs')),
            )

            obj, created = OcupacaoDiaria.objects.get_or_create(
                empresa=emp, data=dt, tipo=tipo, defaults=defaults
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

    return JsonResponse({'ok': True, 'criados': criados, 'atualizados': atualizados, 'ignorados': ignorados})


# ── LIMPAR ────────────────────────────────────────────────────────────────────

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def ocupacao_limpar(request):
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)
    tipo = request.query_params.get('tipo')
    qs = OcupacaoDiaria.objects.filter(empresa=emp)
    if tipo:
        qs = qs.filter(tipo=tipo)
    count, _ = qs.delete()
    return JsonResponse({'ok': True, 'deletados': count})


# ── RESUMO MENSAL (para cards de KPI) ────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ocupacao_resumo(request):
    emp = _emp(request)
    if not emp:
        return _err('Empresa não identificada', 403)

    tipo     = request.query_params.get('tipo', 'historico')
    data_ini = request.query_params.get('data_ini')
    data_fim = request.query_params.get('data_fim')

    qs = OcupacaoDiaria.objects.filter(empresa=emp, tipo=tipo)
    if data_ini:
        qs = qs.filter(data__gte=data_ini)
    if data_fim:
        qs = qs.filter(data__lte=data_fim)

    total = qs.count()
    if total == 0:
        return JsonResponse({'ok': True, 'total_dias': 0})

    from django.db.models import Sum, Avg, Max, Min
    agg = qs.aggregate(
        sum_ocup_t     = Sum('ocup_t'),
        sum_hosp_t     = Sum('hosp_t'),
        sum_check_in   = Sum('check_in'),
        sum_check_out  = Sum('check_out'),
        sum_day_use    = Sum('day_use'),
        sum_no_show    = Sum('no_show'),
        avg_taxa       = Avg('taxa_ocup_perc'),
        avg_diaria     = Avg('diaria_n'),
        sum_uh_disp    = Sum('uh_disp_venda'),
        sum_uh_total   = Sum('uh_total'),
        sum_uh_manut   = Sum('uh_manutencao'),
        sum_uh_inter   = Sum('uh_interditada'),
        avg_ocup_n_ant = Avg('ocup_n_ant'),
    )

    # RevPAR médio = ADR × Taxa_Ocup/100
    revpar = float(agg['avg_diaria'] or 0) * float(agg['avg_taxa'] or 0) / 100

    return JsonResponse({
        'ok':           True,
        'total_dias':   total,
        'ocup_t':       agg['sum_ocup_t'] or 0,
        'hosp_t':       agg['sum_hosp_t'] or 0,
        'check_in':     agg['sum_check_in'] or 0,
        'check_out':    agg['sum_check_out'] or 0,
        'day_use':      agg['sum_day_use'] or 0,
        'no_show':      agg['sum_no_show'] or 0,
        'taxa_ocup':    round(float(agg['avg_taxa'] or 0), 2),
        'adr':          round(float(agg['avg_diaria'] or 0), 2),
        'revpar':       round(revpar, 2),
        'uh_disp':      agg['sum_uh_disp'] or 0,
        'uh_total':     agg['sum_uh_total'] or 0,
        'uh_manut':     agg['sum_uh_manut'] or 0,
        'uh_inter':     agg['sum_uh_inter'] or 0,
    })
