from typing import Optional
from django.db.models import QuerySet, Q
from django.core.exceptions import ValidationError
from datetime import datetime, timezone
from users_app.models import Usuario, RolUsuario, TokenSeguridad, PerfilUsuario
from core_app.models import ConfiguracionSistema

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


def obtener_token_valido(*, id_usuario: int, codigo: str, tipo: str = 'RECUPERACION') -> TokenSeguridad:
    """Valida la existencia, no uso y vigencia del TokenSeguridad."""
    from django.utils import timezone as django_timezone
    token = TokenSeguridad.objects.filter(
        id_usuario=id_usuario, 
        codigo=codigo, 
        tipo=tipo, 
        utilizado=False
    ).order_by('-creado_en').first()
    
    if not token:
        raise ValidationError("Token inválido o inexistente.")
        
    if token.utilizado:
        raise ValidationError("El token ya fue utilizado.")
        
    if token.fecha_expiracion < django_timezone.now():
        raise ValidationError("El token ha expirado.")
        
    return token


from core_app.selectors import obtener_configuracion_bool, obtener_configuracion_texto


def obtener_perfil_usuario(id_usuario: int) -> PerfilUsuario:
    """Busca y retorna el perfil de un usuario, o levanta ValidationError si no existe."""
    try:
        return PerfilUsuario.objects.get(id_usuario=id_usuario)
    except PerfilUsuario.DoesNotExist:
        raise ValidationError("El perfil de usuario no existe.")


def perfil_esta_completo(id_usuario: int) -> bool:
    """Verifica si el PerfilUsuario tiene dni y telefono completos."""
    try:
        perfil = PerfilUsuario.objects.get(id_usuario=id_usuario)
        if perfil.dni and perfil.dni.strip() and perfil.telefono and perfil.telefono.strip():
            return True
        return False
    except PerfilUsuario.DoesNotExist:
        return False


def email_existe_excluyendo_usuario(email: str, id_usuario_excluido: int) -> bool:
    """Verifica si un email existe excluyendo un ID de usuario en particular."""
    return Usuario.objects.filter(email=email).exclude(id_usuario=id_usuario_excluido).exists()


def filtrar_usuarios(
    *, 
    dni: str = None, 
    email: str = None, 
    id_rol: int = None, 
    activo: bool = None, 
    id_pais: int = None, 
    id_provincia: int = None, 
    id_ciudad: int = None
) -> QuerySet[Usuario]:
    """CU-32: Filtro de usuarios. Retorna un QuerySet de Usuario optimizado."""
    
    qs = Usuario.objects.select_related('perfilusuario', 'id_rol')
    
    if email:
        qs = qs.filter(email=email)
    if dni:
        qs = qs.filter(perfilusuario__dni=dni)
    if id_rol is not None:
        qs = qs.filter(id_rol=id_rol)
    
    if activo is not None:
        qs = qs.filter(is_active=activo)
        
    if id_ciudad is not None:
        qs = qs.filter(direccion__id_ciudad=id_ciudad)
    elif id_provincia is not None:
        qs = qs.filter(direccion__id_ciudad__id_provincia=id_provincia)
    elif id_pais is not None:
        qs = qs.filter(direccion__id_ciudad__id_provincia__id_pais=id_pais)
        
    return qs.distinct()

