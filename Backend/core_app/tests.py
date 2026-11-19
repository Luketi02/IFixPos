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
        import tempfile
        from django.test import override_settings
        self._tmp_backups_dir = tempfile.mkdtemp(prefix='ifixpos_test_backups_')
        self._backups_override = override_settings(BACKUPS_DIR=self._tmp_backups_dir)
        self._backups_override.enable()

    def tearDown(self):
        import os, shutil
        from django.core.cache import cache
        cache.clear()
        for ruta in self.archivos_creados:
            if os.path.exists(ruta):
                try:
                    os.remove(ruta)
                except OSError:
                    pass
        if hasattr(self, '_backups_override'):
            self._backups_override.disable()
        if hasattr(self, '_tmp_backups_dir') and os.path.exists(self._tmp_backups_dir):
            shutil.rmtree(self._tmp_backups_dir, ignore_errors=True)

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

    def test_api_estado_almacenamiento(self):
        """CU-22: Verifica endpoint de verificación de estado de almacenamiento y permisos de servidor."""
        from users_app.services import generar_tokens_jwt

        tokens_admin = generar_tokens_jwt(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens_admin['access']}")

        res = self.client.get('/api/core/backups/estado/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIn('espacio_libre_mb', data)
        self.assertIn('espacio_suficiente', data)
        self.assertIn('permisos_escritura', data)
        self.assertTrue(data['espacio_suficiente'])
        self.assertTrue(data['permisos_escritura'])



# ==============================================================================
# CU-40: FILTRAR LOGS DE AUDITORÍA (TESTS)
# ==============================================================================

class FiltrarLogsAuditoriaTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        from django.contrib.auth.hashers import make_password
        from datetime import datetime, date, time, timezone
        from users_app.models import RolUsuario, Usuario, PerfilUsuario
        from core_app.models import LogSistema

        self.client = APIClient()

        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Admin'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Cliente'}
        )

        self.admin = Usuario.objects.create(
            email='admin_logs@test.com',
            contrasena=make_password('AdminPass123!'),
            fecha_registro=date.today(),
            id_rol=self.rol_admin,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.admin,
            nombre='Admin',
            apellido='Auditor',
            dni='99887766'
        )

        self.cliente = Usuario.objects.create(
            email='cliente_logs@test.com',
            contrasena=make_password('ClientPass123!'),
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )

        # Crear registros de logs para prueba con fecha y hora completa
        LogSistema.objects.create(
            fecha_hora=datetime(2026, 10, 31, 10, 30, 0, tzinfo=timezone.utc),
            accion='Creación de Usuario de Prueba',
            detalle='Usuario creado exitosamente',
            tipo='CREACION',
            modulo_origen='Usuarios',
            tabla_afectada='usuario',
            id_registro_afectado='100',
            id_usuario=self.admin
        )
        LogSistema.objects.create(
            fecha_hora=datetime(2026, 10, 31, 14, 0, 0, tzinfo=timezone.utc),
            accion='Eliminación de Registro Obsoleto',
            detalle='Baja lógica del registro',
            tipo='ELIMINACION',
            modulo_origen='Inventario',
            tabla_afectada='stock',
            id_registro_afectado='200',
            id_usuario=self.admin
        )

    def test_filtrar_logs_exitoso_admin(self):
        """CU-40: Verifica que un Administrador pueda consultar la traza de logs con fecha y hora."""
        from users_app.services import generar_tokens_jwt

        tokens = generar_tokens_jwt(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        res = self.client.get('/api/core/logs/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertGreaterEqual(len(data), 2)
        self.assertIn('accion', data[0])
        self.assertIn('tipo', data[0])
        self.assertIn('fecha', data[0])
        self.assertIn('hora', data[0])

    def test_filtrar_logs_por_modulo_y_tipo(self):
        """CU-40: Filtra logs por módulo_origen y tipo."""
        from users_app.services import generar_tokens_jwt

        tokens = generar_tokens_jwt(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        res = self.client.get('/api/core/logs/', {'modulo_origen': 'Inventario', 'tipo': 'ELIMINACION'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['modulo_origen'], 'Inventario')
        self.assertEqual(data[0]['tipo'], 'ELIMINACION')

    def test_filtrar_logs_por_rango_fechas(self):
        """CU-40: Filtra logs por rango de fecha_desde y fecha_hasta."""
        from users_app.services import generar_tokens_jwt

        tokens = generar_tokens_jwt(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        res = self.client.get('/api/core/logs/', {'fecha_desde': '2026-10-31', 'fecha_hasta': '2026-10-31'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(len(data), 2)

    def test_filtrar_logs_valida_rango_fechas_incongruente(self):
        """CU-40 Excepción: Rechaza fecha_desde posterior a fecha_hasta."""
        from users_app.services import generar_tokens_jwt

        tokens = generar_tokens_jwt(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        res = self.client.get('/api/core/logs/', {'fecha_desde': '2026-11-05', 'fecha_hasta': '2026-10-01'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filtrar_logs_valida_rango_horas_incongruente(self):
        """CU-40 Excepción Paso 4: Rechaza hora_desde posterior a hora_hasta."""
        from users_app.services import generar_tokens_jwt

        tokens = generar_tokens_jwt(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        res = self.client.get('/api/core/logs/', {'hora_desde': '18:00:00', 'hora_hasta': '10:00:00'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filtrar_logs_bloquea_no_admin(self):
        """CU-40 Precondición: Bloquea el acceso a usuarios que no posean rol de Administrador."""
        from users_app.services import generar_tokens_jwt

        tokens = generar_tokens_jwt(self.cliente)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        res = self.client.get('/api/core/logs/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ==============================================================================
# PRUEBAS DEL SISTEMA AVANZADO DE BACKUPS MULTI-NIVEL Y ROTACIÓN FIFO
# ==============================================================================

class SistemaBackupsNivelesYRotacionTests(TestCase):
    """
    Pruebas unitarias y de integración para la arquitectura avanzada de respaldos:
    - Almacenamiento en 5 subcarpetas (diarios, semanales, quincenales, mensuales, manuales).
    - Rotación FIFO estricta previa a la creación para evitar acumulación infinita.
    - Supresión jerárquica por precedencia (Mensual > Quincenal > Semanal > Diario).
    - Depuración de archivos .sql huérfanos sin correspondencia en BD.
    - Endpoints de depuración y ejecución de ciclo programado.
    """

    def setUp(self):
        import os
        from django.contrib.auth.hashers import make_password
        from django.core.cache import cache
        from users_app.models import Usuario, RolUsuario, PerfilUsuario
        from core_app.services import asegurar_configuraciones_predeterminadas

        self.client = APIClient()
        cache.clear()
        asegurar_configuraciones_predeterminadas()

        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol admin'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol cliente'}
        )

        self.admin = Usuario.objects.create(
            email='admin_rotation@test.com',
            contrasena=make_password('AdminPass123!'),
            fecha_registro=date.today(),
            id_rol=self.rol_admin,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.admin,
            nombre='Admin',
            apellido='Rotacion',
            dni='44332211'
        )

        self.cliente = Usuario.objects.create(
            email='cliente_rotation@test.com',
            contrasena=make_password('ClientePass123!'),
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )

        from core_app.models import CopiaSeguridad
        CopiaSeguridad.objects.all().delete()

        self.archivos_creados = []
        import tempfile
        from django.test import override_settings
        self._tmp_backups_dir = tempfile.mkdtemp(prefix='ifixpos_test_backups_')
        self._backups_override = override_settings(BACKUPS_DIR=self._tmp_backups_dir)
        self._backups_override.enable()

    def tearDown(self):
        import os, shutil
        from django.core.cache import cache
        cache.clear()
        for ruta in self.archivos_creados:
            if os.path.exists(ruta):
                try:
                    os.remove(ruta)
                except OSError:
                    pass
        if hasattr(self, '_backups_override'):
            self._backups_override.disable()
        if hasattr(self, '_tmp_backups_dir') and os.path.exists(self._tmp_backups_dir):
            shutil.rmtree(self._tmp_backups_dir, ignore_errors=True)

    def test_subdirectorios_por_categoria(self):
        """Verifica que cada nivel de backup guarde físicamente en su subcarpeta asignada."""
        import os
        from core_app.services import generar_copia_seguridad_manual, generar_copia_seguridad_automatica

        # 1. Manual -> backups/manuales/
        c_manual = generar_copia_seguridad_manual(usuario_admin=self.admin, version="1.0.0")
        self.archivos_creados.append(c_manual.ubicacion_archivo)
        self.assertIn("manuales", c_manual.ubicacion_archivo.replace("\\", "/"))
        self.assertTrue(os.path.exists(c_manual.ubicacion_archivo))

        # 2. Diario -> backups/diarios/
        c_diario = generar_copia_seguridad_automatica(tipo_backup="DIARIO")
        self.archivos_creados.append(c_diario.ubicacion_archivo)
        self.assertIn("diarios", c_diario.ubicacion_archivo.replace("\\", "/"))
        self.assertTrue(os.path.exists(c_diario.ubicacion_archivo))

        # 3. Semanal -> backups/semanales/
        c_semanal = generar_copia_seguridad_automatica(tipo_backup="SEMANAL")
        self.archivos_creados.append(c_semanal.ubicacion_archivo)
        self.assertIn("semanales", c_semanal.ubicacion_archivo.replace("\\", "/"))
        self.assertTrue(os.path.exists(c_semanal.ubicacion_archivo))

        # 4. Quincenal -> backups/quincenales/
        c_quincenal = generar_copia_seguridad_automatica(tipo_backup="QUINCENAL")
        self.archivos_creados.append(c_quincenal.ubicacion_archivo)
        self.assertIn("quincenales", c_quincenal.ubicacion_archivo.replace("\\", "/"))
        self.assertTrue(os.path.exists(c_quincenal.ubicacion_archivo))

        # 5. Mensual -> backups/mensuales/
        c_mensual = generar_copia_seguridad_automatica(tipo_backup="MENSUAL")
        self.archivos_creados.append(c_mensual.ubicacion_archivo)
        self.assertIn("mensuales", c_mensual.ubicacion_archivo.replace("\\", "/"))
        self.assertTrue(os.path.exists(c_mensual.ubicacion_archivo))

    def test_rotacion_fifo_estricta_elimina_mas_antiguo_antes_de_crear(self):
        """Verifica que con límite N, antes de generar el (N+1)-ésimo backup se elimine el más antiguo."""
        import os
        from core_app.models import CopiaSeguridad, ConfiguracionSistema
        from core_app.services import (
            generar_copia_seguridad_automatica,
            invalidar_cache_configuracion,
            obtener_directorio_backup_por_tipo
        )

        # Asegurar estado limpio inicial para copias diarias
        dir_diarios = obtener_directorio_backup_por_tipo('DIARIO')
        if os.path.exists(dir_diarios):
            for f in os.listdir(dir_diarios):
                if f.lower().endswith('.sql'):
                    try:
                        os.remove(os.path.join(dir_diarios, f))
                    except OSError:
                        pass
        CopiaSeguridad.objects.all().delete()

        # Parametrizar límite de retención en 2 e invalidar caché
        ConfiguracionSistema.objects.filter(clave="backupRetencionCopias").update(valor="2")
        invalidar_cache_configuracion(["backupRetencionCopias"])

        # Generar 2 copias diarias
        import time
        c1 = generar_copia_seguridad_automatica(tipo_backup="DIARIO")
        ruta_c1 = c1.ubicacion_archivo
        self.archivos_creados.append(ruta_c1)
        self.assertTrue(os.path.exists(ruta_c1))

        time.sleep(0.02)
        c2 = generar_copia_seguridad_automatica(tipo_backup="DIARIO")
        ruta_c2 = c2.ubicacion_archivo
        self.archivos_creados.append(ruta_c2)
        self.assertTrue(os.path.exists(ruta_c2))

        self.assertEqual(CopiaSeguridad.objects.filter(ubicacion_archivo__contains="diarios").count(), 2)

        # Generar 3ra copia diaria: debe purgar a c1 ANTES de que se almacene c3
        time.sleep(0.02)
        c3 = generar_copia_seguridad_automatica(tipo_backup="DIARIO")
        ruta_c3 = c3.ubicacion_archivo
        self.archivos_creados.append(ruta_c3)

        # c1 debe haberse eliminado tanto de BD como del disco
        self.assertFalse(os.path.exists(ruta_c1))
        self.assertFalse(CopiaSeguridad.objects.filter(id_backup=c1.id_backup).exists())

        # c2 y c3 deben permanecer en disco y en BD
        self.assertTrue(os.path.exists(ruta_c2))
        self.assertTrue(os.path.exists(ruta_c3))
        self.assertEqual(CopiaSeguridad.objects.filter(ubicacion_archivo__contains="diarios").count(), 2)

    def test_precedencia_jerarquica_supresion(self):
        """
        Verifica que:
        - Si corre un Mensual, suprime quincenal, semanal y diario.
        - Si corre un Semanal, suprime diario.
        """
        from datetime import date, time
        from core_app.models import ConfiguracionSistema, CopiaSeguridad
        from core_app.services import evaluar_y_ejecutar_backups_programados, invalidar_cache_configuracion

        dia_semana_map = {
            0: "LUNES", 1: "MARTES", 2: "MIERCOLES", 3: "JUEVES",
            4: "VIERNES", 5: "SABADO", 6: "DOMINGO"
        }
        hoy = date.today()
        dia_hoy_str = dia_semana_map[hoy.weekday()]

        # Escenario 1: Semanal activo coincidiendo hoy a las 03:00, y Diario activo a las 03:00.
        # El Semanal debe ejecutarse y suprimir el Diario de hoy.
        ConfiguracionSistema.objects.filter(clave="backupAutomatico").update(valor="true")
        ConfiguracionSistema.objects.filter(clave="backupModalidad").update(valor="AUTOMATICO")
        ConfiguracionSistema.objects.filter(clave="backupDiarioActivo").update(valor="true")
        ConfiguracionSistema.objects.filter(clave="backupHoraEjecucion").update(valor="03:00")
        ConfiguracionSistema.objects.filter(clave="backupSemanalActivo").update(valor="true")
        ConfiguracionSistema.objects.filter(clave="backupDiaSemana").update(valor=dia_hoy_str)
        ConfiguracionSistema.objects.filter(clave="backupHoraSemanal").update(valor="03:00")
        ConfiguracionSistema.objects.filter(clave="backupQuincenalActivo").update(valor="false")
        ConfiguracionSistema.objects.filter(clave="backupMensualActivo").update(valor="false")
        invalidar_cache_configuracion([
            "backupAutomatico", "backupModalidad", "backupDiarioActivo", "backupHoraEjecucion",
            "backupSemanalActivo", "backupDiaSemana", "backupHoraSemanal",
            "backupQuincenalActivo", "backupMensualActivo"
        ])

        res1 = evaluar_y_ejecutar_backups_programados(
            fecha_evaluacion=hoy,
            hora_evaluacion=time(3, 0),
            tolerancia_minutos=10
        )

        if res1.get("archivo"):
            self.archivos_creados.append(res1["archivo"])

        self.assertTrue(res1.get("ejecutado"))
        self.assertEqual(res1.get("nivel"), "SEMANAL")
        self.assertIn("DIARIO", res1.get("suprimidos", []))

        # Escenario 2: Mensual activo hoy a las 03:00.
        # Suprime Quincenal, Semanal y Diario.
        ConfiguracionSistema.objects.filter(clave="backupMensualActivo").update(valor="true")
        ConfiguracionSistema.objects.filter(clave="backupHoraMensual").update(valor="03:00")
        ConfiguracionSistema.objects.filter(clave="backupQuincenalActivo").update(valor="true")
        ConfiguracionSistema.objects.filter(clave="backupHoraQuincenal").update(valor="03:00")

        # Usar día 1 del mes para asegurar que el mensual evalúa positivo
        dia_1 = date(2026, 11, 1)
        dia_1_str = dia_semana_map[dia_1.weekday()]
        ConfiguracionSistema.objects.filter(clave="backupDiaSemana").update(valor=dia_1_str)
        invalidar_cache_configuracion([
            "backupMensualActivo", "backupHoraMensual", "backupQuincenalActivo",
            "backupHoraQuincenal", "backupDiaSemana"
        ])

        res2 = evaluar_y_ejecutar_backups_programados(
            fecha_evaluacion=dia_1,
            hora_evaluacion=time(3, 0),
            tolerancia_minutos=10
        )

        if res2.get("archivo"):
            self.archivos_creados.append(res2["archivo"])

        self.assertTrue(res2.get("ejecutado"))
        self.assertEqual(res2.get("nivel"), "MENSUAL")
        self.assertIn("QUINCENAL", res2.get("suprimidos", []))
        self.assertIn("SEMANAL", res2.get("suprimidos", []))
        self.assertIn("DIARIO", res2.get("suprimidos", []))

    def test_depurar_archivos_backup_huerfanos(self):
        """Verifica que depurar_archivos_backup_huerfanos elimine del disco solo los .sql sin registro en BD."""
        import os
        from core_app.services import (
            obtener_directorio_backup_por_tipo,
            depurar_archivos_backup_huerfanos,
            generar_copia_seguridad_manual
        )
        from core_app.models import CopiaSeguridad

        # Crear una copia legítima con registro en BD
        copia_legitima = generar_copia_seguridad_manual(usuario_admin=self.admin)
        self.archivos_creados.append(copia_legitima.ubicacion_archivo)
        self.assertTrue(os.path.exists(copia_legitima.ubicacion_archivo))

        # Crear un archivo huérfano simulado en backups/manuales/
        dir_manuales = obtener_directorio_backup_por_tipo("MANUAL")
        ruta_huerfano = os.path.join(dir_manuales, "backup_huerfano_prueba.sql")
        with open(ruta_huerfano, "w", encoding="utf-8") as f:
            f.write("-- Archivo huérfano sin fila en BD\n")

        self.assertTrue(os.path.exists(ruta_huerfano))

        # Ejecutar depuración
        resultado = depurar_archivos_backup_huerfanos()

        self.assertGreaterEqual(resultado["eliminados"], 1)
        self.assertIn("backup_huerfano_prueba.sql", resultado["archivos"])
        self.assertFalse(os.path.exists(ruta_huerfano))

        # La copia legítima no debió ser tocada
        self.assertTrue(os.path.exists(copia_legitima.ubicacion_archivo))
        self.assertTrue(CopiaSeguridad.objects.filter(id_backup=copia_legitima.id_backup).exists())

    def test_api_depurar_huerfanos_y_ejecutar_ciclo(self):
        """Prueba los endpoints HTTP para depurar huérfanos y forzar ciclo de respaldos programados."""
        from users_app.services import generar_tokens_jwt

        tokens_admin = generar_tokens_jwt(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens_admin['access']}")

        # 1. POST /api/core/backups/depurar-huerfanos/
        res_depurar = self.client.post('/api/core/backups/depurar-huerfanos/')
        self.assertEqual(res_depurar.status_code, status.HTTP_200_OK)
        data_depurar = res_depurar.json()
        self.assertIn('mensaje', data_depurar)
        self.assertIn('detalle', data_depurar)
        self.assertIn('eliminados', data_depurar['detalle'])

        # 2. POST /api/core/backups/ejecutar-ciclo/
        res_ciclo = self.client.post('/api/core/backups/ejecutar-ciclo/')
        self.assertEqual(res_ciclo.status_code, status.HTTP_200_OK)
        self.assertIn('resultados', res_ciclo.json())

        # 3. Acceso denegado para rol CLIENTE
        tokens_cliente = generar_tokens_jwt(self.cliente)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens_cliente['access']}")

        res_forbidden1 = self.client.post('/api/core/backups/depurar-huerfanos/')
        self.assertEqual(res_forbidden1.status_code, status.HTTP_403_FORBIDDEN)

        res_forbidden2 = self.client.post('/api/core/backups/ejecutar-ciclo/')
        self.assertEqual(res_forbidden2.status_code, status.HTTP_403_FORBIDDEN)

    def test_interruptor_maestro_backup_automatico_bloquea_ejecucion(self):
        """Verifica que si backupAutomatico es False, ninguna rutina automática se ejecute."""
        from core_app.models import ConfiguracionSistema, CopiaSeguridad
        from core_app.services import evaluar_y_ejecutar_backups_programados, invalidar_cache_configuracion
        from core_app.selectors import obtener_configuracion_bool
        from users_app.services import generar_tokens_jwt

        # 1. Asegurar interruptor maestro apagado en BD
        ConfiguracionSistema.objects.filter(clave="backupAutomatico").update(valor="False")
        invalidar_cache_configuracion(["backupAutomatico"])
        self.assertFalse(obtener_configuracion_bool("backupAutomatico"))

        copias_iniciales = CopiaSeguridad.objects.filter(automatico=True).count()

        # Intentar ejecutar con evaluación normal
        res_normal = evaluar_y_ejecutar_backups_programados()
        self.assertFalse(res_normal["ejecutado"])
        self.assertIn("desactivados", res_normal["motivo"].lower())

        # Intentar forzar nivel con switch apagado
        res_forzado = evaluar_y_ejecutar_backups_programados(forzar_nivel="DIARIO")
        self.assertFalse(res_forzado["ejecutado"])
        self.assertIn("desactivados", res_forzado["motivo"].lower())

        # Ninguna copia automática debió crearse
        self.assertEqual(CopiaSeguridad.objects.filter(automatico=True).count(), copias_iniciales)

        # 2. Encender mediante API PUT /api/core/configuraciones/
        tokens_admin = generar_tokens_jwt(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens_admin['access']}")

        res_put = self.client.put(
            '/api/core/configuraciones/',
            {'backupAutomatico': 'True'},
            format='json'
        )
        self.assertEqual(res_put.status_code, status.HTTP_200_OK)
        self.assertTrue(obtener_configuracion_bool("backupAutomatico"))

        # 3. Ahora con switch encendido, el forzado se ejecuta satisfactoriamente
        res_ok = evaluar_y_ejecutar_backups_programados(forzar_nivel="DIARIO")
        self.assertTrue(res_ok["ejecutado"])
        self.assertEqual(res_ok["nivel"], "DIARIO")
        if res_ok.get("archivo"):
            self.archivos_creados.append(res_ok["archivo"])




