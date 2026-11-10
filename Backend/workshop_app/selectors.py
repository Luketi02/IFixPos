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
    CU-11: Retorna la reparación que se encuentra en curso (no 'FINALIZADA', 'FINALIZADO', 'ENTREGADA', 'ENTREGADO', 'CANCELADA', 'CANCELADO'), si existe.
    """
    etapas_cerradas = [
        'FINALIZADO', 'FINALIZADA',
        'ENTREGADO', 'ENTREGADA',
        'CANCELADO', 'CANCELADA'
    ]
    return Reparacion.objects.filter(
        id_dispositivo_id=id_dispositivo
    ).exclude(
        etapa__in=etapas_cerradas
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
        'categorias',
        'imagenes_recepcion'
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
        # Búsqueda unificada 'q' (CU-45, Dashboard y Mostrador)
        q_general = str(filtros.get('q') or '').strip()
        if q_general:
            q_filtro = (
                Q(id_dispositivo__id_usuario__perfilusuario__dni__icontains=q_general) |
                Q(id_dispositivo__id_usuario__perfilusuario__nombre__icontains=q_general) |
                Q(id_dispositivo__id_usuario__perfilusuario__apellido__icontains=q_general) |
                Q(id_dispositivo__id_usuario__email__icontains=q_general) |
                Q(id_dispositivo__id_usuario__perfilusuario__telefono__icontains=q_general) |
                Q(codigo_sec__icontains=q_general) |
                Q(id_dispositivo__numero_serie__icontains=q_general) |
                Q(id_dispositivo__id_modelo__nombre__icontains=q_general) |
                Q(id_dispositivo__id_modelo__id_marca__nombre__icontains=q_general)
            )
            qs = qs.filter(q_filtro)

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


# ==============================================================================
# CU-19: CALIFICAR SERVICIO TÉCNICO (SELECTORS)
# ==============================================================================

def obtener_reparacion_para_calificar(
    *,
    usuario_cliente: Usuario,
    id_reparacion: int
) -> Reparacion:
    """
    CU-19: Calificar Servicio Técnico.
    Verifica que la reparación sea apta para recibir una calificación por parte del cliente.
    Aplica Seguridad Horizontal innegociable:
    - Verifica que la reparación pertenezca a usuario_cliente.id (control de propiedad).
      Si no, levanta PermissionDenied.
    - Valida que la reparación exista (si no, levanta NotFound).
    - Valida que la etapa de la reparación sea estrictamente 'ENTREGADO' (o 'ENTREGADA').
      Si no, levanta ValidationError ("Solo puede calificar equipos que ya han sido entregados.").
    - Valida que la reparación no posea una calificación previa vinculada (unicidad).
      Si ya existe, levanta ValidationError ("Esta reparación ya fue calificada previamente.").
    - Optimiza queries mediante select_related para evitar el problema de N+1 queries.
    """
    from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError
    from workshop_app.models import Calificacion, Reparacion

    try:
        reparacion = Reparacion.objects.select_related(
            'id_dispositivo',
            'id_dispositivo__id_usuario',
            'id_usuario',
            'id_usuario__perfilusuario'
        ).get(pk=id_reparacion)
    except Reparacion.DoesNotExist:
        raise NotFound(f"No existe ninguna orden de reparación con ID {id_reparacion}.")

    # Control de propiedad horizontal innegociable
    cliente_id = getattr(usuario_cliente, 'id_usuario', None) or getattr(usuario_cliente, 'id', None)
    es_propietario = False
    if reparacion.id_dispositivo and reparacion.id_dispositivo.id_usuario_id == cliente_id:
        es_propietario = True
    elif reparacion.id_usuario_id == cliente_id:
        es_propietario = True

    if not es_propietario:
        raise PermissionDenied("Acceso Denegado: Esta orden de reparación no pertenece a su cuenta.")

    # Validación de Estado Operativo: Etapa estrictamente 'ENTREGADO'
    etapa_limpia = (reparacion.etapa or '').strip().upper()
    if etapa_limpia not in ('ENTREGADO', 'ENTREGADA'):
        raise ValidationError("Solo puede calificar equipos que ya han sido entregados.")

    # Validación de Unicidad: No poseer calificación previa
    if Calificacion.objects.filter(id_reparacion=reparacion).exists():
        raise ValidationError("Esta reparación ya fue calificada previamente.")

    return reparacion


# ==============================================================================
# CU-51: CONSULTAR CALIFICACIÓN DE SERVICIO (SELECTORS)
# ==============================================================================

def obtener_calificacion_reparacion(
    *,
    usuario_ejecutor: Usuario,
    id_reparacion: int
) -> Calificacion:
    """
    CU-51: Consultar Calificación de Servicio.
    Recupera el detalle de la valoración emitida para una reparación finalizada,
    aplicando reglas de seguridad horizontal y vertical según el rol del usuario autenticado:
    - Cliente: solo puede consultar calificaciones de sus propios dispositivos.
    - Técnico: solo puede consultar calificaciones de las reparaciones donde fue responsable/asignado.
    - Administrador: acceso total a cualquier calificación de servicio.
    - Otros roles / usuarios no autorizados: levanta PermissionDenied.

    Validación de existencia y precondiciones:
    - Si la reparación aún no posee una calificación emitida o no existe, levanta NotFound
      con el mensaje "Reparación pendiente de calificación por parte del cliente." (Paso 3 del CU).
    - Optimiza las consultas mediante select_related sobre la calificación, reparación, dispositivo y modelo.
    """
    from rest_framework.exceptions import PermissionDenied, NotFound
    from workshop_app.models import Calificacion, Reparacion

    # 1. Recuperar la calificación y los datos relacionales requeridos mediante select_related
    calificacion = Calificacion.objects.select_related(
        'id_reparacion',
        'id_reparacion__id_dispositivo',
        'id_reparacion__id_dispositivo__id_usuario',
        'id_reparacion__id_dispositivo__id_modelo',
        'id_reparacion__id_dispositivo__id_modelo__id_marca',
        'id_reparacion__id_dispositivo__id_modelo__id_tipo_dispositivo',
        'id_reparacion__id_usuario',
        'id_reparacion__id_usuario__perfilusuario'
    ).filter(id_reparacion_id=id_reparacion).first()

    rol = getattr(usuario_ejecutor, 'id_rol', None) or getattr(usuario_ejecutor, 'rol', None)
    codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
    ejecutor_id = getattr(usuario_ejecutor, 'id_usuario', None) or getattr(usuario_ejecutor, 'id', None)

    # 2. Paso 3 (Existencia): Si no existe calificación vinculada a esta reparación
    if not calificacion:
        # Validación preventiva de seguridad horizontal si la orden existe
        reparacion_existente = Reparacion.objects.select_related('id_dispositivo').filter(pk=id_reparacion).first()
        if reparacion_existente:
            if codigo_rol == 'CLIENTE' and reparacion_existente.id_dispositivo and reparacion_existente.id_dispositivo.id_usuario_id != ejecutor_id:
                raise PermissionDenied("Acceso Denegado: No posee permisos para consultar esta calificación.")
            if codigo_rol == 'TECNICO':
                tec_id = getattr(reparacion_existente, 'id_tecnico_asignado_id', None) or reparacion_existente.id_usuario_id
                if tec_id != ejecutor_id:
                    raise PermissionDenied("Acceso Denegado: No posee permisos para consultar calificaciones de reparaciones no asignadas.")
        raise NotFound("Reparación pendiente de calificación por parte del cliente.")

    # 3. Paso 2 (Seguridad Horizontal y Control de Acceso por Rol)
    reparacion = calificacion.id_reparacion

    if codigo_rol == 'CLIENTE':
        # El cliente debe ser el propietario del dispositivo
        propietario_id = (
            reparacion.id_dispositivo.id_usuario_id
            if reparacion.id_dispositivo
            else None
        )
        if propietario_id != ejecutor_id:
            raise PermissionDenied("Acceso Denegado: No posee permisos para consultar esta calificación.")

    elif codigo_rol == 'TECNICO':
        # El técnico debe ser el asignado a la reparación
        tecnico_id = getattr(reparacion, 'id_tecnico_asignado_id', None) or reparacion.id_usuario_id
        if tecnico_id != ejecutor_id:
            raise PermissionDenied("Acceso Denegado: No posee permisos para consultar calificaciones de reparaciones no asignadas.")

    elif codigo_rol == 'ADMIN':
        # Administrador posee acceso irrestricto
        pass

    else:
        raise PermissionDenied("Acceso Denegado: Su rol no cuenta con permisos para consultar calificaciones.")

    return calificacion




def obtener_reparaciones_esperando_insumo_ordenadas(id_producto: int) -> QuerySet[Reparacion]:
    """
    CU-55: Retorna las reparaciones en estado de espera de insumos/repuestos
    ('ESPERANDO_REPUESTOS' o 'ESPERANDO_INSUMOS') que requieran el insumo especificado,
    ordenadas por fecha de inicio ascendente (FIFO: las más antiguas primero).
    """
    estados_espera = [
        'ESPERANDO_REPUESTOS',
        'ESPERANDO_INSUMOS',
        'Esperando Repuestos',
        'Esperando Insumos',
    ]
    return (
        Reparacion.objects
        .filter(
            etapa__in=estados_espera,
            detalleinsumoreparacion__id_producto_id=id_producto
        )
        .prefetch_related('detalleinsumoreparacion_set')
        .order_by('fecha_inicio', 'id_reparacion')
        .distinct()
    )


# ==============================================================================
# CU-72 & CU-73: INTELIGENCIA DE NEGOCIOS Y REPORTES BI (SELECTORS)
# ==============================================================================

# Etapas que representan una reparación cerrada (Finalizado / Entregado)
ETAPAS_CIERRE_EXITOSO = [
    'FINALIZADO', 'FINALIZADA', 'ENTREGADO', 'ENTREGADA', 'Finalizado', 'Entregado'
]
# Etapas activas del taller (carga de trabajo en tiempo real)
ETAPAS_ACTIVAS_TALLER = [
    'ESPERANDO_DIAGNOSTICO', 'EN_REPARACION', 'ESPERANDO_REPUESTOS', 'ESPERANDO_REPUESTO',
    'Esperando Diagnóstico', 'En Reparación', 'Esperando Repuesto', 'Esperando Repuestos',
]


def calcular_reporte_conversion(
    *,
    fecha_inicio,
    fecha_fin,
    id_categoria: Optional[int] = None,
    id_medio_pago: Optional[int] = None
) -> dict:
    """
    CU-72: Generar Reporte de Conversión de Presupuestos (Embudo de Ventas).

    Nivel Macro (sin agrupar por categoría, la unidad es el Diagnóstico):
      - Volumen Presupuestado Total = COUNT(idDiagnostico)
      - Tasa de Aceptación Global (%) = COUNT(Aprobados) / COUNT(Total) * 100
      - Tasa de Fuga Global (%)       = COUNT(Rechazados) / COUNT(Total) * 100
      - Lucro Cesante ($)             = SUM(costo_diagnostico) donde la reparación fue Rechazada
    Nivel Micro (agrupado por Categoría):
      - Tasa de Rechazo = COUNT(Rechazados cat. X) / COUNT(Total cat. X) * 100
      - ESTRICTAMENTE COUNT: se prohíbe SUM de montos para no duplicar importes por la
        relación N:M Reparación-Categoría.
    Filtros opcionales: id_categoria e id_medio_pago (pagos de la venta asociada).
    """
    from decimal import Decimal
    from django.db.models import Exists, OuterRef
    from rest_framework.exceptions import ValidationError
    from workshop_app.models import Diagnostico, BitacoraReparacion

    diagnosticos_qs = Diagnostico.objects.filter(
        fecha_diagnostico__gte=fecha_inicio,
        fecha_diagnostico__lte=fecha_fin
    )

    if id_categoria is not None:
        diagnosticos_qs = diagnosticos_qs.filter(id_reparacion__categorias__id_categoria=id_categoria)

    if id_medio_pago is not None:
        diagnosticos_qs = diagnosticos_qs.filter(id_reparacion__id_venta__pago__medio_pago_id=id_medio_pago)

    diagnosticos_qs = (
        diagnosticos_qs
        .select_related('id_reparacion')
        .prefetch_related('id_reparacion__categorias')
        .annotate(
            _tiene_rechazo=Exists(
                BitacoraReparacion.objects.filter(
                    id_reparacion_id=OuterRef('id_reparacion_id'), estado_alcanzado=8
                )
            ),
            _tiene_aprobacion=Exists(
                BitacoraReparacion.objects.filter(
                    id_reparacion_id=OuterRef('id_reparacion_id'), estado_alcanzado=5
                )
            ),
        )
        .distinct()
    )

    diagnosticos = list(diagnosticos_qs)

    # Excepción Paso 5: Universo vacío
    if not diagnosticos:
        raise ValidationError("No se ha emitido ningún presupuesto en el periodo temporal solicitado")

    etapas_aprobadas = {
        'EN_REPARACION', 'FINALIZADO', 'FINALIZADA', 'ENTREGADO', 'ENTREGADA',
        'ESPERANDO_REPUESTOS', 'ESPERANDO_REPUESTO', 'ESPERANDO_INSUMOS', 'REPARADO',
        'LISTO_PARA_ENTREGA', 'LISTO_PARA_RETIRAR'
    }

    def _clasificar(diag) -> str:
        etapa_norm = (diag.id_reparacion.etapa or '').strip().upper().replace(' ', '_')
        if etapa_norm in ('CANCELADO', 'CANCELADA', 'RECHAZADO', 'RECHAZADA') or diag._tiene_rechazo:
            return 'RECHAZADO'
        if etapa_norm in etapas_aprobadas or etapa_norm == 'APROBADO' or diag._tiene_aprobacion:
            return 'ACEPTADO'
        return 'PENDIENTE'

    cero = Decimal('0.00')
    total_presupuestos = len(diagnosticos)
    total_presupuestado = cero
    monto_aceptado = cero
    lucro_cesante = cero
    monto_pendiente = cero
    conteo = {'ACEPTADO': 0, 'RECHAZADO': 0, 'PENDIENTE': 0}
    cat_metricas = {}

    for diag in diagnosticos:
        estado = _clasificar(diag)
        monto = Decimal(str(diag.costo_diagnostico or 0))
        conteo[estado] += 1
        total_presupuestado += monto
        if estado == 'ACEPTADO':
            monto_aceptado += monto
        elif estado == 'RECHAZADO':
            lucro_cesante += monto
        else:
            monto_pendiente += monto

        # Nivel Micro: únicamente conteos (nunca montos) por categoría
        cats = list(diag.id_reparacion.categorias.all())
        if id_categoria is not None:
            cats = [c for c in cats if c.id_categoria == id_categoria]
        grupos = [(c.id_categoria, c.nombre) for c in cats] or [(None, "General / Sin Categoría")]
        for cat_id, cat_nombre in grupos:
            m = cat_metricas.setdefault(cat_id, {
                "id_categoria": cat_id,
                "nombre_categoria": cat_nombre,
                "total_presupuestos": 0,
                "total_aceptados": 0,
                "total_rechazados": 0,
            })
            m["total_presupuestos"] += 1
            if estado == 'ACEPTADO':
                m["total_aceptados"] += 1
            elif estado == 'RECHAZADO':
                m["total_rechazados"] += 1

    cien = Decimal('100.00')
    tasa_conversion = round(Decimal(conteo['ACEPTADO']) / Decimal(total_presupuestos) * cien, 2)
    tasa_fuga = round(Decimal(conteo['RECHAZADO']) / Decimal(total_presupuestos) * cien, 2)

    micro_list = []
    for c in cat_metricas.values():
        tot_cat = c["total_presupuestos"]
        micro_list.append({
            **c,
            "tasa_rechazo": round(Decimal(c["total_rechazados"]) / Decimal(tot_cat) * cien, 2)
        })

    return {
        "periodo": {"fecha_inicio": fecha_inicio, "fecha_fin": fecha_fin},
        "macro": {
            "total_presupuestos": total_presupuestos,
            "total_presupuestado": total_presupuestado,
            "total_aceptados": conteo['ACEPTADO'],
            "monto_aceptado": monto_aceptado,
            "tasa_conversion": tasa_conversion,
            "total_rechazados": conteo['RECHAZADO'],
            "lucro_cesante": lucro_cesante,
            "tasa_fuga": tasa_fuga,
            "total_pendientes": conteo['PENDIENTE'],
            "monto_pendiente": monto_pendiente
        },
        "micro": micro_list
    }


def calcular_reporte_eficiencia(
    *,
    fecha_inicio,
    fecha_fin,
    id_categoria: Optional[int] = None,
    id_tipo_dispositivo: Optional[int] = None,
    id_medio_pago: Optional[int] = None
) -> list[dict]:
    """
    CU-73: Demanda, Facturación y Eficiencia Temporal por Categoría.
      - Volumen de Demanda          = COUNT(idReparacion) por categoría
      - Facturación Bruta ($)       = SUM(costo_diagnostico) de reparaciones Finalizadas/Entregadas
      - Tiempo Promedio Resolución  = AVG(fecha_entrega - fecha_inicio) por categoría
        (solo promedia reparaciones con ambas fechas; los nulos no sesgan el AVG)
    Filtros: rango de fechas (obligatorio), id_categoria, id_tipo_dispositivo, id_medio_pago.
    """
    from decimal import Decimal
    from rest_framework.exceptions import ValidationError
    from workshop_app.models import Reparacion

    reparaciones_qs = Reparacion.objects.filter(
        fecha_inicio__gte=fecha_inicio,
        fecha_inicio__lte=fecha_fin,
        etapa__in=ETAPAS_CIERRE_EXITOSO
    )

    if id_categoria is not None:
        reparaciones_qs = reparaciones_qs.filter(categorias__id_categoria=id_categoria)

    if id_tipo_dispositivo is not None:
        reparaciones_qs = reparaciones_qs.filter(
            id_dispositivo__id_modelo__id_tipo_dispositivo_id=id_tipo_dispositivo
        )

    if id_medio_pago is not None:
        reparaciones_qs = reparaciones_qs.filter(id_venta__pago__medio_pago_id=id_medio_pago)

    reparaciones = list(
        reparaciones_qs
        .select_related('id_dispositivo', 'id_dispositivo__id_modelo')
        .prefetch_related('categorias', 'diagnostico_set')
        .distinct()
    )

    # Excepción Paso 5: Sin operaciones finalizadas en el periodo o filtros
    if not reparaciones:
        raise ValidationError("No existen reparaciones finalizadas en el periodo temporal o filtros indicados")

    cat_stats = {}
    for rep in reparaciones:
        facturado = sum(
            (Decimal(str(d.costo_diagnostico or 0)) for d in rep.diagnostico_set.all()),
            Decimal('0.00')
        )

        delta_dias = None
        if rep.fecha_entrega and rep.fecha_inicio:
            delta_dias = max((rep.fecha_entrega - rep.fecha_inicio).days, 0)

        cats = list(rep.categorias.all())
        if id_categoria is not None:
            cats = [c for c in cats if c.id_categoria == id_categoria]
        grupos = [(c.id_categoria, c.nombre) for c in cats] or [(None, "General / Sin Categoría")]

        for cat_id, cat_nombre in grupos:
            s = cat_stats.setdefault(cat_id, {
                "id_categoria": cat_id,
                "nombre_categoria": cat_nombre,
                "volumen_reparaciones": 0,
                "facturacion_bruta": Decimal('0.00'),
                "deltas_dias": []
            })
            s["volumen_reparaciones"] += 1
            s["facturacion_bruta"] += facturado
            if delta_dias is not None:
                s["deltas_dias"].append(delta_dias)

    resultado = []
    for c in cat_stats.values():
        deltas = c["deltas_dias"]
        prom_dias = round(sum(deltas) / len(deltas), 1) if deltas else 0.0
        resultado.append({
            "id_categoria": c["id_categoria"],
            "nombre_categoria": c["nombre_categoria"],
            "volumen_reparaciones": c["volumen_reparaciones"],
            # La facturación bruta es SUM(costo_diagnostico); se conservan los campos
            # históricos del contrato: mano de obra = bruta e insumos = 0 (no se suman).
            "facturacion_mano_obra": c["facturacion_bruta"],
            "facturacion_insumos": Decimal('0.00'),
            "facturacion_bruta": c["facturacion_bruta"],
            "tiempo_promedio_dias": prom_dias,
            "tiempo_promedio_horas": round(prom_dias * 24.0, 1)
        })

    # Ordenar por volumen de mayor a menor
    resultado.sort(key=lambda x: x["volumen_reparaciones"], reverse=True)
    return resultado


# CU-74: GENERAR REPORTE DE PRODUCTIVIDAD Y CARGA DE TRABAJO TÉCNICA
# ==============================================================================

def calcular_reporte_productividad(
    *,
    fecha_inicio,
    fecha_fin,
    id_tecnico: Optional[int] = None
) -> list[dict]:
    """
    CU-74: Productividad y Carga de Trabajo por Técnico.
    A. Análisis Histórico (afectado por el rango de fechas):
       - Reparaciones Cerradas   = COUNT(idReparacion) Finalizado/Entregado por técnico
       - Monto Facturado ($)     = SUM(costo_diagnostico) de las órdenes cerradas
       - Velocidad de Resolución = AVG(fecha_entrega - fecha_inicio) (nulos excluidos)
       - Nivel de Actividad      = COUNT(Bitácora) por usuario
    B. Tiempo Real (ignora fechas):
       - Carga Actual = COUNT(idReparacion) en etapas activas
         (Esperando Diagnóstico, En Reparación, Esperando Repuesto) por técnico.
    """
    from decimal import Decimal
    from rest_framework.exceptions import ValidationError
    from users_app.models import Usuario
    from workshop_app.models import Reparacion, BitacoraReparacion

    tecnicos_qs = Usuario.objects.filter(
        id_rol__codigo='TECNICO',
        is_active=True
    ).select_related('id_rol', 'perfilusuario')

    if id_tecnico is not None:
        tecnicos_qs = tecnicos_qs.filter(id_usuario=id_tecnico)
        if not tecnicos_qs.exists():
            raise ValidationError("El técnico especificado no existe o no se encuentra activo.")

    resultado = []
    for tec in tecnicos_qs:
        perfil = getattr(tec, 'perfilusuario', None)
        nombre_completo = f"{getattr(perfil, 'nombre', '')} {getattr(perfil, 'apellido', '')}".strip() if perfil else tec.email
        if not nombre_completo:
            nombre_completo = tec.email

        # B. Carga de Trabajo Actual en Tiempo Real (inmune a fechas)
        carga_tiempo_real = Reparacion.objects.filter(
            id_usuario=tec,
            etapa__in=ETAPAS_ACTIVAS_TALLER
        ).count()

        # A. Análisis Histórico
        reps_cerradas = list(
            Reparacion.objects.filter(
                id_usuario=tec,
                fecha_inicio__gte=fecha_inicio,
                fecha_inicio__lte=fecha_fin,
                etapa__in=ETAPAS_CIERRE_EXITOSO
            ).prefetch_related('diagnostico_set')
        )
        volumen_finalizadas = len(reps_cerradas)

        facturacion_mo = Decimal('0.00')
        deltas_dias = []
        for rep in reps_cerradas:
            for d in rep.diagnostico_set.all():
                facturacion_mo += Decimal(str(d.costo_diagnostico or 0))
            if rep.fecha_entrega and rep.fecha_inicio:
                deltas_dias.append(max((rep.fecha_entrega - rep.fecha_inicio).days, 0))

        prom_dias = round(sum(deltas_dias) / len(deltas_dias), 1) if deltas_dias else 0.0
        prom_horas = round(prom_dias * 24.0, 1)

        # Nivel de Actividad (interacciones en bitácora dentro del periodo)
        registros_bitacora = BitacoraReparacion.objects.filter(
            id_usuario=tec,
            id_reparacion__fecha_inicio__gte=fecha_inicio,
            id_reparacion__fecha_inicio__lte=fecha_fin
        ).count()

        resultado.append({
            "id_tecnico": tec.id_usuario,
            "nombre_completo": nombre_completo,
            "email": tec.email,
            "carga_tiempo_real": carga_tiempo_real,
            "volumen_finalizadas": volumen_finalizadas,
            "facturacion_mano_obra": facturacion_mo,
            "velocidad_media_dias": prom_dias,
            "velocidad_media_horas": prom_horas,
            "registros_bitacora": registros_bitacora
        })

    # Ordenar por carga en tiempo real descendente y luego por volumen finalizadas descendente
    resultado.sort(key=lambda x: (x["carga_tiempo_real"], x["volumen_finalizadas"]), reverse=True)
    return resultado


# CU-76: GENERAR REPORTE DE SATISFACCIÓN Y CALIDAD
# ==============================================================================

def calcular_reporte_satisfaccion(
    *,
    fecha_inicio,
    fecha_fin,
    id_tecnico: Optional[int] = None,
    id_categoria: Optional[int] = None,
    rango_estrellas_min: Optional[int] = None,
    rango_estrellas_max: Optional[int] = None
) -> dict:
    """
    CU-76: Índice de Satisfacción y Calidad Post-Reparación (CSAT).
      - CSAT General        = AVG(puntuacion) del universo filtrado
      - Volumen de Reseñas  = COUNT(idCalificacion)
      - CSAT por Técnico    = AVG(puntuacion) agrupado por técnico asignado
      - CSAT por Categoría  = AVG(puntuacion) agrupado por categoría
      - Matriz de Calidad   = AVG(puntuacion) agrupado por Técnico x Categoría
    Filtros: fechas (obligatorio), id_tecnico, rango de estrellas e id_categoria.
    Excepción Paso 5: sin calificaciones bajo los parámetros -> ValidationError.
    """
    from rest_framework.exceptions import ValidationError
    from workshop_app.models import Calificacion

    calificaciones_qs = Calificacion.objects.filter(
        fecha__gte=fecha_inicio,
        fecha__lte=fecha_fin
    )

    if id_tecnico is not None:
        calificaciones_qs = calificaciones_qs.filter(id_reparacion__id_usuario_id=id_tecnico)

    if id_categoria is not None:
        calificaciones_qs = calificaciones_qs.filter(id_reparacion__categorias__id_categoria=id_categoria)

    if rango_estrellas_min is not None:
        calificaciones_qs = calificaciones_qs.filter(puntuacion__gte=rango_estrellas_min)

    if rango_estrellas_max is not None:
        calificaciones_qs = calificaciones_qs.filter(puntuacion__lte=rango_estrellas_max)

    calificaciones_qs = (
        calificaciones_qs
        .select_related(
            'id_reparacion',
            'id_reparacion__id_usuario',
            'id_reparacion__id_usuario__perfilusuario',
            'id_reparacion__id_dispositivo',
            'id_reparacion__id_dispositivo__id_usuario',
            'id_reparacion__id_dispositivo__id_usuario__perfilusuario'
        )
        .prefetch_related('id_reparacion__categorias')
        .order_by('-fecha', '-id_calificacion')
        .distinct()
    )

    calificaciones = list(calificaciones_qs)

    if not calificaciones:
        raise ValidationError("Bajo los parámetros establecidos no existen calificaciones válidas para analizar")

    total_resenas = len(calificaciones)
    csat_global = round(sum(c.puntuacion for c in calificaciones) / total_resenas, 2)

    resenas_criticas_total = sum(1 for c in calificaciones if c.puntuacion <= 3)
    porcentaje_criticas = round((resenas_criticas_total / total_resenas) * 100.0, 2)

    tecnicos_map = {}
    categorias_map = {}
    matriz_map = {}
    comentarios = []

    for c in calificaciones:
        rep = c.id_reparacion
        tec = rep.id_usuario if rep else None
        tec_id = tec.id_usuario if tec else None

        if tec:
            perfil_tec = getattr(tec, 'perfilusuario', None)
            nom_tec = f"{getattr(perfil_tec, 'nombre', '')} {getattr(perfil_tec, 'apellido', '')}".strip() if perfil_tec else tec.email
            if not nom_tec:
                nom_tec = tec.email
        else:
            nom_tec = "Sin Técnico Asignado"

        tecnicos_map.setdefault(tec_id, {
            "id_tecnico": tec_id, "nombre_completo": nom_tec, "puntuaciones": []
        })["puntuaciones"].append(c.puntuacion)

        # Categorías intervenidas (si se filtró por categoría se agrupa solo esa)
        cats = list(rep.categorias.all()) if rep else []
        if id_categoria is not None:
            cats = [cat for cat in cats if cat.id_categoria == id_categoria]
        grupos = [(cat.id_categoria, cat.nombre) for cat in cats] or [(None, "General / Sin Categoría")]

        for cat_id, cat_nombre in grupos:
            categorias_map.setdefault(cat_id, {
                "id_categoria": cat_id, "nombre_categoria": cat_nombre, "puntuaciones": []
            })["puntuaciones"].append(c.puntuacion)

            # Matriz de Calidad: cruce Técnico x Categoría
            matriz_map.setdefault((tec_id, cat_id), {
                "id_tecnico": tec_id,
                "nombre_tecnico": nom_tec,
                "id_categoria": cat_id,
                "nombre_categoria": cat_nombre,
                "puntuaciones": []
            })["puntuaciones"].append(c.puntuacion)

        # Nombre cliente para el comentario
        cli = getattr(rep.id_dispositivo, 'id_usuario', None) if rep and rep.id_dispositivo else None
        if cli:
            perfil_cli = getattr(cli, 'perfilusuario', None)
            nom_cli = f"{getattr(perfil_cli, 'nombre', '')} {getattr(perfil_cli, 'apellido', '')}".strip() if perfil_cli else cli.email
            if not nom_cli:
                nom_cli = cli.email
        else:
            nom_cli = "Cliente Anónimo"

        comentarios.append({
            "id_calificacion": c.id_calificacion,
            "puntuacion": c.puntuacion,
            "comentario": c.comentario or "",
            "fecha": c.fecha,
            "cliente_nombre": nom_cli,
            "tecnico_nombre": nom_tec,
            "categorias": [n for _, n in grupos]
        })

    def _consolidar(mapa, extra_keys):
        salida = []
        for item in mapa.values():
            puntos = item["puntuaciones"]
            fila = {k: item[k] for k in extra_keys}
            fila["total_resenas"] = len(puntos)
            fila["promedio_estrellas"] = round(sum(puntos) / len(puntos), 2)
            salida.append(fila)
        salida.sort(key=lambda x: x["promedio_estrellas"], reverse=True)
        return salida

    return {
        "periodo": {"fecha_inicio": fecha_inicio, "fecha_fin": fecha_fin},
        "total_resenas": total_resenas,
        "csat_global": csat_global,
        "resenas_criticas_total": resenas_criticas_total,
        "porcentaje_criticas": porcentaje_criticas,
        "promedio_por_tecnico": _consolidar(tecnicos_map, ["id_tecnico", "nombre_completo"]),
        "promedio_por_categoria": _consolidar(categorias_map, ["id_categoria", "nombre_categoria"]),
        "matriz_calidad": _consolidar(
            matriz_map, ["id_tecnico", "nombre_tecnico", "id_categoria", "nombre_categoria"]
        ),
        "comentarios": comentarios
    }

