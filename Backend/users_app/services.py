import jwt
from datetime import datetime, timedelta, timezone
from typing import Dict, Any
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from users_app.models import Usuario, RolUsuario
from users_app.selectors import obtener_usuario_por_email
from google.oauth2 import id_token
from google.auth.transport import requests


class CredencialesInvalidasError(Exception):
    """Excepción para manejar errores de autenticación."""
    pass


def generar_tokens_jwt(usuario: Usuario) -> Dict[str, str]:
    """
    Genera tokens de acceso y refresco JWT para el usuario especificado.
    """
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
    
    # Dependiendo de la versión de pyjwt, el resultado podría ser un string o bytes
    access_token = jwt.encode(access_payload, settings.SECRET_KEY, algorithm='HS256')
    refresh_token = jwt.encode(refresh_payload, settings.SECRET_KEY, algorithm='HS256')
    
    if isinstance(access_token, bytes):
        access_token = access_token.decode('utf-8')
    if isinstance(refresh_token, bytes):
        refresh_token = refresh_token.decode('utf-8')
    
    return {
        "access": access_token,
        "refresh": refresh_token
    }


def autenticar_y_obtener_tokens(email: str, password_plano: str) -> Dict[str, Any]:
    """
    Busca al usuario, valida su contraseña y genera los tokens JWT.
    """
    usuario = obtener_usuario_por_email(email)
    
    if not usuario or not check_password(password_plano, usuario.contrasena):
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
    """
    Valida un token de Google, autentica al usuario si existe, 
    o lo registra con rol 'Cliente' si es nuevo.
    """
    try:
        # Opcional: pasar el CLIENT_ID de google desde settings
        client_id = getattr(settings, 'GOOGLE_CLIENT_ID', None)
        idinfo = id_token.verify_oauth2_token(google_token, requests.Request(), client_id)
        
        email = idinfo.get('email')
        
        usuario = obtener_usuario_por_email(email)
        
        if not usuario:
            # Crear usuario si no existe asignándole rol 'Cliente'
            rol_cliente, _ = RolUsuario.objects.get_or_create(
                nombre_rol='Cliente',
                defaults={'descripcion': 'Rol generado automáticamente'}
            )
            
            usuario = Usuario.objects.create(
                email=email,
                contrasena=make_password(None), # Contraseña inusable
                id_rol=rol_cliente
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
