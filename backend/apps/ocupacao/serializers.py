from rest_framework import serializers
from .models import OcupacaoDiaria


class OcupacaoDiariaSerializer(serializers.ModelSerializer):
    revpar = serializers.ReadOnlyField()

    class Meta:
        model  = OcupacaoDiaria
        exclude = ['empresa']
