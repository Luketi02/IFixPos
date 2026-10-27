from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from datetime import date
from decimal import Decimal
from rest_framework.exceptions import ValidationError

from workshop_app.models import Dispositivo, CategoriaReparacion, Reparacion, BitacoraReparacion, Diagnostico
from catalog_app.models import TipoDispositivo, Marca, ModeloDispositivo
from users_app.models import Usuario, RolUsuario, PerfilUsuario
from core_app.models import LogSistema, Notificacion
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

        # 2. Cliente denegado sin filtro de estado activo -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cli = self.client.get('/api/workshop/categorias-reparacion/')
        self.assertEqual(res_cli.status_code, status.HTTP_403_FORBIDDEN)

        # 2b. Cliente permitido al consultar categorías activas para CU-26 -> 200
        res_cli_activas = self.client.get('/api/workshop/categorias-reparacion/?estado=true')
        self.assertEqual(res_cli_activas.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_cli_activas.data), 1)
        self.assertEqual(res_cli_activas.data[0]['nombre'], 'Cambio de Módulo')

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


# ==============================================================================
# CU-33: FILTRAR DISPOSITIVO (TALLER Y ADMINISTRACIÓN)
# ==============================================================================

class FiltrarDispositivoCU33Tests(TestCase):
    """
    Pruebas unitarias y de integración para CU-33: Filtrar Dispositivo.
    Verifica:
    - Precondición: Roles permitidos (ADMIN, TECNICO) y denegación para CLIENTE o anónimos.
    - Búsqueda exacta: DNI del Cliente, Código de Seguridad, Número de Serie, Marca, Modelo.
    - Validaciones estrictas: DNI inválido (letras), Código de seguridad inválido, Rango invertido.
    - Filtros categóricos y temporales: Etapa, Técnico asignado, Rango de fechas de ingreso.
    - Consulta combinada compleja (Etapa + Técnico + Rango de fechas).
    - Excepción Paso 5: Mensaje 'No se encontraron resultados' con HTTP 200.
    - Integridad de los 5 conceptos requeridos en la respuesta.
    """

    def setUp(self):
        self.client = APIClient()

        from users_app.models import PerfilUsuario
        from workshop_app.models import Reparacion

        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Administrador total'
        )
        self.rol_tecnico = RolUsuario.objects.create(
            codigo='TECNICO',
            nombre_rol='Técnico del Taller',
            descripcion='Personal técnico del taller'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Cliente del servicio'
        )

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin_cu33@test.com',
            contrasena='hash',
            fecha_registro=date(2026, 1, 1),
            id_rol=self.rol_admin,
            is_active=True
        )
        self.tecnico_1 = Usuario.objects.create(
            email='tecnico1_cu33@test.com',
            contrasena='hash',
            fecha_registro=date(2026, 1, 1),
            id_rol=self.rol_tecnico,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.tecnico_1,
            dni='30111222',
            nombre='Carlos',
            apellido='Técnico',
            telefono='11112222'
        )

        self.tecnico_2 = Usuario.objects.create(
            email='tecnico2_cu33@test.com',
            contrasena='hash',
            fecha_registro=date(2026, 1, 1),
            id_rol=self.rol_tecnico,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.tecnico_2,
            dni='30333444',
            nombre='Laura',
            apellido='Técnica',
            telefono='33334444'
        )

        self.cliente_1 = Usuario.objects.create(
            email='cliente1_cu33@test.com',
            contrasena='hash',
            fecha_registro=date(2026, 1, 5),
            id_rol=self.rol_cliente,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente_1,
            dni='40123456',
            nombre='Juan',
            apellido='Pérez',
            telefono='1122334455'
        )

        self.cliente_2 = Usuario.objects.create(
            email='cliente2_cu33@test.com',
            contrasena='hash',
            fecha_registro=date(2026, 1, 6),
            id_rol=self.rol_cliente,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente_2,
            dni='40987654',
            nombre='María',
            apellido='Gómez',
            telefono='1199887766'
        )

        # Catálogo
        self.tipo_smartphone = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        self.tipo_notebook = TipoDispositivo.objects.create(nombre='Notebook', estado_activo=True)
        self.marca_apple = Marca.objects.create(nombre='Apple', estado_activo=True)
        self.marca_samsung = Marca.objects.create(nombre='Samsung', estado_activo=True)

        self.modelo_iphone = ModeloDispositivo.objects.create(
            nombre='iPhone 13',
            estado_activo=True,
            id_marca=self.marca_apple,
            id_tipo_dispositivo=self.tipo_smartphone
        )
        self.modelo_galaxy = ModeloDispositivo.objects.create(
            nombre='Galaxy S21',
            estado_activo=True,
            id_marca=self.marca_samsung,
            id_tipo_dispositivo=self.tipo_smartphone
        )

        # Dispositivos
        self.disp_1 = Dispositivo.objects.create(
            id_usuario=self.cliente_1,
            id_modelo=self.modelo_iphone,
            numero_serie='IPHONE-SN-100',
            fecha_registro=date(2026, 1, 10)
        )
        self.disp_2 = Dispositivo.objects.create(
            id_usuario=self.cliente_1,
            id_modelo=self.modelo_galaxy,
            numero_serie='SAMSUNG-SN-200',
            fecha_registro=date(2026, 2, 1)
        )
        self.disp_3 = Dispositivo.objects.create(
            id_usuario=self.cliente_2,
            id_modelo=self.modelo_iphone,
            numero_serie='IPHONE-SN-300',
            fecha_registro=date(2026, 3, 5)
        )

        # Reparaciones vinculadas
        self.rep_1 = Reparacion.objects.create(
            id_dispositivo=self.disp_1,
            id_usuario=self.tecnico_1,
            fecha_inicio=date(2026, 2, 10),
            etapa='En reparación',
            codigo_sec='SEC-100-AAA',
            desc_cliente='Pantalla rota'
        )
        self.rep_2 = Reparacion.objects.create(
            id_dispositivo=self.disp_2,
            id_usuario=self.tecnico_2,
            fecha_inicio=date(2026, 2, 20),
            fecha_entrega=date(2026, 2, 25),
            etapa='Finalizado',
            codigo_sec='SEC-200-BBB',
            desc_cliente='Batería agotada'
        )
        self.rep_3 = Reparacion.objects.create(
            id_dispositivo=self.disp_3,
            id_usuario=self.tecnico_1,
            fecha_inicio=date(2026, 3, 15),
            etapa='Esperando dispositivo',
            codigo_sec='SEC-300-CCC',
            desc_cliente='Falla de conector'
        )

    def test_precondicion_autenticacion_requerida(self):
        """Un usuario anónimo no autenticado recibe 401 Unauthorized o 403 Forbidden."""
        response = self.client.get('/api/workshop/dispositivos/taller/filtrar/')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_precondicion_autorizacion_roles(self):
        """El rol CLIENTE recibe 403 Forbidden; TECNICO y ADMIN reciben 200 OK."""
        # Cliente -> 403
        self.client.force_authenticate(user=self.cliente_1)
        response_cli = self.client.get('/api/workshop/dispositivos/taller/filtrar/')
        self.assertEqual(response_cli.status_code, status.HTTP_403_FORBIDDEN)

        # Técnico -> 200
        self.client.force_authenticate(user=self.tecnico_1)
        response_tec = self.client.get('/api/workshop/dispositivos/taller/filtrar/')
        self.assertEqual(response_tec.status_code, status.HTTP_200_OK)

        # Admin -> 200
        self.client.force_authenticate(user=self.admin)
        response_adm = self.client.get('/api/workshop/dispositivos/taller/filtrar/')
        self.assertEqual(response_adm.status_code, status.HTTP_200_OK)

    def test_busqueda_exacta_dni_cliente(self):
        """Filtrar por DNI del cliente retorna sus dispositivos."""
        self.client.force_authenticate(user=self.tecnico_1)
        response = self.client.get('/api/workshop/dispositivos/taller/filtrar/?dni_cliente=40123456')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [d['id_dispositivo'] for d in response.data]
        self.assertIn(self.disp_1.id_dispositivo, ids)
        self.assertIn(self.disp_2.id_dispositivo, ids)
        self.assertNotIn(self.disp_3.id_dispositivo, ids)

        # Alias 'dni'
        response_alias = self.client.get('/api/workshop/dispositivos/taller/filtrar/?dni=40987654')
        self.assertEqual(response_alias.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response_alias.data), 1)
        self.assertEqual(response_alias.data[0]['id_dispositivo'], self.disp_3.id_dispositivo)

    def test_busqueda_exacta_dni_invalido_excepcion_paso_4(self):
        """Si el DNI contiene letras, interrumpe el procesamiento con 400 Bad Request."""
        self.client.force_authenticate(user=self.tecnico_1)
        response = self.client.get('/api/workshop/dispositivos/taller/filtrar/?dni_cliente=40123A56')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('dni_cliente', response.data)

    def test_busqueda_exacta_codigo_sec_reparacion(self):
        """Filtrar por código de seguridad de reparación retorna el dispositivo asociado."""
        self.client.force_authenticate(user=self.tecnico_1)
        response = self.client.get('/api/workshop/dispositivos/taller/filtrar/?codigo_sec_reparacion=SEC-100-AAA')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_dispositivo'], self.disp_1.id_dispositivo)

        # Alias 'codigo_sec'
        response_alias = self.client.get('/api/workshop/dispositivos/taller/filtrar/?codigo_sec=SEC-200-BBB')
        self.assertEqual(response_alias.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response_alias.data), 1)
        self.assertEqual(response_alias.data[0]['id_dispositivo'], self.disp_2.id_dispositivo)

    def test_busqueda_exacta_codigo_sec_invalido_excepcion_paso_4(self):
        """Código de seguridad con caracteres no permitidos retorna 400 Bad Request."""
        self.client.force_authenticate(user=self.tecnico_1)
        response = self.client.get('/api/workshop/dispositivos/taller/filtrar/?codigo_sec_reparacion=SEC$#@!')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('codigo_sec_reparacion', response.data)

    def test_busqueda_exacta_nro_serie(self):
        """Búsqueda exacta por número de serie."""
        self.client.force_authenticate(user=self.tecnico_1)
        response = self.client.get('/api/workshop/dispositivos/taller/filtrar/?nro_serie=SAMSUNG-SN-200')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_dispositivo'], self.disp_2.id_dispositivo)

    def test_filtro_por_marca_y_modelo(self):
        """Filtrado por marca (ID y nombre) y modelo (ID y nombre)."""
        self.client.force_authenticate(user=self.tecnico_1)

        # Por nombre de marca 'Apple'
        res_marca = self.client.get('/api/workshop/dispositivos/taller/filtrar/?marca=Apple')
        self.assertEqual(res_marca.status_code, status.HTTP_200_OK)
        ids = [d['id_dispositivo'] for d in res_marca.data]
        self.assertIn(self.disp_1.id_dispositivo, ids)
        self.assertIn(self.disp_3.id_dispositivo, ids)
        self.assertNotIn(self.disp_2.id_dispositivo, ids)

        # Por id_marca Samsung
        res_id_marca = self.client.get(f'/api/workshop/dispositivos/taller/filtrar/?id_marca={self.marca_samsung.id_marca}')
        self.assertEqual(res_id_marca.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_id_marca.data), 1)
        self.assertEqual(res_id_marca.data[0]['id_dispositivo'], self.disp_2.id_dispositivo)

        # Por nombre de modelo 'Galaxy S21'
        res_modelo = self.client.get('/api/workshop/dispositivos/taller/filtrar/?modelo=Galaxy S21')
        self.assertEqual(res_modelo.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_modelo.data), 1)
        self.assertEqual(res_modelo.data[0]['id_dispositivo'], self.disp_2.id_dispositivo)

        # Por id_modelo iPhone 13
        res_id_mod = self.client.get(f'/api/workshop/dispositivos/taller/filtrar/?id_modelo={self.modelo_iphone.id_modelo}')
        self.assertEqual(res_id_mod.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_id_mod.data), 2)

    def test_filtro_categorico_etapa_reparacion(self):
        """Filtrar por etapa/estado del ciclo de vida de la reparación."""
        self.client.force_authenticate(user=self.tecnico_1)
        response = self.client.get('/api/workshop/dispositivos/taller/filtrar/?etapa_reparacion=En reparación')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_dispositivo'], self.disp_1.id_dispositivo)

    def test_filtro_categorico_tecnico_asignado(self):
        """Filtrar por técnico asignado a la reparación."""
        self.client.force_authenticate(user=self.tecnico_1)

        # Técnico 1 (disp_1 y disp_3)
        res_tec1 = self.client.get(f'/api/workshop/dispositivos/taller/filtrar/?id_tecnico_asignado={self.tecnico_1.id_usuario}')
        self.assertEqual(res_tec1.status_code, status.HTTP_200_OK)
        ids = [d['id_dispositivo'] for d in res_tec1.data]
        self.assertIn(self.disp_1.id_dispositivo, ids)
        self.assertIn(self.disp_3.id_dispositivo, ids)
        self.assertNotIn(self.disp_2.id_dispositivo, ids)

        # Técnico 2 (disp_2)
        res_tec2 = self.client.get(f'/api/workshop/dispositivos/taller/filtrar/?id_tecnico_asignado={self.tecnico_2.id_usuario}')
        self.assertEqual(res_tec2.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_tec2.data), 1)
        self.assertEqual(res_tec2.data[0]['id_dispositivo'], self.disp_2.id_dispositivo)

    def test_filtro_temporal_rango_fechas(self):
        """Filtrar por rango de fecha de ingreso (desde / hasta)."""
        self.client.force_authenticate(user=self.tecnico_1)
        # Rango febrero: disp_1 (10 feb) y disp_2 (20 feb), no disp_3 (15 mar)
        response = self.client.get('/api/workshop/dispositivos/taller/filtrar/?fecha_ingreso_desde=2026-02-01&fecha_ingreso_hasta=2026-02-28')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [d['id_dispositivo'] for d in response.data]
        self.assertIn(self.disp_1.id_dispositivo, ids)
        self.assertIn(self.disp_2.id_dispositivo, ids)
        self.assertNotIn(self.disp_3.id_dispositivo, ids)

    def test_filtro_temporal_fechas_invertidas_excepcion_paso_4(self):
        """Si fecha_ingreso_desde es posterior a fecha_ingreso_hasta -> 400 Bad Request."""
        self.client.force_authenticate(user=self.tecnico_1)
        response = self.client.get('/api/workshop/dispositivos/taller/filtrar/?fecha_ingreso_desde=2026-03-01&fecha_ingreso_hasta=2026-02-01')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('fecha_ingreso_desde', response.data)

    def test_filtro_combinado_complejo(self):
        """
        Consulta transaccional compleja:
        Estado ('En reparación') + Técnico 1 + Rango de fechas de febrero.
        """
        self.client.force_authenticate(user=self.admin)
        url = (
            f'/api/workshop/dispositivos/taller/filtrar/'
            f'?etapa_reparacion=En reparación'
            f'&id_tecnico_asignado={self.tecnico_1.id_usuario}'
            f'&fecha_ingreso_desde=2026-02-01'
            f'&fecha_ingreso_hasta=2026-02-28'
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_dispositivo'], self.disp_1.id_dispositivo)

    def test_sin_resultados_excepcion_paso_5(self):
        """Si no coincide ningún registro -> HTTP 200 con mensaje 'No se encontraron resultados'."""
        self.client.force_authenticate(user=self.tecnico_1)
        response = self.client.get('/api/workshop/dispositivos/taller/filtrar/?nro_serie=INEXISTENTE-999')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('mensaje', response.data)
        self.assertEqual(response.data['mensaje'], 'No se encontraron resultados')
        self.assertEqual(response.data['resultados'], [])

    def test_conceptos_completos_en_respuesta(self):
        """
        Verifica que la salida contiene íntegramente los 5 conceptos requeridos:
        1. Dispositivo
        2. Reparación
        3. Usuario (Cliente y Técnico Asignado)
        4. Marca
        5. Modelo
        """
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f'/api/workshop/dispositivos/taller/filtrar/?nro_serie=IPHONE-SN-100')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        item = response.data[0]

        # 1. Dispositivo
        self.assertEqual(item['id_dispositivo'], self.disp_1.id_dispositivo)
        self.assertEqual(item['numero_serie'], 'IPHONE-SN-100')
        self.assertEqual(item['fecha_registro'], '2026-01-10')

        # 2. Reparación
        self.assertTrue(len(item['reparaciones']) >= 1)
        rep = item['reparaciones'][0]
        self.assertEqual(rep['id_reparacion'], self.rep_1.id_reparacion)
        self.assertEqual(rep['etapa'], 'En reparación')
        self.assertEqual(rep['codigo_sec'], 'SEC-100-AAA')
        self.assertEqual(rep['fecha_inicio'], '2026-02-10')

        # 3. Usuario: Cliente y Técnico Asignado
        self.assertIsNotNone(item['cliente'])
        self.assertEqual(item['cliente']['id_usuario'], self.cliente_1.id_usuario)
        self.assertEqual(item['cliente']['dni'], '40123456')
        self.assertEqual(item['cliente']['nombre'], 'Juan')
        self.assertEqual(item['cliente']['apellido'], 'Pérez')
        self.assertEqual(item['cliente']['nombre_completo'], 'Juan Pérez')

        self.assertIsNotNone(rep['tecnico_asignado'])
        self.assertEqual(rep['tecnico_asignado']['id_usuario'], self.tecnico_1.id_usuario)
        self.assertEqual(rep['tecnico_asignado']['nombre_completo'], 'Carlos Técnico')

        # 4. Marca
        self.assertEqual(item['id_marca'], self.marca_apple.id_marca)
        self.assertEqual(item['marca'], 'Apple')

        # 5. Modelo
        self.assertEqual(item['id_modelo'], self.modelo_iphone.id_modelo)
        self.assertEqual(item['modelo'], 'iPhone 13')
        self.assertEqual(item['id_tipo'], self.tipo_smartphone.id_tipo_dispositivo)
        self.assertEqual(item['tipo'], 'Smartphone')

    def test_ruta_alias_dispositivos_filtrar(self):
        """Verifica que el alias /api/workshop/dispositivos/filtrar/ responde exitosamente."""
        self.client.force_authenticate(user=self.tecnico_1)
        response = self.client.get('/api/workshop/dispositivos/filtrar/?nro_serie=SAMSUNG-SN-200')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_dispositivo'], self.disp_2.id_dispositivo)


# ==============================================================================
# CU-26: INICIAR REPARACIÓN (ORDEN DE SERVICIO)
# ==============================================================================

class IniciarReparacionCU26Tests(TestCase):
    """
    Pruebas unitarias y de integración para CU-26: Iniciar Reparación.
    Cubre:
    - Precondición de autenticación y rol.
    - Apertura exitosa por Cliente (etapa 'ESPERANDO_DISPOSITIVO', bitácora estado 1).
    - Apertura exitosa por Técnico o Admin (etapa 'ESPERANDO_DIAGNOSTICO', bitácora estado 2).
    - Generación y asignación de código de seguridad alfanumérico de 6 caracteres.
    - Creación de BitacoraReparacion asociada con comentario "Apertura de orden de servicio".
    - Auditoría en LogSistema.
    - Bloqueo de dispositivo con reparación en curso (Excepción Paso 1).
    - Aprobación de inicio si la reparación previa ya está finalizada o entregada.
    - Aislamiento y validación de propiedad para clientes (prohibición de iniciar en equipos ajenos).
    - Validación de descripción mínima (Excepción Paso 4: al menos 10 caracteres).
    - Validación de credencial de acceso (admite "Ninguna" o PIN/Patrón).
    - Validación de categorías obligatorias (mínimo 1 y existencia en BD).
    - Prueba unitaria del selector dispositivo_tiene_reparacion_activa.
    """

    def setUp(self):
        self.client = APIClient()

        from users_app.models import PerfilUsuario
        from workshop_app.models import Reparacion, CategoriaReparacion, BitacoraReparacion

        # Roles
        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Administrador total'
        )
        self.rol_tecnico = RolUsuario.objects.create(
            codigo='TECNICO',
            nombre_rol='Técnico del Taller',
            descripcion='Personal técnico del taller'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Cliente del servicio'
        )

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin_cu26@test.com',
            contrasena='hash',
            fecha_registro=date(2026, 1, 1),
            id_rol=self.rol_admin,
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico_cu26@test.com',
            contrasena='hash',
            fecha_registro=date(2026, 1, 1),
            id_rol=self.rol_tecnico,
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente_cu26@test.com',
            contrasena='hash',
            fecha_registro=date(2026, 1, 1),
            id_rol=self.rol_cliente,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente,
            dni='45112233',
            nombre='Lucas',
            apellido='Cliente',
            telefono='1144556677'
        )

        self.otro_cliente = Usuario.objects.create(
            email='otro_cu26@test.com',
            contrasena='hash',
            fecha_registro=date(2026, 1, 1),
            id_rol=self.rol_cliente,
            is_active=True
        )

        # Catálogo
        self.tipo = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        self.marca = Marca.objects.create(nombre='Motorola', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='Edge 40',
            estado_activo=True,
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo
        )

        # Categorías de reparación
        self.cat_pantalla = CategoriaReparacion.objects.create(nombre='Pantalla y Display', estado_activo=True)
        self.cat_bateria = CategoriaReparacion.objects.create(nombre='Batería y Carga', estado_activo=True)

        # Dispositivos
        self.disp_cliente = Dispositivo.objects.create(
            id_usuario=self.cliente,
            id_modelo=self.modelo,
            numero_serie='MOTO-EDGE-001',
            fecha_registro=date(2026, 1, 15)
        )
        self.disp_otro = Dispositivo.objects.create(
            id_usuario=self.otro_cliente,
            id_modelo=self.modelo,
            numero_serie='MOTO-EDGE-999',
            fecha_registro=date(2026, 1, 16)
        )

    def test_precondicion_autenticacion(self):
        """Un usuario anónimo no autenticado no puede iniciar reparación (401 o 403)."""
        payload = {
            'id_dispositivo': self.disp_cliente.id_dispositivo,
            'descripcion_problema': 'No enciende la pantalla tras caída',
            'credencial_acceso': 'PIN: 1234',
            'ids_categorias': [self.cat_pantalla.id_categoria]
        }
        response = self.client.post('/api/workshop/reparaciones/iniciar/', payload, format='json')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_cliente_inicia_reparacion_exitoso(self):
        """
        Cliente inicia reparación en su equipo:
        - HTTP 201 Created.
        - Estado inicial: 'ESPERANDO_DISPOSITIVO'.
        - Token de seguridad de 6 caracteres generado.
        - Bitácora creada con estado_alcanzado=1 y comentario correspondiente.
        - LogSistema de auditoría creado.
        """
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'id_dispositivo': self.disp_cliente.id_dispositivo,
            'descripcion_problema': 'El módulo de pantalla táctil no responde al tacto.',
            'credencial_acceso': 'Patrón en L invertida',
            'ids_categorias': [self.cat_pantalla.id_categoria, self.cat_bateria.id_categoria]
        }
        response = self.client.post('/api/workshop/reparaciones/iniciar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('id_reparacion', response.data)
        self.assertIn('codigo_seguridad', response.data)
        self.assertEqual(response.data['etapa'], 'ESPERANDO_DISPOSITIVO')
        self.assertEqual(len(response.data['codigo_seguridad']), 6)

        from workshop_app.models import Reparacion, BitacoraReparacion
        reparacion = Reparacion.objects.get(pk=response.data['id_reparacion'])
        self.assertEqual(reparacion.etapa, 'ESPERANDO_DISPOSITIVO')
        self.assertEqual(reparacion.credencial_acceso, 'Patrón en L invertida')
        self.assertEqual(reparacion.categorias.count(), 2)

        # Bitácora
        bitacora = BitacoraReparacion.objects.filter(id_reparacion=reparacion).first()
        self.assertIsNotNone(bitacora)
        self.assertEqual(bitacora.estado_alcanzado, 1)
        self.assertEqual(bitacora.id_usuario_id, self.cliente.id_usuario)
        self.assertIn("Apertura de orden de servicio", bitacora.comentario)

        # LogSistema
        log = LogSistema.objects.filter(
            tabla_afectada='reparacion',
            id_registro_afectado=str(reparacion.id_reparacion)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.id_usuario_id, self.cliente.id_usuario)

    def test_tecnico_inicia_reparacion_exitoso(self):
        """
        Técnico inicia reparación en mostrador:
        - HTTP 201 Created.
        - Estado inicial: 'ESPERANDO_DIAGNOSTICO'.
        - Bitácora creada con estado_alcanzado=2.
        """
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'id_dispositivo': self.disp_cliente.id_dispositivo,
            'descripcion_problema': 'Equipo ingresado en caja con fallo intermitente de carga.',
            'credencial_acceso': 'Ninguna',
            'ids_categorias': [self.cat_bateria.id_categoria]
        }
        response = self.client.post('/api/workshop/reparaciones/iniciar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['etapa'], 'ESPERANDO_DIAGNOSTICO')

        from workshop_app.models import Reparacion, BitacoraReparacion
        reparacion = Reparacion.objects.get(pk=response.data['id_reparacion'])
        self.assertEqual(reparacion.etapa, 'ESPERANDO_DIAGNOSTICO')

        bitacora = BitacoraReparacion.objects.filter(id_reparacion=reparacion).first()
        self.assertIsNotNone(bitacora)
        self.assertEqual(bitacora.estado_alcanzado, 2)
        self.assertEqual(bitacora.id_usuario_id, self.tecnico.id_usuario)

    def test_admin_inicia_reparacion_exitoso(self):
        """Administrador inicia reparación: estado 'ESPERANDO_DIAGNOSTICO'."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            'id_dispositivo': self.disp_cliente.id_dispositivo,
            'descripcion_problema': 'Revisión general y mantenimiento de componentes.',
            'credencial_acceso': '123456',
            'ids_categorias': [self.cat_pantalla.id_categoria]
        }
        response = self.client.post('/api/workshop/reparaciones/iniciar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['etapa'], 'ESPERANDO_DIAGNOSTICO')

    def test_bloqueo_dispositivo_con_reparacion_activa_excepcion_paso_1(self):
        """
        Si el dispositivo ya posee una reparación activa (no finalizada/entregada),
        se aborta con 400 Bad Request.
        """
        from workshop_app.models import Reparacion
        Reparacion.objects.create(
            id_dispositivo=self.disp_cliente,
            id_usuario=self.tecnico,
            fecha_inicio=date.today(),
            etapa='En Diagnóstico',
            codigo_sec='SEC-PREV-01',
            desc_cliente='Reparación previa en curso'
        )

        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'id_dispositivo': self.disp_cliente.id_dispositivo,
            'descripcion_problema': 'Intento de abrir segunda reparación simultánea.',
            'credencial_acceso': 'Ninguna',
            'ids_categorias': [self.cat_pantalla.id_categoria]
        }
        response = self.client.post('/api/workshop/reparaciones/iniciar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        error_msg = str(response.data)
        self.assertIn("El dispositivo seleccionado ya posee una reparación en curso", error_msg)

    def test_permite_iniciar_si_reparacion_previa_esta_finalizada_o_entregada(self):
        """
        Si la reparación anterior del equipo está FINALIZADA o ENTREGADO,
        el equipo está libre y se puede iniciar una nueva reparación.
        """
        from workshop_app.models import Reparacion
        Reparacion.objects.create(
            id_dispositivo=self.disp_cliente,
            id_usuario=self.tecnico,
            fecha_inicio=date(2025, 12, 1),
            fecha_entrega=date(2025, 12, 5),
            etapa='FINALIZADO',
            codigo_sec='SEC-VIEJO-01',
            desc_cliente='Reparación pasada concluida'
        )

        self.client.force_authenticate(user=self.cliente)
        payload = {
            'id_dispositivo': self.disp_cliente.id_dispositivo,
            'descripcion_problema': 'Nuevo problema de batería meses después.',
            'credencial_acceso': 'Ninguna',
            'ids_categorias': [self.cat_bateria.id_categoria]
        }
        response = self.client.post('/api/workshop/reparaciones/iniciar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_seguridad_cliente_no_puede_iniciar_reparacion_sobre_dispositivo_ajeno(self):
        """Un Cliente no puede iniciar reparación sobre un dispositivo de otro cliente (403 Forbidden)."""
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'id_dispositivo': self.disp_otro.id_dispositivo, # Pertenece a otro_cliente
            'descripcion_problema': 'Intento no autorizado sobre dispositivo ajeno.',
            'credencial_acceso': 'PIN123',
            'ids_categorias': [self.cat_pantalla.id_categoria]
        }
        response = self.client.post('/api/workshop/reparaciones/iniciar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_validacion_descripcion_corta_excepcion_paso_4(self):
        """Descripción con menos de 10 caracteres levanta 400 Bad Request."""
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'id_dispositivo': self.disp_cliente.id_dispositivo,
            'descripcion_problema': 'Roto',
            'credencial_acceso': 'Ninguna',
            'ids_categorias': [self.cat_pantalla.id_categoria]
        }
        response = self.client.post('/api/workshop/reparaciones/iniciar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('descripcion_problema', response.data)
        self.assertIn("La descripción es muy corta", str(response.data['descripcion_problema']))

    def test_validacion_credencial_acceso_vacia(self):
        """Credencial de acceso en blanco levanta 400 Bad Request."""
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'id_dispositivo': self.disp_cliente.id_dispositivo,
            'descripcion_problema': 'Fallo general con descripción adecuada.',
            'credencial_acceso': '   ',
            'ids_categorias': [self.cat_pantalla.id_categoria]
        }
        response = self.client.post('/api/workshop/reparaciones/iniciar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('credencial_acceso', response.data)

    def test_validacion_al_menos_una_categoria_requerida(self):
        """Lista de categorías vacía levanta 400 Bad Request."""
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'id_dispositivo': self.disp_cliente.id_dispositivo,
            'descripcion_problema': 'Fallo general con descripción adecuada.',
            'credencial_acceso': 'Ninguna',
            'ids_categorias': []
        }
        response = self.client.post('/api/workshop/reparaciones/iniciar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ids_categorias', response.data)

    def test_validacion_categoria_inexistente(self):
        """Categoría con ID que no existe levanta 400 Bad Request."""
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'id_dispositivo': self.disp_cliente.id_dispositivo,
            'descripcion_problema': 'Fallo general con descripción adecuada.',
            'credencial_acceso': 'Ninguna',
            'ids_categorias': [99999]
        }
        response = self.client.post('/api/workshop/reparaciones/iniciar/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ids_categorias', response.data)

    def test_selector_dispositivo_tiene_reparacion_activa(self):
        """Prueba unitaria de la función selector dispositivo_tiene_reparacion_activa."""
        from workshop_app.selectors import dispositivo_tiene_reparacion_activa
        from workshop_app.models import Reparacion

        # Sin reparaciones -> False
        self.assertFalse(dispositivo_tiene_reparacion_activa(self.disp_cliente.id_dispositivo))

        # Con reparación activa -> True
        rep = Reparacion.objects.create(
            id_dispositivo=self.disp_cliente,
            id_usuario=self.tecnico,
            fecha_inicio=date.today(),
            etapa='En Reparación',
            codigo_sec='SEC-TEST-01',
            desc_cliente='Fallo'
        )
        self.assertTrue(dispositivo_tiene_reparacion_activa(self.disp_cliente.id_dispositivo))

        # Al pasar a FINALIZADO -> False
        rep.etapa = 'FINALIZADO'
        rep.save()
        self.assertFalse(dispositivo_tiene_reparacion_activa(self.disp_cliente.id_dispositivo))


class WorkshopAppCU45TestCase(TestCase):
    """
    Pruebas unitarias para CU-45: Recepcionar Dispositivo.
    Verifica la recepción física en mostrador, transición de 'ESPERANDO_DISPOSITIVO'
    a 'ESPERANDO_DIAGNOSTICO', validación obligatoria de observaciones físicas,
    registro en BitacoraReparacion, LogSistema y control estricto de roles.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
        self.rol_cliente = RolUsuario.objects.create(codigo='CLIENTE', nombre_rol='Cliente', descripcion='Rol Cliente')
        self.rol_tecnico = RolUsuario.objects.create(codigo='TECNICO', nombre_rol='Técnico', descripcion='Rol Técnico')
        self.rol_admin = RolUsuario.objects.create(codigo='ADMIN', nombre_rol='Administrador', descripcion='Rol Administrador')

        # Usuarios
        self.cliente = Usuario.objects.create(
            email='cliente.recepcion@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.recepcion@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.admin = Usuario.objects.create(
            email='admin.recepcion@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Catálogo
        self.tipo = TipoDispositivo.objects.create(nombre='Smartphone Test', estado_activo=True)
        self.marca = Marca.objects.create(nombre='Samsung Test', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='Galaxy S24 Test',
            estado_activo=True,
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo
        )

        # Categorías
        self.cat_pantalla = CategoriaReparacion.objects.create(nombre='Pantalla y Modulo', estado_activo=True)
        self.cat_bateria = CategoriaReparacion.objects.create(nombre='Bateria y Flex', estado_activo=True)

        # Dispositivo
        self.dispositivo = Dispositivo.objects.create(
            id_usuario=self.cliente,
            id_modelo=self.modelo,
            numero_serie='IMEI-REC-001',
            fecha_registro=date(2026, 2, 1)
        )

        # Reparación en estado inicial 'ESPERANDO_DISPOSITIVO' (Apertura virtual por cliente)
        self.reparacion_pendiente = Reparacion.objects.create(
            id_dispositivo=self.dispositivo,
            id_usuario=self.cliente,
            fecha_inicio=date.today(),
            hora_recepcion=timezone.now().time(),
            etapa='ESPERANDO_DISPOSITIVO',
            codigo_sec='TOKEN-123',
            desc_cliente='Pantalla rota pero enciende.',
            credencial_acceso='1234'
        )
        self.reparacion_pendiente.categorias.set([self.cat_pantalla])

        # Bitácora inicial
        BitacoraReparacion.objects.create(
            id_reparacion=self.reparacion_pendiente,
            id_usuario=self.cliente,
            fecha_hora=timezone.now().time(),
            estado_alcanzado=1,
            comentario='Apertura de orden virtual'
        )

    def test_tecnico_recepciona_dispositivo_exitoso(self):
        """
        Paso normal: Técnico verifica datos, asienta estado físico y confirma recepción.
        - Transiciona a 'ESPERANDO_DIAGNOSTICO'.
        - Bitácora con estado_alcanzado=2 y comentario con estado físico.
        - LogSistema de auditoría creado.
        """
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'descripcion_problema': 'Pantalla quebrada en esquina superior izquierda, touch responde intermitente.',
            'credencial_acceso': 'PIN 1234',
            'ids_categorias': [self.cat_pantalla.id_categoria, self.cat_bateria.id_categoria],
            'observaciones_fisicas': 'Tapa trasera con rayones leves. Vidrio astillado sin desprendimiento. Sin golpes en marco.'
        }

        url = f'/api/workshop/reparaciones/{self.reparacion_pendiente.id_reparacion}/recepcionar/'
        response = self.client.post(url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("Dispositivo recepcionado exitosamente", response.data['mensaje'])
        self.assertEqual(response.data['reparacion']['etapa'], 'ESPERANDO_DIAGNOSTICO')
        self.assertEqual(response.data['reparacion']['observaciones_fisicas'], payload['observaciones_fisicas'])

        # Verificar actualización en Base de Datos
        self.reparacion_pendiente.refresh_from_db()
        self.assertEqual(self.reparacion_pendiente.etapa, 'ESPERANDO_DIAGNOSTICO')
        self.assertEqual(self.reparacion_pendiente.desc_cliente, payload['descripcion_problema'])
        self.assertEqual(self.reparacion_pendiente.categorias.count(), 2)

        # Verificar BitacoraReparacion (donde se almacenan las observaciones físicas)
        bitacoras = BitacoraReparacion.objects.filter(id_reparacion=self.reparacion_pendiente).order_by('-id_bitacora')
        self.assertEqual(bitacoras.count(), 2)
        ultima_bitacora = bitacoras.first()
        self.assertEqual(ultima_bitacora.estado_alcanzado, 2)
        self.assertEqual(ultima_bitacora.id_usuario_id, self.tecnico.id_usuario)
        self.assertIn("Equipo recepcionado en mostrador. Estado físico:", ultima_bitacora.comentario)
        self.assertIn(payload['observaciones_fisicas'], ultima_bitacora.comentario)

        # Verificar LogSistema
        log = LogSistema.objects.filter(
            tabla_afectada='reparacion',
            id_registro_afectado=str(self.reparacion_pendiente.id_reparacion)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.id_usuario_id, self.tecnico.id_usuario)

    def test_admin_recepciona_dispositivo_exitoso(self):
        """Administrador también tiene permisos para recepcionar el equipo físicamente."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            'descripcion_problema': 'Falla general de carga y display.',
            'credencial_acceso': 'Patrón L',
            'ids_categorias': [self.cat_pantalla.id_categoria],
            'observaciones_fisicas': 'Equipo impecable sin signos visibles de caídas.'
        }
        url = f'/api/workshop/reparaciones/{self.reparacion_pendiente.id_reparacion}/recepcionar/'
        response = self.client.put(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.reparacion_pendiente.refresh_from_db()
        self.assertEqual(self.reparacion_pendiente.etapa, 'ESPERANDO_DIAGNOSTICO')

    def test_cliente_recepcionar_denegado(self):
        """Un cliente no puede auto-recepcionarse un dispositivo en el mostrador (403 Forbidden)."""
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'descripcion_problema': 'Intento no autorizado.',
            'credencial_acceso': 'Ninguna',
            'ids_categorias': [self.cat_pantalla.id_categoria],
            'observaciones_fisicas': 'Sin observaciones.'
        }
        url = f'/api/workshop/reparaciones/{self.reparacion_pendiente.id_reparacion}/recepcionar/'
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_excepcion_observaciones_fisicas_vacias(self):
        """Si las observaciones físicas están vacías o en blanco, bloquea con 400 Bad Request."""
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'descripcion_problema': 'Problema detallado del equipo.',
            'credencial_acceso': '1234',
            'ids_categorias': [self.cat_pantalla.id_categoria],
            'observaciones_fisicas': '   '  # Solo espacios
        }
        url = f'/api/workshop/reparaciones/{self.reparacion_pendiente.id_reparacion}/recepcionar/'
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('observaciones_fisicas', response.data)

    def test_excepcion_reparacion_ya_avanzada_bloqueada(self):
        """
        Paso 1 (Excepciones): Si la reparación ya se encuentra en 'ESPERANDO_DIAGNOSTICO'
        o etapa posterior, el sistema bloquea indicando que el dispositivo ya fue recepcionado.
        """
        self.reparacion_pendiente.etapa = 'ESPERANDO_DIAGNOSTICO'
        self.reparacion_pendiente.save()

        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'descripcion_problema': 'Detalle válido.',
            'credencial_acceso': '1234',
            'ids_categorias': [self.cat_pantalla.id_categoria],
            'observaciones_fisicas': 'Excelente estado físico.'
        }
        url = f'/api/workshop/reparaciones/{self.reparacion_pendiente.id_reparacion}/recepcionar/'
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("El dispositivo ya fue recepcionado o se encuentra en una etapa avanzada", str(response.data))

    def test_reparacion_inexistente_retorna_404(self):
        """Recepción de reparación con ID inexistente retorna 404 Not Found."""
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'descripcion_problema': 'Detalle válido.',
            'credencial_acceso': '1234',
            'ids_categorias': [self.cat_pantalla.id_categoria],
            'observaciones_fisicas': 'Excelente estado físico.'
        }
        url = '/api/workshop/reparaciones/99999/recepcionar/'
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_selector_obtener_reparacion_para_recepcion(self):
        """Valida el selector obtener_reparacion_para_recepcion de forma aislada."""
        from workshop_app.selectors import obtener_reparacion_para_recepcion
        from django.core.exceptions import ValidationError, ObjectDoesNotExist

        # 1. Éxito cuando está en ESPERANDO_DISPOSITIVO
        rep = obtener_reparacion_para_recepcion(self.reparacion_pendiente.id_reparacion)
        self.assertEqual(rep.id_reparacion, self.reparacion_pendiente.id_reparacion)

        # 2. Falla cuando está en otra etapa
        self.reparacion_pendiente.etapa = 'EN_REPARACION'
        self.reparacion_pendiente.save()
        with self.assertRaises(ValidationError) as ctx:
            obtener_reparacion_para_recepcion(self.reparacion_pendiente.id_reparacion)
        self.assertIn("El dispositivo ya fue recepcionado", str(ctx.exception))

        # 3. Falla cuando no existe
        with self.assertRaises(ObjectDoesNotExist):
            obtener_reparacion_para_recepcion(88888)


class WorkshopAppCU58TestCase(TestCase):
    """
    Pruebas unitarias para CU-58: Filtrar Reparaciones.
    Verifica el motor de búsqueda dinámico con Seguridad Horizontal y Vertical:
    - Autenticación requerida.
    - Aislamiento estricto de clientes (solo ven sus propios dispositivos y no pueden buscar clientes ajenos).
    - Privacidad del código de seguridad (solo visible para personal autorizado).
    - Búsqueda global para personal por cliente_query (DNI, nombre, apellido, email, teléfono),
      técnico asignado, código de seguridad, etapa, categoría y rangos de fechas.
    - Validación cronológica de fechas desde/hasta.
    """

    def setUp(self):
        from users_app.models import PerfilUsuario
        self.client = APIClient()

        # Roles
        self.rol_cliente = RolUsuario.objects.create(codigo='CLIENTE', nombre_rol='Cliente', descripcion='Rol Cliente')
        self.rol_tecnico = RolUsuario.objects.create(codigo='TECNICO', nombre_rol='Técnico', descripcion='Rol Técnico')
        self.rol_admin = RolUsuario.objects.create(codigo='ADMIN', nombre_rol='Administrador', descripcion='Rol Administrador')

        # Usuarios
        self.cliente_1 = Usuario.objects.create(
            email='cliente.uno@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.perfil_1 = PerfilUsuario.objects.create(
            id_usuario=self.cliente_1,
            dni='40111222',
            nombre='Lucas',
            apellido='Alvarez',
            telefono='3511234567'
        )

        self.cliente_2 = Usuario.objects.create(
            email='cliente.dos@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.perfil_2 = PerfilUsuario.objects.create(
            id_usuario=self.cliente_2,
            dni='41999888',
            nombre='Valentina',
            apellido='Gomez',
            telefono='3517654321'
        )

        self.tecnico = Usuario.objects.create(
            email='tecnico.taller@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.admin = Usuario.objects.create(
            email='admin.taller@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Catálogo
        self.tipo = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        self.marca = Marca.objects.create(nombre='Motorola', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='Moto G84',
            estado_activo=True,
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo
        )

        # Categorías
        self.cat_pantalla = CategoriaReparacion.objects.create(nombre='Pantalla', estado_activo=True)
        self.cat_bateria = CategoriaReparacion.objects.create(nombre='Bateria', estado_activo=True)

        # Dispositivos
        self.disp_1 = Dispositivo.objects.create(
            id_usuario=self.cliente_1,
            id_modelo=self.modelo,
            numero_serie='SN-MOTO-001',
            fecha_registro=date(2026, 1, 10)
        )
        self.disp_2 = Dispositivo.objects.create(
            id_usuario=self.cliente_2,
            id_modelo=self.modelo,
            numero_serie='SN-MOTO-002',
            fecha_registro=date(2026, 1, 20)
        )

        # Reparaciones
        self.rep_1 = Reparacion.objects.create(
            id_dispositivo=self.disp_1,
            id_usuario=self.tecnico,
            fecha_inicio=date(2026, 2, 1),
            hora_recepcion=timezone.now().time(),
            etapa='Esperando Diagnóstico',
            codigo_sec='SEC-TOKEN-001',
            desc_cliente='Falla de pantalla y touch'
        )
        self.rep_1.categorias.set([self.cat_pantalla])

        self.rep_2 = Reparacion.objects.create(
            id_dispositivo=self.disp_2,
            id_usuario=self.admin,
            fecha_inicio=date(2026, 2, 15),
            hora_recepcion=timezone.now().time(),
            etapa='En Reparación',
            codigo_sec='SEC-TOKEN-002',
            desc_cliente='Reemplazo de batería urgente'
        )
        self.rep_2.categorias.set([self.cat_bateria])

    def test_precondicion_autenticacion(self):
        """Usuario no autenticado no puede consultar reparaciones (401 o 403)."""
        response = self.client.get('/api/workshop/reparaciones/')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_cliente_ve_solo_sus_propias_reparaciones(self):
        """
        Seguridad Horizontal:
        El Cliente 1 solo puede visualizar la reparación de su dispositivo,
        nunca la de otros clientes, y el código de seguridad sensible está oculto.
        """
        self.client.force_authenticate(user=self.cliente_1)
        response = self.client.get('/api/workshop/reparaciones/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_reparacion'], self.rep_1.id_reparacion)
        # Seguridad Vertical: Código de seguridad oculto para cliente
        self.assertIsNone(response.data[0]['codigo_seguridad'])

    def test_cliente_no_puede_utilizar_filtros_de_personal(self):
        """
        Si un cliente intenta enviar cliente_query o codigo_seguridad de otro cliente,
        se descartan forzando únicamente sus propios equipos.
        """
        self.client.force_authenticate(user=self.cliente_1)
        # Intentar buscar datos del cliente 2
        response = self.client.get(
            '/api/workshop/reparaciones/',
            {'cliente_query': 'Valentina', 'codigo_seguridad': 'SEC-TOKEN-002'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # No debe retornar la del cliente 2, sigue retornando solo la del cliente 1
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_reparacion'], self.rep_1.id_reparacion)

    def test_tecnico_ve_todas_las_reparaciones_y_codigo_seguridad(self):
        """
        Personal técnico ve todas las reparaciones registradas y tiene acceso
        al código de seguridad para verificaciones en mostrador.
        """
        self.client.force_authenticate(user=self.tecnico)
        response = self.client.get('/api/workshop/reparaciones/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        # Código de seguridad visible para personal
        codigos = [item['codigo_seguridad'] for item in response.data]
        self.assertIn('SEC-TOKEN-001', codigos)
        self.assertIn('SEC-TOKEN-002', codigos)

    def test_personal_filtra_por_cliente_query(self):
        """
        Personal filtra por DNI, Nombre, Apellido, Email o Teléfono del cliente.
        """
        self.client.force_authenticate(user=self.admin)

        # 1. Por DNI
        res_dni = self.client.get('/api/workshop/reparaciones/', {'cliente_query': '40111222'})
        self.assertEqual(len(res_dni.data), 1)
        self.assertEqual(res_dni.data[0]['id_reparacion'], self.rep_1.id_reparacion)

        # 2. Por Nombre
        res_nom = self.client.get('/api/workshop/reparaciones/', {'cliente_query': 'Valentina'})
        self.assertEqual(len(res_nom.data), 1)
        self.assertEqual(res_nom.data[0]['id_reparacion'], self.rep_2.id_reparacion)

        # 3. Por Email
        res_mail = self.client.get('/api/workshop/reparaciones/', {'cliente_query': 'cliente.uno@test.com'})
        self.assertEqual(len(res_mail.data), 1)
        self.assertEqual(res_mail.data[0]['id_reparacion'], self.rep_1.id_reparacion)

    def test_personal_filtra_por_codigo_seguridad(self):
        """Personal localiza la reparación buscando directamente por código de seguridad."""
        self.client.force_authenticate(user=self.tecnico)
        res = self.client.get('/api/workshop/reparaciones/', {'codigo_seguridad': 'SEC-TOKEN-002'})
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['id_reparacion'], self.rep_2.id_reparacion)

    def test_filtro_por_etapa(self):
        """Filtro transversal por etapa de la reparación."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/workshop/reparaciones/', {'etapa': 'En Reparación'})
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['id_reparacion'], self.rep_2.id_reparacion)

    def test_filtro_por_categoria(self):
        """Filtro transversal por categoría de servicio técnico."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/workshop/reparaciones/', {'id_categoria': self.cat_pantalla.id_categoria})
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['id_reparacion'], self.rep_1.id_reparacion)

    def test_filtro_por_rango_fechas(self):
        """Filtro transversal por ventana temporal de fecha_inicio."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            '/api/workshop/reparaciones/',
            {'fecha_desde': '2026-02-10', 'fecha_hasta': '2026-02-28'}
        )
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['id_reparacion'], self.rep_2.id_reparacion)

    def test_fechas_invalidas_bloqueadas(self):
        """Si fecha_desde es posterior a fecha_hasta, el sistema bloquea con 400 Bad Request."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            '/api/workshop/reparaciones/',
            {'fecha_desde': '2026-03-01', 'fecha_hasta': '2026-02-01'}
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('fecha_desde', res.data)


# ==============================================================================
# CU-08: CARGAR DIAGNÓSTICO TÉCNICO (PRUEBAS UNITARIAS E INTEGRALES)
# ==============================================================================

class CargarDiagnosticoTecnicoTestCase(TestCase):
    """
    Suite de pruebas completas para el caso de uso CU-08: Cargar diagnóstico técnico.
    Valida:
    - Selector `obtener_reparacion_para_diagnostico` (estados válidos, inválidos e inexistentes).
    - Serializadores de entrada `InsumoDiagnosticoInputSerializer` y `CargarDiagnosticoInputSerializer`.
    - Servicio `cargar_diagnostico_tecnico` (transaccionalidad, persistencia de Diagnostico,
      DetalleInsumoReparacion con precio congelado, BitacoraReparacion, Notificacion a cliente y LogSistema).
    - Endpoint API `CargarDiagnosticoApi` (roles ADMIN/TECNICO vs CLIENTE, validaciones HTTP).
    """

    def setUp(self):
        from rest_framework.test import APIClient
        from datetime import time
        from decimal import Decimal
        from catalog_app.models import CategoriaProducto, Producto
        from workshop_app.models import DetalleInsumoReparacion, Diagnostico

        self.client = APIClient()

        # Roles de usuario
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico Especialista', 'descripcion': 'Rol Técnico'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente Final', 'descripcion': 'Rol Cliente'}
        )

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin_diagnostico@ifixpos.com',
            contrasena='HashSeguro123!',
            fecha_registro=date.today(),
            is_active=True,
            id_rol=self.rol_admin
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico_diagnostico@ifixpos.com',
            contrasena='HashSeguro123!',
            fecha_registro=date.today(),
            is_active=True,
            id_rol=self.rol_tecnico
        )
        self.cliente = Usuario.objects.create(
            email='cliente_diagnostico@ifixpos.com',
            contrasena='HashSeguro123!',
            fecha_registro=date.today(),
            is_active=True,
            id_rol=self.rol_cliente
        )

        # Catálogos base
        self.tipo_disp = TipoDispositivo.objects.create(
            nombre='Smartphone Diagnostico',
            estado_activo=True
        )
        self.marca = Marca.objects.create(
            nombre='MarcaDiag',
            estado_activo=True
        )
        self.modelo = ModeloDispositivo.objects.create(
            nombre='ModeloDiag X',
            estado_activo=True,
            id_tipo_dispositivo=self.tipo_disp,
            id_marca=self.marca
        )

        # Dispositivo del cliente
        self.dispositivo = Dispositivo.objects.create(
            numero_serie='DIAG-SN-999',
            fecha_registro=date.today(),
            id_modelo=self.modelo,
            id_usuario=self.cliente
        )

        # Reparación lista para diagnóstico ('EN_DIAGNOSTICO')
        self.reparacion_en_diag = Reparacion.objects.create(
            fecha_inicio=date.today(),
            hora_recepcion=time(10, 0),
            etapa='EN_DIAGNOSTICO',
            codigo_sec='SEC-DIAG-01',
            desc_cliente='No enciende tras golpe',
            credencial_acceso='PIN 1234',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico
        )

        # Reparación en etapa incorrecta ('ESPERANDO_DISPOSITIVO')
        self.reparacion_esperando_disp = Reparacion.objects.create(
            fecha_inicio=date.today(),
            hora_recepcion=time(9, 30),
            etapa='ESPERANDO_DISPOSITIVO',
            codigo_sec='SEC-DIAG-02',
            desc_cliente='Falla de batería',
            id_dispositivo=self.dispositivo,
            id_usuario=self.cliente
        )

        # Productos para insumos
        self.categoria_prod = CategoriaProducto.objects.create(
            nombre='Repuestos Diagnóstico',
            estado=True
        )
        self.producto_pantalla = Producto.objects.create(
            nombre='Módulo Pantalla OLED Original',
            precio_venta=Decimal('250.00'),
            estado=True,
            apto_venta=False,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=False,
            id_categoria=self.categoria_prod
        )
        self.producto_bateria = Producto.objects.create(
            nombre='Batería 4000mAh OEM',
            precio_venta=Decimal('80.00'),
            estado=True,
            apto_venta=False,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=False,
            id_categoria=self.categoria_prod
        )

    # --------------------------------------------------------------------------
    # 1. PRUEBAS DEL SELECTOR
    # --------------------------------------------------------------------------

    def test_selector_obtener_reparacion_para_diagnostico_exitoso(self):
        """El selector retorna la reparación si su etapa es exactamente 'EN_DIAGNOSTICO'."""
        from workshop_app.selectors import obtener_reparacion_para_diagnostico
        rep = obtener_reparacion_para_diagnostico(self.reparacion_en_diag.id_reparacion)
        self.assertEqual(rep.id_reparacion, self.reparacion_en_diag.id_reparacion)
        self.assertEqual(rep.etapa, 'EN_DIAGNOSTICO')

    def test_selector_bloquea_reparacion_en_etapa_invalida(self):
        """Si la reparación no está en 'EN_DIAGNOSTICO', levanta ValidationError con mensaje exacto."""
        from workshop_app.selectors import obtener_reparacion_para_diagnostico
        from django.core.exceptions import ValidationError as DjangoValidationError

        with self.assertRaises(DjangoValidationError) as ctx:
            obtener_reparacion_para_diagnostico(self.reparacion_esperando_disp.id_reparacion)
        self.assertIn("La reparación no se encuentra en la etapa de diagnóstico", str(ctx.exception))

    def test_selector_reparacion_inexistente_levanta_objectdoesnotexist(self):
        """Si el ID de reparación no existe, levanta ObjectDoesNotExist."""
        from workshop_app.selectors import obtener_reparacion_para_diagnostico
        from django.core.exceptions import ObjectDoesNotExist

        with self.assertRaises(ObjectDoesNotExist):
            obtener_reparacion_para_diagnostico(999999)

    # --------------------------------------------------------------------------
    # 2. PRUEBAS DE SERIALIZADORES
    # --------------------------------------------------------------------------

    def test_serializer_insumo_cantidad_invalida(self):
        """Cantidad menor o igual a 0 debe ser rechazada."""
        from workshop_app.serializers import InsumoDiagnosticoInputSerializer
        data = {'id_producto': self.producto_pantalla.id_producto, 'cantidad': 0}
        serializer = InsumoDiagnosticoInputSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('cantidad', serializer.errors)

    def test_serializer_insumo_producto_inexistente(self):
        """Producto que no existe en el catálogo debe ser rechazado."""
        from workshop_app.serializers import InsumoDiagnosticoInputSerializer
        data = {'id_producto': 999999, 'cantidad': 1}
        serializer = InsumoDiagnosticoInputSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('id_producto', serializer.errors)

    def test_serializer_diagnostico_descripcion_corta(self):
        """Descripción con menos de 5 caracteres debe ser rechazada."""
        from workshop_app.serializers import CargarDiagnosticoInputSerializer
        data = {
            'descripcion_falla': 'Bad',
            'costo_mano_obra': '100.00',
            'insumos': []
        }
        serializer = CargarDiagnosticoInputSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('descripcion_falla', serializer.errors)

    def test_serializer_diagnostico_costo_negativo(self):
        """Costo de mano de obra negativo debe ser rechazado."""
        from workshop_app.serializers import CargarDiagnosticoInputSerializer
        data = {
            'descripcion_falla': 'Falla general de placa',
            'costo_mano_obra': '-50.00',
            'insumos': []
        }
        serializer = CargarDiagnosticoInputSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('costo_mano_obra', serializer.errors)

    def test_serializer_diagnostico_insumos_duplicados_rechazados(self):
        """No se permiten productos duplicados dentro del listado de insumos."""
        from workshop_app.serializers import CargarDiagnosticoInputSerializer
        data = {
            'descripcion_falla': 'Reemplazo de componentes varios',
            'costo_mano_obra': '150.00',
            'insumos': [
                {'id_producto': self.producto_pantalla.id_producto, 'cantidad': 1},
                {'id_producto': self.producto_pantalla.id_producto, 'cantidad': 2}
            ]
        }
        serializer = CargarDiagnosticoInputSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('insumos', serializer.errors)

    # --------------------------------------------------------------------------
    # 3. PRUEBAS DEL SERVICIO TRANSACCIONAL
    # --------------------------------------------------------------------------

    def test_servicio_cargar_diagnostico_tecnico_completo(self):
        """
        Valida el flujo integral del servicio:
        - Persistencia de Diagnostico.
        - Persistencia de DetalleInsumoReparacion con precio congelado.
        - Transición a 'ESPERANDO_CONFIRMACION'.
        - Registro en BitacoraReparacion (estado_alcanzado=4, comentario 'Carga de diagnóstico').
        - Notificación al cliente con texto exacto.
        - Auditoría en LogSistema.
        """
        from workshop_app.services import cargar_diagnostico_tecnico
        from workshop_app.models import Diagnostico, DetalleInsumoReparacion, BitacoraReparacion
        from core_app.models import Notificacion, LogSistema

        datos_validados = {
            'descripcion_falla': 'Módulo de pantalla roto y flex desprendido.',
            'costo_mano_obra': Decimal('120.00'),
            'insumos': [
                {'id_producto': self.producto_pantalla.id_producto, 'cantidad': 1},
                {'id_producto': self.producto_bateria.id_producto, 'cantidad': 1}
            ]
        }

        diagnostico = cargar_diagnostico_tecnico(
            usuario_tecnico=self.tecnico,
            id_reparacion=self.reparacion_en_diag.id_reparacion,
            datos_validados=datos_validados
        )

        # 1. Diagnóstico creado
        self.assertIsNotNone(diagnostico.id_diagnostico)
        self.assertEqual(diagnostico.descripcion_falla, datos_validados['descripcion_falla'])
        self.assertEqual(diagnostico.costo_diagnostico, Decimal('120.00'))
        self.assertEqual(diagnostico.fecha_diagnostico, timezone.now().date())

        # 2. Insumos congelados
        detalles = DetalleInsumoReparacion.objects.filter(id_reparacion=self.reparacion_en_diag)
        self.assertEqual(detalles.count(), 2)
        det_pantalla = detalles.get(id_producto=self.producto_pantalla)
        self.assertEqual(det_pantalla.cantidad, 1)
        self.assertEqual(det_pantalla.precio_unitario, Decimal('250.00'))

        # 3. Transición de estado en Reparación
        self.reparacion_en_diag.refresh_from_db()
        self.assertEqual(self.reparacion_en_diag.etapa, 'ESPERANDO_CONFIRMACION')

        # 4. Bitácora de reparación
        bitacora = BitacoraReparacion.objects.filter(id_reparacion=self.reparacion_en_diag).latest('id_bitacora')
        self.assertEqual(bitacora.id_usuario, self.tecnico)
        self.assertEqual(bitacora.comentario, "Carga de diagnóstico")
        self.assertEqual(bitacora.estado_alcanzado, 4)

        # 5. Notificación al cliente
        notificacion = Notificacion.objects.filter(id_usuario=self.cliente).latest('id_notificacion')
        self.assertEqual(notificacion.mensaje, "Su presupuesto ya se encuentra disponible para revisión")
        self.assertEqual(notificacion.id_dispositivo, self.dispositivo)

        # 6. Log del sistema
        log = LogSistema.objects.filter(id_usuario=self.tecnico).latest('id_log')
        self.assertEqual(log.accion, "Carga de diagnóstico técnico (CU-08)")
        self.assertEqual(log.tabla_afectada, "diagnostico")

    def test_servicio_diagnostico_solo_mano_de_obra_sin_insumos(self):
        """Diagnóstico de solo software/mano de obra sin repuestos requeridos."""
        from workshop_app.services import cargar_diagnostico_tecnico
        from workshop_app.models import DetalleInsumoReparacion

        datos_validados = {
            'descripcion_falla': 'Falla de software y re-flashing del firmware.',
            'costo_mano_obra': Decimal('90.00'),
            'insumos': []
        }

        diagnostico = cargar_diagnostico_tecnico(
            usuario_tecnico=self.tecnico,
            id_reparacion=self.reparacion_en_diag.id_reparacion,
            datos_validados=datos_validados
        )

        self.assertIsNotNone(diagnostico.id_diagnostico)
        self.assertEqual(
            DetalleInsumoReparacion.objects.filter(id_reparacion=self.reparacion_en_diag).count(),
            0
        )
        self.reparacion_en_diag.refresh_from_db()
        self.assertEqual(self.reparacion_en_diag.etapa, 'ESPERANDO_CONFIRMACION')

    # --------------------------------------------------------------------------
    # 4. PRUEBAS DEL ENDPOINT HTTP API
    # --------------------------------------------------------------------------

    def test_api_cargar_diagnostico_tecnico_autenticado_exitoso(self):
        """Técnico autenticado ejecuta exitosamente el endpoint con 201 Created."""
        self.client.force_authenticate(user=self.tecnico)
        url = f'/api/workshop/reparaciones/{self.reparacion_en_diag.id_reparacion}/diagnostico/'
        payload = {
            'descripcion_falla': 'Inspección técnica formal completada.',
            'costo_mano_obra': '150.00',
            'insumos': [
                {'id_producto': self.producto_pantalla.id_producto, 'cantidad': 1}
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('diagnostico', res.data)
        self.assertEqual(res.data['reparacion']['etapa'], 'ESPERANDO_CONFIRMACION')

    def test_api_cargar_diagnostico_admin_autenticado_exitoso(self):
        """Administrador autenticado también tiene permisos para cargar diagnóstico (201 Created)."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/workshop/reparaciones/{self.reparacion_en_diag.id_reparacion}/diagnostico/'
        payload = {
            'descripcion_falla': 'Evaluación técnica supervisada por administración.',
            'costo_mano_obra': '180.00',
            'insumos': []
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_api_cargar_diagnostico_cliente_bloqueado(self):
        """Cliente autenticado no tiene permisos para cargar diagnóstico (403 Forbidden)."""
        self.client.force_authenticate(user=self.cliente)
        url = f'/api/workshop/reparaciones/{self.reparacion_en_diag.id_reparacion}/diagnostico/'
        payload = {
            'descripcion_falla': 'Intento no autorizado de cliente.',
            'costo_mano_obra': '100.00',
            'insumos': []
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_api_cargar_diagnostico_anonimo_bloqueado(self):
        """Usuario no autenticado recibe 401 Unauthorized."""
        url = f'/api/workshop/reparaciones/{self.reparacion_en_diag.id_reparacion}/diagnostico/'
        res = self.client.post(url, {}, format='json')
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_api_cargar_diagnostico_reparacion_no_encontrada(self):
        """Si la reparación no existe, devuelve 404 Not Found."""
        self.client.force_authenticate(user=self.tecnico)
        url = '/api/workshop/reparaciones/999999/diagnostico/'
        payload = {
            'descripcion_falla': 'Evaluación sobre ID fantasma.',
            'costo_mano_obra': '100.00',
            'insumos': []
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_api_cargar_diagnostico_etapa_incorrecta_bloqueada(self):
        """Si la reparación no está en 'EN_DIAGNOSTICO', responde 400 Bad Request."""
        self.client.force_authenticate(user=self.tecnico)
        url = f'/api/workshop/reparaciones/{self.reparacion_esperando_disp.id_reparacion}/diagnostico/'
        payload = {
            'descripcion_falla': 'Intento de diagnosticar antes de ingresar físicamente.',
            'costo_mano_obra': '100.00',
            'insumos': []
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('La reparación no se encuentra en la etapa de diagnóstico', str(res.data))


# ==============================================================================
# CU-56 Y CU-09: CONSULTAR DIAGNÓSTICO TÉCNICO Y DECISIÓN DE REPARACIÓN (TESTS)
# ==============================================================================

class ConsultarDiagnosticoYDecisionReparacionTests(TestCase):
    """
    Suite integral de pruebas unitarias y de integración API para:
    - CU-56: Consultar Diagnóstico Técnico (Lectura, Seguridad Horizontal, Salida estructurada).
    - CU-09: Confirmar o Rechazar Reparación (Transición, Integración con Venta/DetalleVenta, Bitácora, Notificaciones).
    """

    def setUp(self):
        from users_app.models import Usuario, RolUsuario, PerfilUsuario
        from catalog_app.models import TipoDispositivo, Marca, ModeloDispositivo, Producto, CategoriaProducto
        from workshop_app.models import Dispositivo, Reparacion, Diagnostico, DetalleInsumoReparacion, CategoriaReparacion

        self.client = APIClient()

        # 1. Configuración de Roles
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol de Cliente'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol de Técnico'}
        )
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol de Administrador'}
        )

        # 2. Configuración de Usuarios
        self.cliente = Usuario.objects.create(
            email='cliente_cu56_cu09@test.com',
            contrasena='HashSeguro123!',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente,
            nombre='Carlos',
            apellido='Consumidor',
            dni='45112233'
        )

        self.cliente_ajeno = Usuario.objects.create(
            email='cliente_intruso@test.com',
            contrasena='HashSeguro123!',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente_ajeno,
            nombre='Lucas',
            apellido='Intruso',
            dni='45998877'
        )

        self.tecnico = Usuario.objects.create(
            email='tecnico_especialista@test.com',
            contrasena='HashSeguro123!',
            fecha_registro=date.today(),
            id_rol=self.rol_tecnico,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.tecnico,
            nombre='Martín',
            apellido='Reparador',
            dni='30112233'
        )

        # 3. Catálogo de Dispositivos
        self.tipo_disp = TipoDispositivo.objects.create(nombre='Smartphone CU56', estado_activo=True)
        self.marca = Marca.objects.create(nombre='Motorola CU56', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='Moto G84 CU56',
            estado_activo=True,
            id_tipo_dispositivo=self.tipo_disp,
            id_marca=self.marca
        )

        # 4. Dispositivos
        self.dispositivo_cliente = Dispositivo.objects.create(
            numero_serie='IMEI-CLIENTE-5609',
            fecha_registro=timezone.now().date(),
            id_modelo=self.modelo,
            id_usuario=self.cliente
        )
        self.dispositivo_ajeno = Dispositivo.objects.create(
            numero_serie='IMEI-AJENO-9999',
            fecha_registro=timezone.now().date(),
            id_modelo=self.modelo,
            id_usuario=self.cliente_ajeno
        )

        # 5. Catálogo de Insumos/Productos
        self.cat_prod = CategoriaProducto.objects.create(nombre='Repuestos Generales', estado=True)
        self.producto_bateria = Producto.objects.create(
            nombre='Batería 5000mAh',
            precio_venta=Decimal('150.00'),
            id_categoria=self.cat_prod,
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=False
        )
        self.producto_pantalla = Producto.objects.create(
            nombre='Módulo OLED',
            precio_venta=Decimal('300.00'),
            id_categoria=self.cat_prod,
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=False
        )

        # 6. Reparación en Esperando Confirmación (con Diagnóstico e Insumos)
        self.reparacion_confirmacion = Reparacion.objects.create(
            fecha_inicio=timezone.now().date(),
            etapa='ESPERANDO_CONFIRMACION',
            codigo_sec='CONF1234',
            desc_cliente='No enciende y pantalla rota',
            id_dispositivo=self.dispositivo_cliente,
            id_usuario=self.tecnico
        )
        self.diagnostico = Diagnostico.objects.create(
            id_reparacion=self.reparacion_confirmacion,
            descripcion_falla='Batería agotada y display dañado por impacto.',
            fecha_diagnostico=timezone.now().date(),
            costo_diagnostico=Decimal('200.00')  # Mano de obra
        )
        DetalleInsumoReparacion.objects.create(
            id_reparacion=self.reparacion_confirmacion,
            id_producto=self.producto_bateria,
            cantidad=1,
            precio_unitario=Decimal('150.00')
        )
        DetalleInsumoReparacion.objects.create(
            id_reparacion=self.reparacion_confirmacion,
            id_producto=self.producto_pantalla,
            cantidad=1,
            precio_unitario=Decimal('300.00')
        )

        # 7. Reparación sin diagnóstico (en diagnóstico)
        self.reparacion_sin_diag = Reparacion.objects.create(
            fecha_inicio=timezone.now().date(),
            etapa='EN_DIAGNOSTICO',
            codigo_sec='DIAG1234',
            desc_cliente='Se reinicia solo',
            id_dispositivo=self.dispositivo_cliente,
            id_usuario=self.tecnico
        )

        # 8. Reparación de otro cliente
        self.reparacion_ajena = Reparacion.objects.create(
            fecha_inicio=timezone.now().date(),
            etapa='ESPERANDO_CONFIRMACION',
            codigo_sec='AJEN1234',
            desc_cliente='Equipo ajeno',
            id_dispositivo=self.dispositivo_ajeno,
            id_usuario=self.tecnico
        )
        Diagnostico.objects.create(
            id_reparacion=self.reparacion_ajena,
            descripcion_falla='Falla ajena',
            fecha_diagnostico=timezone.now().date(),
            costo_diagnostico=Decimal('100.00')
        )

    # --------------------------------------------------------------------------
    # PRUEBAS CU-56: CONSULTAR DIAGNÓSTICO TÉCNICO (SELECTORS Y APIS)
    # --------------------------------------------------------------------------

    def test_selector_obtener_diagnostico_cliente_exitoso(self):
        """El cliente consulta legítimamente su diagnóstico técnico."""
        from workshop_app.selectors import obtener_diagnostico_cliente
        diag = obtener_diagnostico_cliente(
            usuario_cliente=self.cliente,
            id_reparacion=self.reparacion_confirmacion.id_reparacion
        )
        self.assertEqual(diag.id_diagnostico, self.diagnostico.id_diagnostico)
        self.assertEqual(diag.costo_diagnostico, Decimal('200.00'))

    def test_selector_obtener_diagnostico_cliente_seguridad_horizontal(self):
        """Un cliente ajeno recibe PermissionDenied al forzar el ID de reparación."""
        from rest_framework.exceptions import PermissionDenied
        from workshop_app.selectors import obtener_diagnostico_cliente

        with self.assertRaises(PermissionDenied):
            obtener_diagnostico_cliente(
                usuario_cliente=self.cliente_ajeno,
                id_reparacion=self.reparacion_confirmacion.id_reparacion
            )

    def test_selector_obtener_diagnostico_sin_diagnostico_aun(self):
        """Si la reparación no posee diagnóstico cargado, levanta NotFound con mensaje explicativo."""
        from rest_framework.exceptions import NotFound
        from workshop_app.selectors import obtener_diagnostico_cliente

        with self.assertRaises(NotFound) as ctx:
            obtener_diagnostico_cliente(
                usuario_cliente=self.cliente,
                id_reparacion=self.reparacion_sin_diag.id_reparacion
            )
        self.assertIn("El equipo aún está siendo evaluado", str(ctx.exception))

    def test_api_consultar_diagnostico_cliente_exitoso(self):
        """Cliente autenticado consulta HTTP GET su diagnóstico con presupuesto total."""
        self.client.force_authenticate(user=self.cliente)
        url = f'/api/workshop/reparaciones/{self.reparacion_confirmacion.id_reparacion}/diagnostico/cliente/'
        res = self.client.get(url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['id_diagnostico'], self.diagnostico.id_diagnostico)
        self.assertIn('Martín Reparador', res.data['tecnico_asignado'])
        self.assertEqual(Decimal(str(res.data['costo_mano_obra'])), Decimal('200.00'))
        self.assertEqual(Decimal(str(res.data['costo_insumos'])), Decimal('450.00'))
        self.assertEqual(Decimal(str(res.data['costo_total'])), Decimal('650.00'))
        self.assertEqual(len(res.data['insumos_utilizados']), 2)
        self.assertTrue(res.data['permite_decision'])
        self.assertEqual(res.data['dispositivo']['modelo'], 'Moto G84 CU56')

    def test_api_consultar_diagnostico_seguridad_horizontal_bloqueada(self):
        """Cliente ajeno recibe 403 Forbidden al intentar consultar diagnóstico ajeno."""
        self.client.force_authenticate(user=self.cliente_ajeno)
        url = f'/api/workshop/reparaciones/{self.reparacion_confirmacion.id_reparacion}/diagnostico/cliente/'
        res = self.client.get(url)

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Acceso Denegado", str(res.data))

    def test_api_consultar_diagnostico_no_generado_devuelve_404(self):
        """Si el técnico aún no cargó el diagnóstico, devuelve 404 con mensaje amigable."""
        self.client.force_authenticate(user=self.cliente)
        url = f'/api/workshop/reparaciones/{self.reparacion_sin_diag.id_reparacion}/diagnostico/cliente/'
        res = self.client.get(url)

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("El equipo aún está siendo evaluado", str(res.data))

    # --------------------------------------------------------------------------
    # PRUEBAS CU-09: CONFIRMAR O RECHAZAR REPARACIÓN (SERIALIZERS, SERVICES, APIS)
    # --------------------------------------------------------------------------

    def test_serializer_decision_aceptar_valida_campos_requeridos(self):
        """Aceptar exige metodo_entrega y metodo_pago; Rechazar no los requiere."""
        from workshop_app.serializers import DecisionReparacionInputSerializer

        # Inválido: Aceptar sin método de entrega
        s1 = DecisionReparacionInputSerializer(data={'decision': 'ACEPTAR', 'metodo_pago': 'EFECTIVO'})
        self.assertFalse(s1.is_valid())
        self.assertIn('metodo_entrega', s1.errors)

        # Inválido: Aceptar sin método de pago
        s2 = DecisionReparacionInputSerializer(data={'decision': 'ACEPTAR', 'metodo_entrega': 'RETIRO'})
        self.assertFalse(s2.is_valid())
        self.assertIn('metodo_pago', s2.errors)

        # Válido: Aceptar con ambos
        s3 = DecisionReparacionInputSerializer(data={
            'decision': 'ACEPTAR',
            'metodo_entrega': 'RETIRO',
            'metodo_pago': 'EFECTIVO'
        })
        self.assertTrue(s3.is_valid())

        # Válido: Rechazar sin método de entrega ni pago
        s4 = DecisionReparacionInputSerializer(data={'decision': 'RECHAZAR', 'comentarios_cliente': 'Muy costoso'})
        self.assertTrue(s4.is_valid())

    def test_servicio_decision_rechazar_exitoso(self):
        """Cliente rechaza el presupuesto: transición a CANCELADO, bitácora y notificación al técnico."""
        from workshop_app.services import procesar_decision_reparacion
        from workshop_app.models import BitacoraReparacion
        from core_app.models import Notificacion, LogSistema

        reparacion = procesar_decision_reparacion(
            usuario_cliente=self.cliente,
            id_reparacion=self.reparacion_confirmacion.id_reparacion,
            datos_validados={
                'decision': 'RECHAZAR',
                'comentarios_cliente': 'No deseo realizar la reparación en este momento.'
            }
        )

        self.assertEqual(reparacion.etapa, 'CANCELADO')
        self.assertIsNone(reparacion.id_venta)

        # Verificar Bitácora
        bitacora = BitacoraReparacion.objects.filter(id_reparacion=reparacion).latest('id_bitacora')
        self.assertEqual(bitacora.id_usuario, self.cliente)
        self.assertEqual(bitacora.estado_alcanzado, 8)
        self.assertIn("Diagnóstico rechazado", bitacora.comentario)
        self.assertIn("No deseo realizar", bitacora.comentario)

        # Verificar Notificación al Técnico asignado
        notif = Notificacion.objects.filter(id_usuario=self.tecnico).latest('id_notificacion')
        self.assertIn("rechazó", notif.mensaje)
        self.assertEqual(notif.tipo, "DECISION_REPARACION_RECHAZAR")

        # Verificar LogSistema
        log = LogSistema.objects.filter(id_usuario=self.cliente).latest('id_log')
        self.assertEqual(log.accion, "Decisión de reparación RECHAZAR (CU-09)")

    def test_servicio_decision_aceptar_exitoso_genera_venta_y_detalles(self):
        """Cliente acepta el presupuesto: avanza a EN_REPARACION, crea Venta, DetalleVenta y Pago."""
        from workshop_app.services import procesar_decision_reparacion
        from workshop_app.models import BitacoraReparacion
        from sales_app.models import Venta, DetalleVenta, Pago
        from core_app.models import Notificacion, LogSistema

        reparacion = procesar_decision_reparacion(
            usuario_cliente=self.cliente,
            id_reparacion=self.reparacion_confirmacion.id_reparacion,
            datos_validados={
                'decision': 'ACEPTAR',
                'comentarios_cliente': 'Por favor proceder cuanto antes.',
                'metodo_entrega': 'RETIRO',
                'metodo_pago': 'EFECTIVO'
            }
        )

        self.assertEqual(reparacion.etapa, 'EN_REPARACION')
        self.assertIsNotNone(reparacion.id_venta)

        # Verificar Venta
        venta = reparacion.id_venta
        self.assertEqual(venta.id_usuario, self.cliente)
        self.assertEqual(venta.estado_venta, 'PENDIENTE')
        self.assertEqual(venta.metodo_entrega, 'RETIRO')
        self.assertEqual(venta.monto_subtotal, Decimal('650.00'))  # 450 insumos + 200 mano de obra

        # Verificar DetalleVenta (insumos replicados con precio congelado)
        detalles_venta = DetalleVenta.objects.filter(id_venta=venta)
        self.assertEqual(detalles_venta.count(), 2)

        # Verificar Pago creado en estado pendiente
        pago = Pago.objects.filter(id_venta=venta).first()
        self.assertIsNotNone(pago)
        self.assertEqual(pago.medio_pago.nombre_medio_pago.upper(), 'EFECTIVO')

        # Verificar Bitácora
        bitacora = BitacoraReparacion.objects.filter(id_reparacion=reparacion).latest('id_bitacora')
        self.assertEqual(bitacora.id_usuario, self.cliente)
        self.assertEqual(bitacora.estado_alcanzado, 5)
        self.assertIn("Diagnóstico aceptado", bitacora.comentario)

        # Verificar Notificación al Técnico
        notif = Notificacion.objects.filter(id_usuario=self.tecnico).latest('id_notificacion')
        self.assertIn("aceptó", notif.mensaje)
        self.assertEqual(notif.tipo, "DECISION_REPARACION_ACEPTAR")

        # Verificar LogSistema
        log = LogSistema.objects.filter(id_usuario=self.cliente).latest('id_log')
        self.assertEqual(log.accion, "Decisión de reparación ACEPTAR (CU-09)")

    def test_servicio_decision_precondicion_etapa_invalida(self):
        """Intentar decidir sobre una reparación que no está en 'ESPERANDO_CONFIRMACION' falla."""
        from rest_framework.exceptions import ValidationError
        from workshop_app.services import procesar_decision_reparacion

        with self.assertRaises(ValidationError) as ctx:
            procesar_decision_reparacion(
                usuario_cliente=self.cliente,
                id_reparacion=self.reparacion_sin_diag.id_reparacion,
                datos_validados={'decision': 'ACEPTAR', 'metodo_entrega': 'RETIRO', 'metodo_pago': 'EFECTIVO'}
            )
        self.assertIn("Esperando Confirmación", str(ctx.exception))

    def test_api_decision_reparacion_aceptar_endpoint_exitoso(self):
        """Endpoint HTTP POST /decision/ procesa aceptación con 200 OK y devuelve id_venta."""
        self.client.force_authenticate(user=self.cliente)
        url = f'/api/workshop/reparaciones/{self.reparacion_confirmacion.id_reparacion}/decision/'
        payload = {
            'decision': 'ACEPTAR',
            'metodo_entrega': 'RETIRO',
            'metodo_pago': 'TRANSFERENCIA',
            'comentarios_cliente': 'Aprobado desde la API.'
        }
        res = self.client.post(url, payload, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['reparacion']['etapa'], 'EN_REPARACION')
        self.assertIsNotNone(res.data['reparacion']['id_venta'])
        self.assertIn("aceptado exitosamente", res.data['mensaje'])

    def test_api_decision_reparacion_rechazar_endpoint_exitoso(self):
        """Endpoint HTTP POST /decision/ procesa rechazo con 200 OK."""
        self.client.force_authenticate(user=self.cliente)
        url = f'/api/workshop/reparaciones/{self.reparacion_confirmacion.id_reparacion}/decision/'
        payload = {
            'decision': 'RECHAZAR',
            'comentarios_cliente': 'Rechazado desde la API.'
        }
        res = self.client.post(url, payload, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['reparacion']['etapa'], 'CANCELADO')
        self.assertIn("rechazado", res.data['mensaje'])

    def test_api_decision_reparacion_cliente_ajeno_bloqueado(self):
        """Cliente ajeno recibe 403 Forbidden al intentar tomar decisión sobre equipo ajeno."""
        self.client.force_authenticate(user=self.cliente_ajeno)
        url = f'/api/workshop/reparaciones/{self.reparacion_confirmacion.id_reparacion}/decision/'
        payload = {
            'decision': 'RECHAZAR'
        }
        res = self.client.post(url, payload, format='json')

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Acceso Denegado", str(res.data))

    def test_serializer_decision_aceptar_rechaza_envio_con_efectivo(self):
        """Valida que no se permita pagar en efectivo en mostrador cuando el método de entrega es ENVIO."""
        from workshop_app.serializers import DecisionReparacionInputSerializer

        # Inválido: ENVIO con EFECTIVO
        s = DecisionReparacionInputSerializer(data={
            'decision': 'ACEPTAR',
            'metodo_entrega': 'ENVIO',
            'metodo_pago': 'EFECTIVO'
        })
        self.assertFalse(s.is_valid())
        self.assertIn('metodo_pago', s.errors)
        self.assertIn('no está disponible para envíos a domicilio', s.errors['metodo_pago'][0])

        # Válido: ENVIO con TRANSFERENCIA
        s_valido = DecisionReparacionInputSerializer(data={
            'decision': 'ACEPTAR',
            'metodo_entrega': 'ENVIO',
            'metodo_pago': 'TRANSFERENCIA'
        })
        self.assertTrue(s_valido.is_valid())

    def test_servicio_decision_aceptar_rechaza_envio_con_efectivo(self):
        """El servicio procesar_decision_reparacion rechaza defensivamente ENVIO con EFECTIVO."""
        from rest_framework.exceptions import ValidationError
        from workshop_app.services import procesar_decision_reparacion

        with self.assertRaises(ValidationError) as ctx:
            procesar_decision_reparacion(
                usuario_cliente=self.cliente,
                id_reparacion=self.reparacion_confirmacion.id_reparacion,
                datos_validados={
                    'decision': 'ACEPTAR',
                    'metodo_entrega': 'ENVIO',
                    'metodo_pago': 'EFECTIVO'
                }
            )
        self.assertIn("no está disponible para envíos a domicilio", str(ctx.exception))

    def test_api_decision_reparacion_rechaza_envio_con_efectivo_400(self):
        """Endpoint HTTP POST /decision/ devuelve 400 Bad Request si se solicita ENVIO con EFECTIVO."""
        self.client.force_authenticate(user=self.cliente)
        url = f'/api/workshop/reparaciones/{self.reparacion_confirmacion.id_reparacion}/decision/'
        payload = {
            'decision': 'ACEPTAR',
            'metodo_entrega': 'ENVIO',
            'metodo_pago': 'EFECTIVO'
        }
        res = self.client.post(url, payload, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('metodo_pago', res.data)


# ==============================================================================
# CU-10: ACTUALIZAR ESTADO DE REPARACIÓN (TÉCNICO / TALLER)
# ==============================================================================

class CU10ActualizarEstadoReparacionTestCase(TestCase):
    """
    Suite de pruebas integral para el CU-10: Actualizar estado de reparación.
    Verifica máquina de estados, selectores, servicios, bitácora, notificaciones y endpoints HTTP.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
        self.rol_tecnico = RolUsuario.objects.create(
            codigo='TECNICO',
            nombre_rol='Técnico',
            descripcion='Técnico del taller'
        )
        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Administrador total'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Cliente del servicio'
        )

        # Usuarios
        self.tecnico = Usuario.objects.create(
            email='tecnico_cu10@ifixpos.com',
            contrasena='hash_pwd',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_tecnico,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.tecnico,
            nombre='Carlos',
            apellido='Técnico',
            dni='20111222',
            telefono='+5491122334455'
        )

        self.admin = Usuario.objects.create(
            email='admin_cu10@ifixpos.com',
            contrasena='hash_pwd',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_admin,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.admin,
            nombre='Admin',
            apellido='Taller',
            dni='20999888',
            telefono='+5491199887766'
        )

        self.cliente = Usuario.objects.create(
            email='cliente_cu10@gmail.com',
            contrasena='hash_pwd',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente,
            nombre='Martín',
            apellido='Cliente',
            dni='30111222',
            telefono='+5491133445566'
        )

        # Catálogo y Dispositivo
        self.tipo_tel = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        self.marca_samsung = Marca.objects.create(nombre='Samsung', estado_activo=True)
        self.modelo_s21 = ModeloDispositivo.objects.create(
            nombre='Galaxy S21',
            id_marca=self.marca_samsung,
            id_tipo_dispositivo=self.tipo_tel,
            estado_activo=True
        )
        self.dispositivo = Dispositivo.objects.create(
            numero_serie='S21-TEST-CU10',
            fecha_registro=timezone.now().date(),
            id_modelo=self.modelo_s21,
            id_usuario=self.cliente
        )

        # Reparación en estado 'EN_REPARACION'
        self.reparacion_en_curso = Reparacion.objects.create(
            fecha_inicio=timezone.now().date(),
            etapa='EN_REPARACION',
            codigo_sec='REP1001',
            desc_cliente='Display roto',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico
        )

        # Diagnóstico asociado
        self.diagnostico = Diagnostico.objects.create(
            id_reparacion=self.reparacion_en_curso,
            descripcion_falla='Display dañado por caída',
            fecha_diagnostico=timezone.now().date(),
            costo_diagnostico=Decimal('5000.00')
        )

        # Reparación en 'ESPERANDO_REPUESTOS'
        self.reparacion_esperando_repuestos = Reparacion.objects.create(
            fecha_inicio=timezone.now().date(),
            etapa='ESPERANDO_REPUESTOS',
            codigo_sec='REP1002',
            desc_cliente='Módulo no disponible en stock local',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico
        )

        # Reparación en 'FINALIZADO'
        self.reparacion_finalizada = Reparacion.objects.create(
            fecha_inicio=timezone.now().date(),
            etapa='FINALIZADO',
            codigo_sec='REP1003',
            desc_cliente='Equipo reparado previamente',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico
        )

        # Reparación en estado terminal 'ENTREGADO'
        self.reparacion_entregada = Reparacion.objects.create(
            fecha_inicio=timezone.now().date(),
            etapa='ENTREGADO',
            codigo_sec='REP1004',
            desc_cliente='Entregado al cliente',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico
        )

        # Reparación en estado terminal 'CANCELADO'
        self.reparacion_cancelada = Reparacion.objects.create(
            fecha_inicio=timezone.now().date(),
            etapa='CANCELADO',
            codigo_sec='REP1005',
            desc_cliente='Presupuesto rechazado',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico
        )

    # --------------------------------------------------------------------------
    # PRUEBAS DEL SELECTOR
    # --------------------------------------------------------------------------

    def test_selector_obtener_reparacion_para_cambio_estado_exitoso(self):
        """El selector recupera exitosamente una reparación activa no terminal."""
        from workshop_app.selectors import obtener_reparacion_para_cambio_estado
        rep = obtener_reparacion_para_cambio_estado(self.reparacion_en_curso.id_reparacion)
        self.assertEqual(rep.id_reparacion, self.reparacion_en_curso.id_reparacion)
        self.assertEqual(rep.etapa, 'EN_REPARACION')

    def test_selector_obtener_reparacion_inexistente_levanta_object_does_not_exist(self):
        """El selector levanta ObjectDoesNotExist si el ID de reparación no existe."""
        from django.core.exceptions import ObjectDoesNotExist
        from workshop_app.selectors import obtener_reparacion_para_cambio_estado

        with self.assertRaises(ObjectDoesNotExist):
            obtener_reparacion_para_cambio_estado(999999)

    def test_selector_obtener_reparacion_terminal_levanta_validation_error(self):
        """El selector bloquea reparaciones en estado ENTREGADO o CANCELADO."""
        from django.core.exceptions import ValidationError as DjangoValidationError
        from workshop_app.selectors import obtener_reparacion_para_cambio_estado

        with self.assertRaises(DjangoValidationError) as ctx_entregado:
            obtener_reparacion_para_cambio_estado(self.reparacion_entregada.id_reparacion)
        self.assertIn("estado terminal", str(ctx_entregado.exception))

        with self.assertRaises(DjangoValidationError) as ctx_cancelado:
            obtener_reparacion_para_cambio_estado(self.reparacion_cancelada.id_reparacion)
        self.assertIn("estado terminal", str(ctx_cancelado.exception))

    # --------------------------------------------------------------------------
    # PRUEBAS DEL SERVICIO Y MÁQUINA DE ESTADOS
    # --------------------------------------------------------------------------

    def test_servicio_transicion_hacia_esperando_repuestos_desde_en_reparacion(self):
        """Permite transicionar legítimamente de EN_REPARACION a ESPERANDO_REPUESTOS."""
        from workshop_app.services import cambiar_estado_reparacion
        from workshop_app.models import BitacoraReparacion
        from core_app.models import Notificacion, LogSistema

        rep = cambiar_estado_reparacion(
            usuario_tecnico=self.tecnico,
            id_reparacion=self.reparacion_en_curso.id_reparacion,
            datos_validados={
                'nuevo_estado': 'ESPERANDO_REPUESTOS',
                'comentario': 'Pausado por falta de display original en stock.'
            }
        )

        self.assertEqual(rep.etapa, 'ESPERANDO_REPUESTOS')

        # Verificar Bitácora
        bitacora = BitacoraReparacion.objects.filter(id_reparacion=rep).latest('id_bitacora')
        self.assertEqual(bitacora.id_usuario, self.tecnico)
        self.assertEqual(bitacora.comentario, 'Pausado por falta de display original en stock.')

        # Verificar Notificación al cliente dueño del equipo
        notif = Notificacion.objects.filter(id_dispositivo=self.dispositivo).latest('id_notificacion')
        self.assertEqual(notif.id_usuario, self.cliente)
        self.assertIn("ESPERANDO_REPUESTOS", notif.mensaje)
        self.assertIn("Pausado por falta de display", notif.mensaje)

        # Verificar LogSistema
        log = LogSistema.objects.filter(tabla_afectada='reparacion', id_registro_afectado=str(rep.id_reparacion)).latest('id_log')
        self.assertEqual(log.tipo, 'AUDITORIA_TALLER')
        self.assertEqual(log.id_usuario, self.tecnico)

    def test_servicio_transicion_hacia_esperando_repuestos_desde_estado_invalido_bloqueada(self):
        """Bloquea pasar a ESPERANDO_REPUESTOS si el equipo no está en EN_REPARACION."""
        from workshop_app.services import cambiar_estado_reparacion

        # Equipo en ESPERANDO_CONFIRMACION
        rep_esperando_conf = Reparacion.objects.create(
            fecha_inicio=timezone.now().date(),
            etapa='ESPERANDO_CONFIRMACION',
            codigo_sec='REP1009',
            desc_cliente='Presupuesto sin aceptar',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico
        )

        with self.assertRaises(ValidationError) as ctx:
            cambiar_estado_reparacion(
                usuario_tecnico=self.tecnico,
                id_reparacion=rep_esperando_conf.id_reparacion,
                datos_validados={
                    'nuevo_estado': 'ESPERANDO_REPUESTOS',
                    'comentario': 'Intento inválido.'
                }
            )
        self.assertIn("Para pasar a 'Esperando Repuestos', el equipo debe encontrarse en 'En Reparación'", str(ctx.exception))

    def test_servicio_transicion_hacia_finalizado_exitoso(self):
        """Permite transicionar de EN_REPARACION a FINALIZADO si cuenta con diagnóstico."""
        from workshop_app.services import cambiar_estado_reparacion

        rep = cambiar_estado_reparacion(
            usuario_tecnico=self.tecnico,
            id_reparacion=self.reparacion_en_curso.id_reparacion,
            datos_validados={
                'nuevo_estado': 'FINALIZADO',
                'comentario': 'Reparación completada y verificada en banco de pruebas.'
            }
        )

        self.assertEqual(rep.etapa, 'FINALIZADO')

    def test_servicio_transicion_hacia_finalizado_sin_diagnostico_bloqueada(self):
        """Bloquea finalizar una orden si no posee diagnóstico técnico registrado."""
        from workshop_app.services import cambiar_estado_reparacion

        rep_sin_diag = Reparacion.objects.create(
            fecha_inicio=timezone.now().date(),
            etapa='EN_REPARACION',
            codigo_sec='REP1010',
            desc_cliente='En curso sin diag',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico
        )

        with self.assertRaises(ValidationError) as ctx:
            cambiar_estado_reparacion(
                usuario_tecnico=self.tecnico,
                id_reparacion=rep_sin_diag.id_reparacion,
                datos_validados={
                    'nuevo_estado': 'FINALIZADO',
                    'comentario': 'Intentando finalizar sin diagnóstico.'
                }
            )
        self.assertIn("no cuenta con un diagnóstico técnico registrado", str(ctx.exception))

    def test_servicio_transicion_hacia_en_reparacion_reanudacion(self):
        """Permite reanudar a EN_REPARACION desde ESPERANDO_REPUESTOS."""
        from workshop_app.services import cambiar_estado_reparacion

        rep = cambiar_estado_reparacion(
            usuario_tecnico=self.tecnico,
            id_reparacion=self.reparacion_esperando_repuestos.id_reparacion,
            datos_validados={
                'nuevo_estado': 'EN_REPARACION',
                'comentario': 'Llegó el repuesto solicitado del proveedor. Reanudando labor.'
            }
        )

        self.assertEqual(rep.etapa, 'EN_REPARACION')

    def test_servicio_transicion_hacia_en_reparacion_retrabajo_desde_finalizado(self):
        """Permite transicionar de FINALIZADO a EN_REPARACION por retrabajo / control de calidad fallido."""
        from workshop_app.services import cambiar_estado_reparacion

        rep = cambiar_estado_reparacion(
            usuario_tecnico=self.tecnico,
            id_reparacion=self.reparacion_finalizada.id_reparacion,
            datos_validados={
                'nuevo_estado': 'EN_REPARACION',
                'comentario': 'Reingreso a banco: falla detectada en control de calidad final.'
            }
        )

        self.assertEqual(rep.etapa, 'EN_REPARACION')

    def test_servicio_transicion_mismo_estado_bloqueada(self):
        """Bloquea cambiar una reparación al mismo estado en que ya se encuentra."""
        from workshop_app.services import cambiar_estado_reparacion

        with self.assertRaises(ValidationError) as ctx:
            cambiar_estado_reparacion(
                usuario_tecnico=self.tecnico,
                id_reparacion=self.reparacion_en_curso.id_reparacion,
                datos_validados={
                    'nuevo_estado': 'EN_REPARACION',
                    'comentario': 'Mismo estado.'
                }
            )
        self.assertIn("ya se encuentra en el estado", str(ctx.exception))

    def test_servicio_comentario_vacio_bloqueado(self):
        """Exige obligatoriamente comentario técnico no vacío."""
        from workshop_app.services import cambiar_estado_reparacion

        with self.assertRaises(ValidationError) as ctx:
            cambiar_estado_reparacion(
                usuario_tecnico=self.tecnico,
                id_reparacion=self.reparacion_en_curso.id_reparacion,
                datos_validados={
                    'nuevo_estado': 'ESPERANDO_REPUESTOS',
                    'comentario': '   '
                }
            )
        self.assertIn("comentario técnico es obligatorio", str(ctx.exception))

    # --------------------------------------------------------------------------
    # PRUEBAS DEL ENDPOINT HTTP API (PATCH)
    # --------------------------------------------------------------------------

    def test_api_cambiar_estado_reparacion_exitoso_como_tecnico(self):
        """El técnico autenticado actualiza el estado exitosamente con 200 OK."""
        self.client.force_authenticate(user=self.tecnico)
        url = f'/api/workshop/reparaciones/{self.reparacion_en_curso.id_reparacion}/estado/'
        payload = {
            'nuevo_estado': 'ESPERANDO_REPUESTOS',
            'comentario': 'Falta módulo táctil. Aguardando envío de proveedor.'
        }
        res = self.client.patch(url, payload, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['reparacion']['etapa'], 'ESPERANDO_REPUESTOS')
        self.assertIn("actualizado a 'ESPERANDO_REPUESTOS'", res.data['mensaje'])

    def test_api_cambiar_estado_reparacion_exitoso_como_admin(self):
        """El administrador del sistema puede también actualizar el estado con 200 OK."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/workshop/reparaciones/{self.reparacion_en_curso.id_reparacion}/estado/'
        payload = {
            'nuevo_estado': 'FINALIZADO',
            'comentario': 'Aprobado y finalizado por auditoría de taller.'
        }
        res = self.client.patch(url, payload, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['reparacion']['etapa'], 'FINALIZADO')

    def test_api_cambiar_estado_reparacion_rol_cliente_denegado_403(self):
        """Un usuario con rol Cliente recibe 403 Forbidden al intentar actualizar el estado de una reparación."""
        self.client.force_authenticate(user=self.cliente)
        url = f'/api/workshop/reparaciones/{self.reparacion_en_curso.id_reparacion}/estado/'
        payload = {
            'nuevo_estado': 'FINALIZADO',
            'comentario': 'El cliente no puede autogestionar este cambio.'
        }
        res = self.client.patch(url, payload, format='json')

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Se requiere rol de Administrador o Técnico", str(res.data))

    def test_api_cambiar_estado_reparacion_no_autenticado_401(self):
        """Petición anónima recibe 401 Unauthorized o 403 Forbidden."""
        url = f'/api/workshop/reparaciones/{self.reparacion_en_curso.id_reparacion}/estado/'
        payload = {
            'nuevo_estado': 'FINALIZADO',
            'comentario': 'Sin autenticación.'
        }
        res = self.client.patch(url, payload, format='json')

        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class EntregarDispositivoCU46TestCase(TestCase):
    """
    Pruebas unitarias e integrales para CU-46: Entregar Dispositivo.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Administrador total'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Técnico del taller'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Cliente del servicio'}
        )


        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.entrega@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_admin,
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.entrega@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_tecnico,
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente.entrega@test.com',
            contrasena='hash_pwd',
            fecha_registro=date.today(),
            id_rol=self.rol_cliente,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente,
            dni='40123456',
            nombre='Carlos',
            apellido='Entrega'
        )

        # Dispositivo
        self.marca = Marca.objects.create(nombre='Motorola', estado_activo=True)
        self.tipo_disp = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='Moto G84',
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo_disp,
            estado_activo=True
        )


        self.dispositivo = Dispositivo.objects.create(
            numero_serie='IMEI-ENTREGA-999',
            fecha_registro=date.today(),
            id_modelo=self.modelo,
            id_usuario=self.cliente
        )

        # Reparación lista para retirar pero ya pagada (más reciente)
        self.reparacion_pagada = Reparacion.objects.create(
            fecha_inicio=date(2026, 10, 21),
            etapa='PAGADO',
            codigo_sec='TOKEN-ENTREGA-OK',
            id_dispositivo=self.dispositivo,
            id_usuario=self.cliente
        )

        # Reparación lista para retirar pero pendiente de cobro (anterior)
        self.reparacion_deudora = Reparacion.objects.create(
            fecha_inicio=date(2026, 10, 1),
            etapa='LISTO_PARA_RETIRAR',
            codigo_sec='TOKEN-DEUDA-100',
            id_dispositivo=self.dispositivo,
            id_usuario=self.cliente
        )

        # Añadimos diagnóstico con costo para que tenga saldo adeudado > 0
        Diagnostico.objects.create(
            descripcion_falla='Cambio de pantalla',
            fecha_diagnostico=date.today(),
            costo_diagnostico=Decimal('25000.00'),
            id_reparacion=self.reparacion_deudora
        )

    def test_entrega_exitosa_con_codigo_seguridad(self):
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'codigo_seguridad': 'TOKEN-ENTREGA-OK',
            'comentarios_entrega': 'Equipo probado frente al cliente, táctil funcionando.'
        }
        res = self.client.post('/api/workshop/reparaciones/entregar/', payload, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['etapa'], 'ENTREGADO')

        # Verificar actualización en base de datos
        self.reparacion_pagada.refresh_from_db()
        self.assertEqual(self.reparacion_pagada.etapa, 'ENTREGADO')
        self.assertIsNotNone(self.reparacion_pagada.fecha_entrega)

        # Verificar Bitácora
        bitacora = BitacoraReparacion.objects.filter(id_reparacion=self.reparacion_pagada).last()
        self.assertIsNotNone(bitacora)
        self.assertEqual(bitacora.estado_alcanzado, 7)
        self.assertIn('Equipo probado frente al cliente', bitacora.comentario)

    def test_entrega_con_dni_permitida_solo_admin(self):
        # Técnico intenta buscar por DNI -> 403 Forbidden
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'dni_cliente': '40123456'
        }
        res_tec = self.client.post('/api/workshop/reparaciones/entregar/', payload, format='json')
        self.assertEqual(res_tec.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Solo los administradores poseen privilegios', str(res_tec.data))

        # Administrador busca por DNI -> Éxito
        self.client.force_authenticate(user=self.admin)
        res_adm = self.client.post('/api/workshop/reparaciones/entregar/', payload, format='json')
        self.assertEqual(res_adm.status_code, status.HTTP_200_OK)
        self.assertEqual(res_adm.data['etapa'], 'ENTREGADO')



    def test_entrega_bloqueada_por_saldo_deudor_pendiente(self):
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'codigo_seguridad': 'TOKEN-DEUDA-100'
        }
        res = self.client.post('/api/workshop/reparaciones/entregar/', payload, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('saldo deudor pendiente de cobro', str(res.data))

        # Verificar que NO transicionó a ENTREGADO
        self.reparacion_deudora.refresh_from_db()
        self.assertNotEqual(self.reparacion_deudora.etapa, 'ENTREGADO')

    def test_entrega_bloqueada_si_reparacion_no_esta_lista(self):
        self.client.force_authenticate(user=self.tecnico)
        self.reparacion_pagada.etapa = 'EN_REPARACION'
        self.reparacion_pagada.save()

        payload = {
            'codigo_seguridad': 'TOKEN-ENTREGA-OK'
        }
        res = self.client.post('/api/workshop/reparaciones/entregar/', payload, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('El equipo no está apto para liberación o aún se encuentra en proceso', str(res.data))

    def test_entrega_falla_si_no_se_envia_codigo_ni_dni(self):
        self.client.force_authenticate(user=self.tecnico)
        payload = {}
        res = self.client.post('/api/workshop/reparaciones/entregar/', payload, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Debe proporcionar el código de seguridad o el DNI del cliente', str(res.data))


# ==============================================================================
# PRUEBAS: NUEVO DIAGNÓSTICO, MULTIPLES DIAGNÓSTICOS Y RADIOGRAFÍA TÉCNICA
# ==============================================================================

class NuevoDiagnosticoYDetalleTecnicoTests(TestCase):
    """
    Pruebas unitarias e integrales para el flujo de reevaluación técnica:
    - Transición desde cualquier estado activo hacia 'ESPERANDO_DIAGNOSTICO'.
    - Registro de múltiples diagnósticos en el ciclo de vida de la reparación.
    - Reemplazo y preservación limpia de DetalleInsumoReparacion con los del nuevo diagnóstico.
    - Serialización de historial cronológico de diagnósticos y enlaces para técnicos en notificaciones.
    """
    def setUp(self):
        from catalog_app.models import CategoriaProducto, Producto
        from workshop_app.models import DetalleInsumoReparacion
        self.hoy = timezone.now().date()
        self.rol_tec = RolUsuario.objects.create(codigo='TECNICO', nombre_rol='Técnico')
        self.rol_cli = RolUsuario.objects.create(codigo='CLIENTE', nombre_rol='Cliente')

        self.tecnico = Usuario.objects.create(
            email='tecnico_eval@ifixpos.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_tec,
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente_eval@ifixpos.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_cli,
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente,
            nombre='Carlos',
            apellido='Evaluado',
            dni='33444555'
        )

        self.marca = Marca.objects.create(nombre='Motorola', estado_activo=True)
        self.tipo_disp = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='Moto G84',
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo_disp,
            estado_activo=True
        )
        self.dispositivo = Dispositivo.objects.create(
            numero_serie='MOTO-REEVAL-01',
            id_usuario=self.cliente,
            id_modelo=self.modelo,
            fecha_registro=self.hoy
        )

        self.reparacion = Reparacion.objects.create(
            etapa='EN_REPARACION',
            fecha_inicio=self.hoy,
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico,
            desc_cliente='No enciende tras golpe'
        )

        self.cat_prod = CategoriaProducto.objects.create(nombre='Pantallas', estado=True)
        self.prod_pantalla = Producto.objects.create(
            nombre='Módulo Pantalla Moto G84',
            precio_venta=Decimal('35000.00'),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=False,
            id_categoria=self.cat_prod
        )
        self.prod_bateria = Producto.objects.create(
            nombre='Batería Moto G84 Original',
            precio_venta=Decimal('15000.00'),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=False,
            id_categoria=self.cat_prod
        )

        # Diagnóstico 1 inicial
        self.diag1 = Diagnostico.objects.create(
            id_reparacion=self.reparacion,
            descripcion_falla='Falla de módulo display dañado.',
            fecha_diagnostico=self.hoy,
            costo_diagnostico=Decimal('10000.00')
        )
        DetalleInsumoReparacion.objects.create(
            id_reparacion=self.reparacion,
            id_producto=self.prod_pantalla,
            cantidad=1,
            precio_unitario=Decimal('35000.00')
        )

    def test_cambiar_estado_a_esperando_diagnostico_desde_en_reparacion(self):
        """El técnico puede transicionar la reparación a ESPERANDO_DIAGNOSTICO para reevaluación."""
        from workshop_app.services import cambiar_estado_reparacion

        datos = {
            'nuevo_estado': 'ESPERANDO_DIAGNOSTICO',
            'comentario': 'Se detectó que el equipo además de pantalla tiene daño en placa de carga.'
        }
        rep = cambiar_estado_reparacion(
            usuario_tecnico=self.tecnico,
            id_reparacion=self.reparacion.id_reparacion,
            datos_validados=datos
        )
        self.assertEqual(rep.etapa, 'ESPERANDO_DIAGNOSTICO')

        # Verificar registro inmutable en BitacoraReparacion
        bitacora = self.reparacion.bitacorareparacion_set.order_by('-id_bitacora').first()
        self.assertIsNotNone(bitacora)
        self.assertEqual(bitacora.estado_alcanzado, 2)  # 2: ESPERANDO_DIAGNOSTICO
        self.assertIn('placa de carga', bitacora.comentario)

    def test_cambiar_estado_a_esperando_diagnostico_bloqueado_en_estado_terminal(self):
        """En estado terminal ENTREGADO no se permite solicitar nuevo diagnóstico."""
        from workshop_app.services import cambiar_estado_reparacion
        from django.core.exceptions import ValidationError

        self.reparacion.etapa = 'ENTREGADO'
        self.reparacion.save()

        datos = {
            'nuevo_estado': 'ESPERANDO_DIAGNOSTICO',
            'comentario': 'Intento inválido'
        }
        with self.assertRaises(ValidationError):
            cambiar_estado_reparacion(
                usuario_tecnico=self.tecnico,
                id_reparacion=self.reparacion.id_reparacion,
                datos_validados=datos
            )

    def test_cargar_nuevo_diagnostico_multiples_diagnosticos_y_reemplazo_insumos(self):
        """
        Al emitir un nuevo diagnóstico:
        - Se crea una nueva instancia de Diagnostico vinculada a la orden.
        - Los insumos previos son reemplazados por los nuevos insumos presupuestados.
        - La reparación transiciona a ESPERANDO_CONFIRMACION.
        - Se registra en bitácora 'Carga de nuevo diagnóstico'.
        """
        from workshop_app.services import cargar_diagnostico_tecnico

        # Colocar reparación en ESPERANDO_DIAGNOSTICO
        self.reparacion.etapa = 'ESPERANDO_DIAGNOSTICO'
        self.reparacion.save()

        datos_nuevo_diag = {
            'descripcion_falla': 'Reevaluación técnica: Además del display, batería hinchada requiere recambio.',
            'costo_mano_obra': Decimal('15000.00'),
            'insumos': [
                {'id_producto': self.prod_pantalla.id_producto, 'cantidad': 1},
                {'id_producto': self.prod_bateria.id_producto, 'cantidad': 1}
            ]
        }

        nuevo_diag = cargar_diagnostico_tecnico(
            usuario_tecnico=self.tecnico,
            id_reparacion=self.reparacion.id_reparacion,
            datos_validados=datos_nuevo_diag
        )

        self.reparacion.refresh_from_db()
        self.assertEqual(self.reparacion.etapa, 'ESPERANDO_CONFIRMACION')

        # Verificar que existan 2 diagnósticos en la reparación
        diagnosticos = list(self.reparacion.diagnostico_set.order_by('-id_diagnostico'))
        self.assertEqual(len(diagnosticos), 2)
        self.assertEqual(diagnosticos[0].id_diagnostico, nuevo_diag.id_diagnostico)
        self.assertEqual(diagnosticos[0].costo_diagnostico, Decimal('15000.00'))

        # Verificar que los insumos actuales corresponden al nuevo diagnóstico (2 items)
        insumos_actuales = self.reparacion.detalleinsumoreparacion_set.all()
        self.assertEqual(insumos_actuales.count(), 2)

        # Verificar bitácora
        ultima_bitacora = self.reparacion.bitacorareparacion_set.order_by('-id_bitacora').first()
        self.assertEqual(ultima_bitacora.estado_alcanzado, 4)  # 4: ESPERANDO_CONFIRMACION
        self.assertEqual(ultima_bitacora.comentario, "Carga de nuevo diagnóstico")

    def test_reparacion_detalle_serializer_expone_todos_los_diagnosticos_ordenados(self):
        """ReparacionDetalleOutputSerializer expone diagnostico vigente y array completo de diagnosticos."""
        from workshop_app.serializers import ReparacionDetalleOutputSerializer

        # Diagnóstico 2
        diag2 = Diagnostico.objects.create(
            id_reparacion=self.reparacion,
            descripcion_falla='Diagnóstico posterior corregido.',
            fecha_diagnostico=self.hoy,
            costo_diagnostico=Decimal('18000.00')
        )

        serializer = ReparacionDetalleOutputSerializer(
            self.reparacion,
            context={'usuario': self.tecnico}
        )
        data = serializer.data

        # El diagnóstico vigente expuesto debe ser el último (diag2)
        self.assertIsNotNone(data['diagnostico'])
        self.assertEqual(data['diagnostico']['id_diagnostico'], diag2.id_diagnostico)

        # El historial de diagnósticos debe contener los 2 diagnósticos ordenados desc
        self.assertEqual(len(data['diagnosticos']), 2)
        self.assertEqual(data['diagnosticos'][0]['id_diagnostico'], diag2.id_diagnostico)
        self.assertEqual(data['diagnosticos'][1]['id_diagnostico'], self.diag1.id_diagnostico)

    def test_notificacion_output_serializer_url_destino_para_tecnico(self):
        """NotificacionOutputSerializer asigna enlace a /tecnico/reparaciones/:id cuando el destinatario es técnico."""
        from core_app.models import Notificacion
        from core_app.serializers import NotificacionOutputSerializer

        notif_tecnico = Notificacion.objects.create(
            id_usuario=self.tecnico,
            mensaje=f"Actualización técnica sobre la Orden #{self.reparacion.id_reparacion}",
            tipo="CAMBIO_ESTADO_REPARACION",
            fecha_envio=self.hoy,
            leida=False,
            id_dispositivo=self.dispositivo
        )

        serializer = NotificacionOutputSerializer(notif_tecnico)
        self.assertEqual(
            serializer.data['url_destino'],
            f"/tecnico/reparaciones/{self.reparacion.id_reparacion}"
        )


# ==============================================================================
# CU-19: CALIFICAR SERVICIO TÉCNICO (TESTS)
# ==============================================================================

class CalificarServicioTecnicoCU19Tests(TestCase):
    """
    Pruebas integrales y unitarias para el CU-19: Calificar Servicio Técnico.
    Verifica:
    - Flujo feliz: cliente califica su reparación entregada con puntuación y comentario (201 Created).
    - Flujo feliz: calificación exitosa sin comentario opcional.
    - Persistencia correcta e inmutable en Calificacion y generación de LogSistema de auditoría.
    - Seguridad de Autenticación: usuario anónimo recibe 401 Unauthorized.
    - Control de Acceso por Roles: usuarios sin rol CLIENTE reciben 403 Forbidden.
    - Seguridad Horizontal (Propiedad): cliente no puede calificar la reparación de otro cliente (403 PermissionDenied).
    - Precondición Operativa: no se puede calificar una reparación que no esté en estado terminal 'ENTREGADO' (400 ValidationError).
    - Unicidad: no se puede emitir una segunda calificación sobre una misma reparación (400 ValidationError).
    - Validación de Entrada: puntuación obligatoria y en rango 1-5 (400 ValidationError si es 0, 6 o no numérica).
    - Manejo de recursos inexistentes: reparación inexistente retorna 404 Not Found.
    - Pruebas directas de selectors y services para verificar el desacoplamiento estricto HackSoftware.
    """

    def setUp(self):
        from workshop_app.models import Calificacion
        self.client = APIClient()
        self.hoy = timezone.now().date()

        # Roles
        self.rol_cliente = RolUsuario.objects.create(codigo='CLIENTE', nombre_rol='Cliente', descripcion='Cliente del taller')
        self.rol_tecnico = RolUsuario.objects.create(codigo='TECNICO', nombre_rol='Técnico', descripcion='Técnico del taller')
        self.rol_admin = RolUsuario.objects.create(codigo='ADMIN', nombre_rol='Administrador', descripcion='Administrador total')

        # Usuarios
        self.cliente = Usuario.objects.create(
            email='cliente_cu19@test.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.cliente_ajeno = Usuario.objects.create(
            email='cliente_ajeno_cu19@test.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico_cu19@test.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_tecnico,
            is_active=True
        )

        # Catálogo
        self.tipo = TipoDispositivo.objects.create(nombre='Smartphone CU19', estado_activo=True)
        self.marca = Marca.objects.create(nombre='Motorola CU19', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='Moto G100 CU19',
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo,
            estado_activo=True
        )

        # Dispositivos
        self.dispositivo_cliente = Dispositivo.objects.create(
            numero_serie='SN-CU19-01',
            fecha_registro=self.hoy,
            id_modelo=self.modelo,
            id_usuario=self.cliente
        )
        self.dispositivo_ajeno = Dispositivo.objects.create(
            numero_serie='SN-CU19-02',
            fecha_registro=self.hoy,
            id_modelo=self.modelo,
            id_usuario=self.cliente_ajeno
        )

        # Reparaciones
        self.reparacion_entregada = Reparacion.objects.create(
            fecha_inicio=self.hoy,
            etapa='ENTREGADO',
            desc_cliente='Pantalla rota reparada',
            id_dispositivo=self.dispositivo_cliente,
            id_usuario=self.cliente
        )
        self.reparacion_en_curso = Reparacion.objects.create(
            fecha_inicio=self.hoy,
            etapa='EN_REPARACION',
            desc_cliente='Batería agotada',
            id_dispositivo=self.dispositivo_cliente,
            id_usuario=self.cliente
        )
        self.reparacion_ajena = Reparacion.objects.create(
            fecha_inicio=self.hoy,
            etapa='ENTREGADO',
            desc_cliente='Módulo dañado',
            id_dispositivo=self.dispositivo_ajeno,
            id_usuario=self.cliente_ajeno
        )

    def test_calificar_reparacion_exitoso_con_comentario(self):
        """Flujo normal: cliente emite valoración de 5 estrellas con comentario."""
        from workshop_app.models import Calificacion
        self.client.force_authenticate(user=self.cliente)

        url = f"/api/workshop/reparaciones/{self.reparacion_entregada.id_reparacion}/calificar/"
        payload = {
            "puntuacion": 5,
            "comentario": "Excelente servicio, el equipo quedó impecable."
        }

        response = self.client.post(url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["mensaje"], "Gracias por su retroalimentación.")
        self.assertEqual(response.data["calificacion"]["puntuacion"], 5)
        self.assertEqual(response.data["calificacion"]["comentario"], "Excelente servicio, el equipo quedó impecable.")

        # Verificar persistencia inmutable en la base de datos
        calificacion_bd = Calificacion.objects.filter(id_reparacion=self.reparacion_entregada).first()
        self.assertIsNotNone(calificacion_bd)
        self.assertEqual(calificacion_bd.puntuacion, 5)
        self.assertEqual(calificacion_bd.comentario, "Excelente servicio, el equipo quedó impecable.")
        self.assertEqual(calificacion_bd.fecha, self.hoy)

        # Verificar auditoría en LogSistema
        log = LogSistema.objects.filter(
            accion="Calificar Servicio Técnico (CU-19)",
            id_registro_afectado=str(calificacion_bd.id_calificacion)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("5/5", log.detalle)
        self.assertEqual(log.id_usuario, self.cliente)

    def test_calificar_reparacion_exitoso_sin_comentario(self):
        """Flujo normal: la puntuación es obligatoria pero el comentario es opcional."""
        from workshop_app.models import Calificacion
        self.client.force_authenticate(user=self.cliente)

        url = f"/api/workshop/reparaciones/{self.reparacion_entregada.id_reparacion}/calificar/"
        payload = {
            "puntuacion": 4
        }

        response = self.client.post(url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["mensaje"], "Gracias por su retroalimentación.")
        self.assertEqual(response.data["calificacion"]["puntuacion"], 4)
        self.assertEqual(response.data["calificacion"]["comentario"], "Sin comentario")

        calificacion_bd = Calificacion.objects.filter(id_reparacion=self.reparacion_entregada).first()
        self.assertIsNotNone(calificacion_bd)
        self.assertEqual(calificacion_bd.puntuacion, 4)
        self.assertIsNone(calificacion_bd.comentario)

    def test_calificar_reparacion_sin_autenticacion_falla(self):
        """Paso de precondición: usuario anónimo es rechazado (401 o 403)."""
        url = f"/api/workshop/reparaciones/{self.reparacion_entregada.id_reparacion}/calificar/"
        payload = {"puntuacion": 5}

        response = self.client.post(url, payload, format='json')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_calificar_reparacion_rol_no_cliente_falla(self):
        """Precondición de rol: un técnico no puede emitir calificaciones de cliente."""
        self.client.force_authenticate(user=self.tecnico)

        url = f"/api/workshop/reparaciones/{self.reparacion_entregada.id_reparacion}/calificar/"
        payload = {"puntuacion": 5}

        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_calificar_reparacion_ajena_falla_seguridad_horizontal(self):
        """Seguridad Horizontal: un cliente no puede calificar la orden de otro cliente."""
        self.client.force_authenticate(user=self.cliente)

        url = f"/api/workshop/reparaciones/{self.reparacion_ajena.id_reparacion}/calificar/"
        payload = {"puntuacion": 5}

        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("no pertenece a su cuenta", str(response.data))

    def test_calificar_reparacion_no_entregada_falla(self):
        """Precondición de estado: la reparación debe estar estrictamente 'ENTREGADO'."""
        self.client.force_authenticate(user=self.cliente)

        url = f"/api/workshop/reparaciones/{self.reparacion_en_curso.id_reparacion}/calificar/"
        payload = {"puntuacion": 5}

        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Solo puede calificar equipos que ya han sido entregados", str(response.data))

    def test_calificar_reparacion_duplicada_falla_unicidad(self):
        """Unicidad: no se permite calificar más de una vez una misma reparación."""
        from workshop_app.models import Calificacion
        # Pre-crear calificación
        Calificacion.objects.create(
            puntuacion=5,
            comentario="Primera calificación",
            fecha=self.hoy,
            id_reparacion=self.reparacion_entregada
        )

        self.client.force_authenticate(user=self.cliente)

        url = f"/api/workshop/reparaciones/{self.reparacion_entregada.id_reparacion}/calificar/"
        payload = {"puntuacion": 3, "comentario": "Intento de segunda calificación"}

        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Esta reparación ya fue calificada previamente", str(response.data))

    def test_calificar_reparacion_puntuacion_invalida_falla(self):
        """Aduana (Serializer): puntuación fuera del rango 1 a 5 debe ser rechazada."""
        self.client.force_authenticate(user=self.cliente)
        url = f"/api/workshop/reparaciones/{self.reparacion_entregada.id_reparacion}/calificar/"

        # Caso menor a 1 (0)
        res_0 = self.client.post(url, {"puntuacion": 0}, format='json')
        self.assertEqual(res_0.status_code, status.HTTP_400_BAD_REQUEST)

        # Caso mayor a 5 (6)
        res_6 = self.client.post(url, {"puntuacion": 6}, format='json')
        self.assertEqual(res_6.status_code, status.HTTP_400_BAD_REQUEST)

        # Caso negativo
        res_neg = self.client.post(url, {"puntuacion": -1}, format='json')
        self.assertEqual(res_neg.status_code, status.HTTP_400_BAD_REQUEST)

        # Caso sin puntuación (vacía)
        res_vacio = self.client.post(url, {"comentario": "Sin puntos"}, format='json')
        self.assertEqual(res_vacio.status_code, status.HTTP_400_BAD_REQUEST)

    def test_calificar_reparacion_inexistente_falla(self):
        """Recurso no encontrado: ID inexistente retorna 404."""
        self.client.force_authenticate(user=self.cliente)
        url = "/api/workshop/reparaciones/999999/calificar/"
        payload = {"puntuacion": 5}

        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_selector_y_servicio_directos(self):
        """Prueba unitaria directa del Selector y Servicio (Arquitectura HackSoftware pura)."""
        from workshop_app.selectors import obtener_reparacion_para_calificar
        from workshop_app.services import calificar_reparacion
        from rest_framework.exceptions import PermissionDenied, ValidationError

        # 1. Selector directo
        rep = obtener_reparacion_para_calificar(
            usuario_cliente=self.cliente,
            id_reparacion=self.reparacion_entregada.id_reparacion
        )
        self.assertEqual(rep.id_reparacion, self.reparacion_entregada.id_reparacion)

        # 2. Selector seguridad horizontal
        with self.assertRaises(PermissionDenied):
            obtener_reparacion_para_calificar(
                usuario_cliente=self.cliente_ajeno,
                id_reparacion=self.reparacion_entregada.id_reparacion
            )

        # 3. Servicio directo
        calif = calificar_reparacion(
            usuario_cliente=self.cliente,
            id_reparacion=self.reparacion_entregada.id_reparacion,
            datos_validados={"puntuacion": 5, "comentario": "Servicio directo"}
        )
        self.assertEqual(calif.puntuacion, 5)
        self.assertEqual(calif.comentario, "Servicio directo")

        # 4. Segundo intento debe fallar en el selector por unicidad
        with self.assertRaises(ValidationError):
            calificar_reparacion(
                usuario_cliente=self.cliente,
                id_reparacion=self.reparacion_entregada.id_reparacion,
                datos_validados={"puntuacion": 4}
            )


# ==============================================================================
# CU-51: CONSULTAR CALIFICACIÓN DE SERVICIO (TESTS)
# ==============================================================================

class ConsultarCalificacionServicioCU51Tests(TestCase):
    """
    Pruebas integrales y unitarias para el CU-51: Consultar Calificación de Servicio.
    Verifica:
    - Cliente propietario consulta calificación existente (200 OK con datos completos y anidados).
    - Técnico asignado consulta la calificación de su reparación (200 OK).
    - Administrador consulta cualquier calificación (200 OK - acceso irrestricto).
    - Cliente ajeno intenta consultar la calificación de otra cuenta (403 PermissionDenied).
    - Técnico ajeno intenta consultar la calificación de una orden no asignada (403 PermissionDenied).
    - Reparación entregada pero pendiente de calificación por parte del cliente (404 Not Found con mensaje informativo).
    - Formateo de comentario vacío/nulo como "Sin comentario".
    - Usuario anónimo rechazado (401 o 403).
    - Reparación inexistente (404 Not Found).
    - Prueba unitaria del selector obtener_calificacion_reparacion.
    """

    def setUp(self):
        from workshop_app.models import Calificacion
        self.client = APIClient()
        self.hoy = timezone.now().date()

        # Roles
        self.rol_cliente = RolUsuario.objects.create(codigo='CLIENTE', nombre_rol='Cliente', descripcion='Cliente')
        self.rol_tecnico = RolUsuario.objects.create(codigo='TECNICO', nombre_rol='Técnico', descripcion='Técnico')
        self.rol_admin = RolUsuario.objects.create(codigo='ADMIN', nombre_rol='Administrador', descripcion='Administrador')

        # Usuarios
        self.cliente = Usuario.objects.create(
            email='cliente_cu51@test.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.cliente_ajeno = Usuario.objects.create(
            email='cliente_ajeno_cu51@test.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_cliente,
            is_active=True
        )
        self.tecnico_asignado = Usuario.objects.create(
            email='tecnico_asignado_cu51@test.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_tecnico,
            is_active=True
        )
        self.tecnico_ajeno = Usuario.objects.create(
            email='tecnico_ajeno_cu51@test.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_tecnico,
            is_active=True
        )
        self.admin = Usuario.objects.create(
            email='admin_cu51@test.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_admin,
            is_active=True
        )

        # Catálogo
        self.tipo = TipoDispositivo.objects.create(nombre='Tablet CU51', estado_activo=True)
        self.marca = Marca.objects.create(nombre='Samsung CU51', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='Galaxy Tab S9 CU51',
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo,
            estado_activo=True
        )

        # Dispositivos
        self.dispositivo_cliente = Dispositivo.objects.create(
            numero_serie='SN-TAB-CU51-01',
            fecha_registro=self.hoy,
            id_modelo=self.modelo,
            id_usuario=self.cliente
        )
        self.dispositivo_ajeno = Dispositivo.objects.create(
            numero_serie='SN-TAB-CU51-02',
            fecha_registro=self.hoy,
            id_modelo=self.modelo,
            id_usuario=self.cliente_ajeno
        )

        # Reparaciones
        self.reparacion_calificada = Reparacion.objects.create(
            fecha_inicio=self.hoy,
            etapa='ENTREGADO',
            desc_cliente='Pin de carga dañado',
            id_dispositivo=self.dispositivo_cliente,
            id_usuario=self.tecnico_asignado
        )
        self.reparacion_sin_calificar = Reparacion.objects.create(
            fecha_inicio=self.hoy,
            etapa='ENTREGADO',
            desc_cliente='Cambio de batería',
            id_dispositivo=self.dispositivo_cliente,
            id_usuario=self.tecnico_asignado
        )
        self.reparacion_calificada_sin_comentario = Reparacion.objects.create(
            fecha_inicio=self.hoy,
            etapa='ENTREGADO',
            desc_cliente='Limpieza interna',
            id_dispositivo=self.dispositivo_cliente,
            id_usuario=self.tecnico_asignado
        )

        # Calificaciones
        self.calificacion_con_texto = Calificacion.objects.create(
            puntuacion=5,
            comentario="Excelente servicio, repararon el pin en el día.",
            fecha=self.hoy,
            id_reparacion=self.reparacion_calificada
        )
        self.calificacion_vacia = Calificacion.objects.create(
            puntuacion=4,
            comentario=None,
            fecha=self.hoy,
            id_reparacion=self.reparacion_calificada_sin_comentario
        )

    def test_cliente_propietario_consulta_calificacion_exitosa(self):
        """Paso 1 y 4: Cliente consulta su propia calificación y recibe datos anidados del equipo."""
        self.client.force_authenticate(user=self.cliente)
        url = f"/api/workshop/reparaciones/{self.reparacion_calificada.id_reparacion}/calificacion/"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id_calificacion"], self.calificacion_con_texto.id_calificacion)
        self.assertEqual(response.data["puntuacion"], 5)
        self.assertEqual(response.data["comentario"], "Excelente servicio, repararon el pin en el día.")
        self.assertEqual(response.data["fecha"], str(self.hoy))

        # Verificar datos anidados de reparación y dispositivo
        reparacion_data = response.data["reparacion"]
        self.assertIsNotNone(reparacion_data)
        self.assertEqual(reparacion_data["id_reparacion"], self.reparacion_calificada.id_reparacion)
        self.assertEqual(reparacion_data["marca"], "Samsung CU51")
        self.assertEqual(reparacion_data["modelo"], "Galaxy Tab S9 CU51")
        self.assertEqual(reparacion_data["numero_serie"], "SN-TAB-CU51-01")

    def test_tecnico_asignado_consulta_calificacion_exitosa(self):
        """Paso 2: El técnico asignado a la orden puede consultar el feedback del cliente."""
        self.client.force_authenticate(user=self.tecnico_asignado)
        url = f"/api/workshop/reparaciones/{self.reparacion_calificada.id_reparacion}/calificacion/"

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["puntuacion"], 5)

    def test_administrador_consulta_calificacion_exitosa(self):
        """Paso 2: Administrador posee acceso irrestricto a cualquier calificación."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/workshop/reparaciones/{self.reparacion_calificada.id_reparacion}/calificacion/"

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["puntuacion"], 5)

    def test_cliente_ajeno_recibe_permission_denied(self):
        """Excepción Paso 2: Cliente intenta ver una calificación de un equipo ajeno."""
        self.client.force_authenticate(user=self.cliente_ajeno)
        url = f"/api/workshop/reparaciones/{self.reparacion_calificada.id_reparacion}/calificacion/"

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("No posee permisos", str(response.data))

    def test_tecnico_ajeno_recibe_permission_denied(self):
        """Excepción Paso 2: Técnico intenta ver una calificación de una orden ajena."""
        self.client.force_authenticate(user=self.tecnico_ajeno)
        url = f"/api/workshop/reparaciones/{self.reparacion_calificada.id_reparacion}/calificacion/"

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("no asignadas", str(response.data))

    def test_reparacion_pendiente_calificacion_retorna_404(self):
        """Excepción Paso 3: Reparación finalizada pero pendiente de calificación por el cliente."""
        self.client.force_authenticate(user=self.cliente)
        url = f"/api/workshop/reparaciones/{self.reparacion_sin_calificar.id_reparacion}/calificacion/"

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("Reparación pendiente de calificación por parte del cliente", str(response.data))

    def test_calificacion_sin_comentario_muestra_sin_comentario(self):
        """Formato: Si el cliente no dejó texto, el serializador expone 'Sin comentario'."""
        self.client.force_authenticate(user=self.cliente)
        url = f"/api/workshop/reparaciones/{self.reparacion_calificada_sin_comentario.id_reparacion}/calificacion/"

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["puntuacion"], 4)
        self.assertEqual(response.data["comentario"], "Sin comentario")

    def test_consulta_anonima_rechazada(self):
        """Precondición de sesión: Petición anónima es rechazada (401 o 403)."""
        url = f"/api/workshop/reparaciones/{self.reparacion_calificada.id_reparacion}/calificacion/"

        response = self.client.get(url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_consulta_reparacion_inexistente_retorna_404(self):
        """Recurso no encontrado: ID inexistente responde 404."""
        self.client.force_authenticate(user=self.admin)
        url = "/api/workshop/reparaciones/999999/calificacion/"

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_selector_obtener_calificacion_reparacion_directo(self):
        """Prueba unitaria pura del selector aplicando control de acceso."""
        from workshop_app.selectors import obtener_calificacion_reparacion
        from rest_framework.exceptions import PermissionDenied, NotFound

        # 1. Acceso exitoso del cliente propietario
        calif = obtener_calificacion_reparacion(
            usuario_ejecutor=self.cliente,
            id_reparacion=self.reparacion_calificada.id_reparacion
        )
        self.assertEqual(calif.id_calificacion, self.calificacion_con_texto.id_calificacion)

        # 2. Bloqueo de cliente ajeno
        with self.assertRaises(PermissionDenied):
            obtener_calificacion_reparacion(
                usuario_ejecutor=self.cliente_ajeno,
                id_reparacion=self.reparacion_calificada.id_reparacion
            )

        # 3. Bloqueo de técnico ajeno
        with self.assertRaises(PermissionDenied):
            obtener_calificacion_reparacion(
                usuario_ejecutor=self.tecnico_ajeno,
                id_reparacion=self.reparacion_calificada.id_reparacion
            )

        # 4. Pendiente de calificación
        with self.assertRaises(NotFound):
            obtener_calificacion_reparacion(
                usuario_ejecutor=self.cliente,
                id_reparacion=self.reparacion_sin_calificar.id_reparacion
            )


class ReportesBITestCase(TestCase):
    """
    Pruebas unitarias e integración para:
    - CU-72: Generar Reporte de Conversión de Presupuestos.
    - CU-73: Generar Reporte de Demanda y Eficiencia por Categoría.
    """

    def setUp(self):
        from workshop_app.models import (
            Reparacion, Diagnostico, DetalleInsumoReparacion,
            CategoriaReparacion, Dispositivo, BitacoraReparacion
        )
        from catalog_app.models import TipoDispositivo, Marca, ModeloDispositivo, Producto, CategoriaProducto
        from users_app.models import Usuario, RolUsuario
        from core_app.models import LogSistema

        self.client = APIClient()
        self.hoy = timezone.now().date()
        self.f_inicio = self.hoy - timezone.timedelta(days=30)
        self.f_fin = self.hoy + timezone.timedelta(days=1)

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Admin'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol Cliente'}
        )

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin_bi@test.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_admin,
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico_bi@test.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_tecnico,
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente_bi@test.com',
            contrasena='hash_pwd',
            fecha_registro=self.hoy,
            id_rol=self.rol_cliente,
            is_active=True
        )

        # Categorías de reparación
        self.cat_pantalla = CategoriaReparacion.objects.create(
            nombre='Módulo y Pantalla',
            estado_activo=True
        )
        self.cat_bateria = CategoriaReparacion.objects.create(
            nombre='Batería y Carga',
            estado_activo=True
        )

        # Hardware catálogo
        self.tipo_smartphone = TipoDispositivo.objects.create(
            nombre='Smartphone BI',
            estado_activo=True
        )
        self.tipo_laptop = TipoDispositivo.objects.create(
            nombre='Notebook BI',
            estado_activo=True
        )
        self.marca = Marca.objects.create(nombre='Samsung BI', estado_activo=True)
        self.modelo_phone = ModeloDispositivo.objects.create(
            nombre='Galaxy S21 BI',
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo_smartphone,
            estado_activo=True
        )
        self.modelo_laptop = ModeloDispositivo.objects.create(
            nombre='Galaxy Book BI',
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo_laptop,
            estado_activo=True
        )

        # Insumos
        cat_prod = CategoriaProducto.objects.create(nombre='Repuestos BI', estado=True)
        self.prod_pantalla = Producto.objects.create(
            nombre='Display OLED S21',
            precio_venta=Decimal('40000.00'),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=False,
            id_categoria=cat_prod
        )

        # Dispositivos
        self.disp1 = Dispositivo.objects.create(
            numero_serie='IMEI-BI-01',
            fecha_registro=self.hoy,
            id_modelo=self.modelo_phone,
            id_usuario=self.cliente
        )
        self.disp2 = Dispositivo.objects.create(
            numero_serie='IMEI-BI-02',
            fecha_registro=self.hoy,
            id_modelo=self.modelo_phone,
            id_usuario=self.cliente
        )
        self.disp3 = Dispositivo.objects.create(
            numero_serie='SN-LAPTOP-01',
            fecha_registro=self.hoy,
            id_modelo=self.modelo_laptop,
            id_usuario=self.cliente
        )

        # URLs
        self.url_conversion = '/api/workshop/reportes/conversion/'
        self.url_eficiencia = '/api/workshop/reportes/eficiencia/'

    def test_reporte_conversion_exitoso(self):
        """
        CU-72: Generación exitosa de Reporte de Conversión.
        Verifica cálculos de Nivel Macro (totales, tasas, lucro cesante) y Nivel Micro (categorías).
        """
        from workshop_app.models import Reparacion, Diagnostico, DetalleInsumoReparacion, BitacoraReparacion
        from core_app.models import LogSistema

        # 1. Presupuesto Aceptado (Mano de obra $20.000 + Display $40.000 = $60.000)
        rep_aceptada = Reparacion.objects.create(
            fecha_inicio=self.hoy - timezone.timedelta(days=10),
            etapa='EN_REPARACION',
            id_dispositivo=self.disp1,
            id_usuario=self.tecnico
        )
        rep_aceptada.categorias.add(self.cat_pantalla)
        Diagnostico.objects.create(
            id_reparacion=rep_aceptada,
            descripcion_falla='Pantalla rota',
            fecha_diagnostico=self.hoy - timezone.timedelta(days=8),
            costo_diagnostico=Decimal('20000.00')
        )
        DetalleInsumoReparacion.objects.create(
            id_reparacion=rep_aceptada,
            id_producto=self.prod_pantalla,
            cantidad=1,
            precio_unitario=Decimal('40000.00')
        )
        BitacoraReparacion.objects.create(
            id_reparacion=rep_aceptada,
            id_usuario=self.cliente,
            fecha_hora=timezone.now().time(),
            estado_alcanzado=5,
            comentario='Aprobado por el cliente'
        )

        # 2. Presupuesto Rechazado (Mano de obra $15.000 = $15.000)
        rep_rechazada = Reparacion.objects.create(
            fecha_inicio=self.hoy - timezone.timedelta(days=5),
            etapa='CANCELADO',
            id_dispositivo=self.disp2,
            id_usuario=self.tecnico
        )
        rep_rechazada.categorias.add(self.cat_pantalla)
        Diagnostico.objects.create(
            id_reparacion=rep_rechazada,
            descripcion_falla='Batería hinchada',
            fecha_diagnostico=self.hoy - timezone.timedelta(days=4),
            costo_diagnostico=Decimal('15000.00')
        )
        BitacoraReparacion.objects.create(
            id_reparacion=rep_rechazada,
            id_usuario=self.cliente,
            fecha_hora=timezone.now().time(),
            estado_alcanzado=8,
            comentario='Rechazado por presupuesto excesivo'
        )

        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        response = self.client.get(self.url_conversion, data=params)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        # Macro
        macro = data['macro']
        self.assertEqual(macro['total_presupuestos'], 2)
        self.assertEqual(Decimal(str(macro['total_presupuestado'])), Decimal('35000.00'))
        self.assertEqual(macro['total_aceptados'], 1)
        self.assertEqual(Decimal(str(macro['monto_aceptado'])), Decimal('20000.00'))
        self.assertEqual(Decimal(str(macro['tasa_conversion'])), Decimal('50.00'))
        self.assertEqual(macro['total_rechazados'], 1)
        self.assertEqual(Decimal(str(macro['lucro_cesante'])), Decimal('15000.00'))
        self.assertEqual(Decimal(str(macro['tasa_fuga'])), Decimal('50.00'))

        # Micro
        micro = data['micro']
        self.assertTrue(len(micro) >= 1)
        cat_p = next((c for c in micro if c['id_categoria'] == self.cat_pantalla.id_categoria), None)
        self.assertIsNotNone(cat_p)
        self.assertEqual(cat_p['total_presupuestos'], 2)
        self.assertEqual(cat_p['total_aceptados'], 1)
        self.assertEqual(cat_p['total_rechazados'], 1)
        self.assertEqual(Decimal(str(cat_p['tasa_rechazo'])), Decimal('50.00'))

        # Auditoría en LogSistema
        log = LogSistema.objects.filter(accion="Generar Reporte de Conversión (CU-72)").first()
        self.assertIsNotNone(log)
        self.assertIn("Reporte de Conversión", log.detalle)

    def test_reporte_conversion_rango_fechas_invalido_400(self):
        """Excepción: fecha_inicio posterior a fecha_fin debe arrojar error 400."""
        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.hoy),
            'fecha_fin': str(self.hoy - timezone.timedelta(days=5))
        }
        response = self.client.get(self.url_conversion, data=params)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        error_msg = str(response.data)
        self.assertIn("no puede ser posterior a la fecha de fin", error_msg)

    def test_reporte_conversion_sin_presupuestos_error_400(self):
        """Excepción Paso 5: Si no hay presupuestos en el periodo, levanta ValidationError."""
        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': '2019-01-01',
            'fecha_fin': '2019-01-31'
        }
        response = self.client.get(self.url_conversion, data=params)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        error_msg = str(response.data)
        self.assertIn("No se ha emitido ningún presupuesto en el periodo temporal solicitado", error_msg)

    def test_reporte_eficiencia_exitoso(self):
        """
        CU-73: Generación exitosa de Reporte de Demanda y Eficiencia.
        Verifica agrupación por categoría, volumen, facturación y tiempo promedio en días.
        """
        from workshop_app.models import Reparacion, Diagnostico
        from core_app.models import LogSistema

        # Reparación 1 Finalizada: Delta = 4 días, Mano de Obra = $30.000
        rep1 = Reparacion.objects.create(
            fecha_inicio=self.hoy - timezone.timedelta(days=10),
            fecha_entrega=self.hoy - timezone.timedelta(days=6),
            etapa='FINALIZADO',
            id_dispositivo=self.disp1,
            id_usuario=self.tecnico
        )
        rep1.categorias.add(self.cat_pantalla)
        Diagnostico.objects.create(
            id_reparacion=rep1,
            descripcion_falla='Cambio de módulo',
            fecha_diagnostico=self.hoy - timezone.timedelta(days=10),
            costo_diagnostico=Decimal('30000.00')
        )

        # Reparación 2 Entregada: Delta = 2 días, Mano de Obra = $20.000
        rep2 = Reparacion.objects.create(
            fecha_inicio=self.hoy - timezone.timedelta(days=8),
            fecha_entrega=self.hoy - timezone.timedelta(days=6),
            etapa='ENTREGADO',
            id_dispositivo=self.disp2,
            id_usuario=self.tecnico
        )
        rep2.categorias.add(self.cat_pantalla)
        Diagnostico.objects.create(
            id_reparacion=rep2,
            descripcion_falla='Ajuste de pantalla',
            fecha_diagnostico=self.hoy - timezone.timedelta(days=8),
            costo_diagnostico=Decimal('20000.00')
        )

        # Reparación 3 Entregada: Categoría Batería, Delta = 1 día, Mano de obra = $10.000
        rep3 = Reparacion.objects.create(
            fecha_inicio=self.hoy - timezone.timedelta(days=5),
            fecha_entrega=self.hoy - timezone.timedelta(days=4),
            etapa='ENTREGADO',
            id_dispositivo=self.disp3,
            id_usuario=self.tecnico
        )
        rep3.categorias.add(self.cat_bateria)
        Diagnostico.objects.create(
            id_reparacion=rep3,
            descripcion_falla='Batería nueva',
            fecha_diagnostico=self.hoy - timezone.timedelta(days=5),
            costo_diagnostico=Decimal('10000.00')
        )

        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        response = self.client.get(self.url_eficiencia, data=params)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 2)

        # Categoría Pantalla: 2 reparaciones, Facturación $50.000, Tiempo medio = (4 + 2)/2 = 3.0 días
        cat_pant = next(c for c in data if c['id_categoria'] == self.cat_pantalla.id_categoria)
        self.assertEqual(cat_pant['volumen_reparaciones'], 2)
        self.assertEqual(Decimal(str(cat_pant['facturacion_bruta'])), Decimal('50000.00'))
        self.assertEqual(cat_pant['tiempo_promedio_dias'], 3.0)

        # Categoría Batería: 1 reparación, Facturación $10.000, Tiempo medio = 1.0 día
        cat_bat = next(c for c in data if c['id_categoria'] == self.cat_bateria.id_categoria)
        self.assertEqual(cat_bat['volumen_reparaciones'], 1)
        self.assertEqual(Decimal(str(cat_bat['facturacion_bruta'])), Decimal('10000.00'))
        self.assertEqual(cat_bat['tiempo_promedio_dias'], 1.0)

        # Auditoría LogSistema
        log = LogSistema.objects.filter(accion="Generar Reporte de Demanda y Eficiencia (CU-73)").first()
        self.assertIsNotNone(log)
        self.assertIn("Demanda y Eficiencia", log.detalle)

    def test_reporte_eficiencia_ignora_reparaciones_en_curso(self):
        """Comentarios CU-73: El motor debe ignorar estrictamente reparaciones activas o en curso."""
        from workshop_app.models import Reparacion, Diagnostico

        # Reparación activa (no finalizada)
        rep_activa = Reparacion.objects.create(
            fecha_inicio=self.hoy - timezone.timedelta(days=5),
            etapa='EN_REPARACION',
            id_dispositivo=self.disp1,
            id_usuario=self.tecnico
        )
        rep_activa.categorias.add(self.cat_pantalla)
        Diagnostico.objects.create(
            id_reparacion=rep_activa,
            descripcion_falla='En proceso',
            fecha_diagnostico=self.hoy - timezone.timedelta(days=5),
            costo_diagnostico=Decimal('25000.00')
        )

        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        response = self.client.get(self.url_eficiencia, data=params)

        # Como solo existe una reparación en curso y ninguna terminal, debe levantar la excepción del Paso 5
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("No existen reparaciones finalizadas en el periodo temporal o filtros indicados", str(response.data))

    def test_reporte_eficiencia_sin_reparaciones_finalizadas_error_400(self):
        """Excepción Paso 5: Sin operaciones culminadas en el rango, levanta ValidationError."""
        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': '2020-01-01',
            'fecha_fin': '2020-01-31'
        }
        response = self.client.get(self.url_eficiencia, data=params)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("No existen reparaciones finalizadas en el periodo temporal o filtros indicados", str(response.data))

    def test_reportes_no_admin_denegado_403(self):
        """Precondición: Solo Administrador puede consultar los reportes analíticos."""
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }

        # Técnico
        self.client.force_authenticate(user=self.tecnico)
        r_conv_tec = self.client.get(self.url_conversion, data=params)
        self.assertEqual(r_conv_tec.status_code, status.HTTP_403_FORBIDDEN)
        r_efic_tec = self.client.get(self.url_eficiencia, data=params)
        self.assertEqual(r_efic_tec.status_code, status.HTTP_403_FORBIDDEN)

        # Cliente
        self.client.force_authenticate(user=self.cliente)
        r_conv_cli = self.client.get(self.url_conversion, data=params)
        self.assertEqual(r_conv_cli.status_code, status.HTTP_403_FORBIDDEN)
        r_efic_cli = self.client.get(self.url_eficiencia, data=params)
        self.assertEqual(r_efic_cli.status_code, status.HTTP_403_FORBIDDEN)

    def test_reportes_no_autenticado_401(self):
        """Peticiones anónimas deben ser rechazadas con 401."""
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        r_conv = self.client.get(self.url_conversion, data=params)
        self.assertIn(r_conv.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])
        r_efic = self.client.get(self.url_eficiencia, data=params)
        self.assertIn(r_efic.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class ReporteProductividadTestCase(TestCase):
    """
    Suite de pruebas exhaustivas para CU-74: Generar Reporte de Productividad y Carga de Trabajo Técnica.
    Verifica:
    - Análisis bifásico: Carga en tiempo real inmune a fechas + Análisis histórico en periodo.
    - Excepción de técnico sin reparaciones finalizadas en el periodo (valores a cero).
    - Conteo de interacciones en Bitácora de Reparación.
    - Filtro segmentado opcional por id_tecnico.
    - Validación cronológica de fechas.
    - Trazabilidad y auditoría en LogSistema.
    - Seguridad de roles y autenticación (ADMIN strictly).
    """

    def setUp(self):
        self.client = APIClient()
        self.url_productividad = '/api/workshop/reportes/productividad/'

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(codigo='ADMIN', defaults={'nombre_rol': 'Administrador'})
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(codigo='TECNICO', defaults={'nombre_rol': 'Técnico'})
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(codigo='CLIENTE', defaults={'nombre_rol': 'Cliente'})

        self.hoy = timezone.now().date()
        self.f_inicio = self.hoy - timezone.timedelta(days=30)
        self.f_fin = self.hoy

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.cu74@test.com',
            fecha_registro=self.hoy,
            is_active=True,
            id_rol=self.rol_admin
        )
        PerfilUsuario.objects.create(id_usuario=self.admin, nombre='Admin', apellido='Gerencial')

        self.tecnico_1 = Usuario.objects.create(
            email='tec1.cu74@test.com',
            fecha_registro=self.hoy,
            is_active=True,
            id_rol=self.rol_tecnico
        )
        PerfilUsuario.objects.create(id_usuario=self.tecnico_1, nombre='Carlos', apellido='Gómez')

        self.tecnico_2 = Usuario.objects.create(
            email='tec2.cu74@test.com',
            fecha_registro=self.hoy,
            is_active=True,
            id_rol=self.rol_tecnico
        )
        PerfilUsuario.objects.create(id_usuario=self.tecnico_2, nombre='Laura', apellido='Méndez')

        self.cliente = Usuario.objects.create(
            email='cliente.cu74@test.com',
            fecha_registro=self.hoy,
            is_active=True,
            id_rol=self.rol_cliente
        )
        PerfilUsuario.objects.create(id_usuario=self.cliente, nombre='Pedro', apellido='Cliente')

        # Dispositivos y Catálogo
        self.tipo_disp = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        self.marca = Marca.objects.create(nombre='Apple', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='iPhone 13',
            id_tipo_dispositivo=self.tipo_disp,
            id_marca=self.marca,
            estado_activo=True
        )
        self.dispositivo = Dispositivo.objects.create(
            numero_serie='123456789012345',
            fecha_registro=self.hoy,
            id_modelo=self.modelo,
            id_usuario=self.cliente
        )


    def test_reporte_productividad_analisis_bifasico_exitoso(self):
        """Verifica el cálculo de carga en tiempo real, análisis histórico y disciplina operativa."""
        from workshop_app.models import Reparacion, Diagnostico, BitacoraReparacion

        # Técnico 1: 2 reparaciones activas (Carga en tiempo real)
        Reparacion.objects.create(
            fecha_inicio=self.f_inicio - timezone.timedelta(days=10),
            etapa='EN_REPARACION',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico_1
        )
        Reparacion.objects.create(
            fecha_inicio=self.f_inicio + timezone.timedelta(days=5),
            etapa='ESPERANDO_DIAGNOSTICO',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico_1
        )

        # Técnico 1: 1 reparación finalizada en el periodo con 2 días de duración y $25.000 de MO
        rep_fin = Reparacion.objects.create(
            fecha_inicio=self.f_inicio + timezone.timedelta(days=2),
            fecha_entrega=self.f_inicio + timezone.timedelta(days=4),
            etapa='FINALIZADO',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico_1
        )
        Diagnostico.objects.create(
            descripcion_falla='Cambio de módulo',
            fecha_diagnostico=self.f_inicio + timezone.timedelta(days=2),
            costo_diagnostico=Decimal('25000.00'),
            id_reparacion=rep_fin
        )

        # Técnico 1: 2 bitácoras registradas en reparaciones del periodo
        BitacoraReparacion.objects.create(
            fecha_hora=timezone.now().time(),
            estado_alcanzado=3,
            comentario='Desarme y diagnóstico preliminar',
            id_reparacion=rep_fin,
            id_usuario=self.tecnico_1
        )
        BitacoraReparacion.objects.create(
            fecha_hora=timezone.now().time(),
            estado_alcanzado=6,
            comentario='Reparación completada y verificada',
            id_reparacion=rep_fin,
            id_usuario=self.tecnico_1
        )

        # Técnico 2: 1 reparación activa, 0 reparaciones finalizadas en el periodo (Excepción Paso 6)
        Reparacion.objects.create(
            fecha_inicio=self.f_inicio + timezone.timedelta(days=1),
            etapa='ESPERANDO_REPUESTO',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico_2
        )

        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        response = self.client.get(self.url_productividad, data=params)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(len(data), 2)

        # Técnico 1
        t1 = next((t for t in data if t['id_tecnico'] == self.tecnico_1.id_usuario), None)
        self.assertIsNotNone(t1)
        self.assertEqual(t1['nombre_completo'], 'Carlos Gómez')
        self.assertEqual(t1['carga_tiempo_real'], 2)
        self.assertEqual(t1['volumen_finalizadas'], 1)
        self.assertEqual(Decimal(str(t1['facturacion_mano_obra'])), Decimal('25000.00'))
        self.assertEqual(t1['velocidad_media_dias'], 2.0)
        self.assertEqual(t1['velocidad_media_horas'], 48.0)
        self.assertEqual(t1['registros_bitacora'], 2)

        # Técnico 2 (Excepción Paso 6: Sin finalizadas en el periodo)
        t2 = next((t for t in data if t['id_tecnico'] == self.tecnico_2.id_usuario), None)
        self.assertIsNotNone(t2)
        self.assertEqual(t2['nombre_completo'], 'Laura Méndez')
        self.assertEqual(t2['carga_tiempo_real'], 1)
        self.assertEqual(t2['volumen_finalizadas'], 0)
        self.assertEqual(Decimal(str(t2['facturacion_mano_obra'])), Decimal('0.00'))
        self.assertEqual(t2['velocidad_media_dias'], 0.0)
        self.assertEqual(t2['velocidad_media_horas'], 0.0)
        self.assertEqual(t2['registros_bitacora'], 0)

        # Auditoría en LogSistema
        log = LogSistema.objects.filter(accion="Generar Reporte de Productividad (CU-74)").first()
        self.assertIsNotNone(log)
        self.assertIn("Reporte de Productividad", log.detalle)

    def test_filtro_segmentado_por_id_tecnico(self):
        """Verifica que al filtrar por id_tecnico solo retorne dicho técnico."""
        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin),
            'id_tecnico': self.tecnico_1.id_usuario
        }
        response = self.client.get(self.url_productividad, data=params)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['id_tecnico'], self.tecnico_1.id_usuario)

    def test_filtro_tecnico_inexistente_retorna_400(self):
        """Si se especifica un id_tecnico que no existe, debe arrojar 400 Bad Request."""
        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin),
            'id_tecnico': 999999
        }
        response = self.client.get(self.url_productividad, data=params)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no existe", str(response.data))

    def test_rango_fechas_invalido_retorna_400(self):
        """Si fecha_inicio es posterior a fecha_fin, debe arrojar error 400."""
        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.hoy),
            'fecha_fin': str(self.hoy - timezone.timedelta(days=2))
        }
        response = self.client.get(self.url_productividad, data=params)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no puede ser posterior", str(response.data))

    def test_seguridad_no_admin_denegado_403(self):
        """Solo administradores pueden consultar el reporte de productividad."""
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        # Técnico
        self.client.force_authenticate(user=self.tecnico_1)
        res_tec = self.client.get(self.url_productividad, data=params)
        self.assertEqual(res_tec.status_code, status.HTTP_403_FORBIDDEN)

        # Cliente
        self.client.force_authenticate(user=self.cliente)
        res_cli = self.client.get(self.url_productividad, data=params)
        self.assertEqual(res_cli.status_code, status.HTTP_403_FORBIDDEN)

    def test_no_autenticado_denegado_401(self):
        """Peticiones sin autenticar deben recibir 401."""
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        response = self.client.get(self.url_productividad, data=params)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class ReporteSatisfaccionTestCase(TestCase):
    """
    Suite de pruebas exhaustivas para CU-76: Generar Reporte de Satisfacción y Calidad.
    Verifica:
    - Agregación global del CSAT y porcentaje de calificaciones críticas (<= 3 estrellas).
    - Agrupamiento de promedios de estrellas por Técnico y por Categoría.
    - Regla de afectación simultánea: calificaciones en órdenes con múltiples categorías impactan en todas ellas.
    - Tira de feedback cualitativo con datos de cliente, técnico y rubros intervenidos.
    - Filtros por técnico, categoría y rangos de estrellas.
    - Excepciones de rango de fechas incongruente y sin datos en el período.
    - Trazabilidad y auditoría inmutable en LogSistema.
    - Seguridad de roles y permisos (ADMIN strictly).
    """

    def setUp(self):
        self.client = APIClient()
        self.url_satisfaccion = '/api/workshop/reportes/satisfaccion/'

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(codigo='ADMIN', defaults={'nombre_rol': 'Administrador'})
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(codigo='TECNICO', defaults={'nombre_rol': 'Técnico'})
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(codigo='CLIENTE', defaults={'nombre_rol': 'Cliente'})

        self.hoy = timezone.now().date()
        self.f_inicio = self.hoy - timezone.timedelta(days=30)
        self.f_fin = self.hoy

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.cu76@test.com',
            fecha_registro=self.hoy,
            is_active=True,
            id_rol=self.rol_admin
        )
        PerfilUsuario.objects.create(id_usuario=self.admin, nombre='Admin', apellido='Calidad')

        self.tecnico_1 = Usuario.objects.create(
            email='tec1.cu76@test.com',
            fecha_registro=self.hoy,
            is_active=True,
            id_rol=self.rol_tecnico
        )
        PerfilUsuario.objects.create(id_usuario=self.tecnico_1, nombre='Martín', apellido='Ríos')

        self.tecnico_2 = Usuario.objects.create(
            email='tec2.cu76@test.com',
            fecha_registro=self.hoy,
            is_active=True,
            id_rol=self.rol_tecnico
        )
        PerfilUsuario.objects.create(id_usuario=self.tecnico_2, nombre='Lucía', apellido='Navarro')

        self.cliente = Usuario.objects.create(
            email='cliente.cu76@test.com',
            fecha_registro=self.hoy,
            is_active=True,
            id_rol=self.rol_cliente
        )
        PerfilUsuario.objects.create(id_usuario=self.cliente, nombre='Gabriel', apellido='Bustos')

        # Catálogo y Dispositivos
        self.tipo_disp = TipoDispositivo.objects.create(nombre='Smartphone', estado_activo=True)
        self.marca = Marca.objects.create(nombre='Apple', estado_activo=True)
        self.modelo = ModeloDispositivo.objects.create(
            nombre='iPhone 14',
            id_tipo_dispositivo=self.tipo_disp,
            id_marca=self.marca,
            estado_activo=True
        )
        self.dispositivo = Dispositivo.objects.create(
            numero_serie='IMEI-CU76-999',
            fecha_registro=self.hoy,
            id_modelo=self.modelo,
            id_usuario=self.cliente
        )

        # Categorías de Reparación
        self.cat_pantalla = CategoriaReparacion.objects.create(nombre='Módulo y Pantalla', estado_activo=True)
        self.cat_bateria = CategoriaReparacion.objects.create(nombre='Batería y Carga', estado_activo=True)

    def test_reporte_satisfaccion_consolidado_exitoso(self):
        """Verifica el cálculo del CSAT global, agrupamientos por técnico y por categoría, y comentarios."""
        from workshop_app.models import Reparacion, Calificacion

        # Reparación 1: Técnico 1, Cat Pantalla
        rep1 = Reparacion.objects.create(
            fecha_inicio=self.f_inicio + timezone.timedelta(days=2),
            etapa='FINALIZADO',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico_1
        )
        rep1.categorias.add(self.cat_pantalla)
        Calificacion.objects.create(
            puntuacion=5,
            comentario='Excelente atención y rapidez',
            fecha=self.f_inicio + timezone.timedelta(days=3),
            id_reparacion=rep1
        )

        # Reparación 2: Técnico 1, Múltiples Categorías (Pantalla y Batería)
        rep2 = Reparacion.objects.create(
            fecha_inicio=self.f_inicio + timezone.timedelta(days=5),
            etapa='FINALIZADO',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico_1
        )
        rep2.categorias.add(self.cat_pantalla, self.cat_bateria)
        Calificacion.objects.create(
            puntuacion=4,
            comentario='Muy buen trabajo en el cambio de pantalla y batería',
            fecha=self.f_inicio + timezone.timedelta(days=7),
            id_reparacion=rep2
        )

        # Reparación 3: Técnico 2, Cat Batería (Calificación crítica: 2 estrellas)
        rep3 = Reparacion.objects.create(
            fecha_inicio=self.f_inicio + timezone.timedelta(days=10),
            etapa='FINALIZADO',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico_2
        )
        rep3.categorias.add(self.cat_bateria)
        Calificacion.objects.create(
            puntuacion=2,
            comentario='Demoró demasiado la reparación',
            fecha=self.f_inicio + timezone.timedelta(days=12),
            id_reparacion=rep3
        )

        # Calificación 4: Fuera de rango temporal (hace 45 días)
        rep_antigua = Reparacion.objects.create(
            fecha_inicio=self.f_inicio - timezone.timedelta(days=45),
            etapa='FINALIZADO',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico_1
        )
        Calificacion.objects.create(
            puntuacion=5,
            comentario='Antigua',
            fecha=self.f_inicio - timezone.timedelta(days=40),
            id_reparacion=rep_antigua
        )

        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        response = self.client.get(self.url_satisfaccion, data=params)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        # 1. Indicadores Globales
        self.assertEqual(data['total_resenas'], 3)
        self.assertEqual(data['csat_global'], 3.67)  # (5 + 4 + 2) / 3 = 3.666... -> 3.67
        self.assertEqual(data['resenas_criticas_total'], 1)  # La de 2 estrellas
        self.assertEqual(data['porcentaje_criticas'], 33.33)  # 1/3 * 100 = 33.33

        # 2. Promedio por Técnico
        tecnicos = data['promedio_por_tecnico']
        self.assertEqual(len(tecnicos), 2)
        t1 = next((t for t in tecnicos if t['id_tecnico'] == self.tecnico_1.id_usuario), None)
        self.assertIsNotNone(t1)
        self.assertEqual(t1['total_resenas'], 2)
        self.assertEqual(t1['promedio_estrellas'], 4.5)  # (5 + 4) / 2 = 4.5

        t2 = next((t for t in tecnicos if t['id_tecnico'] == self.tecnico_2.id_usuario), None)
        self.assertIsNotNone(t2)
        self.assertEqual(t2['total_resenas'], 1)
        self.assertEqual(t2['promedio_estrellas'], 2.0)

        # 3. Promedio por Categoría (Regla de afectación simultánea)
        categorias = data['promedio_por_categoria']
        self.assertEqual(len(categorias), 2)
        cat_p = next((c for c in categorias if c['id_categoria'] == self.cat_pantalla.id_categoria), None)
        self.assertIsNotNone(cat_p)
        self.assertEqual(cat_p['total_resenas'], 2)  # rep1 (5) y rep2 (4)
        self.assertEqual(cat_p['promedio_estrellas'], 4.5)

        cat_b = next((c for c in categorias if c['id_categoria'] == self.cat_bateria.id_categoria), None)
        self.assertIsNotNone(cat_b)
        self.assertEqual(cat_b['total_resenas'], 2)  # rep2 (4) y rep3 (2)
        self.assertEqual(cat_b['promedio_estrellas'], 3.0)  # (4 + 2) / 2 = 3.0

        # 4. Tira de Comentarios
        comentarios = data['comentarios']
        self.assertEqual(len(comentarios), 3)
        self.assertEqual(comentarios[0]['cliente_nombre'], 'Gabriel Bustos')

        # 5. Auditoría en LogSistema
        log = LogSistema.objects.filter(accion="Generar Reporte de Satisfacción y Calidad (CU-76)").first()
        self.assertIsNotNone(log)
        self.assertIn("Reporte de Satisfacción y Calidad", log.detalle)

    def test_filtro_rango_estrellas_aislar_criticas(self):
        """Verifica que el filtro de rango de estrellas aísle únicamente las calificaciones críticas (<= 3 estrellas)."""
        from workshop_app.models import Reparacion, Calificacion

        rep = Reparacion.objects.create(
            fecha_inicio=self.f_inicio + timezone.timedelta(days=2),
            etapa='FINALIZADO',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico_1
        )
        Calificacion.objects.create(
            puntuacion=5,
            comentario='Excelente',
            fecha=self.f_inicio + timezone.timedelta(days=3),
            id_reparacion=rep
        )
        Calificacion.objects.create(
            puntuacion=2,
            comentario='Malo',
            fecha=self.f_inicio + timezone.timedelta(days=4),
            id_reparacion=rep
        )

        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin),
            'rango_estrellas_max': 3
        }
        response = self.client.get(self.url_satisfaccion, data=params)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['total_resenas'], 1)
        self.assertEqual(data['csat_global'], 2.0)
        self.assertEqual(data['comentarios'][0]['puntuacion'], 2)

    def test_filtro_por_tecnico_y_por_categoria(self):
        """Verifica que los filtros opcionales de técnico y categoría aíslen correctamente las calificaciones."""
        from workshop_app.models import Reparacion, Calificacion

        rep1 = Reparacion.objects.create(
            fecha_inicio=self.f_inicio + timezone.timedelta(days=2),
            etapa='FINALIZADO',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico_1
        )
        rep1.categorias.add(self.cat_pantalla)
        Calificacion.objects.create(
            puntuacion=5,
            comentario='T1 Pantalla',
            fecha=self.f_inicio + timezone.timedelta(days=3),
            id_reparacion=rep1
        )

        rep2 = Reparacion.objects.create(
            fecha_inicio=self.f_inicio + timezone.timedelta(days=5),
            etapa='FINALIZADO',
            id_dispositivo=self.dispositivo,
            id_usuario=self.tecnico_2
        )
        rep2.categorias.add(self.cat_bateria)
        Calificacion.objects.create(
            puntuacion=3,
            comentario='T2 Batería',
            fecha=self.f_inicio + timezone.timedelta(days=6),
            id_reparacion=rep2
        )

        self.client.force_authenticate(user=self.admin)

        # Filtro por Técnico 1
        res_t1 = self.client.get(self.url_satisfaccion, data={
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin),
            'id_tecnico': self.tecnico_1.id_usuario
        })
        self.assertEqual(res_t1.status_code, status.HTTP_200_OK)
        self.assertEqual(res_t1.data['total_resenas'], 1)
        self.assertEqual(res_t1.data['promedio_por_tecnico'][0]['id_tecnico'], self.tecnico_1.id_usuario)

        # Filtro por Categoría Batería
        res_cat = self.client.get(self.url_satisfaccion, data={
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin),
            'id_categoria': self.cat_bateria.id_categoria
        })
        self.assertEqual(res_cat.status_code, status.HTTP_200_OK)
        self.assertEqual(res_cat.data['total_resenas'], 1)
        self.assertEqual(res_cat.data['promedio_por_categoria'][0]['id_categoria'], self.cat_bateria.id_categoria)

    def test_sin_calificaciones_en_periodo_retorna_400(self):
        """Excepción Paso 5: Si bajo los parámetros no existen calificaciones, levanta 400 Bad Request."""
        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': '2021-01-01',
            'fecha_fin': '2021-01-31'
        }
        response = self.client.get(self.url_satisfaccion, data=params)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no existen calificaciones válidas para analizar", str(response.data))

    def test_rango_fechas_invalido_retorna_400(self):
        """Excepción Paso 4: Si fecha_inicio supera fecha_fin, arroja error 400."""
        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.hoy),
            'fecha_fin': str(self.hoy - timezone.timedelta(days=2))
        }
        response = self.client.get(self.url_satisfaccion, data=params)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no puede ser superior", str(response.data))

    def test_rango_estrellas_invalido_retorna_400(self):
        """Si rango_estrellas_min > rango_estrellas_max, arroja error 400."""
        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin),
            'rango_estrellas_min': 5,
            'rango_estrellas_max': 2
        }
        response = self.client.get(self.url_satisfaccion, data=params)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("rango de estrellas es inválido", str(response.data))

    def test_seguridad_no_admin_denegado_403(self):
        """Solo administradores pueden consultar el reporte de satisfacción."""
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        self.client.force_authenticate(user=self.tecnico_1)
        res_tec = self.client.get(self.url_satisfaccion, data=params)
        self.assertEqual(res_tec.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.cliente)
        res_cli = self.client.get(self.url_satisfaccion, data=params)
        self.assertEqual(res_cli.status_code, status.HTTP_403_FORBIDDEN)

    def test_no_autenticado_denegado_401(self):
        """Peticiones sin autenticar deben recibir 401."""
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        response = self.client.get(self.url_satisfaccion, data=params)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])









