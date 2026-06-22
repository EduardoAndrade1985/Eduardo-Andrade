from datetime import timedelta, date as date_cls
from decimal import Decimal, InvalidOperation

from django.db.models import Sum, Avg, Count
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from .models import (
    Unidade, Setor, CategoriaAlimento, TipoPerda, Refeicao, ContagemClientes, RegistroDesperdicio,
    Dispositivo, DispositivoPairingCode,
)
from .serializers import (
    UnidadeSerializer, SetorSerializer, CategoriaAlimentoSerializer, TipoPerdaSerializer,
    RefeicaoSerializer, ContagemClientesSerializer, RegistroDesperdicioSerializer, DispositivoSerializer,
)
from .services.ia_service import classificar_foto
from .services.calculos import match_categoria, calcular_custo


def _empresa(request):
    return getattr(request, 'empresa', None)


def _check_admin(request):
    if request.user.is_authenticated and (request.user.is_superuser or request.user.is_staff):
        return True
    membro = getattr(request, 'membro', None)
    return bool(membro and membro.papel in ('admin', 'gerente'))


def _dispositivo_do_token(request):
    """Resolve o Dispositivo pareado a partir do token enviado no body/query —
    é a 'identidade' de um tablet/celular sem login, equivalente ao token de TV."""
    token = request.data.get('dispositivo_token') or request.GET.get('dispositivo_token')
    if not token:
        return None
    return Dispositivo.objects.filter(token=token, ativo=True).select_related('unidade', 'unidade__empresa', 'setor').first()


def _dec(v, default='0'):
    try:
        return Decimal(str(v))
    except (InvalidOperation, TypeError):
        return Decimal(default)


# ── UNIDADES ────────────────────────────────────────────────────────────────────
class UnidadeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        empresa = _empresa(request)
        if not empresa:
            return Response([])
        qs = Unidade.objects.filter(empresa=empresa)
        return Response(UnidadeSerializer(qs, many=True).data)

    def post(self, request):
        empresa = _empresa(request)
        if not empresa:
            return Response({'erro': 'Nenhuma empresa ativa.'}, status=400)
        nome = (request.data.get('nome') or '').strip()
        if not nome:
            return Response({'erro': 'Nome é obrigatório.'}, status=400)
        unidade = Unidade.objects.create(empresa=empresa, nome=nome)
        return Response(UnidadeSerializer(unidade).data, status=201)


class UnidadeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        empresa = _empresa(request)
        try:
            unidade = Unidade.objects.get(pk=pk, empresa=empresa)
        except Unidade.DoesNotExist:
            return Response({'erro': 'Não encontrada.'}, status=404)
        if 'nome' in request.data:
            unidade.nome = request.data['nome']
        if 'ativo' in request.data:
            unidade.ativo = request.data['ativo']
        unidade.save()
        return Response(UnidadeSerializer(unidade).data)

    def delete(self, request, pk):
        empresa = _empresa(request)
        Unidade.objects.filter(pk=pk, empresa=empresa).delete()
        return Response({'ok': True})


# ── SETORES ─────────────────────────────────────────────────────────────────────
class SetorListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        empresa = _empresa(request)
        unidade_id = request.GET.get('unidade_id')
        qs = Setor.objects.filter(unidade__empresa=empresa) if empresa else Setor.objects.none()
        if unidade_id:
            qs = qs.filter(unidade_id=unidade_id)
        return Response(SetorSerializer(qs, many=True).data)

    def post(self, request):
        empresa = _empresa(request)
        unidade_id = request.data.get('unidade_id')
        nome = (request.data.get('nome') or '').strip()
        if not nome or not unidade_id:
            return Response({'erro': 'nome e unidade_id são obrigatórios.'}, status=400)
        try:
            unidade = Unidade.objects.get(pk=unidade_id, empresa=empresa)
        except Unidade.DoesNotExist:
            return Response({'erro': 'Unidade não encontrada.'}, status=404)
        setor = Setor.objects.create(unidade=unidade, nome=nome)
        return Response(SetorSerializer(setor).data, status=201)


class SetorDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        empresa = _empresa(request)
        try:
            setor = Setor.objects.get(pk=pk, unidade__empresa=empresa)
        except Setor.DoesNotExist:
            return Response({'erro': 'Não encontrado.'}, status=404)
        if 'nome' in request.data:
            setor.nome = request.data['nome']
        if 'ativo' in request.data:
            setor.ativo = request.data['ativo']
        setor.save()
        return Response(SetorSerializer(setor).data)

    def delete(self, request, pk):
        empresa = _empresa(request)
        Setor.objects.filter(pk=pk, unidade__empresa=empresa).delete()
        return Response({'ok': True})


# ── TIPOS DE PERDA ───────────────────────────────────────────────────────────────
class TipoPerdaListView(APIView):
    """GET aceita login OU dispositivo pareado (tablet precisa listar os tipos)."""
    permission_classes = [AllowAny]

    def get(self, request):
        dispositivo = _dispositivo_do_token(request)
        if dispositivo:
            empresa = dispositivo.unidade.empresa
        elif request.user.is_authenticated:
            empresa = _empresa(request)
        else:
            return Response({'erro': 'Não autenticado.'}, status=401)
        if not empresa:
            return Response([])
        qs = TipoPerda.objects.filter(empresa=empresa, ativo=True)
        return Response(TipoPerdaSerializer(qs, many=True).data)

    def post(self, request):
        if not request.user.is_authenticated:
            return Response({'erro': 'Não autenticado.'}, status=401)
        empresa = _empresa(request)
        if not empresa:
            return Response({'erro': 'Nenhuma empresa ativa.'}, status=400)
        nome = (request.data.get('nome') or '').strip()
        if not nome:
            return Response({'erro': 'Nome é obrigatório.'}, status=400)
        tipo = TipoPerda.objects.create(empresa=empresa, nome=nome)
        return Response(TipoPerdaSerializer(tipo).data, status=201)


class TipoPerdaDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        empresa = _empresa(request)
        try:
            tipo = TipoPerda.objects.get(pk=pk, empresa=empresa)
        except TipoPerda.DoesNotExist:
            return Response({'erro': 'Não encontrado.'}, status=404)
        if 'nome' in request.data:
            tipo.nome = request.data['nome']
        if 'ativo' in request.data:
            tipo.ativo = request.data['ativo']
        tipo.save()
        return Response(TipoPerdaSerializer(tipo).data)

    def delete(self, request, pk):
        empresa = _empresa(request)
        TipoPerda.objects.filter(pk=pk, empresa=empresa).delete()
        return Response({'ok': True})


# ── REFEIÇÕES (café da manhã / almoço / jantar) ───────────────────────────────
class RefeicaoListView(APIView):
    """GET aceita login OU dispositivo pareado (tablet precisa listar as refeições)."""
    permission_classes = [AllowAny]

    def get(self, request):
        dispositivo = _dispositivo_do_token(request)
        if dispositivo:
            empresa = dispositivo.unidade.empresa
        elif request.user.is_authenticated:
            empresa = _empresa(request)
        else:
            return Response({'erro': 'Não autenticado.'}, status=401)
        if not empresa:
            return Response([])
        qs = Refeicao.objects.filter(empresa=empresa, ativo=True)
        return Response(RefeicaoSerializer(qs, many=True).data)

    def post(self, request):
        if not request.user.is_authenticated:
            return Response({'erro': 'Não autenticado.'}, status=401)
        empresa = _empresa(request)
        if not empresa:
            return Response({'erro': 'Nenhuma empresa ativa.'}, status=400)
        nome = (request.data.get('nome') or '').strip()
        if not nome:
            return Response({'erro': 'Nome é obrigatório.'}, status=400)
        refeicao = Refeicao.objects.create(empresa=empresa, nome=nome)
        return Response(RefeicaoSerializer(refeicao).data, status=201)


class RefeicaoDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        empresa = _empresa(request)
        try:
            refeicao = Refeicao.objects.get(pk=pk, empresa=empresa)
        except Refeicao.DoesNotExist:
            return Response({'erro': 'Não encontrada.'}, status=404)
        if 'nome' in request.data:
            refeicao.nome = request.data['nome']
        if 'ativo' in request.data:
            refeicao.ativo = request.data['ativo']
        refeicao.save()
        return Response(RefeicaoSerializer(refeicao).data)

    def delete(self, request, pk):
        empresa = _empresa(request)
        Refeicao.objects.filter(pk=pk, empresa=empresa).delete()
        return Response({'ok': True})


# ── CATEGORIAS ──────────────────────────────────────────────────────────────────
class CategoriaListView(APIView):
    """GET aceita login OU dispositivo pareado (tablet precisa listar categorias)."""
    permission_classes = [AllowAny]

    def get(self, request):
        dispositivo = _dispositivo_do_token(request)
        if dispositivo:
            empresa = dispositivo.unidade.empresa
        elif request.user.is_authenticated:
            empresa = _empresa(request)
        else:
            return Response({'erro': 'Não autenticado.'}, status=401)
        if not empresa:
            return Response([])
        qs = CategoriaAlimento.objects.filter(empresa=empresa, ativo=True)
        return Response(CategoriaAlimentoSerializer(qs, many=True).data)

    def post(self, request):
        if not request.user.is_authenticated:
            return Response({'erro': 'Não autenticado.'}, status=401)
        empresa = _empresa(request)
        if not empresa:
            return Response({'erro': 'Nenhuma empresa ativa.'}, status=400)
        nome = (request.data.get('nome') or '').strip()
        if not nome:
            return Response({'erro': 'Nome é obrigatório.'}, status=400)
        cat = CategoriaAlimento.objects.create(
            empresa=empresa, nome=nome,
            custo_kg_medio=_dec(request.data.get('custo_kg_medio', 0)),
            modo_custo=request.data.get('modo_custo', 'manual'),
            estoque_classe=(request.data.get('estoque_classe') or '').strip(),
            estoque_palavra_chave=(request.data.get('estoque_palavra_chave') or '').strip(),
        )
        return Response(CategoriaAlimentoSerializer(cat).data, status=201)


class CategoriaDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        empresa = _empresa(request)
        try:
            cat = CategoriaAlimento.objects.get(pk=pk, empresa=empresa)
        except CategoriaAlimento.DoesNotExist:
            return Response({'erro': 'Não encontrada.'}, status=404)
        if 'nome' in request.data:
            cat.nome = request.data['nome']
        if 'custo_kg_medio' in request.data:
            cat.custo_kg_medio = _dec(request.data['custo_kg_medio'])
        if 'modo_custo' in request.data:
            cat.modo_custo = request.data['modo_custo']
        if 'estoque_classe' in request.data:
            cat.estoque_classe = (request.data['estoque_classe'] or '').strip()
        if 'estoque_palavra_chave' in request.data:
            cat.estoque_palavra_chave = (request.data['estoque_palavra_chave'] or '').strip()
        if 'ativo' in request.data:
            cat.ativo = request.data['ativo']
        cat.save()
        return Response(CategoriaAlimentoSerializer(cat).data)

    def delete(self, request, pk):
        empresa = _empresa(request)
        CategoriaAlimento.objects.filter(pk=pk, empresa=empresa).delete()
        return Response({'ok': True})


# ── CLASSIFICAR FOTO (IA) ─────────────────────────────────────────────────────
class ClassificarView(APIView):
    """Aceita tanto usuário logado (JWT, dashboard) quanto dispositivo pareado
    (token, tablet sem login) — mesmo padrão usado pelo TV Manager."""
    permission_classes = [AllowAny]

    def post(self, request):
        dispositivo = _dispositivo_do_token(request)
        if dispositivo:
            empresa = dispositivo.unidade.empresa
        elif request.user.is_authenticated:
            empresa = _empresa(request)
        else:
            return Response({'erro': 'Não autenticado.'}, status=401)

        foto = request.FILES.get('foto')
        if not foto:
            return Response({'erro': 'Nenhuma foto enviada.'}, status=400)

        resultado = classificar_foto(foto.read())
        alimento  = resultado.get('alimento', '')
        confianca = resultado.get('confianca', 0)

        categoria = match_categoria(alimento, empresa) if alimento else None
        custo_kg  = calcular_custo(categoria)

        return Response({
            'alimento_ia':           alimento,
            'confianca':             confianca,
            'categoria_sugerida_id': categoria.id if categoria else None,
            'categoria_sugerida_nome': categoria.nome if categoria else None,
            'custo_kg_sugerido':     float(custo_kg),
            'erro':                  resultado.get('erro'),
        })


# ── REGISTROS ───────────────────────────────────────────────────────────────────
class RegistroListView(APIView):
    """GET exige login (dashboard). POST aceita login OU dispositivo pareado (tablet)."""
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'erro': 'Não autenticado.'}, status=401)
        empresa = _empresa(request)
        if not empresa:
            return Response([])
        qs = RegistroDesperdicio.objects.filter(unidade__empresa=empresa)

        unidade_id  = request.GET.get('unidade_id')
        setor_id    = request.GET.get('setor_id')
        refeicao_id = request.GET.get('refeicao_id')
        data_ini    = request.GET.get('data_ini')
        data_fim    = request.GET.get('data_fim')

        if unidade_id:  qs = qs.filter(unidade_id=unidade_id)
        if setor_id:    qs = qs.filter(setor_id=setor_id)
        if refeicao_id: qs = qs.filter(refeicao_id=refeicao_id)
        if data_ini:    qs = qs.filter(created_at__date__gte=data_ini)
        if data_fim:    qs = qs.filter(created_at__date__lte=data_fim)

        return Response(RegistroDesperdicioSerializer(qs[:500], many=True).data)

    def post(self, request):
        dispositivo = _dispositivo_do_token(request)
        if dispositivo:
            unidade = dispositivo.unidade
            setor   = dispositivo.setor
            empresa = unidade.empresa
        elif request.user.is_authenticated:
            empresa = _empresa(request)
            if not empresa:
                return Response({'erro': 'Nenhuma empresa ativa.'}, status=400)
            unidade_id = request.data.get('unidade_id')
            try:
                unidade = Unidade.objects.get(pk=unidade_id, empresa=empresa)
            except (Unidade.DoesNotExist, TypeError, ValueError):
                return Response({'erro': 'Unidade inválida.'}, status=400)
            setor = None
            setor_id = request.data.get('setor_id')
            if setor_id:
                setor = Setor.objects.filter(pk=setor_id, unidade=unidade).first()
        else:
            return Response({'erro': 'Não autenticado.'}, status=401)

        alimento_ia = request.data.get('alimento_ia', '')[:200]

        categoria = None
        categoria_id = request.data.get('categoria_id')
        if categoria_id:
            categoria = CategoriaAlimento.objects.filter(pk=categoria_id, empresa=empresa).first()
        else:
            # operação não escolhe categoria manualmente — tenta casar pelo nome do alimento
            categoria = match_categoria(alimento_ia, empresa)

        tipo_perda = None
        tipo_perda_id = request.data.get('tipo_perda_id')
        if tipo_perda_id:
            tipo_perda = TipoPerda.objects.filter(pk=tipo_perda_id, empresa=empresa).first()

        refeicao = None
        refeicao_id = request.data.get('refeicao_id')
        if refeicao_id:
            refeicao = Refeicao.objects.filter(pk=refeicao_id, empresa=empresa).first()

        peso_kg = _dec(request.data.get('peso_kg', 0))
        if peso_kg <= 0:
            return Response({'erro': 'Peso deve ser maior que zero.'}, status=400)

        custo_kg    = calcular_custo(categoria)
        valor_perda = (peso_kg * custo_kg).quantize(Decimal('0.01'))

        registro = RegistroDesperdicio.objects.create(
            unidade=unidade,
            setor=setor,
            tipo_perda=tipo_perda,
            refeicao=refeicao,
            foto=request.FILES.get('foto'),
            alimento_ia=alimento_ia,
            confianca_ia=request.data.get('confianca_ia') or None,
            categoria=categoria,
            peso_kg=peso_kg,
            custo_kg=custo_kg,
            valor_perda=valor_perda,
            criado_por=request.user if request.user.is_authenticated else None,
        )
        if dispositivo:
            dispositivo.last_seen = timezone.now()
            dispositivo.save(update_fields=['last_seen'])
        return Response(RegistroDesperdicioSerializer(registro).data, status=201)


class RegistroDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        empresa = _empresa(request)
        try:
            registro = RegistroDesperdicio.objects.get(pk=pk, unidade__empresa=empresa)
        except RegistroDesperdicio.DoesNotExist:
            return Response({'erro': 'Não encontrado.'}, status=404)

        if 'alimento_ia' in request.data:
            registro.alimento_ia = (request.data['alimento_ia'] or '')[:200]
        if 'peso_kg' in request.data:
            peso_kg = _dec(request.data['peso_kg'])
            if peso_kg <= 0:
                return Response({'erro': 'Peso deve ser maior que zero.'}, status=400)
            registro.peso_kg = peso_kg
        if 'categoria_id' in request.data:
            categoria_id = request.data['categoria_id']
            registro.categoria = CategoriaAlimento.objects.filter(pk=categoria_id, empresa=empresa).first() if categoria_id else None
        if 'tipo_perda_id' in request.data:
            tipo_perda_id = request.data['tipo_perda_id']
            registro.tipo_perda = TipoPerda.objects.filter(pk=tipo_perda_id, empresa=empresa).first() if tipo_perda_id else None
        if 'refeicao_id' in request.data:
            refeicao_id = request.data['refeicao_id']
            registro.refeicao = Refeicao.objects.filter(pk=refeicao_id, empresa=empresa).first() if refeicao_id else None

        if 'valor_perda' in request.data:
            # ajuste manual do operador tem prioridade sobre o cálculo automático
            registro.valor_perda = _dec(request.data['valor_perda']).quantize(Decimal('0.01'))
            if registro.peso_kg > 0:
                registro.custo_kg = (registro.valor_perda / registro.peso_kg).quantize(Decimal('0.01'))
        else:
            # recalcula custo sempre que peso ou categoria puderem ter mudado
            registro.custo_kg = calcular_custo(registro.categoria)
            registro.valor_perda = (registro.peso_kg * registro.custo_kg).quantize(Decimal('0.01'))
        registro.save()
        return Response(RegistroDesperdicioSerializer(registro).data)

    def delete(self, request, pk):
        empresa = _empresa(request)
        RegistroDesperdicio.objects.filter(pk=pk, unidade__empresa=empresa).delete()
        return Response({'ok': True})


# ── CONTAGEM DE CLIENTES ─────────────────────────────────────────────────────
class ContagemClientesView(APIView):
    """GET exige login (dashboard). POST aceita login OU dispositivo pareado (tablet)."""
    permission_classes = [AllowAny]

    def get(self, request):
        dispositivo = _dispositivo_do_token(request)
        if dispositivo:
            empresa = dispositivo.unidade.empresa
        elif request.user.is_authenticated:
            empresa = _empresa(request)
        else:
            return Response({'erro': 'Não autenticado.'}, status=401)
        unidade_id = request.GET.get('unidade_id')
        qs = ContagemClientes.objects.filter(unidade__empresa=empresa) if empresa else ContagemClientes.objects.none()
        if unidade_id:
            qs = qs.filter(unidade_id=unidade_id)
        data = request.GET.get('data')
        if data:
            qs = qs.filter(data=data)
        refeicao_id = request.GET.get('refeicao_id')
        if refeicao_id:
            qs = qs.filter(refeicao_id=refeicao_id)
        return Response(ContagemClientesSerializer(qs[:90], many=True).data)

    def post(self, request):
        dispositivo = _dispositivo_do_token(request)
        if dispositivo:
            empresa = dispositivo.unidade.empresa
            unidade_id = dispositivo.unidade_id
        elif request.user.is_authenticated:
            empresa = _empresa(request)
            unidade_id = request.data.get('unidade_id')
        else:
            return Response({'erro': 'Não autenticado.'}, status=401)

        data       = request.data.get('data')
        n_clientes = request.data.get('n_clientes', 0)
        refeicao_id = request.data.get('refeicao_id') or None
        try:
            unidade = Unidade.objects.get(pk=unidade_id, empresa=empresa)
        except (Unidade.DoesNotExist, TypeError, ValueError):
            return Response({'erro': 'Unidade inválida.'}, status=400)
        if not data:
            return Response({'erro': 'Data é obrigatória.'}, status=400)

        refeicao = None
        if refeicao_id:
            refeicao = Refeicao.objects.filter(pk=refeicao_id, empresa=empresa).first()

        obj, _ = ContagemClientes.objects.update_or_create(
            unidade=unidade, data=data, refeicao=refeicao, defaults={'n_clientes': n_clientes},
        )
        return Response(ContagemClientesSerializer(obj).data)


# ── DASHBOARD ─────────────────────────────────────────────────────────────────
class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        empresa = _empresa(request)
        if not empresa:
            return Response({'ok': False})

        hoje = timezone.localdate()
        data_ini = request.GET.get('data_ini') or hoje.isoformat()
        data_fim = request.GET.get('data_fim') or hoje.isoformat()
        unidade_id  = request.GET.get('unidade_id')
        refeicao_id = request.GET.get('refeicao_id')

        qs = RegistroDesperdicio.objects.filter(
            unidade__empresa=empresa,
            created_at__date__gte=data_ini,
            created_at__date__lte=data_fim,
        )
        if unidade_id:
            qs = qs.filter(unidade_id=unidade_id)
        if refeicao_id:
            qs = qs.filter(refeicao_id=refeicao_id)

        clientes_filtro = {'unidade_id': unidade_id} if unidade_id else {}
        if refeicao_id:
            clientes_filtro['refeicao_id'] = refeicao_id

        total_kg    = qs.aggregate(s=Sum('peso_kg'))['s'] or Decimal('0')
        valor_total = qs.aggregate(s=Sum('valor_perda'))['s'] or Decimal('0')
        lancamentos = qs.count()

        media_valor = qs.aggregate(a=Avg('valor_perda'))['a'] or Decimal('0')
        limiar = media_valor * 2
        perdas_criticas = qs.filter(valor_perda__gt=limiar).count() if limiar > 0 else 0

        por_refeicao_qs = (
            qs.exclude(refeicao__isnull=True)
              .values('refeicao__nome')
              .annotate(kg=Sum('peso_kg'), valor=Sum('valor_perda'))
              .order_by('-kg')
        )
        por_refeicao = [
            {'refeicao': r['refeicao__nome'], 'kg': float(r['kg']), 'valor': float(r['valor'])}
            for r in por_refeicao_qs
        ]
        refeicao_concentra = None
        if por_refeicao and total_kg > 0:
            top = por_refeicao[0]
            refeicao_concentra = {
                'refeicao': top['refeicao'],
                'pct': round(top['kg'] / float(total_kg) * 100, 1),
            }

        n_clientes = ContagemClientes.objects.filter(
            unidade__empresa=empresa, data__gte=data_ini, data__lte=data_fim, **clientes_filtro,
        ).aggregate(s=Sum('n_clientes'))['s'] or 0
        residuo_por_cliente_g = round(float(total_kg) * 1000 / n_clientes, 1) if n_clientes else None

        com_ia = qs.exclude(alimento_ia='').count()
        cobertura_ia_pct = round(com_ia / lancamentos * 100, 1) if lancamentos else 0

        por_categoria = list(
            qs.exclude(categoria__isnull=True)
              .values('categoria__nome')
              .annotate(kg=Sum('peso_kg'))
              .order_by('-kg')[:10]
        )
        por_categoria = [{'categoria': r['categoria__nome'], 'kg': float(r['kg'])} for r in por_categoria]

        ranking_alimentos = list(
            qs.exclude(alimento_ia='')
              .values('alimento_ia')
              .annotate(kg=Sum('peso_kg'), valor=Sum('valor_perda'))
              .order_by('-kg')[:10]
        )
        ranking_alimentos = [
            {'alimento': r['alimento_ia'], 'kg': float(r['kg']), 'valor': float(r['valor'])}
            for r in ranking_alimentos
        ]

        por_dia = list(
            qs.annotate(dia=TruncDate('created_at'))
              .values('dia')
              .annotate(kg=Sum('peso_kg'), valor=Sum('valor_perda'), lancamentos=Count('id'))
              .order_by('dia')
        )

        # maior lançamento de cada dia — pra "drill down" rápido sem precisar abrir cada registro
        maiores_por_dia = {}
        for r in qs.values('alimento_ia', 'peso_kg', 'valor_perda', 'created_at'):
            dia = r['created_at'].date().isoformat()
            atual = maiores_por_dia.get(dia)
            if atual is None or r['peso_kg'] > atual['peso_kg']:
                maiores_por_dia[dia] = r

        # hóspedes/refeições servidas por (dia, refeição) — pro drill-down dentro de cada dia
        clientes_por_dia_refeicao = {}
        for r in (
            ContagemClientes.objects.filter(
                unidade__empresa=empresa, data__gte=data_ini, data__lte=data_fim, refeicao__isnull=False,
                **clientes_filtro,
            ).values('data', 'refeicao__nome').annotate(s=Sum('n_clientes'))
        ):
            clientes_por_dia_refeicao[(r['data'], r['refeicao__nome'])] = r['s']

        # quebra por refeição dentro de cada dia — drill-down (café/almoço/jantar)
        detalhe_refeicao_por_dia = {}
        for r in (
            qs.exclude(refeicao__isnull=True)
              .annotate(dia=TruncDate('created_at'))
              .values('dia', 'refeicao__nome')
              .annotate(kg=Sum('peso_kg'), valor=Sum('valor_perda'), lancamentos=Count('id'))
              .order_by('dia', '-kg')
        ):
            detalhe_refeicao_por_dia.setdefault(r['dia'].isoformat(), []).append({
                'refeicao': r['refeicao__nome'], 'kg': float(r['kg']), 'valor': float(r['valor']), 'lancamentos': r['lancamentos'],
                'n_clientes': clientes_por_dia_refeicao.get((r['dia'], r['refeicao__nome']), 0),
            })

        # hóspedes/refeições servidas por dia — pra residuo por hóspede diário
        clientes_por_dia = dict(
            ContagemClientes.objects.filter(
                unidade__empresa=empresa, data__gte=data_ini, data__lte=data_fim, **clientes_filtro,
            ).values('data').annotate(s=Sum('n_clientes')).values_list('data', 's')
        )

        por_dia = [
            {
                'data': r['dia'].isoformat(),
                'kg': float(r['kg']),
                'valor': float(r['valor']),
                'lancamentos': r['lancamentos'],
                'maior_lancamento': (
                    {
                        'alimento': maiores_por_dia[r['dia'].isoformat()]['alimento_ia'] or '—',
                        'kg': float(maiores_por_dia[r['dia'].isoformat()]['peso_kg']),
                    }
                    if r['dia'].isoformat() in maiores_por_dia else None
                ),
                'n_clientes': clientes_por_dia.get(r['dia']) or 0,
                'residuo_por_hospede_g': (
                    round(float(r['kg']) * 1000 / clientes_por_dia[r['dia']], 1)
                    if clientes_por_dia.get(r['dia']) else None
                ),
                'por_refeicao': detalhe_refeicao_por_dia.get(r['dia'].isoformat(), []),
            }
            for r in por_dia
        ]

        # dias do período sem nenhum lançamento — sinaliza lacuna de cobertura
        dias_sem_lancamento = []
        try:
            d_ini = date_cls.fromisoformat(data_ini)
            d_fim = date_cls.fromisoformat(data_fim)
            if d_ini <= d_fim and (d_fim - d_ini).days <= 366:
                dias_com = {r['data'] for r in por_dia}
                cursor = d_ini
                while cursor <= d_fim:
                    iso = cursor.isoformat()
                    if iso not in dias_com:
                        dias_sem_lancamento.append(iso)
                    cursor += timedelta(days=1)
        except ValueError:
            pass

        comparativo_unidades = None
        if Unidade.objects.filter(empresa=empresa).count() > 1:
            por_unidade = (
                RegistroDesperdicio.objects.filter(
                    unidade__empresa=empresa,
                    created_at__date__gte=data_ini, created_at__date__lte=data_fim,
                )
                .values('unidade__nome')
                .annotate(kg=Sum('peso_kg'), valor=Sum('valor_perda'))
                .order_by('-kg')
            )
            comparativo_unidades = [
                {'unidade': r['unidade__nome'], 'kg': float(r['kg']), 'valor': float(r['valor'])}
                for r in por_unidade
            ]

        return Response({
            'ok': True,
            'data_ini': data_ini,
            'data_fim': data_fim,
            'total_kg': float(total_kg),
            'lancamentos': lancamentos,
            'valor_total_perda': float(valor_total),
            'perdas_criticas': perdas_criticas,
            'refeicao_concentra': refeicao_concentra,
            'residuo_por_cliente_g': residuo_por_cliente_g,
            'n_clientes': n_clientes,
            'cobertura_ia_pct': cobertura_ia_pct,
            'por_dia': por_dia,
            'dias_sem_lancamento': dias_sem_lancamento,
            'por_categoria': por_categoria,
            'por_refeicao': por_refeicao,
            'ranking_alimentos': ranking_alimentos,
            'comparativo_unidades': comparativo_unidades,
        })


# ── DISPOSITIVOS (tablets pareados) ───────────────────────────────────────────
class DispositivoListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        empresa = _empresa(request)
        if not empresa:
            return Response([])
        qs = Dispositivo.objects.filter(empresa=empresa)
        return Response(DispositivoSerializer(qs, many=True).data)

    def post(self, request):
        empresa = _empresa(request)
        if not empresa:
            return Response({'erro': 'Nenhuma empresa ativa.'}, status=400)
        unidade_id = request.data.get('unidade_id')
        try:
            unidade = Unidade.objects.get(pk=unidade_id, empresa=empresa)
        except (Unidade.DoesNotExist, TypeError, ValueError):
            return Response({'erro': 'Unidade inválida.'}, status=400)
        setor = None
        setor_id = request.data.get('setor_id')
        if setor_id:
            setor = Setor.objects.filter(pk=setor_id, unidade=unidade).first()

        dispositivo = Dispositivo.objects.create(
            empresa=empresa, unidade=unidade, setor=setor,
            nome=(request.data.get('nome') or 'Tablet Cozinha').strip(),
        )
        return Response(DispositivoSerializer(dispositivo).data, status=201)


class DispositivoDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        empresa = _empresa(request)
        try:
            disp = Dispositivo.objects.get(pk=pk, empresa=empresa)
        except Dispositivo.DoesNotExist:
            return Response({'erro': 'Não encontrado.'}, status=404)
        if 'nome' in request.data:
            disp.nome = request.data['nome']
        if 'setor_id' in request.data:
            disp.setor = Setor.objects.filter(pk=request.data['setor_id'], unidade=disp.unidade).first()
        if 'ativo' in request.data:
            disp.ativo = request.data['ativo']
        disp.save()
        return Response(DispositivoSerializer(disp).data)

    def delete(self, request, pk):
        empresa = _empresa(request)
        Dispositivo.objects.filter(pk=pk, empresa=empresa).delete()
        return Response({'ok': True})


# ── PAREAMENTO (mesmo fluxo do TV Manager) ────────────────────────────────────
class DispositivoPairRequestView(APIView):
    """Tablet solicita um código de pareamento (público — sem auth)."""
    permission_classes = [AllowAny]

    def post(self, request):
        from django.utils.timezone import now
        from datetime import timedelta
        from .models import gen_pair_code

        code = None
        for _ in range(10):
            candidato = gen_pair_code()
            if not DispositivoPairingCode.objects.filter(code=candidato, usado=False).exists():
                code = candidato
                break

        expires = now() + timedelta(minutes=10)
        pc = DispositivoPairingCode.objects.create(code=code, expires_at=expires)
        return Response({'code': pc.code, 'expires_in': 600})


class DispositivoPairStatusView(APIView):
    """Tablet consulta se já foi pareado (público — sem auth)."""
    permission_classes = [AllowAny]

    def get(self, request):
        code = request.query_params.get('code', '').strip().upper()
        if not code:
            return Response({'paired': False, 'error': 'Código não informado.'}, status=400)
        try:
            pc = DispositivoPairingCode.objects.select_related('dispositivo').get(code=code)
        except DispositivoPairingCode.DoesNotExist:
            return Response({'paired': False, 'error': 'Código inválido.'}, status=404)
        if pc.expirado:
            return Response({'paired': False, 'expired': True})
        if pc.dispositivo and not pc.usado:
            pc.usado = True
            pc.save(update_fields=['usado'])
            return Response({'paired': True, 'token': pc.dispositivo.token})
        return Response({'paired': False})


class DispositivoPairConfirmView(APIView):
    """Admin vincula um código exibido no tablet a um Dispositivo cadastrado."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        empresa = _empresa(request)
        code   = request.data.get('code', '').strip().upper()
        disp_id = request.data.get('dispositivo_id')
        if not code or not disp_id:
            return Response({'erro': 'Código e dispositivo são obrigatórios.'}, status=400)

        try:
            pc = DispositivoPairingCode.objects.get(code=code, usado=False)
        except DispositivoPairingCode.DoesNotExist:
            return Response({'erro': 'Código inválido ou já utilizado.'}, status=404)
        if pc.expirado:
            return Response({'erro': 'Código expirado. Gere um novo no tablet.'}, status=400)
        try:
            disp = Dispositivo.objects.get(pk=disp_id, empresa=empresa)
        except Dispositivo.DoesNotExist:
            return Response({'erro': 'Dispositivo não encontrado.'}, status=404)

        pc.dispositivo = disp
        pc.save(update_fields=['dispositivo'])
        return Response({'ok': True, 'dispositivo': disp.nome})


class DispositivoPairPendingView(APIView):
    """Lista códigos de pareamento aguardando confirmação (para o admin ver)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.utils.timezone import now
        pendentes = DispositivoPairingCode.objects.filter(
            usado=False, expires_at__gt=now(), dispositivo__isnull=True
        ).order_by('-created_at')[:20]
        return Response([{
            'code': p.code, 'created_at': p.created_at, 'expires_at': p.expires_at,
        } for p in pendentes])


class DispositivoPublicView(APIView):
    """Tablet já pareado consulta sua configuração pelo token (público — sem auth)."""
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            disp = Dispositivo.objects.select_related('unidade', 'setor').get(token=token, ativo=True)
        except Dispositivo.DoesNotExist:
            return Response({'erro': 'Dispositivo não encontrado ou inativo.'}, status=404)
        return Response({
            'nome':         disp.nome,
            'unidade_id':   disp.unidade_id,
            'unidade_nome': disp.unidade.nome,
            'setor_id':     disp.setor_id,
            'setor_nome':   disp.setor.nome if disp.setor else None,
        })


class DispositivoHeartbeatView(APIView):
    """Tablet envia ping periódico pra indicar que está online (público)."""
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get('dispositivo_token', '').strip()
        if not token:
            return Response({'erro': 'Token obrigatório.'}, status=400)
        updated = Dispositivo.objects.filter(token=token, ativo=True).update(last_seen=timezone.now())
        if not updated:
            return Response({'erro': 'Dispositivo não encontrado.'}, status=404)
        return Response({'ok': True})
