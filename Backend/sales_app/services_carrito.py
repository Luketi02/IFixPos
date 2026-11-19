from __future__ import annotations

from typing import Dict, Any, Optional
from django.db import transaction
from django.db.models import Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.core.exceptions import ValidationError

from sales_app.models import CarritoCompra, CarritoProducto
from catalog_app.models import Producto
from inventory_app.models import Stock, MovimientoStock
from users_app.models import Usuario

TIPOS_INGRESO = ['ingreso', 'compra', 'devolucion', 'alta', 'entrada']
TIPOS_EGRESO = ['egreso', 'venta', 'taller', 'baja', 'salida', 'consumo']


def _obtener_o_crear_carrito_activo(usuario: Usuario) -> CarritoCompra:
    """
    Recupera el carrito activo del usuario garantizando unicidad estricta (1 carrito por cliente).
    - Si existen múltiples carritos activos residuales, consolida todos sus ítems en el principal
      y elimina los carritos duplicados para no romper el flujo de venta virtual.
    - Si no existe carrito activo pero el usuario posee un carrito histórico ('finalizado'/'abandonado'),
      lo reactiva limpiamente y elimina cualquier duplicado excedente.
    - Si no existe ningún registro previo, crea un único carrito activo nuevo.
    """
    carritos_activos = list(
        CarritoCompra.objects.filter(
            id_usuario=usuario,
            estado__iexact='activo'
        ).order_by('-id_carrito')
    )

    if carritos_activos:
        carrito_principal = carritos_activos[0]
        if carrito_principal.estado != 'activo':
            carrito_principal.estado = 'activo'
            carrito_principal.save(update_fields=['estado'])

        for dup in carritos_activos[1:]:
            for item_dup in list(dup.carritoproducto_set.all()):
                item_existente = CarritoProducto.objects.filter(
                    id_carrito=carrito_principal,
                    id_producto_id=item_dup.id_producto_id
                ).first()
                if item_existente:
                    item_existente.cantidad += item_dup.cantidad
                    item_existente.save(update_fields=['cantidad'])
                else:
                    CarritoProducto.objects.create(
                        id_carrito=carrito_principal,
                        id_producto_id=item_dup.id_producto_id,
                        cantidad=item_dup.cantidad
                    )
            dup.delete()

        # Eliminar también cualquier otro carrito inactivo antiguo del usuario para mantener 1 solo registro
        CarritoCompra.objects.filter(id_usuario=usuario).exclude(
            id_carrito=carrito_principal.id_carrito
        ).delete()
        return carrito_principal

    # Si no hay carrito activo, reutilizar el carrito existente del usuario si lo hubiera
    carritos_existentes = list(
        CarritoCompra.objects.filter(id_usuario=usuario).order_by('-id_carrito')
    )
    if carritos_existentes:
        carrito_reutilizado = carritos_existentes[0]
        CarritoProducto.objects.filter(id_carrito=carrito_reutilizado).delete()
        carrito_reutilizado.estado = 'activo'
        carrito_reutilizado.fecha_creacion = timezone.now().date()
        carrito_reutilizado.save(update_fields=['estado', 'fecha_creacion'])

        for viejo in carritos_existentes[1:]:
            viejo.delete()
        return carrito_reutilizado

    return CarritoCompra.objects.create(
        id_usuario=usuario,
        estado='activo',
        fecha_creacion=timezone.now().date()
    )


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
    try:
        producto = Producto.objects.get(id_producto=id_producto)
    except Producto.DoesNotExist:
        raise ValidationError("El producto seleccionado no existe.")

    if not producto.estado or not producto.apto_venta:
        raise ValidationError(f"El producto '{producto.nombre}' no se encuentra disponible para venta.")

    if cantidad <= 0:
        raise ValidationError("La cantidad a agregar debe ser mayor a cero.")

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

    carrito = _obtener_o_crear_carrito_activo(usuario)

    item = CarritoProducto.objects.select_for_update().filter(
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


@transaction.atomic
def quitar_producto_de_carrito(
    *,
    usuario,
    id_producto: int,
    cantidad: Optional[int] = None
) -> dict:
    """
    Elimina o decrementa un producto del carrito activo del usuario.
    Si 'cantidad' es None o mayor/igual a la cantidad actual, se elimina el registro por completo.
    """
    try:
        producto = Producto.objects.get(id_producto=id_producto)
    except Producto.DoesNotExist:
        raise ValidationError("El producto especificado no existe.")

    carrito = _obtener_o_crear_carrito_activo(usuario)

    item = CarritoProducto.objects.select_for_update().filter(
        id_carrito=carrito,
        id_producto=producto
    ).first()

    if not item:
        raise ValidationError(f"El producto '{producto.nombre}' no se encuentra en el carrito.")

    cant_actual = int(item.cantidad or 0)
    eliminado_completo = False
    cant_restante = 0

    if cantidad is None or cantidad >= cant_actual:
        item.delete()
        eliminado_completo = True
    else:
        cant_restante = cant_actual - int(cantidad)
        item.cantidad = cant_restante
        item.save(update_fields=['cantidad'])

    total_articulos = CarritoProducto.objects.filter(
        id_carrito=carrito
    ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

    return {
        'id_carrito': carrito.id_carrito,
        'id_producto': producto.id_producto,
        'producto_nombre': producto.nombre,
        'eliminado_completo': eliminado_completo,
        'cantidad_restante_item': cant_restante,
        'total_articulos_carrito': total_articulos
    }


@transaction.atomic
def actualizar_cantidad_producto_carrito(
    *,
    usuario: Usuario,
    id_producto: int,
    cantidad: int
) -> Dict[str, Any]:
    """
    Fija de forma absoluta la cantidad de un producto en el carrito activo del usuario.
    Si cantidad <= 0, elimina el producto del carrito.
    Si cantidad > 0, valida stock disponible con select_for_update y actualiza la cantidad fija.
    """
    try:
        producto = Producto.objects.get(id_producto=id_producto)
    except Producto.DoesNotExist:
        raise ValidationError("El producto especificado no existe.")

    carrito = _obtener_o_crear_carrito_activo(usuario)

    item = CarritoProducto.objects.select_for_update().filter(
        id_carrito=carrito,
        id_producto=producto
    ).first()

    eliminado = False
    cant_final = 0

    if cantidad <= 0:
        if item:
            item.delete()
        eliminado = True
        cant_final = 0
    else:
        if not producto.estado or not producto.apto_venta:
            raise ValidationError(f"El producto '{producto.nombre}' no se encuentra disponible para venta.")

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

        if cantidad > stock_disponible:
            raise ValidationError(
                f"Sin stock suficiente para '{producto.nombre}'. "
                f"Disponible: {stock_disponible}, solicitas: {cantidad}."
            )

        if item:
            item.cantidad = int(cantidad)
            item.save(update_fields=['cantidad'])
        else:
            item = CarritoProducto.objects.create(
                id_carrito=carrito,
                id_producto=producto,
                cantidad=int(cantidad)
            )
        eliminado = False
        cant_final = item.cantidad

    total_articulos = CarritoProducto.objects.filter(
        id_carrito=carrito
    ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

    return {
        'id_carrito': carrito.id_carrito,
        'id_producto': producto.id_producto,
        'producto_nombre': producto.nombre,
        'eliminado': eliminado,
        'cantidad': cant_final,
        'total_articulos_carrito': total_articulos
    }

