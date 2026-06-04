from django.db import migrations, models
import apps.tv.models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tv', '0002_tvconfig_local_tvmidia_scheduling'),
    ]

    operations = [
        migrations.CreateModel(
            name='TVPairingCode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(db_index=True, default=apps.tv.models.gen_pair_code, max_length=10, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('usado', models.BooleanField(default=False)),
                ('tv_config', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='pairing_codes', to='tv.tvconfig')),
            ],
            options={'verbose_name': 'Código de Pareamento'},
        ),
    ]
