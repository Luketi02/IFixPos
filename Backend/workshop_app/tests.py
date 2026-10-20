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



class FiltrarMisDispositivosCU34Tests(TestCase):
    """
    Pruebas unitarias y de integración para CU-34: Filtrar Mis Dispositivos.
    """

    def setUp(self):
        self.client = APIClient()

        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Cliente del servicio'
        )
        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Administrador total'
        )

        self.cliente = Usuario.objects.create(
            email='cliente_cu34@test.com',
            contrasena='hash',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.otro_cliente = Usuario.objects.create(
            email='otro_cliente@test.com',
            contrasena='hash',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.admin = Usuario.objects.create(
            email='admin_cu34@test.com',
            contrasena='hash',
            fecha_registro=date.today(),
            id_rol=self.rol_admin,
            is_active=True
        )

        self.tipo = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        self.marca_apple = Marca.objects.create(nombre='Apple', estado_activo=True)
        self.marca_samsung = Marca.objects.create(nombre='Samsung', estado_activo=True)
        self.modelo_iphone = ModeloDispositivo.objects.create(
            nombre='iPhone 13',
            estado_activo=True,
            id_marca=self.marca_apple,
            id_tipo_dispositivo=self.tipo
        )
        self.modelo_galaxy = ModeloDispositivo.objects.create(
            nombre='Galaxy S21',
            estado_activo=True,
            id_marca=self.marca_samsung,
            id_tipo_dispositivo=self.tipo
        )

        # Dispositivos del cliente
        self.disp1 = Dispositivo.objects.create(
            id_usuario=self.cliente,
            id_modelo=self.modelo_iphone,
            numero_serie='IPHONE-001',
            fecha_registro=date.today()
        )
        self.disp2 = Dispositivo.objects.create(
            id_usuario=self.cliente,
            id_modelo=self.modelo_galaxy,
            numero_serie='SAMSUNG-002',
            fecha_registro=date.today()
        )

        # Dispositivo de otro cliente (para probar aislamiento)
        self.disp_ajeno = Dispositivo.objects.create(
            id_usuario=self.otro_cliente,
            id_modelo=self.modelo_iphone,
            numero_serie='IPHONE-AJENO',
            fecha_registro=date.today()
        )

    def test_aislamiento_estricto_seguridad(self):
        """El cliente solo debe ver sus propios equipos, jamás los de terceros."""
        self.client.force_authenticate(user=self.cliente)
        response = self.client.get('/api/workshop/mis-dispositivos/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        ids = [d['id_dispositivo'] for d in response.data]
        self.assertIn(self.disp1.id_dispositivo, ids)
        self.assertIn(self.disp2.id_dispositivo, ids)
        self.assertNotIn(self.disp_ajeno.id_dispositivo, ids)

    def test_filtro_por_texto_marca_o_modelo(self):
        """Filtrar por texto 'galaxy' solo retorna el Galaxy."""
        self.client.force_authenticate(user=self.cliente)
        response = self.client.get('/api/workshop/mis-dispositivos/?buscar=galaxy')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_dispositivo'], self.disp2.id_dispositivo)

    def test_filtro_por_marca(self):
        """Filtrar por id_marca de Apple retorna solo iPhone del cliente."""
        self.client.force_authenticate(user=self.cliente)
        response = self.client.get(f'/api/workshop/mis-dispositivos/?marca={self.marca_apple.id_marca}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_dispositivo'], self.disp1.id_dispositivo)

    def test_sin_resultados_retorna_mensaje_amigable(self):
        """Si no hay coincidencias retorna HTTP 200 con mensaje 'No se encontraron resultados'."""
        self.client.force_authenticate(user=self.cliente)
        response = self.client.get('/api/workshop/mis-dispositivos/?buscar=XiaomiInexistente')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('mensaje', response.data)
        self.assertEqual(response.data['mensaje'], 'No se encontraron resultados')

    def test_solo_rol_cliente_autorizado(self):
        """Un usuario que no sea CLIENTE recibe 403 Forbidden."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/workshop/mis-dispositivos/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class EditarDispositivoCU07Tests(TestCase):
    """
    Pruebas unitarias y de integración para CU-07: Editar Dispositivo.
    """

    def setUp(self):
        self.client = APIClient()

        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Cliente del servicio'
        )

        self.cliente = Usuario.objects.create(
            email='cliente_cu07@test.com',
            contrasena='hash',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.otro_cliente = Usuario.objects.create(
            email='otro_cu07@test.com',
            contrasena='hash',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )

        self.tipo = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        self.marca_samsung = Marca.objects.create(nombre='Samsung', estado_activo=True)
        self.marca_motorola = Marca.objects.create(nombre='Motorola', estado_activo=True)

        self.modelo_s21 = ModeloDispositivo.objects.create(
            nombre='Galaxy S21',
            estado_activo=True,
            id_marca=self.marca_samsung,
            id_tipo_dispositivo=self.tipo
        )
        self.modelo_s22 = ModeloDispositivo.objects.create(
            nombre='Galaxy S22',
            estado_activo=True,
            id_marca=self.marca_samsung,
            id_tipo_dispositivo=self.tipo
        )
        self.modelo_moto_g = ModeloDispositivo.objects.create(
            nombre='Moto G100',
            estado_activo=True,
            id_marca=self.marca_motorola,
            id_tipo_dispositivo=self.tipo
        )

        self.disp = Dispositivo.objects.create(
            id_usuario=self.cliente,
            id_modelo=self.modelo_s21,
            numero_serie='ORIGINAL-123',
            fecha_registro=date.today()
        )

    def test_editar_dispositivo_exitoso(self):
        """Edición exitosa actualiza campos y crea LogSistema."""
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'id_marca': self.marca_samsung.id_marca,
            'id_modelo': self.modelo_s22.id_modelo,
            'nro_serie': 'NUEVO-SERIE-999'
        }
        response = self.client.put(
            f'/api/workshop/mis-dispositivos/{self.disp.id_dispositivo}/',
            payload,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.disp.refresh_from_db()
        self.assertEqual(self.disp.id_modelo, self.modelo_s22)
        self.assertEqual(self.disp.numero_serie, 'NUEVO-SERIE-999')

        # Verificar LogSistema
        log = LogSistema.objects.filter(
            tabla_afectada='dispositivo',
            id_registro_afectado=str(self.disp.id_dispositivo),
            accion__icontains='Edición'
        ).first()
        self.assertIsNotNone(log)

    def test_bloqueo_por_historial_tecnico(self):
        """Si el equipo tiene al menos una reparación, la edición se bloquea con 400 Bad Request."""
        from workshop_app.models import Reparacion

        Reparacion.objects.create(
            id_dispositivo=self.disp,
            id_usuario=self.cliente,
            fecha_inicio=date.today(),
            etapa='Esperando diagnóstico'
        )

        self.client.force_authenticate(user=self.cliente)
        payload = {
            'id_marca': self.marca_samsung.id_marca,
            'id_modelo': self.modelo_s22.id_modelo,
            'nro_serie': 'INTENTO-SERIE'
        }
        response = self.client.put(
            f'/api/workshop/mis-dispositivos/{self.disp.id_dispositivo}/',
            payload,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('historial técnico', str(response.data))

    def test_permiso_denegado_si_dispositivo_es_de_otro_cliente(self):
        """Si un cliente intenta editar el dispositivo de otro, recibe 403 Forbidden."""
        self.client.force_authenticate(user=self.otro_cliente)
        payload = {
            'id_marca': self.marca_samsung.id_marca,
            'id_modelo': self.modelo_s22.id_modelo,
            'nro_serie': 'HACK-SERIE'
        }
        response = self.client.put(
            f'/api/workshop/mis-dispositivos/{self.disp.id_dispositivo}/',
            payload,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ConsultarDetallesDispositivoCU11Tests(TestCase):
    """
    Pruebas para CU-11: Consultar Detalles del Dispositivo.
    """

    def setUp(self):
        self.client = APIClient()

        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Cliente del servicio'
        )
        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Administrador total'
        )

        self.cliente = Usuario.objects.create(
            email='cliente_cu11@test.com',
            contrasena='hash',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.otro_cliente = Usuario.objects.create(
            email='otro_cu11@test.com',
            contrasena='hash',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )

        self.tipo = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        self.marca = Marca.objects.create(nombre='Samsung', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='Galaxy S23 Ultra',
            estado_activo=True,
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo
        )

        self.dispositivo = Dispositivo.objects.create(
            id_usuario=self.cliente,
            id_modelo=self.modelo,
            numero_serie='S23-ULTRA-001',
            fecha_registro=date.today()
        )

        # Reparación histórica (finalizada)
        from workshop_app.models import Reparacion, Diagnostico, Calificacion
        self.rep_historica = Reparacion.objects.create(
            id_dispositivo=self.dispositivo,
            id_usuario=self.cliente,
            fecha_inicio=date.today(),
            fecha_entrega=date.today(),
            etapa='FINALIZADA',
            desc_cliente='Pantalla rota'
        )
        Diagnostico.objects.create(
            id_reparacion=self.rep_historica,
            descripcion_falla='Cambio de módulo OLED',
            fecha_diagnostico=date.today(),
            costo_diagnostico=120.00
        )
        Calificacion.objects.create(
            id_reparacion=self.rep_historica,
            puntuacion=5,
            comentario='Excelente reparación',
            fecha=date.today()
        )

        # Reparación activa (en curso)
        self.rep_activa = Reparacion.objects.create(
            id_dispositivo=self.dispositivo,
            id_usuario=self.cliente,
            fecha_inicio=date.today(),
            etapa='En Diagnóstico',
            codigo_sec='SEC-ACTIVO-99',
            desc_cliente='Batería no carga'
        )

    def test_consultar_detalles_dispositivo_exitoso(self):
        """El cliente propietario consulta su equipo y obtiene ficha, reparación activa e historial."""
        self.client.force_authenticate(user=self.cliente)
        response = self.client.get(f'/api/workshop/dispositivos/{self.dispositivo.id_dispositivo}/detalles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.data
        self.assertEqual(data['id_dispositivo'], self.dispositivo.id_dispositivo)
        self.assertEqual(data['marca'], 'Samsung')
        self.assertEqual(data['modelo'], 'Galaxy S23 Ultra')
        self.assertEqual(data['tipo'], 'Smartphone')

        # Reparación activa
        self.assertIsNotNone(data['reparacion_activa'])
        self.assertEqual(data['reparacion_activa']['etapa'], 'En Diagnóstico')
        self.assertEqual(data['reparacion_activa']['codigo_sec'], 'SEC-ACTIVO-99')

        # Historial de reparaciones
        self.assertTrue(len(data['historial_reparaciones']) >= 1)
        rep_hist = [r for r in data['historial_reparaciones'] if r['id_reparacion'] == self.rep_historica.id_reparacion][0]
        self.assertEqual(rep_hist['calificacion']['puntuacion'], 5)

    def test_seguridad_horizontal_bloquea_otro_cliente(self):
        """Un cliente diferente no puede ver los detalles del dispositivo de otro (403 Forbidden)."""
        self.client.force_authenticate(user=self.otro_cliente)
        response = self.client.get(f'/api/workshop/dispositivos/{self.dispositivo.id_dispositivo}/detalles/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_dispositivo_inexistente_retorna_404(self):
        """Si el ID de dispositivo no existe, retorna 404 Not Found."""
        self.client.force_authenticate(user=self.cliente)
        response = self.client.get('/api/workshop/dispositivos/999999/detalles/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ConsultarDetalleReparacionCU61Tests(TestCase):
    """
    Pruebas para CU-61: Consultar Detalle de Reparación (Seguridad Horizontal y Vertical).
    """

    def setUp(self):
        self.client = APIClient()

        self.rol_cliente = RolUsuario.objects.create(codigo='CLIENTE', nombre_rol='Cliente')
        self.rol_tecnico = RolUsuario.objects.create(codigo='TECNICO', nombre_rol='Técnico')
        self.rol_admin = RolUsuario.objects.create(codigo='ADMIN', nombre_rol='Administrador')

        self.cliente = Usuario.objects.create(
            email='dueno@test.com',
            contrasena='hash',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.otro_cliente = Usuario.objects.create(
            email='ajeno@test.com',
            contrasena='hash',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico_cu61@test.com',
            contrasena='hash',
            fecha_registro=date.today(),
            id_rol=self.rol_tecnico,
            is_active=True
        )

        self.tipo = TipoDispositivo.objects.create(nombre='Tablet', estado_activo=True)
        self.marca = Marca.objects.create(nombre='Apple', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='iPad Pro',
            estado_activo=True,
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo
        )
        self.dispositivo = Dispositivo.objects.create(
            id_usuario=self.cliente,
            id_modelo=self.modelo,
            numero_serie='IPAD-PRO-99',
            fecha_registro=date.today()
        )

        from workshop_app.models import Reparacion, Diagnostico, BitacoraReparacion, DetalleInsumoReparacion, Calificacion
        from catalog_app.models import CategoriaProducto, Producto
        from datetime import time

        self.categoria_prod = CategoriaProducto.objects.create(
            nombre='Repuestos Pantalla',
            estado=True
        )
        self.repuesto = Producto.objects.create(
            nombre='Pantalla Liquid Retina',
            precio_venta=300.00,
            estado=True,
            apto_venta=False,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=False,
            id_categoria=self.categoria_prod
        )

        self.reparacion = Reparacion.objects.create(
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico,
            fecha_inicio=date.today(),
            hora_recepcion=time(10, 30),
            etapa='En Reparación',
            codigo_sec='SEC-TOP-SECRET',
            desc_cliente='Táctil no responde',
            credencial_acceso='PIN_1234'
        )

        Diagnostico.objects.create(
            id_reparacion=self.reparacion,
            descripcion_falla='Flex dañado',
            fecha_diagnostico=date.today(),
            costo_diagnostico=450.00
        )
        BitacoraReparacion.objects.create(
            id_reparacion=self.reparacion,
            id_usuario=self.tecnico,
            fecha_hora=time(11, 0),
            estado_alcanzado=2,
            comentario='Desarmado e inspección de flex completada'
        )
        DetalleInsumoReparacion.objects.create(
            id_reparacion=self.reparacion,
            id_producto=self.repuesto,
            cantidad=1,
            precio_unitario=300.00
        )
        Calificacion.objects.create(
            id_reparacion=self.reparacion,
            puntuacion=4,
            comentario='Muy rápido servicio',
            fecha=date.today()
        )

    def test_seguridad_vertical_cliente_no_ve_credenciales(self):
        """El Cliente accede a su reparación pero credencial_acceso y codigo_sec están censurados (None)."""
        self.client.force_authenticate(user=self.cliente)
        response = self.client.get(f'/api/workshop/reparaciones/{self.reparacion.id_reparacion}/detalles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertIsNone(data['credencial_acceso'])
        self.assertIsNone(data['codigo_sec'])
        self.assertEqual(data['dispositivo']['modelo'], 'iPad Pro')
        self.assertEqual(len(data['bitacora']), 1)
        self.assertEqual(len(data['insumos']), 1)
        self.assertEqual(data['insumos'][0]['nombre_producto'], 'Pantalla Liquid Retina')
        self.assertEqual(data['calificacion']['puntuacion'], 4)

    def test_seguridad_vertical_tecnico_ve_credenciales(self):
        """Un Técnico o Admin sí tiene acceso a la credencial_acceso y codigo_sec para operar el equipo."""
        self.client.force_authenticate(user=self.tecnico)
        response = self.client.get(f'/api/workshop/reparaciones/{self.reparacion.id_reparacion}/detalles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(data['credencial_acceso'], 'PIN_1234')
        self.assertEqual(data['codigo_sec'], 'SEC-TOP-SECRET')

    def test_seguridad_horizontal_cliente_ajeno_bloqueado(self):
        """Un cliente ajeno recibe 403 Forbidden al intentar ver la reparación de otro cliente."""
        self.client.force_authenticate(user=self.otro_cliente)
        response = self.client.get(f'/api/workshop/reparaciones/{self.reparacion.id_reparacion}/detalles/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("No posee permisos sobre este equipo", str(response.data))


class CategoriaReparacionCU62CU63CU64Tests(TestCase):
    """
    Pruebas unitarias para:
    - CU-62: Crear Categoría de Reparación
    - CU-63: Cambiar Estado de Categoría de Reparación
    - CU-64: Filtrar Categoría de Reparación
    """

    def setUp(self):
        from users_app.models import Usuario, RolUsuario
        from workshop_app.models import CategoriaReparacion

        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Administrador total'
        )
        self.rol_tecnico = RolUsuario.objects.create(
            codigo='TECNICO',
            nombre_rol='Técnico',
            descripcion='Técnico de taller'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Cliente del servicio'
        )

        self.admin = Usuario.objects.create(
            email='admin.rep@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_admin,
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.rep@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_tecnico,
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente.rep@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )

        self.cat1 = CategoriaReparacion.objects.create(
            nombre='Cambio de Módulo',
            estado_activo=True
        )
        self.cat2 = CategoriaReparacion.objects.create(
            nombre='Microelectrónica Avanzada',
            estado_activo=False
        )

        self.client = APIClient()

    def test_selector_filtrar_categorias_reparacion_texto_y_estado(self):
        from workshop_app.selectors import filtrar_categorias_reparacion

        # 1. Sin filtros -> todas
        todas = list(filtrar_categorias_reparacion())
        self.assertEqual(len(todas), 2)

        # 2. Filtro de texto parcial
        filtradas_txt = list(filtrar_categorias_reparacion(texto_busqueda='módulo'))
        self.assertEqual(len(filtradas_txt), 1)
        self.assertEqual(filtradas_txt[0].nombre, 'Cambio de Módulo')

        # 3. Filtro por estado activo True (booleano)
        activas_bool = list(filtrar_categorias_reparacion(estado_activo=True))
        self.assertEqual(len(activas_bool), 1)
        self.assertEqual(activas_bool[0].nombre, 'Cambio de Módulo')

        # 4. Filtro por estado inactivo 'False' (string desde query param)
        inactivas_str = list(filtrar_categorias_reparacion(estado_activo='False'))
        self.assertEqual(len(inactivas_str), 1)
        self.assertEqual(inactivas_str[0].nombre, 'Microelectrónica Avanzada')

        # 5. Filtro estado 'todos' -> no filtra
        todos_param = list(filtrar_categorias_reparacion(estado_activo='todos'))
        self.assertEqual(len(todos_param), 2)

    def test_selector_obtener_categoria_reparacion(self):
        from workshop_app.selectors import obtener_categoria_reparacion
        from django.core.exceptions import ObjectDoesNotExist

        # 1. Existente
        cat = obtener_categoria_reparacion(self.cat1.id_categoria)
        self.assertEqual(cat.id_categoria, self.cat1.id_categoria)
        self.assertEqual(cat.nombre, 'Cambio de Módulo')

        # 2. Inexistente -> ObjectDoesNotExist
        with self.assertRaises(ObjectDoesNotExist):
            obtener_categoria_reparacion(99999)

    def test_serializer_unicidad_case_insensitive(self):
        from workshop_app.serializers import CategoriaReparacionCreateInputSerializer

        # Nombre duplicado case-insensitive
        serializer_dup = CategoriaReparacionCreateInputSerializer(data={'nombre': 'CAMBIO DE MÓDULO'})
        self.assertFalse(serializer_dup.is_valid())
        self.assertIn('nombre', serializer_dup.errors)
        self.assertIn(
            "Ya existe una categoría con ese nombre. Por favor, ingrese un nombre distinto",
            str(serializer_dup.errors['nombre'])
        )

        # Nombre nuevo
        serializer_ok = CategoriaReparacionCreateInputSerializer(data={'nombre': 'Cambio de Batería'})
        self.assertTrue(serializer_ok.is_valid())

    def test_service_crear_categoria_reparacion_y_auditoria(self):
        from workshop_app.services import crear_categoria_reparacion
        from core_app.models import LogSistema

        nueva_cat = crear_categoria_reparacion(
            usuario_admin=self.admin,
            nombre='Reparación de FaceID'
        )

        self.assertIsNotNone(nueva_cat.id_categoria)
        self.assertEqual(nueva_cat.nombre, 'Reparación de FaceID')
        self.assertTrue(nueva_cat.estado_activo)

        # LogSistema
        log = LogSistema.objects.filter(
            tabla_afectada='categoria_reparacion',
            id_registro_afectado=str(nueva_cat.id_categoria)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.accion, 'Alta de Categoría de Reparación (CU-62)')
        self.assertEqual(log.id_usuario, self.admin)

    def test_service_cambiar_estado_categoria_reparacion_y_auditoria(self):
        from workshop_app.services import cambiar_estado_categoria_reparacion
        from core_app.models import LogSistema

        # 1. Desactivar (Soft delete)
        cat_inactiva = cambiar_estado_categoria_reparacion(
            usuario_admin=self.admin,
            id_categoria=self.cat1.id_categoria
        )
        self.assertFalse(cat_inactiva.estado_activo)

        log1 = LogSistema.objects.filter(
            tabla_afectada='categoria_reparacion',
            id_registro_afectado=str(self.cat1.id_categoria)
        ).order_by('-id_log').first()
        self.assertIsNotNone(log1)
        self.assertIn('Soft Delete', log1.detalle)

        # 2. Reactivar (Restauración)
        cat_activa = cambiar_estado_categoria_reparacion(
            usuario_admin=self.admin,
            id_categoria=self.cat1.id_categoria
        )
        self.assertTrue(cat_activa.estado_activo)

        log2 = LogSistema.objects.filter(
            tabla_afectada='categoria_reparacion',
            id_registro_afectado=str(self.cat1.id_categoria)
        ).order_by('-id_log').first()
        self.assertIn('Restauración', log2.detalle)

    def test_api_filtrar_categorias_reparacion_permisos_y_roles(self):
        # 1. No autenticado -> 401 / 403
        res_anon = self.client.get('/api/workshop/categorias-reparacion/')
        self.assertIn(res_anon.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 2. Cliente denegado -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cli = self.client.get('/api/workshop/categorias-reparacion/')
        self.assertEqual(res_cli.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Técnico permitido -> 200
        self.client.force_authenticate(user=self.tecnico)
        res_tec = self.client.get('/api/workshop/categorias-reparacion/')
        self.assertEqual(res_tec.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_tec.data), 2)

        # 4. Admin permitido con query param buscar -> 200
        self.client.force_authenticate(user=self.admin)
        res_adm = self.client.get('/api/workshop/categorias-reparacion/?buscar=módulo')
        self.assertEqual(res_adm.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_adm.data), 1)
        self.assertEqual(res_adm.data[0]['nombre'], 'Cambio de Módulo')

    def test_api_crear_categoria_reparacion_permisos_y_validacion(self):
        # 1. Técnico no puede crear -> 403
        self.client.force_authenticate(user=self.tecnico)
        res_tec = self.client.post('/api/workshop/categorias-reparacion/', data={'nombre': 'Soldadura'}, format='json')
        self.assertEqual(res_tec.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Cliente no puede crear -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cli = self.client.post('/api/workshop/categorias-reparacion/', data={'nombre': 'Soldadura'}, format='json')
        self.assertEqual(res_cli.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Admin duplicado -> 400
        self.client.force_authenticate(user=self.admin)
        res_dup = self.client.post('/api/workshop/categorias-reparacion/', data={'nombre': 'cambio de módulo'}, format='json')
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Ya existe una categoría con ese nombre', str(res_dup.data))

        # 4. Admin creación exitosa -> 201
        res_ok = self.client.post('/api/workshop/categorias-reparacion/', data={'nombre': 'Reballing CPU'}, format='json')
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ok.data['nombre'], 'Reballing CPU')
        self.assertTrue(res_ok.data['estado_activo'])

    def test_api_cambiar_estado_categoria_reparacion(self):
        # 1. Técnico denegado -> 403
        self.client.force_authenticate(user=self.tecnico)
        res_tec = self.client.patch(f'/api/workshop/categorias-reparacion/{self.cat1.id_categoria}/estado/')
        self.assertEqual(res_tec.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin con ID inexistente -> 404
        self.client.force_authenticate(user=self.admin)
        res_404 = self.client.patch('/api/workshop/categorias-reparacion/99999/estado/')
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Admin toggle exitoso -> 200
        res_toggle1 = self.client.patch(f'/api/workshop/categorias-reparacion/{self.cat1.id_categoria}/estado/')
        self.assertEqual(res_toggle1.status_code, status.HTTP_200_OK)
        self.assertFalse(res_toggle1.data['estado_activo'])

        # 4. Segundo toggle -> 200
        res_toggle2 = self.client.patch(f'/api/workshop/categorias-reparacion/{self.cat1.id_categoria}/estado/')
        self.assertEqual(res_toggle2.status_code, status.HTTP_200_OK)
        self.assertTrue(res_toggle2.data['estado_activo'])
