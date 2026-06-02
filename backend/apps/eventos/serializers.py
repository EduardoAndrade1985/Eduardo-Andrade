from rest_framework import serializers
from .models import Evento


class EventoSerializer(serializers.ModelSerializer):
    status_label = serializers.ReadOnlyField()
    prev_total   = serializers.ReadOnlyField()

    class Meta:
        model   = Evento
        exclude = ['empresa']
