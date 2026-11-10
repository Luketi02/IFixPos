from django.core.management.base import BaseCommand
from sales_app.services import limpiar_ventas_pendientes_expiradas


class Command(BaseCommand):
    help = (
        "Cancela automáticamente las ventas en estado PENDIENTE cuya reserva de stock "
        "haya superado el tiempo límite (por defecto 30 minutos) y restituye el stock."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--minutos',
            type=int,
            default=30,
            help='Minutos máximos de vigencia para reservas en estado PENDIENTE (default: 30).'
        )

    def handle(self, *args, **options):
        minutos = max(1, int(options.get('minutos') or 30))
        canceladas = limpiar_ventas_pendientes_expiradas(minutos_limite=minutos)
        self.stdout.write(
            self.style.SUCCESS(
                f"[Limpieza de Reservas] Proceso finalizado. Ventas expiradas canceladas: {canceladas}."
            )
        )

