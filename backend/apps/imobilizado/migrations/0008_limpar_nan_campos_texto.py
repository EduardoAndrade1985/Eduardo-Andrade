from django.db import migrations


def limpar_nan(apps, schema_editor):
    Bem = apps.get_model('imobilizado', 'Bem')
    campos = ['localizacao', 'responsavel', 'nota_fiscal', 'fornecedor', 'observacoes', 'motivo_baixa']
    for campo in campos:
        Bem.objects.filter(**{campo: 'nan'}).update(**{campo: ''})
    # limpa também strings case-insensitive
    for campo in campos:
        for valor in ['NaN', 'NAN', 'None', 'none']:
            Bem.objects.filter(**{campo: valor}).update(**{campo: ''})


class Migration(migrations.Migration):

    dependencies = [
        ('imobilizado', '0007_add_ajuste_flags_to_iteminventario'),
    ]

    operations = [
        migrations.RunPython(limpar_nan, migrations.RunPython.noop),
    ]
