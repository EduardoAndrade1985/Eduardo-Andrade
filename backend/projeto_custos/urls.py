from django.contrib import admin
from django.contrib.auth import get_user_model
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from apps.empresas.views import me_view, change_password_view


@api_view(['GET'])
@permission_classes([AllowAny])
def ping(request):
    return Response({'status': 'ok'})


class CustomTokenObtainPairView(TokenObtainPairView):
    """Retorna código específico quando o usuário existe mas está inativo."""
    def post(self, request, *args, **kwargs):
        username = request.data.get('username', '').strip().lower()
        User = get_user_model()
        try:
            u = User.objects.get(username=username)
            if not u.is_active:
                return Response(
                    {'detail': 'Conta inativa.', 'code': 'account_inactive'},
                    status=401,
                )
        except User.DoesNotExist:
            pass
        return super().post(request, *args, **kwargs)


urlpatterns = [
    path('admin/', admin.site.urls),

    # Cold start prevention
    path('ping/', ping, name='ping'),

    # JWT Auth
    path('auth/token/',         CustomTokenObtainPairView.as_view(), name='token_obtain'),
    path('auth/token/refresh/', TokenRefreshView.as_view(),    name='token_refresh'),
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

    # Serve arquivos de media em produção também
    re_path(r'^uploads/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]
