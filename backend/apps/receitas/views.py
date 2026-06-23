import io
from datetime import datetime, timedelta
from collections import defaultdict

import pandas as pd
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import (
    ArquivoImportado, LancamentoDiario, ConfiguracaoReceita,
    MetaMensal, LancamentoAdicional,
)


def _empresa(request):
    """Retorna empresa ativa do request, ou None (modo legado)."""
    return getattr(request, 'empresa', None)


def _arquivo_ativo(empresa):
    qs = ArquivoImportado.objects.filter(ativo=True)
    if empresa:
        qs = qs.filter(empresa=empresa)
    return qs.first()


# ─── STATUS ───────────────────────────────────────────────────────────────────
def api_status(request):
    empresa = _empresa(request)
    arquivo = _arquivo_ativo(empresa)
    if not arquivo:
        return JsonResponse({'ok': False, 'mensagem': 'Nenhum arquivo importado ainda.'})
    return JsonResponse({
        'ok': True,
        'arquivo': arquivo.nome,
        'data_upload': arquivo.data_upload.strftime('%d/%m/%Y %H:%M'),
        'total_registros': arquivo.total_registros,
    })


# ─── UPLOAD DE PLANILHA ───────────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(['POST'])
def upload_excel(request):
    if 'arquivo' not in request.FILES:
        return JsonResponse({'ok': False, 'erro': 'Nenhum arquivo enviado.'}, status=400)

    empresa = _empresa(request)
    f    = request.FILES['arquivo']
    nome = f.name

    try:
        dias, total_transacoes = _parse_planilha(f.read(), nome)
    except Exception as e:
        return JsonResponse({'ok': False, 'erro': f'Erro ao ler arquivo: {e}'}, status=400)

    if not dias:
        return JsonResponse({'ok': False, 'erro': 'Nenhum registro válido encontrado.'}, status=400)

    qs_anterior = ArquivoImportado.objects.all()
    if empresa:
        qs_anterior = qs_anterior.filter(empresa=empresa)
    qs_anterior.update(ativo=False)

    create_kwargs = {'nome': nome, 'total_registros': total_transacoes}
    if empresa:
        create_kwargs['empresa'] = empresa
    else:
        from apps.empresas.models import Empresa as EmpresaModel
        primeira = EmpresaModel.objects.filter(ativo=True).first()
        if primeira:
            create_kwargs['empresa'] = primeira
        else:
            return JsonResponse({'ok': False, 'erro': 'Nenhuma empresa cadastrada no sistema.'}, status=400)

    arquivo = ArquivoImportado.objects.create(**create_kwargs)

    objs = [
        LancamentoDiario(
            arquivo=arquivo,
            data=d,
            mes=d.strftime('%Y-%m'),
            hosp=v['hosp'], ab=v['ab'], outros=v['outros'],
            total=v['hosp'] + v['ab'] + v['outros'],
        )
        for d, v in sorted(dias.items())
    ]
    LancamentoDiario.objects.bulk_create(objs, batch_size=1000)

    meses = sorted({d.strftime('%Y-%m') for d in dias})

    return JsonResponse({
        'ok': True,
        'arquivo': nome,
        'total_registros': total_transacoes,
        'dias_importados': len(dias),
        'meses': meses,
    })


# ─── PARSER DE PLANILHA (consolidado Tower: DH_Lancamento / Debito / Credito / Grupo_CR) ──
def _parse_planilha(conteudo: bytes, nome: str):
    buf = io.BytesIO(conteudo)

    nome_lower = nome.lower()
    if nome_lower.endswith('.csv'):
        df_raw = None
        for sep in [';', ',', '\t']:
            try:
                cand = pd.read_csv(buf, sep=sep, dtype=str, encoding='utf-8-sig')
                if len(cand.columns) > 2:
                    df_raw = cand
                    break
                buf.seek(0)
            except Exception:
                buf.seek(0)
        if df_raw is None:
            raise ValueError('não foi possível ler o CSV')
    elif nome_lower.endswith('.xls'):
        df_raw = pd.read_excel(buf, dtype=str, engine='xlrd')
    else:
        df_raw = pd.read_excel(buf, dtype=str, engine='openpyxl')

    df_raw.columns = [str(c).strip() for c in df_raw.columns]
    cols = {c.lower().replace(' ', '').replace('_', ''): c for c in df_raw.columns}

    col_data = _find(cols, ['dhlancamento', 'datalancamento', 'data'])
    col_deb  = _find(cols, ['debito'])
    col_cred = _find(cols, ['credito'])
    col_grp  = _find(cols, ['grupocr', 'grupo'])

    if not col_data or (not col_deb and not col_cred):
        raise ValueError(f'colunas não identificadas (DH_Lancamento / Debito / Credito). Encontradas: {list(df_raw.columns)}')

    dias = defaultdict(lambda: {'hosp': 0.0, 'ab': 0.0, 'outros': 0.0})
    total_transacoes = 0

    for _, row in df_raw.iterrows():
        dt = _parse_data(row.get(col_data))
        if dt is None:
            continue
        liquido = _to_float(row.get(col_deb, 0)) + _to_float(row.get(col_cred, 0))
        grupo = _grupo_of(row.get(col_grp, '') if col_grp else '')
        dias[dt][grupo] += liquido
        total_transacoes += 1

    return dias, total_transacoes


def _find(cols, candidatos):
    for c in candidatos:
        if c in cols:
            return cols[c]
    for c in candidatos:
        for lc, orig in cols.items():
            if c in lc:
                return orig
    return None


def _grupo_of(g) -> str:
    s = str(g or '').upper()
    if 'HOSPEDAGEM' in s:
        return 'hosp'
    if 'ALIMENTOS' in s or 'BEBIDAS' in s:
        return 'ab'
    return 'outros'


def _parse_data(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in ('nan', 'none', ''):
        return None
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y %H:%M:%S', '%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(s[:19], fmt).date()
        except Exception:
            pass
    try:
        serial = float(s)
        return (datetime(1899, 12, 30) + timedelta(days=serial)).date()
    except Exception:
        return None


def _to_float(v) -> float:
    if v is None:
        return 0.0
    s = str(v).strip().replace('R$', '').replace(' ', '')
    if not s or s.lower() in ('nan', 'none'):
        return 0.0
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace(',', '.')
    try:
        return float(s)
    except Exception:
        return 0.0


# ─── LANÇAMENTOS DIÁRIOS ──────────────────────────────────────────────────────
def api_lancamentos(request):
    empresa    = _empresa(request)
    arquivo_id = request.GET.get('arquivo_id')

    if arquivo_id:
        qs_arquivo = ArquivoImportado.objects.filter(pk=arquivo_id)
        if empresa:
            qs_arquivo = qs_arquivo.filter(empresa=empresa)
        arquivo = qs_arquivo.first()
    else:
        arquivo = _arquivo_ativo(empresa)

    if not arquivo:
        return JsonResponse([], safe=False)

    qs = LancamentoDiario.objects.filter(arquivo=arquivo).order_by('data')
    data = [
        {
            'data':   r.data.isoformat(),
            'mes':    r.mes,
            'hosp':   float(r.hosp),
            'ab':     float(r.ab),
            'outros': float(r.outros),
            'total':  float(r.total),
        }
        for r in qs
    ]
    return JsonResponse(data, safe=False)


# ─── LISTA DE ARQUIVOS ────────────────────────────────────────────────────────
def api_arquivos(request):
    empresa = _empresa(request)
    qs = ArquivoImportado.objects.all()
    if empresa:
        qs = qs.filter(empresa=empresa)

    data = [
        {
            'id':              a.id,
            'nome':            a.nome,
            'data_upload':     a.data_upload.strftime('%d/%m/%Y %H:%M'),
            'total_registros': a.total_registros,
            'ativo':           a.ativo,
        }
        for a in qs
    ]
    return JsonResponse(data, safe=False)


# ─── ATIVAR ARQUIVO ───────────────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(['POST'])
def api_ativar_arquivo(request, pk):
    try:
        empresa = _empresa(request)
        qs = ArquivoImportado.objects.all()
        if empresa:
            qs = qs.filter(empresa=empresa)
        qs.update(ativo=False)
        ArquivoImportado.objects.filter(pk=pk).update(ativo=True)
        return JsonResponse({'ok': True})
    except Exception as e:
        return JsonResponse({'ok': False, 'erro': str(e)}, status=400)


# ─── DELETAR ARQUIVO ──────────────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(['DELETE'])
def api_deletar_arquivo(request, pk):
    try:
        ArquivoImportado.objects.filter(pk=pk).delete()
        return JsonResponse({'ok': True})
    except Exception as e:
        return JsonResponse({'ok': False, 'erro': str(e)}, status=400)


# ─── METAS MENSAIS (orçado / forecast) ────────────────────────────────────────
def _configuracao(empresa):
    if not empresa:
        return None
    cfg, _ = ConfiguracaoReceita.objects.get_or_create(empresa=empresa)
    return cfg


def api_metas(request):
    empresa = _empresa(request)
    cfg = _configuracao(empresa)
    padrao = {
        'orcado':   float(cfg.orcado_padrao) if cfg else 0,
        'forecast': float(cfg.forecast_padrao) if cfg else 0,
    }
    qs = MetaMensal.objects.all()
    if empresa:
        qs = qs.filter(empresa=empresa)
    months = {
        m.mes: {
            'orcado':   float(m.orcado) if m.orcado is not None else None,
            'forecast': float(m.forecast) if m.forecast is not None else None,
        }
        for m in qs
    }
    return JsonResponse({'padrao': padrao, 'months': months})


@csrf_exempt
@require_http_methods(['POST'])
def api_metas_padrao(request):
    import json
    empresa = _empresa(request)
    if not empresa:
        return JsonResponse({'ok': False, 'erro': 'Nenhuma empresa ativa.'}, status=400)
    try:
        body = json.loads(request.body or '{}')
    except Exception:
        return JsonResponse({'ok': False, 'erro': 'JSON inválido.'}, status=400)

    cfg = _configuracao(empresa)
    if 'orcado' in body:
        cfg.orcado_padrao = body['orcado'] or 0
    if 'forecast' in body:
        cfg.forecast_padrao = body['forecast'] or 0
    cfg.save()
    return JsonResponse({'ok': True})


@csrf_exempt
@require_http_methods(['POST'])
def api_meta_mes(request, mes):
    import json
    empresa = _empresa(request)
    if not empresa:
        return JsonResponse({'ok': False, 'erro': 'Nenhuma empresa ativa.'}, status=400)
    try:
        body = json.loads(request.body or '{}')
    except Exception:
        return JsonResponse({'ok': False, 'erro': 'JSON inválido.'}, status=400)

    orcado   = body.get('orcado', None)
    forecast = body.get('forecast', None)

    if orcado in (None, '') and forecast in (None, ''):
        MetaMensal.objects.filter(empresa=empresa, mes=mes).delete()
        return JsonResponse({'ok': True})

    meta, _ = MetaMensal.objects.get_or_create(empresa=empresa, mes=mes)
    meta.orcado   = orcado if orcado not in (None, '') else None
    meta.forecast = forecast if forecast not in (None, '') else None
    meta.save()
    return JsonResponse({'ok': True})


# ─── LANÇAMENTOS ADICIONAIS (ajustes) ─────────────────────────────────────────
def api_ajustes(request):
    empresa = _empresa(request)
    mes = request.GET.get('mes')
    qs = LancamentoAdicional.objects.all()
    if empresa:
        qs = qs.filter(empresa=empresa)
    if mes:
        qs = qs.filter(mes=mes)
    data = [
        {
            'id':        a.id,
            'mes':       a.mes,
            'descricao': a.descricao,
            'valor':     float(a.valor),
        }
        for a in qs
    ]
    return JsonResponse(data, safe=False)


@csrf_exempt
@require_http_methods(['POST'])
def api_ajuste_criar(request):
    import json
    empresa = _empresa(request)
    if not empresa:
        return JsonResponse({'ok': False, 'erro': 'Nenhuma empresa ativa.'}, status=400)
    try:
        body = json.loads(request.body or '{}')
    except Exception:
        return JsonResponse({'ok': False, 'erro': 'JSON inválido.'}, status=400)

    mes   = body.get('mes')
    valor = body.get('valor')
    if not mes or valor in (None, ''):
        return JsonResponse({'ok': False, 'erro': 'mes e valor são obrigatórios.'}, status=400)

    ajuste = LancamentoAdicional.objects.create(
        empresa=empresa, mes=mes, valor=valor, descricao=(body.get('descricao') or '').strip(),
    )
    return JsonResponse({'ok': True, 'id': ajuste.id})


@csrf_exempt
@require_http_methods(['DELETE'])
def api_ajuste_deletar(request, pk):
    try:
        empresa = _empresa(request)
        qs = LancamentoAdicional.objects.filter(pk=pk)
        if empresa:
            qs = qs.filter(empresa=empresa)
        qs.delete()
        return JsonResponse({'ok': True})
    except Exception as e:
        return JsonResponse({'ok': False, 'erro': str(e)}, status=400)
