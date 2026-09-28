from django.db import models


class Pais(models.Model):
    """
    Listado de países soportados para direcciones y cobertura.
    """
    id_pais = models.AutoField(
        primary_key=True,
        help_text='Identificador único del país.'
    )
    nombre_pais = models.CharField(
        max_length=150,
        help_text='Nombre del país.'
    )
    cobertura_habilitada = models.BooleanField(
        help_text='Indica si el país tiene cobertura de envíos.'
    )

    class Meta:
        db_table = 'pais'


class Provincia(models.Model):
    """
    Listado de provincias vinculadas a un país.
    """
    id_provincia = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la provincia.'
    )
    nombre_provincia = models.CharField(
        max_length=150,
        help_text='Nombre oficial de la provincia.'
    )
    cobertura_habilitada = models.BooleanField(
        help_text='Indica si la provincia tiene cobertura de envíos.'
    )
    id_pais = models.ForeignKey(
        Pais,
        on_delete=models.RESTRICT,
        db_column='id_pais',
        help_text='Identificador único del país.'
    )

    class Meta:
        db_table = 'provincia'


class Ciudad(models.Model):
    """
    Ciudades vinculadas a una provincia.
    """
    id_ciudad = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la ciudad.'
    )
    nombre_ciudad = models.CharField(
        max_length=150,
        help_text='Nombre oficial de la ciudad.'
    )
    cobertura_habilitada = models.BooleanField(
        help_text='Indica si la ciudad tiene cobertura de envíos.'
    )
    id_provincia = models.ForeignKey(
        Provincia,
        on_delete=models.RESTRICT,
        db_column='id_provincia',
        help_text='Identificador único de la provincia.'
    )

    class Meta:
        db_table = 'ciudad'


class Direccion(models.Model):
    """
    Direcciones postales de usuarios y proveedores.
    """
    id_direccion = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la dirección.'
    )
    alias = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Nombre de referencia para la dirección.'
    )
    nro_calle = models.CharField(
        max_length=255,
        help_text='Número y nombre de la calle.'
    )
    nombre_barrio = models.CharField(
        max_length=150,
        null=True,
        blank=True,
        help_text='Barrio de la dirección.'
    )
    nro_dpto = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text='Número o identificación del departamento.'
    )
    piso = models.IntegerField(
        null=True,
        blank=True,
        help_text='Número de piso del domicilio.'
    )
    id_ciudad = models.ForeignKey(
        Ciudad,
        on_delete=models.RESTRICT,
        db_column='id_ciudad',
        help_text='Identificador único de la ciudad.'
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
        db_table = 'direccion'
