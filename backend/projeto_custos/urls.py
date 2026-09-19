from django.contrib import admin
from django.contrib.auth import get_user_model
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from django.http import FileResponse
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from apps.empresas.views import me_view, change_password_view
from apps.empresas.models import MembroEmpresa


def spa_fallback(request, *args, **kwargs):
    """Serve o index.html do React para qualquer rota não reconhecida pelo Django."""
    return FileResponse(
        open(settings.BASE_DIR / 'static' / 'index.html', 'rb'),
        content_type='text/html; charset=utf-8',
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def ping(request):
    return Response({'status': 'ok'})


def _check_user_access(u):
    """Retorna (ok, detail, code) — ok=True se o usuário pode autenticar."""
    if not u.is_active:
        return False, 'Conta inativa.', 'account_inactive'
    if not u.is_staff and not MembroEmpresa.objects.filter(
        usuario=u, ativo=True, empresa__ativo=True
    ).exists():
        return False, 'Usuário sem acesso ao sistema.', 'no_access'
    return True, None, None


class CustomTokenObtainPairView(TokenObtainPairView):
    """Bloqueia login de usuários inativos ou sem vínculo ativo em nenhuma empresa."""
    def post(self, request, *args, **kwargs):
        username = request.data.get('username', '').strip().lower()
        User = get_user_model()
        try:
            u = User.objects.get(username=username)
            ok, detail, code = _check_user_access(u)
            if not ok:
                return Response({'detail': detail, 'code': code}, status=401)
        except User.DoesNotExist:
            pass
        return super().post(request, *args, **kwargs)


class CustomTokenRefreshView(TokenRefreshView):
    """Bloqueia renovação de token se o usuário foi removido ou inativado."""
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            try:
                refresh = RefreshToken(request.data.get('refresh', ''))
                user_id = refresh.payload.get('user_id')
                User = get_user_model()
                u = User.objects.get(pk=user_id)
                ok, detail, code = _check_user_access(u)
                if not ok:
                    return Response({'detail': detail, 'code': code}, status=401)
            except Exception:
                return Response({'detail': 'Token inválido.', 'code': 'token_invalid'}, status=401)
        return response


urlpatterns = [
    path('admin/', admin.site.urls),

    # Cold start prevention
    path('ping/', ping, name='ping'),

    # JWT Auth
    path('auth/token/',         CustomTokenObtainPairView.as_view(), name='token_obtain'),
    path('auth/token/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/',              me_view,                       name='me'),
    path('auth/change-password/', change_password_view,          name='change_password'),

    # Empresas
    path('api/empresas/', include('apps.empresas.urls')),

    # Custos (dashboard + upload + movimentações)
    path('', include('apps.custos.urls')),

    # Receitas (upload + lançamentos diários + metas)
    path('api/receitas/', include('apps.receitas.urls')),

    # Cartões (conciliação)
    path('api/cartoes/', include('apps.cartoes.urls')),

    # Ocupação
    path('api/ocupacao/', include('apps.ocupacao.urls')),

    # Eventos
    path('api/eventos/', include('apps.eventos.urls')),

    # Estoque
    path('api/estoque/', include('apps.estoque.urls')),

    # TV Manager
    path('api/tv/', include('apps.tv.urls')),

    # Food Intelligence (desperdício de buffet)
    path('api/desperdicio/', include('apps.desperdicio.urls')),

    # Imobilizado (controle patrimonial)
    path('api/imobilizado/', include('apps.imobilizado.urls')),

    # Enxoval (controle com RFID)
    path('api/enxoval/', include('apps.enxoval.urls')),

    # Serve arquivos de media em produção também
    re_path(r'^uploads/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),

    # Catch-all: qualquer rota não reconhecida → React SPA (deve ser a última entrada)
    re_path(r'^.*$', spa_fallback),
]
