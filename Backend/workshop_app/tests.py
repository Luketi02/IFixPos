from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from datetime import date
from rest_framework.exceptions import ValidationError

from workshop_app.models import Dispositivo
from catalog_app.models import TipoDispositivo, Marca, ModeloDispositivo
from users_app.models import Usuario, RolUsuario
from core_app.models import LogSistema
from workshop_app.selectors import (
    obtener_tipos_dispositivos,
    obtener_marcas,
    obtener_modelos_por_marca
)
from workshop_app.serializers import DispositivoInputSerializer
from workshop_app.services import registrar_dispositivo, crear_dispositivo

# Create your tests here.


class RegistrarDispositivoCU06Tests(TestCase):
    """
    Pruebas unitarias y de integración para CU-06: Registrar Dispositivo.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Configurar Roles
        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Administrador total'
        )
        self.rol_tecnico = RolUsuario.objects.create(
            codigo='TECNICO',
            nombre_rol='Técnico',
            descripcion='Técnico del taller'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Cliente del servicio'
        )

        # 2. Configurar Usuarios
        self.cliente_user = Usuario.objects.create(
            email='cliente1@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.otro_cliente_user = Usuario.objects.create(
            email='cliente2@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.tecnico_user = Usuario.objects.create(
            email='tecnico@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_tecnico,
            is_active=True
        )
        self.admin_user = Usuario.objects.create(
            email='admin@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_admin,
            is_active=True
        )

        # 3. Configurar Catálogos
        self.tipo_smartphone = TipoDispositivo.objects.create(
            nombre='Smartphone',
            estado_activo=True
        )
        self.tipo_tablet = TipoDispositivo.objects.create(
            nombre='Tablet Inactiva',
            estado_activo=False
        )

        self.marca_samsung = Marca.objects.create(
            nombre='Samsung',
            estado_activo=True
        )
        self.marca_apple = Marca.objects.create(
            nombre='Apple',
            estado_activo=True
        )
        self.marca_inactiva = Marca.objects.create(
            nombre='Marca Vieja',
            estado_activo=False
        )

        self.modelo_s23 = ModeloDispositivo.objects.create(
            nombre='Galaxy S23',
            estado_activo=True,
            id_marca=self.marca_samsung,
            id_tipo_dispositivo=self.tipo_smartphone
        )
        self.modelo_s24 = ModeloDispositivo.objects.create(
            nombre='Galaxy S24',
            estado_activo=True,
            id_marca=self.marca_samsung,
            id_tipo_dispositivo=self.tipo_smartphone
        )
        self.modelo_iphone15 = ModeloDispositivo.objects.create(
            nombre='iPhone 15',
            estado_activo=True,
            id_marca=self.marca_apple,
            id_tipo_dispositivo=self.tipo_smartphone
        )
        self.modelo_inactivo = ModeloDispositivo.objects.create(
            nombre='Galaxy S2 Inactivo',
            estado_activo=False,
            id_marca=self.marca_samsung,
            id_tipo_dispositivo=self.tipo_smartphone
        )

    # --------------------------------------------------------------------------
    # SELECTORS TESTS
    # --------------------------------------------------------------------------

    def test_selector_obtener_tipos_dispositivos(self):
        """Retorna solo tipos de dispositivos activos ordenados alfabéticamente."""
        tipos = obtener_tipos_dispositivos()
        self.assertEqual(tipos.count(), 1)
        self.assertEqual(tipos.first().nombre, 'Smartphone')

    def test_selector_obtener_marcas(self):
        """Retorna solo marcas activas ordenadas alfabéticamente."""
        marcas = obtener_marcas()
        nombres = list(marcas.values_list('nombre', flat=True))
        self.assertIn('Samsung', nombres)
        self.assertIn('Apple', nombres)
        self.assertNotIn('Marca Vieja', nombres)

    def test_selector_obtener_modelos_por_marca(self):
        """Retorna solo modelos activos de la marca solicitada."""
        modelos_samsung = obtener_modelos_por_marca(self.marca_samsung.id_marca)
        nombres_samsung = list(modelos_samsung.values_list('nombre', flat=True))
        self.assertIn('Galaxy S23', nombres_samsung)
        self.assertIn('Galaxy S24', nombres_samsung)
        self.assertNotIn('Galaxy S2 Inactivo', nombres_samsung)
        self.assertNotIn('iPhone 15', nombres_samsung)

    # --------------------------------------------------------------------------
    # SERIALIZER TESTS
    # --------------------------------------------------------------------------

    def test_serializer_dispositivo_input_valido(self):
        """Valida correctamente los datos requeridos y opcionales."""
        payload = {
            'id_cliente': self.cliente_user.id_usuario,
            'id_modelo': self.modelo_s23.id_modelo,
            'nro_serie': 'SN-SAM-12345',
            'imagen': 'https://miservidor.com/img.jpg'
        }
        serializer = DispositivoInputSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['id_cliente'], self.cliente_user.id_usuario)
        self.assertEqual(serializer.validated_data['id_modelo'], self.modelo_s23.id_modelo)

    def test_serializer_dispositivo_input_modelo_inexistente(self):
        """Falla si el modelo especificado no existe en la base de datos."""
        payload = {
            'id_cliente': self.cliente_user.id_usuario,
            'id_modelo': 999999,
            'nro_serie': 'SN-SAM-999'
        }
        serializer = DispositivoInputSerializer(data=payload)
        self.assertFalse(serializer.is_valid())
        self.assertIn('id_modelo', serializer.errors)

    def test_serializer_dispositivo_input_cliente_inexistente(self):
        """Falla si el cliente especificado no existe en el sistema."""
        payload = {
            'id_cliente': 888888,
            'id_modelo': self.modelo_s23.id_modelo
        }
        serializer = DispositivoInputSerializer(data=payload)
        self.assertFalse(serializer.is_valid())
        self.assertIn('id_cliente', serializer.errors)

    # --------------------------------------------------------------------------
    # SERVICES TESTS (Lógica de Negocio y Regla de Roles)
    # --------------------------------------------------------------------------

    def test_service_registrar_dispositivo_cliente_sobrescribe_id_cliente(self):
        """
        Seguridad de Roles: Si el ejecutor es CLIENTE, el sistema ignora el id_cliente
        del payload y fuerza que el dispositivo pertenezca al propio ejecutor.
        """
        payload = {
            'id_cliente': self.otro_cliente_user.id_usuario, # Intento de asignar a otro
            'id_modelo': self.modelo_s23.id_modelo,
            'nro_serie': 'IMEI-CLIENTE-001'
        }

        dispositivo = registrar_dispositivo(
            usuario_ejecutor=self.cliente_user,
            datos_validados=payload
        )

        # Debe pertenecer a self.cliente_user, NO a self.otro_cliente_user
        self.assertEqual(dispositivo.id_usuario_id, self.cliente_user.id_usuario)
        self.assertEqual(dispositivo.numero_serie, 'IMEI-CLIENTE-001')

        # Verificar auditoría en LogSistema
        log = LogSistema.objects.filter(
            tabla_afectada='dispositivo',
            id_registro_afectado=str(dispositivo.id_dispositivo)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.id_usuario_id, self.cliente_user.id_usuario)
        self.assertIn("Alta de dispositivo", log.accion)

    def test_service_registrar_dispositivo_tecnico_respeta_id_cliente(self):
        """
        Seguridad de Roles: Si el ejecutor es TECNICO, se respeta el id_cliente
        del payload (registro a nombre del cliente asistido).
        """
        payload = {
            'id_cliente': self.cliente_user.id_usuario,
            'id_modelo': self.modelo_iphone15.id_modelo,
            'nro_serie': 'IMEI-APPLE-999'
        }

        dispositivo = registrar_dispositivo(
            usuario_ejecutor=self.tecnico_user,
            datos_validados=payload
        )

        self.assertEqual(dispositivo.id_usuario_id, self.cliente_user.id_usuario)
        
        # Auditoría debe registrar al técnico como ejecutor
        log = LogSistema.objects.filter(
            tabla_afectada='dispositivo',
            id_registro_afectado=str(dispositivo.id_dispositivo)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.id_usuario_id, self.tecnico_user.id_usuario)

    def test_service_registrar_dispositivo_admin_respeta_id_cliente(self):
        """
        Seguridad de Roles: Si el ejecutor es ADMIN, se respeta el id_cliente del payload.
        """
        payload = {
            'id_cliente': self.otro_cliente_user.id_usuario,
            'id_modelo': self.modelo_s24.id_modelo,
            'nro_serie': 'IMEI-ADMIN-001'
        }

        dispositivo = registrar_dispositivo(
            usuario_ejecutor=self.admin_user,
            datos_validados=payload
        )

        self.assertEqual(dispositivo.id_usuario_id, self.otro_cliente_user.id_usuario)

        log = LogSistema.objects.filter(
            tabla_afectada='dispositivo',
            id_registro_afectado=str(dispositivo.id_dispositivo)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.id_usuario_id, self.admin_user.id_usuario)

    # --------------------------------------------------------------------------
    # API ENDPOINTS TESTS
    # --------------------------------------------------------------------------

    def test_api_catalogo_tipos_dispositivos(self):
        """GET /api/workshop/tipos-dispositivos/ debe responder 200 OK."""
        response = self.client.get('/api/workshop/tipos-dispositivos/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertTrue(len(response.data) >= 1)

    def test_api_catalogo_marcas(self):
        """GET /api/workshop/marcas/ debe responder 200 OK."""
        response = self.client.get('/api/workshop/marcas/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertTrue(len(response.data) >= 2)

    def test_api_catalogo_modelos_por_marca(self):
        """GET /api/workshop/marcas/<id>/modelos/ y con query param deben responder 200 OK."""
        url_path = f'/api/workshop/marcas/{self.marca_samsung.id_marca}/modelos/'
        response_path = self.client.get(url_path)
        self.assertEqual(response_path.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response_path.data), 2) # Galaxy S23 y S24

        url_query = f'/api/workshop/modelos/?id_marca={self.marca_samsung.id_marca}'
        response_query = self.client.get(url_query)
        self.assertEqual(response_query.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response_query.data), 2)

    def test_api_registrar_dispositivo_sin_autenticacion(self):
        """POST /api/workshop/dispositivos/registrar/ sin token debe ser rechazado (401 o 403)."""
        response = self.client.post('/api/workshop/dispositivos/registrar/', {
            'id_cliente': self.cliente_user.id_usuario,
            'id_modelo': self.modelo_s23.id_modelo
        }, format='json')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_api_registrar_dispositivo_con_token_exitoso(self):
        """POST /api/workshop/dispositivos/registrar/ autenticado crea el equipo y responde 201 Created."""
        self.client.force_authenticate(user=self.cliente_user)
        payload = {
            'id_cliente': self.cliente_user.id_usuario,
            'id_modelo': self.modelo_s23.id_modelo,
            'nro_serie': 'SN-API-TEST-777',
            'imagen': 'https://ifixpos.com/test.jpg'
        }
        response = self.client.post('/api/workshop/dispositivos/registrar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('mensaje', response.data)
        self.assertIn('id_dispositivo', response.data)
        self.assertIn('dispositivo', response.data)
        self.assertEqual(response.data['dispositivo']['numero_serie'], 'SN-API-TEST-777')

    # --------------------------------------------------------------------------
    # HOMOLOGACIÓN Y PROMOCIÓN INTELIGENTE A 8 USOS (OPCIÓN "OTRO")
    # --------------------------------------------------------------------------

    def test_registrar_dispositivo_opcion_otro_crea_catalogo_inactivo(self):
        """
        Al ingresar un tipo, marca o modelo personalizado mediante 'Otro', se registran
        en el catálogo con estado_activo=False para no contaminar las listas públicas.
        """
        payload = {
            'id_cliente': self.cliente_user.id_usuario,
            'es_otro': True,
            'nombre_tipo_otro': 'Consola Portátil',
            'nombre_marca_otro': 'Valve',
            'nombre_modelo_otro': 'Steam Deck OLED',
            'nro_serie': 'VALVE-SD-001'
        }

        dispositivo = registrar_dispositivo(
            usuario_ejecutor=self.cliente_user,
            datos_validados=payload
        )

        self.assertIsNotNone(dispositivo.id_dispositivo)
        modelo = dispositivo.id_modelo
        self.assertEqual(modelo.nombre, 'Steam Deck OLED')
        self.assertFalse(modelo.estado_activo)

        marca = modelo.id_marca
        self.assertEqual(marca.nombre, 'Valve')
        self.assertFalse(marca.estado_activo)

        tipo = modelo.id_tipo_dispositivo
        self.assertEqual(tipo.nombre, 'Consola Portátil')
        self.assertFalse(tipo.estado_activo)

        # Verificar que el selector público de marcas activas NO muestre 'Valve'
        marcas_activas = obtener_marcas()
        self.assertNotIn('Valve', list(marcas_activas.values_list('nombre', flat=True)))

        # Verificar que el selector público de modelos activos de Valve no devuelva nada
        modelos_activos = obtener_modelos_por_marca(marca.id_marca)
        self.assertEqual(modelos_activos.count(), 0)

    def test_registrar_dispositivo_opcion_otro_reutiliza_nombres_existentes(self):
        """
        Si varios usuarios ingresan el mismo modelo (incluso con distinta capitalización),
        el sistema reutiliza el registro homologado sin crear duplicados.
        """
        payload_1 = {
            'id_cliente': self.cliente_user.id_usuario,
            'es_otro': True,
            'nombre_marca_otro': 'Asus ROG',
            'nombre_modelo_otro': 'ROG Ally X'
        }
        disp_1 = registrar_dispositivo(usuario_ejecutor=self.cliente_user, datos_validados=payload_1)

        payload_2 = {
            'id_cliente': self.otro_cliente_user.id_usuario,
            'es_otro': True,
            'nombre_marca_otro': 'asus rog',
            'nombre_modelo_otro': 'rog ally x'
        }
        disp_2 = registrar_dispositivo(usuario_ejecutor=self.otro_cliente_user, datos_validados=payload_2)

        # Ambos deben compartir el mismo ID de modelo
        self.assertEqual(disp_1.id_modelo_id, disp_2.id_modelo_id)
        self.assertEqual(disp_1.id_modelo.id_marca_id, disp_2.id_modelo.id_marca_id)

    def test_promocion_inteligente_a_los_8_usos(self):
        """
        Regla de Inteligencia:
        Cuando un modelo creado manualmente alcanza 8 dispositivos registrados en el sistema,
        se promueve automáticamente a estado_activo=True y se registra auditoría en LogSistema.
        """
        payload_base = {
            'es_otro': True,
            'nombre_tipo_otro': 'Smartwatch Avanzado',
            'nombre_marca_otro': 'Garmin Custom',
            'nombre_modelo_otro': 'Fenix 8 Solar'
        }

        # 1. Registrar 7 dispositivos (aún debe ser inactivo)
        for i in range(1, 8):
            disp = registrar_dispositivo(
                usuario_ejecutor=self.cliente_user,
                datos_validados={
                    **payload_base,
                    'id_cliente': self.cliente_user.id_usuario,
                    'nro_serie': f'SN-FENIX-{i}'
                }
            )

        modelo = disp.id_modelo
        modelo.refresh_from_db()
        self.assertFalse(modelo.estado_activo)
        self.assertFalse(modelo.id_marca.estado_activo)
        self.assertFalse(modelo.id_tipo_dispositivo.estado_activo)

        # 2. Registrar el 8vo dispositivo -> dispara la promoción automática
        disp_8 = registrar_dispositivo(
            usuario_ejecutor=self.otro_cliente_user,
            datos_validados={
                **payload_base,
                'id_cliente': self.otro_cliente_user.id_usuario,
                'nro_serie': 'SN-FENIX-8'
            }
        )

        modelo.refresh_from_db()
        modelo.id_marca.refresh_from_db()
        modelo.id_tipo_dispositivo.refresh_from_db()

        self.assertTrue(modelo.estado_activo, "El modelo debió ser promovido a estado_activo=True tras 8 registros.")
        self.assertTrue(modelo.id_marca.estado_activo, "La marca debió ser promovida a estado_activo=True.")
        self.assertTrue(modelo.id_tipo_dispositivo.estado_activo, "El tipo debió ser promovido a estado_activo=True.")

        # 3. Comprobar auditoría en LogSistema
        log_promocion = LogSistema.objects.filter(
            tabla_afectada='modelo',
            id_registro_afectado=str(modelo.id_modelo),
            accion__icontains='Promoción automática'
        ).first()
        self.assertIsNotNone(log_promocion)
        self.assertIn("alcanzó 8 usos", log_promocion.detalle)

    def test_api_registrar_dispositivo_opcion_otro_exitoso(self):
        """POST /api/workshop/dispositivos/registrar/ con opción Otro responde 201 Created."""
        self.client.force_authenticate(user=self.cliente_user)
        payload = {
            'id_cliente': self.cliente_user.id_usuario,
            'es_otro': 'true',
            'nombre_tipo_otro': 'E-Reader',
            'nombre_marca_otro': 'Kobo',
            'nombre_modelo_otro': 'Clara 2E',
            'nro_serie': 'KOBO-SN-555'
        }
        response = self.client.post('/api/workshop/dispositivos/registrar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('id_dispositivo', response.data)
        self.assertEqual(response.data['dispositivo']['numero_serie'], 'KOBO-SN-555')

