from rest_framework import serializers
from .models import TransacaoOperadora, TransacaoSistema, PeriodoConciliado, LogConciliacao


class TransacaoOperadoraSerializer(serializers.ModelSerializer):
    class Meta:
        model  = TransacaoOperadora
        exclude = ['empresa']


class TransacaoSistemaSerializer(serializers.ModelSerializer):
    class Meta:
        model  = TransacaoSistema
        exclude = ['empresa', 'importado_em']


class PeriodoConciliadoSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PeriodoConciliado
        exclude = ['empresa']


class LogConciliacaoSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LogConciliacao
        exclude = ['empresa']
