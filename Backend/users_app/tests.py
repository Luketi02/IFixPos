from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from django.core import mail
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from users_app.models import Usuario, RolUsuario, PerfilUsuario, TokenSeguridad
from users_app.serializers import (
    RegistroPublicoInputSerializer,
    CompletarOnboardingInputSerializer,
    ValidarCodigoInputSerializer,
)
from users_app.services import (
    autenticar_con_google,
    registrar_cuenta_publica,
    verificar_y_activar_usuario,
    autenticar_y_obtener_tokens,
    generar_token_seguridad,
    validar_y_restablecer_credencial,
    CredencialesInvalidasError,
)


class SerializerValidationTestCase(TestCase):
    """Pruebas unitarias para el Requerimiento 1: La Aduana (Serializadores)."""

    def test_registro_publico_validaciones_exitosas(self):
        data = {
            "nombre": "Juan",
            "apellido": "Pérez",
            "email": "juan.perez@test.com",
            "dni": "12345678",
            "telefono": "+5491112345678",
            "contrasena": "Password123!",
            "captcha_token": "valid_token",
            "telefono_alt": "01144556677",
        }
        serializer = RegistroPublicoInputSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_registro_publico_dni_invalido(self):
        # DNI con letras o puntos debe fallar
        data_letras = {
            "nombre": "Juan",
            "apellido": "Pérez",
            "email": "juan@test.com",
            "dni": "1234A567",
            "telefono": "+5491112345678",
            "contrasena": "Password123!",
            "captcha_token": "token",
        }
        serializer = RegistroPublicoInputSerializer(data=data_letras)
        self.assertFalse(serializer.is_valid())
        self.assertIn("dni", serializer.errors)

        data_puntos = data_letras.copy()
        data_puntos["dni"] = "12.345.678"
        serializer_puntos = RegistroPublicoInputSerializer(data=data_puntos)
        self.assertFalse(serializer_puntos.is_valid())
        self.assertIn("dni", serializer_puntos.errors)

    def test_registro_publico_telefono_invalido(self):
        # Teléfono con letras o de longitud inválida
        data = {
            "nombre": "Juan",
            "apellido": "Pérez",
            "email": "juan@test.com",
            "dni": "12345678",
            "telefono": "123",  # Demasiado corto
            "contrasena": "Password123!",
            "captcha_token": "token",
        }
        serializer = RegistroPublicoInputSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("telefono", serializer.errors)

    def test_registro_publico_email_invalido(self):
        data = {
            "nombre": "Juan",
            "apellido": "Pérez",
            "email": "correo_sin_arroba",
            "dni": "12345678",
            "telefono": "+5491112345678",
            "contrasena": "Password123!",
            "captcha_token": "token",
        }
        serializer = RegistroPublicoInputSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    def test_registro_publico_nombre_invalido_con_numeros(self):
        data = {
            "nombre": "Juan123",
            "apellido": "Pérez",
            "email": "juan@test.com",
            "dni": "12345678",
            "telefono": "+5491112345678",
            "contrasena": "Password123!",
            "captcha_token": "token",
        }
        serializer = RegistroPublicoInputSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("nombre", serializer.errors)

    def test_registro_publico_apellido_invalido_con_numeros(self):
        data = {
            "nombre": "Juan",
            "apellido": "2027",
            "email": "juan@test.com",
            "dni": "12345678",
            "telefono": "+5491112345678",
            "contrasena": "Password123!",
            "captcha_token": "token",
        }
        serializer = RegistroPublicoInputSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("apellido", serializer.errors)

    def test_completar_onboarding_validaciones(self):
        # DNI y Teléfono válidos
        serializer = CompletarOnboardingInputSerializer(data={"dni": "40123456", "telefono": "+5491199887766"})
        self.assertTrue(serializer.is_valid(), serializer.errors)

        # DNI inválido
        serializer_bad_dni = CompletarOnboardingInputSerializer(data={"dni": "40.123.456", "telefono": "1199887766"})
        self.assertFalse(serializer_bad_dni.is_valid())
        self.assertIn("dni", serializer_bad_dni.errors)

    def test_validar_codigo_otp_serializer(self):
        # 6 dígitos numéricos
        serializer = ValidarCodigoInputSerializer(data={"email": "usuario@test.com", "codigo": "123456"})
        self.assertTrue(serializer.is_valid(), serializer.errors)

        # Código de menos dígitos o con letras
        serializer_invalido = ValidarCodigoInputSerializer(data={"email": "usuario@test.com", "codigo": "12345"})
        self.assertFalse(serializer_invalido.is_valid())
        self.assertIn("codigo", serializer_invalido.errors)


class GoogleLoginTestCase(TestCase):
    """Pruebas unitarias para el Requerimiento 2: Captura de Datos en Google Login."""

    def setUp(self):
        self.rol_cliente = RolUsuario.objects.create(
            codigo="CLIENTE",
            nombre_rol="Cliente",
            descripcion="Rol Cliente"
        )

    @patch("users_app.services.id_token.verify_oauth2_token")
    def test_google_login_crea_perfil_con_datos(self, mock_verify):
        mock_verify.return_value = {
            "email": "googleuser@test.com",
            "given_name": "Marcos",
            "family_name": "Galperin",
            "picture": "https://lh3.googleusercontent.com/photo.jpg",
        }

        resultado = autenticar_con_google("fake_google_token")

        self.assertIn("tokens", resultado)
        usuario = Usuario.objects.get(email="googleuser@test.com")
        self.assertTrue(usuario.is_active)

        perfil = PerfilUsuario.objects.get(id_usuario=usuario)
        self.assertEqual(perfil.nombre, "Marcos")
        self.assertEqual(perfil.apellido, "Galperin")
        self.assertEqual(perfil.foto_perfil, "https://lh3.googleusercontent.com/photo.jpg")


class VerificacionCorreoOTPTestCase(TestCase):
    """Pruebas unitarias para el Requerimiento 3: Flujo OTP y activación de cuenta vía TokenSeguridad."""

    def setUp(self):
        self.rol_cliente = RolUsuario.objects.create(
            codigo="CLIENTE",
            nombre_rol="Cliente",
            descripcion="Rol Cliente"
        )
        self.client = APIClient()

    def test_registro_tradicional_crea_inactivo_y_despacha_correo(self):
        usuario = registrar_cuenta_publica(
            nombre="Carlos",
            apellido="Tevez",
            email="carlos.tevez@test.com",
            dni="32123456",
            telefono="+5491122334455",
            contrasena="BocaJrs2026!",
            captcha_token="valid_captcha"
        )

        # Usuario debe crearse inactivo
        self.assertFalse(usuario.is_active)

        # Debe existir un registro en TokenSeguridad de tipo ACTIVACION de 6 dígitos
        tokens = TokenSeguridad.objects.filter(id_usuario=usuario, tipo='ACTIVACION')
        self.assertEqual(tokens.count(), 1)
        token_obj = tokens.first()
        self.assertEqual(len(token_obj.codigo), 6)
        self.assertTrue(token_obj.codigo.isdigit())
        self.assertEqual(token_obj.tipo, 'ACTIVACION')
        self.assertFalse(token_obj.utilizado)

        # Debe haberse despachado el correo
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("carlos.tevez@test.com", mail.outbox[0].to)
        self.assertIn(token_obj.codigo, mail.outbox[0].body)

        # Intento de login previo a verificación debe fallar
        with self.assertRaises(CredencialesInvalidasError):
            autenticar_y_obtener_tokens("carlos.tevez@test.com", "BocaJrs2026!")

    def test_verificar_y_activar_usuario_exito(self):
        usuario = registrar_cuenta_publica(
            nombre="Lionel",
            apellido="Messi",
            email="leo.messi@test.com",
            dni="10101010",
            telefono="+5491199887766",
            contrasena="Campeon2022!",
            captcha_token="valid_captcha"
        )
        token_obj = TokenSeguridad.objects.get(id_usuario=usuario, tipo='ACTIVACION', utilizado=False)

        # Activación vía servicio
        resultado = verificar_y_activar_usuario(
            email="leo.messi@test.com",
            codigo=token_obj.codigo
        )

        self.assertIn("tokens", resultado)
        self.assertIn("access", resultado["tokens"])
        self.assertIn("refresh", resultado["tokens"])

        usuario.refresh_from_db()
        self.assertTrue(usuario.is_active)

        token_obj.refresh_from_db()
        self.assertTrue(token_obj.utilizado)

        # Ahora el login sí debe funcionar
        login_res = autenticar_y_obtener_tokens("leo.messi@test.com", "Campeon2022!")
        self.assertIn("tokens", login_res)

    def test_verificar_codigo_expirado_falla(self):
        usuario = registrar_cuenta_publica(
            nombre="Angel",
            apellido="Di Maria",
            email="angelito@test.com",
            dni="11111111",
            telefono="+5491122334455",
            contrasena="RosarioCentral!",
            captcha_token="valid_captcha"
        )
        token_obj = TokenSeguridad.objects.get(id_usuario=usuario, tipo='ACTIVACION', utilizado=False)
        # Simular expiración retrocediendo la fecha
        token_obj.fecha_expiracion = timezone.now() - timedelta(minutes=1)
        token_obj.save()

        with self.assertRaises(ValidationError):
            verificar_y_activar_usuario(email="angelito@test.com", codigo=token_obj.codigo)

        usuario.refresh_from_db()
        self.assertFalse(usuario.is_active)

    def test_endpoint_api_verificar_correo(self):
        usuario = registrar_cuenta_publica(
            nombre="Emiliano",
            apellido="Martinez",
            email="dibu@test.com",
            dni="23232323",
            telefono="+5491155443322",
            contrasena="AstonVilla23!",
            captcha_token="valid_captcha"
        )
        token_obj = TokenSeguridad.objects.get(id_usuario=usuario, tipo='ACTIVACION', utilizado=False)

        # Llamada POST a /api/auth/verificar-correo/
        response = self.client.post(
            "/api/auth/verificar-correo/",
            {"email": "dibu@test.com", "codigo": token_obj.codigo},
            format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("tokens", response.data)
        self.assertIn("access", response.data["tokens"])

        usuario.refresh_from_db()
        self.assertTrue(usuario.is_active)

    def test_segregacion_tipos_token(self):
        """Verifica que un token de recuperación no sirva para activar y viceversa."""
        usuario = registrar_cuenta_publica(
            nombre="Lautaro",
            apellido="Martinez",
            email="toro@test.com",
            dni="22222222",
            telefono="+5491133445566",
            contrasena="InterMilano!",
            captcha_token="valid_captcha"
        )
        # Token de activación generado por registrar_cuenta_publica
        token_activacion = TokenSeguridad.objects.get(id_usuario=usuario, tipo='ACTIVACION', utilizado=False)

        # Intentar restablecer clave usando el código de activación debe fallar
        with self.assertRaises(ValidationError):
            validar_y_restablecer_credencial(
                email="toro@test.com",
                token=token_activacion.codigo,
                nueva_contrasena="NuevaClave123!"
            )

        # Generar token de recuperación
        codigo_recuperacion = generar_token_seguridad(email="toro@test.com")
        token_rec = TokenSeguridad.objects.get(id_usuario=usuario, tipo='RECUPERACION', utilizado=False)
        self.assertEqual(token_rec.codigo, codigo_recuperacion)

        # Intentar activar cuenta usando el código de recuperación debe fallar
        with self.assertRaises(ValidationError):
            verificar_y_activar_usuario(
                email="toro@test.com",
                codigo=codigo_recuperacion
            )

    def test_reintento_registro_cuenta_inactiva_actualiza_datos_y_reenvia_otp(self):
        # 1. Primer registro con datos iniciales (ej: teléfono erróneo)
        usuario_inicial = registrar_cuenta_publica(
            nombre="Julian",
            apellido="Alvarez",
            email="arana@test.com",
            dni="99887766",
            telefono="+5491111111111",
            contrasena="RiverPlate9!",
            captcha_token="valid_captcha"
        )
        self.assertFalse(usuario_inicial.is_active)
        perfil_inicial = PerfilUsuario.objects.get(id_usuario=usuario_inicial)
        self.assertEqual(perfil_inicial.telefono, "+5491111111111")
        primer_token = TokenSeguridad.objects.get(id_usuario=usuario_inicial, tipo='ACTIVACION', utilizado=False)

        # 2. Reintento de registro con el mismo correo pero con datos corregidos (ej: teléfono nuevo)
        usuario_actualizado = registrar_cuenta_publica(
            nombre="Julian",
            apellido="Alvarez",
            email="arana@test.com",
            dni="99887766",
            telefono="+5491199999999",  # Teléfono corregido
            contrasena="RiverPlate9!",
            captcha_token="valid_captcha"
        )

        # Debe ser el mismo registro de usuario en BD
        self.assertEqual(usuario_inicial.id_usuario, usuario_actualizado.id_usuario)
        self.assertFalse(usuario_actualizado.is_active)

        # PerfilUsuario debe haber actualizado el teléfono
        perfil_actualizado = PerfilUsuario.objects.get(id_usuario=usuario_actualizado)
        self.assertEqual(perfil_actualizado.telefono, "+5491199999999")

        # El primer token debe haber sido invalidado
        primer_token.refresh_from_db()
        self.assertTrue(primer_token.utilizado)

        # Debe existir un nuevo token de activación vigente
        nuevo_token = TokenSeguridad.objects.get(id_usuario=usuario_actualizado, tipo='ACTIVACION', utilizado=False)
        self.assertNotEqual(primer_token.codigo, nuevo_token.codigo)

        # Si el usuario ya está activo, un nuevo intento debe ser rechazado
        usuario_actualizado.is_active = True
        usuario_actualizado.save()
        with self.assertRaises(ValidationError):
            registrar_cuenta_publica(
                nombre="Julian",
                apellido="Alvarez",
                email="arana@test.com",
                dni="99887766",
                telefono="+5491199999999",
                contrasena="RiverPlate9!",
                captcha_token="valid_captcha"
            )


