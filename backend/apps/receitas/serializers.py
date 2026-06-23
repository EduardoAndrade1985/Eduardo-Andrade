from rest_framework import serializers
from .models import (
    ArquivoImportado, LancamentoDiario, ConfiguracaoReceita,
    MetaMensal, LancamentoAdicional,
)


class ArquivoImportadoSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ArquivoImportado
        exclude = ['empresa']


class LancamentoDiarioSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LancamentoDiario
        fields = '__all__'


class ConfiguracaoReceitaSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ConfiguracaoReceita
        exclude = ['empresa']


class MetaMensalSerializer(serializers.ModelSerializer):
    class Meta:
        model  = MetaMensal
        exclude = ['empresa']


class LancamentoAdicionalSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LancamentoAdicional
        exclude = ['empresa']
