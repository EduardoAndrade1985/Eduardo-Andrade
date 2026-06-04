from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tv', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='tvconfig',
            name='local',
            field=models.CharField(blank=True, help_text='Ex: Recepção, Diretoria', max_length=100),
        ),
        migrations.AddField(
            model_name='tvmidia',
            name='data_inicio',
            field=models.DateField(blank=True, null=True, help_text='Exibir a partir de (vazio = sempre)'),
        ),
        migrations.AddField(
            model_name='tvmidia',
            name='data_fim',
            field=models.DateField(blank=True, null=True, help_text='Exibir até (vazio = sem limite)'),
        ),
        migrations.AlterModelOptions(
            name='tvconfig',
            options={'ordering': ['nome'], 'verbose_name': 'Dispositivo TV', 'verbose_name_plural': 'Dispositivos TV'},
        ),
    ]
