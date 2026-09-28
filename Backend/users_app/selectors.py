from typing import Optional
from users_app.models import Usuario


def obtener_usuario_por_email(email: str) -> Optional[Usuario]:
    """
    Busca y retorna un usuario por su email.
    Optimiza la consulta trayendo el rol asociado utilizando select_related.
    """
    try:
        return Usuario.objects.select_related('id_rol').get(email=email)
    except Usuario.DoesNotExist:
        return None


def obtener_usuario_por_id(id_usuario: int) -> Optional[Usuario]:
    """
    Busca y retorna un usuario por su ID.
    Optimiza la consulta trayendo el rol asociado utilizando select_related.
    """
    try:
        return Usuario.objects.select_related('id_rol').get(id_usuario=id_usuario)
    except Usuario.DoesNotExist:
        return None
