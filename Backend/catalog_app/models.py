from django.db import models


class CategoriaProducto(models.Model):
    """
    Categorías de productos de inventario.
    """
    id_categoria = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la categoría de producto.'
    )
    nombre = models.CharField(
        max_length=150,
        help_text='Nombre de la categoría de producto.'
    )
    descripcion = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text='Descripción de los tipos de productos incluidos.'
    )
    estado = models.BooleanField(
        help_text='Indica si la categoría está activa para nuevos productos.'
    )

    class Meta:
        db_table = 'categoria_producto'


class Producto(models.Model):
    """
    Productos y consumibles del inventario.
    """
    id_producto = models.AutoField(
        primary_key=True,
        help_text='Identificador único del producto.'
    )
    nombre = models.CharField(
        max_length=255,
        help_text='Nombre comercial del producto.'
    )
    descripcion = models.CharField(
        max_length=1000,
        null=True,
        blank=True,
        help_text='Detalle o especificación técnica del producto.'
    )
    precio_venta = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Precio de venta vigente para el producto.'
    )
    estado = models.BooleanField(
        help_text='Indica el estado de disponibilidad del producto.'
    )
    apto_venta = models.BooleanField(
        help_text='Habilita la visibilidad del producto en el catálogo y ventas.'
    )
    apto_reparacion = models.BooleanField(
        help_text='Habilita consumo interno del producto para reparaciones.'
    )
    apto_consumible = models.BooleanField(
        help_text='Permite baja por consumo interno del producto.'
    )
    modulo_automatico = models.BooleanField(
        help_text='Habilita órdenes de compra automáticas para reabastecer.'
    )
    id_categoria = models.ForeignKey(
        CategoriaProducto,
        on_delete=models.RESTRICT,
        db_column='id_categoria',
        help_text='Identificador único de la categoría de producto.'
    )

    class Meta:
        db_table = 'producto'


class TipoDispositivo(models.Model):
    """
    Tipos de dispositivos reparables.
    """
    id_tipo_dispositivo = models.AutoField(
        primary_key=True,
        help_text='Identificador único del tipo de dispositivo.'
    )
    nombre = models.CharField(
        max_length=100,
        help_text='Nombre del tipo de dispositivo.'
    )
    estado_activo = models.BooleanField(
        help_text='Indica si el tipo se encuentra activo.'
    )

    class Meta:
        db_table = 'tipo_dispositivo'


class Marca(models.Model):
    """
    Marcas de dispositivos.
    """
    id_marca = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la marca.'
    )
    nombre = models.CharField(
        max_length=150,
        help_text='Nombre comercial del fabricante.'
    )
    estado_activo = models.BooleanField(
        help_text='Indica si la marca está activa.'
    )

    class Meta:
        db_table = 'marca'


class ModeloDispositivo(models.Model):
    """
    Modelos comerciales de dispositivos.
    """
    id_modelo = models.AutoField(
        primary_key=True,
        help_text='Identificador único del modelo.'
    )
    nombre = models.CharField(
        max_length=150,
        help_text='Denominación comercial del modelo.'
    )
    estado_activo = models.BooleanField(
        help_text='Indica si el modelo está activo.'
    )
    id_marca = models.ForeignKey(
        Marca,
        on_delete=models.RESTRICT,
        db_column='id_marca',
        help_text='Identificador único de la marca.'
    )
    id_tipo_dispositivo = models.ForeignKey(
        TipoDispositivo,
        on_delete=models.RESTRICT,
        db_column='id_tipo_dispositivo',
        help_text='Identificador único del tipo de dispositivo.'
    )

    class Meta:
        db_table = 'modelo'
