from rest_framework import serializers
from .models import (
    Unidade, Setor, CategoriaAlimento, TipoPerda, Refeicao, ContagemClientes, RegistroDesperdicio, Dispositivo,
)


class UnidadeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unidade
        exclude = ['empresa']


class SetorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Setor
        fields = '__all__'


class CategoriaAlimentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaAlimento
        exclude = ['empresa']


class TipoPerdaSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoPerda
        exclude = ['empresa']


class RefeicaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Refeicao
        exclude = ['empresa']


class ContagemClientesSerializer(serializers.ModelSerializer):
    refeicao_nome = serializers.ReadOnlyField(source='refeicao.nome')

    class Meta:
        model = ContagemClientes
        fields = '__all__'


class RegistroDesperdicioSerializer(serializers.ModelSerializer):
    unidade_nome     = serializers.ReadOnlyField(source='unidade.nome')
    setor_nome       = serializers.ReadOnlyField(source='setor.nome')
    categoria_nome   = serializers.ReadOnlyField(source='categoria.nome')
    tipo_perda_nome  = serializers.ReadOnlyField(source='tipo_perda.nome')
    refeicao_nome    = serializers.ReadOnlyField(source='refeicao.nome')

    class Meta:
        model = RegistroDesperdicio
        fields = '__all__'


class DispositivoSerializer(serializers.ModelSerializer):
    unidade_nome = serializers.ReadOnlyField(source='unidade.nome')
    setor_nome   = serializers.ReadOnlyField(source='setor.nome')

    class Meta:
        model = Dispositivo
        exclude = ['empresa']
