from django.db import migrations
from django.utils import timezone

def insertar_configuracion_costo_diagnostico(apps, schema_editor):
    ConfiguracionSistema = apps.get_model('core_app', 'ConfiguracionSistema')
    ahora = timezone.now()

    if not ConfiguracionSistema.objects.filter(clave='costo_diagnostico_base').exists():
        ConfiguracionSistema.objects.create(
            clave='costo_diagnostico_base',
            descripcion='Costo monetario base de diagnóstico cobrado al iniciar una orden de servicio',
            valor='5000.0',
            ultima_modif=ahora
        )

def revertir_configuracion_costo_diagnostico(apps, schema_editor):
    ConfiguracionSistema = apps.get_model('core_app', 'ConfiguracionSistema')
    ConfiguracionSistema.objects.filter(clave='costo_diagnostico_base').delete()

class Migration(migrations.Migration):

    dependencies = [
        ('core_app', '0005_configuraciones_abastecimiento_automatico'),
    ]

    operations = [
        migrations.RunPython(
            insertar_configuracion_costo_diagnostico,
            revertir_configuracion_costo_diagnostico
        ),
    ]
