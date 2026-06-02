import io
import re
import unicodedata
from datetime import datetime, date

import pandas as pd
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import ArquivoEstoque, EntradaNota


def _empresa(request):
    return getattr(request, 'empresa', None)


def _norm_key(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode()
    return re.sub(r'[ _\-&.,/()\[\]]+', '', s.lower())


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


def _parse_date(v) -> date | None:
    if v is None:
        return None
    if isinstance(v, (date, datetime)):
        return v.date() if isinstance(v, datetime) else v
    s = str(v).strip()
    if not s or s in ('nan', 'None', 'NaT', ''):
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except Exception:
            pass
    return None


def _find(col_map, candidatos):
    for c in candidatos:
        if c in col_map:
            return col_map[c]
    return None


# ─── STATUS ───────────────────────────────────────────────────────────────────
def api_status(request):
    empresa = _empresa(request)
    qs = ArquivoEstoque.objects.filter(ativo=True)
    if empresa:
        qs = qs.filter(empresa=empresa)
    arquivo = qs.first()
    if not arquivo:
        return JsonResponse({'ok': False})
    return JsonResponse({
        'ok': True,
        'arquivo': arquivo.nome,
        'data_upload': arquivo.data_upload.strftime('%d/%m/%Y %H:%M'),
        'total_registros': arquivo.total_registros,
        'id': arquivo.id,
    })


# ─── UPLOAD ───────────────────────────────────────────────────────────────────
@csrf_exempt
@require_http_methods(['POST'])
def api_upload(request):
    if 'arquivo' not in request.FILES:
        return JsonResponse({'ok': False, 'erro': 'Nenhum arquivo enviado.'}, status=400)

    empresa = _empresa(request)
    f    = request.FILES['arquivo']
    nome = f.name

    try:
        registros = _parse_excel(f.read(), nome)
    except Exception as e:
        return JsonResponse({'ok': False, 'erro': f'Erro ao ler arquivo: {e}'}, status=400)

    if not registros:
        return JsonResponse({'ok': False, 'erro': 'Nenhum registro válido encontrado.'}, status=400)

    # Desativa arquivos anteriores da mesma empresa
    qs_ant = ArquivoEstoque.objects.all()
    if empresa:
        qs_ant = qs_ant.filter(empresa=empresa)
    qs_ant.update(ativo=False)

    create_kwargs = {'nome': nome, 'total_registros': len(registros)}
    if empresa:
        create_kwargs['empresa'] = empresa
    else:
        from apps.empresas.models import Empresa as EmpresaModel
        primeira = EmpresaModel.objects.filter(ativo=True).first()
        if not primeira:
            return JsonResponse({'ok': False, 'erro': 'Nenhuma empresa cadastrada.'}, status=400)
        create_kwargs['empresa'] = primeira

    arquivo = ArquivoEstoque.objects.create(**create_kwargs)

    objs = [
        EntradaNota(
            arquivo=arquivo,
            data=r['data'],
            item=r['item'],
            classe=r['classe'],
            almox=r['almox'],
            fornecedor=r['fornecedor'],
            nf=r['nf'],
            qtde=r['qtde'],
            preco=r['preco'],
            valor_total=r['valor_total'],
            unidade=r['unidade'],
            controlado=r['controlado'],
        )
        for r in registros
    ]
    EntradaNota.objects.bulk_create(objs, batch_size=1000)

    return JsonResponse({
        'ok': True,
        'arquivo': nome,
        'total_registros': len(registros),
        'id': arquivo.id,
    })


# ─── PARSER ───────────────────────────────────────────────────────────────────
def _parse_excel(conteudo: bytes, nome: str) -> list:
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
    col_map = {_norm_key(c): c for c in df_raw.columns}

    col_data  = _find(col_map, ['data', 'dtentrada', 'dataentrada', 'datamovimento'])
    col_item  = _find(col_map, ['itemestoquedescricao', 'itemdescricao', 'descricaoitem', 'item', 'descricao', 'produto'])
    col_classe= _find(col_map, ['classeestoquedescricao', 'classedescricao', 'classe', 'categoria', 'grupo'])
    col_almox = _find(col_map, ['almoxprim', 'almoxarifado', 'almox', 'deposito'])
    col_forn  = _find(col_map, ['fornecedorrazaosocial', 'razaosocial', 'fornecedor', 'fornecedornome'])
    col_nf    = _find(col_map, ['numerodocnfe', 'numdocnfe', 'numeronf', 'nf', 'notafiscal', 'numerodocumento'])
    col_qtde  = _find(col_map, ['qtdemovimentada', 'qtdemovimentadabase', 'quantidade', 'qtde', 'qtd'])
    col_preco = _find(col_map, ['precopago', 'precountario', 'precomed', 'preco', 'valorunitario'])
    col_ctrl  = _find(col_map, ['estoquecontrolado', 'controlado', 'ctrl'])
    col_unid  = _find(col_map, ['unidade', 'unid', 'un'])

    registros = []
    for _, row in df_raw.iterrows():
        dt = _parse_date(row.get(col_data, '') if col_data else '')
        if not dt:
            continue

        qtde  = _to_float(row.get(col_qtde,  0) if col_qtde  else 0)
        preco = _to_float(row.get(col_preco, 0) if col_preco else 0)

        registros.append({
            'data':       dt,
            'item':       str(row.get(col_item,   '') or '').strip() if col_item  else '',
            'classe':     str(row.get(col_classe, '') or '').strip() if col_classe else '',
            'almox':      str(row.get(col_almox,  '') or '').strip() if col_almox  else '',
            'fornecedor': str(row.get(col_forn,   '') or '').strip() if col_forn   else '',
            'nf':         str(row.get(col_nf,     '') or '').strip() if col_nf     else '',
            'qtde':       round(qtde, 4),
            'preco':      round(preco, 4),
            'valor_total': round(qtde * preco, 2),
            'unidade':    str(row.get(col_unid,   '') or '').strip() if col_unid   else '',
            'controlado': str(row.get(col_ctrl,   '') or '').strip()[:1] if col_ctrl else '',
        })

    return registros


# ─── ENTRADAS ─────────────────────────────────────────────────────────────────
def api_entradas(request):
    empresa    = _empresa(request)
    arquivo_id = request.GET.get('arquivo_id')

    if arquivo_id:
        qs_arq = ArquivoEstoque.objects.filter(pk=arquivo_id)
    else:
        qs_arq = ArquivoEstoque.objects.filter(ativo=True)
    if empresa:
        qs_arq = qs_arq.filter(empresa=empresa)
    arquivo = qs_arq.first()

    if not arquivo:
        return JsonResponse([], safe=False)

    qs = EntradaNota.objects.filter(arquivo=arquivo)

    data_ini = request.GET.get('data_ini')
    data_fim = request.GET.get('data_fim')
    almox    = request.GET.get('almox')
    classe   = request.GET.get('classe')
    forn     = request.GET.get('forn')
    ctrl     = request.GET.get('ctrl')

    if data_ini: qs = qs.filter(data__gte=data_ini)
    if data_fim: qs = qs.filter(data__lte=data_fim)
    if almox:    qs = qs.filter(almox=almox)
    if classe:   qs = qs.filter(classe=classe)
    if forn:     qs = qs.filter(fornecedor=forn)
    if ctrl:     qs = qs.filter(controlado=ctrl)

    data = list(qs.values(
        'data', 'item', 'classe', 'almox', 'fornecedor',
        'nf', 'qtde', 'preco', 'valor_total', 'unidade', 'controlado',
    ))
    for r in data:
        r['data']        = r['data'].isoformat()
        r['qtde']        = float(r['qtde'])
        r['preco']       = float(r['preco'])
        r['valor_total'] = float(r['valor_total'])

    return JsonResponse(data, safe=False)


# ─── ARQUIVOS ─────────────────────────────────────────────────────────────────
def api_arquivos(request):
    empresa = _empresa(request)
    qs = ArquivoEstoque.objects.all()
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


@csrf_exempt
@require_http_methods(['POST'])
def api_ativar_arquivo(request, pk):
    empresa = _empresa(request)
    qs = ArquivoEstoque.objects.all()
    if empresa:
        qs = qs.filter(empresa=empresa)
    qs.update(ativo=False)
    ArquivoEstoque.objects.filter(pk=pk).update(ativo=True)
    return JsonResponse({'ok': True})


@csrf_exempt
@require_http_methods(['DELETE'])
def api_deletar_arquivo(request, pk):
    ArquivoEstoque.objects.filter(pk=pk).delete()
    return JsonResponse({'ok': True})
