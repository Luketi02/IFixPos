
from typing import Any
from typing import Optional
from django.db.models import QuerySet
from core_app.models import ConfiguracionSistema, Notificacion, CopiaSeguridad

def obtener_configuracion_texto(clave: str, fallback: str = "noreply@ifixpos.com") -> str:
    """Obtiene un valor de texto de ConfiguracionSistema. Fail-safe a fallback."""
    try:
        config = ConfiguracionSistema.objects.get(clave=clave)
        val = str(config.valor).strip()
        return val if val and val != "S/N" else fallback
    except ConfiguracionSistema.DoesNotExist:
        return fallback

def obtener_configuracion_bool(clave: str) -> bool:
    """Obtiene un flag booleano de ConfiguracionSistema. Fail-safe a False."""
    try:
        config = ConfiguracionSistema.objects.get(clave=clave)
        val = str(config.valor).strip().lower()
        return val in ('true', '1', 't', 'y', 'yes')
    except ConfiguracionSistema.DoesNotExist:
        return False

def obtener_configuracion_int(clave: str, fallback: int = 0) -> int:
    """Obtiene un valor numérico entero de ConfiguracionSistema. Fail-safe a fallback."""
    try:
        config = ConfiguracionSistema.objects.get(clave=clave)
        val = str(config.valor).strip()
        return int(val) if val.isdigit() or (val.startswith('-') and val[1:].isdigit()) else fallback
    except (ConfiguracionSistema.DoesNotExist, ValueError):
        return fallback

def obtener_email_emisor() -> str:
    """Obtiene la casilla de correo configurada para envíos del sistema con fallback."""
    from django.conf import settings
    fallback = getattr(settings, 'DEFAULT_FROM_EMAIL', 'lucas.mino1508@gmail.com')
    emisor = obtener_configuracion_texto('emailInfo', fallback=fallback)
    if not emisor or emisor == 'S/N' or '@' not in emisor:
        return fallback
    return emisor

def obtener_email_soporte() -> str:
    """Obtiene la casilla de correo de soporte al cliente con fail-safe."""
    try:
        config = ConfiguracionSistema.objects.filter(id_config=23).first()
        if config and config.valor and str(config.valor).strip():
            return str(config.valor).strip()
    except Exception:
        pass
    return obtener_configuracion_texto('emailSoporte', fallback='soporte@ifixnet.com')

def obtener_url_frontend() -> str:
    """Obtiene la URL base del Frontend configurada en el sistema o fallback a localhost:5173."""
    from django.conf import settings
    fallback = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    url = obtener_configuracion_texto('urlFrontend', fallback=fallback)
    return str(url).rstrip('/')

def obtener_mercadopago_access_token() -> str:
    """
    Obtiene el Access Token de Mercado Pago configurado en la base de datos (ConfiguracionSistema).
    Si no está configurado o está vacío/'S/N', hace fallback seguro a settings.MERCADOPAGO_ACCESS_TOKEN.
    """
    from django.conf import settings
    fallback = getattr(settings, 'MERCADOPAGO_ACCESS_TOKEN', '') or ''
    token = obtener_configuracion_texto('mpAccessToken', fallback=fallback)
    return token if token and token != 'S/N' else fallback

def obtener_mercadopago_public_key() -> str:
    """
    Obtiene la Public Key de Mercado Pago configurada en la base de datos (ConfiguracionSistema).
    Si no está configurada o está vacía/'S/N', hace fallback a settings.MERCADOPAGO_PUBLIC_KEY.
    """
    from django.conf import settings
    fallback = getattr(settings, 'MERCADOPAGO_PUBLIC_KEY', '') or ''
    key = obtener_configuracion_texto('mpPublicKey', fallback=fallback)
    return key if key and key != 'S/N' else fallback

def obtener_mercadopago_webhook_secret() -> str:
    """
    Obtiene el Webhook Secret de Mercado Pago configurado en la base de datos.
    Fallback a settings.MERCADOPAGO_WEBHOOK_SECRET.
    """
    from django.conf import settings
    fallback = getattr(settings, 'MERCADOPAGO_WEBHOOK_SECRET', '') or ''
    secret = obtener_configuracion_texto('mpWebhookSecret', fallback=fallback)
    return secret if secret and secret != 'S/N' else fallback

# Tipos de notificaciones que se envían por correo para códigos o verificaciones
# y que no deben aparecer en la campanita del sistema
TIPOS_EXCLUIDOS_CAMPANITA = [
    'ACTIVACION',
    'RECUPERACION',
    'OTP',
    'VERIFICACION',
    'CODIGO_VERIFICACION',
]


def obtener_notificaciones_usuario(*args, usuario: Optional[Any] = None) -> QuerySet[Notificacion]:
    """
    Retorna todas las notificaciones filtradas por usuario garantizando la Seguridad Horizontal.
    Excluye códigos y verificaciones por correo (no pertenecen a la campanita).
    Ordenadas por fecha_envio descendente y secundariamente por id_notificacion descendente.
    """
    u = usuario if usuario is not None else (args[0] if args else None)
    if u is None:
        return Notificacion.objects.none()
    user_id = getattr(u, 'id_usuario', None) or getattr(u, 'id', None) or u
    return (
        Notificacion.objects
        .filter(id_usuario_id=user_id)
        .exclude(tipo__in=TIPOS_EXCLUIDOS_CAMPANITA)
        .order_by('-fecha_envio', '-id_notificacion')
    )


def contar_notificaciones_no_leidas(*, usuario: Any) -> int:
    """
    Retorna la cantidad entera (count) de notificaciones no leídas (leida=False) para un usuario.
    Excluye alertas de verificación y códigos OTP.
    """
    user_id = getattr(usuario, 'id_usuario', None) or getattr(usuario, 'id', None) or usuario
    return (
        Notificacion.objects
        .filter(id_usuario_id=user_id, leida=False)
        .exclude(tipo__in=TIPOS_EXCLUIDOS_CAMPANITA)
        .count()
    )



def obtener_notificacion_usuario(*, usuario: Any, id_notificacion: int) -> Notificacion:
    """
    Busca la notificación específica.
    Si no existe, levanta ObjectDoesNotExist.
    Si el id_usuario no coincide con el del usuario ejecutor, levanta PermissionDenied.
    """
    from django.core.exceptions import ObjectDoesNotExist
    from rest_framework.exceptions import PermissionDenied

    try:
        notificacion = Notificacion.objects.get(pk=id_notificacion)
    except Notificacion.DoesNotExist:
        raise ObjectDoesNotExist(f"No existe ninguna notificación con ID {id_notificacion}.")

    user_id = getattr(usuario, 'id_usuario', None) or getattr(usuario, 'id', None) or usuario
    owner_id = notificacion.id_usuario_id
    if hasattr(owner_id, 'id_usuario'):
        owner_id = owner_id.id_usuario

    if owner_id != (getattr(user_id, 'id_usuario', None) or getattr(user_id, 'id', None) or user_id):
        raise PermissionDenied("Acceso Denegado: Esta notificación pertenece a otro usuario.")

    return notificacion


def obtener_notificacion_por_id(id_notificacion: int) -> Optional[Notificacion]:
    """Busca una notificación por su ID único."""
    try:
        return Notificacion.objects.get(id_notificacion=id_notificacion)
    except Notificacion.DoesNotExist:
        return None

def obtener_todas_las_configuraciones() -> dict:
    """
    Consulta todos los registros de ConfiguracionSistema y
    retorna un diccionario simple: {clave: valor} para poblar el frontend.
    Incluye fallback a settings para llaves de pasarela si no estuviesen presentes.
    """
    from django.conf import settings
    configuraciones = ConfiguracionSistema.objects.all()
    res = {
        config.clave: config.valor
        for config in configuraciones
        if config.clave is not None
    }
    if 'mpPublicKey' not in res or not res['mpPublicKey'] or res['mpPublicKey'] == 'S/N':
        res['mpPublicKey'] = getattr(settings, 'MERCADOPAGO_PUBLIC_KEY', '') or 'S/N'
    if 'mpAccessToken' not in res or not res['mpAccessToken'] or res['mpAccessToken'] == 'S/N':
        res['mpAccessToken'] = getattr(settings, 'MERCADOPAGO_ACCESS_TOKEN', '') or 'S/N'
    if 'mpWebhookSecret' not in res or not res['mpWebhookSecret'] or res['mpWebhookSecret'] == 'S/N':
        res['mpWebhookSecret'] = getattr(settings, 'MERCADOPAGO_WEBHOOK_SECRET', '') or 'S/N'

    return res


# ==============================================================================
# CU-40: FILTRAR LOGS DE AUDITORÍA (SELECTORS)
# ==============================================================================

def filtrar_logs_auditoria(
    *,
    usuario_ejecutor: Any,
    filtros: dict
) -> QuerySet:
    """
    CU-40: Filtrar Logs de Auditoría.
    Permite al Administrador auditar la trazabilidad de eventos del sistema.
    Criterios: Usuario responsable, tipo de acción, módulo origen, tabla afectada y búsqueda de texto.
    """
    from rest_framework.exceptions import PermissionDenied
    from django.db.models import Q
    from core_app.models import LogSistema

    rol = getattr(usuario_ejecutor, 'id_rol', None) or getattr(usuario_ejecutor, 'rol', None)
    codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
    nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
    if codigo_rol not in ['ADMIN', 'ADMINISTRADOR'] and nombre_rol not in ['administrador', 'admin']:
        raise PermissionDenied("Se requiere rol de Administrador para auditar los registros de log del sistema.")

    qs = LogSistema.objects.select_related(
        'id_usuario',
        'id_usuario__id_rol',
        'id_usuario__perfilusuario'
    ).order_by('-id_log')

    texto_busqueda = str(filtros.get('buscar') or filtros.get('texto_busqueda') or '').strip()
    if texto_busqueda:
        qs = qs.filter(
            Q(accion__icontains=texto_busqueda) |
            Q(detalle__icontains=texto_busqueda) |
            Q(id_registro_afectado__icontains=texto_busqueda)
        )

    tipo = str(filtros.get('tipo') or filtros.get('accion_tipo') or '').strip()
    if tipo:
        qs = qs.filter(tipo__iexact=tipo)

    modulo_origen = str(filtros.get('modulo_origen') or '').strip()
    if modulo_origen:
        qs = qs.filter(modulo_origen__iexact=modulo_origen)

    tabla_afectada = str(filtros.get('tabla_afectada') or '').strip()
    if tabla_afectada:
        qs = qs.filter(tabla_afectada__iexact=tabla_afectada)

    id_usuario = filtros.get('id_usuario')
    if id_usuario:
        qs = qs.filter(id_usuario_id=id_usuario)

    usuario_query = str(filtros.get('usuario_query') or '').strip()
    if usuario_query:
        qs = qs.filter(
            Q(id_usuario__email__icontains=usuario_query) |
            Q(id_usuario__perfilusuario__nombre__icontains=usuario_query) |
            Q(id_usuario__perfilusuario__apellido__icontains=usuario_query) |
            Q(id_usuario__perfilusuario__dni__icontains=usuario_query)
        )

    fecha_desde = filtros.get('fecha_desde')
    if fecha_desde:
        qs = qs.filter(fecha_hora__date__gte=fecha_desde)

    fecha_hasta = filtros.get('fecha_hasta')
    if fecha_hasta:
        qs = qs.filter(fecha_hora__date__lte=fecha_hasta)

    hora_desde = filtros.get('hora_desde')
    if hora_desde:
        qs = qs.filter(fecha_hora__time__gte=hora_desde)

    hora_hasta = filtros.get('hora_hasta')
    if hora_hasta:
        qs = qs.filter(fecha_hora__time__lte=hora_hasta)

    return qs


# ==============================================================================
# CU-22 & CU-23: COPIAS DE SEGURIDAD Y RESTAURACIÓN (SELECTORS)
# ==============================================================================

def listar_copias_seguridad() -> QuerySet:
    """
    CU-22 / CU-23: Retorna todas las copias de seguridad registradas en el sistema,
    ordenadas cronológicamente de forma descendente (las más recientes primero).
    Optimizado con select_related para evitar el problema N+1 queries.
    """
    return CopiaSeguridad.objects.select_related(
        'id_usuario',
        'id_usuario__perfilusuario',
        'id_usuario__id_rol'
    ).order_by('-id_backup')


def obtener_copia_seguridad(id_backup: int) -> CopiaSeguridad:
    """
    CU-23: Obtiene una instancia específica de CopiaSeguridad por su ID.
    Valida la existencia del registro en la base de datos y la presencia
    física del archivo en el sistema de archivos del servidor.
    Levanta NotFound si no existe el registro, o ValidationError si el archivo físico no está.
    """
    import os
    from rest_framework.exceptions import NotFound, ValidationError

    try:
        copia = CopiaSeguridad.objects.select_related(
            'id_usuario',
            'id_usuario__perfilusuario',
            'id_usuario__id_rol'
        ).get(pk=id_backup)
    except CopiaSeguridad.DoesNotExist:
        raise NotFound(f"No existe ninguna copia de seguridad con ID {id_backup}.")

    if not copia.ubicacion_archivo or not os.path.exists(copia.ubicacion_archivo):
        raise ValidationError(f"El archivo físico de respaldo no existe en la ruta configurada: {copia.ubicacion_archivo}")

    return copia


def obtener_estado_almacenamiento() -> dict:
    """
    CU-22: Verifica en tiempo real el espacio libre en el disco del servidor,
    los permisos de escritura en la carpeta de respaldos y el resumen de copias.
    """
    import os
    import shutil
    from django.conf import settings
    from core_app.models import CopiaSeguridad
    from core_app.serializers import CopiaSeguridadOutputSerializer

    backup_dir = os.path.join(settings.BASE_DIR, 'backups')
    os.makedirs(backup_dir, exist_ok=True)

    free_bytes = 0
    total_bytes = 0
    try:
        total, _, free = shutil.disk_usage(backup_dir)
        total_bytes = total
        free_bytes = free
    except OSError:
        pass

    espacio_minimo_bytes = 50 * 1024 * 1024  # 50 MB
    espacio_suficiente = free_bytes >= espacio_minimo_bytes
    permisos_escritura = os.access(backup_dir, os.W_OK)

    total_copias = CopiaSeguridad.objects.count()
    ultima_copia = CopiaSeguridad.objects.order_by('-id_backup').first()
    ultima_data = CopiaSeguridadOutputSerializer(ultima_copia).data if ultima_copia else None

    return {
        "directorio": backup_dir,
        "espacio_libre_mb": round(free_bytes / (1024 * 1024), 2),
        "espacio_libre_gb": round(free_bytes / (1024 * 1024 * 1024), 2),
        "espacio_total_gb": round(total_bytes / (1024 * 1024 * 1024), 2),
        "porcentaje_libre": round((free_bytes / total_bytes * 100), 1) if total_bytes > 0 else 0,
        "espacio_suficiente": espacio_suficiente,
        "permisos_escritura": permisos_escritura,
        "total_copias": total_copias,
        "ultima_copia": ultima_data
    }


