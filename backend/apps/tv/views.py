from django.db import models as db_models
from django.utils.timezone import localdate
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from .models import TVConfig, TVMidia


def _check_admin(request):
    if request.user.is_superuser or request.user.is_staff:
        return True
    membro = getattr(request, 'membro', None)
    return membro and membro.papel in ('admin', 'gerente')


def _empresa(request):
    return getattr(request, 'empresa', None)


def _config_data(cfg):
    return {
        'id':       cfg.id,
        'token':    cfg.token,
        'nome':     cfg.nome,
        'local':    cfg.local,
        'ativo':    cfg.ativo,
        'playlist': cfg.playlist,
        'tv_url':   f'/tv/{cfg.token}',
    }


# ── Lista / Criar dispositivos ────────────────────────────────────────────────
class TVConfigListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        empresa = _empresa(request)
        if not empresa:
            return Response([])
        configs = TVConfig.objects.filter(empresa=empresa)
        return Response([_config_data(c) for c in configs])

    def post(self, request):
        if not _check_admin(request):
            return Response({'error': 'Sem permissão.'}, status=403)
        empresa = _empresa(request)
        if not empresa:
            return Response({'error': 'Empresa não encontrada.'}, status=400)
        nome  = request.data.get('nome', 'Nova TV').strip()
        local = request.data.get('local', '').strip()
        cfg   = TVConfig.objects.create(empresa=empresa, nome=nome, local=local)
        return Response(_config_data(cfg), status=201)


# ── Detalhe / Editar / Deletar dispositivo ────────────────────────────────────
class TVConfigDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        empresa = _empresa(request)
        if not empresa:
            return None
        try:
            return TVConfig.objects.get(pk=pk, empresa=empresa)
        except TVConfig.DoesNotExist:
            return None

    def get(self, request, pk):
        cfg = self._get(request, pk)
        if not cfg:
            return Response({'error': 'Não encontrado.'}, status=404)
        midias = list(TVMidia.objects.filter(empresa=cfg.empresa, ativo=True).values(
            'id', 'titulo', 'tipo', 'url', 'duracao', 'ordem', 'data_inicio', 'data_fim'
        ))
        data = _config_data(cfg)
        data['midias'] = midias
        return Response(data)

    def patch(self, request, pk):
        if not _check_admin(request):
            return Response({'error': 'Sem permissão.'}, status=403)
        cfg = self._get(request, pk)
        if not cfg:
            return Response({'error': 'Não encontrado.'}, status=404)
        for f in ('nome', 'local', 'ativo', 'playlist'):
            if f in request.data:
                setattr(cfg, f, request.data[f])
        cfg.save()
        return Response(_config_data(cfg))

    def delete(self, request, pk):
        if not _check_admin(request):
            return Response({'error': 'Sem permissão.'}, status=403)
        cfg = self._get(request, pk)
        if not cfg:
            return Response({'error': 'Não encontrado.'}, status=404)
        cfg.delete()
        return Response({'ok': True})


# ── Regenerar token ───────────────────────────────────────────────────────────
class TVTokenRegenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _check_admin(request):
            return Response({'error': 'Sem permissão.'}, status=403)
        empresa = _empresa(request)
        try:
            cfg = TVConfig.objects.get(pk=pk, empresa=empresa)
        except TVConfig.DoesNotExist:
            return Response({'error': 'Não encontrado.'}, status=404)
        from .models import gen_token
        cfg.token = gen_token()
        cfg.save(update_fields=['token'])
        return Response({'token': cfg.token, 'tv_url': f'/tv/{cfg.token}'})


# ── Upload de arquivo de mídia ────────────────────────────────────────────────
class TVMidiaUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _check_admin(request):
            return Response({'error': 'Sem permissão.'}, status=403)
        empresa = _empresa(request)
        if not empresa:
            return Response({'error': 'Empresa não encontrada.'}, status=400)
        arquivo = request.FILES.get('arquivo')
        if not arquivo:
            return Response({'error': 'Nenhum arquivo enviado.'}, status=400)

        import os, uuid
        from django.conf import settings

        ext     = os.path.splitext(arquivo.name)[1].lower()
        nome    = f"tv/{uuid.uuid4().hex}{ext}"
        caminho = os.path.join(settings.MEDIA_ROOT, nome)
        os.makedirs(os.path.dirname(caminho), exist_ok=True)

        with open(caminho, 'wb') as f:
            for chunk in arquivo.chunks():
                f.write(chunk)

        url = request.build_absolute_uri(settings.MEDIA_URL + nome)
        return Response({'url': url, 'ok': True})


# ── Mídia ─────────────────────────────────────────────────────────────────────
class TVMidiaListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        empresa = _empresa(request)
        if not empresa:
            return Response([])
        midias = list(TVMidia.objects.filter(empresa=empresa).values(
            'id', 'titulo', 'tipo', 'url', 'duracao', 'ordem',
            'ativo', 'data_inicio', 'data_fim', 'created_at'
        ))
        return Response(midias)

    def post(self, request):
        if not _check_admin(request):
            return Response({'error': 'Sem permissão.'}, status=403)
        empresa = _empresa(request)
        if not empresa:
            return Response({'error': 'Empresa não encontrada.'}, status=400)
        url    = request.data.get('url', '').strip()
        if not url:
            return Response({'error': 'URL obrigatória.'}, status=400)
        midia = TVMidia.objects.create(
            empresa=empresa,
            url=url,
            titulo=request.data.get('titulo', '').strip(),
            tipo=request.data.get('tipo', 'imagem'),
            duracao=int(request.data.get('duracao', 15)),
            data_inicio=request.data.get('data_inicio') or None,
            data_fim=request.data.get('data_fim') or None,
            ordem=TVMidia.objects.filter(empresa=empresa).count(),
        )
        return Response({'id': midia.id, 'ok': True}, status=201)


class TVMidiaDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        empresa = _empresa(request)
        if not empresa:
            return None
        try:
            return TVMidia.objects.get(pk=pk, empresa=empresa)
        except TVMidia.DoesNotExist:
            return None

    def patch(self, request, pk):
        if not _check_admin(request):
            return Response({'error': 'Sem permissão.'}, status=403)
        midia = self._get(request, pk)
        if not midia:
            return Response({'error': 'Não encontrado.'}, status=404)
        for f in ('titulo', 'url', 'tipo', 'duracao', 'ordem', 'ativo'):
            if f in request.data:
                setattr(midia, f, request.data[f])
        if 'data_inicio' in request.data:
            midia.data_inicio = request.data['data_inicio'] or None
        if 'data_fim' in request.data:
            midia.data_fim = request.data['data_fim'] or None
        midia.save()
        return Response({'ok': True})

    def delete(self, request, pk):
        if not _check_admin(request):
            return Response({'error': 'Sem permissão.'}, status=403)
        midia = self._get(request, pk)
        if not midia:
            return Response({'error': 'Não encontrado.'}, status=404)
        midia.delete()
        return Response({'ok': True})


# ── Endpoint público para a TV ────────────────────────────────────────────────
class TVPublicView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            cfg = TVConfig.objects.select_related('empresa').get(token=token, ativo=True)
        except TVConfig.DoesNotExist:
            return Response({'error': 'TV não encontrada ou inativa.'}, status=404)

        empresa = cfg.empresa
        today   = localdate()

        # Mídia filtrada por agendamento
        midias_qs = TVMidia.objects.filter(
            empresa=empresa, ativo=True
        ).filter(
            db_models.Q(data_inicio__isnull=True) | db_models.Q(data_inicio__lte=today)
        ).filter(
            db_models.Q(data_fim__isnull=True) | db_models.Q(data_fim__gte=today)
        )
        midias = {m.id: {'id': m.id, 'titulo': m.titulo, 'tipo': m.tipo, 'url': m.url, 'duracao': m.duracao}
                  for m in midias_qs}

        ocupacao_data = _get_ocupacao(empresa)
        custos_data   = _get_custos(empresa)

        playlist = []
        for item in cfg.playlist:
            entry = dict(item)
            if item.get('tipo') == 'midia':
                mid = midias.get(item.get('midia_id'))
                if mid:
                    entry['midia'] = mid
                else:
                    continue
            elif item.get('tipo') == 'ocupacao':
                entry['dados'] = ocupacao_data
            elif item.get('tipo') == 'custos':
                entry['dados'] = custos_data
            playlist.append(entry)

        return Response({
            'dispositivo':  cfg.nome,
            'local':        cfg.local,
            'empresa_nome': empresa.nome_fantasia or empresa.nome,
            'empresa_cor':  empresa.cor_primaria or '#2dd4a0',
            'playlist':     playlist,
        })


def _get_ocupacao(empresa):
    try:
        from apps.ocupacao.models import OcupacaoDiaria
        from datetime import timedelta
        hoje = localdate()

        # Tenta hoje, senão dia anterior
        r = (OcupacaoDiaria.objects.filter(empresa=empresa, data=hoje, tipo='historico').first()
             or OcupacaoDiaria.objects.filter(empresa=empresa, data=hoje - timedelta(days=1), tipo='historico').first())
        if not r:
            return None

        # Dados de ontem para variação
        ontem = OcupacaoDiaria.objects.filter(empresa=empresa, data=r.data - timedelta(days=1), tipo='historico').first()

        # Histórico do mês (para gráfico)
        mes_ini = r.data.replace(day=1)
        historico_qs = OcupacaoDiaria.objects.filter(
            empresa=empresa, tipo='historico',
            data__gte=mes_ini, data__lte=hoje
        ).order_by('data')

        historico = []
        for h in historico_qs:
            mes = h.data.strftime('%d/%m')
            historico.append({
                'data':  mes,
                'taxa':  float(h.taxa_ocup_perc or 0),
                'adr':   float(h.diaria_n or 0),
                'revpar': float(h.revpar or 0),
            })

        total_uhs = r.uh_disp_venda or empresa.total_uhs or 1
        livres    = max(0, total_uhs - (r.ocup_t or 0))

        def var(novo, ant):
            if ant and float(ant) != 0:
                return round((float(novo or 0) - float(ant)) / float(ant) * 100, 1)
            return None

        return {
            'taxa_ocupacao': float(r.taxa_ocup_perc or 0),
            'uhs_ocupadas':  r.ocup_t or 0,
            'uhs_livres':    livres,
            'total_uhs':     total_uhs,
            'adr':           float(r.diaria_n or 0),
            'revpar':        float(r.revpar or 0),
            'receita_dia':   float(r.total or 0),
            'hospedes':      r.hosp_t or 0,
            'checkins':      r.check_in or 0,
            'checkouts':     r.check_out or 0,
            'data':          str(r.data),
            'var_taxa':      var(r.taxa_ocup_perc, ontem.taxa_ocup_perc if ontem else None),
            'var_adr':       var(r.diaria_n, ontem.diaria_n if ontem else None),
            'var_revpar':    var(r.revpar, ontem.revpar if ontem else None),
            'var_receita':   var(r.total, ontem.total if ontem else None),
            'historico':     historico,
        }
    except Exception:
        return None


def _get_custos(empresa):
    try:
        from apps.custos.models import Movimentacao
        from django.db.models import Sum
        hoje    = localdate()
        mes_ini = hoje.replace(day=1).isoformat()[:7]
        total   = Movimentacao.objects.filter(
            empresa=empresa, mes__startswith=mes_ini
        ).aggregate(total=Sum('valor'))['total'] or 0
        return {'total_mes': float(total), 'mes': mes_ini}
    except Exception:
        return None
