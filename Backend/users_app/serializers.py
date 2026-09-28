from rest_framework import serializers


class LoginInputSerializer(serializers.Serializer):
    """
    Validador de datos de entrada para el endpoint de Login.
    """
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True)


class GoogleLoginSerializer(serializers.Serializer):
    """
    Validador de datos de entrada para el endpoint de Google Login.
    """
    google_token = serializers.CharField(required=True)
