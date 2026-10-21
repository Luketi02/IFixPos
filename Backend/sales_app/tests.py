from django.test import TestCase

# Create your tests here.
import uuid
from decimal import Decimal
from django.utils import timezone
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from sales_app.models import Venta, DetalleVenta, CarritoCompra, CarritoProducto, MedioPago
from sales_app.serializers import RealizarCompraInputSerializer
from sales_app.services import procesar_compra_virtual
from inventory_app.models import Stock, MovimientoStock
from catalog_app.models import Producto, CategoriaProducto
from geo_app.models import Pais, Provincia, Ciudad, Direccion
from core_app.models import ConfiguracionSistema, LogSistema
from users_app.models import Usuario, RolUsuario


class SalesAppCU18TestCase(TestCase):
    """
    Pruebas unitarias para CU-18 (Realizar Compra Virtual - Checkout E-commerce).
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
        self.rol_tecnico = RolUsuario.objects.create(
            codigo='TECNICO',
            nombre_rol='Técnico',
            descripcion='Rol Técnico'
        )

        # Usuarios
        self.cliente = Usuario.objects.create(
            email='cliente.checkout@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.checkout@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Geo: País, Provincia, Ciudad y Direcciones
        self.pais = Pais.objects.create(nombre_pais='Argentina', cobertura_habilitada=True)
        self.provincia = Provincia.objects.create(
            nombre_provincia='Córdoba',
            cobertura_habilitada=True,
            id_pais=self.pais
        )
        self.ciudad = Ciudad.objects.create(
            nombre_ciudad='Córdoba Capital',
            cobertura_habilitada=True,
            id_provincia=self.provincia
        )
        self.direccion_activa = Direccion.objects.create(
            alias='Mi Casa',
            nro_calle='Av. Colón 1234',
            nombre_barrio='Centro',
            id_ciudad=self.ciudad,
            id_usuario=self.cliente,
            is_active=True
        )
        self.direccion_inactiva = Direccion.objects.create(
            alias='Antigua Casa',
            nro_calle='San Martín 500',
            id_ciudad=self.ciudad,
            id_usuario=self.cliente,
            is_active=False
        )

        # Configuración de Costo de Envío Local
        self.config_envio = ConfiguracionSistema.objects.create(
            clave='envioLocal',
            valor='2500.00',
            descripcion='Tarifa plana de envío dentro del radio urbano'
        )

        # Medios de Pago
        self.medio_activo = MedioPago.objects.create(
            nombre_medio_pago='Mercado Pago',
            estado=True,
            recargo=Decimal('0.00')
        )
        self.medio_inactivo = MedioPago.objects.create(
            nombre_medio_pago='Transferencia Bancaria',
            estado=False,
            recargo=Decimal('0.00')
        )

        # Categoría y Productos
        self.categoria = CategoriaProducto.objects.create(
            nombre='Accesorios y Repuestos',
            descripcion='Artículos generales',
            estado=True
        )
        self.prod_funda = Producto.objects.create(
            nombre='Funda Antigolpes iPhone 13',
            descripcion='Funda silicona reforzada',
            precio_venta=12000.00,
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.categoria
        )
        self.prod_cargador = Producto.objects.create(
            nombre='Cargador Rápido 20W',
            descripcion='Cargador USB-C',
            precio_venta=25000.00,
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.categoria
        )

        # Stock y Movimientos
        # prod_funda: Ingreso 10, Egreso 2 -> Stock disponible = 8
        self.stock_funda = Stock.objects.create(
            id_producto=self.prod_funda,
            stock_minimo=3
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_funda,
            tipo_movimiento='ingreso',
            cantidad=10,
            fecha=timezone.now().date(),
            uso_taller=False
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_funda,
            tipo_movimiento='egreso',
            cantidad=2,
            fecha=timezone.now().date(),
            uso_taller=False
        )

        # prod_cargador: Ingreso 3, Egreso 2 -> Stock disponible = 1
        self.stock_cargador = Stock.objects.create(
            id_producto=self.prod_cargador,
            stock_minimo=2
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_cargador,
            tipo_movimiento='ingreso',
            cantidad=3,
            fecha=timezone.now().date(),
            uso_taller=False
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_cargador,
            tipo_movimiento='venta',
            cantidad=2,
            fecha=timezone.now().date(),
            uso_taller=False
        )

        self.client = APIClient()

    def test_compra_virtual_sin_carrito_falla(self):
        datos_compra = {
            'metodo_entrega': 'RETIRO',
            'metodo_pago': self.medio_activo
        }
        with self.assertRaises(ValidationError) as ctx:
            procesar_compra_virtual(
                usuario_cliente=self.cliente,
                datos_compra=datos_compra
            )
        self.assertIn("carrito", str(ctx.exception))

    def test_compra_virtual_carrito_vacio_falla(self):
        CarritoCompra.objects.create(
            id_usuario=self.cliente,
            fecha_creacion=timezone.now().date(),
            estado='activo'
        )
        datos_compra = {
            'metodo_entrega': 'RETIRO',
            'metodo_pago': self.medio_activo
        }
        with self.assertRaises(ValidationError) as ctx:
            procesar_compra_virtual(
                usuario_cliente=self.cliente,
                datos_compra=datos_compra
            )
        self.assertIn("vacío", str(ctx.exception))

    def test_compra_virtual_stock_insuficiente_falla(self):
        carrito = CarritoCompra.objects.create(
            id_usuario=self.cliente,
            fecha_creacion=timezone.now().date(),
            estado='activo'
        )
        # Cargador solo tiene 1 disponible en stock; pedimos 5 unidades
        CarritoProducto.objects.create(
            id_carrito=carrito,
            id_producto=self.prod_cargador,
            cantidad=5
        )

        datos_compra = {
            'metodo_entrega': 'RETIRO',
            'metodo_pago': self.medio_activo
        }
        with self.assertRaises(ValidationError) as ctx:
            procesar_compra_virtual(
                usuario_cliente=self.cliente,
                datos_compra=datos_compra
            )
        self.assertIn("Sin stock suficiente", str(ctx.exception))

    def test_compra_virtual_retiro_exitosa(self):
        carrito = CarritoCompra.objects.create(
            id_usuario=self.cliente,
            fecha_creacion=timezone.now().date(),
            estado='activo'
        )
        # 2 fundas a $12000 = $24000
        CarritoProducto.objects.create(
            id_carrito=carrito,
            id_producto=self.prod_funda,
            cantidad=2
        )

        datos_compra = {
            'metodo_entrega': 'RETIRO',
            'metodo_pago': self.medio_activo,
            'id_direccion_envio': None
        }

        venta = procesar_compra_virtual(
            usuario_cliente=self.cliente,
            datos_compra=datos_compra
        )

        # Verificaciones de Venta
        self.assertIsNotNone(venta.id_venta)
        self.assertEqual(venta.estado_venta, 'PENDIENTE')
        self.assertEqual(venta.metodo_entrega, 'RETIRO')
        self.assertEqual(venta.monto_subtotal, Decimal('24000.00'))
        self.assertEqual(venta.costo_envio, Decimal('0.00'))
        self.assertIsNone(venta.id_direccion_envio)

        # Verificaciones de DetalleVenta
        detalles = DetalleVenta.objects.filter(id_venta=venta)
        self.assertEqual(detalles.count(), 1)
        det = detalles.first()
        self.assertEqual(det.id_producto, self.prod_funda)
        self.assertEqual(det.cantidad, 2)
        self.assertEqual(det.precio_unitario, Decimal('12000.00'))
        self.assertEqual(det.subtotal, Decimal('24000.00'))

        # Verificaciones de reducción de Stock en MovimientoStock
        mov = MovimientoStock.objects.filter(id_stock=self.stock_funda, id_venta=venta).first()
        self.assertIsNotNone(mov)
        self.assertEqual(mov.tipo_movimiento, 'venta')
        self.assertEqual(mov.cantidad, 2)

        # Verificación de vaciado y finalización de Carrito
        self.assertEqual(CarritoProducto.objects.filter(id_carrito=carrito).count(), 0)
        carrito.refresh_from_db()
        self.assertEqual(carrito.estado, 'finalizado')

        # Verificación de LogSistema
        log = LogSistema.objects.filter(id_registro_afectado=str(venta.id_venta)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.tipo, 'AUDITORIA_VENTA')
        self.assertEqual(log.modulo_origen, 'sales_app')

    def test_compra_virtual_envio_con_costo_exitosa(self):
        carrito = CarritoCompra.objects.create(
            id_usuario=self.cliente,
            fecha_creacion=timezone.now().date(),
            estado='activo'
        )
        # 1 cargador a $25000 = $25000
        CarritoProducto.objects.create(
            id_carrito=carrito,
            id_producto=self.prod_cargador,
            cantidad=1
        )

        datos_compra = {
            'metodo_entrega': 'ENVIO',
            'metodo_pago': self.medio_activo,
            'id_direccion_envio': self.direccion_activa
        }

        venta = procesar_compra_virtual(
            usuario_cliente=self.cliente,
            datos_compra=datos_compra
        )

        self.assertEqual(venta.metodo_entrega, 'ENVIO')
        self.assertEqual(venta.monto_subtotal, Decimal('25000.00'))
        self.assertEqual(venta.costo_envio, Decimal('2500.00'))
        self.assertEqual(venta.id_direccion_envio, self.direccion_activa)

    def test_serializer_envio_sin_direccion_invalido(self):
        payload = {
            'metodo_entrega': 'ENVIO',
            'metodo_pago': self.medio_activo.id_mediopago
        }
        serializer = RealizarCompraInputSerializer(data=payload)
        self.assertFalse(serializer.is_valid())
        self.assertIn('id_direccion_envio', serializer.errors)

    def test_serializer_direccion_inactiva_invalido(self):
        payload = {
            'metodo_entrega': 'ENVIO',
            'metodo_pago': self.medio_activo.id_mediopago,
            'id_direccion_envio': self.direccion_inactiva.id_direccion
        }
        serializer = RealizarCompraInputSerializer(data=payload)
        self.assertFalse(serializer.is_valid())
        self.assertIn('id_direccion_envio', serializer.errors)

    def test_serializer_medio_pago_inactivo_invalido(self):
        payload = {
            'metodo_entrega': 'RETIRO',
            'metodo_pago': self.medio_inactivo.id_mediopago
        }
        serializer = RealizarCompraInputSerializer(data=payload)
        self.assertFalse(serializer.is_valid())
        self.assertIn('metodo_pago', serializer.errors)

    def test_api_realizar_compra_virtual_endpoint(self):
        carrito = CarritoCompra.objects.create(
            id_usuario=self.cliente,
            fecha_creacion=timezone.now().date(),
            estado='activo'
        )
        CarritoProducto.objects.create(
            id_carrito=carrito,
            id_producto=self.prod_funda,
            cantidad=1
        )

        self.client.force_authenticate(user=self.cliente)
        payload = {
            'metodo_entrega': 'RETIRO',
            'metodo_pago': self.medio_activo.id_mediopago
        }
        res = self.client.post('/api/sales/compras/virtual/', data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('id_venta', res.data)
        self.assertIn('venta', res.data)
        self.assertEqual(res.data['venta']['estado_venta'], 'PENDIENTE')
        self.assertEqual(res.data['venta']['monto_subtotal'], '12000.00')

    def test_api_realizar_compra_virtual_rol_tecnico_denegado(self):
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'metodo_entrega': 'RETIRO',
            'metodo_pago': self.medio_activo.id_mediopago
        }
        res = self.client.post('/api/sales/compras/virtual/', data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_api_agregar_al_carrito_exitoso(self):
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'id_producto': self.prod_funda.id_producto,
            'cantidad': 1
        }
        res = self.client.post('/api/sales/carrito/agregar/', data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('mensaje', res.data)
        self.assertIn('agregado al carrito', res.data['mensaje'])
        self.assertEqual(res.data['resultado']['cantidad_total_item'], 1)

    def test_api_agregar_al_carrito_stock_insuficiente(self):
        self.client.force_authenticate(user=self.cliente)
        # Cargador solo tiene 1 en stock disponible
        payload = {
            'id_producto': self.prod_cargador.id_producto,
            'cantidad': 99
        }
        res = self.client.post('/api/sales/carrito/agregar/', data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', res.data)

    def test_api_consultar_resumen_carrito(self):
        self.client.force_authenticate(user=self.cliente)
        # Agregar 1 funda
        self.client.post(
            '/api/sales/carrito/agregar/',
            data={'id_producto': self.prod_funda.id_producto, 'cantidad': 1},
            format='json'
        )

        res = self.client.get('/api/sales/carrito/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_articulos'], 1)
        self.assertEqual(len(res.data['items']), 1)
        self.assertEqual(res.data['items'][0]['id_producto'], self.prod_funda.id_producto)

    def test_api_quitar_del_carrito_exitoso(self):
        self.client.force_authenticate(user=self.cliente)
        # Agregar 2 fundas
        self.client.post(
            '/api/sales/carrito/agregar/',
            data={'id_producto': self.prod_funda.id_producto, 'cantidad': 2},
            format='json'
        )

        # Quitar 1 funda
        res = self.client.post(
            '/api/sales/carrito/quitar/',
            data={'id_producto': self.prod_funda.id_producto, 'cantidad': 1},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['resultado']['eliminado_completo'])
        self.assertEqual(res.data['resultado']['cantidad_restante_item'], 1)

        # Quitar la totalidad (sin enviar cantidad o con cantidad restante)
        res_total = self.client.post(
            '/api/sales/carrito/quitar/',
            data={'id_producto': self.prod_funda.id_producto},
            format='json'
        )
        self.assertEqual(res_total.status_code, status.HTTP_200_OK)
        self.assertTrue(res_total.data['resultado']['eliminado_completo'])
        self.assertEqual(res_total.data['resultado']['total_articulos_carrito'], 0)
