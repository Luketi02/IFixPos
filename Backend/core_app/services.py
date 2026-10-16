import os
from typing import Optional, Any
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone as django_timezone
from email.mime.image import MIMEImage

from core_app.models import Notificacion
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
    adjuntar_logo: bool = True
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
            leida=False
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
