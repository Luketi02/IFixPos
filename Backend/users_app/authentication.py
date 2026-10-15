import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework import exceptions
from users_app.models import Usuario

class JWTAuthentication(BaseAuthentication):
    """
    Autenticación personalizada para tokens JWT emitidos por IFixPos.
    Lee el header 'Authorization: Bearer <token>' y valida la firma con settings.SECRET_KEY.
    """
    def authenticate(self, request):
        auth_header = get_authorization_header(request).decode('utf-8')
        
        if not auth_header:
            return None
            
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            return None
            
        token = parts[1]
        
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('El token de autenticación ha expirado.')
        except jwt.InvalidTokenError:
            raise exceptions.AuthenticationFailed('Token de autenticación inválido.')
            
        id_usuario = payload.get('id_usuario')
        if not id_usuario:
            raise exceptions.AuthenticationFailed('El token no contiene un identificador de usuario válido.')
            
        try:
            usuario = Usuario.objects.select_related('id_rol').get(id_usuario=id_usuario, is_active=True)
        except Usuario.DoesNotExist:
            raise exceptions.AuthenticationFailed('Usuario no encontrado o cuenta inactiva.')
            
        return (usuario, token)
