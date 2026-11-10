# ==============================================================================
# MÓDULO DE SERVICIOS DE CALIFICACIONES DE TALLER (workshop_app/services_calificaciones.py)
# Extraído de workshop_app/services.py para mantener modularidad por subdominio (Fase 3 / §3.6)
# ==============================================================================

import logging
from django.db import transaction
from django.utils import timezone as django_timezone

from users_app.models import Usuario
from workshop_app.models import Calificacion
from core_app.models import LogSistema

logger = logging.getLogger(__name__)


@transaction.atomic
def calificar_reparacion(
    *,
    usuario_cliente: Usuario,
    id_reparacion: int,
    datos_validados: dict
) -> Calificacion:
    """
    CU-19: Calificar Servicio Técnico.
    Permite al cliente valorar una reparación culminada (estado 'ENTREGADO').
    Persiste de forma inmutable la calificación (puntuación cuantitativa 1 a 5 y opinión)
    asentando la auditoría de calidad en LogSistema.

    Reglas de Arquitectura HackSoftware:
    - @transaction.atomic para consistencia transaccional.
    - No recibe el objeto request; recibe usuario_cliente, id_reparacion y datos_validados.
    - Ejecuta validaciones de precondición y pertenencia a través del selector especializado.
    - Persiste el log de auditoría inmutable en LogSistema.
    """
    from workshop_app.selectors import obtener_reparacion_para_calificar

    # Paso 1: Validar precondiciones operativas, pertenencia y unicidad vía selector
    reparacion = obtener_reparacion_para_calificar(
        usuario_cliente=usuario_cliente,
        id_reparacion=id_reparacion
    )

    # Paso 2: Extraer datos validados
    puntuacion = datos_validados['puntuacion']
    comentario = datos_validados.get('comentario')

    # Paso 3: Persistir la calificación inmutable vinculada relacionalmente a la reparación
    fecha_actual = django_timezone.now().date()
    calificacion = Calificacion.objects.create(
        puntuacion=puntuacion,
        comentario=comentario,
        fecha=fecha_actual,
        id_reparacion=reparacion
    )

    # Hook Transaccional: Recompensa por Calificación 5 Estrellas (CU-19)
    if puntuacion == 5:
        try:
            from sales_app.services import evaluar_beneficio_post_calificacion
            evaluar_beneficio_post_calificacion(calificacion=calificacion)
        except Exception as e:
            logger.warning(f"[Motor Beneficios] Error evaluando post-calificación: {e}")

    # Paso 4: Registro de auditoría inmutable en LogSistema
    email_cliente = getattr(usuario_cliente, 'email', str(usuario_cliente))
    comentario_log = f"'{calificacion.comentario}'" if calificacion.comentario else "Sin comentario"
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Calificar Servicio Técnico (CU-19)",
        detalle=(
            f"El cliente {email_cliente} emitió una calificación de {calificacion.puntuacion}/5 estrellas "
            f"para la Orden de Reparación #{reparacion.id_reparacion}. Comentario: {comentario_log}"
        )[:1000],
        tipo="AUDITORIA_CALIDAD",
        modulo_origen="workshop_app",
        tabla_afectada="calificacion",
        id_registro_afectado=str(calificacion.id_calificacion),
        id_usuario=usuario_cliente if hasattr(usuario_cliente, 'pk') else None
    )

    return calificacion

