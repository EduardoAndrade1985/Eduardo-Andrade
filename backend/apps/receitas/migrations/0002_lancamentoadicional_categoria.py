from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('receitas', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='lancamentoadicional',
            name='categoria',
            field=models.CharField(
                choices=[('hosp', 'Hospedagem'), ('ab', 'A&B'), ('outros', 'Outros')],
                default='outros',
                max_length=10,
            ),
        ),
    ]
