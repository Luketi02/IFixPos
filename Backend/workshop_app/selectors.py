from typing import Optional
from datetime import date
from django.db.models import QuerySet, Q
from django.core.exceptions import ValidationError
from workshop_app.models import Dispositivo, Reparacion, CategoriaReparacion
from users_app.models import Usuario
from catalog_app.models import ModeloDispositivo, Marca, TipoDispositivo

def obtener_usuario_por_id(id_usuario: int) -> Optional[Usuario]:
    return Usuario.objects.filter(pk=id_usuario).first()

def obtener_modelo_por_id(id_modelo: int) -> Optional[ModeloDispositivo]:
    return ModeloDispositivo.objects.filter(pk=id_modelo).first()


# ==============================================================================
# CATÁLOGOS PARA REGISTRO DE DISPOSITIVOS (CU-06)
# ==============================================================================

def obtener_tipos_dispositivos(*, solo_activos: bool = True) -> QuerySet[TipoDispositivo]:
    """
    Retorna el listado de tipos de dispositivos registrados en el catálogo.
    """
    qs = TipoDispositivo.objects.all().order_by('nombre')
    if solo_activos:
        qs = qs.filter(estado_activo=True)
    return qs


def obtener_marcas(*, solo_activas: bool = True) -> QuerySet[Marca]:
    """
    Retorna el listado de marcas comerciales registradas en el catálogo.
    """
    qs = Marca.objects.all().order_by('nombre')
    if solo_activas:
        qs = qs.filter(estado_activo=True)
    return qs


def obtener_modelos_por_marca(id_marca: int, *, solo_activos: bool = True) -> QuerySet[ModeloDispositivo]:
    """
    Retorna los modelos de dispositivos asociados a una marca específica.
    """
    qs = ModeloDispositivo.objects.filter(id_marca_id=id_marca).order_by('nombre')
    if solo_activos:
        qs = qs.filter(estado_activo=True)
    return qs


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
            Q(id_modelo__id_marca__nombre__icontains=texto_busqueda)
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


def filtrar_dispositivos_cliente(
    *,
    usuario_cliente: Usuario,
    texto_busqueda: str = None,
    id_marca: int = None,
    id_modelo: int = None,
    estado_reparacion: str = None
) -> QuerySet[Dispositivo]:
    """
    CU-34: Filtra los dispositivos del cliente en sesión.

    Seguridad innegociable: la primera cláusula del filter() acota SIEMPRE
    a los dispositivos propiedad del cliente (FK `id_usuario` de Dispositivo).
    """
    qs = Dispositivo.objects.filter(
        id_usuario=usuario_cliente.id_usuario
    ).select_related(
        'id_modelo', 'id_modelo__id_marca', 'id_modelo__id_tipo_dispositivo'
    ).prefetch_related('reparacion_set')

    if id_marca is not None:
        qs = qs.filter(id_modelo__id_marca=id_marca)
    if id_modelo is not None:
        qs = qs.filter(id_modelo=id_modelo)
    if texto_busqueda:
        qs = qs.filter(
            Q(id_modelo__nombre__icontains=texto_busqueda) |
            Q(id_modelo__id_marca__nombre__icontains=texto_busqueda)
        )
    if estado_reparacion:
        qs = qs.filter(reparacion__etapa=estado_reparacion)

    return qs.distinct().order_by('-fecha_registro', '-id_dispositivo')


def dispositivo_tiene_reparaciones(id_dispositivo: int) -> bool:
    """CU-07: Indica si el dispositivo posee alguna reparación (histórica o activa)."""
    return Reparacion.objects.filter(id_dispositivo=id_dispositivo).exists()



# ==============================================================================
# CU-11: Consultar Detalles del Dispositivo y CU-61: Consultar Detalle de Reparación
# ==============================================================================

def obtener_detalle_dispositivo(*, usuario_cliente: Usuario, id_dispositivo: int) -> Dispositivo:
    """
    CU-11: Recupera el dispositivo validando propiedad horizontal.
    Si el dispositivo no pertenece al cliente, levanta PermissionDenied.
    """
    from rest_framework.exceptions import PermissionDenied, NotFound

    dispositivo = Dispositivo.objects.filter(pk=id_dispositivo).select_related(
        'id_modelo',
        'id_modelo__id_marca',
        'id_modelo__id_tipo_dispositivo',
        'id_usuario',
        'id_usuario__perfilusuario'
    ).first()

    if not dispositivo:
        raise NotFound("El dispositivo solicitado no existe.")

    cliente_id = getattr(usuario_cliente, 'id_usuario', None)
    if dispositivo.id_usuario_id != cliente_id:
        raise PermissionDenied("Acceso Denegado: No posee permisos sobre este equipo.")

    return dispositivo


def obtener_historial_reparaciones(id_dispositivo: int) -> QuerySet[Reparacion]:
    """
    CU-11: Retorna todas las reparaciones vinculadas al dispositivo ordenadas cronológicamente descendente.
    """
    return Reparacion.objects.filter(
        id_dispositivo_id=id_dispositivo
    ).select_related(
        'id_usuario',
        'id_usuario__perfilusuario'
    ).prefetch_related(
        'diagnostico_set',
        'calificacion_set'
    ).order_by('-fecha_inicio', '-id_reparacion')


def obtener_reparacion_activa(id_dispositivo: int) -> Optional[Reparacion]:
    """
    CU-11: Retorna la reparación que se encuentra en curso (no 'FINALIZADA' ni 'ENTREGADA'), si existe.
    """
    etapas_cerradas = ['FINALIZADA', 'ENTREGADA']
    return Reparacion.objects.filter(
        id_dispositivo_id=id_dispositivo
    ).exclude(
        etapa__in=etapas_cerradas
    ).select_related(
        'id_usuario',
        'id_usuario__perfilusuario'
    ).prefetch_related(
        'diagnostico_set'
    ).order_by('-fecha_inicio', '-id_reparacion').first()


def obtener_reparacion_detallada(*, usuario_solicitante: Usuario, id_reparacion: int) -> Reparacion:
    """
    CU-61: Consultar Detalle de Reparación.
    - Seguridad Horizontal: Si es CLIENTE, verifica que el dispositivo pertenezca al usuario.
    - Seguridad Vertical: Gestionada mediante context en el serializador o censura de claves.
    """
    from rest_framework.exceptions import PermissionDenied, NotFound

    reparacion = Reparacion.objects.filter(pk=id_reparacion).select_related(
        'id_dispositivo',
        'id_dispositivo__id_modelo',
        'id_dispositivo__id_modelo__id_marca',
        'id_dispositivo__id_modelo__id_tipo_dispositivo',
        'id_dispositivo__id_usuario',
        'id_usuario',
        'id_usuario__perfilusuario'
    ).prefetch_related(
        'bitacorareparacion_set',
        'detalleinsumoreparacion_set',
        'detalleinsumoreparacion_set__id_producto',
        'diagnostico_set',
        'calificacion_set',
        'categorias'
    ).first()

    if not reparacion:
        raise NotFound("La orden de reparación solicitada no existe.")

    # Determinar rol del usuario solicitante
    rol_codigo = ''
    if hasattr(usuario_solicitante, 'id_rol') and usuario_solicitante.id_rol:
        rol_codigo = (usuario_solicitante.id_rol.codigo or '').upper()
    elif hasattr(usuario_solicitante, 'rol') and usuario_solicitante.rol:
        rol_codigo = (usuario_solicitante.rol.codigo or '').upper()

    solicitante_id = getattr(usuario_solicitante, 'id_usuario', None)

    # Regla de Seguridad Horizontal (Innegociable):
    if rol_codigo == 'CLIENTE':
        if reparacion.id_dispositivo.id_usuario_id != solicitante_id:
            raise PermissionDenied("Acceso Denegado: No posee permisos sobre este equipo")

    return reparacion


# ==============================================================================
# GESTIÓN DE CATEGORÍAS DE REPARACIÓN (CU-64)
# ==============================================================================

def filtrar_categorias_reparacion(
    *,
    texto_busqueda: Optional[str] = None,
    estado_activo: Optional[Any] = None
) -> QuerySet[CategoriaReparacion]:
    """
    CU-64: Filtrar Categoría de Reparación.
    Retorna un QuerySet de CategoriaReparacion.
    - Si texto_busqueda no es nulo ni vacío, aplica nombre__icontains=texto_busqueda.
    - Si estado_activo es provisto ('True'/'False' o bool), filtra por ese booleano.
      Si es nulo o 'Todos', retorna sin filtrar por estado.
    """
    qs = CategoriaReparacion.objects.all()

    if texto_busqueda:
        termino = str(texto_busqueda).strip()
        if termino:
            qs = qs.filter(nombre__icontains=termino)

    if estado_activo is not None:
        if isinstance(estado_activo, bool):
            qs = qs.filter(estado_activo=estado_activo)
        elif isinstance(estado_activo, str):
            val_str = estado_activo.strip().lower()
            if val_str in ('true', '1', 'activo', 'activa', 'si'):
                qs = qs.filter(estado_activo=True)
            elif val_str in ('false', '0', 'inactivo', 'inactiva', 'no'):
                qs = qs.filter(estado_activo=False)
            # 'todos' o cadena vacía -> no se filtra

    return qs.order_by('nombre')


def obtener_categoria_reparacion(id_categoria: int) -> CategoriaReparacion:
    """
    Retorna la instancia exacta de CategoriaReparacion por su ID.
    Levanta CategoriaReparacion.DoesNotExist (ObjectDoesNotExist) si no existe.
    """
    return CategoriaReparacion.objects.get(id_categoria=id_categoria)
