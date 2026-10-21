from rest_framework import serializers
from sales_app.models import Venta, DetalleVenta, MedioPago
from geo_app.models import Direccion
from geo_app.serializers import DireccionOutputSerializer


# ==============================================================================
# SERIALIZADORES DE ENTRADA (INPUT - LA ADUANA)
# ==============================================================================

class RealizarCompraInputSerializer(serializers.Serializer):
    """
    La Aduana Comercial para Checkout Virtual (CU-18).
    Valida método de entrega, medio de pago y dirección de envío obligatoria para fletes.
    """
    metodo_entrega = serializers.ChoiceField(
        choices=['RETIRO', 'ENVIO', 'retiro', 'envio'],
        required=True,
        error_messages={
            'required': 'Debe especificar el método de entrega (RETIRO o ENVIO).',
            'invalid_choice': 'Método de entrega no válido. Debe ser RETIRO o ENVIO.'
        }
    )
    metodo_pago = serializers.IntegerField(
        required=True,
        error_messages={
            'required': 'Debe especificar el identificador del medio de pago.',
            'invalid': 'El medio de pago debe ser un identificador numérico válido.'
        }
    )
    id_direccion_envio = serializers.IntegerField(
        required=False,
        allow_null=True,
        error_messages={
            'invalid': 'El identificador de dirección debe ser numérico.'
        }
    )

    def validate_metodo_pago(self, value):
        try:
            medio = MedioPago.objects.get(id_mediopago=value)
        except MedioPago.DoesNotExist:
            raise serializers.ValidationError('El medio de pago seleccionado no existe en el catálogo.')
        if not medio.estado:
            raise serializers.ValidationError(f"El medio de pago '{medio.nombre_medio_pago}' no está habilitado actualmente.")
        return medio

    def validate_id_direccion_envio(self, value):
        if value is None:
            return None
        try:
            direccion = Direccion.objects.select_related('id_ciudad__id_provincia__id_pais').get(id_direccion=value)
        except Direccion.DoesNotExist:
            raise serializers.ValidationError('La dirección de envío seleccionada no existe.')
        if not direccion.is_active:
            raise serializers.ValidationError('La dirección seleccionada se encuentra inactiva.')
        return direccion

    def validate(self, attrs):
        metodo = str(attrs.get('metodo_entrega') or '').strip().upper()
        attrs['metodo_entrega'] = metodo

        direccion = attrs.get('id_direccion_envio')
        if metodo == 'ENVIO':
            if not direccion:
                raise serializers.ValidationError({
                    'id_direccion_envio': 'La dirección de envío es obligatoria cuando el método de entrega es ENVIO.'
                })
        else:
            # Si es RETIRO presencial en sede, no se requiere dirección física
            attrs['id_direccion_envio'] = None

        return attrs


# ==============================================================================
# SERIALIZADORES DE SALIDA (OUTPUT)
# ==============================================================================

class DetalleVentaOutputSerializer(serializers.ModelSerializer):
    """Serializador de salida para cada ítem congelado en el detalle de la venta."""
    producto_nombre = serializers.CharField(source='id_producto.nombre', read_only=True)

    class Meta:
        model = DetalleVenta
        fields = [
            'id_detalle',
            'id_producto',
            'producto_nombre',
            'cantidad',
            'precio_unitario',
            'subtotal'
        ]


class VentaOutputSerializer(serializers.ModelSerializer):
    """Serializador de salida para la cabecera de la venta e-commerce."""
    detalles = DetalleVentaOutputSerializer(source='detalleventa_set', many=True, read_only=True)
    direccion_envio = DireccionOutputSerializer(source='id_direccion_envio', read_only=True)
    total = serializers.SerializerMethodField()

    class Meta:
        model = Venta
        fields = [
            'id_venta',
            'id_usuario',
            'fecha_venta',
            'estado_venta',
            'metodo_entrega',
            'codigo_sec',
            'monto_subtotal',
            'costo_envio',
            'total',
            'id_direccion_envio',
            'direccion_envio',
            'detalles'
        ]

    def get_total(self, obj) -> float:
        subtotal = float(obj.monto_subtotal or 0)
        envio = float(obj.costo_envio or 0)
        return round(subtotal + envio, 2)


# ==============================================================================
# SERIALIZADORES DE CARRITO DE COMPRAS
# ==============================================================================

class AgregarAlCarritoInputSerializer(serializers.Serializer):
    """
    Aduana para la adición de artículos al carrito.
    """
    id_producto = serializers.IntegerField(
        required=True,
        error_messages={
            'required': 'El ID del producto es obligatorio.',
            'invalid': 'El ID del producto debe ser un entero.'
        }
    )
    cantidad = serializers.IntegerField(
        required=False,
        default=1,
        min_value=1,
        error_messages={
            'min_value': 'La cantidad debe ser al menos 1.',
            'invalid': 'La cantidad debe ser un entero.'
        }
    )
class QuitarDelCarritoInputSerializer(serializers.Serializer):
    """
    Aduana para la remoción o decremento de artículos del carrito.
    """
    id_producto = serializers.IntegerField(
        required=True,
        error_messages={
            'required': 'El ID del producto es obligatorio.',
            'invalid': 'El ID del producto debe ser un entero.'
        }
    )
    cantidad = serializers.IntegerField(
        required=False,
        default=None,
        allow_null=True,
        min_value=1,
        error_messages={
            'min_value': 'La cantidad debe ser al menos 1.',
            'invalid': 'La cantidad debe ser un entero.'
        }
    )
class CarritoItemOutputSerializer(serializers.Serializer):
    """Serializador para cada ítem en el carrito del usuario."""
    id_carrito_producto = serializers.IntegerField()
    id_producto = serializers.IntegerField()
    producto_nombre = serializers.CharField()
    precio_unitario = serializers.DecimalField(max_digits=10, decimal_places=2)
    cantidad = serializers.IntegerField()
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)


class CarritoResumenOutputSerializer(serializers.Serializer):
    """Serializador para el resumen general del carrito."""
    id_carrito = serializers.IntegerField(allow_null=True)
    total_articulos = serializers.IntegerField()
    monto_subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)
    items = CarritoItemOutputSerializer(many=True)
