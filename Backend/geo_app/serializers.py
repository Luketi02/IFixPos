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


class PaisNestedSerializer(serializers.Serializer):
    """Serializador anidado ligero para País."""
    id_pais = serializers.IntegerField(read_only=True)
    nombre_pais = serializers.CharField(read_only=True)
    nombre = serializers.CharField(source='nombre_pais', read_only=True)


class ProvinciaNestedSerializer(serializers.Serializer):
    """Serializador anidado ligero para Provincia."""
    id_provincia = serializers.IntegerField(read_only=True)
    nombre_provincia = serializers.CharField(read_only=True)
    nombre = serializers.CharField(source='nombre_provincia', read_only=True)
    pais = PaisNestedSerializer(source='id_pais', read_only=True)


class CiudadNestedSerializer(serializers.Serializer):
    """Serializador anidado ligero para Ciudad."""
    id_ciudad = serializers.IntegerField(read_only=True)
    nombre_ciudad = serializers.CharField(read_only=True)
    nombre = serializers.CharField(source='nombre_ciudad', read_only=True)
    provincia = ProvinciaNestedSerializer(source='id_provincia', read_only=True)


class DireccionOutputSerializer(serializers.ModelSerializer):
    """
    Serializador de salida para la entidad Dirección (CU-47, CU-48, CU-49).
    Mapea los datos de la dirección e incluye serializadores anidados ligeros
    para exponer el nombre de la Ciudad, Provincia y País.
    """
    ciudad_detalle = CiudadNestedSerializer(source='id_ciudad', read_only=True)
    ciudad_info = CiudadNestedSerializer(source='id_ciudad', read_only=True)

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
            'ciudad_detalle',
            'ciudad_info',
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
    Campos esperados:
      - id_ciudad (requerido): valida automáticamente que la ciudad exista por FK.
      - alias (opcional).
      - nro_calle (requerido).
      - nombre_barrio (requerido).
      - nro_dpto (opcional).
      - piso (opcional).
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
        required=False,
        allow_blank=True,
        allow_null=True
    )
    nro_calle = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True
    )
    calle_numero = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True
    )
    nombre_barrio = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=True
    )
    barrio = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=True
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
        # Resolver nro_calle / calle_numero
        calle = attrs.get('nro_calle') or attrs.get('calle_numero')
        if not calle or not calle.strip():
            raise serializers.ValidationError({
                'nro_calle': 'El campo nro_calle es obligatorio.'
            })
        attrs['nro_calle'] = calle.strip()

        # Resolver nombre_barrio / barrio
        barrio = attrs.get('nombre_barrio') or attrs.get('barrio')
        if not barrio or not barrio.strip():
            raise serializers.ValidationError({
                'nombre_barrio': 'El campo nombre_barrio es obligatorio.'
            })
        attrs['nombre_barrio'] = barrio.strip()

        # Normalizar alias (opcional)
        alias = attrs.get('alias')
        if alias:
            attrs['alias'] = alias.strip()
        else:
            attrs['alias'] = ''

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


class FiltroPaisesInputSerializer(serializers.Serializer):
    """Aduana para parámetros de consulta de países."""
    todas = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        todas_raw = attrs.get('todas', '')
        return {'solo_habilitados': str(todas_raw).strip().lower() not in ['true', '1']}


class FiltroProvinciasInputSerializer(serializers.Serializer):
    """Aduana para parámetros de consulta de provincias."""
    pais_id = serializers.IntegerField(required=False, allow_null=True)
    id_pais = serializers.IntegerField(required=False, allow_null=True)
    todas = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        pid = attrs.get('pais_id') if attrs.get('pais_id') is not None else attrs.get('id_pais')
        todas_raw = attrs.get('todas', '')
        return {
            'pais_id': pid,
            'solo_habilitadas': str(todas_raw).strip().lower() not in ['true', '1']
        }


class FiltroCiudadesInputSerializer(serializers.Serializer):
    """Aduana para parámetros de consulta de ciudades."""
    provincia_id = serializers.IntegerField(required=False, allow_null=True)
    id_provincia = serializers.IntegerField(required=False, allow_null=True)
    todas = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        pvid = attrs.get('provincia_id') if attrs.get('provincia_id') is not None else attrs.get('id_provincia')
        todas_raw = attrs.get('todas', '')
        return {
            'provincia_id': pvid,
            'solo_habilitadas': str(todas_raw).strip().lower() not in ['true', '1']
        }


class FiltroMisDireccionesInputSerializer(serializers.Serializer):
    """Aduana para parámetros de consulta de mis direcciones."""
    todas = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        todas_raw = attrs.get('todas', '')
        return {'todas': str(todas_raw).strip().lower() in ['true', '1']}


class FiltroZonasCoberturaInputSerializer(serializers.Serializer):
    """Aduana para parámetros de consulta de zonas de cobertura (CU-59)."""
    nivel = serializers.CharField(required=False, allow_blank=True)
    nivel_taxonomico = serializers.CharField(required=False, allow_blank=True)
    padre_id = serializers.IntegerField(required=False, allow_null=True)
    estado = serializers.CharField(required=False, allow_blank=True)
    busqueda = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        nivel = (attrs.get('nivel') or attrs.get('nivel_taxonomico') or 'PAIS').upper()
        return {
            'nivel': nivel,
            'padre_id': attrs.get('padre_id'),
            'estado': attrs.get('estado') or None,
            'busqueda': (attrs.get('busqueda') or '').strip()
        }

