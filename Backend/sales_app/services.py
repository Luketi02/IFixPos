import os
import uuid
from decimal import Decimal
from typing import Dict, Any, Optional, List, Tuple

from django.conf import settings
from django.db import transaction
from django.db.models import Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.core.exceptions import ValidationError

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

    item = CarritoProducto.objects.filter(
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
        fecha_hora=timezone.now().time(),
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
    generar_comprobante_fiscal(pago, operacion)

    # Auditoría en LogSistema
    tipo_op = "Venta" if isinstance(operacion, Venta) else "Reparación"
    id_op = operacion.id_venta if isinstance(operacion, Venta) else operacion.id_reparacion
    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
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
) -> LogSistema:
    """
    CU-38: Filtrar Cobros y Pagos.
    Almacena el evento de auditoría interna sobre las consultas y filtros
    aplicados en el módulo contable.
    """
    filtros_legibles = {
        k: v for k, v in filtros_aplicados.items()
        if v not in [None, '', 'null']
    }
    filtros_resumen = ", ".join(f"{k}={v}" for k, v in filtros_legibles.items()) or "Sin filtros (listado completo)"

    return LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
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
            fecha_hora=timezone.now().time(),
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
        fecha_hora=timezone.now().time(),
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
        fecha_hora=timezone.now().time(),
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
) -> Tuple[Venta, List[str]]:
    """
    CU-67: Realizar Venta Presencial.
    Permite registrar la entrega física de mercadería a un cliente en mostrador,
    congelando precios vigentes en DetalleVenta, descontando inventario en MovimientoStock
    y dejando la operación en estado 'PENDIENTE' para su liquidación en caja.
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
        fecha_hora=timezone.now().time(),
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

    return venta, warnings


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

    beneficio = obtener_beneficio_para_auditoria(id_beneficio)

    cliente_email = beneficio.id_usuario.email if beneficio.id_usuario else "Desconocido"
    prod_nom = beneficio.id_producto.nombre if beneficio.id_producto else "Desconocido"

    # Asentar la traza de auditoría de la revisión gerencial
    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
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
        fecha_hora=timezone.now().time(),
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
        fecha_hora=timezone.now().time(),
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



