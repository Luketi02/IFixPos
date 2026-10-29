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
    dni = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    nombre = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    apellido = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    telefono = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    telefono_alt = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    foto_perfil = serializers.CharField(allow_null=True, allow_blank=True, required=False)


class RolUsuarioAnidadoSerializer(serializers.Serializer):
    id_rol = serializers.IntegerField(required=False)
    codigo = serializers.CharField(required=False)
    nombre_rol = serializers.CharField()


class UsuarioFiltradoOutputSerializer(serializers.Serializer):
    id_usuario = serializers.IntegerField()
    email = serializers.EmailField()
    fecha_registro = serializers.DateField()
    is_active = serializers.BooleanField()
    rol = RolUsuarioAnidadoSerializer(source='id_rol', read_only=True)
    perfil = PerfilUsuarioAnidadoSerializer(source='perfilusuario', read_only=True)
    ubicacion = serializers.SerializerMethodField()

    def get_ubicacion(self, obj):
        direcciones = getattr(obj, 'direcciones_activas_prefetch', None)
        if direcciones is None:
            direcciones = list(
                obj.direccion_set.filter(is_active=True).select_related('id_ciudad__id_provincia__id_pais')[:1]
            )
        primera = direcciones[0] if direcciones else None
        if primera and primera.id_ciudad:
            ciudad = primera.id_ciudad
            provincia = ciudad.id_provincia
            pais = provincia.id_pais if provincia else None
            return {
                "id_ciudad": ciudad.id_ciudad,
                "ciudad": ciudad.nombre_ciudad,
                "id_provincia": provincia.id_provincia if provincia else None,
                "provincia": provincia.nombre_provincia if provincia else "",
                "id_pais": pais.id_pais if pais else None,
                "pais": pais.nombre_pais if pais else ""
            }
        return None


class FiltrarUsuariosInputSerializer(serializers.Serializer):
    """
    CU-32: Aduana de validación para parámetros de filtrado y búsqueda de usuarios.
    """
    dni = serializers.CharField(required=False, allow_blank=True)
    email = serializers.CharField(required=False, allow_blank=True)
    id_rol = serializers.IntegerField(required=False, min_value=1)
    activo = serializers.BooleanField(required=False, allow_null=True, default=None)
    id_pais = serializers.IntegerField(required=False, min_value=1)
    id_provincia = serializers.IntegerField(required=False, min_value=1)
    id_ciudad = serializers.IntegerField(required=False, min_value=1)

    def validate_dni(self, value):
        if value and value.strip():
            clean = value.strip()
            dni_validator(clean)
            return clean
        return ""


class ModificarUsuarioAdminInputSerializer(serializers.Serializer):
    """
    CU-44: Aduana Administrativa para modificar datos de cualquier usuario por el Administrador.
    Permite editar nombre, apellido, email, teléfono, teléfono alternativo, rol y forzar nueva contraseña.
    """
    nombre = serializers.CharField(max_length=100, required=True, validators=[nombre_apellido_validator])
    apellido = serializers.CharField(max_length=100, required=True, validators=[nombre_apellido_validator])
    email = serializers.EmailField(required=True)
    rol_codigo = serializers.CharField(max_length=50, required=False, allow_blank=True)
    rol_id = serializers.IntegerField(required=False, min_value=1)
    telefono = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True)
    telefono_alt = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True)
    forzar_contrasena = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)

    def validate_telefono(self, value):
        if value and value.strip():
            clean_value = value.strip().replace(" ", "")
            telefono_validator(clean_value)
            return clean_value
        return ""

    def validate_telefono_alt(self, value):
        if value and value.strip():
            clean_value = value.strip().replace(" ", "")
            telefono_validator(clean_value)
            return clean_value
        return ""

    def validate_forzar_contrasena(self, value):
        if value and value.strip():
            clave = value.strip()
            if len(clave) < 6:
                raise serializers.ValidationError("La nueva contraseña debe tener como mínimo 6 caracteres.")
            import re
            if not re.search(r'[A-ZÁÉÍÓÚÑÜ]', clave):
                raise serializers.ValidationError("La nueva contraseña debe contener al menos 1 letra mayúscula.")
            digitos = re.findall(r'\d', clave)
            if len(digitos) < 2:
                raise serializers.ValidationError("La nueva contraseña debe contener mínimamente 2 caracteres numéricos.")
            return clave
        return ""

    def validate(self, attrs):
        # Validación de que al menos se provea rol_codigo o rol_id si se desea asignar rol
        rol_codigo = attrs.get('rol_codigo')
        rol_id = attrs.get('rol_id')
        if not rol_codigo and not rol_id:
            raise serializers.ValidationError({"rol": "Debe especificar rol_codigo o rol_id para asignar al usuario."})

        # Comprobación de existencia del rol
        from users_app.models import RolUsuario
        rol_obj = None
        if rol_id:
            rol_obj = RolUsuario.objects.filter(id_rol=rol_id).first()
        elif rol_codigo:
            rol_obj = RolUsuario.objects.filter(codigo__iexact=rol_codigo).first()
            if not rol_obj:
                rol_obj = RolUsuario.objects.filter(nombre_rol__iexact=rol_codigo).first()

        if not rol_obj:
            raise serializers.ValidationError({"rol": "El rol especificado no existe en el sistema."})

        attrs['rol_instancia'] = rol_obj

        # Validación de unicidad de email excluyendo al usuario en edición (se inyecta id_usuario_destino en contexto)
        id_usuario_destino = self.context.get('id_usuario_destino')
        email = attrs.get('email')
        if email:
            from users_app.selectors import email_existe_excluyendo_usuario
            if id_usuario_destino and email_existe_excluyendo_usuario(email, id_usuario_destino):
                raise serializers.ValidationError({"email": "El correo electrónico ya se encuentra registrado por otro usuario."})

        return attrs


class ModificarRolInputSerializer(serializers.Serializer):
    """
    CU-84: Aduana Administrativa para modificar nombre y/o descripción de un rol del sistema.
    """
    nombre = serializers.CharField(max_length=100, required=False, allow_blank=False)
    descripcion = serializers.CharField(max_length=1000, required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        nombre = attrs.get('nombre')
        descripcion = attrs.get('descripcion')

        if nombre is None and descripcion is None:
            raise serializers.ValidationError("Debe proporcionar al menos 'nombre' o 'descripcion' para modificar el rol.")

        if nombre:
            nombre_limpio = nombre.strip()
            if not nombre_limpio:
                raise serializers.ValidationError({"nombre": "El nombre del rol no puede estar vacío."})
            attrs['nombre'] = nombre_limpio

            # Verificar que no exista otro rol con ese mismo nombre
            from users_app.models import RolUsuario
            id_rol_actual = self.context.get('id_rol')
            qs_conflicto = RolUsuario.objects.filter(nombre_rol__iexact=nombre_limpio)
            if id_rol_actual:
                qs_conflicto = qs_conflicto.exclude(id_rol=id_rol_actual)

            if qs_conflicto.exists():
                raise serializers.ValidationError({"nombre": "Ya existe otro rol con ese nombre en el sistema."})

        return attrs


class RolUsuarioOutputSerializer(serializers.Serializer):
    """Estructura de salida para datos de RolUsuario."""
    id_rol = serializers.IntegerField()
    codigo = serializers.CharField()
    nombre_rol = serializers.CharField()
    descripcion = serializers.CharField(allow_null=True)
    usuarios_count = serializers.IntegerField(required=False, default=0)
