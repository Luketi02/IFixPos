from django.db import migrations, models
import django.utils.timezone


def poblar_codigos_medios_pago(apps, schema_editor):
    """
    Asigna códigos técnicos inmutables ('MP', 'EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'OTRO')
    a los registros existentes de MedioPago a partir de su nombre comercial (§2.4).
    """
    MedioPago = apps.get_model('sales_app', 'MedioPago')
    for medio in MedioPago.objects.all():
        if medio.codigo:
            continue
        texto = str(medio.nombre_medio_pago or '').strip().lower()
        if 'mercado' in texto or texto == 'mp' or 'qr' in texto or 'pasarela' in texto:
            codigo = 'MP'
        elif 'efectivo' in texto or 'contado' in texto:
            codigo = 'EFECTIVO'
        elif 'transfer' in texto or 'cbu' in texto or 'alias' in texto:
            codigo = 'TRANSFERENCIA'
        elif 'tarjeta' in texto or 'debito' in texto or 'débito' in texto or 'credito' in texto or 'crédito' in texto:
            codigo = 'TARJETA'
        else:
            codigo = 'OTRO'
        MedioPago.objects.filter(pk=medio.pk).update(codigo=codigo)


class Migration(migrations.Migration):

    dependencies = [
        ('sales_app', '0005_pago_idx_pago_cod_operacion_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='mediopago',
            name='codigo',
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text='Código técnico inmutable del medio de pago (MP, EFECTIVO, TRANSFERENCIA, TARJETA, OTRO).',
                max_length=30,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='beneficio',
            name='fecha_hora_creacion',
            field=models.DateTimeField(
                blank=True,
                default=django.utils.timezone.now,
                help_text='Marca temporal exacta de emisión del beneficio para cálculo de vigencia en horas.',
                null=True,
            ),
        ),
        migrations.RunPython(poblar_codigos_medios_pago, migrations.RunPython.noop),
    ]

