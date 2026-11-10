from django.db import models
from django.utils import timezone


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
    fecha_hora_creacion = models.DateTimeField(
        default=timezone.now,
        null=True,
        blank=True,
        help_text='Marca temporal exacta de creación de la venta para control de reservas de stock.'
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
    id_direccion_envio = models.ForeignKey(
        'geo_app.Direccion',
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        db_column='id_direccion_envio',
        help_text='Dirección de entrega asignada para envíos a domicilio.'
    )

    class Meta:
        db_table = 'venta'
        indexes = [
            models.Index(fields=['estado_venta', 'fecha_venta'], name='idx_venta_estado_fecha'),
            models.Index(fields=['codigo_sec'], name='idx_venta_codigo_sec'),
        ]


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
    codigo = models.CharField(
        max_length=30,
        null=True,
        blank=True,
        db_index=True,
        help_text='Código técnico inmutable del medio de pago (MP, EFECTIVO, TRANSFERENCIA, TARJETA, OTRO).'
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
        indexes = [
            models.Index(fields=['cod_operacion'], name='idx_pago_cod_operacion'),
        ]


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
    cantidad = models.IntegerField(
        default=1,
        help_text='Cantidad de unidades del producto en el carrito.'
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
    fecha_hora_creacion = models.DateTimeField(
        default=timezone.now,
        null=True,
        blank=True,
        help_text='Marca temporal exacta de emisión del beneficio para cálculo de vigencia en horas.'
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
        null=True,
        blank=True,
        db_column='id_producto',
        help_text='Identificador único del producto (opcional para beneficios globales o mano de obra).'
    )

    @property
    def fecha_hora_expiracion(self):
        """
        Retorna el datetime exacto de expiración del beneficio sumando `tiempo_disp` (en horas)
        a `fecha_hora_creacion` (o al inicio de `fecha` si la fecha explícita difiere de la fecha de creación).
        """
        if self.tiempo_disp is None or float(self.tiempo_disp) <= 0:
            return None
        import datetime
        horas = float(self.tiempo_disp)
        if self.fecha_hora_creacion:
            base_dt = self.fecha_hora_creacion
            if timezone.is_naive(base_dt):
                base_dt = timezone.make_aware(base_dt, timezone.get_current_timezone())
            if self.fecha and self.fecha != timezone.localtime(base_dt).date():
                inicio_dia = datetime.datetime.combine(self.fecha, datetime.time.min)
                base_dt = timezone.make_aware(inicio_dia, timezone.get_current_timezone())
            return base_dt + datetime.timedelta(hours=horas)
        if self.fecha:
            inicio_dia = datetime.datetime.combine(self.fecha, datetime.time.min)
            if timezone.is_naive(inicio_dia):
                inicio_dia = timezone.make_aware(inicio_dia, timezone.get_current_timezone())
            return inicio_dia + datetime.timedelta(hours=horas)
        return None

    @property
    def estado(self) -> str:
        """Determina dinámicamente el estado del beneficio (ACTIVO, REVOCADO o CADUCADO) con precisión de horas."""
        if self.motivo and '[REVOCADO]' in self.motivo:
            return 'REVOCADO'
        if self.tiempo_disp is not None and self.tiempo_disp <= 0:
            return 'REVOCADO'
        expira_dt = self.fecha_hora_expiracion
        if not expira_dt:
            return 'CADUCADO'
        if timezone.now() > expira_dt:
            return 'CADUCADO'
        return 'ACTIVO'

    class Meta:
        db_table = 'beneficio'
