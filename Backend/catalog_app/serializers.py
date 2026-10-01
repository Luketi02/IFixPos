from rest_framework import serializers

class MarcaInputSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=150)

class MarcaOutputSerializer(serializers.Serializer):
    id_marca = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(max_length=150)
    estado_activo = serializers.BooleanField()

class ModeloInputSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=150)
    id_marca = serializers.IntegerField()
    id_tipo_dispositivo = serializers.IntegerField()

class ModeloOutputSerializer(serializers.Serializer):
    id_modelo = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(max_length=150)
    estado_activo = serializers.BooleanField()
    id_marca = serializers.IntegerField(source='id_marca_id')
    id_tipo_dispositivo = serializers.IntegerField(source='id_tipo_dispositivo_id')
