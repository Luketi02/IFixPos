from django.db import models


class Venta(models.Model):
    """
    Cabecera de ventas realizadas a clientes.
    """
    id_venta = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la venta.'
    )
    metodo_entrega = models.CharField(
        max_length=100,
        help_text='Método de entrega de la venta.'
    )
    fecha_venta = models.DateField(
        help_text='Fecha en que se realizó la venta.'
    )
    estado_venta = models.CharField(
        max_length=50,
        help_text='Estado actual de la venta.'
    )
    codigo_sec = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Código de seguridad para ventas virtuales.'
    )
    monto_subtotal = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Subtotal de productos más costos de reparaciones asociadas.'
    )
    costo_envio = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Costo total de envío aplicado a la venta.'
    )
    id_usuario = models.ForeignKey(
        'users_app.Usuario',
        on_delete=models.RESTRICT,
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )

    class Meta:
        db_table = 'venta'


class DetalleVenta(models.Model):
    """
    Renglones de productos vendidos en una venta.
    """
    id_detalle = models.AutoField(
        primary_key=True,
        help_text='Identificador único del renglón de detalle de venta.'
    )
    cantidad = models.IntegerField(
        help_text='Unidades del producto adquiridas en el renglón.'
    )
    precio_unitario = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Precio unitario congelado al momento de la compra.'
    )
    subtotal = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Monto total de este renglón (cantidad por precio).'
    )
    id_venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        db_column='id_venta',
        help_text='Identificador único de la venta.'
    )
    id_producto = models.ForeignKey(
        'catalog_app.Producto',
        on_delete=models.RESTRICT,
        db_column='id_producto',
        help_text='Identificador único del producto.'
    )

    class Meta:
        db_table = 'detalle_venta'


class MedioPago(models.Model):
    """
    Medios de pago disponibles.
    """
    id_mediopago = models.AutoField(
        primary_key=True,
        help_text='Identificador único del medio de pago.'
    )
    estado = models.BooleanField(
        help_text='Estado del medio de pago (activo/inactivo).'
    )
    nombre_medio_pago = models.CharField(
        max_length=100,
        help_text='Nombre del medio de pago.'
    )
    recargo = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Porcentaje o monto de recargo del medio de pago.'
    )

    class Meta:
        db_table = 'medio_pago'


class Pago(models.Model):
    """
    Pagos aplicados a ventas.
    """
    id_pago = models.AutoField(
        primary_key=True,
        help_text='Identificador único del pago.'
    )
    medio_pago = models.ForeignKey(
        MedioPago,
        on_delete=models.RESTRICT,
        db_column='id_mediopago',
        help_text='Medio de pago utilizado.'
    )
    monto_pagado = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Importe abonado en el pago.'
    )
    fecha_pago = models.DateField(
        help_text='Fecha en que se realizó el pago.'
    )
    detalle = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text='Descripción general u observaciones del pago.'
    )
    cod_operacion = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Código de operación cuando aplica transferencia.'
    )
    ruta_comprobante = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text='Ruta o URL del comprobante generado.'
    )
    id_venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        db_column='id_venta',
        help_text='Identificador único de la venta.'
    )

    class Meta:
        db_table = 'pago'


class CarritoCompra(models.Model):
    """
    Carritos de compras activos o históricos.
    """
    id_carrito = models.AutoField(
        primary_key=True,
        help_text='Identificador único del carrito de compras.'
    )
    fecha_creacion = models.DateField(
        help_text='Fecha en que se creó el carrito.'
    )
    estado = models.CharField(
        max_length=50,
        help_text='Estado del carrito (activo, finalizado o abandonado).'
    )
    id_usuario = models.ForeignKey(
        'users_app.Usuario',
        on_delete=models.CASCADE,
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )
    productos = models.ManyToManyField(
        'catalog_app.Producto',
        through='CarritoProducto',
        help_text='Relación M:N entre carritos y productos.'
    )

    class Meta:
        db_table = 'carrito_compra'


class CarritoProducto(models.Model):
    """
    Relación intermedia entre Carritos de Compra y Productos.
    """
    id_carrito_producto = models.AutoField(
        primary_key=True,
        help_text='Identificador único del detalle de carrito.'
    )
    id_carrito = models.ForeignKey(
        CarritoCompra,
        on_delete=models.CASCADE,
        db_column='id_carrito',
        help_text='Identificador del carrito de compra.'
    )
    id_producto = models.ForeignKey(
        'catalog_app.Producto',
        on_delete=models.RESTRICT,
        db_column='id_producto',
        help_text='Identificador del producto en el carrito.'
    )

    class Meta:
        db_table = 'carrito_producto'


class Beneficio(models.Model):
    """
    Sugerencias y beneficios ofrecidos a clientes.
    """
    id_beneficio = models.AutoField(
        primary_key=True,
        help_text='Identificador único del beneficio o sugerencia.'
    )
    motivo = models.CharField(
        max_length=500,
        help_text='Motivo que originó la recomendación.'
    )
    fecha = models.DateField(
        help_text='Fecha en que se generó la sugerencia.'
    )
    enviado_momento_compra = models.BooleanField(
        help_text='Indica si se envió en el momento de la compra.'
    )
    enviado_durante_carrito = models.BooleanField(
        help_text='Indica si se generó mientras el cliente armaba el carrito.'
    )
    por_desc = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Porcentaje de descuento asociado a la sugerencia.'
    )
    tiempo_disp = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Tiempo de vigencia del beneficio medido en horas.'
    )
    id_usuario = models.ForeignKey(
        'users_app.Usuario',
        on_delete=models.CASCADE,
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )
    id_producto = models.ForeignKey(
        'catalog_app.Producto',
        on_delete=models.CASCADE,
        db_column='id_producto',
        help_text='Identificador único del producto.'
    )

    class Meta:
        db_table = 'beneficio'
