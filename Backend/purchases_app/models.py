from decimal import Decimal
from django.db import models


class Proveedor(models.Model):
    """
    Datos de proveedores comerciales.
    """
    cuit_prov = models.CharField(
        max_length=20,
        primary_key=True,
        help_text='Identificador fiscal único del proveedor.'
    )
    nombre_proveedor = models.CharField(
        max_length=255,
        help_text='Nombre comercial del proveedor.'
    )
    correo = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text='Correo electrónico de contacto del proveedor.'
    )
    telefono = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text='Teléfono de contacto del proveedor.'
    )
    estado = models.BooleanField(
        default=True,
        help_text='Indica si el proveedor se encuentra activo en el sistema.'
    )
    ofrece_envio = models.BooleanField(
        default=True,
        help_text='Indica si el proveedor realiza envíos.'
    )
    indice_confiabilidad = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('10.00'),
        help_text='Indicador numérico de confiabilidad operacional del proveedor.'
    )
    tiempo_promedio_entrega = models.IntegerField(
        default=3,
        help_text='Tiempo promedio de entrega en días.'
    )
    nivel = models.CharField(
        max_length=50,
        default='Estándar',
        help_text='Clasificación del proveedor según su tipo comercial.'
    )
    id_direccion = models.ForeignKey(
        'geo_app.Direccion',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='id_direccion',
        help_text='Identificador único de la dirección.'
    )

    @property
    def id_proveedor(self) -> str:
        return self.cuit_prov

    @property
    def cuit(self) -> str:
        return self.cuit_prov

    @property
    def nombre(self) -> str:
        return self.nombre_proveedor

    @nombre.setter
    def nombre(self, value: str):
        self.nombre_proveedor = value

    @property
    def direccion(self):
        return self.id_direccion

    @direccion.setter
    def direccion(self, value):
        self.id_direccion = value

    class Meta:
        db_table = 'proveedor'


class SolicitudCotizacion(models.Model):
    """
    Pedidos maestros de cotización a proveedores.
    """
    ESTADO_BORRADOR = 0
    ESTADO_ENVIADA = 1
    ESTADO_COTIZADA = 2
    ESTADO_RECHAZADA = 3
    ESTADO_CERRADA = 4

    ESTADOS_DICT = {
        ESTADO_BORRADOR: 'Borrador',
        ESTADO_ENVIADA: 'Enviada a Proveedores',
        ESTADO_COTIZADA: 'Cotizada',
        ESTADO_RECHAZADA: 'Rechazada',
        ESTADO_CERRADA: 'Cerrada/Evaluada',
    }

    id_solicitud = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la solicitud de cotización.'
    )
    fecha_emision = models.DateField(
        help_text='Fecha en que se emitió la solicitud.'
    )
    estado_solicitud = models.IntegerField(
        help_text='Estado actual de la solicitud según su ciclo.'
    )
    sol_tec = models.BooleanField(
        default=False,
        help_text='Indica si la solicitud fue originada como requerimiento técnico de una reparación.'
    )
    productos = models.ManyToManyField(
        'catalog_app.Producto',
        through='SolicitudCotizacionProducto',
        help_text='Relación M:N entre solicitud de cotización y productos requeridos.'
    )

    @property
    def estado_nombre(self) -> str:
        return self.ESTADOS_DICT.get(self.estado_solicitud, 'Borrador')

    class Meta:
        db_table = 'solicitud_cotizacion'


class SolicitudCotizacionProducto(models.Model):
    """
    Relación intermedia entre Solicitudes de Cotización y Productos.
    """
    id_solicitud_producto = models.AutoField(
        primary_key=True,
        help_text='Identificador único del detalle de solicitud.'
    )
    id_solicitud = models.ForeignKey(
        SolicitudCotizacion,
        on_delete=models.CASCADE,
        db_column='id_solicitud',
        help_text='Identificador de la solicitud de cotización.'
    )
    id_producto = models.ForeignKey(
        'catalog_app.Producto',
        on_delete=models.RESTRICT,
        db_column='id_producto',
        help_text='Identificador del producto solicitado.'
    )
    cantidad = models.IntegerField(
        default=1,
        help_text='Cantidad requerida del producto solicitado.'
    )

    @property
    def cantidad_requerida(self) -> int:
        return self.cantidad

    @cantidad_requerida.setter
    def cantidad_requerida(self, value: int):
        self.cantidad = value

    class Meta:
        db_table = 'solicitud_cotizacion_producto'


class InvitacionCotizar(models.Model):
    """
    Invitaciones a proveedores para cotizar.
    """
    ESTADO_PENDIENTE = 0
    ESTADO_COTIZADA = 1
    ESTADO_RECHAZADA = 2

    ESTADOS_DICT = {
        ESTADO_PENDIENTE: 'Pendiente de Evaluación',
        ESTADO_COTIZADA: 'Cotizada',
        ESTADO_RECHAZADA: 'Rechazada',
    }

    id_invitacion = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la invitación a cotizar.'
    )
    token_acceso = models.CharField(
        max_length=200,
        null=True,
        blank=True,
        help_text='Código de acceso generado para el enlace seguro.'
    )
    estado_invitacion = models.IntegerField(
        help_text='Situación actual de la invitación a cotizar.'
    )
    id_solicitud = models.ForeignKey(
        SolicitudCotizacion,
        on_delete=models.CASCADE,
        db_column='id_solicitud',
        help_text='Identificador único de la solicitud de cotización.'
    )
    cuit_prov = models.ForeignKey(
        Proveedor,
        on_delete=models.CASCADE,
        db_column='cuit_prov',
        help_text='Identificador fiscal único del proveedor.'
    )

    @property
    def estado_nombre(self) -> str:
        return self.ESTADOS_DICT.get(self.estado_invitacion, 'Pendiente de Evaluación')

    class Meta:
        db_table = 'invitacion_cotizar'


class Cotizacion(models.Model):
    """
    Cotizaciones recibidas por invitación.
    """
    ESTADO_PENDIENTE = 0
    ESTADO_ACEPTADA = 1
    ESTADO_DESCARTADA = 2
    ESTADO_RECHAZADA = 3

    ESTADOS_DICT = {
        ESTADO_PENDIENTE: 'Pendiente de Evaluación',
        ESTADO_ACEPTADA: 'Aceptada',
        ESTADO_DESCARTADA: 'Descartada',
        ESTADO_RECHAZADA: 'Rechazada',
    }

    id_cotizacion = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la cotización.'
    )
    tiempo_promesa = models.IntegerField(
        help_text='Días prometidos para la entrega.'
    )
    archivo_adjunto = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text='Ruta o URL del presupuesto formal.'
    )
    estado_cotizacion = models.IntegerField(
        help_text='Estado de la cotización en su evaluación.'
    )
    comentarios = models.CharField(
        max_length=1000,
        null=True,
        blank=True,
        help_text='Comentarios o justificación en caso de rechazo.'
    )
    fecha_validez = models.DateField(
        help_text='Fecha de vencimiento de precios cotizados.'
    )
    id_invitacion = models.ForeignKey(
        InvitacionCotizar,
        on_delete=models.CASCADE,
        db_column='id_invitacion',
        help_text='Identificador único de la invitación a cotizar.'
    )

    @property
    def estado_nombre(self) -> str:
        return self.ESTADOS_DICT.get(self.estado_cotizacion, 'Pendiente de Evaluación')

    class Meta:
        db_table = 'cotizacion'


class CotizacionProducto(models.Model):
    """
    Ítems cotizados con su precio ofrecido.
    """
    id_cotizacion_producto = models.AutoField(
        primary_key=True,
        help_text='Identificador único del ítem de cotización.'
    )
    precio_ofrecido = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Precio ofrecido por el proveedor para el producto.'
    )
    id_cotizacion = models.ForeignKey(
        Cotizacion,
        on_delete=models.CASCADE,
        db_column='id_cotizacion',
        help_text='Identificador único de la cotización.'
    )
    id_producto = models.ForeignKey(
        'catalog_app.Producto',
        on_delete=models.RESTRICT,
        db_column='id_producto',
        help_text='Identificador único del producto.'
    )

    class Meta:
        db_table = 'cotizacion_producto'


class OrdenCompra(models.Model):
    """
    Órdenes de compra adjudicadas a proveedores.
    """
    ESTADO_ESPERANDO_ENTREGA = 1
    ESTADO_ENTREGADA = 2
    ESTADO_CANCELADA = 3
    ESTADO_ENTREGADA_PARCIALMENTE = 4

    ESTADOS_DICT = {
        ESTADO_ESPERANDO_ENTREGA: 'Esperando Entrega',
        ESTADO_ENTREGADA: 'Entregada',
        ESTADO_CANCELADA: 'Cancelada',
        ESTADO_ENTREGADA_PARCIALMENTE: 'Entregada Parcialmente',
    }

    TIPO_ENTREGA_RETIRO = 1
    TIPO_ENTREGA_ENVIO = 2

    TIPOS_ENTREGA_DICT = {
        TIPO_ENTREGA_RETIRO: 'Retiro en Sucursal',
        TIPO_ENTREGA_ENVIO: 'Envío a Domicilio',
    }

    id_orden = models.AutoField(
        primary_key=True,
        help_text='Identificador único de la orden de compra.'
    )
    fecha_emision = models.DateField(
        help_text='Fecha en que se generó la orden de compra.'
    )
    estado_orden = models.IntegerField(
        help_text='Estado de la orden de compra.'
    )
    sol_tec = models.BooleanField(
        help_text='Indica si fue solicitada por un técnico.'
    )
    nro_remito = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Número de remito recibido en la entrega.'
    )
    tipo_entrega = models.IntegerField(
        help_text='Modalidad de entrega de la orden de compra.'
    )
    fecha_recepcion = models.DateField(
        null=True,
        blank=True,
        help_text='Fecha en que se recepcionó la orden.'
    )
    cuit_prov = models.ForeignKey(
        Proveedor,
        on_delete=models.RESTRICT,
        db_column='cuit_prov',
        help_text='Identificador fiscal único del proveedor.'
    )

    @property
    def estado_nombre(self) -> str:
        return self.ESTADOS_DICT.get(self.estado_orden, 'Desconocido')

    @property
    def tipo_entrega_nombre(self) -> str:
        return self.TIPOS_ENTREGA_DICT.get(self.tipo_entrega, 'Retiro en Sucursal')

    @property
    def detalleordencompra_set(self):
        """Compatibilidad con el reverse accessor por defecto de Django."""
        return self.detalles

    class Meta:
        db_table = 'orden_compra'


class DetalleOrdenCompra(models.Model):
    """
    Renglones de productos en órdenes de compra.
    """
    id_detalle_compra = models.AutoField(
        primary_key=True,
        help_text='Identificador único del renglón de la orden de compra.'
    )
    cantidad = models.IntegerField(
        help_text='Unidades del producto solicitadas al proveedor.'
    )
    cantidad_recibida = models.IntegerField(
        null=True,
        blank=True,
        help_text='Unidades efectivamente recibidas en la entrega.'
    )
    precio_unitario = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Precio unitario según cotización vigente.'
    )
    id_orden = models.ForeignKey(
        OrdenCompra,
        on_delete=models.CASCADE,
        related_name='detalles',
        db_column='id_orden',
        help_text='Identificador único de la orden de compra.'
    )
    id_producto = models.ForeignKey(
        'catalog_app.Producto',
        on_delete=models.RESTRICT,
        db_column='id_producto',
        help_text='Identificador único del producto.'
    )

    class Meta:
        db_table = 'detalle_orden_compra'


class RegistroCompra(models.Model):
    """
    Compras y gastos administrativos registrados.
    """
    id_compra = models.AutoField(
        primary_key=True,
        help_text='Identificador único del registro de compra o gasto.'
    )
    origen_vendedor = models.CharField(
        max_length=255,
        help_text='Origen o proveedor del gasto pagado.'
    )
    descripcion_articulo = models.CharField(
        max_length=1000,
        help_text='Detalle del artículo o servicio adquirido.'
    )
    motivo = models.CharField(
        max_length=500,
        help_text='Justificación operativa del gasto.'
    )
    monto_pagado = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Monto abonado en la transacción.'
    )
    fecha_compra = models.TimeField(
        help_text='Fecha y hora exacta de la operación.'
    )
    impacto_stock = models.BooleanField(
        help_text='Indica si la compra ingresó como artículo al inventario.'
    )
    id_usuario = models.ForeignKey(
        'users_app.Usuario',
        on_delete=models.RESTRICT,
        db_column='id_usuario',
        help_text='Identificador único del usuario.'
    )
    id_producto = models.ForeignKey(
        'catalog_app.Producto',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='id_producto',
        help_text='Identificador único del producto.'
    )

    class Meta:
        db_table = 'registro_compra'
