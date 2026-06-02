from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('empresas', '0002_must_change_password'),
    ]

    operations = [
        migrations.CreateModel(
            name='Evento',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('codigo',      models.CharField(blank=True, db_index=True, default='', max_length=50)),
                ('nome',        models.CharField(max_length=200)),
                ('inicio',      models.DateField()),
                ('fim',         models.DateField()),
                ('status',      models.CharField(choices=[('A', 'Atendido'), ('C', 'Confirmado'), ('O', 'Contrato'), ('G', 'Negociação')], default='C', max_length=2)),
                ('exec_nome',   models.CharField(blank=True, default='', max_length=100)),
                ('resp',        models.CharField(blank=True, default='', max_length=100)),
                ('cliente',     models.CharField(blank=True, default='', max_length=200)),
                ('ramo',        models.CharField(blank=True, default='', max_length=100)),
                ('segmento',    models.CharField(blank=True, default='', max_length=100)),
                ('prev_hosp',   models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('prev_sala',   models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('prev_aeb',    models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('prev_outros', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('real_hosp',   models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('real_sala',   models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('real_aeb',    models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('real_outros', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('rn',     models.IntegerField(default=0)),
                ('diaria', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('empresa', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='%(app_label)s_%(class)s_set',
                    to='empresas.empresa',
                )),
            ],
            options={
                'verbose_name': 'Evento',
                'verbose_name_plural': 'Eventos',
                'ordering': ['inicio', 'nome'],
            },
        ),
        migrations.AddIndex(
            model_name='evento',
            index=models.Index(fields=['empresa', 'inicio'], name='eventos_eve_emp_ini_idx'),
        ),
        migrations.AddIndex(
            model_name='evento',
            index=models.Index(fields=['empresa', 'status'], name='eventos_eve_emp_sta_idx'),
        ),
        migrations.AddIndex(
            model_name='evento',
            index=models.Index(fields=['empresa', 'inicio', 'fim'], name='eventos_eve_emp_ini_fim_idx'),
        ),
    ]
