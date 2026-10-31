from typing import Optional, Any
from django.db.models import QuerySet, Q, Sum, Case, When, F, Value, IntegerField
from django.db.models.functions import Coalesce
from django.core.exceptions import PermissionDenied

from catalog_app.models import Producto
from inventory_app.models import Stock, MovimientoStock
from users_app.models import Usuario

TIPOS_INGRESO = ['ingreso', 'compra', 'devolucion', 'alta', 'entrada', 'ingreso_compra', 'INGRESO_COMPRA']
TIPOS_EGRESO = ['egreso', 'venta', 'taller', 'baja', 'salida', 'consumo']


def obtener_stock_actual_producto(id_producto: int) -> int:
    """
    Calcula la cantidad física disponible en inventario para un producto específico,
    restando la sumatoria de egresos de la sumatoria de ingresos en MovimientoStock.
    """
    ingresos = MovimientoStock.objects.filter(
        id_stock__id_producto_id=id_producto,
        tipo_movimiento__in=TIPOS_INGRESO
    ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

    egresos = MovimientoStock.objects.filter(
        id_stock__id_producto_id=id_producto,
        tipo_movimiento__in=TIPOS_EGRESO
    ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

    return int(ingresos - egresos)


def obtener_stock_por_producto(id_producto: int) -> Optional[Stock]:
    """
    Recupera el registro de Stock maestro asociado a un producto.
    """
    return Stock.objects.filter(id_producto_id=id_producto).first()


def obtener_stock_producto(id_producto: int) -> Stock:
    """
    Retorna la instancia de Stock asociada al producto, levantando excepción si no existe.
    """
    from django.core.exceptions import ObjectDoesNotExist
    stock = Stock.objects.select_related('id_producto').filter(id_producto_id=id_producto).first()
    if not stock:
        raise ObjectDoesNotExist(f"No existe registro de stock para el producto con ID {id_producto}.")
    return stock


def filtrar_stock_inventario(
    *,
    usuario: Usuario,
    texto_busqueda: Optional[str] = None,
    nivel_stock: Optional[str] = None,
    id_categoria: Optional[int] = None,
    id_proveedor: Optional[Any] = None,
    proposito: Optional[str] = None
) -> QuerySet[Producto]:
    """
    CU-35: Filtrar Stock e Inventario.
    Permite auditar existencias y consultar el inventario físico con filtros por
    categoría, proveedor, nivel de stock y propósito operativo.

    Seguridad: Exclusivo para usuarios con rol 'ADMIN' o 'TECNICO'.
    """
    # 1. Verificación de Seguridad Horizontal / Rol
    rol = getattr(usuario, 'id_rol', None) or getattr(usuario, 'rol', None)
    codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
    if codigo_rol not in ['ADMIN', 'TECNICO']:
        raise PermissionDenied("No tienes permisos suficientes para auditar el stock e inventario.")

    # 2. Construcción de QuerySet base con cálculo dinámico de cantidad_actual
    total_ingresos = Coalesce(
        Sum(
            Case(
                When(stock__movimientostock__tipo_movimiento__in=TIPOS_INGRESO, then=F('stock__movimientostock__cantidad')),
                default=Value(0),
                output_field=IntegerField()
            )
        ),
        Value(0)
    )

    total_egresos = Coalesce(
        Sum(
            Case(
                When(stock__movimientostock__tipo_movimiento__in=TIPOS_EGRESO, then=F('stock__movimientostock__cantidad')),
                default=Value(0),
                output_field=IntegerField()
            )
        ),
        Value(0)
    )

    qs = Producto.objects.select_related(
        'id_categoria',
        'id_modelo',
        'id_modelo__id_marca',
        'id_modelo__id_tipo_dispositivo'
    ).exclude(
        descripcion__startswith='[SONDEO_MANUAL]'
    ).annotate(
        id_stock=F('stock__id_stock'),
        stock_minimo=Coalesce(F('stock__stock_minimo'), Value(0)),
        cantidad_actual=total_ingresos - total_egresos
    )

    # 3. Filtro por Búsqueda de texto (Nombre o ID)
    if texto_busqueda and str(texto_busqueda).strip():
        termino = str(texto_busqueda).strip()
        filtro_texto = Q(nombre__icontains=termino)
        if termino.isdigit():
            filtro_texto |= Q(id_producto=int(termino))
        qs = qs.filter(filtro_texto)

    # 4. Filtro por Categoría taxonómica (Soporta N a M)
    if id_categoria is not None:
        qs = qs.filter(Q(id_categoria_id=id_categoria) | Q(categorias_detalle__id_categoria_id=id_categoria)).distinct()

    # 5. Filtro por Proveedor asociado (vía cotizaciones u órdenes de compra en purchases_app)
    if id_proveedor is not None and str(id_proveedor).strip():
        cuit_str = str(id_proveedor).strip()
        qs = qs.filter(
            Q(cotizacionproducto__id_cotizacion__cuit_prov=cuit_str) |
            Q(detalleordencompra__id_orden_compra__cuit_prov=cuit_str)
        ).distinct()

    # 6. Filtro por Propósito Operativo
    if proposito and str(proposito).strip():
        prop_norm = str(proposito).strip().upper()
        if prop_norm in ['VENTA', 'APTO_VENTA']:
            qs = qs.filter(apto_venta=True)
        elif prop_norm in ['REPARACION', 'APTO_REPARACION', 'TALLER']:
            qs = qs.filter(apto_reparacion=True)
        elif prop_norm in ['CONSUMIBLE', 'APTO_CONSUMIBLE']:
            qs = qs.filter(apto_consumible=True)

    # 7. Filtro por Nivel de Stock (Crítico/Agotado, Alerta de Mínimo, Normal)
    if nivel_stock and str(nivel_stock).strip():
        nivel_norm = str(nivel_stock).strip().upper()
        if nivel_norm in ['CRITICO', 'AGOTADO', 'CERO']:
            qs = qs.filter(cantidad_actual__lte=0)
        elif nivel_norm in ['ALERTA', 'ALERTA_MINIMO', 'BAJO', 'REPOSICION']:
            qs = qs.filter(cantidad_actual__gt=0, cantidad_actual__lte=F('stock_minimo'))
        elif nivel_norm in ['NORMAL', 'OPTIMO', 'DISPONIBLE']:
            qs = qs.filter(cantidad_actual__gt=F('stock_minimo'))

    return qs.order_by('nombre')
