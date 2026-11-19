from typing import Optional, Any, List, Dict
from datetime import date
from decimal import Decimal
from django.db.models import QuerySet, Q
from django.utils import timezone
from django.core.exceptions import ObjectDoesNotExist
from rest_framework.exceptions import PermissionDenied, ValidationError
from users_app.models import Usuario
from catalog_app.models import Producto
from purchases_app.models import (
    Proveedor,
    SolicitudCotizacion,
    SolicitudCotizacionProducto,
    InvitacionCotizar,
    Cotizacion,
    CotizacionProducto,
    OrdenCompra,
    DetalleOrdenCompra,
    RegistroCompra
)


def _verificar_permiso_admin(usuario: Usuario):
    """Verifica que el usuario posea rol estricto de Administrador."""
    rol = getattr(usuario, 'id_rol', None) or getattr(usuario, 'rol', None)
    codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
    nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
    if codigo_rol != 'ADMIN' and nombre_rol != 'administrador':
        raise PermissionDenied("Se requieren privilegios de Administrador para acceder al módulo de compras y abastecimiento.")


# ==============================================================================
# CU-36: FILTRAR PROVEEDORES (SELECTORS)
# ==============================================================================

def filtrar_proveedores(
    *,
    usuario_ejecutor: Usuario,
    filtros: dict
) -> QuerySet[Proveedor]:
    """
    CU-36: Filtrar Proveedores.
    Permite al Administrador localizar y auditar el padrón general de proveedores
    mediante coincidencias exactas o parciales por Nombre comercial / Razón Social o CUIT,
    además de filtros categóricos como modalidad de envío y nivel comercial.
    """
    _verificar_permiso_admin(usuario_ejecutor)

    qs = Proveedor.objects.select_related(
        'id_direccion',
        'id_direccion__id_ciudad',
        'id_direccion__id_ciudad__id_provincia',
        'id_direccion__id_ciudad__id_provincia__id_pais'
    ).order_by('nombre_proveedor')

    texto_busqueda = str(filtros.get('buscar') or filtros.get('texto_busqueda') or '').strip()
    if texto_busqueda:
        qs = qs.filter(
            Q(nombre_proveedor__icontains=texto_busqueda) |
            Q(cuit_prov__icontains=texto_busqueda) |
            Q(correo__icontains=texto_busqueda)
        )

    cuit_exacto = str(filtros.get('cuit_prov') or '').strip()
    if cuit_exacto:
        solo_digitos = cuit_exacto.replace('-', '').replace(' ', '')
        if len(solo_digitos) == 11 and solo_digitos.isdigit():
            cuit_con_guiones = f"{solo_digitos[:2]}-{solo_digitos[2:10]}-{solo_digitos[10]}"
            qs = qs.filter(
                Q(cuit_prov__iexact=cuit_exacto) |
                Q(cuit_prov__iexact=solo_digitos) |
                Q(cuit_prov__iexact=cuit_con_guiones) |
                Q(cuit_prov__icontains=cuit_exacto)
            )
        else:
            qs = qs.filter(cuit_prov__icontains=cuit_exacto)

    estado = filtros.get('estado')
    if estado is not None:
        qs = qs.filter(estado=bool(estado))

    ofrece_envio = filtros.get('ofrece_envio')
    if ofrece_envio is not None:
        qs = qs.filter(ofrece_envio=bool(ofrece_envio))

    nivel = str(filtros.get('nivel') or '').strip()
    if nivel:
        qs = qs.filter(nivel__iexact=nivel)

    return qs


# ==============================================================================
# CU-37: FILTRAR ÓRDENES DE COMPRA (SELECTORS)
# ==============================================================================

def filtrar_ordenes_compra(
    *,
    usuario_ejecutor: Usuario,
    filtros: dict
) -> QuerySet[OrdenCompra]:
    """
    CU-37: Filtrar Órdenes de Compra.
    Permite auditar y localizar los documentos de reabastecimiento generados por el negocio.
    Criterios: ID de orden, estado, rango de fechas de emisión, modalidad de entrega y proveedor.
    """
    _verificar_permiso_admin(usuario_ejecutor)

    fecha_desde = filtros.get('fecha_desde')
    fecha_hasta = filtros.get('fecha_hasta')
    if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
        raise ValidationError("La fecha inicial (fecha_desde) no puede ser posterior a la fecha final (fecha_hasta).")

    qs = OrdenCompra.objects.select_related(
        'cuit_prov',
        'cuit_prov__id_direccion',
        'cuit_prov__id_direccion__id_ciudad'
    ).prefetch_related(
        'detalles__id_producto',
        'detalles__id_producto__id_categoria'
    ).order_by('-fecha_emision', '-id_orden')

    id_orden = filtros.get('id_orden')
    if id_orden:
        qs = qs.filter(id_orden=id_orden)

    estado_orden = filtros.get('estado_orden')
    if estado_orden is not None:
        qs = qs.filter(estado_orden=estado_orden)

    cuit_prov = str(filtros.get('cuit_prov') or filtros.get('proveedor') or '').strip()
    if cuit_prov:
        qs = qs.filter(
            Q(cuit_prov__cuit_prov__icontains=cuit_prov) |
            Q(cuit_prov__nombre_proveedor__icontains=cuit_prov)
        )

    tipo_entrega = filtros.get('tipo_entrega')
    if tipo_entrega is not None:
        qs = qs.filter(tipo_entrega=tipo_entrega)

    sol_tec = filtros.get('sol_tec')
    if sol_tec is not None:
        qs = qs.filter(sol_tec=bool(sol_tec))

    if fecha_desde:
        qs = qs.filter(fecha_emision__gte=fecha_desde)
    if fecha_hasta:
        qs = qs.filter(fecha_emision__lte=fecha_hasta)

    return qs.distinct()


# ==============================================================================
# CU-41: FILTRAR SOLICITUD DE COTIZACIÓN (SELECTORS)
# ==============================================================================

def filtrar_solicitudes_cotizacion(
    *,
    usuario_ejecutor: Usuario,
    filtros: dict
) -> QuerySet[SolicitudCotizacion]:
    """
    CU-41: Filtrar Solicitud de Cotización.
    Permite consultar y segmentar las solicitudes de cotización emitidas por el negocio.
    Criterios: ID de solicitud, estado de solicitud, rango de fechas y producto incluido.
    """
    _verificar_permiso_admin(usuario_ejecutor)

    fecha_desde = filtros.get('fecha_desde')
    fecha_hasta = filtros.get('fecha_hasta')
    if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
        raise ValidationError("La fecha inicial (fecha_desde) no puede ser posterior a la fecha final (fecha_hasta).")

    qs = SolicitudCotizacion.objects.prefetch_related(
        'solicitudcotizacionproducto_set__id_producto',
        'solicitudcotizacionproducto_set__id_producto__id_categoria',
        'invitacioncotizar_set__cuit_prov',
        'invitacioncotizar_set__cotizacion_set'
    ).order_by('-fecha_emision', '-id_solicitud')

    id_solicitud = filtros.get('id_solicitud')
    if id_solicitud:
        qs = qs.filter(id_solicitud=id_solicitud)

    estado_solicitud = filtros.get('estado_solicitud')
    if estado_solicitud is not None:
        qs = qs.filter(estado_solicitud=estado_solicitud)

    if fecha_desde:
        qs = qs.filter(fecha_emision__gte=fecha_desde)
    if fecha_hasta:
        qs = qs.filter(fecha_emision__lte=fecha_hasta)

    id_producto = filtros.get('id_producto')
    if id_producto:
        qs = qs.filter(solicitudcotizacionproducto__id_producto_id=id_producto)

    buscar_producto = str(filtros.get('buscar_producto') or '').strip()
    if buscar_producto:
        qs = qs.filter(solicitudcotizacionproducto__id_producto__nombre__icontains=buscar_producto)

    return qs.distinct()


# ==============================================================================
# CU-60: FILTRAR COTIZACIONES (SELECTORS)
# ==============================================================================

def filtrar_cotizaciones(
    *,
    usuario_ejecutor: Usuario,
    filtros: dict
) -> QuerySet[Cotizacion]:
    """
    CU-60: Filtrar Cotizaciones.
    Permite al Administrador segmentar las propuestas económicas recibidas de los proveedores.
    Criterios: ID de cotización, ID de solicitud asociada, proveedor emisor, estado y vencimiento.
    """
    _verificar_permiso_admin(usuario_ejecutor)

    fecha_validez_desde = filtros.get('fecha_validez_desde')
    fecha_validez_hasta = filtros.get('fecha_validez_hasta')
    if fecha_validez_desde and fecha_validez_hasta and fecha_validez_desde > fecha_validez_hasta:
        raise ValidationError("El rango temporal de validez es inconsistente (desde mayor a hasta).")

    qs = Cotizacion.objects.select_related(
        'id_invitacion',
        'id_invitacion__id_solicitud',
        'id_invitacion__cuit_prov',
        'id_invitacion__cuit_prov__id_direccion'
    ).prefetch_related(
        'cotizacionproducto_set__id_producto',
        'cotizacionproducto_set__id_producto__id_categoria',
        'id_invitacion__id_solicitud__solicitudcotizacionproducto_set'
    ).order_by('-id_cotizacion')

    id_cotizacion = filtros.get('id_cotizacion')
    if id_cotizacion:
        qs = qs.filter(id_cotizacion=id_cotizacion)

    id_solicitud = filtros.get('id_solicitud')
    if id_solicitud:
        qs = qs.filter(id_invitacion__id_solicitud_id=id_solicitud)

    cuit_prov = str(filtros.get('cuit_prov') or filtros.get('proveedor') or '').strip()
    if cuit_prov:
        qs = qs.filter(
            Q(id_invitacion__cuit_prov__cuit_prov__icontains=cuit_prov) |
            Q(id_invitacion__cuit_prov__nombre_proveedor__icontains=cuit_prov)
        )

    estado_cotizacion = filtros.get('estado_cotizacion')
    if estado_cotizacion is not None:
        qs = qs.filter(estado_cotizacion=estado_cotizacion)

    if fecha_validez_desde:
        qs = qs.filter(fecha_validez__gte=fecha_validez_desde)
    if fecha_validez_hasta:
        qs = qs.filter(fecha_validez__lte=fecha_validez_hasta)

    id_producto = filtros.get('id_producto')
    if id_producto:
        qs = qs.filter(cotizacionproducto__id_producto_id=id_producto)

    buscar_producto = str(filtros.get('buscar_producto') or '').strip()
    if buscar_producto:
        qs = qs.filter(cotizacionproducto__id_producto__nombre__icontains=buscar_producto)

    return qs.distinct()


# ==============================================================================
# CU-24 / CU-28: SELECTORS DE PROVEEDORES (LECTURA Y UNICIDAD)
# ==============================================================================

def obtener_proveedor_completo(id_proveedor: Any) -> Proveedor:
    """
    CU-24 / CU-28: Recupera un proveedor específico por su CUIT (o identificador fiscal)
    utilizando select_related obligatorio sobre la dirección y su jerarquía geográfica.
    Si no existe, levanta ObjectDoesNotExist.
    """
    from django.core.exceptions import ObjectDoesNotExist

    if not id_proveedor:
        raise ObjectDoesNotExist("Debe especificar un identificador de proveedor válido.")

    ident_str = str(id_proveedor).strip()
    ident_limpio = ident_str.replace('-', '')

    proveedor = Proveedor.objects.select_related(
        'id_direccion',
        'id_direccion__id_ciudad',
        'id_direccion__id_ciudad__id_provincia',
        'id_direccion__id_ciudad__id_provincia__id_pais'
    ).filter(
        Q(cuit_prov__iexact=ident_str) | Q(cuit_prov__iexact=ident_limpio)
    ).first()

    if not proveedor:
        raise ObjectDoesNotExist(f"No se encontró el proveedor con identificador '{id_proveedor}'.")

    return proveedor


def verificar_unicidad_proveedor(
    *,
    cuit: str,
    correo: Optional[str] = None,
    id_excluido: Optional[Any] = None
) -> None:
    """
    CU-24 / CU-28: Verifica que el CUIT o correo electrónico no pertenezcan a otro proveedor.
    Si encuentra coincidencias duplicadas, levanta ValidationError.
    """
    cuit_limpio = (cuit or '').strip()
    cuit_sin_guiones = cuit_limpio.replace('-', '')
    correo_limpio = (correo or '').strip().lower() if correo else None

    qs = Proveedor.objects.all()
    if id_excluido:
        excluido_str = str(id_excluido).strip()
        excluido_limpio = excluido_str.replace('-', '')
        qs = qs.exclude(Q(cuit_prov__iexact=excluido_str) | Q(cuit_prov__iexact=excluido_limpio))

    # Verificar CUIT duplicado
    filtro_cuit = Q(cuit_prov__iexact=cuit_limpio) | Q(cuit_prov__iexact=cuit_sin_guiones)
    proveedor_cuit = qs.filter(filtro_cuit).first()
    if proveedor_cuit:
        raise ValidationError(f"El CUIT '{cuit_limpio}' ya se encuentra registrado en el sistema a nombre de '{proveedor_cuit.nombre_proveedor}'.")

    # Verificar Correo duplicado
    if correo_limpio:
        proveedor_correo = qs.filter(correo__iexact=correo_limpio).first()
        if proveedor_correo:
            raise ValidationError(f"El correo electrónico '{correo_limpio}' ya se encuentra registrado en el sistema a nombre de '{proveedor_correo.nombre_proveedor}'.")


# ==============================================================================
# CU-14 / CU-15: SELECTORS DE SOLICITUD DE COTIZACIÓN
# ==============================================================================

def validar_proveedores_activos(ids_proveedores: list) -> QuerySet[Proveedor]:
    """
    CU-14: Valida que los proveedores seleccionados existan en la base de datos
    y que todos se encuentren activos (estado == True).
    Si la cantidad encontrada no coincide con la solicitada, levanta ValidationError.
    Si alguno se encuentra inactivo, levanta ValidationError.
    Retorna el QuerySet de proveedores válidos.
    """
    if not ids_proveedores:
        raise ValidationError("Debe seleccionar al menos un proveedor destinatario.")

    # Normalización a identificadores únicos en formato string
    ids_limpios = [str(x).strip() for x in ids_proveedores if x is not None and str(x).strip()]
    ids_unicos = list(dict.fromkeys(ids_limpios))

    cuits_variantes = set(ids_unicos) | {x.replace('-', '') for x in ids_unicos}
    proveedores = Proveedor.objects.filter(cuit_prov__in=cuits_variantes)

    if proveedores.count() < len(ids_unicos):
        raise ValidationError("Uno o más proveedores no existen.")

    for prov in proveedores:
        if not prov.estado:
            raise ValidationError("Uno o más proveedores seleccionados se encuentran inactivos.")

    return proveedores


def listar_solicitudes_cotizacion() -> QuerySet[SolicitudCotizacion]:
    """
    CU-15: Retorna todas las solicitudes de cotización ordenadas por fecha
    de emisión descendente, optimizadas con prefetch_related para evitar N+1 queries.
    """
    return SolicitudCotizacion.objects.prefetch_related(
        'solicitudcotizacionproducto_set__id_producto',
        'solicitudcotizacionproducto_set__id_producto__id_categoria',
        'invitacioncotizar_set__cuit_prov',
        'invitacioncotizar_set__cotizacion_set'
    ).order_by('-fecha_emision', '-id_solicitud')


def obtener_detalle_solicitud(id_solicitud: int) -> SolicitudCotizacion:
    """
    CU-15: Recupera la vista de detalle de una Solicitud de Cotización específica
    cargando mediante prefetch_related obligatorio los productos solicitados
    y las invitaciones/cotizaciones con sus proveedores correspondientes.
    Si la solicitud no existe, levanta ObjectDoesNotExist.
    """
    from django.core.exceptions import ObjectDoesNotExist

    solicitud = SolicitudCotizacion.objects.prefetch_related(
        'solicitudcotizacionproducto_set__id_producto',
        'solicitudcotizacionproducto_set__id_producto__id_categoria',
        'invitacioncotizar_set__cuit_prov',
        'invitacioncotizar_set__cuit_prov__id_direccion',
        'invitacioncotizar_set__cotizacion_set'
    ).filter(id_solicitud=id_solicitud).first()

    if not solicitud:
        raise ObjectDoesNotExist(f"No se encontró la solicitud de cotización con identificador #{id_solicitud}.")

    return solicitud


def obtener_solicitud_en_borrador(id_solicitud: int) -> SolicitudCotizacion:
    """
    CU-16 / CU-17: Recupera y pre-valida una Solicitud de Cotización.
    Verifica que la solicitud exista y se encuentre estrictamente en estado 'Borrador'.
    Si no existe, levanta ObjectDoesNotExist.
    Si ya superó la fase preparatoria (ej. Enviada a Proveedores, Cotizada, Rechazada),
    levanta ValidationError bloqueando la operación.
    """
    from django.core.exceptions import ObjectDoesNotExist

    solicitud = SolicitudCotizacion.objects.prefetch_related(
        'solicitudcotizacionproducto_set__id_producto',
        'invitacioncotizar_set__cuit_prov'
    ).filter(id_solicitud=id_solicitud).first()

    if not solicitud:
        raise ObjectDoesNotExist(f"No se encontró la solicitud de cotización con identificador #{id_solicitud}.")

    if solicitud.estado_solicitud != SolicitudCotizacion.ESTADO_BORRADOR:
        raise ValidationError("Los documentos que ya han interactuado con agentes externos no pueden ser alterados ni eliminados (la solicitud ya superó la fase de borrador).")

    return solicitud


# ==============================================================================
# CU-25: RESPONDER SOLICITUD DE COTIZACIÓN (SELECTORS)
# ==============================================================================

def obtener_invitacion_por_token(token_acceso: str) -> InvitacionCotizar:
    """
    CU-25: Valida el acceso externo del proveedor mediante su token criptográfico unívoco.
    Verifica que el token exista, no haya sido invalidado, y que la Solicitud de Cotización
    maestra se encuentre abierta y vigente (estado == 'Enviada a Proveedores').
    Si el token no existe o ya fue consumido/nulo, levanta PermissionDenied.
    Si la solicitud ya no está en estado Enviada, levanta ValidationError.
    Retorna la instancia de InvitacionCotizar con su contexto relacional completo.
    """
    from django.core.exceptions import PermissionDenied

    token_limpio = (token_acceso or '').strip()
    if not token_limpio:
        raise PermissionDenied("El enlace es inválido o ha expirado.")

    invitacion = InvitacionCotizar.objects.select_related(
        'id_solicitud',
        'cuit_prov',
        'cuit_prov__id_direccion'
    ).prefetch_related(
        'cotizacion_set',
        'id_solicitud__solicitudcotizacionproducto_set__id_producto',
        'id_solicitud__solicitudcotizacionproducto_set__id_producto__id_categoria'
    ).filter(token_acceso=token_limpio).first()

    if not invitacion:
        raise PermissionDenied("El enlace es inválido o ha expirado.")

    solicitud = invitacion.id_solicitud
    if solicitud.estado_solicitud != SolicitudCotizacion.ESTADO_ENVIADA:
        raise ValidationError("La solicitud de cotización ya no se encuentra vigente.")

    return invitacion


# ==============================================================================
# CU-52: INSPECCIONAR COTIZACIONES (SELECTORS)
# ==============================================================================

def obtener_cotizaciones_por_solicitud(id_solicitud: int) -> QuerySet[Cotizacion]:
    """
    CU-52: Inspeccionar Cotizaciones.
    Recupera todas las propuestas económicas emitidas por proveedores para una Solicitud
    de Cotización específica, optimizando relaciones con select_related y prefetch_related.
    Excepción Paso 2: Si no existen cotizaciones recibidas asociadas a la solicitud,
    levanta ObjectDoesNotExist notificando que aún no se han recibido ofertas.
    """
    solicitud = SolicitudCotizacion.objects.filter(id_solicitud=id_solicitud).first()
    if not solicitud:
        raise ObjectDoesNotExist(f"No se encontró la solicitud de cotización #{id_solicitud}.")

    cotizaciones = Cotizacion.objects.select_related(
        'id_invitacion',
        'id_invitacion__id_solicitud',
        'id_invitacion__cuit_prov',
        'id_invitacion__cuit_prov__id_direccion'
    ).prefetch_related(
        'cotizacionproducto_set__id_producto',
        'cotizacionproducto_set__id_producto__id_categoria'
    ).filter(
        id_invitacion__id_solicitud=solicitud
    ).order_by('-id_cotizacion')

    if not cotizaciones.exists():
        raise ObjectDoesNotExist("Aún no se han recibido cotizaciones para esta solicitud de cotización.")

    return cotizaciones


def obtener_detalle_cotizacion(id_cotizacion: int) -> Cotizacion:
    """
    CU-52 / CU-53: Recupera el expediente detallado de una cotización específica con sus
    ítems desglosados y datos del proveedor emisor.
    """
    cotizacion = Cotizacion.objects.select_related(
        'id_invitacion',
        'id_invitacion__id_solicitud',
        'id_invitacion__cuit_prov',
        'id_invitacion__cuit_prov__id_direccion'
    ).prefetch_related(
        'cotizacionproducto_set__id_producto',
        'cotizacionproducto_set__id_producto__id_categoria',
        'id_invitacion__id_solicitud__solicitudcotizacionproducto_set'
    ).filter(id_cotizacion=id_cotizacion).first()

    if not cotizacion:
        raise ObjectDoesNotExist(f"No se encontró la cotización con identificador #{id_cotizacion}.")

    return cotizacion


# ==============================================================================
# CU-54: GENERAR ORDEN DE COMPRA - ALGORITMO MEJOR COMPRA (SELECTORS)
# ==============================================================================

def calcular_mejores_ofertas(
    *,
    productos_solicitados: List[Dict[str, Any]],
    requiere_envio: bool = False
) -> Dict[str, Any]:
    """
    CU-54: Algoritmo de Mejor Compra con Ponderación Multicriterio Parametrizable.
    Evalúa renglón por renglón los insumos requeridos aplicando una matriz de decisión
    multicriterio basada en 5 variables desde ConfiguracionSistema:
      1. Económico (Precio Ofrecido)
      2. Índice de Confiabilidad del Proveedor (0 - 100)
      3. Tiempo Promedio / Promesa de Entrega (en días)
      4. Políticas de Envío (Domicilio vs Retiro)
      5. Nivel Comercial del Proveedor (Mayorista Oficial vs Distribuidor Regional)
    Si 'criterioObligatorio_Envio' o 'requiere_envio' es True, descarta a proveedores que no
    ofrezcan envío a domicilio y re-normaliza la matriz al 100% entre las variables restantes.
    Agrupa los insumos ganadores por Proveedor, generando la estructura de 'Borradores de Órdenes de Compra'.
    Si un producto no posee precio formal vigente, lo cataloga en 'productos_huerfanos'.
    """
    from core_app.models import ConfiguracionSistema

    if not productos_solicitados:
        raise ValidationError("Debe especificar al menos un producto para calcular la mejor compra.")

    hoy = timezone.now().date()
    ids_productos = [item['id_producto'] for item in productos_solicitados]
    productos_db = {p.id_producto: p for p in Producto.objects.filter(id_producto__in=ids_productos)}

    for item in productos_solicitados:
        if item['id_producto'] not in productos_db:
            raise ValidationError(f"El producto con ID {item['id_producto']} no existe en el catálogo.")

    # 1. Recuperar ponderaciones dinámicas de la Configuración Global
    def _get_cfg_int(clave: str, default: int) -> int:
        cfg = ConfiguracionSistema.objects.filter(clave=clave).first()
        try:
            return int(str(cfg.valor).strip()) if cfg and cfg.valor else default
        except (ValueError, TypeError):
            return default

    def _get_cfg_bool(clave: str, default: bool) -> bool:
        cfg = ConfiguracionSistema.objects.filter(clave=clave).first()
        if not cfg or cfg.valor is None:
            return default
        return str(cfg.valor).strip().lower() in ('true', '1', 't', 'yes', 'si')

    peso_econ = _get_cfg_int('pesoEvaluacion_Economico', 20)
    peso_conf = _get_cfg_int('pesoEvaluacion_Confiabilidad', 20)
    peso_tiempo = _get_cfg_int('pesoEvaluacion_Tiempo', 20)
    peso_nivel = _get_cfg_int('pesoEvaluacion_Nivel', 20)
    peso_envio = _get_cfg_int('pesoEvaluacion_Envio', 20)

    envio_obligatorio = requiere_envio or _get_cfg_bool('criterioObligatorio_Envio', False)

    # Re-normalización dinámica de pesos si el envío es excluyente
    if envio_obligatorio:
        peso_envio = 0
        suma_restante = peso_econ + peso_conf + peso_tiempo + peso_nivel
        if suma_restante <= 0:
            suma_restante = 100
            peso_econ = peso_conf = peso_tiempo = peso_nivel = 25
        w_econ = Decimal(str(peso_econ)) / Decimal(str(suma_restante))
        w_conf = Decimal(str(peso_conf)) / Decimal(str(suma_restante))
        w_tiempo = Decimal(str(peso_tiempo)) / Decimal(str(suma_restante))
        w_nivel = Decimal(str(peso_nivel)) / Decimal(str(suma_restante))
        w_envio = Decimal('0.00')
    else:
        suma_total = peso_econ + peso_conf + peso_tiempo + peso_nivel + peso_envio
        if suma_total <= 0:
            suma_total = 100
            peso_econ = peso_conf = peso_tiempo = peso_nivel = peso_envio = 20
        w_econ = Decimal(str(peso_econ)) / Decimal(str(suma_total))
        w_conf = Decimal(str(peso_conf)) / Decimal(str(suma_total))
        w_tiempo = Decimal(str(peso_tiempo)) / Decimal(str(suma_total))
        w_nivel = Decimal(str(peso_nivel)) / Decimal(str(suma_total))
        w_envio = Decimal(str(peso_envio)) / Decimal(str(suma_total))

    proveedores_agrupados: Dict[str, Dict[str, Any]] = {}
    productos_huerfanos: List[Dict[str, Any]] = []

    for item in productos_solicitados:
        id_prod = item['id_producto']
        cantidad = int(item['cantidad'])
        producto = productos_db[id_prod]

        # Query base: Cotizaciones Aceptadas y no vencidas
        qs_ofertas = list(CotizacionProducto.objects.select_related(
            'id_cotizacion',
            'id_cotizacion__id_invitacion',
            'id_cotizacion__id_invitacion__cuit_prov'
        ).filter(
            id_producto_id=id_prod,
            id_cotizacion__estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            id_cotizacion__fecha_validez__gte=hoy,
            precio_ofrecido__gt=Decimal("0.00")
        ))

        if envio_obligatorio:
            qs_ofertas = [o for o in qs_ofertas if getattr(o.id_cotizacion.id_invitacion.cuit_prov, 'ofrece_envio', False)]

        if not qs_ofertas:
            motivo = (
                "No existe cotización aceptada y vigente con servicio de envío obligatorio para este insumo."
                if envio_obligatorio
                else "No existe cotización aceptada y vigente para este insumo en el historial."
            )
            productos_huerfanos.append({
                "id_producto": id_prod,
                "nombre_producto": producto.nombre,
                "cantidad_solicitada": cantidad,
                "motivo": motivo
            })
            continue

        # Calcular mínimos entre los candidatos para normalizar a escala (0 - 100)
        min_precio = min(Decimal(str(o.precio_ofrecido)) for o in qs_ofertas)
        min_dias = min(
            max(int(o.id_cotizacion.tiempo_promesa or getattr(o.id_cotizacion.id_invitacion.cuit_prov, 'tiempo_promedio_entrega', 5) or 5), 1)
            for o in qs_ofertas
        )

        ofertas_puntuadas = []
        for oferta in qs_ofertas:
            prov = oferta.id_cotizacion.id_invitacion.cuit_prov
            precio_oferta = Decimal(str(oferta.precio_ofrecido))
            dias_oferta = max(int(oferta.id_cotizacion.tiempo_promesa or prov.tiempo_promedio_entrega or 5), 1)

            # 1. Puntuación Precio (Inverso: a menor precio, más puntos de 0 a 100)
            puntaje_precio = (min_precio / precio_oferta) * Decimal('100.00')

            # 2. Puntuación Confiabilidad (Directo: 0 - 100)
            conf_val = Decimal(str(prov.indice_confiabilidad if prov.indice_confiabilidad is not None else '60.00'))
            puntaje_conf = min(max(conf_val, Decimal('0.00')), Decimal('100.00'))

            # 3. Puntuación Tiempo (Inverso: a menos días, más puntos de 0 a 100)
            puntaje_tiempo = (Decimal(str(min_dias)) / Decimal(str(dias_oferta))) * Decimal('100.00')

            # 4. Puntuación Envío (100 si ofrece envío, 40 si retiro en mostrador)
            puntaje_envio = Decimal('100.00') if prov.ofrece_envio else Decimal('40.00')

            # 5. Puntuación Nivel Comercial (100 Mayorista, 75 Distribuidor, 50 Otros)
            nivel_str = (prov.nivel or '').lower()
            if 'mayorista' in nivel_str:
                puntaje_nivel = Decimal('100.00')
            elif 'distribuidor' in nivel_str:
                puntaje_nivel = Decimal('75.00')
            else:
                puntaje_nivel = Decimal('50.00')

            # Puntaje Ponderado Total según matriz de decisión
            puntaje_total = (
                (puntaje_precio * w_econ) +
                (puntaje_conf * w_conf) +
                (puntaje_tiempo * w_tiempo) +
                (puntaje_envio * w_envio) +
                (puntaje_nivel * w_nivel)
            )

            ofertas_puntuadas.append({
                'oferta': oferta,
                'puntaje_total': puntaje_total,
                'precio_ofrecido': precio_oferta,
                'fecha_validez': oferta.id_cotizacion.fecha_validez,
                'desglose_scores': {
                    'precio': round(float(puntaje_precio), 2),
                    'confiabilidad': round(float(puntaje_conf), 2),
                    'tiempo': round(float(puntaje_tiempo), 2),
                    'envio': round(float(puntaje_envio), 2),
                    'nivel': round(float(puntaje_nivel), 2),
                    'puntaje_total': round(float(puntaje_total), 2)
                }
            })

        # Seleccionar la oferta ganadora por mayor puntaje ponderado
        # Criterios de desempate deterministas: menor precio, luego mayor fecha de validez
        ofertas_puntuadas.sort(
            key=lambda x: (x['puntaje_total'], -x['precio_ofrecido'], x['fecha_validez']),
            reverse=True
        )
        mejor = ofertas_puntuadas[0]
        oferta_ganadora = mejor['oferta']

        prov = oferta_ganadora.id_cotizacion.id_invitacion.cuit_prov
        cuit_prov = prov.cuit_prov

        precio_unitario = oferta_ganadora.precio_ofrecido
        subtotal = Decimal(str(cantidad)) * precio_unitario

        if cuit_prov not in proveedores_agrupados:
            tipo_entrega = (
                OrdenCompra.TIPO_ENTREGA_ENVIO
                if (envio_obligatorio and prov.ofrece_envio)
                else (OrdenCompra.TIPO_ENTREGA_ENVIO if prov.ofrece_envio else OrdenCompra.TIPO_ENTREGA_RETIRO)
            )
            proveedores_agrupados[cuit_prov] = {
                "cuit_prov": cuit_prov,
                "nombre_proveedor": prov.nombre_proveedor,
                "correo": prov.correo,
                "telefono": prov.telefono,
                "ofrece_envio": prov.ofrece_envio,
                "tipo_entrega": tipo_entrega,
                "tipo_entrega_nombre": "Envío a Domicilio" if tipo_entrega == OrdenCompra.TIPO_ENTREGA_ENVIO else "Retiro en Sucursal",
                "items": [],
                "monto_total": Decimal("0.00")
            }

        proveedores_agrupados[cuit_prov]["items"].append({
            "id_producto": id_prod,
            "nombre_producto": producto.nombre,
            "cantidad": cantidad,
            "precio_unitario": precio_unitario,
            "subtotal": subtotal,
            "id_cotizacion": oferta_ganadora.id_cotizacion_id,
            "evaluacion_multicriterio": mejor['desglose_scores']
        })
        proveedores_agrupados[cuit_prov]["monto_total"] += subtotal

    borradores_list = list(proveedores_agrupados.values())

    return {
        "borradores": borradores_list,
        "total_borradores": len(borradores_list),
        "productos_huerfanos": productos_huerfanos,
        "requiere_envio": envio_obligatorio,
        "matriz_ponderacion": {
            "economico": float(w_econ * 100),
            "confiabilidad": float(w_conf * 100),
            "tiempo": float(w_tiempo * 100),
            "nivel": float(w_nivel * 100),
            "envio": float(w_envio * 100),
            "envio_obligatorio": envio_obligatorio
        }
    }


def obtener_proveedores_candidatos_para_cotizacion(id_producto: int) -> QuerySet[Proveedor]:
    """
    Fase 1: Sondeo Selectivo Inteligente (CU-14).
    Localiza los proveedores activos (estado=True) a los cuales debe enviarse la solicitud de cotización.
    EXCLUYE estrictamente a aquellos proveedores que YA cuenten con una cotización ACEPTADA y VIGENTE
    (fecha_validez >= hoy) para este producto específico en el sistema.
    INCLUYE a proveedores que nunca hayan cotizado el producto o cuya cotización ya haya expirado (fecha_validez < hoy).
    """
    hoy = timezone.now().date()
    cuits_con_oferta_vigente = Proveedor.objects.filter(
        estado=True,
        invitacioncotizar__cotizacion__estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
        invitacioncotizar__cotizacion__fecha_validez__gte=hoy,
        invitacioncotizar__cotizacion__cotizacionproducto__id_producto_id=id_producto
    ).values_list('cuit_prov', flat=True).distinct()

    return Proveedor.objects.filter(
        estado=True
    ).exclude(
        cuit_prov__in=cuits_con_oferta_vigente
    ).distinct()


def obtener_articulos_deficitarios_con_transito() -> List[Dict[str, Any]]:
    """
    Motor de Detección de Faltantes y Stock en Tránsito.
    Escanea todos los productos con modulo_automatico=True y estado=True.
    Para cada producto:
      - Calcula el stock físico real disponible en inventario.
      - Computa el stock en tránsito (órdenes en 'Esperando Entrega' no vencidas).
      - Evalúa la demanda urgente de taller (reparaciones en ESPERANDO_REPUESTOS o ESPERANDO_INSUMOS).
      - Aplica la estrategia de cálculo de lote (ConfiguracionSistema.estrategiaLoteReposicion):
          * BRECHA_MINIMO: max(stock_minimo - stock_proyectado, 0) + faltante_taller
          * DOBLE_MINIMO: max((stock_minimo * 2) - stock_proyectado, 0) + faltante_taller
          * STOCK_MINIMO_FIJO: stock_minimo + faltante_taller
    Retorna la lista de insumos en déficit que requieren acción de abastecimiento.
    """
    from core_app.models import ConfiguracionSistema
    from inventory_app.models import Stock
    from inventory_app.selectors import obtener_stock_actual_producto
    from workshop_app.models import Reparacion, DetalleInsumoReparacion
    from datetime import timedelta

    hoy = timezone.now().date()

    # 1. Parámetros de estrategia y tolerancia
    cfg_est = ConfiguracionSistema.objects.filter(clave='estrategiaLoteReposicion').first()
    estrategia = str(cfg_est.valor).strip().upper() if cfg_est and cfg_est.valor else 'BRECHA_MINIMO'

    cfg_tol_com = ConfiguracionSistema.objects.filter(clave='diasToleranciaIncumplimientoProveedor').first()
    try:
        dias_tol_com = int(str(cfg_tol_com.valor).strip()) if cfg_tol_com and cfg_tol_com.valor else 3
    except (ValueError, TypeError):
        dias_tol_com = 3

    productos_habilitados = Producto.objects.filter(
        modulo_automatico=True,
        estado=True
    ).select_related('id_categoria')

    articulos_deficitarios = []

    for producto in productos_habilitados:
        id_prod = producto.id_producto

        # A. Stock físico actual
        stock_fisico = obtener_stock_actual_producto(id_prod)

        # B. Stock mínimo configurado
        stk_obj = Stock.objects.filter(id_producto=producto).first()
        stock_minimo = stk_obj.stock_minimo if stk_obj else 0

        # C. Stock en Tránsito (Órdenes en Esperando Entrega dentro del plazo esperado)
        detalles_transito = DetalleOrdenCompra.objects.filter(
            id_producto_id=id_prod,
            id_orden__estado_orden=OrdenCompra.ESTADO_ESPERANDO_ENTREGA
        ).select_related('id_orden', 'id_orden__cuit_prov')

        stock_transito = 0
        for det in detalles_transito:
            orden = det.id_orden
            dias_prov = orden.cuit_prov.tiempo_promedio_entrega or 5
            limite_orden = orden.fecha_emision + timedelta(days=dias_prov + dias_tol_com)
            if hoy <= limite_orden:
                stock_transito += det.cantidad

        stock_proyectado = stock_fisico + stock_transito

        # D. Demanda técnica de taller (Reparaciones pausadas por falta de repuestos)
        reparaciones_taller = Reparacion.objects.filter(
            etapa__in=['ESPERANDO_REPUESTOS', 'ESPERANDO_INSUMOS'],
            detalleinsumoreparacion__id_producto_id=id_prod
        ).distinct()

        demanda_taller = 0
        for rep in reparaciones_taller:
            cant_rep = sum(
                d.cantidad for d in rep.detalleinsumoreparacion_set.filter(id_producto_id=id_prod)
            ) or 1
            demanda_taller += cant_rep

        # E. Evaluación de déficit
        requiere_taller = (demanda_taller > stock_proyectado)
        requiere_comercial = (stock_proyectado < stock_minimo)

        if requiere_taller or requiere_comercial:
            # Calcular cantidad según la estrategia seleccionada
            faltante_taller = max(demanda_taller - max(stock_proyectado, 0), 0)

            if estrategia == 'DOBLE_MINIMO':
                base_reposicion = max((stock_minimo * 2) - stock_proyectado, 0)
            elif estrategia == 'STOCK_MINIMO_FIJO':
                base_reposicion = stock_minimo
            else:  # 'BRECHA_MINIMO'
                base_reposicion = max(stock_minimo - stock_proyectado, 0)

            cantidad_total_a_pedir = base_reposicion + faltante_taller
            if cantidad_total_a_pedir <= 0:
                cantidad_total_a_pedir = 1

            # Verificar si existen cotizaciones vigentes para este producto
            tiene_cotizacion_vigente = CotizacionProducto.objects.filter(
                id_producto_id=id_prod,
                id_cotizacion__estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
                id_cotizacion__fecha_validez__gte=hoy,
                precio_ofrecido__gt=Decimal("0.00")
            ).exists()

            articulos_deficitarios.append({
                "id_producto": id_prod,
                "nombre_producto": producto.nombre,
                "stock_fisico": stock_fisico,
                "stock_minimo": stock_minimo,
                "stock_transito": stock_transito,
                "stock_proyectado": stock_proyectado,
                "demanda_taller": demanda_taller,
                "cantidad_a_pedir": cantidad_total_a_pedir,
                "es_urgencia_taller": requiere_taller,
                "tiene_cotizacion_vigente": tiene_cotizacion_vigente,
                "estrategia_utilizada": estrategia
            })

    return articulos_deficitarios


def obtener_estado_motor_abastecimiento() -> Dict[str, Any]:
    """
    Diagnóstico en tiempo real del Motor de Abastecimiento Inteligente.
    Recupera interruptores maestros, estrategias, colas de órdenes activas y déficit de stock.
    """
    from core_app.models import ConfiguracionSistema, LogSistema

    def _cfg_val(clave, default):
        c = ConfiguracionSistema.objects.filter(clave=clave).first()
        return c.valor if c and c.valor is not None else default

    auto_activo = str(_cfg_val('autoAbastecimientoActivo', 'True')).strip().lower() in ('true', '1')
    modo = str(_cfg_val('modoDisparadorAbastecimiento', 'HIBRIDO')).strip().upper()
    estrategia = str(_cfg_val('estrategiaLoteReposicion', 'BRECHA_MINIMO')).strip().upper()
    frecuencia_dias = int(_cfg_val('frecuenciaGeneracionOC_dias', '5'))
    espera_urgencia = int(_cfg_val('esperaUrgenciaTecnicaHoras', '0'))
    envio_obligatorio = str(_cfg_val('criterioObligatorio_Envio', 'False')).strip().lower() in ('true', '1')

    # Órdenes activas en tránsito
    ordenes_esperando = OrdenCompra.objects.filter(estado_orden=OrdenCompra.ESTADO_ESPERANDO_ENTREGA).count()
    ordenes_taller = OrdenCompra.objects.filter(estado_orden=OrdenCompra.ESTADO_ESPERANDO_ENTREGA, sol_tec=True).count()

    # Solicitudes de cotización pendientes
    solicitudes_pendientes = SolicitudCotizacion.objects.filter(estado_solicitud=SolicitudCotizacion.ESTADO_ENVIADA).count()

    # Última ejecución registrada en LogSistema
    ultimo_log = LogSistema.objects.filter(
        accion__icontains="Motor de Abastecimiento"
    ).order_by('-id_log').first()

    return {
        "auto_abastecimiento_activo": auto_activo,
        "modo_disparador": modo,
        "estrategia_lote": estrategia,
        "frecuencia_generacion_oc_dias": frecuencia_dias,
        "espera_urgencia_tecnica_horas": espera_urgencia,
        "criterio_obligatorio_envio": envio_obligatorio,
        "ordenes_esperando_entrega": ordenes_esperando,
        "ordenes_urgencia_taller": ordenes_taller,
        "solicitudes_cotizacion_enviadas": solicitudes_pendientes,
        "ultima_ejecucion": {
            "fecha_hora": ultimo_log.fecha_hora if ultimo_log else None,
            "detalle": ultimo_log.detalle if ultimo_log else "Sin ejecuciones previas registradas"
        }
    }


def obtener_orden_esperando_entrega(id_orden: int) -> OrdenCompra:
    """
    CU-55: Obtiene una orden de compra validando que exista y que se encuentre
    en estado 'Esperando Entrega' (ESTADO_ESPERANDO_ENTREGA = 1).
    Optimiza la consulta con select_related y prefetch_related para auditoría y conciliación.
    """
    orden = (
        OrdenCompra.objects
        .select_related('cuit_prov', 'cuit_prov__id_direccion')
        .prefetch_related('detalles__id_producto')
        .filter(pk=id_orden)
        .first()
    )
    if not orden:
        raise ObjectDoesNotExist(f"No se encontró la orden de compra con ID {id_orden}.")

    if orden.estado_orden != OrdenCompra.ESTADO_ESPERANDO_ENTREGA:
        raise ValidationError("La orden no se encuentra en estado de espera de entrega.")

    return orden


# ==============================================================================
# CU-57: CONSULTAR ORDEN DE COMPRA (SELECTORS)
# ==============================================================================

def obtener_detalle_orden_compra(id_orden: int) -> OrdenCompra:
    """
    CU-57: Recupera una Orden de Compra en modo solo lectura con su árbol completo
    de relaciones (Proveedor, Dirección fiscal, Renglones de DetalleOrdenCompra y Producto).
    Utiliza obligatoriamente select_related y prefetch_related para evitar N+1 queries.
    Si la orden no existe, levanta ObjectDoesNotExist ("El documento solicitado no existe o no está disponible").
    """
    orden = (
        OrdenCompra.objects
        .select_related(
            'cuit_prov',
            'cuit_prov__id_direccion',
            'cuit_prov__id_direccion__id_ciudad',
            'cuit_prov__id_direccion__id_ciudad__id_provincia',
            'cuit_prov__id_direccion__id_ciudad__id_provincia__id_pais'
        )
        .prefetch_related(
            'detalles__id_producto',
            'detalles__id_producto__id_categoria'
        )
        .filter(pk=id_orden)
        .first()
    )
    if not orden:
        raise ObjectDoesNotExist("El documento solicitado no existe o no está disponible.")

    return orden


# ==============================================================================
# CU-31: LISTAR COMPRAS DIRECTAS (SELECTORS)
# ==============================================================================

def listar_compras_directas(
    *,
    usuario_ejecutor: Usuario,
    buscar: str = '',
    impacto_stock: Optional[bool] = None
) -> QuerySet[RegistroCompra]:
    """
    CU-31: Recupera el padrón histórico de compras directas registradas por administración,
    optimizado con select_related sobre usuario responsable y producto generado.
    """
    _verificar_permiso_admin(usuario_ejecutor)

    qs = RegistroCompra.objects.select_related('id_usuario', 'id_producto').order_by('-id_compra')

    texto = (buscar or '').strip()
    if texto:
        qs = qs.filter(
            Q(origen_vendedor__icontains=texto) |
            Q(descripcion_articulo__icontains=texto) |
            Q(motivo__icontains=texto)
        )

    if impacto_stock is not None:
        qs = qs.filter(impacto_stock=bool(impacto_stock))

    return qs


def obtener_expediente_inspeccion_proveedor(
    *,
    usuario_ejecutor: Usuario,
    id_proveedor: str
) -> Dict[str, Any]:
    """
    Recupera el expediente integral de inspección de un proveedor en modo solo lectura:
    - Datos legales, fiscales, contacto y dirección física del proveedor.
    - Métricas de confiabilidad, cumplimiento de entregas y desempeño de abastecimiento.
    - Historial detallado de entregas / recepciones y evaluación de plazos.
    - Lista completa de cotizaciones del proveedor (con su solicitud asociada y archivo PDF).
    - Lista completa de órdenes de compra del proveedor (con sus renglones de productos).
    Optimizado con select_related y prefetch_related para evitar consultas N+1.
    """
    _verificar_permiso_admin(usuario_ejecutor)

    proveedor = obtener_proveedor_completo(id_proveedor)
    hoy = timezone.now().date()

    # 1. Invitaciones a cotizar dirigidas a este proveedor
    invitaciones = list(
        InvitacionCotizar.objects
        .filter(cuit_prov=proveedor)
        .select_related('id_solicitud', 'cuit_prov')
        .prefetch_related('cotizacion_set')
        .order_by('-id_invitacion')
    )

    # 2. Cotizaciones emitidas por este proveedor
    cotizaciones = list(
        Cotizacion.objects
        .filter(id_invitacion__cuit_prov=proveedor)
        .select_related(
            'id_invitacion',
            'id_invitacion__id_solicitud',
            'id_invitacion__cuit_prov',
            'id_invitacion__cuit_prov__id_direccion'
        )
        .prefetch_related(
            'cotizacionproducto_set__id_producto',
            'cotizacionproducto_set__id_producto__id_categoria',
            'id_invitacion__id_solicitud__solicitudcotizacionproducto_set'
        )
        .order_by('-id_cotizacion')
    )

    # 3. Órdenes de compra adjudicadas a este proveedor
    ordenes = list(
        OrdenCompra.objects
        .filter(cuit_prov=proveedor)
        .select_related(
            'cuit_prov',
            'cuit_prov__id_direccion',
            'cuit_prov__id_direccion__id_ciudad'
        )
        .prefetch_related(
            'detalles__id_producto',
            'detalles__id_producto__id_categoria'
        )
        .order_by('-fecha_emision', '-id_orden')
    )

    # Cálculo de métricas de cotizaciones
    total_invitaciones = len(invitaciones)
    total_cotizaciones = len(cotizaciones)
    invitaciones_pendientes = sum(1 for i in invitaciones if i.estado_invitacion == InvitacionCotizar.ESTADO_PENDIENTE)
    invitaciones_rechazadas = sum(1 for i in invitaciones if i.estado_invitacion == InvitacionCotizar.ESTADO_RECHAZADA)

    cotizaciones_aceptadas = sum(1 for c in cotizaciones if c.estado_cotizacion == Cotizacion.ESTADO_ACEPTADA)
    cotizaciones_pendientes = sum(1 for c in cotizaciones if c.estado_cotizacion == Cotizacion.ESTADO_PENDIENTE)
    cotizaciones_descartadas = sum(1 for c in cotizaciones if c.estado_cotizacion == Cotizacion.ESTADO_DESCARTADA)
    cotizaciones_rechazadas = sum(1 for c in cotizaciones if c.estado_cotizacion == Cotizacion.ESTADO_RECHAZADA)

    tasa_respuesta_cotizaciones = (
        round((total_cotizaciones / total_invitaciones) * 100, 1)
        if total_invitaciones > 0 else 0.0
    )
    tasa_adjudicacion_cotizaciones = (
        round((cotizaciones_aceptadas / total_cotizaciones) * 100, 1)
        if total_cotizaciones > 0 else 0.0
    )
    plazos_prometidos = [int(c.tiempo_promesa) for c in cotizaciones if c.tiempo_promesa and int(c.tiempo_promesa) > 0]
    plazo_prometido_promedio = (
        round(sum(plazos_prometidos) / len(plazos_prometidos), 1)
        if plazos_prometidos else float(proveedor.tiempo_promedio_entrega or 0)
    )

    # Cálculo de métricas de órdenes de compra y recepciones
    total_ordenes = len(ordenes)
    ordenes_entregadas_completas = sum(1 for o in ordenes if o.estado_orden == OrdenCompra.ESTADO_ENTREGADA)
    ordenes_entregadas_parciales = sum(1 for o in ordenes if o.estado_orden == OrdenCompra.ESTADO_ENTREGADA_PARCIALMENTE)
    ordenes_esperando_entrega = sum(1 for o in ordenes if o.estado_orden == OrdenCompra.ESTADO_ESPERANDO_ENTREGA)
    ordenes_canceladas = sum(1 for o in ordenes if o.estado_orden == OrdenCompra.ESTADO_CANCELADA)

    total_recepciones = ordenes_entregadas_completas + ordenes_entregadas_parciales
    plazo_referencia = (
        int(round(plazo_prometido_promedio))
        if plazo_prometido_promedio > 0
        else (int(proveedor.tiempo_promedio_entrega) if proveedor.tiempo_promedio_entrega and proveedor.tiempo_promedio_entrega > 0 else 5)
    )

    entregas_en_tiempo_y_forma = 0
    entregas_con_demora_o_parciales = 0
    total_unidades_solicitadas = 0
    total_unidades_recibidas = 0
    monto_total_comprometido = Decimal("0.00")
    monto_total_recepcionado = Decimal("0.00")

    historial_entregas = []

    for o in ordenes:
        detalles_orden = list(o.detalles.all())
        unid_sol = sum(int(d.cantidad or 0) for d in detalles_orden)
        unid_rec = sum(
            int(d.cantidad_recibida if d.cantidad_recibida is not None else (d.cantidad if o.estado_orden == OrdenCompra.ESTADO_ENTREGADA else 0))
            for d in detalles_orden
        )
        monto_sol = sum(Decimal(str(d.cantidad or 0)) * (d.precio_unitario or Decimal("0.00")) for d in detalles_orden)
        monto_rec = sum(
            Decimal(str(d.cantidad_recibida if d.cantidad_recibida is not None else (d.cantidad if o.estado_orden == OrdenCompra.ESTADO_ENTREGADA else 0))) * (d.precio_unitario or Decimal("0.00"))
            for d in detalles_orden
        )

        if o.estado_orden != OrdenCompra.ESTADO_CANCELADA:
            total_unidades_solicitadas += unid_sol
            monto_total_comprometido += monto_sol

        dias_transcurridos = None
        en_tiempo = False
        entrega_completa = False
        cumplio_entrega = False
        observacion_cumplimiento = "En tránsito / Esperando recepción"

        if o.estado_orden in (OrdenCompra.ESTADO_ENTREGADA, OrdenCompra.ESTADO_ENTREGADA_PARCIALMENTE):
            total_unidades_recibidas += unid_rec
            monto_total_recepcionado += monto_rec
            fecha_fin = o.fecha_recepcion or hoy
            dias_transcurridos = max(0, (fecha_fin - o.fecha_emision).days) if o.fecha_emision else 0
            en_tiempo = dias_transcurridos <= plazo_referencia
            entrega_completa = (o.estado_orden == OrdenCompra.ESTADO_ENTREGADA) and (unid_rec >= unid_sol)
            cumplio_entrega = en_tiempo and entrega_completa

            if cumplio_entrega:
                entregas_en_tiempo_y_forma += 1
                observacion_cumplimiento = f"Cumplió en tiempo y forma ({dias_transcurridos} d ≤ {plazo_referencia} d)"
            else:
                entregas_con_demora_o_parciales += 1
                motivos = []
                if not entrega_completa:
                    motivos.append(f"Entrega parcial ({unid_rec}/{unid_sol} u.)")
                if not en_tiempo:
                    motivos.append(f"Demora ({dias_transcurridos} d vs {plazo_referencia} d ref.)")
                observacion_cumplimiento = " • ".join(motivos) or "Observación en recepción"
        elif o.estado_orden == OrdenCompra.ESTADO_CANCELADA:
            dias_transcurridos = max(0, (hoy - o.fecha_emision).days) if o.fecha_emision else 0
            observacion_cumplimiento = "Orden cancelada / Incumplida"
        elif o.estado_orden == OrdenCompra.ESTADO_ESPERANDO_ENTREGA:
            dias_transcurridos = max(0, (hoy - o.fecha_emision).days) if o.fecha_emision else 0
            if dias_transcurridos > plazo_referencia:
                observacion_cumplimiento = f"En tránsito con demora ({dias_transcurridos} d transcurridos)"
            else:
                observacion_cumplimiento = f"En tránsito dentro de plazo ({dias_transcurridos} d transcurridos)"

        historial_entregas.append({
            "id_orden": o.id_orden,
            "fecha_emision": o.fecha_emision,
            "fecha_recepcion": o.fecha_recepcion,
            "nro_remito": o.nro_remito,
            "tipo_entrega": o.tipo_entrega,
            "tipo_entrega_nombre": o.tipo_entrega_nombre,
            "sol_tec": o.sol_tec,
            "estado_orden": o.estado_orden,
            "estado_nombre": o.estado_nombre,
            "dias_transcurridos": dias_transcurridos,
            "plazo_referencia_dias": plazo_referencia,
            "en_tiempo": en_tiempo,
            "entrega_completa": entrega_completa,
            "cumplio_entrega": cumplio_entrega,
            "unidades_solicitadas": unid_sol,
            "unidades_recibidas": unid_rec,
            "monto_solicitado": str(monto_sol.quantize(Decimal("0.01"))),
            "monto_recepcionado": str(monto_rec.quantize(Decimal("0.01"))),
            "observacion_cumplimiento": observacion_cumplimiento,
        })

    ordenes_cerradas = total_recepciones + ordenes_canceladas
    conf_num = float(proveedor.indice_confiabilidad if proveedor.indice_confiabilidad is not None else Decimal("60.00"))
    tasa_cumplimiento_entregas = (
        round((entregas_en_tiempo_y_forma / ordenes_cerradas) * 100, 1)
        if ordenes_cerradas > 0 else round(conf_num, 1)
    )
    tasa_efectividad_unidades = (
        round((total_unidades_recibidas / total_unidades_solicitadas) * 100, 1)
        if total_unidades_solicitadas > 0 else 100.0
    )

    # Clasificación de cumplimiento del proveedor
    if conf_num >= 70.0 and (ordenes_cerradas == 0 or tasa_cumplimiento_entregas >= 60.0):
        clasificacion_cumplimiento = "CUMPLE"
        etiqueta_cumplimiento = "Proveedor Cumplidor (Alto Desempeño)"
        motivo_cumplimiento = (
            f"Confiabilidad del {conf_num:.0f}% con {entregas_en_tiempo_y_forma} de {ordenes_cerradas} "
            f"órdenes cerradas entregadas en tiempo y forma."
        )
    elif conf_num >= 55.0:
        clasificacion_cumplimiento = "CUMPLE" if total_recepciones < 5 and ordenes_canceladas == 0 else "EN_OBSERVACION"
        etiqueta_cumplimiento = (
            "Cumplimiento Estándar (Base Inicial 60%)"
            if total_recepciones < 5 and ordenes_canceladas == 0
            else "Cumplimiento Regular (En Observación)"
        )
        if total_recepciones < 5 and ordenes_canceladas == 0:
            motivo_cumplimiento = (
                f"Mantiene confiabilidad base del {conf_num:.0f}% ({total_recepciones}/5 recepciones concretadas "
                f"para ajuste dinámico de puntaje)."
            )
        else:
            motivo_cumplimiento = (
                f"Confiabilidad del {conf_num:.0f}%. Registra {entregas_con_demora_o_parciales} recepciones "
                f"con demora/parciales y {ordenes_canceladas} canceladas."
            )
    else:
        clasificacion_cumplimiento = "NO_CUMPLE"
        etiqueta_cumplimiento = "Incumplimiento Detectado (Riesgo Operativo)"
        motivo_cumplimiento = (
            f"Confiabilidad reducida al {conf_num:.0f}% por demoras, entregas incompletas ({entregas_con_demora_o_parciales}) "
            f"u órdenes canceladas ({ordenes_canceladas})."
        )

    return {
        "proveedor": proveedor,
        "metricas_abastecimiento": {
            "indice_confiabilidad": round(conf_num, 2),
            "tiempo_promedio_entrega_dias": int(proveedor.tiempo_promedio_entrega or 0),
            "plazo_prometido_promedio_dias": plazo_prometido_promedio,
            "plazo_referencia_dias": plazo_referencia,
            "total_invitaciones_cotizar": total_invitaciones,
            "invitaciones_pendientes": invitaciones_pendientes,
            "invitaciones_rechazadas": invitaciones_rechazadas,
            "total_cotizaciones_respondidas": total_cotizaciones,
            "cotizaciones_aceptadas": cotizaciones_aceptadas,
            "cotizaciones_pendientes": cotizaciones_pendientes,
            "cotizaciones_descartadas": cotizaciones_descartadas,
            "cotizaciones_rechazadas": cotizaciones_rechazadas,
            "tasa_respuesta_cotizaciones": tasa_respuesta_cotizaciones,
            "tasa_adjudicacion_cotizaciones": tasa_adjudicacion_cotizaciones,
            "total_ordenes_compra": total_ordenes,
            "total_recepciones": total_recepciones,
            "ordenes_entregadas_completas": ordenes_entregadas_completas,
            "ordenes_entregadas_parciales": ordenes_entregadas_parciales,
            "ordenes_esperando_entrega": ordenes_esperando_entrega,
            "ordenes_canceladas": ordenes_canceladas,
            "entregas_en_tiempo_y_forma": entregas_en_tiempo_y_forma,
            "entregas_con_demora_o_parciales": entregas_con_demora_o_parciales,
            "tasa_cumplimiento_entregas": tasa_cumplimiento_entregas,
            "total_unidades_solicitadas": total_unidades_solicitadas,
            "total_unidades_recibidas": total_unidades_recibidas,
            "tasa_efectividad_unidades": tasa_efectividad_unidades,
            "monto_total_comprometido": str(monto_total_comprometido.quantize(Decimal("0.01"))),
            "monto_total_recepcionado": str(monto_total_recepcionado.quantize(Decimal("0.01"))),
            "clasificacion_cumplimiento": clasificacion_cumplimiento,
            "etiqueta_cumplimiento": etiqueta_cumplimiento,
            "motivo_cumplimiento": motivo_cumplimiento,
        },
        "historial_entregas": historial_entregas,
        "cotizaciones": cotizaciones,
        "ordenes_compra": ordenes,
    }



