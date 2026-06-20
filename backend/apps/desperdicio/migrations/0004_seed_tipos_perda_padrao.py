from django.db import migrations

NOMES_PADRAO = ['Sobra de Buffet', 'Erro de Produção', 'Vencido/Validade', 'Outro']


def seed_tipos_perda(apps, schema_editor):
    Empresa = apps.get_model('empresas', 'Empresa')
    TipoPerda = apps.get_model('desperdicio', 'TipoPerda')
    Unidade = apps.get_model('desperdicio', 'Unidade')

    empresa_ids = Unidade.objects.values_list('empresa_id', flat=True).distinct()
    for empresa in Empresa.objects.filter(id__in=empresa_ids):
        for nome in NOMES_PADRAO:
            TipoPerda.objects.get_or_create(empresa=empresa, nome=nome)


def reverse(apps, schema_editor):
    TipoPerda = apps.get_model('desperdicio', 'TipoPerda')
    TipoPerda.objects.filter(nome__in=NOMES_PADRAO).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('desperdicio', '0003_tipoperda_alter_registrodesperdicio_tipo_perda_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_tipos_perda, reverse),
    ]
