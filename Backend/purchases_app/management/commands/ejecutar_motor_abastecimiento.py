from django.core.management.base import BaseCommand
from purchases_app.services import ejecutar_ciclo_abastecimiento_automatico


class Command(BaseCommand):
    help = "Ejecuta de forma autónoma el Motor de Abastecimiento Inteligente y Órdenes de Compra (Daemon/Cron)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--forzar',
            action='store_true',
            help='Fuerza la ejecución del motor ignorando ventanas de agrupación o estado de pausa global.'
        )

    def handle(self, *args, **options):
        forzar = bool(options.get('forzar', False))
        self.stdout.write(self.style.NOTICE("Iniciando ciclo del Motor de Abastecimiento Inteligente..."))

        resultado = ejecutar_ciclo_abastecimiento_automatico(
            usuario_ejecutor=None,
            forzar_ejecucion=forzar,
            origen_disparo='PROGRAMADO'
        )

        status = resultado.get('status')
        mensaje = resultado.get('mensaje', '')

        if status == 'PAUSADO':
            self.stdout.write(self.style.WARNING(f"[PAUSADO] {mensaje}"))
        elif status == 'OMITIDO':
            self.stdout.write(self.style.WARNING(f"[OMITIDO] {mensaje}"))
        elif status == 'OK':
            self.stdout.write(self.style.SUCCESS(f"[OK] {mensaje}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"[EXITO] {mensaje}"))
            ordenes = resultado.get('ordenes_emitidas', [])
            solicitudes = resultado.get('solicitudes_cotizacion', [])
            canceladas = resultado.get('ordenes_canceladas_por_incumplimiento', [])

            if ordenes:
                self.stdout.write(self.style.SUCCESS(f"  * Ordenes de compra emitidas: {len(ordenes)}"))
                for o in ordenes:
                    self.stdout.write(f"    - Orden #{o['id_orden']} -> {o['proveedor']} (Urgencia Taller: {o['sol_tec']})")

            if solicitudes:
                self.stdout.write(self.style.SUCCESS(f"  * Solicitudes de cotizacion despachadas: {len(solicitudes)}"))
                for s in solicitudes:
                    self.stdout.write(f"    - Solicitud #{s['id_solicitud']} -> {s['proveedores_invitados']} proveedores invitados")

            if canceladas:
                self.stdout.write(self.style.WARNING(f"  * Ordenes canceladas por incumplimiento: {len(canceladas)}"))
                for c in canceladas:
                    self.stdout.write(f"    - Orden #{c['id_orden']} -> {c['proveedor']} ({c['motivo']})")

