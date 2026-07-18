from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('imobilizado', '0003_inventario_token'),
    ]

    operations = [
        migrations.AlterField(
            model_name='inventario',
            name='status',
            field=models.CharField(
                choices=[
                    ('ABERTO', 'Aberto'),
                    ('AGUARDANDO', 'Aguardando Conciliação'),
                    ('FINALIZADO', 'Finalizado'),
                ],
                default='ABERTO',
                max_length=15,
            ),
        ),
        migrations.AddField(
            model_name='iteminventario',
            name='descricao_provisoria',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='iteminventario',
            name='foto_provisoria',
            field=models.ImageField(blank=True, null=True, upload_to='imobilizado/fotos/'),
        ),
        migrations.AddField(
            model_name='iteminventario',
            name='categoria_provisoria_id',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='iteminventario',
            name='departamento_provisorio_id',
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
