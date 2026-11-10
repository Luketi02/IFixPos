# ==============================================================================
# MÓDULO DE SERVICIOS DE MÉTRICAS, ASIGNACIÓN INTELIGENTE Y REPORTES BI (workshop_app/services_metricas.py)
# Extraído de workshop_app/services.py para mantener modularidad por subdominio (Fase 3 / §3.6)
# ==============================================================================

from typing import Any
from django.db import transaction
from django.db.models import Avg
from django.utils import timezone as django_timezone

from users_app.models import Usuario
from workshop_app.models import Reparacion, Calificacion
from core_app.models import LogSistema
from core_app.selectors import obtener_configuracion_int


def seleccionar_mejor_tecnico_para_reparacion(
    *,
    reparacion: Reparacion
) -> tuple[Any, dict]:
    """
    Algoritmo Inteligente de Asignación de Reparaciones a Técnicos.
    Evalúa a todos los técnicos activos del sistema según las 5 ponderaciones configurables:
      1. Carga Laboral Activa (menor carga = mayor puntaje)
      2. Calificación de Clientes (mayor promedio de estrellas = mayor puntaje)
      3. Rapidez de Resolución (menor promedio de días = mayor puntaje)
      4. Especialidad en Categoría (más reparaciones resueltas de la misma categoría = mayor puntaje)
      5. Tasa de Efectividad (mayor porcentaje de reparaciones exitosas vs canceladas = mayor puntaje)
    
    Retorna una tupla: (Usuario_tecnico_ganador, dict_detalle_metricas)
    """
    tecnicos = list(Usuario.objects.filter(id_rol__codigo='TECNICO', is_active=True))
    if not tecnicos:
        return None, {"razon": "No hay técnicos activos registrados en el sistema."}

    if len(tecnicos) == 1:
        return tecnicos[0], {
            "tecnico_id": tecnicos[0].id_usuario,
            "email": tecnicos[0].email,
            "razon": "Único técnico activo disponible en el sistema.",
            "score_final": 100.0
        }

    peso_carga = obtener_configuracion_int('pesoAsignacion_CargaLaboral', 30)
    peso_calif = obtener_configuracion_int('pesoAsignacion_Calificacion', 25)
    peso_rapidez = obtener_configuracion_int('pesoAsignacion_Rapidez', 20)
    peso_especialidad = obtener_configuracion_int('pesoAsignacion_Especialidad', 15)
    peso_efectividad = obtener_configuracion_int('pesoAsignacion_Efectividad', 10)

    suma_pesos = peso_carga + peso_calif + peso_rapidez + peso_especialidad + peso_efectividad
    if suma_pesos <= 0:
        peso_carga, peso_calif, peso_rapidez, peso_especialidad, peso_efectividad = 30, 25, 20, 15, 10
        suma_pesos = 100

    etapas_activas = [
        'ESPERANDO_DIAGNOSTICO',
        'EN_DIAGNOSTICO',
        'ESPERANDO_CONFIRMACION',
        'ESPERANDO_REPUESTOS',
        'EN_REPARACION'
    ]

    cats_reparacion = list(reparacion.categorias.all().values_list('id_categoria', flat=True))
    candidatos_metricas = []

    for tec in tecnicos:
        carga_raw = Reparacion.objects.filter(id_usuario=tec, etapa__in=etapas_activas).count()
        calif_aggr = Calificacion.objects.filter(id_reparacion__id_usuario=tec).aggregate(prom=Avg('puntuacion'))['prom']
        if calif_aggr is not None:
            calif_promedio = float(calif_aggr)
            calif_score = min(100.0, max(0.0, (calif_promedio / 5.0) * 100.0))
        else:
            calif_promedio = 3.5
            calif_score = 70.0

        resueltas = Reparacion.objects.filter(
            id_usuario=tec,
            etapa__in=['FINALIZADO', 'ENTREGADO'],
            fecha_entrega__isnull=False
        ).only('fecha_inicio', 'fecha_entrega')

        if resueltas.exists():
            dias_totales = [max(1, (r.fecha_entrega - r.fecha_inicio).days) for r in resueltas]
            prom_dias = sum(dias_totales) / len(dias_totales)
        else:
            prom_dias = 3.0

        if cats_reparacion:
            esp_raw = Reparacion.objects.filter(
                id_usuario=tec,
                etapa__in=['FINALIZADO', 'ENTREGADO'],
                categorias__in=cats_reparacion
            ).distinct().count()
        else:
            esp_raw = 0

        exitosas = Reparacion.objects.filter(id_usuario=tec, etapa__in=['FINALIZADO', 'ENTREGADO']).count()
        canceladas = Reparacion.objects.filter(id_usuario=tec, etapa__in=['CANCELADA', 'CANCELADO', 'RECHAZADO', 'RECHAZADA']).count()
        total_term = exitosas + canceladas
        if total_term > 0:
            efectividad_score = (exitosas / total_term) * 100.0
        else:
            efectividad_score = 85.0

        candidatos_metricas.append({
            'usuario': tec,
            'carga_raw': carga_raw,
            'calif_promedio': round(calif_promedio, 2),
            'calif_score': calif_score,
            'prom_dias': round(prom_dias, 2),
            'esp_raw': esp_raw,
            'efectividad_score': efectividad_score,
            'exitosas': exitosas,
            'total_term': total_term
        })

    min_carga = min(c['carga_raw'] for c in candidatos_metricas)
    max_carga = max(c['carga_raw'] for c in candidatos_metricas)
    min_dias = min(c['prom_dias'] for c in candidatos_metricas)
    max_dias = max(c['prom_dias'] for c in candidatos_metricas)
    min_esp = min(c['esp_raw'] for c in candidatos_metricas)
    max_esp = max(c['esp_raw'] for c in candidatos_metricas)

    for c in candidatos_metricas:
        if min_carga == max_carga:
            c['score_carga'] = 100.0
        else:
            c['score_carga'] = ((max_carga - c['carga_raw']) / (max_carga - min_carga)) * 100.0

        if min_dias == max_dias:
            c['score_rapidez'] = 100.0
        else:
            c['score_rapidez'] = ((max_dias - c['prom_dias']) / (max_dias - min_dias)) * 100.0

        if max_esp == 0:
            c['score_esp'] = 50.0
        elif min_esp == max_esp:
            c['score_esp'] = 100.0
        else:
            c['score_esp'] = ((c['esp_raw'] - min_esp) / (max_esp - min_esp)) * 100.0

        c['score_final'] = round((
            c['score_carga'] * (peso_carga / suma_pesos) +
            c['calif_score'] * (peso_calif / suma_pesos) +
            c['score_rapidez'] * (peso_rapidez / suma_pesos) +
            c['score_esp'] * (peso_especialidad / suma_pesos) +
            c['efectividad_score'] * (peso_efectividad / suma_pesos)
        ), 2)

    candidatos_metricas.sort(
        key=lambda x: (-x['score_final'], x['carga_raw'], x['usuario'].id_usuario)
    )

    ganador = candidatos_metricas[0]
    detalle = {
        'tecnico_ganador_id': ganador['usuario'].id_usuario,
        'tecnico_ganador_email': ganador['usuario'].email,
        'score_final': ganador['score_final'],
        'puntajes': {
            'carga_laboral': round(ganador['score_carga'], 1),
            'calificacion': round(ganador['calif_score'], 1),
            'rapidez': round(ganador['score_rapidez'], 1),
            'especialidad': round(ganador['score_esp'], 1),
            'efectividad': round(ganador['efectividad_score'], 1)
        },
        'metricas_reales': {
            'reparaciones_activas': ganador['carga_raw'],
            'promedio_estrellas': ganador['calif_promedio'],
            'dias_promedio_resolucion': ganador['prom_dias'],
            'reparaciones_en_categoria': ganador['esp_raw'],
            'tasa_efectividad_pct': round(ganador['efectividad_score'], 1)
        },
        'ponderaciones_aplicadas': {
            'carga_laboral_pct': peso_carga,
            'calificacion_pct': peso_calif,
            'rapidez_pct': peso_rapidez,
            'especialidad_pct': peso_especialidad,
            'efectividad_pct': peso_efectividad
        },
        'total_tecnicos_evaluados': len(tecnicos)
    }

    return ganador['usuario'], detalle


@transaction.atomic
def generar_auditoria_reporte_conversion(
    *,
    usuario_admin: Usuario,
    filtros_validados: dict
) -> dict:
    """
    CU-72: Generar Reporte de Conversión de Presupuestos (Capa Transaccional / Auditoría).
    Ejecuta el cálculo estadístico macro y micro a través del selector y sienta
    la traza de auditoría inmutable en LogSistema.
    """
    from workshop_app.selectors import calcular_reporte_conversion

    resultado = calcular_reporte_conversion(
        fecha_inicio=filtros_validados['fecha_inicio'],
        fecha_fin=filtros_validados['fecha_fin'],
        id_categoria=filtros_validados.get('id_categoria'),
        id_medio_pago=filtros_validados.get('id_medio_pago')
    )

    id_admin = getattr(usuario_admin, 'id_usuario', str(usuario_admin))
    f_ini = filtros_validados['fecha_inicio']
    f_fin = filtros_validados['fecha_fin']
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Generar Reporte de Conversión (CU-72)",
        detalle=f"El administrador {id_admin} generó el Reporte de Conversión de Presupuestos para el periodo {f_ini} al {f_fin}.",
        tipo="REPORTE_BI",
        modulo_origen="workshop_app",
        tabla_afectada="diagnostico",
        id_registro_afectado="0",
        id_usuario=usuario_admin if hasattr(usuario_admin, 'pk') else None
    )

    return resultado


@transaction.atomic
def generar_auditoria_reporte_eficiencia(
    *,
    usuario_admin: Usuario,
    filtros_validados: dict
) -> list[dict]:
    """
    CU-73: Generar Reporte de Demanda y Eficiencia por Categoría (Capa Transaccional / Auditoría).
    Ejecuta el cálculo de volumen, facturación y eficiencia temporal vía selector y
    registra el asiento de auditoría en LogSistema.
    """
    from workshop_app.selectors import calcular_reporte_eficiencia

    resultado = calcular_reporte_eficiencia(
        fecha_inicio=filtros_validados['fecha_inicio'],
        fecha_fin=filtros_validados['fecha_fin'],
        id_categoria=filtros_validados.get('id_categoria'),
        id_tipo_dispositivo=filtros_validados.get('id_tipo_dispositivo'),
        id_medio_pago=filtros_validados.get('id_medio_pago')
    )

    id_admin = getattr(usuario_admin, 'id_usuario', str(usuario_admin))
    f_ini = filtros_validados['fecha_inicio']
    f_fin = filtros_validados['fecha_fin']
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Generar Reporte de Demanda y Eficiencia (CU-73)",
        detalle=f"El administrador {id_admin} generó el Reporte de Demanda y Eficiencia para el periodo {f_ini} al {f_fin}.",
        tipo="REPORTE_BI",
        modulo_origen="workshop_app",
        tabla_afectada="reparacion",
        id_registro_afectado="0",
        id_usuario=usuario_admin if hasattr(usuario_admin, 'pk') else None
    )

    return resultado


@transaction.atomic
def generar_auditoria_productividad(
    *,
    usuario_admin: Usuario,
    filtros_validados: dict
) -> list[dict]:
    """
    CU-74: Generar Reporte de Productividad y Carga de Trabajo Técnica (Capa Transaccional / Auditoría).
    Invoca el selector de cálculo de indicadores de productividad, disciplina operativa y carga actual,
    y asienta el evento de auditoría en LogSistema.
    """
    from workshop_app.selectors import calcular_reporte_productividad

    resultado = calcular_reporte_productividad(
        fecha_inicio=filtros_validados['fecha_inicio'],
        fecha_fin=filtros_validados['fecha_fin'],
        id_tecnico=filtros_validados.get('id_tecnico')
    )

    id_admin = getattr(usuario_admin, 'id_usuario', str(usuario_admin))
    f_ini = filtros_validados['fecha_inicio']
    f_fin = filtros_validados['fecha_fin']
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Generar Reporte de Productividad (CU-74)",
        detalle=f"El administrador {id_admin} generó el Reporte de Productividad y Carga de Trabajo Técnica para el periodo {f_ini} al {f_fin}.",
        tipo="REPORTE_BI",
        modulo_origen="workshop_app",
        tabla_afectada="reparacion",
        id_registro_afectado="0",
        id_usuario=usuario_admin if hasattr(usuario_admin, 'pk') else None
    )

    return resultado


@transaction.atomic
def generar_auditoria_reporte_satisfaccion(
    *,
    usuario_admin: Usuario,
    filtros_validados: dict
) -> dict:
    """
    CU-76: Generar Reporte de Satisfacción y Calidad (Capa Transaccional / Auditoría).
    Invoca el selector de cálculo de indicadores de satisfacción, promedios por técnico,
    por categoría y comentarios, y asienta el evento de auditoría en LogSistema.
    """
    from workshop_app.selectors import calcular_reporte_satisfaccion

    resultado = calcular_reporte_satisfaccion(
        fecha_inicio=filtros_validados['fecha_inicio'],
        fecha_fin=filtros_validados['fecha_fin'],
        id_tecnico=filtros_validados.get('id_tecnico'),
        id_categoria=filtros_validados.get('id_categoria'),
        rango_estrellas_min=filtros_validados.get('rango_estrellas_min'),
        rango_estrellas_max=filtros_validados.get('rango_estrellas_max')
    )

    id_admin = getattr(usuario_admin, 'id_usuario', str(usuario_admin))
    f_ini = filtros_validados['fecha_inicio']
    f_fin = filtros_validados['fecha_fin']
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Generar Reporte de Satisfacción y Calidad (CU-76)",
        detalle=f"El administrador {id_admin} generó el Reporte de Satisfacción y Calidad (CSAT) para el periodo {f_ini} al {f_fin}.",
        tipo="REPORTE_BI",
        modulo_origen="workshop_app",
        tabla_afectada="calificacion",
        id_registro_afectado="0",
        id_usuario=usuario_admin if hasattr(usuario_admin, 'pk') else None
    )

    return resultado

