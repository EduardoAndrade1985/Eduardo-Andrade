from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('empresas', '0002_must_change_password'),
    ]

    operations = [
        migrations.CreateModel(
            name='TipoEnxoval',
            fields=[
                ('id',             models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nome',           models.CharField(max_length=100)),
                ('codigo',         models.CharField(max_length=4)),
                ('cor',            models.CharField(blank=True, default='#6366f1', max_length=7)),
                ('estoque_minimo', models.PositiveIntegerField(default=0)),
                ('ativo',          models.BooleanField(default=True)),
                ('empresa',        models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='%(app_label)s_%(class)s_set',
                    to='empresas.empresa',
                )),
            ],
            options={
                'verbose_name':        'Tipo de Enxoval',
                'verbose_name_plural': 'Tipos de Enxoval',
                'ordering':            ['nome'],
            },
        ),
        migrations.CreateModel(
            name='PecaEnxoval',
            fields=[
                ('id',            models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('epc',           models.CharField(db_index=True, max_length=24, unique=True)),
                ('serial',        models.PositiveBigIntegerField(default=0)),
                ('status',        models.CharField(
                    choices=[('EM_HOTEL', 'Em Hotel'), ('NA_LAVANDERIA', 'Na Lavanderia'), ('BAIXADA', 'Baixada')],
                    default='EM_HOTEL',
                    max_length=15,
                )),
                ('observacoes',   models.TextField(blank=True)),
                ('criado_em',     models.DateTimeField(auto_now_add=True)),
                ('atualizado_em', models.DateTimeField(auto_now=True)),
                ('empresa',       models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='%(app_label)s_%(class)s_set',
                    to='empresas.empresa',
                )),
                ('tipo',          models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='pecas',
                    to='enxoval.tipoenxoval',
                )),
            ],
            options={
                'verbose_name':        'Peça de Enxoval',
                'verbose_name_plural': 'Peças de Enxoval',
            },
        ),
        migrations.CreateModel(
            name='MovimentacaoEnxoval',
            fields=[
                ('id',          models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo_mov',    models.CharField(
                    choices=[('SAIDA', 'Saída para Lavanderia'), ('ENTRADA', 'Entrada da Lavanderia')],
                    max_length=10,
                )),
                ('numero',      models.PositiveIntegerField(default=0)),
                ('responsavel', models.CharField(blank=True, max_length=120)),
                ('observacoes', models.TextField(blank=True)),
                ('finalizado',  models.BooleanField(default=False)),
                ('criado_em',   models.DateTimeField(auto_now_add=True)),
                ('empresa',     models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='%(app_label)s_%(class)s_set',
                    to='empresas.empresa',
                )),
            ],
            options={
                'verbose_name':        'Movimentação de Enxoval',
                'verbose_name_plural': 'Movimentações de Enxoval',
                'ordering':            ['-criado_em'],
            },
        ),
        migrations.CreateModel(
            name='ItemMovimentacao',
            fields=[
                ('id',          models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('epc_lido',    models.CharField(max_length=24)),
                ('rssi',        models.FloatField(blank=True, null=True)),
                ('contagem',    models.PositiveIntegerField(default=1)),
                ('status_item', models.CharField(
                    choices=[('RECONHECIDA', 'Reconhecida'), ('DESCONHECIDA', 'Desconhecida'), ('SUSPEITA', 'Suspeita')],
                    default='RECONHECIDA',
                    max_length=15,
                )),
                ('movimentacao', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='itens',
                    to='enxoval.movimentacaoenxoval',
                )),
                ('peca',         models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='movimentacoes',
                    to='enxoval.pecaenxoval',
                )),
                ('tipo_enxoval', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to='enxoval.tipoenxoval',
                )),
            ],
            options={
                'verbose_name':        'Item de Movimentação',
                'verbose_name_plural': 'Itens de Movimentação',
            },
        ),
        migrations.AddIndex(
            model_name='tipoenxoval',
            index=models.Index(fields=['empresa', 'ativo'], name='enxoval_tip_emp_ati_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='tipoenxoval',
            unique_together={('empresa', 'codigo'), ('empresa', 'nome')},
        ),
        migrations.AddIndex(
            model_name='pecaenxoval',
            index=models.Index(fields=['empresa', 'status'], name='enxoval_pec_emp_sta_idx'),
        ),
        migrations.AddIndex(
            model_name='pecaenxoval',
            index=models.Index(fields=['empresa', 'tipo'], name='enxoval_pec_emp_tip_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='itemmovimentacao',
            unique_together={('movimentacao', 'epc_lido')},
        ),
    ]
