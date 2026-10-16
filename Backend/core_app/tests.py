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

