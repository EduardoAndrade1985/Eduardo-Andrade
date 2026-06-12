from rest_framework import serializers
from .models import Empresa, MembroEmpresa


class EmpresaSerializer(serializers.ModelSerializer):
    papel = serializers.SerializerMethodField()

    class Meta:
        model  = Empresa
        fields = ['id', 'nome', 'nome_fantasia', 'slug', 'cidade', 'estado',
                  'total_uhs', 'cor_primaria', 'papel']

    def get_papel(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        if request.user.is_superuser:
            return 'admin'
        # Fast path: membros_map pre-fetched by the view (avoids N+1)
        membros_map = self.context.get('membros_map')
        if membros_map is not None:
            return membros_map.get(obj.id)
        try:
            membro = MembroEmpresa.objects.get(usuario=request.user, empresa=obj, ativo=True)
            return membro.papel
        except MembroEmpresa.DoesNotExist:
            return None


class EmpresaAdminSerializer(serializers.ModelSerializer):
    total_membros = serializers.SerializerMethodField()

    class Meta:
        model  = Empresa
        fields = ['id', 'nome', 'nome_fantasia', 'slug', 'cnpj', 'endereco',
                  'cidade', 'estado', 'telefone', 'email', 'total_uhs',
                  'cor_primaria', 'fuso_horario', 'moeda', 'ativo',
                  'created_at', 'total_membros']

    def get_total_membros(self, obj):
        # Use annotation from view if available (avoids N+1)
        if hasattr(obj, 'membros_ativos'):
            return obj.membros_ativos
        return obj.membros.filter(ativo=True).count()


class MembroSerializer(serializers.ModelSerializer):
    username      = serializers.CharField(source='usuario.username', read_only=True)
    email         = serializers.CharField(source='usuario.email', read_only=True)
    usuario_ativo = serializers.BooleanField(source='usuario.is_active', read_only=True)

    class Meta:
        model  = MembroEmpresa
        fields = ['id', 'username', 'email', 'papel', 'modulos_permitidos', 'ativo', 'usuario_ativo']
