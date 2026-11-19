from typing import Any
from decimal import Decimal
import os
import logging
import secrets
import string
import uuid

logger = logging.getLogger(__name__)

from django.conf import settings
from django.utils import timezone as django_timezone
from django.db import transaction
from django.db.models import Avg
from rest_framework.exceptions import ValidationError, PermissionDenied
from workshop_app.models import Dispositivo, CategoriaReparacion, Reparacion, BitacoraReparacion, Calificacion
from users_app.models import Usuario
from catalog_app.models import ModeloDispositivo, Marca, TipoDispositivo
from core_app.models import LogSistema, Notificacion
from core_app.selectors import obtener_configuracion_bool, obtener_configuracion_int

UMBRAL_ACTIVACION_AUTOMATICA = 8


def normalizar_nombre(texto: str) -> str:
    """Elimina espacios redundantes de cadenas de texto."""
    if not texto:
        return ""
    return " ".join(texto.split()).strip()


def homologar_o_crear_catalogo_personalizado(
    *, 
    id_tipo: int = None, 
    nombre_tipo_otro: str = None, 
    id_marca: int = None, 
    nombre_marca_otro: str = None, 
    nombre_modelo_otro: str
) -> ModeloDispositivo:
    """
    Homologa o crea los registros de TipoDispositivo, Marca y ModeloDispositivo con estado_activo=False.
    Si ya existían previamente (case-insensitive), reutiliza los registros existentes para evitar duplicados.
    """
    # 1. Resolver Tipo de Dispositivo
    tipo = None
    if id_tipo:
        tipo = TipoDispositivo.objects.filter(pk=id_tipo).first()

    if not tipo and nombre_tipo_otro:
        nombre_t_norm = normalizar_nombre(nombre_tipo_otro)
        tipo = TipoDispositivo.objects.filter(nombre__iexact=nombre_t_norm).first()
        if not tipo:
            tipo = TipoDispositivo.objects.create(
                nombre=nombre_t_norm,
                estado_activo=False
            )

    # Fallback defensivo si no vino tipo: asignar o crear 'Dispositivo General'
    if not tipo:
        tipo = TipoDispositivo.objects.filter(nombre__iexact='Dispositivo General').first()
        if not tipo:
            tipo = TipoDispositivo.objects.create(
                nombre='Dispositivo General',
                estado_activo=True
            )

    # 2. Resolver Marca
    marca = None
    if id_marca:
        marca = Marca.objects.filter(pk=id_marca).first()

    if not marca and nombre_marca_otro:
        nombre_m_norm = normalizar_nombre(nombre_marca_otro)
        marca = Marca.objects.filter(nombre__iexact=nombre_m_norm).first()
        if not marca:
            marca = Marca.objects.create(
                nombre=nombre_m_norm,
                estado_activo=False
            )

    if not marca:
        raise ValidationError("No fue posible resolver la marca del dispositivo.")

    # 3. Resolver Modelo
    nombre_mod_norm = normalizar_nombre(nombre_modelo_otro)
    modelo = ModeloDispositivo.objects.filter(
        nombre__iexact=nombre_mod_norm,
        id_marca=marca,
        id_tipo_dispositivo=tipo
    ).first()

    if not modelo:
        modelo = ModeloDispositivo.objects.create(
            nombre=nombre_mod_norm,
            estado_activo=False,
            id_marca=marca,
            id_tipo_dispositivo=tipo
        )

    return modelo


def evaluar_y_promover_catalogo_8_usos(*, modelo: ModeloDispositivo, usuario_ejecutor: Usuario) -> None:
    """
    Regla de Inteligencia del Catálogo:
    Si un modelo, marca o tipo de dispositivo fue creado de forma manual (estado_activo=False)
    y alcanza un conteo acumulado de 8 o más dispositivos registrados en el sistema,
    se promueve automáticamente a estado_activo=True para que quede disponible en el catálogo
    público de toda la comunidad, registrando una traza de auditoría en LogSistema.
    """
    hora_actual = django_timezone.now()

    # 1. Evaluar Modelo
    if not modelo.estado_activo:
        usos_modelo = Dispositivo.objects.filter(id_modelo=modelo).count()
        if usos_modelo >= UMBRAL_ACTIVACION_AUTOMATICA:
            modelo.estado_activo = True
            modelo.save(update_fields=['estado_activo'])
            LogSistema.objects.create(
                fecha_hora=hora_actual,
                accion=f"Promoción automática de modelo {modelo.id_modelo}",
                detalle=f"El modelo '{modelo.nombre}' alcanzó {usos_modelo} usos y fue promovido automáticamente a activo en el catálogo oficial.",
                tipo="INFO",
                modulo_origen="workshop_app",
                tabla_afectada="modelo",
                id_registro_afectado=str(modelo.id_modelo),
                id_usuario=usuario_ejecutor
            )

    # 2. Evaluar Marca
    marca = modelo.id_marca
    if marca and not marca.estado_activo:
        usos_marca = Dispositivo.objects.filter(id_modelo__id_marca=marca).count()
        if usos_marca >= UMBRAL_ACTIVACION_AUTOMATICA:
            marca.estado_activo = True
            marca.save(update_fields=['estado_activo'])
            LogSistema.objects.create(
                fecha_hora=hora_actual,
                accion=f"Promoción automática de marca {marca.id_marca}",
                detalle=f"La marca '{marca.nombre}' alcanzó {usos_marca} usos acumulados y fue promovida automáticamente a activa en el catálogo oficial.",
                tipo="INFO",
                modulo_origen="workshop_app",
                tabla_afectada="marca",
                id_registro_afectado=str(marca.id_marca),
                id_usuario=usuario_ejecutor
            )

    # 3. Evaluar Tipo de Dispositivo
    tipo = modelo.id_tipo_dispositivo
    if tipo and not tipo.estado_activo:
        usos_tipo = Dispositivo.objects.filter(id_modelo__id_tipo_dispositivo=tipo).count()
        if usos_tipo >= UMBRAL_ACTIVACION_AUTOMATICA:
            tipo.estado_activo = True
            tipo.save(update_fields=['estado_activo'])
            LogSistema.objects.create(
                fecha_hora=hora_actual,
                accion=f"Promoción automática de tipo de dispositivo {tipo.id_tipo_dispositivo}",
                detalle=f"El tipo de dispositivo '{tipo.nombre}' alcanzó {usos_tipo} usos acumulados y fue promovido automáticamente a activo en el catálogo oficial.",
                tipo="INFO",
                modulo_origen="workshop_app",
                tabla_afectada="tipo_dispositivo",
                id_registro_afectado=str(tipo.id_tipo_dispositivo),
                id_usuario=usuario_ejecutor
            )


def validar_imagen_dispositivo(archivo) -> None:
    """Valida formato y peso de la imagen; lanza ValidationError con mensaje claro."""
    if not archivo or not hasattr(archivo, 'name'):
        return

    from core_app.selectors import obtener_extensiones_permitidas_archivos
    ext = os.path.splitext(archivo.name)[1].lower()
    formatos_permitidos = list(obtener_extensiones_permitidas_archivos(solo_imagenes=True))
    if ext not in formatos_permitidos:
        raise ValidationError(f"Formato de imagen no permitido. Solo se admiten: {', '.join(formatos_permitidos)}")

    from core_app.selectors import obtener_tamano_maximo_archivo_bytes, obtener_tamano_maximo_archivo_mb
    max_bytes = obtener_tamano_maximo_archivo_bytes()
    max_mb = obtener_tamano_maximo_archivo_mb()
    if hasattr(archivo, 'size') and archivo.size > max_bytes:
        raise ValidationError(f"El archivo de imagen supera el tamaño máximo permitido de {max_mb} MB.")


def guardar_archivo_imagen_dispositivo(*, archivo, id_propietario: int) -> str:
    """
    Valida y guarda un archivo binario de imagen para el dispositivo en MEDIA_ROOT/dispositivos.
    Retorna la URL relativa al archivo guardado.
    """
    if not archivo:
        return None

    validar_imagen_dispositivo(archivo)
    ext = os.path.splitext(archivo.name)[1].lower()

    carpeta_destino = os.path.join(settings.MEDIA_ROOT, 'dispositivos')
    os.makedirs(carpeta_destino, exist_ok=True)

    timestamp = int(django_timezone.now().timestamp())
    nombre_archivo = f"disp_u{id_propietario}_{timestamp}{ext}"
    ruta_completa = os.path.join(carpeta_destino, nombre_archivo)

    with open(ruta_completa, 'wb+') as destino:
        for chunk in archivo.chunks():
            destino.write(chunk)

    return f"/media/dispositivos/{nombre_archivo}"


@transaction.atomic
def registrar_dispositivo(*, usuario_ejecutor: Usuario, datos_validados: dict) -> Dispositivo:
    """
    CU-06: Registrar Dispositivo.
    Registra un nuevo equipo físico en el sistema para un cliente del taller.

    Regla de Negocio (Seguridad de Roles):
    - Si usuario_ejecutor.rol.codigo == 'CLIENTE', el sistema ignora/sobrescribe el id_cliente
      que venga en datos_validados y fuerza que el dueño del dispositivo sea el propio usuario_ejecutor.id.
    - Si es 'TECNICO' o 'ADMIN', se respeta el id_cliente validado en el payload.

    Catálogo Dinámico e Inteligencia:
    - Admite equipos existentes o la opción 'Otro' (Tipo, Marca, Modelo).
    - Homologa registros manuales en estado inactivo.
    - Promueve automáticamente a activo cuando alcanzan 8 dispositivos registrados.

    Auditoría Estricta:
    - Genera un LogSistema (módulo core_app) indicando el ID del dispositivo creado,
      la tabla afectada ('dispositivo') y el usuario_ejecutor de la acción.
    """
    if not usuario_ejecutor:
        raise ValidationError("No se pudo identificar al usuario ejecutor de la acción.")

    # 0. Validar la imagen antes de crear cualquier registro de catálogo
    validar_imagen_dispositivo(datos_validados.get('imagen'))

    # 1. Determinar el rol del usuario ejecutor
    rol_codigo = ''
    if hasattr(usuario_ejecutor, 'rol') and usuario_ejecutor.rol and hasattr(usuario_ejecutor.rol, 'codigo'):
        rol_codigo = (usuario_ejecutor.rol.codigo or '').upper()
    elif hasattr(usuario_ejecutor, 'id_rol') and usuario_ejecutor.id_rol and hasattr(usuario_ejecutor.id_rol, 'codigo'):
        rol_codigo = (usuario_ejecutor.id_rol.codigo or '').upper()

    # 2. Aplicar regla de roles para el dueño del dispositivo
    if rol_codigo == 'CLIENTE':
        id_cliente_final = usuario_ejecutor.id_usuario
    else:
        id_cliente_final = datos_validados.get('id_cliente') or datos_validados.get('id_usuario')
        if not id_cliente_final:
            id_cliente_final = usuario_ejecutor.id_usuario

    cliente = Usuario.objects.select_related('id_rol').filter(pk=id_cliente_final).first()
    if not cliente:
        raise ValidationError("El cliente especificado no existe.")

    # Regla de negocio: un dispositivo solo puede pertenecer a una cuenta con rol Cliente
    rol_cliente_codigo = (getattr(getattr(cliente, 'id_rol', None), 'codigo', '') or '').upper()
    rol_cliente_nombre = (getattr(getattr(cliente, 'id_rol', None), 'nombre_rol', '') or '').lower()
    if rol_cliente_codigo != 'CLIENTE' and rol_cliente_nombre != 'cliente':
        raise ValidationError("Solo se pueden registrar dispositivos a cuentas con rol de Cliente.")

    # 3. Validar modelo de dispositivo (Estándar o Manual 'Otro')
    es_otro = datos_validados.get('es_otro', False) or bool(datos_validados.get('nombre_modelo_otro'))
    if es_otro:
        modelo = homologar_o_crear_catalogo_personalizado(
            id_tipo=datos_validados.get('id_tipo'),
            nombre_tipo_otro=datos_validados.get('nombre_tipo_otro'),
            id_marca=datos_validados.get('id_marca'),
            nombre_marca_otro=datos_validados.get('nombre_marca_otro'),
            nombre_modelo_otro=datos_validados.get('nombre_modelo_otro')
        )
    else:
        id_modelo = datos_validados.get('id_modelo')
        modelo = ModeloDispositivo.objects.filter(pk=id_modelo).first()
        if not modelo:
            raise ValidationError("El modelo de dispositivo especificado no existe.")

    # 4. Normalizar número de serie / IMEI
    nro_serie = datos_validados.get('nro_serie') or datos_validados.get('numero_serie')
    if nro_serie is not None:
        nro_serie = str(nro_serie).strip() or None

    # 5. Gestionar imagen (archivo binario multipart o URL string)
    imagen_data = datos_validados.get('imagen')
    url_imagen = None
    if imagen_data:
        if hasattr(imagen_data, 'chunks') or hasattr(imagen_data, 'read'):
            url_imagen = guardar_archivo_imagen_dispositivo(archivo=imagen_data, id_propietario=cliente.id_usuario)
        elif isinstance(imagen_data, str) and imagen_data.strip():
            url_imagen = imagen_data.strip()

    # 6. Crear el registro en base de datos
    fecha_actual = django_timezone.now().date()
    dispositivo = Dispositivo.objects.create(
        id_usuario=cliente,
        id_modelo=modelo,
        numero_serie=nro_serie,
        imagen=url_imagen,
        fecha_registro=fecha_actual
    )

    # 7. Evaluación de Inteligencia de Catálogo (Regla de los 8 usos)
    evaluar_y_promover_catalogo_8_usos(modelo=modelo, usuario_ejecutor=usuario_ejecutor)

    # 8. Auditoría Estricta en LogSistema
    hora_actual = django_timezone.now()
    LogSistema.objects.create(
        fecha_hora=hora_actual,
        accion=f"Alta de dispositivo {dispositivo.id_dispositivo}",
        detalle=f"Dispositivo registrado para cliente ID {cliente.id_usuario} (Modelo: {modelo.nombre}, Serie: {nro_serie or 'Sin registrar'}).",
        tipo="INFO",
        modulo_origen="workshop_app",
        tabla_afectada="dispositivo",
        id_registro_afectado=str(dispositivo.id_dispositivo),
        id_usuario=usuario_ejecutor
    )

    return dispositivo


def crear_dispositivo(
    *, 
    id_ejecutor: int, 
    id_usuario: int, 
    id_modelo: int, 
    numero_serie: str = None, 
    imagen: str = None
) -> Dispositivo:
    """
    Función de compatibilidad histórica para llamadas existentes.
    """
    ejecutor = Usuario.objects.filter(pk=id_ejecutor).first()
    if not ejecutor:
        raise ValidationError("El usuario ejecutor de la acción no existe.")
    return registrar_dispositivo(
        usuario_ejecutor=ejecutor,
        datos_validados={
            'id_cliente': id_usuario,
            'id_modelo': id_modelo,
            'nro_serie': numero_serie,
            'imagen': imagen
        }
    )


@transaction.atomic
def editar_dispositivo_cliente(*, usuario_cliente: Usuario, id_dispositivo: int, datos_validados: dict) -> Dispositivo:
    """
    CU-07: Editar Dispositivo (autogestión del Cliente).

    - Valida propiedad del equipo (PermissionDenied si no es suyo).
    - Bloquea la edición si posee historial de reparaciones (auditoría).
    - Actualiza solo nro_serie, imagen, marca/modelo y registra LogSistema.
    """
    from rest_framework.exceptions import PermissionDenied
    from workshop_app.selectors import dispositivo_tiene_reparaciones

    dispositivo = Dispositivo.objects.select_for_update().filter(pk=id_dispositivo).first()
    if not dispositivo:
        raise ValidationError("El dispositivo especificado no existe.")

    if dispositivo.id_usuario_id != usuario_cliente.id_usuario:
        raise PermissionDenied("No tienes permisos sobre este equipo")

    if dispositivo_tiene_reparaciones(id_dispositivo):
        raise ValidationError("El equipo posee historial técnico y no puede ser alterado por normativas de auditoría")

    campos = []
    if 'id_modelo' in datos_validados:
        modelo = ModeloDispositivo.objects.filter(pk=datos_validados['id_modelo']).first()
        if not modelo:
            raise ValidationError("El modelo de dispositivo especificado no existe.")
        if 'id_marca' in datos_validados and modelo.id_marca_id != datos_validados['id_marca']:
            raise ValidationError("El modelo no pertenece a la marca seleccionada.")
        dispositivo.id_modelo = modelo
        campos.append('id_modelo')

    if 'nro_serie' in datos_validados:
        nro_serie = datos_validados['nro_serie']
        dispositivo.numero_serie = (str(nro_serie).strip() or None) if nro_serie is not None else None
        campos.append('numero_serie')

    if 'imagen' in datos_validados:
        imagen = datos_validados['imagen']
        if imagen and (hasattr(imagen, 'chunks') or hasattr(imagen, 'read')):
            dispositivo.imagen = guardar_archivo_imagen_dispositivo(
                archivo=imagen, id_propietario=usuario_cliente.id_usuario
            )
        elif isinstance(imagen, str) and imagen.strip():
            dispositivo.imagen = imagen.strip()
        else:
            dispositivo.imagen = None
        campos.append('imagen')

    dispositivo.save(update_fields=campos or None)

    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion=f"Edición de dispositivo {dispositivo.id_dispositivo}",
        detalle=f"El cliente ID {usuario_cliente.id_usuario} modificó su dispositivo (campos: {', '.join(campos) or 'ninguno'}).",
        tipo="INFO",
        modulo_origen="workshop_app",
        tabla_afectada="dispositivo",
        id_registro_afectado=str(dispositivo.id_dispositivo),
        id_usuario=usuario_cliente
    )

    return dispositivo


# ==============================================================================
# GESTIÓN DE CATEGORÍAS DE REPARACIÓN (CU-62, CU-63)
# ==============================================================================

@transaction.atomic
def crear_categoria_reparacion(
    *,
    usuario_admin: Usuario,
    nombre: str
) -> CategoriaReparacion:
    """
    CU-62: Crear Categoría de Reparación.
    Instancia y guarda un nuevo registro de CategoriaReparacion con estado_activo = True,
    generando la correspondiente traza de auditoría en LogSistema.
    """
    nombre_limpio = normalizar_nombre(nombre)

    categoria = CategoriaReparacion.objects.create(
        nombre=nombre_limpio,
        estado_activo=True
    )

    email_admin = getattr(usuario_admin, 'email', str(usuario_admin))
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Alta de Categoría de Reparación (CU-62)",
        detalle=f"Alta de categoría de reparación '{categoria.nombre}' (ID: {categoria.id_categoria}) por {email_admin}.",
        tipo="AUDITORIA_TALLER",
        modulo_origen="workshop_app",
        tabla_afectada="categoria_reparacion",
        id_registro_afectado=str(categoria.id_categoria),
        id_usuario=usuario_admin
    )

    return categoria


@transaction.atomic
def cambiar_estado_categoria_reparacion(
    *,
    usuario_admin: Usuario,
    id_categoria: int
) -> CategoriaReparacion:
    """
    CU-63: Cambiar Estado de Categoría de Reparación.
    Recupera la categoría por su ID, invierte el valor de estado_activo (Soft Delete / Restauración),
    guarda en base de datos y genera el LogSistema documentando el cambio de estado.
    """
    from workshop_app.selectors import obtener_categoria_reparacion

    categoria = obtener_categoria_reparacion(id_categoria)

    # Invertir el valor de estado_activo
    categoria.estado_activo = not categoria.estado_activo
    categoria.save(update_fields=['estado_activo'])

    operacion = "Restauración (Activo)" if categoria.estado_activo else "Soft Delete (Inactivo)"
    email_admin = getattr(usuario_admin, 'email', str(usuario_admin))

    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Cambio de Estado de Categoría de Reparación (CU-63)",
        detalle=f"Cambio de estado de categoría de reparación '{categoria.nombre}' (ID: {categoria.id_categoria}) a {operacion} por {email_admin}.",
        tipo="AUDITORIA_TALLER",
        modulo_origen="workshop_app",
        tabla_afectada="categoria_reparacion",
        id_registro_afectado=str(categoria.id_categoria),
        id_usuario=usuario_admin
    )

    return categoria


# ==============================================================================
# CU-26: INICIAR REPARACIÓN (CAPA DE ESCRITURA Y TRANSACCIONES)
# ==============================================================================

def _obtener_codigo_rol_usuario(usuario: Usuario) -> str:
    rol = getattr(usuario, 'id_rol', None) or getattr(usuario, 'rol', None)
    return (getattr(rol, 'codigo', '') or '').upper()


def generar_codigo_seguridad_reparacion(longitud: int = 6) -> str:
    """Genera un token alfanumérico en mayúsculas de longitud específica."""
    caracteres = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(caracteres) for _ in range(longitud))


def generar_y_enviar_remito_ingreso(reparacion: Reparacion) -> None:
    """
    CU-26: Genera los datos consolidados de la Orden de Servicio (Remito de Ingreso)
    y despacha la notificación por correo al cliente con copia a la casilla corporativa del taller.
    """
    try:
        from core_app.services import registrar_y_enviar_notificacion_correo

        dispositivo = reparacion.id_dispositivo
        cliente = dispositivo.id_usuario
        perfil = getattr(cliente, 'perfilusuario', None)
        nombre_cliente = f"{getattr(perfil, 'nombre', '')} {getattr(perfil, 'apellido', '')}".strip() or cliente.email

        modelo = getattr(dispositivo, 'id_modelo', None)
        nombre_modelo = getattr(modelo, 'nombre', 'N/D')
        nombre_marca = getattr(getattr(modelo, 'id_marca', None), 'nombre', 'N/D')
        nombre_tipo = getattr(getattr(modelo, 'id_tipo_dispositivo', None), 'nombre', 'N/D')

        from core_app.selectors import obtener_url_frontend

        url_frontend = obtener_url_frontend()
        url_reparacion = f"{url_frontend}/cliente/reparaciones/{reparacion.id_reparacion}"

        venta = reparacion.id_venta
        monto_diag_str = f"${venta.monto_subtotal:,.2f}" if (venta and venta.monto_subtotal) else "$5,000.00"
        esta_pendiente_pago = (not venta) or str(venta.estado_venta).upper() == 'PENDIENTE'

        if esta_pendiente_pago:
            indicacion_pago_txt = (
                f"- Diagnóstico Técnico: {monto_diag_str} (Pendiente de cobro en mostrador)\n"
                f"- Importante: Debe asistir con su DNI y abonar el costo del diagnóstico para iniciar el proceso.\n"
            )
            indicacion_pago_html = (
                f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Costo Diagnóstico:</strong></td>"
                f"<td style='padding: 8px; border-bottom: 1px solid #eee;'><span style='color: #d97706; font-weight: bold;'>{monto_diag_str} (Pendiente de pago)</span></td></tr>"
                f"<tr><td colspan='2' style='padding: 10px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; color: #b45309; font-size: 13px; font-weight: bold;'>"
                f"Debe asistir con su DNI y abonar el costo del diagnóstico para iniciar el proceso.</td></tr>"
            )
            mensaje_campana = (
                f"Nueva orden de servicio generada para su dispositivo ({nombre_marca} {nombre_modelo}). "
                f"Código de seguridad: {reparacion.codigo_sec}. Debe asistir con su DNI y abonar el costo del diagnóstico para iniciar el proceso."
            )
        else:
            indicacion_pago_txt = f"- Diagnóstico Técnico: {monto_diag_str} (Abonado online exitosamente)\n"
            indicacion_pago_html = (
                f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Costo Diagnóstico:</strong></td>"
                f"<td style='padding: 8px; border-bottom: 1px solid #eee;'><span style='color: #10b981; font-weight: bold;'>{monto_diag_str} (Abonado Online)</span></td></tr>"
            )
            mensaje_campana = (
                f"Nueva orden de servicio generada para su dispositivo ({nombre_marca} {nombre_modelo}). "
                f"Código de seguridad: {reparacion.codigo_sec}. Diagnóstico abonado online exitosamente."
            )

        asunto = f"Orden de Servicio ({nombre_marca} {nombre_modelo}) - Ingreso de Reparación (IFixPos)"
        cuerpo_texto = (
            f"Estimado/a {nombre_cliente},\n\n"
            f"Se ha iniciado formalmente la Orden de Servicio para su equipo ({nombre_marca} {nombre_modelo}).\n\n"
            f"Detalles del Ingreso:\n"
            f"- Dispositivo: {nombre_tipo} {nombre_marca} {nombre_modelo}\n"
            f"- N. Serie: {dispositivo.numero_serie or 'Sin registrar'}\n"
            f"- Estado Inicial: {reparacion.etapa}\n"
            f"- Código de Seguridad / Token: {reparacion.codigo_sec}\n"
            f"- Problema Informado: {reparacion.desc_cliente}\n"
            f"{indicacion_pago_txt}\n"
            f"Presente el código de seguridad '{reparacion.codigo_sec}' en el mostrador del taller para confirmar la entrega física del equipo.\n\n"
            f"Acceda a los detalles y seguimiento en línea de su reparación aquí:\n"
            f"{url_reparacion}\n\n"
            f"IFixPos - Taller de Reparaciones"
        )

        cuerpo_html = (
            f"<div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;'>"
            f"<h2 style='color: #06b6d4;'>IFixPos - Orden de Servicio ({nombre_marca} {nombre_modelo})</h2>"
            f"<p>Estimado/a <strong>{nombre_cliente}</strong>,</p>"
            f"<p>Confirmamos la apertura del servicio técnico para su dispositivo:</p>"
            f"<table style='width: 100%; border-collapse: collapse; margin-bottom: 20px;'>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Equipo:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{nombre_tipo} {nombre_marca} {nombre_modelo}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>N. Serie:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{dispositivo.numero_serie or 'Sin registrar'}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Estado:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{reparacion.etapa}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Código de Seguridad:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'><span style='background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-weight: bold;'>{reparacion.codigo_sec}</span></td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Descripción:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{reparacion.desc_cliente}</td></tr>"
            f"{indicacion_pago_html}"
            f"</table>"
            f"<p style='color: #64748b; font-size: 13px;'>Presente su código de seguridad '{reparacion.codigo_sec}' en el mostrador físico del taller al entregar su equipo.</p>"
            f"<div style='margin: 24px 0; text-align: center;'>"
            f"<a href='{url_reparacion}' style='background-color: #06b6d4; color: #0f172a; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;'>Ver Reparación y Seguimiento</a>"
            f"</div>"
            f"<p style='color: #64748b; font-size: 12px; text-align: center;'>Enlace directo: <a href='{url_reparacion}' style='color: #06b6d4;'>{url_reparacion}</a></p>"
            f"</div>"
        )

        registrar_y_enviar_notificacion_correo(
            usuario=cliente,
            asunto=asunto,
            cuerpo_texto=cuerpo_texto,
            tipo_notificacion="REPARACION",
            cuerpo_html=cuerpo_html,
            mensaje_notificacion=mensaje_campana,
            codigo_sensible=reparacion.codigo_sec,
            dispositivo=dispositivo,
            adjuntar_logo=True
        )
    except Exception as e:
        logger.warning("[CU-26 Remito] Advertencia al generar o despachar remito: %s", e)


from workshop_app.services_metricas import seleccionar_mejor_tecnico_para_reparacion  # noqa: E402, F401


@transaction.atomic
def iniciar_reparacion(
    *,
    usuario_ejecutor: Usuario,
    datos_validados: dict
) -> Reparacion:
    """
    CU-26: Iniciar Reparación.
    Permite a un Cliente, Técnico o Administrador instanciar una nueva orden de servicio
    para un dispositivo empadronado.
    """
    from workshop_app.selectors import dispositivo_tiene_reparacion_activa, obtener_dispositivo_por_id

    id_dispositivo = datos_validados['id_dispositivo']

    # Paso 1: Validación de Disponibilidad
    if dispositivo_tiene_reparacion_activa(id_dispositivo):
        raise ValidationError("El dispositivo seleccionado ya posee una reparación en curso.")

    dispositivo = obtener_dispositivo_por_id(id_dispositivo)
    if not dispositivo:
        raise ValidationError("El dispositivo seleccionado no existe.")

    # Paso 2: Validación de Propiedad para Clientes
    codigo_rol = _obtener_codigo_rol_usuario(usuario_ejecutor)
    if codigo_rol == 'CLIENTE':
        if dispositivo.id_usuario_id != usuario_ejecutor.id_usuario:
            raise PermissionDenied("No tiene permiso para iniciar una reparación sobre un dispositivo que no le pertenece.")

    # Paso 3: Lógica de Estado inicial según el rol
    if codigo_rol == 'CLIENTE':
        estado_inicial = 'ESPERANDO_DISPOSITIVO'
        estado_alcanzado_int = 1
    else:
        estado_inicial = 'ESPERANDO_DIAGNOSTICO'
        estado_alcanzado_int = 2

    # Paso 4: Generación de Código de Seguridad
    codigo_seguridad = generar_codigo_seguridad_reparacion(6)

    # Paso 5: Creación e instanciación de la Reparación
    reparacion = Reparacion.objects.create(
        fecha_inicio=django_timezone.now().date(),
        hora_recepcion=django_timezone.now().time(),
        etapa=estado_inicial,
        codigo_sec=codigo_seguridad,
        desc_cliente=datos_validados['descripcion_problema'],
        credencial_acceso=datos_validados['credencial_acceso'],
        id_dispositivo=dispositivo,
        id_usuario=usuario_ejecutor
    )

    # Paso 6: Relación M2M con Categorías de Reparación
    ids_categorias = datos_validados.get('ids_categorias', [])
    reparacion.categorias.set(ids_categorias)

    # Paso 6.1: Algoritmo Inteligente de Asignación a Técnico (Asignación única al inicio)
    auto_asignar = obtener_configuracion_bool('autoAsignacionTecnicosActiva')
    tecnico_asignado = None
    detalle_asignacion = None

    if auto_asignar:
        tecnico_asignado, detalle_asignacion = seleccionar_mejor_tecnico_para_reparacion(reparacion=reparacion)
        if tecnico_asignado:
            reparacion.id_usuario = tecnico_asignado
            reparacion.save(update_fields=['id_usuario'])

    # Paso 7: Registro en Bitácora Técnica estructurado por ítems
    lineas_apertura = [
        f"Proceso inicializado: Apertura de orden de servicio.",
        f"Estado inicial: '{reparacion.etapa}'."
    ]
    if tecnico_asignado:
        lineas_apertura.append(f"Técnico asignado: {tecnico_asignado.email}.")
    comentario_apertura = "\n".join(lineas_apertura)

    BitacoraReparacion.objects.create(
        id_reparacion=reparacion,
        id_usuario=usuario_ejecutor,
        fecha_hora=django_timezone.now(),
        estado_alcanzado=estado_alcanzado_int,
        comentario=comentario_apertura
    )

    if tecnico_asignado:
        try:
            nombre_equipo = dispositivo.id_modelo.nombre if dispositivo.id_modelo else "Dispositivo"
            Notificacion.objects.create(
                mensaje=f"Se te ha asignado la nueva reparación #{reparacion.id_reparacion} ({nombre_equipo}) mediante el algoritmo inteligente de taller.",
                tipo="ASIGNACION_REPARACION",
                fecha_envio=django_timezone.now().date(),
                leida=False,
                id_usuario=tecnico_asignado,
                id_dispositivo=dispositivo
            )
        except Exception as e:
            logger.warning("[Notificación Asignación CU-26] Advertencia: %s", e)

    # Paso 7.1: Cobro por Adelantado / Deuda de Diagnóstico Técnico (CU-26)
    # Regla de Negocio: El diagnóstico se cobra UNA SOLA VEZ por ciclo de reparación.
    from core_app.selectors import obtener_costo_diagnostico_base
    from sales_app.models import Venta, Pago, MedioPago

    costo_diag = obtener_costo_diagnostico_base()
    medio_pago_raw = str(datos_validados.get('medio_pago') or 'PRESENCIAL').strip()
    medio_pago_upper = medio_pago_raw.upper()
    id_pago_online = str(datos_validados.get('id_pago_online') or '').strip()

    from core_app.constantes import CodigoMedioPago, deducir_codigo_medio_pago
    medio_obj = None
    if medio_pago_raw.isdigit():
        medio_obj = MedioPago.objects.filter(id_mediopago=int(medio_pago_raw)).first()
    if not medio_obj:
        medio_obj = (
            MedioPago.objects.filter(nombre_medio_pago__iexact=medio_pago_raw).first()
            or MedioPago.objects.filter(codigo__iexact=medio_pago_raw).first()
        )
    if not medio_obj:
        codigo_deducido = (
            CodigoMedioPago.EFECTIVO
            if medio_pago_upper in ('PRESENCIAL', 'MOSTRADOR', 'EFECTIVO')
            else deducir_codigo_medio_pago(medio_pago_raw)
        )
        medio_obj = MedioPago.objects.filter(codigo=codigo_deducido).first()

    es_canal_online = (
        medio_pago_upper in ['MERCADOPAGO', 'MP', 'QR', 'ONLINE', 'TRANSFERENCIA']
        or (medio_obj and (medio_obj.codigo or '').upper() in [CodigoMedioPago.MERCADO_PAGO, CodigoMedioPago.TRANSFERENCIA])
    )
    es_pago_online_inmediato = es_canal_online and bool(id_pago_online)

    estado_venta_inicial = 'PAGADA' if es_pago_online_inmediato else 'PENDIENTE'

    # Cliente titular de la cuenta contable es el dueño del dispositivo
    cliente_titular = dispositivo.id_usuario

    venta_diag = Venta.objects.create(
        id_usuario=cliente_titular,
        metodo_entrega='PRESENCIAL',
        fecha_venta=django_timezone.now().date(),
        estado_venta=estado_venta_inicial,
        codigo_sec=codigo_seguridad,
        monto_subtotal=costo_diag,
        costo_envio=Decimal('0.00'),
        id_direccion_envio=None
    )
    reparacion.id_venta = venta_diag
    reparacion.save(update_fields=['id_venta'])

    if not medio_obj:
        es_mp = medio_pago_upper in ['MERCADOPAGO', 'MP', 'QR', 'ONLINE']
        codigo_fallback = CodigoMedioPago.MERCADO_PAGO if es_mp else CodigoMedioPago.EFECTIVO
        nombre_fallback = 'MERCADO PAGO' if es_mp else 'EFECTIVO'
        medio_obj = (
            MedioPago.objects.filter(codigo=codigo_fallback).first()
            or MedioPago.objects.filter(estado=True).first()
            or MedioPago.objects.create(
                codigo=codigo_fallback,
                nombre_medio_pago=nombre_fallback,
                estado=True,
                recargo=Decimal('0.00')
            )
        )

    if es_pago_online_inmediato:
        Pago.objects.create(
            id_venta=venta_diag,
            medio_pago=medio_obj,
            monto_pagado=costo_diag,
            fecha_pago=django_timezone.now().date(),
            detalle=f"Abono de diagnóstico inicial para reparación #{reparacion.id_reparacion}",
            cod_operacion=id_pago_online or f"MP-{codigo_seguridad}"
        )

    # Paso 8: Auditoría y Despacho de Remito de Ingreso
    email_ejecutor = getattr(usuario_ejecutor, 'email', str(usuario_ejecutor))
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Apertura de orden de servicio (CU-26)",
        detalle=(
            f"Reparación #{reparacion.id_reparacion} iniciada por {email_ejecutor} "
            f"para dispositivo ID {dispositivo.id_dispositivo} en estado '{estado_inicial}' "
            f"con código de seguridad {codigo_seguridad}."
        ),
        tipo="INFO",
        modulo_origen="workshop_app",
        tabla_afectada="reparacion",
        id_registro_afectado=str(reparacion.id_reparacion),
        id_usuario=usuario_ejecutor
    )

    generar_y_enviar_remito_ingreso(reparacion)

    return reparacion


# ==============================================================================
# CU-45: RECEPCIONAR DISPOSITIVO (CAPA DE ESCRITURA Y TRANSACCIONES)
# ==============================================================================

def generar_y_enviar_comprobante_recepcion(reparacion: Reparacion, observaciones_fisicas: str = '') -> None:
    """
    CU-45 (Paso 7): Genera los datos consolidados del comprobante de recepción física
    detallando los problemas funcionales y el estado físico del equipo, despachando
    la notificación por correo electrónico al cliente.
    """
    try:
        from core_app.services import registrar_y_enviar_notificacion_correo

        dispositivo = reparacion.id_dispositivo
        cliente = dispositivo.id_usuario
        perfil = getattr(cliente, 'perfilusuario', None)
        nombre_cliente = f"{getattr(perfil, 'nombre', '')} {getattr(perfil, 'apellido', '')}".strip() or cliente.email

        modelo = getattr(dispositivo, 'id_modelo', None)
        nombre_modelo = getattr(modelo, 'nombre', 'N/D')
        nombre_marca = getattr(getattr(modelo, 'id_marca', None), 'nombre', 'N/D')
        nombre_tipo = getattr(getattr(modelo, 'id_tipo_dispositivo', None), 'nombre', 'N/D')

        obs_texto = observaciones_fisicas or 'Sin observaciones registradas'

        from core_app.selectors import obtener_url_frontend

        url_frontend = obtener_url_frontend()
        url_reparacion = f"{url_frontend}/cliente/reparaciones/{reparacion.id_reparacion}"

        asunto = f"Comprobante de Recepción Física - {nombre_marca} {nombre_modelo} (IFixPos)"
        cuerpo_texto = (
            f"Estimado/a {nombre_cliente},\n\n"
            f"Confirmamos la recepción física de su equipo ({nombre_marca} {nombre_modelo}) en nuestro mostrador.\n\n"
            f"Detalles de la Recepción:\n"
            f"- Dispositivo: {nombre_tipo} {nombre_marca} {nombre_modelo}\n"
            f"- N. Serie: {dispositivo.numero_serie or 'Sin registrar'}\n"
            f"- Estado Actual: Esperando Diagnóstico\n"
            f"- Código de Servicio: {reparacion.codigo_sec}\n"
            f"- Problemas Reportados: {reparacion.desc_cliente}\n"
            f"- Estado Estético / Observaciones Físicas: {obs_texto}\n\n"
            f"Su dispositivo ha ingresado formalmente a la fila de diagnóstico técnico. Le notificaremos a la brevedad.\n\n"
            f"Consulte el avance y estado de su reparación en:\n"
            f"{url_reparacion}\n\n"
            f"IFixPos - Taller de Reparaciones"
        )

        cuerpo_html = (
            f"<div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;'>"
            f"<h2 style='color: #06b6d4;'>IFixPos - Comprobante de Recepción Física</h2>"
            f"<p>Estimado/a <strong>{nombre_cliente}</strong>,</p>"
            f"<p>Su equipo ha sido recibido en el mostrador del taller y ha pasado a la etapa de <strong>Esperando Diagnóstico</strong>:</p>"
            f"<table style='width: 100%; border-collapse: collapse; margin-bottom: 20px;'>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Código de Servicio:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{reparacion.codigo_sec}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Equipo:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{nombre_tipo} {nombre_marca} {nombre_modelo}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>N. Serie:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{dispositivo.numero_serie or 'Sin registrar'}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Estado Físico / Estético:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{obs_texto}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Falla Informada:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{reparacion.desc_cliente}</td></tr>"
            f"</table>"
            f"<p style='color: #64748b; font-size: 13px;'>Este comprobante certifica la tenencia física del equipo y su condición estética al ingreso.</p>"
            f"<div style='margin: 24px 0; text-align: center;'>"
            f"<a href='{url_reparacion}' style='background-color: #06b6d4; color: #0f172a; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;'>Ver Estado de la Reparación</a>"
            f"</div>"
            f"<p style='color: #64748b; font-size: 12px; text-align: center;'>Enlace directo: <a href='{url_reparacion}' style='color: #06b6d4;'>{url_reparacion}</a></p>"
            f"</div>"
        )

        registrar_y_enviar_notificacion_correo(
            usuario=cliente,
            asunto=asunto,
            cuerpo_texto=cuerpo_texto,
            tipo_notificacion="REPARACION",
            cuerpo_html=cuerpo_html,
            mensaje_notificacion=f"Recibimos su dispositivo ({nombre_marca} {nombre_modelo}) en nuestro taller. Presione aquí para ver el comprobante y el seguimiento.",
            codigo_sensible=reparacion.codigo_sec,
            dispositivo=dispositivo,
            adjuntar_logo=True
        )
    except Exception as e:
        logger.warning("[CU-45 Comprobante] Advertencia al generar o despachar comprobante: %s", e)


@transaction.atomic
def recepcionar_dispositivo_taller(
    *,
    usuario_tecnico: Usuario,
    id_reparacion: int,
    datos_validados: dict
) -> Reparacion:
    """
    CU-45: Recepcionar Dispositivo.
    Permite al personal de taller (Técnico o Administrador) verificar los datos
    cargados previamente de forma virtual por el cliente, asentar las condiciones
    estéticas y físicas del equipo y avanzar formalmente el ciclo de vida a 'ESPERANDO_DIAGNOSTICO'.
    """
    from workshop_app.selectors import obtener_reparacion_para_recepcion

    # Paso 1 & 4: Obtener reparación y validar estado estricto 'ESPERANDO_DISPOSITIVO'
    reparacion = obtener_reparacion_para_recepcion(id_reparacion)

    # Paso 5: Actualizar datos de la reparación
    reparacion.desc_cliente = datos_validados['descripcion_problema']
    reparacion.credencial_acceso = datos_validados.get('credencial_acceso') or 'Ninguna'
    reparacion.hora_recepcion = django_timezone.now().time()

    # Determinar si el diagnóstico inicial adeuda pago
    venta_diag = reparacion.id_venta
    tiene_deuda_pendiente = bool(venta_diag and str(venta_diag.estado_venta).strip().upper() not in ('PAGADO', 'PAGADA'))

    if not tiene_deuda_pendiente:
        reparacion.etapa = 'ESPERANDO_DIAGNOSTICO'
        estado_alcanzado_bitacora = 2
        rotulo_etapa = 'Esperando Diagnóstico'
    else:
        reparacion.etapa = 'ESPERANDO_PAGO_DIAGNOSTICO'
        estado_alcanzado_bitacora = 10
        rotulo_etapa = 'Esperando Pago de Diagnóstico'

    # Actualizar relación M2M de categorías si fueron especificadas
    if 'ids_categorias' in datos_validados:
        reparacion.categorias.set(datos_validados['ids_categorias'])

    # Paso 5.1: Asignación de técnico responsable SOLO si la reparación aún no tiene un técnico asignado
    rol_actual = getattr(
        getattr(reparacion.id_usuario, 'id_rol', None) or getattr(reparacion.id_usuario, 'rol', None),
        'codigo',
        ''
    ).upper()
    ya_tiene_tecnico = bool(reparacion.id_usuario and rol_actual == 'TECNICO')

    fue_asignado_en_recepcion = False
    auto_asignar = obtener_configuracion_bool('autoAsignacionTecnicosActiva')

    if ya_tiene_tecnico:
        tecnico_final = reparacion.id_usuario
    else:
        tecnico_final = usuario_tecnico
        if auto_asignar:
            tecnico_sel, _ = seleccionar_mejor_tecnico_para_reparacion(reparacion=reparacion)
            if tecnico_sel:
                tecnico_final = tecnico_sel
        reparacion.id_usuario = tecnico_final
        fue_asignado_en_recepcion = True

    reparacion.save()

    # Paso 5.2: Persistencia del Respaldo Fotográfico (CU-45)
    from workshop_app.models import ImagenRecepcion
    fotos_guardadas = 0
    fotos = datos_validados.get('imagenes') or []
    for f in fotos:
        img_str = f.get('imagen') if isinstance(f, dict) else str(f)
        desc_img = f.get('descripcion') if isinstance(f, dict) else ''
        if img_str:
            ImagenRecepcion.objects.create(
                id_reparacion=reparacion,
                imagen=img_str,
                descripcion=desc_img or 'Constatación física de recepción en mostrador'
            )
            fotos_guardadas += 1

    # Paso 6: Registro en Bitácora de Reparación estructurado por ítems
    lineas_recepcion = [
        f"Cambio de etapa: Equipo recepcionado en mostrador. Estado físico: {datos_validados['observaciones_fisicas']}"
    ]
    if fotos_guardadas > 0:
        lineas_recepcion.append(f"Respaldo fotográfico: {fotos_guardadas} foto(s) de constancia adjuntas.")
    if tiene_deuda_pendiente:
        lineas_recepcion.append(
            "Estado de arancel: En espera del pago del primer diagnóstico para habilitar la revisión técnica (solo se abona el primer diagnóstico)."
        )
    else:
        lineas_recepcion.append(
            "Estado de arancel: Diagnóstico inicial cubierto — Equipo habilitado para evaluación técnica."
        )
    if fue_asignado_en_recepcion and tecnico_final:
        lineas_recepcion.append(f"Técnico asignado: {tecnico_final.email}.")
    comentario_bitacora = "\n".join(lineas_recepcion)

    BitacoraReparacion.objects.create(
        id_reparacion=reparacion,
        id_usuario=usuario_tecnico,
        fecha_hora=django_timezone.now(),
        estado_alcanzado=estado_alcanzado_bitacora,
        comentario=comentario_bitacora
    )

    if fue_asignado_en_recepcion and auto_asignar and tecnico_final != usuario_tecnico:
        try:
            nombre_equipo = reparacion.id_dispositivo.id_modelo.nombre if reparacion.id_dispositivo.id_modelo else "Dispositivo"
            Notificacion.objects.create(
                mensaje=f"Se te ha asignado la reparación #{reparacion.id_reparacion} ({nombre_equipo}) recepcionada en mostrador.",
                tipo="ASIGNACION_REPARACION",
                fecha_envio=django_timezone.now().date(),
                leida=False,
                id_usuario=tecnico_final,
                id_dispositivo=reparacion.id_dispositivo
            )
        except Exception as e:
            logger.warning("[Notificación Asignación CU-45] Advertencia: %s", e)

    # Paso 7: Auditoría en LogSistema y Despacho de Comprobante
    email_tecnico = getattr(usuario_tecnico, 'email', str(usuario_tecnico))
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Recepción física de dispositivo (CU-45)",
        detalle=(
            f"Reparación #{reparacion.id_reparacion} recepcionada físicamente en mostrador por {email_tecnico}. "
            f"\nTransición a '{reparacion.etapa}'. \nEstado físico: {datos_validados['observaciones_fisicas']}."
        ),
        tipo="AUDITORIA_TALLER",
        modulo_origen="workshop_app",
        tabla_afectada="reparacion",
        id_registro_afectado=str(reparacion.id_reparacion),
        id_usuario=usuario_tecnico
    )

    generar_y_enviar_comprobante_recepcion(
        reparacion,
        observaciones_fisicas=datos_validados['observaciones_fisicas']
    )

    return reparacion


def generar_y_enviar_notificacion_diagnostico(
    reparacion: Reparacion,
    diagnostico: Any,
    insumos_data: list = None
) -> None:
    """
    CU-08: Notifica al cliente por correo electrónico que el diagnóstico técnico y presupuesto
    están disponibles para su revisión, incluyendo el enlace directo a la reparación.
    """
    try:
        from core_app.services import registrar_y_enviar_notificacion_correo
        from core_app.selectors import obtener_url_frontend

        dispositivo = reparacion.id_dispositivo
        cliente = dispositivo.id_usuario
        perfil = getattr(cliente, 'perfilusuario', None)
        nombre_cliente = f"{getattr(perfil, 'nombre', '')} {getattr(perfil, 'apellido', '')}".strip() or cliente.email

        modelo = getattr(dispositivo, 'id_modelo', None)
        nombre_modelo = getattr(modelo, 'nombre', 'N/D')
        nombre_marca = getattr(getattr(modelo, 'id_marca', None), 'nombre', 'N/D')
        nombre_tipo = getattr(getattr(modelo, 'id_tipo_dispositivo', None), 'nombre', 'N/D')

        url_frontend = obtener_url_frontend()
        url_reparacion = f"{url_frontend}/cliente/reparaciones/{reparacion.id_reparacion}"

        asunto = f"Diagnóstico y Presupuesto Disponible - {nombre_marca} {nombre_modelo} (IFixPos)"

        mano_obra_val = getattr(diagnostico, 'costo_diagnostico', None)
        mano_obra_str = f"${mano_obra_val}" if mano_obra_val is not None else "A convenir"

        insumos_texto = ""
        insumos_html = ""
        if insumos_data:
            from catalog_app.models import Producto
            filas_html = []
            filas_txt = []
            for item in insumos_data:
                prod = Producto.objects.filter(pk=item.get('id_producto')).first()
                nombre_prod = prod.nombre if prod else "Insumo técnico"
                cant = item.get('cantidad', 1)
                precio = prod.precio_venta if prod else 0
                filas_txt.append(f"  * {cant}x {nombre_prod} (${precio} c/u)")
                filas_html.append(
                    f"<tr><td style='padding: 6px; border-bottom: 1px solid #eee;'>{nombre_prod}</td>"
                    f"<td style='padding: 6px; border-bottom: 1px solid #eee; text-align: center;'>{cant}</td>"
                    f"<td style='padding: 6px; border-bottom: 1px solid #eee; text-align: right;'>${precio}</td></tr>"
                )
            insumos_texto = "\nInsumos y repuestos requeridos:\n" + "\n".join(filas_txt) + "\n"
            insumos_html = (
                f"<h4 style='color: #334155; margin-top: 15px; margin-bottom: 8px;'>Repuestos e Insumos Presupuestados:</h4>"
                f"<table style='width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px;'>"
                f"<tr style='background: #f8fafc;'><th style='padding: 6px; text-align: left;'>Producto</th>"
                f"<th style='padding: 6px; text-align: center;'>Cant.</th>"
                f"<th style='padding: 6px; text-align: right;'>Unitario</th></tr>"
                f"{''.join(filas_html)}"
                f"</table>"
            )

        cuerpo_texto = (
            f"Estimado/a {nombre_cliente},\n\n"
            f"Le informamos que el equipo técnico ha completado el diagnóstico para su dispositivo ({nombre_marca} {nombre_modelo}) "
            f"y el presupuesto ya se encuentra disponible para su revisión y confirmación.\n\n"
            f"Detalles del Diagnóstico:\n"
            f"- Dispositivo: {nombre_tipo} {nombre_marca} {nombre_modelo}\n"
            f"- N. Serie: {dispositivo.numero_serie or 'Sin registrar'}\n"
            f"- Diagnóstico de la Falla: {diagnostico.descripcion_falla}\n"
            f"- Mano de Obra Estimada: {mano_obra_str}\n"
            f"{insumos_texto}\n"
            f"Por favor ingrese al siguiente enlace para revisar el presupuesto en detalle y aceptar o rechazar la reparación:\n"
            f"{url_reparacion}\n\n"
            f"IFixPos - Taller de Reparaciones"
        )

        cuerpo_html = (
            f"<div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;'>"
            f"<h2 style='color: #06b6d4;'>IFixPos - Diagnóstico y Presupuesto Disponible</h2>"
            f"<p>Estimado/a <strong>{nombre_cliente}</strong>,</p>"
            f"<p>El equipo técnico ha completado la revisión de su dispositivo <strong>{nombre_marca} {nombre_modelo}</strong>. El presupuesto ya se encuentra disponible para su aprobación:</p>"
            f"<table style='width: 100%; border-collapse: collapse; margin-bottom: 15px;'>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Equipo:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{nombre_tipo} {nombre_marca} {nombre_modelo}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>N. Serie:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{dispositivo.numero_serie or 'Sin registrar'}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Diagnóstico Técnico:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{diagnostico.descripcion_falla}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Mano de Obra:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>{mano_obra_str}</strong></td></tr>"
            f"</table>"
            f"{insumos_html}"
            f"<div style='margin: 26px 0; text-align: center;'>"
            f"<a href='{url_reparacion}' style='background-color: #06b6d4; color: #0f172a; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;'>Revisar y Responder Presupuesto</a>"
            f"</div>"
            f"<p style='color: #64748b; font-size: 12px; text-align: center;'>Enlace directo: <a href='{url_reparacion}' style='color: #06b6d4;'>{url_reparacion}</a></p>"
            f"</div>"
        )

        registrar_y_enviar_notificacion_correo(
            usuario=cliente,
            asunto=asunto,
            cuerpo_texto=cuerpo_texto,
            tipo_notificacion="DIAGNOSTICO_DISPONIBLE",
            cuerpo_html=cuerpo_html,
            mensaje_notificacion="Su presupuesto ya se encuentra disponible para revisión",
            dispositivo=dispositivo,
            adjuntar_logo=True
        )
    except Exception as e:
        logger.warning("[CU-08 Diagnóstico] Advertencia al generar o despachar notificación de diagnóstico: %s", e)


# ==============================================================================
# CU-08: CARGAR DIAGNÓSTICO TÉCNICO (LÓGICA TRANSACCIONAL Y EMISIÓN DE ALERTAS)
# ==============================================================================

@transaction.atomic
def cargar_diagnostico_tecnico(
    *,
    usuario_tecnico: Usuario,
    id_reparacion: int,
    datos_validados: dict
):
    """
    CU-08: Cargar diagnóstico técnico.
    Permite al técnico o administrador registrar la evaluación formal de un equipo,
    detallando las fallas detectadas, vinculando insumos consumibles (congelando su precio unitario),
    estableciendo el costo estimado de mano de obra y transicionando la reparación a 'ESPERANDO_CONFIRMACION'.
    Emite notificación automática al cliente y registra auditoría en Bitácora y LogSistema.
    """
    from workshop_app.selectors import obtener_reparacion_para_diagnostico
    from workshop_app.models import Diagnostico, DetalleInsumoReparacion, BitacoraReparacion
    from catalog_app.models import Producto
    from core_app.models import Notificacion, LogSistema

    # Paso 1: Obtener reparación y verificar estado estricto 'EN_DIAGNOSTICO'
    reparacion = obtener_reparacion_para_diagnostico(id_reparacion)

    # Paso 1.1: Aplicar configuración de Mano de Obra (costoManoDeObra) si no fue provisto
    from core_app.selectors import obtener_configuracion_decimal
    if datos_validados.get('costo_mano_obra') is None:
        datos_validados['costo_mano_obra'] = obtener_configuracion_decimal('costoManoDeObra', Decimal('30000.00'))

    # Paso 2: Instanciar y guardar Diagnóstico técnico
    diagnostico = Diagnostico.objects.create(
        id_reparacion=reparacion,
        descripcion_falla=datos_validados['descripcion_falla'],
        fecha_diagnostico=django_timezone.now().date(),
        costo_diagnostico=datos_validados['costo_mano_obra']
    )

    # Paso 3: Insumos requeridos para el presupuesto (congelando precio de venta actual)
    # Si existían insumos previos, se reemplazan por los nuevos especificados en esta evaluación
    DetalleInsumoReparacion.objects.filter(id_reparacion=reparacion).delete()
    insumos_data = datos_validados.get('insumos', [])
    for item in insumos_data:
        producto = Producto.objects.get(pk=item['id_producto'])
        DetalleInsumoReparacion.objects.create(
            id_reparacion=reparacion,
            id_producto=producto,
            cantidad=item['cantidad'],
            precio_unitario=producto.precio_venta
        )

    # Paso 4: Transición de Estado de Reparación preservando al técnico titular asignado
    reparacion.etapa = 'ESPERANDO_CONFIRMACION'
    rol_actual_rep = getattr(
        getattr(reparacion.id_usuario, 'id_rol', None) or getattr(reparacion.id_usuario, 'rol', None),
        'codigo',
        ''
    ).upper()
    if not reparacion.id_usuario or rol_actual_rep != 'TECNICO':
        reparacion.id_usuario = usuario_tecnico
    reparacion.save()

    # Paso 5: Registro inmutable en BitacoraReparacion estructurado por ítems
    # Nota: estado_alcanzado se almacena numéricamente en BD (4: ESPERANDO_CONFIRMACION)
    es_primer_diagnostico = (reparacion.diagnostico_set.count() <= 1)
    accion_diag = "Carga de nuevo diagnóstico" if not es_primer_diagnostico else "Carga de diagnóstico"
    lineas_diag = [
        f"Proceso: {accion_diag}.",
        "Cambio de etapa: El equipo pasó a 'Esperando Confirmación'."
    ]
    if not es_primer_diagnostico:
        lineas_diag.append(
            "Cobertura de diagnóstico: Emitido sin costo adicional (solo se abona el primer diagnóstico)."
        )
    lineas_diag.append(f"Falla constatada: {diagnostico.descripcion_falla[:200]}.")
    comentario_bitacora = "\n".join(lineas_diag)
    BitacoraReparacion.objects.create(
        id_reparacion=reparacion,
        id_usuario=usuario_tecnico,
        fecha_hora=django_timezone.now(),
        estado_alcanzado=4,  # 4: ESPERANDO_CONFIRMACION
        comentario=comentario_bitacora
    )

    # Paso 6: Notificación automática por correo al cliente y persistencia en Notificacion
    generar_y_enviar_notificacion_diagnostico(
        reparacion=reparacion,
        diagnostico=diagnostico,
        insumos_data=insumos_data
    )

    email_tecnico = getattr(usuario_tecnico, 'email', str(usuario_tecnico))
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Carga de diagnóstico técnico (CU-08)",
        detalle=(
            f"Diagnóstico #{diagnostico.id_diagnostico} cargado por técnico {email_tecnico} "
            f"para la Reparación #{reparacion.id_reparacion}. "
            f"Mano de obra: ${datos_validados['costo_mano_obra']}. "
            f"Insumos vinculados: {len(insumos_data)}. "
            f"Transición a 'ESPERANDO_CONFIRMACION'."
        ),
        tipo="AUDITORIA_TALLER",
        modulo_origen="workshop_app",
        tabla_afectada="diagnostico",
        id_registro_afectado=str(diagnostico.id_diagnostico),
        id_usuario=usuario_tecnico
    )

    return diagnostico


# ==============================================================================
# CU-09: CONFIRMAR O RECHAZAR REPARACIÓN (LÓGICA TRANSACCIONAL INNEGOCIABLE)
# ==============================================================================

@transaction.atomic
def procesar_decision_reparacion(
    *,
    usuario_cliente: Usuario,
    id_reparacion: int,
    datos_validados: dict
) -> Reparacion:
    """
    CU-09: Confirmar o rechazar reparación.
    Permite al cliente aceptar o rechazar un presupuesto luego de recibir el diagnóstico técnico.
    Lógica Transaccional:
    - Valida que la reparación pertenezca al cliente (PermissionDenied).
    - Valida que la reparación se encuentre estrictamente en etapa 'ESPERANDO_CONFIRMACION'.
    - Si el cliente RECHAZA:
        * Cambia el estado a 'CANCELADO'.
        * Registra en BitacoraReparacion (estado 8) y emite notificación al técnico.
    - Si el cliente ACEPTA:
        * Cambia el estado a 'EN_REPARACION'.
        * Genera una instancia de Venta en estado PENDIENTE vinculada al cliente con los insumos
          presupuestados (DetalleVenta), el método de entrega y medio de pago seleccionados.
        * Vincula la Venta a la Reparación.
        * Registra en BitacoraReparacion (estado 5) y emite notificación al técnico.
    - Registra auditoría inmutable en LogSistema para trazabilidad.
    """
    import uuid
    from decimal import Decimal
    from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound
    from workshop_app.models import Reparacion, DetalleInsumoReparacion, BitacoraReparacion
    from sales_app.models import Venta, DetalleVenta, MedioPago, Pago
    from geo_app.models import Direccion
    from core_app.models import Notificacion, LogSistema, ConfiguracionSistema

    # Paso 1: Recuperar la reparación
    try:
        reparacion = Reparacion.objects.select_related(
            'id_dispositivo',
            'id_dispositivo__id_usuario',
            'id_dispositivo__id_modelo',
            'id_usuario',
            'id_usuario__perfilusuario'
        ).get(pk=id_reparacion)
    except Reparacion.DoesNotExist:
        raise NotFound(f"No existe ninguna orden de reparación con ID {id_reparacion}.")

    # Paso 2: Control de propiedad horizontal innegociable
    cliente_id = getattr(usuario_cliente, 'id_usuario', None) or getattr(usuario_cliente, 'id', None)
    if reparacion.id_dispositivo.id_usuario_id != cliente_id:
        raise PermissionDenied("Acceso Denegado: Esta orden de reparación no pertenece a su cuenta.")

    # Paso 3: Validación estricta de precondición operativa ('ESPERANDO_CONFIRMACION')
    etapa_actual = (
        (reparacion.etapa or '')
        .strip()
        .upper()
        .replace(' ', '_')
        .replace('Á', 'A')
        .replace('É', 'E')
        .replace('Í', 'I')
        .replace('Ó', 'O')
        .replace('Ú', 'U')
    )
    if etapa_actual != 'ESPERANDO_CONFIRMACION':
        raise ValidationError("La reparación no se encuentra en estado 'Esperando Confirmación'.")

    decision = str(datos_validados.get('decision') or '').strip().upper()
    comentarios = str(datos_validados.get('comentarios_cliente') or '').strip()

    # Paso 4: Bifurcación lógica según la decisión del cliente
    if decision == 'RECHAZAR':
        reparacion.etapa = 'CANCELADO'
        estado_alcanzado_int = 8  # 8: CANCELADO / RECHAZADO
        lineas_rechazo = [
            "Resolución del cliente: Diagnóstico rechazado (Presupuesto rechazado).",
            "Cambio de etapa: El equipo pasó a 'Cancelado'."
        ]
        if comentarios:
            lineas_rechazo.append(f"Motivo: {comentarios}")
        comentario_bitacora = "\n".join(lineas_rechazo)

    elif decision == 'ACEPTAR':
        reparacion.etapa = 'EN_REPARACION'
        estado_alcanzado_int = 5  # 5: EN_REPARACION
        lineas_aceptacion = [
            "Resolución del cliente: Diagnóstico aceptado (Presupuesto aprobado).",
            "Cambio de etapa: El equipo pasó a 'En Reparación' para ejecución técnica."
        ]
        if comentarios:
            lineas_aceptacion.append(f"Comentarios: {comentarios}")
        comentario_bitacora = "\n".join(lineas_aceptacion)

        # Recuperar insumos presupuestados en el diagnóstico
        insumos_presupuestados = list(
            DetalleInsumoReparacion.objects.filter(id_reparacion=reparacion).select_related('id_producto')
        )

        # Calcular monto subtotal: Insumos presupuestados + Mano de obra técnica del diagnóstico
        monto_subtotal = Decimal('0.00')
        for insumo in insumos_presupuestados:
            precio = Decimal(str(insumo.precio_unitario or 0))
            cant = Decimal(str(insumo.cantidad or 0))
            monto_subtotal += precio * cant

        # Sumar costo de mano de obra técnica del diagnóstico
        costo_mano_obra = Decimal('0.00')
        diag = reparacion.diagnostico_set.order_by('-id_diagnostico').first()
        if diag and diag.costo_diagnostico:
            costo_mano_obra = Decimal(str(diag.costo_diagnostico))
        monto_subtotal += costo_mano_obra

        # Resolver método de entrega y costo de envío
        metodo_entrega = str(datos_validados.get('metodo_entrega') or 'RETIRO').strip().upper()
        nombre_pago = str(datos_validados.get('metodo_pago') or 'EFECTIVO').strip()

        # Validación de coherencia operativa: No se permite efectivo en mostrador si es envío a domicilio
        if metodo_entrega == 'ENVIO':
            pago_norm = nombre_pago.upper()
            if 'EFECTIVO' in pago_norm or pago_norm in ('MOSTRADOR', 'EFECTIVO_MOSTRADOR'):
                raise ValidationError("El método de pago en efectivo en mostrador no está disponible para envíos a domicilio.")

        costo_envio = Decimal('0.00')
        if metodo_entrega == 'ENVIO':
            cfg_envio = ConfiguracionSistema.objects.filter(clave='envioLocal').first()
            if cfg_envio and cfg_envio.valor:
                try:
                    val_limpio = cfg_envio.valor.strip().replace(',', '.')
                    costo_envio = Decimal(val_limpio)
                except Exception:
                    costo_envio = Decimal('0.00')

        # Resolver dirección de envío si aplica
        id_dir = datos_validados.get('id_direccion_envio')
        direccion_envio_obj = None
        if id_dir and metodo_entrega == 'ENVIO':
            direccion_envio_obj = Direccion.objects.filter(id_direccion=id_dir).first()

        # Generar Venta en sales_app
        codigo_seguridad_venta = uuid.uuid4().hex[:10].upper()
        venta = Venta.objects.create(
            id_usuario=usuario_cliente,
            metodo_entrega=metodo_entrega,
            fecha_venta=django_timezone.now().date(),
            estado_venta='PENDIENTE',
            codigo_sec=codigo_seguridad_venta,
            monto_subtotal=monto_subtotal,
            costo_envio=costo_envio,
            id_direccion_envio=direccion_envio_obj
        )

        # Replicar insumos presupuestados en DetalleVenta
        for insumo in insumos_presupuestados:
            cant = int(insumo.cantidad or 0)
            precio_u = Decimal(str(insumo.precio_unitario or 0))
            subtotal_renglon = precio_u * Decimal(str(cant))
            DetalleVenta.objects.create(
                id_venta=venta,
                id_producto=insumo.id_producto,
                cantidad=cant,
                precio_unitario=precio_u,
                subtotal=subtotal_renglon
            )

        # Resolver MedioPago y registrar instancia de Pago pendiente
        from core_app.constantes import deducir_codigo_medio_pago
        nombre_pago = str(datos_validados.get('metodo_pago') or 'EFECTIVO').strip()
        codigo_pago = deducir_codigo_medio_pago(nombre_pago)
        medio_pago_obj = None
        if nombre_pago.isdigit():
            medio_pago_obj = MedioPago.objects.filter(id_mediopago=int(nombre_pago)).first()
        if not medio_pago_obj:
            medio_pago_obj = MedioPago.objects.filter(codigo=codigo_pago).first()
        if not medio_pago_obj:
            medio_pago_obj = MedioPago.objects.filter(nombre_medio_pago__iexact=nombre_pago).first()
        if not medio_pago_obj:
            medio_pago_obj = MedioPago.objects.filter(nombre_medio_pago__icontains=nombre_pago).first()
        if not medio_pago_obj:
            medio_pago_obj = MedioPago.objects.create(
                codigo=codigo_pago,
                nombre_medio_pago=nombre_pago.capitalize(),
                estado=True,
                recargo=Decimal('0.00')
            )

        Pago.objects.create(
            id_venta=venta,
            medio_pago=medio_pago_obj,
            monto_pagado=Decimal('0.00'),
            fecha_pago=django_timezone.now().date(),
            detalle=f"Pago pendiente de acreditación ({medio_pago_obj.nombre_medio_pago}) para Reparación #{reparacion.id_reparacion}"
        )

        # Vincular la Venta a la Reparación
        reparacion.id_venta = venta
    else:
        raise ValidationError(f"Decisión '{decision}' no reconocida. Debe ser 'ACEPTAR' o 'RECHAZAR'.")

    # Paso 5: Persistir la reparación actualizada
    reparacion.save()

    # Paso 6: Registro inmutable en BitacoraReparacion
    BitacoraReparacion.objects.create(
        id_reparacion=reparacion,
        id_usuario=usuario_cliente,
        fecha_hora=django_timezone.now(),
        estado_alcanzado=estado_alcanzado_int,
        comentario=comentario_bitacora
    )

    # Paso 7: Notificación interna dirigida al técnico asignado (nunca al cliente)
    id_cliente = getattr(usuario_cliente, 'id_usuario', None) or getattr(usuario_cliente, 'id', None)
    tecnico_destinatario = None

    # 1. Comprobar si reparacion.id_usuario es personal del taller y no el cliente
    if reparacion.id_usuario and reparacion.id_usuario_id != id_cliente:
        rol_rep_user = getattr(getattr(reparacion.id_usuario, 'id_rol', None) or getattr(reparacion.id_usuario, 'rol', None), 'codigo', '').upper()
        if rol_rep_user in ('TECNICO', 'ADMIN'):
            tecnico_destinatario = reparacion.id_usuario

    # 2. Si no, buscar el técnico que realizó la última bitácora técnica de diagnóstico o recepción
    if not tecnico_destinatario:
        bitacora_tec = BitacoraReparacion.objects.filter(
            id_reparacion=reparacion,
            id_usuario__id_rol__codigo__in=['TECNICO', 'ADMIN']
        ).exclude(id_usuario_id=id_cliente).order_by('-id_bitacora').first()
        if bitacora_tec:
            tecnico_destinatario = bitacora_tec.id_usuario

    # 3. Fallback: Buscar técnico activo del taller
    if not tecnico_destinatario:
        from users_app.models import Usuario
        tecnico_destinatario = Usuario.objects.filter(
            id_rol__codigo='TECNICO',
            estado_activo=True
        ).first()

    # Emitir notificación exclusivamente si el destinatario es personal del taller y no el cliente
    if tecnico_destinatario and tecnico_destinatario.id_usuario != id_cliente:
        decision_verbo = "aceptó" if decision == 'ACEPTAR' else "rechazó"
        modelo_nombre = (
            reparacion.id_dispositivo.id_modelo.nombre
            if reparacion.id_dispositivo and reparacion.id_dispositivo.id_modelo
            else "Equipo"
        )
        Notificacion.objects.create(
            id_usuario=tecnico_destinatario,
            mensaje=f"El cliente {decision_verbo} el presupuesto para el equipo {modelo_nombre}. Presione aquí para ver la orden de trabajo.",
            tipo=f"DECISION_REPARACION_{decision}",
            fecha_envio=django_timezone.now().date(),
            leida=False,
            id_dispositivo=reparacion.id_dispositivo
        )

    # Notificación por correo de confirmación de decisión al cliente con link a la reparación
    generar_y_enviar_confirmacion_decision_cliente(
        reparacion=reparacion,
        decision=decision,
        comentarios=comentarios
    )

    # Paso 8: Auditoría en LogSistema para trazabilidad
    email_cliente = getattr(usuario_cliente, 'email', str(usuario_cliente))
    venta_info = f", Venta #{reparacion.id_venta_id} generada en estado PENDIENTE" if reparacion.id_venta else ""
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion=f"Decisión de reparación {decision} (CU-09)",
        detalle=(
            f"El cliente {email_cliente} confirmó la decisión '{decision}' para la Reparación #{reparacion.id_reparacion}. "
            f"Nuevo estado: '{reparacion.etapa}'{venta_info}."
        )[:1000],
        tipo="AUDITORIA_COMERCIAL",
        modulo_origen="workshop_app",
        tabla_afectada="reparacion",
        id_registro_afectado=str(reparacion.id_reparacion),
        id_usuario=usuario_cliente
    )

    return reparacion


def generar_y_enviar_confirmacion_decision_cliente(
    reparacion: Reparacion,
    decision: str,
    comentarios: str = ''
) -> None:
    """
    CU-09: Notifica al cliente por correo electrónico confirmando la aceptación o rechazo
    del presupuesto de reparación, adjuntando el enlace directo a la orden de servicio.
    """
    try:
        from core_app.services import registrar_y_enviar_notificacion_correo
        from core_app.selectors import obtener_url_frontend

        dispositivo = reparacion.id_dispositivo
        cliente = getattr(dispositivo, 'id_usuario', None)
        if not cliente:
            return

        perfil = getattr(cliente, 'perfilusuario', None)
        nombre_cliente = f"{getattr(perfil, 'nombre', '')} {getattr(perfil, 'apellido', '')}".strip() or cliente.email

        modelo = getattr(dispositivo, 'id_modelo', None)
        nombre_modelo = getattr(modelo, 'nombre', 'N/D')
        nombre_marca = getattr(getattr(modelo, 'id_marca', None), 'nombre', 'N/D')
        nombre_tipo = getattr(getattr(modelo, 'id_tipo_dispositivo', None), 'nombre', 'N/D')

        url_frontend = obtener_url_frontend()
        url_reparacion = f"{url_frontend}/cliente/reparaciones/{reparacion.id_reparacion}"

        decision_humana = "Aceptado" if decision == 'ACEPTAR' else "Rechazado"
        asunto = f"Presupuesto {decision_humana} - {nombre_marca} {nombre_modelo} (IFixPos)"

        detalle_decision = (
            "Su presupuesto ha sido aprobado. El equipo técnico iniciará de inmediato los trabajos de reparación."
            if decision == 'ACEPTAR'
            else "Ha cancelado el presupuesto. Su dispositivo estará disponible en mostrador para su retiro."
        )

        cuerpo_texto = (
            f"Estimado/a {nombre_cliente},\n\n"
            f"Confirmamos el registro de su decisión para la reparación de su equipo ({nombre_marca} {nombre_modelo}).\n\n"
            f"Detalles:\n"
            f"- Dispositivo: {nombre_tipo} {nombre_marca} {nombre_modelo}\n"
            f"- N. Serie: {dispositivo.numero_serie or 'Sin registrar'}\n"
            f"- Decisión Registrada: Presupuesto {decision_humana}\n"
            f"- Estado Actual de la Orden: {reparacion.etapa}\n"
            f"- Nota: {detalle_decision}\n\n"
            f"Puede consultar los detalles de su orden y la bitácora en:\n"
            f"{url_reparacion}\n\n"
            f"IFixPos - Taller de Reparaciones"
        )

        badge_bg = '#dcfce7' if decision == 'ACEPTAR' else '#fee2e2'
        badge_fg = '#15803d' if decision == 'ACEPTAR' else '#b91c1c'

        cuerpo_html = (
            f"<div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;'>"
            f"<h2 style='color: #06b6d4;'>IFixPos - Confirmación de Decisión</h2>"
            f"<p>Estimado/a <strong>{nombre_cliente}</strong>,</p>"
            f"<p>Confirmamos la recepción de su decisión para la reparación de su dispositivo <strong>{nombre_marca} {nombre_modelo}</strong>:</p>"
            f"<table style='width: 100%; border-collapse: collapse; margin-bottom: 20px;'>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Equipo:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{nombre_tipo} {nombre_marca} {nombre_modelo}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>N. Serie:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{dispositivo.numero_serie or 'Sin registrar'}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Decisión:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'><span style='background: {badge_bg}; color: {badge_fg}; padding: 4px 8px; border-radius: 4px; font-weight: bold;'>Presupuesto {decision_humana}</span></td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Detalle:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{detalle_decision}</td></tr>"
            f"</table>"
            f"<div style='margin: 24px 0; text-align: center;'>"
            f"<a href='{url_reparacion}' style='background-color: #06b6d4; color: #0f172a; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;'>Ver Estado de la Reparación</a>"
            f"</div>"
            f"<p style='color: #64748b; font-size: 12px; text-align: center;'>Enlace directo: <a href='{url_reparacion}' style='color: #06b6d4;'>{url_reparacion}</a></p>"
            f"</div>"
        )

        if decision == 'ACEPTAR':
            mensaje_decision = f"Confirmamos que ha aceptado el presupuesto para su dispositivo ({nombre_marca} {nombre_modelo}). Comenzamos a trabajar en su equipo. Presione aquí para ver los detalles."
        else:
            mensaje_decision = f"Confirmamos que ha cancelado el presupuesto para su dispositivo ({nombre_marca} {nombre_modelo}). Su equipo está disponible para retirar en el taller. Presione aquí para más información."

        registrar_y_enviar_notificacion_correo(
            usuario=cliente,
            asunto=asunto,
            cuerpo_texto=cuerpo_texto,
            tipo_notificacion=f"DECISION_REPARACION_{decision}",
            cuerpo_html=cuerpo_html,
            mensaje_notificacion=mensaje_decision,
            dispositivo=dispositivo,
            adjuntar_logo=True
        )
    except Exception as e:
        logger.warning("[CU-09 Decisión] Advertencia al generar o despachar notificación de decisión al cliente: %s", e)


def generar_y_enviar_notificacion_cambio_estado(
    reparacion: Reparacion,
    nuevo_estado: str,
    comentario: str
) -> None:
    """
    CU-10: Notifica al cliente por correo electrónico ante cada cambio de estado realizado
    sobre su reparación por el equipo de taller, adjuntando la justificación técnica y el enlace directo.
    """
    try:
        from core_app.services import registrar_y_enviar_notificacion_correo
        from core_app.selectors import obtener_url_frontend

        dispositivo = reparacion.id_dispositivo
        cliente = getattr(dispositivo, 'id_usuario', None)
        if not cliente:
            return

        perfil = getattr(cliente, 'perfilusuario', None)
        nombre_cliente = f"{getattr(perfil, 'nombre', '')} {getattr(perfil, 'apellido', '')}".strip() or cliente.email

        modelo = getattr(dispositivo, 'id_modelo', None)
        nombre_modelo = getattr(modelo, 'nombre', 'N/D')
        nombre_marca = getattr(getattr(modelo, 'id_marca', None), 'nombre', 'N/D')
        nombre_tipo = getattr(getattr(modelo, 'id_tipo_dispositivo', None), 'nombre', 'N/D')

        url_frontend = obtener_url_frontend()
        url_reparacion = f"{url_frontend}/cliente/reparaciones/{reparacion.id_reparacion}"

        TITULOS_ESTADOS = {
            'ESPERANDO_DISPOSITIVO': 'Esperando Dispositivo',
            'ESPERANDO_DIAGNOSTICO': 'Esperando Diagnóstico',
            'EN_DIAGNOSTICO': 'En Diagnóstico',
            'ESPERANDO_CONFIRMACION': 'Esperando Confirmación',
            'EN_REPARACION': 'En Reparación',
            'ESPERANDO_REPUESTOS': 'Esperando Repuestos',
            'FINALIZADO': 'Reparación Finalizada',
            'ENTREGADO': 'Dispositivo Entregado',
            'CANCELADO': 'Reparación Cancelada',
        }
        estado_humano = TITULOS_ESTADOS.get(nuevo_estado, nuevo_estado.replace('_', ' ').title())

        asunto = f"Actualización de Estado: {estado_humano} - {nombre_marca} {nombre_modelo} (IFixPos)"

        cuerpo_texto = (
            f"Estimado/a {nombre_cliente},\n\n"
            f"Le informamos que se ha registrado una actualización en el estado de la reparación de su equipo ({nombre_marca} {nombre_modelo}).\n\n"
            f"Detalles de la Actualización:\n"
            f"- Dispositivo: {nombre_tipo} {nombre_marca} {nombre_modelo}\n"
            f"- N. Serie: {dispositivo.numero_serie or 'Sin registrar'}\n"
            f"- Nuevo Estado: {estado_humano}\n"
            f"- Observaciones del Técnico: {comentario}\n\n"
            f"Puede acceder a los detalles y a la bitácora completa de cambios en el siguiente enlace:\n"
            f"{url_reparacion}\n\n"
            f"IFixPos - Taller de Reparaciones"
        )

        cuerpo_html = (
            f"<div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;'>"
            f"<h2 style='color: #06b6d4;'>IFixPos - Actualización de Reparación</h2>"
            f"<p>Estimado/a <strong>{nombre_cliente}</strong>,</p>"
            f"<p>Se ha registrado un nuevo avance en la reparación de su dispositivo <strong>{nombre_marca} {nombre_modelo}</strong>:</p>"
            f"<table style='width: 100%; border-collapse: collapse; margin-bottom: 20px;'>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Equipo:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{nombre_tipo} {nombre_marca} {nombre_modelo}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>N. Serie:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{dispositivo.numero_serie or 'Sin registrar'}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Nuevo Estado:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'><span style='background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-weight: bold;'>{estado_humano}</span></td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Comentarios Técnicos:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{comentario}</td></tr>"
            f"</table>"
            f"<div style='margin: 24px 0; text-align: center;'>"
            f"<a href='{url_reparacion}' style='background-color: #06b6d4; color: #0f172a; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;'>Ver Detalles y Bitácora</a>"
            f"</div>"
            f"<p style='color: #64748b; font-size: 12px; text-align: center;'>Enlace directo: <a href='{url_reparacion}' style='color: #06b6d4;'>{url_reparacion}</a></p>"
            f"</div>"
        )

        registrar_y_enviar_notificacion_correo(
            usuario=cliente,
            asunto=asunto,
            cuerpo_texto=cuerpo_texto,
            tipo_notificacion="CAMBIO_ESTADO_REPARACION",
            cuerpo_html=cuerpo_html,
            mensaje_notificacion=f"Actualización de su dispositivo ({nombre_marca} {nombre_modelo}): su reparación ahora está en {nuevo_estado} ({estado_humano}). Observación técnica: {comentario}. Presione aquí para obtener más detalles.",
            dispositivo=dispositivo,
            adjuntar_logo=True
        )
    except Exception as e:
        logger.warning("[CU-10 Cambio Estado] Advertencia al generar o despachar notificación de cambio de estado: %s", e)


# ==============================================================================
# CU-10: Actualizar Estado de Reparación (Técnico / Taller)
# ==============================================================================

@transaction.atomic
def cambiar_estado_reparacion(
    *,
    usuario_tecnico: Usuario,
    id_reparacion: int,
    datos_validados: dict
) -> Reparacion:
    """
    CU-10: Actualizar estado de reparación (exclusivo Técnico / Taller).
    Máquina de estados que controla el avance, reanudación y retrabajo en taller:
    - Recupera la reparación validando que no esté en estado terminal con
      `obtener_reparacion_para_cambio_estado(id_reparacion)`.
    - Aplica las reglas estrictas de transición de estados:
        * Hacia 'ESPERANDO_REPUESTOS': Solo permitido si está en 'EN_REPARACION'.
        * Hacia 'FINALIZADO': Solo permitido si está en 'EN_REPARACION'. Requiere diagnóstico registrado.
        * Hacia 'EN_REPARACION': Permitido como reanudación desde 'ESPERANDO_REPUESTOS'
          o como retrabajo desde 'FINALIZADO'.
    - Actualiza el atributo etapa en Reparacion.
    - Instancia un nuevo registro inmutable en BitacoraReparacion.
    - Notifica automáticamente al cliente dueño del dispositivo por correo y campanita con link.
    - Registra el evento en LogSistema con trazabilidad del técnico ejecutor.
    """
    from workshop_app.selectors import obtener_reparacion_para_cambio_estado
    from workshop_app.models import BitacoraReparacion
    from core_app.models import Notificacion, LogSistema

    MAPA_ESTADOS_NUMERICOS = {
        'ESPERANDO_DISPOSITIVO': 1,
        'ESPERANDO_DIAGNOSTICO': 2,
        'EN_DIAGNOSTICO': 3,
        'ESPERANDO_CONFIRMACION': 4,
        'EN_REPARACION': 5,
        'FINALIZADO': 6,
        'ENTREGADO': 7,
        'CANCELADO': 8,
        'ESPERANDO_REPUESTOS': 9,
        'ESPERANDO_PAGO_DIAGNOSTICO': 10
    }

    nuevo_estado = (datos_validados.get('nuevo_estado') or '').strip().upper().replace(' ', '_')
    comentario = (datos_validados.get('comentario') or '').strip()

    if not comentario:
        raise ValidationError("El comentario técnico es obligatorio para justificar el cambio de estado.")

    reparacion = obtener_reparacion_para_cambio_estado(id_reparacion)
    etapa_actual = (reparacion.etapa or '').strip().upper().replace(' ', '_')

    if etapa_actual == nuevo_estado:
        raise ValidationError(f"La reparación ya se encuentra en el estado '{nuevo_estado}'.")

    # MÁQUINA DE ESTADOS - REGLAS DE TRANSICIÓN OPERATIVAS
    estados_terminales = ('ENTREGADO', 'ENTREGADA', 'CANCELADO', 'CANCELADA')
    if etapa_actual in estados_terminales:
        raise ValidationError(
            f"Transición no permitida: La reparación se encuentra en un estado terminal '{reparacion.etapa}'."
        )

    if etapa_actual == 'ESPERANDO_DISPOSITIVO':
        raise ValidationError(
            "Transición no permitida: El dispositivo aún no fue recepcionado físicamente en el taller."
        )

    # Regla 1: Si está en ESPERANDO_DIAGNOSTICO por primera vez (sin diagnóstico previo ni reingreso previo),
    # no se permite transicionar manualmente hasta registrar el diagnóstico inicial.
    if etapa_actual == 'ESPERANDO_DIAGNOSTICO':
        tiene_diagnostico_previo = reparacion.diagnostico_set.exists()
        veces_esperando_diag = BitacoraReparacion.objects.filter(
            id_reparacion=reparacion,
            estado_alcanzado=2
        ).count()
        if not tiene_diagnostico_previo and veces_esperando_diag < 2:
            raise ValidationError(
                "Transición no permitida: La reparación se encuentra en 'Esperando Diagnóstico' por primera vez. Debes registrar el diagnóstico técnico inicial antes de actualizar el estado manualmente."
            )

    # Regla 2: Después del primer diagnóstico (o segunda vez en adelante), el técnico puede
    # pasar libremente a cualquier otro estado operativo válido.
    estados_operativos_permitidos = (
        'ESPERANDO_DIAGNOSTICO',
        'EN_DIAGNOSTICO',
        'ESPERANDO_CONFIRMACION',
        'EN_REPARACION',
        'ESPERANDO_REPUESTOS',
        'FINALIZADO',
    )
    if nuevo_estado not in estados_operativos_permitidos:
        raise ValidationError(
            f"Transición no permitida: No es posible cambiar manualmente de '{reparacion.etapa}' hacia '{nuevo_estado}'."
        )

    if nuevo_estado == 'FINALIZADO' and not reparacion.diagnostico_set.exists():
        raise ValidationError(
            "No se puede finalizar la orden porque el equipo no cuenta con un diagnóstico técnico registrado."
        )

    # Paso 6: Actualizar etapa en Reparacion
    reparacion.etapa = nuevo_estado
    reparacion.save(update_fields=['etapa'])

    # Paso 8: Registro inmutable en BitacoraReparacion estructurado por ítems
    estado_int = MAPA_ESTADOS_NUMERICOS.get(nuevo_estado, 5)
    lineas_cambio = [
        f"Cambio de etapa: El equipo pasó de '{etapa_actual}' a '{nuevo_estado}'."
    ]
    if nuevo_estado in ('ESPERANDO_DIAGNOSTICO', 'EN_DIAGNOSTICO'):
        lineas_cambio.append(
            "Cobertura de diagnóstico: Reevaluación técnica sin cargo adicional (solo se abona el primer diagnóstico)."
        )
    lineas_cambio.append(f"Detalle técnico: {comentario}")
    comentario_enriquecido = "\n".join(lineas_cambio)
    BitacoraReparacion.objects.create(
        id_reparacion=reparacion,
        id_usuario=usuario_tecnico,
        fecha_hora=django_timezone.now(),
        estado_alcanzado=estado_int,
        comentario=comentario_enriquecido
    )

    # Hook Transaccional: Disparo del Motor de Abastecimiento Automático para urgencia de taller
    if nuevo_estado == 'ESPERANDO_REPUESTOS':
        try:
            from purchases_app.services import ejecutar_ciclo_abastecimiento_automatico
            ejecutar_ciclo_abastecimiento_automatico(
                usuario_ejecutor=usuario_tecnico,
                forzar_ejecucion=False,
                origen_disparo='TRANSACCIONAL'
            )
        except Exception as exc_abast:
            logger.warning("[Motor Abastecimiento] Advertencia en disparo transaccional desde taller: %s", exc_abast)

    # Hook Transaccional: Motor de Beneficios Post-Taller al entregar reparación
    if nuevo_estado in ('ENTREGADO', 'ENTREGADA'):
        try:
            from sales_app.services import evaluar_beneficio_post_taller
            evaluar_beneficio_post_taller(reparacion=reparacion)
        except Exception as e:
            logger.warning(f"[Motor Beneficios] Error evaluando post-taller: {e}")

    # Paso 7: Notificación automática por correo y campanita al cliente con link
    generar_y_enviar_notificacion_cambio_estado(
        reparacion=reparacion,
        nuevo_estado=nuevo_estado,
        comentario=comentario
    )

    # Paso 9: Registro de auditoría en LogSistema
    email_tecnico = getattr(usuario_tecnico, 'email', str(usuario_tecnico))
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Actualizar estado de reparación (CU-10)",
        detalle=(
            f"Reparación #{reparacion.id_reparacion} actualizada de '{etapa_actual}' a '{nuevo_estado}' "
            f"por técnico {email_tecnico}. Justificación: {comentario}"
        )[:1000],
        tipo="AUDITORIA_TALLER",
        modulo_origen="workshop_app",
        tabla_afectada="reparacion",
        id_registro_afectado=str(reparacion.id_reparacion),
        id_usuario=usuario_tecnico if hasattr(usuario_tecnico, 'pk') else None
    )

    return reparacion


# ==============================================================================
# CU-46: Entregar Dispositivo (Transacción Cierre, Deuda y Bitácora)
# ==============================================================================

def generar_y_enviar_comprobante_entrega(reparacion: Reparacion):
    """
    Función auxiliar (stub/servicio) de CU-46 para emitir y notificar el cierre
    definitivo de la reparación junto con el comprobante de entrega y certificado de garantía.
    """
    cliente = getattr(reparacion, 'id_usuario', None)
    if not cliente and hasattr(reparacion, 'id_dispositivo') and reparacion.id_dispositivo:
        cliente = getattr(reparacion.id_dispositivo, 'id_usuario', None)

    email_cliente = getattr(cliente, 'email', None) if cliente else None
    disp_nombre = str(reparacion.id_dispositivo) if reparacion.id_dispositivo else 'Equipo'

    # Stub: Registrar traza y preparar correo con garantía
    if email_cliente:
        try:
            from core_app.services import registrar_y_enviar_notificacion_correo
            from core_app.selectors import obtener_url_frontend

            url_frontend = obtener_url_frontend()
            url_reparacion = f"{url_frontend}/cliente/reparaciones/{reparacion.id_reparacion}"

            cuerpo_texto = (
                f"Hola. Confirmamos la entrega física de tu dispositivo ({disp_nombre}).\n\n"
                f"La reparación de tu equipo ha sido cerrada con éxito. Tu servicio cuenta con garantía legal de reparación.\n\n"
                f"¡Valora la reparación, te lo agradeceremos mucho! Tu opinión nos ayuda a seguir mejorando nuestro servicio técnico.\n"
                f"Puedes calificar tu experiencia aquí: {url_reparacion}\n\n"
                f"IFixPos - Taller de Reparaciones"
            )

            cuerpo_html = (
                f"<div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;'>"
                f"<h2 style='color: #06b6d4;'>IFixPos - ¡Dispositivo Entregado!</h2>"
                f"<p>Confirmamos la entrega física de tu dispositivo <strong>{disp_nombre}</strong>.</p>"
                f"<p>Tu servicio cuenta con garantía oficial de reparación.</p>"
                f"<div style='margin: 24px 0; padding: 16px; background-color: #0f172a; border: 1px solid #06b6d4; border-radius: 8px; text-align: center; color: #f8fafc;'>"
                f"<p style='font-size: 15px; margin: 0 0 12px 0; color: #38bdf8; font-weight: bold;'>⭐ ¡Valora la reparación, te lo agradeceremos mucho!</p>"
                f"<p style='font-size: 13px; margin: 0 0 16px 0; color: #cbd5e1;'>Tu opinión nos ayuda a evaluar la calidad de nuestros técnicos y brindarte un mejor servicio cada día.</p>"
                f"<a href='{url_reparacion}' style='background-color: #06b6d4; color: #0f172a; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;'>Calificar Servicio Técnico</a>"
                f"</div>"
                f"<p style='color: #64748b; font-size: 12px; text-align: center;'>Enlace directo: <a href='{url_reparacion}' style='color: #06b6d4;'>{url_reparacion}</a></p>"
                f"</div>"
            )

            registrar_y_enviar_notificacion_correo(
                usuario=cliente,
                asunto=f"¡Tu {disp_nombre} fue entregado con éxito! - Valora tu servicio (IFixPos)",
                cuerpo_texto=cuerpo_texto,
                tipo_notificacion="ENTREGA_DISPOSITIVO",
                cuerpo_html=cuerpo_html,
                mensaje_notificacion=f"¡Tu equipo ({disp_nombre}) fue entregado! ¡Valora la reparación, te lo agradeceremos mucho!",
                dispositivo=reparacion.id_dispositivo,
                adjuntar_logo=True
            )
        except Exception:
            # Fallback seguro para no romper la transacción si el mail falla
            pass


@transaction.atomic
def entregar_dispositivo_cliente(
    *,
    usuario_tecnico: Usuario,
    datos_validados: dict
) -> Reparacion:
    """
    CU-46: Entregar Dispositivo.
    Registra formalmente la restitución física del hardware al cliente:
    1. Localiza y valida la reparación vía buscar_reparacion_para_entrega.
    2. Regla Contable Estricta: Verifica que el saldo deudor sea 0 (estado PAGADO).
    3. Cierre del Ciclo: Modifica etapa a 'ENTREGADO' de forma inmutable.
    4. Bitácora: Asienta el evento en BitacoraReparacion (estado 7 = ENTREGADO).
    5. Auditoría: Registra el log en LogSistema y despacha la notificación final.
    """
    from workshop_app.selectors import buscar_reparacion_para_entrega
    from workshop_app.models import BitacoraReparacion
    from core_app.models import LogSistema
    from sales_app.services import _calcular_total_operacion

    # Paso 1 y 2: Búsqueda y validación de aptitud para liberación
    codigo_seguridad = datos_validados.get('codigo_seguridad')
    dni_cliente = datos_validados.get('dni_cliente')

    reparacion = buscar_reparacion_para_entrega(
        usuario_ejecutor=usuario_tecnico,
        codigo_seguridad=codigo_seguridad,
        dni_cliente=dni_cliente
    )

    # Paso 3: Regla Contable Estricta - Inexistencia de saldos deudores
    # Comprobar si la reparación fue pagada
    etapa_limpia = (reparacion.etapa or '').strip().upper().replace(' ', '_')
    venta_vinculada = getattr(reparacion, 'id_venta', None)

    esta_saldada = False
    if etapa_limpia == 'PAGADO':
        esta_saldada = True
    elif venta_vinculada and str(venta_vinculada.estado_venta).strip().upper() == 'PAGADO':
        esta_saldada = True
    else:
        # Si no tiene venta ni etapa PAGADO, verificar si el costo total es cero
        total = _calcular_total_operacion(reparacion)
        if total == Decimal('0.00'):
            esta_saldada = True

    if not esta_saldada:
        raise ValidationError("Operación rechazada. La reparación posee un saldo deudor pendiente de cobro.")

    # Paso 5: Transicionar irrevocablemente el estado a 'ENTREGADO'
    reparacion.etapa = 'ENTREGADO'
    reparacion.fecha_entrega = django_timezone.now().date()
    reparacion.save(update_fields=['etapa', 'fecha_entrega'])

    # Paso 6: Asentar en BitacoraReparacion (estado 7 = ENTREGADO) estructurado por ítems
    comentarios_adicionales = (datos_validados.get('comentarios_entrega') or '').strip()
    texto_bitacora = (
        f"Cierre de orden: El equipo fue entregado físicamente al cliente finalizando formalmente el servicio técnico.\n"
        f"Observaciones de entrega: {comentarios_adicionales or 'Conformidad de entrega sin observaciones adicionales.'}"
    )
    BitacoraReparacion.objects.create(
        id_reparacion=reparacion,
        id_usuario=usuario_tecnico,
        fecha_hora=django_timezone.now(),
        estado_alcanzado=7,  # ENTREGADO
        comentario=texto_bitacora.strip()[:1000]
    )

    # Paso 7: Auditoría en LogSistema y notificación final
    email_tecnico = getattr(usuario_tecnico, 'email', str(usuario_tecnico))
    disp_info = str(reparacion.id_dispositivo) if reparacion.id_dispositivo else 'N/A'
    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Entregar Dispositivo (CU-46)",
        detalle=(
            f"Entrega física del hardware ({disp_info}) registrada por {email_tecnico} "
            f"para Orden #{reparacion.id_reparacion}. Proceso cerrado en estado terminal ENTREGADO."
        )[:1000],
        tipo="AUDITORIA_TALLER",
        modulo_origen="workshop_app",
        tabla_afectada="reparacion",
        id_registro_afectado=str(reparacion.id_reparacion),
        id_usuario=usuario_tecnico if hasattr(usuario_tecnico, 'pk') else None
    )

    generar_y_enviar_comprobante_entrega(reparacion)

    return reparacion


@transaction.atomic
def abonar_diagnostico_reparacion_cliente(
    *,
    usuario_ejecutor: Usuario,
    id_reparacion: int,
    datos_validados: dict
) -> dict:
    """
    Permite al cliente (o personal autorizado) abonar desde la plataforma el costo del
    diagnóstico inicial pendiente cuando la reparación se encuentra en 'ESPERANDO_PAGO_DIAGNOSTICO'
    o 'ESPERANDO_DISPOSITIVO'.
    - Regla de negocio innegociable: SOLO el primer diagnóstico se paga; si ya fue abonado
      o ya posee diagnósticos emitidos, rechaza la operación.
    - Si la reparación estaba en 'ESPERANDO_PAGO_DIAGNOSTICO', transiciona automáticamente
      a 'ESPERANDO_DIAGNOSTICO'.
    - Genera el comprobante fiscal PDF y registra los eventos en BitacoraReparacion.
    """
    from rest_framework.exceptions import PermissionDenied, NotFound
    from core_app.selectors import obtener_costo_diagnostico_base
    from core_app.constantes import CodigoMedioPago, deducir_codigo_medio_pago
    from sales_app.models import Venta, Pago, MedioPago
    from sales_app.services import generar_comprobante_fiscal, enviar_correo_confirmacion_diagnostico

    try:
        reparacion = Reparacion.objects.select_for_update(of=('self',)).select_related(
            'id_dispositivo',
            'id_dispositivo__id_usuario',
            'id_dispositivo__id_modelo',
            'id_dispositivo__id_modelo__id_marca',
        ).get(id_reparacion=id_reparacion)
    except Reparacion.DoesNotExist:
        raise NotFound("La orden de reparación especificada no existe.")

    # Seguridad horizontal: propietario del dispositivo o personal del taller
    rol_obj = getattr(usuario_ejecutor, 'id_rol', None) or getattr(usuario_ejecutor, 'rol', None)
    rol_cod = (getattr(rol_obj, 'codigo', '') or '').upper()
    es_personal = rol_cod in ('ADMIN', 'TECNICO')
    cliente_titular = getattr(reparacion.id_dispositivo, 'id_usuario', None)
    if not es_personal and (not cliente_titular or cliente_titular.id_usuario != usuario_ejecutor.id_usuario):
        raise PermissionDenied("No posee permisos para gestionar pagos sobre esta reparación.")

    etapa_actual = (reparacion.etapa or '').strip().upper().replace(' ', '_')
    if etapa_actual not in ('ESPERANDO_PAGO_DIAGNOSTICO', 'ESPERANDO_DISPOSITIVO'):
        raise ValidationError(
            "Esta reparación ya no requiere pago de diagnóstico inicial (solo se abona el primer diagnóstico)."
        )

    # Verificar que no haya tenido diagnósticos previos
    if reparacion.diagnostico_set.exists():
        raise ValidationError(
            "El primer diagnóstico ya fue realizado previamente. Los nuevos diagnósticos o reevaluaciones no tienen costo."
        )

    costo_base = obtener_costo_diagnostico_base()
    venta = reparacion.id_venta

    if not venta:
        venta = Venta.objects.create(
            id_usuario=cliente_titular or usuario_ejecutor,
            metodo_entrega='PRESENCIAL',
            fecha_venta=django_timezone.now().date(),
            estado_venta='PENDIENTE',
            codigo_sec=reparacion.codigo_sec or uuid.uuid4().hex[:8].upper(),
            monto_subtotal=costo_base,
            costo_envio=Decimal('0.00'),
            id_direccion_envio=None
        )
        reparacion.id_venta = venta
        reparacion.save(update_fields=['id_venta'])
    elif not venta.monto_subtotal or venta.monto_subtotal <= Decimal('0.00'):
        venta.monto_subtotal = costo_base
        venta.save(update_fields=['monto_subtotal'])

    estado_venta_actual = str(venta.estado_venta or '').strip().upper()
    if estado_venta_actual in ('PAGADO', 'PAGADA'):
        if etapa_actual == 'ESPERANDO_PAGO_DIAGNOSTICO':
            reparacion.etapa = 'ESPERANDO_DIAGNOSTICO'
            reparacion.save(update_fields=['etapa'])
        raise ValidationError("El diagnóstico inicial de esta reparación ya se encuentra abonado.")
    elif estado_venta_actual in ('CANCELADO', 'CANCELADA'):
        venta.estado_venta = 'PENDIENTE'
        venta.save(update_fields=['estado_venta'])

    accion = str(datos_validados.get('accion') or 'CONFIRMAR').strip().upper()
    if accion == 'PREPARAR':
        return {
            'id_reparacion': reparacion.id_reparacion,
            'id_venta': venta.id_venta,
            'monto_total': float(venta.monto_subtotal),
            'etapa': reparacion.etapa,
            'estado_pago': venta.estado_venta
        }

    # Resolver medio de pago elegido
    medio_raw = str(datos_validados.get('medio_pago') or 'MERCADO PAGO').strip()
    medio_obj = None
    if medio_raw.isdigit():
        medio_obj = MedioPago.objects.filter(id_mediopago=int(medio_raw)).first()
    if not medio_obj:
        medio_obj = (
            MedioPago.objects.filter(nombre_medio_pago__iexact=medio_raw).first()
            or MedioPago.objects.filter(codigo__iexact=medio_raw).first()
        )
    if not medio_obj:
        cod_ded = deducir_codigo_medio_pago(medio_raw)
        medio_obj = MedioPago.objects.filter(codigo=cod_ded).first()
    if not medio_obj:
        medio_obj = MedioPago.objects.filter(estado=True).first() or MedioPago.objects.create(
            codigo=CodigoMedioPago.MERCADO_PAGO,
            nombre_medio_pago=medio_raw.upper()[:50],
            estado=True,
            recargo=Decimal('0.00')
        )

    monto_abonado = Decimal(str(venta.monto_subtotal or costo_base))
    cod_op = str(datos_validados.get('cod_operacion') or f"PLAT-{reparacion.codigo_sec or reparacion.id_reparacion}").strip()

    pago = Pago.objects.create(
        id_venta=venta,
        medio_pago=medio_obj,
        monto_pagado=monto_abonado,
        fecha_pago=django_timezone.now().date(),
        cod_operacion=cod_op,
        detalle=f"Abono de diagnóstico inicial desde la plataforma para Reparación #{reparacion.id_reparacion}"
    )

    venta.estado_venta = 'PAGADA'
    venta.save(update_fields=['estado_venta'])

    if etapa_actual == 'ESPERANDO_PAGO_DIAGNOSTICO':
        reparacion.etapa = 'ESPERANDO_DIAGNOSTICO'
        reparacion.save(update_fields=['etapa'])
        estado_alc = 2
        comentario_bitacora = (
            f"Transacción en plataforma: Abono de costo de diagnóstico (${monto_abonado:,.2f}) acreditado mediante {medio_obj.nombre_medio_pago}.\n"
            f"Cobertura de diagnóstico: Pago único acreditado (solo se abona el primer diagnóstico; evaluaciones posteriores sin cargo).\n"
            f"Cambio de etapa: El equipo avanza automáticamente a 'Esperando Diagnóstico'."
        )
    else:
        estado_alc = 1
        comentario_bitacora = (
            f"Transacción en plataforma: Abono de costo de diagnóstico (${monto_abonado:,.2f}) acreditado mediante {medio_obj.nombre_medio_pago}.\n"
            f"Cobertura de diagnóstico: Pago único acreditado (solo se abona el primer diagnóstico; evaluaciones posteriores sin cargo).\n"
            f"Estado actual: Pendiente de recepción física del equipo en mostrador."
        )

    BitacoraReparacion.objects.create(
        id_reparacion=reparacion,
        id_usuario=usuario_ejecutor,
        fecha_hora=django_timezone.now(),
        estado_alcanzado=estado_alc,
        comentario=comentario_bitacora
    )

    ruta_factura = None
    try:
        ruta_factura = generar_comprobante_fiscal(pago, venta)
        BitacoraReparacion.objects.create(
            id_reparacion=reparacion,
            id_usuario=usuario_ejecutor,
            fecha_hora=django_timezone.now(),
            estado_alcanzado=estado_alc,
            comentario=(
                f"Comprobante fiscal emitido: N° 0001-{pago.id_pago:08d} por concepto de 'Pago de Diagnóstico' (${monto_abonado:,.2f}).\n"
                f"Archivo: Factura archivada en el sistema."
            )
        )
        enviar_correo_confirmacion_diagnostico(
            reparacion=reparacion,
            pago=pago,
            ruta_pdf=ruta_factura
        )
    except Exception as exc_fact:
        logger.warning("[Abono Diagnóstico Plataforma] Advertencia al emitir factura/correo: %s", exc_fact)

    LogSistema.objects.create(
        fecha_hora=django_timezone.now(),
        accion="Abono de Diagnóstico Inicial en Plataforma",
        detalle=(
            f"El usuario {usuario_ejecutor.email} abonó el diagnóstico inicial (${monto_abonado:,.2f}) "
            f"de la Reparación #{reparacion.id_reparacion} mediante {medio_obj.nombre_medio_pago}. "
            f"Etapa resultante: '{reparacion.etapa}'."
        )[:1000],
        tipo="AUDITORIA_TALLER",
        modulo_origen="workshop_app",
        tabla_afectada="reparacion",
        id_registro_afectado=str(reparacion.id_reparacion),
        id_usuario=usuario_ejecutor
    )

    return {
        'id_reparacion': reparacion.id_reparacion,
        'id_venta': venta.id_venta,
        'monto_total': float(monto_abonado),
        'etapa': reparacion.etapa,
        'estado_pago': venta.estado_venta,
        'ruta_comprobante': ruta_factura
    }


# ==============================================================================
# RE-EXPORTACIÓN DE SUBMÓDULOS DE SERVICIOS (Modularización §3.6)
# ==============================================================================

from workshop_app.services_calificaciones import calificar_reparacion  # noqa: E402, F401
from workshop_app.services_metricas import (  # noqa: E402, F401
    generar_auditoria_reporte_conversion,
    generar_auditoria_reporte_eficiencia,
    generar_auditoria_productividad,
    generar_auditoria_reporte_satisfaccion,
)







