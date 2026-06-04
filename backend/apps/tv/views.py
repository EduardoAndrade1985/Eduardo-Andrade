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
        from apps.ocupacao.models import Ocupacao
        hoje = str(localdate())
        qs = Ocupacao.objects.filter(empresa=empresa, data=hoje)
        if not qs.exists():
            return None
        r = qs.first()
        total_uhs = empresa.total_uhs or 1
        taxa = round((r.uhs_ocupadas / total_uhs) * 100, 1) if total_uhs else 0
        return {
            'taxa_ocupacao': taxa,
            'uhs_ocupadas':  r.uhs_ocupadas,
            'uhs_livres':    total_uhs - r.uhs_ocupadas,
            'adr':           float(r.adr or 0),
            'revpar':        float(r.revpar or 0),
            'checkins':      r.checkins or 0,
            'checkouts':     r.checkouts or 0,
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
