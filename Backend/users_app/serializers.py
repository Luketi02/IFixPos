from rest_framework import serializers
from django.core.validators import RegexValidator

# Validadores estrictos reutilizables (La Aduana)
dni_validator = RegexValidator(
    regex=r'^\d+$',
    message="El DNI debe contener única y exclusivamente caracteres numéricos."
)

telefono_validator = RegexValidator(
    regex=r'^\+?\d{9,15}$',
    message="El número de teléfono debe tener un formato válido (opcionalmente comenzar con '+' y contener entre 9 y 15 dígitos numéricos)."
)

codigo_otp_validator = RegexValidator(
    regex=r'^\d{6}$',
    message="El código de verificación debe contener exactamente 6 dígitos numéricos."
)

nombre_apellido_validator = RegexValidator(
    regex=r"^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$",
    message="El campo solo debe contener letras, espacios, guiones o apóstrofes (no se permiten números ni caracteres especiales)."
)


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
    nombre = serializers.CharField(max_length=100, required=True, validators=[nombre_apellido_validator])
    apellido = serializers.CharField(max_length=100, required=True, validators=[nombre_apellido_validator])
    email = serializers.EmailField(required=True)
    dni = serializers.CharField(max_length=50, required=True, validators=[dni_validator])
    telefono = serializers.CharField(max_length=50, required=True, validators=[telefono_validator])
    contrasena = serializers.CharField(required=True, write_only=True)
    captcha_token = serializers.CharField(required=True)
    telefono_alt = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True)

    def validate_telefono(self, value):
        if value:
            clean_value = value.strip().replace(" ", "")
            telefono_validator(clean_value)
            return clean_value
        return value

    def validate_telefono_alt(self, value):
        if value and value.strip():
            clean_value = value.strip().replace(" ", "")
            telefono_validator(clean_value)
            return clean_value
        return value

class CompletarOnboardingInputSerializer(serializers.Serializer):
    nombre = serializers.CharField(required=False, allow_blank=True, validators=[nombre_apellido_validator])
    apellido = serializers.CharField(required=False, allow_blank=True, validators=[nombre_apellido_validator])
    dni = serializers.CharField(required=True, validators=[dni_validator])
    telefono = serializers.CharField(required=True, validators=[telefono_validator])
    telefono_alt = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    
    def validate_dni(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("El DNI no puede estar vacío.")
        return value.strip()
        
    def validate_telefono(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("El teléfono no puede estar vacío.")
        return value.strip()

    def validate_telefono_alt(self, value):
        if value and value.strip():
            telefono_validator(value.strip())
            return value.strip()
        return None

class ValidarCodigoInputSerializer(serializers.Serializer):
    """
    Validador de entrada para verificar código OTP de activación de cuenta.
    """
    email = serializers.EmailField(required=True)
    codigo = serializers.CharField(
        required=True, 
        max_length=6, 
        min_length=6, 
        validators=[codigo_otp_validator]
    )

class RegistroInternoInputSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=100, required=True, validators=[nombre_apellido_validator])
    apellido = serializers.CharField(max_length=100, required=True, validators=[nombre_apellido_validator])
    email = serializers.EmailField(required=True)
    telefono = serializers.CharField(max_length=50, required=True, validators=[telefono_validator])
    contrasena = serializers.CharField(required=True, write_only=True)
    telefono_alt = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True)
    id_rol = serializers.IntegerField(required=False, allow_null=True)

    def validate_telefono_alt(self, value):
        if value and value.strip():
            telefono_validator(value.strip())
        return value

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


class EditarPerfilInputSerializer(serializers.Serializer):
    """Validador para editar el perfil de un usuario."""
    nombre = serializers.CharField(required=True, validators=[nombre_apellido_validator])
    apellido = serializers.CharField(required=True, validators=[nombre_apellido_validator])
    email = serializers.EmailField(required=True)
    telefono = serializers.CharField(required=True, validators=[telefono_validator])
    dni = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    telefono_alt = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    foto_perfil = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate_dni(self, value):
        if value and value.strip():
            dni_validator(value.strip())
        return value

    def validate_telefono_alt(self, value):
        if value and value.strip():
            telefono_validator(value.strip())
        return value


class PerfilOutputSerializer(serializers.Serializer):
    """Estructura de salida para los datos del perfil actualizado."""
    id_usuario = serializers.IntegerField()
    email = serializers.EmailField()
    nombre = serializers.CharField()
    apellido = serializers.CharField()
    telefono = serializers.CharField()
    dni = serializers.CharField(allow_null=True, required=False)
    telefono_alt = serializers.CharField(allow_null=True, required=False)
    foto_perfil = serializers.CharField(allow_null=True, required=False)


class PerfilUsuarioAnidadoSerializer(serializers.Serializer):
    dni = serializers.CharField()
    nombre = serializers.CharField()
    apellido = serializers.CharField()

class RolUsuarioAnidadoSerializer(serializers.Serializer):
    nombre_rol = serializers.CharField()

class UsuarioFiltradoOutputSerializer(serializers.Serializer):
    id_usuario = serializers.IntegerField()
    email = serializers.EmailField()
    fecha_registro = serializers.DateField()
    rol = RolUsuarioAnidadoSerializer(source='id_rol', read_only=True)
    perfil = PerfilUsuarioAnidadoSerializer(source='perfilusuario', read_only=True)
