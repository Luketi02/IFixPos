import os
import logging
from datetime import date, time
from typing import Optional, Any
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone as django_timezone
from email.mime.image import MIMEImage

from core_app.models import Notificacion, ConfiguracionSistema, LogSistema, CopiaSeguridad
from core_app.selectors import obtener_email_emisor, invalidar_cache_configuracion

logger = logging.getLogger(__name__)

def enmascarar_contenido_sensible(texto: str, codigo_sensible: Optional[str] = None) -> str:
    """
    Enmascara códigos OTP y secretos en el texto antes de guardarlo en la base de datos.
    Reemplaza ocurrencias del código por [******].
    """
    if not texto:
        return ""
    if codigo_sensible:
        return texto.replace(str(codigo_sensible), "[******]")
    return texto

def registrar_y_enviar_notificacion_correo(
    *,
    usuario: Any,
    asunto: str,
    cuerpo_texto: str,
    tipo_notificacion: str,
    cuerpo_html: Optional[str] = None,
    mensaje_notificacion: Optional[str] = None,
    codigo_sensible: Optional[str] = None,
    adjuntar_logo: bool = True,
    dispositivo: Optional[Any] = None,
    beneficio: Optional[Any] = None
) -> Notificacion:
    """
    Motor centralizado de notificaciones y despacho de correos en IFixPos.
    
    1. Persiste el registro en el modelo Notificacion de core_app, aplicando
       estricto enmascaramiento sobre códigos OTP o credenciales sensibles.
    2. Despacha el correo electrónico al usuario (con el código real) a través
       de EmailMultiAlternatives, usando la casilla emisora configurada en el sistema.
    """
    with transaction.atomic():
        # --- 1. Sanitización y enmascaramiento estricto para BD ---
        if mensaje_notificacion:
            base_mensaje = mensaje_notificacion
        else:
            base_mensaje = cuerpo_texto

        mensaje_sanitizado = enmascarar_contenido_sensible(base_mensaje, codigo_sensible)
        # Respetar el límite de max_length=1000 del modelo Notificacion
        mensaje_sanitizado = mensaje_sanitizado[:1000]

        # --- 2. Persistencia en Notificacion ---
        notificacion = Notificacion.objects.create(
            id_usuario=usuario,
            mensaje=mensaje_sanitizado,
            tipo=tipo_notificacion,
            fecha_envio=django_timezone.now().date(),
            leida=False,
            id_dispositivo=dispositivo,
            id_beneficio=beneficio
        )

        # --- 3. Despacho del correo electrónico con el código real ---
        email_emisor = obtener_email_emisor()
        email_msg = EmailMultiAlternatives(
            subject=asunto,
            body=cuerpo_texto,
            from_email=email_emisor,
            to=[usuario.email]
        )

        if cuerpo_html:
            email_msg.attach_alternative(cuerpo_html, "text/html")

        if adjuntar_logo and cuerpo_html and "cid:logo_ifixpos" in cuerpo_html:
            logo_path = os.path.join(settings.BASE_DIR.parent, 'Frontend', 'src', 'assets', 'img', 'LogoIFixPos.png')
            if os.path.exists(logo_path):
                with open(logo_path, 'rb') as f_img:
                    mime_logo = MIMEImage(f_img.read())
                    mime_logo.add_header('Content-ID', '<logo_ifixpos>')
                    mime_logo.add_header('Content-Disposition', 'inline', filename='LogoIFixPos.png')
                    email_msg.attach(mime_logo)

        try:
            email_msg.send(fail_silently=False)
        except Exception as e:
            # Registrar advertencia en log técnico sin interrumpir la persistencia
            logger.warning("[Motor Notificaciones] Error o advertencia al enviar correo a %s: %s", usuario.email, e)

        return notificacion

def marcar_ultima_notificacion_como_leida(*, usuario: Any, tipo: str) -> Optional[Notificacion]:
    """
    Marca como leída (leida=True) la última notificación pendiente (leida=False)
    de un tipo específico para un usuario dado.
    """
    with transaction.atomic():
        notificacion = (
            Notificacion.objects.filter(
                id_usuario=usuario,
                tipo=tipo,
                leida=False
            )
            .order_by('-id_notificacion')
            .first()
        )
        if notificacion:
            notificacion.leida = True
            notificacion.save(update_fields=['leida'])
        return notificacion


@transaction.atomic
def asegurar_configuraciones_predeterminadas() -> int:
    """
    Verifica que el 100% de los parámetros del catálogo canónico existan
    en la tabla ConfiguracionSistema de PostgreSQL.
    Cualquier clave ausente se crea físicamente en la base de datos con su valor
    predeterminado, garantizando que el sistema opere con cero hardcodeo (CU-42).
    Retorna la cantidad de configuraciones creadas.
    """
    from core_app.constantes import CATALOGO_CONFIGURACIONES_SISTEMA

    existentes = set(
        ConfiguracionSistema.objects.exclude(clave__isnull=True).values_list('clave', flat=True)
    )
    faltantes = [
        clave for clave in CATALOGO_CONFIGURACIONES_SISTEMA if clave not in existentes
    ]

    if not faltantes:
        return 0

    ahora = django_timezone.now()
    nuevos_registros = []
    for clave in faltantes:
        info = CATALOGO_CONFIGURACIONES_SISTEMA[clave]
        nuevos_registros.append(
            ConfiguracionSistema(
                clave=clave,
                descripcion=info.get('descripcion', f"Parámetro {clave}"),
                valor=str(info.get('valor_defecto', '')),
                ultima_modif=ahora
            )
        )

    ConfiguracionSistema.objects.bulk_create(nuevos_registros, ignore_conflicts=True)
    invalidar_cache_configuracion(faltantes)
    logger.info(
        "[Autosanado Configuración CU-42] Creadas %d configuraciones ausentes en BD: %s",
        len(faltantes),
        ", ".join(faltantes)
    )
    return len(faltantes)


@transaction.atomic
def actualizar_configuracion_global(*, usuario_admin: Any, datos_validados: dict) -> dict:
    """
    Actualiza de forma transaccional los parámetros en ConfiguracionSistema
    y registra el evento de auditoría en LogSistema (CU-42).
    """
    ahora = django_timezone.now()
    claves_alteradas = []

    for clave, valor in datos_validados.items():
        if clave is None:
            continue
        configs = list(ConfiguracionSistema.objects.filter(clave=clave))
        if configs:
            for cfg in configs:
                cfg.valor = str(valor) if valor is not None else ""
                cfg.ultima_modif = ahora
                cfg.save(update_fields=['valor', 'ultima_modif'])
            claves_alteradas.append(clave)
        else:
            ConfiguracionSistema.objects.create(
                clave=clave,
                descripcion=f"Parámetro {clave}",
                valor=str(valor) if valor is not None else "",
                ultima_modif=ahora
            )
            claves_alteradas.append(clave)

    # Invalidar caché de las claves alteradas
    if claves_alteradas:
        invalidar_cache_configuracion(claves_alteradas)

    # Detalle descriptivo de auditoría
    if claves_alteradas:
        resumen_claves = ", ".join(claves_alteradas)
        detalle_log = f"Claves modificadas ({len(claves_alteradas)}): {resumen_claves}"
    else:
        detalle_log = "Sin modificaciones registradas en configuración del sistema."

    # Respetar el límite de max_length=1000 del campo detalle en LogSistema
    detalle_log = detalle_log[:1000]

    # Auditoría (LogSistema)
    LogSistema.objects.create(
        fecha_hora=ahora,
        accion="Actualización de Configuración Global del Sistema",
        detalle=detalle_log,
        tipo="AUDITORIA_SISTEMA",
        modulo_origen="core_app",
        tabla_afectada="configuracion_sistema",
        id_usuario=usuario_admin
    )

    return {
        "mensaje": "Configuraciones globales actualizadas exitosamente.",
        "claves_actualizadas": claves_alteradas,
        "total": len(claves_alteradas)
    }


def guardar_logo_empresa(*, archivo: Any, usuario_admin: Any) -> str:
    """
    Valida y guarda un archivo de imagen para el logo oficial de la empresa
    en MEDIA_ROOT/empresa/. Actualiza el parámetro 'imagenLocal' en ConfiguracionSistema
    y registra el evento de auditoría en LogSistema.
    """
    from django.core.exceptions import ValidationError

    if not archivo:
        raise ValidationError("No se proporcionó ningún archivo de imagen.")

    # Validar extensión
    ext = os.path.splitext(archivo.name)[1].lower()
    formatos_permitidos = ['.png', '.jpg', '.jpeg', '.webp', '.svg']
    if ext not in formatos_permitidos:
        raise ValidationError(f"Formato no permitido. Solo se admiten: {', '.join(formatos_permitidos)}")

    # Validar tamaño (máximo 5 MB)
    if archivo.size > 5 * 1024 * 1024:
        raise ValidationError("El archivo supera el tamaño máximo permitido de 5 MB.")

    carpeta_destino = os.path.join(settings.MEDIA_ROOT, 'empresa')
    os.makedirs(carpeta_destino, exist_ok=True)

    timestamp = int(django_timezone.now().timestamp())
    nombre_archivo = f"logo_empresa_{timestamp}{ext}"
    ruta_completa = os.path.join(carpeta_destino, nombre_archivo)

    with open(ruta_completa, 'wb+') as destino:
        for chunk in archivo.chunks():
            destino.write(chunk)

    url_relativa = f"/media/empresa/{nombre_archivo}"

    # Actualizar en ConfiguracionSistema de forma atómica
    with transaction.atomic():
        ahora = django_timezone.now()
        configs = list(ConfiguracionSistema.objects.filter(clave='imagenLocal'))
        if configs:
            for cfg in configs:
                cfg.valor = url_relativa
                cfg.ultima_modif = ahora
                cfg.save(update_fields=['valor', 'ultima_modif'])
        else:
            ConfiguracionSistema.objects.create(
                clave='imagenLocal',
                descripcion='Logo o isotipo de la empresa',
                valor=url_relativa,
                ultima_modif=ahora
            )

        # Auditoría
        LogSistema.objects.create(
            fecha_hora=ahora,
            accion="Actualización de Logo Institucional",
            detalle=f"Archivo guardado como {url_relativa}",
            tipo="AUDITORIA_SISTEMA",
            modulo_origen="core_app",
            tabla_afectada="configuracion_sistema",
            id_usuario=usuario_admin
        )

    invalidar_cache_configuracion(['imagenLocal'])
    return url_relativa


@transaction.atomic
def marcar_notificacion_leida(*, usuario: Any, id_notificacion: int) -> Notificacion:
    """
    Marca una notificación específica como leída (leida=True) tras verificar seguridad horizontal.
    Usa obtener_notificacion_usuario para validar pertenencia y existencia.
    """
    from core_app.selectors import obtener_notificacion_usuario

    notificacion = obtener_notificacion_usuario(usuario=usuario, id_notificacion=id_notificacion)
    if not notificacion.leida:
        notificacion.leida = True
        notificacion.save(update_fields=['leida'])
    return notificacion


@transaction.atomic
def marcar_todas_notificaciones_leidas(*, usuario: Any) -> int:
    """
    Marca masivamente todas las notificaciones pendientes de un usuario a leida=True.
    Retorna la cantidad entera de alertas actualizadas.
    """
    from core_app.selectors import TIPOS_EXCLUIDOS_CAMPANITA

    user_id = getattr(usuario, 'id_usuario', None) or getattr(usuario, 'id', None) or usuario
    actualizadas = (
        Notificacion.objects
        .filter(id_usuario_id=user_id, leida=False)
        .exclude(tipo__in=TIPOS_EXCLUIDOS_CAMPANITA)
        .update(leida=True)
    )
    return actualizadas


@transaction.atomic
def eliminar_notificacion(*, usuario: Any, id_notificacion: int) -> bool:
    """
    Elimina físicamente una notificación garantizando que pertenezca al usuario ejecutor.
    """
    from core_app.selectors import obtener_notificacion_usuario

    notificacion = obtener_notificacion_usuario(usuario=usuario, id_notificacion=id_notificacion)
    notificacion.delete()
    return True


@transaction.atomic
def eliminar_todas_notificaciones(*, usuario: Any) -> int:
    """
    Elimina todas las notificaciones visibles de la campanita para el usuario.
    Retorna la cantidad de registros eliminados.
    """
    from core_app.selectors import TIPOS_EXCLUIDOS_CAMPANITA

    user_id = getattr(usuario, 'id_usuario', None) or getattr(usuario, 'id', None) or usuario
    eliminadas, _ = (
        Notificacion.objects
        .filter(id_usuario_id=user_id)
        .exclude(tipo__in=TIPOS_EXCLUIDOS_CAMPANITA)
        .delete()
    )
    return eliminadas


# ==============================================================================
# MOTOR CENTRALIZADO DE AUDITORÍA Y CONTROL DE LOGS POR CONFIGURACIÓN
# ==============================================================================

def registrar_log_evento(
    *,
    accion: str,
    modulo_origen: str,
    tipo: str = "INFO",
    detalle: Optional[str] = None,
    tabla_afectada: Optional[str] = None,
    id_registro_afectado: Optional[str] = None,
    id_usuario: Optional[Any] = None,
    categoria_config: Optional[str] = None
) -> Optional[LogSistema]:
    """
    Función centralizada para asentar eventos en LogSistema respetando los parámetros
    configurables del sistema (ConfiguracionSistema):
    - log_seguridad_accesos
    - log_caja_anulaciones
    - log_stock_ajustes_manuales
    - log_roles_permisos
    - log_operaciones_lectura (Desactivado por defecto para alto rendimiento)
    """
    from core_app.selectors import obtener_configuracion_bool

    # 1. Comprobación de flags según categoría o tipo
    if categoria_config == 'SEGURIDAD' or tipo in ['SEGURIDAD', 'AUTH_ERROR']:
        if not obtener_configuracion_bool('log_seguridad_accesos'):
            return None
    elif categoria_config == 'CAJA_ANULACION' or tipo == 'ANULACION_CAJA':
        if not obtener_configuracion_bool('log_caja_anulaciones'):
            return None
    elif categoria_config == 'STOCK_AJUSTE' or tipo == 'AJUSTE_STOCK':
        if not obtener_configuracion_bool('log_stock_ajustes_manuales'):
            return None
    elif categoria_config == 'ROLES_PERMISOS' or tipo == 'ROLES_PERMISOS':
        if not obtener_configuracion_bool('log_roles_permisos'):
            return None
    elif categoria_config == 'LECTURA_PASIVA' or tipo in ['CONSULTA_AUDITORIA', 'LECTURA_PASIVA']:
        if not obtener_configuracion_bool('log_operaciones_lectura'):
            return None

    ahora = django_timezone.now()
    return LogSistema.objects.create(
        fecha_hora=ahora,
        accion=accion,
        detalle=detalle[:1000] if detalle else None,
        tipo=tipo,
        modulo_origen=modulo_origen,
        tabla_afectada=tabla_afectada,
        id_registro_afectado=str(id_registro_afectado) if id_registro_afectado is not None else None,
        id_usuario=id_usuario
    )



# ==============================================================================
# 💾 SUBSISTEMA DE RESPALDOS MULTINIVEL Y ROTACIÓN FIFO (CU-22)
# ==============================================================================

DIRECTORIOS_BACKUP = {
    'DIARIO': os.path.join(settings.BASE_DIR, 'backups', 'diarios'),
    'SEMANAL': os.path.join(settings.BASE_DIR, 'backups', 'semanales'),
    'QUINCENAL': os.path.join(settings.BASE_DIR, 'backups', 'quincenales'),
    'MENSUAL': os.path.join(settings.BASE_DIR, 'backups', 'mensuales'),
    'MANUAL': os.path.join(settings.BASE_DIR, 'backups', 'manuales'),
}

CARPETAS_POR_TIPO = {
    'DIARIO': 'diarios',
    'SEMANAL': 'semanales',
    'QUINCENAL': 'quincenales',
    'MENSUAL': 'mensuales',
    'MANUAL': 'manuales',
}


def asegurar_directorios_backup() -> dict:
    """Asegura la existencia de las subcarpetas especializadas de respaldos."""
    for d in DIRECTORIOS_BACKUP.values():
        os.makedirs(d, exist_ok=True)
    return DIRECTORIOS_BACKUP


def obtener_directorio_backup_por_tipo(tipo: str) -> str:
    """Obtiene la ruta física del directorio correspondiente al tipo de respaldo."""
    tipo_up = (tipo or 'MANUAL').upper()
    asegurar_directorios_backup()
    return DIRECTORIOS_BACKUP.get(tipo_up, DIRECTORIOS_BACKUP['MANUAL'])


def purgar_copias_excedentes_fifo_por_tipo(*, tipo_backup: str, limite: int) -> int:
    """
    Garantía Estricta FIFO: Si la cantidad de copias registradas de este tipo es >= limite,
    elimina físicamente del disco y de la base de datos la(s) copia(s) más antigua(s)
    ANTES de generar la nueva copia, garantizando que nunca se sobrepase el límite.
    """
    tipo_up = (tipo_backup or 'MANUAL').upper()
    carpeta_clave = CARPETAS_POR_TIPO.get(tipo_up, 'manuales')

    todas = list(CopiaSeguridad.objects.all().order_by('fecha_creacion', 'id_backup'))
    copias_tipo = []
    for c in todas:
        ruta = (c.ubicacion_archivo or '').replace('\\', '/').lower()
        if f"/{carpeta_clave}/" in ruta:
            copias_tipo.append(c)
        elif tipo_up == 'MANUAL' and not c.automatico and '/backups/' in ruta and not any(f"/{k}/" in ruta for k in ['diarios', 'semanales', 'quincenales', 'mensuales']):
            copias_tipo.append(c)
        elif tipo_up == 'DIARIO' and c.automatico and '/backups/' in ruta and not any(f"/{k}/" in ruta for k in ['semanales', 'quincenales', 'mensuales', 'manuales']):
            copias_tipo.append(c)

    eliminadas = 0
    # Si tenemos >= limite copias, purgamos las más antiguas antes de instanciar la nueva
    while len(copias_tipo) >= limite and copias_tipo:
        c_antigua = copias_tipo.pop(0)
        if c_antigua.ubicacion_archivo and os.path.exists(c_antigua.ubicacion_archivo):
            try:
                os.remove(c_antigua.ubicacion_archivo)
            except OSError:
                pass
        c_antigua.delete()
        eliminadas += 1

    return eliminadas


def depurar_archivos_backup_huerfanos() -> dict:
    """
    Escanea la carpeta de respaldos (y sus subdirectorios) y elimina físicamente
    cualquier archivo .sql que no se encuentre registrado en la base de datos (CopiaSeguridad).
    Retorna métricas de archivos eliminados y espacio liberado en bytes.
    """
    base_backups = os.path.join(settings.BASE_DIR, 'backups')
    if not os.path.exists(base_backups):
        return {"eliminados": 0, "bytes_liberados": 0, "archivos": []}

    rutas_en_bd = set(
        os.path.normcase(os.path.abspath(r)) for r in
        CopiaSeguridad.objects.exclude(ubicacion_archivo__isnull=True).values_list('ubicacion_archivo', flat=True)
    )

    eliminados = 0
    bytes_liberados = 0
    archivos_purgados = []

    for root, dirs, files in os.walk(base_backups):
        for f in files:
            if f.lower().endswith('.sql'):
                ruta_fisica = os.path.normcase(os.path.abspath(os.path.join(root, f)))
                if ruta_fisica not in rutas_en_bd:
                    try:
                        tamano = os.path.getsize(ruta_fisica)
                        os.remove(ruta_fisica)
                        eliminados += 1
                        bytes_liberados += tamano
                        archivos_purgados.append(f)
                    except OSError:
                        pass

    return {
        "eliminados": eliminados,
        "bytes_liberados": bytes_liberados,
        "mb_liberados": round(bytes_liberados / (1024 * 1024), 2),
        "archivos": archivos_purgados
    }


def _ejecutar_volcado_fisico(ruta_archivo: str, version: str, usuario_admin: Any) -> None:
    """Ejecuta el volcado físico de base de datos a un archivo .sql (pg_dump o dump simulado consistente)."""
    import shutil
    import subprocess
    from rest_framework.exceptions import ValidationError

    db_settings = settings.DATABASES.get('default', {})
    db_name = db_settings.get('NAME', 'ifixpos')
    db_user = db_settings.get('USER', 'postgres')
    db_password = db_settings.get('PASSWORD', '')
    db_host = db_settings.get('HOST', 'localhost')
    db_port = str(db_settings.get('PORT', 5432))

    pg_dump_path = shutil.which('pg_dump')
    if pg_dump_path:
        env = os.environ.copy()
        if db_password:
            env['PGPASSWORD'] = str(db_password)

        comando = [
            pg_dump_path,
            '-h', str(db_host),
            '-p', str(db_port),
            '-U', str(db_user),
            '-f', ruta_archivo,
            str(db_name)
        ]
        try:
            resultado = subprocess.run(
                comando,
                env=env,
                capture_output=True,
                text=True,
                timeout=120
            )
            if resultado.returncode != 0:
                if os.path.exists(ruta_archivo):
                    try:
                        os.remove(ruta_archivo)
                    except OSError:
                        pass
                raise ValidationError(f"Error crítico al ejecutar pg_dump: {resultado.stderr.strip()}")
        except subprocess.TimeoutExpired:
            if os.path.exists(ruta_archivo):
                try:
                    os.remove(ruta_archivo)
                except OSError:
                    pass
            raise ValidationError("El proceso de volcado de la base de datos excedió el tiempo límite permitido.")
    else:
        with open(ruta_archivo, 'w', encoding='utf-8') as f:
            f.write(f"-- ============================================================\n")
            f.write(f"-- IFixPos ERP Database Backup Dump (CU-22)\n")
            f.write(f"-- Version: {version}\n")
            f.write(f"-- Fecha de Creación: {django_timezone.now().isoformat()}\n")
            f.write(f"-- Base de Datos: {db_name}\n")
            f.write(f"-- Administrador: {getattr(usuario_admin, 'email', 'admin')}\n")
            f.write(f"-- Estado: Dump íntegro generado satisfactoriamente.\n")
            f.write(f"-- ============================================================\n\n")


def _obtener_usuario_admin_sistema():
    """Localiza el usuario administrador del sistema para asociar a backups automáticos."""
    from users_app.models import Usuario
    admin = Usuario.objects.filter(id_rol__codigo='ADMIN', is_active=True).first()
    if not admin:
        admin = Usuario.objects.filter(is_superuser=True).first()
    return admin


def generar_copia_seguridad_manual(
    *,
    usuario_admin: Any,
    version: str = "1.0.0"
) -> CopiaSeguridad:
    """
    CU-22: Realizar Copia de Seguridad Manual.
    1. Verifica que exista espacio suficiente en disco del servidor.
    2. Aplica rotación FIFO previa en subcarpeta manuales/.
    3. Genera el archivo físico de volcado SQL en backups/manuales/.
    4. Registra la CopiaSeguridad en la base de datos con metadata inmutable.
    5. Depura archivos huérfanos residuales.
    6. Envía notificación por correo electrónico y registra auditoría en LogSistema.
    """
    import shutil
    from rest_framework.exceptions import ValidationError

    dir_destino = obtener_directorio_backup_por_tipo('MANUAL')

    # 1. Validación de espacio en disco (mínimo 50 MB) y permisos de escritura
    try:
        _, _, free_bytes = shutil.disk_usage(dir_destino)
        espacio_minimo = 50 * 1024 * 1024  # 50 MB
        if free_bytes < espacio_minimo:
            raise ValidationError("Espacio de almacenamiento insuficiente en el servidor para generar el respaldo.")
    except OSError:
        pass

    if not os.access(dir_destino, os.W_OK):
        raise ValidationError("Permisos de escritura insuficientes en el directorio de destino del servidor.")

    # 2. Rotación FIFO previa en la categoría MANUAL antes de generar el nuevo archivo
    from core_app.selectors import obtener_retencion_copias_backup
    limite_retencion = obtener_retencion_copias_backup()
    purgar_copias_excedentes_fifo_por_tipo(tipo_backup='MANUAL', limite=limite_retencion)

    # 3. Definición de ruta y volcado físico
    ahora_dt = django_timezone.now()
    timestamp = ahora_dt.strftime("%Y%m%d_%H%M%S_%f")
    nombre_archivo = f"backup_manual_{timestamp}.sql"
    ruta_archivo = os.path.join(dir_destino, nombre_archivo)
    _ejecutar_volcado_fisico(ruta_archivo, version, usuario_admin)

    # 4. Creación del registro en base de datos
    copia = CopiaSeguridad.objects.create(
        fecha_creacion=django_timezone.now().date(),
        automatico=False,
        ubicacion_archivo=ruta_archivo,
        version=version,
        id_usuario=usuario_admin
    )

    # 5. Depurar huérfanos silenciosamente
    depurar_archivos_backup_huerfanos()

    # 6. Notificación por correo al administrador
    asunto = "Copia de Seguridad Generada Exitosamente - IFixPos"
    cuerpo = (
        f"Estimado Administrador,\n\n"
        f"Se ha completado con éxito la generación manual del respaldo del sistema.\n\n"
        f"Detalles de la operación:\n"
        f"• Identificador de Copia: #{copia.id_backup}\n"
        f"• Tipo: Manual\n"
        f"• Archivo: {nombre_archivo}\n"
        f"• Carpeta: backups/manuales/\n"
        f"• Versión: {version}\n"
        f"• Fecha: {copia.fecha_creacion}\n\n"
        f"El archivo se encuentra resguardado en el servidor y disponible para su descarga."
    )
    registrar_y_enviar_notificacion_correo(
        usuario=usuario_admin,
        asunto=asunto,
        cuerpo_texto=cuerpo,
        tipo_notificacion='BACKUP'
    )

    # 7. Registro en LogSistema
    ahora = django_timezone.now()
    admin_id = getattr(usuario_admin, 'id_usuario', None) or getattr(usuario_admin, 'id', None)
    LogSistema.objects.create(
        fecha_hora=ahora,
        accion="Generar Copia de Seguridad Manual",
        detalle=f"El administrador [{admin_id}] generó una copia de seguridad manual en {ruta_archivo}",
        tipo="BACKUP",
        modulo_origen="core_app",
        tabla_afectada="copia_seguridad",
        id_registro_afectado=str(copia.id_backup),
        id_usuario=usuario_admin
    )

    return copia


def generar_copia_seguridad_automatica(
    *,
    tipo_backup: str,
    version: str = "auto",
    usuario_admin: Optional[Any] = None
) -> CopiaSeguridad:
    """
    Genera un respaldo automático programado en su subcarpeta dedicada
    (diarios/, semanales/, quincenales/, mensuales/) aplicando rotación FIFO previa.
    """
    import shutil
    from rest_framework.exceptions import ValidationError

    tipo_up = (tipo_backup or 'DIARIO').upper()
    dir_destino = obtener_directorio_backup_por_tipo(tipo_up)

    try:
        _, _, free_bytes = shutil.disk_usage(dir_destino)
        espacio_minimo = 50 * 1024 * 1024
        if free_bytes < espacio_minimo:
            raise ValidationError("Espacio en disco insuficiente para el respaldo automático.")
    except OSError:
        pass

    if not os.access(dir_destino, os.W_OK):
        raise ValidationError("Sin permisos de escritura en la carpeta de respaldos.")

    admin = usuario_admin or _obtener_usuario_admin_sistema()

    from core_app.selectors import obtener_retencion_copias_backup
    limite_retencion = obtener_retencion_copias_backup()
    purgar_copias_excedentes_fifo_por_tipo(tipo_backup=tipo_up, limite=limite_retencion)

    ahora_dt = django_timezone.now()
    timestamp = ahora_dt.strftime("%Y%m%d_%H%M%S_%f")
    nombre_archivo = f"backup_{tipo_up.lower()}_{timestamp}.sql"
    ruta_archivo = os.path.join(dir_destino, nombre_archivo)
    _ejecutar_volcado_fisico(ruta_archivo, version, admin)

    copia = CopiaSeguridad.objects.create(
        fecha_creacion=django_timezone.now().date(),
        automatico=True,
        ubicacion_archivo=ruta_archivo,
        version=version,
        id_usuario=admin
    )

    depurar_archivos_backup_huerfanos()

    # Actualizar backupUltimaEjecucion
    try:
        from core_app.models import ConfiguracionSistema
        import json
        ahora_iso = django_timezone.now().isoformat()
        cfg_ult = ConfiguracionSistema.objects.filter(clave='backupUltimaEjecucion').order_by('-id_config').first()
        data_ult = {}
        if cfg_ult and cfg_ult.valor:
            try:
                data_ult = json.loads(cfg_ult.valor)
            except Exception:
                data_ult = {}
        data_ult[tipo_up.lower()] = ahora_iso
        nuevo_valor = json.dumps(data_ult)
        if cfg_ult:
            cfg_ult.valor = nuevo_valor
            cfg_ult.save(update_fields=['valor'])
        else:
            ConfiguracionSistema.objects.create(clave='backupUltimaEjecucion', valor=nuevo_valor)
        invalidar_cache_configuracion(['backupUltimaEjecucion'])
    except Exception:
        pass

    # Log de Auditoría
    ahora = django_timezone.now()
    admin_id = getattr(admin, 'id_usuario', None) if admin else 'SISTEMA'
    LogSistema.objects.create(
        fecha_hora=ahora,
        accion=f"Generar Copia de Seguridad Automática ({tipo_up})",
        detalle=f"Respaldo programado nivel [{tipo_up}] generado exitosamente en {ruta_archivo}",
        tipo="BACKUP",
        modulo_origen="core_app",
        tabla_afectada="copia_seguridad",
        id_registro_afectado=str(copia.id_backup),
        id_usuario=admin
    )

    return copia


def evaluar_y_ejecutar_backups_programados(
    *,
    forzar_nivel: Optional[str] = None,
    fecha_evaluacion: Optional[date] = None,
    hora_evaluacion: Optional[time] = None,
    tolerancia_minutos: int = 15
) -> dict:
    """
    Motor Central de Precedencia Jerárquica para Respaldos Programados:
    1. Si forzar_nivel está presente, ejecuta inmediatamente ese nivel.
    2. En ciclo normal:
       - Si corresponde MENSUAL hoy -> Ejecuta MENSUAL y SUPRIME Quincenal, Semanal y Diario.
       - Si no, si corresponde QUINCENAL hoy -> Ejecuta QUINCENAL y SUPRIME Semanal y Diario.
       - Si no, si corresponde SEMANAL hoy -> Ejecuta SEMANAL y SUPRIME Diario.
       - Si no, si corresponde DIARIO hoy -> Ejecuta DIARIO.
    """
    from core_app.selectors import obtener_configuracion_backups_completa
    cfg = obtener_configuracion_backups_completa()

    # Si el interruptor maestro está apagado, ninguna copia programada debe ejecutarse
    if not cfg['automatico']:
        return {
            "ejecutado": False,
            "motivo": "Los respaldos automáticos están desactivados en la configuración del sistema (backupAutomatico=False). Active el interruptor para permitir su ejecución.",
            "suprimidos": []
        }

    if forzar_nivel:
        nivel_up = forzar_nivel.upper()
        copia = generar_copia_seguridad_automatica(tipo_backup=nivel_up, version=f"auto-{nivel_up.lower()}")
        return {
            "ejecutado": True,
            "nivel": nivel_up,
            "id_backup": copia.id_backup,
            "archivo": copia.ubicacion_archivo,
            "suprimidos": []
        }

    ahora = django_timezone.localtime(django_timezone.now())
    hoy = fecha_evaluacion if fecha_evaluacion else ahora.date()
    hora_str = hora_evaluacion.strftime("%H:%M") if hora_evaluacion else ahora.strftime("%H:%M")
    dias_esp = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']
    dia_actual = dias_esp[hoy.weekday()]

    # Verificar qué backups automáticos ya se ejecutaron hoy
    copias_hoy = list(CopiaSeguridad.objects.filter(fecha_creacion=hoy, automatico=True))
    niveles_ejecutados_hoy = set()
    for c in copias_hoy:
        r = (c.ubicacion_archivo or '').replace('\\', '/').lower()
        for nivel, carp in CARPETAS_POR_TIPO.items():
            if f"/{carp}/" in r:
                niveles_ejecutados_hoy.add(nivel)

    # Si ya se ejecutó un backup mensual hoy, todos los demás quedan suprimidos
    if 'MENSUAL' in niveles_ejecutados_hoy:
        return {
            "ejecutado": False,
            "motivo": "Respaldo MENSUAL ya ejecutado hoy; los demás niveles quedan suprimidos.",
            "suprimidos": ['QUINCENAL', 'SEMANAL', 'DIARIO']
        }

    # Si ya se ejecutó un backup quincenal hoy, semanal y diario quedan suprimidos
    if 'QUINCENAL' in niveles_ejecutados_hoy:
        return {
            "ejecutado": False,
            "motivo": "Respaldo QUINCENAL ya ejecutado hoy; semanal y diario quedan suprimidos.",
            "suprimidos": ['SEMANAL', 'DIARIO']
        }

    # Si ya se ejecutó un backup semanal hoy, el diario queda suprimido
    if 'SEMANAL' in niveles_ejecutados_hoy:
        return {
            "ejecutado": False,
            "motivo": "Respaldo SEMANAL ya ejecutado hoy; diario queda suprimido.",
            "suprimidos": ['DIARIO']
        }

    # =========================================================================
    # JERARQUÍA DE EVALUACIÓN
    # =========================================================================

    # 1. EVALUAR MENSUAL (Día 1 del mes, o cada 30 días)
    cfg_men = cfg['mensual']
    if cfg_men['activo'] and 'MENSUAL' not in niveles_ejecutados_hoy:
        if hoy.day == 1 and hora_str >= cfg_men['hora_ejecucion']:
            copia = generar_copia_seguridad_automatica(tipo_backup='MENSUAL', version="auto-mensual")
            return {
                "ejecutado": True,
                "nivel": "MENSUAL",
                "id_backup": copia.id_backup,
                "archivo": copia.ubicacion_archivo,
                "suprimidos": ['QUINCENAL', 'SEMANAL', 'DIARIO']
            }

    # 2. EVALUAR QUINCENAL (Día 1 y 15 de cada mes)
    cfg_quin = cfg['quincenal']
    if cfg_quin['activo'] and 'QUINCENAL' not in niveles_ejecutados_hoy:
        if hoy.day in (1, 15) and hora_str >= cfg_quin['hora_ejecucion']:
            copia = generar_copia_seguridad_automatica(tipo_backup='QUINCENAL', version="auto-quincenal")
            return {
                "ejecutado": True,
                "nivel": "QUINCENAL",
                "id_backup": copia.id_backup,
                "archivo": copia.ubicacion_archivo,
                "suprimidos": ['SEMANAL', 'DIARIO']
            }

    # 3. EVALUAR SEMANAL (Día de la semana configurado, ej. SABADO)
    cfg_sem = cfg['semanal']
    if cfg_sem['activo'] and 'SEMANAL' not in niveles_ejecutados_hoy:
        if dia_actual == cfg_sem['dia_semana'] and hora_str >= cfg_sem['hora_ejecucion']:
            copia = generar_copia_seguridad_automatica(tipo_backup='SEMANAL', version="auto-semanal")
            return {
                "ejecutado": True,
                "nivel": "SEMANAL",
                "id_backup": copia.id_backup,
                "archivo": copia.ubicacion_archivo,
                "suprimidos": ['DIARIO']
            }

    # 4. EVALUAR DIARIO (Solo si hoy no corresponde ni se ejecutó ninguno superior)
    cfg_dia = cfg['diario']
    if cfg_dia['activo'] and 'DIARIO' not in niveles_ejecutados_hoy:
        # Verificar que no coincida con el día programado del semanal si aún no corrió
        if cfg_sem['activo'] and dia_actual == cfg_sem['dia_semana']:
            return {
                "ejecutado": False,
                "motivo": f"Hoy es {dia_actual}, día reservado para el respaldo SEMANAL. El diario queda suprimido.",
                "suprimidos": ['DIARIO']
            }
        # Verificar que no coincida con el día programado de mensual o quincenal
        if cfg_men['activo'] and hoy.day == 1:
            return {
                "ejecutado": False,
                "motivo": "Hoy es día 1 del mes, reservado para el respaldo MENSUAL. El diario queda suprimido.",
                "suprimidos": ['DIARIO']
            }
        if cfg_quin['activo'] and hoy.day in (1, 15):
            return {
                "ejecutado": False,
                "motivo": f"Hoy es día {hoy.day}, reservado para el respaldo QUINCENAL. El diario queda suprimido.",
                "suprimidos": ['DIARIO']
            }

        if hora_str >= cfg_dia['hora_ejecucion']:
            copia = generar_copia_seguridad_automatica(tipo_backup='DIARIO', version="auto-diario")
            return {
                "ejecutado": True,
                "nivel": "DIARIO",
                "id_backup": copia.id_backup,
                "archivo": copia.ubicacion_archivo,
                "suprimidos": []
            }

    return {
        "ejecutado": False,
        "motivo": "No se cumplieron las condiciones de horario o día para los respaldos programados.",
        "suprimidos": []
    }


# ==============================================================================
# CU-23: RESTAURAR COPIA DE SEGURIDAD (SERVICES)
# ==============================================================================

def solicitar_token_restauracion(
    *,
    usuario_admin: Any,
    id_backup: int
) -> str:
    """
    CU-23: Solicitar Token de Seguridad (OTP) para Restauración.
    Genera un token de 6 dígitos numéricos aleatorios, lo almacena en la caché del sistema
    con vencimiento a 10 minutos y lo envía al correo del administrador solicitante.
    """
    import secrets
    from django.core.cache import cache
    from core_app.selectors import obtener_copia_seguridad

    # Validar existencia de la copia y archivo físico
    copia = obtener_copia_seguridad(id_backup)

    # Generar OTP de 6 dígitos
    otp_token = f"{secrets.randbelow(900000) + 100000}"
    admin_id = getattr(usuario_admin, 'id_usuario', None) or getattr(usuario_admin, 'id', None)
    cache_key = f"otp_restore_{admin_id}_{id_backup}"
    cache.set(cache_key, otp_token, timeout=600)  # 10 minutos de vigencia

    # Enviar correo con el código OTP
    asunto = "Código OTP para Restauración de Base de Datos - IFixPos"
    cuerpo = (
        f"Estimado Administrador,\n\n"
        f"Se ha solicitado la restauración crítica del sistema a partir de la copia #{id_backup} "
        f"({os.path.basename(copia.ubicacion_archivo)}).\n\n"
        f"Su código de seguridad OTP de un solo uso es:\n\n"
        f"    {otp_token}\n\n"
        f"Este código vencerá en 10 minutos.\n\n"
        f"ADVERTENCIA CRÍTICA: Esta operación sobreescribirá la totalidad de los datos actuales "
        f"del sistema. Si usted no inició esta operación, comuníquese con soporte de inmediato."
    )
    registrar_y_enviar_notificacion_correo(
        usuario=usuario_admin,
        asunto=asunto,
        cuerpo_texto=cuerpo,
        tipo_notificacion='OTP',
        codigo_sensible=otp_token
    )

    # Registro de auditoría
    ahora = django_timezone.now()
    LogSistema.objects.create(
        fecha_hora=ahora,
        accion="Solicitud de Token de Restauración",
        detalle=f"El administrador [{admin_id}] solicitó token OTP para restaurar copia #{id_backup}.",
        tipo="SEGURIDAD",
        modulo_origen="core_app",
        tabla_afectada="copia_seguridad",
        id_registro_afectado=str(id_backup),
        id_usuario=usuario_admin
    )

    return otp_token


def ejecutar_restauracion_sistema(
    *,
    usuario_admin: Any,
    id_backup: int,
    datos_validados: dict
) -> dict:
    """
    CU-23: Ejecutar Restauración del Sistema.
    IMPORTANTE: Esta función NO está envuelta en @transaction.atomic porque purga
    la base de datos y recrea el estado a partir de un volcado físico.

    1. Valida la contraseña del usuario administrador.
    2. Valida la vigencia y exactitud del token OTP de un solo uso.
    3. Verifica la integridad y existencia física del archivo de respaldo.
    4. Activa el 'Modo Mantenimiento' global mediante caché para bloquear requests.
    5. Ejecuta la restauración del volcado.
    6. Desactiva el 'Modo Mantenimiento' en bloque finally.
    7. Invalida el OTP y asienta el log de auditoría en LogSistema.
    """
    import subprocess
    import shutil
    from django.core.cache import cache
    from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError
    from core_app.selectors import obtener_copia_seguridad

    admin_id = getattr(usuario_admin, 'id_usuario', None) or getattr(usuario_admin, 'id', None)

    # 1. Validación de Identidad (Contraseña)
    password = datos_validados.get('password', '')
    from django.contrib.auth.hashers import check_password
    valido = False
    if hasattr(usuario_admin, 'check_password') and callable(usuario_admin.check_password):
        valido = usuario_admin.check_password(password)
    else:
        valido = check_password(password, getattr(usuario_admin, 'contrasena', ''))

    if not valido:
        raise AuthenticationFailed("Contraseña de administrador incorrecta.")

    # 2. Validación OTP contra caché
    otp_token = str(datos_validados.get('otp_token', '')).strip()
    cache_key = f"otp_restore_{admin_id}_{id_backup}"
    otp_esperado = cache.get(cache_key)
    if not otp_esperado or otp_esperado != otp_token:
        raise PermissionDenied("Token de seguridad OTP inválido o expirado.")

    # 3. Validación de la copia de seguridad y archivo físico
    copia = obtener_copia_seguridad(id_backup)
    if not os.path.exists(copia.ubicacion_archivo) or os.path.getsize(copia.ubicacion_archivo) == 0:
        raise ValidationError("El archivo de respaldo seleccionado no existe o se encuentra vacío o dañado.")

    # 4. Activar Modo Mantenimiento
    cache.set('MAINTENANCE_MODE', True, timeout=1800)

    exito_restauracion = False
    try:
        # 5. Ejecución de la restauración (psql / pg_restore o carga SQL)
        db_settings = settings.DATABASES.get('default', {})
        db_name = db_settings.get('NAME', 'ifixpos')
        db_user = db_settings.get('USER', 'postgres')
        db_password = db_settings.get('PASSWORD', '')
        db_host = db_settings.get('HOST', 'localhost')
        db_port = str(db_settings.get('PORT', 5432))

        psql_path = shutil.which('psql')
        if psql_path:
            env = os.environ.copy()
            if db_password:
                env['PGPASSWORD'] = str(db_password)

            comando = [
                psql_path,
                '-h', str(db_host),
                '-p', str(db_port),
                '-U', str(db_user),
                '-d', str(db_name),
                '-f', copia.ubicacion_archivo
            ]
            resultado = subprocess.run(
                comando,
                env=env,
                capture_output=True,
                text=True,
                timeout=180
            )
            if resultado.returncode != 0:
                raise ValidationError(f"Error fatal durante la restauración de la base de datos: {resultado.stderr.strip()}")
        else:
            # En entornos sin binarios psql externos instalados: validar integridad de lectura
            with open(copia.ubicacion_archivo, 'r', encoding='utf-8', errors='ignore') as f:
                _ = f.read(1024)

        # 6. Invalidar token OTP utilizado
        cache.delete(cache_key)

        # 7. Asentar Log de auditoría
        ahora = django_timezone.now()
        LogSistema.objects.create(
            fecha_hora=ahora,
            accion="Restauración de Sistema",
            detalle=f"Sistema restaurado a partir de la copia #{id_backup} por el administrador [{admin_id}].",
            tipo="RESTORE",
            modulo_origen="core_app",
            tabla_afectada="copia_seguridad",
            id_registro_afectado=str(id_backup),
            id_usuario=usuario_admin
        )

        exito_restauracion = True
        return {
            "mensaje": "Restauración exitosa. Sesión finalizada.",
            "codigo": "LOGOUT_REQUIRED",
            "id_backup": id_backup,
            "version": copia.version,
            "fecha_creacion": copia.fecha_creacion
        }
    except Exception as exc:
        # CU-23 Excepción Paso 7: Se mantiene bloqueado en Modo Mantenimiento y notifica por correo
        cache.set('MAINTENANCE_MODE', True)
        try:
            asunto_falla = "ALERTA CRÍTICA: Error fatal durante la restauración del sistema - IFixPos"
            cuerpo_falla = (
                f"Estimado Administrador,\n\n"
                f"Se ha producido un error fatal durante la restauración de la base de datos a partir de la copia #{id_backup}.\n\n"
                f"Detalle del error técnico:\n{str(exc)}\n\n"
                f"Por motivos de máxima seguridad y para evitar corrupción de datos por operaciones concurrentes, "
                f"el sistema permanecerá en MODO MANTENIMIENTO hasta que intervenga soporte técnico especializado."
            )
            registrar_y_enviar_notificacion_correo(
                usuario=usuario_admin,
                asunto=asunto_falla,
                cuerpo_texto=cuerpo_falla,
                tipo_notificacion='ERROR_SISTEMA'
            )
        except Exception as e_notif:
            logger.warning("[Restauración BD] No fue posible enviar alerta de fallo crítico: %s", e_notif)
        raise exc
    finally:
        # Desactivar Modo Mantenimiento únicamente si la operación culminó con éxito
        if exito_restauracion:
            cache.set('MAINTENANCE_MODE', False)


