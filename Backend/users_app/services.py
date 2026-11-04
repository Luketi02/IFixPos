import jwt
import secrets
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone as django_timezone
from django.utils.crypto import get_random_string
from users_app.models import Usuario, RolUsuario, PerfilUsuario, TokenSeguridad
from users_app.selectors import (
    obtener_usuario_por_email, email_existe, get_rol_cliente, 
    obtener_token_valido, obtener_configuracion_bool,
    obtener_configuracion_texto,
    obtener_perfil_usuario, email_existe_excluyendo_usuario,
    perfil_esta_completo
)
from core_app.models import LogSistema, Notificacion
from core_app.services import registrar_y_enviar_notificacion_correo, marcar_ultima_notificacion_como_leida
from google.oauth2 import id_token
from google.auth.transport import requests
from django.core.exceptions import ValidationError
from django.db import transaction
# pyrefly: ignore [missing-import]
from rest_framework_simplejwt.tokens import RefreshToken

class CredencialesInvalidasError(Exception):
    """Excepción para manejar errores de autenticación."""
    pass

def registrar_log_condicional(
    *, 
    clave_switch: str, 
    accion: str, 
    tipo: str, 
    modulo_origen: str, 
    tabla_afectada: Optional[str] = None, 
    id_registro_afectado: Optional[int] = None, 
    id_usuario: Optional[int] = None
) -> None:
    """Registra un log en el sistema si el switch en ConfiguracionSistema está activo."""
    if not obtener_configuracion_bool(clave_switch):
        return
        
    usuario = Usuario.objects.get(id_usuario=id_usuario) if id_usuario else None
        
    LogSistema.objects.create(
        fecha_hora=datetime.now(timezone.utc),
        accion=accion,
        tipo=tipo,
        modulo_origen=modulo_origen,
        tabla_afectada=tabla_afectada,
        id_registro_afectado=str(id_registro_afectado) if id_registro_afectado else None,
        id_usuario=usuario
    )


def generar_tokens_jwt(usuario: Usuario) -> Dict[str, str]:
    """Genera tokens de acceso y refresco JWT para el usuario especificado."""
    now = datetime.now(timezone.utc)
    rol_nombre = usuario.id_rol.nombre_rol if usuario.id_rol else None
    access_payload = {
        'id_usuario': usuario.id_usuario,
        'email': usuario.email,
        'rol': rol_nombre,
        'iat': now,
        'exp': now + timedelta(minutes=60)
    }
    from core_app.selectors import obtener_tiempo_sesion_inactiva_horas
    horas_inactiva = obtener_tiempo_sesion_inactiva_horas()
    refresh_payload = {
        'id_usuario': usuario.id_usuario,
        'iat': now,
        'exp': now + timedelta(hours=horas_inactiva)
    }
    access_token = jwt.encode(access_payload, settings.SECRET_KEY, algorithm='HS256')
    refresh_token = jwt.encode(refresh_payload, settings.SECRET_KEY, algorithm='HS256')
    
    if isinstance(access_token, bytes):
        access_token = access_token.decode('utf-8')
    if isinstance(refresh_token, bytes):
        refresh_token = refresh_token.decode('utf-8')
        
    return {"access": access_token, "refresh": refresh_token}


def refrescar_token_jwt(*, refresh_token: str) -> Dict[str, str]:
    """
    Valida un refresh token JWT y emite un nuevo par de tokens (access y refresh)
    para mantener la sesión activa mientras el usuario opere en el sistema.
    """
    if not refresh_token:
        raise ValidationError("El token de refresco es obligatorio.")

    try:
        payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        raise ValidationError("El token de sesión ha expirado por inactividad. Debe iniciar sesión nuevamente.")
    except jwt.InvalidTokenError:
        raise ValidationError("Token de refresco inválido.")

    id_usuario = payload.get('id_usuario')
    if not id_usuario:
        raise ValidationError("El token no contiene un identificador de usuario válido.")

    try:
        usuario = Usuario.objects.select_related('id_rol').get(id_usuario=id_usuario, is_active=True)
    except Usuario.DoesNotExist:
        raise ValidationError("Usuario inactivo o no encontrado.")

    return generar_tokens_jwt(usuario)

def autenticar_y_obtener_tokens(email: str, password_plano: str) -> Dict[str, Any]:
    """Busca al usuario, valida su contraseña y estado activo, y genera los tokens JWT."""
    from django.core.cache import cache
    from core_app.selectors import obtener_max_intentos_login

    email_limpio = (email or '').strip().lower()
    cache_key = f"intentos_login_fallidos_{email_limpio}"
    max_intentos = obtener_max_intentos_login()
    intentos_previos = cache.get(cache_key, 0)

    if intentos_previos >= max_intentos:
        raise CredencialesInvalidasError(
            f"Tu cuenta ha sido bloqueada temporalmente por superar el límite de {max_intentos} intentos fallidos de inicio de sesión. Por favor, intenta más tarde."
        )

    try:
        usuario = obtener_usuario_por_email(email)
    except ValidationError:
        cache.set(cache_key, intentos_previos + 1, timeout=900)
        raise CredencialesInvalidasError("Correo o contraseña incorrectos.")
        
    if not check_password(password_plano, usuario.contrasena):
        cache.set(cache_key, intentos_previos + 1, timeout=900)
        raise CredencialesInvalidasError("Correo o contraseña incorrectos.")

    # Credenciales válidas: reiniciar contador de intentos fallidos
    cache.delete(cache_key)
        
    if not usuario.is_active:
        raise CredencialesInvalidasError("Tu cuenta no ha sido verificada. Por favor, revisa tu correo electrónico para activarla.")

    tokens = generar_tokens_jwt(usuario)
    perfil = PerfilUsuario.objects.filter(id_usuario=usuario).first()
    return {
        "tokens": tokens,
        "usuario": {
            "id_usuario": usuario.id_usuario,
            "email": usuario.email,
            "rol": usuario.id_rol.nombre_rol if usuario.id_rol else None,
            "nombre": perfil.nombre if perfil and perfil.nombre else "",
            "apellido": perfil.apellido if perfil and perfil.apellido else "",
            "dni": perfil.dni if perfil and perfil.dni else "",
            "telefono": perfil.telefono if perfil and perfil.telefono else "",
            "telefono_alt": perfil.telefono_alt if perfil and perfil.telefono_alt else "",
            "foto_perfil": perfil.foto_perfil if perfil and perfil.foto_perfil else "",
            "perfil_completo": perfil_esta_completo(usuario.id_usuario)
        }
    }

def autenticar_con_google(google_token: str) -> Dict[str, Any]:
    """Valida un token de Google, extrae datos del perfil y autentica o registra."""
    try:
        client_id = getattr(settings, 'GOOGLE_CLIENT_ID', None)
        idinfo = id_token.verify_oauth2_token(google_token, requests.Request(), client_id)
        email = idinfo.get('email')
        
        # Extraer datos de perfil del payload de Google
        given_name = idinfo.get('given_name') or ''
        family_name = idinfo.get('family_name') or ''
        picture = idinfo.get('picture') or ''

        with transaction.atomic():
            try:
                usuario = obtener_usuario_por_email(email)
            except ValidationError:
                usuario = None
            
            if not usuario:
                rol_cliente, _ = RolUsuario.objects.get_or_create(
                    nombre_rol='Cliente',
                    defaults={'descripcion': 'Rol generado automáticamente'}
                )
                usuario = Usuario.objects.create(
                    email=email,
                    contrasena=make_password(None),
                    id_rol=rol_cliente,
                    fecha_registro=datetime.now(timezone.utc).date(),
                    is_active=True
                )
            
            # Obtener o crear PerfilUsuario e inyectar given_name, family_name y picture
            perfil, created = PerfilUsuario.objects.get_or_create(
                id_usuario=usuario,
                defaults={
                    'nombre': given_name,
                    'apellido': family_name,
                    'foto_perfil': picture
                }
            )
            
            # Si el usuario ya existía, NO sobreescribimos los datos personalizados por el usuario.
            # Únicamente completamos información si los campos actuales en la BD estuviesen vacíos.
            if not created:
                modificado = False
                if not perfil.nombre and given_name:
                    perfil.nombre = given_name
                    modificado = True
                if not perfil.apellido and family_name:
                    perfil.apellido = family_name
                    modificado = True
                if not perfil.foto_perfil and picture:
                    perfil.foto_perfil = picture
                    modificado = True
                if modificado:
                    perfil.save()

            registrar_log_condicional(
                clave_switch="log_seguridad_accesos",
                accion="Autenticación con Google exitosa",
                tipo="INFO",
                modulo_origen="Autenticación",
                tabla_afectada="usuario",
                id_registro_afectado=usuario.id_usuario,
                id_usuario=usuario.id_usuario
            )
            
        tokens = generar_tokens_jwt(usuario)
        return {
            "tokens": tokens,
            "usuario": {
                "id_usuario": usuario.id_usuario,
                "email": usuario.email,
                "rol": usuario.id_rol.nombre_rol if usuario.id_rol else None,
                "nombre": perfil.nombre if perfil and perfil.nombre else "",
                "apellido": perfil.apellido if perfil and perfil.apellido else "",
                "dni": perfil.dni if perfil and perfil.dni else "",
                "telefono": perfil.telefono if perfil and perfil.telefono else "",
                "telefono_alt": perfil.telefono_alt if perfil and perfil.telefono_alt else "",
                "foto_perfil": perfil.foto_perfil if perfil and perfil.foto_perfil else picture,
                "perfil_completo": perfil_esta_completo(usuario.id_usuario)
            }
        }
    except ValueError as e:
        raise ValueError("Token de Google inválido o expirado.") from e

@transaction.atomic
def completar_perfil_onboarding(
    *, 
    id_usuario: int, 
    dni: str, 
    telefono: str,
    nombre: Optional[str] = None,
    apellido: Optional[str] = None,
    telefono_alt: Optional[str] = None
) -> Dict[str, Any]:
    """Completa el perfil del usuario luego de un inicio de sesión con Google (Onboarding)."""
    if PerfilUsuario.objects.filter(dni=dni).exclude(id_usuario=id_usuario).exists():
        raise ValidationError("El DNI ingresado ya pertenece a otra cuenta.")
        
    usuario = Usuario.objects.select_related('id_rol').get(id_usuario=id_usuario)
    
    perfil, created = PerfilUsuario.objects.get_or_create(
        id_usuario=usuario,
        defaults={
            'dni': dni, 
            'telefono': telefono, 
            'nombre': nombre or '', 
            'apellido': apellido or '',
            'telefono_alt': telefono_alt or ''
        }
    )
    if not created:
        perfil.dni = dni
        perfil.telefono = telefono
        if nombre is not None:
            perfil.nombre = nombre
        if apellido is not None:
            perfil.apellido = apellido
        if telefono_alt is not None:
            perfil.telefono_alt = telefono_alt
        perfil.save()
        
    registrar_log_condicional(
        clave_switch="log_seguridad_accesos",
        accion="Completado de perfil por Onboarding de Google",
        tipo="INFO",
        modulo_origen="Usuarios",
        tabla_afectada="perfil_usuario",
        id_registro_afectado=usuario.id_usuario,
        id_usuario=usuario.id_usuario
    )

    return {
        "mensaje": "Perfil completado exitosamente.",
        "usuario": {
            "id_usuario": usuario.id_usuario,
            "email": usuario.email,
            "rol": usuario.id_rol.nombre_rol if usuario.id_rol else None,
            "nombre": perfil.nombre or "",
            "apellido": perfil.apellido or "",
            "dni": perfil.dni,
            "telefono": perfil.telefono,
            "telefono_alt": perfil.telefono_alt or "",
            "foto_perfil": perfil.foto_perfil or "",
            "perfil_completo": True
        }
    }

def generar_y_enviar_codigo_verificacion(*, usuario: Usuario, nombre: Optional[str] = None) -> TokenSeguridad:
    """
    Genera un código OTP de 6 dígitos único en TokenSeguridad (tipo='ACTIVACION'),
    lo guarda con vigencia de 15 minutos y despacha el correo electrónico de verificación.
    """
    codigo_otp = f"{secrets.randbelow(1000000):06d}"
    expiracion = django_timezone.now() + timedelta(minutes=15)
    
    # Invalida códigos previos de activación sin utilizar
    TokenSeguridad.objects.filter(id_usuario=usuario, tipo='ACTIVACION', utilizado=False).update(utilizado=True)
    
    token_obj = TokenSeguridad.objects.create(
        id_usuario=usuario,
        codigo=codigo_otp,
        tipo='ACTIVACION',
        fecha_expiracion=expiracion,
        utilizado=False
    )
    
    if not nombre:
        try:
            perfil = PerfilUsuario.objects.get(id_usuario=usuario)
            nombre = perfil.nombre or ""
        except PerfilUsuario.DoesNotExist:
            nombre = ""

    saludo = f"Hola {nombre}," if nombre else "Hola,"
    asunto = "🔐 Código de verificación - IFixPos"
    cuerpo = (
        f"{saludo}\n\n"
        f"Gracias por registrarte en IFixPos.\n"
        f"Tu código de verificación es: {codigo_otp}\n\n"
        f"Este código expirará en 15 minutos.\n"
        f"Si no solicitaste este registro, por favor ignora este mensaje.\n\n"
        f"Atentamente,\n"
        f"El equipo de IFixPos"
    )

    cuerpo_html = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verificación de Correo - IFixPos</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #0B1120; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #F8FAFC;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0B1120; padding: 40px 10px;">
        <tr>
          <td align="center">
            <!-- Contenedor Principal / Tarjeta -->
            <table role="presentation" width="100%" style="max-width: 520px; background-color: #1E293B; border-radius: 16px; border: 1px solid rgba(6, 182, 212, 0.4); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); overflow: hidden;">
              
              <!-- Header con Logo y Acento Neón -->
              <tr>
                <td style="padding: 32px 32px 16px 32px; text-align: center; border-bottom: 1px solid rgba(51, 65, 85, 0.6);">
                  <div style="display: inline-block; padding: 12px; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 12px; margin-bottom: 12px;">
                    <img src="cid:logo_ifixpos" alt="Logo IFixPos" width="323" height="131" style="display: block; border: 0; margin: 0 auto;" />
                  </div>
                  <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #F8FAFC;">
                    IFix<span style="color: #06B6D4;">Pos</span>
                  </h1>
                  <p style="margin: 6px 0 0 0; font-size: 13px; color: #94A3B8; letter-spacing: 0.5px; text-transform: uppercase;">
                    Verificación de Seguridad
                  </p>
                </td>
              </tr>

              <!-- Cuerpo Principal -->
              <tr>
                <td style="padding: 32px 32px 24px 32px; text-align: center;">
                  <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600; color: #F8FAFC;">
                    {saludo}
                  </h2>
                  <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #CBD5E1;">
                    Gracias por unirte a <strong>IFixPos</strong>. Para activar tu cuenta de forma segura, ingresa el siguiente código de verificación de un solo uso (OTP):
                  </p>

                  <!-- Caja Destacada del Código OTP -->
                  <div style="background-color: #0F172A; border: 2px dashed #8B5CF6; border-radius: 12px; padding: 20px; margin: 24px 0; display: inline-block; width: 80%;">
                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #06B6D4; display: block;">
                      {codigo_otp}
                    </span>
                  </div>

                  <!-- Información de Expiración -->
                  <p style="margin: 0 0 16px 0; font-size: 13px; color: #94A3B8;">
                    ⏳ Este código es válido durante los próximos <strong style="color: #E2E8F0;">15 minutos</strong>.
                  </p>
                  <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748B;">
                    Si no creaste una cuenta en IFixPos, puedes desestimar este mensaje de forma segura.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 20px 32px; background-color: #0F172A; text-align: center; border-top: 1px solid rgba(51, 65, 85, 0.6);">
                  <p style="margin: 0; font-size: 12px; color: #64748B;">
                    © 2026 IFixPos ERP — Sistema de Gestión Integral de Reparaciones y POS.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    # Despacho centralizado y registro en Notificacion con código enmascarado
    registrar_y_enviar_notificacion_correo(
        usuario=usuario,
        asunto=asunto,
        cuerpo_texto=cuerpo,
        cuerpo_html=cuerpo_html,
        tipo_notificacion="ACTIVACION",
        codigo_sensible=codigo_otp,
        adjuntar_logo=True
    )
    
    return token_obj

@transaction.atomic
def registrar_cuenta_publica(
    *, 
    nombre: str, 
    apellido: str, 
    email: str, 
    dni: str,
    telefono: str, 
    contrasena: str, 
    captcha_token: str, 
    telefono_alt: Optional[str] = None
) -> Usuario:
    if not captcha_token:
        raise ValueError("El captcha_token es inválido o nulo.")
        
    usuario_existente = Usuario.objects.filter(email=email).first()
    if usuario_existente:
        if usuario_existente.is_active:
            raise ValidationError("El correo electrónico ya se encuentra registrado")
        
        # Cuenta previa aún no verificada (is_active=False): Actualizar datos para permitir corrección
        usuario = usuario_existente
        usuario.contrasena = make_password(contrasena)
        usuario.fecha_registro = datetime.now(timezone.utc).date()
        usuario.save(update_fields=['contrasena', 'fecha_registro'])
        
        PerfilUsuario.objects.update_or_create(
            id_usuario=usuario,
            defaults={
                'nombre': nombre,
                'apellido': apellido,
                'dni': dni,
                'telefono': telefono,
                'telefono_alt': telefono_alt
            }
        )
        
        # Generar y enviar nuevo código numérico de 6 dígitos (15 min)
        generar_y_enviar_codigo_verificacion(usuario=usuario, nombre=nombre)
        
        registrar_log_condicional(
            clave_switch="log_seguridad_accesos",
            accion="Actualización de datos y reenvío de OTP para cuenta no verificada",
            tipo="INFO",
            modulo_origen="Usuarios",
            tabla_afectada="usuario",
            id_registro_afectado=usuario.id_usuario,
            id_usuario=usuario.id_usuario
        )
    else:
        rol_cliente_id = get_rol_cliente()
        
        # El usuario se crea inactivo (is_active=False) hasta validar su correo
        usuario = Usuario.objects.create(
            email=email,
            contrasena=make_password(contrasena),
            fecha_registro=datetime.now(timezone.utc).date(),
            id_rol_id=rol_cliente_id,
            is_active=False
        )
        
        PerfilUsuario.objects.create(
            id_usuario=usuario,
            nombre=nombre,
            apellido=apellido,
            dni=dni,
            telefono=telefono,
            telefono_alt=telefono_alt
        )
        
        # Generar y enviar código numérico de 6 dígitos (15 min)
        generar_y_enviar_codigo_verificacion(usuario=usuario, nombre=nombre)
        
        registrar_log_condicional(
            clave_switch="log_seguridad_accesos",
            accion="Registro de cuenta pública y envío de código OTP",
            tipo="INFO",
            modulo_origen="Usuarios",
            tabla_afectada="usuario",
            id_registro_afectado=usuario.id_usuario,
            id_usuario=usuario.id_usuario
        )
        
    return usuario

def registrar_cuenta_interna(
    *, 
    id_ejecutor: int, 
    rol_ejecutor: str, 
    nombre: str, 
    apellido: str, 
    email: str, 
    telefono: str, 
    contrasena: str, 
    telefono_alt: Optional[str] = None, 
    id_rol_asignado: Optional[int] = None
) -> Usuario:
    with transaction.atomic():
        if email_existe(email):
            raise ValidationError("El correo electrónico ya se encuentra registrado")
            
        if rol_ejecutor == "Tecnico":
            rol_id_usar = get_rol_cliente()
        elif rol_ejecutor == "Administrador":
            if id_rol_asignado is None:
                raise ValidationError("El administrador debe proveer un id_rol_asignado")
            rol_id_usar = id_rol_asignado
        else:
            raise ValidationError("Rol de ejecutor no autorizado para esta acción")
            
        usuario = Usuario.objects.create(
            email=email,
            contrasena=make_password(contrasena),
            fecha_registro=datetime.now(timezone.utc).date(),
            id_rol_id=rol_id_usar
        )
        
        PerfilUsuario.objects.create(
            id_usuario=usuario,
            nombre=nombre,
            apellido=apellido,
            telefono=telefono,
            telefono_alt=telefono_alt
        )
        
        ejecutor = Usuario.objects.get(id_usuario=id_ejecutor) if id_ejecutor else None
        
        registrar_log_condicional(
            clave_switch="log_seguridad_accesos",
            accion="Registro de cuenta interna",
            tipo="INFO",
            modulo_origen="Usuarios",
            tabla_afectada="usuario",
            id_registro_afectado=usuario.id_usuario,
            id_usuario=id_ejecutor
        )
        
        registrar_y_enviar_notificacion_correo(
            usuario=usuario,
            asunto="Bienvenido a IFixPos - Cuenta Creada",
            cuerpo_texto=f"Tu cuenta ha sido creada. Tus credenciales son, email: {email}, contraseña: {contrasena}",
            tipo_notificacion="INFO_CUENTA",
            codigo_sensible=contrasena,
            adjuntar_logo=False
        )
        
    return usuario


def cerrar_sesion_usuario(*, id_usuario: int, refresh_token: str) -> None:
    """
    Invalida el token de refresco (blacklist) y registra la acción de auditoría.
    """
    with transaction.atomic():
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            # Capturamos excepciones genéricas (como TokenError) para no impedir
            # que se ejecute la lógica de logout (ej. token ya expirado).
            pass
            
        usuario = Usuario.objects.get(id_usuario=id_usuario) if id_usuario else None
        
        registrar_log_condicional(
            clave_switch="log_seguridad_accesos",
            accion="Cierre de sesión exitoso",
            tipo="INFO",
            modulo_origen="Autenticación",
            tabla_afectada="usuario",
            id_registro_afectado=id_usuario,
            id_usuario=id_usuario
        )

def generar_token_seguridad(*, email: str) -> str:
    """Genera un token de restablecimiento de contraseña para un usuario dado (TTL 5 minutos CU-43)."""
    with transaction.atomic():
        usuario = obtener_usuario_por_email(email)
        codigo = get_random_string(length=6).upper()
        expiracion = django_timezone.now() + timedelta(minutes=5)
        
        TokenSeguridad.objects.filter(id_usuario=usuario, tipo='RECUPERACION', utilizado=False).update(utilizado=True)
        
        token_obj = TokenSeguridad.objects.create(
            codigo=codigo,
            tipo='RECUPERACION',
            fecha_expiracion=expiracion,
            utilizado=False,
            id_usuario=usuario
        )
        
        # Obtener nombre del usuario si está disponible
        nombre = ""
        try:
            perfil = PerfilUsuario.objects.get(id_usuario=usuario)
            nombre = perfil.nombre or ""
        except PerfilUsuario.DoesNotExist:
            nombre = ""

        saludo = f"Hola {nombre}," if nombre else "Hola,"
        asunto = "🔑 Recuperación de contraseña - IFixPos"
        cuerpo = (
            f"{saludo}\n\n"
            f"Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en IFixPos.\n"
            f"Tu código de seguridad temporal es: {codigo}\n\n"
            f"Este código es válido estrictamente durante los próximos 5 minutos.\n"
            f"Si no solicitaste este cambio, por favor desestima este mensaje de forma segura.\n\n"
            f"Atentamente,\n"
            f"El equipo de IFixPos"
        )

        cuerpo_html = f"""
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Recuperación de Contraseña - IFixPos</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #0B1120; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #F8FAFC;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0B1120; padding: 40px 10px;">
            <tr>
              <td align="center">
                <!-- Contenedor Principal / Tarjeta -->
                <table role="presentation" width="100%" style="max-width: 520px; background-color: #1E293B; border-radius: 16px; border: 1px solid rgba(6, 182, 212, 0.4); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); overflow: hidden;">
                  
                  <!-- Header con Logo y Acento Neón -->
                  <tr>
                    <td style="padding: 32px 32px 16px 32px; text-align: center; border-bottom: 1px solid rgba(51, 65, 85, 0.6);">
                      <div style="display: inline-block; padding: 12px; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 12px; margin-bottom: 12px;">
                        <img src="cid:logo_ifixpos" alt="Logo IFixPos" width="323" height="131" style="display: block; border: 0; margin: 0 auto;" />
                      </div>
                      <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #F8FAFC;">
                        IFix<span style="color: #06B6D4;">Pos</span>
                      </h1>
                      <p style="margin: 6px 0 0 0; font-size: 13px; color: #94A3B8; letter-spacing: 0.5px; text-transform: uppercase;">
                        Recuperación de Credenciales
                      </p>
                    </td>
                  </tr>

                  <!-- Cuerpo Principal -->
                  <tr>
                    <td style="padding: 32px 32px 24px 32px; text-align: center;">
                      <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600; color: #F8FAFC;">
                        {saludo}
                      </h2>
                      <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #CBD5E1;">
                        Hemos recibido una solicitud para restablecer tu contraseña. Ingresa el siguiente código de seguridad temporal para continuar:
                      </p>

                      <!-- Caja Destacada del Código -->
                      <div style="background-color: #0F172A; border: 2px dashed #8B5CF6; border-radius: 12px; padding: 20px; margin: 24px 0; display: inline-block; width: 80%;">
                        <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #06B6D4; display: block;">
                          {codigo}
                        </span>
                      </div>

                      <!-- Información de Expiración (TTL 5 Minutos Estricto) -->
                      <p style="margin: 0 0 16px 0; font-size: 13px; color: #94A3B8;">
                        ⏳ Este código es válido estrictamente durante los próximos <strong style="color: #E2E8F0;">5 minutos</strong>.
                      </p>
                      <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748B;">
                        Si tú no solicitaste este cambio, puedes desestimar este mensaje de forma segura. Tu contraseña actual no se modificará.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding: 20px 32px; background-color: #0F172A; text-align: center; border-top: 1px solid rgba(51, 65, 85, 0.6);">
                      <p style="margin: 0; font-size: 12px; color: #64748B;">
                        © 2026 IFixPos ERP — Sistema de Gestión Integral de Reparaciones y POS.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """

        # Despacho centralizado y registro en Notificacion con código enmascarado
        registrar_y_enviar_notificacion_correo(
            usuario=usuario,
            asunto=asunto,
            cuerpo_texto=cuerpo,
            cuerpo_html=cuerpo_html,
            tipo_notificacion="RECUPERACION",
            codigo_sensible=codigo,
            adjuntar_logo=True
        )

        # Mensaje de simulación para auditoría y desarrollo local
        print(f"SIMULACIÓN: Enviando token {codigo} al correo {email}")
        
    return codigo

def validar_y_restablecer_credencial(*, email: str, token: str, nueva_contrasena: str) -> None:
    """Valida el token y restablece la contraseña del usuario."""
    with transaction.atomic():
        usuario = obtener_usuario_por_email(email)
        token_obj = obtener_token_valido(id_usuario=usuario.id_usuario, codigo=token, tipo='RECUPERACION')
        
        usuario.contrasena = make_password(nueva_contrasena)
        usuario.save()
        
        token_obj.utilizado = True
        token_obj.save()
        
        # Marcar como leída la última notificación de recuperación de contraseña
        marcar_ultima_notificacion_como_leida(usuario=usuario, tipo='RECUPERACION')
        
        registrar_log_condicional(
            clave_switch="log_seguridad_accesos",
            accion="Restablecimiento de credenciales vía Token",
            tipo="SEGURIDAD",
            modulo_origen="Autenticación",
            tabla_afectada="usuario",
            id_registro_afectado=usuario.id_usuario,
            id_usuario=usuario.id_usuario
        )

def solicitar_recuperacion_contrasena(*, email: str, captcha_token: str) -> None:
    """Solicita la recuperación de contraseña validando captcha y previniendo enumeración."""
    if not captcha_token:
        raise ValidationError("El captcha_token es obligatorio e inválido.")
        
    with transaction.atomic():
        try:
            usuario = obtener_usuario_por_email(email)
        except ValidationError:
            # Prevención de enumeración: retornamos silenciosamente si el usuario no existe.
            return
            
        # Generamos el token de seguridad (este método ya guarda en BD y está anidado en savepoint)
        generar_token_seguridad(email=email)
        
        registrar_log_condicional(
            clave_switch="log_seguridad_accesos",
            accion="Solicitud de recuperación de contraseña",
            tipo="SEGURIDAD",
            modulo_origen="Autenticación",
            tabla_afectada="usuario",
            id_registro_afectado=usuario.id_usuario,
            id_usuario=usuario.id_usuario
        )

@transaction.atomic
def editar_perfil_usuario(
    *, 
    id_usuario: int, 
    email: str, 
    nombre: str, 
    apellido: str, 
    telefono: str, 
    dni: Optional[str] = None, 
    telefono_alt: Optional[str] = None, 
    foto_perfil: Optional[str] = None
) -> Dict[str, Any]:
    """Actualiza el email (Usuario) y demás datos (PerfilUsuario) de manera atómica."""
    if email_existe_excluyendo_usuario(email, id_usuario):
        raise ValidationError("El correo electrónico ingresado ya está siendo utilizado por otra cuenta.")
        
    usuario = Usuario.objects.get(id_usuario=id_usuario)
    usuario.email = email
    usuario.save()
    
    perfil = obtener_perfil_usuario(id_usuario)
    perfil.nombre = nombre
    perfil.apellido = apellido
    perfil.telefono = telefono
    if dni is not None:
        perfil.dni = dni
    if telefono_alt is not None:
        perfil.telefono_alt = telefono_alt
    if foto_perfil is not None:
        perfil.foto_perfil = foto_perfil
    perfil.save()
    
    registrar_log_condicional(
        clave_switch="log_seguridad_accesos",
        accion="Edición de perfil de usuario",
        tipo="INFO",
        modulo_origen="Usuarios",
        tabla_afectada="perfil_usuario",
        id_registro_afectado=id_usuario,
        id_usuario=id_usuario
    )
    
    return {
        "id_usuario": usuario.id_usuario,
        "email": usuario.email,
        "nombre": perfil.nombre,
        "apellido": perfil.apellido,
        "telefono": perfil.telefono,
        "dni": perfil.dni,
        "telefono_alt": perfil.telefono_alt,
        "foto_perfil": perfil.foto_perfil
    }

@transaction.atomic
def verificar_y_activar_usuario(email: str, codigo: str) -> Dict[str, Any]:
    """
    Valida el código de 6 dígitos OTP de verificación. Si es válido y no expiró,
    activa la cuenta del usuario (is_active = True), invalida el código y retorna los tokens JWT.
    """
    try:
        usuario = obtener_usuario_por_email(email)
    except ValidationError:
        raise ValidationError("No existe ningún usuario registrado con el correo electrónico proporcionado.")
        
    if usuario.is_active:
        raise ValidationError("La cuenta ya se encuentra activa y verificada.")
        
    token_obj = TokenSeguridad.objects.filter(
        id_usuario=usuario,
        codigo=codigo,
        tipo='ACTIVACION',
        utilizado=False
    ).order_by('-creado_en').first()
    
    if not token_obj:
        raise ValidationError("El código de verificación es inválido o incorrecto.")
        
    if token_obj.fecha_expiracion < django_timezone.now():
        raise ValidationError("El código de verificación ha expirado. Por favor, solicita uno nuevo.")
        
    # Activar la cuenta
    usuario.is_active = True
    usuario.save(update_fields=['is_active'])
    
    # Invalidar el token utilizado
    token_obj.utilizado = True
    token_obj.save(update_fields=['utilizado'])
    
    # Marcar como leída la última notificación de activación de cuenta
    marcar_ultima_notificacion_como_leida(usuario=usuario, tipo='ACTIVACION')
    
    registrar_log_condicional(
        clave_switch="log_seguridad_accesos",
        accion="Verificación de correo y activación de cuenta",
        tipo="SEGURIDAD",
        modulo_origen="Autenticación",
        tabla_afectada="usuario",
        id_registro_afectado=usuario.id_usuario,
        id_usuario=usuario.id_usuario
    )
    
    tokens = generar_tokens_jwt(usuario)
    perfil = PerfilUsuario.objects.filter(id_usuario=usuario).first()
    
    return {
        "mensaje": "Cuenta verificada y activada exitosamente.",
        "tokens": tokens,
        "usuario": {
            "id_usuario": usuario.id_usuario,
            "email": usuario.email,
            "rol": usuario.id_rol.nombre_rol if usuario.id_rol else None,
            "nombre": perfil.nombre if perfil and perfil.nombre else "",
            "apellido": perfil.apellido if perfil and perfil.apellido else "",
            "dni": perfil.dni if perfil and perfil.dni else "",
            "telefono": perfil.telefono if perfil and perfil.telefono else "",
            "telefono_alt": perfil.telefono_alt if perfil and perfil.telefono_alt else "",
            "foto_perfil": perfil.foto_perfil if perfil and perfil.foto_perfil else "",
            "perfil_completo": perfil_esta_completo(usuario.id_usuario)
        }
    }

def guardar_archivo_foto_perfil(*, id_usuario: int, archivo) -> str:
    """
    Valida y guarda un archivo de imagen para la foto de perfil en MEDIA_ROOT/perfiles.
    Retorna la URL relativa al archivo guardado.
    """
    if not archivo:
        raise ValidationError("No se proporcionó ningún archivo de imagen.")

    # Validar extensión
    ext = os.path.splitext(archivo.name)[1].lower()
    formatos_permitidos = ['.png', '.jpg', '.jpeg', '.webp']
    if ext not in formatos_permitidos:
        raise ValidationError(f"Formato no permitido. Solo se admiten: {', '.join(formatos_permitidos)}")

    # Validar tamaño según configuración del sistema (tamanoMaxArchivoMB)
    from core_app.selectors import obtener_tamano_maximo_archivo_bytes, obtener_tamano_maximo_archivo_mb
    max_bytes = obtener_tamano_maximo_archivo_bytes()
    max_mb = obtener_tamano_maximo_archivo_mb()
    if archivo.size > max_bytes:
        raise ValidationError(f"El archivo supera el tamaño máximo permitido de {max_mb} MB.")

    carpeta_destino = os.path.join(settings.MEDIA_ROOT, 'perfiles')
    os.makedirs(carpeta_destino, exist_ok=True)

    timestamp = int(django_timezone.now().timestamp())
    nombre_archivo = f"avatar_u{id_usuario}_{timestamp}{ext}"
    ruta_completa = os.path.join(carpeta_destino, nombre_archivo)

    with open(ruta_completa, 'wb+') as destino:
        for chunk in archivo.chunks():
            destino.write(chunk)

    # Actualizar la foto en PerfilUsuario
    perfil = PerfilUsuario.objects.filter(id_usuario__id_usuario=id_usuario).first()
    url_relativa = f"/media/perfiles/{nombre_archivo}"
    return url_relativa


@transaction.atomic
def modificar_usuario_por_admin(
    *,
    usuario_admin: Usuario,
    id_usuario_destino: int,
    datos_validados: Dict[str, Any]
) -> Usuario:
    """
    CU-44: Modificar Usuario por Administrador.
    Permite modificar los datos personales, de contacto y credenciales de cualquier usuario,
    reasignar su rol de sistema y forzar una nueva contraseña encriptada sin token de verificación.
    Registra auditoría en LogSistema.
    """
    from users_app.selectors import obtener_usuario_completo

    # 1. Recuperar usuario objetivo con sus relaciones
    usuario_destino = obtener_usuario_completo(id_usuario_destino)

    # 2. Actualizar datos base de Usuario
    nuevo_email = datos_validados.get('email')
    if nuevo_email and nuevo_email != usuario_destino.email:
        usuario_destino.email = nuevo_email

    # Actualizar Rol
    rol_instancia = datos_validados.get('rol_instancia')
    if rol_instancia:
        usuario_destino.id_rol = rol_instancia

    # Forzar contraseña si se especificó
    forzar_pass = datos_validados.get('forzar_contrasena')
    se_forzo_contrasena = False
    if forzar_pass and forzar_pass.strip():
        usuario_destino.contrasena = make_password(forzar_pass.strip())
        se_forzo_contrasena = True

    usuario_destino.save()

    # 3. Actualizar PerfilUsuario
    perfil, _ = PerfilUsuario.objects.get_or_create(id_usuario=usuario_destino)
    if 'nombre' in datos_validados:
        perfil.nombre = datos_validados['nombre']
    if 'apellido' in datos_validados:
        perfil.apellido = datos_validados['apellido']
    if 'telefono' in datos_validados:
        perfil.telefono = datos_validados['telefono'] or ""
    if 'telefono_alt' in datos_validados:
        perfil.telefono_alt = datos_validados['telefono_alt'] or ""
    perfil.save()

    # 4. Auditoría de Seguridad (LogSistema)
    admin_identificador = f"{usuario_admin.id_usuario} ({usuario_admin.email})"
    texto_forzado = "Sí" if se_forzo_contrasena else "No"
    detalle_log = (
        f"El administrador {admin_identificador} modificó el perfil del usuario {usuario_destino.id_usuario}. "
        f"Se forzó contraseña: {texto_forzado}."
    )

    now_utc = datetime.now(timezone.utc)
    LogSistema.objects.create(
        fecha_hora=now_utc,
        accion="Modificación administrativa de usuario (CU-44)",
        detalle=detalle_log,
        tipo="SEGURIDAD",
        modulo_origen="Usuarios",
        tabla_afectada="usuario",
        id_registro_afectado=usuario_destino.id_usuario,
        id_usuario=usuario_admin
    )

    return usuario_destino


@transaction.atomic
def modificar_rol_sistema(
    *,
    usuario_admin: Usuario,
    id_rol: int,
    datos_validados: Dict[str, Any]
) -> RolUsuario:
    """
    CU-84: Modificar Rol de Sistema por Administrador.
    Permite modificar el nombre y/o la descripción de un rol activo.
    Registra auditoría en LogSistema.
    """
    from users_app.selectors import obtener_rol_para_edicion

    rol = obtener_rol_para_edicion(id_rol)

    nombre_previo = rol.nombre_rol
    descripcion_previa = rol.descripcion or ""

    if 'nombre' in datos_validados and datos_validados['nombre']:
        rol.nombre_rol = datos_validados['nombre']

    if 'descripcion' in datos_validados:
        rol.descripcion = datos_validados['descripcion']

    rol.save()

    # Auditoría (LogSistema)
    admin_identificador = f"{usuario_admin.id_usuario} ({usuario_admin.email})"
    detalle_log = (
        f"El administrador {admin_identificador} modificó el rol {rol.id_rol} ({rol.codigo}). "
        f"Nuevos datos: Nombre: '{rol.nombre_rol}', Descripción: '{rol.descripcion or ''}'."
    )

    now_utc = datetime.now(timezone.utc)
    LogSistema.objects.create(
        fecha_hora=now_utc,
        accion="Modificación de rol de sistema (CU-84)",
        detalle=detalle_log,
        tipo="SEGURIDAD",
        modulo_origen="Usuarios",
        tabla_afectada="rol_usuario",
        id_registro_afectado=rol.id_rol,
        id_usuario=usuario_admin
    )

    return rol




@transaction.atomic
def guardar_preferencias_usuario(
    *,
    usuario: Usuario,
    datos_validados: dict
) -> PreferenciasUsuario:
    """
    Motor de escritura para actualizar o inicializar las preferencias personales del usuario.
    Envuelto en @transaction.atomic. Prohibido recibir request como parámetro.
    Registra auditoría en LogSistema.
    """
    from users_app.models import PreferenciasUsuario
    from core_app.models import LogSistema

    pref, _ = PreferenciasUsuario.objects.select_for_update().get_or_create(
        id_usuario=usuario,
        defaults={
            'noti_c': True,
            'noti_w': False,
            'modo_oscuro': True
        }
    )

    if 'noti_c' in datos_validados:
        pref.noti_c = bool(datos_validados['noti_c'])
    if 'noti_w' in datos_validados:
        pref.noti_w = bool(datos_validados['noti_w'])
    if 'modo_oscuro' in datos_validados:
        pref.modo_oscuro = bool(datos_validados['modo_oscuro'])

    pref.save()

    # Registro de auditoría
    LogSistema.objects.create(
        fecha_hora=datetime.now(timezone.utc),
        accion="Actualización de preferencias personales",
        detalle=(
            f"El usuario {usuario.email} actualizó sus preferencias personales. "
            f"Email: {pref.noti_c}, WhatsApp: {pref.noti_w}, Modo Oscuro: {pref.modo_oscuro}."
        ),
        tipo="ACCESO",
        modulo_origen="Usuarios",
        tabla_afectada="preferencias_usuario",
        id_registro_afectado=usuario.id_usuario,
        id_usuario=usuario
    )

    return pref
