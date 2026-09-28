from typing import Optional
from users_app.models import Usuario


def obtener_usuario_por_email(email: str) -> Optional[Usuario]:
    """
    Busca y retorna la instancia del modelo Usuario filtrando por su email.
    Utiliza select_related para optimizar la consulta y traer el rol
    asociado (id_rol) en el mismo viaje a la base de datos.
    
    Args:
        email (str): El correo electrónico del usuario.
        
    Returns:
        Optional[Usuario]: La instancia del usuario si existe, de lo contrario None.
    """
    try:
        return Usuario.objects.select_related('id_rol').get(email=email)
    except Usuario.DoesNotExist:
        return None
