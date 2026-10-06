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

class RegistroPublicoInputSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=100, required=True)
    apellido = serializers.CharField(max_length=100, required=True)
    email = serializers.EmailField(required=True)
    telefono = serializers.CharField(max_length=50, required=True)
    contrasena = serializers.CharField(required=True, write_only=True)
    captcha_token = serializers.CharField(required=True)
    telefono_alt = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True)

class RegistroInternoInputSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=100, required=True)
    apellido = serializers.CharField(max_length=100, required=True)
    email = serializers.EmailField(required=True)
    telefono = serializers.CharField(max_length=50, required=True)
    contrasena = serializers.CharField(required=True, write_only=True)
    telefono_alt = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True)
    id_rol = serializers.IntegerField(required=False, allow_null=True)

class UsuarioOutputSerializer(serializers.Serializer):
    id_usuario = serializers.IntegerField()
    email = serializers.EmailField()
    fecha_registro = serializers.DateField()

class LogoutInputSerializer(serializers.Serializer):
    """
    Validador de datos de entrada para el endpoint de Logout.
    """
    refresh_token = serializers.CharField(required=True)


class GenerarTokenInputSerializer(serializers.Serializer):
    """Validador para solicitar la generación de un token de restablecimiento."""
    email = serializers.EmailField(required=True)


class RestablecerCredencialesInputSerializer(serializers.Serializer):
    """Validador para restablecer credenciales con un token."""
    email = serializers.EmailField(required=True)
    token = serializers.CharField(required=True)
    nueva_contrasena = serializers.CharField(required=True)
    confirmar_contrasena = serializers.CharField(required=True)

    def validate(self, data):
        if data.get('nueva_contrasena') != data.get('confirmar_contrasena'):
            raise serializers.ValidationError("Las contraseñas no coinciden.")
        return data


class RecuperarContrasenaInputSerializer(serializers.Serializer):
    """Validador para solicitar la recuperación de contraseña."""
    email = serializers.EmailField(required=True)
    captcha_token = serializers.CharField(required=True)
