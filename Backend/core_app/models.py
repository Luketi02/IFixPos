from django.db import models


class ConfiguracionSistema(models.Model):
    """
    Parámetros globales de configuración del sistema.
    """
    id_config = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la configuración.'
    )
    clave = models.TextField(
        null=True,
        blank=True,
        help_text='Clave de búsqueda para el parámetro.'
    )
    ultima_modif = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Sello de tiempo de la última modificación.'
    )
    descripcion = models.CharField(
        max_length=100,
        help_text='Descripción del parámetro de configuración.'
    )
    valor = models.CharField(
        max_length=10,
        null=True,
        blank=True,
        help_text='Valor asignado al parámetro.'
    )

    class Meta:
        db_table = 'configuracion_sistema'


class LogSistema(models.Model):
    """
    Eventos y auditoría del sistema.
    """
    id_log = models.AutoField(
        primary_key=True,
        help_text='Identificador único del evento de log.'
    )
    fecha_hora = models.TimeField(
        help_text='Sello de tiempo exacto del evento.'
    )
    accion = models.CharField(
        max_length=255,
        help_text='Descripción de la acción registrada.'
    )
    detalle = models.CharField(
        max_length=1000,
        null=True,
        blank=True,
        help_text='Información adicional del evento si corresponde.'
    )
    tipo = models.CharField(
        max_length=50,
        help_text='Tipo de log generado.'
    )
    modulo_origen = models.CharField(
        max_length=50,
        help_text='Módulo del sistema donde se originó el evento.'
    )
    tabla_afectada = models.CharField(
        max_length=150,
        null=True,
        blank=True,
        help_text='Nombre de la tabla afectada por el evento.'
    )
    id_registro_afectado = models.CharField(
        max_length=150,
        null=True,
        blank=True,
        help_text='Identificador del registro afectado dentro de la tabla.'
    )
    id_usuario = models.ForeignKey(
        'users_app.Usuario',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )

    class Meta:
        db_table = 'log_sistema'


class Notificacion(models.Model):
    """
    Notificaciones enviadas a usuarios.
    """
    id_notificacion = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la notificación.'
    )
    mensaje = models.CharField(
        max_length=1000,
        help_text='Contenido del mensaje enviado al usuario.'
    )
    tipo = models.CharField(
        max_length=100,
        help_text='Categoría o tipo de la notificación.'
    )
    fecha_envio = models.DateField(
        help_text='Fecha en la que se emitió la notificación.'
    )
    leida = models.BooleanField(
        help_text='Indica si la notificación fue leída por el usuario.'
    )
    id_usuario = models.ForeignKey(
        'users_app.Usuario',
        on_delete=models.CASCADE,
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )
    id_dispositivo = models.ForeignKey(
        'workshop_app.Dispositivo',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='id_dispositivo',
        help_text='Identificador único del dispositivo.'
    )
    id_beneficio = models.ForeignKey(
        'sales_app.Beneficio',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='id_beneficio',
        help_text='Identificador único del beneficio asociado.'
    )

    class Meta:
        db_table = 'notificacion'


class CopiaSeguridad(models.Model):
    """
    Registros de copias de seguridad.
    """
    id_backup = models.AutoField(
        primary_key=True,
        help_text='Identificador único del respaldo generado.'
    )
    fecha_creacion = models.DateField(
        help_text='Fecha de creación del respaldo.'
    )
    automatico = models.BooleanField(
        help_text='Indica si el respaldo fue generado automáticamente.'
    )
    ubicacion_archivo = models.CharField(
        max_length=500,
        help_text='Ruta o ubicación del archivo del respaldo.'
    )
    version = models.CharField(
        max_length=50,
        help_text='Versión del sistema al momento del respaldo.'
    )
    id_usuario = models.ForeignKey(
        'users_app.Usuario',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )

    class Meta:
        db_table = 'copia_seguridad'
