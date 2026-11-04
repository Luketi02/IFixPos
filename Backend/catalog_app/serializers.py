from rest_framework import serializers

class MarcaInputSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=150)

class MarcaOutputSerializer(serializers.Serializer):
    id_marca = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(max_length=150)
    estado_activo = serializers.BooleanField()


class MarcaCreateInputSerializer(serializers.Serializer):
    """
    La Aduana para el registro de una nueva Marca (CU-77).
    """
    nombre = serializers.CharField(
        max_length=150,
        required=True,
        error_messages={'required': 'El nombre de la marca es obligatorio.'}
    )

    def validate_nombre(self, value):
        from .models import Marca

        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError('El nombre de la marca no puede estar vacío.')

        marca_existente = Marca.objects.filter(nombre__iexact=val).first()
        if marca_existente and marca_existente.estado_activo:
            raise serializers.ValidationError("La marca ya se encuentra registrada y activa")

        return val

class TipoDispositivoOutputSerializer(serializers.Serializer):
    """
    Serializador de salida para TipoDispositivo.
    """
    id_tipo_dispositivo = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField()
    estado_activo = serializers.BooleanField()


class ModeloInputSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=150)
    id_marca = serializers.IntegerField()
    id_tipo_dispositivo = serializers.IntegerField()


class ModeloDispositivoOutputSerializer(serializers.Serializer):
    """
    Serializador de salida para ModeloDispositivo (CU-81 / CU-79 / CU-80).
    Expone ID, nombre, estado_activo, y datos anidados de marca y tipo de dispositivo.
    """
    id_modelo = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(max_length=150)
    estado_activo = serializers.BooleanField()
    id_marca = serializers.IntegerField(source='id_marca_id', read_only=True)
    id_tipo_dispositivo = serializers.IntegerField(source='id_tipo_dispositivo_id', read_only=True)
    marca = MarcaOutputSerializer(source='id_marca', read_only=True)
    tipo_dispositivo = TipoDispositivoOutputSerializer(source='id_tipo_dispositivo', read_only=True)


ModeloOutputSerializer = ModeloDispositivoOutputSerializer


class ModeloDispositivoCreateInputSerializer(serializers.Serializer):
    """
    La Aduana para el registro de un nuevo Modelo de Dispositivo (CU-79).
    """
    nombre = serializers.CharField(
        max_length=150,
        required=True,
        error_messages={'required': 'El nombre del modelo es obligatorio.'}
    )
    id_marca = serializers.IntegerField(
        required=True,
        error_messages={'required': 'La marca es obligatoria.'}
    )
    id_tipo_dispositivo = serializers.IntegerField(
        required=True,
        error_messages={'required': 'El tipo de dispositivo es obligatorio.'}
    )

    def validate_nombre(self, value):
        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError('El nombre del modelo no puede estar vacío.')
        return val

    def validate(self, attrs):
        from .models import Marca, TipoDispositivo, ModeloDispositivo

        nombre = attrs['nombre']
        id_marca = attrs['id_marca']
        id_tipo = attrs['id_tipo_dispositivo']

        # Validar existencia y estado de la Marca
        try:
            marca = Marca.objects.get(id_marca=id_marca)
            if not marca.estado_activo:
                raise serializers.ValidationError({'id_marca': 'La marca especificada no se encuentra activa.'})
            attrs['marca'] = marca
        except Marca.DoesNotExist:
            raise serializers.ValidationError({'id_marca': 'La marca especificada no existe.'})

        # Validar existencia y estado del Tipo de Dispositivo
        try:
            tipo = TipoDispositivo.objects.get(id_tipo_dispositivo=id_tipo)
            if not tipo.estado_activo:
                raise serializers.ValidationError({'id_tipo_dispositivo': 'El tipo de dispositivo especificado no se encuentra activo.'})
            attrs['tipo_dispositivo'] = tipo
        except TipoDispositivo.DoesNotExist:
            raise serializers.ValidationError({'id_tipo_dispositivo': 'El tipo de dispositivo especificado no existe.'})

        # Validar unicidad compuesta (nombre iexact + id_marca)
        modelo_existente = ModeloDispositivo.objects.filter(
            nombre__iexact=nombre,
            id_marca_id=id_marca
        ).first()

        if modelo_existente:
            if modelo_existente.estado_activo:
                raise serializers.ValidationError("El modelo ya se encuentra registrado y activo para esta marca")
            # Si existe pero su estado_activo es False, la validación pasa (será reactivado en el servicio)

        return attrs


class CategoriaProductoOutputSerializer(serializers.Serializer):
    """
    Serializador de salida para CategoriaProducto.
    Expone id_categoria, nombre, descripcion y estado_activo (manteniendo estado para compatibilidad).
    """
    id_categoria = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField()
    descripcion = serializers.CharField(allow_null=True, required=False, allow_blank=True)
    estado = serializers.BooleanField(required=False)
    estado_activo = serializers.BooleanField(source='estado')


class CategoriaProductoCreateInputSerializer(serializers.Serializer):
    """
    La Aduana Comercial para el registro de una nueva Categoría de Producto (CU-29).
    """
    nombre = serializers.CharField(
        max_length=150,
        required=True,
        error_messages={'required': 'El nombre de la categoría es obligatorio.'}
    )
    descripcion = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        allow_null=True,
        default=''
    )

    def validate_nombre(self, value):
        from .models import CategoriaProducto

        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError('El nombre de la categoría no puede estar vacío.')

        if CategoriaProducto.objects.filter(nombre__iexact=val).exists():
            raise serializers.ValidationError("La categoría ya se encuentra registrada con este nombre")

        return val


class ProductoTiendaOutputSerializer(serializers.Serializer):
    id_producto = serializers.IntegerField()
    nombre = serializers.CharField()
    descripcion = serializers.CharField(allow_blank=True, allow_null=True)
    precio_venta = serializers.DecimalField(max_digits=10, decimal_places=2)
    id_categoria = serializers.IntegerField(allow_null=True)
    categoria_nombre = serializers.CharField(allow_blank=True)
    id_marca = serializers.IntegerField(allow_null=True, required=False, default=None)
    marca_nombre = serializers.CharField(allow_blank=True, allow_null=True, required=False, default='')
    id_modelo = serializers.IntegerField(source='id_modelo_id', allow_null=True, required=False)
    modelo_nombre = serializers.CharField(allow_blank=True, allow_null=True, required=False, default='')
    id_tipo_dispositivo = serializers.IntegerField(allow_null=True, required=False, default=None)
    tipo_dispositivo_nombre = serializers.CharField(allow_blank=True, allow_null=True, required=False, default='')
    imagen_principal = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    imagenes = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    stock_disponible = serializers.IntegerField()
    en_stock = serializers.BooleanField()
    tiene_descuento = serializers.BooleanField(required=False, default=False)
    porcentaje_descuento = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    precio_final = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    motivo_descuento = serializers.CharField(allow_blank=True, allow_null=True, required=False, default='')
    tipo_compatibilidad = serializers.CharField(required=False, default='MONO_MODELO')
    es_universal = serializers.BooleanField(required=False, default=False)
    modelos_compatibles = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    marcas_compatibles = serializers.ListField(child=serializers.CharField(), required=False, default=list)


class ProductoCreateInputSerializer(serializers.Serializer):
    """
    La Aduana para el registro manual de un nuevo producto (CU-12).
    """
    nombre = serializers.CharField(
        max_length=255,
        required=True,
        error_messages={'required': 'El nombre del producto es obligatorio.'}
    )
    id_categoria = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None
    )
    ids_categorias = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list
    )
    id_marca = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None
    )
    id_modelo = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None
    )
    id_tipo_dispositivo = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None
    )
    tipo_compatibilidad = serializers.CharField(
        required=False,
        default=None,
        allow_null=True
    )
    es_universal = serializers.BooleanField(
        required=False,
        default=False
    )
    ids_modelos_compatibles = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list
    )
    ids_marcas_compatibles = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list
    )
    imagen_principal = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        allow_null=True,
        default=''
    )
    imagenes = serializers.ListField(
        child=serializers.CharField(max_length=500),
        required=False,
        default=list
    )
    descripcion = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        default=''
    )
    precio = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=0,
        required=False,
        error_messages={'min_value': 'El precio no puede ser negativo.'}
    )
    precio_venta = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=0,
        required=False,
        error_messages={'min_value': 'El precio de venta no puede ser negativo.'}
    )
    apto_venta = serializers.BooleanField(required=False, default=False)
    apto_reparacion = serializers.BooleanField(required=False, default=False)
    consumible = serializers.BooleanField(required=False, default=False)
    apto_consumible = serializers.BooleanField(required=False, default=False)
    modulo_automatico = serializers.BooleanField(required=False, default=False)
    stock_inicial = serializers.IntegerField(
        required=False,
        default=0,
        min_value=0,
        error_messages={'min_value': 'El stock inicial no puede ser negativo.'}
    )
    stock_minimo = serializers.IntegerField(
        required=False,
        default=0,
        min_value=0,
        error_messages={'min_value': 'El stock mínimo no puede ser negativo.'}
    )

    def validate_nombre(self, value):
        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError('El nombre del producto no puede estar vacío.')
        return val

    def validate(self, attrs):
        from catalog_app.models import CategoriaProducto, Marca, ModeloDispositivo

        # 1. Validar existencia de la o las Categorías (Soporta N a M)
        ids_cat = attrs.get('ids_categorias') or []
        id_cat_unico = attrs.get('id_categoria')

        if id_cat_unico and id_cat_unico not in ids_cat:
            ids_cat.insert(0, id_cat_unico)

        if not ids_cat:
            raise serializers.ValidationError({'ids_categorias': 'La categoría del producto es obligatoria.'})

        categorias_objs = list(CategoriaProducto.objects.filter(id_categoria__in=ids_cat))
        ids_encontrados = {c.id_categoria for c in categorias_objs}
        ids_faltantes = set(ids_cat) - ids_encontrados
        if ids_faltantes:
            raise serializers.ValidationError({'ids_categorias': f'Las siguientes categorías no existen: {list(ids_faltantes)}.'})

        attrs['categorias'] = categorias_objs
        attrs['categoria'] = categorias_objs[0]
        attrs['ids_categorias'] = [c.id_categoria for c in categorias_objs]

        # 1.b Validar Marca (Opcional)
        id_marca = attrs.get('id_marca')
        if id_marca:
            try:
                attrs['marca'] = Marca.objects.get(id_marca=id_marca)
            except Marca.DoesNotExist:
                raise serializers.ValidationError({'id_marca': 'La marca seleccionada no existe.'})

        # 1.c Validar Modelo (Opcional)
        id_modelo = attrs.get('id_modelo')
        if id_modelo:
            try:
                modelo_obj = ModeloDispositivo.objects.get(id_modelo=id_modelo)
                if id_marca and modelo_obj.id_marca_id != id_marca:
                    raise serializers.ValidationError({'id_modelo': 'El modelo seleccionado no pertenece a la marca indicada.'})
                attrs['modelo'] = modelo_obj
            except ModeloDispositivo.DoesNotExist:
                raise serializers.ValidationError({'id_modelo': 'El modelo seleccionado no existe.'})

        # 1.d Validar Compatibilidades Múltiples de Modelos
        ids_modelos = list(attrs.get('ids_modelos_compatibles') or [])
        if id_modelo and id_modelo not in ids_modelos:
            ids_modelos.insert(0, id_modelo)
        elif not id_modelo and ids_modelos:
            attrs['id_modelo'] = ids_modelos[0]

        if ids_modelos:
            modelos_encontrados = list(ModeloDispositivo.objects.filter(id_modelo__in=ids_modelos))
            ids_existentes = {m.id_modelo for m in modelos_encontrados}
            ids_faltantes = set(ids_modelos) - ids_existentes
            if ids_faltantes:
                raise serializers.ValidationError({'ids_modelos_compatibles': f'Los siguientes modelos no existen: {list(ids_faltantes)}.'})
            attrs['modelos_compatibles_objs'] = modelos_encontrados
            attrs['ids_modelos_compatibles'] = ids_modelos
            if not attrs.get('modelo') and modelos_encontrados:
                attrs['modelo'] = modelos_encontrados[0]

        # 1.e Validar Compatibilidad de Marcas
        ids_marcas = list(attrs.get('ids_marcas_compatibles') or [])
        if id_marca and id_marca not in ids_marcas:
            ids_marcas.insert(0, id_marca)
        elif not id_marca and ids_marcas:
            attrs['id_marca'] = ids_marcas[0]

        if ids_marcas:
            marcas_encontradas = list(Marca.objects.filter(id_marca__in=ids_marcas))
            ids_existentes_marcas = {m.id_marca for m in marcas_encontradas}
            ids_faltantes_marcas = set(ids_marcas) - ids_existentes_marcas
            if ids_faltantes_marcas:
                raise serializers.ValidationError({'ids_marcas_compatibles': f'Las siguientes marcas no existen: {list(ids_faltantes_marcas)}.'})
            attrs['marcas_compatibles_objs'] = marcas_encontradas
            attrs['ids_marcas_compatibles'] = ids_marcas
            if not attrs.get('marca') and marcas_encontradas:
                attrs['marca'] = marcas_encontradas[0]

        # 1.f Validar Tipo de Dispositivo (Opcional)
        id_tipo_dispositivo = attrs.get('id_tipo_dispositivo')
        if id_tipo_dispositivo:
            from .models import TipoDispositivo
            try:
                attrs['tipo_dispositivo'] = TipoDispositivo.objects.get(id_tipo_dispositivo=id_tipo_dispositivo)
            except TipoDispositivo.DoesNotExist:
                raise serializers.ValidationError({'id_tipo_dispositivo': 'El tipo de dispositivo seleccionado no existe.'})
        elif attrs.get('modelo') and getattr(attrs['modelo'], 'id_tipo_dispositivo', None):
            attrs['tipo_dispositivo'] = attrs['modelo'].id_tipo_dispositivo
            attrs['id_tipo_dispositivo'] = attrs['tipo_dispositivo'].id_tipo_dispositivo

        # 1.g Resolver y Validar Tipo de Compatibilidad (CU-12)
        from catalog_app.models import TipoCompatibilidadProducto
        es_universal = bool(attrs.get('es_universal', False))
        tipo_comp = attrs.get('tipo_compatibilidad')

        if tipo_comp:
            if tipo_comp not in TipoCompatibilidadProducto.values:
                raise serializers.ValidationError({'tipo_compatibilidad': f'El tipo de compatibilidad "{tipo_comp}" no es válido.'})

            if tipo_comp == TipoCompatibilidadProducto.MONO_MODELO:
                if not attrs.get('modelo') and not attrs.get('id_modelo') and not ids_modelos:
                    raise serializers.ValidationError({'id_modelo': 'Debe seleccionar un modelo específico comercial para el modo Mono-Modelo.'})
            elif tipo_comp == TipoCompatibilidadProducto.MULTI_MODELO:
                if not ids_modelos or len(ids_modelos) == 0:
                    raise serializers.ValidationError({'ids_modelos_compatibles': 'Debe seleccionar al menos un modelo compatible para el modo Multi-Modelo.'})
            elif tipo_comp == TipoCompatibilidadProducto.MARCAS:
                if not ids_marcas or len(ids_marcas) == 0:
                    raise serializers.ValidationError({'ids_marcas_compatibles': 'Debe seleccionar al menos una marca compatible para el modo Por Marcas.'})
            elif tipo_comp == TipoCompatibilidadProducto.TIPO_DISPOSITIVO:
                if not attrs.get('tipo_dispositivo') and not attrs.get('id_tipo_dispositivo'):
                    raise serializers.ValidationError({'id_tipo_dispositivo': 'Debe seleccionar un tipo de dispositivo compatible.'})
            elif tipo_comp == TipoCompatibilidadProducto.UNIVERSAL:
                es_universal = True
        else:
            if es_universal:
                tipo_comp = TipoCompatibilidadProducto.UNIVERSAL
            elif len(ids_modelos) > 1:
                tipo_comp = TipoCompatibilidadProducto.MULTI_MODELO
            elif ids_modelos or attrs.get('modelo'):
                tipo_comp = TipoCompatibilidadProducto.MONO_MODELO
            elif ids_marcas:
                tipo_comp = TipoCompatibilidadProducto.MARCAS
            elif attrs.get('id_tipo_dispositivo'):
                tipo_comp = TipoCompatibilidadProducto.TIPO_DISPOSITIVO
            else:
                tipo_comp = TipoCompatibilidadProducto.UNIVERSAL
                es_universal = True

        if tipo_comp == TipoCompatibilidadProducto.UNIVERSAL:
            es_universal = True
        else:
            es_universal = False

        attrs['tipo_compatibilidad'] = tipo_comp
        attrs['es_universal'] = es_universal

        # 2. Unificar precio / precio_venta
        precio = attrs.get('precio') if attrs.get('precio') is not None else attrs.get('precio_venta')
        if precio is None:
            raise serializers.ValidationError({'precio': 'El precio del producto es obligatorio.'})
        attrs['precio_venta'] = precio

        # 3. Unificar consumible / apto_consumible
        es_consumible = bool(attrs.get('consumible') or attrs.get('apto_consumible'))
        attrs['apto_consumible'] = es_consumible

        # 4. Validación del Propósito (Paso 4 del CU-12):
        es_venta = bool(attrs.get('apto_venta', False))
        es_reparacion = bool(attrs.get('apto_reparacion', False))

        if not es_venta and not es_reparacion and not es_consumible:
            raise serializers.ValidationError("El artículo debe tener al menos un propósito funcional asignado")

        return attrs


class ProductoCreateOutputSerializer(serializers.Serializer):
    """Serializador de salida tras el alta exitosa del producto."""
    id_producto = serializers.IntegerField()
    nombre = serializers.CharField()
    descripcion = serializers.CharField(allow_blank=True, allow_null=True)
    precio_venta = serializers.DecimalField(max_digits=10, decimal_places=2)
    estado = serializers.BooleanField()
    apto_venta = serializers.BooleanField()
    apto_reparacion = serializers.BooleanField()
    apto_consumible = serializers.BooleanField()
    modulo_automatico = serializers.BooleanField()
    id_categoria = serializers.IntegerField(source='id_categoria_id')
    categoria_nombre = serializers.CharField()
    id_marca = serializers.IntegerField(source='id_modelo.id_marca_id', allow_null=True, required=False, default=None)
    marca = serializers.CharField(source='id_modelo.id_marca.nombre', allow_null=True, required=False, default='')
    id_modelo = serializers.IntegerField(source='id_modelo_id', allow_null=True, required=False)
    modelo = serializers.CharField(source='id_modelo.nombre', allow_null=True, required=False, default='')
    id_tipo_dispositivo = serializers.IntegerField(source='id_modelo.id_tipo_dispositivo_id', allow_null=True, required=False, default=None)
    tipo_dispositivo = serializers.CharField(source='id_modelo.id_tipo_dispositivo.nombre', allow_null=True, required=False, default='')
    imagen_principal = serializers.CharField(allow_blank=True, allow_null=True, required=False, default='')
    imagenes = serializers.SerializerMethodField(required=False)
    tipo_compatibilidad = serializers.CharField(required=False, default='MONO_MODELO')
    es_universal = serializers.BooleanField(required=False, default=False)
    ids_modelos_compatibles = serializers.SerializerMethodField(required=False)
    ids_marcas_compatibles = serializers.SerializerMethodField(required=False)
    stock_inicial = serializers.IntegerField()
    stock_minimo = serializers.IntegerField()

    def get_ids_modelos_compatibles(self, obj):
        if hasattr(obj, 'modelos_compatibles'):
            return list(obj.modelos_compatibles.values_list('id_modelo', flat=True))
        return []

    def get_ids_marcas_compatibles(self, obj):
        if hasattr(obj, 'marcas_compatibles'):
            return list(obj.marcas_compatibles.values_list('id_marca', flat=True))
        return []

    def get_imagenes(self, obj):
        if hasattr(obj, 'imagenes'):
            return [img.url_imagen for img in obj.imagenes.all()]
        return []


class ProductoUpdateInputSerializer(serializers.Serializer):
    """
    La Aduana para la modificación de un producto existente (CU-68).
    Permite actualizar atributos descriptivos, comerciales, marcas/modelos, imágenes y banderas lógicas.
    """
    nombre = serializers.CharField(
        max_length=255,
        required=True,
        error_messages={'required': 'El nombre del producto es obligatorio.'}
    )
    id_categoria = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None
    )
    ids_categorias = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list
    )
    id_marca = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None
    )
    id_modelo = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None
    )
    id_tipo_dispositivo = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None
    )
    tipo_compatibilidad = serializers.CharField(
        required=False,
        default=None,
        allow_null=True
    )
    es_universal = serializers.BooleanField(
        required=False,
        default=False
    )
    ids_modelos_compatibles = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list
    )
    ids_marcas_compatibles = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list
    )
    imagen_principal = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        allow_null=True,
        default=''
    )
    imagenes = serializers.ListField(
        child=serializers.CharField(max_length=500),
        required=False,
        default=list
    )
    descripcion = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        default=''
    )
    precio = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=0,
        required=False,
        error_messages={'min_value': 'El precio no puede ser negativo.'}
    )
    precio_venta = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=0,
        required=False,
        error_messages={'min_value': 'El precio de venta no puede ser negativo.'}
    )
    estado = serializers.BooleanField(required=False, default=True)
    apto_venta = serializers.BooleanField(required=False, default=False)
    apto_reparacion = serializers.BooleanField(required=False, default=False)
    consumible = serializers.BooleanField(required=False, default=False)
    apto_consumible = serializers.BooleanField(required=False, default=False)
    modulo_automatico = serializers.BooleanField(required=False, default=False)
    stock_minimo = serializers.IntegerField(
        required=False,
        default=0,
        min_value=0,
        error_messages={'min_value': 'El stock mínimo no puede ser negativo.'}
    )

    def validate_nombre(self, value):
        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError('El nombre del producto no puede estar vacío.')
        return val

    def validate(self, attrs):
        from catalog_app.models import CategoriaProducto, Marca, ModeloDispositivo, TipoDispositivo

        # 1. Validar Categorías (Soporta N a M)
        ids_cat = attrs.get('ids_categorias') or []
        id_cat_unico = attrs.get('id_categoria')

        if id_cat_unico and id_cat_unico not in ids_cat:
            ids_cat.insert(0, id_cat_unico)

        if ids_cat:
            categorias_objs = list(CategoriaProducto.objects.filter(id_categoria__in=ids_cat))
            ids_encontrados = {c.id_categoria for c in categorias_objs}
            ids_faltantes = set(ids_cat) - ids_encontrados
            if ids_faltantes:
                raise serializers.ValidationError({'ids_categorias': f'Las siguientes categorías no existen: {list(ids_faltantes)}.'})
            attrs['categorias'] = categorias_objs
            attrs['categoria'] = categorias_objs[0]
            attrs['ids_categorias'] = [c.id_categoria for c in categorias_objs]
        elif id_cat_unico:
            try:
                cat = CategoriaProducto.objects.get(id_categoria=id_cat_unico)
                attrs['categoria'] = cat
                attrs['categorias'] = [cat]
            except CategoriaProducto.DoesNotExist:
                raise serializers.ValidationError({'id_categoria': 'La categoría seleccionada no existe.'})

        # 2. Validar Marca
        id_marca = attrs.get('id_marca')
        if id_marca:
            try:
                attrs['marca'] = Marca.objects.get(id_marca=id_marca)
            except Marca.DoesNotExist:
                raise serializers.ValidationError({'id_marca': 'La marca seleccionada no existe.'})

        # 3. Validar Modelo
        id_modelo = attrs.get('id_modelo')
        if id_modelo:
            try:
                modelo_obj = ModeloDispositivo.objects.get(id_modelo=id_modelo)
                if id_marca and modelo_obj.id_marca_id != id_marca:
                    raise serializers.ValidationError({'id_modelo': 'El modelo seleccionado no pertenece a la marca indicada.'})
                attrs['modelo'] = modelo_obj
            except ModeloDispositivo.DoesNotExist:
                raise serializers.ValidationError({'id_modelo': 'El modelo seleccionado no existe.'})

        # 3.b Validar Compatibilidades Múltiples de Modelos
        ids_modelos = list(attrs.get('ids_modelos_compatibles') or [])
        if id_modelo and id_modelo not in ids_modelos:
            ids_modelos.insert(0, id_modelo)
        elif not id_modelo and ids_modelos:
            attrs['id_modelo'] = ids_modelos[0]

        if ids_modelos:
            modelos_encontrados = list(ModeloDispositivo.objects.filter(id_modelo__in=ids_modelos))
            ids_existentes = {m.id_modelo for m in modelos_encontrados}
            ids_faltantes = set(ids_modelos) - ids_existentes
            if ids_faltantes:
                raise serializers.ValidationError({'ids_modelos_compatibles': f'Los siguientes modelos no existen: {list(ids_faltantes)}.'})
            attrs['modelos_compatibles_objs'] = modelos_encontrados
            attrs['ids_modelos_compatibles'] = ids_modelos
            if not attrs.get('modelo') and modelos_encontrados:
                attrs['modelo'] = modelos_encontrados[0]

        # 3.c Validar Compatibilidad de Marcas
        ids_marcas = list(attrs.get('ids_marcas_compatibles') or [])
        if id_marca and id_marca not in ids_marcas:
            ids_marcas.insert(0, id_marca)
        elif not id_marca and ids_marcas:
            attrs['id_marca'] = ids_marcas[0]

        if ids_marcas:
            marcas_encontradas = list(Marca.objects.filter(id_marca__in=ids_marcas))
            ids_existentes_marcas = {m.id_marca for m in marcas_encontradas}
            ids_faltantes_marcas = set(ids_marcas) - ids_existentes_marcas
            if ids_faltantes_marcas:
                raise serializers.ValidationError({'ids_marcas_compatibles': f'Las siguientes marcas no existen: {list(ids_faltantes_marcas)}.'})
            attrs['marcas_compatibles_objs'] = marcas_encontradas
            attrs['ids_marcas_compatibles'] = ids_marcas
            if not attrs.get('marca') and marcas_encontradas:
                attrs['marca'] = marcas_encontradas[0]

        # 4. Validar Tipo de Dispositivo
        id_tipo_dispositivo = attrs.get('id_tipo_dispositivo')
        if id_tipo_dispositivo:
            try:
                attrs['tipo_dispositivo'] = TipoDispositivo.objects.get(id_tipo_dispositivo=id_tipo_dispositivo)
            except TipoDispositivo.DoesNotExist:
                raise serializers.ValidationError({'id_tipo_dispositivo': 'El tipo de dispositivo seleccionado no existe.'})
        elif attrs.get('modelo') and getattr(attrs['modelo'], 'id_tipo_dispositivo', None):
            attrs['tipo_dispositivo'] = attrs['modelo'].id_tipo_dispositivo
            attrs['id_tipo_dispositivo'] = attrs['tipo_dispositivo'].id_tipo_dispositivo

        # 4.b Resolver y Validar Tipo de Compatibilidad (CU-68)
        from catalog_app.models import TipoCompatibilidadProducto
        es_universal = bool(attrs.get('es_universal', False))
        tipo_comp = attrs.get('tipo_compatibilidad')

        if tipo_comp:
            if tipo_comp not in TipoCompatibilidadProducto.values:
                raise serializers.ValidationError({'tipo_compatibilidad': f'El tipo de compatibilidad "{tipo_comp}" no es válido.'})

            if tipo_comp == TipoCompatibilidadProducto.MONO_MODELO:
                if not attrs.get('modelo') and not attrs.get('id_modelo') and not ids_modelos:
                    raise serializers.ValidationError({'id_modelo': 'Debe seleccionar un modelo específico comercial para el modo Mono-Modelo.'})
            elif tipo_comp == TipoCompatibilidadProducto.MULTI_MODELO:
                if not ids_modelos or len(ids_modelos) == 0:
                    raise serializers.ValidationError({'ids_modelos_compatibles': 'Debe seleccionar al menos un modelo compatible para el modo Multi-Modelo.'})
            elif tipo_comp == TipoCompatibilidadProducto.MARCAS:
                if not ids_marcas or len(ids_marcas) == 0:
                    raise serializers.ValidationError({'ids_marcas_compatibles': 'Debe seleccionar al menos una marca compatible para el modo Por Marcas.'})
            elif tipo_comp == TipoCompatibilidadProducto.TIPO_DISPOSITIVO:
                if not attrs.get('tipo_dispositivo') and not attrs.get('id_tipo_dispositivo'):
                    raise serializers.ValidationError({'id_tipo_dispositivo': 'Debe seleccionar un tipo de dispositivo compatible.'})
            elif tipo_comp == TipoCompatibilidadProducto.UNIVERSAL:
                es_universal = True
        else:
            if es_universal:
                tipo_comp = TipoCompatibilidadProducto.UNIVERSAL
            elif len(ids_modelos) > 1:
                tipo_comp = TipoCompatibilidadProducto.MULTI_MODELO
            elif ids_modelos or attrs.get('modelo'):
                tipo_comp = TipoCompatibilidadProducto.MONO_MODELO
            elif ids_marcas:
                tipo_comp = TipoCompatibilidadProducto.MARCAS
            elif attrs.get('id_tipo_dispositivo'):
                tipo_comp = TipoCompatibilidadProducto.TIPO_DISPOSITIVO
            else:
                tipo_comp = TipoCompatibilidadProducto.UNIVERSAL
                es_universal = True

        if tipo_comp == TipoCompatibilidadProducto.UNIVERSAL:
            es_universal = True
        else:
            es_universal = False

        attrs['tipo_compatibilidad'] = tipo_comp
        attrs['es_universal'] = es_universal

        # 5. Unificar precio / precio_venta
        precio = attrs.get('precio') if attrs.get('precio') is not None else attrs.get('precio_venta')
        if precio is None:
            raise serializers.ValidationError({'precio': 'El precio del producto es obligatorio.'})
        attrs['precio_venta'] = precio

        # 6. Unificar consumible / apto_consumible
        es_consumible = bool(attrs.get('consumible') or attrs.get('apto_consumible'))
        attrs['apto_consumible'] = es_consumible

        # 7. Validación del Propósito (Paso 4 del CU-68 / Integridad comercial):
        es_venta = bool(attrs.get('apto_venta', False))
        es_reparacion = bool(attrs.get('apto_reparacion', False))

        if not es_venta and not es_reparacion and not es_consumible:
            raise serializers.ValidationError("El artículo debe tener al menos un propósito funcional asignado")

        return attrs


class ProductoDetailOutputSerializer(serializers.Serializer):
    """
    Serializador completo de producto para consulta detallada y edición (CU-68).
    """
    id_producto = serializers.IntegerField()
    nombre = serializers.CharField()
    descripcion = serializers.CharField(allow_blank=True, allow_null=True)
    precio_venta = serializers.DecimalField(max_digits=10, decimal_places=2)
    estado = serializers.BooleanField()
    apto_venta = serializers.BooleanField()
    apto_reparacion = serializers.BooleanField()
    apto_consumible = serializers.BooleanField()
    consumible = serializers.BooleanField(source='apto_consumible')
    modulo_automatico = serializers.BooleanField()
    id_categoria = serializers.IntegerField(source='id_categoria_id', allow_null=True)
    categoria_nombre = serializers.CharField(source='id_categoria.nombre', allow_null=True, default='')
    categorias = serializers.SerializerMethodField()
    ids_categorias = serializers.SerializerMethodField()
    tipo_compatibilidad = serializers.CharField(required=False, default='MONO_MODELO')
    es_universal = serializers.BooleanField(required=False, default=False)
    id_tipo_dispositivo = serializers.SerializerMethodField()
    tipo_dispositivo_nombre = serializers.SerializerMethodField()
    id_marca = serializers.SerializerMethodField()
    marca_nombre = serializers.SerializerMethodField()
    id_modelo = serializers.IntegerField(source='id_modelo_id', allow_null=True, required=False)
    modelo_nombre = serializers.CharField(source='id_modelo.nombre', allow_null=True, required=False, default='')
    modelos_compatibles = serializers.SerializerMethodField()
    ids_modelos_compatibles = serializers.SerializerMethodField()
    marcas_compatibles = serializers.SerializerMethodField()
    ids_marcas_compatibles = serializers.SerializerMethodField()
    imagen_principal = serializers.CharField(allow_blank=True, allow_null=True, default='')
    imagenes = serializers.SerializerMethodField()
    stock_minimo = serializers.SerializerMethodField()
    stock_actual = serializers.SerializerMethodField()

    def get_id_tipo_dispositivo(self, obj):
        if obj.id_tipo_dispositivo_id:
            return obj.id_tipo_dispositivo_id
        if obj.id_modelo and obj.id_modelo.id_tipo_dispositivo_id:
            return obj.id_modelo.id_tipo_dispositivo_id
        return None

    def get_tipo_dispositivo_nombre(self, obj):
        if obj.id_tipo_dispositivo_id and obj.id_tipo_dispositivo:
            return obj.id_tipo_dispositivo.nombre
        if obj.id_modelo and obj.id_modelo.id_tipo_dispositivo:
            return obj.id_modelo.id_tipo_dispositivo.nombre
        return ''

    def get_id_marca(self, obj):
        if obj.id_modelo and obj.id_modelo.id_marca_id:
            return obj.id_modelo.id_marca_id
        if hasattr(obj, 'marcas_compatibles'):
            primera = obj.marcas_compatibles.first()
            if primera:
                return primera.id_marca
        return None

    def get_marca_nombre(self, obj):
        if obj.id_modelo and obj.id_modelo.id_marca:
            return obj.id_modelo.id_marca.nombre
        if hasattr(obj, 'marcas_compatibles'):
            primera = obj.marcas_compatibles.first()
            if primera:
                return primera.nombre
        return ''

    def get_modelos_compatibles(self, obj):
        if hasattr(obj, 'modelos_compatibles'):
            return [{'id_modelo': m.id_modelo, 'nombre': m.nombre, 'id_marca': m.id_marca_id, 'marca_nombre': m.id_marca.nombre if m.id_marca else ''} for m in obj.modelos_compatibles.select_related('id_marca').all()]
        return []

    def get_ids_modelos_compatibles(self, obj):
        if hasattr(obj, 'modelos_compatibles'):
            return list(obj.modelos_compatibles.values_list('id_modelo', flat=True))
        return []

    def get_marcas_compatibles(self, obj):
        if hasattr(obj, 'marcas_compatibles'):
            return [{'id_marca': m.id_marca, 'nombre': m.nombre} for m in obj.marcas_compatibles.all()]
        return []

    def get_ids_marcas_compatibles(self, obj):
        if hasattr(obj, 'marcas_compatibles'):
            return list(obj.marcas_compatibles.values_list('id_marca', flat=True))
        return []

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

    def get_imagenes(self, obj):
        if hasattr(obj, 'imagenes'):
            return [img.url_imagen for img in obj.imagenes.all()]
        return []

    def get_stock_minimo(self, obj):
        if hasattr(obj, 'stock_minimo_calculado'):
            return obj.stock_minimo_calculado
        from inventory_app.models import Stock
        stock = Stock.objects.filter(id_producto=obj).first()
        return stock.stock_minimo if stock else 0

    def get_stock_actual(self, obj):
        if hasattr(obj, 'cantidad_actual'):
            return obj.cantidad_actual
        from inventory_app.selectors import obtener_stock_actual_producto
        return obtener_stock_actual_producto(obj.id_producto)



class TipoDispositivoOutputSerializer(serializers.Serializer):
    """
    Serializador de salida para TipoDispositivo.
    """
    id_tipo_dispositivo = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField()
    estado_activo = serializers.BooleanField()


class TipoDispositivoCreateInputSerializer(serializers.Serializer):
    """
    La Aduana para el registro de un nuevo Tipo de Dispositivo (CU-65).
    """
    nombre = serializers.CharField(
        max_length=100,
        required=True,
        error_messages={'required': 'El nombre del tipo de dispositivo es obligatorio.'}
    )

    def validate_nombre(self, value):
        from .models import TipoDispositivo

        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError('El nombre del tipo de dispositivo no puede estar vacío.')

        if TipoDispositivo.objects.filter(nombre__iexact=val).exists():
            raise serializers.ValidationError("El tipo de dispositivo ya se encuentra registrado")

        return val


class FiltroMarcasInputSerializer(serializers.Serializer):
    """Aduana para parámetros de consulta de marcas."""
    solo_activas = serializers.CharField(required=False, allow_blank=True)
    estado = serializers.CharField(required=False, allow_blank=True)
    estado_activo = serializers.CharField(required=False, allow_blank=True)
    buscar = serializers.CharField(required=False, allow_blank=True)
    q = serializers.CharField(required=False, allow_blank=True)
    search = serializers.CharField(required=False, allow_blank=True)
    texto_busqueda = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        solo_act = attrs.get('solo_activas')
        solo_activas = solo_act is not None and str(solo_act).strip().lower() in ['true', '1', 'si']
        estado_activo = attrs.get('estado') or attrs.get('estado_activo') or None
        texto = attrs.get('buscar') or attrs.get('q') or attrs.get('search') or attrs.get('texto_busqueda') or None
        return {
            'solo_activas': solo_activas,
            'estado_activo': estado_activo,
            'texto_busqueda': texto.strip() if texto else None
        }


class FiltroModelosInputSerializer(serializers.Serializer):
    """Aduana para parámetros de consulta de modelos (CU-81)."""
    buscar = serializers.CharField(required=False, allow_blank=True)
    q = serializers.CharField(required=False, allow_blank=True)
    search = serializers.CharField(required=False, allow_blank=True)
    texto_busqueda = serializers.CharField(required=False, allow_blank=True)
    id_marca = serializers.IntegerField(required=False, allow_null=True)
    id_tipo_dispositivo = serializers.IntegerField(required=False, allow_null=True)
    estado_activo = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        texto = attrs.get('buscar') or attrs.get('q') or attrs.get('search') or attrs.get('texto_busqueda') or None
        return {
            'texto_busqueda': texto.strip() if texto else None,
            'id_marca': attrs.get('id_marca'),
            'id_tipo_dispositivo': attrs.get('id_tipo_dispositivo'),
            'estado_activo': attrs.get('estado_activo') or None
        }


class FiltroProductosTiendaInputSerializer(serializers.Serializer):
    """Aduana para parámetros de consulta del catálogo público de productos."""
    search = serializers.CharField(required=False, allow_blank=True)
    q = serializers.CharField(required=False, allow_blank=True)
    texto_busqueda = serializers.CharField(required=False, allow_blank=True)
    id_categoria = serializers.IntegerField(required=False, allow_null=True)
    categoria = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        texto = attrs.get('search') or attrs.get('q') or attrs.get('texto_busqueda') or None
        id_cat = attrs.get('id_categoria') if attrs.get('id_categoria') is not None else attrs.get('categoria')
        return {
            'search': texto.strip() if texto else None,
            'id_categoria': id_cat
        }


class FiltroTiposDispositivosInputSerializer(serializers.Serializer):
    """Aduana para parámetros de consulta de tipos de dispositivo."""
    solo_activos = serializers.CharField(required=False, allow_blank=True)
    estado = serializers.CharField(required=False, allow_blank=True)
    estado_activo = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        solo_act = attrs.get('solo_activos')
        solo_activos = solo_act is not None and str(solo_act).strip().lower() in ['true', '1', 'si']
        estado_activo = attrs.get('estado') or attrs.get('estado_activo') or None
        return {
            'solo_activos': solo_activos,
            'estado_activo': estado_activo
        }


class FiltroCategoriasProductoInputSerializer(serializers.Serializer):
    """Aduana para parámetros de consulta de categorías de producto (CU-39)."""
    buscar = serializers.CharField(required=False, allow_blank=True)
    q = serializers.CharField(required=False, allow_blank=True)
    search = serializers.CharField(required=False, allow_blank=True)
    texto_busqueda = serializers.CharField(required=False, allow_blank=True)
    estado = serializers.CharField(required=False, allow_blank=True)
    estado_activo = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        texto = attrs.get('buscar') or attrs.get('q') or attrs.get('search') or attrs.get('texto_busqueda') or None
        estado_activo = attrs.get('estado') or attrs.get('estado_activo') or None
        return {
            'texto_busqueda': texto.strip() if texto else None,
            'estado_activo': estado_activo
        }

