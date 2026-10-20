import uuid
from decimal import Decimal
from typing import Dict, Any, Optional

from django.db import transaction
from django.db.models import Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.core.exceptions import ValidationError

from sales_app.models import Venta, DetalleVenta, CarritoCompra, CarritoProducto
from inventory_app.models import Stock, MovimientoStock
from geo_app.models import Direccion
from core_app.models import LogSistema, ConfiguracionSistema
from users_app.models import Usuario

TIPOS_INGRESO = ['ingreso', 'compra', 'devolucion', 'alta', 'entrada']
TIPOS_EGRESO = ['egreso', 'venta', 'taller', 'baja', 'salida', 'consumo']


@transaction.atomic
def procesar_compra_virtual(
    *,
    usuario_cliente: Usuario,
    datos_compra: Dict[str, Any]
) -> Venta:
    """
    CU-18: Realizar Compra Virtual.
    Procesa de manera atómica la transacción de checkout virtual:
    1. Recupera el carrito activo del cliente.
    2. Bloquea filas de stock (select_for_update) y valida disponibilidad en tiempo real.
    3. Crea la cabecera de la Venta en estado PENDIENTE.
    4. Congela los ítems en DetalleVenta con precio unitario inmutable y descuenta el stock en MovimientoStock.
    5. Vacía el carrito, lo marca finalizado y registra la auditoría en LogSistema.
    """
    # -------------------------------------------------------------------------
    # Paso 1: Recuperar Carrito y Validar que no esté vacío
    # -------------------------------------------------------------------------
    carrito = CarritoCompra.objects.filter(
        id_usuario=usuario_cliente,
        estado__iexact='activo'
    ).order_by('-id_carrito').first()

    if not carrito:
        carrito = CarritoCompra.objects.filter(
            id_usuario=usuario_cliente
        ).exclude(estado__iexact='finalizado').order_by('-id_carrito').first()

    if not carrito:
        raise ValidationError("El usuario no posee un carrito de compras activo.")

    items_carrito = list(
        CarritoProducto.objects.filter(id_carrito=carrito).select_related('id_producto')
    )

    if not items_carrito:
        raise ValidationError("El carrito de compras está vacío.")

    # -------------------------------------------------------------------------
    # Paso 2: Verificación de Stock en Tiempo Real con Bloqueo de Fila (select_for_update)
    # -------------------------------------------------------------------------
    stocks_bloqueados = {}
    for item in items_carrito:
        prod = item.id_producto
        cant_solicitada = int(item.cantidad or 1)
        if cant_solicitada <= 0:
            raise ValidationError(f"La cantidad solicitada para '{prod.nombre}' debe ser mayor a cero.")

        # Bloquear fila de Stock para evitar condiciones de carrera (Race Conditions)
        stock = Stock.objects.select_for_update().filter(id_producto=prod).first()
        if not stock:
            raise ValidationError(f"El producto '{prod.nombre}' no tiene inventario inicial configurado.")

        # Calcular stock disponible sumando ingresos y restando egresos
        ingresos = MovimientoStock.objects.filter(
            id_stock=stock,
            tipo_movimiento__in=TIPOS_INGRESO
        ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

        egresos = MovimientoStock.objects.filter(
            id_stock=stock,
            tipo_movimiento__in=TIPOS_EGRESO
        ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

        stock_disponible = int(ingresos - egresos)

        if cant_solicitada > stock_disponible:
            raise ValidationError(
                f"Sin stock suficiente para el producto '{prod.nombre}'. "
                f"Disponible: {stock_disponible}, solicitado: {cant_solicitada}."
            )

        stocks_bloqueados[prod.id_producto] = stock

    # -------------------------------------------------------------------------
    # Paso 3: Crear Venta Cabecera
    # -------------------------------------------------------------------------
    metodo_entrega = str(datos_compra.get('metodo_entrega') or 'RETIRO').strip().upper()
    direccion_envio = datos_compra.get('id_direccion_envio')
    if isinstance(direccion_envio, int):
        direccion_envio = Direccion.objects.get(id_direccion=direccion_envio)

    # Calcular subtotal acumulado
    monto_subtotal = Decimal('0.00')
    for item in items_carrito:
        precio_prod = Decimal(str(item.id_producto.precio_venta))
        monto_subtotal += precio_prod * Decimal(str(item.cantidad or 1))

    # Determinar costo de envío
    costo_envio = Decimal('0.00')
    if metodo_entrega == 'ENVIO':
        config_envio = ConfiguracionSistema.objects.filter(clave='envioLocal').first()
        if config_envio and config_envio.valor:
            val_limpio = config_envio.valor.strip().replace(',', '.')
            try:
                costo_envio = Decimal(val_limpio)
            except Exception:
                costo_envio = Decimal('0.00')

    codigo_seguridad = uuid.uuid4().hex[:10].upper()

    venta = Venta.objects.create(
        id_usuario=usuario_cliente,
        metodo_entrega=metodo_entrega,
        fecha_venta=timezone.now().date(),
        estado_venta='PENDIENTE',
        codigo_sec=codigo_seguridad,
        monto_subtotal=monto_subtotal,
        costo_envio=costo_envio,
        id_direccion_envio=direccion_envio if metodo_entrega == 'ENVIO' else None
    )

    # -------------------------------------------------------------------------
    # Paso 4: Congelar DetalleVenta y Reducir Stock (MovimientoStock)
    # -------------------------------------------------------------------------
    for item in items_carrito:
        prod = item.id_producto
        cant = int(item.cantidad or 1)
        precio_unit = Decimal(str(prod.precio_venta))
        subtotal_renglon = precio_unit * Decimal(str(cant))

        # Congelar renglón de venta con precio inmutable
        DetalleVenta.objects.create(
            id_venta=venta,
            id_producto=prod,
            cantidad=cant,
            precio_unitario=precio_unit,
            subtotal=subtotal_renglon
        )

        # Reducir stock registrando el movimiento de salida
        stock = stocks_bloqueados[prod.id_producto]
        MovimientoStock.objects.create(
            id_stock=stock,
            tipo_movimiento='venta',
            cantidad=cant,
            fecha=timezone.now().date(),
            motivo=f"Egreso por Venta Virtual #{venta.id_venta}",
            uso_taller=False,
            id_venta=venta
        )

    # -------------------------------------------------------------------------
    # Paso 5: Limpieza de Carrito y Auditoría del Sistema
    # -------------------------------------------------------------------------
    # Vaciar los productos del carrito y marcarlo como finalizado
    CarritoProducto.objects.filter(id_carrito=carrito).delete()
    carrito.estado = 'finalizado'
    carrito.save(update_fields=['estado'])

    # Auditoría en LogSistema
    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
        accion="Realizar Compra Virtual (CU-18)",
        detalle=(
            f"Venta #{venta.id_venta} registrada para el usuario {usuario_cliente.email}. "
            f"Items: {len(items_carrito)}, Subtotal: ${monto_subtotal}, Envio: ${costo_envio}, "
            f"Entrega: {metodo_entrega}."
        )[:1000],
        tipo="AUDITORIA_VENTA",
        modulo_origen="sales_app",
        tabla_afectada="venta",
        id_registro_afectado=str(venta.id_venta),
        id_usuario=usuario_cliente
    )

    return venta


@transaction.atomic
def agregar_producto_a_carrito(
    *,
    usuario: Usuario,
    id_producto: int,
    cantidad: int = 1
) -> Dict[str, Any]:
    """
    Agrega un producto al carrito activo del usuario cliente validando stock en tiempo real.
    """
    from catalog_app.models import Producto

    try:
        producto = Producto.objects.get(id_producto=id_producto)
    except Producto.DoesNotExist:
        raise ValidationError("El producto seleccionado no existe.")

    if not producto.estado or not producto.apto_venta:
        raise ValidationError(f"El producto '{producto.nombre}' no se encuentra disponible para venta.")

    if cantidad <= 0:
        raise ValidationError("La cantidad a agregar debe ser mayor a cero.")

    # Mutex sobre la fila Stock
    stock = Stock.objects.select_for_update().filter(id_producto=producto).first()
    if not stock:
        raise ValidationError(f"El producto '{producto.nombre}' no posee stock configurado.")

    ingresos = MovimientoStock.objects.filter(
        id_stock=stock,
        tipo_movimiento__in=TIPOS_INGRESO
    ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

    egresos = MovimientoStock.objects.filter(
        id_stock=stock,
        tipo_movimiento__in=TIPOS_EGRESO
    ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

    stock_disponible = int(ingresos - egresos)

    if stock_disponible <= 0:
        raise ValidationError(f"El producto '{producto.nombre}' se encuentra agotado.")

    carrito, _ = CarritoCompra.objects.get_or_create(
        id_usuario=usuario,
        estado='activo',
        defaults={'fecha_creacion': timezone.now().date()}
    )

    item = CarritoProducto.objects.filter(
        id_carrito=carrito,
        id_producto=producto
    ).first()

    cantidad_previa = int(item.cantidad or 0) if item else 0
    nueva_cantidad = cantidad_previa + int(cantidad)

    if nueva_cantidad > stock_disponible:
        raise ValidationError(
            f"Sin stock suficiente para '{producto.nombre}'. "
            f"Disponible: {stock_disponible}, en tu carrito: {cantidad_previa}, solicitas: {cantidad}."
        )

    if item:
        item.cantidad = nueva_cantidad
        item.save(update_fields=['cantidad'])
    else:
        item = CarritoProducto.objects.create(
            id_carrito=carrito,
            id_producto=producto,
            cantidad=nueva_cantidad
        )

    total_articulos = CarritoProducto.objects.filter(
        id_carrito=carrito
    ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

    return {
        'id_carrito': carrito.id_carrito,
        'id_carrito_producto': item.id_carrito_producto,
        'id_producto': producto.id_producto,
        'producto_nombre': producto.nombre,
        'cantidad_agregada': cantidad,
        'cantidad_total_item': item.cantidad,
        'total_articulos_carrito': total_articulos,
        'stock_disponible': stock_disponible
    }
