from django.db import migrations


def limpar_nan_lookup(apps, schema_editor):
    Departamento  = apps.get_model('imobilizado', 'Departamento')
    CategoriaBem  = apps.get_model('imobilizado', 'CategoriaBem')
    Bem           = apps.get_model('imobilizado', 'Bem')

    # Para cada empresa: renomeia dep 'nan' → 'Geral' (mesclando se já existe)
    for dep_nan in Departamento.objects.filter(nome__in=['nan', 'NaN', 'NAN', 'none', 'None']):
        geral, criado = Departamento.objects.get_or_create(
            empresa=dep_nan.empresa, nome='Geral', defaults={'ativo': True}
        )
        # Reatribui os bens para 'Geral' e deleta o 'nan'
        Bem.objects.filter(departamento=dep_nan).update(departamento=geral)
        dep_nan.delete()

    # Para cada empresa: renomeia cat 'nan' → 'Outros' (mesclando se já existe)
    for cat_nan in CategoriaBem.objects.filter(nome__in=['nan', 'NaN', 'NAN', 'none', 'None']):
        outros, criado = CategoriaBem.objects.get_or_create(
            empresa=cat_nan.empresa, nome='Outros', defaults={'ativo': True}
        )
        Bem.objects.filter(categoria=cat_nan).update(categoria=outros)
        cat_nan.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('imobilizado', '0008_limpar_nan_campos_texto'),
    ]

    operations = [
        migrations.RunPython(limpar_nan_lookup, migrations.RunPython.noop),
    ]
