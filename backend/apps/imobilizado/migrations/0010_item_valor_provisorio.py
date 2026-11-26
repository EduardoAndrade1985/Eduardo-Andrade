from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('imobilizado', '0009_limpar_nan_departamentos_categorias'),
    ]

    operations = [
        migrations.AddField(
            model_name='iteminventario',
            name='valor_provisorio',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
    ]
