from typing import Any
from typing import Optional
from datetime import date
from django.db.models import QuerySet, Q, Prefetch
from django.core.exceptions import ValidationError, ObjectDoesNotExist
from workshop_app.models import Dispositivo, Reparacion, CategoriaReparacion
from users_app.models import Usuario
from catalog_app.models import ModeloDispositivo, Marca, TipoDispositivo

def obtener_usuario_por_id(id_usuario: int) -> Optional[Usuario]:
    return Usuario.objects.filter(pk=id_usuario).first()

def obtener_modelo_por_id(id_modelo: int) -> Optional[ModeloDispositivo]:
    return ModeloDispositivo.objects.filter(pk=id_modelo).first()

def obtener_dispositivo_por_id(id_dispositivo: int) -> Optional[Dispositivo]:
    return Dispositivo.objects.select_related('id_usuario', 'id_usuario__perfilusuario', 'id_modelo').filter(pk=id_dispositivo).first()

def dispositivo_tiene_reparacion_activa(id_dispositivo: int) -> bool:
    """
    CU-26: Busca en la tabla Reparacion si existe algún registro vinculado a este
    dispositivo cuyo estado NO sea 'FINALIZADO', 'ENTREGADO' ni 'CANCELADO'.
    Retorna True si hay una reparación activa bloqueando el equipo, False si está libre.
    """
    estados_inactivos = [
        'FINALIZADO', 'FINALIZADA',
        'ENTREGADO', 'ENTREGADA',
        'CANCELADO', 'CANCELADA'
    ]
    return Reparacion.objects.filter(
        id_dispositivo_id=id_dispositivo
    ).exclude(
        etapa__in=estados_inactivos
    ).exclude(
        etapa__iexact='FINALIZADO'
    ).exclude(
        etapa__iexact='FINALIZADA'
    ).exclude(
        etapa__iexact='ENTREGADO'
    ).exclude(
        etapa__iexact='ENTREGADA'
    ).exclude(
        etapa__iexact='CANCELADO'
    ).exclude(
        etapa__iexact='CANCELADA'
    ).exists()


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
    id_modelo: int = None,
    marca: str = None,
    modelo: str = None,
    excluir_reparaciones_activas: bool = False
) -> QuerySet[Dispositivo]:
    """CU-33: Filtro de dispositivos para la vista del Administrador/Técnico."""
    
    if fecha_ingreso_desde and fecha_ingreso_hasta:
        if fecha_ingreso_desde > fecha_ingreso_hasta:
            raise ValidationError("La fecha de ingreso desde no puede ser posterior a la fecha hasta.")

    qs = Dispositivo.objects.select_related(
        'id_usuario', 
        'id_usuario__perfilusuario', 
        'id_modelo',
        'id_modelo__id_marca',
        'id_modelo__id_tipo_dispositivo'
    ).prefetch_related(
        Prefetch(
            'reparacion_set',
            queryset=Reparacion.objects.select_related(
                'id_usuario',
                'id_usuario__perfilusuario'
            ).order_by('-fecha_inicio', '-id_reparacion')
        )
    )
    
    if excluir_reparaciones_activas:
        estados_cerrados = ['entregado', 'entregada', 'cancelado', 'cancelada', 'finalizada', 'finalizado']
        ids_con_reparacion_activa = Reparacion.objects.exclude(
            etapa__in=estados_cerrados
        ).values_list('id_dispositivo_id', flat=True)
        qs = qs.exclude(id_dispositivo__in=ids_con_reparacion_activa)

    if dni_cliente:
        qs = qs.filter(id_usuario__perfilusuario__dni=str(dni_cliente).strip())
    if codigo_sec_reparacion:
        qs = qs.filter(reparacion__codigo_sec=str(codigo_sec_reparacion).strip())
    if nro_serie:
        qs = qs.filter(numero_serie__iexact=str(nro_serie).strip())
    if etapa_reparacion:
        qs = qs.filter(reparacion__etapa__iexact=str(etapa_reparacion).strip())
    if id_tecnico_asignado is not None:
        qs = qs.filter(reparacion__id_usuario_id=id_tecnico_asignado)
    if fecha_ingreso_desde:
        qs = qs.filter(reparacion__fecha_inicio__gte=fecha_ingreso_desde)
    if fecha_ingreso_hasta:
        qs = qs.filter(reparacion__fecha_inicio__lte=fecha_ingreso_hasta)
    if id_modelo is not None:
        qs = qs.filter(id_modelo_id=id_modelo)
    if modelo:
        qs = qs.filter(id_modelo__nombre__iexact=str(modelo).strip())
    if id_marca is not None:
        qs = qs.filter(id_modelo__id_marca_id=id_marca)
    if marca:
        qs = qs.filter(id_modelo__id_marca__nombre__iexact=str(marca).strip())
        
    return qs.distinct().order_by('-fecha_registro', '-id_dispositivo')

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


def obtener_reparacion_para_recepcion(id_reparacion: int) -> Reparacion:
    """
    CU-45: Selector específico para garantizar que la reparación es apta para recepción.
    Busca la reparación. Si no existe, levanta ObjectDoesNotExist (Reparacion.DoesNotExist).
    Regla de Negocio Crítica: Verifica que el estado actual de la reparación sea estrictamente
    'ESPERANDO_DISPOSITIVO'. Si está en 'ESPERANDO_DIAGNOSTICO' o cualquier otro estado más avanzado,
    levanta un ValidationError ("El dispositivo ya fue recepcionado o se encuentra en una etapa avanzada.").
    """
    try:
        reparacion = Reparacion.objects.select_related(
            'id_dispositivo',
            'id_dispositivo__id_usuario',
            'id_dispositivo__id_modelo',
            'id_dispositivo__id_modelo__id_marca',
            'id_dispositivo__id_modelo__id_tipo_dispositivo'
        ).prefetch_related('categorias').get(id_reparacion=id_reparacion)
    except Reparacion.DoesNotExist:
        raise ObjectDoesNotExist(f"No existe ninguna orden de reparación con ID {id_reparacion}.")

    etapa_actual = (reparacion.etapa or '').strip().upper()
    if etapa_actual != 'ESPERANDO_DISPOSITIVO':
        raise ValidationError("El dispositivo ya fue recepcionado o se encuentra en una etapa avanzada.")

    return reparacion


# ==============================================================================
# CU-58: FILTRAR REPARACIONES (CAPA DE LECTURA Y MOTOR DE BÚSQUEDA)
# ==============================================================================

def filtrar_reparaciones(
    *,
    usuario_ejecutor: Usuario,
    filtros: dict
) -> QuerySet[Reparacion]:
    """
    CU-58: Filtrar Reparaciones.
    Motor de búsqueda multicriterio con Seguridad Horizontal y Vertical:
    - Si el usuario es CLIENTE: acota estrictamente a sus propios dispositivos y descarta
      parámetros de búsqueda reservados al personal (cliente_query, id_tecnico, codigo_seguridad).
    - Si el usuario es ADMIN o TECNICO: permite búsqueda global y filtros por datos del cliente
      (DNI, nombre, apellido, email, teléfono), técnico asignado y código de seguridad.
    """
    # 1. QuerySet base optimizado
    qs = Reparacion.objects.select_related(
        'id_dispositivo',
        'id_dispositivo__id_usuario',
        'id_dispositivo__id_usuario__perfilusuario',
        'id_usuario',
        'id_usuario__perfilusuario',
        'id_dispositivo__id_modelo',
        'id_dispositivo__id_modelo__id_marca',
        'id_dispositivo__id_modelo__id_tipo_dispositivo'
    ).prefetch_related('categorias')

    # 2. Evaluación de Rol y Seguridad Innegociable
    rol_codigo = ''
    if hasattr(usuario_ejecutor, 'id_rol') and usuario_ejecutor.id_rol:
        rol_codigo = (usuario_ejecutor.id_rol.codigo or '').upper()
    elif hasattr(usuario_ejecutor, 'rol') and usuario_ejecutor.rol:
        rol_codigo = (usuario_ejecutor.rol.codigo or '').upper()

    if rol_codigo == 'CLIENTE':
        # Cláusula de aislamiento estricto para clientes
        qs = qs.filter(id_dispositivo__id_usuario=usuario_ejecutor)
    elif rol_codigo in ('ADMIN', 'TECNICO'):
        # Búsqueda multicriterio de cliente
        cliente_query = str(filtros.get('cliente_query') or '').strip()
        if cliente_query:
            q_cliente = (
                Q(id_dispositivo__id_usuario__perfilusuario__dni__icontains=cliente_query) |
                Q(id_dispositivo__id_usuario__perfilusuario__nombre__icontains=cliente_query) |
                Q(id_dispositivo__id_usuario__perfilusuario__apellido__icontains=cliente_query) |
                Q(id_dispositivo__id_usuario__email__icontains=cliente_query) |
                Q(id_dispositivo__id_usuario__perfilusuario__telefono__icontains=cliente_query)
            )
            qs = qs.filter(q_cliente)

        # Filtro por técnico asignado
        id_tecnico = filtros.get('id_tecnico')
        if id_tecnico:
            qs = qs.filter(id_usuario_id=id_tecnico)

        # Filtro por código de seguridad (token de entrega)
        codigo_seguridad = str(filtros.get('codigo_seguridad') or '').strip()
        if codigo_seguridad:
            qs = qs.filter(codigo_sec__iexact=codigo_seguridad)
    else:
        # Por seguridad preventiva, cualquier otro rol sin definir se acota a sus propios dispositivos
        qs = qs.filter(id_dispositivo__id_usuario=usuario_ejecutor)

    # 3. Filtros transversales (comunes a todos los roles)
    id_dispositivo = filtros.get('id_dispositivo')
    if id_dispositivo:
        qs = qs.filter(id_dispositivo_id=id_dispositivo)

    etapa = str(filtros.get('etapa') or '').strip()
    if etapa:
        qs = qs.filter(etapa__icontains=etapa)

    id_categoria = filtros.get('id_categoria')
    if id_categoria:
        qs = qs.filter(categorias__id_categoria=id_categoria)

    fecha_desde = filtros.get('fecha_desde')
    fecha_hasta = filtros.get('fecha_hasta')
    if fecha_desde and fecha_hasta:
        if fecha_desde > fecha_hasta:
            raise ValidationError("La fecha de inicio desde no puede ser posterior a la fecha hasta.")
    if fecha_desde:
        qs = qs.filter(fecha_inicio__gte=fecha_desde)
    if fecha_hasta:
        qs = qs.filter(fecha_inicio__lte=fecha_hasta)

    return qs.distinct().order_by('-fecha_inicio', '-id_reparacion')


# ==============================================================================
# CU-08: CARGAR DIAGNÓSTICO TÉCNICO (VALIDACIÓN DE ESTADO OPERATIVO)
# ==============================================================================

def obtener_reparacion_para_diagnostico(id_reparacion: int) -> Reparacion:
    """
    CU-08: Selector específico para garantizar que la reparación es apta para recibir un diagnóstico técnico.
    Busca la reparación. Si no existe, levanta ObjectDoesNotExist (Reparacion.DoesNotExist).
    Regla de Negocio Estricta: Verifica que 'etapa' sea exactamente 'EN_DIAGNOSTICO'.
    Si está en otro estado, levanta ValidationError ("La reparación no se encuentra en la etapa de diagnóstico").
    """
    try:
        reparacion = Reparacion.objects.select_related(
            'id_dispositivo',
            'id_dispositivo__id_usuario',
            'id_dispositivo__id_usuario__perfilusuario',
            'id_dispositivo__id_modelo',
            'id_dispositivo__id_modelo__id_marca',
            'id_usuario'
        ).get(id_reparacion=id_reparacion)
    except Reparacion.DoesNotExist:
        raise ObjectDoesNotExist(f"No existe ninguna orden de reparación con ID {id_reparacion}.")

    etapa_normalizada = (
        (reparacion.etapa or '')
        .strip()
        .upper()
        .replace(' ', '_')
        .replace('Á', 'A')
        .replace('É', 'E')
        .replace('Í', 'I')
        .replace('Ó', 'O')
        .replace('Ú', 'U')
    )
    if etapa_normalizada not in ('EN_DIAGNOSTICO', 'ESPERANDO_DIAGNOSTICO'):
        raise ValidationError("La reparación no se encuentra en la etapa de diagnóstico")

    return reparacion


# ==============================================================================
# CU-56: CONSULTAR DIAGNÓSTICO TÉCNICO (LECTURA Y SEGURIDAD HORIZONTAL)
# ==============================================================================

def obtener_diagnostico_cliente(*, usuario_cliente: Usuario, id_reparacion: int):
    """
    CU-56: Consultar Diagnóstico Técnico.
    Recupera el informe técnico emitido por el especialista para el cliente autenticado.
    Aplica Seguridad Horizontal innegociable:
    - Verifica que la reparación pertenezca a usuario_cliente.id (control de propiedad).
      Si no coincide, levanta PermissionDenied (CU-56 Paso 2).
    - Valida que exista un registro de Diagnóstico asociado. Si no existe aún
      (por ejemplo, si la reparación sigue en 'Esperando Diagnóstico'), levanta NotFound / ValidationError (CU-56 Paso 3).
    - Optimiza queries mediante select_related y prefetch_related para evitar el problema N+1.
    """
    from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError
    from workshop_app.models import Reparacion, Diagnostico, DetalleInsumoReparacion

    try:
        reparacion = Reparacion.objects.select_related(
            'id_dispositivo',
            'id_dispositivo__id_usuario',
            'id_dispositivo__id_modelo',
            'id_dispositivo__id_modelo__id_marca',
            'id_usuario',
            'id_usuario__perfilusuario'
        ).get(pk=id_reparacion)
    except Reparacion.DoesNotExist:
        raise NotFound(f"No existe ninguna orden de reparación con ID {id_reparacion}.")

    # Control de propiedad horizontal innegociable (CU-56 Paso 2)
    cliente_id = getattr(usuario_cliente, 'id_usuario', None) or getattr(usuario_cliente, 'id', None)
    if reparacion.id_dispositivo.id_usuario_id != cliente_id:
        raise PermissionDenied("Acceso Denegado: Esta orden de reparación no pertenece a su cuenta.")

    # Validar que exista el diagnóstico asociado (CU-56 Paso 3)
    diagnostico = Diagnostico.objects.filter(id_reparacion=reparacion).select_related(
        'id_reparacion',
        'id_reparacion__id_usuario',
        'id_reparacion__id_usuario__perfilusuario',
        'id_reparacion__id_dispositivo',
        'id_reparacion__id_dispositivo__id_modelo',
        'id_reparacion__id_dispositivo__id_modelo__id_marca'
    ).prefetch_related(
        Prefetch(
            'id_reparacion__detalleinsumoreparacion_set',
            queryset=DetalleInsumoReparacion.objects.select_related('id_producto')
        )
    ).first()

    if not diagnostico:
        raise NotFound("El equipo aún está siendo evaluado por nuestros técnicos. Le notificaremos cuando el diagnóstico esté listo.")

    return diagnostico


# ==============================================================================
# CU-10: Actualizar Estado de Reparación
# ==============================================================================

def obtener_reparacion_para_cambio_estado(id_reparacion: int) -> Reparacion:
    """
    CU-10: Recupera la reparación para actualización de estado operativo.
    - Si no existe, levanta ObjectDoesNotExist.
    - Si se encuentra en un estado terminal irreversible ('ENTREGADO' o 'CANCELADO'),
      levanta ValidationError.
    """
    try:
        reparacion = Reparacion.objects.select_related(
            'id_dispositivo',
            'id_dispositivo__id_usuario',
            'id_dispositivo__id_modelo',
            'id_dispositivo__id_modelo__id_marca',
            'id_usuario',
            'id_usuario__perfilusuario'
        ).get(pk=id_reparacion)
    except Reparacion.DoesNotExist:
        raise ObjectDoesNotExist(f"No existe ninguna orden de reparación con ID {id_reparacion}.")

    etapa_actual = (reparacion.etapa or '').strip().upper().replace(' ', '_')
    estados_terminales = ('ENTREGADO', 'ENTREGADA', 'CANCELADO', 'CANCELADA')
    if etapa_actual in estados_terminales:
        raise ValidationError("La reparación se encuentra en un estado terminal y no puede ser modificada.")

    return reparacion


# ==============================================================================
# CU-46: Entregar Dispositivo (Lectura y Validación de Búsqueda)
# ==============================================================================

def buscar_reparacion_para_entrega(
    *,
    usuario_ejecutor: Usuario,
    codigo_seguridad: Optional[str] = None,
    dni_cliente: Optional[str] = None
) -> Reparacion:
    """
    CU-46: Entregar Dispositivo (Paso 1 y 2).
    Localiza la reparación previa a la entrega física al cliente.
    - Si se envía 'codigo_seguridad', busca por coincidencia exacta con codigo_sec.
    - Si se envía 'dni_cliente', verifica PRIMERO que usuario_ejecutor sea ADMIN.
      Si no es ADMIN, levanta PermissionDenied. Luego busca la reparación asociada al DNI.
    - Si no existe ninguna coincidencia, levanta ObjectDoesNotExist ("No se encontró ninguna reparación con los datos provistos.").
    - Validación de Estado Operativo: Verifica que etapa sea exactamente 'LISTO_PARA_RETIRAR'
      (o equivalentes terminales listos como 'FINALIZADO', 'IRREPARABLE_PARA_DEVOLUCION').
      Si no, levanta ValidationError ("El equipo no está apto para liberación o aún se encuentra en proceso.").
    """
    from rest_framework.exceptions import PermissionDenied

    cod_sec = (codigo_seguridad or '').strip()
    dni = (dni_cliente or '').strip()

    reparacion = None

    if cod_sec:
        reparacion = Reparacion.objects.select_related(
            'id_dispositivo',
            'id_dispositivo__id_modelo',
            'id_dispositivo__id_modelo__id_marca',
            'id_usuario',
            'id_usuario__perfilusuario',
            'id_venta'
        ).filter(codigo_sec__iexact=cod_sec).order_by('-fecha_inicio', '-id_reparacion').first()
    elif dni:
        # Verificar privilegios elevados de Administrador
        rol_obj = getattr(usuario_ejecutor, 'id_rol', None) or getattr(usuario_ejecutor, 'rol', None)
        cod_rol = (getattr(rol_obj, 'codigo', '') or '').upper()
        if cod_rol != 'ADMIN':
            raise PermissionDenied("Solo los administradores poseen privilegios para buscar entregas por DNI.")

        etapas_busqueda = [
            'LISTO_PARA_RETIRAR',
            'FINALIZADO',
            'FINALIZADA',
            'IRREPARABLE_PARA_DEVOLUCION',
            'PAGADO'
        ]
        reparacion = Reparacion.objects.select_related(
            'id_dispositivo',
            'id_dispositivo__id_modelo',
            'id_dispositivo__id_modelo__id_marca',
            'id_usuario',
            'id_usuario__perfilusuario',
            'id_venta'
        ).filter(
            Q(id_usuario__perfilusuario__dni__iexact=dni) |
            Q(id_dispositivo__id_usuario__perfilusuario__dni__iexact=dni),
            etapa__in=etapas_busqueda
        ).order_by('-fecha_inicio', '-id_reparacion').first()
    else:
        raise ObjectDoesNotExist("Debe proporcionar el código de seguridad o el DNI del cliente.")


    if not reparacion:
        raise ObjectDoesNotExist("No se encontró ninguna reparación con los datos provistos.")

    etapa_limpia = (reparacion.etapa or '').strip().upper().replace(' ', '_')
    etapas_validas_entrega = [
        'LISTO_PARA_RETIRAR',
        'FINALIZADO',
        'FINALIZADA',
        'IRREPARABLE_PARA_DEVOLUCION',
        'PAGADO'
    ]

    if etapa_limpia not in etapas_validas_entrega:
        raise ValidationError("El equipo no está apto para liberación o aún se encuentra en proceso.")

    return reparacion



