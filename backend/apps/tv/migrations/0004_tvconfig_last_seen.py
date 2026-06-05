from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tv', '0003_tvpairingcode'),
    ]

    operations = [
        migrations.AddField(
            model_name='tvconfig',
            name='last_seen',
            field=models.DateTimeField(blank=True, help_text='Último heartbeat da TV', null=True),
        ),
    ]
