import sys
from django.core.management.base import BaseCommand
from sales_app.services import evaluar_beneficios_predictivos_sistema
from sales_app.selectors import obtener_metricas_motor_beneficios


class Command(BaseCommand):
    help = 'Ejecuta el ciclo de análisis predictivo del Motor Inteligente de Beneficios (carritos abandonados, revisiones de taller y reactivación).'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Iniciando evaluación predictiva del Motor de Beneficios..."))

        try:
            resumen = evaluar_beneficios_predictivos_sistema()
            metricas = obtener_metricas_motor_beneficios()

            self.stdout.write(self.style.SUCCESS("Ciclo predictivo completado con éxito."))
            self.stdout.write(f"- Carritos abandonados analizados: {resumen['carritos_abandonados_evaluados']}")
            self.stdout.write(f"- Cupones emitidos por carrito abandonado: {resumen['carritos_beneficiados']}")
            self.stdout.write(f"- Alertas de mantenimiento PC/Laptops: {resumen['mantenimiento_computadoras']}")
            self.stdout.write(f"- Chequeos anuales Celulares/Tablets: {resumen['chequeo_celulares']}")
            self.stdout.write(f"- Total beneficios generados en esta corrida: {resumen['total_beneficios_generados']}")
            self.stdout.write(f"- Estado global motor: {'ACTIVO' if metricas['motor_activo'] else 'PAUSADO'}")
            self.stdout.write(f"- Beneficios emitidos en el mes: {metricas['beneficios_emitidos_mes']}/{metricas['limite_promociones_mensual']}")
            self.stdout.write(f"- Tasa de conversión histórica: {metricas['tasa_conversion_porcentaje']}%")

        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Error durante la ejecución del ciclo predictivo: {str(e)}"))
            sys.exit(1)

