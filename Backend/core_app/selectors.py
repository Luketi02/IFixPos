from typing import Any
from typing import Optional
from django.db.models import QuerySet
from core_app.models import ConfiguracionSistema, Notificacion

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
    """
    configuraciones = ConfiguracionSistema.objects.all()
    return {
        config.clave: config.valor
        for config in configuraciones
        if config.clave is not None
    }
