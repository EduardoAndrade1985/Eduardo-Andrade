from rest_framework import serializers
from .models import ArquivoImportado, Movimentacao


class ArquivoImportadoSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ArquivoImportado
        exclude = ['empresa']


class MovimentacaoSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Movimentacao
        fields = '__all__'
