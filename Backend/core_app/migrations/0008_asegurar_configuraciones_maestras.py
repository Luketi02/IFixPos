from django.db import migrations
from django.utils import timezone


def poblar_catalogo_maestro_configuraciones(apps, schema_editor):
    ConfiguracionSistema = apps.get_model('core_app', 'ConfiguracionSistema')
    ahora = timezone.now()

    from core_app.constantes import CATALOGO_CONFIGURACIONES_SISTEMA

    existentes = set(
        ConfiguracionSistema.objects.exclude(clave__isnull=True).values_list('clave', flat=True)
    )

    nuevos = []
    for clave, meta in CATALOGO_CONFIGURACIONES_SISTEMA.items():
        if clave not in existentes:
            nuevos.append(
                ConfiguracionSistema(
                    clave=clave,
                    descripcion=meta.get('descripcion', f"Parámetro {clave}"),
                    valor=str(meta.get('valor_defecto', '')),
                    ultima_modif=ahora
                )
            )

    if nuevos:
        ConfiguracionSistema.objects.bulk_create(nuevos, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ('core_app', '0007_logsistema_idx_log_mod_tabla_reg_and_more'),
    ]

    operations = [
        migrations.RunPython(
            poblar_catalogo_maestro_configuraciones,
            reverse_code=migrations.RunPython.noop
        ),
    ]

