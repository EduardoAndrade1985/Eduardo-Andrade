import io
from datetime import datetime

import pandas as pd
from django.http import JsonResponse, FileResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from .models import ArquivoImportado, Movimentacao


def _empresa(request):
    """Retorna empresa ativa do request, ou None (modo legado)."""
    return getattr(request, 'empresa', None)


# ─── INDEX — serve o dashboard HTML ───────────────────────────────────────────
def index(request):
    return FileResponse(
        open(settings.BASE_DIR / 'static' / 'Dashboard_de_Custos Atualizado.html', 'rb'),
        content_type='text/html; charset=utf-8',
    )


# ─── STATUS ───────────────────────────────────────────────────────────────────
def api_status(request):
    empresa = _empresa(request)
    qs = ArquivoImportado.objects.filter(ativo=True)
    if empresa:
        qs = qs.filter(empresa=empresa)
    arquivo = qs.first()
    if not arquivo:
        return JsonResponse({'ok': False, 'mensagem': 'Nenhum arquivo importado ainda.'})
    return JsonResponse({
        'ok': True,
        'arquivo': arquivo.nome,
        'data_upload': arquivo.data_upload.strftime('%d/%m/%Y %H:%M'),
        'total_registros': arquivo.total_registros,
    })


# ─── UPLOAD DE EXCEL ──────────────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(['POST'])
def upload_excel(request):
    if 'arquivo' not in request.FILES:
        return JsonResponse({'ok': False, 'erro': 'Nenhum arquivo enviado.'}, status=400)

    empresa = _empresa(request)
    f    = request.FILES['arquivo']
    nome = f.name

    try:
        df = _parse_excel(f.read(), nome)
    except Exception as e:
        return JsonResponse({'ok': False, 'erro': f'Erro ao ler arquivo: {e}'}, status=400)

    if df.empty:
        return JsonResponse({'ok': False, 'erro': 'Nenhum registro válido encontrado.'}, status=400)

    # Desativa arquivos anteriores (da mesma empresa, se disponível)
    qs_anterior = ArquivoImportado.objects.all()
    if empresa:
        qs_anterior = qs_anterior.filter(empresa=empresa)
    qs_anterior.update(ativo=False)

    create_kwargs = {'nome': nome, 'total_registros': len(df)}
    if empresa:
        create_kwargs['empresa'] = empresa
    else:
        # Legado: usa primeira empresa disponível ou falha graciosamente
        from apps.empresas.models import Empresa as EmpresaModel
        primeira = EmpresaModel.objects.filter(ativo=True).first()
        if primeira:
            create_kwargs['empresa'] = primeira
        else:
            return JsonResponse({'ok': False, 'erro': 'Nenhuma empresa cadastrada no sistema.'}, status=400)

    arquivo = ArquivoImportado.objects.create(**create_kwargs)

    objs = [
        Movimentacao(
            arquivo=arquivo,
            item=row['item'],
            grupo=row['grupo'],
            cc=row['cc'],
            mes=row['mes'],
            valor=row['valor'],
            qtde=row['qtde'],
            preco_unit=row['precoUnit'],
        )
        for _, row in df.iterrows()
    ]
    Movimentacao.objects.bulk_create(objs, batch_size=1000)

    return JsonResponse({
        'ok': True,
        'arquivo': nome,
        'total_registros': len(df),
        'meses': sorted(df['mes'].unique().tolist()),
        'ccs':   sorted(df['cc'].unique().tolist()),
    })


# ─── PARSER DE EXCEL / CSV ────────────────────────────────────────────────────
def _parse_excel(conteudo: bytes, nome: str) -> pd.DataFrame:
    buf = io.BytesIO(conteudo)

    nome_lower = nome.lower()
    if nome_lower.endswith('.csv'):
        for sep in [';', ',', '\t']:
            try:
                df_raw = pd.read_csv(buf, sep=sep, dtype=str, encoding='utf-8-sig')
                if len(df_raw.columns) > 2:
                    break
                buf.seek(0)
            except Exception:
                buf.seek(0)
    elif nome_lower.endswith('.xls'):
        df_raw = pd.read_excel(buf, dtype=str, engine='xlrd')
    else:
        df_raw = pd.read_excel(buf, dtype=str, engine='openpyxl')

    df_raw.columns = [str(c).strip() for c in df_raw.columns]
    cols = {c.lower().replace(' ', '').replace('_', ''): c for c in df_raw.columns}

    desc_cols = [c for lc, c in cols.items() if 'descricao' in lc or 'descrição' in lc]
    col_item  = desc_cols[0] if len(desc_cols) >= 1 else _find(cols, ['item', 'produto'])
    col_grupo = desc_cols[1] if len(desc_cols) >= 2 else _find(cols, ['grupo', 'categoria', 'classe'])
    col_cc    = desc_cols[2] if len(desc_cols) >= 3 else _find(cols, ['centro', 'cc', 'centrodecusto'])
    col_data  = _find(cols, ['data', 'datamovimentacao', 'datamov', 'periodo', 'mes'])
    col_valor = _find(cols, ['valortotal', 'valor', 'total', 'custo', 'precopago', 'preco'])
    col_qtde  = _find(cols, ['qtde', 'qtd', 'quantidade', 'qtdemovimentadabase'])

    if not col_item or not col_cc or not col_valor:
        raise ValueError(f'Colunas não identificadas. Encontradas: {list(df_raw.columns)}')

    is_preco_unit = 'preco' in (col_valor or '').lower() and 'total' not in (col_valor or '').lower()

    records = []
    for _, row in df_raw.iterrows():
        item  = str(row.get(col_item,  '') or '').strip()
        grupo = str(row.get(col_grupo, '') or 'Sem categoria').strip() if col_grupo else 'Sem categoria'
        cc    = str(row.get(col_cc,    '') or 'Sem CC').strip()
        mes   = _parse_mes(str(row.get(col_data, '') or ''))
        valor = _to_float(row.get(col_valor, 0))
        qtde  = _to_float(row.get(col_qtde, 0)) if col_qtde else 0
        preco = valor
        if is_preco_unit and qtde:
            valor = preco * qtde

        if not item and not valor:
            continue
        if not mes:
            continue

        records.append({
            'item':     item  or 'Item sem nome',
            'grupo':    grupo or 'Sem categoria',
            'cc':       cc    or 'Sem CC',
            'mes':      mes,
            'valor':    round(valor, 2),
            'qtde':     round(qtde, 4),
            'precoUnit': round(preco, 4),
        })

    return pd.DataFrame(records)


def _find(cols, candidatos):
    for c in candidatos:
        if c in cols:
            return cols[c]
    return None


def _parse_mes(s: str) -> str:
    s = s.strip()
    if not s or s in ('nan', 'None', ''):
        return ''
    for fmt in ('%Y-%m-%d', '%Y-%m', '%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(s[:10], fmt).strftime('%Y-%m')
        except Exception:
            pass
    return ''


def _to_float(v) -> float:
    if v is None:
        return 0.0
    s = str(v).strip().replace('R$', '').replace(' ', '')
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace(',', '.')
    try:
        return float(s)
    except Exception:
        return 0.0


# ─── API DE DADOS ─────────────────────────────────────────────────────────────
def api_movimentacoes(request):
    empresa    = _empresa(request)
    arquivo_id = request.GET.get('arquivo_id')

    if arquivo_id:
        qs_arquivo = ArquivoImportado.objects.filter(pk=arquivo_id)
        if empresa:
            qs_arquivo = qs_arquivo.filter(empresa=empresa)
        arquivo = qs_arquivo.first()
    else:
        qs_arquivo = ArquivoImportado.objects.filter(ativo=True)
        if empresa:
            qs_arquivo = qs_arquivo.filter(empresa=empresa)
        arquivo = qs_arquivo.first()

    if not arquivo:
        return JsonResponse([], safe=False)

    qs = Movimentacao.objects.filter(arquivo=arquivo)

    cc      = request.GET.get('cc')
    grupo   = request.GET.get('grupo')
    mes_ini = request.GET.get('mes_ini')
    mes_fim = request.GET.get('mes_fim')

    if cc:      qs = qs.filter(cc=cc)
    if grupo:   qs = qs.filter(grupo=grupo)
    if mes_ini: qs = qs.filter(mes__gte=mes_ini)
    if mes_fim: qs = qs.filter(mes__lte=mes_fim)

    data = list(qs.values('item', 'grupo', 'cc', 'mes', 'valor', 'qtde', 'preco_unit'))
    for r in data:
        r['precoUnit'] = float(r.pop('preco_unit'))
        r['valor']     = float(r['valor'])
        r['qtde']      = float(r['qtde'])

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
        for a in qs.values_list('id', 'nome', 'data_upload', 'total_registros', 'ativo')
    ]
    # values_list retorna tuples, refazer com .values()
    data = []
    for a in qs:
        data.append({
            'id':              a.id,
            'nome':            a.nome,
            'data_upload':     a.data_upload.strftime('%d/%m/%Y %H:%M'),
            'total_registros': a.total_registros,
            'ativo':           a.ativo,
        })
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
