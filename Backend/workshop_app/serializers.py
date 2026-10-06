from rest_framework import serializers

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
