from django.db import migrations, models
import apps.tv.models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('empresas', '0002_must_change_password'),
    ]

    operations = [
        migrations.CreateModel(
            name='TVConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.CharField(db_index=True, default=apps.tv.models.gen_token, max_length=64, unique=True)),
                ('nome', models.CharField(default='TV Principal', max_length=100)),
                ('ativo', models.BooleanField(default=True)),
                ('playlist', models.JSONField(default=list)),
                ('empresa', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tv_configs', to='empresas.empresa')),
            ],
            options={'verbose_name': 'Configuração de TV', 'verbose_name_plural': 'Configurações de TV'},
        ),
        migrations.CreateModel(
            name='TVMidia',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('titulo', models.CharField(blank=True, max_length=200)),
                ('tipo', models.CharField(choices=[('imagem', 'Imagem'), ('video', 'Vídeo')], max_length=10)),
                ('url', models.URLField(max_length=1000)),
                ('duracao', models.IntegerField(default=15)),
                ('ordem', models.IntegerField(default=0)),
                ('ativo', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('empresa', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tv_midias', to='empresas.empresa')),
            ],
            options={'ordering': ['ordem', 'created_at'], 'verbose_name': 'Mídia TV', 'verbose_name_plural': 'Mídias TV'},
        ),
    ]
