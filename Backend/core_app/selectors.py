
from decimal import Decimal
from typing import Any, Optional
from django.core.cache import cache
from django.db import connection
from django.db.models import QuerySet
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from core_app.models import ConfiguracionSistema, Notificacion, CopiaSeguridad

PREFIJO_CACHE_CONFIG = "cfg_sistema:"
TTL_CACHE_CONFIG_SEGUNDOS = 60
_CACHE_NO_EXISTE = "__CFG_NO_EXISTE__"


def _construir_clave_cache_config(clave: str) -> str:
    """Construye la clave de caché aislando automáticamente el savepoint raíz de cada TestCase."""
    sp_list = getattr(connection, 'savepoint_ids', None) or []
    sp = sp_list[0] if sp_list else ""
    return f"{PREFIJO_CACHE_CONFIG}{sp}:{clave}" if sp else f"{PREFIJO_CACHE_CONFIG}{clave}"


def invalidar_cache_configuracion(claves: Optional[list] = None) -> None:
    """Invalida las claves indicadas (o limpia el caché de configuración) en ConfiguracionSistema."""
    cache.clear()


@receiver((post_save, post_delete), sender=ConfiguracionSistema, dispatch_uid="invalidar_cache_cfg_sistema")
def _on_cambio_configuracion_sistema(sender, instance, **kwargs):
    clave = getattr(instance, 'clave', None)
    if clave:
        invalidar_cache_configuracion([clave])


def _obtener_valor_crudo_configuracion(clave: str) -> Optional[str]:
    """Obtiene el valor crudo de ConfiguracionSistema usando caché con TTL de 60 segundos."""
    cache_key = _construir_clave_cache_config(clave)
    en_cache = cache.get(cache_key)
    if en_cache is not None:
        return None if en_cache == _CACHE_NO_EXISTE else str(en_cache)
    try:
        config = ConfiguracionSistema.objects.filter(clave=clave).order_by('-id_config').first()
        if config is not None:
            val = str(config.valor) if config.valor is not None else ""
            cache.set(cache_key, val, timeout=TTL_CACHE_CONFIG_SEGUNDOS)
            return val
    except Exception:
        pass

    # Autosanado on-demand en BD si la clave pertenece al catálogo canónico (CU-42)
    try:
        from core_app.constantes import CATALOGO_CONFIGURACIONES_SISTEMA
        if clave in CATALOGO_CONFIGURACIONES_SISTEMA:
            info = CATALOGO_CONFIGURACIONES_SISTEMA[clave]
            val_defecto = str(info.get('valor_defecto', ''))
            nueva_cfg = ConfiguracionSistema.objects.create(
                clave=clave,
                descripcion=info.get('descripcion', f"Parámetro {clave}"),
                valor=val_defecto
            )
            val_ret = str(nueva_cfg.valor) if nueva_cfg.valor is not None else val_defecto
            cache.set(cache_key, val_ret, timeout=TTL_CACHE_CONFIG_SEGUNDOS)
            return val_ret
    except Exception:
        pass

    cache.set(cache_key, _CACHE_NO_EXISTE, timeout=TTL_CACHE_CONFIG_SEGUNDOS)
    return None


def obtener_configuracion_texto(clave: str, fallback: str = "") -> str:
    """Obtiene un valor de texto de ConfiguracionSistema (cacheado). Fail-safe a fallback."""
    raw = _obtener_valor_crudo_configuracion(clave)
    if raw is None:
        return fallback
    val = raw.strip()
    return val if val and val != "S/N" else fallback


def obtener_configuracion_bool(clave: str) -> bool:
    """Obtiene un flag booleano de ConfiguracionSistema (cacheado). Fail-safe a False."""
    raw = _obtener_valor_crudo_configuracion(clave)
    if raw is None:
        return False
    return raw.strip().lower() in ('true', '1', 't', 'y', 'yes')


def obtener_configuracion_int(clave: str, fallback: int = 0) -> int:
    """Obtiene un valor numérico entero de ConfiguracionSistema (cacheado). Fail-safe a fallback."""
    raw = _obtener_valor_crudo_configuracion(clave)
    if raw is None:
        return fallback
    val = raw.strip()
    return int(val) if val.isdigit() or (val.startswith('-') and val[1:].isdigit()) else fallback


def obtener_configuracion_decimal(clave: str, fallback: Decimal = Decimal('0.00')) -> Decimal:
    """Obtiene un valor numérico decimal de ConfiguracionSistema (cacheado). Fail-safe a fallback."""
    raw = _obtener_valor_crudo_configuracion(clave)
    if raw is None:
        return fallback
    try:
        return Decimal(raw.strip().replace(',', '.'))
    except Exception:
        return fallback

def obtener_costo_diagnostico_base() -> Decimal:
    """
    Obtiene el costo base configurado para el diagnóstico técnico inicial al abrir una orden.
    Fallback a 5000.00 ARS.
    """
    val = obtener_configuracion_decimal('costo_diagnostico_base', fallback=Decimal('-1.00'))
    if val < 0:
        val = obtener_configuracion_decimal('costoDiagnosticoBase', fallback=Decimal('5000.00'))
    return max(Decimal('0.00'), val)

def obtener_tamano_maximo_archivo_mb() -> int:
    """Obtiene el tamaño máximo en Megabytes permitido para la subida de archivos (ej. fotos)."""
    return max(1, obtener_configuracion_int('tamanoMaxArchivoMB', fallback=10))

def obtener_tamano_maximo_archivo_bytes() -> int:
    """
    Retorna el tamaño máximo en bytes para validación física de archivos.
    Prioriza `maxTamanoArchivoBytes` en ConfiguracionSistema; si no está definido,
    calcula a partir de `tamanoMaxArchivoMB`.
    """
    val_bytes = obtener_configuracion_int('maxTamanoArchivoBytes', fallback=0)
    if val_bytes > 0:
        return max(1024, val_bytes)
    return obtener_tamano_maximo_archivo_mb() * 1024 * 1024

def obtener_max_tamano_archivo_bytes() -> int:
    """Alias canónico para `maxTamanoArchivoBytes` (§2.3)."""
    return obtener_tamano_maximo_archivo_bytes()

def obtener_extensiones_permitidas_archivos(*, solo_imagenes: bool = False) -> tuple:
    """
    Obtiene la tupla de extensiones permitidas configuradas en `extensionesPermitidasArchivos`.
    Si `solo_imagenes=True`, filtra formatos gráficos seguros.
    """
    from core_app.constantes import (
        EXTENSIONES_IMAGEN_PERMITIDAS_DEFECTO,
        EXTENSIONES_ARCHIVO_PERMITIDAS_DEFECTO,
    )
    raw = obtener_configuracion_texto('extensionesPermitidasArchivos', fallback='')
    if not raw:
        return EXTENSIONES_IMAGEN_PERMITIDAS_DEFECTO if solo_imagenes else EXTENSIONES_ARCHIVO_PERMITIDAS_DEFECTO
    partes = [
        p.strip().lower() if p.strip().startswith('.') else f".{p.strip().lower()}"
        for p in raw.split(',')
        if p.strip()
    ]
    if solo_imagenes:
         base = set(EXTENSIONES_IMAGEN_PERMITIDAS_DEFECTO) | {p for p in partes if p != '.pdf'}
         return tuple(sorted(base))
    return tuple(partes) if partes else EXTENSIONES_ARCHIVO_PERMITIDAS_DEFECTO

def obtener_minutos_reserva_venta_pendiente() -> int:
    """Minutos de gracia para abonar una venta PENDIENTE antes de liberar su stock (`minutosReservaVentaPendiente`)."""
    from core_app.constantes import RESERVA_VENTA_PENDIENTE_MINUTOS_DEFECTO
    return max(1, obtener_configuracion_int('minutosReservaVentaPendiente', fallback=RESERVA_VENTA_PENDIENTE_MINUTOS_DEFECTO))

def obtener_dias_validez_cotizacion() -> int:
    """Cantidad de días de vigencia por defecto para cotizaciones de proveedores (`diasValidezCotizacion`)."""
    from core_app.constantes import VALIDEZ_COTIZACION_DIAS_DEFECTO
    return max(1, obtener_configuracion_int('diasValidezCotizacion', fallback=VALIDEZ_COTIZACION_DIAS_DEFECTO))

def obtener_minutos_vida_access_token() -> int:
    """Minutos de vigencia del token JWT de acceso (`minutosVidaAccessToken`)."""
    from core_app.constantes import VIDA_ACCESS_TOKEN_MINUTOS_DEFECTO
    return max(5, obtener_configuracion_int('minutosVidaAccessToken', fallback=VIDA_ACCESS_TOKEN_MINUTOS_DEFECTO))

def obtener_minutos_vida_otp_recuperacion() -> int:
    """Minutos de validez del código OTP para activación/recuperación (`minutosVidaOtpRecuperacion`)."""
    from core_app.constantes import VIDA_OTP_RECUPERACION_MINUTOS_DEFECTO
    return max(1, obtener_configuracion_int('minutosVidaOtpRecuperacion', fallback=VIDA_OTP_RECUPERACION_MINUTOS_DEFECTO))

def obtener_minutos_vida_otp_admin() -> int:
    """Minutos de validez del código OTP de seguridad rápida (`minutosVidaOtpAdmin`)."""
    from core_app.constantes import VIDA_OTP_ADMIN_MINUTOS_DEFECTO
    return max(1, obtener_configuracion_int('minutosVidaOtpAdmin', fallback=VIDA_OTP_ADMIN_MINUTOS_DEFECTO))

def obtener_longitud_codigo_seguridad() -> int:
    """Cantidad de caracteres alfanuméricos de los códigos de seguridad (`longitudCodigoSeguridad`)."""
    from core_app.constantes import LONGITUD_CODIGO_SEGURIDAD_DEFECTO
    return max(6, min(32, obtener_configuracion_int('longitudCodigoSeguridad', fallback=LONGITUD_CODIGO_SEGURIDAD_DEFECTO)))

def obtener_limite_resultados_geo() -> int:
    """Tope de resultados en búsquedas geográficas globales (`limiteResultadosBusquedaGeo`)."""
    from core_app.constantes import LIMITE_RESULTADOS_GEO_DEFECTO
    return max(10, min(500, obtener_configuracion_int('limiteResultadosBusquedaGeo', fallback=LIMITE_RESULTADOS_GEO_DEFECTO)))

def obtener_retencion_copias_backup() -> int:
    """Obtiene la cantidad máxima de copias históricas de respaldo a conservar en el servidor."""
    return max(1, obtener_configuracion_int('backupRetencionCopias', fallback=5))

def obtener_configuracion_backups_completa() -> dict:
    """
    Retorna la configuración completa y estructurada del subsistema de respaldos (CU-22).
    """
    return {
        'automatico': obtener_configuracion_bool('backupAutomatico'),
        'modalidad': obtener_configuracion_texto('backupModalidad', fallback='MULTINIVEL'),
        'diario': {
            'activo': obtener_configuracion_bool('backupDiarioActivo'),
            'frecuencia_horas': max(1, obtener_configuracion_int('backupFrecuenciaHoras', fallback=24)),
            'hora_ejecucion': obtener_configuracion_texto('backupHoraEjecucion', fallback='03:00'),
        },
        'semanal': {
            'activo': obtener_configuracion_bool('backupSemanalActivo'),
            'dia_semana': obtener_configuracion_texto('backupDiaSemana', fallback='SABADO').upper(),
            'hora_ejecucion': obtener_configuracion_texto('backupHoraSemanal', fallback='02:00'),
        },
        'quincenal': {
            'activo': obtener_configuracion_bool('backupQuincenalActivo'),
            'hora_ejecucion': obtener_configuracion_texto('backupHoraQuincenal', fallback='04:00'),
        },
        'mensual': {
            'activo': obtener_configuracion_bool('backupMensualActivo'),
            'hora_ejecucion': obtener_configuracion_texto('backupHoraMensual', fallback='05:00'),
        },
        'retencion_copias': obtener_retencion_copias_backup(),
        'ultima_ejecucion': obtener_configuracion_texto('backupUltimaEjecucion', fallback=''),
    }

def obtener_max_intentos_login() -> int:
    """Obtiene el límite de intentos fallidos antes de bloquear la cuenta frente a ataques."""
    from core_app.constantes import MIN_INTENTOS_LOGIN_PERMITIDOS
    return max(MIN_INTENTOS_LOGIN_PERMITIDOS, obtener_configuracion_int('maxIntentosLogin', fallback=10))

def obtener_tiempo_sesion_inactiva_horas() -> float:
    """Obtiene el tiempo en horas para control de inactividad de sesión de usuarios."""
    raw = _obtener_valor_crudo_configuracion('tiempoSesionInactiva')
    if raw is None:
        return 168.0
    try:
        val = float(raw.strip().replace(',', '.'))
        return val if val > 0 else 168.0
    except Exception:
        return 168.0

def obtener_email_emisor() -> str:
    """Obtiene la casilla de correo configurada para envíos del sistema con fallback."""
    from django.conf import settings
    fallback = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@ifixpos.com')
    emisor = obtener_configuracion_texto('emailInfo', fallback=fallback)
    if not emisor or emisor == 'S/N' or '@' not in emisor:
        return fallback
    return emisor

def obtener_email_soporte() -> str:
    """Obtiene la casilla de correo de soporte al cliente con fail-safe."""
    return obtener_configuracion_texto('emailSoporte', fallback='soporte@ifixnet.com')

def obtener_email_alertas_sistema() -> str:
    """Obtiene la casilla de correo destino para alertas críticas internas del sistema."""
    return obtener_configuracion_texto('emailAlertasSistema', fallback='alertas@ifixnet.com')

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
    Ejecuta autosanado preventivo si faltan claves del catálogo canónico (CU-42).
    Incluye fallback a settings para llaves de pasarela si no estuviesen presentes.
    """
    from django.conf import settings
    from core_app.constantes import CATALOGO_CONFIGURACIONES_SISTEMA

    configuraciones = list(ConfiguracionSistema.objects.all().order_by('id_config'))
    claves_presentes = {c.clave for c in configuraciones if c.clave is not None}

    # Autosanado si faltan claves del catálogo canónico en la BD
    claves_faltantes = set(CATALOGO_CONFIGURACIONES_SISTEMA.keys()) - claves_presentes
    if claves_faltantes:
        try:
            from core_app.services import asegurar_configuraciones_predeterminadas
            asegurar_configuraciones_predeterminadas()
            configuraciones = list(ConfiguracionSistema.objects.all().order_by('id_config'))
        except Exception:
            pass

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


def obtener_datos_bancarios_comercio() -> dict:
    """
    Obtiene los datos bancarios oficiales del comercio desde ConfiguracionSistema (CU-42).
    """
    return {
        'banco': obtener_configuracion_texto('bancoLocal', 'Banco de la Nación Argentina'),
        'titular': obtener_configuracion_texto('titularCuentaLocal', 'IFix Servicio Técnico S.R.L.'),
        'cbu': obtener_configuracion_texto('cbuLocal', '0110599540000012345678'),
        'alias': obtener_configuracion_texto('aliasLocal', 'IFIX.TALLER.POS'),
    }


def obtener_dias_garantia_reparacion() -> int:
    """Plazo formal de garantía técnica en días posteriores a la entrega (CU-42)."""
    return max(1, obtener_configuracion_int('diasGarantiaReparacion', fallback=90))


def obtener_dias_limite_retiro_equipo() -> int:
    """Días límite de guarda tras finalizar la reparación antes de aplicar costos o rezago (CU-42)."""
    return max(1, obtener_configuracion_int('diasLimiteRetiroEquipo', fallback=60))


def obtener_minutos_expiracion_mp() -> int:
    """Minutos de vigencia de la preferencia y código QR generado por Mercado Pago (CU-42)."""
    return max(5, obtener_configuracion_int('minutosExpiracionPreferenciaMP', fallback=30))



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
    from core_app.services import _obtener_base_backups

    backup_dir = _obtener_base_backups()
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


def obtener_direccion_local_formateada(fallback: str = "") -> str:
    """
    Obtiene la dirección física legible de la sede (`direccionLocal`).
    Si `direccionLocal` almacena un ID numérico de `geo_app.Direccion`, lo resuelve
    a su texto completo (Calle, Barrio, Ciudad, Provincia) usando `select_related`,
    evitando exponer identificadores internos de base de datos en vistas o PDFs.
    """
    raw = obtener_configuracion_texto('direccionLocal', fallback=fallback)
    if not raw:
        return fallback
    if raw.isdigit():
        try:
            from geo_app.models import Direccion
            dir_obj = (
                Direccion.objects
                .select_related('id_ciudad__id_provincia__id_pais')
                .filter(id_direccion=int(raw))
                .first()
            )
            if dir_obj:
                partes = [dir_obj.nro_calle, dir_obj.nombre_barrio]
                if dir_obj.id_ciudad:
                    partes.append(dir_obj.id_ciudad.nombre_ciudad)
                    if dir_obj.id_ciudad.id_provincia:
                        partes.append(dir_obj.id_ciudad.id_provincia.nombre_provincia)
                texto = ", ".join(p for p in partes if p)
                return texto or fallback
            return fallback
        except Exception:
            return fallback
    return raw



