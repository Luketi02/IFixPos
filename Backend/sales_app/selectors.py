from decimal import Decimal
from typing import Optional
from django.db.models import QuerySet
from sales_app.models import Venta, CarritoCompra, CarritoProducto


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

    if not id_usuario:
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
    venta = Venta.objects.filter(
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
    reparacion = Reparacion.objects.filter(
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


