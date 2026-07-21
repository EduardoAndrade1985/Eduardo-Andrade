from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('empresas', '0002_must_change_password'),
        ('imobilizado', '0005_quantidade_foto_leitura'),
    ]

    operations = [
        migrations.AddField(
            model_name='inventario',
            name='link_ativo',
            field=models.BooleanField(default=True),
        ),
        migrations.CreateModel(
            name='TransferenciaAtivo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('de_departamento',   models.CharField(blank=True, max_length=120)),
                ('para_departamento', models.CharField(blank=True, max_length=120)),
                ('de_localizacao',    models.CharField(blank=True, max_length=120)),
                ('para_localizacao',  models.CharField(blank=True, max_length=120)),
                ('motivo',            models.CharField(blank=True, max_length=200)),
                ('transferido_por',   models.CharField(blank=True, max_length=120)),
                ('criado_em',         models.DateTimeField(auto_now_add=True)),
                ('bem', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='transferencias',
                    to='imobilizado.bem',
                )),
            ],
            options={
                'verbose_name': 'Transferência de Ativo',
                'verbose_name_plural': 'Transferências de Ativos',
                'ordering': ['-criado_em'],
            },
        ),
        migrations.CreateModel(
            name='LogAuditoria',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('acao', models.CharField(max_length=20, choices=[
                    ('CRIAR_BEM',      'Criar Bem'),
                    ('EDITAR_BEM',     'Editar Bem'),
                    ('BAIXAR_BEM',     'Baixar Bem'),
                    ('TRANSFERIR_BEM', 'Transferir Bem'),
                    ('EXCLUIR_BEM',    'Excluir Bem'),
                    ('CRIAR_INV',      'Criar Inventário'),
                    ('FINALIZAR_INV',  'Finalizar Inventário'),
                    ('CONCILIAR_INV',  'Conciliar Inventário'),
                    ('BLOQUEAR_LINK',  'Bloquear Link'),
                    ('LIBERAR_LINK',   'Liberar Link'),
                ])),
                ('descricao', models.TextField()),
                ('usuario',   models.CharField(blank=True, max_length=120)),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('empresa', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='imobilizado_logauditoria_set',
                    to='empresas.empresa',
                )),
            ],
            options={
                'verbose_name': 'Log de Auditoria',
                'verbose_name_plural': 'Logs de Auditoria',
                'ordering': ['-criado_em'],
            },
        ),
    ]
