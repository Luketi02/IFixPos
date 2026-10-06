from typing import Optional
from django.core.exceptions import ValidationError
from datetime import datetime, timezone
from users_app.models import Usuario, RolUsuario, TokenSeguridad

def obtener_usuario_por_email(email: str) -> Usuario:
    """
    Busca y retorna un usuario por su email.
    Optimiza la consulta trayendo el rol asociado utilizando select_related.
    Lanza ValidationError si no existe.
    """
    try:
        return Usuario.objects.select_related('id_rol').get(email=email)
    except Usuario.DoesNotExist:
        raise ValidationError("El usuario no existe.")

def obtener_usuario_por_id(id_usuario: int) -> Optional[Usuario]:
    """
    Busca y retorna un usuario por su ID.
    Optimiza la consulta trayendo el rol asociado utilizando select_related.
    """
    try:
        return Usuario.objects.select_related('id_rol').get(id_usuario=id_usuario)
    except Usuario.DoesNotExist:
        return None

def email_existe(email: str) -> bool:
    """Verifica si el correo ya existe en el modelo Usuario."""
    return Usuario.objects.filter(email=email).exists()

def get_rol_cliente() -> int:
    """Retorna el id_rol correspondiente al rol 'Cliente'."""
    try:
        rol = RolUsuario.objects.get(nombre_rol='Cliente')
        return rol.id_rol
    except RolUsuario.DoesNotExist:
        raise RuntimeError("El rol 'Cliente' no existe en la base de datos.")


def obtener_token_valido(*, id_usuario: int, codigo: str) -> TokenSeguridad:
    """Valida la existencia, no uso y vigencia del TokenSeguridad."""
    try:
        token = TokenSeguridad.objects.get(id_usuario=id_usuario, codigo=codigo)
    except TokenSeguridad.DoesNotExist:
        raise ValidationError("Token inválido.")
        
    if token.utilizado:
        raise ValidationError("El token ya fue utilizado.")
        
    # Asumiendo que fecha_expiracion es un TimeField, se compara la hora.
    # En un caso real con cruce de días se prefiere DateTimeField.
    if token.fecha_expiracion < datetime.now(timezone.utc).time():
        raise ValidationError("El token ha expirado.")
        
    return token
