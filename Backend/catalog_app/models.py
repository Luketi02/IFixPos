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

    @property
    def estado_activo(self) -> bool:
        """Alias para compatibilidad con el atributo de negocio estado_activo."""
        return self.estado

    @estado_activo.setter
    def estado_activo(self, value: bool):
        self.estado = value

    class Meta:
        db_table = 'categoria_producto'


class TipoCompatibilidadProducto(models.TextChoices):
    MONO_MODELO = 'MONO_MODELO', 'Modelo Específico'
    MULTI_MODELO = 'MULTI_MODELO', 'Múltiples Modelos Específicos'
    MARCAS = 'MARCAS', 'Por Marcas'
    TIPO_DISPOSITIVO = 'TIPO_DISPOSITIVO', 'Por Tipo de Dispositivo'
    UNIVERSAL = 'UNIVERSAL', 'Universal / Genérico'


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
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='id_categoria',
        help_text='Identificador único de la categoría de producto principal.'
    )
    categorias = models.ManyToManyField(
        CategoriaProducto,
        through='DetalleCategoriaProducto',
        related_name='productos',
        blank=True,
        help_text='Categorías asociadas al producto.'
    )
    id_modelo = models.ForeignKey(
        'ModeloDispositivo',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='id_modelo',
        help_text='Identificador único del modelo comercial principal de referencia si aplica.'
    )
    tipo_compatibilidad = models.CharField(
        max_length=20,
        choices=TipoCompatibilidadProducto.choices,
        default=TipoCompatibilidadProducto.MONO_MODELO,
        help_text='Ámbito de compatibilidad del producto (específico, multimodelo, marcas, formato o universal).'
    )
    es_universal = models.BooleanField(
        default=False,
        help_text='Habilita compatibilidad universal con cualquier dispositivo sin importar marca o modelo.'
    )
    id_tipo_dispositivo = models.ForeignKey(
        'TipoDispositivo',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='id_tipo_dispositivo',
        related_name='productos_directos',
        help_text='Tipo de dispositivo principal si la compatibilidad es genérica por formato.'
    )
    modelos_compatibles = models.ManyToManyField(
        'ModeloDispositivo',
        through='DetalleCompatibilidadProductoModelo',
        related_name='productos_compatibles',
        blank=True,
        help_text='Modelos compatibles adicionales o multi-modelo.'
    )
    marcas_compatibles = models.ManyToManyField(
        'Marca',
        through='DetalleCompatibilidadProductoMarca',
        related_name='productos_compatibles',
        blank=True,
        help_text='Marcas compatibles completas.'
    )
    imagen_principal = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text='URL de la imagen representativa principal del producto.'
    )

    @property
    def id_marca(self):
        """Retorna la Marca asociada a través del ModeloDispositivo o la primera marca compatible."""
        if self.id_modelo_id and self.id_modelo:
            return self.id_modelo.id_marca
        if self.pk:
            primera_marca = self.marcas_compatibles.first()
            if primera_marca:
                return primera_marca
        return None

    @property
    def id_marca_id(self):
        """Retorna el ID de la Marca asociada a través del ModeloDispositivo o marca compatible."""
        if self.id_modelo_id and self.id_modelo:
            return self.id_modelo.id_marca_id
        if self.pk:
            primera_marca = self.marcas_compatibles.first()
            if primera_marca:
                return primera_marca.id_marca
        return None

    @property
    def tipo_dispositivo_asociado(self):
        """Retorna el TipoDispositivo directo o el asociado a través del ModeloDispositivo."""
        if self.id_tipo_dispositivo_id and self.id_tipo_dispositivo:
            return self.id_tipo_dispositivo
        return self.id_modelo.id_tipo_dispositivo if self.id_modelo else None

    @property
    def tipo_dispositivo_id_calculado(self):
        """Retorna el ID del TipoDispositivo directo o derivado del modelo."""
        if self.id_tipo_dispositivo_id:
            return self.id_tipo_dispositivo_id
        return self.id_modelo.id_tipo_dispositivo_id if self.id_modelo else None

    class Meta:
        db_table = 'producto'


class DetalleCategoriaProducto(models.Model):
    """
    Tabla intermedia para vincular productos con una o múltiples categorías (N a M).
    """
    id_detalle_categoria_producto = models.AutoField(
        primary_key=True,
        help_text='Identificador único del detalle de categoría del producto.'
    )
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.CASCADE,
        related_name='categorias_detalle',
        db_column='id_producto',
        help_text='Producto asociado.'
    )
    id_categoria = models.ForeignKey(
        CategoriaProducto,
        on_delete=models.RESTRICT,
        related_name='productos_detalle',
        db_column='id_categoria',
        help_text='Categoría asignada.'
    )

    class Meta:
        db_table = 'detalle_categoria_productos'
        unique_together = ('id_producto', 'id_categoria')

    def __str__(self):
        return f"Detalle {self.id_detalle_categoria_producto}: Prod {self.id_producto_id} - Cat {self.id_categoria_id}"


class ImagenProducto(models.Model):
    """
    Imágenes complementarias y galería asociada a un producto del catálogo.
    """
    id_imagen = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la imagen del producto.'
    )
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.CASCADE,
        related_name='imagenes',
        db_column='id_producto',
        help_text='Producto al que se vincula la imagen.'
    )
    url_imagen = models.CharField(
        max_length=500,
        help_text='URL o ruta de acceso a la imagen.'
    )
    orden = models.PositiveIntegerField(
        default=0,
        help_text='Orden de visualización dentro de la galería del producto.'
    )

    class Meta:
        db_table = 'producto_imagen'
        ordering = ['orden', 'id_imagen']


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


class DetalleCompatibilidadProductoModelo(models.Model):
    """
    Tabla intermedia para compatibilidad de productos con múltiples modelos (N a M).
    """
    id_detalle_compatibilidad_modelo = models.AutoField(
        primary_key=True,
        help_text='Identificador único del detalle de compatibilidad con modelo.'
    )
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.CASCADE,
        related_name='modelos_compatibles_detalle',
        db_column='id_producto',
        help_text='Producto asociado.'
    )
    id_modelo = models.ForeignKey(
        ModeloDispositivo,
        on_delete=models.CASCADE,
        related_name='productos_compatibles_detalle',
        db_column='id_modelo',
        help_text='Modelo compatible con el producto.'
    )

    class Meta:
        db_table = 'producto_modelo_compatibilidad'
        unique_together = ('id_producto', 'id_modelo')

    def __str__(self):
        return f"Compatibilidad Prod {self.id_producto_id} - Modelo {self.id_modelo_id}"


class DetalleCompatibilidadProductoMarca(models.Model):
    """
    Tabla intermedia para compatibilidad de productos con marcas completas (N a M).
    """
    id_detalle_compatibilidad_marca = models.AutoField(
        primary_key=True,
        help_text='Identificador único del detalle de compatibilidad con marca.'
    )
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.CASCADE,
        related_name='marcas_compatibles_detalle',
        db_column='id_producto',
        help_text='Producto asociado.'
    )
    id_marca = models.ForeignKey(
        Marca,
        on_delete=models.CASCADE,
        related_name='productos_compatibles_detalle',
        db_column='id_marca',
        help_text='Marca compatible con el producto.'
    )

    class Meta:
        db_table = 'producto_marca_compatibilidad'
        unique_together = ('id_producto', 'id_marca')

    def __str__(self):
        return f"Compatibilidad Prod {self.id_producto_id} - Marca {self.id_marca_id}"

