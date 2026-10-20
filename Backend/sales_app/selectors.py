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
