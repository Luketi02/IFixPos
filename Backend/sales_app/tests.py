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


class SalesAppCU20CU21TestCase(TestCase):
    """
    Pruebas unitarias e integrales para:
    - CU-21: Completar pago
    - CU-20: Generar Factura
    """

    def setUp(self):
        # Roles
        self.rol_cliente = RolUsuario.objects.create(
            codigo='CLIENTE',
            nombre_rol='Cliente',
            descripcion='Rol Cliente'
        )
        self.rol_tecnico = RolUsuario.objects.create(
            codigo='TECNICO',
            nombre_rol='Técnico',
            descripcion='Rol Técnico'
        )
        self.rol_admin = RolUsuario.objects.create(
            codigo='ADMIN',
            nombre_rol='Administrador',
            descripcion='Rol Administrador'
        )

        # Usuarios
        self.cliente = Usuario.objects.create(
            email='cliente.pagos@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.cajero@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.admin = Usuario.objects.create(
            email='admin.cajero@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Configuración del Sistema
        ConfiguracionSistema.objects.create(clave='nombreLocal', valor='IFixPos Central')
        ConfiguracionSistema.objects.create(clave='cuilLocal', valor='30-99887766-4')

        # Venta pendiente de prueba
        self.venta_pendiente = Venta.objects.create(
            id_usuario=self.cliente,
            metodo_entrega='RETIRO',
            fecha_venta=timezone.now().date(),
            estado_venta='PENDIENTE',
            codigo_sec='SEC-VENTA-100',
            monto_subtotal=Decimal('15000.00'),
            costo_envio=Decimal('0.00')
        )

        self.client = APIClient()

    def test_busqueda_operacion_por_codigo_y_email(self):
        from sales_app.selectors import buscar_operacion_pendiente_cobro
        from django.core.exceptions import ObjectDoesNotExist

        # Búsqueda por código de seguridad
        op1 = buscar_operacion_pendiente_cobro(identificador='SEC-VENTA-100')
        self.assertEqual(op1.id_venta, self.venta_pendiente.id_venta)

        # Búsqueda por correo electrónico
        op2 = buscar_operacion_pendiente_cobro(identificador='cliente.pagos@test.com')
        self.assertEqual(op2.id_venta, self.venta_pendiente.id_venta)

        # Búsqueda inexistente levanta ObjectDoesNotExist
        with self.assertRaises(ObjectDoesNotExist):
            buscar_operacion_pendiente_cobro(identificador='NO_EXISTE_123')

    def test_completar_pago_efectivo_exitoso(self):
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            'medio_pago': 'EFECTIVO',
            'monto_pagado': '15000.00',
            'detalle': 'Pago en mostrador'
        }

        res = self.client.post(
            f'/api/sales/pagos/completar/{self.venta_pendiente.codigo_sec}/',
            data=payload,
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('ruta_comprobante', res.data)
        self.assertTrue(res.data['ruta_comprobante'].startswith('/media/facturas/factura_VENTA_'))

        # Verificar que la venta transicionó a PAGADO
        self.venta_pendiente.refresh_from_db()
        self.assertEqual(self.venta_pendiente.estado_venta, 'PAGADO')

        # Verificar logs de auditoría generados (Cobro + Emisión factura)
        logs = LogSistema.objects.filter(tabla_afectada='pago')
        self.assertTrue(logs.count() >= 2)

    def test_completar_pago_transferencia_exige_numero_operacion(self):
        self.client.force_authenticate(user=self.tecnico)
        # Falta número de operación
        payload = {
            'medio_pago': 'TRANSFERENCIA',
            'monto_pagado': '15000.00'
        }
        res = self.client.post(
            f'/api/sales/pagos/completar/{self.venta_pendiente.codigo_sec}/',
            data=payload,
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('numero_operacion', str(res.data))

        # Con número de operación funciona
        payload['numero_operacion'] = 'TRANSF-987654'
        res_ok = self.client.post(
            f'/api/sales/pagos/completar/{self.venta_pendiente.codigo_sec}/',
            data=payload,
            format='json'
        )
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)

    def test_completar_pago_falla_si_monto_no_coincide(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            'medio_pago': 'EFECTIVO',
            'monto_pagado': '10000.00'  # Adeudado es 15000.00
        }
        res = self.client.post(
            f'/api/sales/pagos/completar/{self.venta_pendiente.codigo_sec}/',
            data=payload,
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('El monto abonado no coincide con el total adeudado', str(res.data))

    def test_completar_pago_bloquea_clientes(self):
        self.client.force_authenticate(user=self.cliente)
        payload = {
            'medio_pago': 'EFECTIVO',
            'monto_pagado': '15000.00'
        }
        res = self.client.post(
            f'/api/sales/pagos/completar/{self.venta_pendiente.codigo_sec}/',
            data=payload,
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ==============================================================================
# CU-38: FILTRAR COBROS Y PAGOS (PRUEBAS DE AUDITORÍA CONTABLE Y ARQUEO DE CAJA)
# ==============================================================================

class SalesAppCU38TestCase(TestCase):
    """
    Conjunto exhaustivo de pruebas unitarias para CU-38 (Filtrar Cobros y Pagos).
    Valida:
    - Búsqueda exacta por código de seguridad y correo electrónico del cliente.
    - Filtros por estado del pago (Pendiente, Pagado, Anulado).
    - Arqueo de caja crítico: filtro Pendiente + fecha del día en curso.
    - Filtro por rango temporal cronológico.
    - Filtro por método de pago (Efectivo, Transferencia, etc.).
    - Excepciones de validación (email inválido, fechas invertidas, estado desconocido).
    - Excepción de búsqueda vacía ("No se encontraron resultados").
    - Auditoría estricta en LogSistema.
    - Control de acceso horizontal y vertical (bloqueo a rol Cliente).
    """

    def setUp(self):
        from users_app.models import Usuario, RolUsuario, PerfilUsuario
        from sales_app.models import Venta, Pago, MedioPago
        from workshop_app.models import Reparacion, Dispositivo, Diagnostico
        from catalog_app.models import ModeloDispositivo, Marca, TipoDispositivo
        import datetime

        # 1. Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol Cliente'}
        )

        # 2. Usuarios
        self.admin = Usuario.objects.create(
            email='admin.cu38@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.cu38@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.cliente1 = Usuario.objects.create(
            email='cliente.uno@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente1,
            nombre='Carlos',
            apellido='Pérez',
            dni='30111222'
        )

        self.cliente2 = Usuario.objects.create(
            email='cliente.dos@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente2,
            nombre='Ana',
            apellido='Gómez',
            dni='40333444'
        )

        # 3. Medios de Pago
        self.medio_efectivo = MedioPago.objects.create(
            nombre_medio_pago='Efectivo',
            estado=True,
            recargo=Decimal('0.00')
        )
        self.medio_transferencia = MedioPago.objects.create(
            nombre_medio_pago='Transferencia Bancaria',
            estado=True,
            recargo=Decimal('0.00')
        )

        self.hoy = timezone.now().date()
        self.hace_tres_dias = self.hoy - datetime.timedelta(days=3)

        # 4. Transacciones Comerciales de Prueba
        # Transacción A: Venta Pagada en Efectivo (Hoy)
        self.venta_pagada_hoy = Venta.objects.create(
            id_usuario=self.cliente1,
            metodo_entrega='RETIRO',
            fecha_venta=self.hoy,
            estado_venta='PAGADO',
            codigo_sec='SEC-VENTA-HOY-001',
            monto_subtotal=Decimal('12000.00'),
            costo_envio=Decimal('0.00')
        )
        self.pago_hoy = Pago.objects.create(
            id_venta=self.venta_pagada_hoy,
            medio_pago=self.medio_efectivo,
            monto_pagado=Decimal('12000.00'),
            fecha_pago=self.hoy,
            detalle='Cobro en caja de venta',
            cod_operacion='OP-EF-101',
            ruta_comprobante='/media/facturas/factura_VENTA_101.pdf'
        )

        # Transacción B: Venta Pagada por Transferencia (Hace 3 días)
        self.venta_pagada_pasada = Venta.objects.create(
            id_usuario=self.cliente2,
            metodo_entrega='ENVIO',
            fecha_venta=self.hace_tres_dias,
            estado_venta='PAGADO',
            codigo_sec='SEC-VENTA-PASADA-002',
            monto_subtotal=Decimal('25000.00'),
            costo_envio=Decimal('1500.00')
        )
        self.pago_pasado = Pago.objects.create(
            id_venta=self.venta_pagada_pasada,
            medio_pago=self.medio_transferencia,
            monto_pagado=Decimal('26500.00'),
            fecha_pago=self.hace_tres_dias,
            detalle='Cobro transferencia bancaria',
            cod_operacion='TR-998877',
            ruta_comprobante='/media/facturas/factura_VENTA_102.pdf'
        )

        # Transacción C: Venta Pendiente de Cobro (Hoy) -> Crítica para arqueo de caja
        self.venta_pendiente_hoy = Venta.objects.create(
            id_usuario=self.cliente1,
            metodo_entrega='RETIRO',
            fecha_venta=self.hoy,
            estado_venta='PENDIENTE',
            codigo_sec='SEC-VENTA-PENDIENTE-003',
            monto_subtotal=Decimal('8500.00'),
            costo_envio=Decimal('0.00')
        )

        # Transacción D: Venta Anulada (Hace 3 días)
        self.venta_anulada = Venta.objects.create(
            id_usuario=self.cliente2,
            metodo_entrega='RETIRO',
            fecha_venta=self.hace_tres_dias,
            estado_venta='ANULADO',
            codigo_sec='SEC-VENTA-ANULADA-004',
            monto_subtotal=Decimal('5000.00'),
            costo_envio=Decimal('0.00')
        )

        # Transacción E: Reparación pendiente de cobro
        tipo_disp, _ = TipoDispositivo.objects.get_or_create(
            nombre='Celular',
            defaults={'estado_activo': True}
        )
        marca_disp, _ = Marca.objects.get_or_create(
            nombre='Samsung',
            defaults={'estado_activo': True}
        )
        modelo_disp, _ = ModeloDispositivo.objects.get_or_create(
            nombre='Galaxy S21',
            id_marca=marca_disp,
            id_tipo_dispositivo=tipo_disp,
            defaults={'estado_activo': True}
        )
        disp = Dispositivo.objects.create(
            numero_serie='SN-SAMS-9988',
            fecha_registro=self.hoy,
            id_usuario=self.cliente2,
            id_modelo=modelo_disp
        )
        self.rep_pendiente = Reparacion.objects.create(
            id_dispositivo=disp,
            id_usuario=self.tecnico,
            fecha_inicio=self.hoy,
            etapa='PENDIENTE_PAGO',
            codigo_sec='SEC-REP-PENDIENTE-005',
            desc_cliente='Cambio de módulo display'
        )
        Diagnostico.objects.create(
            id_reparacion=self.rep_pendiente,
            fecha_diagnostico=self.hoy,
            costo_diagnostico=Decimal('15000.00'),
            descripcion_falla='Display roto'
        )

        self.client = APIClient()

    def test_busqueda_exacta_por_codigo_seguridad(self):
        """Paso 2: Búsqueda exacta mediante código de seguridad de la transacción."""
        self.client.force_authenticate(user=self.tecnico)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'codigo_seguridad': 'SEC-VENTA-HOY-001'}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_transacciones'], 1)
        res_item = res.data['resultados'][0]
        self.assertEqual(res_item['codigo_seguridad'], 'SEC-VENTA-HOY-001')
        self.assertEqual(res_item['estado_pago'], 'PAGADO')
        self.assertEqual(res_item['monto'], '12000.00')
        self.assertEqual(res_item['medio_pago'], 'Efectivo')

    def test_busqueda_exacta_por_email_cliente(self):
        """Paso 2: Búsqueda exacta mediante correo electrónico del cliente."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'email_cliente': 'cliente.uno@test.com'}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # cliente1 tiene Venta pagada hoy ($12000) y Venta pendiente hoy ($8500)
        self.assertEqual(res.data['total_transacciones'], 2)
        estados = [item['estado_pago'] for item in res.data['resultados']]
        self.assertIn('PAGADO', estados)
        self.assertIn('PENDIENTE', estados)

    def test_filtro_por_estado_pagado(self):
        """Paso 2: Filtro categórico por estado de pago 'PAGADO'."""
        self.client.force_authenticate(user=self.tecnico)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'estado_pago': 'PAGADO'}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_transacciones'], 2)
        for item in res.data['resultados']:
            self.assertEqual(item['estado_pago'], 'PAGADO')
            self.assertIsNotNone(item['id_pago'])

    def test_arqueo_caja_cuentas_pendientes_del_dia(self):
        """
        Comentario crítico del CU-38:
        Filtro por 'Estado del pago' configurado en 'Pendiente' combinado
        con rango de fechas del día en curso para arqueo de caja.
        """
        self.client.force_authenticate(user=self.tecnico)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {
                'estado_pago': 'PENDIENTE',
                'fecha_desde': str(self.hoy),
                'fecha_hasta': str(self.hoy)
            }
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Debe incluir venta pendiente de hoy ($8500) y reparación pendiente de hoy ($15000)
        self.assertEqual(res.data['total_transacciones'], 2)
        total_pendiente = Decimal(res.data['resumen']['total_pendiente'])
        self.assertEqual(total_pendiente, Decimal('23500.00'))

    def test_filtro_por_estado_anulado(self):
        """Filtro categórico por operaciones en estado ANULADO."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'estado_pago': 'ANULADO'}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_transacciones'], 1)
        self.assertEqual(res.data['resultados'][0]['codigo_seguridad'], 'SEC-VENTA-ANULADA-004')

    def test_filtro_por_rango_fechas_cronologico(self):
        """Filtro temporal por rango de fechas acotado."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {
                'fecha_desde': str(self.hace_tres_dias),
                'fecha_hasta': str(self.hace_tres_dias)
            }
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Hace 3 días tuvimos Venta Pagada pasada ($26500) y Venta Anulada ($5000)
        self.assertEqual(res.data['total_transacciones'], 2)

    def test_filtro_por_metodo_pago_transferencia(self):
        """Filtro categórico por método de pago."""
        self.client.force_authenticate(user=self.tecnico)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'medio_pago': 'Transferencia'}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_transacciones'], 1)
        self.assertEqual(res.data['resultados'][0]['codigo_seguridad'], 'SEC-VENTA-PASADA-002')
        self.assertEqual(res.data['resultados'][0]['numero_operacion'], 'TR-998877')

    def test_excepcion_paso_4_email_invalido_retorna_400(self):
        """Excepción Paso 4: Formato inválido en parámetro email interrumpe con 400."""
        self.client.force_authenticate(user=self.tecnico)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'email_cliente': 'correo_sin_arroba_ni_dominio'}
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email_cliente', str(res.data))

    def test_excepcion_paso_4_fechas_invertidas_retorna_400(self):
        """Excepción Paso 4: Rango temporal cronológicamente incorrecto retorna 400."""
        self.client.force_authenticate(user=self.tecnico)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {
                'fecha_desde': str(self.hoy),
                'fecha_hasta': str(self.hace_tres_dias)  # Fecha desde posterior a fecha hasta
            }
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('fecha_desde', str(res.data))

    def test_excepcion_paso_4_estado_pago_invalido_retorna_400(self):
        """Excepción Paso 4: Estado de pago desconocido retorna 400."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'estado_pago': 'ESTADO_INEXISTENTE'}
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('estado_pago', str(res.data))

    def test_excepcion_paso_5_sin_coincidencias_retorna_mensaje_y_vacio(self):
        """Excepción Paso 5: Sin coincidencias retorna 'No se encontraron resultados'."""
        self.client.force_authenticate(user=self.tecnico)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'codigo_seguridad': 'CODIGO_INEXISTENTE_XYZ'}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['mensaje'], 'No se encontraron resultados')
        self.assertEqual(res.data['total_transacciones'], 0)
        self.assertEqual(res.data['resultados'], [])

    def test_auditoria_logsistema_registrada(self):
        """Verifica que la consulta contable quede auditada en LogSistema."""
        self.client.force_authenticate(user=self.tecnico)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'estado_pago': 'PAGADO'}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        log = LogSistema.objects.filter(
            accion__icontains='Filtrar Cobros y Pagos (CU-38)',
            id_usuario=self.tecnico
        ).last()
        self.assertIsNotNone(log)
        self.assertEqual(log.tipo, 'CONSULTA_AUDITORIA')
        self.assertEqual(log.modulo_origen, 'sales_app')
        self.assertIn('estado_pago=PAGADO', log.detalle)

    def test_control_acceso_bloquea_clientes(self):
        """Precondición: Solo Administrador o Técnico pueden consultar el flujo de caja."""
        self.client.force_authenticate(user=self.cliente1)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'estado_pago': 'PAGADO'}
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


