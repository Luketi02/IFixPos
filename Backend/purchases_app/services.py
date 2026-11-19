import logging
import secrets
from typing import Dict, Any, Optional, List, Tuple
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from core_app.selectors import obtener_dias_validez_cotizacion
from django.core.exceptions import ValidationError

from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

from purchases_app.models import (
    Proveedor,
    SolicitudCotizacion,
    SolicitudCotizacionProducto,
    InvitacionCotizar,
    Cotizacion,
    CotizacionProducto,
    OrdenCompra,
    DetalleOrdenCompra,
    RegistroCompra
)
from purchases_app.selectors import (
    obtener_proveedor_completo,
    verificar_unicidad_proveedor,
    validar_proveedores_activos,
    obtener_solicitud_en_borrador,
    obtener_invitacion_por_token,
    obtener_detalle_cotizacion,
    obtener_orden_esperando_entrega
)
from catalog_app.models import Producto
from geo_app.models import Direccion, Ciudad
from users_app.models import Usuario
from core_app.models import LogSistema, ConfiguracionSistema


@transaction.atomic
def registrar_proveedor(
    *,
    usuario_admin: Usuario,
    datos_validados: Dict[str, Any]
) -> Proveedor:
    """
    CU-24: Registrar Proveedor.
    Empadrona formalmente a una nueva entidad proveedora en el sistema,
    validando la unicidad del CUIT y correo electrónico, instanciando su domicilio físico
    en geo_app y asignándole estado 'Activo' por defecto.
    Registra la traza inmutable en LogSistema.
    """
    cuit = datos_validados['cuit'].strip()
    correo = datos_validados['correo'].strip().lower()
    nombre = datos_validados['nombre'].strip()
    telefono = datos_validados['telefono'].strip()

    # Paso 4: Validar unicidad de CUIT y Correo
    verificar_unicidad_proveedor(cuit=cuit, correo=correo)

    # Paso 7.1: Crear la entidad Direccion en geo_app
    datos_dir = datos_validados['direccion']
    calle = (datos_dir.get('calle') or '').strip()
    numero = str(datos_dir.get('numero') or '').strip()
    nro_calle = f"{calle} {numero}".strip() if (numero and numero not in calle) else calle

    ciudad_id = datos_dir['ciudad']
    ciudad = Ciudad.objects.get(id_ciudad=ciudad_id)

    barrio = (datos_dir.get('barrio') or '').strip() or None
    dpto = (datos_dir.get('dpto') or '').strip() or None
    piso = datos_dir.get('piso')
    alias = (datos_dir.get('alias') or f"Sede Proveedor {nombre}").strip()

    direccion = Direccion.objects.create(
        id_usuario=None,
        id_ciudad=ciudad,
        nro_calle=nro_calle,
        nombre_barrio=barrio,
        nro_dpto=dpto,
        piso=piso,
        alias=alias,
        is_active=True
    )

    # Paso 7.2: Instanciar Proveedor en estado Activo (Confiabilidad 60% por defecto hasta concretar 5 OC, Entrega promedio 0 calculada por el sistema)
    proveedor = Proveedor.objects.create(
        cuit_prov=cuit,
        nombre_proveedor=nombre,
        correo=correo,
        telefono=telefono,
        estado=True,
        ofrece_envio=datos_validados.get('ofrece_envio', True),
        indice_confiabilidad=datos_validados.get('indice_confiabilidad', Decimal('60.00')),
        tiempo_promedio_entrega=datos_validados.get('tiempo_promedio_entrega', 0),
        nivel=datos_validados.get('nivel', 'Estándar'),
        id_direccion=direccion
    )

    # Paso 8: Generar log de auditoría
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Registrar Proveedor (CU-24)",
        detalle=(
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) registró al nuevo "
            f"proveedor '{proveedor.nombre_proveedor}' (CUIT: {proveedor.cuit_prov}) con estado 'Activo'. "
            f"Dirección vinculada: ID {direccion.id_direccion} ({nro_calle}, {ciudad.nombre_ciudad})."
        )[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="purchases_app",
        tabla_afectada="proveedor",
        id_registro_afectado=proveedor.cuit_prov,
        id_usuario=usuario_admin
    )

    return proveedor


@transaction.atomic
def modificar_proveedor(
    *,
    usuario_admin: Usuario,
    id_proveedor: Any,
    datos_validados: Dict[str, Any]
) -> Proveedor:
    """
    CU-28: Modificar Proveedor.
    Actualiza la información comercial, fiscal, de contacto o alterna el estado operativo
    (Activo / Inactivo - Soft Delete) de un proveedor empadronado.
    Garantiza la preservación de la integridad contable y genera traza de auditoría detallada.
    """
    proveedor = obtener_proveedor_completo(id_proveedor)
    cambios = []

    # Paso 4: Validar unicidad si se modifican CUIT o Correo
    nuevo_cuit = datos_validados.get('cuit')
    nuevo_correo = datos_validados.get('correo')

    if nuevo_cuit or nuevo_correo:
        verificar_unicidad_proveedor(
            cuit=nuevo_cuit or proveedor.cuit_prov,
            correo=nuevo_correo or proveedor.correo,
            id_excluido=proveedor.cuit_prov
        )

    # Actualizar Dirección
    if 'direccion' in datos_validados:
        datos_dir = datos_validados['direccion']
        calle = (datos_dir.get('calle') or '').strip()
        numero = str(datos_dir.get('numero') or '').strip()
        nro_calle = f"{calle} {numero}".strip() if (numero and numero not in calle) else calle

        ciudad_id = datos_dir['ciudad']
        ciudad = Ciudad.objects.get(id_ciudad=ciudad_id)

        barrio = (datos_dir.get('barrio') or '').strip() or None
        dpto = (datos_dir.get('dpto') or '').strip() or None
        piso = datos_dir.get('piso')
        alias = (datos_dir.get('alias') or f"Sede Proveedor {proveedor.nombre_proveedor}").strip()

        if proveedor.id_direccion:
            dir_inst = proveedor.id_direccion
            dir_inst.nro_calle = nro_calle
            dir_inst.id_ciudad = ciudad
            dir_inst.nombre_barrio = barrio
            dir_inst.nro_dpto = dpto
            dir_inst.piso = piso
            dir_inst.alias = alias
            dir_inst.save()
        else:
            dir_inst = Direccion.objects.create(
                id_usuario=None,
                id_ciudad=ciudad,
                nro_calle=nro_calle,
                nombre_barrio=barrio,
                nro_dpto=dpto,
                piso=piso,
                alias=alias,
                is_active=True
            )
            proveedor.id_direccion = dir_inst

        cambios.append(f"direccion='{nro_calle}, {ciudad.nombre_ciudad}'")

    # Actualizar atributos comerciales y de contacto
    if 'nombre' in datos_validados:
        proveedor.nombre_proveedor = datos_validados['nombre'].strip()
        cambios.append(f"nombre='{proveedor.nombre_proveedor}'")

    if 'correo' in datos_validados:
        proveedor.correo = datos_validados['correo'].strip().lower()
        cambios.append(f"correo='{proveedor.correo}'")

    if 'telefono' in datos_validados:
        proveedor.telefono = datos_validados['telefono'].strip()
        cambios.append(f"telefono='{proveedor.telefono}'")

    if 'estado' in datos_validados:
        nuevo_estado = bool(datos_validados['estado'])
        if proveedor.estado != nuevo_estado:
            proveedor.estado = nuevo_estado
            cambios.append(f"estado={'Activo' if proveedor.estado else 'Inactivo (Soft Delete)'}")

    if 'ofrece_envio' in datos_validados:
        proveedor.ofrece_envio = bool(datos_validados['ofrece_envio'])
        cambios.append(f"ofrece_envio={proveedor.ofrece_envio}")

    if 'indice_confiabilidad' in datos_validados:
        proveedor.indice_confiabilidad = datos_validados['indice_confiabilidad']
        cambios.append(f"indice_confiabilidad={proveedor.indice_confiabilidad}")

    if 'tiempo_promedio_entrega' in datos_validados:
        proveedor.tiempo_promedio_entrega = datos_validados['tiempo_promedio_entrega']
        cambios.append(f"tiempo_promedio_entrega={proveedor.tiempo_promedio_entrega}")

    if 'nivel' in datos_validados:
        proveedor.nivel = datos_validados['nivel'].strip()
        cambios.append(f"nivel='{proveedor.nivel}'")

    # Si se modifica la clave primaria CUIT
    if nuevo_cuit and nuevo_cuit.strip() != proveedor.cuit_prov:
        cuit_dest = nuevo_cuit.strip()
        Proveedor.objects.filter(cuit_prov=proveedor.cuit_prov).update(cuit_prov=cuit_dest)
        cambios.append(f"cuit_prov='{proveedor.cuit_prov}' -> '{cuit_dest}'")
        proveedor.cuit_prov = cuit_dest

    proveedor.save()

    # Paso 7: Generar log de auditoría
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Modificar Proveedor (CU-28)",
        detalle=(
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) modificó al proveedor "
            f"'{proveedor.nombre_proveedor}' (CUIT: {proveedor.cuit_prov}). "
            f"Cambios: [{', '.join(cambios) if cambios else 'Sin cambios solicitados'}]."
        )[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="purchases_app",
        tabla_afectada="proveedor",
        id_registro_afectado=proveedor.cuit_prov,
        id_usuario=usuario_admin
    )

    return proveedor


# ==============================================================================
# CU-14: GENERAR SOLICITUD DE COTIZACIÓN (SERVICES)
# ==============================================================================

def _obtener_remitente_administracion_general(datos_local: Optional[Dict[str, str]] = None) -> Tuple[str, str]:
    """
    Resuelve la casilla oficial de 'Administración General' (`emailAdministracion`)
    desde ConfiguracionSistema para el despacho de Solicitudes de Cotización y
    Órdenes de Compra. Si no está configurada, hace fallback seguro a `emailLocal`
    y luego a `settings.DEFAULT_FROM_EMAIL`.
    Retorna `(correo_puro, remitente_formateado)`.
    """
    from django.conf import settings
    from core_app.selectors import obtener_configuracion_texto

    if datos_local is None:
        datos_local = _obtener_datos_institucionales_local()

    email_admin = obtener_configuracion_texto('emailAdministracion', fallback='')
    if email_admin and '@' in email_admin and email_admin != 'S/N':
        correo_puro = email_admin.strip()
    elif datos_local.get('emailLocal') and '@' in datos_local['emailLocal']:
        correo_puro = datos_local['emailLocal'].strip()
    else:
        correo_puro = getattr(settings, 'DEFAULT_FROM_EMAIL', 'administracion@ifixpos.com')

    nombre_local = datos_local.get('nombreLocal') or 'IFixPos ERP'
    remitente_fmt = f"{nombre_local} - Administración General <{correo_puro}>"
    return correo_puro, remitente_fmt


def generar_pdf_solicitud_cotizacion(
    solicitud: SolicitudCotizacion,
    proveedor: Proveedor,
    token_acceso: str
) -> str:
    """
    Genera el documento PDF formal de la Solicitud de Cotización con ReportLab,
    incluyendo los datos institucionales de la empresa, el correo de Administración General,
    los datos fiscales del proveedor invitado, la tabla de insumos/repuestos solicitados
    y las instrucciones para responder desde el Portal de Proveedores.
    """
    import os
    from django.conf import settings
    from core_app.selectors import obtener_url_frontend

    cuit_limpio = (proveedor.cuit_prov or 'prov').replace('-', '').replace(' ', '')
    fecha_str = solicitud.fecha_emision.strftime('%Y%m%d') if solicitud.fecha_emision else timezone.now().strftime('%Y%m%d')
    rel_path = f"solicitudes_cotizacion/solicitud_{solicitud.id_solicitud}_{cuit_limpio}_{fecha_str}.pdf"

    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

        media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(os.getcwd(), 'media')
        dir_sol = os.path.join(media_root, 'solicitudes_cotizacion')
        os.makedirs(dir_sol, exist_ok=True)
        abs_path = os.path.join(media_root, rel_path)

        datos_local = _obtener_datos_institucionales_local()
        correo_admin, _ = _obtener_remitente_administracion_general(datos_local)
        dir_prov = _formatear_direccion_proveedor(proveedor)
        url_portal = f"{obtener_url_frontend()}/portal-proveedor/cotizar/{token_acceso}"

        doc = SimpleDocTemplate(
            abs_path,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36,
            title=f"Solicitud de Cotización #{solicitud.id_solicitud}",
            author=datos_local['nombreLocal']
        )
        styles = getSampleStyleSheet()
        estilo_titulo = ParagraphStyle(
            'SCTitulo',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=15,
            leading=19,
            textColor=colors.HexColor('#0F172A')
        )
        estilo_normal = ParagraphStyle(
            'SCNormal',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=13,
            textColor=colors.HexColor('#1E293B')
        )
        estilo_th = ParagraphStyle(
            'SCTh',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=11,
            textColor=colors.white
        )
        estilo_footer = ParagraphStyle(
            'SCFooter',
            parent=styles['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=8,
            leading=11,
            alignment=1,
            textColor=colors.HexColor('#64748B')
        )

        fecha_emision_fmt = (
            solicitud.fecha_emision.strftime('%d/%m/%Y')
            if solicitud.fecha_emision
            else timezone.now().strftime('%d/%m/%Y')
        )

        elementos = [
            Paragraph(f"<b>SOLICITUD FORMAL DE COTIZACIÓN N° #{solicitud.id_solicitud}</b>", estilo_titulo),
            Paragraph(
                f"Fecha de Emisión: <b>{fecha_emision_fmt}</b> | "
                f"Departamento Emisor: <b>Administración General</b> ({correo_admin})",
                estilo_normal
            ),
            Spacer(1, 12),
            Paragraph(
                f"<b>EMPRESA SOLICITANTE:</b> {datos_local['nombreLocal']} | CUIT/CUIL: {datos_local['cuilLocal']}<br/>"
                f"Dirección: {datos_local['direccionLocal']} | Tel: {datos_local['telefonoLocal']} | Email: {correo_admin}",
                estilo_normal
            ),
            Spacer(1, 8),
            Paragraph(
                f"<b>PROVEEDOR INVITADO:</b> {proveedor.nombre_proveedor} | CUIT: {proveedor.cuit_prov}<br/>"
                f"Dirección: {dir_prov} | Tel: {proveedor.telefono or 'S/N'} | Email: {proveedor.correo or 'S/N'}",
                estilo_normal
            ),
            Spacer(1, 14),
            Paragraph(
                "Solicitamos tenga a bien remitir su cotización formal indicando precio unitario, plazo estimado de entrega "
                "y fecha de validez de la oferta para los siguientes artículos/insumos:",
                estilo_normal
            ),
            Spacer(1, 10),
        ]

        filas = [[
            Paragraph("#", estilo_th),
            Paragraph("Producto / Insumo Solicitado", estilo_th),
            Paragraph("Categoría", estilo_th),
            Paragraph("Cant. Requerida", estilo_th),
        ]]

        items_sol = solicitud.solicitudcotizacionproducto_set.select_related('id_producto', 'id_producto__id_categoria').all()
        for idx, item in enumerate(items_sol, start=1):
            prod = item.id_producto
            nombre_p = prod.nombre if prod else f"Artículo #{item.id_producto_id}"
            cat_p = prod.id_categoria.nombre if (prod and prod.id_categoria) else "General"
            filas.append([
                Paragraph(str(idx), estilo_normal),
                Paragraph(nombre_p, estilo_normal),
                Paragraph(cat_p, estilo_normal),
                Paragraph(f"<b>{item.cantidad} u.</b>", estilo_normal),
            ])

        tabla = Table(filas, colWidths=[35, 275, 130, 90])
        tabla.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elementos.append(tabla)
        elementos.append(Spacer(1, 16))

        elementos.append(
            Paragraph(
                f"<b>RESPUESTA EN LÍNEA:</b> Puede cargar sus precios, plazo de entrega y presupuesto PDF directamente desde "
                f"nuestro Portal de Proveedores en: <font color='#0891B2'>{url_portal}</font>",
                estilo_normal
            )
        )
        elementos.append(Spacer(1, 20))
        elementos.append(
            Paragraph(
                f"Documento oficial emitido por {datos_local['nombreLocal']} (CUIT: {datos_local['cuilLocal']}) • "
                f"Administración General: {correo_admin} • Tel: {datos_local['telefonoLocal']}",
                estilo_footer
            )
        )
        elementos.append(
            Paragraph(
                "Esta solicitud de cotización no constituye una orden de compra vinculante hasta su evaluación y adjudicación formal.",
                estilo_footer
            )
        )
        doc.build(elementos)
    except Exception as exc:
        logger.warning("[Solicitud Cotización PDF] Advertencia al generar PDF #%s: %s", solicitud.id_solicitud, exc)

    return rel_path


def despachar_correo_cotizacion(*, cotizacion: Cotizacion, token_acceso: str) -> bool:
    """
    Despacha el correo electrónico formal a cada proveedor invitado con:
    - Remitente oficial de 'Administración General' (`emailAdministracion`).
    - Cuerpo en texto plano y esquema HTML institucional con tabla de insumos solicitados
      y enlace directo al Portal Seguro de Proveedores.
    - Archivo PDF formal de la Solicitud de Cotización adjunto.
    """
    import os
    from django.conf import settings
    from django.core.mail import EmailMultiAlternatives
    from core_app.correos import despachar_correo_en_commit
    from core_app.selectors import obtener_url_frontend

    invitacion = getattr(cotizacion, 'id_invitacion', None)
    prov = getattr(invitacion, 'cuit_prov', None)
    solicitud = getattr(invitacion, 'id_solicitud', None)
    if not prov or not prov.correo or not solicitud:
        return False

    try:
        datos_local = _obtener_datos_institucionales_local()
        correo_admin, remitente_fmt = _obtener_remitente_administracion_general(datos_local)
        url_portal = f"{obtener_url_frontend()}/portal-proveedor/cotizar/{token_acceso}"
        fecha_emision_fmt = (
            solicitud.fecha_emision.strftime('%d/%m/%Y')
            if solicitud.fecha_emision
            else timezone.now().strftime('%d/%m/%Y')
        )

        ruta_pdf_rel = generar_pdf_solicitud_cotizacion(solicitud, prov, token_acceso)

        items_sol = list(
            solicitud.solicitudcotizacionproducto_set.select_related('id_producto', 'id_producto__id_categoria').all()
        )
        filas_texto = "\n".join(
            f"  - {it.id_producto.nombre if it.id_producto else 'Insumo'} | Cantidad: {it.cantidad} u."
            for it in items_sol
        )
        filas_html = "".join(
            f"""
            <tr>
              <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600;">
                {it.id_producto.nombre if it.id_producto else f'Artículo #{it.id_producto_id}'}
              </td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #475569;">
                {it.id_producto.id_categoria.nombre if (it.id_producto and it.id_producto.id_categoria) else 'General'}
              </td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0891b2;">
                {it.cantidad} u.
              </td>
            </tr>
            """
            for it in items_sol
        )

        asunto = f"Solicitud Formal de Cotización #{solicitud.id_solicitud} - {datos_local['nombreLocal']}"
        cuerpo_texto = (
            f"Estimado proveedor {prov.nombre_proveedor} (CUIT: {prov.cuit_prov}),\n\n"
            f"Desde Administración General de {datos_local['nombreLocal']} le enviamos la Solicitud Formal "
            f"de Cotización #{solicitud.id_solicitud} (emitida el {fecha_emision_fmt}).\n\n"
            f"Artículos / Insumos solicitados:\n{filas_texto}\n\n"
            f"Adjuntamos el documento oficial en formato PDF con el detalle completo.\n"
            f"Para responder con sus precios, plazo de entrega y presupuesto formal, ingrese al siguiente enlace seguro:\n"
            f"{url_portal}\n\n"
            f"Atentamente,\n"
            f"Administración General — {datos_local['nombreLocal']}\n"
            f"CUIT/CUIL: {datos_local['cuilLocal']} | Tel: {datos_local['telefonoLocal']} | Email: {correo_admin}"
        )

        cuerpo_html = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 660px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 22px 26px; border-bottom: 4px solid #06b6d4;">
            <div style="font-size: 11px; color: #22d3ee; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">
              Administración General • Abastecimiento y Compras
            </div>
            <h2 style="margin: 6px 0 0 0; color: #ffffff; font-size: 20px;">
              Solicitud Formal de Cotización #{solicitud.id_solicitud}
            </h2>
            <p style="margin: 4px 0 0 0; color: #cbd5e1; font-size: 12px;">
              {datos_local['nombreLocal']} • Emitida el {fecha_emision_fmt}
            </p>
          </div>
          <div style="padding: 24px 26px; color: #1e293b; font-size: 13px; line-height: 1.6;">
            <p style="margin-top: 0;">Estimado proveedor <strong>{prov.nombre_proveedor}</strong> (CUIT: <code>{prov.cuit_prov}</code>),</p>
            <p>
              Lo invitamos a cotizar los insumos detallados a continuación. Adjunto a este correo encontrará
              el <strong>documento oficial en formato PDF</strong> de la Solicitud de Cotización.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; border: 1px solid #cbd5e1;">
              <thead>
                <tr style="background: #f1f5f9;">
                  <th style="padding: 9px 10px; text-align: left; color: #334155; border-bottom: 2px solid #cbd5e1;">Producto / Insumo</th>
                  <th style="padding: 9px 10px; text-align: left; color: #334155; border-bottom: 2px solid #cbd5e1;">Categoría</th>
                  <th style="padding: 9px 10px; text-align: center; color: #334155; border-bottom: 2px solid #cbd5e1;">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {filas_html}
              </tbody>
            </table>
            <div style="text-align: center; margin: 24px 0;">
              <a href="{url_portal}" style="display: inline-block; background: #06b6d4; color: #0f172a; text-decoration: none; font-weight: 800; padding: 12px 24px; border-radius: 8px; font-size: 13px;">
                Responder Cotización en Portal Seguro →
              </a>
            </div>
            <p style="font-size: 11px; color: #64748b; background: #f8fafc; padding: 10px 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
              Si el botón no abre automáticamente, copie y pegue este enlace en su navegador:<br/>
              <span style="color: #0891b2; word-break: break-all;">{url_portal}</span>
            </p>
          </div>
          <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 26px; font-size: 11px; color: #64748b;">
            <strong>{datos_local['nombreLocal']}</strong> — Administración General<br/>
            CUIT/CUIL: {datos_local['cuilLocal']} • {datos_local['direccionLocal']} • Tel: {datos_local['telefonoLocal']} • Email: {correo_admin}
          </div>
        </div>
        """

        msg = EmailMultiAlternatives(
            subject=asunto,
            body=cuerpo_texto,
            from_email=remitente_fmt,
            to=[prov.correo],
            reply_to=[correo_admin]
        )
        msg.attach_alternative(cuerpo_html, "text/html")

        if ruta_pdf_rel:
            media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(os.getcwd(), 'media')
            abs_pdf = os.path.join(media_root, ruta_pdf_rel)
            if os.path.exists(abs_pdf):
                msg.attach_file(abs_pdf, 'application/pdf')

        despachar_correo_en_commit(
            lambda: msg.send(fail_silently=False),
            contexto=f"Solicitud Cotización #{solicitud.id_solicitud} -> {prov.correo}"
        )
        return True
    except Exception as exc:
        logger.warning("[Solicitud Cotización Correo] Error preparando correo para %s: %s", prov.correo, exc)
        return False


@transaction.atomic
def generar_solicitud_cotizacion(
    *,
    usuario_admin: Usuario,
    datos_validados: Dict[str, Any]
) -> SolicitudCotizacion:
    """
    CU-14: Generar Solicitud de Cotización.
    Permite al administrador confeccionar y despachar un documento de sondeo de mercado
    hacia múltiples proveedores activos, o guardarlo como borrador sin notificar.
    Instancia la cabecera SolicitudCotizacion, los ítems en SolicitudCotizacionProducto,
    y si no es borrador, genera invitaciones/cotizaciones con token criptográfico único
    despachando la notificación a cada proveedor. Registra la traza en LogSistema.
    """
    ids_proveedores = datos_validados.get('ids_proveedores', [])
    productos_data = datos_validados.get('productos', [])
    guardar_como_borrador = bool(datos_validados.get('guardar_como_borrador', False))

    # Paso 4: Validar proveedores activos y existentes
    proveedores_validados = list(validar_proveedores_activos(ids_proveedores))

    # Validar existencia de productos de catálogo solicitados
    ids_prods = [item['id_producto'] for item in productos_data if not item.get('es_manual') and item.get('id_producto')]
    productos_encontrados = {p.id_producto: p for p in Producto.objects.filter(id_producto__in=ids_prods)} if ids_prods else {}
    for id_p in ids_prods:
        if id_p not in productos_encontrados:
            raise ValidationError(f"El producto con ID {id_p} no existe en el catálogo.")

    # Paso 8: Cabecera de la Solicitud
    estado_solicitud = (
        SolicitudCotizacion.ESTADO_BORRADOR
        if guardar_como_borrador
        else SolicitudCotizacion.ESTADO_ENVIADA
    )
    solicitud = SolicitudCotizacion.objects.create(
        fecha_emision=timezone.now().date(),
        estado_solicitud=estado_solicitud
    )

    # Paso 8 (Detalle de productos requeridos: de catálogo o carga manual de sondeo)
    for item in productos_data:
        if item.get('es_manual'):
            marca_txt = (item.get('marca') or '').strip()
            modelo_txt = (item.get('modelo') or '').strip()
            desc_txt = (item.get('descripcion') or '').strip()
            nombre_compuesto = f"{marca_txt} {modelo_txt} — {desc_txt}".strip(' —')[:255]
            prod_instancia = Producto.objects.create(
                nombre=nombre_compuesto,
                descripcion=f"[SONDEO_MANUAL] Marca: {marca_txt} | Modelo: {modelo_txt} | Detalle: {desc_txt}"[:1000],
                precio_venta=Decimal("0.00"),
                estado=False,
                apto_venta=False,
                apto_reparacion=False,
                apto_consumible=False,
                modulo_automatico=False,
                id_categoria=None,
                id_modelo=None
            )
        else:
            prod_instancia = productos_encontrados[item['id_producto']]

        SolicitudCotizacionProducto.objects.create(
            id_solicitud=solicitud,
            id_producto=prod_instancia,
            cantidad=item.get('cantidad_requerida', 1)
        )

    # Paso 9 y 10: Cotizaciones y Tokens (si no es borrador)
    if not guardar_como_borrador:
        for prov in proveedores_validados:
            token_acceso = secrets.token_urlsafe(32)

            invitacion = InvitacionCotizar.objects.create(
                id_solicitud=solicitud,
                cuit_prov=prov,
                token_acceso=token_acceso,
                estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE
            )

            cotizacion = Cotizacion.objects.create(
                id_invitacion=invitacion,
                tiempo_promesa=0,
                estado_cotizacion=Cotizacion.ESTADO_PENDIENTE,
                fecha_validez=timezone.now().date() + timezone.timedelta(days=obtener_dias_validez_cotizacion()),
                comentarios=None,
                archivo_adjunto=None
            )

            # Despachar correo seguro individual al proveedor
            despachar_correo_cotizacion(cotizacion=cotizacion, token_acceso=token_acceso)

    # Paso 10: Registro inmutable en logs de auditoría
    if guardar_como_borrador:
        detalle_log = (
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) guardó como 'Borrador' "
            f"la Solicitud de Cotización #{solicitud.id_solicitud} con {len(productos_data)} productos solicitados."
        )
    else:
        detalle_log = (
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) emitió la "
            f"Solicitud de Cotización #{solicitud.id_solicitud} hacia {len(proveedores_validados)} proveedores "
            f"con {len(productos_data)} productos solicitados."
        )

    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Generar Solicitud de Cotización (CU-14)",
        detalle=detalle_log[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="purchases_app",
        tabla_afectada="solicitud_cotizacion",
        id_registro_afectado=str(solicitud.id_solicitud),
        id_usuario=usuario_admin
    )

    return solicitud


# ==============================================================================
# CU-16: MODIFICAR SOLICITUD DE COTIZACIÓN (SERVICES)
# ==============================================================================

@transaction.atomic
def modificar_solicitud_cotizacion(
    *,
    usuario_admin: Usuario,
    id_solicitud: int,
    datos_validados: Dict[str, Any]
) -> SolicitudCotizacion:
    """
    CU-16: Modificar Solicitud de Cotización.
    Permite al administrador editar el padrón de proveedores y la lista de repuestos
    de un sondeo que se encuentre estrictamente en estado 'Borrador'.
    Puede persistir los cambios manteniendo el estado 'Borrador' o realizar la emisión formal
    transicionando a 'Enviada a Proveedores' con generación de tokens criptográficos únicos
    y despacho de invitaciones.
    """
    solicitud = obtener_solicitud_en_borrador(id_solicitud)

    ids_proveedores = datos_validados.get('ids_proveedores', [])
    productos_data = datos_validados.get('productos', [])
    emitir_solicitud = bool(datos_validados.get('emitir_solicitud', False))

    # Paso 4: Validar proveedores activos y existentes
    proveedores_validados = list(validar_proveedores_activos(ids_proveedores))

    # Paso 4: Validar productos existentes en el catálogo
    ids_prods = [item['id_producto'] for item in productos_data if not item.get('es_manual') and item.get('id_producto')]
    productos_encontrados = {p.id_producto: p for p in Producto.objects.filter(id_producto__in=ids_prods)} if ids_prods else {}
    for id_p in ids_prods:
        if id_p not in productos_encontrados:
            raise ValidationError(f"El producto con ID {id_p} no existe en el catálogo.")

    # Paso 2 / Comentarios CU-16: Restricción estricta de borrado sobre insumos técnicos de taller
    if getattr(solicitud, 'sol_tec', False):
        ids_originales = set(solicitud.solicitudcotizacionproducto_set.values_list('id_producto_id', flat=True))
        ids_nuevos = set(item['id_producto'] for item in productos_data if not item.get('es_manual') and item.get('id_producto'))
        if not ids_originales.issubset(ids_nuevos):
            raise ValidationError("Operación restringida: Imposible amputar insumos técnicos requeridos por el área técnica para la reparación.")

    # Paso 7: Limpieza de renglones viejos y guardado de los nuevos
    solicitud.solicitudcotizacionproducto_set.all().delete()
    for item in productos_data:
        if item.get('es_manual'):
            marca_txt = (item.get('marca') or '').strip()
            modelo_txt = (item.get('modelo') or '').strip()
            desc_txt = (item.get('descripcion') or '').strip()
            nombre_compuesto = f"{marca_txt} {modelo_txt} — {desc_txt}".strip(' —')[:255]
            prod_instancia = Producto.objects.create(
                nombre=nombre_compuesto,
                descripcion=f"[SONDEO_MANUAL] Marca: {marca_txt} | Modelo: {modelo_txt} | Detalle: {desc_txt}"[:1000],
                precio_venta=Decimal("0.00"),
                estado=False,
                apto_venta=False,
                apto_reparacion=False,
                apto_consumible=False,
                modulo_automatico=False,
                id_categoria=None,
                id_modelo=None
            )
        else:
            prod_instancia = productos_encontrados[item['id_producto']]

        SolicitudCotizacionProducto.objects.create(
            id_solicitud=solicitud,
            id_producto=prod_instancia,
            cantidad=item.get('cantidad_requerida', 1)
        )

    # Paso 7: Transición a emisión o mantenimiento de borrador
    if emitir_solicitud:
        solicitud.estado_solicitud = SolicitudCotizacion.ESTADO_ENVIADA
        solicitud.fecha_emision = timezone.now().date()
        solicitud.save()

        # Generar invitaciones y cotizaciones para los proveedores validados
        for prov in proveedores_validados:
            token_acceso = secrets.token_urlsafe(32)

            invitacion = InvitacionCotizar.objects.create(
                id_solicitud=solicitud,
                cuit_prov=prov,
                token_acceso=token_acceso,
                estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE
            )

            cotizacion = Cotizacion.objects.create(
                id_invitacion=invitacion,
                tiempo_promesa=0,
                estado_cotizacion=Cotizacion.ESTADO_PENDIENTE,
                fecha_validez=timezone.now().date() + timezone.timedelta(days=obtener_dias_validez_cotizacion()),
                comentarios=None,
                archivo_adjunto=None
            )

            despachar_correo_cotizacion(cotizacion=cotizacion, token_acceso=token_acceso)

        detalle_log = (
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) modificó y emitió formalmente "
            f"la Solicitud de Cotización #{solicitud.id_solicitud} hacia {len(proveedores_validados)} proveedores "
            f"con {len(productos_data)} productos solicitados."
        )
    else:
        solicitud.save()
        detalle_log = (
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) modificó el borrador "
            f"de la Solicitud de Cotización #{solicitud.id_solicitud} con {len(productos_data)} productos solicitados."
        )

    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Modificar Solicitud de Cotización (CU-16)",
        detalle=detalle_log[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="purchases_app",
        tabla_afectada="solicitud_cotizacion",
        id_registro_afectado=str(solicitud.id_solicitud),
        id_usuario=usuario_admin
    )

    return solicitud


# ==============================================================================
# CU-17: ELIMINAR SOLICITUD DE COTIZACIÓN (SERVICES)
# ==============================================================================

@transaction.atomic
def eliminar_solicitud_cotizacion(
    *,
    usuario_admin: Usuario,
    id_solicitud: int
) -> None:
    """
    CU-17: Eliminar Solicitud de Cotización.
    Permite al administrador eliminar definitivamente un documento de sondeo en estado 'Borrador'.
    Por reglas estrictas de integridad y taller, rechaza la operación si el documento
    ya fue emitido/cotizado o si fue generado por requerimiento técnico de una reparación (sol_tec = True).
    Realiza la eliminación física en cascada y asienta la traza inmutable en LogSistema.
    """
    solicitud = obtener_solicitud_en_borrador(id_solicitud)

    # Paso 2: Validación estricta de dependencia técnica (sol_tec)
    if getattr(solicitud, 'sol_tec', False):
        raise ValidationError("Imposible eliminar: Insumos requeridos por el área técnica.")

    solicitud_id_str = str(solicitud.id_solicitud)

    # Paso 5: Eliminación física en cascada
    solicitud.delete()

    # Paso 5: Asentar traza inmutable de auditoría
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Eliminar Solicitud de Cotización (CU-17)",
        detalle=(
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) eliminó definitivamente "
            f"la Solicitud de Cotización #{solicitud_id_str} en estado borrador."
        )[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="purchases_app",
        tabla_afectada="solicitud_cotizacion",
        id_registro_afectado=solicitud_id_str,
        id_usuario=usuario_admin
    )


# ==============================================================================
# CU-25: RESPONDER SOLICITUD DE COTIZACIÓN (SERVICES)
# ==============================================================================

@transaction.atomic
def procesar_respuesta_cotizacion(
    *,
    token_acceso: str,
    datos_validados: Dict[str, Any]
) -> Cotizacion:
    """
    CU-25: Responder Solicitud de Cotización.
    Permite a un proveedor externo interactuar con el sistema a través de un enlace seguro
    para formalizar su oferta económica o justificar su rechazo a participar.

    Flujo Transaccional Innegociable:
    1. Valida el token criptográfico y que la Solicitud padre se encuentre en estado 'Enviada'.
    2. Si accion == 'DECLINAR':
       - Actualiza la cotización a estado 'Rechazada' (3) y persiste los comentarios obligatorios.
       - Marca la invitación en estado 'Rechazada' (2).
       - Invalida permanentemente el token de acceso (token_acceso = None).
       - Verifica si TODOS los proveedores invitados han declinado; de ser así, transiciona
         la Solicitud de Cotización principal a estado 'Rechazada' (3).
    3. Si accion == 'COTIZAR':
       - Actualiza la cotización a estado 'Pendiente de Evaluación' (0).
       - Congela el plazo de entrega prometido, fecha de caducidad y presupuesto formal (PDF).
       - Persiste registros individuales en CotizacionProducto por cada ítem cotizado.
       - Marca la invitación en estado 'Cotizada' (1).
       - Invalida permanentemente el token de acceso (token_acceso = None).
       - Transiciona la Solicitud de Cotización principal a estado 'Cotizada' (2).
    4. Asienta la traza inmutable en LogSistema sin usuario autenticado (id_usuario = None).
    """
    invitacion = obtener_invitacion_por_token(token_acceso)
    solicitud = invitacion.id_solicitud

    cotizacion = invitacion.cotizacion_set.first()
    if not cotizacion:
        cotizacion = Cotizacion.objects.create(
            id_invitacion=invitacion,
            tiempo_promesa=0,
            estado_cotizacion=Cotizacion.ESTADO_PENDIENTE,
            fecha_validez=timezone.now().date() + timezone.timedelta(days=15),
            comentarios=None,
            archivo_adjunto=None
        )

    accion = (datos_validados.get('accion') or '').upper()

    if accion == 'DECLINAR':
        comentarios = (datos_validados.get('comentarios') or '').strip()
        cotizacion.estado_cotizacion = Cotizacion.ESTADO_RECHAZADA
        cotizacion.comentarios = comentarios
        cotizacion.save()

        invitacion.estado_invitacion = InvitacionCotizar.ESTADO_RECHAZADA
        invitacion.token_acceso = None
        invitacion.save()

        # Verificar si todos los proveedores invitados han declinado
        invitaciones_activas = solicitud.invitacioncotizar_set.exclude(
            estado_invitacion=InvitacionCotizar.ESTADO_RECHAZADA
        ).exists()

        if not invitaciones_activas:
            solicitud.estado_solicitud = SolicitudCotizacion.ESTADO_RECHAZADA
            solicitud.save()

        LogSistema.objects.create(
            fecha_hora=timezone.now(),
            accion="Declinar Solicitud de Cotización (CU-25)",
            detalle=(
                f"El proveedor '{invitacion.cuit_prov.nombre_proveedor}' (CUIT: {invitacion.cuit_prov_id}) "
                f"declinó la Solicitud de Cotización #{solicitud.id_solicitud} vía token seguro. "
                f"Motivo: '{comentarios}'."
            )[:1000],
            tipo="ADMINISTRACION",
            modulo_origen="purchases_app",
            tabla_afectada="cotizacion",
            id_registro_afectado=str(cotizacion.id_cotizacion),
            id_usuario=None
        )

    elif accion == 'COTIZAR':
        plazo_entrega = datos_validados['plazo_entrega']
        fecha_validez = datos_validados['fecha_validez']
        comentarios = datos_validados.get('comentarios') or ''
        archivo = datos_validados.get('archivo_adjunto')

        if archivo:
            if hasattr(archivo, 'name') and hasattr(archivo, 'read'):
                nombre_archivo = f"cotizaciones/presupuesto_{invitacion.id_invitacion}_{archivo.name}"
                ruta_guardada = default_storage.save(nombre_archivo, archivo)
                cotizacion.archivo_adjunto = ruta_guardada
            elif isinstance(archivo, str):
                cotizacion.archivo_adjunto = archivo

        cotizacion.tiempo_promesa = plazo_entrega
        cotizacion.fecha_validez = fecha_validez
        cotizacion.comentarios = comentarios
        cotizacion.estado_cotizacion = Cotizacion.ESTADO_PENDIENTE
        cotizacion.save()

        # Reemplazar e instanciar detalles de insumos cotizados con precio congelado
        cotizacion.cotizacionproducto_set.all().delete()
        for item in datos_validados['items']:
            CotizacionProducto.objects.create(
                id_cotizacion=cotizacion,
                id_producto_id=item['id_producto'],
                precio_ofrecido=item['precio_ofrecido']
            )

        invitacion.estado_invitacion = InvitacionCotizar.ESTADO_COTIZADA
        invitacion.token_acceso = None
        invitacion.save()

        # Si al menos un proveedor cotiza, la solicitud pasa a estado Cotizada (Pendiente de evaluación)
        solicitud.estado_solicitud = SolicitudCotizacion.ESTADO_COTIZADA
        solicitud.save()

        LogSistema.objects.create(
            fecha_hora=timezone.now(),
            accion="Responder Solicitud de Cotización (CU-25)",
            detalle=(
                f"El proveedor '{invitacion.cuit_prov.nombre_proveedor}' (CUIT: {invitacion.cuit_prov_id}) "
                f"envió su cotización para la Solicitud #{solicitud.id_solicitud} vía token seguro. "
                f"Plazo: {cotizacion.tiempo_promesa} días. Ítems cotizados: {len(datos_validados['items'])}."
            )[:1000],
            tipo="ADMINISTRACION",
            modulo_origen="purchases_app",
            tabla_afectada="cotizacion",
            id_registro_afectado=str(cotizacion.id_cotizacion),
            id_usuario=None
        )

    return cotizacion


# ==============================================================================
# CU-53: EVALUAR COTIZACIÓN (SERVICES)
# ==============================================================================

@transaction.atomic
def evaluar_cotizacion(
    *,
    usuario_admin: Usuario,
    id_cotizacion: int,
    datos_validados: Dict[str, Any]
) -> Cotizacion:
    """
    CU-53: Evaluar Cotización.
    Permite al Administrador analizar y dictaminar sobre una propuesta económica recibida:
    - 'ACEPTAR': Convalida la oferta y sus precios hijos, activándolos para el algoritmo de compras.
    - 'RECHAZAR': Descarta la oferta (estado 'Descartada por admin') con comentarios justificativos.
    - Lógica de Cierre (Paso 6): Si todas las cotizaciones de la solicitud padre han sido evaluadas,
      transiciona automáticamente la SolicitudCotizacion a estado 'Cerrada/Evaluada'.
    - Registra la traza inmutable en LogSistema.
    """
    cotizacion = obtener_detalle_cotizacion(id_cotizacion)

    if cotizacion.estado_cotizacion != Cotizacion.ESTADO_PENDIENTE:
        raise ValidationError(
            f"Operación bloqueada: Solo es posible evaluar cotizaciones en estado 'Pendiente de Evaluación' "
            f"(Estado actual: {cotizacion.estado_nombre})."
        )

    accion = (datos_validados.get('accion') or '').upper()
    comentarios = (datos_validados.get('comentarios') or '').strip()

    if accion == 'ACEPTAR':
        cotizacion.estado_cotizacion = Cotizacion.ESTADO_ACEPTADA
        if comentarios:
            cotizacion.comentarios = f"{cotizacion.comentarios or ''} [Aceptada: {comentarios}]".strip()
    elif accion == 'RECHAZAR':
        cotizacion.estado_cotizacion = Cotizacion.ESTADO_DESCARTADA
        if comentarios:
            cotizacion.comentarios = comentarios
    else:
        raise ValidationError(f"Acción '{accion}' inválida. Debe ser 'ACEPTAR' o 'RECHAZAR'.")

    cotizacion.save()

    # Paso 6: Verificar en segundo plano si aún existen ofertas en estado 'Pendiente' para esta Solicitud
    solicitud = cotizacion.id_invitacion.id_solicitud
    quedan_pendientes = Cotizacion.objects.filter(
        id_invitacion__id_solicitud=solicitud,
        estado_cotizacion=Cotizacion.ESTADO_PENDIENTE
    ).exists()

    if not quedan_pendientes:
        solicitud.estado_solicitud = SolicitudCotizacion.ESTADO_CERRADA
        solicitud.save()

    prov = cotizacion.id_invitacion.cuit_prov
    nombre_prov = prov.nombre_proveedor if prov else "Desconocido"

    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Evaluar Cotización (CU-53)",
        detalle=(
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) evaluó la "
            f"Cotización #{cotizacion.id_cotizacion} del proveedor '{nombre_prov}'. "
            f"Resolución: '{cotizacion.estado_nombre}'."
        )[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="purchases_app",
        tabla_afectada="cotizacion",
        id_registro_afectado=str(cotizacion.id_cotizacion),
        id_usuario=usuario_admin
    )

    return cotizacion


# ==============================================================================
# CU-54: GENERAR ORDEN DE COMPRA (SERVICES)
# ==============================================================================

def _obtener_datos_institucionales_local() -> Dict[str, str]:
    """
    Recupera los parámetros institucionales desde ConfiguracionSistema:
    nombreLocal, direccionLocal, imagenLocal, cuilLocal, telefonoLocal y emailLocal.
    """
    claves = ['nombreLocal', 'direccionLocal', 'imagenLocal', 'cuilLocal', 'telefonoLocal', 'emailLocal']
    configs = {
        c.clave: (c.valor or '').strip()
        for c in ConfiguracionSistema.objects.filter(clave__in=claves)
    }

    nombre_local = configs.get('nombreLocal') or 'IFixPos ERP'
    cuil_local = configs.get('cuilLocal') or '30-00000000-0'
    telefono_local = configs.get('telefonoLocal') or 'S/N'
    email_local = configs.get('emailLocal') or 'compras@ifixpos.com'
    imagen_local = configs.get('imagenLocal') or ''

    direccion_texto = configs.get('direccionLocal') or 'Sede Central'
    if direccion_texto.isdigit():
        dir_obj = Direccion.objects.select_related(
            'id_ciudad__id_provincia__id_pais'
        ).filter(id_direccion=int(direccion_texto)).first()
        if dir_obj:
            partes = [dir_obj.nro_calle, dir_obj.nombre_barrio]
            if dir_obj.id_ciudad:
                partes.append(dir_obj.id_ciudad.nombre_ciudad)
                if dir_obj.id_ciudad.id_provincia:
                    partes.append(dir_obj.id_ciudad.id_provincia.nombre_provincia)
            direccion_texto = ", ".join(p for p in partes if p)

    return {
        'nombreLocal': nombre_local,
        'direccionLocal': direccion_texto,
        'imagenLocal': imagen_local,
        'cuilLocal': cuil_local,
        'telefonoLocal': telefono_local,
        'emailLocal': email_local,
    }


def _formatear_direccion_proveedor(proveedor: Proveedor) -> str:
    d = getattr(proveedor, 'id_direccion', None)
    if not d:
        return "Domicilio comercial no especificado"
    partes = [d.nro_calle, d.nombre_barrio]
    ciudad = getattr(d, 'id_ciudad', None)
    if ciudad:
        partes.append(ciudad.nombre_ciudad)
        prov = getattr(ciudad, 'id_provincia', None)
        if prov:
            partes.append(prov.nombre_provincia)
    return ", ".join(p for p in partes if p) or "Domicilio comercial registrado"


def generar_pdf_orden_compra(orden: OrdenCompra) -> str:
    """
    Paso 7 (CU-54): Genera el documento legal estructurado (PDF) de la Orden de Compra.
    Incluye los datos institucionales del local (nombreLocal, direccionLocal, imagenLocal,
    cuilLocal, telefonoLocal, emailLocal), los datos fiscales del proveedor adjudicado
    (CUIT, Razón Social, correo, teléfono, dirección), la modalidad de recepción
    (Envío a Domicilio / Retiro en Sucursal) y la tabla de productos con cantidades
    y precios unitarios congelados.
    """
    import os
    from django.conf import settings

    rel_path = f"ordenes_compra/orden_{orden.id_orden}_{orden.fecha_emision.strftime('%Y%m%d')}.pdf"
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

        media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(os.getcwd(), 'media')
        dir_ordenes = os.path.join(media_root, 'ordenes_compra')
        os.makedirs(dir_ordenes, exist_ok=True)
        abs_path = os.path.join(media_root, rel_path)

        datos_local = _obtener_datos_institucionales_local()
        prov = orden.cuit_prov
        dir_prov = _formatear_direccion_proveedor(prov)

        doc = SimpleDocTemplate(
            abs_path,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36,
            title=f"Orden de Compra #{orden.id_orden}",
            author=datos_local['nombreLocal']
        )
        styles = getSampleStyleSheet()
        estilo_titulo = ParagraphStyle(
            'OCTitulo',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=16,
            leading=20,
            textColor=colors.HexColor('#0F172A')
        )
        estilo_normal = ParagraphStyle(
            'OCNormal',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=13,
            textColor=colors.HexColor('#1E293B')
        )
        estilo_th = ParagraphStyle(
            'OCTh',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=11,
            textColor=colors.white
        )

        correo_admin, _ = _obtener_remitente_administracion_general(datos_local)

        elementos = [
            Paragraph(f"<b>ORDEN DE COMPRA OFICIAL N° #{orden.id_orden}</b>", estilo_titulo),
            Paragraph(
                f"Fecha de Emisión: {orden.fecha_emision.strftime('%d/%m/%Y')} | "
                f"Modalidad: <b>{orden.tipo_entrega_nombre}</b> | Departamento Emisor: <b>Administración General</b>",
                estilo_normal
            ),
            Spacer(1, 12),
            Paragraph(
                f"<b>COMPRADOR (LOCAL):</b> {datos_local['nombreLocal']} | CUIT/CUIL: {datos_local['cuilLocal']}<br/>"
                f"Dirección: {datos_local['direccionLocal']} | Tel: {datos_local['telefonoLocal']} | Email: {correo_admin}",
                estilo_normal
            ),
            Spacer(1, 8),
            Paragraph(
                f"<b>PROVEEDOR ADJUDICADO:</b> {prov.nombre_proveedor} | CUIT: {prov.cuit_prov}<br/>"
                f"Dirección: {dir_prov} | Tel: {prov.telefono or 'S/N'} | Email: {prov.correo or 'S/N'}",
                estilo_normal
            ),
            Spacer(1, 14),
        ]

        filas = [[
            Paragraph("Producto / Insumo", estilo_th),
            Paragraph("Cantidad", estilo_th),
            Paragraph("Precio Unitario", estilo_th),
            Paragraph("Subtotal", estilo_th),
        ]]
        total_general = Decimal("0.00")
        for det in orden.detalles.select_related('id_producto').all():
            sub = Decimal(str(det.cantidad)) * det.precio_unitario
            total_general += sub
            filas.append([
                Paragraph(det.id_producto.nombre if det.id_producto else f"Producto #{det.id_producto_id}", estilo_normal),
                Paragraph(str(det.cantidad), estilo_normal),
                Paragraph(f"$ {det.precio_unitario:,.2f}", estilo_normal),
                Paragraph(f"$ {sub:,.2f}", estilo_normal),
            ])

        filas.append([
            Paragraph("", estilo_normal),
            Paragraph("", estilo_normal),
            Paragraph("<b>TOTAL COMPROMETIDO:</b>", estilo_normal),
            Paragraph(f"<b>$ {total_general:,.2f}</b>", estilo_normal),
        ])

        tabla = Table(filas, colWidths=[240, 70, 110, 110])
        tabla.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
            ('GRID', (0, 0), (-1, -2), 0.5, colors.HexColor('#CBD5E1')),
            ('LINEABOVE', (2, -1), (-1, -1), 1, colors.HexColor('#0F172A')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elementos.append(tabla)
        elementos.append(Spacer(1, 20))

        estilo_footer = ParagraphStyle(
            'OCFooter',
            parent=styles['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=8,
            leading=11,
            alignment=1,
            textColor=colors.HexColor('#64748B')
        )
        elementos.append(
            Paragraph(
                f"Documento oficial emitido por {datos_local['nombreLocal']} (CUIT: {datos_local['cuilLocal']}) • "
                f"{datos_local['direccionLocal']} • Administración General: {correo_admin} / Tel: {datos_local['telefonoLocal']}",
                estilo_footer
            )
        )
        elementos.append(
            Paragraph(
                "Orden de Compra sujeta a verificación de recepción física y remito comercial. Prohibida su alteración.",
                estilo_footer
            )
        )
        doc.build(elementos)
    except Exception:
        # Fallback seguro si el entorno de pruebas restringe escritura en disco
        pass

    return rel_path


def despachar_correo_orden_compra(orden: OrdenCompra, ruta_pdf_rel: Optional[str] = None) -> bool:
    """
    Paso 8 (CU-54): Despacha formalmente el contrato y documento legal (PDF)
    de la Orden de Compra vía correo electrónico al proveedor adjudicado,
    enviado desde 'Administración General' (`emailAdministracion`) con esquema HTML,
    cuerpo detallado y PDF formal adjunto.
    """
    import os
    from django.conf import settings
    from django.core.mail import EmailMultiAlternatives
    from core_app.correos import despachar_correo_en_commit

    prov = orden.cuit_prov
    if not prov or not prov.correo:
        return False

    try:
        datos_local = _obtener_datos_institucionales_local()
        correo_admin, remitente_fmt = _obtener_remitente_administracion_general(datos_local)
        fecha_emision_fmt = (
            orden.fecha_emision.strftime('%d/%m/%Y')
            if orden.fecha_emision
            else timezone.now().strftime('%d/%m/%Y')
        )

        detalles = list(orden.detalles.select_related('id_producto').all())
        total_general = Decimal("0.00")
        filas_texto_list = []
        filas_html_list = []

        for det in detalles:
            sub = Decimal(str(det.cantidad)) * det.precio_unitario
            total_general += sub
            nom_prod = det.id_producto.nombre if det.id_producto else f"Producto #{det.id_producto_id}"
            filas_texto_list.append(
                f"  - {nom_prod} | Cant: {det.cantidad} u. | P. Unit: ${det.precio_unitario:,.2f} | Subtotal: ${sub:,.2f}"
            )
            filas_html_list.append(
                f"""
                <tr>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600;">{nom_prod}</td>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #334155;">{det.cantidad} u.</td>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155; font-family: monospace;">${det.precio_unitario:,.2f}</td>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #0f172a; font-weight: 700; font-family: monospace;">${sub:,.2f}</td>
                </tr>
                """
            )

        filas_texto = "\n".join(filas_texto_list)
        filas_html = "".join(filas_html_list)

        asunto = f"Orden de Compra Oficial #{orden.id_orden} - {datos_local['nombreLocal']}"
        cuerpo_texto = (
            f"Estimado proveedor {prov.nombre_proveedor} (CUIT: {prov.cuit_prov}),\n\n"
            f"Desde Administración General de {datos_local['nombreLocal']} adjuntamos la Orden de Compra Oficial #{orden.id_orden} "
            f"emitida el {fecha_emision_fmt} bajo modalidad '{orden.tipo_entrega_nombre}'.\n\n"
            f"Detalle de artículos adjudicados:\n{filas_texto}\n"
            f"TOTAL COMPROMETIDO: ${total_general:,.2f}\n\n"
            f"Adjuntamos el documento legal oficial en formato PDF.\n"
            f"Por favor confirmar recepción y coordinar entrega con su respectivo remito comercial.\n\n"
            f"Atentamente,\n"
            f"Administración General — {datos_local['nombreLocal']}\n"
            f"CUIT/CUIL: {datos_local['cuilLocal']} | Tel: {datos_local['telefonoLocal']} | Email: {correo_admin}"
        )

        cuerpo_html = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 680px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 22px 26px; border-bottom: 4px solid #8b5cf6;">
            <div style="font-size: 11px; color: #c4b5fd; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">
              Administración General • Orden de Compra Adjudicada
            </div>
            <h2 style="margin: 6px 0 0 0; color: #ffffff; font-size: 20px;">
              Orden de Compra Oficial N° #{orden.id_orden}
            </h2>
            <p style="margin: 4px 0 0 0; color: #cbd5e1; font-size: 12px;">
              {datos_local['nombreLocal']} • Emitida el {fecha_emision_fmt} • Modalidad: <strong>{orden.tipo_entrega_nombre}</strong>
            </p>
          </div>
          <div style="padding: 24px 26px; color: #1e293b; font-size: 13px; line-height: 1.6;">
            <p style="margin-top: 0;">Estimado proveedor <strong>{prov.nombre_proveedor}</strong> (CUIT: <code>{prov.cuit_prov}</code>),</p>
            <p>
              Le remitimos formalmente la <strong>Orden de Compra Oficial #{orden.id_orden}</strong> correspondiente a los
              artículos detallados a continuación. Adjunto a este correo encontrará el <strong>documento oficial en formato PDF</strong>.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; border: 1px solid #cbd5e1;">
              <thead>
                <tr style="background: #f1f5f9;">
                  <th style="padding: 9px 10px; text-align: left; color: #334155; border-bottom: 2px solid #cbd5e1;">Producto / Insumo</th>
                  <th style="padding: 9px 10px; text-align: center; color: #334155; border-bottom: 2px solid #cbd5e1;">Cantidad</th>
                  <th style="padding: 9px 10px; text-align: right; color: #334155; border-bottom: 2px solid #cbd5e1;">Precio Unitario</th>
                  <th style="padding: 9px 10px; text-align: right; color: #334155; border-bottom: 2px solid #cbd5e1;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {filas_html}
              </tbody>
              <tfoot>
                <tr style="background: #f8fafc;">
                  <td colspan="3" style="padding: 10px; text-align: right; font-weight: 800; color: #0f172a; border-top: 2px solid #94a3b8;">
                    TOTAL COMPROMETIDO:
                  </td>
                  <td style="padding: 10px; text-align: right; font-weight: 900; color: #0891b2; font-family: monospace; font-size: 14px; border-top: 2px solid #94a3b8;">
                    ${total_general:,.2f}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p style="font-size: 12px; color: #475569; background: #f8fafc; padding: 10px 12px; border-radius: 6px; border-left: 4px solid #8b5cf6;">
              <strong>Modalidad de Entrega:</strong> {orden.tipo_entrega_nombre}.<br/>
              Por favor adjuntar el remito comercial correspondiente al momento de la entrega para su recepción física en almacén.
            </p>
          </div>
          <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 26px; font-size: 11px; color: #64748b;">
            <strong>{datos_local['nombreLocal']}</strong> — Administración General<br/>
            CUIT/CUIL: {datos_local['cuilLocal']} • {datos_local['direccionLocal']} • Tel: {datos_local['telefonoLocal']} • Email: {correo_admin}
          </div>
        </div>
        """

        msg = EmailMultiAlternatives(
            subject=asunto,
            body=cuerpo_texto,
            from_email=remitente_fmt,
            to=[prov.correo],
            reply_to=[correo_admin]
        )
        msg.attach_alternative(cuerpo_html, "text/html")

        if ruta_pdf_rel:
            media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(os.getcwd(), 'media')
            abs_pdf = os.path.join(media_root, ruta_pdf_rel)
            if os.path.exists(abs_pdf):
                msg.attach_file(abs_pdf, 'application/pdf')

        despachar_correo_en_commit(
            lambda: msg.send(fail_silently=False),
            contexto=f"Orden de Compra #{orden.id_orden} -> {prov.correo}"
        )
        return True
    except Exception as exc:
        logger.warning("[Orden de Compra Correo] Error preparando correo para %s: %s", prov.correo, exc)
        return False


@transaction.atomic
def emitir_ordenes_compra(
    *,
    usuario_admin: Usuario,
    borradores_aprobados: List[Dict[str, Any]]
) -> List[OrdenCompra]:
    """
    CU-54: Generar Orden de Compra.
    Instancia y emite contratos comerciales definitivos hacia los proveedores adjudicados.
    Por cada borrador confirmado:
    - Genera la cabecera OrdenCompra en estado 'Esperando Entrega' (1).
    - Congela los precios históricos e insumos en DetalleOrdenCompra.
    - Genera el PDF formal legal respaldado institucionalmente.
    - Despacha la notificación por correo al distribuidor.
    - Asienta la traza inmutable consolidada en LogSistema.
    """
    if not borradores_aprobados:
        raise ValidationError("Debe incluir al menos un borrador de compra para emitir órdenes.")

    ordenes_creadas: List[OrdenCompra] = []

    for borrador in borradores_aprobados:
        cuit_prov = borrador.get('cuit_prov')
        if not cuit_prov:
            raise ValidationError("Cada borrador debe especificar el CUIT del proveedor destinatario.")

        proveedor = obtener_proveedor_completo(cuit_prov)

        tipo_entrega = int(borrador.get('tipo_entrega') or OrdenCompra.TIPO_ENTREGA_RETIRO)
        if tipo_entrega not in (OrdenCompra.TIPO_ENTREGA_RETIRO, OrdenCompra.TIPO_ENTREGA_ENVIO):
            tipo_entrega = OrdenCompra.TIPO_ENTREGA_RETIRO

        sol_tec = bool(borrador.get('sol_tec', False))

        raw_items = borrador.get('items')
        if not raw_items:
            raise ValidationError(f"El borrador para el proveedor '{proveedor.nombre_proveedor}' no contiene artículos.")

        orden = OrdenCompra.objects.create(
            fecha_emision=timezone.now().date(),
            estado_orden=OrdenCompra.ESTADO_ESPERANDO_ENTREGA,
            sol_tec=sol_tec,
            tipo_entrega=tipo_entrega,
            cuit_prov=proveedor
        )

        for it in raw_items:
            id_prod = int(it['id_producto'])
            cant = int(it['cantidad'])
            precio = Decimal(str(it['precio_unitario']))

            if cant <= 0 or precio <= Decimal("0.00"):
                raise ValidationError("Cantidad y precio unitario deben ser estrictamente positivos.")

            DetalleOrdenCompra.objects.create(
                id_orden=orden,
                id_producto_id=id_prod,
                cantidad=cant,
                precio_unitario=precio
            )

        ruta_pdf = generar_pdf_orden_compra(orden)
        orden.ruta_pdf = f"/media/{ruta_pdf}"
        despachar_correo_orden_compra(orden, ruta_pdf)

        ordenes_creadas.append(orden)

    ids_str = ", ".join(f"#{o.id_orden}" for o in ordenes_creadas)
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Generar Orden de Compra (CU-54)",
        detalle=(
            f"El administrador {usuario_admin.id_usuario} ({usuario_admin.email}) emitió "
            f"{len(ordenes_creadas)} órdenes de compra: [{ids_str}] en estado 'Esperando Entrega'."
        )[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="purchases_app",
        tabla_afectada="orden_compra",
        id_registro_afectado=ids_str,
        id_usuario=usuario_admin
    )

    return ordenes_creadas



# ==============================================================================
# CU-55: RECEPCIONAR COMPRA (SERVICES)
# ==============================================================================

@transaction.atomic
def recepcionar_orden_compra(
    *,
    usuario_admin: Usuario,
    id_orden: int,
    datos_validados: Dict[str, Any]
) -> OrdenCompra:
    """
    CU-55: Recepcionar Compra.
    Permite al Administrador registrar el ingreso físico de la mercadería:
    - Valida que la orden esté en estado 'Esperando Entrega' (1).
    - Asigna o autogenera el nro_remito unívoco si no fue suministrado.
    - Contrasta renglón por renglón las cantidades recibidas vs solicitadas en DetalleOrdenCompra.
    - Si se detecta excedente físico y no fue confirmado expresamente, levanta ValidationError
      con código 'requiere_confirmacion_excedente'.
    - Si se detectan faltantes (o renglones no recibidos), marca la entrega como parcial.
    - Incrementa el stock real en inventory_app (crea MovimientoStock con tipo 'compra').
    - Congela en DetalleOrdenCompra la cantidad_recibida y ajusta cantidad para el total financiero.
    - Transiciona la OrdenCompra a 'Entregada' (2) o 'Entregada Parcialmente' (4).
    - Reactividad Técnica (Paso 9): Si orden.sol_tec == True, reactiva reparaciones pausadas en taller
      ('ESPERANDO_REPUESTOS' / 'ESPERANDO_INSUMOS') con criterio FIFO (más antiguas primero),
      pasándolas a 'EN_REPARACION' y registrando el evento en BitacoraReparacion.
    - Registra el asiento inmutable en LogSistema.
    """
    from inventory_app.models import Stock, MovimientoStock
    from workshop_app.models import BitacoraReparacion, Reparacion
    from workshop_app.selectors import obtener_reparaciones_esperando_insumo_ordenadas

    orden = obtener_orden_esperando_entrega(id_orden)

    # Paso 6: Comprobante / Remito (si está vacío, generar unívoco interno)
    nro_remito = (datos_validados.get('nro_remito') or '').strip()
    if not nro_remito:
        stamp = timezone.now().strftime('%Y%m%d%H%M%S')
        nro_remito = f"REC-{orden.id_orden}-{stamp}"

    confirmar_excedente = bool(datos_validados.get('confirmar_excedente', False))
    es_entrega_parcial = False
    hay_excedente = False

    detalles_db = {d.id_detalle_compra: d for d in orden.detalles.all()}
    items_input = datos_validados.get('items', [])

    recibidos_por_detalle: Dict[int, int] = {}
    for item in items_input:
        id_det = item['id_detalle_compra']
        cant_rec = int(item['cantidad_recibida'])

        if id_det not in detalles_db:
            raise ValidationError(f"El renglón #{id_det} no corresponde a los detalles de la orden #{id_orden}.")

        if cant_rec < 0:
            raise ValidationError(f"La cantidad recibida para el renglón #{id_det} no puede ser negativa.")

        recibidos_por_detalle[id_det] = cant_rec

    # Evaluar faltantes/excedentes contra todos los renglones esperados
    for id_det, det in detalles_db.items():
        cant_esperada = det.cantidad
        cant_rec = recibidos_por_detalle.get(id_det, 0)

        if cant_rec < cant_esperada:
            es_entrega_parcial = True
        elif cant_rec > cant_esperada:
            hay_excedente = True
            if not confirmar_excedente:
                raise ValidationError(
                    {
                        "confirmar_excedente": (
                            "Está registrando un excedente de mercadería. El Total a Abonar aumentará. "
                            "Confirme para continuar."
                        )
                    },
                    code='requiere_confirmacion_excedente'
                )

    # Pasos 7 y 8: Impacto en Stock (inventory_app) y actualización de DetalleOrdenCompra
    fecha_hoy = timezone.now().date()
    for id_det, det in detalles_db.items():
        cant_rec = recibidos_por_detalle.get(id_det, 0)

        if cant_rec > 0:
            stock, _ = Stock.objects.get_or_create(
                id_producto=det.id_producto,
                defaults={'stock_minimo': 0}
            )
            MovimientoStock.objects.create(
                id_stock=stock,
                tipo_movimiento='compra',
                cantidad=cant_rec,
                fecha=fecha_hoy,
                motivo=f"Recepción Orden Compra #{orden.id_orden} - Remito {nro_remito}",
                uso_taller=bool(orden.sol_tec)
            )

        det.cantidad_recibida = cant_rec
        det.cantidad = cant_rec
        det.save()

    total_abonar = sum(
        Decimal(str(d.cantidad_recibida or 0)) * d.precio_unitario
        for d in detalles_db.values()
    )

    # Actualizar estado y fecha de recepción de la Orden de Compra
    orden.nro_remito = nro_remito
    orden.fecha_recepcion = fecha_hoy
    if es_entrega_parcial:
        orden.estado_orden = OrdenCompra.ESTADO_ENTREGADA_PARCIALMENTE
    else:
        orden.estado_orden = OrdenCompra.ESTADO_ENTREGADA
    orden.save()

    # Recalcular parámetros automáticos del Proveedor (Entrega Promedio y Confiabilidad)
    proveedor_oc = orden.cuit_prov
    if proveedor_oc:
        plazo_previo = proveedor_oc.tiempo_promedio_entrega if (proveedor_oc.tiempo_promedio_entrega and proveedor_oc.tiempo_promedio_entrega > 0) else 5
        dias_orden_actual = max(0, (fecha_hoy - orden.fecha_emision).days) if orden.fecha_emision else 0

        ordenes_concretadas = list(
            OrdenCompra.objects.filter(
                cuit_prov=proveedor_oc,
                estado_orden__in=[
                    OrdenCompra.ESTADO_ENTREGADA,
                    OrdenCompra.ESTADO_ENTREGADA_PARCIALMENTE
                ],
                fecha_recepcion__isnull=False
            )
        )
        total_concretadas = len(ordenes_concretadas)
        if total_concretadas > 0:
            suma_dias = sum(
                max(0, (o.fecha_recepcion - o.fecha_emision).days)
                for o in ordenes_concretadas
                if o.fecha_recepcion and o.fecha_emision
            )
            proveedor_oc.tiempo_promedio_entrega = int(round(suma_dias / total_concretadas))

        # Confiabilidad: Por defecto 60% hasta concretar como mínimo 5 órdenes de compra.
        # A partir de la 5ta orden, sube si entrega en tiempo y forma, y baja si se atrasa o entrega incompleto.
        if total_concretadas < 5:
            proveedor_oc.indice_confiabilidad = Decimal('60.00')
        else:
            base_conf = proveedor_oc.indice_confiabilidad
            if base_conf is None or base_conf <= Decimal('10.00'):
                base_conf = Decimal('60.00')
            entrega_en_tiempo_y_forma = (not es_entrega_parcial) and (dias_orden_actual <= plazo_previo)
            if entrega_en_tiempo_y_forma:
                proveedor_oc.indice_confiabilidad = min(Decimal('100.00'), base_conf + Decimal('5.00'))
            else:
                proveedor_oc.indice_confiabilidad = max(Decimal('0.00'), base_conf - Decimal('5.00'))

        proveedor_oc.save(update_fields=['tiempo_promedio_entrega', 'indice_confiabilidad'])

    # Paso 9: Reactividad Técnica (Lógica FIFO para reactivación de reparaciones y alerta al área técnica)
    reparaciones_reactivadas: List[int] = []
    if orden.sol_tec:
        from core_app.models import Notificacion
        from django.db.models import Q

        for id_det, det in detalles_db.items():
            cant_rec = recibidos_por_detalle.get(id_det, 0)
            if cant_rec <= 0:
                continue

            buffer_disponible = cant_rec
            reparaciones_espera = list(obtener_reparaciones_esperando_insumo_ordenadas(det.id_producto_id))

            for rep in reparaciones_espera:
                if buffer_disponible <= 0:
                    break

                # Cantidad requerida de este producto por la reparación
                cant_necesaria = sum(
                    d.cantidad for d in rep.detalleinsumoreparacion_set.filter(id_producto_id=det.id_producto_id)
                ) or 1

                if buffer_disponible >= cant_necesaria:
                    buffer_disponible -= cant_necesaria
                    rep.etapa = 'EN_REPARACION'
                    rep.save(update_fields=['etapa'])

                    BitacoraReparacion.objects.create(
                        id_reparacion=rep,
                        id_usuario=usuario_admin,
                        fecha_hora=timezone.now(),
                        estado_alcanzado=5,  # EN_REPARACION
                        comentario="Insumos recepcionados. Reparación reactivada automáticamente"
                    )
                    reparaciones_reactivadas.append(rep.id_reparacion)

        # Emitir alerta interna automática al personal del área técnica
        nombres_insumos_recibidos = ", ".join(
            f"{det.id_producto.nombre} (x{recibidos_por_detalle.get(id_det, 0)})"
            for id_det, det in detalles_db.items()
            if recibidos_por_detalle.get(id_det, 0) > 0 and det.id_producto
        )
        if nombres_insumos_recibidos:
            tecnicos_activos = Usuario.objects.filter(
                is_active=True
            ).filter(
                Q(id_rol__codigo__iexact='TECNICO')
                | Q(id_rol__nombre_rol__icontains='técnico')
                | Q(id_rol__nombre_rol__icontains='tecnico')
            )
            msg_alerta_tec = (
                f"Insumos técnicos recepcionados (Orden #{orden.id_orden} - Remito {nro_remito}): "
                f"{nombres_insumos_recibidos}. Ya se encuentran disponibles en stock para retomar reparaciones pausadas."
            )
            if reparaciones_reactivadas:
                ids_str = ", ".join(f"#{r}" for r in reparaciones_reactivadas)
                msg_alerta_tec += f" Reparaciones reactivadas automáticamente a 'En Reparación': {ids_str}."

            for tec in tecnicos_activos:
                Notificacion.objects.create(
                    id_usuario=tec,
                    mensaje=msg_alerta_tec[:1000],
                    tipo="TALLER_INSUMOS",
                    fecha_envio=fecha_hoy,
                    leida=False
                )

    # Paso 10: Auditoría en LogSistema
    email_admin = getattr(usuario_admin, 'email', str(usuario_admin))
    id_admin = getattr(usuario_admin, 'id_usuario', str(usuario_admin))
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Recepcionar Compra (CU-55)",
        detalle=(
            f"El admin {id_admin} ({email_admin}) recepcionó la orden #{orden.id_orden} "
            f"con remito {nro_remito}. Estado final: {orden.estado_nombre}. "
            f"Total abonar: ${total_abonar:.2f}. "
            f"Reactivaciones automáticas taller: {len(reparaciones_reactivadas)} reparaciones."
        )[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="purchases_app",
        tabla_afectada="orden_compra",
        id_registro_afectado=str(orden.id_orden),
        id_usuario=usuario_admin
    )

    orden.es_entrega_parcial = es_entrega_parcial
    orden.hay_excedente = hay_excedente
    orden.total_abonar = total_abonar
    orden.reparaciones_reactivadas = reparaciones_reactivadas
    return orden


# ==============================================================================
# CU-31: REGISTRAR COMPRA DIRECTA (SERVICES)
# ==============================================================================

@transaction.atomic
def registrar_compra_directa(
    *,
    usuario_admin: Usuario,
    datos_validados: Dict[str, Any]
) -> RegistroCompra:
    """
    CU-31: Registrar Compra.
    Permite asentar administrativamente la adquisición de artículos fuera del circuito
    automatizado de Órdenes de Compra, garantizando la trazabilidad del gasto y la responsabilidad
    del egreso en cabeza del administrador activo.

    Lógica de impacto en stock (Paso 7):
    - Si impacto_stock es True, invoca catalog_app.services.crear_producto_desde_compra_directa,
      obtiene el producto recién creado y lo enlaza al campo id_producto del registro.
    - Si es False, id_producto permanece en None y la bandera en False.

    Auditoría (Paso 8):
    - Registra asiento inmutable en LogSistema.
    """
    from catalog_app.services import crear_producto_desde_compra_directa

    # Validar rol de administrador
    rol = getattr(usuario_admin, 'id_rol', None) or getattr(usuario_admin, 'rol', None)
    codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
    nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
    if codigo_rol != 'ADMIN' and nombre_rol != 'administrador':
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Se requiere rol de Administrador para registrar una compra directa.")

    origen_vendedor = str(datos_validados['origen_vendedor']).strip()
    descripcion_articulo = str(datos_validados['descripcion_articulo']).strip()
    motivo = str(datos_validados['motivo']).strip()
    monto_pagado = Decimal(str(datos_validados['monto_pagado']))
    impacto_stock = bool(datos_validados.get('impacto_stock', False))
    cantidad = int(datos_validados.get('cantidad', 0) or 0)

    id_producto_generado = None

    # Paso 7: Evaluar directiva de impacto en stock
    if impacto_stock:
        precio_costo_unitario = (monto_pagado / Decimal(str(cantidad))) if cantidad > 0 else monto_pagado
        producto = crear_producto_desde_compra_directa(
            usuario_admin=usuario_admin,
            nombre=descripcion_articulo,
            descripcion=f"Ingreso por compra directa a {origen_vendedor}. Motivo: {motivo}",
            precio_costo=precio_costo_unitario,
            cantidad=cantidad
        )
        id_producto_generado = producto.id_producto

    # Paso 4 y 8: Instanciar y persistir RegistroCompra
    compra = RegistroCompra.objects.create(
        id_usuario=usuario_admin,
        origen_vendedor=origen_vendedor,
        descripcion_articulo=descripcion_articulo,
        motivo=motivo,
        monto_pagado=monto_pagado,
        fecha_compra=timezone.now().time(),
        impacto_stock=impacto_stock,
        id_producto_id=id_producto_generado
    )

    # Auditoría (Paso 8)
    id_admin = getattr(usuario_admin, 'id_usuario', str(usuario_admin))
    impacto_str = "Sí" if impacto_stock else "No"
    detalle_auditoria = (
        f"El admin {id_admin} registró una compra directa a {origen_vendedor} por el monto de ${monto_pagado}. "
        f"Impacto en stock: {impacto_str}."
    )
    if impacto_stock and id_producto_generado:
        detalle_auditoria += f" Producto generado ID: {id_producto_generado} ({cantidad} unidades)."

    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Registrar Compra Directa (CU-31)",
        detalle=detalle_auditoria[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="purchases_app",
        tabla_afectada="registro_compra",
        id_registro_afectado=str(compra.id_compra),
        id_usuario=usuario_admin
    )

    return compra


# ==============================================================================
# CU-37: AUDITORÍA DE FILTRADO DE ÓRDENES DE COMPRA (SERVICES)
# ==============================================================================

@transaction.atomic
def registrar_auditoria_filtro_ordenes_compra(
    *,
    usuario_admin: Usuario,
    filtros: Dict[str, Any],
    total_resultados: int
) -> Optional[LogSistema]:
    """
    CU-37: Registra la traza de auditoría en LogSistema sobre las consultas
    y filtros realizados en el módulo de órdenes de compra, condicionado al flag
    'log_operaciones_lectura' (desactivado por defecto).
    """
    from core_app.selectors import obtener_configuracion_bool
    if not obtener_configuracion_bool('log_operaciones_lectura'):
        return None

    criterios_activos = {
        k: str(v) for k, v in (filtros or {}).items()
        if v is not None and str(v).strip() != ''
    }
    resumen_criterios = (
        ", ".join(f"{k}={v}" for k, v in criterios_activos.items())
        if criterios_activos
        else "Sin filtros (listado general)"
    )
    detalle = (
        f"El administrador consultó y filtró órdenes de compra (CU-37). "
        f"Criterios: [{resumen_criterios}]. Coincidencias: {total_resultados}."
    )
    return LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Filtrar Órdenes de Compra (CU-37)",
        detalle=detalle[:1000],
        tipo="AUDITORIA",
        modulo_origen="purchases_app",
        tabla_afectada="orden_compra",
        id_registro_afectado=str(criterios_activos.get('id_orden', 'MULTI')),
        id_usuario=usuario_admin
    )




# ==============================================================================
# MOTOR AUTÓNOMO DE ABASTECIMIENTO INTELIGENTE (ORQUESTADOR CENTRAL)
# ==============================================================================

@transaction.atomic
def ejecutar_ciclo_abastecimiento_automatico(
    *,
    usuario_ejecutor: Optional[Usuario] = None,
    forzar_ejecucion: bool = False,
    origen_disparo: str = 'PROGRAMADO'
) -> Dict[str, Any]:
    """
    Motor Autónomo de Reabastecimiento e Inteligencia de Compras.
    Orquesta de extremo a extremo las fases del ciclo de abastecimiento:
      1. Auditoría de Incumplimientos (Protocolo de Tolerancia Acelerada en solTec vs Ordinarias).
      2. Detección de Faltantes y Stock en Tránsito (obtener_articulos_deficitarios_con_transito).
      3. Fase 1: Sondeo Selectivo Inteligente (CU-14) para insumos huérfanos sin ofertas vigentes.
      4. Fase 2 y 3: Algoritmo Multicriterio (CU-54), Emisión Legal Autónoma con ReportLab y Despacho de Correo.
      5. Integración con Urgencias de Taller (solTec=True) con resolución al instante si esperaUrgenciaTecnicaHoras == 0.
    """
    from datetime import timedelta
    from core_app.models import ConfiguracionSistema, LogSistema, Notificacion
    from purchases_app.selectors import (
        obtener_articulos_deficitarios_con_transito,
        obtener_proveedores_candidatos_para_cotizacion,
        calcular_mejores_ofertas
    )

    if usuario_ejecutor is None:
        usuario_ejecutor = Usuario.objects.filter(
            Q(id_rol__codigo='ADMIN') | Q(id_rol__nombre_rol__icontains='admin'),
            is_active=True
        ).first()
        if not usuario_ejecutor:
            usuario_ejecutor = Usuario.objects.filter(is_active=True).first()

    def _cfg_str(clave: str, default: str) -> str:
        cfg = ConfiguracionSistema.objects.filter(clave=clave).first()
        return str(cfg.valor).strip() if cfg and cfg.valor is not None else default

    def _cfg_int(clave: str, default: int) -> int:
        cfg = ConfiguracionSistema.objects.filter(clave=clave).first()
        try:
            return int(str(cfg.valor).strip()) if cfg and cfg.valor else default
        except (ValueError, TypeError):
            return default

    def _cfg_bool(clave: str, default: bool) -> bool:
        cfg = ConfiguracionSistema.objects.filter(clave=clave).first()
        if not cfg or cfg.valor is None:
            return default
        return str(cfg.valor).strip().lower() in ('true', '1', 't', 'yes', 'si')

    auto_activo = _cfg_bool('autoAbastecimientoActivo', True)
    if not auto_activo and not forzar_ejecucion:
        return {
            "status": "PAUSADO",
            "mensaje": "El motor de abastecimiento automático se encuentra desactivado globalmente.",
            "origen_disparo": origen_disparo
        }

    modo_disparador = _cfg_str('modoDisparadorAbastecimiento', 'HIBRIDO').upper()
    if not forzar_ejecucion:
        if origen_disparo == 'TRANSACCIONAL' and modo_disparador == 'PROGRAMADO':
            return {
                "status": "OMITIDO",
                "mensaje": "Modo configurado exclusivamente para rutinas programadas (Daemon/Cron).",
                "origen_disparo": origen_disparo
            }
        if origen_disparo == 'PROGRAMADO' and modo_disparador == 'TRANSACCIONAL':
            return {
                "status": "OMITIDO",
                "mensaje": "Modo configurado exclusivamente para eventos transaccionales.",
                "origen_disparo": origen_disparo
            }

    frecuencia_oc_dias = _cfg_int('frecuenciaGeneracionOC_dias', 5)
    espera_urgencia_horas = _cfg_int('esperaUrgenciaTecnicaHoras', 0)
    dias_espera_cotiz = _cfg_int('diasEsperaCotizacion', 5)
    dias_tol_com = _cfg_int('diasToleranciaIncumplimientoProveedor', 3)
    horas_tol_urg = _cfg_int('toleranciaHorasIncumplimientoUrgente', 24)

    hoy = timezone.now().date()

    # ==========================================================================
    # 1. PROTOCOLO DE INCUMPLIMIENTO DE PROVEEDORES (ÓRDENES DEMORADAS)
    # ==========================================================================
    ordenes_canceladas: List[Dict[str, Any]] = []
    ordenes_espera = OrdenCompra.objects.filter(
        estado_orden=OrdenCompra.ESTADO_ESPERANDO_ENTREGA
    ).select_related('cuit_prov')

    for ord_esp in ordenes_espera:
        prov = ord_esp.cuit_prov
        dias_promesa = prov.tiempo_promedio_entrega or 5

        if ord_esp.sol_tec:
            # Tolerancia urgente de taller (en horas)
            dias_extra = max(horas_tol_urg // 24, 1)
            limite_entrega = ord_esp.fecha_emision + timedelta(days=dias_promesa + dias_extra)
            penalizacion = Decimal('10.00')
            tipo_orden_str = "urgente de taller (solTec)"
        else:
            # Tolerancia comercial regular en días
            limite_entrega = ord_esp.fecha_emision + timedelta(days=dias_promesa + dias_tol_com)
            penalizacion = Decimal('5.00')
            tipo_orden_str = "comercial ordinaria"

        if hoy > limite_entrega:
            ord_esp.estado_orden = OrdenCompra.ESTADO_CANCELADA
            ord_esp.save(update_fields=['estado_orden'])

            base_conf = prov.indice_confiabilidad if prov.indice_confiabilidad is not None else Decimal('60.00')
            prov.indice_confiabilidad = max(Decimal('0.00'), base_conf - penalizacion)
            prov.save(update_fields=['indice_confiabilidad'])

            detalle_canc = (
                f"Orden de compra #{ord_esp.id_orden} ({tipo_orden_str}) cancelada por incumplimiento del proveedor "
                f"'{prov.nombre_proveedor}' (CUIT {prov.cuit_prov}). Superó fecha límite {limite_entrega}. "
                f"Penalización de confiabilidad aplicada: -{penalizacion} puntos."
            )
            LogSistema.objects.create(
                fecha_hora=timezone.now(),
                accion="Cancelación por Incumplimiento de Proveedor",
                detalle=detalle_canc[:1000],
                tipo="INCUMPLIMIENTO_COMPRAS",
                modulo_origen="purchases_app",
                tabla_afectada="orden_compra",
                id_registro_afectado=str(ord_esp.id_orden),
                id_usuario=usuario_ejecutor
            )

            if ord_esp.sol_tec:
                tecnicos_activos = Usuario.objects.filter(
                    is_active=True,
                    id_rol__codigo='TECNICO'
                )
                msg_alerta = (
                    f"Alerta de Abastecimiento: El proveedor '{prov.nombre_proveedor}' no entregó el pedido urgente #{ord_esp.id_orden}. "
                    f"La orden fue cancelada por incumplimiento y el sistema re-adjudicará los repuestos de inmediato."
                )
                for t in tecnicos_activos:
                    Notificacion.objects.create(
                        id_usuario=t,
                        mensaje=msg_alerta[:1000],
                        tipo="TALLER_INCUMPLIMIENTO_INSUMOS",
                        fecha_envio=hoy,
                        leida=False
                    )

            ordenes_canceladas.append({
                "id_orden": ord_esp.id_orden,
                "proveedor": prov.nombre_proveedor,
                "sol_tec": ord_esp.sol_tec,
                "motivo": "Superó fecha límite de entrega acordada"
            })

    # ==========================================================================
    # 2. AUDITORÍA DE FALTANTES Y DEMANDA TÉCNICA
    # ==========================================================================
    articulos_deficitarios = obtener_articulos_deficitarios_con_transito()
    if not articulos_deficitarios:
        LogSistema.objects.create(
            fecha_hora=timezone.now(),
            accion="Motor de Abastecimiento Automático",
            detalle=f"Ciclo ejecutado exitosamente ({origen_disparo}). Inventario saludable: 0 faltantes detectados.",
            tipo="ABASTECIMIENTO_MOTOR",
            modulo_origen="purchases_app",
            id_usuario=usuario_ejecutor
        )
        return {
            "status": "OK",
            "mensaje": "Inventario en niveles óptimos. No se detectaron insumos deficitarios.",
            "articulos_escaneados": 0,
            "ordenes_emitidas": [],
            "solicitudes_cotizacion": [],
            "ordenes_canceladas_por_incumplimiento": ordenes_canceladas,
            "origen_disparo": origen_disparo
        }

    # Separar insumos con cotización vigente vs huérfanos para sondeo
    items_con_cotizacion = [it for it in articulos_deficitarios if it['tiene_cotizacion_vigente']]
    items_huerfanos = [it for it in articulos_deficitarios if not it['tiene_cotizacion_vigente']]

    solicitudes_creadas: List[Dict[str, Any]] = []
    ordenes_emitidas: List[Dict[str, Any]] = []

    # ==========================================================================
    # 3. FASE 1: SONDEO SELECTIVO INTELIGENTE (CU-14)
    # ==========================================================================
    if items_huerfanos:
        candidatos_totales = set()
        for it in items_huerfanos:
            cands = obtener_proveedores_candidatos_para_cotizacion(it['id_producto'])
            for c in cands:
                candidatos_totales.add(c)

        if candidatos_totales:
            sol_tec_sondeo = any(it['es_urgencia_taller'] for it in items_huerfanos)
            solicitud = SolicitudCotizacion.objects.create(
                fecha_emision=hoy,
                estado_solicitud=SolicitudCotizacion.ESTADO_ENVIADA,
                sol_tec=sol_tec_sondeo
            )

            for it in items_huerfanos:
                SolicitudCotizacionProducto.objects.create(
                    id_solicitud=solicitud,
                    id_producto_id=it['id_producto'],
                    cantidad=it['cantidad_a_pedir']
                )

            for prov in candidatos_totales:
                token_acceso = secrets.token_urlsafe(32)
                invitacion = InvitacionCotizar.objects.create(
                    id_solicitud=solicitud,
                    cuit_prov=prov,
                    token_acceso=token_acceso,
                    estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE
                )
                cotizacion = Cotizacion.objects.create(
                    id_invitacion=invitacion,
                    tiempo_promesa=0,
                    estado_cotizacion=Cotizacion.ESTADO_PENDIENTE,
                    fecha_validez=hoy + timedelta(days=dias_espera_cotiz),
                    comentarios="Sondeo selectivo generado automáticamente por el Motor de Abastecimiento",
                    archivo_adjunto=None
                )
                despachar_correo_cotizacion(cotizacion=cotizacion, token_acceso=token_acceso)

            solicitudes_creadas.append({
                "id_solicitud": solicitud.id_solicitud,
                "sol_tec": solicitud.sol_tec,
                "items_solicitados": len(items_huerfanos),
                "proveedores_invitados": len(candidatos_totales)
            })

            LogSistema.objects.create(
                fecha_hora=timezone.now(),
                accion="Sondeo Automático de Cotización (CU-14)",
                detalle=(
                    f"El motor emitió la Solicitud #{solicitud.id_solicitud} para {len(items_huerfanos)} insumos huérfanos. "
                    f"Invitaciones despachadas a {len(candidatos_totales)} proveedores sin oferta activa para estos ítems. "
                    f"Urgencia técnica: {sol_tec_sondeo}."
                )[:1000],
                tipo="ABASTECIMIENTO_MOTOR",
                modulo_origen="purchases_app",
                tabla_afectada="solicitud_cotizacion",
                id_registro_afectado=str(solicitud.id_solicitud),
                id_usuario=usuario_ejecutor
            )

    # ==========================================================================
    # 4. FASE 2 Y 3: ALGORITMO MULTICRITERIO Y EMISIÓN AUTÓNOMA (CU-54)
    # ==========================================================================
    if items_con_cotizacion:
        hay_urgencia_taller = any(it['es_urgencia_taller'] for it in items_con_cotizacion)
        proceder_emision = False

        if hay_urgencia_taller and espera_urgencia_horas == 0:
            # Reabastecimiento urgente de taller al instante
            proceder_emision = True
        elif forzar_ejecucion:
            proceder_emision = True
        else:
            # Evaluar ventana de frecuencia para compras comerciales
            ultima_emision = OrdenCompra.objects.filter(
                sol_tec=False
            ).order_by('-id_orden').first()

            if not ultima_emision:
                proceder_emision = True
            else:
                dias_desde_ultima = (hoy - ultima_emision.fecha_emision).days
                if dias_desde_ultima >= frecuencia_oc_dias:
                    proceder_emision = True

        if proceder_emision:
            productos_para_ofertas = [
                {"id_producto": it["id_producto"], "cantidad": it["cantidad_a_pedir"]}
                for it in items_con_cotizacion
            ]
            resultado_ofertas = calcular_mejores_ofertas(
                productos_solicitados=productos_para_ofertas
            )
            borradores = resultado_ofertas.get('borradores', [])

            for b in borradores:
                ids_items_borrador = {it['id_producto'] for it in b.get('items', [])}
                b['sol_tec'] = any(
                    it['es_urgencia_taller']
                    for it in items_con_cotizacion
                    if it['id_producto'] in ids_items_borrador
                )

            if borradores:
                ordenes_emitidas_instancias = emitir_ordenes_compra(
                    usuario_admin=usuario_ejecutor,
                    borradores_aprobados=borradores
                )
                for o in ordenes_emitidas_instancias:
                    ordenes_emitidas.append({
                        "id_orden": o.id_orden,
                        "proveedor": o.cuit_prov.nombre_proveedor,
                        "sol_tec": o.sol_tec,
                        "total_items": o.detalles.count(),
                        "ruta_pdf": getattr(o, 'ruta_pdf', None)
                    })

    # ==========================================================================
    # 5. ASENTAMIENTO DE TRAZA Y NOTIFICACIÓN GERENCIAL
    # ==========================================================================
    resumen_detalle = (
        f"Motor de Abastecimiento ejecutado ({origen_disparo}). "
        f"Faltantes escaneados: {len(articulos_deficitarios)}. "
        f"Órdenes de compra emitidas: {len(ordenes_emitidas)}. "
        f"Sondeos de cotización despachados: {len(solicitudes_creadas)}. "
        f"Órdenes canceladas por incumplimiento: {len(ordenes_canceladas)}."
    )
    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Motor de Abastecimiento Automático",
        detalle=resumen_detalle[:1000],
        tipo="ABASTECIMIENTO_MOTOR",
        modulo_origen="purchases_app",
        id_usuario=usuario_ejecutor
    )

    if ordenes_emitidas or solicitudes_creadas or ordenes_canceladas:
        Notificacion.objects.create(
            id_usuario=usuario_ejecutor,
            mensaje=resumen_detalle[:1000],
            tipo="MOTOR_ABASTECIMIENTO",
            fecha_envio=hoy,
            leida=False
        )

    return {
        "status": "COMPLETADO",
        "mensaje": resumen_detalle,
        "articulos_escaneados": len(articulos_deficitarios),
        "ordenes_emitidas": ordenes_emitidas,
        "solicitudes_cotizacion": solicitudes_creadas,
        "ordenes_canceladas_por_incumplimiento": ordenes_canceladas,
        "origen_disparo": origen_disparo,
        "fecha_hora": timezone.now()
    }
