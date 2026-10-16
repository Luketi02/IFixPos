from rest_framework import serializers
from geo_app.models import Pais, Provincia, Ciudad, Direccion


# ==============================================================================
# SERIALIZADORES DE SALIDA (OUTPUT - DTOs DE LECTURA)
# ==============================================================================

class PaisOutputSerializer(serializers.ModelSerializer):
    """Serializador de salida para entidades de País."""
    class Meta:
        model = Pais
        fields = ['id_pais', 'nombre_pais', 'cobertura_habilitada']


class ProvinciaOutputSerializer(serializers.ModelSerializer):
    """Serializador de salida para entidades de Provincia."""
    class Meta:
        model = Provincia
        fields = ['id_provincia', 'nombre_provincia', 'cobertura_habilitada', 'id_pais']


class CiudadOutputSerializer(serializers.ModelSerializer):
    """Serializador de salida para entidades de Ciudad."""
    class Meta:
        model = Ciudad
        fields = ['id_ciudad', 'nombre_ciudad', 'cobertura_habilitada', 'id_provincia']


class DireccionOutputSerializer(serializers.ModelSerializer):
    """
    Serializador de salida para la entidad Dirección.
    Incluye datos anidados de Ciudad, Provincia y País para simplificar
    el consumo y renderizado inmediato en el Frontend.
    """
    ciudad = serializers.CharField(source='id_ciudad.nombre_ciudad', read_only=True)
    id_provincia = serializers.IntegerField(source='id_ciudad.id_provincia.id_provincia', read_only=True)
    provincia = serializers.CharField(source='id_ciudad.id_provincia.nombre_provincia', read_only=True)
    id_pais = serializers.IntegerField(source='id_ciudad.id_provincia.id_pais.id_pais', read_only=True)
    pais = serializers.CharField(source='id_ciudad.id_provincia.id_pais.nombre_pais', read_only=True)
    
    calle_numero = serializers.CharField(source='nro_calle', read_only=True)
    barrio = serializers.CharField(source='nombre_barrio', read_only=True)

    class Meta:
        model = Direccion
        fields = [
            'id_direccion',
            'alias',
            'nro_calle',
            'calle_numero',
            'nombre_barrio',
            'barrio',
            'piso',
            'nro_dpto',
            'is_active',
            'id_ciudad',
            'ciudad',
            'id_provincia',
            'provincia',
            'id_pais',
            'pais',
        ]


# ==============================================================================
# SERIALIZADORES DE ENTRADA (INPUT)
# ==============================================================================

class DireccionInputSerializer(serializers.Serializer):
    """
    Validador estricto de entrada para Registrar o Modificar Direcciones (CU-47 / CU-48).
    Valida la existencia relacional de la Ciudad en la base de datos y normaliza los campos requeridos.
    """
    id_ciudad = serializers.IntegerField(
        required=True,
        error_messages={
            'required': 'El campo id_ciudad es obligatorio.',
            'invalid': 'Debe especificar un identificador numérico de ciudad válido.'
        }
    )
    alias = serializers.CharField(
        max_length=100,
        required=True,
        allow_blank=False,
        error_messages={
            'required': 'El alias de la dirección es obligatorio.',
            'blank': 'El alias no puede estar en blanco.'
        }
    )
    calle_numero = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=False
    )
    nro_calle = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=False
    )
    barrio = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=False
    )
    nombre_barrio = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=False
    )
    piso = serializers.IntegerField(
        required=False,
        allow_null=True
    )
    nro_dpto = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True,
        allow_null=True
    )
    piso_dpto = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True,
        allow_null=True
    )

    def validate_id_ciudad(self, value):
        try:
            ciudad = Ciudad.objects.select_related('id_provincia__id_pais').get(id_ciudad=value)
        except Ciudad.DoesNotExist:
            raise serializers.ValidationError('La ciudad especificada no existe en el catálogo geográfico.')
        return ciudad

    def validate(self, attrs):
        # Resolver calle_numero / nro_calle
        calle = attrs.get('calle_numero') or attrs.get('nro_calle')
        if not calle or not calle.strip():
            raise serializers.ValidationError({
                'calle_numero': 'Debe especificar el nombre y número de la calle.'
            })
        attrs['nro_calle'] = calle.strip()

        # Resolver barrio / nombre_barrio
        barrio = attrs.get('barrio') or attrs.get('nombre_barrio')
        if not barrio or not barrio.strip():
            raise serializers.ValidationError({
                'barrio': 'Debe especificar el barrio de la dirección.'
            })
        attrs['nombre_barrio'] = barrio.strip()

        # Normalizar alias
        attrs['alias'] = attrs['alias'].strip()

        # Manejar piso_dpto si se proporciona
        piso_dpto = attrs.get('piso_dpto')
        if piso_dpto and not attrs.get('nro_dpto'):
            attrs['nro_dpto'] = piso_dpto.strip()

        return attrs


# ==============================================================================
# SERIALIZADORES DE COBERTURA LOGÍSTICA (CU-50 / CU-59)
# ==============================================================================

class ZonaCoberturaOutputSerializer(serializers.Serializer):
    """
    Serializador unificado de salida para listar zonas de cobertura (País, Provincia o Ciudad).
    """
    id = serializers.IntegerField()
    nombre = serializers.CharField()
    cobertura_habilitada = serializers.BooleanField()
    nivel = serializers.CharField()
    padre_id = serializers.IntegerField(allow_null=True)
    padre_nombre = serializers.CharField(allow_null=True)


class ZonaModificadaItemInputSerializer(serializers.Serializer):
    """
    Item individual para actualización de cobertura en lote.
    """
    id = serializers.IntegerField(
        required=True,
        error_messages={'required': 'El ID de la zona es obligatorio.', 'invalid': 'ID numérico inválido.'}
    )
    cobertura_habilitada = serializers.BooleanField(
        required=True,
        error_messages={'required': 'El estado de cobertura_habilitada es obligatorio.'}
    )


class ActualizarCoberturaZonasInputSerializer(serializers.Serializer):
    """
    Validador de entrada (La Aduana) para actualizar masivamente la cobertura logística (CU-50).
    """
    nivel_taxonomico = serializers.ChoiceField(
        choices=['PAIS', 'PROVINCIA', 'CIUDAD', 'pais', 'provincia', 'ciudad'],
        required=True,
        error_messages={'required': 'Debe especificar el nivel taxonómico.', 'invalid_choice': 'Nivel taxonómico no válido.'}
    )
    zonas_modificadas = ZonaModificadaItemInputSerializer(
        many=True,
        required=True,
        allow_empty=False,
        error_messages={'required': 'Debe enviar la lista de zonas modificadas.', 'empty': 'La lista no puede estar vacía.'}
    )
