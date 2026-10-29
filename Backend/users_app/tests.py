from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from django.core import mail
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from users_app.models import Usuario, RolUsuario, PerfilUsuario, TokenSeguridad
from core_app.models import Notificacion
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

    @patch("users_app.services.id_token.verify_oauth2_token")
    def test_google_login_usuario_existente_no_sobrescribe_datos_personalizados(self, mock_verify):
        mock_verify.return_value = {
            "email": "lucas@test.com",
            "given_name": "Lucas",
            "family_name": "GoogleApellido",
            "picture": "https://google.com/otra_foto.jpg",
        }

        # 1. Crear el usuario inicialmente vía Google
        autenticar_con_google("fake_google_token_1")
        usuario = Usuario.objects.get(email="lucas@test.com")
        perfil = PerfilUsuario.objects.get(id_usuario=usuario)

        # 2. El usuario personaliza su nombre en 'Editar Perfil'
        perfil.nombre = "Lucas Juan"
        perfil.apellido = "Pérez"
        perfil.foto_perfil = "https://miservidor.com/mi_foto_custom.jpg"
        perfil.save()

        # 3. El usuario vuelve a iniciar sesión con Google
        resultado = autenticar_con_google("fake_google_token_2")

        # 4. Verificar que se mantuvieron intactos los datos personalizados
        perfil.refresh_from_db()
        self.assertEqual(perfil.nombre, "Lucas Juan")
        self.assertEqual(perfil.apellido, "Pérez")
        self.assertEqual(perfil.foto_perfil, "https://miservidor.com/mi_foto_custom.jpg")
        self.assertEqual(resultado["usuario"]["nombre"], "Lucas Juan")
        self.assertEqual(resultado["usuario"]["apellido"], "Pérez")
        self.assertEqual(resultado["usuario"]["foto_perfil"], "https://miservidor.com/mi_foto_custom.jpg")


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

    def test_despacho_codigo_registra_notificacion_enmascarada_en_core(self):
        """Verifica que al generar códigos OTP se cree el registro en Notificacion con el código enmascarado [******]."""
        # 1. Registro público genera código de ACTIVACION y persiste en Notificacion
        usuario = registrar_cuenta_publica(
            nombre="Enzo",
            apellido="Fernandez",
            email="enzo@test.com",
            dni="44332211",
            telefono="+5491177889900",
            contrasena="Chelsea2026!",
            captcha_token="valid_captcha"
        )
        token_activacion = TokenSeguridad.objects.get(id_usuario=usuario, tipo='ACTIVACION', utilizado=False)
        
        # Debe existir registro en Notificacion de core_app para este usuario
        notif_activacion = Notificacion.objects.filter(id_usuario=usuario, tipo='ACTIVACION').first()
        self.assertIsNotNone(notif_activacion)
        # El código real NO debe aparecer en el mensaje guardado en la base de datos
        self.assertNotIn(token_activacion.codigo, notif_activacion.mensaje)
        # El mensaje debe contener el enmascaramiento [******]
        self.assertIn("[******]", notif_activacion.mensaje)
        # La fecha de envío debe coincidir con la fecha actual
        self.assertEqual(notif_activacion.fecha_envio, timezone.now().date())

        # 2. Solicitud de código de RECUPERACION (CU-04 / CU-43)
        codigo_recuperacion = generar_token_seguridad(email="enzo@test.com")
        notif_recuperacion = Notificacion.objects.filter(id_usuario=usuario, tipo='RECUPERACION').first()
        self.assertIsNotNone(notif_recuperacion)
        # El código real alfanumérico NO debe figurar en texto plano en la tabla
        self.assertNotIn(codigo_recuperacion, notif_recuperacion.mensaje)
        self.assertIn("[******]", notif_recuperacion.mensaje)

    def test_marcado_leida_notificacion_al_validar_codigo(self):
        """Verifica que al validar código OTP (activación o recuperación) la última notificación pase a leida=True."""
        # 1. Crear usuario pendiente de activación
        usuario = registrar_cuenta_publica(
            nombre="Julián",
            apellido="Álvarez",
            email="spider@test.com",
            dni="48991122",
            telefono="+5491133221100",
            contrasena="Atletico2026!",
            captcha_token="valid_captcha"
        )
        token_act = TokenSeguridad.objects.get(id_usuario=usuario, tipo='ACTIVACION', utilizado=False)
        notif_act = Notificacion.objects.filter(id_usuario=usuario, tipo='ACTIVACION').order_by('-id_notificacion').first()
        
        self.assertIsNotNone(notif_act)
        self.assertFalse(notif_act.leida)  # Inicialmente no leída

        # Activar cuenta ingresando el código OTP
        verificar_y_activar_usuario(email="spider@test.com", codigo=token_act.codigo)
        notif_act.refresh_from_db()
        self.assertTrue(notif_act.leida)  # Debe pasar a leída

        # 2. Solicitar código de recuperación de contraseña
        codigo_rec = generar_token_seguridad(email="spider@test.com")
        notif_rec = Notificacion.objects.filter(id_usuario=usuario, tipo='RECUPERACION').order_by('-id_notificacion').first()
        
        self.assertIsNotNone(notif_rec)
        self.assertFalse(notif_rec.leida)  # Inicialmente no leída

        # Restablecer contraseña ingresando el token y nueva clave
        validar_y_restablecer_credencial(
            email="spider@test.com",
            token=codigo_rec,
            nueva_contrasena="NuevaClave2026!"
        )
        notif_rec.refresh_from_db()
        self.assertTrue(notif_rec.leida)  # Debe pasar a leída


class ModificarUsuarioAdminTestCase(TestCase):
    """Pruebas unitarias e integración para el CU-44: Modificar Usuario por Administrador."""

    def setUp(self):
        self.client = APIClient()

        # Roles necesarios
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Acceso total'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Taller'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Consumidor'}
        )

        # Usuario Administrador ejecutor
        self.admin_user = Usuario.objects.create(
            email='admin.mod@ifixpos.com',
            contrasena='hash_admin',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_admin,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.admin_user,
            nombre='Admin',
            apellido='Supremo',
            dni='11223344',
            telefono='+5491122334455'
        )

        # Usuario Cliente ejecutor (para probar acceso denegado)
        self.cliente_user = Usuario.objects.create(
            email='cliente.normal@ifixpos.com',
            contrasena='hash_cliente',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente_user,
            nombre='Cliente',
            apellido='Prueba',
            dni='22334455',
            telefono='+5491133445566'
        )

        # Usuario Objetivo a ser modificado
        self.target_user = Usuario.objects.create(
            email='tecnico.objetivo@ifixpos.com',
            contrasena='hash_antiguo',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_tecnico,
            is_active=True
        )
        self.target_perfil = PerfilUsuario.objects.create(
            id_usuario=self.target_user,
            nombre='Carlos',
            apellido='Gómez',
            dni='33445566',
            telefono='+5491144556677',
            telefono_alt='+5491199887766'
        )

    def test_modificar_usuario_admin_exitoso_con_cambio_rol_y_contrasena(self):
        """Un administrador puede modificar datos personales, rol y forzar nueva clave."""
        from django.contrib.auth.hashers import check_password
        from core_app.models import LogSistema

        self.client.force_authenticate(user=self.admin_user)
        payload = {
            "nombre": "Carlos Alberto",
            "apellido": "Gómez Pérez",
            "email": "carlos.nuevo@ifixpos.com",
            "rol_codigo": "CLIENTE",
            "telefono": "+5491155667788",
            "telefono_alt": "+5491188776655",
            "forzar_contrasena": "NuevaClaveSuperSegura2026!"
        }

        url = f"/api/users/{self.target_user.id_usuario}/admin-edit/"
        response = self.client.put(url, data=payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get('mensaje'), "Usuario actualizado correctamente.")

        # Verificar persistencia en base de datos
        self.target_user.refresh_from_db()
        self.target_perfil.refresh_from_db()

        self.assertEqual(self.target_user.email, "carlos.nuevo@ifixpos.com")
        self.assertEqual(self.target_user.id_rol.codigo, "CLIENTE")
        self.assertTrue(check_password("NuevaClaveSuperSegura2026!", self.target_user.contrasena))

        self.assertEqual(self.target_perfil.nombre, "Carlos Alberto")
        self.assertEqual(self.target_perfil.apellido, "Gómez Pérez")
        self.assertEqual(self.target_perfil.telefono, "+5491155667788")
        self.assertEqual(self.target_perfil.telefono_alt, "+5491188776655")

        # Verificar auditoría en LogSistema
        log = LogSistema.objects.filter(
            id_usuario=self.admin_user,
            accion__icontains="CU-44"
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn("Se forzó contraseña: Sí", log.detalle)

    def test_modificar_usuario_sin_forzar_contrasena(self):
        """Si no se ingresa contraseña para forzar, la clave previa se mantiene inalterada."""
        self.client.force_authenticate(user=self.admin_user)
        clave_previa = self.target_user.contrasena
        payload = {
            "nombre": "Carlos Solo Datos",
            "apellido": "Gómez",
            "email": "tecnico.objetivo@ifixpos.com",
            "rol_codigo": "TECNICO",
            "telefono": "+5491144556677"
        }

        url = f"/api/users/{self.target_user.id_usuario}/admin-edit/"
        response = self.client.put(url, data=payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.contrasena, clave_previa)

    def test_modificar_usuario_email_duplicado_rechaza(self):
        """No permite utilizar el email de otro usuario registrado."""
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            "nombre": "Carlos",
            "apellido": "Gómez",
            "email": self.admin_user.email,  # Ya en uso por el administrador
            "rol_codigo": "TECNICO"
        }

        url = f"/api/users/{self.target_user.id_usuario}/admin-edit/"
        response = self.client.put(url, data=payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", str(response.data))

    def test_modificar_usuario_rol_no_admin_denegado(self):
        """Un usuario que no sea Administrador recibe 403 Forbidden."""
        self.client.force_authenticate(user=self.cliente_user)
        payload = {
            "nombre": "Hacker",
            "apellido": "Intento",
            "email": "hacker@test.com",
            "rol_codigo": "ADMIN"
        }

        url = f"/api/users/{self.target_user.id_usuario}/admin-edit/"
        response = self.client.put(url, data=payload, format='json')

        self.assertEqual(response.status_code, 403)

    def test_modificar_usuario_forzar_contrasena_validaciones_estrictas(self):
        """Valida que la contraseña forzada requiera mín. 6 caracteres, 1 mayúscula y mín. 2 números."""
        self.client.force_authenticate(user=self.admin_user)
        url = f"/api/users/{self.target_user.id_usuario}/admin-edit/"
        base_payload = {
            "nombre": "Carlos",
            "apellido": "Gómez",
            "email": "tecnico.objetivo@ifixpos.com",
            "rol_codigo": "TECNICO"
        }

        # 1. Menos de 6 caracteres
        res1 = self.client.put(url, data={**base_payload, "forzar_contrasena": "Ab12"}, format='json')
        self.assertEqual(res1.status_code, 400)
        self.assertIn("6 caracteres", str(res1.data))

        # 2. Sin mayúscula
        res2 = self.client.put(url, data={**base_payload, "forzar_contrasena": "clave123"}, format='json')
        self.assertEqual(res2.status_code, 400)
        self.assertIn("mayúscula", str(res2.data))

        # 3. Con menos de 2 números (solo 1 número)
        res3 = self.client.put(url, data={**base_payload, "forzar_contrasena": "Clavesegura1"}, format='json')
        self.assertEqual(res3.status_code, 400)
        self.assertIn("2 caracteres numéricos", str(res3.data))

        # 4. Cumple todos los requisitos: >=6 caracteres, mayúscula y >=2 números
        res4 = self.client.put(url, data={**base_payload, "forzar_contrasena": "ClaveSegura12"}, format='json')
        self.assertEqual(res4.status_code, 200)


class ModificarRolTestCase(TestCase):
    """Pruebas unitarias e integración para el CU-84: Modificar Rol."""

    def setUp(self):
        self.client = APIClient()

        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Acceso total al sistema'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Personal técnico de reparación'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Consumidor y dueño de equipos'}
        )

        self.admin_user = Usuario.objects.create(
            email='admin.roles@ifixpos.com',
            contrasena='hash_admin',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_admin,
            is_active=True
        )

        self.cliente_user = Usuario.objects.create(
            email='cliente.roles@ifixpos.com',
            contrasena='hash_cliente',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_cliente,
            is_active=True
        )

    def test_modificar_rol_exitoso_nombre_y_descripcion(self):
        """Un administrador puede actualizar nombre y descripción de un rol existente."""
        from core_app.models import LogSistema

        self.client.force_authenticate(user=self.admin_user)
        payload = {
            "nombre": "Técnico Especialista",
            "descripcion": "Encargado de reparaciones complejas y diagnósticos avanzados"
        }

        url = f"/api/users/roles/{self.rol_tecnico.id_rol}/editar/"
        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("mensaje"), "Rol actualizado correctamente.")
        self.assertEqual(response.data.get("rol", {}).get("nombre_rol"), "Técnico Especialista")

        # Verificar en base de datos
        self.rol_tecnico.refresh_from_db()
        self.assertEqual(self.rol_tecnico.nombre_rol, "Técnico Especialista")
        self.assertEqual(self.rol_tecnico.descripcion, "Encargado de reparaciones complejas y diagnósticos avanzados")

        # Verificar LogSistema
        log = LogSistema.objects.filter(
            id_usuario=self.admin_user,
            accion__icontains="CU-84"
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn("Técnico Especialista", log.detalle)

    def test_modificar_rol_solo_descripcion(self):
        """Se puede modificar únicamente la descripción manteniendo el nombre."""
        self.client.force_authenticate(user=self.admin_user)
        nombre_original = self.rol_cliente.nombre_rol
        payload = {
            "descripcion": "Nueva descripción exclusiva de clientes frecuentes"
        }

        url = f"/api/users/roles/{self.rol_cliente.id_rol}/editar/"
        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.rol_cliente.refresh_from_db()
        self.assertEqual(self.rol_cliente.nombre_rol, nombre_original)
        self.assertEqual(self.rol_cliente.descripcion, "Nueva descripción exclusiva de clientes frecuentes")

    def test_modificar_rol_nombre_duplicado_rechaza(self):
        """No permite colocarle a un rol el nombre de otro rol preexistente."""
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            "nombre": self.rol_admin.nombre_rol  # "Administrador" ya existe
        }

        url = f"/api/users/roles/{self.rol_tecnico.id_rol}/editar/"
        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn("nombre", str(response.data))

    def test_modificar_rol_sin_campos_rechaza(self):
        """Enviar payload vacío sin nombre ni descripción es rechazado por la aduana."""
        self.client.force_authenticate(user=self.admin_user)
        payload = {}

        url = f"/api/users/roles/{self.rol_tecnico.id_rol}/editar/"
        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, 400)

    def test_modificar_rol_usuario_no_admin_denegado(self):
        """Un usuario que no sea Administrador recibe 403 Forbidden."""
        self.client.force_authenticate(user=self.cliente_user)
        payload = {
            "nombre": "Rol Hackeado"
        }

        url = f"/api/users/roles/{self.rol_tecnico.id_rol}/editar/"
        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, 403)

    def test_listar_roles_sistema_admin_exitoso(self):
        """Un administrador puede listar todos los roles del sistema con el conteo de usuarios."""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/users/roles/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(isinstance(response.data, list))
        self.assertGreaterEqual(len(response.data), 3)

    def test_filtrar_usuarios_combinado_sin_activo_por_defecto_retorna_todos(self):
        """Consultar /api/users/filtrar/ sin parámetros retorna usuarios activos e inactivos."""
        inactivo = Usuario.objects.create(
            email='inactivo.filtro@ifixpos.com',
            contrasena='hash',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_cliente,
            is_active=False
        )
        PerfilUsuario.objects.create(
            id_usuario=inactivo,
            nombre='Pedro',
            apellido='Inactivo',
            dni='55667788',
            telefono='+5491166778899'
        )
        self.client.force_authenticate(user=self.admin_user)
        res_todos = self.client.get("/api/users/filtrar/")
        self.assertEqual(res_todos.status_code, 200)
        emails = [u['email'] for u in res_todos.data]
        self.assertIn('inactivo.filtro@ifixpos.com', emails)
        self.assertIn('admin.roles@ifixpos.com', emails)

        # Filtrar específicamente inactivos
        res_inactivos = self.client.get("/api/users/filtrar/?activo=false&dni=55667788")
        self.assertEqual(res_inactivos.status_code, 200)
        self.assertEqual(len(res_inactivos.data), 1)
        self.assertEqual(res_inactivos.data[0]['email'], 'inactivo.filtro@ifixpos.com')
        self.assertFalse(res_inactivos.data[0]['is_active'])




