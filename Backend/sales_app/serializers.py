from decimal import Decimal
from typing import Optional
from rest_framework import serializers
from sales_app.models import Venta, DetalleVenta, MedioPago, Beneficio
from geo_app.models import Direccion
from geo_app.serializers import DireccionOutputSerializer



# ==============================================================================
# SERIALIZADORES DE ENTRADA 
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
    beneficios_aplicados = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list,
        help_text='Lista de identificadores de beneficios/cupones a canjear en la compra.'
    )

    def validate_dni_contacto(self, value):
        val = str(value).strip()
        if not val or val.upper() == 'S/N':
            raise serializers.ValidationError('Debe ingresar un DNI o CUIL válido para la facturación.')
        return val

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
# SERIALIZADORES DE SALIDA
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
    expira_en = serializers.SerializerMethodField()

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
            'expira_en',
            'id_direccion_envio',
            'direccion_envio',
            'detalles'
        ]

    def get_total(self, obj) -> float:
        subtotal = float(obj.monto_subtotal or 0)
        envio = float(obj.costo_envio or 0)
        return round(subtotal + envio, 2)

    def get_expira_en(self, obj) -> int:
        if str(getattr(obj, 'estado_venta', '') or '').upper() != 'PENDIENTE':
            return 0
        from django.utils import timezone
        from core_app.selectors import obtener_minutos_reserva_venta_pendiente
        total_seg = obtener_minutos_reserva_venta_pendiente() * 60
        dt_creacion = getattr(obj, 'fecha_hora_creacion', None)
        if not dt_creacion:
            return total_seg
        ahora = timezone.now()
        if timezone.is_naive(dt_creacion):
            dt_creacion = timezone.make_aware(dt_creacion, timezone.get_current_timezone())
        restante = int(total_seg - (ahora - dt_creacion).total_seconds())
        return max(0, restante)


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


class ActualizarCantidadCarritoInputSerializer(serializers.Serializer):
    """
    Aduana para fijar directamente la cantidad absoluta de un producto en el carrito.
    Elimina por diseño cualquier condición de carrera o desincronización por clics rápidos.
    Si cantidad <= 0, el producto se remueve del carrito.
    """
    id_producto = serializers.IntegerField(
        required=True,
        min_value=1,
        error_messages={
            'required': 'El identificador del producto es obligatorio.',
            'invalid': 'El identificador del producto debe ser un número entero.',
            'min_value': 'El identificador del producto debe ser un número positivo.'
        }
    )
    cantidad = serializers.IntegerField(
        required=True,
        min_value=0,
        error_messages={
            'required': 'La cantidad a establecer es obligatoria.',
            'invalid': 'La cantidad debe ser un número entero.',
            'min_value': 'La cantidad no puede ser negativa.'
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
# CU-38: FILTRAR COBROS Y PAGOS
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
    cliente = ClienteTransaccionOutputSerializer()
    desglose_cobro = serializers.DictField(read_only=True, required=False)


# ==============================================================================
# CU-70: FILTRAR BENEFICIOS OTORGADOS (SERIALIZERS)
# ==============================================================================

class FiltrarBeneficiosInputSerializer(serializers.Serializer):
    """La Aduana (CU-70): Valida parámetros de consulta para beneficios otorgados."""
    buscar = serializers.CharField(required=False, allow_blank=True, max_length=255)
    cliente_query = serializers.CharField(required=False, allow_blank=True, max_length=255)
    id_usuario = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    fecha_desde = serializers.DateField(required=False, allow_null=True)
    fecha_hasta = serializers.DateField(required=False, allow_null=True)
    enviado_momento_compra = serializers.BooleanField(required=False, allow_null=True)
    enviado_durante_carrito = serializers.BooleanField(required=False, allow_null=True)
    por_desc_min = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    por_desc_max = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    id_producto = serializers.IntegerField(required=False, allow_null=True, min_value=1)

    def validate(self, attrs):
        f_desde = attrs.get('fecha_desde')
        f_hasta = attrs.get('fecha_hasta')
        if f_desde and f_hasta and f_desde > f_hasta:
            raise serializers.ValidationError("La fecha inicial (fecha_desde) no puede ser posterior a la fecha final (fecha_hasta).")
        return attrs


class BeneficioOtorgadoOutputSerializer(serializers.Serializer):
    """Formato estructurado de salida para beneficios y descuentos otorgados."""
    id_beneficio = serializers.IntegerField(read_only=True)
    motivo = serializers.CharField(read_only=True)
    fecha = serializers.DateField(read_only=True)
    enviado_momento_compra = serializers.BooleanField(read_only=True)
    enviado_durante_carrito = serializers.BooleanField(read_only=True)
    por_desc = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, allow_null=True)
    tiempo_disp = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, allow_null=True)
    id_usuario = serializers.IntegerField(source='id_usuario_id', read_only=True)
    email_cliente = serializers.SerializerMethodField()
    nombre_cliente = serializers.SerializerMethodField()
    id_producto = serializers.IntegerField(source='id_producto_id', read_only=True)
    nombre_producto = serializers.SerializerMethodField()

    def get_email_cliente(self, obj):
        return obj.id_usuario.email if obj.id_usuario else ""

    def get_nombre_cliente(self, obj):
        if obj.id_usuario and hasattr(obj.id_usuario, 'perfilusuario'):
            perfil = obj.id_usuario.perfilusuario
            return f"{perfil.nombre or ''} {perfil.apellido or ''}".strip() or obj.id_usuario.email
        return obj.id_usuario.email if obj.id_usuario else ""

    def get_nombre_producto(self, obj):
        return obj.id_producto.nombre if obj.id_producto else ""


# ==============================================================================
# CU-82: REGISTRAR MEDIO DE PAGO
# ==============================================================================

class RegistrarMedioPagoInputSerializer(serializers.Serializer):
    """
    CU-82: Aduana Comercial para registrar o reactivar un canal de cobro en el sistema.
    """
    nombre = serializers.CharField(
        max_length=100, 
        required=True,
        error_messages={
            'required': 'El nombre del medio de pago es obligatorio.',
            'blank': 'El nombre del medio de pago no puede estar vacío.'
        }
    )
    recargo = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        required=False, 
        default=Decimal('0.00'),
        error_messages={
            'invalid': 'El recargo debe ser un valor decimal válido.'
        }
    )
    confirmar_reactivacion = serializers.BooleanField(
        required=False, 
        default=False
    )

    def validate_nombre(self, value):
        limpio = value.strip()
        if not limpio:
            raise serializers.ValidationError("El nombre del medio de pago no puede estar vacío.")
        return limpio

    def validate_recargo(self, value):
        if value is not None and value < Decimal('0.00'):
            raise serializers.ValidationError("El recargo no puede ser un valor negativo.")
        return value


class MedioPagoOutputSerializer(serializers.Serializer):
    """Formato de salida estructurado para medios de pago."""
    id_mediopago = serializers.IntegerField(read_only=True)
    codigo = serializers.CharField(read_only=True, allow_null=True)
    nombre = serializers.CharField(source='nombre_medio_pago', read_only=True)
    nombre_medio_pago = serializers.CharField(read_only=True)
    recargo = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    estado = serializers.BooleanField(read_only=True)


# ==============================================================================
# CU-83: CAMBIAR ESTADO DE MEDIO DE PAGO
# ==============================================================================

class AlternarEstadoMedioPagoInputSerializer(serializers.Serializer):
    """
    CU-83: Aduana Comercial para validar la alternancia de estado (Activo/Inactivo).
    No requiere campos obligatorios, soporta cuerpo vacío {} o confirmación explícita.
    """
    confirmar = serializers.BooleanField(required=False, default=True)


# ==============================================================================
# CU-67: REALIZAR VENTA PRESENCIAL
# ==============================================================================

class ItemVentaPresencialSerializer(serializers.Serializer):
    """Renglón de producto y cantidad para el carrito de venta presencial en mostrador."""
    id_producto = serializers.IntegerField(
        required=True,
        min_value=1,
        error_messages={
            'required': 'El identificador del producto es obligatorio.',
            'invalid': 'El identificador del producto debe ser un número entero válido.',
            'min_value': 'El identificador del producto debe ser mayor a 0.'
        }
    )
    cantidad = serializers.IntegerField(
        required=True,
        min_value=1,
        error_messages={
            'required': 'La cantidad del producto es obligatoria.',
            'invalid': 'La cantidad debe ser un número entero válido.',
            'min_value': 'La cantidad debe ser de al menos 1 unidad.'
        }
    )


class RealizarVentaPresencialInputSerializer(serializers.Serializer):
    """
    CU-67: Aduana Comercial para registrar una venta física en mostrador.
    Permite asociar un cliente registrado o delegar al perfil genérico Consumidor Final.
    Permite opcionalmente liquidar y cobrar la venta en una única transacción atómica.
    """
    id_cliente = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        help_text='ID del cliente registrado (opcional). Si se omite, se asigna Consumidor Final.'
    )
    productos = ItemVentaPresencialSerializer(
        many=True,
        required=True,
        allow_empty=False,
        error_messages={
            'required': 'Debe enviar la lista de productos a comprar.',
            'empty': 'La lista de productos no puede estar vacía.'
        }
    )
    # Campos opcionales para Cobro Atómico en Mostrador (POS)
    medio_pago = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    monto_pagado = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    numero_operacion = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    detalle = serializers.CharField(required=False, allow_blank=True, allow_null=True)


# ==============================================================================
# CU-69: AUDITAR HISTORIAL DE BENEFICIOS Y PROMOCIONES (SERIALIZERS)
# ==============================================================================

class BeneficioListOutputSerializer(serializers.Serializer):
    """
    CU-69: Formato resumido para la vista consolidada de auditoría de beneficios (Paso 4).
    Muestra cliente, producto sugerido, porcentaje de descuento y estado de vigencia.
    """
    id_beneficio = serializers.IntegerField(read_only=True)
    id_cliente = serializers.IntegerField(source='id_usuario_id', read_only=True)
    cliente_email = serializers.SerializerMethodField()
    cliente_nombre = serializers.SerializerMethodField()
    id_producto = serializers.IntegerField(source='id_producto_id', read_only=True)
    producto_nombre = serializers.SerializerMethodField()
    por_desc = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, allow_null=True)
    fecha = serializers.DateField(read_only=True)
    expira_en = serializers.SerializerMethodField()
    estado_vigencia = serializers.SerializerMethodField()

    def get_cliente_email(self, obj) -> str:
        return obj.id_usuario.email if obj.id_usuario else ""

    def get_cliente_nombre(self, obj) -> str:
        if obj.id_usuario and hasattr(obj.id_usuario, 'perfilusuario'):
            perfil = obj.id_usuario.perfilusuario
            return f"{perfil.nombre or ''} {perfil.apellido or ''}".strip() or obj.id_usuario.email
        return obj.id_usuario.email if obj.id_usuario else ""

    def get_producto_nombre(self, obj) -> str:
        return obj.id_producto.nombre if obj.id_producto else ""

    def get_expira_en(self, obj) -> Optional[str]:
        exp_dt = getattr(obj, 'fecha_hora_expiracion', None)
        return exp_dt.isoformat() if exp_dt else None

    def get_estado_vigencia(self, obj) -> str:
        if not obj.fecha and not getattr(obj, 'fecha_hora_creacion', None):
            return "VIGENTE"
        if obj.tiempo_disp is None:
            return "VIGENTE"
        return "VIGENTE" if obj.estado == 'ACTIVO' else "CADUCADO"


class BeneficioDetailOutputSerializer(BeneficioListOutputSerializer):
    """
    CU-69: Expediente técnico y algorítmico completo para la inspección detallada (Paso 6).
    Detalla motivo del disparo, canal de emisión, tiempo disponible y fecha calculada de caducidad.
    """
    motivo = serializers.CharField(read_only=True)
    enviado_momento_compra = serializers.BooleanField(read_only=True)
    enviado_durante_carrito = serializers.BooleanField(read_only=True)
    tiempo_disp = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, allow_null=True)
    fecha_caducidad_estimada = serializers.SerializerMethodField()
    canal_emision = serializers.SerializerMethodField()

    def get_fecha_caducidad_estimada(self, obj) -> Optional[str]:
        exp_dt = getattr(obj, 'fecha_hora_expiracion', None)
        if not exp_dt:
            return None
        return exp_dt.isoformat()

    def get_canal_emision(self, obj) -> str:
        canales = []
        if obj.enviado_momento_compra:
            canales.append("MOMENTO_COMPRA")
        if obj.enviado_durante_carrito:
            canales.append("DURANTE_CARRITO")
        return " / ".join(canales) if canales else "NOTIFICACION_SISTEMA"


# ==============================================================================
# CU-71: REVOCAR BENEFICIO ACTIVO (SERIALIZERS)
# ==============================================================================

class RevocarBeneficioInputSerializer(serializers.Serializer):
    """
    CU-71: Aduana Administrativa para capturar la justificación opcional
    de anulación o revocación manual de un beneficio.
    """
    motivo_anulacion = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255,
        default='Sin justificación ingresada',
        help_text='Motivo o justificación de la anulación gerencial.'
    )


# ==============================================================================
# CU-75: GENERAR REPORTE DE DISTRIBUCIÓN GEOGRÁFICA Y LOGÍSTICA
# ==============================================================================

class FiltroLogisticaInputSerializer(serializers.Serializer):
    """
    CU-75: Aduana de parámetros para el reporte de distribución geográfica y logística.
    Captura el horizonte temporal obligatorio y filtros opcionales de zona y estado.
    """
    fecha_inicio = serializers.DateField(
        required=True,
        error_messages={'required': 'La fecha de inicio es requerida.'}
    )
    fecha_fin = serializers.DateField(
        required=True,
        error_messages={'required': 'La fecha de fin es requerida.'}
    )
    id_provincia = serializers.IntegerField(
        required=False,
        allow_null=True
    )
    id_ciudad = serializers.IntegerField(
        required=False,
        allow_null=True
    )
    estado_venta = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=50
    )
    id_medio_pago = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        help_text='Filtro opcional por medio de pago registrado en la venta.'
    )

    def validate(self, attrs):
        fecha_inicio = attrs.get('fecha_inicio')
        fecha_fin = attrs.get('fecha_fin')

        if fecha_inicio and fecha_fin and fecha_inicio > fecha_fin:
            raise serializers.ValidationError(
                "El rango cronológico es inválido: la fecha de inicio no puede ser posterior a la fecha de fin"
            )
        return attrs


class ReporteLogisticaItemOutputSerializer(serializers.Serializer):
    """
    CU-75: Indicadores consolidados de densidad logística, fletes,
    facturación bruta y ticket promedio por territorio (Provincia / Ciudad).
    """
    id_provincia = serializers.IntegerField(read_only=True, allow_null=True)
    nombre_provincia = serializers.CharField(read_only=True)
    id_ciudad = serializers.IntegerField(read_only=True, allow_null=True)
    nombre_ciudad = serializers.CharField(read_only=True)
    volumen_envios = serializers.IntegerField(read_only=True)
    recaudacion_logistica = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    facturacion_bruta = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    ticket_promedio = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)





class FiltrarHistorialBeneficiosInputSerializer(serializers.Serializer):
    """CU-69: Valida los filtros del historial de beneficios (reemplaza request.query_params.dict())."""
    id_cliente = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    id_usuario = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    fecha_desde = serializers.DateField(required=False, allow_null=True)
    fecha_hasta = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        desde, hasta = attrs.get('fecha_desde'), attrs.get('fecha_hasta')
        if desde and hasta and desde > hasta:
            raise serializers.ValidationError("La fecha 'desde' no puede ser posterior a la fecha 'hasta'.")
        return attrs


class BuscarOperacionCobroInputSerializer(serializers.Serializer):
    """Aduana para búsqueda de operación pendiente de cobro (CU-21)."""
    identificador = serializers.CharField(required=False, allow_blank=True)


# ==============================================================================
# MERCADO PAGO INTEGRACIÓN OFICIAL (SERIALIZADORES)
# ==============================================================================

class MercadoPagoCrearPreferenciaInputSerializer(serializers.Serializer):
    """
    Aduana de entrada para generar la Preferencia de Pago en Mercado Pago.
    """
    id_venta = serializers.IntegerField(
        required=True,
        min_value=1,
        error_messages={
            'required': 'Debe especificar el identificador de la venta.',
            'invalid': 'El identificador de la venta debe ser un número entero válido.'
        }
    )


class MercadoPagoPreferenciaOutputSerializer(serializers.Serializer):
    """
    Formato de salida con las URLs y datos de la pasarela de Mercado Pago.
    """
    preference_id = serializers.CharField(read_only=True)
    init_point = serializers.CharField(read_only=True)
    sandbox_init_point = serializers.CharField(read_only=True)
    public_key = serializers.CharField(read_only=True, allow_blank=True)
    modo_simulacion = serializers.BooleanField(read_only=True, default=False)
    mensaje = serializers.CharField(read_only=True, required=False)


class EstadoVentaOutputSerializer(serializers.Serializer):
    """
    Formato de salida para sondeo en tiempo real del estado de pago de una orden.
    """
    id_venta = serializers.IntegerField(read_only=True)
    estado_venta = serializers.CharField(read_only=True)
    codigo_sec = serializers.CharField(read_only=True, allow_null=True)
    pagada = serializers.BooleanField(read_only=True)
    ruta_comprobante = serializers.CharField(read_only=True, required=False, allow_null=True)


class CostoEnvioTarifasOutputSerializer(serializers.Serializer):
    local = serializers.DecimalField(max_digits=10, decimal_places=2)
    regional = serializers.DecimalField(max_digits=10, decimal_places=2)
    nacional = serializers.DecimalField(max_digits=10, decimal_places=2)


class CostoEnvioOutputSerializer(serializers.Serializer):
    costo = serializers.DecimalField(max_digits=10, decimal_places=2)
    tipo = serializers.CharField()
    descripcion = serializers.CharField()
    tarifas = CostoEnvioTarifasOutputSerializer()


class ItemCompraPendienteOutputSerializer(serializers.Serializer):
    id_producto = serializers.IntegerField()
    producto_nombre = serializers.CharField()
    cantidad = serializers.IntegerField()
    precio_unitario = serializers.DecimalField(max_digits=10, decimal_places=2)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)


class VentaPendienteDetalleOutputSerializer(serializers.Serializer):
    id_venta = serializers.IntegerField()
    codigo_sec = serializers.CharField()
    estado_venta = serializers.CharField()
    metodo_entrega = serializers.CharField()
    monto_subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)
    costo_envio = serializers.DecimalField(max_digits=10, decimal_places=2)
    total = serializers.DecimalField(max_digits=10, decimal_places=2)
    segundos_restantes = serializers.IntegerField()
    expira_en = serializers.IntegerField(required=False, default=0)
    preference_id = serializers.CharField(allow_null=True, required=False)
    init_point = serializers.CharField(allow_null=True, required=False)
    detalles = ItemCompraPendienteOutputSerializer(many=True)


class CompraPendienteActivaOutputSerializer(serializers.Serializer):
    tiene_pendiente = serializers.BooleanField()
    venta = VentaPendienteDetalleOutputSerializer(allow_null=True, required=False)
    segundos_restantes = serializers.IntegerField(required=False, default=0)
    expira_en = serializers.IntegerField(required=False, default=0)



# ==============================================================================
# CHECKOUT PARA INVITADOS / CLIENTES SIN CUENTA (E-COMMERCE PÚBLICO)
# ==============================================================================

class ItemCompraInvitadoInputSerializer(serializers.Serializer):
    """
    Renglón de producto seleccionado por un cliente no registrado.
    """
    id_producto = serializers.IntegerField(
        required=True,
        error_messages={
            'required': 'Debe especificar el identificador del producto.',
            'invalid': 'El identificador del producto debe ser numérico.'
        }
    )
    cantidad = serializers.IntegerField(
        required=True,
        min_value=1,
        error_messages={
            'required': 'Debe especificar la cantidad a adquirir.',
            'invalid': 'La cantidad debe ser un número entero.',
            'min_value': 'La cantidad mínima por producto es 1.'
        }
    )

    def validate_id_producto(self, value):
        from catalog_app.models import Producto
        try:
            prod = Producto.objects.get(id_producto=value)
        except Producto.DoesNotExist:
            raise serializers.ValidationError('El producto seleccionado no existe en el catálogo.')
        if not prod.estado:
            raise serializers.ValidationError(f"El producto '{prod.nombre}' no está disponible actualmente.")
        return prod


class DireccionEnvioInvitadoInputSerializer(serializers.Serializer):
    """
    Datos de dirección física para entrega a domicilio de un comprador invitado.
    """
    calle = serializers.CharField(
        max_length=255,
        required=True,
        error_messages={'required': 'Debe ingresar la calle de entrega.'}
    )
    numero = serializers.CharField(
        max_length=50,
        required=True,
        error_messages={'required': 'Debe ingresar la altura / número de entrega.'}
    )
    piso_depto = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True,
        default=''
    )
    codigo_postal = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True,
        default='S/N'
    )
    id_ciudad = serializers.IntegerField(
        required=True,
        error_messages={'required': 'Debe seleccionar la ciudad de entrega.'}
    )

    def validate_id_ciudad(self, value):
        from geo_app.models import Ciudad
        try:
            return Ciudad.objects.select_related('id_provincia__id_pais').get(id_ciudad=value)
        except Ciudad.DoesNotExist:
            raise serializers.ValidationError('La ciudad seleccionada no existe en el sistema.')


class RealizarCompraInvitadoInputSerializer(serializers.Serializer):
    """
    Aduana comercial para compras realizadas por clientes sin cuenta registrada.
    Valida items, datos de contacto indispensables, método de entrega,
    dirección física (si aplica envío) y medio de pago.
    """
    items = ItemCompraInvitadoInputSerializer(
        many=True,
        required=True,
        allow_empty=False,
        error_messages={
            'required': 'Debe incluir al menos un producto en la compra.',
            'not_a_list': 'Los productos deben suministrarse en formato de lista.',
            'empty': 'El carrito de compras no puede estar vacío.'
        }
    )
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
            'invalid': 'El medio de pago debe ser numérico.'
        }
    )
    nombre_contacto = serializers.CharField(
        max_length=150,
        required=True,
        error_messages={'required': 'Debe indicar el nombre completo o razón social para el comprobante.'}
    )
    email_contacto = serializers.EmailField(
        required=True,
        error_messages={
            'required': 'Debe ingresar un correo electrónico para recibir su factura y enlace de pago.',
            'invalid': 'El formato del correo electrónico es inválido.'
        }
    )
    telefono_contacto = serializers.CharField(
        max_length=50,
        required=True,
        error_messages={'required': 'Debe ingresar un teléfono o WhatsApp de contacto.'}
    )
    dni_contacto = serializers.CharField(
        max_length=30,
        required=True,
        allow_blank=False,
        error_messages={
            'required': 'El DNI o CUIL es obligatorio para la emisión de la factura.',
            'blank': 'El DNI o CUIL no puede estar vacío.'
        }
    )
    direccion_envio = DireccionEnvioInvitadoInputSerializer(
        required=False,
        allow_null=True
    )

    def validate_metodo_pago(self, value):
        from sales_app.models import MedioPago
        try:
            medio = MedioPago.objects.get(id_mediopago=value)
        except MedioPago.DoesNotExist:
            raise serializers.ValidationError('El medio de pago seleccionado no existe en el catálogo.')
        if not medio.estado:
            raise serializers.ValidationError(f"El medio de pago '{medio.nombre_medio_pago}' no está habilitado actualmente.")
        return medio

    def validate(self, attrs):
        metodo = str(attrs.get('metodo_entrega', '')).upper()
        attrs['metodo_entrega'] = metodo

        if metodo == 'ENVIO':
            if not attrs.get('direccion_envio'):
                raise serializers.ValidationError({
                    'direccion_envio': 'Para entregas a domicilio debe especificar los datos completos de dirección de entrega.'
                })
        return attrs


class CompraInvitadoOutputSerializer(serializers.Serializer):
    """
    Aduana de salida que formatea los datos de la compra creada para un invitado.
    """
    id_venta = serializers.IntegerField()
    codigo_sec = serializers.CharField()
    estado_venta = serializers.CharField()
    metodo_entrega = serializers.CharField()
    monto_subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)
    costo_envio = serializers.DecimalField(max_digits=10, decimal_places=2)
    monto_total = serializers.DecimalField(max_digits=10, decimal_places=2)
    preference_id = serializers.CharField(allow_null=True, required=False)
    init_point = serializers.CharField(allow_null=True, required=False)
    modo_simulacion = serializers.BooleanField(required=False, default=False)
    detalles = ItemCompraPendienteOutputSerializer(many=True)


class BeneficioClienteOutputSerializer(serializers.ModelSerializer):
    """
    Formato estructurado de beneficios para el portal del cliente y checkout.
    """
    id_producto = serializers.IntegerField(source='id_producto_id', read_only=True)
    producto_nombre = serializers.SerializerMethodField()
    producto_precio = serializers.SerializerMethodField()
    estado = serializers.CharField(read_only=True)
    expira_en = serializers.SerializerMethodField()
    segundos_restantes = serializers.SerializerMethodField()
    es_acumulable = serializers.BooleanField(default=True, read_only=True)

    class Meta:
        model = Beneficio
        fields = [
            'id_beneficio',
            'motivo',
            'fecha',
            'por_desc',
            'tiempo_disp',
            'estado',
            'expira_en',
            'segundos_restantes',
            'enviado_momento_compra',
            'enviado_durante_carrito',
            'id_producto',
            'producto_nombre',
            'producto_precio',
            'es_acumulable'
        ]

    def get_expira_en(self, obj) -> Optional[str]:
        exp_dt = getattr(obj, 'fecha_hora_expiracion', None)
        return exp_dt.isoformat() if exp_dt else None

    def get_segundos_restantes(self, obj) -> int:
        from django.utils import timezone
        exp_dt = getattr(obj, 'fecha_hora_expiracion', None)
        if not exp_dt or getattr(obj, 'estado', '') != 'ACTIVO':
            return 0
        restante = int((exp_dt - timezone.now()).total_seconds())
        return max(0, restante)

    def get_producto_nombre(self, obj):
        if obj.id_producto:
            return obj.id_producto.nombre
        return "Descuento General de Tienda / Taller"

    def get_producto_precio(self, obj):
        if obj.id_producto and getattr(obj.id_producto, 'precio_venta', None) is not None:
            return float(obj.id_producto.precio_venta)
        return None
