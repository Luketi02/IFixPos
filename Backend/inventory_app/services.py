from typing import Any, Dict
from django.db import transaction
from django.db.models import Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.core.exceptions import ValidationError

from inventory_app.models import Stock, MovimientoStock
from core_app.models import LogSistema

TIPOS_INGRESO = ['ingreso', 'compra', 'devolucion', 'alta', 'entrada']
TIPOS_EGRESO = ['egreso', 'venta', 'taller', 'baja', 'salida', 'consumo']


@transaction.atomic
def actualizar_stock_manual(
    *,
    usuario_admin: Any,
    datos_validados: Dict[str, Any]
) -> Stock:
    """
    CU-13: Actualizar Stock.
    Ajusta manualmente el saldo de inventario de un producto (INGRESO o EGRESO)
    registrando la justificación operativa, previniendo condiciones de carrera con
    select_for_update() y garantizando la trazabilidad histórica mediante MovimientoStock y LogSistema.
    """
    id_producto = datos_validados['id_producto']
    tipo_operacion = str(datos_validados['tipo_operacion']).strip().upper()
    cantidad = int(datos_validados['cantidad'])
    motivo = datos_validados['motivo']
    usado_taller = bool(datos_validados.get('usado_taller', False))

    if cantidad <= 0:
        raise ValidationError("La cantidad a ajustar debe ser mayor a cero.")

    # 1. Bloqueo pesimista de fila Stock para prevenir Race Conditions
    stock = Stock.objects.select_for_update().select_related('id_producto').filter(
        id_producto_id=id_producto
    ).first()

    if not stock:
        raise ValidationError("El producto no posee un registro de stock configurado en el inventario.")

    # 2. Calcular saldo actual de inventario en tiempo real
    ingresos = MovimientoStock.objects.filter(
        id_stock=stock,
        tipo_movimiento__in=TIPOS_INGRESO
    ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

    egresos = MovimientoStock.objects.filter(
        id_stock=stock,
        tipo_movimiento__in=TIPOS_EGRESO
    ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

    stock_actual = int(ingresos - egresos)

    # 3. Validación de egreso vs existencia disponible (Paso 4 del CU-13)
    if tipo_operacion == 'EGRESO':
        if cantidad > stock_actual:
            raise ValidationError(
                f"Egreso superior al stock disponible. "
                f"Stock disponible: {stock_actual}, cantidad a retirar: {cantidad}."
            )
        tipo_mov = 'egreso'
        stock_nuevo = stock_actual - cantidad
    else:
        tipo_mov = 'ingreso'
        stock_nuevo = stock_actual + cantidad

    # 4. Crear registro inmutable en MovimientoStock
    fecha_hoy = timezone.now().date()
    MovimientoStock.objects.create(
        id_stock=stock,
        tipo_movimiento=tipo_mov,
        cantidad=cantidad,
        fecha=fecha_hoy,
        motivo=motivo,
        uso_taller=usado_taller
    )

    # 5. Generar auditoría de seguridad en LogSistema
    email_admin = getattr(usuario_admin, 'email', str(usuario_admin))
    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
        accion="Actualizar Stock (CU-13)",
        detalle=(
            f"Ajuste manual de {tipo_operacion} por {email_admin}: {cantidad} unidades para "
            f"'{stock.id_producto.nombre}' (ID: {stock.id_producto.id_producto}). "
            f"Saldo previo: {stock_actual}, Saldo nuevo: {stock_nuevo}. "
            f"Motivo: {motivo}. Taller: {usado_taller}."
        )[:1000],
        tipo="AUDITORIA_INVENTARIO",
        modulo_origen="inventory_app",
        tabla_afectada="movimiento_stock",
        id_registro_afectado=str(stock.id_stock),
        id_usuario=usuario_admin
    )

    # Atributos auxiliares para serialización y respuesta
    stock.producto_nombre = stock.id_producto.nombre
    stock.tipo_operacion = tipo_operacion
    stock.cantidad = cantidad
    stock.stock_anterior = stock_actual
    stock.stock_nuevo = stock_nuevo
    stock.motivo = motivo
    stock.usado_taller = usado_taller
    stock.fecha = fecha_hoy

    return stock
