from django.db import migrations
from django.utils import timezone


def insertar_configuraciones_abastecimiento(apps, schema_editor):
    ConfiguracionSistema = apps.get_model('core_app', 'ConfiguracionSistema')
    ahora = timezone.now()

    nuevas_configuraciones = [
        (
            'estrategiaLoteReposicion',
            'Estrategia de reposición de lote: BRECHA_MINIMO, DOBLE_MINIMO o STOCK_MINIMO_FIJO',
            'BRECHA_MINIMO'
        ),
        (
            'modoDisparadorAbastecimiento',
            'Modo de activación del motor de abastecimiento: TRANSACCIONAL, PROGRAMADO o HIBRIDO',
            'HIBRIDO'
        ),
        (
            'esperaUrgenciaTecnicaHoras',
            'Horas de espera para insumos de taller con solTec=True (0 para emitir Al instante)',
            '0'
        ),
        (
            'toleranciaHorasIncumplimientoUrgente',
            'Horas de tolerancia para órdenes de taller antes de cancelar por incumplimiento y re-adjudicar',
            '24'
        ),
        (
            'diasToleranciaIncumplimientoProveedor',
            'Días de tolerancia comercial tras el plazo prometido antes de declarar demora en orden ordinaria',
            '3'
        ),
        (
            'criterioObligatorio_Envio',
            'Exigir obligatoriamente que el proveedor ofrezca servicio de envío a domicilio',
            'False'
        ),
    ]

    for clave, descripcion, valor in nuevas_configuraciones:
        if not ConfiguracionSistema.objects.filter(clave=clave).exists():
            ConfiguracionSistema.objects.create(
                clave=clave,
                descripcion=descripcion,
                valor=valor,
                ultima_modif=ahora
            )


def revertir_configuraciones_abastecimiento(apps, schema_editor):
    ConfiguracionSistema = apps.get_model('core_app', 'ConfiguracionSistema')
    claves_eliminar = [
        'estrategiaLoteReposicion',
        'modoDisparadorAbastecimiento',
        'esperaUrgenciaTecnicaHoras',
        'toleranciaHorasIncumplimientoUrgente',
        'diasToleranciaIncumplimientoProveedor',
        'criterioObligatorio_Envio',
    ]
    ConfiguracionSistema.objects.filter(clave__in=claves_eliminar).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core_app', '0004_alter_logsistema_fecha_hora'),
    ]

    operations = [
        migrations.RunPython(insertar_configuraciones_abastecimiento, revertir_configuraciones_abastecimiento),
    ]

