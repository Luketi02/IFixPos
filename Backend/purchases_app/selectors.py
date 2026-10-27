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
    DetalleOrdenCompra
)


def _verificar_permiso_admin(usuario: Usuario):
    """Verifica que el usuario posea rol estricto de Administrador."""
    rol = getattr(usuario, 'id_rol', None) or getattr(usuario, 'rol', None)
    codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
    if codigo_rol != 'ADMIN':
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
        qs = qs.filter(cuit_prov__iexact=cuit_exacto)

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
        'detalleordencompra_set__id_producto',
        'detalleordencompra_set__id_producto__id_categoria'
    ).order_by('-fecha_emision', '-id_orden')

    id_orden = filtros.get('id_orden')
    if id_orden:
        qs = qs.filter(id_orden=id_orden)

    estado_orden = filtros.get('estado_orden')
    if estado_orden is not None:
        qs = qs.filter(estado_orden=estado_orden)

    cuit_prov = str(filtros.get('cuit_prov') or '').strip()
    if cuit_prov:
        qs = qs.filter(cuit_prov_id__icontains=cuit_prov)

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

    return qs


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
        'invitacioncotizar_set__cuit_prov'
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
        'cotizacionproducto_set__id_producto__id_categoria'
    ).order_by('-id_cotizacion')

    id_cotizacion = filtros.get('id_cotizacion')
    if id_cotizacion:
        qs = qs.filter(id_cotizacion=id_cotizacion)

    id_solicitud = filtros.get('id_solicitud')
    if id_solicitud:
        qs = qs.filter(id_invitacion__id_solicitud_id=id_solicitud)

    cuit_prov = str(filtros.get('cuit_prov') or '').strip()
    if cuit_prov:
        qs = qs.filter(id_invitacion__cuit_prov_id__icontains=cuit_prov)

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
        raise ValidationError("Operación bloqueada: La solicitud ya superó la fase de borrador y no puede ser alterada ni eliminada físicamente.")

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
    CU-54: Algoritmo de Mejor Compra.
    Analiza renglón por renglón los insumos requeridos. Para cada uno, localiza la mejor
    oferta en CotizacionProducto de cotizaciones ACEPTADAS y vigentes (fecha_validez >= hoy).
    Si requiere_envio es True, prioriza/exige que el proveedor ofrezca envíos a domicilio.
    Agrupa los insumos ganadores por Proveedor, generando la estructura de 'Borradores de Órdenes de Compra'.
    Si un producto no posee precio histórico formal vigente, lo cataloga en 'productos_huerfanos'.
    """
    if not productos_solicitados:
        raise ValidationError("Debe especificar al menos un producto para calcular la mejor compra.")

    hoy = timezone.now().date()
    ids_productos = [item['id_producto'] for item in productos_solicitados]
    productos_db = {p.id_producto: p for p in Producto.objects.filter(id_producto__in=ids_productos)}

    # Verificar que los productos existan
    for item in productos_solicitados:
        if item['id_producto'] not in productos_db:
            raise ValidationError(f"El producto con ID {item['id_producto']} no existe en el catálogo.")

    proveedores_agrupados: Dict[str, Dict[str, Any]] = {}
    productos_huerfanos: List[Dict[str, Any]] = []

    for item in productos_solicitados:
        id_prod = item['id_producto']
        cantidad = int(item['cantidad'])
        producto = productos_db[id_prod]

        # Query base: Cotizaciones Aceptadas y no vencidas
        qs_ofertas = CotizacionProducto.objects.select_related(
            'id_cotizacion',
            'id_cotizacion__id_invitacion',
            'id_cotizacion__id_invitacion__cuit_prov'
        ).filter(
            id_producto_id=id_prod,
            id_cotizacion__estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            id_cotizacion__fecha_validez__gte=hoy,
            precio_ofrecido__gt=Decimal("0.00")
        )

        if requiere_envio:
            qs_ofertas = qs_ofertas.filter(
                id_cotizacion__id_invitacion__cuit_prov__ofrece_envio=True
            )

        # Seleccionar la oferta ganadora con el menor precio ofrecido
        oferta_ganadora = qs_ofertas.order_by(
            'precio_ofrecido',
            '-id_cotizacion__fecha_validez'
        ).first()

        if not oferta_ganadora:
            motivo = (
                "No existe cotización aceptada y vigente con servicio de envío para este insumo."
                if requiere_envio
                else "No existe cotización aceptada y vigente para este insumo en el historial."
            )
            productos_huerfanos.append({
                "id_producto": id_prod,
                "nombre_producto": producto.nombre,
                "cantidad_solicitada": cantidad,
                "motivo": motivo
            })
            continue

        prov = oferta_ganadora.id_cotizacion.id_invitacion.cuit_prov
        cuit_prov = prov.cuit_prov

        precio_unitario = oferta_ganadora.precio_ofrecido
        subtotal = Decimal(str(cantidad)) * precio_unitario

        if cuit_prov not in proveedores_agrupados:
            tipo_entrega = (
                OrdenCompra.TIPO_ENTREGA_ENVIO
                if (requiere_envio and prov.ofrece_envio)
                else OrdenCompra.TIPO_ENTREGA_RETIRO
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
            "id_cotizacion": oferta_ganadora.id_cotizacion_id
        })
        proveedores_agrupados[cuit_prov]["monto_total"] += subtotal

    borradores_list = list(proveedores_agrupados.values())

    return {
        "borradores": borradores_list,
        "total_borradores": len(borradores_list),
        "productos_huerfanos": productos_huerfanos,
        "requiere_envio": requiere_envio
    }


# ==============================================================================
# CU-55: RECEPCIONAR COMPRA (SELECTORS)
# ==============================================================================

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
        .select_related('cuit_prov', 'cuit_prov__id_direccion')
        .prefetch_related('detalles__id_producto')
        .filter(pk=id_orden)
        .first()
    )
    if not orden:
        raise ObjectDoesNotExist("El documento solicitado no existe o no está disponible.")

    return orden

