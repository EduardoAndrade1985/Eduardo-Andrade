from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from apps.empresas.views import me_view, change_password_view

urlpatterns = [
    path('admin/', admin.site.urls),

    # JWT Auth
    path('auth/token/',         TokenObtainPairView.as_view(), name='token_obtain'),
    path('auth/token/refresh/', TokenRefreshView.as_view(),    name='token_refresh'),
    path('auth/me/',              me_view,                       name='me'),
    path('auth/change-password/', change_password_view,          name='change_password'),

    # Empresas
    path('api/empresas/', include('apps.empresas.urls')),

    # Custos (dashboard + upload + movimentações)
    path('', include('apps.custos.urls')),

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

] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
