from django.db import models


class RolUsuario(models.Model):
    """
    Tabla de roles de usuario y sus descripciones.
    """
    id_rol = models.AutoField(
        primary_key=True, 
        help_text='Identificador único del rol.'
    )
    nombre_rol = models.CharField(
        max_length=100, 
        help_text='Nombre legible del rol asignado a usuarios.'
    )
    descripcion = models.CharField(
        max_length=1000, 
        null=True, 
        blank=True, 
        help_text='Detalle de funciones y permisos asociados al rol.'
    )

    class Meta:
        db_table = 'rol_usuario'


class Usuario(models.Model):
    """
    Tabla de usuarios del sistema.
    """
    id_usuario = models.AutoField(
        primary_key=True, 
        help_text='Identificador único del usuario.'
    )
    email = models.CharField(
        max_length=255, 
        unique=True, 
        help_text='Correo electrónico utilizado como contacto y autenticación.'
    )
    contrasena = models.CharField(
        max_length=255, 
        help_text='Clave encriptada para autenticarse.'
    )
    fecha_registro = models.DateField(
        help_text='Fecha en que el usuario se registró en el sistema.'
    )
    id_rol = models.ForeignKey(
        RolUsuario, 
        on_delete=models.RESTRICT, 
        db_column='id_rol', 
        help_text='Identificador único del rol.'
    )

    class Meta:
        db_table = 'usuario'


class PerfilUsuario(models.Model):
    """
    Perfil detallado asociado a un usuario.
    """
    id_usuario = models.OneToOneField(
        Usuario, 
        on_delete=models.CASCADE, 
        primary_key=True, 
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )
    dni = models.CharField(
        max_length=50, 
        null=True, 
        blank=True, 
        help_text='Documento para facturación tomado en la primera compra.'
    )
    telefono = models.CharField(
        max_length=50, 
        null=True, 
        blank=True, 
        help_text='Número telefónico principal del usuario.'
    )
    telefono_alt = models.CharField(
        max_length=50, 
        null=True, 
        blank=True, 
        help_text='Número telefónico alternativo del usuario.'
    )
    foto_perfil = models.CharField(
        max_length=500, 
        null=True, 
        blank=True, 
        help_text='URL a la imagen de perfil del usuario.'
    )
    nombre = models.CharField(
        max_length=100, 
        null=True, 
        blank=True, 
        help_text='Nombre real del usuario.'
    )
    apellido = models.CharField(
        max_length=100, 
        null=True, 
        blank=True, 
        help_text='Apellido real del usuario.'
    )

    class Meta:
        db_table = 'perfil_usuario'


class PreferenciasUsuario(models.Model):
    """
    Preferencias personales y de notificación del usuario.
    """
    id_usuario = models.OneToOneField(
        Usuario, 
        on_delete=models.CASCADE, 
        primary_key=True, 
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )
    noti_c = models.BooleanField(
        help_text='Preferencia para recibir notificaciones por correo electrónico.'
    )
    noti_w = models.BooleanField(
        help_text='Preferencia para recibir notificaciones por WhatsApp.'
    )
    modo_oscuro = models.BooleanField(
        help_text='Preferencia visual de tema oscuro.'
    )

    class Meta:
        db_table = 'preferencias_usuario'


class TokenSeguridad(models.Model):
    """
    Tokens de seguridad para validaciones.
    """
    id_token = models.AutoField(
        primary_key=True,
        help_text='Identificador único del token.'
    )
    codigo = models.CharField(
        max_length=50,
        help_text='Código generado para validación.'
    )
    fecha_expiracion = models.TimeField(
        help_text='Fecha y hora de expiración del token.'
    )
    utilizado = models.BooleanField(
        help_text='Indica si el token ya fue canjeado.'
    )
    fecha_desbloq = models.TimeField(
        null=True,
        blank=True,
        help_text='Fecha y hora de desbloqueo por intentos.'
    )
    id_usuario = models.ForeignKey(
        Usuario,
        on_delete=models.CASCADE,
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )

    class Meta:
        db_table = 'token_seguridad'
