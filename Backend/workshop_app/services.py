import os
import secrets
import string
from django.conf import settings
from django.utils import timezone as django_timezone
from django.db import transaction
from rest_framework.exceptions import ValidationError, PermissionDenied
from workshop_app.models import Dispositivo, CategoriaReparacion, Reparacion, BitacoraReparacion
from users_app.models import Usuario
from catalog_app.models import ModeloDispositivo, Marca, TipoDispositivo
from core_app.models import LogSistema

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
    hora_actual = django_timezone.now().time()

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

    ext = os.path.splitext(archivo.name)[1].lower()
    formatos_permitidos = ['.png', '.jpg', '.jpeg', '.webp', '.jfif', '.avif', '.heic', '.heif']
    if ext not in formatos_permitidos:
        raise ValidationError(f"Formato de imagen no permitido. Solo se admiten: {', '.join(formatos_permitidos)}")

    if hasattr(archivo, 'size') and archivo.size > 5 * 1024 * 1024:
        raise ValidationError("El archivo de imagen supera el tamaño máximo permitido de 5 MB.")


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

    cliente = Usuario.objects.filter(pk=id_cliente_final).first()
    if not cliente:
        raise ValidationError("El cliente especificado no existe.")

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
    hora_actual = django_timezone.now().time()
    LogSistema.objects.create(
        fecha_hora=hora_actual,
        accion=f"Alta de dispositivo {dispositivo.id_dispositivo}",
        detalle=f"Dispositivo registrado para cliente ID {cliente.id_usuario} (Modelo: {modelo.nombre}, Serie: {nro_serie or 'S/N'}).",
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
        fecha_hora=django_timezone.now().time(),
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
        fecha_hora=django_timezone.now().time(),
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
        fecha_hora=django_timezone.now().time(),
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

        asunto = f"Orden de Servicio #{reparacion.id_reparacion} - Ingreso de Reparación (IFixPos)"
        cuerpo_texto = (
            f"Estimado/a {nombre_cliente},\n\n"
            f"Se ha iniciado formalmente la Orden de Servicio #{reparacion.id_reparacion} para su equipo.\n\n"
            f"Detalles del Ingreso:\n"
            f"- Dispositivo: {nombre_tipo} {nombre_marca} {nombre_modelo}\n"
            f"- Nro. de Serie: {dispositivo.numero_serie or 'S/N'}\n"
            f"- Estado Inicial: {reparacion.etapa}\n"
            f"- Código de Seguridad / Token: {reparacion.codigo_sec}\n"
            f"- Problema Informado: {reparacion.desc_cliente}\n\n"
            f"Presente el código de seguridad '{reparacion.codigo_sec}' en el mostrador del taller para confirmar la entrega física del equipo.\n\n"
            f"IFixPos - Taller de Reparaciones"
        )

        cuerpo_html = (
            f"<div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;'>"
            f"<h2 style='color: #06b6d4;'>IFixPos - Orden de Servicio #{reparacion.id_reparacion}</h2>"
            f"<p>Estimado/a <strong>{nombre_cliente}</strong>,</p>"
            f"<p>Confirmamos la apertura del servicio técnico para su dispositivo:</p>"
            f"<table style='width: 100%; border-collapse: collapse; margin-bottom: 20px;'>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Equipo:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{nombre_tipo} {nombre_marca} {nombre_modelo}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Nro. Serie:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{dispositivo.numero_serie or 'S/N'}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Estado:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{reparacion.etapa}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Código de Seguridad:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'><span style='background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-weight: bold;'>{reparacion.codigo_sec}</span></td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Descripción:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{reparacion.desc_cliente}</td></tr>"
            f"</table>"
            f"<p style='color: #64748b; font-size: 13px;'>Presente este código en el mostrador físico del taller al entregar su equipo.</p>"
            f"</div>"
        )

        registrar_y_enviar_notificacion_correo(
            usuario=cliente,
            asunto=asunto,
            cuerpo_texto=cuerpo_texto,
            tipo_notificacion="REPARACION",
            cuerpo_html=cuerpo_html,
            mensaje_notificacion=f"Nueva orden de servicio #{reparacion.id_reparacion} generada para su dispositivo.",
            codigo_sensible=reparacion.codigo_sec,
            adjuntar_logo=True
        )
    except Exception as e:
        print(f"[CU-26 Remito] Advertencia al generar o despachar remito: {e}")


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

    # Paso 7: Registro en Bitácora Técnica
    BitacoraReparacion.objects.create(
        id_reparacion=reparacion,
        id_usuario=usuario_ejecutor,
        fecha_hora=django_timezone.now().time(),
        estado_alcanzado=estado_alcanzado_int,
        comentario="Apertura de orden de servicio"
    )

    # Paso 8: Auditoría y Despacho de Remito de Ingreso
    email_ejecutor = getattr(usuario_ejecutor, 'email', str(usuario_ejecutor))
    LogSistema.objects.create(
        fecha_hora=django_timezone.now().time(),
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

        asunto = f"Comprobante de Recepción Física - Orden #{reparacion.id_reparacion} (IFixPos)"
        cuerpo_texto = (
            f"Estimado/a {nombre_cliente},\n\n"
            f"Confirmamos la recepción física de su equipo en nuestro mostrador para la Orden #{reparacion.id_reparacion}.\n\n"
            f"Detalles de la Recepción:\n"
            f"- Dispositivo: {nombre_tipo} {nombre_marca} {nombre_modelo}\n"
            f"- Nro. de Serie: {dispositivo.numero_serie or 'S/N'}\n"
            f"- Estado Actual: Esperando Diagnóstico\n"
            f"- Código de Servicio: {reparacion.codigo_sec}\n"
            f"- Problemas Reportados: {reparacion.desc_cliente}\n"
            f"- Estado Estético / Observaciones Físicas: {obs_texto}\n\n"
            f"Su dispositivo ha ingresado formalmente a la fila de diagnóstico técnico. Le notificaremos a la brevedad.\n\n"
            f"IFixPos - Taller de Reparaciones"
        )

        cuerpo_html = (
            f"<div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;'>"
            f"<h2 style='color: #06b6d4;'>IFixPos - Comprobante de Recepción Física</h2>"
            f"<p>Estimado/a <strong>{nombre_cliente}</strong>,</p>"
            f"<p>Su equipo ha sido recibido en el mostrador del taller y ha pasado a la etapa de <strong>Esperando Diagnóstico</strong>:</p>"
            f"<table style='width: 100%; border-collapse: collapse; margin-bottom: 20px;'>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Orden de Servicio:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>#{reparacion.id_reparacion}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Equipo:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{nombre_tipo} {nombre_marca} {nombre_modelo}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Nro. Serie:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{dispositivo.numero_serie or 'S/N'}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Estado Físico / Estético:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{obs_texto}</td></tr>"
            f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Falla Informada:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{reparacion.desc_cliente}</td></tr>"
            f"</table>"
            f"<p style='color: #64748b; font-size: 13px;'>Este comprobante certifica la tenencia física del equipo y su condición estética al ingreso.</p>"
            f"</div>"
        )

        registrar_y_enviar_notificacion_correo(
            usuario=cliente,
            asunto=asunto,
            cuerpo_texto=cuerpo_texto,
            tipo_notificacion="REPARACION",
            cuerpo_html=cuerpo_html,
            mensaje_notificacion=f"Dispositivo recepcionado físicamente en mostrador para la orden #{reparacion.id_reparacion}.",
            codigo_sensible=reparacion.codigo_sec,
            adjuntar_logo=True
        )
    except Exception as e:
        print(f"[CU-45 Comprobante] Advertencia al generar o despachar comprobante: {e}")


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
    reparacion.etapa = 'ESPERANDO_DIAGNOSTICO'
    reparacion.hora_recepcion = django_timezone.now().time()
    reparacion.save()

    # Actualizar relación M2M de categorías si fueron especificadas
    if 'ids_categorias' in datos_validados:
        reparacion.categorias.set(datos_validados['ids_categorias'])

    # Paso 6: Registro en Bitácora de Reparación (único lugar donde persisten las observaciones físicas)
    comentario_bitacora = f"Equipo recepcionado en mostrador. Estado físico: {datos_validados['observaciones_fisicas']}"
    BitacoraReparacion.objects.create(
        id_reparacion=reparacion,
        id_usuario=usuario_tecnico,
        fecha_hora=django_timezone.now().time(),
        estado_alcanzado=2,  # 2: ESPERANDO_DIAGNOSTICO
        comentario=comentario_bitacora
    )

    # Paso 7: Auditoría en LogSistema y Despacho de Comprobante
    email_tecnico = getattr(usuario_tecnico, 'email', str(usuario_tecnico))
    LogSistema.objects.create(
        fecha_hora=django_timezone.now().time(),
        accion="Recepción física de dispositivo (CU-45)",
        detalle=(
            f"Reparación #{reparacion.id_reparacion} recepcionada físicamente en mostrador por {email_tecnico}. "
            f"Transición a 'ESPERANDO_DIAGNOSTICO'. Estado físico: {datos_validados['observaciones_fisicas']}."
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

    # Paso 2: Instanciar y guardar Diagnóstico técnico
    diagnostico = Diagnostico.objects.create(
        id_reparacion=reparacion,
        descripcion_falla=datos_validados['descripcion_falla'],
        fecha_diagnostico=django_timezone.now().date(),
        costo_diagnostico=datos_validados['costo_mano_obra']
    )

    # Paso 3: Insumos requeridos para el presupuesto (congelando precio de venta actual)
    insumos_data = datos_validados.get('insumos', [])
    for item in insumos_data:
        producto = Producto.objects.get(pk=item['id_producto'])
        DetalleInsumoReparacion.objects.create(
            id_reparacion=reparacion,
            id_producto=producto,
            cantidad=item['cantidad'],
            precio_unitario=producto.precio_venta
        )

    # Paso 4: Transición de Estado de Reparación
    reparacion.etapa = 'ESPERANDO_CONFIRMACION'
    reparacion.save()

    # Paso 5: Registro inmutable en BitacoraReparacion
    # Nota: estado_alcanzado se almacena numéricamente en BD (4: ESPERANDO_CONFIRMACION)
    BitacoraReparacion.objects.create(
        id_reparacion=reparacion,
        id_usuario=usuario_tecnico,
        fecha_hora=django_timezone.now().time(),
        estado_alcanzado=4,  # 4: ESPERANDO_CONFIRMACION
        comentario="Carga de diagnóstico"
    )

    # Paso 6: Notificación automática al cliente y Auditoría en LogSistema
    cliente = reparacion.id_dispositivo.id_usuario
    Notificacion.objects.create(
        id_usuario=cliente,
        mensaje="Su presupuesto ya se encuentra disponible para revisión",
        tipo="DIAGNOSTICO_DISPONIBLE",
        fecha_envio=django_timezone.now().date(),
        leida=False,
        id_dispositivo=reparacion.id_dispositivo
    )

    email_tecnico = getattr(usuario_tecnico, 'email', str(usuario_tecnico))
    LogSistema.objects.create(
        fecha_hora=django_timezone.now().time(),
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
        comentario_bitacora = "Diagnóstico rechazado" + (f": {comentarios}" if comentarios else "")

    elif decision == 'ACEPTAR':
        reparacion.etapa = 'EN_REPARACION'
        estado_alcanzado_int = 5  # 5: EN_REPARACION
        comentario_bitacora = "Diagnóstico aceptado" + (f": {comentarios}" if comentarios else "")

        # Recuperar insumos presupuestados en el diagnóstico
        insumos_presupuestados = list(
            DetalleInsumoReparacion.objects.filter(id_reparacion=reparacion).select_related('id_producto')
        )

        # Calcular monto subtotal de insumos
        monto_subtotal = Decimal('0.00')
        for insumo in insumos_presupuestados:
            precio = Decimal(str(insumo.precio_unitario or 0))
            cant = Decimal(str(insumo.cantidad or 0))
            monto_subtotal += precio * cant

        # Resolver método de entrega y costo de envío
        metodo_entrega = str(datos_validados.get('metodo_entrega') or 'RETIRO').strip().upper()
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
        nombre_pago = str(datos_validados.get('metodo_pago') or 'EFECTIVO').strip()
        medio_pago_obj = None
        if nombre_pago.isdigit():
            medio_pago_obj = MedioPago.objects.filter(id_mediopago=int(nombre_pago)).first()
        if not medio_pago_obj:
            medio_pago_obj = MedioPago.objects.filter(nombre_medio_pago__iexact=nombre_pago).first()
        if not medio_pago_obj:
            medio_pago_obj = MedioPago.objects.filter(nombre_medio_pago__icontains=nombre_pago).first()
        if not medio_pago_obj:
            medio_pago_obj = MedioPago.objects.create(
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
        fecha_hora=django_timezone.now().time(),
        estado_alcanzado=estado_alcanzado_int,
        comentario=comentario_bitacora
    )

    # Paso 7: Notificación interna dirigida al técnico asignado
    tecnico = reparacion.id_usuario
    if tecnico:
        decision_verbo = "aceptó" if decision == 'ACEPTAR' else "rechazó"
        modelo_nombre = (
            reparacion.id_dispositivo.id_modelo.nombre
            if reparacion.id_dispositivo and reparacion.id_dispositivo.id_modelo
            else "Equipo"
        )
        Notificacion.objects.create(
            id_usuario=tecnico,
            mensaje=f"El cliente {decision_verbo} el presupuesto para la reparación #{reparacion.id_reparacion} ({modelo_nombre}).",
            tipo=f"DECISION_REPARACION_{decision}",
            fecha_envio=django_timezone.now().date(),
            leida=False,
            id_dispositivo=reparacion.id_dispositivo
        )

    # Paso 8: Auditoría en LogSistema para trazabilidad
    email_cliente = getattr(usuario_cliente, 'email', str(usuario_cliente))
    venta_info = f", Venta #{reparacion.id_venta_id} generada en estado PENDIENTE" if reparacion.id_venta else ""
    LogSistema.objects.create(
        fecha_hora=django_timezone.now().time(),
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

