from decimal import Decimal
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


class CompletarPagoInputSerializer(serializers.Serializer):
    """
    CU-21: Completar pago (La Aduana Financiera).
    Valida el medio de pago, monto abonado y el número de operación
    (estrictamente obligatorio si el medio de pago es TRANSFERENCIA).
    """
    medio_pago = serializers.CharField(
        required=True,
        error_messages={
            'required': 'El medio de pago es obligatorio.',
            'blank': 'El medio de pago no puede estar vacío.'
        }
    )
    monto_pagado = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=True,
        min_value=Decimal('0.01'),
        error_messages={
            'required': 'El monto a pagar es obligatorio.',
            'invalid': 'El monto a pagar debe ser un número decimal válido.',
            'min_value': 'El monto a pagar debe ser mayor a cero.'
        }
    )
    numero_operacion = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100
    )
    detalle = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=500
    )

    def validate(self, attrs):
        medio_raw = str(attrs.get('medio_pago') or '').strip().upper()
        numero_op = (attrs.get('numero_operacion') or '').strip()

        # Si el medio de pago es transferencia, el número de operación es obligatorio
        if 'TRANSFERENCIA' in medio_raw:
            if not numero_op:
                raise serializers.ValidationError({
                    'numero_operacion': 'El número de operación es obligatorio cuando el medio de pago es Transferencia.'
                })
        
        attrs['numero_operacion'] = numero_op if numero_op else None
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


# ==============================================================================
# CU-38: FILTRAR COBROS Y PAGOS (LA ADUANA Y SERIALIZADORES)
# ==============================================================================

class FiltroCobrosPagosInputSerializer(serializers.Serializer):
    """
    La Aduana (CU-38: Filtrar Cobros y Pagos).
    Valida estrictamente los criterios de búsqueda provistos:
    - Búsqueda exacta: Código de seguridad o Correo electrónico del cliente.
    - Filtros categóricos y temporales: Estado del pago (Pendiente, Pagado, Anulado),
      Rango cronológico de fechas (Desde / Hasta), y Método de pago.
    """
    codigo_seguridad = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100
    )
    email_cliente = serializers.EmailField(
        required=False,
        allow_blank=True,
        allow_null=True,
        error_messages={
            'invalid': 'El correo electrónico del cliente posee un formato inválido (debe contener arroba y dominio válido).'
        }
    )
    busqueda_exacta = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=150
    )
    estado_pago = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=50
    )
    fecha_desde = serializers.DateField(
        required=False,
        allow_null=True,
        error_messages={
            'invalid': 'La fecha desde posee un formato de fecha inválido. Formato esperado: AAAA-MM-DD.'
        }
    )
    fecha_hasta = serializers.DateField(
        required=False,
        allow_null=True,
        error_messages={
            'invalid': 'La fecha hasta posee un formato de fecha inválido. Formato esperado: AAAA-MM-DD.'
        }
    )
    medio_pago = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100
    )

    def to_internal_value(self, data):
        mutable_data = data.copy() if hasattr(data, 'copy') else dict(data)

        # Mapeo de alias comunes
        if 'codigo_sec' in mutable_data and not mutable_data.get('codigo_seguridad'):
            mutable_data['codigo_seguridad'] = mutable_data.get('codigo_sec')
        if 'email' in mutable_data and not mutable_data.get('email_cliente'):
            mutable_data['email_cliente'] = mutable_data.get('email')
        if 'correo' in mutable_data and not mutable_data.get('email_cliente'):
            mutable_data['email_cliente'] = mutable_data.get('correo')
        if 'estado' in mutable_data and not mutable_data.get('estado_pago'):
            mutable_data['estado_pago'] = mutable_data.get('estado')
        if 'metodo_pago' in mutable_data and not mutable_data.get('medio_pago'):
            mutable_data['medio_pago'] = mutable_data.get('metodo_pago')
        if 'id_medio_pago' in mutable_data and not mutable_data.get('medio_pago'):
            mutable_data['medio_pago'] = str(mutable_data.get('id_medio_pago'))
        if 'identificador' in mutable_data and not mutable_data.get('busqueda_exacta'):
            mutable_data['busqueda_exacta'] = mutable_data.get('identificador')
        if 'q' in mutable_data and not mutable_data.get('busqueda_exacta'):
            mutable_data['busqueda_exacta'] = mutable_data.get('q')
        if 'buscar' in mutable_data and not mutable_data.get('busqueda_exacta'):
            mutable_data['busqueda_exacta'] = mutable_data.get('buscar')

        # Normalizar strings vacíos o 'null' a None
        for campo in ['codigo_seguridad', 'email_cliente', 'busqueda_exacta', 'estado_pago', 'fecha_desde', 'fecha_hasta', 'medio_pago']:
            val = mutable_data.get(campo)
            if val in ('', 'null', 'undefined', None):
                mutable_data[campo] = None

        return super().to_internal_value(mutable_data)

    def validate(self, attrs):
        from django.core.validators import validate_email
        from django.core.exceptions import ValidationError as DjangoValidationError

        # Validación de búsqueda exacta: si parece o contiene un email, verificar sintaxis
        busqueda_exacta = (attrs.get('busqueda_exacta') or '').strip()
        if busqueda_exacta and '@' in busqueda_exacta:
            try:
                validate_email(busqueda_exacta)
            except DjangoValidationError:
                raise serializers.ValidationError({
                    'busqueda_exacta': 'El correo electrónico ingresado en la búsqueda exacta posee un formato inválido (debe contener arroba y dominio).'
                })

        # Validación del estado del pago
        estado_raw = (attrs.get('estado_pago') or '').strip().upper()
        if estado_raw:
            estados_permitidos = ['PENDIENTE', 'PAGADO', 'ANULADO', 'CANCELADO', 'TODOS']
            if estado_raw not in estados_permitidos:
                raise serializers.ValidationError({
                    'estado_pago': "El estado del pago no es válido. Las opciones admitidas son 'Pendiente', 'Pagado' o 'Anulado'."
                })
            attrs['estado_pago'] = estado_raw

        # Validación cronológica de fechas
        fecha_desde = attrs.get('fecha_desde')
        fecha_hasta = attrs.get('fecha_hasta')
        if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
            raise serializers.ValidationError({
                'fecha_desde': 'El rango temporal es cronológicamente inconsistente: la fecha desde no puede ser posterior a la fecha hasta.'
            })

        return attrs


class ClienteTransaccionOutputSerializer(serializers.Serializer):
    """Sub-serializador con la información auditada del cliente asociado."""
    id_usuario = serializers.IntegerField(allow_null=True)
    nombre = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)
    dni = serializers.CharField(allow_blank=True, allow_null=True)


class TransaccionCobroPagoOutputSerializer(serializers.Serializer):
    """
    Serializador de salida para el listado acotado de transacciones comerciales, cobros y pagos.
    """
    id_pago = serializers.IntegerField(allow_null=True)
    id_operacion = serializers.IntegerField()
    tipo_operacion = serializers.CharField()
    codigo_seguridad = serializers.CharField(allow_blank=True)
    fecha = serializers.DateField()
    estado_pago = serializers.CharField()
    monto = serializers.DecimalField(max_digits=12, decimal_places=2)
    medio_pago = serializers.CharField(allow_null=True, allow_blank=True)
    numero_operacion = serializers.CharField(allow_null=True, allow_blank=True)
    detalle = serializers.CharField(allow_null=True, allow_blank=True)
    ruta_comprobante = serializers.CharField(allow_null=True, allow_blank=True)
    cliente = ClienteTransaccionOutputSerializer()

