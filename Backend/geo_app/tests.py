from django.test import TestCase
from django.core.exceptions import PermissionDenied, ObjectDoesNotExist
from rest_framework.test import APIClient
from rest_framework import status

from geo_app.models import Pais, Provincia, Ciudad, Direccion
from users_app.models import Usuario, RolUsuario
from core_app.models import LogSistema
from geo_app.selectors import (
    obtener_paises,
    obtener_provincias_por_pais,
    obtener_ciudades_por_provincia,
    obtener_direcciones_activas_usuario,
    obtener_todas_direcciones_usuario,
    obtener_direccion_por_id
)
from geo_app.services import (
    registrar_direccion,
    modificar_direccion,
    cambiar_estado_direccion
)
from geo_app.serializers import DireccionInputSerializer


class GeoAppCasosDeUsoTestCase(TestCase):
    """
    Pruebas unitarias para CU-47 (Registrar Dirección), CU-48 (Modificar Dirección)
    y CU-49 (Cambiar Estado de Dirección) en geo_app.
    """

    def setUp(self):
        # Roles
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Rol Cliente'
        )
        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Rol Administrador'
        )

        # Usuarios
        self.cliente = Usuario.objects.create(
            email='cliente.geo@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro='2026-10-16',
            is_active=True
        )
        self.otro_cliente = Usuario.objects.create(
            email='otro.cliente@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro='2026-10-16',
            is_active=True
        )
        self.admin = Usuario.objects.create(
            email='admin.geo@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro='2026-10-16',
            is_active=True
        )

        # Limpieza previa de catálogos para aislamiento total de la prueba
        Ciudad.objects.all().delete()
        Provincia.objects.all().delete()
        Pais.objects.all().delete()

        # Geografía en cascada
        self.pais = Pais.objects.create(nombre_pais='Argentina', cobertura_habilitada=True)
        self.pais_inactivo = Pais.objects.create(nombre_pais='Uruguay', cobertura_habilitada=False)

        self.provincia = Provincia.objects.create(
            nombre_provincia='Buenos Aires',
            cobertura_habilitada=True,
            id_pais=self.pais
        )
        self.ciudad = Ciudad.objects.create(
            nombre_ciudad='La Plata',
            cobertura_habilitada=True,
            id_provincia=self.provincia
        )
        self.ciudad2 = Ciudad.objects.create(
            nombre_ciudad='Quilmes',
            cobertura_habilitada=True,
            id_provincia=self.provincia
        )

        self.client = APIClient()

    # ==========================================================================
    # PRUEBAS DE SELECTORES
    # ==========================================================================

    def test_selectores_geografia_en_cascada(self):
        # Países solo habilitados por defecto
        paises_activos = obtener_paises()
        self.assertEqual(paises_activos.count(), 1)
        self.assertEqual(paises_activos.first().nombre_pais, 'Argentina')

        # Provincias filtradas por país
        provincias = obtener_provincias_por_pais(self.pais.id_pais)
        self.assertEqual(provincias.count(), 1)
        self.assertEqual(provincias.first().nombre_provincia, 'Buenos Aires')

        # Ciudades filtradas por provincia
        ciudades = obtener_ciudades_por_provincia(self.provincia.id_provincia)
        self.assertEqual(ciudades.count(), 2)

    def test_selectores_direcciones_usuario(self):
        # Crear 2 direcciones: una activa y una inactiva
        dir1 = registrar_direccion(
            usuario=self.cliente,
            datos={
                'id_ciudad': self.ciudad,
                'alias': 'Casa',
                'calle_numero': 'Calle 10 #500',
                'barrio': 'Centro'
            }
        )
        dir2 = registrar_direccion(
            usuario=self.cliente,
            datos={
                'id_ciudad': self.ciudad,
                'alias': 'Trabajo',
                'calle_numero': 'Av. 7 #1200',
                'barrio': 'Norte'
            }
        )
        cambiar_estado_direccion(usuario=self.cliente, id_direccion=dir2.id_direccion)

        activas = obtener_direcciones_activas_usuario(self.cliente.id_usuario)
        todas = obtener_todas_direcciones_usuario(self.cliente.id_usuario)

        self.assertEqual(activas.count(), 1)
        self.assertEqual(activas.first().id_direccion, dir1.id_direccion)
        self.assertEqual(todas.count(), 2)

    # ==========================================================================
    # CU-47: REGISTRAR DIRECCIÓN
    # ==========================================================================

    def test_cu47_registrar_direccion_cliente_exitoso(self):
        datos = {
            'id_ciudad': self.ciudad.id_ciudad,
            'alias': 'Casa Matriz',
            'calle_numero': 'Calle Falsa 123',
            'barrio': 'Los Tilos',
            'piso': 3,
            'nro_dpto': 'B'
        }
        direccion = registrar_direccion(usuario=self.cliente, datos=datos)

        self.assertIsNotNone(direccion.id_direccion)
        self.assertEqual(direccion.alias, 'Casa Matriz')
        self.assertEqual(direccion.nro_calle, 'Calle Falsa 123')
        self.assertEqual(direccion.nombre_barrio, 'Los Tilos')
        self.assertEqual(direccion.piso, 3)
        self.assertEqual(direccion.nro_dpto, 'B')
        self.assertTrue(direccion.is_active)
        self.assertEqual(direccion.id_usuario, self.cliente)

        # Para un cliente común NO se crea LogSistema
        self.assertEqual(LogSistema.objects.filter(tabla_afectada='direccion').count(), 0)

    def test_cu47_registrar_direccion_auditoria_personal(self):
        datos = {
            'id_ciudad': self.ciudad.id_ciudad,
            'alias': 'Sede Admin',
            'calle_numero': 'Av. Central 999',
            'barrio': 'Microcentro'
        }
        direccion = registrar_direccion(usuario=self.admin, datos=datos)

        # Como es ADMIN, debe existir el registro de auditoría en core_app
        log = LogSistema.objects.filter(
            tabla_afectada='direccion',
            id_registro_afectado=str(direccion.id_direccion)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.id_usuario, self.admin)
        self.assertIn("CU-47", log.accion)

    # ==========================================================================
    # CU-48: MODIFICAR DIRECCIÓN
    # ==========================================================================

    def test_cu48_modificar_direccion_propietario_exitoso(self):
        direccion = registrar_direccion(
            usuario=self.cliente,
            datos={
                'id_ciudad': self.ciudad,
                'alias': 'Temporal',
                'calle_numero': 'Calle 1 #100',
                'barrio': 'Sur'
            }
        )

        datos_nuevos = {
            'alias': 'Casa Definitiva',
            'calle_numero': 'Calle 1 #150',
            'barrio': 'Sur Residencial',
            'id_ciudad': self.ciudad2.id_ciudad,
            'piso_dpto': '2A'
        }
        modificada = modificar_direccion(
            usuario=self.cliente,
            id_direccion=direccion.id_direccion,
            datos=datos_nuevos
        )

        self.assertEqual(modificada.alias, 'Casa Definitiva')
        self.assertEqual(modificada.nro_calle, 'Calle 1 #150')
        self.assertEqual(modificada.nombre_barrio, 'Sur Residencial')
        self.assertEqual(modificada.id_ciudad, self.ciudad2)
        self.assertEqual(modificada.nro_dpto, '2A')

    def test_cu48_modificar_direccion_ajena_falla_permission_denied(self):
        direccion = registrar_direccion(
            usuario=self.cliente,
            datos={
                'id_ciudad': self.ciudad,
                'alias': 'Privada',
                'calle_numero': 'Calle 12 #34',
                'barrio': 'Este'
            }
        )

        with self.assertRaises(PermissionDenied):
            modificar_direccion(
                usuario=self.otro_cliente,
                id_direccion=direccion.id_direccion,
                datos={'alias': 'Intrusión'}
            )

    # ==========================================================================
    # CU-49: CAMBIAR ESTADO DE DIRECCIÓN (SOFT DELETE / REACTIVACIÓN)
    # ==========================================================================

    def test_cu49_cambiar_estado_direccion_borrado_logico_y_recuperacion(self):
        direccion = registrar_direccion(
            usuario=self.cliente,
            datos={
                'id_ciudad': self.ciudad,
                'alias': 'Borrable',
                'calle_numero': 'Diagonal 74 #800',
                'barrio': 'Parque'
            }
        )
        self.assertTrue(direccion.is_active)

        # 1. Desactivar (borrado lógico)
        cambiada = cambiar_estado_direccion(usuario=self.cliente, id_direccion=direccion.id_direccion)
        self.assertFalse(cambiada.is_active)
        direccion.refresh_from_db()
        self.assertFalse(direccion.is_active)

        # 2. Reactivar (recuperación)
        reactivada = cambiar_estado_direccion(usuario=self.cliente, id_direccion=direccion.id_direccion)
        self.assertTrue(reactivada.is_active)
        direccion.refresh_from_db()
        self.assertTrue(direccion.is_active)

    def test_cu49_cambiar_estado_direccion_ajena_denegada(self):
        direccion = registrar_direccion(
            usuario=self.cliente,
            datos={
                'id_ciudad': self.ciudad,
                'alias': 'Intocable',
                'calle_numero': 'Calle 50 #100',
                'barrio': 'Centro'
            }
        )

        with self.assertRaises(PermissionDenied):
            cambiar_estado_direccion(usuario=self.otro_cliente, id_direccion=direccion.id_direccion)

    # ==========================================================================
    # PRUEBAS DE ENDPOINTS HTTP REST
    # ==========================================================================

    def test_api_catalogos_geograficos(self):
        # GET Paises
        res_paises = self.client.get('/api/geo/paises/')
        self.assertEqual(res_paises.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_paises.data), 1)

        # GET Provincias
        res_provs = self.client.get(f'/api/geo/provincias/?pais_id={self.pais.id_pais}')
        self.assertEqual(res_provs.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_provs.data), 1)

        # GET Ciudades
        res_ciudades = self.client.get(f'/api/geo/ciudades/?provincia_id={self.provincia.id_provincia}')
        self.assertEqual(res_ciudades.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_ciudades.data), 2)

    def test_api_mis_direcciones_flujo_completo(self):
        self.client.force_authenticate(user=self.cliente)

        # POST /api/geo/mis-direcciones/
        payload = {
            'id_ciudad': self.ciudad.id_ciudad,
            'alias': 'Casa API',
            'calle_numero': 'Av. Siempreviva 742',
            'barrio': 'Springfield',
            'piso_dpto': 'PB'
        }
        res_post = self.client.post('/api/geo/mis-direcciones/', payload, format='json')
        self.assertEqual(res_post.status_code, status.HTTP_201_CREATED)
        dir_id = res_post.data['direccion']['id_direccion']

        # GET /api/geo/mis-direcciones/
        res_get = self.client.get('/api/geo/mis-direcciones/')
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_get.data), 1)
        self.assertEqual(res_get.data[0]['ciudad'], 'La Plata')
        self.assertEqual(res_get.data[0]['provincia'], 'Buenos Aires')
        self.assertEqual(res_get.data[0]['pais'], 'Argentina')

        # PUT /api/geo/mis-direcciones/<id>/
        payload_put = {
            'id_ciudad': self.ciudad2.id_ciudad,
            'alias': 'Casa API Editada',
            'calle_numero': 'Av. Siempreviva 744',
            'barrio': 'Springfield Sur'
        }
        res_put = self.client.put(f'/api/geo/mis-direcciones/{dir_id}/', payload_put, format='json')
        self.assertEqual(res_put.status_code, status.HTTP_200_OK)
        self.assertEqual(res_put.data['direccion']['alias'], 'Casa API Editada')
        self.assertEqual(res_put.data['direccion']['ciudad'], 'Quilmes')

        # PATCH /api/geo/mis-direcciones/<id>/ (desactivar)
        res_patch = self.client.patch(f'/api/geo/mis-direcciones/{dir_id}/')
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        self.assertFalse(res_patch.data['direccion']['is_active'])

        # GET solo activas retorna 0
        res_activas = self.client.get('/api/geo/mis-direcciones/')
        self.assertEqual(len(res_activas.data), 0)

        # GET ?todas=true retorna 1
        res_todas = self.client.get('/api/geo/mis-direcciones/?todas=true')
        self.assertEqual(len(res_todas.data), 1)

    # ==========================================================================
    # PRUEBAS CU-50 (ADMINISTRAR COBERTURA) & CU-59 (FILTRAR COBERTURA)
    # ==========================================================================

    def test_filtrar_zonas_cobertura_padre_id_opcional(self):
        from geo_app.selectors import filtrar_zonas_cobertura

        # Filtrar Países no exige padre
        paises = filtrar_zonas_cobertura(nivel_taxonomico='PAIS')
        self.assertEqual(paises.count(), 2)

        # Filtrar Provincias sin padre_id retorna todas las provincias del sistema
        provincias_todas = filtrar_zonas_cobertura(nivel_taxonomico='PROVINCIA')
        self.assertEqual(provincias_todas.count(), 1)

        # Filtrar Ciudades sin padre_id retorna todas las ciudades del sistema
        ciudades_todas = filtrar_zonas_cobertura(nivel_taxonomico='CIUDAD')
        self.assertEqual(ciudades_todas.count(), 2)

        # Con padre_id filtra específicamente
        provincias = filtrar_zonas_cobertura(nivel_taxonomico='PROVINCIA', padre_id=self.pais.id_pais)
        self.assertEqual(provincias.count(), 1)

        ciudades = filtrar_zonas_cobertura(nivel_taxonomico='CIUDAD', padre_id=self.provincia.id_provincia)
        self.assertEqual(ciudades.count(), 2)

    def test_actualizar_cobertura_zonas_con_cascada(self):
        from geo_app.services import actualizar_cobertura_zonas
        from core_app.models import LogSistema

        # 1. Ambas ciudades y la provincia están habilitadas inicialmente
        self.assertTrue(self.provincia.cobertura_habilitada)
        self.assertTrue(self.ciudad.cobertura_habilitada)
        self.assertTrue(self.ciudad2.cobertura_habilitada)

        # 2. Restringir la provincia (cobertura_habilitada=False)
        resultado = actualizar_cobertura_zonas(
            usuario_admin=self.admin,
            nivel_taxonomico='PROVINCIA',
            zonas_modificadas=[
                {'id': self.provincia.id_provincia, 'cobertura_habilitada': False}
            ]
        )
        self.assertIn(self.provincia.id_provincia, resultado['ids_actualizados'])

        # 3. Comprobar que la provincia fue actualizada
        self.provincia.refresh_from_db()
        self.assertFalse(self.provincia.cobertura_habilitada)

        # 4. Regla de Cascada Crítica: todas sus ciudades hijas deben pasar a False
        self.ciudad.refresh_from_db()
        self.ciudad2.refresh_from_db()
        self.assertFalse(self.ciudad.cobertura_habilitada)
        self.assertFalse(self.ciudad2.cobertura_habilitada)

        # 5. Comprobar auditoría en LogSistema
        log = LogSistema.objects.filter(accion__icontains="Administrar Zonas Cobertura").last()
        self.assertIsNotNone(log)
        self.assertIn("PROVINCIA", log.accion)

    def test_api_zonas_cobertura_endpoint(self):
        # 1. Sin autenticación -> 401 o 403
        res_unauth = self.client.get('/api/geo/zonas-cobertura/?nivel=PAIS')
        self.assertIn(res_unauth.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 2. Con usuario no admin -> 403
        self.client.force_authenticate(user=self.cliente)
        res_forbidden = self.client.get('/api/geo/zonas-cobertura/?nivel=PAIS')
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Con admin -> 200 GET
        self.client.force_authenticate(user=self.admin)
        res_ok = self.client.get('/api/geo/zonas-cobertura/?nivel=PAIS')
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res_ok.data) >= 1)

        # 4. GET provincia sin padre_id -> 200 (retorna todas las provincias)
        res_prov_todas = self.client.get('/api/geo/zonas-cobertura/?nivel=PROVINCIA')
        self.assertEqual(res_prov_todas.status_code, status.HTTP_200_OK)

        # 5. PUT para actualizar cobertura
        payload_put = {
            'nivel_taxonomico': 'CIUDAD',
            'zonas_modificadas': [
                {'id': self.ciudad.id_ciudad, 'cobertura_habilitada': False}
            ]
        }
        res_put = self.client.put('/api/geo/zonas-cobertura/', payload_put, format='json')
        self.assertEqual(res_put.status_code, status.HTTP_200_OK)
        self.ciudad.refresh_from_db()
        self.assertFalse(self.ciudad.cobertura_habilitada)

    def test_cascada_habilitar_pais_habilita_provincias_y_ciudades(self):
        from geo_app.services import actualizar_cobertura_zonas

        # Crear país deshabilitado con provincias y ciudades deshabilitadas
        pais_des = Pais.objects.create(nombre_pais='Perú', cobertura_habilitada=False)
        prov_des = Provincia.objects.create(nombre_provincia='Lima', cobertura_habilitada=False, id_pais=pais_des)
        ciudad_des = Ciudad.objects.create(nombre_ciudad='Lima Centro', cobertura_habilitada=False, id_provincia=prov_des)

        actualizar_cobertura_zonas(
            usuario_admin=self.admin,
            nivel_taxonomico='PAIS',
            zonas_modificadas=[{'id': pais_des.id_pais, 'cobertura_habilitada': True}]
        )

        pais_des.refresh_from_db()
        prov_des.refresh_from_db()
        ciudad_des.refresh_from_db()

        self.assertTrue(pais_des.cobertura_habilitada)
        self.assertTrue(prov_des.cobertura_habilitada)
        self.assertTrue(ciudad_des.cobertura_habilitada)

    def test_cascada_ascendente_habilitar_ciudad_habilita_provincia_y_pais(self):
        from geo_app.services import actualizar_cobertura_zonas

        # País y provincia deshabilitados
        pais_des = Pais.objects.create(nombre_pais='Chile', cobertura_habilitada=False)
        prov_des = Provincia.objects.create(nombre_provincia='Santiago', cobertura_habilitada=False, id_pais=pais_des)
        ciudad_des = Ciudad.objects.create(nombre_ciudad='Providencia', cobertura_habilitada=False, id_provincia=prov_des)

        actualizar_cobertura_zonas(
            usuario_admin=self.admin,
            nivel_taxonomico='CIUDAD',
            zonas_modificadas=[{'id': ciudad_des.id_ciudad, 'cobertura_habilitada': True}]
        )

        ciudad_des.refresh_from_db()
        prov_des.refresh_from_db()
        pais_des.refresh_from_db()

        # Ciudad pasa a True, y en cascada ascendente su Provincia y su País también
        self.assertTrue(ciudad_des.cobertura_habilitada)
        self.assertTrue(prov_des.cobertura_habilitada)
        self.assertTrue(pais_des.cobertura_habilitada)

    def test_cascada_habilitar_provincia_habilita_ciudades_y_pais(self):
        from geo_app.services import actualizar_cobertura_zonas

        pais_des = Pais.objects.create(nombre_pais='Paraguay', cobertura_habilitada=False)
        prov_des = Provincia.objects.create(nombre_provincia='Itapúa', cobertura_habilitada=False, id_pais=pais_des)
        ciudad_des = Ciudad.objects.create(nombre_ciudad='Encarnación', cobertura_habilitada=False, id_provincia=prov_des)

        actualizar_cobertura_zonas(
            usuario_admin=self.admin,
            nivel_taxonomico='PROVINCIA',
            zonas_modificadas=[{'id': prov_des.id_provincia, 'cobertura_habilitada': True}]
        )

        prov_des.refresh_from_db()
        pais_des.refresh_from_db()
        ciudad_des.refresh_from_db()

        # Provincia pasa a True, su País en cascada ascendente pasa a True, y sus ciudades a True
        self.assertTrue(prov_des.cobertura_habilitada)
        self.assertTrue(pais_des.cobertura_habilitada)
        self.assertTrue(ciudad_des.cobertura_habilitada)

    def test_cascada_ascendente_deshabilitar_todas_ciudades_deshabilita_provincia_y_pais(self):
        from geo_app.services import actualizar_cobertura_zonas

        # País, provincia y ciudad habilitados
        pais = Pais.objects.create(nombre_pais='Bolivia', cobertura_habilitada=True)
        prov = Provincia.objects.create(nombre_provincia='La Paz', cobertura_habilitada=True, id_pais=pais)
        c1 = Ciudad.objects.create(nombre_ciudad='Nuestra Señora de La Paz', cobertura_habilitada=True, id_provincia=prov)

        # Deshabilitamos la única ciudad de la provincia
        actualizar_cobertura_zonas(
            usuario_admin=self.admin,
            nivel_taxonomico='CIUDAD',
            zonas_modificadas=[{'id': c1.id_ciudad, 'cobertura_habilitada': False}]
        )

        c1.refresh_from_db()
        prov.refresh_from_db()
        pais.refresh_from_db()

        self.assertFalse(c1.cobertura_habilitada)
        # Como era la única ciudad, la provincia se desactiva automáticamente
        self.assertFalse(prov.cobertura_habilitada)
        # Y como era la única provincia de Bolivia, Bolivia se desactiva automáticamente
        self.assertFalse(pais.cobertura_habilitada)


