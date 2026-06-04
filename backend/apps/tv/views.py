from django.http import JsonResponse
from django.utils.timezone import now
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from apps.empresas.models import MembroEmpresa
from .models import TVConfig, TVMidia


def _check_admin(request):
    if request.user.is_superuser or request.user.is_staff:
        return True
    membro = getattr(request, 'membro', None)
    return membro and membro.papel in ('admin', 'gerente')


# ── Config da TV (privado) ────────────────────────────────────────────────────
class TVConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def _empresa(self, request):
        return getattr(request, 'empresa', None)

    def get(self, request):
        empresa = self._empresa(request)
        if not empresa:
            return Response({'error': 'Empresa não encontrada.'}, status=400)
        cfg, _ = TVConfig.objects.get_or_create(empresa=empresa)
        midias = list(TVMidia.objects.filter(empresa=empresa, ativo=True).values(
            'id', 'titulo', 'tipo', 'url', 'duracao', 'ordem'
        ))
        return Response({
            'id':       cfg.id,
            'token':    cfg.token,
            'nome':     cfg.nome,
            'ativo':    cfg.ativo,
            'playlist': cfg.playlist,
            'midias':   midias,
            'tv_url':   f'/tv/{cfg.token}',
        })

    def patch(self, request):
        if not _check_admin(request):
            return Response({'error': 'Sem permissão.'}, status=403)
        empresa = self._empresa(request)
        if not empresa:
            return Response({'error': 'Empresa não encontrada.'}, status=400)
        cfg, _ = TVConfig.objects.get_or_create(empresa=empresa)
        if 'nome'     in request.data: cfg.nome     = request.data['nome']
        if 'ativo'    in request.data: cfg.ativo    = request.data['ativo']
        if 'playlist' in request.data: cfg.playlist = request.data['playlist']
        cfg.save()
        return Response({'ok': True, 'token': cfg.token})

    def post(self, request):
        """Regenera o token."""
        if not _check_admin(request):
            return Response({'error': 'Sem permissão.'}, status=403)
        empresa = self._empresa(request)
        if not empresa:
            return Response({'error': 'Empresa não encontrada.'}, status=400)
        cfg, _ = TVConfig.objects.get_or_create(empresa=empresa)
        from apps.tv.models import gen_token
        cfg.token = gen_token()
        cfg.save(update_fields=['token'])
        return Response({'token': cfg.token})


# ── Mídia (privado) ───────────────────────────────────────────────────────────
class TVMidiaView(APIView):
    permission_classes = [IsAuthenticated]

    def _empresa(self, request):
        return getattr(request, 'empresa', None)

    def get(self, request):
        empresa = self._empresa(request)
        if not empresa:
            return Response([])
        midias = list(TVMidia.objects.filter(empresa=empresa).values(
            'id', 'titulo', 'tipo', 'url', 'duracao', 'ordem', 'ativo', 'created_at'
        ))
        return Response(midias)

    def post(self, request):
        if not _check_admin(request):
            return Response({'error': 'Sem permissão.'}, status=403)
        empresa = self._empresa(request)
        if not empresa:
            return Response({'error': 'Empresa não encontrada.'}, status=400)
        url    = request.data.get('url', '').strip()
        titulo = request.data.get('titulo', '').strip()
        tipo   = request.data.get('tipo', 'imagem')
        duracao = int(request.data.get('duracao', 15))
        if not url:
            return Response({'error': 'URL obrigatória.'}, status=400)
        midia = TVMidia.objects.create(
            empresa=empresa, url=url, titulo=titulo,
            tipo=tipo, duracao=duracao,
            ordem=TVMidia.objects.filter(empresa=empresa).count(),
        )
        return Response({'id': midia.id, 'ok': True})


class TVMidiaDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        empresa = getattr(request, 'empresa', None)
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
        midias = {
            m['id']: m for m in TVMidia.objects.filter(empresa=empresa, ativo=True).values(
                'id', 'titulo', 'tipo', 'url', 'duracao'
            )
        }

        # Dados de ocupação (hoje)
        ocupacao_data = _get_ocupacao(empresa)
        # Dados de custos (mês atual)
        custos_data = _get_custos(empresa)

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
            'empresa_nome': empresa.nome_fantasia or empresa.nome,
            'empresa_cor':  empresa.cor_primaria or '#2dd4a0',
            'playlist':     playlist,
        })


def _get_ocupacao(empresa):
    """Retorna KPIs de ocupação do dia atual."""
    try:
        from django.utils.timezone import localdate
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
    """Retorna KPIs de custos do mês atual."""
    try:
        from django.utils.timezone import localdate
        from apps.custos.models import Movimentacao
        hoje = localdate()
        mes_ini = hoje.replace(day=1).isoformat()[:7]  # YYYY-MM
        total = Movimentacao.objects.filter(
            empresa=empresa, mes__startswith=mes_ini
        ).aggregate(total=__import__('django.db.models', fromlist=['Sum']).Sum('valor'))['total'] or 0
        return {'total_mes': float(total), 'mes': mes_ini}
    except Exception:
        return None
