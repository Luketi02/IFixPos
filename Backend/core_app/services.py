import os
from typing import Optional, Any
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone as django_timezone
from email.mime.image import MIMEImage

from core_app.models import Notificacion, ConfiguracionSistema, LogSistema
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


