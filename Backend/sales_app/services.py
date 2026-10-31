import os
import uuid
import datetime
from decimal import Decimal
from typing import Dict, Any, Optional, List, Tuple

from django.conf import settings
from django.db import transaction
from django.db.models import Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.core.mail import EmailMultiAlternatives

from sales_app.models import Venta, DetalleVenta, CarritoCompra, CarritoProducto, Pago, MedioPago
from workshop_app.models import Reparacion, DetalleInsumoReparacion
from inventory_app.models import Stock, MovimientoStock
from geo_app.models import Direccion
from core_app.models import LogSistema, ConfiguracionSistema, Notificacion
from users_app.models import Usuario

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch


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
    # Liberar preventivamente cualquier reserva temporal vencida
    limpiar_ventas_pendientes_expiradas(minutos_limite=30)

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

    # Determinar costo de envío según Configuración del Sistema (Local, Regional o Nacional)
    costo_envio = Decimal('0.00')
    if metodo_entrega == 'ENVIO':
        from sales_app.selectors import calcular_costo_envio_sistema
        id_dir = direccion_envio.id_direccion if direccion_envio else None
        calculo_envio = calcular_costo_envio_sistema(id_dir)
        costo_envio = calculo_envio['costo']

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
        fecha_hora=timezone.now(),
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
    from sales_app.models import CarritoCompra, CarritoProducto
    from catalog_app.models import Producto

    try:
        producto = Producto.objects.get(id_producto=id_producto)
    except Producto.DoesNotExist:
        raise ValidationError("El producto especificado no existe.")

    carrito = CarritoCompra.objects.filter(
        id_usuario=usuario,
        estado='activo'
    ).order_by('-id_carrito').first()

    if not carrito:
        raise ValidationError("El usuario no posee un carrito de compras activo.")

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
    Garantiza sincronización total con la base de datos sin importar el orden de llegada en la red.
    """
    from sales_app.models import CarritoCompra, CarritoProducto
    from catalog_app.models import Producto

    try:
        producto = Producto.objects.get(id_producto=id_producto)
    except Producto.DoesNotExist:
        raise ValidationError("El producto especificado no existe.")

    carrito, _ = CarritoCompra.objects.get_or_create(
        id_usuario=usuario,
        estado='activo',
        defaults={'fecha_creacion': timezone.now().date()}
    )

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

        # Verificar stock disponible en tiempo real
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


def _calcular_total_operacion(operacion) -> Decimal:
    """Calcula el total adeudado de una Venta o Reparación (incluyendo mano de obra e insumos)."""
    if isinstance(operacion, Venta):
        subtotal = Decimal(str(operacion.monto_subtotal or '0.00'))
        envio = Decimal(str(operacion.costo_envio or '0.00'))
        return subtotal + envio
    elif isinstance(operacion, Reparacion):
        # 1. Costo de mano de obra técnica del diagnóstico
        costo_diag = Decimal('0.00')
        diag = operacion.diagnostico_set.order_by('-id_diagnostico').first()
        if diag and diag.costo_diagnostico:
            costo_diag = Decimal(str(diag.costo_diagnostico))

        # 2. Costo de insumos consumidos
        costo_insumos = Decimal('0.00')
        for insumo in operacion.detalleinsumoreparacion_set.all():
            cant = Decimal(str(insumo.cantidad or 0))
            pu = Decimal(str(insumo.precio_unitario or 0))
            costo_insumos += cant * pu

        total_reparacion = costo_diag + costo_insumos

        envio = Decimal('0.00')
        if operacion.id_venta:
            if operacion.id_venta.costo_envio:
                envio = Decimal(str(operacion.id_venta.costo_envio))
            # Sincronizar monto_subtotal de la cabecera de Venta si no contemplaba la mano de obra
            if operacion.id_venta.monto_subtotal != total_reparacion:
                operacion.id_venta.monto_subtotal = total_reparacion
                operacion.id_venta.save(update_fields=['monto_subtotal'])

        return total_reparacion + envio
    else:
        raise ValidationError("Tipo de operación no soportado para cobro.")


@transaction.atomic
def generar_comprobante_fiscal(pago: Pago, operacion) -> str:
    """
    CU-20: Generar Factura / Comprobante Fiscal.
    Permite la emisión de un comprobante fiscal en formato PDF a partir
    de una transacción comercial concretada (Venta o Reparación).
    - Lee datos fiscales del comercio emisor desde ConfiguracionSistema.
    - Lee datos del receptor y líneas de DetalleVenta / DetalleInsumoReparacion.
    - Asienta la ruta del comprobante en la entidad Pago.
    - Genera físicamente el archivo PDF con ReportLab en settings.MEDIA_ROOT/facturas/
    - Registra el evento en LogSistema.
    """
    # 1. Extraer datos de la empresa emisora desde ConfiguracionSistema
    configs = {
        c.clave: c.valor
        for c in ConfiguracionSistema.objects.filter(
            clave__in=['nombreLocal', 'cuilLocal', 'direccionLocal', 'imagenLocal', 'telefonoLocal', 'emailLocal']
        )
    }
    nombre_local = configs.get('nombreLocal') or 'IFixPos'
    cuil_local = configs.get('cuilLocal') or '30-11223344-5'
    telefono_local = configs.get('telefonoLocal') or '3794-000000'
    email_local = configs.get('emailLocal') or 'contacto@ifixpos.com'

    # Obtener ubicación real (Ciudad, Provincia, País) referenciada por direccionLocal
    direccion_local = "Posadas, Misiones, Argentina"
    id_dir_raw = (configs.get('direccionLocal') or '').strip()
    dir_sede = None
    if id_dir_raw.isdigit():
        dir_sede = Direccion.objects.select_related(
            'id_ciudad__id_provincia__id_pais'
        ).filter(id_direccion=int(id_dir_raw)).first()

    if not dir_sede:
        from geo_app.selectors import obtener_direccion_sede
        dir_sede = obtener_direccion_sede()

    if dir_sede and getattr(dir_sede, 'id_ciudad', None):
        c_nom = dir_sede.id_ciudad.nombre_ciudad or ''
        p_nom = getattr(dir_sede.id_ciudad.id_provincia, 'nombre_provincia', '')
        pa_nom = getattr(getattr(dir_sede.id_ciudad.id_provincia, 'id_pais', None), 'nombre_pais', '')
        partes_dir = [p for p in [c_nom, p_nom, pa_nom] if p]
        if partes_dir:
            direccion_local = ", ".join(partes_dir)

    # 2. Extraer datos del receptor (Cliente)
    cliente = getattr(operacion, 'id_usuario', None)
    dni_cliente = 'S/D'
    nombre_cliente = 'Consumidor Final'
    email_cliente = ''
    if cliente:
        email_cliente = getattr(cliente, 'email', '')
        perfil = getattr(cliente, 'perfilusuario', None)
        if perfil:
            dni_cliente = perfil.dni or 'S/D'
            nombre_cliente = f"{perfil.nombre or ''} {perfil.apellido or ''}".strip() or email_cliente
        else:
            nombre_cliente = email_cliente or 'Consumidor Final'

    # 3. Determinar venta vinculada o ID de transacción exacto (evitando convertir objetos Django a str)
    if isinstance(operacion, Venta):
        tipo_doc = "VENTA"
        id_ref = operacion.id_venta
    elif hasattr(operacion, 'id_reparacion'):
        tipo_doc = "REPARACION"
        id_ref = operacion.id_reparacion
    else:
        tipo_doc = "OPERACION"
        id_ref = getattr(pago, 'id_pago', 1)

    # 4. Asegurar directorio de facturas y ruta de archivo
    directorio_facturas = os.path.join(settings.MEDIA_ROOT, 'facturas')
    os.makedirs(directorio_facturas, exist_ok=True)

    fecha_fmt = (pago.fecha_pago or timezone.now().date()).strftime('%d-%m-%Y')
    if tipo_doc == "REPARACION":
        filename_base = f"factura_reparacion_{fecha_fmt}"
        filename = f"{filename_base}.pdf"
        # Si ya existe y pertenece a otro pago, sufijar con id_pago para evitar colisiones
        if os.path.exists(os.path.join(directorio_facturas, filename)):
            otro_pago = Pago.objects.filter(ruta_comprobante=f"/media/facturas/{filename}").exclude(id_pago=pago.id_pago).first()
            if otro_pago:
                filename = f"{filename_base}_{pago.id_pago}.pdf"
    else:
        filename = f"factura_VENTA_{fecha_fmt}_{pago.id_pago}.pdf"

    ruta_absoluta = os.path.join(directorio_facturas, filename)
    ruta_pdf = f"/media/facturas/{filename}"

    # 5. Generar archivo PDF con ReportLab
    try:
        titulo_doc = f"Factura {tipo_doc.capitalize()} {fecha_fmt}"
        doc = SimpleDocTemplate(
            ruta_absoluta,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36,
            title=titulo_doc,
            author=nombre_local
        )
        styles = getSampleStyleSheet()

        estilo_titulo = ParagraphStyle(
            'TituloFactura',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=18,
            leading=22,
            textColor=colors.HexColor('#0F172A')
        )
        estilo_subtitulo = ParagraphStyle(
            'SubtituloFactura',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=12,
            textColor=colors.HexColor('#475569')
        )
        estilo_badge = ParagraphStyle(
            'BadgeFiscal',
            parent=styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=13,
            leading=16,
            alignment=2,
            textColor=colors.HexColor('#06B6D4')
        )
        estilo_texto_der = ParagraphStyle(
            'TextoDer',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=12,
            alignment=2,
            textColor=colors.HexColor('#334155')
        )
        estilo_th = ParagraphStyle(
            'TableHeader',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=11,
            textColor=colors.white
        )
        estilo_td = ParagraphStyle(
            'TableCell',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=11,
            textColor=colors.HexColor('#1E293B')
        )
        estilo_td_num = ParagraphStyle(
            'TableCellNum',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=11,
            alignment=2,
            textColor=colors.HexColor('#1E293B')
        )

        elements = []

        # Encabezado: Emisor a la izquierda, Comprobante a la derecha
        datos_emisor = [
            Paragraph(f"<b>{nombre_local}</b>", estilo_titulo),
            Paragraph(f"<b>CUIT:</b> {cuil_local}", estilo_subtitulo),
            Paragraph(f"<b>Dirección:</b> {direccion_local}", estilo_subtitulo),
            Paragraph(f"<b>Tel:</b> {telefono_local} | <b>Email:</b> {email_local}", estilo_subtitulo),
        ]
        fecha_str = pago.fecha_pago.strftime('%d/%m/%Y') if pago.fecha_pago else timezone.now().strftime('%d/%m/%Y')
        datos_comprobante = [
            Paragraph("COMPROBANTE FISCAL DE PAGO", estilo_badge),
            Paragraph(f"<b>N° Comprobante:</b> 0001-{pago.id_pago:08d}", estilo_texto_der),
            Paragraph(f"<b>Fecha:</b> {fecha_str}", estilo_texto_der),
            Paragraph(f"<b>Operación:</b> {tipo_doc} #{id_ref}", estilo_texto_der),
            Paragraph("<b>Estado:</b> <font color='#10B981'>PAGADO</font>", estilo_texto_der),
        ]

        tabla_header = Table(
            [[datos_emisor, datos_comprobante]],
            colWidths=[4.0 * inch, 3.5 * inch]
        )
        tabla_header.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        elements.append(tabla_header)
        elements.append(Spacer(1, 14))

        # Cuadro de Datos del Cliente
        texto_cliente = [
            Paragraph(f"<b>Cliente / Razón Social:</b> {nombre_cliente}", estilo_subtitulo),
            Paragraph(f"<b>DNI / CUIT:</b> {dni_cliente} &nbsp;&nbsp;|&nbsp;&nbsp; <b>Condición IVA:</b> Consumidor Final", estilo_subtitulo),
        ]
        if email_cliente:
            texto_cliente.append(Paragraph(f"<b>Email:</b> {email_cliente}", estilo_subtitulo))

        tabla_cliente = Table(
            [[texto_cliente]],
            colWidths=[7.5 * inch]
        )
        tabla_cliente.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#E2E8F0')),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(tabla_cliente)
        elements.append(Spacer(1, 14))

        # Tabla de Renglones / Ítems
        filas_items = [
            [
                Paragraph("Descripción / Concepto", estilo_th),
                Paragraph("Cant.", estilo_th),
                Paragraph("Precio Unit.", estilo_th),
                Paragraph("Subtotal", estilo_th),
            ]
        ]

        if isinstance(operacion, Venta):
            detalles_venta = DetalleVenta.objects.filter(id_venta=operacion.id_venta).select_related('id_producto')
            for dv in detalles_venta:
                prod_nom = dv.id_producto.nombre if dv.id_producto else "Producto"
                filas_items.append([
                    Paragraph(prod_nom, estilo_td),
                    Paragraph(str(dv.cantidad), estilo_td),
                    Paragraph(f"${dv.precio_unitario:,.2f}", estilo_td_num),
                    Paragraph(f"${dv.subtotal:,.2f}", estilo_td_num),
                ])
            if getattr(operacion, 'costo_envio', Decimal('0.00')) > Decimal('0.00'):
                filas_items.append([
                    Paragraph("Costo de Envío a Domicilio", estilo_td),
                    Paragraph("1", estilo_td),
                    Paragraph(f"${operacion.costo_envio:,.2f}", estilo_td_num),
                    Paragraph(f"${operacion.costo_envio:,.2f}", estilo_td_num),
                ])
        elif hasattr(operacion, 'id_reparacion'):
            disp_info = "Dispositivo en Taller"
            if getattr(operacion, 'id_dispositivo', None):
                disp = operacion.id_dispositivo
                disp_info = f"{getattr(disp, 'marca', '')} {getattr(disp, 'modelo', '')}".strip() or "Dispositivo"

            # 1. Renglón explícito de Mano de Obra Técnica (Diagnóstico)
            diag = operacion.diagnostico_set.order_by('-id_diagnostico').first()
            costo_mo = Decimal('0.00')
            if diag and diag.costo_diagnostico:
                costo_mo = Decimal(str(diag.costo_diagnostico))

            if costo_mo > Decimal('0.00'):
                diag_desc = getattr(diag, 'descripcion_falla', None)
                concepto_mo = f"Mano de Obra y Servicio Técnico - {disp_info}"
                if diag_desc:
                    concepto_mo += f" ({diag_desc[:50]}...)" if len(diag_desc) > 50 else f" ({diag_desc})"
                filas_items.append([
                    Paragraph(concepto_mo, estilo_td),
                    Paragraph("1", estilo_td),
                    Paragraph(f"${costo_mo:,.2f}", estilo_td_num),
                    Paragraph(f"${costo_mo:,.2f}", estilo_td_num),
                ])

            # 2. Renglones de Insumos / Repuestos utilizados
            insumos = DetalleInsumoReparacion.objects.filter(id_reparacion=operacion.id_reparacion).select_related('id_producto')
            for ins in insumos:
                sub_ins = Decimal(str(ins.cantidad)) * ins.precio_unitario
                nom_ins = ins.id_producto.nombre if ins.id_producto else "Insumo / Repuesto"
                filas_items.append([
                    Paragraph(f"Repuesto: {nom_ins} ({disp_info})", estilo_td),
                    Paragraph(str(ins.cantidad), estilo_td),
                    Paragraph(f"${ins.precio_unitario:,.2f}", estilo_td_num),
                    Paragraph(f"${sub_ins:,.2f}", estilo_td_num),
                ])

            # Si no hubo desglose específico, renglón genérico con el monto pagado
            if len(filas_items) == 1:
                filas_items.append([
                    Paragraph(f"Servicio Técnico y Reparación - {disp_info}", estilo_td),
                    Paragraph("1", estilo_td),
                    Paragraph(f"${pago.monto_pagado:,.2f}", estilo_td_num),
                    Paragraph(f"${pago.monto_pagado:,.2f}", estilo_td_num),
                ])
        else:
            filas_items.append([
                Paragraph(f"Cobro de Operación #{id_ref}", estilo_td),
                Paragraph("1", estilo_td),
                Paragraph(f"${pago.monto_pagado:,.2f}", estilo_td_num),
                Paragraph(f"${pago.monto_pagado:,.2f}", estilo_td_num),
            ])

        tabla_items = Table(
            filas_items,
            colWidths=[4.2 * inch, 0.7 * inch, 1.3 * inch, 1.3 * inch]
        )
        tabla_items.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
            ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(tabla_items)
        elements.append(Spacer(1, 14))

        # Resumen y Datos de Pago
        medio_nombre = pago.medio_pago.nombre_medio_pago if pago.medio_pago else "Efectivo"
        nro_transaccion = pago.cod_operacion or "N/A"
        detalles_pago = [
            Paragraph(f"<b>Medio de Pago:</b> {medio_nombre}", estilo_subtitulo),
            Paragraph(f"<b>N° Transacción / Comprobante:</b> {nro_transaccion}", estilo_subtitulo),
        ]
        if pago.detalle:
            detalles_pago.append(Paragraph(f"<b>Detalle:</b> {pago.detalle[:100]}", estilo_subtitulo))

        cuadro_total = [
            Paragraph("TOTAL ABONADO", estilo_th),
            Paragraph(f"${pago.monto_pagado:,.2f}", ParagraphStyle(
                'TotalBig',
                parent=styles['Heading1'],
                fontSize=14,
                leading=16,
                alignment=2,
                textColor=colors.HexColor('#06B6D4')
            ))
        ]

        tabla_cierre = Table(
            [[detalles_pago, cuadro_total]],
            colWidths=[4.8 * inch, 2.7 * inch]
        )
        tabla_cierre.setStyle(TableStyle([
            ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#0F172A')),
            ('BOX', (0, 0), (0, 0), 1, colors.HexColor('#E2E8F0')),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(tabla_cierre)
        elements.append(Spacer(1, 20))

        # Footer
        estilo_footer = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=7,
            alignment=1,
            textColor=colors.HexColor('#94A3B8')
        )
        elements.append(Paragraph(f"Gracias por su preferencia. Documento emitido electrónicamente por el sistema {nombre_local}.", estilo_footer))
        elements.append(Paragraph("Comprobante no válido como factura fiscal ante AFIP/ARCA según RG. Conservar como constancia de pago y garantía.", estilo_footer))

        # Construir el PDF físicamente en disco
        doc.build(elements)
    except Exception as e:
        raise ValidationError(f"Error al generar el comprobante PDF: {str(e)}")

    # 6. Asignar ruta de almacenamiento en el pago y persistir
    pago.ruta_comprobante = ruta_pdf
    pago.save(update_fields=['ruta_comprobante'])

    # 7. Generar Log de Auditoría sobre la emisión del documento fiscal
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Generar Factura (CU-20)",
        detalle=(
            f"Factura PDF generada y almacenada exitosamente para Pago #{pago.id_pago} de {tipo_doc} #{id_ref}. "
            f"Emisor: {nombre_local} (CUIT: {cuil_local}). Receptor: {nombre_cliente} (DNI: {dni_cliente}). "
            f"Ruta: {ruta_pdf}"
        )[:1000],
        tipo="EMISION_COMPROBANTE",
        modulo_origen="sales_app",
        tabla_afectada="pago",
        id_registro_afectado=str(pago.id_pago),
        id_usuario=cliente
    )

    return ruta_pdf


@transaction.atomic
def registrar_cobro_operacion(
    *,
    usuario_ejecutor: Usuario,
    operacion,
    datos_validados: Dict[str, Any]
) -> Pago:
    """
    CU-21: Completar pago.
    Registra formalmente el ingreso de dinero correspondiente a una venta
    o reparación pendiente, instanciando el pago en el sistema y transicionando
    el estado de la operación a 'PAGADO'.

    Paso 2: Verifica que la operación esté pendiente.
    Paso 4: Verifica que el monto abonado coincida con el total adeudado.
    Paso 5: Instancia registro en Pago y modifica el estado de la operación a 'PAGADO'.
    Paso 6: Dispara automáticamente CU-20 (generar comprobante) y auditoría.
    """
    # Verificación de estado de la operación
    if isinstance(operacion, Venta):
        if str(operacion.estado_venta).strip().upper() != 'PENDIENTE':
            raise ValidationError(
                f"Solo se pueden cobrar operaciones pendientes. El estado actual es '{operacion.estado_venta}'."
            )
    elif isinstance(operacion, Reparacion):
        etapa_actual = str(operacion.etapa).strip().upper()
        if etapa_actual in ['PAGADO', 'CANCELADO', 'ENTREGADO']:
            raise ValidationError(
                f"La reparación no puede ser cobrada ya que se encuentra en etapa '{operacion.etapa}'."
            )
    else:
        raise ValidationError("Entidad desconocida. Solo se pueden cobrar Ventas o Reparaciones.")

    # Paso 4: Validación estricta del monto adeudado
    total_adeudado = _calcular_total_operacion(operacion)
    monto_abonado = Decimal(str(datos_validados.get('monto_pagado') or '0.00'))

    if monto_abonado != total_adeudado:
        raise ValidationError("El monto abonado no coincide con el total adeudado.")

    # Resolver o crear MedioPago
    medio_pago_input = str(datos_validados.get('medio_pago') or 'EFECTIVO').strip()
    medio_pago_obj = None
    if medio_pago_input.isdigit():
        medio_pago_obj = MedioPago.objects.filter(id_mediopago=int(medio_pago_input)).first()
    if not medio_pago_obj:
        medio_pago_obj = MedioPago.objects.filter(nombre_medio_pago__iexact=medio_pago_input).first()
    if not medio_pago_obj:
        medio_pago_obj = MedioPago.objects.filter(nombre_medio_pago__icontains=medio_pago_input).first()
    if not medio_pago_obj:
        medio_pago_obj = MedioPago.objects.create(
            nombre_medio_pago=medio_pago_input.upper(),
            estado=True,
            recargo=Decimal('0.00')
        )

    # Si es Reparación y no tiene Venta vinculada, aseguramos una venta para consistencia
    venta_asociada = None
    if isinstance(operacion, Venta):
        venta_asociada = operacion
    elif isinstance(operacion, Reparacion):
        if operacion.id_venta:
            venta_asociada = operacion.id_venta
        else:
            # Crear cabecera de Venta para documentar la transacción
            codigo_sec = operacion.codigo_sec or uuid.uuid4().hex[:10].upper()
            venta_asociada = Venta.objects.create(
                id_usuario=operacion.id_usuario,
                metodo_entrega='RETIRO',
                fecha_venta=timezone.now().date(),
                estado_venta='PENDIENTE',
                codigo_sec=codigo_sec,
                monto_subtotal=total_adeudado,
                costo_envio=Decimal('0.00'),
                id_direccion_envio=None
            )
            operacion.id_venta = venta_asociada

    numero_operacion = datos_validados.get('numero_operacion')
    detalle = datos_validados.get('detalle') or (
        f"Cobro registrado en mostrador por {usuario_ejecutor.email} "
        f"para {'Venta #' + str(venta_asociada.id_venta) if venta_asociada else 'Operación'}"
    )

    # Paso 5: Instanciar Pago
    pago = Pago.objects.create(
        id_venta=venta_asociada,
        medio_pago=medio_pago_obj,
        monto_pagado=monto_abonado,
        fecha_pago=timezone.now().date(),
        cod_operacion=numero_operacion,
        detalle=detalle[:500]
    )

    # Transicionar el estado de la operación a PAGADO
    if isinstance(operacion, Venta):
        operacion.estado_venta = 'PAGADO'
        operacion.save(update_fields=['estado_venta'])
    elif isinstance(operacion, Reparacion):
        operacion.etapa = 'PAGADO'
        operacion.save(update_fields=['etapa', 'id_venta'])
        if venta_asociada:
            venta_asociada.estado_venta = 'PAGADO'
            venta_asociada.save(update_fields=['estado_venta'])

    # Paso 6: Disparar automáticamente comprobante fiscal (CU-20)
    ruta_factura = generar_comprobante_fiscal(pago, operacion)
    if isinstance(operacion, Venta):
        try:
            enviar_correo_confirmacion_compra(venta=operacion, pago=pago, ruta_pdf=ruta_factura)
        except Exception as e:
            print(f"[Cobro Venta] Advertencia al despachar correo de confirmación: {e}")

    # Auditoría en LogSistema
    tipo_op = "Venta" if isinstance(operacion, Venta) else "Reparación"
    id_op = operacion.id_venta if isinstance(operacion, Venta) else operacion.id_reparacion
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Completar pago (CU-21)",
        detalle=(
            f"Cobro de ${monto_abonado} registrado por {usuario_ejecutor.email} para {tipo_op} #{id_op}. "
            f"Medio: {medio_pago_obj.nombre_medio_pago}, Operación: {numero_operacion or 'N/A'}. "
            f"Estado transicionado a PAGADO."
        )[:1000],
        tipo="REGISTRO_PAGO",
        modulo_origen="sales_app",
        tabla_afectada="pago",
        id_registro_afectado=str(pago.id_pago),
        id_usuario=usuario_ejecutor
    )

    # Notificación al cliente (Paso 6: CU-21)
    cliente_destinatario = getattr(operacion, 'id_usuario', None)
    if cliente_destinatario:
        disp_vinculado = getattr(operacion, 'id_dispositivo', None) if isinstance(operacion, Reparacion) else None
        Notificacion.objects.create(
            mensaje=(
                f"Tu pago de ${monto_abonado} correspondiente a {tipo_op} #{id_op} fue registrado con éxito. "
                f"Comprobante fiscal emitido."
            )[:1000],
            tipo="PAGO_REGISTRADO",
            fecha_envio=timezone.now().date(),
            leida=False,
            id_usuario=cliente_destinatario,
            id_dispositivo=disp_vinculado
        )

    return pago


@transaction.atomic
def registrar_auditoria_filtro_cobros(
    *,
    usuario_ejecutor: Usuario,
    filtros_aplicados: Dict[str, Any],
    cantidad_encontrada: int
) -> Optional[LogSistema]:
    """
    CU-38: Filtrar Cobros y Pagos.
    Almacena el evento de auditoría condicionado al parámetro 'log_operaciones_lectura'
    (desactivado por defecto).
    """
    from core_app.selectors import obtener_configuracion_bool
    if not obtener_configuracion_bool('log_operaciones_lectura'):
        return None

    filtros_legibles = {
        k: v for k, v in filtros_aplicados.items()
        if v not in [None, '', 'null']
    }
    filtros_resumen = ", ".join(f"{k}={v}" for k, v in filtros_legibles.items()) or "Sin filtros (listado completo)"

    return LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Filtrar Cobros y Pagos (CU-38)",
        detalle=(
            f"Auditoría de flujo de caja y transacciones financieras por {usuario_ejecutor.email}. "
            f"Criterios: [{filtros_resumen}]. "
            f"Registros localizados: {cantidad_encontrada}."
        )[:1000],
        tipo="CONSULTA_AUDITORIA",
        modulo_origen="sales_app",
        tabla_afectada="pago",
        id_registro_afectado=None,
        id_usuario=usuario_ejecutor
    )


@transaction.atomic
def registrar_o_reactivar_medio_pago(
    *,
    usuario_admin: Usuario,
    datos_validados: Dict[str, Any]
) -> MedioPago:
    """
    CU-82: Registrar medio de pago.
    Permite al administrador registrar un nuevo canal de cobro en el sistema o reactivar
    uno previamente deshabilitado.
    """
    from sales_app.selectors import obtener_medio_pago_por_nombre

    nombre = datos_validados['nombre']
    recargo = datos_validados.get('recargo', Decimal('0.00'))
    confirmar_reactivacion = datos_validados.get('confirmar_reactivacion', False)

    medio_existente = obtener_medio_pago_por_nombre(nombre)

    if medio_existente:
        if medio_existente.estado:
            raise ValidationError("El medio de pago ingresado ya existe en el sistema y se encuentra activo.")
        
        if not confirmar_reactivacion:
            raise ValidationError({
                "confirmar_reactivacion": "Este medio de pago se encontraba deshabilitado. ¿Desea reactivarlo?"
            })

        # Reactivación y actualización de parámetros
        medio_existente.estado = True
        medio_existente.recargo = recargo
        medio_existente.save(update_fields=['estado', 'recargo'])

        LogSistema.objects.create(
            fecha_hora=timezone.now(),
            accion="Reactivar Medio de Pago (CU-82)",
            detalle=(
                f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) reactivó el medio de pago: "
                f"'{medio_existente.nombre_medio_pago}' con recargo de {medio_existente.recargo}%."
            )[:1000],
            tipo="ADMINISTRACION",
            modulo_origen="sales_app",
            tabla_afectada="medio_pago",
            id_registro_afectado=medio_existente.id_mediopago,
            id_usuario=usuario_admin
        )
        return medio_existente

    # Creación de nuevo registro
    nuevo_medio = MedioPago.objects.create(
        nombre_medio_pago=nombre,
        recargo=recargo,
        estado=True
    )

    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Registrar Medio de Pago (CU-82)",
        detalle=(
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) registró el nuevo medio de pago: "
            f"'{nuevo_medio.nombre_medio_pago}' con recargo de {nuevo_medio.recargo}%."
        )[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="sales_app",
        tabla_afectada="medio_pago",
        id_registro_afectado=nuevo_medio.id_mediopago,
        id_usuario=usuario_admin
    )

    return nuevo_medio


# ==============================================================================
# CU-83: CAMBIAR ESTADO DE MEDIO DE PAGO
# ==============================================================================

@transaction.atomic
def alternar_estado_medio_pago(
    *,
    usuario_admin: Usuario,
    id_medio_pago: int
) -> MedioPago:
    """
    CU-83: Cambiar estado de medio de pago.
    Permite al administrador alternar el estado operativo de un medio de pago (Activo/Inactivo).
    Al desactivarlo se aplica una baja lógica para que no aparezca en cobros de caja sin
    comprometer la integridad referencial de facturas y cobros históricos.
    """
    from sales_app.selectors import obtener_medio_pago_para_toggle

    medio_pago = obtener_medio_pago_para_toggle(id_medio_pago)

    # Invertir el estado operativo
    medio_pago.estado = not medio_pago.estado
    medio_pago.save(update_fields=['estado'])

    accion_str = "activó" if medio_pago.estado else "desactivó"
    accion_audit = "Activar Medio de Pago (CU-83)" if medio_pago.estado else "Desactivar Medio de Pago (CU-83)"

    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion=accion_audit,
        detalle=(
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) {accion_str} "
            f"el medio de pago: '{medio_pago.nombre_medio_pago}' (ID: {medio_pago.id_mediopago}). "
            f"Nuevo estado: {medio_pago.estado}."
        )[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="sales_app",
        tabla_afectada="medio_pago",
        id_registro_afectado=medio_pago.id_mediopago,
        id_usuario=usuario_admin
    )

    return medio_pago


# ==============================================================================
# CU-67: REALIZAR VENTA PRESENCIAL (SERVICES)
# ==============================================================================

def _obtener_o_crear_consumidor_final() -> Usuario:
    """Recupera o inicializa la cuenta genérica de Consumidor Final."""
    from users_app.models import Usuario, RolUsuario, PerfilUsuario
    rol_cliente, _ = RolUsuario.objects.get_or_create(
        codigo='CLIENTE',
        defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol Cliente estándar'}
    )
    usuario, creado = Usuario.objects.get_or_create(
        email='consumidorfinal@ifixpos.com',
        defaults={
            'contrasena': 'hash_invalido_consumidor_final',
            'fecha_registro': timezone.now().date(),
            'id_rol': rol_cliente,
            'is_active': True
        }
    )
    if creado or not PerfilUsuario.objects.filter(id_usuario=usuario).exists():
        PerfilUsuario.objects.get_or_create(
            id_usuario=usuario,
            defaults={
                'nombre': 'Consumidor',
                'apellido': 'Final',
                'dni': '00000000'
            }
        )
    return usuario


@transaction.atomic
def crear_venta_presencial(
    *,
    usuario_cajero: Usuario,
    datos_validados: Dict[str, Any]
) -> Tuple[Venta, List[str], Optional[str]]:
    """
    CU-67: Realizar Venta Presencial.
    Permite registrar la entrega física de mercadería a un cliente en mostrador,
    congelando precios vigentes en DetalleVenta, descontando inventario en MovimientoStock
    y soportando cobro atómico inmediato o dejando la operación en estado 'PENDIENTE' para su liquidación.
    """
    from sales_app.selectors import validar_productos_para_venta

    items_input = datos_validados['productos']
    productos_validos, warnings = validar_productos_para_venta(items_input)
    dict_productos = {p.id_producto: p for p in productos_validos}

    # Resolver comprador (Cliente registrado o Consumidor Final por defecto)
    id_cliente = datos_validados.get('id_cliente')
    if id_cliente:
        try:
            usuario_cliente = Usuario.objects.get(id_usuario=id_cliente)
        except Usuario.DoesNotExist:
            raise ValidationError(f"El cliente con ID {id_cliente} no existe en el sistema.")
    else:
        usuario_cliente = _obtener_o_crear_consumidor_final()

    codigo_seguridad = uuid.uuid4().hex[:10].upper()

    # Paso 8: Instanciar cabecera de Venta en estado PENDIENTE
    venta = Venta.objects.create(
        id_usuario=usuario_cliente,
        metodo_entrega='MOSTRADOR',
        fecha_venta=timezone.now().date(),
        estado_venta='PENDIENTE',
        codigo_sec=codigo_seguridad,
        monto_subtotal=Decimal('0.00'),
        costo_envio=Decimal('0.00'),
        id_direccion_envio=None
    )

    monto_total = Decimal('0.00')

    # Ciclo de renglones, congelamiento de precios y egreso de inventario
    for item in items_input:
        prod = dict_productos[item['id_producto']]
        cant = int(item['cantidad'])
        precio_unitario = Decimal(str(prod.precio_venta))
        subtotal_linea = precio_unitario * Decimal(str(cant))
        monto_total += subtotal_linea

        # Congelar línea en DetalleVenta
        DetalleVenta.objects.create(
            id_venta=venta,
            id_producto=prod,
            cantidad=cant,
            precio_unitario=precio_unitario,
            subtotal=subtotal_linea
        )

        # Asentar movimiento de egreso en Stock
        stock, _ = Stock.objects.get_or_create(
            id_producto=prod,
            defaults={'stock_minimo': 0}
        )

        MovimientoStock.objects.create(
            id_stock=stock,
            tipo_movimiento='venta',
            cantidad=cant,
            fecha=timezone.now().date(),
            motivo=f"Egreso por Venta Presencial #{venta.id_venta}",
            uso_taller=False,
            id_venta=venta
        )

    # Actualizar monto total definitivo
    venta.monto_subtotal = monto_total
    venta.save(update_fields=['monto_subtotal'])

    # Auditoría del evento en LogSistema
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Realizar Venta Presencial (CU-67)",
        detalle=(
            f"El operador {usuario_cajero.id_usuario} ({usuario_cajero.email}) registró una venta presencial "
            f"#{venta.id_venta} para el cliente '{usuario_cliente.email}' por un total de ${monto_total}. "
            f"Líneas: {len(items_input)}. Código sec: {codigo_seguridad}."
        )[:1000],
        tipo="AUDITORIA_VENTA",
        modulo_origen="sales_app",
        tabla_afectada="venta",
        id_registro_afectado=str(venta.id_venta),
        id_usuario=usuario_cajero
    )

    # Si se proporcionaron datos de cobro directo (Cobro Atómico en Mostrador)
    ruta_pdf = None
    if datos_validados.get('medio_pago') and datos_validados.get('monto_pagado') is not None:
        venta.estado_venta = 'PAGADA'
        venta.save(update_fields=['estado_venta'])

        nombre_medio = str(datos_validados['medio_pago']).strip()
        medio_pago_obj = MedioPago.objects.filter(nombre_medio_pago__iexact=nombre_medio).first()
        if not medio_pago_obj:
            medio_pago_obj, _ = MedioPago.objects.get_or_create(
                nombre_medio_pago=nombre_medio,
                defaults={'estado': True, 'recargo': Decimal('0.00')}
            )

        pago = Pago.objects.create(
            id_venta=venta,
            medio_pago=medio_pago_obj,
            monto_pagado=Decimal(str(datos_validados['monto_pagado'])),
            fecha_pago=timezone.now().date(),
            cod_operacion=str(datos_validados.get('numero_operacion') or f"POS-{venta.codigo_sec}"),
            detalle=datos_validados.get('detalle') or "Cobro directo atómico en caja mostrador"
        )

        try:
            ruta_pdf = generar_comprobante_fiscal(pago, venta)
            if usuario_cliente and usuario_cliente.email and 'consumidorfinal' not in usuario_cliente.email.lower():
                enviar_correo_confirmacion_compra(venta=venta, pago=pago, ruta_pdf=ruta_pdf)
        except Exception as e:
            print(f"[Venta Presencial POS] Factura generada con advertencia: {e}")

        LogSistema.objects.create(
            fecha_hora=timezone.now(),
            accion="Cobro Venta Presencial Atómica (CU-67/CU-21)",
            detalle=(
                f"Cobro completado para Venta Presencial #{venta.id_venta}. Medio: {nombre_medio}, "
                f"Monto: ${pago.monto_pagado}, Comprobante: {ruta_pdf or 'N/A'}."
            )[:1000],
            tipo="AUDITORIA_VENTA",
            modulo_origen="sales_app",
            tabla_afectada="pago",
            id_registro_afectado=str(pago.id_pago),
            id_usuario=usuario_cajero
        )

    return venta, warnings, ruta_pdf


# ==============================================================================
# CU-69: AUDITAR HISTORIAL DE BENEFICIOS Y PROMOCIONES (SERVICES)
# ==============================================================================

@transaction.atomic
def auditar_inspeccion_beneficio(
    *,
    usuario_admin: Usuario,
    id_beneficio: int
) -> Any:
    """
    CU-69: Auditar Historial de Beneficios y Promociones.
    Permite al Administrador inspeccionar el expediente técnico de una sugerencia algorítmica,
    registrando la traza de auditoría en LogSistema sobre la revisión efectuada.
    """
    from sales_app.selectors import obtener_beneficio_para_auditoria
    from core_app.selectors import obtener_configuracion_bool

    beneficio = obtener_beneficio_para_auditoria(id_beneficio)

    # Asentar la traza de auditoría de la revisión gerencial solo si está activada la lectura pasiva
    if obtener_configuracion_bool('log_operaciones_lectura'):
        cliente_email = beneficio.id_usuario.email if beneficio.id_usuario else "Desconocido"
        prod_nom = beneficio.id_producto.nombre if beneficio.id_producto else "Desconocido"

        LogSistema.objects.create(
            fecha_hora=timezone.now(),
            accion="Auditar Beneficio (CU-69)",
            detalle=(
                f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) realizó una inspección "
                f"de auditoría sobre el beneficio #{beneficio.id_beneficio} otorgado al cliente '{cliente_email}' "
                f"(Producto: '{prod_nom}', Descuento: {beneficio.por_desc}%)."
            )[:1000],
            tipo="CONSULTA_AUDITORIA",
            modulo_origen="sales_app",
            tabla_afectada="beneficio",
            id_registro_afectado=str(beneficio.id_beneficio),
            id_usuario=usuario_admin
        )

    return beneficio


# ==============================================================================
# CU-71: REVOCAR BENEFICIO ACTIVO (SERVICES)
# ==============================================================================

@transaction.atomic
def revocar_beneficio_activo(
    *,
    usuario_admin: Usuario,
    id_beneficio: int,
    datos_validados: Optional[Dict[str, Any]] = None
) -> Any:
    """
    CU-71: Revocar Beneficio Activo.
    Permite al Administrador invalidar manualmente un beneficio o promoción antes
    de su vencimiento natural, interrumpiendo su disponibilidad temporal e inhabilitando
    su canje en operaciones comerciales activas.
    """
    from sales_app.selectors import obtener_beneficio_para_revocacion, beneficio_esta_activo

    datos_validados = datos_validados or {}
    beneficio = obtener_beneficio_para_revocacion(id_beneficio)

    # Excepción Paso 4: Validar que el beneficio se encuentre activo y vigente
    if not beneficio_esta_activo(beneficio):
        raise ValidationError(
            "Operación denegada: El beneficio ya fue utilizado por el cliente o su tiempo de validez expiró."
        )

    motivo_anulacion = (datos_validados.get('motivo_anulacion') or '').strip() or 'Sin justificación ingresada'

    # Paso 6: Interrumpir temporizador de validez y marcar como revocado
    beneficio.tiempo_disp = Decimal('0.00')
    if not beneficio.motivo.startswith('[REVOCADO]'):
        beneficio.motivo = f"[REVOCADO] {beneficio.motivo}"
    beneficio.save(update_fields=['tiempo_disp', 'motivo'])

    cliente_email = beneficio.id_usuario.email if beneficio.id_usuario else "Desconocido"

    # Paso 7: Asentar la traza de auditoría en LogSistema
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Revocar Beneficio (CU-71)",
        detalle=(
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) revocó manualmente "
            f"el beneficio #{beneficio.id_beneficio} del cliente '{cliente_email}'. "
            f"Motivo: {motivo_anulacion}."
        )[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="sales_app",
        tabla_afectada="beneficio",
        id_registro_afectado=str(beneficio.id_beneficio),
        id_usuario=usuario_admin
    )

    return beneficio


# ==============================================================================
# CU-75: GENERAR REPORTE DE DISTRIBUCIÓN GEOGRÁFICA Y LOGÍSTICA
# ==============================================================================

@transaction.atomic
def generar_auditoria_logistica(
    *,
    usuario_admin: Usuario,
    filtros_validados: dict
) -> list[dict]:
    """
    CU-75: Generar Reporte de Distribución Geográfica y Logística (Capa Transaccional / Auditoría).
    Invoca el selector de análisis territorial y logístico y asienta la traza inmutable en LogSistema.
    """
    from sales_app.selectors import calcular_reporte_logistico
    from core_app.models import LogSistema

    resultado = calcular_reporte_logistico(
        fecha_inicio=filtros_validados['fecha_inicio'],
        fecha_fin=filtros_validados['fecha_fin'],
        id_provincia=filtros_validados.get('id_provincia'),
        id_ciudad=filtros_validados.get('id_ciudad'),
        estado_venta=filtros_validados.get('estado_venta'),
        id_medio_pago=filtros_validados.get('id_medio_pago')
    )

    f_ini = filtros_validados['fecha_inicio']
    f_fin = filtros_validados['fecha_fin']
    id_admin = getattr(usuario_admin, 'id_usuario', str(usuario_admin))
    email_admin = getattr(usuario_admin, 'email', '')

    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Generar Reporte de Distribución Geográfica (CU-75)",
        detalle=(
            f"El administrador {id_admin} ({email_admin}) generó el Reporte de Distribución "
            f"Geográfica y Logística para el periodo {f_ini} al {f_fin}."
        )[:1000],
        tipo="REPORTE_BI",
        modulo_origen="sales_app",
        tabla_afectada="venta",
        id_registro_afectado="0",
        id_usuario=usuario_admin if hasattr(usuario_admin, 'pk') else None
    )

    return resultado


# ==============================================================================
# INTEGRACIÓN AUTOMATIZADA MERCADO PAGO (SERVICIOS TRANSACCIONALES)
# ==============================================================================

def invalidar_preferencia_mercadopago(preference_id: str) -> bool:
    """
    Invalida de inmediato un link o preferencia de Mercado Pago
    estableciendo su expiración a tiempo presente/pasado mediante la API oficial.
    """
    if not preference_id or str(preference_id).startswith('SIMULADO'):
        return True

    from core_app.selectors import obtener_mercadopago_access_token
    access_token = obtener_mercadopago_access_token()
    if not access_token or 'TU_ACCESS_TOKEN' in access_token:
        return True

    try:
        import mercadopago
        sdk = mercadopago.SDK(access_token)
        ahora_utc = timezone.now().astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        sdk.preference().update(preference_id, {
            "expires": True,
            "expiration_date_to": ahora_utc
        })
        return True
    except Exception:
        return False


def crear_preferencia_mercadopago(
    *,
    venta: Venta,
    usuario: Usuario
) -> Dict[str, Any]:
    """
    Genera una Preferencia de Pago oficial en Mercado Pago (Checkout Pro / Transferencia).
    Devuelve los endpoints init_point y sandbox_init_point para que el cliente abone.
    Fija expiración estricta en UTC para invalidar automáticamente el link a los 30 minutos.
    Lee prioritariamente las credenciales configuradas en la BD (ConfiguracionSistema).
    """
    import mercadopago
    from core_app.selectors import (
        obtener_mercadopago_access_token,
        obtener_mercadopago_public_key
    )

    access_token = obtener_mercadopago_access_token()
    public_key = obtener_mercadopago_public_key()

    # Si aún no se configuró un token real en la BD ni en el .env, retornar simulación estructurada
    if not access_token or access_token.strip() == '' or 'TU_ACCESS_TOKEN' in access_token:
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')
        return {
            "preference_id": f"SIMULADO-VENTA-{venta.id_venta}",
            "init_point": f"{frontend_url}/tienda?simulacion_mp=true&venta_id={venta.id_venta}",
            "sandbox_init_point": f"{frontend_url}/tienda?simulacion_mp=true&venta_id={venta.id_venta}",
            "public_key": public_key or "TEST-SIMULADA",
            "modo_simulacion": True,
            "mensaje": "Credenciales de prueba de Mercado Pago pendientes en la BD o en Backend/.env. Modo simulación activado."
        }

    ahora_dt = timezone.now()

    # Calcular vencimiento exacto de los 30 minutos de reserva según la hora de creación de la venta
    log_creacion = LogSistema.objects.filter(
        modulo_origen='sales_app',
        tabla_afectada='venta',
        id_registro_afectado=str(venta.id_venta),
        accion="Realizar Compra Virtual (CU-18)"
    ).first()

    if log_creacion and log_creacion.fecha_hora:
        dt_creacion = datetime.datetime.combine(venta.fecha_venta, log_creacion.fecha_hora)
        if timezone.is_naive(dt_creacion):
            dt_creacion = timezone.make_aware(dt_creacion, timezone.get_current_timezone())
        exp_dt = dt_creacion + datetime.timedelta(minutes=30)
    else:
        exp_dt = ahora_dt + datetime.timedelta(minutes=30)

    if ahora_dt >= exp_dt:
        raise ValidationError("El tiempo de reserva de 30 minutos para esta compra ha finalizado y el link de pago ha expirado.")

    # Si ya se había generado una preferencia para esta venta y sigue vigente, reutilizarla
    log_pref = LogSistema.objects.filter(
        modulo_origen='sales_app',
        tabla_afectada='venta',
        id_registro_afectado=str(venta.id_venta),
        accion="Preferencia Mercado Pago Creada"
    ).first()

    if log_pref and log_pref.detalle:
        partes = log_pref.detalle.split('|')
        if len(partes) >= 2:
            pref_id_existente = partes[0]
            init_point_existente = partes[1]
            sandbox_init_point_existente = partes[2] if len(partes) > 2 else init_point_existente
            return {
                "preference_id": pref_id_existente,
                "init_point": init_point_existente,
                "sandbox_init_point": sandbox_init_point_existente,
                "public_key": public_key,
                "modo_simulacion": False
            }

    sdk = mercadopago.SDK(access_token)

    # 1. Armar renglones de compra
    items = []
    detalles = venta.detalleventa_set.select_related('id_producto').all()
    for det in detalles:
        prod = det.id_producto
        items.append({
            "id": str(prod.id_producto),
            "title": str(prod.nombre)[:250],
            "quantity": int(det.cantidad),
            "unit_price": float(det.precio_unitario),
            "currency_id": "ARS",
            "description": f"Repuesto/Accesorio IFixPos - {prod.nombre}"[:250]
        })

    # Si hay costo de envío
    if venta.costo_envio and venta.costo_envio > Decimal('0.00'):
        items.append({
            "id": "ENVIO-LOGISTICO",
            "title": "Costo de Envío Logístico a Domicilio",
            "quantity": 1,
            "unit_price": float(venta.costo_envio),
            "currency_id": "ARS"
        })

    # 2. Información del Payer
    perfil = getattr(usuario, 'perfilusuario', None)
    if not perfil:
        from users_app.models import PerfilUsuario
        perfil = PerfilUsuario.objects.filter(id_usuario=usuario).first()

    nombre_payer = getattr(perfil, 'nombre', '') if perfil else ''
    apellido_payer = getattr(perfil, 'apellido', '') if perfil else ''
    payer = {
        "name": nombre_payer or "Cliente",
        "surname": apellido_payer or "IFixPos",
        "email": usuario.email,
    }
    telefono_payer = getattr(perfil, 'telefono', None) if perfil else None
    if telefono_payer:
        tel_limpio = str(telefono_payer).replace('+', '').replace(' ', '')
        if tel_limpio:
            payer["phone"] = {"number": tel_limpio[-10:]}
    dni_payer = getattr(perfil, 'dni', None) if perfil else None
    if dni_payer:
        dni_limpio = str(dni_payer).replace('.', '').replace('-', '').strip()
        if dni_limpio:
            payer["identification"] = {"type": "DNI", "number": dni_limpio}

    # 3. URLs de Retorno y Webhook
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')
    backend_url = getattr(settings, 'BACKEND_URL', 'http://localhost:8000').rstrip('/')

    back_urls = {
        "success": f"{frontend_url}/tienda?mp_status=approved&venta_id={venta.id_venta}",
        "pending": f"{frontend_url}/tienda?mp_status=pending&venta_id={venta.id_venta}",
        "failure": f"{frontend_url}/tienda?mp_status=failure&venta_id={venta.id_venta}"
    }

    notification_url = f"{backend_url}/api/sales/mercadopago/webhook/"

    ahora_utc_str = ahora_dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    exp_utc_str = exp_dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    preference_data = {
        "items": items,
        "payer": payer,
        "back_urls": back_urls,
        "notification_url": notification_url,
        "external_reference": str(venta.id_venta),
        "statement_descriptor": "IFIXPOS",
        "binary_mode": False,
        "expires": True,
        "expiration_date_from": ahora_utc_str,
        "expiration_date_to": exp_utc_str
    }

    preference_response = sdk.preference().create(preference_data)
    response_data = preference_response.get("response", {})

    pref_id = response_data.get("id")
    init_point = response_data.get("init_point")
    sandbox_init_point = response_data.get("sandbox_init_point", init_point)

    if not pref_id:
        error_msg = str(preference_response.get("message") or response_data)
        raise ValidationError(f"Error al generar preferencia en Mercado Pago: {error_msg}")

    # Guardar en LogSistema para auditoría y reutilización durante los 30 minutos de reserva
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Preferencia Mercado Pago Creada",
        detalle=f"{pref_id}|{init_point}|{sandbox_init_point}",
        tipo="MERCADOPAGO",
        modulo_origen="sales_app",
        tabla_afectada="venta",
        id_registro_afectado=str(venta.id_venta),
        id_usuario=usuario
    )

    return {
        "preference_id": pref_id,
        "init_point": init_point,
        "sandbox_init_point": sandbox_init_point,
        "public_key": public_key,
        "modo_simulacion": False
    }


@transaction.atomic
def procesar_webhook_mercadopago(
    *,
    data: Dict[str, Any],
    query_params: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Procesa notificaciones Webhook (IPN) de Mercado Pago de forma atómica:
    1. Extrae el id del pago (payment_id).
    2. Consulta la API de Mercado Pago para verificar el estado real y autenticidad.
    3. Si el estado es 'approved', acredita la venta, crea el Pago y asienta la auditoría.
    """
    import mercadopago

    payment_id = None
    if data.get("data") and isinstance(data["data"], dict):
        payment_id = data["data"].get("id")

    if not payment_id:
        payment_id = query_params.get("data.id") or query_params.get("id")

    if not payment_id:
        return {"status": "ignored", "motivo": "Sin payment_id en la notificación"}

    if str(payment_id).startswith('SIMULADO-'):
        try:
            id_venta = int(str(payment_id).replace('SIMULADO-', ''))
            venta = Venta.objects.select_for_update().get(id_venta=id_venta)
        except (ValueError, Venta.DoesNotExist):
            return {"status": "error", "motivo": f"Venta simulada {payment_id} no encontrada"}

        if str(venta.estado_venta or '').upper() == "CANCELADA":
            return {"status": "ignored_cancelled", "venta_id": venta.id_venta}

        medio_pago_mp, _ = MedioPago.objects.get_or_create(
            nombre_medio_pago='Mercado Pago',
            defaults={'estado': True, 'recargo': Decimal('0.00')}
        )
        monto_pagado = Decimal(str(venta.monto_total or (venta.monto_subtotal + venta.costo_envio)))
        pago_existente = Pago.objects.filter(cod_operacion=str(payment_id)).first()
        pago = pago_existente
        if not pago:
            pago = Pago.objects.create(
                id_venta=venta,
                medio_pago=medio_pago_mp,
                monto_pagado=monto_pagado,
                fecha_pago=timezone.now().date(),
                cod_operacion=str(payment_id),
                detalle="Acreditación de prueba/mostrador Mercado Pago QR"
            )

        if venta.estado_venta != "PAGADA":
            venta.estado_venta = "PAGADA"
            venta.save(update_fields=["estado_venta"])

            LogSistema.objects.create(
                fecha_hora=timezone.now(),
                accion="Acreditación Mercado Pago Webhook",
                detalle=f"Venta #{venta.id_venta} pagada con éxito vía Mercado Pago (Mostrador/QR). Operación #{payment_id}, Monto: ${monto_pagado}.",
                tipo="AUDITORIA_VENTA",
                modulo_origen="sales_app",
                tabla_afectada="venta",
                id_registro_afectado=str(venta.id_venta),
                id_usuario=venta.id_usuario
            )

            try:
                ruta_pdf = generar_comprobante_fiscal(pago, venta)
                if venta.id_usuario and getattr(venta.id_usuario, 'email', None):
                    enviar_correo_confirmacion_compra(venta=venta, pago=pago, ruta_pdf=ruta_pdf)
            except Exception as e:
                print(f"[Webhook MP Simulado] Advertencia al generar comprobante: {e}")

        return {"status": "approved", "venta_id": venta.id_venta, "payment_id": payment_id}

    from core_app.selectors import obtener_mercadopago_access_token
    access_token = obtener_mercadopago_access_token()
    if not access_token or 'TU_ACCESS_TOKEN' in access_token:
        return {"status": "ignored", "motivo": "Access token de Mercado Pago no configurado en la BD ni en el entorno"}

    sdk = mercadopago.SDK(access_token)
    try:
        payment_info = sdk.payment().get(str(payment_id))
        payment = payment_info.get("response", {})
    except Exception as e:
        return {"status": "error", "motivo": f"Fallo al consultar API de MP: {str(e)}"}

    status_pago = payment.get("status")
    external_ref = payment.get("external_reference")

    if not external_ref:
        return {"status": "ignored", "motivo": f"El pago {payment_id} no posee external_reference"}

    try:
        id_venta = int(external_ref)
        venta = Venta.objects.select_for_update().get(id_venta=id_venta)
    except (ValueError, Venta.DoesNotExist):
        return {"status": "error", "motivo": f"Venta {external_ref} no encontrada"}

    # Si la venta ya fue cancelada (por expiración de reserva o por el usuario), no acreditar
    if str(venta.estado_venta or '').upper() == "CANCELADA":
        LogSistema.objects.create(
            fecha_hora=timezone.now(),
            accion="Alerta: Pago recibido en Venta Cancelada/Expirada",
            detalle=f"Se recibió notificación de pago #{payment_id} para la Venta #{venta.id_venta}, pero la orden ya fue cancelada y su reserva expiró.",
            tipo="ALERTA_VENTA",
            modulo_origen="sales_app",
            tabla_afectada="venta",
            id_registro_afectado=str(venta.id_venta),
            id_usuario=venta.id_usuario
        )
        return {"status": "ignored_cancelled", "venta_id": venta.id_venta}

    medio_pago_mp, _ = MedioPago.objects.get_or_create(
        nombre_medio_pago='Mercado Pago',
        defaults={'estado': True, 'recargo': Decimal('0.00')}
    )

    if status_pago == "approved":
        monto_pagado = Decimal(str(payment.get("transaction_amount") or (venta.monto_subtotal + venta.costo_envio)))
        tipo_operacion = payment.get("payment_type_id") or "mercadopago"
        medio_detalle = payment.get("payment_method_id") or "transferencia"

        pago_existente = Pago.objects.filter(cod_operacion=str(payment_id)).first()
        if not pago_existente:
            Pago.objects.create(
                id_venta=venta,
                medio_pago=medio_pago_mp,
                monto_pagado=monto_pagado,
                fecha_pago=timezone.now().date(),
                cod_operacion=str(payment_id),
                detalle=f"Acreditación automática Mercado Pago - Operación #{payment_id} ({medio_detalle} - {tipo_operacion})"
            )

        if venta.estado_venta != "PAGADA":
            venta.estado_venta = "PAGADA"
            venta.save(update_fields=["estado_venta"])

            LogSistema.objects.create(
                fecha_hora=timezone.now(),
                accion="Acreditación Mercado Pago Webhook",
                detalle=f"Venta #{venta.id_venta} pagada con éxito vía Mercado Pago. Operación #{payment_id}, Monto: ${monto_pagado}.",
                tipo="AUDITORIA_VENTA",
                modulo_origen="sales_app",
                tabla_afectada="venta",
                id_registro_afectado=str(venta.id_venta),
                id_usuario=venta.id_usuario
            )

            # Generar factura oficial en PDF y despachar correo electrónico con el PDF adjunto
            try:
                ruta_pdf = generar_comprobante_fiscal(pago, venta)
                enviar_correo_confirmacion_compra(venta=venta, pago=pago, ruta_pdf=ruta_pdf)
            except Exception as e:
                print(f"[Webhook MP] Advertencia al generar comprobante o enviar correo: {e}")

        return {"status": "approved", "venta_id": venta.id_venta, "payment_id": payment_id}

    elif status_pago in ["rejected", "cancelled"]:
        LogSistema.objects.create(
            fecha_hora=timezone.now(),
            accion="Pago Rechazado Mercado Pago",
            detalle=f"Pago #{payment_id} para Venta #{venta.id_venta} en estado: {status_pago}.",
            tipo="AUDITORIA_VENTA",
            modulo_origen="sales_app",
            tabla_afectada="venta",
            id_registro_afectado=str(venta.id_venta),
            id_usuario=venta.id_usuario
        )
        return {"status": status_pago, "venta_id": venta.id_venta}

    return {"status": status_pago or "pending", "venta_id": venta.id_venta}


@transaction.atomic
def cancelar_venta_y_restituir_stock(
    *,
    id_venta: int,
    usuario: Optional[Usuario] = None,
    motivo: str = "Cancelación por usuario o expiración de reserva temporal"
) -> Venta:
    """
    Cancela una venta virtual pendiente y restituye el stock apartado
    mediante movimientos de tipo 'devolucion' para reponer el inventario.
    """
    try:
        if usuario:
            venta = Venta.objects.select_for_update().get(id_venta=id_venta, id_usuario=usuario)
        else:
            venta = Venta.objects.select_for_update().get(id_venta=id_venta)
    except Venta.DoesNotExist:
        raise ValidationError("La orden especificada no existe o no pertenece al usuario autenticado.")

    estado_actual = str(venta.estado_venta or '').upper()

    if estado_actual == 'CANCELADA':
        return venta

    if estado_actual == 'PAGADA':
        raise ValidationError("No es posible cancelar una orden que ya ha sido pagada.")

    # Restituir cada renglón de detalle
    detalles = list(venta.detalleventa_set.select_related('id_producto').all())
    for det in detalles:
        prod = det.id_producto
        cant = int(det.cantidad or 1)
        stock = Stock.objects.select_for_update().filter(id_producto=prod).first()
        if stock:
            MovimientoStock.objects.create(
                id_stock=stock,
                tipo_movimiento='devolucion',
                cantidad=cant,
                fecha=timezone.now().date(),
                motivo=f"Restitución de stock por cancelación de Venta #{venta.id_venta}",
                uso_taller=False,
                id_venta=venta
            )

    # Restituir los productos al carrito de compras activo del cliente
    carrito_activo, _ = CarritoCompra.objects.get_or_create(
        id_usuario=venta.id_usuario,
        estado='activo',
        defaults={'fecha_creacion': timezone.now().date()}
    )
    for det in detalles:
        item_existente = CarritoProducto.objects.filter(
            id_carrito=carrito_activo,
            id_producto=det.id_producto
        ).first()
        if item_existente:
            item_existente.cantidad += det.cantidad
            item_existente.save(update_fields=['cantidad'])
        else:
            CarritoProducto.objects.create(
                id_carrito=carrito_activo,
                id_producto=det.id_producto,
                cantidad=det.cantidad
            )

    venta.estado_venta = 'CANCELADA'
    venta.save(update_fields=['estado_venta'])

    # Invalidar de inmediato la preferencia en Mercado Pago para que el link expire
    logs_pref = LogSistema.objects.filter(
        modulo_origen='sales_app',
        tabla_afectada='venta',
        id_registro_afectado=str(venta.id_venta),
        accion="Preferencia Mercado Pago Creada"
    )
    for lp in logs_pref:
        if lp.detalle:
            pref_id_cancelar = lp.detalle.split('|')[0]
            invalidar_preferencia_mercadopago(pref_id_cancelar)

    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Cancelación de Venta y Restitución de Stock",
        detalle=(
            f"Venta #{venta.id_venta} cancelada. "
            f"Motivo: {motivo}. Link de pago invalidado y stock devuelto al inventario disponible."
        )[:1000],
        tipo="AUDITORIA_VENTA",
        modulo_origen="sales_app",
        tabla_afectada="venta",
        id_registro_afectado=str(venta.id_venta),
        id_usuario=usuario or venta.id_usuario
    )

    return venta


def limpiar_ventas_pendientes_expiradas(minutos_limite: int = 30) -> int:
    """
    Verifica ventas en estado PENDIENTE creadas hace más de `minutos_limite`.
    Cancela y restituye automáticamente el stock apartado.
    Retorna el número de ventas canceladas y restituidas.
    """
    import datetime
    ahora = timezone.now()
    fecha_hoy = ahora.date()

    ventas_pendientes = Venta.objects.filter(estado_venta__iexact='PENDIENTE')
    canceladas = 0

    for venta in ventas_pendientes:
        debe_cancelar = False

        if venta.fecha_venta < fecha_hoy:
            debe_cancelar = True
        else:
            log_creacion = LogSistema.objects.filter(
                modulo_origen='sales_app',
                tabla_afectada='venta',
                id_registro_afectado=str(venta.id_venta),
                accion="Realizar Compra Virtual (CU-18)"
            ).first()

            if log_creacion and log_creacion.fecha_hora:
                hora_log = log_creacion.fecha_hora
                dt_creacion = datetime.datetime.combine(venta.fecha_venta, hora_log)
                if timezone.is_naive(dt_creacion):
                    dt_creacion = timezone.make_aware(dt_creacion, timezone.get_current_timezone())

                delta = ahora - dt_creacion
                if delta.total_seconds() > (minutos_limite * 60):
                    debe_cancelar = True

        if debe_cancelar:
            try:
                cancelar_venta_y_restituir_stock(
                    id_venta=venta.id_venta,
                    motivo=f"Expiración automática por superar {minutos_limite} minutos sin concretar pago"
                )
                canceladas += 1
            except Exception:
                pass

    return canceladas


def enviar_correo_confirmacion_compra(
    *,
    venta: Venta,
    pago: Pago,
    ruta_pdf: Optional[str] = None
) -> None:
    """
    Despacha un correo electrónico formal al cliente tras la acreditación exitosa de su compra:
    - Adjunta el comprobante / factura en PDF generado físicamente.
    - Informa el código oficial de la orden:
      * Si es con retiro en local: indica explícitamente que es el código para retirar en sede central.
      * Si es con envío a domicilio: indica que es el código de seguridad y seguimiento.
    - Persiste el aviso en el modelo Notificacion de core_app y asienta la auditoría en LogSistema.
    """
    from core_app.selectors import obtener_email_emisor
    from core_app.models import Notificacion, ConfiguracionSistema

    usuario = venta.id_usuario
    if not usuario or not getattr(usuario, 'email', None):
        return

    # Extraer datos de la empresa emisora
    configs = {
        c.clave: c.valor
        for c in ConfiguracionSistema.objects.filter(
            clave__in=['nombreLocal', 'direccionLocal', 'telefonoLocal', 'emailLocal']
        )
    }
    nombre_local = configs.get('nombreLocal') or 'IFixPos'
    direccion_local = configs.get('direccionLocal') or 'Sede Central IFixPos'
    telefono_local = configs.get('telefonoLocal') or '3794-000000'

    # Nombre del cliente
    perfil = getattr(usuario, 'perfilusuario', None)
    nombre_cliente = f"{perfil.nombre or ''} {perfil.apellido or ''}".strip() if perfil else usuario.email
    if not nombre_cliente:
        nombre_cliente = usuario.email

    es_retiro = (str(venta.metodo_entrega or '').upper() == 'RETIRO')
    codigo_orden = venta.codigo_sec or f"VTA-{venta.id_venta}"
    total_abonado = pago.monto_pagado or (venta.monto_subtotal + venta.costo_envio)

    if es_retiro:
        instruccion_codigo_html = (
            f"<div style='background-color: #0c4a6e; border: 1px solid #0284c7; padding: 18px; border-radius: 12px; margin: 20px 0; text-align: center;'>"
            f"<p style='margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; color: #38bdf8; letter-spacing: 1px; font-weight: bold;'>📍 Código de Retiro en Local</p>"
            f"<p style='margin: 0; font-size: 28px; font-family: monospace; font-weight: bold; color: #ffffff; letter-spacing: 3px;'>{codigo_orden}</p>"
            f"<p style='margin: 10px 0 0 0; font-size: 13px; color: #bae6fd; line-height: 1.5;'>"
            f"<b>Guarda este código de seguridad</b>, ya que lo vas a necesitar al momento de retirar tus productos en nuestra <b>Sede Central</b> ({direccion_local}) junto con tu DNI."
            f"</p>"
            f"</div>"
        )
        instruccion_codigo_txt = (
            f"CÓDIGO DE RETIRO EN LOCAL: {codigo_orden}\n"
            f"Por favor guarda este código de seguridad; lo necesitarás al momento de retirar tus productos en nuestra Sede Central ({direccion_local}) junto con tu DNI.\n"
        )
        modo_entrega_str = "Retiro en Sede Central (Mostrador)"
    else:
        dir_envio_txt = "Domicilio Registrado"
        if venta.id_direccion_envio:
            de = venta.id_direccion_envio
            partes = [de.calle, de.numero]
            if getattr(de, 'id_ciudad', None):
                partes.append(de.id_ciudad.nombre_ciudad)
            dir_envio_txt = ", ".join([p for p in partes if p])

        instruccion_codigo_html = (
            f"<div style='background-color: #1e1b4b; border: 1px solid #6366f1; padding: 18px; border-radius: 12px; margin: 20px 0; text-align: center;'>"
            f"<p style='margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; color: #a5b4fc; letter-spacing: 1px; font-weight: bold;'>🛡️ Código de Seguridad y Seguimiento</p>"
            f"<p style='margin: 0; font-size: 28px; font-family: monospace; font-weight: bold; color: #ffffff; letter-spacing: 3px;'>{codigo_orden}</p>"
            f"<p style='margin: 10px 0 0 0; font-size: 13px; color: #e0e7ff; line-height: 1.5;'>"
            f"<b>Guarda este código de seguridad</b>: te servirá como comprobante para cualquier consulta o reclamo en caso de que tus productos no lleguen a tu ubicación.<br/>"
            f"<span style='color: #c7d2fe; font-weight: 600; display: inline-block; margin-top: 6px;'>📦 Por favor está atento durante los próximos días hábiles, tu compra llegará pronto al destino seleccionado ({dir_envio_txt}).</span>"
            f"</p>"
            f"</div>"
        )
        instruccion_codigo_txt = (
            f"CÓDIGO DE SEGURIDAD Y SEGUIMIENTO: {codigo_orden}\n"
            f"Guarda este código de seguridad: te servirá para reclamos o consultas en caso de que tus productos no lleguen a tu ubicación.\n"
            f"Por favor está atento durante los próximos días hábiles: tu compra llegará pronto a tu destino seleccionado ({dir_envio_txt}).\n"
        )
        modo_entrega_str = f"Envío a Domicilio ({dir_envio_txt})"

    # Desglose de productos
    detalles = venta.detalleventa_set.select_related('id_producto').all()
    filas_html = ""
    filas_txt = ""
    for d in detalles:
        nom = d.id_producto.nombre if d.id_producto else "Repuesto"
        sub = d.subtotal
        filas_html += (
            f"<tr>"
            f"<td style='padding: 8px 12px; border-bottom: 1px solid #334155; color: #f1f5f9;'>{nom}</td>"
            f"<td style='padding: 8px 12px; border-bottom: 1px solid #334155; color: #cbd5e1; text-align: center;'>{d.cantidad}</td>"
            f"<td style='padding: 8px 12px; border-bottom: 1px solid #334155; color: #38bdf8; text-align: right; font-family: monospace;'>${sub:,.2f}</td>"
            f"</tr>"
        )
        filas_txt += f"- {nom} x{d.cantidad}: ${sub:,.2f}\n"

    cuerpo_html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #e2e8f0; margin: 0; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <div style="background: linear-gradient(135deg, #0284c7, #6366f1); padding: 24px 32px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">¡Tu Compra ha sido Confirmada!</h1>
          <p style="color: #e0f2fe; margin: 6px 0 0 0; font-size: 13px;">{nombre_local} • Comprobante de Operación</p>
        </div>
        <div style="padding: 28px 32px;">
          <p style="font-size: 15px; color: #f8fafc; margin-top: 0;">Hola, <b>{nombre_cliente}</b>:</p>
          <p style="font-size: 13px; color: #94a3b8; line-height: 1.6;">
            Tu pago por un monto total de <b style="color: #38bdf8; font-size: 15px;">${total_abonado:,.2f}</b> ha sido acreditado exitosamente. Hemos preparado tu orden y adjuntado tu factura oficial en formato PDF a este correo electrónico.
          </p>

          {instruccion_codigo_html}

          <div style="margin: 24px 0;">
            <p style="font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: bold; margin-bottom: 8px; letter-spacing: 0.5px;">Resumen del Pedido</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; background-color: #1e293b; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background-color: #0f172a; border-bottom: 2px solid #334155;">
                  <th style="padding: 8px 12px; text-align: left; color: #94a3b8; font-size: 11px;">Producto</th>
                  <th style="padding: 8px 12px; text-align: center; color: #94a3b8; font-size: 11px;">Cant.</th>
                  <th style="padding: 8px 12px; text-align: right; color: #94a3b8; font-size: 11px;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {filas_html}
              </tbody>
            </table>
          </div>

          <div style="background-color: #1e293b; padding: 14px 18px; border-radius: 10px; font-size: 12px; color: #94a3b8; margin-top: 20px;">
            <p style="margin: 0 0 4px 0;"><b>Modalidad de entrega:</b> {modo_entrega_str}</p>
            <p style="margin: 0;"><b>Adjunto:</b> Encontrarás tu Factura / Comprobante Fiscal en formato PDF adjunta a este email para su descarga o impresión.</p>
          </div>

          <div style="margin-top: 24px; padding: 16px; background-color: #0c1a2e; border: 1px solid #0284c7; border-radius: 12px; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #38bdf8; font-weight: bold;">
              ¡Muchas gracias por comprar en nuestra tienda virtual!
            </p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">
              Apreciamos tu confianza en {nombre_local}.
            </p>
          </div>

          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b;">
            <p style="margin: 0;">{nombre_local} • Tel: {telefono_local}</p>
            <p style="margin: 4px 0 0 0;">Mensaje generado automáticamente por el sistema IFixPos.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
    """

    cuerpo_txt = (
        f"¡Tu Compra ha sido Confirmada en {nombre_local}!\n\n"
        f"Hola, {nombre_cliente}:\n"
        f"Tu pago de ${total_abonado:,.2f} fue acreditado exitosamente.\n\n"
        f"{instruccion_codigo_txt}\n"
        f"Modalidad: {modo_entrega_str}\n\n"
        f"Resumen de repuestos:\n{filas_txt}\n"
        f"Total Abonado: ${total_abonado:,.2f}\n\n"
        f"Tu factura oficial en formato PDF se encuentra adjunta a este mensaje.\n\n"
        f"¡Muchas gracias por comprar en nuestra tienda virtual! Apreciamos tu confianza en {nombre_local}.\n"
    )

    # 1. Enviar el correo electrónico con el PDF adjunto
    asunto = f"¡Compra Confirmada! Comprobante Oficial - {nombre_local}"
    email_emisor = obtener_email_emisor()
    email_msg = EmailMultiAlternatives(
        subject=asunto,
        body=cuerpo_txt,
        from_email=email_emisor,
        to=[usuario.email]
    )
    email_msg.attach_alternative(cuerpo_html, "text/html")

    # Localizar archivo físico de la factura
    pdf_path_rel = ruta_pdf or pago.ruta_comprobante
    if pdf_path_rel:
        pdf_filename = os.path.basename(pdf_path_rel)
        pdf_path_abs = os.path.join(settings.MEDIA_ROOT, 'facturas', pdf_filename)
        if os.path.exists(pdf_path_abs):
            try:
                email_msg.attach_file(pdf_path_abs, 'application/pdf')
            except Exception as e_att:
                print(f"[Confirmación Compra] Advertencia al adjuntar archivo PDF: {e_att}")

    try:
        email_msg.send(fail_silently=False)
    except Exception as e:
        print(f"[Confirmación Compra] Advertencia al despachar correo a {usuario.email}: {e}")

    # 2. Persistir registro en Notificacion
    try:
        if es_retiro:
            msg_notif = (
                f"¡Pago confirmado! Tu orden ({codigo_orden}) fue acreditada (${total_abonado:,.2f}). "
                f"Guarda este código para retirar en nuestra Sede Central junto con tu DNI. ¡Gracias por tu compra!"
            )
        else:
            msg_notif = (
                f"¡Pago confirmado! Tu orden ({codigo_orden}) fue acreditada (${total_abonado:,.2f}). "
                f"Guarda tu código para seguimiento o reclamos. Está atento en los próximos días hábiles a la llegada de tu paquete. ¡Gracias por tu compra!"
            )
        Notificacion.objects.create(
            id_usuario=usuario,
            mensaje=msg_notif[:1000],
            tipo="COMPRA_VIRTUAL",
            fecha_envio=timezone.now().date(),
            leida=False
        )
    except Exception:
        pass

    # 3. Auditoría en LogSistema
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Envío de Factura y Confirmación de Compra",
        detalle=(
            f"Correo de confirmación con factura PDF y código {codigo_orden} ({'Retiro' if es_retiro else 'Envío'}) "
            f"despachado a {usuario.email} para Venta #{venta.id_venta}."
        )[:1000],
        tipo="NOTIFICACION_COMPRA",
        modulo_origen="sales_app",
        tabla_afectada="venta",
        id_registro_afectado=str(venta.id_venta),
        id_usuario=usuario
    )






