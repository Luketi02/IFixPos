from django.core.management.base import BaseCommand
from core_app.services import evaluar_y_ejecutar_backups_programados, depurar_archivos_backup_huerfanos


class Command(BaseCommand):
    help = "Evalúa y ejecuta el ciclo de copias de seguridad programadas con precedencia jerárquica y rotación FIFO (CU-22)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--forzar-nivel',
            type=str,
            choices=['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL'],
            help='Fuerza la ejecución inmediata de un nivel de respaldo omitiendo validaciones horarias.'
        )
        parser.add_argument(
            '--depurar-huerfanos',
            action='store_true',
            help='Ejecuta exclusivamente la depuración de archivos .sql huérfanos sin generar respaldos.'
        )

    def handle(self, *args, **options):
        if options.get('depurar_huerfanos'):
            self.stdout.write("Iniciando depuración de archivos huérfanos...")
            res = depurar_archivos_backup_huerfanos()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Depuración completada: {res['eliminados']} archivos eliminados, {res['mb_liberados']} MB liberados."
                )
            )
            return

        forzar = options.get('forzar_nivel')
        if forzar:
            self.stdout.write(f"Forzando ejecución de respaldo nivel: {forzar}")
        else:
            self.stdout.write("Evaluando ciclo de respaldos programados con precedencia jerárquica...")

        resultado = evaluar_y_ejecutar_backups_programados(forzar_nivel=forzar)

        if resultado.get('ejecutado'):
            suprimidos_str = (
                f" (Niveles suprimidos por precedencia: {', '.join(resultado['suprimidos'])})"
                if resultado.get('suprimidos') else ""
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"[EXITO] Respaldo {resultado['nivel']} generado exitosamente: ID #{resultado['id_backup']}"
                    f" en {resultado['archivo']}{suprimidos_str}"
                )
            )
        else:
            motivo = resultado.get('motivo', 'Condiciones no cumplidas.')
            self.stdout.write(
                self.style.WARNING(f"[OMITIDO] No se generó respaldo en este ciclo: {motivo}")
            )

