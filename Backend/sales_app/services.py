from __future__ import annotations

import os
import uuid
import datetime
import logging
from decimal import Decimal
from typing import Dict, Any, Optional, List, Tuple

from django.conf import settings
from django.db import transaction
from django.db.models import Sum, Value, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.core.mail import EmailMultiAlternatives

from sales_app.models import Venta, DetalleVenta, CarritoCompra, CarritoProducto, Pago, MedioPago, Beneficio
from catalog_app.models import Producto
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


logger = logging.getLogger(__name__)

TIPOS_INGRESO = ['ingreso', 'compra', 'devolucion', 'alta', 'entrada']
TIPOS_EGRESO = ['egreso', 'venta', 'taller', 'baja', 'salida', 'consumo']
EMAIL_CONSUMIDOR_FINAL = 'consumidorfinal@ifixpos.com'
SIN_DATO_COMERCIO = 'No informado'


def _resolver_direccion_comercio(configs: Dict[str, Any]) -> str:
    """
    Devuelve la ubicación legible (Ciudad, Provincia, País) de la sede del comercio.
    Prioriza el ID de dirección en 'direccionLocal' y recurre a la sede registrada.
    Si no existe ninguna, retorna SIN_DATO_COMERCIO (nunca un domicilio inventado).
    """
    id_dir_raw = str(configs.get('direccionLocal') or '').strip()
    dir_sede = None
    if id_dir_raw.isdigit():
        dir_sede = Direccion.objects.select_related(
            'id_ciudad__id_provincia__id_pais'
        ).filter(id_direccion=int(id_dir_raw)).first()

    if not dir_sede:
        from geo_app.selectors import obtener_direccion_sede
        dir_sede = obtener_direccion_sede()

    if dir_sede and getattr(dir_sede, 'id_ciudad', None):
        provincia = dir_sede.id_ciudad.id_provincia
        partes = [
            dir_sede.id_ciudad.nombre_ciudad or '',
            getattr(provincia, 'nombre_provincia', ''),
            getattr(getattr(provincia, 'id_pais', None), 'nombre_pais', ''),
        ]
        texto = ", ".join(p for p in partes if p)
        if texto:
            return texto
    return SIN_DATO_COMERCIO


from sales_app.services_mercadopago import (
    simulacion_mercadopago_habilitada,
    validar_firma_webhook_mercadopago,
    invalidar_preferencia_mercadopago,
    crear_preferencia_mercadopago,
    crear_preferencia_mercadopago_invitado,
    procesar_webhook_mercadopago,
    _obtener_o_crear_medio_pago_mp,
)
from sales_app.services_carrito import (
    agregar_producto_a_carrito,
    quitar_producto_de_carrito,
    actualizar_cantidad_producto_carrito,
)



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
    # Liberar preventivamente cualquier reserva temporal vencida según parámetro de sistema
    from core_app.selectors import obtener_minutos_reserva_venta_pendiente, obtener_longitud_codigo_seguridad
    limpiar_ventas_pendientes_expiradas(minutos_limite=obtener_minutos_reserva_venta_pendiente())

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

    longitud_cod = obtener_longitud_codigo_seguridad()
    codigo_seguridad = uuid.uuid4().hex[:longitud_cod].upper()

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
    # Paso 4.1: Canjear Beneficios Acumulables (si fueron seleccionados)
    # -------------------------------------------------------------------------
    beneficios_seleccionados = datos_compra.get('beneficios_aplicados') or []
    if beneficios_seleccionados:
        aplicar_y_canjear_beneficios_en_venta(
            venta=venta,
            lista_id_beneficios=beneficios_seleccionados,
            items_compra=items_carrito
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


def _calcular_total_operacion(operacion) -> Decimal:
    """Calcula el total adeudado de una Venta o Reparación (incluyendo mano de obra e insumos)."""
    if isinstance(operacion, Venta):
        subtotal = Decimal(str(operacion.monto_subtotal or '0.00'))
        envio = Decimal(str(operacion.costo_envio or '0.00'))
        return subtotal + envio
    elif isinstance(operacion, Reparacion):
        # 1. Costo de mano de obra técnica del diagnóstico (usando caché de prefetch si existe)
        costo_diag = Decimal('0.00')
        diagnosticos = list(operacion.diagnostico_set.all())
        diag = max(diagnosticos, key=lambda d: d.id_diagnostico) if diagnosticos else None
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
            estado_v = str(operacion.id_venta.estado_venta or '').upper()
            ya_pagada = estado_v in ('PAGADO', 'PAGADA') or operacion.id_venta.pago_set.exists()
            if not ya_pagada:
                if total_reparacion > Decimal('0.00'):
                    # Sincronizar monto_subtotal de la cabecera de Venta si sigue pendiente
                    if operacion.id_venta.monto_subtotal != total_reparacion:
                        operacion.id_venta.monto_subtotal = total_reparacion
                        operacion.id_venta.save(update_fields=['monto_subtotal'])
                else:
                    # Si aún no hay diagnóstico cargado, respetar el importe base de la venta (ej. diagnóstico inicial)
                    total_reparacion = Decimal(str(operacion.id_venta.monto_subtotal or '0.00'))

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
    # Datos fiscales/contacto del emisor: jamás se inventan valores; si faltan se informa "No informado"
    cuil_local = configs.get('cuilLocal') or SIN_DATO_COMERCIO
    if cuil_local == SIN_DATO_COMERCIO:
        logger.warning(
            "[Comprobante Fiscal] 'cuilLocal' no está configurado en ConfiguracionSistema: "
            "el comprobante se emite sin CUIT del emisor."
        )
    telefono_local = configs.get('telefonoLocal') or ''
    email_local = configs.get('emailLocal') or ''

    # Obtener ubicación real (Ciudad, Provincia, País) referenciada por direccionLocal
    direccion_local = _resolver_direccion_comercio(configs)

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
        partes_contacto = []
        if telefono_local:
            partes_contacto.append(f"<b>Tel:</b> {telefono_local}")
        if email_local:
            partes_contacto.append(f"<b>Email:</b> {email_local}")
        datos_emisor = [
            Paragraph(f"<b>{nombre_local}</b>", estilo_titulo),
            Paragraph(f"<b>CUIT:</b> {cuil_local}", estilo_subtitulo),
            Paragraph(f"<b>Dirección:</b> {direccion_local}", estilo_subtitulo),
            Paragraph(" | ".join(partes_contacto) or "<b>Contacto:</b> No informado", estilo_subtitulo),
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

            # Renglones discriminados de cupones y beneficios canjeados
            from sales_app.selectors import obtener_beneficios_aplicados_en_venta
            beneficios_aplicados_pdf = obtener_beneficios_aplicados_en_venta(operacion.id_venta)
            for ben in beneficios_aplicados_pdf:
                filas_items.append([
                    Paragraph(f"<b>Beneficio Aplicado:</b> {ben['producto_nombre']}", estilo_td),
                    Paragraph("1", estilo_td),
                    Paragraph(f"-{ben['por_desc']:.1f}%", estilo_td_num),
                    Paragraph("Bonificado", estilo_td_num),
                ])

            # Si la venta corresponde al cobro de diagnóstico de una reparación (o no tiene productos de catálogo)
            rep_asoc = operacion.reparacion_set.select_related(
                'id_dispositivo',
                'id_dispositivo__id_modelo',
                'id_dispositivo__id_modelo__id_marca'
            ).first()
            if rep_asoc:
                disp = rep_asoc.id_dispositivo
                marca_nombre = getattr(getattr(getattr(disp, 'id_modelo', None), 'id_marca', None), 'nombre', '') or ''
                modelo_nombre = getattr(getattr(disp, 'id_modelo', None), 'nombre', '') or ''
                sn = getattr(disp, 'numero_serie', '') or ''
                disp_str = f"{marca_nombre} {modelo_nombre}".strip() or "Dispositivo"
                if sn:
                    disp_str += f" (N. Serie: {sn})"
                concepto_diag = f"Pago de Diagnóstico Técnico - {disp_str}"
                filas_items.append([
                    Paragraph(concepto_diag, estilo_td),
                    Paragraph("1", estilo_td),
                    Paragraph(f"${pago.monto_pagado:,.2f}", estilo_td_num),
                    Paragraph(f"${pago.monto_pagado:,.2f}", estilo_td_num),
                ])
            elif len(filas_items) == 1:
                filas_items.append([
                    Paragraph(f"Cobro de Venta #{operacion.id_venta}", estilo_td),
                    Paragraph("1", estilo_td),
                    Paragraph(f"${pago.monto_pagado:,.2f}", estilo_td_num),
                    Paragraph(f"${pago.monto_pagado:,.2f}", estilo_td_num),
                ])
        elif hasattr(operacion, 'id_reparacion'):
            disp_info = "Dispositivo en Taller"
            if getattr(operacion, 'id_dispositivo', None):
                disp = operacion.id_dispositivo
                marca_nombre = getattr(getattr(getattr(disp, 'id_modelo', None), 'id_marca', None), 'nombre', '') or ''
                modelo_nombre = getattr(getattr(disp, 'id_modelo', None), 'nombre', '') or ''
                sn = getattr(disp, 'numero_serie', '') or ''
                disp_info = f"{marca_nombre} {modelo_nombre}".strip() or f"{getattr(disp, 'marca', '')} {getattr(disp, 'modelo', '')}".strip() or "Dispositivo"
                if sn:
                    disp_info += f" (N. Serie: {sn})"

            # Verificar si existió un pago previo de diagnóstico para detallarlo en la factura final
            pago_diag_previo = Pago.objects.filter(
                id_venta__reparacion=operacion,
                monto_pagado__gt=Decimal('0.00')
            ).exclude(id_pago=pago.id_pago).first()

            if pago_diag_previo:
                fecha_prev = pago_diag_previo.fecha_pago.strftime('%d/%m/%Y') if pago_diag_previo.fecha_pago else ''
                concepto_previo = f"Pago de Diagnóstico Técnico - {disp_info} (Abonado previamente el {fecha_prev})"
                filas_items.append([
                    Paragraph(f"<b>{concepto_previo}</b>", estilo_td),
                    Paragraph("1", estilo_td),
                    Paragraph(f"${pago_diag_previo.monto_pagado:,.2f}", estilo_td_num),
                    Paragraph(f"${pago_diag_previo.monto_pagado:,.2f}", estilo_td_num),
                ])

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

            # Si no hubo desglose específico, renglón de diagnóstico detallando el dispositivo
            if len(filas_items) == 1:
                filas_items.append([
                    Paragraph(f"Pago de Diagnóstico Técnico - {disp_info}", estilo_td),
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

    # Resolver o crear MedioPago priorizando código interno inmutable
    from core_app.constantes import deducir_codigo_medio_pago
    from sales_app.selectors import _construir_desglose_cobro
    medio_pago_input = str(datos_validados.get('medio_pago') or 'EFECTIVO').strip()
    medio_pago_obj = None
    if medio_pago_input.isdigit():
        medio_pago_obj = MedioPago.objects.filter(id_mediopago=int(medio_pago_input)).first()
    if not medio_pago_obj:
        medio_pago_obj = MedioPago.objects.filter(codigo__iexact=medio_pago_input).first()
    if not medio_pago_obj:
        medio_pago_obj = MedioPago.objects.filter(nombre_medio_pago__iexact=medio_pago_input).first()
    if not medio_pago_obj:
        medio_pago_obj = MedioPago.objects.filter(nombre_medio_pago__icontains=medio_pago_input).first()
    if not medio_pago_obj:
        medio_pago_obj = MedioPago.objects.create(
            codigo=deducir_codigo_medio_pago(medio_pago_input),
            nombre_medio_pago=medio_pago_input.upper(),
            estado=True,
            recargo=Decimal('0.00')
        )
    elif not medio_pago_obj.codigo:
        medio_pago_obj.codigo = deducir_codigo_medio_pago(medio_pago_obj.nombre_medio_pago)
        medio_pago_obj.save(update_fields=['codigo'])

    # Si es Reparación y no tiene Venta vinculada, aseguramos una venta para consistencia
    venta_asociada = None
    if isinstance(operacion, Venta):
        venta_asociada = operacion
    elif isinstance(operacion, Reparacion):
        # La venta del diagnóstico inicial (cobro único) puede estar saldada:
        # no se reutiliza para evitar un segundo Pago sobre la misma cabecera.
        _previa = operacion.id_venta
        _saldada = bool(_previa and str(_previa.estado_venta).strip().upper() in ('PAGADO', 'PAGADA'))
        if _previa and not _saldada:
            venta_asociada = _previa
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
    if venta_asociada:
        # Limpiar cualquier registro transitorio en cero previo a asentar el abono real
        Pago.objects.filter(id_venta=venta_asociada, monto_pagado=Decimal('0.00')).delete()

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
        try:
            evaluar_beneficio_post_compra(venta=operacion)
        except Exception as e_post:
            logger.warning(f"[Motor Beneficios] Error post-compra en completar_pago: {e_post}")

        # Si la venta corresponde al cobro de diagnóstico inicial de una reparación, actualizar etapa y bitácora
        for rep in operacion.reparacion_set.all():
            try:
                from workshop_app.models import BitacoraReparacion
                etapa_rep = str(rep.etapa or '').strip().upper()
                if etapa_rep == 'ESPERANDO_PAGO_DIAGNOSTICO':
                    rep.etapa = 'ESPERANDO_DIAGNOSTICO'
                    rep.save(update_fields=['etapa'])
                    estado_alc = 2  # ESPERANDO_DIAGNOSTICO
                    comentario = (
                        f"Transacción en caja: Abono de costo de diagnóstico (${monto_abonado:,.2f}) confirmado mediante {medio_pago_obj.nombre_medio_pago} por {usuario_ejecutor.email}.\n"
                        f"Cobertura de diagnóstico: Pago único acreditado (solo se abona el primer diagnóstico; evaluaciones posteriores sin cargo).\n"
                        f"Cambio de etapa: El equipo avanza automáticamente a 'Esperando Diagnóstico'."
                    )
                elif etapa_rep == 'ESPERANDO_DISPOSITIVO':
                    estado_alc = 1  # ESPERANDO_DISPOSITIVO
                    comentario = (
                        f"Transacción en caja: Abono de costo de diagnóstico (${monto_abonado:,.2f}) confirmado mediante {medio_pago_obj.nombre_medio_pago} por {usuario_ejecutor.email}.\n"
                        f"Cobertura de diagnóstico: Pago único acreditado (solo se abona el primer diagnóstico; evaluaciones posteriores sin cargo).\n"
                        f"Estado actual: Pendiente de recepción física del equipo en mostrador."
                    )
                else:
                    ultimo_estado = rep.bitacorareparacion_set.order_by('-id_bitacora').first()
                    estado_alc = ultimo_estado.estado_alcanzado if ultimo_estado else 2
                    comentario = (
                        f"Transacción en caja: Abono de costo de diagnóstico (${monto_abonado:,.2f}) confirmado mediante {medio_pago_obj.nombre_medio_pago} por {usuario_ejecutor.email}.\n"
                        f"Cobertura de diagnóstico: Pago único acreditado (solo se abona el primer diagnóstico; evaluaciones posteriores sin cargo)."
                    )

                BitacoraReparacion.objects.create(
                    id_reparacion=rep,
                    id_usuario=usuario_ejecutor,
                    fecha_hora=timezone.now(),
                    estado_alcanzado=estado_alc,
                    comentario=comentario
                )
            except Exception as e_bit:
                logger.warning(f"[Bitácora Reparación] Error al registrar abono diagnóstico: {e_bit}")

    elif isinstance(operacion, Reparacion):
        etapa_actual = str(operacion.etapa).strip().upper()
        if etapa_actual in ['PENDIENTE_PAGO', 'ESPERANDO_PAGO', 'FINALIZADO', 'FINALIZADA', 'REPARADO']:
            operacion.etapa = 'PAGADO'
            operacion.save(update_fields=['etapa', 'id_venta'])
            estado_alc = 6  # Finalizada/Pagada
            comentario_rep = (
                f"Liquidación final de reparación (${monto_abonado:,.2f}) confirmada en caja mediante {medio_pago_obj.nombre_medio_pago} por {usuario_ejecutor.email}.\n"
                f"Cambio de etapa: Orden liquidada y lista para entrega."
            )
        elif etapa_actual == 'ESPERANDO_PAGO_DIAGNOSTICO':
            operacion.etapa = 'ESPERANDO_DIAGNOSTICO'
            operacion.save(update_fields=['etapa', 'id_venta'])
            estado_alc = 2  # Esperando Diagnóstico
            comentario_rep = (
                f"Transacción en caja: Abono de costo de diagnóstico (${monto_abonado:,.2f}) confirmado mediante {medio_pago_obj.nombre_medio_pago} por {usuario_ejecutor.email}.\n"
                f"Cobertura de diagnóstico: Pago único acreditado (solo se abona el primer diagnóstico; evaluaciones posteriores sin cargo).\n"
                f"Cambio de etapa: El equipo avanza automáticamente a 'Esperando Diagnóstico'."
            )
        elif etapa_actual == 'ESPERANDO_DISPOSITIVO':
            operacion.save(update_fields=['id_venta'])
            estado_alc = 1  # Esperando Dispositivo
            comentario_rep = (
                f"Transacción en caja: Abono de costo de diagnóstico (${monto_abonado:,.2f}) confirmado mediante {medio_pago_obj.nombre_medio_pago} por {usuario_ejecutor.email}.\n"
                f"Cobertura de diagnóstico: Pago único acreditado (solo se abona el primer diagnóstico; evaluaciones posteriores sin cargo).\n"
                f"Estado actual: Pendiente de recepción física del equipo en mostrador."
            )
        else:
            operacion.save(update_fields=['id_venta'])
            ultimo_estado = operacion.bitacorareparacion_set.order_by('-id_bitacora').first()
            estado_alc = ultimo_estado.estado_alcanzado if ultimo_estado else 2
            comentario_rep = f"Cobro de ${monto_abonado:,.2f} confirmado en caja mediante {medio_pago_obj.nombre_medio_pago} por {usuario_ejecutor.email}."

        if venta_asociada:
            venta_asociada.estado_venta = 'PAGADO'
            venta_asociada.save(update_fields=['estado_venta'])

        try:
            from workshop_app.models import BitacoraReparacion
            BitacoraReparacion.objects.create(
                id_reparacion=operacion,
                id_usuario=usuario_ejecutor,
                fecha_hora=timezone.now(),
                estado_alcanzado=estado_alc,
                comentario=comentario_rep
            )
        except Exception as e_bit:
            logger.warning(f"[Bitácora Reparación] Error al registrar bitácora: {e_bit}")

    # Paso 6: Disparar automáticamente comprobante fiscal (CU-20)
    ruta_factura = generar_comprobante_fiscal(pago, operacion)

    # Asentar la emisión de la factura fiscal en la Bitácora de la Reparación
    try:
        from workshop_app.models import BitacoraReparacion
        reps_para_factura = list(operacion.reparacion_set.all()) if isinstance(operacion, Venta) else ([operacion] if isinstance(operacion, Reparacion) else [])
        for r_fact in reps_para_factura:
            ult_bit = r_fact.bitacorareparacion_set.order_by('-id_bitacora').first()
            est_bit = ult_bit.estado_alcanzado if ult_bit else 2
            BitacoraReparacion.objects.create(
                id_reparacion=r_fact,
                id_usuario=usuario_ejecutor,
                fecha_hora=timezone.now(),
                estado_alcanzado=est_bit,
                comentario=f"Comprobante fiscal emitido: N° 0001-{pago.id_pago:08d} por concepto de 'Pago de Diagnóstico' (${monto_abonado:,.2f}). Factura archivada en el sistema."
            )
    except Exception as exc_bit_pdf:
        logger.warning(f"[Bitácora Factura] Advertencia al asentar comprobante: {exc_bit_pdf}")

    # Despacho de Correo Electrónico especializado según el tipo de operación
    if isinstance(operacion, Venta):
        reps_diag = list(operacion.reparacion_set.all())
        if reps_diag:
            for rep_diag in reps_diag:
                try:
                    enviar_correo_confirmacion_diagnostico(reparacion=rep_diag, pago=pago, ruta_pdf=ruta_factura)
                except Exception as e_diag:
                    logger.warning("[Cobro Diagnóstico] Error al despachar correo de taller: %s", e_diag)
        else:
            try:
                enviar_correo_confirmacion_compra(venta=operacion, pago=pago, ruta_pdf=ruta_factura)
            except Exception as e:
                logger.warning("[Cobro Venta] Advertencia al despachar correo de confirmación de compra: %s", e)

    elif isinstance(operacion, Reparacion):
        etapa_post = str(operacion.etapa).strip().upper()
        if etapa_post in ('ESPERANDO_DIAGNOSTICO', 'ESPERANDO_DISPOSITIVO'):
            try:
                enviar_correo_confirmacion_diagnostico(reparacion=operacion, pago=pago, ruta_pdf=ruta_factura)
            except Exception as e_diag:
                logger.warning("[Cobro Diagnóstico] Error al despachar correo de taller: %s", e_diag)

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

    # Notificación al cliente (Paso 6: CU-21) — Regla 10: jamás exponer IDs internos al cliente
    cliente_destinatario = getattr(operacion, 'id_usuario', None)
    if cliente_destinatario:
        disp_vinculado = getattr(operacion, 'id_dispositivo', None) if isinstance(operacion, Reparacion) else None
        cod_visible = getattr(operacion, 'codigo_sec', None) or (getattr(venta_asociada, 'codigo_sec', None) if venta_asociada else '')
        if isinstance(operacion, Reparacion):
            mod_obj = getattr(disp_vinculado, 'id_modelo', None) if disp_vinculado else None
            marca_nom = getattr(getattr(mod_obj, 'id_marca', None), 'nombre', '') if mod_obj else ''
            mod_nom = getattr(mod_obj, 'nombre', '') if mod_obj else ''
            equipo_str = f"{marca_nom} {mod_nom}".strip()
            if equipo_str:
                desc_op_cliente = f"la reparación de tu {equipo_str}"
            elif cod_visible:
                desc_op_cliente = f"tu reparación (código {cod_visible})"
            else:
                desc_op_cliente = "tu reparación"
        else:
            desc_op_cliente = f"tu compra (código {cod_visible})" if cod_visible else "tu compra"

        Notificacion.objects.create(
            mensaje=(
                f"Tu pago de ${monto_abonado} correspondiente a {desc_op_cliente} fue registrado con éxito. "
                f"Comprobante fiscal emitido."
            )[:1000],
            tipo="PAGO_REGISTRADO",
            fecha_envio=timezone.now().date(),
            leida=False,
            id_usuario=cliente_destinatario,
            id_dispositivo=disp_vinculado
        )

    pago.desglose_cobro = _construir_desglose_cobro(
        venta=venta_asociada,
        reparacion=operacion if isinstance(operacion, Reparacion) else None,
        monto_operacion=monto_abonado,
        estado_pago='PAGADO'
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
        from core_app.constantes import deducir_codigo_medio_pago
        medio_existente.estado = True
        medio_existente.recargo = recargo
        if not medio_existente.codigo:
            medio_existente.codigo = deducir_codigo_medio_pago(medio_existente.nombre_medio_pago)
            medio_existente.save(update_fields=['estado', 'recargo', 'codigo'])
        else:
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
    from core_app.constantes import deducir_codigo_medio_pago
    nuevo_medio = MedioPago.objects.create(
        codigo=deducir_codigo_medio_pago(nombre),
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
        email=EMAIL_CONSUMIDOR_FINAL,
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
        try:
            evaluar_beneficio_post_compra(venta=venta)
        except Exception as e_post:
            logger.warning(f"[Motor Beneficios] Error post-compra en venta presencial: {e_post}")

        from core_app.constantes import deducir_codigo_medio_pago
        nombre_medio = str(datos_validados['medio_pago']).strip()
        medio_pago_obj = MedioPago.objects.filter(codigo__iexact=nombre_medio).first() or MedioPago.objects.filter(nombre_medio_pago__iexact=nombre_medio).first()
        if not medio_pago_obj:
            medio_pago_obj, _ = MedioPago.objects.get_or_create(
                nombre_medio_pago=nombre_medio,
                defaults={
                    'codigo': deducir_codigo_medio_pago(nombre_medio),
                    'estado': True,
                    'recargo': Decimal('0.00')
                }
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
            logger.warning("[Venta Presencial POS] Factura generada con advertencia: %s", e)

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

    # Reversión justa de beneficios canjeados al cancelar venta
    revertir_beneficios_de_venta_cancelada(venta=venta)

    return venta


def limpiar_ventas_pendientes_expiradas(minutos_limite: Optional[int] = None) -> int:
    """
    Verifica ventas en estado PENDIENTE creadas hace más de `minutos_limite`.
    Si `minutos_limite` es None, consulta `minutosReservaVentaPendiente` en ConfiguracionSistema.
    Filtra en una sola consulta SQL mediante `fecha_hora_creacion` (con respaldo por lotes
    en LogSistema solo para registros antiguos sin marca temporal).
    Cancela y restituye automáticamente el stock apartado.
    """
    import datetime
    if minutos_limite is None:
        from core_app.selectors import obtener_minutos_reserva_venta_pendiente
        minutos_limite = obtener_minutos_reserva_venta_pendiente()
    ahora = timezone.now()
    fecha_hoy = ahora.date()
    umbral = ahora - datetime.timedelta(minutes=minutos_limite)

    # 1. Consulta única por fecha anterior o marca temporal vencida (excluyendo ventas vinculadas a reparaciones de taller)
    ids_vencidas = set(
        Venta.objects.filter(
            estado_venta__iexact='PENDIENTE',
            reparacion__isnull=True
        ).filter(
            Q(fecha_venta__lt=fecha_hoy) |
            Q(fecha_hora_creacion__isnull=False, fecha_hora_creacion__lte=umbral)
        ).values_list('id_venta', flat=True)
    )

    # 2. Respaldo en lote solo para ventas de hoy sin fecha_hora_creacion (excluyendo reparaciones)
    ventas_sin_ts = list(
        Venta.objects.filter(
            estado_venta__iexact='PENDIENTE',
            reparacion__isnull=True,
            fecha_venta__gte=fecha_hoy,
            fecha_hora_creacion__isnull=True
        ).values_list('id_venta', 'fecha_venta')
    )
    if ventas_sin_ts:
        mapa_fechas = {str(id_v): f_v for id_v, f_v in ventas_sin_ts}
        logs = LogSistema.objects.filter(
            modulo_origen='sales_app',
            tabla_afectada='venta',
            id_registro_afectado__in=list(mapa_fechas.keys()),
            accion="Realizar Compra Virtual (CU-18)"
        )
        for lg in logs:
            hora_log = lg.fecha_hora
            if not hora_log:
                continue
            f_v = mapa_fechas.get(str(lg.id_registro_afectado), fecha_hoy)
            if isinstance(hora_log, datetime.datetime):
                dt_creacion = hora_log
            elif isinstance(hora_log, datetime.time):
                dt_creacion = datetime.datetime.combine(f_v, hora_log)
            else:
                dt_creacion = ahora
            if timezone.is_naive(dt_creacion):
                dt_creacion = timezone.make_aware(dt_creacion, timezone.get_current_timezone())
            if dt_creacion <= umbral:
                ids_vencidas.add(int(lg.id_registro_afectado))

    canceladas = 0
    for id_venta in sorted(ids_vencidas):
        try:
            cancelar_venta_y_restituir_stock(
                id_venta=id_venta,
                motivo=f"Expiración automática por superar {minutos_limite} minutos sin concretar pago"
            )
            canceladas += 1
        except Exception as exc:
            logger.warning(
                "[Limpieza Ventas] Error al cancelar y restituir stock de Venta #%s: %s",
                id_venta, exc
            )

    return canceladas


def enviar_correo_confirmacion_compra(
    *,
    venta: Venta,
    pago: Pago,
    ruta_pdf: Optional[str] = None,
    email_destinatario: Optional[str] = None
) -> None:
    """
    Despacha un correo electrónico formal al cliente tras la acreditación exitosa de su compra:
    - Adjunta el comprobante / factura en PDF generado físicamente.
    - Informa el código oficial de la orden (retiro o seguimiento de flete).
    - Soporta tanto clientes registrados como compradores invitados (rescatando el email de contacto).
    - Persiste el aviso en el modelo Notificacion de core_app y asienta la auditoría en LogSistema.
    """
    from core_app.selectors import obtener_email_emisor
    from core_app.models import Notificacion, ConfiguracionSistema

    usuario = venta.id_usuario
    email_destino = email_destinatario

    if not email_destino or '@' not in email_destino:
        if usuario and getattr(usuario, 'email', None) and usuario.email != 'S/N' and '@' in usuario.email:
            email_destino = usuario.email
        elif pago and pago.detalle and 'Email:' in pago.detalle:
            try:
                partes = pago.detalle.split('Email:')
                posible_email = partes[1].split('|')[0].strip()
                if '@' in posible_email:
                    email_destino = posible_email
            except Exception as exc_parse:
                logger.debug("[Confirmación Compra] No se pudo extraer email desde detalle de pago: %s", exc_parse)

    if not email_destino or '@' not in email_destino:
        return

    # Extraer datos de la empresa emisora
    configs = {
        c.clave: c.valor
        for c in ConfiguracionSistema.objects.filter(
            clave__in=['nombreLocal', 'direccionLocal', 'telefonoLocal', 'emailLocal']
        )
    }
    nombre_local = configs.get('nombreLocal') or 'IFixPos'
    # 'direccionLocal' guarda el ID de la dirección: se resuelve a texto legible (el cliente no debe ver IDs)
    direccion_local = _resolver_direccion_comercio(configs)
    telefono_local = configs.get('telefonoLocal') or ''

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
            <p style="margin: 0;">{nombre_local}{(' • Tel: ' + telefono_local) if telefono_local else ''}</p>
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
                logger.warning("[Confirmación Compra] Advertencia al adjuntar archivo PDF: %s", e_att)

    from core_app.correos import despachar_correo_en_commit
    despachar_correo_en_commit(
        lambda: email_msg.send(fail_silently=False),
        contexto=f"Confirmación Compra a {usuario.email}"
    )

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
    except Exception as exc_notif:
        logger.warning("[Confirmación Compra] Error creando notificación interna para Venta #%s: %s", venta.id_venta, exc_notif)

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


def enviar_correo_confirmacion_diagnostico(
    *,
    reparacion: Reparacion,
    pago: Pago,
    ruta_pdf: Optional[str] = None,
    email_destinatario: Optional[str] = None
) -> None:
    """
    Despacha un correo electrónico especializado al cliente tras el abono de la tarifa de diagnóstico técnico:
    - Notifica formalmente que el abono fue acreditado exitosamente.
    - Informa que su dispositivo ya se encuentra formalmente ingresado en taller y listo para recibir el diagnóstico del técnico.
    - Detalla la ficha técnica del equipo (Marca, Modelo, Número de Serie o IMEI, Código de Reparación y Falla reportada).
    - Adjunta el comprobante / factura fiscal en formato PDF.
    - Asienta la notificación en Notificacion y auditoría en LogSistema.
    """
    from core_app.selectors import obtener_email_emisor
    from core_app.models import Notificacion, ConfiguracionSistema, LogSistema
    from core_app.correos import despachar_correo_en_commit

    usuario = getattr(reparacion.id_dispositivo, 'id_usuario', None) or reparacion.id_usuario
    email_destino = email_destinatario

    if not email_destino or '@' not in email_destino:
        if usuario and getattr(usuario, 'email', None) and usuario.email != 'S/N' and '@' in usuario.email:
            email_destino = usuario.email
        elif pago and pago.detalle and 'Email:' in pago.detalle:
            try:
                partes = pago.detalle.split('Email:')
                posible_email = partes[1].split('|')[0].strip()
                if '@' in posible_email:
                    email_destino = posible_email
            except Exception:
                pass

    if not email_destino or '@' not in email_destino:
        return

    # Extraer datos de la empresa emisora
    configs = {
        c.clave: c.valor
        for c in ConfiguracionSistema.objects.filter(
            clave__in=['nombreLocal', 'direccionLocal', 'telefonoLocal', 'emailLocal']
        )
    }
    nombre_local = configs.get('nombreLocal') or 'IFixPos'
    direccion_local = _resolver_direccion_comercio(configs)
    telefono_local = configs.get('telefonoLocal') or ''

    # Nombre del cliente
    perfil = getattr(usuario, 'perfilusuario', None)
    nombre_cliente = f"{perfil.nombre or ''} {perfil.apellido or ''}".strip() if perfil else (usuario.email if usuario else 'Cliente')
    if not nombre_cliente:
        nombre_cliente = 'Cliente'

    # Datos del dispositivo
    disp = reparacion.id_dispositivo
    marca = getattr(getattr(getattr(disp, 'id_modelo', None), 'id_marca', None), 'nombre', '') or ''
    modelo = getattr(getattr(disp, 'id_modelo', None), 'nombre', '') or ''
    nombre_dispositivo = f"{marca} {modelo}".strip() or "Dispositivo"
    numero_serie = getattr(disp, 'numero_serie', '') or 'Sin registrar'
    codigo_orden = reparacion.codigo_sec or f"REP-{reparacion.id_reparacion}"
    falla_declarada = reparacion.desc_cliente or 'Revisión técnica general'
    total_abonado = pago.monto_pagado
    medio_nombre = pago.medio_pago.nombre_medio_pago if pago.medio_pago else "Efectivo"
    fecha_fmt = (pago.fecha_pago or timezone.now().date()).strftime('%d/%m/%Y')

    cuerpo_html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #e2e8f0; margin: 0; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <div style="background: linear-gradient(135deg, #06b6d4, #3b82f6); padding: 24px 32px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">¡Abono de Diagnóstico Confirmado!</h1>
          <p style="color: #e0f2fe; margin: 6px 0 0 0; font-size: 13px;">{nombre_local} • Taller y Servicio Técnico</p>
        </div>
        <div style="padding: 28px 32px;">
          <p style="font-size: 15px; color: #f8fafc; margin-top: 0;">Hola, <b>{nombre_cliente}</b>:</p>
          <p style="font-size: 13px; color: #94a3b8; line-height: 1.6;">
            Te confirmamos que el pago de la tarifa de diagnóstico técnico por un monto de <b style="color: #06b6d4; font-size: 15px;">${total_abonado:,.2f}</b> ha sido acreditado exitosamente.
          </p>
          <p style="font-size: 13px; color: #94a3b8; line-height: 1.6;">
            Tu dispositivo ya se encuentra formalmente ingresado en nuestro taller y <b>listo para recibir el diagnóstico del técnico especialista</b>. En breve comenzará su revisión y te enviaremos la evaluación técnica completa junto con el presupuesto de reparación.
          </p>

          <div style="background-color: #082f49; border: 1px solid #0284c7; padding: 18px; border-radius: 12px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; color: #38bdf8; letter-spacing: 1px; font-weight: bold;">🛡️ Código de Reparación y Seguimiento</p>
            <p style="margin: 0; font-size: 28px; font-family: monospace; font-weight: bold; color: #ffffff; letter-spacing: 3px;">{codigo_orden}</p>
            <p style="margin: 10px 0 0 0; font-size: 13px; color: #bae6fd; line-height: 1.5;">
              Conserva este código para consultar el estado de tu equipo en cualquier momento desde nuestra plataforma o en nuestra sucursal.
            </p>
          </div>

          <div style="margin: 24px 0;">
            <p style="font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: bold; margin-bottom: 8px; letter-spacing: 0.5px;">Ficha del Dispositivo en Taller</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; background-color: #1e293b; border-radius: 8px; overflow: hidden;">
              <tbody>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #334155; color: #94a3b8; font-weight: bold; width: 40%;">Equipo:</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #334155; color: #f1f5f9; font-weight: 600;">{nombre_dispositivo}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #334155; color: #94a3b8; font-weight: bold;">N. Serie:</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #334155; color: #38bdf8; font-family: monospace;">{numero_serie}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #334155; color: #94a3b8; font-weight: bold;">Falla / Síntoma Reportado:</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #334155; color: #f1f5f9;">{falla_declarada}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #334155; color: #94a3b8; font-weight: bold;">Medio de Pago:</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #334155; color: #f1f5f9;">{medio_nombre}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; color: #94a3b8; font-weight: bold;">Monto Abonado:</td>
                  <td style="padding: 10px 14px; color: #10b981; font-weight: bold; font-family: monospace;">${total_abonado:,.2f}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="background-color: #1e293b; padding: 14px 18px; border-radius: 10px; font-size: 12px; color: #94a3b8; margin-top: 20px;">
            <p style="margin: 0 0 4px 0;"><b>Sede Central:</b> {direccion_local}</p>
            <p style="margin: 0;"><b>Adjunto:</b> Encontrarás tu Factura / Comprobante Fiscal en formato PDF adjunta a este correo para tu control y respaldo.</p>
          </div>

          <div style="margin-top: 24px; padding: 16px; background-color: #082f49; border: 1px solid #0284c7; border-radius: 12px; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #38bdf8; font-weight: bold;">
              ¡Muchas gracias por confiar en nuestro servicio técnico!
            </p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">
              Cuidamos tu tecnología en cada paso del proceso.
            </p>
          </div>

          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b;">
            <p style="margin: 0;">{nombre_local}{(' • Tel: ' + telefono_local) if telefono_local else ''}</p>
            <p style="margin: 4px 0 0 0;">Mensaje generado automáticamente por el sistema IFixPos.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
    """

    cuerpo_txt = (
        f"¡Abono de Diagnóstico Confirmado en {nombre_local}!\n\n"
        f"Hola, {nombre_cliente}:\n"
        f"Te confirmamos que el pago de la tarifa de diagnóstico técnico por un monto de ${total_abonado:,.2f} ha sido acreditado exitosamente.\n\n"
        f"Tu dispositivo ya se encuentra formalmente ingresado en nuestro taller y listo para recibir el diagnóstico del técnico especialista. "
        f"Pronto recibirás la evaluación técnica detallada y el presupuesto de reparación correspondiente.\n\n"
        f"FICHA DEL DISPOSITIVO:\n"
        f"- Equipo: {nombre_dispositivo}\n"
        f"- N. Serie: {numero_serie}\n"
        f"- Código de Reparación: {codigo_orden}\n"
        f"- Falla / Síntoma: {falla_declarada}\n"
        f"- Medio de Pago: {medio_nombre}\n"
        f"- Monto Abonado: ${total_abonado:,.2f}\n"
        f"- Fecha: {fecha_fmt}\n\n"
        f"Encontrarás tu factura oficial en formato PDF adjunta a este correo.\n\n"
        f"¡Muchas gracias por confiar en nuestro servicio técnico! {nombre_local}.\n"
    )

    asunto = f"¡Abono Confirmado! Tu {nombre_dispositivo} está listo para diagnóstico - {nombre_local}"
    email_emisor = obtener_email_emisor()
    email_msg = EmailMultiAlternatives(
        subject=asunto,
        body=cuerpo_txt,
        from_email=email_emisor,
        to=[email_destino]
    )
    email_msg.attach_alternative(cuerpo_html, "text/html")

    pdf_path_rel = ruta_pdf or pago.ruta_comprobante
    if pdf_path_rel:
        pdf_filename = os.path.basename(pdf_path_rel)
        pdf_path_abs = os.path.join(settings.MEDIA_ROOT, 'facturas', pdf_filename)
        if os.path.exists(pdf_path_abs):
            try:
                email_msg.attach_file(pdf_path_abs, 'application/pdf')
            except Exception as e_att:
                logger.warning("[Confirmación Diagnóstico] Advertencia al adjuntar archivo PDF: %s", e_att)

    despachar_correo_en_commit(
        lambda: email_msg.send(fail_silently=False),
        contexto=f"Confirmación Diagnóstico a {email_destino}"
    )

    try:
        Notificacion.objects.create(
            id_usuario=usuario,
            mensaje=f"¡Abono confirmado! Tu {nombre_dispositivo} ({codigo_orden}) ya se encuentra listo para recibir el diagnóstico del técnico.",
            tipo="PAGO_DIAGNOSTICO_CONFIRMADO",
            fecha_envio=timezone.now().date(),
            leida=False
        )
    except Exception as exc_notif:
        logger.warning("[Confirmación Diagnóstico] Error creando notificación interna: %s", exc_notif)

    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Envío de Factura y Confirmación de Diagnóstico",
        detalle=(
            f"Correo de confirmación de diagnóstico con factura PDF y código {codigo_orden} "
            f"despachado a {email_destino} para Reparación #{reparacion.id_reparacion}."
        )[:1000],
        tipo="NOTIFICACION_TALLER",
        modulo_origen="sales_app",
        tabla_afectada="reparacion",
        id_registro_afectado=str(reparacion.id_reparacion),
        id_usuario=usuario
    )








# ==============================================================================
# GESTIÓN DE COMPRAS PARA INVITADOS / CLIENTES SIN CUENTA (E-COMMERCE PÚBLICO)
# ==============================================================================

def obtener_o_crear_usuario_cliente_sin_cuenta() -> Usuario:
    """
    Recupera o instancia el usuario estándar del sistema 'Cliente sin cuenta'
    con email='S/N' y contraseña='S/N', asignado al rol 'CLIENTE'.
    Permite registrar compras de invitados sin persistir datos innecesarios de cuentas.
    """
    from users_app.models import RolUsuario, PerfilUsuario

    rol_cliente = RolUsuario.objects.filter(codigo='CLIENTE').first() or RolUsuario.objects.filter(nombre_rol__iexact='cliente').first()
    if not rol_cliente:
        rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol de cliente estándar'}
        )
    usuario_sin_cuenta, created = Usuario.objects.get_or_create(
        email='S/N',
        defaults={
            'contrasena': 'S/N',
            'fecha_registro': timezone.now().date(),
            'id_rol': rol_cliente,
            'is_active': True
        }
    )

    if created or not hasattr(usuario_sin_cuenta, 'perfilusuario'):
        PerfilUsuario.objects.get_or_create(
            id_usuario=usuario_sin_cuenta,
            defaults={
                'nombre': 'Cliente sin cuenta',
                'apellido': 'S/N',
                'dni': 'S/N',
                'telefono': 'S/N'
            }
        )

    return usuario_sin_cuenta


@transaction.atomic
def procesar_compra_invitado(
    *,
    datos_compra: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Procesa de manera atómica la orden de compra de un visitante no registrado (invitado).
    1. Obtiene o instancia el usuario estándar 'Cliente sin cuenta' (email y clave S/N).
    2. Bloquea filas de stock (select_for_update) y valida disponibilidad en tiempo real.
    3. Si es envío, calcula costo_envio según Sede Central y crea la Direccion física.
    4. Crea la Venta en estado 'PENDIENTE' asociada a 'Cliente sin cuenta'.
    5. Congela los renglones en DetalleVenta y descuenta el stock en MovimientoStock.
    6. Asienta los datos de contacto y crea el registro en Pago con detalle descriptivo.
    7. Genera preferencia de Mercado Pago si aplica o prepara el pago presencial.
    8. Registra traza de auditoría en LogSistema.
    """
    from geo_app.models import Direccion
    from sales_app.selectors import calcular_costo_envio_sistema

    # Liberar preventivamente compras pendientes expiradas
    limpiar_ventas_pendientes_expiradas(minutos_limite=30)

    # 1. Recuperar usuario estándar sin cuenta
    usuario_sin_cuenta = obtener_o_crear_usuario_cliente_sin_cuenta()

    items = datos_compra['items']
    if not items:
        raise ValidationError("Debe incluir al menos un producto en la compra.")

    # 2. Bloqueo de Stock en Tiempo Real (select_for_update)
    stocks_bloqueados = {}
    for it in items:
        prod = it['id_producto']
        cant = int(it['cantidad'])
        if cant <= 0:
            raise ValidationError(f"La cantidad para '{prod.nombre}' debe ser mayor a cero.")

        stock = Stock.objects.select_for_update().filter(id_producto=prod).first()
        if not stock:
            raise ValidationError(f"El producto '{prod.nombre}' no tiene inventario inicial configurado.")

        ingresos = MovimientoStock.objects.filter(
            id_stock=stock,
            tipo_movimiento__in=TIPOS_INGRESO
        ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

        egresos = MovimientoStock.objects.filter(
            id_stock=stock,
            tipo_movimiento__in=TIPOS_EGRESO
        ).aggregate(total=Coalesce(Sum('cantidad'), Value(0)))['total']

        stock_disponible = int(ingresos - egresos)
        if cant > stock_disponible:
            raise ValidationError(
                f"Sin stock suficiente para el producto '{prod.nombre}'. "
                f"Disponible: {stock_disponible}, solicitado: {cant}."
            )

        stocks_bloqueados[prod.id_producto] = stock

    # 3. Método de entrega y cálculo logístico
    metodo_entrega = str(datos_compra.get('metodo_entrega') or 'RETIRO').strip().upper()
    direccion_obj = None
    costo_envio = Decimal('0.00')

    if metodo_entrega == 'ENVIO':
        dir_data = datos_compra['direccion_envio']
        calle = dir_data.get('calle', '').strip()
        numero = dir_data.get('numero', '').strip()
        nro_calle_completo = f"{calle} {numero}".strip() if numero else calle

        # Parsear piso si es numérico
        piso_raw = str(dir_data.get('piso', '') or dir_data.get('piso_depto', '')).strip()
        piso_num = int(piso_raw) if piso_raw.isdigit() else None
        dpto_val = dir_data.get('nro_dpto') or dir_data.get('depto') or dir_data.get('piso_depto') or None

        direccion_obj = Direccion.objects.create(
            alias='Envío Invitado',
            nro_calle=nro_calle_completo,
            nombre_barrio=dir_data.get('barrio') or dir_data.get('nombre_barrio') or None,
            nro_dpto=dpto_val,
            piso=piso_num,
            id_ciudad=dir_data['id_ciudad'],
            id_usuario=usuario_sin_cuenta,
            is_active=True
        )
        calculo_envio = calcular_costo_envio_sistema(direccion_obj.id_direccion)
        costo_envio = calculo_envio['costo']

    # 4. Calcular Subtotal
    monto_subtotal = Decimal('0.00')
    for it in items:
        precio_unit = Decimal(str(it['id_producto'].precio_venta))
        monto_subtotal += precio_unit * Decimal(str(it['cantidad']))

    codigo_seguridad = uuid.uuid4().hex[:10].upper()

    # 5. Crear Venta
    venta = Venta.objects.create(
        id_usuario=usuario_sin_cuenta,
        metodo_entrega=metodo_entrega,
        fecha_venta=timezone.now().date(),
        estado_venta='PENDIENTE',
        codigo_sec=codigo_seguridad,
        monto_subtotal=monto_subtotal,
        costo_envio=costo_envio,
        id_direccion_envio=direccion_obj
    )

    # 6. Congelar DetalleVenta y Reducir Stock
    for it in items:
        prod = it['id_producto']
        cant = int(it['cantidad'])
        precio_unit = Decimal(str(prod.precio_venta))
        subtotal_renglon = precio_unit * Decimal(str(cant))

        DetalleVenta.objects.create(
            id_venta=venta,
            id_producto=prod,
            cantidad=cant,
            precio_unitario=precio_unit,
            subtotal=subtotal_renglon
        )

        stock = stocks_bloqueados[prod.id_producto]
        MovimientoStock.objects.create(
            id_stock=stock,
            tipo_movimiento='venta',
            cantidad=cant,
            fecha=timezone.now().date(),
            motivo=f"Egreso por Venta Invitado #{venta.id_venta}",
            uso_taller=False,
            id_venta=venta
        )

    # 7. Asentar medio de pago e información de contacto
    monto_total = monto_subtotal + costo_envio
    medio_pago = datos_compra['metodo_pago']
    nombre_contacto = datos_compra['nombre_contacto'].strip()
    email_contacto = datos_compra['email_contacto'].strip()
    telefono_contacto = datos_compra['telefono_contacto'].strip()
    dni_contacto = datos_compra.get('dni_contacto', 'S/N')

    detalle_pago = (
        f"Invitado: {nombre_contacto} | Email: {email_contacto} | "
        f"Tel: {telefono_contacto} | DNI: {dni_contacto}"
    )

    pago = Pago.objects.create(
        id_venta=venta,
        medio_pago=medio_pago,
        monto_pagado=monto_total,
        fecha_pago=timezone.now().date(),
        detalle=detalle_pago
    )

    # 8. Generar Preferencia de Pago si corresponde (priorizando código interno inmutable)
    from core_app.constantes import CodigoMedioPago
    pref_info = {"preference_id": None, "init_point": None, "modo_simulacion": False}
    codigo_mp = (getattr(medio_pago, 'codigo', '') or '').strip().upper()
    nombre_mp = str(medio_pago.nombre_medio_pago).strip().upper()
    if codigo_mp == CodigoMedioPago.MERCADO_PAGO or any(k in nombre_mp for k in ['MERCADO', 'MP', 'DIGITAL', 'QR', 'ONLINE']):
        pref_info = crear_preferencia_mercadopago_invitado(
            venta=venta,
            nombre_contacto=nombre_contacto,
            email_contacto=email_contacto,
            telefono_contacto=telefono_contacto
        )

    # 9. Auditoría en LogSistema
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Realizar Compra Invitado (CU-18)",
        detalle=(
            f"Venta de invitado #{venta.id_venta} registrada para {nombre_contacto} ({email_contacto}). "
            f"Items: {len(items)}, Subtotal: ${monto_subtotal}, Envio: ${costo_envio}, Total: ${monto_total}. "
            f"Entrega: {metodo_entrega}. Medio de Pago: {medio_pago.nombre_medio_pago}."
        ),
        tipo="VENTA_INVITADO",
        modulo_origen="sales_app",
        tabla_afectada="venta",
        id_registro_afectado=str(venta.id_venta),
        id_usuario=usuario_sin_cuenta
    )

    return {
        'id_venta': venta.id_venta,
        'codigo_sec': venta.codigo_sec,
        'estado_venta': venta.estado_venta,
        'metodo_entrega': venta.metodo_entrega,
        'monto_subtotal': venta.monto_subtotal,
        'costo_envio': venta.costo_envio,
        'monto_total': monto_total,
        'preference_id': pref_info.get('preference_id'),
        'init_point': pref_info.get('init_point'),
        'modo_simulacion': pref_info.get('modo_simulacion', False),
        'detalles': [
            {
                'id_producto': d.id_producto.id_producto,
                'producto_nombre': d.id_producto.nombre,
                'cantidad': d.cantidad,
                'precio_unitario': d.precio_unitario,
                'subtotal': d.subtotal
            } for d in venta.detalleventa_set.all()
        ]
    }


# ==============================================================================
# MOTOR INTELIGENTE Y AUTOMATIZADO DE BENEFICIOS Y FIDELIZACIÓN (SERVICES)
# ==============================================================================

@transaction.atomic
def generar_beneficio_cliente(
    *,
    usuario_destinatario: Usuario,
    motivo: str,
    por_desc: Decimal,
    tiempo_disp_horas: Optional[Decimal] = None,
    id_producto: Optional[Any] = None,
    enviado_durante_carrito: bool = False,
    enviado_momento_compra: bool = False,
    asunto_notificacion: Optional[str] = None,
    mensaje_notificacion: Optional[str] = None
) -> Optional[Beneficio]:
    """
    Motor Central de Emisión de Beneficios.
    Aplica rigurosamente las salvaguardas gerenciales de ConfiguracionSistema:
    1. motorBeneficiosActivo: Si está inactivo, aborta pacíficamente.
    2. limitePromocionesMensual: Control de cupo mensual emitido.
    3. periodoRefrigerioCliente: Cooldown para evitar saturación del cliente.
    4. porcentajeDescuentoMaximo: Tope infranqueable sobre por_desc.
    5. vigenciaBeneficioDefecto: Fallback temporal si no se provee.
    6. Doble canal: Campana web + correo electrónico transaccional Cyber-Tech si es notificación directa.
    7. Asiento inmutable de auditoría en LogSistema.
    """
    from core_app.selectors import (
        obtener_configuracion_bool,
        obtener_configuracion_int,
        obtener_configuracion_decimal
    )
    from core_app.services import registrar_y_enviar_notificacion_correo
    from core_app.models import LogSistema
    from sales_app.models import Beneficio
    import datetime

    # 0. Salvaguarda estricta: Consumidor Final nunca recibe beneficios comerciales
    email_dest = (getattr(usuario_destinatario, 'email', '') or '').strip().lower()
    if not email_dest or email_dest == EMAIL_CONSUMIDOR_FINAL or 'consumidorfinal' in email_dest:
        logger.info(f"[Motor Beneficios] Emisión rechazada: el usuario '{email_dest}' (Consumidor Final / Anónimo) no puede recibir beneficios.")
        return None

    # 1. Verificar si el motor está encendido globalmente
    if not obtener_configuracion_bool('motorBeneficiosActivo'):
        return None

    hoy = timezone.now().date()

    # 2. Control de cupo mensual global
    limite_mes = obtener_configuracion_int('limitePromocionesMensual', fallback=15)
    primer_dia_mes = hoy.replace(day=1)
    beneficios_mes_actual = Beneficio.objects.filter(fecha__gte=primer_dia_mes).count()
    if beneficios_mes_actual >= limite_mes:
        return None

    # 3. Control de período de refrigerio (cooldown) por cliente
    if not enviado_durante_carrito:
        dias_refrigerio = obtener_configuracion_int('periodoRefrigerioCliente', fallback=7)
        if dias_refrigerio > 0:
            fecha_corte_refrigerio = hoy - datetime.timedelta(days=dias_refrigerio)
            tiene_beneficio_reciente = Beneficio.objects.filter(
                id_usuario=usuario_destinatario,
                fecha__gte=fecha_corte_refrigerio
            ).exists()
            if tiene_beneficio_reciente:
                return None

    # 4. Tope de porcentaje máximo
    max_desc = obtener_configuracion_decimal('porcentajeDescuentoMaximo', fallback=Decimal('5.00'))
    por_desc_seguro = min(Decimal(str(por_desc)), max_desc)
    if por_desc_seguro <= Decimal('0.00'):
        por_desc_seguro = Decimal('1.00')

    # 5. Vigencia por defecto
    if tiempo_disp_horas is None or tiempo_disp_horas <= Decimal('0.00'):
        tiempo_disp_horas = obtener_configuracion_decimal('vigenciaBeneficioDefecto', fallback=Decimal('72.00'))

    # 5.b Resolver instancia de Producto segura
    from catalog_app.models import Producto
    producto_instancia = None
    if id_producto:
        if isinstance(id_producto, Producto):
            producto_instancia = id_producto
        elif isinstance(id_producto, (int, str)) and str(id_producto).isdigit():
            producto_instancia = Producto.objects.filter(id_producto=int(id_producto)).first()

    # 6. Creación física de la entidad Beneficio
    beneficio = Beneficio.objects.create(
        id_usuario=usuario_destinatario,
        id_producto=producto_instancia,
        motivo=motivo[:500],
        fecha=hoy,
        enviado_momento_compra=enviado_momento_compra,
        enviado_durante_carrito=enviado_durante_carrito,
        por_desc=por_desc_seguro,
        tiempo_disp=tiempo_disp_horas
    )

    # 7. Doble canal: Despacho a Notificación Web + Email si es predictivo / post-taller
    es_canal_notificacion = (not enviado_durante_carrito and not enviado_momento_compra)
    if es_canal_notificacion:
        asunto = asunto_notificacion or "¡Tienes un beneficio exclusivo esperándote en IFixPos!"
        item_nombre = producto_instancia.nombre if producto_instancia else "toda la tienda y servicio técnico"
        cuerpo_base = mensaje_notificacion or (
            f"Hola, hemos habilitado un descuento especial del {por_desc_seguro}% en {item_nombre}. "
            f"Válido por {int(tiempo_disp_horas)} horas."
        )

        cuerpo_html = f"""
        <div style="background-color: #0F172A; color: #E2E8F0; font-family: 'Lexend', sans-serif; padding: 24px; border-radius: 12px; border: 1px solid #1E293B;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="color: #06B6D4; margin: 0; font-size: 20px;">Beneficio Exclusivo IFixPos</h1>
                <p style="color: #94A3B8; font-size: 13px; margin-top: 4px;">Premio a tu lealtad comercial</p>
            </div>
            <div style="background-color: #1E293B; border-radius: 8px; padding: 18px; border-left: 4px solid #8B5CF6; margin-bottom: 20px;">
                <p style="font-size: 14px; margin: 0; line-height: 1.5;">{cuerpo_base}</p>
                <div style="margin-top: 14px; font-size: 24px; font-weight: bold; color: #10B981;">
                    {por_desc_seguro}% OFF
                </div>
                <p style="font-size: 11px; color: #64748B; margin-top: 6px;">
                    Tiempo de vigencia: {int(tiempo_disp_horas)} horas desde su emisión.
                </p>
            </div>
            <p style="font-size: 12px; color: #94A3B8; text-align: center;">
                Ingresa a tu cuenta en IFixPos y aprovecha tu beneficio antes de que caduque.
            </p>
        </div>
        """

        try:
            registrar_y_enviar_notificacion_correo(
                usuario=usuario_destinatario,
                asunto=asunto,
                cuerpo_texto=cuerpo_base,
                tipo_notificacion='BENEFICIO',
                cuerpo_html=cuerpo_html,
                mensaje_notificacion=cuerpo_base,
                adjuntar_logo=True,
                beneficio=beneficio
            )
        except Exception as e:
            logger.warning(f"[Motor Beneficios] Notificación/Email no despachado: {e}")

    # 8. Asiento inmutable en LogSistema
    try:
        LogSistema.objects.create(
            fecha_hora=timezone.now(),
            accion="Emisión de Beneficio Inteligente",
            detalle=f"Beneficio #{beneficio.id_beneficio} emitido a usuario {usuario_destinatario.email} ({por_desc_seguro}% OFF). Motivo: {motivo[:300]}",
            tipo="BENEFICIO_GENERADO",
            modulo_origen="sales_app",
            tabla_afectada="beneficio"
        )
    except Exception as e:
        logger.warning(f"[Motor Beneficios] Error asentando log de emisión: {e}")

    return beneficio


@transaction.atomic
def evaluar_beneficio_durante_carrito(
    *,
    id_usuario: int,
    items_carrito: list
) -> list:
    """
    Momento 1: Cross-selling en tiempo real mientras el cliente arma el carrito.
    Detecta productos principales en la cesta y busca accesorios compatibles con stock activo.
    Genera el beneficio con enviado_durante_carrito=True y lo retorna.
    """
    from sales_app.models import Beneficio
    from catalog_app.models import Producto
    from users_app.models import Usuario

    if not id_usuario or not items_carrito:
        return []

    try:
        usuario = Usuario.objects.get(id_usuario=id_usuario)
    except Usuario.DoesNotExist:
        return []

    # Salvaguarda: Consumidor Final nunca recibe beneficios
    email_u = (getattr(usuario, 'email', '') or '').strip().lower()
    if not email_u or email_u == EMAIL_CONSUMIDOR_FINAL or 'consumidorfinal' in email_u:
        return []

    beneficios_generados = []
    ids_en_carrito = [getattr(i, 'id_producto_id', None) or getattr(i.id_producto, 'id_producto', None) for i in items_carrito]

    for item in items_carrito:
        prod = getattr(item, 'id_producto', item)
        id_modelo = getattr(prod, 'id_modelo_id', None) or getattr(prod, 'id_modelo', None)
        if not id_modelo and hasattr(prod, 'modelos_compatibles'):
            primer_modelo = prod.modelos_compatibles.first()
            if primer_modelo:
                id_modelo = primer_modelo

        id_mod_int = id_modelo.id_modelo if hasattr(id_modelo, 'id_modelo') else id_modelo
        id_marca_int = getattr(prod, 'id_marca_id', None) or (id_modelo.id_marca_id if hasattr(id_modelo, 'id_marca_id') else None)
        id_tipo_int = getattr(prod, 'tipo_dispositivo_id_calculado', None) or (id_modelo.id_tipo_dispositivo_id if hasattr(id_modelo, 'id_tipo_dispositivo_id') else None)

        if not id_mod_int and not id_marca_int and not id_tipo_int and not getattr(prod, 'es_universal', False):
            continue

        # Buscar accesorios compatibles priorizando modelo exacto, luego marca o universales con stock > 0
        from catalog_app.selectors import obtener_productos_compatibles_con_equipo

        candidatos = obtener_productos_compatibles_con_equipo(
            id_modelo=id_mod_int,
            id_marca=id_marca_int,
            id_tipo_dispositivo=id_tipo_int,
            solo_con_stock=True
        )
        accesorio_compatible = None
        for cand in candidatos:
            if cand.id_producto not in ids_en_carrito:
                accesorio_compatible = cand
                break

        if accesorio_compatible:
            # Verificar si ya existe beneficio vigente durante carrito para este accesorio
            ya_sugerido = Beneficio.objects.filter(
                id_usuario=usuario,
                id_producto=accesorio_compatible,
                enviado_durante_carrito=True,
                fecha=timezone.now().date()
            ).exists()

            if not ya_sugerido:
                motivo = f"Recomendación predictiva durante carrito: Descuento en accesorio compatible {accesorio_compatible.nombre} tras seleccionar {prod.nombre}."
                b = generar_beneficio_cliente(
                    usuario_destinatario=usuario,
                    motivo=motivo,
                    por_desc=Decimal('5.00'),
                    tiempo_disp_horas=Decimal('4.00'),
                    id_producto=accesorio_compatible,
                    enviado_durante_carrito=True,
                    enviado_momento_compra=False
                )
                if b:
                    beneficios_generados.append(b)

    return beneficios_generados


@transaction.atomic
def evaluar_beneficio_post_compra(*, venta: Venta) -> Optional[Beneficio]:
    """
    Momento 2: Recompensa inmediata post-compra al acreditarse el pago.
    - Primera compra: Cupón de bienvenida del 5% general para próxima visita.
    - Cliente VIP (3+ compras en 90 días): Cupón VIP del 5%.
    """
    if not venta or not venta.id_usuario:
        return None

    usuario = venta.id_usuario
    # Salvaguarda: Consumidor Final nunca recibe beneficios
    email_u = (getattr(usuario, 'email', '') or '').strip().lower()
    if not email_u or email_u == EMAIL_CONSUMIDOR_FINAL or 'consumidorfinal' in email_u:
        return None

    hoy = timezone.now().date()
    hace_90d = hoy - datetime.timedelta(days=90)

    compras_pagadas = Venta.objects.filter(
        id_usuario=usuario,
        estado_venta__in=['PAGADA', 'PAGADO']
    ).count()

    if compras_pagadas == 1:
        # Recompensa primera compra
        motivo = "Fidelización post-compra: Recompensa de bienvenida para su próxima compra en IFixPos."
        return generar_beneficio_cliente(
            usuario_destinatario=usuario,
            motivo=motivo,
            por_desc=Decimal('5.00'),
            tiempo_disp_horas=Decimal('72.00'),
            id_producto=None,
            enviado_durante_carrito=False,
            enviado_momento_compra=True
        )

    compras_recientes = Venta.objects.filter(
        id_usuario=usuario,
        estado_venta__in=['PAGADA', 'PAGADO'],
        fecha_venta__gte=hace_90d
    ).count()

    if compras_recientes >= 3:
        # Cliente frecuente VIP
        motivo = "Premio al cliente frecuente: Beneficio VIP en reconocimiento a su lealtad comercial."
        return generar_beneficio_cliente(
            usuario_destinatario=usuario,
            motivo=motivo,
            por_desc=Decimal('5.00'),
            tiempo_disp_horas=Decimal('120.00'),
            id_producto=None,
            enviado_durante_carrito=False,
            enviado_momento_compra=True
        )

    return None


@transaction.atomic
def evaluar_beneficio_post_taller(*, reparacion: Any) -> Optional[Beneficio]:
    """
    Momento 3: Recompensa y protección técnica post-servicio de taller.
    - Reparación de pantalla: Descuento en protector/funda para el modelo.
    - Reparación de batería/carga: Descuento en cargador/cable para el modelo.
    """
    from catalog_app.models import Producto

    if not reparacion:
        return None

    dispositivo = getattr(reparacion, 'id_dispositivo', None)
    if not dispositivo:
        return None

    usuario = getattr(dispositivo, 'id_usuario', None)
    if not usuario:
        return None

    # Salvaguarda: Consumidor Final nunca recibe beneficios
    email_u = (getattr(usuario, 'email', '') or '').strip().lower()
    if not email_u or email_u == EMAIL_CONSUMIDOR_FINAL or 'consumidorfinal' in email_u:
        return None

    modelo = getattr(dispositivo, 'id_modelo', None)
    
    # Obtener categorías de la reparación de forma segura (soporta ManyToMany o campo directo)
    nombres_cats = []
    if hasattr(reparacion, 'categorias'):
        try:
            nombres_cats = [c.nombre.upper() for c in reparacion.categorias.all()]
        except Exception as exc_cat:
            logger.debug("[Motor Beneficios] No fue posible leer categorías de reparación: %s", exc_cat)
    elif hasattr(reparacion, 'id_categoria') and reparacion.id_categoria:
        nombres_cats = [str(getattr(reparacion.id_categoria, 'nombre', '')).upper()]
        
    desc_falla = str(getattr(reparacion, 'desc_cliente', '') or '').upper()

    from catalog_app.selectors import obtener_productos_compatibles_con_equipo
    candidatos_compatibles = obtener_productos_compatibles_con_equipo(
        id_modelo=modelo.id_modelo if modelo else None,
        id_marca=modelo.id_marca_id if modelo else None,
        id_tipo_dispositivo=modelo.id_tipo_dispositivo_id if modelo else None,
        solo_con_stock=True
    )

    es_pantalla = any(any(k in cat for k in ['PANTALLA', 'DISPLAY', 'TACTIL', 'VIDRIO', 'MODULO']) for cat in nombres_cats) or any(k in desc_falla for k in ['PANTALLA', 'DISPLAY', 'TACTIL', 'VIDRIO', 'MODULO'])
    es_bateria = any(any(k in cat for k in ['BATERIA', 'CARGA', 'PIN', 'CONECTOR', 'ENERGIA']) for cat in nombres_cats) or any(k in desc_falla for k in ['BATERIA', 'CARGA', 'PIN', 'CONECTOR', 'ENERGIA'])

    producto_sugerido = None
    if es_pantalla:
        if candidatos_compatibles:
            producto_sugerido = candidatos_compatibles[0]
        motivo = f"Protección técnica post-taller: Descuento en accesorio protector tras reparación de pantalla de {modelo.nombre if modelo else 'su dispositivo'}."
        asunto = "Protege tu pantalla recién reparada en IFixPos — Descuento Especial"
        mensaje = "Hola, tu equipo ya fue reparado exitosamente. Para evitar futuras roturas, te obsequiamos un descuento especial en accesorios compatibles."
    elif es_bateria:
        if candidatos_compatibles:
            producto_sugerido = candidatos_compatibles[0]
        motivo = f"Optimización energética post-servicio: Descuento en accesorios de carga tras reparación de batería/energía."
        asunto = "Cuida la nueva batería de tu equipo con accesorios certificados"
        mensaje = "Estimado cliente, la nueva batería de tu dispositivo requiere carga estable. Aprovecha un descuento exclusivo en cargadores certificados."
    else:
        if candidatos_compatibles:
            producto_sugerido = candidatos_compatibles[0]
        motivo = f"Fidelización post-taller: Agradecimiento por servicio técnico en su dispositivo {modelo.nombre if modelo else ''}."
        asunto = "Beneficio de cortesía post-reparación en IFixPos"
        mensaje = "Muchas gracias por reparar tus equipos con nosotros. Te dejamos un cupón especial para tu próxima visita."

    return generar_beneficio_cliente(
        usuario_destinatario=usuario,
        motivo=motivo,
        por_desc=Decimal('5.00'),
        tiempo_disp_horas=Decimal('72.00'),
        id_producto=producto_sugerido,
        enviado_durante_carrito=False,
        enviado_momento_compra=False,
        asunto_notificacion=asunto,
        mensaje_notificacion=mensaje
    )


@transaction.atomic
def evaluar_beneficio_post_calificacion(*, calificacion: Any) -> Optional[Beneficio]:
    """
    Momento 3 (Calidad): Recompensa por reseña sobresaliente de 5 estrellas en taller (CU-19).
    """
    if not calificacion or getattr(calificacion, 'puntuacion', 0) < 5:
        return None

    reparacion = getattr(calificacion, 'id_reparacion', None)
    usuario = getattr(getattr(reparacion, 'id_dispositivo', None), 'id_usuario', None)
    if not usuario:
        return None

    # Salvaguarda: Consumidor Final nunca recibe beneficios
    email_u = (getattr(usuario, 'email', '') or '').strip().lower()
    if not email_u or email_u == EMAIL_CONSUMIDOR_FINAL or 'consumidorfinal' in email_u:
        return None

    motivo = "Agradecimiento por reseña de 5 estrellas: Cupón de reconocimiento tras excelente calificación en servicio técnico."
    asunto = "¡Gracias por tu calificación de 5 estrellas en IFixPos!"
    mensaje = "Nos alegra profundamente que hayas tenido una excelente experiencia con nuestro servicio técnico. Te obsequiamos un descuento en tu próxima compra o visita."

    return generar_beneficio_cliente(
        usuario_destinatario=usuario,
        motivo=motivo,
        por_desc=Decimal('5.00'),
        tiempo_disp_horas=Decimal('120.00'),
        id_producto=None,
        enviado_durante_carrito=False,
        enviado_momento_compra=False,
        asunto_notificacion=asunto,
        mensaje_notificacion=mensaje
    )


@transaction.atomic
def evaluar_beneficios_predictivos_sistema() -> dict:
    """
    Momento 4 y 5: Motor de Análisis Predictivo y Carrito Abandonado.
    Ejecutado periódicamente por tarea programada (Cron / CLI):
    1. Carrito Abandonado: Carritos con más de 24h sin completar checkout.
       CONDICIÓN ESTRICTA: SOLO si el usuario NO tiene ningún beneficio ACTIVO en el sistema.
    2. Mantenimiento Preventivo Laptops/PC (180 días).
    3. Chequeo Anual Celulares/Tablets (360 días).
    4. Reactivación de Cliente Inactivo (60 días).
    """
    from sales_app.models import CarritoCompra, Beneficio
    from sales_app.selectors import beneficio_esta_activo
    from workshop_app.models import Reparacion
    from users_app.models import Usuario

    hoy = timezone.now().date()
    ayer = hoy - datetime.timedelta(days=1)
    hace_180d = hoy - datetime.timedelta(days=180)
    hace_360d = hoy - datetime.timedelta(days=360)
    hace_60d = hoy - datetime.timedelta(days=60)

    resumen = {
        'carritos_abandonados_evaluados': 0,
        'carritos_beneficiados': 0,
        'mantenimiento_computadoras': 0,
        'chequeo_celulares': 0,
        'reactivacion_inactivos': 0,
        'total_beneficios_generados': 0
    }

    # -------------------------------------------------------------------------
    # 1. Recuperación de Carrito Abandonado (24h)
    # -------------------------------------------------------------------------
    carritos_abandonados = CarritoCompra.objects.filter(
        estado__iexact='activo',
        fecha_creacion__lte=ayer
    ).exclude(
        id_usuario__email__icontains='consumidorfinal'
    ).select_related('id_usuario').prefetch_related('carritoproducto_set')

    for c in carritos_abandonados:
        resumen['carritos_abandonados_evaluados'] += 1
        # Verificar que tenga al menos 1 producto
        if not c.carritoproducto_set.exists():
            continue

        usuario = c.id_usuario
        # REGLA ESTRICTA: NO debe tener NINGÚN beneficio en estado ACTIVO
        beneficios_usuario = Beneficio.objects.filter(id_usuario=usuario)
        tiene_activo = any(beneficio_esta_activo(b) for b in beneficios_usuario)
        if tiene_activo:
            continue

        motivo = "Recuperación de carrito abandonado: Cupón de incentivo tras 24 horas de inactividad con productos en cesta."
        asunto = "¡Tus productos te esperan en IFixPos! Completa tu pedido con descuento"
        mensaje = "Notamos que dejaste artículos pendientes en tu carrito de compras. Para ayudarte a completar tu pedido, te otorgamos un descuento exclusivo por 48 horas."

        b = generar_beneficio_cliente(
            usuario_destinatario=usuario,
            motivo=motivo,
            por_desc=Decimal('5.00'),
            tiempo_disp_horas=Decimal('48.00'),
            id_producto=None,
            enviado_durante_carrito=False,
            enviado_momento_compra=False,
            asunto_notificacion=asunto,
            mensaje_notificacion=mensaje
        )
        if b:
            resumen['carritos_beneficiados'] += 1
            resumen['total_beneficios_generados'] += 1

    # -------------------------------------------------------------------------
    # 2. Mantenimiento Preventivo Laptops/PC (180 días)
    # -------------------------------------------------------------------------
    reparaciones_antiguas_pc = Reparacion.objects.filter(
        etapa__in=['ENTREGADO', 'ENTREGADA'],
        fecha_entrega__lte=hace_180d,
        id_dispositivo__id_modelo__id_tipo_dispositivo__nombre__iregex=r'(notebook|laptop|pc|computadora|escritorio)'
    ).select_related('id_dispositivo__id_usuario', 'id_dispositivo__id_modelo')

    usuarios_ya_notificados_pc = set()
    for rep in reparaciones_antiguas_pc:
        usr = rep.id_dispositivo.id_usuario
        if not usr or (getattr(usr, 'email', '') or '').strip().lower() == EMAIL_CONSUMIDOR_FINAL or 'consumidorfinal' in (getattr(usr, 'email', '') or '').lower():
            continue
        if usr.id_usuario in usuarios_ya_notificados_pc:
            continue

        # Verificar si tuvo reparación más reciente
        tuvo_reciente = Reparacion.objects.filter(
            id_dispositivo__id_usuario=usr,
            fecha_entrega__gt=hace_180d
        ).exists()

        if not tuvo_reciente:
            usuarios_ya_notificados_pc.add(usr.id_usuario)
            modelo_nom = rep.id_dispositivo.id_modelo.nombre if rep.id_dispositivo.id_modelo else "su equipo"
            motivo = f"Mantenimiento predictivo: Recordatorio preventivo térmico para {modelo_nom} tras 6 meses sin servicio."
            asunto = f"Recordatorio de Mantenimiento Preventivo para tu {modelo_nom} en IFixPos"
            mensaje = f"Hace 6 meses que realizaste el último mantenimiento a tu equipo. La acumulación de polvo y el desgaste de pasta térmica reducen su vida útil. ¡Agenda un servicio preventivo hoy con descuento!"

            b = generar_beneficio_cliente(
                usuario_destinatario=usr,
                motivo=motivo,
                por_desc=Decimal('5.00'),
                tiempo_disp_horas=Decimal('168.00'),
                id_producto=None,
                enviado_durante_carrito=False,
                enviado_momento_compra=False,
                asunto_notificacion=asunto,
                mensaje_notificacion=mensaje
            )
            if b:
                resumen['mantenimiento_computadoras'] += 1
                resumen['total_beneficios_generados'] += 1

    # -------------------------------------------------------------------------
    # 3. Chequeo Anual Smartphones / Tablets (360 días)
    # -------------------------------------------------------------------------
    reparaciones_antiguas_mobile = Reparacion.objects.filter(
        etapa__in=['ENTREGADO', 'ENTREGADA'],
        fecha_entrega__lte=hace_360d,
        id_dispositivo__id_modelo__id_tipo_dispositivo__nombre__iregex=r'(celular|telefono|smartphone|tablet|ipad)'
    ).select_related('id_dispositivo__id_usuario', 'id_dispositivo__id_modelo')

    usuarios_ya_notificados_mobile = set()
    for rep in reparaciones_antiguas_mobile:
        usr = rep.id_dispositivo.id_usuario
        if not usr or (getattr(usr, 'email', '') or '').strip().lower() == EMAIL_CONSUMIDOR_FINAL or 'consumidorfinal' in (getattr(usr, 'email', '') or '').lower():
            continue
        if usr.id_usuario in usuarios_ya_notificados_mobile or usr.id_usuario in usuarios_ya_notificados_pc:
            continue

        tuvo_reciente = Reparacion.objects.filter(
            id_dispositivo__id_usuario=usr,
            fecha_entrega__gt=hace_360d
        ).exists()

        if not tuvo_reciente:
            usuarios_ya_notificados_mobile.add(usr.id_usuario)
            modelo_nom = rep.id_dispositivo.id_modelo.nombre if rep.id_dispositivo.id_modelo else "su dispositivo"
            motivo = f"Chequeo predictivo anual: Recordatorio de salud de batería y rendimiento para {modelo_nom}."
            asunto = f"Chequeo anual de batería y rendimiento para tu {modelo_nom}"
            mensaje = f"Tu equipo cumplió un año desde su última revisión técnica. Las baterías sufren degradación con el tiempo. Te ofrecemos un descuento en chequeo y cambio de batería."

            b = generar_beneficio_cliente(
                usuario_destinatario=usr,
                motivo=motivo,
                por_desc=Decimal('5.00'),
                tiempo_disp_horas=Decimal('168.00'),
                id_producto=None,
                enviado_durante_carrito=False,
                enviado_momento_compra=False,
                asunto_notificacion=asunto,
                mensaje_notificacion=mensaje
            )
            if b:
                resumen['chequeo_celulares'] += 1
                resumen['total_beneficios_generados'] += 1

    # -------------------------------------------------------------------------
    # 4. Reactivación de Cliente Inactivo (Win-Back - 60 días)
    # -------------------------------------------------------------------------
    clientes_con_historial = Usuario.objects.filter(
        id_rol__codigo__iexact='CLIENTE'
    ).exclude(
        email__icontains='consumidorfinal'
    ).filter(
        Q(venta__isnull=False) | Q(dispositivo__reparacion__isnull=False)
    ).distinct()

    for usr in clientes_con_historial:
        if usr.id_usuario in usuarios_ya_notificados_pc or usr.id_usuario in usuarios_ya_notificados_mobile:
            continue

        actividad_reciente = Venta.objects.filter(
            id_usuario=usr,
            fecha_venta__gt=hace_60d
        ).exists() or Reparacion.objects.filter(
            id_dispositivo__id_usuario=usr,
            fecha_inicio__gt=hace_60d
        ).exists()

        if not actividad_reciente:
            beneficios_usr = Beneficio.objects.filter(id_usuario=usr)
            if any(beneficio_esta_activo(b) for b in beneficios_usr):
                continue

            motivo = "Campaña algorítmica de reactivación: Beneficio 'Te extrañamos' tras 60 días sin actividad en la plataforma."
            asunto = "¡Te extrañamos en IFixPos! Descubre un beneficio especial esperándote"
            mensaje = "Estimado cliente, hace tiempo que no nos visitas. Para que mantengas tus equipos al 100%, te obsequiamos un descuento especial en tu próxima compra o reparación."

            b = generar_beneficio_cliente(
                usuario_destinatario=usr,
                motivo=motivo,
                por_desc=Decimal('5.00'),
                tiempo_disp_horas=Decimal('72.00'),
                id_producto=None,
                enviado_durante_carrito=False,
                enviado_momento_compra=False,
                asunto_notificacion=asunto,
                mensaje_notificacion=mensaje
            )
            if b:
                resumen['reactivacion_inactivos'] += 1
                resumen['total_beneficios_generados'] += 1

    return resumen


@transaction.atomic
def aplicar_y_canjear_beneficios_en_venta(
    *,
    venta: Venta,
    lista_id_beneficios: list,
    items_compra: Optional[list] = None
) -> dict:
    """
    Aplica y canjea de forma segura los beneficios seleccionados por el cliente en una venta:
    1. Valida estado ACTIVO de cada beneficio.
    2. Calcula descuentos por producto y generales de forma acumulable.
    3. Actualiza el monto_subtotal de la venta en base de datos.
    4. Marca los beneficios como consumidos (tiempo_disp=0.00 y motivo=[CANJEADO - Venta #{id}]).
    5. Asienta en LogSistema.
    """
    from sales_app.models import Beneficio
    from sales_app.selectors import beneficio_esta_activo
    from core_app.models import LogSistema

    if not venta or not lista_id_beneficios or not venta.id_usuario:
        return {'descuento_total': Decimal('0.00'), 'beneficios_canjeados': []}

    # Salvaguarda: Consumidor Final no puede canjear beneficios
    email_u = (getattr(venta.id_usuario, 'email', '') or '').strip().lower()
    if not email_u or email_u == EMAIL_CONSUMIDOR_FINAL or 'consumidorfinal' in email_u:
        return {'descuento_total': Decimal('0.00'), 'beneficios_canjeados': []}

    beneficios = list(
        Beneficio.objects.filter(
            id_beneficio__in=lista_id_beneficios,
            id_usuario=venta.id_usuario
        ).select_related('id_producto')
    )

    detalles_venta = list(venta.detalleventa_set.select_related('id_producto').all())
    subtotal_acumulado = Decimal(str(venta.monto_subtotal or 0))
    descuento_total = Decimal('0.00')
    canjeados = []

    for b in beneficios:
        if not beneficio_esta_activo(b):
            continue

        porc = Decimal(str(b.por_desc or 0)) / Decimal('100.00')
        horas_previas = float(b.tiempo_disp or 0.0)

        if b.id_producto:
            # Descuento específico por producto
            monto_linea = Decimal('0.00')
            for det in detalles_venta:
                if det.id_producto_id == b.id_producto_id:
                    monto_linea += Decimal(str(det.subtotal))

            if monto_linea > Decimal('0.00'):
                desc = monto_linea * porc
                descuento_total += desc
                canjeados.append(b)
                # Marcar beneficio como canjeado
                b.tiempo_disp = Decimal('0.00')
                b.motivo = f"[CANJEADO - Venta #{venta.id_venta} | HorasRemanentes: {horas_previas:.2f}] {b.motivo}"[:500]
                b.save()
        else:
            # Descuento general sobre el subtotal de la venta
            desc = subtotal_acumulado * porc
            descuento_total += desc
            canjeados.append(b)
            # Marcar beneficio como canjeado
            b.tiempo_disp = Decimal('0.00')
            b.motivo = f"[CANJEADO - Venta #{venta.id_venta} | HorasRemanentes: {horas_previas:.2f}] {b.motivo}"[:500]
            b.save()

    # Salvaguarda: No superar el subtotal total
    descuento_total = min(descuento_total, subtotal_acumulado)
    nuevo_subtotal = max(Decimal('0.00'), subtotal_acumulado - descuento_total)

    venta.monto_subtotal = nuevo_subtotal
    venta.save(update_fields=['monto_subtotal'])

    if canjeados:
        try:
            LogSistema.objects.create(
                fecha_hora=timezone.now(),
                accion="Canje de Beneficios en Venta",
                detalle=f"Se canjearon {len(canjeados)} beneficios en Venta #{venta.id_venta}. Ahorro aplicado: ${descuento_total:.2f}",
                tipo="BENEFICIO_CANJEADO",
                modulo_origen="sales_app",
                tabla_afectada="beneficio"
            )
        except Exception as e:
            logger.warning(f"[Motor Beneficios] Error asentando log de canje: {e}")

    return {
        'descuento_total': descuento_total,
        'nuevo_subtotal': nuevo_subtotal,
        'beneficios_canjeados': [b.id_beneficio for b in canjeados]
    }


@transaction.atomic
def revertir_beneficios_de_venta_cancelada(*, venta: Venta) -> int:
    """
    Restaura los beneficios canjeados en una venta que ha sido cancelada o expiró
    antes del pago en pasarela, devolviéndolos al estado ACTIVO y recuperando sus horas.
    """
    from sales_app.models import Beneficio
    from core_app.models import LogSistema
    import re

    if not venta:
        return 0

    tag = f"[CANJEADO - Venta #{venta.id_venta}"
    filtro_ben = {'motivo__contains': tag}
    if venta.id_usuario:
        filtro_ben['id_usuario'] = venta.id_usuario

    beneficios_canjeados = list(
        Beneficio.objects.filter(**filtro_ben)
    )

    revertidos = 0
    for b in beneficios_canjeados:
        # Extraer HorasRemanentes si existen en el motivo
        match = re.search(r'HorasRemanentes:\s*([0-9.]+)', b.motivo or '')
        horas_restauradas = Decimal('72.00')
        if match:
            try:
                horas_restauradas = Decimal(match.group(1))
            except Exception as exc_dec:
                logger.debug("[Motor Beneficios] Valor de horas remanentes inválido en motivo: %s", exc_dec)

        # Quitar el prefijo de canje
        nuevo_motivo = re.sub(r'\[CANJEADO - Venta #\d+[^\]]*\]\s*', '', b.motivo or '')
        b.motivo = nuevo_motivo[:500]
        b.tiempo_disp = max(Decimal('1.00'), horas_restauradas)
        b.fecha = timezone.now().date()
        b.save()
        revertidos += 1

    if revertidos > 0:
        try:
            LogSistema.objects.create(
                fecha_hora=timezone.now(),
                accion="Reversión Justa de Beneficios Cancelados",
                detalle=f"Se restauraron {revertidos} beneficios de la Venta #{venta.id_venta} cancelada/expirada.",
                tipo="BENEFICIO_REVERTIDO",
                modulo_origen="sales_app",
                tabla_afectada="beneficio"
            )
        except Exception as e:
            logger.warning(f"[Motor Beneficios] Error asentando log de reversión: {e}")

    return revertidos
