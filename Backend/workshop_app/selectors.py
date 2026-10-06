from typing import Optional
from datetime import date
from django.db.models import QuerySet, Q
from django.core.exceptions import ValidationError
from workshop_app.models import Dispositivo
from users_app.models import Usuario
from catalog_app.models import ModeloDispositivo

def obtener_usuario_por_id(id_usuario: int) -> Optional[Usuario]:
    return Usuario.objects.filter(pk=id_usuario).first()

def obtener_modelo_por_id(id_modelo: int) -> Optional[ModeloDispositivo]:
    return ModeloDispositivo.objects.filter(pk=id_modelo).first()


def filtrar_dispositivos_taller(
    *, 
    dni_cliente: str = None, 
    codigo_sec_reparacion: str = None, 
    nro_serie: str = None, 
    etapa_reparacion: str = None, 
    id_tecnico_asignado: int = None, 
    fecha_ingreso_desde: date = None, 
    fecha_ingreso_hasta: date = None, 
    id_marca: int = None, 
    id_modelo: int = None
) -> QuerySet[Dispositivo]:
    """CU-33: Filtro de dispositivos para la vista del Administrador/Técnico."""
    
    if fecha_ingreso_desde and fecha_ingreso_hasta:
        if fecha_ingreso_desde > fecha_ingreso_hasta:
            raise ValidationError("La fecha de ingreso desde no puede ser posterior a la fecha hasta.")

    qs = Dispositivo.objects.select_related(
        'id_usuario', 
        'id_usuario__perfilusuario', 
        'id_modelo'
    ).prefetch_related('reparacion_set')
    
    if dni_cliente:
        qs = qs.filter(id_usuario__perfilusuario__dni=dni_cliente)
    if codigo_sec_reparacion:
        qs = qs.filter(reparacion__codigo_sec=codigo_sec_reparacion)
    if nro_serie:
        qs = qs.filter(numero_serie=nro_serie)
    if etapa_reparacion:
        qs = qs.filter(reparacion__etapa=etapa_reparacion)
    if id_tecnico_asignado is not None:
        qs = qs.filter(reparacion__id_usuario=id_tecnico_asignado)
    if fecha_ingreso_desde:
        qs = qs.filter(reparacion__fecha_inicio__gte=fecha_ingreso_desde)
    if fecha_ingreso_hasta:
        qs = qs.filter(reparacion__fecha_inicio__lte=fecha_ingreso_hasta)
    if id_modelo is not None:
        qs = qs.filter(id_modelo=id_modelo)
    if id_marca is not None:
        qs = qs.filter(id_modelo__id_marca=id_marca)
        
    return qs.distinct()

def filtrar_mis_dispositivos(
    *, 
    id_usuario_propietario: int, 
    texto_busqueda: str = None, 
    etapa_reparacion: str = None, 
    id_marca: int = None, 
    id_modelo: int = None, 
    ordenar_mas_recientes: bool = True
) -> QuerySet[Dispositivo]:
    """CU-34: Filtro de dispositivos para el Cliente (Regla de Aislamiento)."""
    
    # Regla de Aislamiento Crítica: El id_usuario es el filtro base inmutable
    qs = Dispositivo.objects.filter(id_usuario=id_usuario_propietario).select_related(
        'id_modelo'
    ).prefetch_related('reparacion_set')
    
    if texto_busqueda:
        qs = qs.filter(
            Q(id_modelo__nombre__icontains=texto_busqueda) | 
            Q(id_modelo__id_marca__nombre_marca__icontains=texto_busqueda)
        )
    if etapa_reparacion:
        qs = qs.filter(reparacion__etapa=etapa_reparacion)
    if id_modelo is not None:
        qs = qs.filter(id_modelo=id_modelo)
    if id_marca is not None:
        qs = qs.filter(id_modelo__id_marca=id_marca)
        
    if ordenar_mas_recientes:
        qs = qs.order_by('-fecha_registro')
    else:
        qs = qs.order_by('fecha_registro')
        
    return qs.distinct()
