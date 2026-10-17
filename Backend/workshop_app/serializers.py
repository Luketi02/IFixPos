from rest_framework import serializers

class ImagenOArchivoField(serializers.Field):
    """
    Campo flexible que admite tanto URLs o rutas en string como archivos binarios subidos en multipart/form-data.
    """
    def to_internal_value(self, data):
        if data is None or data == '' or data == 'null':
            return None
        return data

    def to_representation(self, value):
        return str(value) if value else None


class DispositivoInputSerializer(serializers.Serializer):
    """
    La Aduana (CU-06): Valida la carga de datos del nuevo dispositivo.
    Soporta selección de modelos del catálogo o ingreso manual ('Otro')
    con homologación inteligente y promoción automática a 8 usos.
    """
    id_cliente = serializers.IntegerField(required=True)
    id_modelo = serializers.IntegerField(required=False, allow_null=True)
    nro_serie = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    imagen = ImagenOArchivoField(required=False, allow_null=True, default=None)

    # Campos para opción "Otro" (Catálogo dinámico y homologación)
    es_otro = serializers.BooleanField(required=False, default=False)
    id_tipo = serializers.IntegerField(required=False, allow_null=True)
    nombre_tipo_otro = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    id_marca = serializers.IntegerField(required=False, allow_null=True)
    nombre_marca_otro = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)
    nombre_modelo_otro = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)

    def to_internal_value(self, data):
        # Soporta aliases de nombres para compatibilidad total
        data_dict = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'nro_serie' not in data_dict and 'numero_serie' in data_dict:
            data_dict['nro_serie'] = data_dict.get('numero_serie')
        if 'id_cliente' not in data_dict and 'id_usuario' in data_dict:
            data_dict['id_cliente'] = data_dict.get('id_usuario')

        # Manejo de booleanos y valores nulos provenientes de FormData
        if 'es_otro' in data_dict:
            val = data_dict['es_otro']
            if isinstance(val, str):
                data_dict['es_otro'] = val.strip().lower() in ('true', '1', 'yes')

        for clave_entero in ['id_modelo', 'id_tipo', 'id_marca', 'id_cliente']:
            if clave_entero in data_dict and (data_dict[clave_entero] == '' or data_dict[clave_entero] == 'null' or data_dict[clave_entero] is None):
                data_dict[clave_entero] = None

        return super().to_internal_value(data_dict)

    def validate_id_cliente(self, value):
        from users_app.models import Usuario
        if not Usuario.objects.filter(id_usuario=value).exists():
            raise serializers.ValidationError("El cliente especificado no existe en el sistema.")
        return value

    def validate(self, attrs):
        from catalog_app.models import ModeloDispositivo, Marca, TipoDispositivo

        es_otro = attrs.get('es_otro', False) or bool(attrs.get('nombre_modelo_otro'))
        attrs['es_otro'] = es_otro

        if not es_otro:
            # Flujo estándar: debe venir id_modelo válido
            id_modelo = attrs.get('id_modelo')
            if not id_modelo:
                raise serializers.ValidationError({
                    "id_modelo": "Debe seleccionar un modelo de dispositivo de la lista o activar la opción 'Otro'."
                })
            if not ModeloDispositivo.objects.filter(id_modelo=id_modelo).exists():
                raise serializers.ValidationError({
                    "id_modelo": "El modelo de dispositivo especificado no existe."
                })
        else:
            # Flujo de Homologación Manual ("Otro")
            nombre_modelo = (attrs.get('nombre_modelo_otro') or '').strip()
            if not nombre_modelo:
                raise serializers.ValidationError({
                    "nombre_modelo_otro": "Debe especificar el nombre del modelo personalizado."
                })
            attrs['nombre_modelo_otro'] = nombre_modelo

            # Validación de Marca (ID existente o nombre personalizado)
            id_marca = attrs.get('id_marca')
            nombre_marca = (attrs.get('nombre_marca_otro') or '').strip()
            if id_marca:
                if not Marca.objects.filter(id_marca=id_marca).exists():
                    raise serializers.ValidationError({
                        "id_marca": "La marca de dispositivo especificada no existe."
                    })
            elif nombre_marca:
                attrs['nombre_marca_otro'] = nombre_marca
            else:
                raise serializers.ValidationError({
                    "marca": "Debe seleccionar una marca del catálogo o especificar una nueva."
                })

            # Validación de Tipo de Dispositivo (ID existente o nombre personalizado)
            id_tipo = attrs.get('id_tipo')
            nombre_tipo = (attrs.get('nombre_tipo_otro') or '').strip()
            if id_tipo:
                if not TipoDispositivo.objects.filter(id_tipo_dispositivo=id_tipo).exists():
                    raise serializers.ValidationError({
                        "id_tipo": "El tipo de dispositivo especificado no existe."
                    })
            elif nombre_tipo:
                attrs['nombre_tipo_otro'] = nombre_tipo

        return attrs


class TipoDispositivoOutputSerializer(serializers.Serializer):
    id_tipo_dispositivo = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(read_only=True)
    estado_activo = serializers.BooleanField(read_only=True)


class MarcaOutputSerializer(serializers.Serializer):
    id_marca = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(read_only=True)
    estado_activo = serializers.BooleanField(read_only=True)


class ModeloDispositivoOutputSerializer(serializers.Serializer):
    id_modelo = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(read_only=True)
    estado_activo = serializers.BooleanField(read_only=True)
    id_marca = serializers.IntegerField(source='id_marca_id', read_only=True)
    id_tipo_dispositivo = serializers.IntegerField(source='id_tipo_dispositivo_id', read_only=True)


class DispositivoCreateInputSerializer(serializers.Serializer):
    id_usuario = serializers.IntegerField()
    id_modelo = serializers.IntegerField()
    numero_serie = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    imagen = serializers.CharField(max_length=500, required=False, allow_blank=True, allow_null=True)

class DispositivoOutputSerializer(serializers.Serializer):
    id_dispositivo = serializers.IntegerField(read_only=True)
    numero_serie = serializers.CharField(max_length=100, allow_null=True)
    fecha_registro = serializers.DateField()
    imagen = serializers.CharField(max_length=500, allow_null=True)
    id_modelo = serializers.IntegerField(source='id_modelo_id')
    id_usuario = serializers.IntegerField(source='id_usuario_id')


class ModeloDispositivoAnidadoSerializer(serializers.Serializer):
    id_modelo = serializers.IntegerField()
    nombre = serializers.CharField()

class ReparacionAnidadoSerializer(serializers.Serializer):
    etapa = serializers.CharField()
    codigo_sec = serializers.CharField()
    fecha_inicio = serializers.DateField()

class DispositivoFiltradoOutputSerializer(serializers.Serializer):
    id_dispositivo = serializers.IntegerField()
    numero_serie = serializers.CharField()
    fecha_registro = serializers.DateField()
    modelo = ModeloDispositivoAnidadoSerializer(source='id_modelo', read_only=True)
    reparaciones = ReparacionAnidadoSerializer(source='reparacion_set', many=True, read_only=True)
