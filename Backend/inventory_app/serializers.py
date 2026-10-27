from rest_framework import serializers
from catalog_app.models import Producto


class ProductoStockOutputSerializer(serializers.ModelSerializer):
    """
    Serializador de salida para el inventario de productos y su stock disponible (CU-35).
    """
    id_categoria = serializers.IntegerField(source='id_categoria_id', read_only=True)
    categoria = serializers.CharField(source='id_categoria.nombre', read_only=True, default='')
    id_marca = serializers.IntegerField(source='id_modelo.id_marca_id', read_only=True, default=None, allow_null=True)
    marca = serializers.CharField(source='id_modelo.id_marca.nombre', read_only=True, default='', allow_null=True)
    id_modelo = serializers.IntegerField(source='id_modelo_id', read_only=True, default=None, allow_null=True)
    modelo = serializers.CharField(source='id_modelo.nombre', read_only=True, default='', allow_null=True)
    id_tipo_dispositivo = serializers.IntegerField(source='id_modelo.id_tipo_dispositivo_id', read_only=True, default=None, allow_null=True)
    tipo_dispositivo = serializers.CharField(source='id_modelo.id_tipo_dispositivo.nombre', read_only=True, default='', allow_null=True)
    id_stock = serializers.IntegerField(read_only=True, default=None)
    stock_minimo = serializers.IntegerField(read_only=True, default=0)
    cantidad_actual = serializers.IntegerField(read_only=True, default=0)
    nivel_stock = serializers.SerializerMethodField()
    categorias = serializers.SerializerMethodField()
    ids_categorias = serializers.SerializerMethodField()

    class Meta:
        model = Producto
        fields = [
            'id_producto',
            'nombre',
            'descripcion',
            'precio_venta',
            'estado',
            'apto_venta',
            'apto_reparacion',
            'apto_consumible',
            'modulo_automatico',
            'imagen_principal',
            'id_categoria',
            'categoria',
            'categorias',
            'ids_categorias',
            'id_marca',
            'marca',
            'id_modelo',
            'modelo',
            'id_tipo_dispositivo',
            'tipo_dispositivo',
            'id_stock',
            'stock_minimo',
            'cantidad_actual',
            'nivel_stock',
        ]

    def get_categorias(self, obj):
        if hasattr(obj, 'categorias_detalle'):
            detalles = obj.categorias_detalle.select_related('id_categoria').all()
            if detalles.exists():
                return [{'id_categoria': d.id_categoria_id, 'nombre': d.id_categoria.nombre} for d in detalles]
        if hasattr(obj, 'categorias') and obj.categorias.exists():
            return [{'id_categoria': c.id_categoria, 'nombre': c.nombre} for c in obj.categorias.all()]
        if getattr(obj, 'id_categoria', None):
            return [{'id_categoria': obj.id_categoria.id_categoria, 'nombre': obj.id_categoria.nombre}]
        return []

    def get_ids_categorias(self, obj):
        cats = self.get_categorias(obj)
        return [c['id_categoria'] for c in cats]

    def get_nivel_stock(self, obj) -> str:
        cant = getattr(obj, 'cantidad_actual', 0) or 0
        minimo = getattr(obj, 'stock_minimo', 0) or 0
        if cant <= 0:
            return 'Crítico / Agotado'
        elif cant <= minimo:
            return 'Alerta de Mínimo'
        return 'Normal'


class ActualizarStockInputSerializer(serializers.Serializer):
    """
    La Aduana para el ajuste manual de inventario (CU-13).
    """
    id_producto = serializers.IntegerField(
        required=True,
        error_messages={'required': 'El ID del producto es obligatorio.'}
    )
    tipo_operacion = serializers.ChoiceField(
        choices=['INGRESO', 'EGRESO', 'ingreso', 'egreso'],
        required=True,
        error_messages={
            'required': 'El tipo de operación es obligatorio (INGRESO o EGRESO).',
            'invalid_choice': 'Operación inválida. Debe ser INGRESO o EGRESO.'
        }
    )
    cantidad = serializers.IntegerField(
        required=True,
        min_value=1,
        error_messages={
            'required': 'La cantidad es obligatoria.',
            'min_value': 'La cantidad debe ser estrictamente mayor a cero.'
        }
    )
    motivo = serializers.CharField(
        max_length=500,
        required=True,
        allow_blank=False,
        error_messages={
            'required': 'El motivo de la actualización es obligatorio.',
            'blank': 'El motivo no puede estar vacío.'
        }
    )
    usado_taller = serializers.BooleanField(
        required=False,
        default=False
    )

    def validate_motivo(self, value):
        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError('El motivo de la actualización no puede estar vacío.')
        return val

    def validate(self, attrs):
        from catalog_app.models import Producto

        # Normalizar tipo de operación a mayúsculas
        operacion = str(attrs.get('tipo_operacion') or '').strip().upper()
        attrs['tipo_operacion'] = operacion

        # Validar existencia de Producto
        id_prod = attrs.get('id_producto')
        try:
            prod = Producto.objects.get(id_producto=id_prod)
            attrs['producto'] = prod
        except Producto.DoesNotExist:
            raise serializers.ValidationError({'id_producto': 'El producto especificado no existe.'})

        return attrs


class ActualizarStockOutputSerializer(serializers.Serializer):
    """Serializador de salida tras el ajuste manual de stock."""
    id_stock = serializers.IntegerField()
    id_producto = serializers.IntegerField(source='id_producto_id')
    producto_nombre = serializers.CharField()
    tipo_operacion = serializers.CharField()
    cantidad = serializers.IntegerField()
    stock_anterior = serializers.IntegerField()
    stock_nuevo = serializers.IntegerField()
    motivo = serializers.CharField()
    usado_taller = serializers.BooleanField()
    fecha = serializers.DateField()


class FiltrarStockInputSerializer(serializers.Serializer):
    """CU-35: Valida los parámetros de consulta del filtrado de stock (reemplaza el acceso crudo a query_params)."""
    buscar = serializers.CharField(required=False, allow_blank=True, max_length=100)
    texto_busqueda = serializers.CharField(required=False, allow_blank=True, max_length=100)
    nivel_stock = serializers.CharField(required=False, allow_blank=True, max_length=30)
    nivel = serializers.CharField(required=False, allow_blank=True, max_length=30)
    id_categoria = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    id_proveedor = serializers.CharField(required=False, allow_blank=True, max_length=30)
    cuit_prov = serializers.CharField(required=False, allow_blank=True, max_length=30)
    proposito = serializers.CharField(required=False, allow_blank=True, max_length=30)

    def validate(self, attrs):
        # Unifica alias para que la vista consuma claves canónicas
        return {
            'texto_busqueda': attrs.get('buscar') or attrs.get('texto_busqueda') or None,
            'nivel_stock': attrs.get('nivel_stock') or attrs.get('nivel') or None,
            'id_categoria': attrs.get('id_categoria'),
            'id_proveedor': attrs.get('id_proveedor') or attrs.get('cuit_prov') or None,
            'proposito': attrs.get('proposito') or None,
        }
