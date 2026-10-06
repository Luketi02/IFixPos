import jwt
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.utils.crypto import get_random_string
from users_app.models import Usuario, RolUsuario, PerfilUsuario, TokenSeguridad
from users_app.selectors import (
    obtener_usuario_por_email, email_existe, get_rol_cliente, 
    obtener_token_valido, obtener_configuracion_bool,
    obtener_perfil_usuario, email_existe_excluyendo_usuario
)
from core_app.models import LogSistema, Notificacion
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
        fecha_hora=datetime.now(timezone.utc).time(),
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
        'exp': now + timedelta(days=1)
    }
    refresh_payload = {
        'id_usuario': usuario.id_usuario,
        'iat': now,
        'exp': now + timedelta(days=7)
    }
    access_token = jwt.encode(access_payload, settings.SECRET_KEY, algorithm='HS256')
    refresh_token = jwt.encode(refresh_payload, settings.SECRET_KEY, algorithm='HS256')
    
    if isinstance(access_token, bytes):
        access_token = access_token.decode('utf-8')
    if isinstance(refresh_token, bytes):
        refresh_token = refresh_token.decode('utf-8')
        
    return {"access": access_token, "refresh": refresh_token}

def autenticar_y_obtener_tokens(email: str, password_plano: str) -> Dict[str, Any]:
    """Busca al usuario, valida su contraseña y genera los tokens JWT."""
    try:
        usuario = obtener_usuario_por_email(email)
    except ValidationError:
        raise CredencialesInvalidasError("Correo o contraseña incorrectos.")
        
    if not check_password(password_plano, usuario.contrasena):
        raise CredencialesInvalidasError("Correo o contraseña incorrectos.")
    tokens = generar_tokens_jwt(usuario)
    return {
        "tokens": tokens,
        "usuario": {
            "id_usuario": usuario.id_usuario,
            "email": usuario.email,
            "rol": usuario.id_rol.nombre_rol if usuario.id_rol else None
        }
    }

def autenticar_con_google(google_token: str) -> Dict[str, Any]:
    """Valida un token de Google y autentica o registra."""
    try:
        client_id = getattr(settings, 'GOOGLE_CLIENT_ID', None)
        idinfo = id_token.verify_oauth2_token(google_token, requests.Request(), client_id)
        email = idinfo.get('email')
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
                fecha_registro=datetime.now(timezone.utc).date()
            )
            
        tokens = generar_tokens_jwt(usuario)
        return {
            "tokens": tokens,
            "usuario": {
                "id_usuario": usuario.id_usuario,
                "email": usuario.email,
                "rol": usuario.id_rol.nombre_rol if usuario.id_rol else None
            }
        }
    except ValueError as e:
        raise ValueError("Token de Google inválido o expirado.") from e

def registrar_cuenta_publica(
    *, 
    nombre: str, 
    apellido: str, 
    email: str, 
    telefono: str, 
    contrasena: str, 
    captcha_token: str, 
    telefono_alt: Optional[str] = None
) -> Usuario:
    if not captcha_token:
        raise ValueError("El captcha_token es inválido o nulo.")
        
    with transaction.atomic():
        if email_existe(email):
            raise ValidationError("El correo electrónico ya se encuentra registrado")
            
        rol_cliente_id = get_rol_cliente()
        
        usuario = Usuario.objects.create(
            email=email,
            contrasena=make_password(contrasena),
            fecha_registro=datetime.now(timezone.utc).date(),
            id_rol_id=rol_cliente_id
        )
        
        PerfilUsuario.objects.create(
            id_usuario=usuario,
            nombre=nombre,
            apellido=apellido,
            telefono=telefono,
            telefono_alt=telefono_alt
        )
        
        registrar_log_condicional(
            clave_switch="log_seguridad_accesos",
            accion="Registro de cuenta pública",
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
        
        Notificacion.objects.create(
            mensaje=f"Tu cuenta ha sido creada. Tus credenciales son email: {email}",
            tipo="INFO_CUENTA",
            fecha_envio=datetime.now(timezone.utc).date(),
            leida=False,
            id_usuario=usuario
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
    """Genera un token de restablecimiento de contraseña para un usuario dado."""
    with transaction.atomic():
        usuario = obtener_usuario_por_email(email)
        codigo = get_random_string(length=6).upper()
        ahora = datetime.now(timezone.utc)
        expiracion = (ahora + timedelta(minutes=5)).time()
        
        TokenSeguridad.objects.create(
            codigo=codigo,
            fecha_expiracion=expiracion,
            utilizado=False,
            id_usuario=usuario
        )
        # Simulación de envío por correo o SMS
        print(f"SIMULACIÓN: Enviando token {codigo} al correo {email}")
        
    return codigo

def validar_y_restablecer_credencial(*, email: str, token: str, nueva_contrasena: str) -> None:
    """Valida el token y restablece la contraseña del usuario."""
    with transaction.atomic():
        usuario = obtener_usuario_por_email(email)
        token_obj = obtener_token_valido(id_usuario=usuario.id_usuario, codigo=token)
        
        usuario.contrasena = make_password(nueva_contrasena)
        usuario.save()
        
        token_obj.utilizado = True
        token_obj.save()
        
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
    with transaction.atomic():
        if email_existe_excluyendo_usuario(email, id_usuario):
            raise ValidationError("El correo electrónico ingresado ya está siendo utilizado por otra cuenta.")
            
        usuario = Usuario.objects.get(id_usuario=id_usuario)
        usuario.email = email
        usuario.save()
        
        perfil = obtener_perfil_usuario(id_usuario)
        perfil.nombre = nombre
        perfil.apellido = apellido
        perfil.telefono = telefono
        perfil.dni = dni
        perfil.telefono_alt = telefono_alt
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
