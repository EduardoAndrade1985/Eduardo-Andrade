from django.db import migrations

NOMES_PADRAO = ['Café da Manhã', 'Almoço', 'Jantar']


def seed_refeicoes(apps, schema_editor):
    Empresa = apps.get_model('empresas', 'Empresa')
    Refeicao = apps.get_model('desperdicio', 'Refeicao')
    Unidade = apps.get_model('desperdicio', 'Unidade')

    empresa_ids = Unidade.objects.values_list('empresa_id', flat=True).distinct()
    for empresa in Empresa.objects.filter(id__in=empresa_ids):
        for nome in NOMES_PADRAO:
            Refeicao.objects.get_or_create(empresa=empresa, nome=nome)


def reverse(apps, schema_editor):
    Refeicao = apps.get_model('desperdicio', 'Refeicao')
    Refeicao.objects.filter(nome__in=NOMES_PADRAO).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('desperdicio', '0005_alter_contagemclientes_options_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_refeicoes, reverse),
    ]
