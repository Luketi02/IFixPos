from typing import Dict, Any
from django.contrib.auth.hashers import check_password
from users_app.selectors import obtener_usuario_por_email


class CredencialesInvalidas(Exception):
    """
    Excepción personalizada lanzada cuando falla la autenticación de un usuario
    debido a credenciales incorrectas.
    """
    pass


def autenticar_usuario(email: str, password_plano: str) -> Dict[str, Any]:
    """
    Ejecuta el caso de uso de Iniciar Sesión, validando las credenciales
    contra la base de datos.
    
    Args:
        email (str): Correo electrónico provisto por el usuario.
        password_plano (str): Contraseña en texto plano a verificar.
        
    Returns:
        Dict[str, Any]: Un diccionario con la instancia del usuario y el nombre de su rol.
        
    Raises:
        CredencialesInvalidas: Si el usuario no existe o la contraseña no coincide.
    """
    usuario = obtener_usuario_por_email(email)
    
    if not usuario:
        # Falla intencionalmente con un mensaje genérico por seguridad
        raise CredencialesInvalidas("Credenciales inválidas")
        
    if not check_password(password_plano, usuario.contrasena):
        # Falla intencionalmente con un mensaje genérico por seguridad
        raise CredencialesInvalidas("Credenciales inválidas")
        
    return {
        'usuario': usuario,
        'rol': usuario.id_rol.nombre_rol
    }
