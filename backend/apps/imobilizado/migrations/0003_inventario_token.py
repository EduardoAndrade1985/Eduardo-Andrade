import uuid
from django.db import migrations, models


def _gerar_tokens(apps, schema_editor):
    Inventario = apps.get_model('imobilizado', 'Inventario')
    for inv in Inventario.objects.filter(token__isnull=True):
        inv.token = uuid.uuid4()
        inv.save(update_fields=['token'])


class Migration(migrations.Migration):

    dependencies = [
        ('imobilizado', '0002_localizacaobem'),
    ]

    operations = [
        # Passo 1: adiciona campo sem unique, aceitando null temporariamente
        migrations.AddField(
            model_name='inventario',
            name='token',
            field=models.UUIDField(null=True, editable=False),
        ),
        # Passo 2: gera UUID único para cada inventário existente
        migrations.RunPython(_gerar_tokens, reverse_code=migrations.RunPython.noop),
        # Passo 3: torna obrigatório e único
        migrations.AlterField(
            model_name='inventario',
            name='token',
            field=models.UUIDField(default=uuid.uuid4, unique=True, editable=False),
        ),
    ]
