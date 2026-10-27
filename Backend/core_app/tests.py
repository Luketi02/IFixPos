from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from datetime import date

from core_app.models import ConfiguracionSistema, LogSistema
from core_app.selectors import obtener_todas_las_configuraciones
from core_app.serializers import ConfiguracionUpdateInputSerializer
from core_app.services import actualizar_configuracion_global
from users_app.models import Usuario, RolUsuario


class ConfiguracionGlobalTests(TestCase):
    """
    Pruebas unitarias y de integración para el Caso de Uso CU-42:
    Gestionar Configuración Global del Sistema (core_app).
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Rol con privilegios totales.'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Cliente del sistema.'
        )

        # Usuarios
        self.admin_user = Usuario.objects.create(
            email='admin@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_admin,
            is_active=True
        )
        self.cliente_user = Usuario.objects.create(
            email='cliente@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )

        # Configuraciones base
        self.config_max_login = ConfiguracionSistema.objects.create(
            clave='maxIntentosLogin',
            descripcion='Intentos máximos de login',
            valor='10'
        )
        self.config_tamano = ConfiguracionSistema.objects.create(
            clave='tamanoMaxArchivoMB',
            descripcion='Tamaño máximo archivo en MB',
            valor='10'
        )
        self.config_desc = ConfiguracionSistema.objects.create(
            clave='porcentajeDescuentoMaximo',
            descripcion='Descuento máximo',
            valor='5.0'
        )

        # Pesos algoritmo de abastecimiento (suman 100)
        self.p_conf = ConfiguracionSistema.objects.create(clave='pesoEvaluacion_Confiabilidad', descripcion='Confiabilidad', valor='20')
        self.p_tiem = ConfiguracionSistema.objects.create(clave='pesoEvaluacion_Tiempo', descripcion='Tiempo', valor='20')
        self.p_nive = ConfiguracionSistema.objects.create(clave='pesoEvaluacion_Nivel', descripcion='Nivel', valor='20')
        self.p_econ = ConfiguracionSistema.objects.create(clave='pesoEvaluacion_Economico', descripcion='Económico', valor='20')
        self.p_envi = ConfiguracionSistema.objects.create(clave='pesoEvaluacion_Envio', descripcion='Envío', valor='20')

    def test_selector_obtener_todas_las_configuraciones(self):
        """El selector debe retornar un diccionario simple {clave: valor}."""
        configuraciones = obtener_todas_las_configuraciones()
        self.assertIsInstance(configuraciones, dict)
        self.assertEqual(configuraciones.get('maxIntentosLogin'), '10')
        self.assertEqual(configuraciones.get('pesoEvaluacion_Confiabilidad'), '20')

    def test_serializer_validacion_numerica_letras_falla(self):
        """Debe fallar si se proporcionan letras en campos que requieren números."""
        datos = {'maxIntentosLogin': 'diez'}
        serializer = ConfiguracionUpdateInputSerializer(data=datos)
        self.assertFalse(serializer.is_valid())
        self.assertIn('maxIntentosLogin', str(serializer.errors))

    def test_serializer_validacion_descuento_invalido(self):
        """Debe fallar si porcentajeDescuentoMaximo es menor a 0 o mayor a 100."""
        datos_negativo = {'porcentajeDescuentoMaximo': '-5'}
        serializer1 = ConfiguracionUpdateInputSerializer(data=datos_negativo)
        self.assertFalse(serializer1.is_valid())

        datos_exceso = {'porcentajeDescuentoMaximo': '150'}
        serializer2 = ConfiguracionUpdateInputSerializer(data=datos_exceso)
        self.assertFalse(serializer2.is_valid())

    def test_serializer_validacion_pesos_algoritmo_suma_100(self):
        """La suma de los 5 pesos del algoritmo debe ser exactamente 100%."""
        datos_suma_invalida = {
            'pesoEvaluacion_Confiabilidad': 30,
            'pesoEvaluacion_Tiempo': 20,
            'pesoEvaluacion_Nivel': 20,
            'pesoEvaluacion_Economico': 20,
            'pesoEvaluacion_Envio': 20  # Suma 110
        }
        serializer_invalido = ConfiguracionUpdateInputSerializer(data=datos_suma_invalida)
        self.assertFalse(serializer_invalido.is_valid())

        datos_suma_valida = {
            'pesoEvaluacion_Confiabilidad': 30,
            'pesoEvaluacion_Tiempo': 20,
            'pesoEvaluacion_Nivel': 20,
            'pesoEvaluacion_Economico': 15,
            'pesoEvaluacion_Envio': 15  # Suma 100
        }
        serializer_valido = ConfiguracionUpdateInputSerializer(data=datos_suma_valida)
        self.assertTrue(serializer_valido.is_valid())

    def test_servicio_actualizar_configuracion_y_auditoria(self):
        """El servicio debe actualizar valores en BD y generar log de auditoría."""
        datos_actualizar = {
            'maxIntentosLogin': '5',
            'tamanoMaxArchivoMB': '15'
        }
        resultado = actualizar_configuracion_global(
            usuario_admin=self.admin_user,
            datos_validados=datos_actualizar
        )

        self.config_max_login.refresh_from_db()
        self.config_tamano.refresh_from_db()

        self.assertEqual(self.config_max_login.valor, '5')
        self.assertEqual(self.config_tamano.valor, '15')
        self.assertIsNotNone(self.config_max_login.ultima_modif)

        # Verificar auditoría en LogSistema
        log = LogSistema.objects.filter(accion="Actualización de Configuración Global del Sistema").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.tipo, "AUDITORIA_SISTEMA")
        self.assertEqual(log.modulo_origen, "core_app")
        self.assertEqual(log.tabla_afectada, "configuracion_sistema")
        self.assertEqual(log.id_usuario, self.admin_user)
        self.assertIn("maxIntentosLogin", log.detalle)

    def test_api_acceso_denegado_sin_autenticacion(self):
        """Peticiones no autenticadas deben ser rechazadas (401 o 403 según DRF)."""
        response = self.client.get('/api/core/configuraciones/')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_api_acceso_denegado_para_no_admin(self):
        """Usuarios sin rol ADMIN deben recibir 403 Forbidden."""
        self.client.force_authenticate(user=self.cliente_user)
        response_get = self.client.get('/api/core/configuraciones/')
        self.assertEqual(response_get.status_code, status.HTTP_403_FORBIDDEN)

        response_put = self.client.put('/api/core/configuraciones/', {'maxIntentosLogin': 5}, format='json')
        self.assertEqual(response_put.status_code, status.HTTP_403_FORBIDDEN)

    def test_api_admin_get_y_put_exitosos(self):
        """Un Administrador puede consultar (GET) y actualizar (PUT) parámetros globales."""
        self.client.force_authenticate(user=self.admin_user)

        # 1. GET
        response_get = self.client.get('/api/core/configuraciones/')
        self.assertEqual(response_get.status_code, status.HTTP_200_OK)
        self.assertEqual(response_get.data.get('maxIntentosLogin'), '10')

        # 2. PUT
        payload = {
            'maxIntentosLogin': 8,
            'porcentajeDescuentoMaximo': 12.5,
            'pesoEvaluacion_Confiabilidad': 25,
            'pesoEvaluacion_Tiempo': 25,
            'pesoEvaluacion_Nivel': 20,
            'pesoEvaluacion_Economico': 15,
            'pesoEvaluacion_Envio': 15
        }
        response_put = self.client.put('/api/core/configuraciones/', payload, format='json')
        self.assertEqual(response_put.status_code, status.HTTP_200_OK)

        self.config_max_login.refresh_from_db()
        self.assertEqual(self.config_max_login.valor, '8')

    def test_modificacion_multiples_parametros_persiste_en_bd(self):
        """Verifica que modificar parámetros institucionales y booleanos persiste en BD."""
        self.client.force_authenticate(user=self.admin_user)

        # Crear configuraciones institucionales y de auditoría
        conf_email = ConfiguracionSistema.objects.create(clave='emailLocal', valor='contacto@empresa.com')
        conf_backup = ConfiguracionSistema.objects.create(clave='backupAutomatico', valor='False')
        conf_log_sec = ConfiguracionSistema.objects.create(clave='log_seguridad_accesos', valor='False')
        conf_cuil = ConfiguracionSistema.objects.create(clave='cuilLocal', valor='00-00000000-0')

        payload = {
            'emailLocal': 'soporte_nuevo@ifixpos.com',
            'backupAutomatico': True,
            'log_seguridad_accesos': 'True',
            'cuilLocal': '30-98765432-1',
            # Mantener pesos válidos
            'pesoEvaluacion_Confiabilidad': 20,
            'pesoEvaluacion_Tiempo': 20,
            'pesoEvaluacion_Nivel': 20,
            'pesoEvaluacion_Economico': 20,
            'pesoEvaluacion_Envio': 20
        }

        response = self.client.put('/api/core/configuraciones/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Confirmar persistencia en base de datos
        conf_email.refresh_from_db()
        conf_backup.refresh_from_db()
        conf_log_sec.refresh_from_db()
        conf_cuil.refresh_from_db()

        self.assertEqual(conf_email.valor, 'soporte_nuevo@ifixpos.com')
        self.assertEqual(conf_backup.valor, 'True')
        self.assertEqual(conf_log_sec.valor, 'True')
        self.assertEqual(conf_cuil.valor, '30-98765432-1')


# ==============================================================================
# GESTIÓN DE NOTIFICACIONES (LA CAMPANITA) - TESTS
# ==============================================================================

class GestionNotificacionesTests(TestCase):
    """
    Pruebas unitarias y de integración para la Gestión de Notificaciones (La Campanita).
    Verifica selectores con seguridad horizontal, contadores, serializadores,
    servicios transaccionales y endpoints HTTP protegidos.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Cliente del sistema.'
        )

        # Usuarios
        self.usuario_a = Usuario.objects.create(
            email='usuario_a@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.usuario_b = Usuario.objects.create(
            email='usuario_b@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )

        # Importar modelos y selectores necesarios
        from core_app.models import Notificacion
        self.Notificacion = Notificacion

        # Notificaciones Usuario A (2 no leídas, 1 leída)
        self.notif_a1 = Notificacion.objects.create(
            id_usuario=self.usuario_a,
            mensaje='Su dispositivo ingresó a taller.',
            tipo='ESTADO_REPARACION',
            fecha_envio=date(2026, 10, 15),
            leida=False
        )
        self.notif_a2 = Notificacion.objects.create(
            id_usuario=self.usuario_a,
            mensaje='Diagnóstico técnico completado.',
            tipo='DIAGNOSTICO_LISTO',
            fecha_envio=date(2026, 10, 16),
            leida=False
        )
        self.notif_a3 = Notificacion.objects.create(
            id_usuario=self.usuario_a,
            mensaje='Reparación finalizada con éxito.',
            tipo='REPARACION_FINALIZADA',
            fecha_envio=date(2026, 10, 17),
            leida=True
        )

        # Notificación Usuario B
        self.notif_b1 = Notificacion.objects.create(
            id_usuario=self.usuario_b,
            mensaje='Bienvenido a IFixPos.',
            tipo='BIENVENIDA',
            fecha_envio=date(2026, 10, 18),
            leida=False
        )

    # 1. PRUEBAS DE SELECTORES
    def test_selector_obtener_notificaciones_usuario_seguridad_horizontal_y_orden(self):
        """El selector debe retornar únicamente las notificaciones del usuario ordenadas desc."""
        from core_app.selectors import obtener_notificaciones_usuario
        notifs = obtener_notificaciones_usuario(usuario=self.usuario_a)
        self.assertEqual(notifs.count(), 3)
        # Verificar que no incluye la del usuario B
        self.assertNotIn(self.notif_b1, notifs)
        # Verificar orden: fecha más reciente primero (a3: 17/10, a2: 16/10, a1: 15/10)
        lista_ids = list(notifs.values_list('id_notificacion', flat=True))
        self.assertEqual(lista_ids, [self.notif_a3.id_notificacion, self.notif_a2.id_notificacion, self.notif_a1.id_notificacion])

    def test_selector_contar_notificaciones_no_leidas(self):
        """Retorna la cantidad exacta de alertas con leida=False para el usuario."""
        from core_app.selectors import contar_notificaciones_no_leidas
        count_a = contar_notificaciones_no_leidas(usuario=self.usuario_a)
        self.assertEqual(count_a, 2)
        count_b = contar_notificaciones_no_leidas(usuario=self.usuario_b)
        self.assertEqual(count_b, 1)

    def test_selector_obtener_notificacion_usuario_legitima(self):
        """Recupera la notificación específica si pertenece al usuario solicitante."""
        from core_app.selectors import obtener_notificacion_usuario
        notif = obtener_notificacion_usuario(usuario=self.usuario_a, id_notificacion=self.notif_a1.id_notificacion)
        self.assertEqual(notif.id_notificacion, self.notif_a1.id_notificacion)

    def test_selector_obtener_notificacion_usuario_ajena_levanta_permission_denied(self):
        """Levanta PermissionDenied si el usuario intenta acceder a una notificación de otro usuario."""
        from rest_framework.exceptions import PermissionDenied
        from core_app.selectors import obtener_notificacion_usuario
        with self.assertRaises(PermissionDenied):
            obtener_notificacion_usuario(usuario=self.usuario_a, id_notificacion=self.notif_b1.id_notificacion)

    def test_selector_obtener_notificacion_inexistente_levanta_object_does_not_exist(self):
        """Levanta ObjectDoesNotExist si la notificación no existe en la BD."""
        from django.core.exceptions import ObjectDoesNotExist
        from core_app.selectors import obtener_notificacion_usuario
        with self.assertRaises(ObjectDoesNotExist):
            obtener_notificacion_usuario(usuario=self.usuario_a, id_notificacion=999999)

    # 2. PRUEBAS DE SERIALIZADOR
    def test_serializer_notificacion_output(self):
        """El serializador debe exponer los campos clave solicitados."""
        from core_app.serializers import NotificacionOutputSerializer
        serializer = NotificacionOutputSerializer(self.notif_a1)
        data = serializer.data
        self.assertEqual(data['id_notificacion'], self.notif_a1.id_notificacion)
        self.assertEqual(data['mensaje'], self.notif_a1.mensaje)
        self.assertEqual(data['tipo'], self.notif_a1.tipo)
        self.assertEqual(data['leida'], False)
        self.assertIn('fecha_envio', data)
        self.assertIn('id_dispositivo', data)
        self.assertIn('id_beneficio', data)

    # 3. PRUEBAS DE SERVICIOS
    def test_servicio_marcar_notificacion_leida(self):
        """El servicio actualiza leida=True y persiste el cambio."""
        from core_app.services import marcar_notificacion_leida
        self.assertFalse(self.notif_a1.leida)
        notif_actualizada = marcar_notificacion_leida(usuario=self.usuario_a, id_notificacion=self.notif_a1.id_notificacion)
        self.assertTrue(notif_actualizada.leida)
        self.notif_a1.refresh_from_db()
        self.assertTrue(self.notif_a1.leida)

    def test_servicio_marcar_todas_notificaciones_leidas(self):
        """Marca masivamente todas las no leídas del usuario y no afecta a otros usuarios."""
        from core_app.services import marcar_todas_notificaciones_leidas
        from core_app.selectors import contar_notificaciones_no_leidas
        total_actualizadas = marcar_todas_notificaciones_leidas(usuario=self.usuario_a)
        self.assertEqual(total_actualizadas, 2)
        # Confirmar que en A ahora son 0 no leídas
        self.assertEqual(contar_notificaciones_no_leidas(usuario=self.usuario_a), 0)
        # Confirmar que B sigue teniendo 1 no leída
        self.assertEqual(contar_notificaciones_no_leidas(usuario=self.usuario_b), 1)

    # 4. PRUEBAS DE ENDPOINTS HTTP
    def test_api_listar_notificaciones_requiere_autenticacion(self):
        """GET /api/core/notificaciones/ responde 401 o 403 si no está autenticado."""
        response = self.client.get('/api/core/notificaciones/')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_api_listar_notificaciones_exitoso(self):
        """GET /api/core/notificaciones/ responde 200 con no_leidas_count y array de notificaciones."""
        self.client.force_authenticate(user=self.usuario_a)
        response = self.client.get('/api/core/notificaciones/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('no_leidas_count', response.data)
        self.assertIn('notificaciones', response.data)
        self.assertEqual(response.data['no_leidas_count'], 2)
        self.assertEqual(len(response.data['notificaciones']), 3)

    def test_api_marcar_notificacion_leida_exitoso(self):
        """PATCH /api/core/notificaciones/<id>/leer/ marca la notificación y responde 200."""
        self.client.force_authenticate(user=self.usuario_a)
        url = f'/api/core/notificaciones/{self.notif_a1.id_notificacion}/leer/'
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.notif_a1.refresh_from_db()
        self.assertTrue(self.notif_a1.leida)

    def test_api_marcar_notificacion_ajena_responde_403(self):
        """PATCH sobre notificación de otro usuario responde 403 Forbidden."""
        self.client.force_authenticate(user=self.usuario_a)
        url = f'/api/core/notificaciones/{self.notif_b1.id_notificacion}/leer/'
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_api_marcar_notificacion_inexistente_responde_404(self):
        """PATCH sobre ID inexistente responde 404 Not Found."""
        self.client.force_authenticate(user=self.usuario_a)
        url = '/api/core/notificaciones/999999/leer/'
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_api_marcar_todas_leidas_exitoso(self):
        """PATCH /api/core/notificaciones/leer-todas/ marca todas las alertas y responde 200."""
        from core_app.selectors import contar_notificaciones_no_leidas
        self.client.force_authenticate(user=self.usuario_a)
        response = self.client.patch('/api/core/notificaciones/leer-todas/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('actualizadas'), 2)
        self.assertEqual(contar_notificaciones_no_leidas(usuario=self.usuario_a), 0)

    def test_selector_excluye_codigos_y_verificaciones_por_correo(self):
        """Las notificaciones de tipo ACTIVACION, RECUPERACION u OTP no deben aparecer en la campanita."""
        from core_app.selectors import obtener_notificaciones_usuario, contar_notificaciones_no_leidas
        from core_app.models import Notificacion

        # Crear notificación de código OTP
        notif_otp = Notificacion.objects.create(
            id_usuario=self.usuario_a,
            mensaje='Su código de verificación es [******]',
            tipo='ACTIVACION',
            fecha_envio=date.today(),
            leida=False
        )

        notifs = obtener_notificaciones_usuario(usuario=self.usuario_a)
        self.assertNotIn(notif_otp, notifs)

        # El contador tampoco debe computar notificaciones de código
        count = contar_notificaciones_no_leidas(usuario=self.usuario_a)
        self.assertEqual(count, 2)

    def test_api_eliminar_notificacion_exitoso(self):
        """DELETE /api/core/notificaciones/<id>/eliminar/ elimina la notificación y responde 200."""
        self.client.force_authenticate(user=self.usuario_a)
        url = f'/api/core/notificaciones/{self.notif_a1.id_notificacion}/eliminar/'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        from core_app.models import Notificacion
        self.assertFalse(Notificacion.objects.filter(pk=self.notif_a1.id_notificacion).exists())

    def test_api_eliminar_todas_notificaciones_exitoso(self):
        """DELETE /api/core/notificaciones/eliminar-todas/ elimina todas las alertas del usuario."""
        self.client.force_authenticate(user=self.usuario_a)
        response = self.client.delete('/api/core/notificaciones/eliminar-todas/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        from core_app.selectors import obtener_notificaciones_usuario
        self.assertEqual(obtener_notificaciones_usuario(usuario=self.usuario_a).count(), 0)

    def test_serializador_notificacion_expone_datos_dispositivo_y_url_reparacion(self):
        """Valida que NotificacionOutputSerializer exponga id_reparacion, datos_dispositivo y url_destino."""
        from catalog_app.models import Marca, ModeloDispositivo, TipoDispositivo
        from workshop_app.models import Dispositivo, Reparacion
        from core_app.serializers import NotificacionOutputSerializer
        from core_app.models import Notificacion

        tipo = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        marca = Marca.objects.create(nombre='Samsung', estado_activo=True)
        modelo = ModeloDispositivo.objects.create(nombre='Galaxy S23', id_marca=marca, id_tipo_dispositivo=tipo, estado_activo=True)
        dispositivo = Dispositivo.objects.create(
            id_modelo=modelo,
            id_usuario=self.usuario_a,
            numero_serie='S23-TEST-99',
            fecha_registro=date.today()
        )
        reparacion = Reparacion.objects.create(
            fecha_inicio=date.today(),
            etapa='EN_REPARACION',
            id_dispositivo=dispositivo,
            id_usuario=self.usuario_a,
            desc_cliente='Pantalla rota'
        )

        notif = Notificacion.objects.create(
            id_usuario=self.usuario_a,
            mensaje=f'El estado de su reparación #{reparacion.id_reparacion} ha cambiado a En Reparación.',
            tipo='CAMBIO_ESTADO_REPARACION',
            fecha_envio=date.today(),
            leida=False,
            id_dispositivo=dispositivo
        )

        serializer = NotificacionOutputSerializer(notif)
        data = serializer.data

        self.assertEqual(data['id_reparacion'], reparacion.id_reparacion)
        self.assertIsNotNone(data['datos_dispositivo'])
        self.assertEqual(data['datos_dispositivo']['marca'], 'Samsung')
        self.assertEqual(data['datos_dispositivo']['modelo'], 'Galaxy S23')
        self.assertEqual(data['datos_dispositivo']['tipo'], 'Smartphone')
        self.assertEqual(data['datos_dispositivo']['numero_serie'], 'S23-TEST-99')
        self.assertEqual(data['datos_dispositivo']['estado_reparacion'], 'EN_REPARACION')
        self.assertEqual(data['url_destino'], f'/cliente/reparaciones/{reparacion.id_reparacion}')

    def test_selector_obtener_url_frontend_fallback_y_custom(self):
        """Valida que obtener_url_frontend retorna la URL base sin slash al final."""
        from core_app.selectors import obtener_url_frontend
        url_defecto = obtener_url_frontend()
        self.assertTrue(url_defecto.startswith('http'))
        self.assertFalse(url_defecto.endswith('/'))


# ==============================================================================
# CU-22 & CU-23: PRUEBAS PARA COPIAS DE SEGURIDAD Y RESTAURACIÓN
# ==============================================================================

class CopiasSeguridadYRestauracionTests(TestCase):
    """
    Pruebas integrales de arquitectura HackSoftware para:
    - CU-22: Realizar Copia de Seguridad
    - CU-23: Restaurar Copia de Seguridad
    """

    def setUp(self):
        import os
        from django.contrib.auth.hashers import make_password
        from django.core.cache import cache
        from users_app.models import Usuario, RolUsuario, PerfilUsuario

        self.client = APIClient()
        cache.clear()

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol admin'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol cliente'}
        )

        # Usuario Administrador
        self.raw_password = 'AdminPassword123!'
        self.admin = Usuario.objects.create(
            email='admin_backup@test.com',
            contrasena=make_password(self.raw_password),
            fecha_registro=date.today(),
            id_rol=self.rol_admin,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.admin,
            nombre='Admin',
            apellido='Supremo',
            dni='11223344'
        )

        # Usuario Cliente
        self.cliente = Usuario.objects.create(
            email='cliente_backup@test.com',
            contrasena=make_password('ClientPass123!'),
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )

        self.archivos_creados = []

    def tearDown(self):
        import os
        from django.core.cache import cache
        cache.clear()
        for ruta in self.archivos_creados:
            if os.path.exists(ruta):
                try:
                    os.remove(ruta)
                except OSError:
                    pass

    def test_servicio_generar_copia_seguridad_manual(self):
        """CU-22: Verifica la generación de archivo físico, registro y auditoría."""
        import os
        from core_app.services import generar_copia_seguridad_manual
        from core_app.models import CopiaSeguridad, LogSistema, Notificacion

        copia = generar_copia_seguridad_manual(usuario_admin=self.admin, version="2.5.0")
        self.archivos_creados.append(copia.ubicacion_archivo)

        self.assertIsInstance(copia, CopiaSeguridad)
        self.assertFalse(copia.automatico)
        self.assertEqual(copia.version, "2.5.0")
        self.assertEqual(copia.id_usuario, self.admin)
        self.assertTrue(os.path.exists(copia.ubicacion_archivo))
        self.assertGreater(os.path.getsize(copia.ubicacion_archivo), 0)

        # Verificar LogSistema
        log = LogSistema.objects.filter(
            accion="Generar Copia de Seguridad Manual",
            id_registro_afectado=str(copia.id_backup)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.id_usuario, self.admin)

        # Verificar Notificacion enviada
        notif = Notificacion.objects.filter(
            id_usuario=self.admin,
            tipo="BACKUP"
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn("resguardado", notif.mensaje.lower())

    def test_selectores_listar_y_obtener_copia_seguridad(self):
        """CU-22/CU-23: Verifica lectura, orden descendente y validación de existencia física."""
        import os
        from rest_framework.exceptions import NotFound, ValidationError
        from core_app.services import generar_copia_seguridad_manual
        from core_app.selectors import listar_copias_seguridad, obtener_copia_seguridad
        from core_app.models import CopiaSeguridad

        copia1 = generar_copia_seguridad_manual(usuario_admin=self.admin, version="1.0.0")
        copia2 = generar_copia_seguridad_manual(usuario_admin=self.admin, version="1.1.0")
        self.archivos_creados.extend([copia1.ubicacion_archivo, copia2.ubicacion_archivo])

        # Listar
        qs = listar_copias_seguridad()
        self.assertGreaterEqual(qs.count(), 2)
        self.assertEqual(qs.first().id_backup, copia2.id_backup)

        # Obtener válida
        recuperada = obtener_copia_seguridad(copia1.id_backup)
        self.assertEqual(recuperada.id_backup, copia1.id_backup)

        # 404 si no existe
        with self.assertRaises(NotFound):
            obtener_copia_seguridad(999999)

        # ValidationError si el archivo físico no existe
        copia_fantasma = CopiaSeguridad.objects.create(
            fecha_creacion=date.today(),
            automatico=False,
            ubicacion_archivo="/ruta/inexistente/backup_fantasma.sql",
            version="1.0.0",
            id_usuario=self.admin
        )
        with self.assertRaises(ValidationError):
            obtener_copia_seguridad(copia_fantasma.id_backup)

    def test_servicio_solicitar_token_restauracion(self):
        """CU-23: Generación de OTP en caché de 6 dígitos y notificación."""
        from django.core.cache import cache
        from core_app.services import generar_copia_seguridad_manual, solicitar_token_restauracion
        from core_app.models import LogSistema, Notificacion

        copia = generar_copia_seguridad_manual(usuario_admin=self.admin)
        self.archivos_creados.append(copia.ubicacion_archivo)

        otp = solicitar_token_restauracion(usuario_admin=self.admin, id_backup=copia.id_backup)
        self.assertEqual(len(otp), 6)
        self.assertTrue(otp.isdigit())

        # Verificar en caché
        cache_key = f"otp_restore_{self.admin.id_usuario}_{copia.id_backup}"
        self.assertEqual(cache.get(cache_key), otp)

        # Verificar LogSistema
        log = LogSistema.objects.filter(accion="Solicitud de Token de Restauración").first()
        self.assertIsNotNone(log)

        # Verificar Notificacion OTP
        notif = Notificacion.objects.filter(id_usuario=self.admin, tipo="OTP").first()
        self.assertIsNotNone(notif)

    def test_servicio_ejecutar_restauracion_sistema_exito(self):
        """CU-23: Restauración exitosa con contraseña y OTP válidos."""
        from django.core.cache import cache
        from core_app.services import (
            generar_copia_seguridad_manual,
            solicitar_token_restauracion,
            ejecutar_restauracion_sistema
        )
        from core_app.models import LogSistema

        copia = generar_copia_seguridad_manual(usuario_admin=self.admin)
        self.archivos_creados.append(copia.ubicacion_archivo)

        otp = solicitar_token_restauracion(usuario_admin=self.admin, id_backup=copia.id_backup)

        resultado = ejecutar_restauracion_sistema(
            usuario_admin=self.admin,
            id_backup=copia.id_backup,
            datos_validados={
                'password': self.raw_password,
                'otp_token': otp
            }
        )

        self.assertEqual(resultado['codigo'], 'LOGOUT_REQUIRED')
        self.assertIn("exitosa", resultado['mensaje'].lower())

        # El OTP debe haberse invalidado tras su uso
        cache_key = f"otp_restore_{self.admin.id_usuario}_{copia.id_backup}"
        self.assertIsNone(cache.get(cache_key))

        # Modo mantenimiento debe haberse apagado en el finally
        self.assertFalse(cache.get('MAINTENANCE_MODE', False))

        # Log de restauración
        log = LogSistema.objects.filter(accion="Restauración de Sistema").first()
        self.assertIsNotNone(log)
        self.assertIn(str(copia.id_backup), log.detalle)

    def test_servicio_ejecutar_restauracion_errores_seguridad(self):
        """CU-23: Validación estricta contra contraseña errónea y OTP expirado."""
        from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
        from core_app.services import (
            generar_copia_seguridad_manual,
            solicitar_token_restauracion,
            ejecutar_restauracion_sistema
        )

        copia = generar_copia_seguridad_manual(usuario_admin=self.admin)
        self.archivos_creados.append(copia.ubicacion_archivo)

        otp = solicitar_token_restauracion(usuario_admin=self.admin, id_backup=copia.id_backup)

        # 1. Contraseña errónea
        with self.assertRaises(AuthenticationFailed):
            ejecutar_restauracion_sistema(
                usuario_admin=self.admin,
                id_backup=copia.id_backup,
                datos_validados={
                    'password': 'PasswordIncorrecta!',
                    'otp_token': otp
                }
            )

        # 2. OTP inválido
        with self.assertRaises(PermissionDenied):
            ejecutar_restauracion_sistema(
                usuario_admin=self.admin,
                id_backup=copia.id_backup,
                datos_validados={
                    'password': self.raw_password,
                    'otp_token': '000000'
                }
            )

    def test_api_flujo_completo_backup_y_restore(self):
        """CU-22 y CU-23: Prueba integral de endpoints HTTP con rol ADMIN."""
        from django.core.cache import cache
        from users_app.services import generar_tokens_jwt

        tokens_admin = generar_tokens_jwt(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens_admin['access']}")

        # 1. Generar backup manual (POST /api/core/backups/manual/)
        res_crear = self.client.post('/api/core/backups/manual/', {'version': '2.0.0'}, format='json')
        self.assertEqual(res_crear.status_code, status.HTTP_201_CREATED)
        data_crear = res_crear.json()
        id_backup = data_crear['backup']['id_backup']
        ruta_archivo = data_crear['backup']['ubicacion_archivo']
        self.archivos_creados.append(ruta_archivo)

        # 2. Listar backups (GET /api/core/backups/)
        res_listar = self.client.get('/api/core/backups/')
        self.assertEqual(res_listar.status_code, status.HTTP_200_OK)
        lista = res_listar.json()
        self.assertGreaterEqual(len(lista), 1)
        self.assertTrue(lista[0]['archivo_existe'])
        self.assertGreater(lista[0]['tamano_bytes'], 0)

        # 3. Descargar backup (GET /api/core/backups/<id>/descargar/)
        res_descargar = self.client.get(f'/api/core/backups/{id_backup}/descargar/')
        self.assertEqual(res_descargar.status_code, status.HTTP_200_OK)

        # 4. Solicitar OTP (POST /api/core/backups/<id>/solicitar-token/)
        res_otp = self.client.post(f'/api/core/backups/{id_backup}/solicitar-token/')
        self.assertEqual(res_otp.status_code, status.HTTP_200_OK)

        # Recuperar token de la caché para simular ingreso del admin
        cache_key = f"otp_restore_{self.admin.id_usuario}_{id_backup}"
        token_otp = cache.get(cache_key)
        self.assertIsNotNone(token_otp)

        # 5. Restaurar sistema (POST /api/core/backups/<id>/restaurar/)
        payload_restore = {
            'password': self.raw_password,
            'otp_token': token_otp
        }
        res_restore = self.client.post(
            f'/api/core/backups/{id_backup}/restaurar/',
            payload_restore,
            format='json'
        )
        self.assertEqual(res_restore.status_code, status.HTTP_200_OK)
        self.assertEqual(res_restore.json()['codigo'], 'LOGOUT_REQUIRED')

    def test_seguridad_bloqueo_roles_no_autorizados(self):
        """Verifica que usuarios con rol distinto de ADMIN no puedan operar backups."""
        from users_app.services import generar_tokens_jwt

        tokens_cliente = generar_tokens_jwt(self.cliente)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens_cliente['access']}")

        res1 = self.client.get('/api/core/backups/')
        self.assertEqual(res1.status_code, status.HTTP_403_FORBIDDEN)

        res2 = self.client.post('/api/core/backups/manual/', {})
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

        # Sin autenticar
        self.client.credentials()
        res3 = self.client.get('/api/core/backups/')
        self.assertIn(res3.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_middleware_modo_mantenimiento(self):
        """Verifica que el middleware bloquee con HTTP 503 peticiones ordinarias en mantenimiento."""
        from django.core.cache import cache
        from users_app.services import generar_tokens_jwt

        tokens_cliente = generar_tokens_jwt(self.cliente)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens_cliente['access']}")

        cache.set('MAINTENANCE_MODE', True)

        try:
            # Petición a endpoint ordinario (ej. notificaciones) debe ser rechazada con 503
            res = self.client.get('/api/core/notificaciones/')
            self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
            self.assertEqual(res.json().get('codigo'), 'MODO_MANTENIMIENTO')
        finally:
            cache.set('MAINTENANCE_MODE', False)


