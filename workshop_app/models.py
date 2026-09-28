from django.db import models


class CategoriaReparacion(models.Model):
    """
    Categorías clasificatorias de servicios de reparación.
    """
    id_categoria = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la categoría de reparación.'
    )
    nombre = models.CharField(
        max_length=150,
        help_text='Nombre de la categoría de reparación.'
    )
    estado_activo = models.BooleanField(
        help_text='Indica si la categoría de reparación está activa.'
    )

    class Meta:
        db_table = 'categoria_reparacion'


class Dispositivo(models.Model):
    """
    Equipos físicos registrados por los clientes.
    """
    id_dispositivo = models.AutoField(
        primary_key=True,
        help_text='Identificador único del dispositivo.'
    )
    numero_serie = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Número de serie o IMEI del dispositivo.'
    )
    fecha_registro = models.DateField(
        help_text='Fecha en que el dispositivo fue registrado.'
    )
    imagen = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text='URL a una imagen del dispositivo.'
    )
    id_modelo = models.ForeignKey(
        'catalog_app.ModeloDispositivo',
        on_delete=models.RESTRICT,
        db_column='id_modelo',
        help_text='Identificador único del modelo.'
    )
    id_usuario = models.ForeignKey(
        'users_app.Usuario',
        on_delete=models.RESTRICT,
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )

    class Meta:
        db_table = 'dispositivo'


class Reparacion(models.Model):
    """
    Reparaciones realizadas sobre dispositivos.
    """
    id_reparacion = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la reparación.'
    )
    fecha_inicio = models.DateField(
        help_text='Fecha de inicio del diagnóstico o reparación.'
    )
    hora_recepcion = models.TimeField(
        null=True,
        blank=True,
        help_text='Sello de tiempo de recepción para el proceso.'
    )
    fecha_entrega = models.DateField(
        null=True,
        blank=True,
        help_text='Fecha en que el cliente retiró el dispositivo.'
    )
    etapa = models.CharField(
        max_length=50,
        help_text='Etapa actual del proceso de reparación.'
    )
    codigo_sec = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Código de seguridad vinculado a la reparación.'
    )
    desc_cliente = models.CharField(
        max_length=1000,
        null=True,
        blank=True,
        help_text='Descripción de problemas informada por el cliente.'
    )
    credencial_acceso = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text='Credenciales necesarias para probar el dispositivo.'
    )
    id_dispositivo = models.ForeignKey(
        Dispositivo,
        on_delete=models.RESTRICT,
        db_column='id_dispositivo',
        help_text='Identificador único del dispositivo.'
    )
    id_usuario = models.ForeignKey(
        'users_app.Usuario',
        on_delete=models.RESTRICT,
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )
    id_venta = models.ForeignKey(
        'sales_app.Venta',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='id_venta',
        help_text='Identificador único de la venta.'
    )
    categorias = models.ManyToManyField(
        CategoriaReparacion,
        through='ReparacionCategoria',
        help_text='Relación M:N entre reparaciones y categorías de reparación.'
    )

    class Meta:
        db_table = 'reparacion'


class DetalleInsumoReparacion(models.Model):
    """
    Materiales consumidos en una reparación.
    """
    id_detalle_insumo = models.AutoField(
        primary_key=True,
        help_text='Identificador único del detalle de insumos usados en reparación.'
    )
    cantidad = models.IntegerField(
        help_text='Unidades instaladas o consumidas.'
    )
    precio_unitario = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Precio del producto congelado al asignarlo a la reparación.'
    )
    id_reparacion = models.ForeignKey(
        Reparacion,
        on_delete=models.CASCADE,
        db_column='id_reparacion',
        help_text='Identificador único de la reparación.'
    )
    id_producto = models.ForeignKey(
        'catalog_app.Producto',
        on_delete=models.RESTRICT,
        db_column='id_producto',
        help_text='Identificador único del producto.'
    )

    class Meta:
        db_table = 'detalle_insumo_reparacion'


class Diagnostico(models.Model):
    """
    Diagnósticos técnicos de las reparaciones.
    """
    id_diagnostico = models.AutoField(
        primary_key=True,
        help_text='Identificador único del diagnóstico técnico.'
    )
    descripcion_falla = models.CharField(
        max_length=1000,
        help_text='Detalle de las fallas detectadas.'
    )
    fecha_diagnostico = models.DateField(
        help_text='Fecha en que se realizó el diagnóstico.'
    )
    costo_diagnostico = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Costo estimado del diagnóstico o reparación.'
    )
    id_reparacion = models.ForeignKey(
        Reparacion,
        on_delete=models.CASCADE,
        db_column='id_reparacion',
        help_text='Identificador único de la reparación.'
    )

    class Meta:
        db_table = 'diagnostico'


class BitacoraReparacion(models.Model):
    """
    Historial de estados y comentarios de reparaciones.
    """
    id_bitacora = models.AutoField(
        primary_key=True,
        help_text='Identificador único del evento en la bitácora.'
    )
    fecha_hora = models.TimeField(
        help_text='Fecha y hora exacta del cambio registrado.'
    )
    estado_alcanzado = models.IntegerField(
        help_text='Nuevo estado asignado al dispositivo.'
    )
    comentario = models.CharField(
        max_length=1000,
        help_text='Justificación técnica del cambio.'
    )
    id_reparacion = models.ForeignKey(
        Reparacion,
        on_delete=models.CASCADE,
        db_column='id_reparacion',
        help_text='Identificador único de la reparación.'
    )
    id_usuario = models.ForeignKey(
        'users_app.Usuario',
        on_delete=models.RESTRICT,
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )

    class Meta:
        db_table = 'bitacora_reparacion'


class Calificacion(models.Model):
    """
    Calificaciones otorgadas a reparaciones.
    """
    id_calificacion = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la calificación de reparación.'
    )
    puntuacion = models.IntegerField(
        help_text='Puntuación numérica entre 1 y 5.'
    )
    comentario = models.CharField(
        max_length=1000,
        null=True,
        blank=True,
        help_text='Opinión textual del cliente.'
    )
    fecha = models.DateField(
        help_text='Fecha de emisión de la calificación.'
    )
    id_reparacion = models.ForeignKey(
        Reparacion,
        on_delete=models.CASCADE,
        db_column='id_reparacion',
        help_text='Identificador único de la reparación.'
    )

    class Meta:
        db_table = 'calificacion'


class ReparacionCategoria(models.Model):
    id_reparacion_categoria = models.AutoField(primary_key=True)
    id_reparacion = models.ForeignKey('Reparacion', on_delete=models.CASCADE, db_column='id_reparacion')
    id_categoria = models.ForeignKey('CategoriaReparacion', on_delete=models.CASCADE, db_column='id_categoria')

    class Meta:
        db_table = 'reparacion_categoria'
        unique_together = (('id_reparacion', 'id_categoria'),)
