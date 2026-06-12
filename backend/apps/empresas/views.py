from django.http import JsonResponse
from django.contrib.auth import get_user_model
from django.utils.text import slugify
from django.db.models import Count, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from .models import Empresa, MembroEmpresa
from .serializers import EmpresaSerializer, EmpresaAdminSerializer, MembroSerializer

User = get_user_model()


# ─── AUTH/ME ──────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    u = request.user
    data = {
        'id':       u.id,
        'username': u.username,
        'email':    u.email,
        'is_staff': u.is_staff,
    }
    if getattr(request, 'empresa', None):
        data['empresa_ativa'] = {
            'id':   request.empresa.id,
            'nome': str(request.empresa),
        }
    if getattr(request, 'membro', None):
        data['papel'] = request.membro.papel
        data['must_change_password'] = request.membro.must_change_password
        data['modulos_permitidos'] = request.membro.modulos_permitidos or []
    elif u.is_superuser:
        data['papel'] = 'admin'
        data['must_change_password'] = False
    return JsonResponse(data)


# ─── ALTERAR SENHA (próprio usuário) ─────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    senha_atual = request.data.get('senha_atual', '').strip()
    senha_nova  = request.data.get('senha_nova', '').strip()
    if not senha_atual or not senha_nova:
        return JsonResponse({'error': 'Preencha todos os campos.'}, status=400)
    if not request.user.check_password(senha_atual):
        return JsonResponse({'error': 'Senha atual incorreta.'}, status=400)
    if len(senha_nova) < 6:
        return JsonResponse({'error': 'A nova senha deve ter ao menos 6 caracteres.'}, status=400)
    request.user.set_password(senha_nova)
    request.user.save(update_fields=['password'])
    return JsonResponse({'ok': True})


# ─── MINHAS EMPRESAS ──────────────────────────────────────────────────────────
class MinhasEmpresasView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.is_superuser:
            empresas = Empresa.objects.filter(ativo=True)
            membros_map = {}
        else:
            membros = MembroEmpresa.objects.filter(
                usuario=request.user, ativo=True, empresa__ativo=True
            ).select_related('empresa')
            membros_map = {mb.empresa_id: mb.papel for mb in membros}
            empresas = Empresa.objects.filter(id__in=membros_map.keys())

        serializer = EmpresaSerializer(
            empresas, many=True, context={'request': request, 'membros_map': membros_map}
        )
        empresa_ativa_id = request.empresa.id if request.empresa else None
        return Response({
            'empresas':      serializer.data,
            'empresa_ativa': empresa_ativa_id,
        })


# ─── TROCAR EMPRESA ───────────────────────────────────────────────────────────
class TrocarEmpresaView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        empresa_id = request.data.get('empresa_id')
        if not empresa_id:
            return Response({'error': 'empresa_id obrigatório'}, status=400)

        try:
            empresa_id = int(empresa_id)
            if request.user.is_superuser:
                empresa = Empresa.objects.get(id=empresa_id, ativo=True)
            else:
                membro  = MembroEmpresa.objects.select_related('empresa').get(
                    usuario=request.user,
                    empresa_id=empresa_id,
                    empresa__ativo=True,
                    ativo=True,
                )
                empresa = membro.empresa
        except Empresa.DoesNotExist:
            return Response({'error': 'Empresa não encontrada'}, status=404)
        except MembroEmpresa.DoesNotExist:
            return Response({'error': 'Sem acesso a esta empresa'}, status=403)

        request.session['empresa_id'] = empresa.id
        return Response({'empresa_id': empresa.id, 'nome': str(empresa)})


# ─── EMPRESA ATUAL ────────────────────────────────────────────────────────────
class EmpresaAtualView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.empresa:
            return Response({'error': 'Nenhuma empresa ativa'}, status=404)
        serializer = EmpresaSerializer(request.empresa, context={'request': request})
        return Response(serializer.data)


# ─── MEMBROS DA EMPRESA ATUAL ─────────────────────────────────────────────────
class MembrosView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.empresa:
            return Response([], status=200)
        membros = MembroEmpresa.objects.filter(empresa=request.empresa).select_related('usuario')
        return Response(MembroSerializer(membros, many=True).data)

    def post(self, request):
        """Cria usuário e vincula à empresa atual."""
        if not request.empresa:
            return Response({'error': 'Nenhuma empresa ativa'}, status=403)
        membro_req = getattr(request, 'membro', None)
        if membro_req and membro_req.papel not in ('admin',) and not request.user.is_superuser:
            raise PermissionDenied('Apenas administradores podem adicionar usuários.')

        username = request.data.get('username', '').strip().lower()
        email    = request.data.get('email', '').strip().lower()
        senha    = request.data.get('senha', '').strip()
        papel    = request.data.get('papel', 'operacional')
        modulos  = request.data.get('modulos_permitidos', [])

        if not username:
            return Response({'error': 'username obrigatório'}, status=400)

        # Cria ou reutiliza usuário existente
        if User.objects.filter(username=username).exists():
            usuario = User.objects.get(username=username)
        else:
            if not senha:
                return Response({'error': 'senha obrigatória para novo usuário'}, status=400)
            usuario = User.objects.create_user(username=username, email=email, password=senha)

        membro, criado = MembroEmpresa.objects.get_or_create(
            usuario=usuario,
            empresa=request.empresa,
            defaults={'papel': papel, 'modulos_permitidos': modulos, 'ativo': True},
        )
        if not criado:
            membro.papel = papel
            membro.modulos_permitidos = modulos
            membro.ativo = True
            membro.save()

        return Response(MembroSerializer(membro).data, status=201 if criado else 200)


class MembroDetalheView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_membro(self, request, pk):
        if not request.empresa:
            return None
        try:
            return MembroEmpresa.objects.select_related('usuario').get(
                pk=pk, empresa=request.empresa
            )
        except MembroEmpresa.DoesNotExist:
            return None

    def _check_admin(self, request):
        membro_req = getattr(request, 'membro', None)
        if membro_req and membro_req.papel != 'admin' and not request.user.is_superuser:
            raise PermissionDenied('Apenas administradores podem editar usuários.')

    def patch(self, request, pk):
        self._check_admin(request)
        membro = self._get_membro(request, pk)
        if not membro:
            return Response({'error': 'Membro não encontrado'}, status=404)

        if 'papel' in request.data:
            membro.papel = request.data['papel']
        if 'modulos_permitidos' in request.data:
            membro.modulos_permitidos = request.data['modulos_permitidos']
        if 'ativo' in request.data:
            membro.ativo = request.data['ativo']
        if 'usuario_ativo' in request.data:
            membro.usuario.is_active = bool(request.data['usuario_ativo'])
            membro.usuario.save(update_fields=['is_active'])
        if 'username' in request.data:
            novo_username = request.data['username'].strip()
            if novo_username and novo_username != membro.usuario.username:
                if User.objects.filter(username=novo_username).exclude(pk=membro.usuario.pk).exists():
                    return Response({'error': 'Este nome de usuário já está em uso.'}, status=400)
                membro.usuario.username = novo_username
                membro.usuario.save(update_fields=['username'])
        membro.save()

        # reset de senha — ativa flag para troca obrigatória
        senha = request.data.get('senha', '').strip()
        if senha:
            membro.usuario.set_password(senha)
            membro.usuario.save(update_fields=['password'])
            membro.must_change_password = True
            membro.save(update_fields=['must_change_password'])

        return Response(MembroSerializer(membro).data)

    def delete(self, request, pk):
        self._check_admin(request)
        membro = self._get_membro(request, pk)
        if not membro:
            return Response({'error': 'Membro não encontrado'}, status=404)
        # Não deleta o usuário Django — apenas remove o vínculo
        membro.delete()
        return Response({'ok': True})


# ─── TROCAR SENHA (pelo próprio usuário) ──────────────────────────────────────
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        nova_senha = request.data.get('nova_senha', '').strip()
        if not nova_senha or len(nova_senha) < 4:
            return Response({'error': 'Senha deve ter ao menos 4 caracteres.'}, status=400)

        request.user.set_password(nova_senha)
        request.user.save(update_fields=['password'])

        MembroEmpresa.objects.filter(
            usuario=request.user, must_change_password=True
        ).update(must_change_password=False)

        return Response({'ok': True})


# ─── CRUD DE EMPRESAS (superuser / staff) ────────────────────────────────────
class EmpresasAdminView(APIView):
    permission_classes = [IsAuthenticated]

    def _check_superuser(self, request):
        if not request.user.is_superuser and not request.user.is_staff:
            raise PermissionDenied('Apenas superusuários podem gerenciar empresas.')

    def get(self, request):
        self._check_superuser(request)
        empresas = Empresa.objects.all().order_by('nome').annotate(
            membros_ativos=Count('membros', filter=Q(membros__ativo=True))
        )
        return Response(EmpresaAdminSerializer(empresas, many=True).data)

    def post(self, request):
        self._check_superuser(request)
        nome = request.data.get('nome', '').strip()
        cnpj = request.data.get('cnpj', '').strip()
        if not nome:
            return Response({'error': 'Nome é obrigatório.'}, status=400)
        if not cnpj:
            return Response({'error': 'CNPJ é obrigatório.'}, status=400)
        if Empresa.objects.filter(cnpj=cnpj).exists():
            return Response({'error': 'CNPJ já cadastrado.'}, status=400)

        base_slug = slugify(nome)
        slug = base_slug
        i = 1
        while Empresa.objects.filter(slug=slug).exists():
            slug = f'{base_slug}-{i}'; i += 1

        empresa = Empresa.objects.create(
            nome=nome,
            nome_fantasia=request.data.get('nome_fantasia', '').strip(),
            cnpj=cnpj,
            slug=slug,
            endereco=request.data.get('endereco', ''),
            cidade=request.data.get('cidade', ''),
            estado=request.data.get('estado', ''),
            telefone=request.data.get('telefone', ''),
            email=request.data.get('email', ''),
            total_uhs=int(request.data.get('total_uhs', 0) or 0),
            cor_primaria=request.data.get('cor_primaria', '#2dd4a0'),
            fuso_horario=request.data.get('fuso_horario', 'America/Sao_Paulo'),
            moeda=request.data.get('moeda', 'BRL'),
            ativo=True,
        )
        return Response(EmpresaAdminSerializer(empresa).data, status=201)


class EmpresaAdminDetalheView(APIView):
    permission_classes = [IsAuthenticated]

    def _check_superuser(self, request):
        if not request.user.is_superuser and not request.user.is_staff:
            raise PermissionDenied('Apenas superusuários podem gerenciar empresas.')

    def _get(self, pk):
        try:
            return Empresa.objects.get(pk=pk)
        except Empresa.DoesNotExist:
            return None

    def patch(self, request, pk):
        self._check_superuser(request)
        empresa = self._get(pk)
        if not empresa:
            return Response({'error': 'Empresa não encontrada.'}, status=404)

        campos = ['nome', 'nome_fantasia', 'cnpj', 'endereco', 'cidade', 'estado',
                  'telefone', 'email', 'cor_primaria', 'fuso_horario', 'moeda']
        for c in campos:
            if c in request.data:
                setattr(empresa, c, request.data[c])
        if 'total_uhs' in request.data:
            empresa.total_uhs = int(request.data['total_uhs'] or 0)
        if 'ativo' in request.data:
            empresa.ativo = bool(request.data['ativo'])
        empresa.save()
        return Response(EmpresaAdminSerializer(empresa).data)

    def delete(self, request, pk):
        self._check_superuser(request)
        empresa = self._get(pk)
        if not empresa:
            return Response({'error': 'Empresa não encontrada.'}, status=404)
        empresa.ativo = False
        empresa.save(update_fields=['ativo'])
        return Response({'ok': True})


# ─── EMPRESAS DO USUÁRIO (admin) ─────────────────────────────────────────────
class UsuarioEmpresasView(APIView):
    """Retorna todas as empresas com status de vínculo para um usuário específico."""
    permission_classes = [IsAuthenticated]

    def _check_permission(self, request):
        if request.user.is_superuser or request.user.is_staff:
            return True
        membro = getattr(request, 'membro', None)
        if membro and membro.papel == 'admin':
            return True
        raise PermissionDenied('Sem permissão.')

    def get(self, request):
        self._check_permission(request)
        username = request.query_params.get('username')
        if not username:
            return Response({'error': 'username obrigatório'}, status=400)
        try:
            target = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'Usuário não encontrado'}, status=404)

        if request.user.is_superuser or request.user.is_staff:
            empresas = Empresa.objects.all().order_by('nome')
        else:
            ids = MembroEmpresa.objects.filter(
                usuario=request.user, papel='admin', ativo=True
            ).values_list('empresa_id', flat=True)
            empresas = Empresa.objects.filter(id__in=ids).order_by('nome')

        membro_map = {
            mb.empresa_id: mb
            for mb in MembroEmpresa.objects.filter(usuario=target, empresa__in=empresas)
        }

        result = []
        for emp in empresas:
            mb = membro_map.get(emp.id)
            if mb:
                result.append({
                    'empresa_id': emp.id,
                    'empresa_nome': emp.nome_fantasia or emp.nome,
                    'membro_id': mb.id,
                    'papel': mb.papel,
                    'ativo': mb.ativo,
                    'tem_acesso': True,
                    'modulos_permitidos': mb.modulos_permitidos or [],
                })
            else:
                result.append({
                    'empresa_id': emp.id,
                    'empresa_nome': emp.nome_fantasia or emp.nome,
                    'membro_id': None,
                    'papel': None,
                    'ativo': False,
                    'tem_acesso': False,
                })
        return Response(result)


# ─── TODOS OS USUÁRIOS DO SISTEMA (superuser / admin) ────────────────────────
class TodosUsuariosView(APIView):
    """Lista todos os usuários com seus vínculos de empresa."""
    permission_classes = [IsAuthenticated]

    def _check_permission(self, request):
        if request.user.is_superuser or request.user.is_staff:
            return 'super'
        membro = getattr(request, 'membro', None)
        if membro and membro.papel == 'admin':
            return 'admin'
        raise PermissionDenied('Sem permissão.')

    def get(self, request):
        nivel = self._check_permission(request)

        if nivel == 'super':
            membros = MembroEmpresa.objects.select_related('usuario', 'empresa').all()
        else:
            # admin vê apenas usuários das empresas que ele administra
            admin_emp_ids = MembroEmpresa.objects.filter(
                usuario=request.user, papel='admin', ativo=True
            ).values_list('empresa_id', flat=True)
            membros = MembroEmpresa.objects.select_related('usuario', 'empresa').filter(
                empresa_id__in=admin_emp_ids
            )

        # Agrupa por usuário
        usuarios = {}
        for mb in membros:
            uid = mb.usuario_id
            if uid not in usuarios:
                usuarios[uid] = {
                    'id':          mb.usuario.id,
                    'username':    mb.usuario.username,
                    'email':       mb.usuario.email or '',
                    'is_staff':    mb.usuario.is_staff,
                    'is_active':   mb.usuario.is_active,
                    'empresas': [],
                }
            usuarios[uid]['empresas'].append({
                'empresa_id':   mb.empresa_id,
                'empresa_nome': mb.empresa.nome_fantasia or mb.empresa.nome,
                'membro_id':    mb.id,
                'papel':        mb.papel,
                'ativo':        mb.ativo,
            })

        return Response(list(usuarios.values()))
