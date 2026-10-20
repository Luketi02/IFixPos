from django.test import TestCase

# Create your tests here.
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from catalog_app.models import CategoriaProducto, Producto
from inventory_app.models import Stock, MovimientoStock


class CatalogTiendaTestCase(TestCase):
    """
    Pruebas para el catálogo público de la tienda de clientes.
    """

    def setUp(self):
        self.cat1 = CategoriaProducto.objects.create(
            nombre='Pantallas y Displays',
            descripcion='Módulos de pantalla',
            estado=True
        )
        self.cat2 = CategoriaProducto.objects.create(
            nombre='Baterías',
            descripcion='Baterías de reemplazo',
            estado=True
        )
        self.cat_inactiva = CategoriaProducto.objects.create(
            nombre='Herramientas Obsoletas',
            descripcion='Inactiva',
            estado=False
        )

        # Producto 1: Con stock
        self.prod1 = Producto.objects.create(
            nombre='Pantalla OLED iPhone 12',
            descripcion='Display OLED alta calidad',
            precio_venta=120000.00,
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.cat1
        )
        self.stock1 = Stock.objects.create(id_producto=self.prod1, stock_minimo=2)
        MovimientoStock.objects.create(
            id_stock=self.stock1,
            tipo_movimiento='ingreso',
            cantidad=10,
            fecha=timezone.now().date(),
            uso_taller=False
        )

        # Producto 2: Agotado (stock 0)
        self.prod2 = Producto.objects.create(
            nombre='Batería iPhone 11',
            descripcion='Batería de repuesto 3110 mAh',
            precio_venta=35000.00,
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.cat2
        )
        self.stock2 = Stock.objects.create(id_producto=self.prod2, stock_minimo=1)

        # Producto 3: No apto para venta
        self.prod3 = Producto.objects.create(
            nombre='Tornillos Taller',
            descripcion='Solo uso taller interno',
            precio_venta=500.00,
            estado=True,
            apto_venta=False,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=False,
            id_categoria=self.cat1
        )

        self.client = APIClient()

    def test_listar_categorias_activas(self):
        res = self.client.get('/api/catalog/categorias/activas/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Solo cat1 y cat2 deben aparecer
        nombres = [c['nombre'] for c in res.data]
        self.assertIn('Pantallas y Displays', nombres)
        self.assertIn('Baterías', nombres)
        self.assertNotIn('Herramientas Obsoletas', nombres)

    def test_listar_productos_tienda_con_disponibilidad(self):
        res = self.client.get('/api/catalog/productos/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # prod3 no debe figurar (apto_venta=False)
        ids = [p['id_producto'] for p in res.data]
        self.assertIn(self.prod1.id_producto, ids)
        self.assertIn(self.prod2.id_producto, ids)
        self.assertNotIn(self.prod3.id_producto, ids)

        # prod1 tiene stock
        item_prod1 = next(p for p in res.data if p['id_producto'] == self.prod1.id_producto)
        self.assertTrue(item_prod1['en_stock'])
        self.assertEqual(item_prod1['stock_disponible'], 10)

        # prod2 está agotado
        item_prod2 = next(p for p in res.data if p['id_producto'] == self.prod2.id_producto)
        self.assertFalse(item_prod2['en_stock'])
        self.assertEqual(item_prod2['stock_disponible'], 0)

    def test_filtrar_productos_por_categoria_y_texto(self):
        # Filtro por categoría
        res_cat = self.client.get(f'/api/catalog/productos/?id_categoria={self.cat1.id_categoria}')
        self.assertEqual(len(res_cat.data), 1)
        self.assertEqual(res_cat.data[0]['id_producto'], self.prod1.id_producto)

        # Filtro por búsqueda de texto
        res_txt = self.client.get('/api/catalog/productos/?search=3110')
        self.assertEqual(len(res_txt.data), 1)
        self.assertEqual(res_txt.data[0]['id_producto'], self.prod2.id_producto)


class CatalogCU12TestCase(TestCase):
    """
    Pruebas unitarias para CU-12: Registrar Producto.
    """

    def setUp(self):
        from users_app.models import Usuario, RolUsuario
        from core_app.models import LogSistema

        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Rol Administrador'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Rol Cliente'
        )

        self.admin = Usuario.objects.create(
            email='admin.cu12@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente.cu12@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.categoria = CategoriaProducto.objects.create(
            nombre='Componentes Electrónicos',
            descripcion='Microchips y conectores',
            estado=True
        )

        self.client = APIClient()

    def test_registrar_producto_exitoso(self):
        from catalog_app.services import registrar_producto
        from core_app.models import LogSistema
        from inventory_app.models import Stock, MovimientoStock

        datos = {
            'nombre': 'Circuito Integrado U2 Tristar',
            'categoria': self.categoria,
            'descripcion': 'IC controlador de carga USB para iPhone',
            'precio_venta': 8500.00,
            'apto_venta': True,
            'apto_reparacion': True,
            'apto_consumible': False,
            'modulo_automatico': True,
            'stock_inicial': 20,
            'stock_minimo': 5
        }

        producto = registrar_producto(
            usuario_admin=self.admin,
            datos_validados=datos
        )

        # 1. Verificación del Producto
        self.assertIsNotNone(producto.id_producto)
        self.assertEqual(producto.nombre, 'Circuito Integrado U2 Tristar')
        self.assertTrue(producto.estado)
        self.assertTrue(producto.apto_venta)
        self.assertTrue(producto.apto_reparacion)

        # 2. Verificación del Stock
        stock = Stock.objects.filter(id_producto=producto).first()
        self.assertIsNotNone(stock)
        self.assertEqual(stock.stock_minimo, 5)

        # 3. Verificación de MovimientoStock inicial
        mov = MovimientoStock.objects.filter(id_stock=stock).first()
        self.assertIsNotNone(mov)
        self.assertEqual(mov.tipo_movimiento, 'ingreso')
        self.assertEqual(mov.cantidad, 20)

        # 4. Verificación de LogSistema
        log = LogSistema.objects.filter(id_registro_afectado=str(producto.id_producto)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.accion, 'Registrar Producto (CU-12)')
        self.assertEqual(log.tipo, 'AUDITORIA_CATALOGO')

    def test_registrar_producto_sin_proposito_falla(self):
        from catalog_app.serializers import ProductoCreateInputSerializer
        from rest_framework.exceptions import ValidationError

        payload = {
            'nombre': 'Artículo Fantasma',
            'id_categoria': self.categoria.id_categoria,
            'precio': 1000.00,
            'apto_venta': False,
            'apto_reparacion': False,
            'consumible': False,
            'stock_inicial': 5,
            'stock_minimo': 2
        }

        serializer = ProductoCreateInputSerializer(data=payload)
        self.assertFalse(serializer.is_valid())
        # Debe fallar con el mensaje exacto exigido por el CU-12
        errores_str = str(serializer.errors)
        self.assertIn("al menos un propósito funcional asignado", errores_str)

    def test_api_producto_create_endpoint_exitoso(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            'nombre': 'Flex Carga Rápida Type-C',
            'id_categoria': self.categoria.id_categoria,
            'descripcion': 'Flex original',
            'precio': 15000.00,
            'apto_venta': True,
            'apto_reparacion': False,
            'consumible': False,
            'modulo_automatico': False,
            'stock_inicial': 12,
            'stock_minimo': 3
        }

        res = self.client.post('/api/catalog/productos/registrar/', data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('id_producto', res.data)
        self.assertEqual(res.data['producto']['nombre'], 'Flex Carga Rápida Type-C')
        self.assertEqual(res.data['producto']['stock_inicial'], 12)

    def test_api_producto_create_rol_no_admin_denegado(self):
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'nombre': 'Producto Intruso',
            'id_categoria': self.categoria.id_categoria,
            'precio': 5000.00,
            'apto_venta': True
        }

        res = self.client.post('/api/catalog/productos/registrar/', data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class CatalogCU65CU66TestCase(TestCase):
    """
    Pruebas unitarias para:
    - CU-65: Crear Tipo de Dispositivo
    - CU-66: Cambiar Estado de Tipo de Dispositivo
    """

    def setUp(self):
        from users_app.models import Usuario, RolUsuario
        from catalog_app.models import TipoDispositivo
        from core_app.models import LogSistema

        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Rol Administrador'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Rol Cliente'
        )

        self.admin = Usuario.objects.create(
            email='admin.tipo@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente.tipo@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.tipo1 = TipoDispositivo.objects.create(
            nombre='Smartphone',
            estado_activo=True
        )

        self.client = APIClient()

    def test_selector_obtener_tipo_dispositivo_exitoso_e_inexistente(self):
        from catalog_app.selectors import obtener_tipo_dispositivo
        from django.core.exceptions import ObjectDoesNotExist

        # Existente
        tipo = obtener_tipo_dispositivo(self.tipo1.id_tipo_dispositivo)
        self.assertEqual(tipo.id_tipo_dispositivo, self.tipo1.id_tipo_dispositivo)
        self.assertEqual(tipo.nombre, 'Smartphone')

        # Inexistente
        with self.assertRaises(ObjectDoesNotExist):
            obtener_tipo_dispositivo(99999)

    def test_selector_obtener_todos_tipos_dispositivos(self):
        from catalog_app.selectors import obtener_todos_tipos_dispositivos
        from catalog_app.models import TipoDispositivo

        TipoDispositivo.objects.create(
            nombre='Tablet',
            estado_activo=False
        )

        # Todos
        todos = list(obtener_todos_tipos_dispositivos())
        self.assertEqual(len(todos), 2)

        # Solo activos
        solo_activos = list(obtener_todos_tipos_dispositivos(solo_activos=True))
        self.assertEqual(len(solo_activos), 1)
        self.assertEqual(solo_activos[0].nombre, 'Smartphone')

    def test_serializer_tipo_dispositivo_validacion_duplicado_iexact(self):
        from catalog_app.serializers import TipoDispositivoCreateInputSerializer

        # Nombre existente con diferente capitalización
        serializer_dup = TipoDispositivoCreateInputSerializer(data={'nombre': 'SMARTPHONE'})
        self.assertFalse(serializer_dup.is_valid())
        self.assertIn('nombre', serializer_dup.errors)
        self.assertIn('El tipo de dispositivo ya se encuentra registrado', str(serializer_dup.errors['nombre']))

        # Nombre nuevo
        serializer_ok = TipoDispositivoCreateInputSerializer(data={'nombre': 'Notebook'})
        self.assertTrue(serializer_ok.is_valid())

    def test_service_crear_tipo_dispositivo_exitoso_y_auditoria(self):
        from catalog_app.services import crear_tipo_dispositivo
        from core_app.models import LogSistema

        nuevo_tipo = crear_tipo_dispositivo(
            usuario_admin=self.admin,
            nombre='Consola Portátil'
        )

        self.assertIsNotNone(nuevo_tipo.id_tipo_dispositivo)
        self.assertEqual(nuevo_tipo.nombre, 'Consola Portátil')
        self.assertTrue(nuevo_tipo.estado_activo)

        # Verificar LogSistema
        log = LogSistema.objects.filter(
            tabla_afectada='tipo_dispositivo',
            id_registro_afectado=str(nuevo_tipo.id_tipo_dispositivo)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.accion, 'Alta de Tipo de Dispositivo')
        self.assertEqual(log.id_usuario, self.admin)

    def test_service_cambiar_estado_tipo_dispositivo_toggle_y_auditoria(self):
        from catalog_app.services import cambiar_estado_tipo_dispositivo
        from core_app.models import LogSistema

        # 1. Desactivar (Soft delete)
        tipo_inactivo = cambiar_estado_tipo_dispositivo(
            usuario_admin=self.admin,
            id_tipo=self.tipo1.id_tipo_dispositivo
        )
        self.assertFalse(tipo_inactivo.estado_activo)

        log1 = LogSistema.objects.filter(
            tabla_afectada='tipo_dispositivo',
            id_registro_afectado=str(self.tipo1.id_tipo_dispositivo)
        ).order_by('-id_log').first()
        self.assertIsNotNone(log1)
        self.assertEqual(log1.accion, 'Cambio de Estado de Tipo de Dispositivo')
        self.assertIn('Soft Delete', log1.detalle)

        # 2. Reactivar (Restauración)
        tipo_reactivado = cambiar_estado_tipo_dispositivo(
            usuario_admin=self.admin,
            id_tipo=self.tipo1.id_tipo_dispositivo
        )
        self.assertTrue(tipo_reactivado.estado_activo)

        log2 = LogSistema.objects.filter(
            tabla_afectada='tipo_dispositivo',
            id_registro_afectado=str(self.tipo1.id_tipo_dispositivo)
        ).order_by('-id_log').first()
        self.assertIn('Restauración', log2.detalle)

    def test_api_listar_tipos_dispositivos_autenticacion(self):
        # 1. No autenticado -> 401 / 403
        res_anon = self.client.get('/api/catalog/tipos-dispositivos/')
        self.assertIn(res_anon.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 2. Autenticado -> 200
        self.client.force_authenticate(user=self.cliente)
        res_auth = self.client.get('/api/catalog/tipos-dispositivos/')
        self.assertEqual(res_auth.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_auth.data), 1)
        self.assertEqual(res_auth.data[0]['nombre'], 'Smartphone')

    def test_api_crear_tipo_dispositivo_permisos_y_validaciones(self):
        # 1. Cliente no puede crear -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cliente = self.client.post('/api/catalog/tipos-dispositivos/', data={'nombre': 'Smartwatch'}, format='json')
        self.assertEqual(res_cliente.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin crea con duplicado -> 400
        self.client.force_authenticate(user=self.admin)
        res_dup = self.client.post('/api/catalog/tipos-dispositivos/', data={'nombre': 'smartphone'}, format='json')
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('El tipo de dispositivo ya se encuentra registrado', str(res_dup.data))

        # 3. Admin crea exitoso -> 201
        res_ok = self.client.post('/api/catalog/tipos-dispositivos/', data={'nombre': 'Smartwatch'}, format='json')
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ok.data['nombre'], 'Smartwatch')
        self.assertTrue(res_ok.data['estado_activo'])

    def test_api_cambiar_estado_tipo_dispositivo_permisos_y_toggles(self):
        # 1. Cliente denegado -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cliente = self.client.patch(f'/api/catalog/tipos-dispositivos/{self.tipo1.id_tipo_dispositivo}/estado/')
        self.assertEqual(res_cliente.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin con ID inexistente -> 404
        self.client.force_authenticate(user=self.admin)
        res_404 = self.client.patch('/api/catalog/tipos-dispositivos/99999/estado/')
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Admin toggle exitoso -> 200
        res_toggle = self.client.patch(f'/api/catalog/tipos-dispositivos/{self.tipo1.id_tipo_dispositivo}/estado/')
        self.assertEqual(res_toggle.status_code, status.HTTP_200_OK)
        self.assertFalse(res_toggle.data['estado_activo'])

        # 4. Segundo toggle -> 200 (vuelve a True)
        res_toggle2 = self.client.patch(f'/api/catalog/tipos-dispositivos/{self.tipo1.id_tipo_dispositivo}/estado/')
        self.assertEqual(res_toggle2.status_code, status.HTTP_200_OK)
        self.assertTrue(res_toggle2.data['estado_activo'])


class CatalogCU29CU30CU39TestCase(TestCase):
    """
    Pruebas unitarias para:
    - CU-29: Agregar Categoría de Producto
    - CU-30: Cambiar Estado de Categoría de Producto
    - CU-39: Filtrar Categorías de Producto
    """

    def setUp(self):
        from users_app.models import Usuario, RolUsuario
        from catalog_app.models import CategoriaProducto

        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Rol Administrador'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Rol Cliente'
        )

        self.admin = Usuario.objects.create(
            email='admin.cat@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente.cat@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.cat1 = CategoriaProducto.objects.create(
            nombre='Audio y Parlantes',
            descripcion='Parlantes y micrófonos',
            estado=True
        )
        self.cat2 = CategoriaProducto.objects.create(
            nombre='Cables y Flex',
            descripcion='Cables flexibles',
            estado=False
        )

        self.client = APIClient()

    def test_selector_filtrar_categorias_producto(self):
        from catalog_app.selectors import filtrar_categorias_producto

        # 1. Sin filtro de búsqueda -> retorna todas
        todas = list(filtrar_categorias_producto())
        self.assertEqual(len(todas), 2)

        # 2. Con filtro coincidente (parcial / case-insensitive)
        filtradas = list(filtrar_categorias_producto(texto_busqueda='audio'))
        self.assertEqual(len(filtradas), 1)
        self.assertEqual(filtradas[0].nombre, 'Audio y Parlantes')

        # 3. Con filtro sin coincidencias
        vacias = list(filtrar_categorias_producto(texto_busqueda='inexistente'))
        self.assertEqual(len(vacias), 0)

    def test_selector_obtener_categoria_producto(self):
        from catalog_app.selectors import obtener_categoria_producto
        from django.core.exceptions import ObjectDoesNotExist

        # 1. Existente
        cat = obtener_categoria_producto(self.cat1.id_categoria)
        self.assertEqual(cat.id_categoria, self.cat1.id_categoria)
        self.assertEqual(cat.nombre, 'Audio y Parlantes')

        # 2. Inexistente -> ObjectDoesNotExist
        with self.assertRaises(ObjectDoesNotExist):
            obtener_categoria_producto(99999)

    def test_serializer_categoria_create_validacion_unicidad_iexact(self):
        from catalog_app.serializers import CategoriaProductoCreateInputSerializer

        # Duplicado case-insensitive
        serializer_dup = CategoriaProductoCreateInputSerializer(data={
            'nombre': 'AUDIO Y PARLANTES',
            'descripcion': 'Otra descripcion'
        })
        self.assertFalse(serializer_dup.is_valid())
        self.assertIn('nombre', serializer_dup.errors)
        self.assertIn('La categoría ya se encuentra registrada con este nombre', str(serializer_dup.errors['nombre']))

        # Nombre nuevo
        serializer_ok = CategoriaProductoCreateInputSerializer(data={
            'nombre': 'Cámaras y Sensores',
            'descripcion': 'Módulos ópticos'
        })
        self.assertTrue(serializer_ok.is_valid())

    def test_serializer_categoria_output_fields(self):
        from catalog_app.serializers import CategoriaProductoOutputSerializer

        serializer = CategoriaProductoOutputSerializer(self.cat1)
        data = serializer.data
        self.assertEqual(data['id_categoria'], self.cat1.id_categoria)
        self.assertEqual(data['nombre'], 'Audio y Parlantes')
        self.assertEqual(data['descripcion'], 'Parlantes y micrófonos')
        self.assertTrue(data['estado_activo'])

    def test_service_crear_categoria_producto_y_auditoria(self):
        from catalog_app.services import crear_categoria_producto
        from core_app.models import LogSistema

        nueva_cat = crear_categoria_producto(
            usuario_admin=self.admin,
            nombre='Cámaras y Sensores',
            descripcion='Módulos ópticos'
        )

        self.assertIsNotNone(nueva_cat.id_categoria)
        self.assertEqual(nueva_cat.nombre, 'Cámaras y Sensores')
        self.assertTrue(nueva_cat.estado_activo)

        # LogSistema
        log = LogSistema.objects.filter(
            tabla_afectada='categoria_producto',
            id_registro_afectado=str(nueva_cat.id_categoria)
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.accion, 'Alta de Categoría de Producto (CU-29)')
        self.assertEqual(log.id_usuario, self.admin)

    def test_service_cambiar_estado_categoria_producto_toggle_y_auditoria(self):
        from catalog_app.services import cambiar_estado_categoria_producto
        from core_app.models import LogSistema

        # 1. Desactivar (Soft delete)
        cat_inactiva = cambiar_estado_categoria_producto(
            usuario_admin=self.admin,
            id_categoria=self.cat1.id_categoria
        )
        self.assertFalse(cat_inactiva.estado_activo)

        log1 = LogSistema.objects.filter(
            tabla_afectada='categoria_producto',
            id_registro_afectado=str(self.cat1.id_categoria)
        ).order_by('-id_log').first()
        self.assertIsNotNone(log1)
        self.assertIn('Soft Delete', log1.detalle)

        # 2. Reactivar (Habilitación)
        cat_activa = cambiar_estado_categoria_producto(
            usuario_admin=self.admin,
            id_categoria=self.cat1.id_categoria
        )
        self.assertTrue(cat_activa.estado_activo)

        log2 = LogSistema.objects.filter(
            tabla_afectada='categoria_producto',
            id_registro_afectado=str(self.cat1.id_categoria)
        ).order_by('-id_log').first()
        self.assertIn('Habilitación', log2.detalle)

    def test_api_categoria_permisos_y_listado_filtrado(self):
        # 1. No autenticado -> 401 / 403
        res_anon = self.client.get('/api/catalog/categorias/')
        self.assertIn(res_anon.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 2. Cliente denegado -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cliente = self.client.get('/api/catalog/categorias/')
        self.assertEqual(res_cliente.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Admin listado completo -> 200
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get('/api/catalog/categorias/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_admin.data), 2)

        # 4. Admin filtrado por query param 'buscar' -> 200
        res_filtrado = self.client.get('/api/catalog/categorias/?buscar=audio')
        self.assertEqual(res_filtrado.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_filtrado.data), 1)
        self.assertEqual(res_filtrado.data[0]['nombre'], 'Audio y Parlantes')

    def test_api_crear_categoria_admin_exitoso_y_duplicado(self):
        # 1. Cliente denegado -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cliente = self.client.post('/api/catalog/categorias/', data={'nombre': 'Cámaras'}, format='json')
        self.assertEqual(res_cliente.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin con nombre duplicado -> 400
        self.client.force_authenticate(user=self.admin)
        res_dup = self.client.post('/api/catalog/categorias/', data={'nombre': 'audio y parlantes'}, format='json')
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('La categoría ya se encuentra registrada con este nombre', str(res_dup.data))

        # 3. Admin creación exitosa -> 201
        payload = {'nombre': 'Cámaras y Sensores', 'descripcion': 'Módulos de cámara trasera y frontal'}
        res_ok = self.client.post('/api/catalog/categorias/', data=payload, format='json')
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ok.data['nombre'], 'Cámaras y Sensores')
        self.assertTrue(res_ok.data['estado_activo'])

    def test_api_cambiar_estado_categoria_permisos_y_toggles(self):
        # 1. Cliente denegado -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cliente = self.client.patch(f'/api/catalog/categorias/{self.cat1.id_categoria}/estado/')
        self.assertEqual(res_cliente.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin ID inexistente -> 404
        self.client.force_authenticate(user=self.admin)
        res_404 = self.client.patch('/api/catalog/categorias/99999/estado/')
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Admin toggle exitoso -> 200
        res_toggle1 = self.client.patch(f'/api/catalog/categorias/{self.cat1.id_categoria}/estado/')
        self.assertEqual(res_toggle1.status_code, status.HTTP_200_OK)
        self.assertFalse(res_toggle1.data['estado_activo'])

        # 4. Segundo toggle -> 200
        res_toggle2 = self.client.patch(f'/api/catalog/categorias/{self.cat1.id_categoria}/estado/')
        self.assertEqual(res_toggle2.status_code, status.HTTP_200_OK)
        self.assertTrue(res_toggle2.data['estado_activo'])


class MarcaCU77CU78TestCase(TestCase):
    """
    Pruebas unitarias completas para:
    - CU-77: Registrar Marca
    - CU-78: Cambiar Estado de Marca
    """

    def setUp(self):
        from users_app.models import Usuario, RolUsuario
        from catalog_app.models import Marca
        from core_app.models import LogSistema

        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Rol Administrador'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Rol Cliente'
        )

        self.admin = Usuario.objects.create(
            email='admin.marca@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente.marca@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.marca_activa = Marca.objects.create(
            nombre='Apple',
            estado_activo=True
        )
        self.marca_inactiva = Marca.objects.create(
            nombre='Motorola',
            estado_activo=False
        )

        self.client = APIClient()

    def test_selector_obtener_marca_exitoso_e_inexistente(self):
        from catalog_app.selectors import obtener_marca
        from django.core.exceptions import ObjectDoesNotExist

        marca = obtener_marca(self.marca_activa.id_marca)
        self.assertEqual(marca.id_marca, self.marca_activa.id_marca)
        self.assertEqual(marca.nombre, 'Apple')

        with self.assertRaises(ObjectDoesNotExist):
            obtener_marca(99999)

    def test_selector_obtener_todas_marcas_filtros(self):
        from catalog_app.selectors import obtener_todas_marcas

        # Todas las marcas
        todas = list(obtener_todas_marcas())
        self.assertEqual(len(todas), 2)

        # Solo activas
        activas = list(obtener_todas_marcas(solo_activas=True))
        self.assertEqual(len(activas), 1)
        self.assertEqual(activas[0].nombre, 'Apple')

        # Filtro de búsqueda por texto parcial
        busqueda = list(obtener_todas_marcas(texto_busqueda='moto'))
        self.assertEqual(len(busqueda), 1)
        self.assertEqual(busqueda[0].nombre, 'Motorola')

    def test_serializer_marca_create_input_validaciones(self):
        from catalog_app.serializers import MarcaCreateInputSerializer

        # 1. Marca activa existente (case-insensitive) -> ValidationError
        ser_activa = MarcaCreateInputSerializer(data={'nombre': 'apple'})
        self.assertFalse(ser_activa.is_valid())
        self.assertIn('nombre', ser_activa.errors)
        self.assertIn('La marca ya se encuentra registrada y activa', str(ser_activa.errors['nombre']))

        # 2. Marca inactiva existente -> Válida para permitir reactivación
        ser_inactiva = MarcaCreateInputSerializer(data={'nombre': 'motorola'})
        self.assertTrue(ser_inactiva.is_valid())

        # 3. Marca nueva -> Válida
        ser_nueva = MarcaCreateInputSerializer(data={'nombre': 'Samsung'})
        self.assertTrue(ser_nueva.is_valid())

        # 4. Nombre vacío o espacios -> Inválido
        ser_vacio = MarcaCreateInputSerializer(data={'nombre': '   '})
        self.assertFalse(ser_vacio.is_valid())

    def test_service_crear_marca_nueva_y_auditoria(self):
        from catalog_app.services import crear_o_reactivar_marca
        from core_app.models import LogSistema

        nueva, creada = crear_o_reactivar_marca(
            usuario_admin=self.admin,
            nombre='Xiaomi'
        )

        self.assertTrue(creada)
        self.assertEqual(nueva.nombre, 'Xiaomi')
        self.assertTrue(nueva.estado_activo)

        log = LogSistema.objects.filter(
            tabla_afectada='marca',
            id_registro_afectado=str(nueva.id_marca)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn('Alta nueva', log.accion)
        self.assertEqual(log.id_usuario, self.admin)

    def test_service_reactivar_marca_existente_inactiva_y_auditoria(self):
        from catalog_app.services import crear_o_reactivar_marca
        from core_app.models import LogSistema

        reactivada, creada = crear_o_reactivar_marca(
            usuario_admin=self.admin,
            nombre='motorola'
        )

        self.assertFalse(creada)
        self.assertEqual(reactivada.id_marca, self.marca_inactiva.id_marca)
        self.assertTrue(reactivada.estado_activo)

        log = LogSistema.objects.filter(
            tabla_afectada='marca',
            id_registro_afectado=str(self.marca_inactiva.id_marca)
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn('Reactivación', log.accion)
        self.assertEqual(log.id_usuario, self.admin)

    def test_service_crear_marca_ya_activa_levanta_error(self):
        from catalog_app.services import crear_o_reactivar_marca
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            crear_o_reactivar_marca(
                usuario_admin=self.admin,
                nombre='apple'
            )

    def test_service_cambiar_estado_marca_toggle_y_auditoria(self):
        from catalog_app.services import cambiar_estado_marca
        from core_app.models import LogSistema

        # 1. Inhabilitar (Soft Delete)
        marca_inactiva = cambiar_estado_marca(
            usuario_admin=self.admin,
            id_marca=self.marca_activa.id_marca
        )
        self.assertFalse(marca_inactiva.estado_activo)

        log1 = LogSistema.objects.filter(
            tabla_afectada='marca',
            id_registro_afectado=str(self.marca_activa.id_marca)
        ).order_by('-id_log').first()
        self.assertIsNotNone(log1)
        self.assertIn('Inhabilitación', log1.detalle)

        # 2. Habilitar nuevamente
        marca_activa = cambiar_estado_marca(
            usuario_admin=self.admin,
            id_marca=self.marca_activa.id_marca
        )
        self.assertTrue(marca_activa.estado_activo)

        log2 = LogSistema.objects.filter(
            tabla_afectada='marca',
            id_registro_afectado=str(self.marca_activa.id_marca)
        ).order_by('-id_log').first()
        self.assertIn('Habilitación', log2.detalle)

    def test_api_marca_permisos_y_listado_filtrado(self):
        # 1. No autenticado -> 401 / 403
        res_anon = self.client.get('/api/catalog/marcas/')
        self.assertIn(res_anon.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 2. Autenticado (cliente) -> 200 listado
        self.client.force_authenticate(user=self.cliente)
        res_cliente = self.client.get('/api/catalog/marcas/')
        self.assertEqual(res_cliente.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_cliente.data), 2)

        # 3. Filtrar solo activas -> 200
        res_activas = self.client.get('/api/catalog/marcas/?solo_activas=true')
        self.assertEqual(res_activas.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_activas.data), 1)
        self.assertEqual(res_activas.data[0]['nombre'], 'Apple')

        # 4. Filtrar por texto -> 200
        res_filtro = self.client.get('/api/catalog/marcas/?buscar=motorola')
        self.assertEqual(res_filtro.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_filtro.data), 1)
        self.assertEqual(res_filtro.data[0]['nombre'], 'Motorola')

    def test_api_marca_crear_permisos_y_respuestas(self):
        # 1. Cliente denegado -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cliente = self.client.post('/api/catalog/marcas/', data={'nombre': 'LG'}, format='json')
        self.assertEqual(res_cliente.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin con marca activa existente -> 400
        self.client.force_authenticate(user=self.admin)
        res_dup = self.client.post('/api/catalog/marcas/', data={'nombre': 'apple'}, format='json')
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('La marca ya se encuentra registrada y activa', str(res_dup.data))

        # 3. Admin con alta nueva -> 201 Created
        res_creada = self.client.post('/api/catalog/marcas/', data={'nombre': 'Sony'}, format='json')
        self.assertEqual(res_creada.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res_creada.data['creada'])
        self.assertEqual(res_creada.data['nombre'], 'Sony')
        self.assertTrue(res_creada.data['estado_activo'])

        # 4. Admin con reactivación de marca inactiva -> 200 OK
        res_reactivada = self.client.post('/api/catalog/marcas/', data={'nombre': 'motorola'}, format='json')
        self.assertEqual(res_reactivada.status_code, status.HTTP_200_OK)
        self.assertFalse(res_reactivada.data['creada'])
        self.assertEqual(res_reactivada.data['nombre'], 'Motorola')
        self.assertTrue(res_reactivada.data['estado_activo'])

    def test_api_marca_cambiar_estado_permisos_y_respuestas(self):
        # 1. Cliente denegado -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cliente = self.client.patch(f'/api/catalog/marcas/{self.marca_activa.id_marca}/estado/')
        self.assertEqual(res_cliente.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin ID inexistente -> 404
        self.client.force_authenticate(user=self.admin)
        res_404 = self.client.patch('/api/catalog/marcas/99999/estado/')
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Admin toggle exitoso -> 200
        res_toggle = self.client.patch(f'/api/catalog/marcas/{self.marca_activa.id_marca}/estado/')
        self.assertEqual(res_toggle.status_code, status.HTTP_200_OK)
        self.assertFalse(res_toggle.data['estado_activo'])


class ModeloCU79CU80CU81TestCase(TestCase):
    """
    Pruebas unitarias completas para:
    - CU-79: Registrar Modelo
    - CU-80: Cambiar Estado de Modelo
    - CU-81: Filtrar Modelos
    """

    def setUp(self):
        from users_app.models import Usuario, RolUsuario
        from catalog_app.models import Marca, TipoDispositivo, ModeloDispositivo
        from core_app.models import LogSistema

        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Rol Administrador'
        )
        self.rol_tecnico = RolUsuario.objects.create(
            codigo='TECNICO',
            nombre_rol='Técnico',
            descripcion='Rol Técnico'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Rol Cliente'
        )

        self.admin = Usuario.objects.create(
            email='admin.modelo@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.modelo@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente.modelo@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.marca_apple = Marca.objects.create(
            nombre='Apple',
            estado_activo=True
        )
        self.marca_samsung = Marca.objects.create(
            nombre='Samsung',
            estado_activo=True
        )
        self.marca_inactiva = Marca.objects.create(
            nombre='Sony',
            estado_activo=False
        )

        self.tipo_smartphone = TipoDispositivo.objects.create(
            nombre='Smartphone',
            estado_activo=True
        )
        self.tipo_inactivo = TipoDispositivo.objects.create(
            nombre='Obsoleto',
            estado_activo=False
        )

        self.modelo1 = ModeloDispositivo.objects.create(
            nombre='iPhone 13 Pro',
            id_marca=self.marca_apple,
            id_tipo_dispositivo=self.tipo_smartphone,
            estado_activo=True
        )
        self.modelo2 = ModeloDispositivo.objects.create(
            nombre='iPhone 11',
            id_marca=self.marca_apple,
            id_tipo_dispositivo=self.tipo_smartphone,
            estado_activo=False
        )

        self.client = APIClient()

    def test_selector_obtener_modelo_exitoso_e_inexistente(self):
        from catalog_app.selectors import obtener_modelo
        from django.core.exceptions import ObjectDoesNotExist

        modelo = obtener_modelo(self.modelo1.id_modelo)
        self.assertEqual(modelo.id_modelo, self.modelo1.id_modelo)
        self.assertEqual(modelo.nombre, 'iPhone 13 Pro')
        self.assertEqual(modelo.id_marca.nombre, 'Apple')
        self.assertEqual(modelo.id_tipo_dispositivo.nombre, 'Smartphone')

        with self.assertRaises(ObjectDoesNotExist):
            obtener_modelo(99999)

    def test_selector_filtrar_modelos(self):
        from catalog_app.selectors import filtrar_modelos

        # 1. Sin filtros -> todos los modelos
        todos = list(filtrar_modelos())
        self.assertEqual(len(todos), 2)

        # 2. Búsqueda por texto parcial
        res_texto = list(filtrar_modelos(texto_busqueda='13'))
        self.assertEqual(len(res_texto), 1)
        self.assertEqual(res_texto[0].nombre, 'iPhone 13 Pro')

        # 3. Filtro por marca
        res_marca = list(filtrar_modelos(id_marca=self.marca_apple.id_marca))
        self.assertEqual(len(res_marca), 2)

        # 4. Filtro por tipo de dispositivo
        res_tipo = list(filtrar_modelos(id_tipo_dispositivo=self.tipo_smartphone.id_tipo_dispositivo))
        self.assertEqual(len(res_tipo), 2)

        # 5. Filtro por estado activo True
        res_activos = list(filtrar_modelos(estado_activo='True'))
        self.assertEqual(len(res_activos), 1)
        self.assertEqual(res_activos[0].nombre, 'iPhone 13 Pro')

        # 6. Filtro por estado activo False
        res_inactivos = list(filtrar_modelos(estado_activo='False'))
        self.assertEqual(len(res_inactivos), 1)
        self.assertEqual(res_inactivos[0].nombre, 'iPhone 11')

    def test_serializer_modelo_create_input_validaciones(self):
        from catalog_app.serializers import ModeloDispositivoCreateInputSerializer

        # 1. Modelo existente y activo para la misma marca -> ValidationError
        ser_activo = ModeloDispositivoCreateInputSerializer(data={
            'nombre': 'iphone 13 pro',
            'id_marca': self.marca_apple.id_marca,
            'id_tipo_dispositivo': self.tipo_smartphone.id_tipo_dispositivo
        })
        self.assertFalse(ser_activo.is_valid())
        self.assertIn('El modelo ya se encuentra registrado y activo para esta marca', str(ser_activo.errors))

        # 2. Modelo existente pero inactivo para la misma marca -> Pasa validación (se reactivará)
        ser_inactivo = ModeloDispositivoCreateInputSerializer(data={
            'nombre': 'iphone 11',
            'id_marca': self.marca_apple.id_marca,
            'id_tipo_dispositivo': self.tipo_smartphone.id_tipo_dispositivo
        })
        self.assertTrue(ser_inactivo.is_valid())

        # 3. Mismo nombre de modelo pero para OTRA marca -> Válido
        ser_otra_marca = ModeloDispositivoCreateInputSerializer(data={
            'nombre': 'iPhone 13 Pro',
            'id_marca': self.marca_samsung.id_marca,
            'id_tipo_dispositivo': self.tipo_smartphone.id_tipo_dispositivo
        })
        self.assertTrue(ser_otra_marca.is_valid())

        # 4. Marca inexistente o inactiva -> Error
        ser_marca_inactiva = ModeloDispositivoCreateInputSerializer(data={
            'nombre': 'Xperia 1',
            'id_marca': self.marca_inactiva.id_marca,
            'id_tipo_dispositivo': self.tipo_smartphone.id_tipo_dispositivo
        })
        self.assertFalse(ser_marca_inactiva.is_valid())
        self.assertIn('id_marca', ser_marca_inactiva.errors)

        # 5. Tipo de dispositivo inexistente o inactivo -> Error
        ser_tipo_inactivo = ModeloDispositivoCreateInputSerializer(data={
            'nombre': 'Galaxy S21',
            'id_marca': self.marca_samsung.id_marca,
            'id_tipo_dispositivo': self.tipo_inactivo.id_tipo_dispositivo
        })
        self.assertFalse(ser_tipo_inactivo.is_valid())
        self.assertIn('id_tipo_dispositivo', ser_tipo_inactivo.errors)

    def test_service_crear_modelo_nuevo_y_auditoria(self):
        from catalog_app.services import crear_o_reactivar_modelo
        from core_app.models import LogSistema

        nuevo_modelo, creado = crear_o_reactivar_modelo(
            usuario_ejecutor=self.tecnico,
            nombre='Galaxy S23',
            id_marca=self.marca_samsung.id_marca,
            id_tipo_dispositivo=self.tipo_smartphone.id_tipo_dispositivo
        )

        self.assertTrue(creado)
        self.assertEqual(nuevo_modelo.nombre, 'Galaxy S23')
        self.assertTrue(nuevo_modelo.estado_activo)

        log = LogSistema.objects.filter(
            tabla_afectada='modelo',
            id_registro_afectado=str(nuevo_modelo.id_modelo)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn('Alta nueva', log.accion)
        self.assertEqual(log.id_usuario, self.tecnico)

    def test_service_reactivar_modelo_existente_inactivo_y_auditoria(self):
        from catalog_app.services import crear_o_reactivar_modelo
        from core_app.models import LogSistema

        reactivado, creado = crear_o_reactivar_modelo(
            usuario_ejecutor=self.admin,
            nombre='iphone 11',
            id_marca=self.marca_apple.id_marca,
            id_tipo_dispositivo=self.tipo_smartphone.id_tipo_dispositivo
        )

        self.assertFalse(creado)
        self.assertEqual(reactivado.id_modelo, self.modelo2.id_modelo)
        self.assertTrue(reactivado.estado_activo)

        log = LogSistema.objects.filter(
            tabla_afectada='modelo',
            id_registro_afectado=str(self.modelo2.id_modelo)
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn('Reactivación', log.accion)
        self.assertEqual(log.id_usuario, self.admin)

    def test_service_cambiar_estado_modelo_toggle_y_auditoria(self):
        from catalog_app.services import cambiar_estado_modelo
        from core_app.models import LogSistema

        # 1. Soft Delete
        modelo_inactivo = cambiar_estado_modelo(
            usuario_admin=self.admin,
            id_modelo=self.modelo1.id_modelo
        )
        self.assertFalse(modelo_inactivo.estado_activo)

        log1 = LogSistema.objects.filter(
            tabla_afectada='modelo',
            id_registro_afectado=str(self.modelo1.id_modelo)
        ).order_by('-id_log').first()
        self.assertIsNotNone(log1)
        self.assertIn('Soft Delete', log1.detalle)

        # 2. Restauración
        modelo_activo = cambiar_estado_modelo(
            usuario_admin=self.admin,
            id_modelo=self.modelo1.id_modelo
        )
        self.assertTrue(modelo_activo.estado_activo)

        log2 = LogSistema.objects.filter(
            tabla_afectada='modelo',
            id_registro_afectado=str(self.modelo1.id_modelo)
        ).order_by('-id_log').first()
        self.assertIsNotNone(log2)
        self.assertIn('Restauración', log2.detalle)

    def test_api_modelo_dispositivo_permisos_y_listado_filtrado(self):
        # 1. No autenticado -> 401 / 403
        res_anon = self.client.get('/api/catalog/modelos/')
        self.assertIn(res_anon.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 2. Cliente denegado -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cliente = self.client.get('/api/catalog/modelos/')
        self.assertEqual(res_cliente.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Técnico autorizado -> 200 con listado completo
        self.client.force_authenticate(user=self.tecnico)
        res_tecnico = self.client.get('/api/catalog/modelos/')
        self.assertEqual(res_tecnico.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_tecnico.data), 2)
        # Verificar serialización anidada
        self.assertIn('marca', res_tecnico.data[0])
        self.assertIn('tipo_dispositivo', res_tecnico.data[0])

        # 4. Admin autorizado con filtro de búsqueda
        self.client.force_authenticate(user=self.admin)
        res_filtro = self.client.get('/api/catalog/modelos/?buscar=13')
        self.assertEqual(res_filtro.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_filtro.data), 1)
        self.assertEqual(res_filtro.data[0]['nombre'], 'iPhone 13 Pro')

    def test_api_modelo_dispositivo_crear_permisos_y_respuestas(self):
        # 1. Cliente denegado -> 403
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'nombre': 'Galaxy A54',
            'id_marca': self.marca_samsung.id_marca,
            'id_tipo_dispositivo': self.tipo_smartphone.id_tipo_dispositivo
        }
        res_cliente = self.client.post('/api/catalog/modelos/', data=payload, format='json')
        self.assertEqual(res_cliente.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Técnico puede crear modelo nuevo -> 201 Created
        self.client.force_authenticate(user=self.tecnico)
        res_tecnico = self.client.post('/api/catalog/modelos/', data=payload, format='json')
        self.assertEqual(res_tecnico.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res_tecnico.data['creado'])
        self.assertEqual(res_tecnico.data['nombre'], 'Galaxy A54')

        # 3. Admin reactiva modelo inactivo -> 200 OK
        self.client.force_authenticate(user=self.admin)
        payload_reactivar = {
            'nombre': 'iphone 11',
            'id_marca': self.marca_apple.id_marca,
            'id_tipo_dispositivo': self.tipo_smartphone.id_tipo_dispositivo
        }
        res_reactivar = self.client.post('/api/catalog/modelos/', data=payload_reactivar, format='json')
        self.assertEqual(res_reactivar.status_code, status.HTTP_200_OK)
        self.assertFalse(res_reactivar.data['creado'])
        self.assertTrue(res_reactivar.data['estado_activo'])

        # 4. Admin intenta crear modelo ya activo -> 400 Bad Request
        res_dup = self.client.post('/api/catalog/modelos/', data=payload_reactivar, format='json')
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('El modelo ya se encuentra registrado y activo para esta marca', str(res_dup.data))

    def test_api_modelo_dispositivo_cambiar_estado_permisos_y_toggles(self):
        # 1. Cliente denegado -> 403
        self.client.force_authenticate(user=self.cliente)
        res_cliente = self.client.patch(f'/api/catalog/modelos/{self.modelo1.id_modelo}/estado/')
        self.assertEqual(res_cliente.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Técnico denegado (cambio de estado es EXCLUSIVO ADMIN) -> 403
        self.client.force_authenticate(user=self.tecnico)
        res_tecnico = self.client.patch(f'/api/catalog/modelos/{self.modelo1.id_modelo}/estado/')
        self.assertEqual(res_tecnico.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Admin ID inexistente -> 404
        self.client.force_authenticate(user=self.admin)
        res_404 = self.client.patch('/api/catalog/modelos/99999/estado/')
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)

        # 4. Admin toggle exitoso -> 200 OK
        res_toggle = self.client.patch(f'/api/catalog/modelos/{self.modelo1.id_modelo}/estado/')
        self.assertEqual(res_toggle.status_code, status.HTTP_200_OK)
        self.assertFalse(res_toggle.data['estado_activo'])


class ProductoImagenesYDescuentosTests(TestCase):
    """
    Pruebas para verificar el soporte de múltiples imágenes, tipo de dispositivo
    y cálculo de descuentos de usuario en productos del catálogo.
    """
    def setUp(self):
        from users_app.models import Usuario, RolUsuario
        from catalog_app.models import CategoriaProducto, TipoDispositivo, Marca, ModeloDispositivo

        self.client = APIClient()
        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Rol Administrador'
        )
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Rol Cliente'
        )

        self.admin = Usuario.objects.create(
            email="admin_img@test.com",
            contrasena="hash_pwd",
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email="cliente_img@test.com",
            contrasena="hash_pwd",
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.categoria = CategoriaProducto.objects.create(
            nombre="Baterías y Componentes",
            descripcion="Componentes internos",
            estado=True
        )
        self.tipo_disp = TipoDispositivo.objects.create(
            nombre="Smartphone",
            estado_activo=True
        )
        self.marca = Marca.objects.create(
            nombre="Samsung",
            estado_activo=True
        )
        self.modelo = ModeloDispositivo.objects.create(
            nombre="Galaxy S23",
            id_marca=self.marca,
            id_tipo_dispositivo=self.tipo_disp,
            estado_activo=True
        )

    def test_registrar_producto_con_imagenes_y_tipo_dispositivo(self):
        from decimal import Decimal
        from catalog_app.services import registrar_producto
        from catalog_app.models import ImagenProducto

        producto = registrar_producto(
            usuario_admin=self.admin,
            datos_validados={
                'nombre': 'Batería Original Samsung S23',
                'categoria': self.categoria,
                'id_categoria': self.categoria.id_categoria,
                'id_marca': self.marca.id_marca,
                'id_modelo': self.modelo.id_modelo,
                'id_tipo_dispositivo': self.tipo_disp.id_tipo_dispositivo,
                'descripcion': 'Batería Li-Ion 3900mAh original',
                'precio_venta': Decimal('45000.00'),
                'apto_venta': True,
                'stock_inicial': 10,
                'stock_minimo': 2,
                'imagen_principal': 'https://example.com/bateria_s23_portada.jpg',
                'imagenes': [
                    'https://example.com/bateria_s23_portada.jpg',
                    'https://example.com/bateria_s23_dorso.jpg',
                    'https://example.com/bateria_s23_conector.jpg'
                ]
            }
        )

        self.assertIsNotNone(producto.id_producto)
        self.assertEqual(producto.imagen_principal, 'https://example.com/bateria_s23_portada.jpg')
        self.assertEqual(producto.id_tipo_dispositivo_id, self.tipo_disp.id_tipo_dispositivo)

        # Verificar que se crearon los registros en ImagenProducto
        imagenes = list(ImagenProducto.objects.filter(id_producto=producto).order_by('orden'))
        self.assertEqual(len(imagenes), 3)
        self.assertEqual(producto.imagen_principal, imagenes[0].url_imagen)
        self.assertEqual(imagenes[0].url_imagen, 'https://example.com/bateria_s23_portada.jpg')
        self.assertEqual(imagenes[1].url_imagen, 'https://example.com/bateria_s23_dorso.jpg')

    def test_obtener_productos_tienda_con_descuento_beneficio(self):
        from decimal import Decimal
        from catalog_app.services import registrar_producto
        from catalog_app.selectors import obtener_productos_tienda
        from sales_app.models import Beneficio
        from django.utils import timezone

        producto = registrar_producto(
            usuario_admin=self.admin,
            datos_validados={
                'nombre': 'Funda Silicona Antigolpe S23',
                'categoria': self.categoria,
                'id_categoria': self.categoria.id_categoria,
                'id_marca': self.marca.id_marca,
                'id_modelo': self.modelo.id_modelo,
                'descripcion': 'Protección militar 360 grados',
                'precio_venta': Decimal('10000.00'),
                'apto_venta': True,
                'stock_inicial': 5,
                'stock_minimo': 1,
                'imagen_principal': 'https://example.com/funda_s23.jpg',
                'imagenes': ['https://example.com/funda_s23.jpg']
            }
        )

        # Crear un beneficio del 20% para el cliente en este producto
        Beneficio.objects.create(
            motivo="Descuento Cliente Frecuente",
            fecha=timezone.now().date(),
            enviado_momento_compra=False,
            enviado_durante_carrito=True,
            por_desc=Decimal('20.00'),
            tiempo_disp=Decimal('48.00'),
            id_usuario=self.cliente,
            id_producto=producto
        )

        # 1. Consulta sin usuario autenticado: precio normal sin descuento
        tienda_anonima = obtener_productos_tienda(search='Funda Silicona')
        prod_anon = next((p for p in tienda_anonima if p['id_producto'] == producto.id_producto), None)
        self.assertIsNotNone(prod_anon)
        self.assertFalse(prod_anon['tiene_descuento'])
        self.assertEqual(prod_anon['precio_final'], Decimal('10000.00'))
        self.assertEqual(prod_anon['tipo_dispositivo_nombre'], 'Smartphone')
        self.assertEqual(prod_anon['imagen_principal'], 'https://example.com/funda_s23.jpg')
        self.assertIn('https://example.com/funda_s23.jpg', prod_anon['imagenes'])

        # 2. Consulta con cliente autenticado: aplica 20% de descuento ($8000.00)
        tienda_cliente = obtener_productos_tienda(search='Funda Silicona', usuario=self.cliente)
        prod_cliente = next((p for p in tienda_cliente if p['id_producto'] == producto.id_producto), None)
        self.assertIsNotNone(prod_cliente)
        self.assertTrue(prod_cliente['tiene_descuento'])
        self.assertEqual(prod_cliente['porcentaje_descuento'], Decimal('20.00'))
        self.assertEqual(prod_cliente['precio_final'], Decimal('8000.00'))
        self.assertEqual(prod_cliente['motivo_descuento'], 'Descuento Cliente Frecuente')

    def test_subir_imagen_producto_exitoso(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.client.force_authenticate(user=self.admin)
        archivo_prueba = SimpleUploadedFile("modulo_pantalla.png", b"fake image bytes", content_type="image/png")

        response = self.client.post(
            '/api/catalog/productos/subir-imagen/',
            {'imagen': archivo_prueba},
            format='multipart'
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn('url_imagen', response.data)
        self.assertTrue(response.data['url_imagen'].startswith('/media/productos/prod_'))
        self.assertTrue(response.data['url_imagen'].endswith('.png'))

    def test_subir_imagen_producto_formato_invalido(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.client.force_authenticate(user=self.admin)
        archivo_invalido = SimpleUploadedFile("documento.pdf", b"fake pdf bytes", content_type="application/pdf")

        response = self.client.post(
            '/api/catalog/productos/subir-imagen/',
            {'imagen': archivo_invalido},
            format='multipart'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

