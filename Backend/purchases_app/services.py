import secrets
from typing import Dict, Any, Optional, List
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from django.core.files.storage import default_storage

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
        fecha_hora=timezone.now().time(),
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
        fecha_hora=timezone.now().time(),
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

def despachar_correo_cotizacion(*, cotizacion: Cotizacion, token_acceso: str) -> bool:
    """
    Función auxiliar (Stub) para simular el envío de correos electrónicos individuales
    a cada proveedor seleccionado con su token de acceso y enlace seguro (CU-14 Paso 10).
    """
    # En producción se conecta al dispatcher de correos (SMTP, SendGrid, etc.)
    return True


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
                fecha_validez=timezone.now().date() + timezone.timedelta(days=15),
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
        fecha_hora=timezone.now().time(),
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
                fecha_validez=timezone.now().date() + timezone.timedelta(days=15),
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
        fecha_hora=timezone.now().time(),
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
        fecha_hora=timezone.now().time(),
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
            fecha_hora=timezone.now().time(),
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
            fecha_hora=timezone.now().time(),
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
        fecha_hora=timezone.now().time(),
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

def generar_pdf_orden_compra(orden: OrdenCompra) -> str:
    """
    Función auxiliar (Stub) que genera el documento legal estructurado (PDF) de la Orden de Compra.
    Incluye datos institucionales del local (ConfiguracionSistema) y del proveedor adjudicado (Paso 7).
    """
    return f"ordenes_compra/orden_{orden.id_orden}_{orden.fecha_emision.strftime('%Y%m%d')}.pdf"


def despachar_correo_orden_compra(orden: OrdenCompra) -> bool:
    """
    Función auxiliar (Stub) que despacha formalmente el contrato y documento legal
    vía correo electrónico al proveedor seleccionado (Paso 8).
    """
    return True


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

        generar_pdf_orden_compra(orden)
        despachar_correo_orden_compra(orden)

        ordenes_creadas.append(orden)

    ids_str = ", ".join(f"#{o.id_orden}" for o in ordenes_creadas)
    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
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

    # Paso 9: Reactividad Técnica (Lógica FIFO para reactivación de reparaciones)
    reparaciones_reactivadas: List[int] = []
    if orden.sol_tec:
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
                        fecha_hora=timezone.now().time(),
                        estado_alcanzado=5,  # EN_REPARACION
                        comentario="Insumos recepcionados. Reparación reactivada automáticamente"
                    )
                    reparaciones_reactivadas.append(rep.id_reparacion)

    # Paso 10: Auditoría en LogSistema
    email_admin = getattr(usuario_admin, 'email', str(usuario_admin))
    id_admin = getattr(usuario_admin, 'id_usuario', str(usuario_admin))
    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
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
        fecha_hora=timezone.now().time(),
        accion="Registrar Compra Directa (CU-31)",
        detalle=detalle_auditoria[:1000],
        tipo="ADMINISTRACION",
        modulo_origen="purchases_app",
        tabla_afectada="registro_compra",
        id_registro_afectado=str(compra.id_compra),
        id_usuario=usuario_admin
    )

    return compra

