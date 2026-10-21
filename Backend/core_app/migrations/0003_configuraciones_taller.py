from django.db import migrations
from django.utils import timezone

def insertar_configuraciones_taller(apps, schema_editor):
    ConfiguracionSistema = apps.get_model('core_app', 'ConfiguracionSistema')
    ahora = timezone.now()

    # 1. costoManoDeObra
    if not ConfiguracionSistema.objects.filter(clave='costoManoDeObra').exists():
        ConfiguracionSistema.objects.create(
            clave='costoManoDeObra',
            descripcion='Costo base predeterminado de mano de obra técnica para diagnósticos',
            valor='30000.0',
            ultima_modif=ahora
        )

    # 2. permitirCostoManoDeObraPropio
    if not ConfiguracionSistema.objects.filter(clave='permitirCostoManoDeObraPropio').exists():
        ConfiguracionSistema.objects.create(
            clave='permitirCostoManoDeObraPropio',
            descripcion='Permitir al técnico modificar manualmente el costo de mano de obra en diagnósticos',
            valor='False',
            ultima_modif=ahora
        )

def revertir_configuraciones_taller(apps, schema_editor):
    ConfiguracionSistema = apps.get_model('core_app', 'ConfiguracionSistema')
    ConfiguracionSistema.objects.filter(clave__in=['costoManoDeObra', 'permitirCostoManoDeObraPropio']).delete()

class Migration(migrations.Migration):

    dependencies = [
        ('core_app', '0002_alter_configuracionsistema_valor'),
    ]

    operations = [
        migrations.RunPython(insertar_configuraciones_taller, revertir_configuraciones_taller),
    ]
