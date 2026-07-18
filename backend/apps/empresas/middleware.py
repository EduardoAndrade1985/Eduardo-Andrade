from django.utils.deprecation import MiddlewareMixin


class EmpresaMiddleware(MiddlewareMixin):
    """
    Resolve a empresa ativa do usuário logado e injeta em request.empresa.
    Prioridade: header X-Empresa-ID → sessão → primeira empresa do usuário.

    Suporta tanto session auth quanto JWT (Bearer token).
    """

    def _resolve_user_from_jwt(self, request):
        """Tenta autenticar via JWT quando a session auth não encontrou usuário."""
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            from rest_framework.request import Request as DRFRequest
            drf_req = DRFRequest(request)
            result  = JWTAuthentication().authenticate(drf_req)
            if result:
                request.user = result[0]
        except Exception:
            pass

    def process_request(self, request):
        request.empresa = None
        request.membro  = None

        if not request.user.is_authenticated:
            self._resolve_user_from_jwt(request)

        if not request.user.is_authenticated:
            # Acesso público via token UUID do inventário (link compartilhável sem login)
            inventario_token = request.headers.get('X-Inventario-Token')
            if inventario_token:
                try:
                    from apps.imobilizado.models import Inventario
                    inv = Inventario.objects.select_related('empresa').get(
                        token=inventario_token,
                        status=Inventario.ABERTO,
                    )
                    request.empresa = inv.empresa
                except Exception:
                    pass
            return

        from apps.empresas.models import Empresa, MembroEmpresa

        empresa_id = request.headers.get('X-Empresa-ID') or request.session.get('empresa_id')

        if empresa_id:
            try:
                empresa_id = int(empresa_id)
                if request.user.is_superuser:
                    request.empresa = Empresa.objects.get(id=empresa_id, ativo=True)
                else:
                    membro = MembroEmpresa.objects.select_related('empresa').get(
                        usuario=request.user,
                        empresa_id=empresa_id,
                        empresa__ativo=True,
                        ativo=True,
                    )
                    request.empresa = membro.empresa
                    request.membro  = membro
            except Exception:
                pass

        # Fallback: primeira empresa do usuário
        if not request.empresa:
            if request.user.is_superuser:
                request.empresa = Empresa.objects.filter(ativo=True).first()
            else:
                membro = (
                    MembroEmpresa.objects
                    .select_related('empresa')
                    .filter(usuario=request.user, empresa__ativo=True, ativo=True)
                    .first()
                )
                if membro:
                    request.empresa = membro.empresa
                    request.membro  = membro

        if request.empresa:
            request.session['empresa_id'] = request.empresa.id
