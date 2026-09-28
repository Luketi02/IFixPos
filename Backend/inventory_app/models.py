from django.db import models


class Stock(models.Model):
    """
    Registros de stock por producto.
    """
    id_stock = models.AutoField(
        primary_key=True,
        help_text='Identificador único del registro de stock.'
    )
    stock_minimo = models.IntegerField(
        help_text='Umbral mínimo para alertas de stock bajo.'
    )
    id_producto = models.ForeignKey(
        'catalog_app.Producto',
        on_delete=models.RESTRICT,
        db_column='id_producto',
        help_text='Identificador único del producto.'
    )

    class Meta:
        db_table = 'stock'


class MovimientoStock(models.Model):
    """
    Movimientos de ingreso/egreso/ajuste de stock.
    """
    id_movimiento = models.AutoField(
        primary_key=True,
        help_text='Identificador único del movimiento de stock.'
    )
    tipo_movimiento = models.CharField(
        max_length=50,
        help_text='Tipo de operación realizada sobre el stock.'
    )
    cantidad = models.IntegerField(
        help_text='Número de unidades ingresadas o retiradas.'
    )
    fecha = models.DateField(
        help_text='Fecha del registro del movimiento.'
    )
    motivo = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text='Razón u observación del movimiento.'
    )
    uso_taller = models.BooleanField(
        help_text='Indica si el producto fue destinado al taller.'
    )
    id_stock = models.ForeignKey(
        Stock,
        on_delete=models.RESTRICT,
        db_column='id_stock',
        help_text='Identificador único del registro de stock.'
    )
    id_venta = models.ForeignKey(
        'sales_app.Venta',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='id_venta',
        help_text='Identificador único de la venta.'
    )

    class Meta:
        db_table = 'movimiento_stock'
