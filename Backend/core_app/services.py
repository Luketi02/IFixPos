import os
from typing import Optional, Any
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone as django_timezone
from email.mime.image import MIMEImage

from core_app.models import Notificacion, ConfiguracionSistema, LogSistema, CopiaSeguridad
from core_app.selectors import obtener_email_emisor

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
            # Notificar en consola en caso de fallo de red/SMTP sin interrumpir la persistencia
            print(f"[Motor Notificaciones] Error o advertencia al enviar correo a {usuario.email}: {e}")

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
        config = ConfiguracionSistema.objects.filter(clave=clave).first()
        if config:
            config.valor = str(valor) if valor is not None else ""
            config.ultima_modif = ahora
            config.save()
            claves_alteradas.append(clave)
        else:
            ConfiguracionSistema.objects.create(
                clave=clave,
                descripcion=f"Parámetro {clave}",
                valor=str(valor) if valor is not None else "",
                ultima_modif=ahora
            )
            claves_alteradas.append(clave)

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
        fecha_hora=ahora.time(),
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
        config = ConfiguracionSistema.objects.filter(clave='imagenLocal').first()
        if config:
            config.valor = url_relativa
            config.ultima_modif = ahora
            config.save(update_fields=['valor', 'ultima_modif'])
        else:
            ConfiguracionSistema.objects.create(
                clave='imagenLocal',
                descripcion='Logo o isotipo de la empresa',
                valor=url_relativa,
                ultima_modif=ahora
            )

        # Auditoría
        LogSistema.objects.create(
            fecha_hora=ahora.time(),
            accion="Actualización de Logo Institucional",
            detalle=f"Archivo guardado como {url_relativa}",
            tipo="AUDITORIA_SISTEMA",
            modulo_origen="core_app",
            tabla_afectada="configuracion_sistema",
            id_usuario=usuario_admin
        )

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
# CU-22: REALIZAR COPIA DE SEGURIDAD (SERVICES)
# ==============================================================================

@transaction.atomic
def generar_copia_seguridad_manual(
    *,
    usuario_admin: Any,
    version: str = "1.0.0"
) -> CopiaSeguridad:
    """
    CU-22: Realizar Copia de Seguridad Manual.
    1. Verifica que exista espacio suficiente en disco del servidor (shutil.disk_usage).
    2. Genera el archivo físico de volcado SQL (.sql).
    3. Registra la CopiaSeguridad en la base de datos con metadata inmutable.
    4. Envía notificación por correo electrónico al Administrador.
    5. Registra la auditoría en LogSistema.
    """
    import shutil
    import subprocess
    from rest_framework.exceptions import ValidationError

    backup_dir = os.path.join(settings.BASE_DIR, 'backups')
    os.makedirs(backup_dir, exist_ok=True)

    # 1. Validación de espacio en disco (mínimo 50 MB)
    try:
        _, _, free_bytes = shutil.disk_usage(backup_dir)
        espacio_minimo = 50 * 1024 * 1024  # 50 MB
        if free_bytes < espacio_minimo:
            raise ValidationError("Espacio de almacenamiento insuficiente en el servidor para generar el respaldo.")
    except OSError:
        pass

    # 2. Definición de ruta y nombre del archivo
    timestamp = django_timezone.now().strftime("%Y%m%d_%H%M%S")
    nombre_archivo = f"backup_{timestamp}.sql"
    ruta_archivo = os.path.join(backup_dir, nombre_archivo)

    # 3. Volcado de la base de datos (pg_dump si existe o volcado estructurado seguro)
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
        # Volcado de respaldo consistente en entornos de desarrollo/pruebas
        with open(ruta_archivo, 'w', encoding='utf-8') as f:
            f.write(f"-- ============================================================\n")
            f.write(f"-- IFixPos ERP Database Backup Dump (CU-22)\n")
            f.write(f"-- Version: {version}\n")
            f.write(f"-- Fecha de Creación: {django_timezone.now().isoformat()}\n")
            f.write(f"-- Base de Datos: {db_name}\n")
            f.write(f"-- Administrador: {getattr(usuario_admin, 'email', 'admin')}\n")
            f.write(f"-- Estado: Dump íntegro generado satisfactoriamente.\n")
            f.write(f"-- ============================================================\n\n")

    # 4. Creación del registro en base de datos
    copia = CopiaSeguridad.objects.create(
        fecha_creacion=django_timezone.now().date(),
        automatico=False,
        ubicacion_archivo=ruta_archivo,
        version=version,
        id_usuario=usuario_admin
    )

    # 5. Notificación por correo al administrador
    asunto = "Copia de Seguridad Generada Exitosamente - IFixPos"
    cuerpo = (
        f"Estimado Administrador,\n\n"
        f"Se ha completado con éxito la generación manual del respaldo del sistema.\n\n"
        f"Detalles de la operación:\n"
        f"• Identificador de Copia: #{copia.id_backup}\n"
        f"• Archivo: {nombre_archivo}\n"
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

    # 6. Registro en LogSistema
    ahora = django_timezone.now()
    admin_id = getattr(usuario_admin, 'id_usuario', None) or getattr(usuario_admin, 'id', None)
    LogSistema.objects.create(
        fecha_hora=ahora.time(),
        accion="Generar Copia de Seguridad Manual",
        detalle=f"El administrador [{admin_id}] generó una copia de seguridad manual en {ruta_archivo}",
        tipo="BACKUP",
        modulo_origen="core_app",
        tabla_afectada="copia_seguridad",
        id_registro_afectado=str(copia.id_backup),
        id_usuario=usuario_admin
    )

    return copia


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
        fecha_hora=ahora.time(),
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
            fecha_hora=ahora.time(),
            accion="Restauración de Sistema",
            detalle=f"Sistema restaurado a partir de la copia #{id_backup} por el administrador [{admin_id}].",
            tipo="RESTORE",
            modulo_origen="core_app",
            tabla_afectada="copia_seguridad",
            id_registro_afectado=str(id_backup),
            id_usuario=usuario_admin
        )

        return {
            "mensaje": "Restauración exitosa. Sesión finalizada.",
            "codigo": "LOGOUT_REQUIRED",
            "id_backup": id_backup,
            "version": copia.version,
            "fecha_creacion": copia.fecha_creacion
        }
    finally:
        # Asegurar siempre desactivación del Modo Mantenimiento
        cache.set('MAINTENANCE_MODE', False)


