from decimal import Decimal
from typing import Optional, List, Tuple, Any
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import QuerySet, Q
from rest_framework.exceptions import PermissionDenied, ValidationError
from sales_app.models import Venta, CarritoCompra, CarritoProducto, MedioPago
from users_app.models import Usuario


def obtener_venta_por_id(id_venta: int) -> Optional[Venta]:
    """
    Recupera una venta optimizando sus detalles y relaciones foráneas.
    """
    return Venta.objects.select_related(
        'id_usuario',
        'id_direccion_envio__id_ciudad__id_provincia__id_pais'
    ).prefetch_related(
        'detalleventa_set__id_producto'
    ).filter(id_venta=id_venta).first()


def obtener_ventas_usuario(id_usuario: int) -> QuerySet[Venta]:
    """
    Retorna todas las ventas de un cliente ordenadas de forma cronológica descendente.
    """
    return Venta.objects.select_related(
        'id_direccion_envio__id_ciudad__id_provincia__id_pais'
    ).prefetch_related(
        'detalleventa_set__id_producto'
    ).filter(id_usuario_id=id_usuario).order_by('-fecha_venta', '-id_venta')


def obtener_carrito_activo(id_usuario: int) -> Optional[CarritoCompra]:
    """
    Recupera el carrito de compras activo de un usuario.
    """
    return CarritoCompra.objects.filter(
        id_usuario_id=id_usuario,
        estado__iexact='activo'
    ).order_by('-id_carrito').first()


def obtener_items_carrito(id_carrito: int) -> QuerySet[CarritoProducto]:
    """
    Retorna los ítems vinculados a un carrito de compras.
    """
    return CarritoProducto.objects.select_related('id_producto').filter(id_carrito_id=id_carrito)


def obtener_resumen_carrito(*, usuario) -> dict:
    """
    Recupera el resumen completo del carrito activo del usuario, incluyendo
    ítems, cantidades, precios unitarios y subtotales acumulados.
    """
    from decimal import Decimal

    carrito = obtener_carrito_activo(usuario.id_usuario)
    if not carrito:
        return {
            'id_carrito': None,
            'total_articulos': 0,
            'monto_subtotal': Decimal('0.00'),
            'items': []
        }

    items_qs = obtener_items_carrito(carrito.id_carrito)
    items_list = []
    total_arts = 0
    subtotal_acum = Decimal('0.00')

    for item in items_qs:
        prod = item.id_producto
        cant = int(item.cantidad or 1)
        precio = Decimal(str(prod.precio_venta))
        subtotal_item = precio * Decimal(str(cant))

        total_arts += cant
        subtotal_acum += subtotal_item

        items_list.append({
            'id_carrito_producto': item.id_carrito_producto,
            'id_producto': prod.id_producto,
            'producto_nombre': prod.nombre,
            'precio_unitario': precio,
            'cantidad': cant,
            'subtotal': subtotal_item
        })

    return {
        'id_carrito': carrito.id_carrito,
        'total_articulos': total_arts,
        'monto_subtotal': subtotal_acum,
        'items': items_list
    }


def obtener_beneficios_activos_usuario(id_usuario: int) -> dict:
    """
    Retorna un diccionario mapeando {id_producto: {porcentaje_descuento, motivo, id_beneficio}}
    con los beneficios y descuentos vigentes asignados al cliente.
    """
    from sales_app.models import Beneficio
    from users_app.models import Usuario

    if not id_usuario:
        return {}

    # Consumidor final nunca posee beneficios comerciales
    usr = Usuario.objects.filter(id_usuario=id_usuario).only('email').first()
    if usr and ('consumidorfinal' in (usr.email or '').lower()):
        return {}

    beneficios = Beneficio.objects.filter(id_usuario_id=id_usuario)
    resultado = {}
    for b in beneficios:
        if b.por_desc is not None and b.por_desc > 0:
            porcentaje = float(b.por_desc)
            prod_id = b.id_producto_id
            if prod_id not in resultado or porcentaje > resultado[prod_id]['porcentaje_descuento']:
                resultado[prod_id] = {
                    'id_beneficio': b.id_beneficio,
                    'porcentaje_descuento': porcentaje,
                    'motivo': b.motivo or 'Descuento especial personalizado'
                }
    return resultado


def buscar_operacion_pendiente_cobro(*, identificador: str):
    """
    CU-21: Completar pago (Paso 1).
    Localiza la operación comercial pendiente de cobro (Venta o Reparación)
    a partir del correo electrónico del cliente o de un código de seguridad.

    - Búsqueda en Venta: estado 'PENDIENTE'
    - Búsqueda en Reparacion: etapa 'ESPERANDO_PAGO' o 'PENDIENTE_PAGO' o 'PENDIENTE'
    - Si no encuentra ninguna coincidencia, levanta ObjectDoesNotExist ("No se encontraron operaciones pendientes").
    """
    from django.core.exceptions import ObjectDoesNotExist
    from django.db.models import Q
    from sales_app.models import Venta
    from workshop_app.models import Reparacion

    query_str = (identificador or '').strip()
    if not query_str:
        raise ObjectDoesNotExist("No se encontraron operaciones pendientes.")

    # 1. Buscar en Venta (estado PENDIENTE)
    venta = Venta.objects.select_related(
        'id_usuario',
        'id_usuario__perfilusuario'
    ).filter(
        Q(estado_venta__iexact='PENDIENTE'),
        Q(codigo_sec__iexact=query_str) | Q(id_usuario__email__iexact=query_str)
    ).order_by('-fecha_venta', '-id_venta').first()

    if venta:
        return venta

    # 2. Buscar en Reparación (etapas pendientes de pago)
    etapas_pendientes = [
        'PENDIENTE_PAGO',
        'ESPERANDO_PAGO',
        'PENDIENTE',
        'FINALIZADO',
        'FINALIZADA'
    ]
    reparacion = Reparacion.objects.select_related(
        'id_usuario',
        'id_usuario__perfilusuario',
        'id_dispositivo'
    ).filter(
        Q(etapa__in=etapas_pendientes) | Q(etapa__icontains='PAGO'),
        Q(codigo_sec__iexact=query_str) | Q(id_usuario__email__iexact=query_str)
    ).order_by('-fecha_inicio', '-id_reparacion').first()

    if reparacion:
        return reparacion

    raise ObjectDoesNotExist("No se encontraron operaciones pendientes.")


# ==============================================================================
# CU-38: FILTRAR COBROS Y PAGOS (CAPA DE LECTURA Y AUDITORÍA CONTABLE)
# ==============================================================================

def _extraer_datos_cliente(usuario):
    """Extrae los datos legibles del cliente asociado para informes de auditoría."""
    if not usuario:
        return {
            'id_usuario': None,
            'nombre': 'Consumidor Final',
            'email': '',
            'dni': ''
        }
    perfil = getattr(usuario, 'perfilusuario', None)
    nombre_completo = ""
    dni = ""
    if perfil:
        nom = (perfil.nombre or '').strip()
        ape = (perfil.apellido or '').strip()
        nombre_completo = f"{nom} {ape}".strip()
        dni = (perfil.dni or '').strip()
    return {
        'id_usuario': usuario.id_usuario,
        'nombre': nombre_completo or usuario.email,
        'email': usuario.email,
        'dni': dni
    }


def _calcular_monto_reparacion(reparacion) -> Decimal:
    """Calcula el monto monetario total de una reparación (mano de obra + insumos + envío)."""
    from decimal import Decimal
    costo_diag = Decimal('0.00')
    diag = reparacion.diagnostico_set.order_by('-id_diagnostico').first()
    if diag and diag.costo_diagnostico:
        costo_diag = Decimal(str(diag.costo_diagnostico))

    costo_insumos = Decimal('0.00')
    for insumo in reparacion.detalleinsumoreparacion_set.all():
        cant = Decimal(str(insumo.cantidad or 0))
        pu = Decimal(str(insumo.precio_unitario or 0))
        costo_insumos += cant * pu

    total_rep = costo_diag + costo_insumos
    envio = Decimal('0.00')
    if reparacion.id_venta and reparacion.id_venta.costo_envio:
        envio = Decimal(str(reparacion.id_venta.costo_envio))

    return total_rep + envio


def filtrar_cobros_y_pagos(
    *,
    usuario_ejecutor,
    filtros: dict
) -> dict:
    """
    CU-38: Filtrar Cobros y Pagos.
    Motor de búsqueda contable y auditoría del flujo de caja del negocio.
    Localiza transacciones financieras exactas o agrupa operaciones según su
    estado de liquidación (Pendiente, Pagado, Anulado), método de cobro
    y período contable (rango de fechas).
    """
    import datetime
    from decimal import Decimal
    from django.db.models import Q
    from sales_app.models import Pago, Venta
    from workshop_app.models import Reparacion

    # 1. Extracción y normalización de parámetros
    codigo_seguridad = (filtros.get('codigo_seguridad') or '').strip()
    email_cliente = (filtros.get('email_cliente') or '').strip()
    busqueda_exacta = (filtros.get('busqueda_exacta') or '').strip()
    estado_pago = (filtros.get('estado_pago') or '').strip().upper()
    fecha_desde = filtros.get('fecha_desde')
    fecha_hasta = filtros.get('fecha_hasta')
    medio_pago = (filtros.get('medio_pago') or '').strip()

    # Si viene búsqueda exacta unificada, discernir según presencia de arroba
    if busqueda_exacta:
        if '@' in busqueda_exacta:
            if not email_cliente:
                email_cliente = busqueda_exacta
        else:
            if not codigo_seguridad:
                codigo_seguridad = busqueda_exacta

    transacciones = []
    ventas_procesadas_ids = set()

    # =========================================================================
    # A. TRANSACCIONES PAGADAS (Cobros Registrados en la entidad Pago)
    # =========================================================================
    incluir_pagados = estado_pago in ('', 'TODOS', 'PAGADO')
    if incluir_pagados:
        qs_pagos = Pago.objects.select_related(
            'id_venta',
            'id_venta__id_usuario',
            'id_venta__id_usuario__perfilusuario',
            'medio_pago'
        ).prefetch_related(
            'id_venta__reparacion_set'
        )

        if codigo_seguridad:
            qs_pagos = qs_pagos.filter(
                Q(id_venta__codigo_sec__iexact=codigo_seguridad) |
                Q(id_venta__reparacion__codigo_sec__iexact=codigo_seguridad) |
                Q(cod_operacion__iexact=codigo_seguridad)
            )

        if email_cliente:
            qs_pagos = qs_pagos.filter(
                Q(id_venta__id_usuario__email__iexact=email_cliente) |
                Q(id_venta__reparacion__id_usuario__email__iexact=email_cliente)
            )

        if fecha_desde:
            qs_pagos = qs_pagos.filter(fecha_pago__gte=fecha_desde)

        if fecha_hasta:
            qs_pagos = qs_pagos.filter(fecha_pago__lte=fecha_hasta)

        if medio_pago:
            if medio_pago.isdigit():
                qs_pagos = qs_pagos.filter(medio_pago_id=int(medio_pago))
            else:
                qs_pagos = qs_pagos.filter(medio_pago__nombre_medio_pago__icontains=medio_pago)

        for p in qs_pagos:
            venta = p.id_venta
            rep = venta.reparacion_set.first() if venta else None
            tipo_op = "Reparación" if rep else "Venta"
            id_op = rep.id_reparacion if rep else (venta.id_venta if venta else p.id_pago)
            cod_sec = (rep.codigo_sec if rep and rep.codigo_sec else (venta.codigo_sec if venta else '')) or ''
            usuario_cliente = venta.id_usuario if venta else (rep.id_usuario if rep else None)

            transacciones.append({
                'id_pago': p.id_pago,
                'id_operacion': id_op,
                'tipo_operacion': tipo_op,
                'codigo_seguridad': cod_sec,
                'fecha': p.fecha_pago,
                'estado_pago': 'PAGADO',
                'monto': Decimal(str(p.monto_pagado or '0.00')),
                'medio_pago': p.medio_pago.nombre_medio_pago if p.medio_pago else 'Desconocido',
                'numero_operacion': p.cod_operacion or '',
                'detalle': p.detalle or '',
                'ruta_comprobante': p.ruta_comprobante or '',
                'cliente': _extraer_datos_cliente(usuario_cliente)
            })

    # =========================================================================
    # B. TRANSACCIONES PENDIENTES DE COBRO (Arqueo de caja y cuentas por cobrar)
    # =========================================================================
    incluir_pendientes = estado_pago in ('', 'TODOS', 'PENDIENTE')
    # Las cuentas pendientes aún no poseen medio de pago liquidado en caja;
    # si se especifica un medio de pago obligatorio (ej. Efectivo), no coinciden
    if incluir_pendientes and not medio_pago:
        # B.1. Ventas en estado PENDIENTE sin pago concretado
        qs_ventas_pend = Venta.objects.select_related(
            'id_usuario',
            'id_usuario__perfilusuario'
        ).prefetch_related(
            'reparacion_set'
        ).filter(
            estado_venta__iexact='PENDIENTE',
            pago__isnull=True
        )

        if codigo_seguridad:
            qs_ventas_pend = qs_ventas_pend.filter(
                Q(codigo_sec__iexact=codigo_seguridad) |
                Q(reparacion__codigo_sec__iexact=codigo_seguridad)
            )

        if email_cliente:
            qs_ventas_pend = qs_ventas_pend.filter(id_usuario__email__iexact=email_cliente)

        if fecha_desde:
            qs_ventas_pend = qs_ventas_pend.filter(fecha_venta__gte=fecha_desde)

        if fecha_hasta:
            qs_ventas_pend = qs_ventas_pend.filter(fecha_venta__lte=fecha_hasta)

        for v in qs_ventas_pend:
            ventas_procesadas_ids.add(v.id_venta)
            rep = v.reparacion_set.first()
            tipo_op = "Reparación" if rep else "Venta"
            id_op = rep.id_reparacion if rep else v.id_venta
            cod_sec = (rep.codigo_sec if rep and rep.codigo_sec else v.codigo_sec) or ''
            monto_total = Decimal(str(v.monto_subtotal or '0.00')) + Decimal(str(v.costo_envio or '0.00'))

            transacciones.append({
                'id_pago': None,
                'id_operacion': id_op,
                'tipo_operacion': tipo_op,
                'codigo_seguridad': cod_sec,
                'fecha': v.fecha_venta,
                'estado_pago': 'PENDIENTE',
                'monto': monto_total,
                'medio_pago': None,
                'numero_operacion': None,
                'detalle': 'Venta pendiente de cobro en mostrador / entrega',
                'ruta_comprobante': None,
                'cliente': _extraer_datos_cliente(v.id_usuario)
            })

        # B.2. Reparaciones pendientes de cobro sin venta o no cobradas aún
        etapas_pendientes = ['PENDIENTE_PAGO', 'ESPERANDO_PAGO', 'PENDIENTE', 'FINALIZADO', 'FINALIZADA']
        qs_reparaciones = Reparacion.objects.select_related(
            'id_usuario',
            'id_usuario__perfilusuario',
            'id_dispositivo',
            'id_dispositivo__id_usuario',
            'id_dispositivo__id_usuario__perfilusuario',
            'id_venta'
        ).prefetch_related(
            'detalleinsumoreparacion_set',
            'diagnostico_set'
        ).filter(
            Q(etapa__in=etapas_pendientes) | Q(etapa__icontains='PAGO')
        ).exclude(
            etapa__in=['PAGADO', 'CANCELADO', 'ENTREGADO', 'ANULADO']
        ).exclude(
            id_venta__pago__isnull=False
        )

        if ventas_procesadas_ids:
            qs_reparaciones = qs_reparaciones.exclude(id_venta_id__in=ventas_procesadas_ids)

        if codigo_seguridad:
            qs_reparaciones = qs_reparaciones.filter(
                Q(codigo_sec__iexact=codigo_seguridad) |
                Q(id_venta__codigo_sec__iexact=codigo_seguridad)
            )

        if email_cliente:
            qs_reparaciones = qs_reparaciones.filter(
                Q(id_usuario__email__iexact=email_cliente) |
                Q(id_dispositivo__id_usuario__email__iexact=email_cliente)
            )

        if fecha_desde:
            qs_reparaciones = qs_reparaciones.filter(fecha_inicio__gte=fecha_desde)

        if fecha_hasta:
            qs_reparaciones = qs_reparaciones.filter(fecha_inicio__lte=fecha_hasta)

        for r in qs_reparaciones:
            monto_adeudado = _calcular_monto_reparacion(r)
            usuario_cliente = r.id_usuario or (r.id_dispositivo.id_usuario if r.id_dispositivo else None)
            cod_sec = (r.codigo_sec or (r.id_venta.codigo_sec if r.id_venta else '')) or ''

            transacciones.append({
                'id_pago': None,
                'id_operacion': r.id_reparacion,
                'tipo_operacion': 'Reparación',
                'codigo_seguridad': cod_sec,
                'fecha': r.fecha_inicio,
                'estado_pago': 'PENDIENTE',
                'monto': monto_adeudado,
                'medio_pago': None,
                'numero_operacion': None,
                'detalle': f'Reparación en etapa {r.etapa} pendiente de cobro',
                'ruta_comprobante': None,
                'cliente': _extraer_datos_cliente(usuario_cliente)
            })

    # =========================================================================
    # C. TRANSACCIONES ANULADAS O CANCELADAS
    # =========================================================================
    incluir_anulados = estado_pago in ('', 'TODOS', 'ANULADO', 'CANCELADO')
    if incluir_anulados and not medio_pago:
        qs_ventas_anuladas = Venta.objects.select_related(
            'id_usuario',
            'id_usuario__perfilusuario'
        ).prefetch_related(
            'reparacion_set'
        ).filter(
            estado_venta__in=['ANULADO', 'CANCELADO']
        )

        if codigo_seguridad:
            qs_ventas_anuladas = qs_ventas_anuladas.filter(
                Q(codigo_sec__iexact=codigo_seguridad) |
                Q(reparacion__codigo_sec__iexact=codigo_seguridad)
            )

        if email_cliente:
            qs_ventas_anuladas = qs_ventas_anuladas.filter(id_usuario__email__iexact=email_cliente)

        if fecha_desde:
            qs_ventas_anuladas = qs_ventas_anuladas.filter(fecha_venta__gte=fecha_desde)

        if fecha_hasta:
            qs_ventas_anuladas = qs_ventas_anuladas.filter(fecha_venta__lte=fecha_hasta)

        for va in qs_ventas_anuladas:
            rep = va.reparacion_set.first()
            tipo_op = "Reparación" if rep else "Venta"
            id_op = rep.id_reparacion if rep else va.id_venta
            cod_sec = (rep.codigo_sec if rep and rep.codigo_sec else va.codigo_sec) or ''
            monto_total = Decimal(str(va.monto_subtotal or '0.00')) + Decimal(str(va.costo_envio or '0.00'))

            transacciones.append({
                'id_pago': None,
                'id_operacion': id_op,
                'tipo_operacion': tipo_op,
                'codigo_seguridad': cod_sec,
                'fecha': va.fecha_venta,
                'estado_pago': 'ANULADO',
                'monto': monto_total,
                'medio_pago': None,
                'numero_operacion': None,
                'detalle': 'Operación comercial anulada o cancelada',
                'ruta_comprobante': None,
                'cliente': _extraer_datos_cliente(va.id_usuario)
            })

    # =========================================================================
    # D. ORDENAMIENTO CRONOLÓGICO Y RESUMEN CONTABLE
    # =========================================================================
    transacciones.sort(
        key=lambda item: (item['fecha'] or datetime.date.min, item['id_operacion']),
        reverse=True
    )

    total_recaudado = sum((t['monto'] for t in transacciones if t['estado_pago'] == 'PAGADO'), Decimal('0.00'))
    total_pendiente = sum((t['monto'] for t in transacciones if t['estado_pago'] == 'PENDIENTE'), Decimal('0.00'))
    total_anulado = sum((t['monto'] for t in transacciones if t['estado_pago'] == 'ANULADO'), Decimal('0.00'))

    return {
        'resultados': transacciones,
        'total_transacciones': len(transacciones),
        'resumen': {
            'total_recaudado': str(total_recaudado.quantize(Decimal('0.01'))),
            'total_pendiente': str(total_pendiente.quantize(Decimal('0.01'))),
            'total_anulado': str(total_anulado.quantize(Decimal('0.01')))
        }
    }


# ==============================================================================
# CU-70: FILTRAR BENEFICIOS OTORGADOS (SELECTORS)
# ==============================================================================

def filtrar_beneficios_otorgados(
    *,
    usuario_ejecutor: Usuario,
    filtros: dict
) -> QuerySet:
    """
    CU-70: Filtrar Beneficios Otorgados.
    Permite al Administrador segmentar y localizar recomendaciones o descuentos generados
    por el motor predictivo y de fidelización.
    Criterios: Cliente (ID, DNI o Email), rango de fechas, canal de emisión, porcentaje de descuento y producto.
    """
    rol = getattr(usuario_ejecutor, 'id_rol', None) or getattr(usuario_ejecutor, 'rol', None)
    codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
    if codigo_rol != 'ADMIN':
        raise PermissionDenied("Se requiere rol de Administrador para consultar el historial de beneficios otorgados.")

    fecha_desde = filtros.get('fecha_desde')
    fecha_hasta = filtros.get('fecha_hasta')
    if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
        raise ValidationError("La fecha inicial (fecha_desde) no puede ser posterior a la fecha final (fecha_hasta).")

    from sales_app.models import Beneficio
    qs = Beneficio.objects.select_related(
        'id_usuario',
        'id_usuario__perfilusuario',
        'id_usuario__id_rol',
        'id_producto',
        'id_producto__id_categoria'
    ).order_by('-fecha', '-id_beneficio')

    id_usuario = filtros.get('id_usuario')
    if id_usuario:
        qs = qs.filter(id_usuario_id=id_usuario)

    cliente_query = str(filtros.get('cliente_query') or filtros.get('buscar') or '').strip()
    if cliente_query:
        qs = qs.filter(
            Q(id_usuario__email__icontains=cliente_query) |
            Q(id_usuario__perfilusuario__nombre__icontains=cliente_query) |
            Q(id_usuario__perfilusuario__apellido__icontains=cliente_query) |
            Q(id_usuario__perfilusuario__dni__icontains=cliente_query)
        )

    if fecha_desde:
        qs = qs.filter(fecha__gte=fecha_desde)
    if fecha_hasta:
        qs = qs.filter(fecha__lte=fecha_hasta)

    enviado_momento_compra = filtros.get('enviado_momento_compra')
    if enviado_momento_compra is not None:
        qs = qs.filter(enviado_momento_compra=bool(enviado_momento_compra))

    enviado_durante_carrito = filtros.get('enviado_durante_carrito')
    if enviado_durante_carrito is not None:
        qs = qs.filter(enviado_durante_carrito=bool(enviado_durante_carrito))

    por_desc_min = filtros.get('por_desc_min')
    if por_desc_min is not None:
        qs = qs.filter(por_desc__gte=por_desc_min)

    por_desc_max = filtros.get('por_desc_max')
    if por_desc_max is not None:
        qs = qs.filter(por_desc__lte=por_desc_max)

    id_producto = filtros.get('id_producto')
    if id_producto:
        qs = qs.filter(id_producto_id=id_producto)

    return qs


def obtener_medio_pago_por_nombre(nombre: str) -> Optional[MedioPago]:
    """
    CU-82: Busca si un medio de pago ya existe por su nombre (case-insensitive).
    Retorna la instancia si existe, o None si no.
    """
    if not nombre:
        return None
    nombre_limpio = nombre.strip()
    return MedioPago.objects.filter(nombre_medio_pago__iexact=nombre_limpio).first()


def obtener_medio_pago_por_id(id_mediopago: int) -> Optional[MedioPago]:
    """
    Recupera un medio de pago por su clave primaria.
    """
    try:
        return MedioPago.objects.get(id_mediopago=id_mediopago)
    except MedioPago.DoesNotExist:
        return None


def obtener_medio_pago_para_toggle(id_medio_pago: int) -> MedioPago:
    """
    CU-83: Recupera una instancia de MedioPago para alternar su estado operativo.
    Si no existe, levanta ObjectDoesNotExist.
    """
    try:
        return MedioPago.objects.get(id_mediopago=id_medio_pago)
    except MedioPago.DoesNotExist:
        raise ObjectDoesNotExist(f"No se encontró el medio de pago con ID {id_medio_pago}.")


# ==============================================================================
# CU-67: REALIZAR VENTA PRESENCIAL (VALIDACIÓN DE PRODUCTOS Y STOCK)
# ==============================================================================

def validar_productos_para_venta(productos_input: List[dict]) -> Tuple[List[Any], List[str]]:
    """
    CU-67: Valida los artículos antes de procesar una venta presencial.
    - Verifica que todos los IDs existan y estén aptos para la venta.
    - Evalúa el stock disponible actual e inyecta advertencias si el stock baja a cero o queda en negativo.
    Retorna la lista de productos y la lista de advertencias de stock.
    """
    from django.core.exceptions import ValidationError
    from catalog_app.models import Producto
    from inventory_app.selectors import obtener_stock_actual_producto

    if not productos_input:
        raise ValidationError("Debe incluir al menos un producto para realizar la venta.")

    ids_productos = [item['id_producto'] for item in productos_input]
    productos_qs = Producto.objects.filter(id_producto__in=ids_productos)
    dict_prods = {p.id_producto: p for p in productos_qs}

    # Verificar existencia en catálogo
    faltantes = [pid for pid in ids_productos if pid not in dict_prods]
    if faltantes:
        raise ValidationError(f"Uno o más productos no existen en el catálogo: {faltantes}.")

    warnings: List[str] = []
    cantidades_por_prod = {}
    for item in productos_input:
        pid = item['id_producto']
        cantidades_por_prod[pid] = cantidades_por_prod.get(pid, 0) + int(item.get('cantidad', 1))

    for pid, p in dict_prods.items():
        if not p.estado or not p.apto_venta:
            raise ValidationError(f"El producto '{p.nombre}' no se encuentra habilitado para la venta.")

        cant_solicitada = cantidades_por_prod[pid]
        stock_actual = obtener_stock_actual_producto(pid)
        stock_restante = stock_actual - cant_solicitada

        if stock_restante <= 0:
            warnings.append(
                f"Advertencia de stock: El producto '{p.nombre}' quedará con stock bajo o nulo ({stock_restante} unidades)."
            )

    return list(dict_prods.values()), warnings


# ==============================================================================
# CU-69: AUDITAR HISTORIAL DE BENEFICIOS Y PROMOCIONES (SELECTORS)
# ==============================================================================

def obtener_historial_beneficios(*, filtros: Optional[dict] = None) -> QuerySet:
    """
    CU-69: Recupera el QuerySet consolidado de beneficios y sugerencias comerciales
    generados por el motor predictivo y de fidelización.
    Optimizado estrictamente con select_related para erradicar consultas N+1.
    """
    from sales_app.models import Beneficio
    filtros = filtros or {}

    qs = Beneficio.objects.select_related(
        'id_usuario',
        'id_usuario__perfilusuario',
        'id_usuario__id_rol',
        'id_producto',
        'id_producto__id_categoria'
    ).order_by('-fecha', '-id_beneficio')

    id_cliente = filtros.get('id_cliente') or filtros.get('id_usuario')
    if id_cliente:
        qs = qs.filter(id_usuario_id=id_cliente)

    fecha_desde = filtros.get('fecha_desde')
    if fecha_desde:
        qs = qs.filter(fecha__gte=fecha_desde)

    fecha_hasta = filtros.get('fecha_hasta')
    if fecha_hasta:
        qs = qs.filter(fecha__lte=fecha_hasta)

    return qs


def obtener_beneficio_para_auditoria(id_beneficio: int) -> Any:
    """
    CU-69: Recupera el expediente técnico completo de una sugerencia o beneficio específico.
    Si no existe en el sistema, levanta ObjectDoesNotExist.
    """
    from sales_app.models import Beneficio

    beneficio = Beneficio.objects.select_related(
        'id_usuario',
        'id_usuario__perfilusuario',
        'id_usuario__id_rol',
        'id_producto',
        'id_producto__id_categoria'
    ).filter(id_beneficio=id_beneficio).first()

    if not beneficio:
        raise ObjectDoesNotExist(f"No se encontró el beneficio con ID {id_beneficio}.")
    return beneficio


# ==============================================================================
# CU-71: REVOCAR BENEFICIO ACTIVO (SELECTORS)
# ==============================================================================

def obtener_beneficio_para_revocacion(id_beneficio: int) -> Any:
    """
    CU-71: Recupera el beneficio objetivo para validar y procesar su revocación administrativa.
    Si no existe, levanta ObjectDoesNotExist.
    """
    from sales_app.models import Beneficio

    beneficio = Beneficio.objects.select_related(
        'id_usuario',
        'id_producto'
    ).filter(id_beneficio=id_beneficio).first()

    if not beneficio:
        raise ObjectDoesNotExist(f"No se encontró el beneficio solicitado con ID {id_beneficio}.")
    return beneficio


def beneficio_esta_activo(beneficio: Any) -> bool:
    """
    Verifica si un beneficio se encuentra activo y dentro de su ventana temporal de validez.
    """
    if not beneficio:
        return False
    if beneficio.motivo and '[REVOCADO]' in beneficio.motivo:
        return False
    if beneficio.tiempo_disp is not None and beneficio.tiempo_disp <= Decimal('0.00'):
        return False
    if not beneficio.fecha or beneficio.tiempo_disp is None:
        return False

    import math
    import datetime
    from django.utils import timezone
    horas = float(beneficio.tiempo_disp)
    dias = math.ceil(horas / 24.0)
    fecha_expiracion = beneficio.fecha + datetime.timedelta(days=dias)
    return timezone.now().date() <= fecha_expiracion


# ==============================================================================
# CU-75: GENERAR REPORTE DE DISTRIBUCIÓN GEOGRÁFICA Y LOGÍSTICA
# ==============================================================================

def calcular_reporte_logistico(
    *,
    fecha_inicio,
    fecha_fin,
    id_provincia: Optional[int] = None,
    id_ciudad: Optional[int] = None,
    estado_venta: Optional[str] = None,
    id_medio_pago: Optional[int] = None
) -> list[dict]:
    """
    CU-75: Generar Reporte de Distribución Geográfica y Logística (Motor Estadístico).
    Analiza la concentración territorial de las compras bajo modalidad e-commerce (Envío a domicilio),
    aislando la dirección unívoca sellada en cada venta.
    Calcula: volumen logístico, recaudación de fletes, facturación bruta y ticket promedio por territorio.
    - Excepción Paso 5: Si no existen transacciones de envío en el periodo o zona, levanta ValidationError.
    """
    from decimal import Decimal
    from django.db.models import Q
    from rest_framework.exceptions import ValidationError
    from sales_app.models import Venta

    ventas_qs = Venta.objects.filter(
        fecha_venta__gte=fecha_inicio,
        fecha_venta__lte=fecha_fin,
        id_direccion_envio__isnull=False
    ).filter(
        Q(metodo_entrega__iexact='ENVIO') |
        Q(metodo_entrega__icontains='ENVIO') |
        Q(metodo_entrega__icontains='DOMICILIO')
    )

    if id_provincia is not None:
        ventas_qs = ventas_qs.filter(id_direccion_envio__id_ciudad__id_provincia_id=id_provincia)

    if id_ciudad is not None:
        ventas_qs = ventas_qs.filter(id_direccion_envio__id_ciudad_id=id_ciudad)

    if estado_venta:
        ventas_qs = ventas_qs.filter(estado_venta__iexact=estado_venta.strip())

    if id_medio_pago is not None:
        # Una venta con varios pagos del mismo medio no debe contarse dos veces
        ventas_qs = ventas_qs.filter(pago__medio_pago_id=id_medio_pago).distinct()

    ventas_qs = ventas_qs.select_related(
        'id_direccion_envio',
        'id_direccion_envio__id_ciudad',
        'id_direccion_envio__id_ciudad__id_provincia'
    )

    # Excepción Paso 5: Sin operaciones logísticas en el periodo/zona
    if not ventas_qs.exists():
        raise ValidationError("En el periodo o zona consultada no existen ventas bajo modalidad de envío")

    grupos = {}
    for v in ventas_qs:
        dir_envio = v.id_direccion_envio
        ciudad = getattr(dir_envio, 'id_ciudad', None)
        provincia = getattr(ciudad, 'id_provincia', None) if ciudad else None

        prov_id = getattr(provincia, 'id_provincia', None) if provincia else None
        prov_nombre = getattr(provincia, 'nombre_provincia', 'Sin Provincia') if provincia else 'Sin Provincia'
        ciudad_id = getattr(ciudad, 'id_ciudad', None) if ciudad else None
        ciudad_nombre = getattr(ciudad, 'nombre_ciudad', 'Sin Ciudad') if ciudad else 'Sin Ciudad'

        key = (prov_id, ciudad_id)
        if key not in grupos:
            grupos[key] = {
                "id_provincia": prov_id,
                "nombre_provincia": prov_nombre,
                "id_ciudad": ciudad_id,
                "nombre_ciudad": ciudad_nombre,
                "volumen_envios": 0,
                "recaudacion_logistica": Decimal('0.00'),
                "facturacion_bruta": Decimal('0.00'),
            }

        costo_env = Decimal(str(v.costo_envio or '0.00'))
        subtotal = Decimal(str(v.monto_subtotal or '0.00'))
        total_op = subtotal + costo_env

        grupos[key]["volumen_envios"] += 1
        grupos[key]["recaudacion_logistica"] += costo_env
        grupos[key]["facturacion_bruta"] += total_op

    resultado = []
    for g in grupos.values():
        vol = g["volumen_envios"]
        fact = g["facturacion_bruta"]
        ticket_prom = round(fact / Decimal(str(vol)), 2) if vol > 0 else Decimal('0.00')

        resultado.append({
            "id_provincia": g["id_provincia"],
            "nombre_provincia": g["nombre_provincia"],
            "id_ciudad": g["id_ciudad"],
            "nombre_ciudad": g["nombre_ciudad"],
            "volumen_envios": vol,
            "recaudacion_logistica": g["recaudacion_logistica"],
            "facturacion_bruta": fact,
            "ticket_promedio": ticket_prom,
        })

    # Ordenar por volumen logístico descendente
    resultado.sort(key=lambda x: x["volumen_envios"], reverse=True)
    return resultado


def obtener_medios_pago(*, solo_activos: bool = False) -> QuerySet[MedioPago]:
    """
    Recupera los medios de pago configurados en el sistema (CU-18, CU-82, CU-83).
    """
    qs = MedioPago.objects.all().order_by('id_mediopago')
    if solo_activos:
        qs = qs.filter(estado=True)
    return qs


def calcular_costo_envio_sistema(id_direccion: Optional[int] = None, id_ciudad: Optional[int] = None) -> dict:
    """
    Calcula el costo de entrega / flete según la Configuración del Sistema (ConfiguracionSistema):
    - envioLocal: Ciudad sede central (Posadas)
    - envioRegional: Misma provincia, distinta ciudad
    - envioNacional: Otra provincia
    Acepta 'id_direccion' (dirección guardada) o 'id_ciudad' (para cotización directa de invitados).
    """
    from core_app.models import ConfiguracionSistema
    from geo_app.models import Direccion, Ciudad

    def _obtener_decimal(clave: str, fallback: str = '0.00') -> Decimal:
        cfg = ConfiguracionSistema.objects.filter(clave=clave).first()
        val = cfg.valor if cfg and cfg.valor else fallback
        try:
            return Decimal(str(val).strip().replace(',', '.'))
        except Exception:
            return Decimal(fallback)

    tarifa_local = _obtener_decimal('envioLocal', '0.00')
    tarifa_regional = _obtener_decimal('envioRegional', '0.00')
    tarifa_nacional = _obtener_decimal('envioNacional', '0.00')

    tarifas_dict = {
        'local': tarifa_local,
        'regional': tarifa_regional,
        'nacional': tarifa_nacional
    }

    ciudad_destino = None
    if id_direccion:
        direccion_destino = Direccion.objects.select_related(
            'id_ciudad__id_provincia'
        ).filter(id_direccion=id_direccion).first()
        if direccion_destino and direccion_destino.id_ciudad:
            ciudad_destino = direccion_destino.id_ciudad
    elif id_ciudad:
        ciudad_destino = Ciudad.objects.select_related('id_provincia').filter(id_ciudad=id_ciudad).first()

    if not ciudad_destino:
        return {
            'costo': tarifa_local,
            'tipo': 'local',
            'descripcion': 'Tarifa Base de Entrega Local',
            'tarifas': tarifas_dict
        }

    # Dirección de la sede central configurada
    cfg_sede = ConfiguracionSistema.objects.filter(clave='direccionLocal').first()
    id_sede = int(cfg_sede.valor) if cfg_sede and cfg_sede.valor and cfg_sede.valor.isdigit() else None
    direccion_sede = Direccion.objects.select_related(
        'id_ciudad__id_provincia'
    ).filter(id_direccion=id_sede).first() if id_sede else None

    if not direccion_sede or not direccion_sede.id_ciudad:
        return {
            'costo': tarifa_local,
            'tipo': 'local',
            'descripcion': 'Tarifa de Entrega Local',
            'tarifas': tarifas_dict
        }

    id_ciudad_dest = getattr(ciudad_destino, 'id_ciudad', None)
    id_ciudad_sede = getattr(direccion_sede.id_ciudad, 'id_ciudad', None)

    id_provincia_dest = getattr(ciudad_destino, 'id_provincia_id', None)
    id_provincia_sede = getattr(direccion_sede.id_ciudad, 'id_provincia_id', None)

    if id_ciudad_dest and id_ciudad_sede and id_ciudad_dest == id_ciudad_sede:
        return {
            'costo': tarifa_local,
            'tipo': 'local',
            'descripcion': f"Envío Local ({ciudad_destino.nombre_ciudad})",
            'tarifas': tarifas_dict
        }
    elif id_provincia_dest and id_provincia_sede and id_provincia_dest == id_provincia_sede:
        costo = tarifa_regional if tarifa_regional > Decimal('0.00') else tarifa_local
        nombre_prov = ciudad_destino.id_provincia.nombre_provincia if ciudad_destino.id_provincia else ''
        return {
            'costo': costo,
            'tipo': 'regional',
            'descripcion': f"Envío Regional ({nombre_prov})",
            'tarifas': tarifas_dict
        }
    else:
        costo = tarifa_nacional if tarifa_nacional > Decimal('0.00') else (tarifa_regional if tarifa_regional > Decimal('0.00') else tarifa_local)
        return {
            'costo': costo,
            'tipo': 'nacional',
            'descripcion': "Envío Nacional (Resto del país)",
            'tarifas': tarifas_dict
        }


def obtener_venta_pendiente_activa(usuario) -> Optional[dict]:
    """
    Recupera si el usuario cliente posee una venta en estado PENDIENTE con reserva temporal
    de stock vigente (menos de 30 minutos). Permite retomar la compra o cancelar voluntariamente.
    """
    import datetime
    from django.utils import timezone
    from core_app.models import LogSistema
    from sales_app.services import limpiar_ventas_pendientes_expiradas, crear_preferencia_mercadopago

    limpiar_ventas_pendientes_expiradas(minutos_limite=30)

    id_u = getattr(usuario, 'id_usuario', getattr(usuario, 'pk', None))
    venta = Venta.objects.filter(
        id_usuario_id=id_u,
        estado_venta__iexact='PENDIENTE'
    ).select_related(
        'id_direccion_envio__id_ciudad__id_provincia'
    ).prefetch_related(
        'detalleventa_set__id_producto'
    ).order_by('-id_venta').first()

    if not venta:
        return None

    ahora = timezone.now()
    fecha_hoy = ahora.date()
    if venta.fecha_venta < fecha_hoy:
        return None

    log_creacion = LogSistema.objects.filter(
        modulo_origen='sales_app',
        tabla_afectada='venta',
        id_registro_afectado=str(venta.id_venta),
        accion="Realizar Compra Virtual (CU-18)"
    ).first()

    if not log_creacion or not log_creacion.fecha_hora:
        segundos_transcurridos = 0
    else:
        hora_log = log_creacion.fecha_hora
        if isinstance(hora_log, datetime.datetime):
            dt_creacion = hora_log
        elif isinstance(hora_log, datetime.time):
            dt_creacion = datetime.datetime.combine(venta.fecha_venta, hora_log)
        else:
            dt_creacion = ahora
        if timezone.is_naive(dt_creacion):
            dt_creacion = timezone.make_aware(dt_creacion, timezone.get_current_timezone())
        segundos_transcurridos = (ahora - dt_creacion).total_seconds()

    minutos_limite = 30
    total_segundos = minutos_limite * 60
    segundos_restantes = max(0, int(total_segundos - segundos_transcurridos))

    if segundos_restantes <= 0:
        limpiar_ventas_pendientes_expiradas(minutos_limite=30)
        return None

    # Obtener o recrear link de pago Mercado Pago si es necesario
    url_pago = None
    pref_id = None
    try:
        pref = crear_preferencia_mercadopago(venta=venta, usuario=usuario)
        url_pago = pref.get('init_point') or pref.get('sandbox_init_point')
        pref_id = pref.get('preference_id')
    except Exception:
        pass

    detalles = []
    for d in venta.detalleventa_set.all():
        detalles.append({
            'id_producto': d.id_producto.id_producto,
            'producto_nombre': d.id_producto.nombre,
            'cantidad': d.cantidad,
            'precio_unitario': d.precio_unitario,
            'subtotal': d.subtotal
        })

    monto_subtotal = Decimal(str(venta.monto_subtotal or '0.00'))
    costo_envio = Decimal(str(venta.costo_envio or '0.00'))
    total_final = monto_subtotal + costo_envio

    return {
        'id_venta': venta.id_venta,
        'codigo_sec': venta.codigo_sec,
        'estado_venta': venta.estado_venta,
        'metodo_entrega': venta.metodo_entrega,
        'monto_subtotal': monto_subtotal,
        'costo_envio': costo_envio,
        'total': total_final,
        'segundos_restantes': segundos_restantes,
        'preference_id': pref_id,
        'init_point': url_pago,
        'detalles': detalles
    }


def obtener_factura_pdf_venta(*, id_venta: int, usuario: Any) -> Tuple[str, str]:
    """
    Recupera la ruta absoluta en disco del archivo PDF de la factura correspondiente
    a una venta acreditada y pagada. Si el PDF físico no existe, lo genera en el momento.
    Verifica que el usuario sea el comprador titular o pertenezca a la administración.
    Retorna: (ruta_absoluta, nombre_descarga)
    """
    import os
    from django.conf import settings
    from django.core.exceptions import ValidationError
    from sales_app.models import Venta, Pago, MedioPago
    from sales_app.services import generar_comprobante_fiscal

    try:
        venta = Venta.objects.select_related('id_usuario').get(id_venta=id_venta)
    except Venta.DoesNotExist:
        raise ValidationError("La orden de compra especificada no existe.")

    id_user_venta = getattr(venta.id_usuario, 'id_usuario', getattr(venta.id_usuario, 'pk', None))
    id_user_req = getattr(usuario, 'id_usuario', getattr(usuario, 'pk', None))
    rol = getattr(usuario, 'id_rol', None) or getattr(usuario, 'rol', None)
    es_admin = (getattr(rol, 'codigo', '') or '').upper() in ['ADMIN', 'GERENTE']

    if id_user_venta != id_user_req and not es_admin:
        raise ValidationError("No posees autorización para acceder a este comprobante.")

    # Buscar el pago asociado a la venta
    pago = Pago.objects.filter(id_venta=venta).order_by('-id_pago').first()
    if not pago:
        if str(venta.estado_venta or '').upper() == 'PAGADA':
            medio_mp = MedioPago.objects.filter(nombre_medio_pago__icontains='Mercado Pago').first()
            pago = Pago.objects.create(
                id_venta=venta,
                medio_pago=medio_mp,
                monto_pagado=venta.monto_subtotal + venta.costo_envio,
                fecha_pago=venta.fecha_venta,
                detalle="Pago registrado por compra virtual"
            )
        else:
            raise ValidationError("La orden de compra aún no registra un pago acreditado para emitir factura.")

    # Verificar existencia del PDF físico
    ruta_rel = pago.ruta_comprobante
    ruta_abs = None
    if ruta_rel:
        filename = os.path.basename(ruta_rel)
        ruta_abs = os.path.join(settings.MEDIA_ROOT, 'facturas', filename)

    if not ruta_abs or not os.path.exists(ruta_abs):
        ruta_rel = generar_comprobante_fiscal(pago, venta)
        filename = os.path.basename(ruta_rel)
        ruta_abs = os.path.join(settings.MEDIA_ROOT, 'facturas', filename)

    codigo_doc = venta.codigo_sec or f"VTA-{venta.id_venta}"
    nombre_descarga = f"Factura_{codigo_doc}.pdf"
    return ruta_abs, nombre_descarga








# ==============================================================================
# MOTOR INTELIGENTE DE BENEFICIOS Y FIDELIZACIÓN (SELECTORS)
# ==============================================================================

def obtener_beneficios_activos_cliente(id_usuario: int) -> list:
    """
    Recupera la lista de beneficios y cupones actualmente activos y canjeables
    para un cliente específico, aplicando select_related para evitar consultas N+1.
    """
    from sales_app.models import Beneficio
    from users_app.models import Usuario
    from django.utils import timezone
    from decimal import Decimal
    import math
    import datetime

    if not id_usuario:
        return []

    # Consumidor final nunca posee beneficios comerciales
    usr = Usuario.objects.filter(id_usuario=id_usuario).only('email').first()
    if usr and ('consumidorfinal' in (usr.email or '').lower()):
        return []

    beneficios = Beneficio.objects.select_related(
        'id_producto',
        'id_producto__id_categoria',
        'id_producto__id_modelo'
    ).filter(
        id_usuario_id=id_usuario
    ).order_by('-fecha', '-id_beneficio')

    activos = []
    hoy = timezone.now().date()
    for b in beneficios:
        if b.motivo and '[REVOCADO]' in b.motivo:
            continue
        if b.tiempo_disp is not None and b.tiempo_disp <= Decimal('0.00'):
            continue
        if not b.fecha or b.tiempo_disp is None:
            continue
        dias = math.ceil(float(b.tiempo_disp) / 24.0)
        if hoy <= b.fecha + datetime.timedelta(days=dias):
            activos.append(b)
    return activos


def obtener_historial_beneficios_cliente(id_usuario: int):
    """
    Recupera el expediente completo de beneficios del cliente para la pestaña de perfil.
    """
    from sales_app.models import Beneficio
    from users_app.models import Usuario
    if not id_usuario:
        return Beneficio.objects.none()

    # Consumidor final nunca posee beneficios comerciales
    usr = Usuario.objects.filter(id_usuario=id_usuario).only('email').first()
    if usr and ('consumidorfinal' in (usr.email or '').lower()):
        return Beneficio.objects.none()

    return Beneficio.objects.select_related(
        'id_producto',
        'id_producto__id_categoria',
        'id_producto__id_modelo'
    ).filter(
        id_usuario_id=id_usuario
    ).order_by('-fecha', '-id_beneficio')


def obtener_beneficios_aplicados_en_venta(id_venta: int) -> list:
    """
    Recupera y desglosa los cupones que fueron canjeados en una venta específica
    para renderizar el ahorro discriminado en facturas y comprobantes.
    """
    from sales_app.models import Beneficio
    if not id_venta:
        return []

    tag = f"[CANJEADO - Venta #{id_venta}"
    beneficios = Beneficio.objects.select_related(
        'id_producto'
    ).filter(motivo__contains=tag)

    resultado = []
    for b in beneficios:
        nombre_item = b.id_producto.nombre if b.id_producto else "Descuento General"
        resultado.append({
            'id_beneficio': b.id_beneficio,
            'por_desc': float(b.por_desc or 0),
            'id_producto': b.id_producto_id,
            'producto_nombre': nombre_item,
            'motivo': b.motivo
        })
    return resultado


def obtener_metricas_motor_beneficios() -> dict:
    """
    Retorna métricas consolidadas del motor de beneficios para el panel administrativo y depuración.
    """
    from sales_app.models import Beneficio
    from core_app.selectors import (
        obtener_configuracion_bool,
        obtener_configuracion_int,
        obtener_configuracion_decimal
    )
    from django.utils import timezone
    from decimal import Decimal

    hoy = timezone.now().date()
    inicio_mes = hoy.replace(day=1)

    todos = Beneficio.objects.all()
    total_emitidos = todos.count()
    emitidos_mes = todos.filter(fecha__gte=inicio_mes).count()

    canjeados = 0
    activos = 0
    caducados = 0

    for b in todos:
        st = b.estado
        if '[CANJEADO' in (b.motivo or ''):
            canjeados += 1
        elif st == 'ACTIVO':
            activos += 1
        else:
            caducados += 1

    tasa_conversion = round((canjeados / total_emitidos * 100.0), 2) if total_emitidos > 0 else 0.0

    return {
        'motor_activo': obtener_configuracion_bool('motorBeneficiosActivo'),
        'limite_promociones_mensual': obtener_configuracion_int('limitePromocionesMensual', 15),
        'beneficios_emitidos_mes': emitidos_mes,
        'porcentaje_descuento_maximo': float(obtener_configuracion_decimal('porcentajeDescuentoMaximo', Decimal('5.0'))),
        'periodo_refrigerio_dias': obtener_configuracion_int('periodoRefrigerioCliente', 7),
        'vigencia_defecto_horas': float(obtener_configuracion_decimal('vigenciaBeneficioDefecto', Decimal('72.0'))),
        'total_historico': total_emitidos,
        'total_activos': activos,
        'total_canjeados': canjeados,
        'total_caducados': caducados,
        'tasa_conversion_porcentaje': tasa_conversion
    }
