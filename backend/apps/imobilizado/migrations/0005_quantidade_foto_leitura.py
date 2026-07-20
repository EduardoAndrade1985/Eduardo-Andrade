from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('imobilizado', '0004_conciliacao'),
    ]

    operations = [
        migrations.AddField(
            model_name='iteminventario',
            name='quantidade',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name='iteminventario',
            name='foto_leitura',
            field=models.ImageField(blank=True, null=True, upload_to='imobilizado/fotos/'),
        ),
    ]
