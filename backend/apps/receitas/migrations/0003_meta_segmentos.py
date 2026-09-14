from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('receitas', '0002_lancamentoadicional_categoria'),
    ]

    operations = [
        # ConfiguracaoReceita — 6 novos campos de padrão por segmento
        migrations.AddField(
            model_name='configuracaoreceita',
            name='orcado_padrao_hosp',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddField(
            model_name='configuracaoreceita',
            name='orcado_padrao_ab',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddField(
            model_name='configuracaoreceita',
            name='orcado_padrao_outros',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddField(
            model_name='configuracaoreceita',
            name='forecast_padrao_hosp',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddField(
            model_name='configuracaoreceita',
            name='forecast_padrao_ab',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddField(
            model_name='configuracaoreceita',
            name='forecast_padrao_outros',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        # MetaMensal — 6 novos campos por segmento (nullable)
        migrations.AddField(
            model_name='metamensal',
            name='orcado_hosp',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='metamensal',
            name='orcado_ab',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='metamensal',
            name='orcado_outros',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='metamensal',
            name='forecast_hosp',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='metamensal',
            name='forecast_ab',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='metamensal',
            name='forecast_outros',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
    ]
