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

def obtener_notificaciones_usuario(id_usuario: int) -> QuerySet[Notificacion]:
    """Obtiene las notificaciones de un usuario ordenadas por fecha más reciente."""
    return Notificacion.objects.filter(id_usuario_id=id_usuario).order_by('-id_notificacion')

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
