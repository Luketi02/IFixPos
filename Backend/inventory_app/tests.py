from django.test import TestCase
from django.core.exceptions import PermissionDenied
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from catalog_app.models import Producto, CategoriaProducto
from inventory_app.models import Stock, MovimientoStock
from users_app.models import Usuario, RolUsuario
from inventory_app.selectors import (
    filtrar_stock_inventario,
    obtener_stock_actual_producto
)


class InventoryAppCU35TestCase(TestCase):
    """
    Pruebas unitarias para CU-35 (Filtrar Stock e Inventario).
    """

    def setUp(self):
        # Roles
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

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.inv@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.inv@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente.inv@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Categorías
        self.cat_pantallas = CategoriaProducto.objects.create(
            nombre='Pantallas y Displays',
            descripcion='Módulos display',
            estado=True
        )
        self.cat_baterias = CategoriaProducto.objects.create(
            nombre='Baterías',
            descripcion='Baterías de litio',
            estado=True
        )

        # Productos
        self.prod_pantalla_oled = Producto.objects.create(
            nombre='Módulo OLED iPhone 13',
            descripcion='Display original',
            precio_venta=150000.00,
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.cat_pantallas
        )
        self.prod_bateria_samsung = Producto.objects.create(
            nombre='Batería Samsung S22',
            descripcion='Batería 3700mAh',
            precio_venta=45000.00,
            estado=True,
            apto_venta=False,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=True,
            id_categoria=self.cat_baterias
        )
        self.prod_funda = Producto.objects.create(
            nombre='Funda Silicona Universal',
            descripcion='Accesorios',
            precio_venta=8000.00,
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.cat_pantallas
        )

        # Stock y Movimientos
        # 1. prod_pantalla_oled: stock_minimo=5. Ingreso 10, Egreso 2 -> Actual = 8 (NORMAL)
        self.stock_oled = Stock.objects.create(
            id_producto=self.prod_pantalla_oled,
            stock_minimo=5
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_oled,
            tipo_movimiento='ingreso',
            cantidad=10,
            fecha=timezone.now().date(),
            uso_taller=False
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_oled,
            tipo_movimiento='egreso',
            cantidad=2,
            fecha=timezone.now().date(),
            uso_taller=True
        )

        # 2. prod_bateria_samsung: stock_minimo=10. Ingreso 5, Egreso 1 -> Actual = 4 (ALERTA)
        self.stock_bateria = Stock.objects.create(
            id_producto=self.prod_bateria_samsung,
            stock_minimo=10
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_bateria,
            tipo_movimiento='ingreso',
            cantidad=5,
            fecha=timezone.now().date(),
            uso_taller=False
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_bateria,
            tipo_movimiento='venta',
            cantidad=1,
            fecha=timezone.now().date(),
            uso_taller=False
        )

        # 3. prod_funda: stock_minimo=3. Ingreso 2, Egreso 2 -> Actual = 0 (CRÍTICO)
        self.stock_funda = Stock.objects.create(
            id_producto=self.prod_funda,
            stock_minimo=3
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_funda,
            tipo_movimiento='ingreso',
            cantidad=2,
            fecha=timezone.now().date(),
            uso_taller=False
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_funda,
            tipo_movimiento='venta',
            cantidad=2,
            fecha=timezone.now().date(),
            uso_taller=False
        )

        self.client = APIClient()

    def test_seguridad_cliente_no_puede_filtrar_stock(self):
        with self.assertRaises(PermissionDenied):
            filtrar_stock_inventario(usuario=self.cliente)

    def test_admin_y_tecnico_pueden_consultar_stock(self):
        qs_admin = filtrar_stock_inventario(usuario=self.admin)
        self.assertEqual(qs_admin.count(), 3)

        qs_tech = filtrar_stock_inventario(usuario=self.tecnico)
        self.assertEqual(qs_tech.count(), 3)

    def test_calculo_dinamico_stock_actual(self):
        cant_oled = obtener_stock_actual_producto(self.prod_pantalla_oled.id_producto)
        self.assertEqual(cant_oled, 8)

        cant_bat = obtener_stock_actual_producto(self.prod_bateria_samsung.id_producto)
        self.assertEqual(cant_bat, 4)

        cant_funda = obtener_stock_actual_producto(self.prod_funda.id_producto)
        self.assertEqual(cant_funda, 0)

    def test_filtro_texto_busqueda(self):
        qs = filtrar_stock_inventario(usuario=self.admin, texto_busqueda='OLED')
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first().id_producto, self.prod_pantalla_oled.id_producto)

        # Búsqueda por ID numérico
        qs_id = filtrar_stock_inventario(usuario=self.admin, texto_busqueda=str(self.prod_funda.id_producto))
        self.assertEqual(qs_id.count(), 1)
        self.assertEqual(qs_id.first().id_producto, self.prod_funda.id_producto)

    def test_filtro_categoria(self):
        qs = filtrar_stock_inventario(usuario=self.admin, id_categoria=self.cat_baterias.id_categoria)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first().id_producto, self.prod_bateria_samsung.id_producto)

    def test_filtro_proposito(self):
        # Apto para Venta
        qs_venta = filtrar_stock_inventario(usuario=self.admin, proposito='VENTA')
        ids_venta = [p.id_producto for p in qs_venta]
        self.assertIn(self.prod_pantalla_oled.id_producto, ids_venta)
        self.assertIn(self.prod_funda.id_producto, ids_venta)
        self.assertNotIn(self.prod_bateria_samsung.id_producto, ids_venta)

        # Apto para Reparación
        qs_rep = filtrar_stock_inventario(usuario=self.admin, proposito='REPARACION')
        ids_rep = [p.id_producto for p in qs_rep]
        self.assertIn(self.prod_pantalla_oled.id_producto, ids_rep)
        self.assertIn(self.prod_bateria_samsung.id_producto, ids_rep)
        self.assertNotIn(self.prod_funda.id_producto, ids_rep)

    def test_filtro_nivel_stock(self):
        # Normal (cantidad_actual > stock_minimo): OLED (8 > 5)
        qs_normal = filtrar_stock_inventario(usuario=self.admin, nivel_stock='NORMAL')
        self.assertEqual(qs_normal.count(), 1)
        self.assertEqual(qs_normal.first().id_producto, self.prod_pantalla_oled.id_producto)

        # Alerta (0 < cantidad_actual <= stock_minimo): Batería (0 < 4 <= 10)
        qs_alerta = filtrar_stock_inventario(usuario=self.admin, nivel_stock='ALERTA')
        self.assertEqual(qs_alerta.count(), 1)
        self.assertEqual(qs_alerta.first().id_producto, self.prod_bateria_samsung.id_producto)

        # Crítico / Agotado (cantidad_actual <= 0): Funda (0 <= 0)
        qs_critico = filtrar_stock_inventario(usuario=self.admin, nivel_stock='CRITICO')
        self.assertEqual(qs_critico.count(), 1)
        self.assertEqual(qs_critico.first().id_producto, self.prod_funda.id_producto)

    def test_filtrar_stock_api_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/inventory/stock/?proposito=VENTA&nivel_stock=NORMAL')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['nombre'], 'Módulo OLED iPhone 13')
        self.assertEqual(res.data[0]['cantidad_actual'], 8)
        self.assertEqual(res.data[0]['nivel_stock'], 'Normal')

        # Denegado a cliente
        self.client.force_authenticate(user=self.cliente)
        res_denied = self.client.get('/api/inventory/stock/')
        self.assertEqual(res_denied.status_code, status.HTTP_403_FORBIDDEN)


class InventoryCU13TestCase(TestCase):
    """
    Pruebas unitarias para CU-13: Actualizar Stock.
    """

    def setUp(self):
        from users_app.models import Usuario, RolUsuario
        from core_app.models import LogSistema
        from catalog_app.models import CategoriaProducto, Producto
        from inventory_app.models import Stock, MovimientoStock

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

        self.admin = Usuario.objects.create(
            email='admin.cu13@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.cu13@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.categoria = CategoriaProducto.objects.create(
            nombre='Repuestos de Pantallas',
            descripcion='Displays',
            estado=True
        )

        self.producto = Producto.objects.create(
            nombre='Display Moto G52 OLED',
            descripcion='Módulo original',
            precio_venta=45000.00,
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.categoria
        )

        self.stock = Stock.objects.create(
            id_producto=self.producto,
            stock_minimo=4
        )
        # Saldo inicial: 10 unidades
        MovimientoStock.objects.create(
            id_stock=self.stock,
            tipo_movimiento='ingreso',
            cantidad=10,
            fecha=timezone.now().date(),
            uso_taller=False
        )

        self.client = APIClient()

    def test_obtener_stock_producto_selector(self):
        from inventory_app.selectors import obtener_stock_producto
        from django.core.exceptions import ObjectDoesNotExist

        stock = obtener_stock_producto(self.producto.id_producto)
        self.assertEqual(stock.id_stock, self.stock.id_stock)

        with self.assertRaises(ObjectDoesNotExist):
            obtener_stock_producto(99999)

    def test_actualizar_stock_ingreso_manual(self):
        from inventory_app.services import actualizar_stock_manual
        from inventory_app.selectors import obtener_stock_actual_producto
        from core_app.models import LogSistema
        from inventory_app.models import MovimientoStock

        datos = {
            'id_producto': self.producto.id_producto,
            'tipo_operacion': 'INGRESO',
            'cantidad': 5,
            'motivo': 'Recepción de mercadería de reposición física',
            'usado_taller': False
        }

        stock = actualizar_stock_manual(
            usuario_admin=self.admin,
            datos_validados=datos
        )

        # Saldo nuevo debe ser 10 + 5 = 15
        saldo_actual = obtener_stock_actual_producto(self.producto.id_producto)
        self.assertEqual(saldo_actual, 15)
        self.assertEqual(stock.stock_nuevo, 15)

        # MovimientoStock registrado
        mov = MovimientoStock.objects.filter(id_stock=self.stock, motivo=datos['motivo']).first()
        self.assertIsNotNone(mov)
        self.assertEqual(mov.tipo_movimiento, 'ingreso')
        self.assertEqual(mov.cantidad, 5)

        # LogSistema registrado
        log = LogSistema.objects.filter(accion='Actualizar Stock (CU-13)').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.tipo, 'AUDITORIA_INVENTARIO')

    def test_actualizar_stock_egreso_manual(self):
        from inventory_app.services import actualizar_stock_manual
        from inventory_app.selectors import obtener_stock_actual_producto

        datos = {
            'id_producto': self.producto.id_producto,
            'tipo_operacion': 'EGRESO',
            'cantidad': 4,
            'motivo': 'Pantalla dañada durante manipulación en laboratorio',
            'usado_taller': True
        }

        stock = actualizar_stock_manual(
            usuario_admin=self.admin,
            datos_validados=datos
        )

        # Saldo nuevo debe ser 10 - 4 = 6
        saldo_actual = obtener_stock_actual_producto(self.producto.id_producto)
        self.assertEqual(saldo_actual, 6)
        self.assertEqual(stock.stock_nuevo, 6)

    def test_actualizar_stock_egreso_superior_al_disponible_falla(self):
        from inventory_app.services import actualizar_stock_manual
        from django.core.exceptions import ValidationError

        datos = {
            'id_producto': self.producto.id_producto,
            'tipo_operacion': 'EGRESO',
            'cantidad': 50,  # Hay 10 disponibles
            'motivo': 'Retiro masivo inviable',
            'usado_taller': False
        }

        with self.assertRaises(ValidationError) as ctx:
            actualizar_stock_manual(
                usuario_admin=self.admin,
                datos_validados=datos
            )
        self.assertIn("superior al stock disponible", str(ctx.exception))

    def test_api_actualizar_stock_endpoint_exitoso(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            'id_producto': self.producto.id_producto,
            'tipo_operacion': 'INGRESO',
            'cantidad': 8,
            'motivo': 'Ajuste anual de conteo físico',
            'usado_taller': False
        }

        res = self.client.post('/api/inventory/stock/actualizar/', data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('mensaje', res.data)
        self.assertEqual(res.data['data']['stock_nuevo'], 18)

    def test_api_actualizar_stock_rol_no_admin_denegado(self):
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'id_producto': self.producto.id_producto,
            'tipo_operacion': 'INGRESO',
            'cantidad': 2,
            'motivo': 'Intento no autorizado'
        }

        res = self.client.post('/api/inventory/stock/actualizar/', data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

