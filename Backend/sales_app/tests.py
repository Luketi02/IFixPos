from django.test import TestCase

# Create your tests here.
import uuid
import datetime
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
from users_app.models import Usuario, RolUsuario, PerfilUsuario


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
        """Verifica la política de auditoría en LogSistema para consultas contables."""
        from core_app.models import ConfiguracionSistema
        # Por defecto no se generan logs al filtrar para alto rendimiento
        self.client.force_authenticate(user=self.tecnico)
        res = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'estado_pago': 'PAGADO'}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(
            LogSistema.objects.filter(
                accion__icontains='Filtrar Cobros y Pagos (CU-38)',
                id_usuario=self.tecnico
            ).exists()
        )

        # Cuando el flag 'log_operaciones_lectura' está habilitado, sí se audita
        ConfiguracionSistema.objects.update_or_create(
            clave='log_operaciones_lectura',
            defaults={'valor': 'True'}
        )
        res_con_log = self.client.get(
            '/api/sales/pagos/filtrar/',
            {'estado_pago': 'PAGADO'}
        )
        self.assertEqual(res_con_log.status_code, status.HTTP_200_OK)
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


class RegistrarMedioPagoTestCase(TestCase):
    """
    Pruebas unitarias e integración para el CU-82: Registrar medio de pago.
    """

    def setUp(self):
        self.client = APIClient()

        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol Cliente'}
        )

        self.admin = Usuario.objects.create(
            email='admin.mp@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.cliente = Usuario.objects.create(
            email='cliente.mp@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

    def test_registrar_nuevo_medio_pago_exitoso(self):
        """Paso 1 a 6: Un administrador registra un nuevo canal de cobro con recargo."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            "nombre": "Tarjeta de Crédito 3 Cuotas",
            "recargo": "12.50"
        }

        url = '/api/sales/medios-pago/registrar/'
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data.get('mensaje'), "Medio de pago registrado con éxito.")
        self.assertEqual(response.data.get('medio_pago', {}).get('nombre_medio_pago'), "Tarjeta de Crédito 3 Cuotas")
        self.assertEqual(Decimal(str(response.data['medio_pago']['recargo'])), Decimal('12.50'))
        self.assertTrue(response.data['medio_pago']['estado'])

        # Verificar persistencia en base de datos
        medio = MedioPago.objects.filter(nombre_medio_pago="Tarjeta de Crédito 3 Cuotas").first()
        self.assertIsNotNone(medio)
        self.assertTrue(medio.estado)
        self.assertEqual(medio.recargo, Decimal('12.50'))

        # Verificar LogSistema
        log = LogSistema.objects.filter(
            id_usuario=self.admin,
            accion__icontains="CU-82"
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn("Tarjeta de Crédito 3 Cuotas", log.detalle)

    def test_registrar_medio_pago_recargo_negativo_falla(self):
        """Valida que un recargo negativo sea rechazado por la aduana con error 400."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            "nombre": "Transferencia con Descuento",
            "recargo": "-5.00"
        }

        url = '/api/sales/medios-pago/registrar/'
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("recargo", str(response.data))

    def test_registrar_medio_pago_nombre_existente_activo_falla(self):
        """Excepción Paso 4: Si el medio de pago ya existe y se encuentra activo, rechaza la operación."""
        MedioPago.objects.create(
            nombre_medio_pago="Efectivo en Caja",
            recargo=Decimal('0.00'),
            estado=True
        )

        self.client.force_authenticate(user=self.admin)
        payload = {
            "nombre": "efectivo en caja",  # Case-insensitive
            "recargo": "0.00"
        }

        url = '/api/sales/medios-pago/registrar/'
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ya existe en el sistema y se encuentra activo", str(response.data))

    def test_registrar_medio_pago_inactivo_solicita_reactivacion(self):
        """Excepción Paso 4: Si existía pero estaba deshabilitado y no se confirma reactivación, avisa."""
        MedioPago.objects.create(
            nombre_medio_pago="Criptomoneda USDT",
            recargo=Decimal('3.00'),
            estado=False
        )

        self.client.force_authenticate(user=self.admin)
        payload = {
            "nombre": "Criptomoneda USDT",
            "recargo": "2.00",
            "confirmar_reactivacion": False
        }

        url = '/api/sales/medios-pago/registrar/'
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("se encontraba deshabilitado", str(response.data))

    def test_reactivar_medio_pago_inactivo_exitoso(self):
        """Reactivación: Al enviar confirmar_reactivacion=True, el medio se reactiva y actualiza su recargo."""
        medio_previo = MedioPago.objects.create(
            nombre_medio_pago="Cheque al Día",
            recargo=Decimal('5.00'),
            estado=False
        )

        self.client.force_authenticate(user=self.admin)
        payload = {
            "nombre": "Cheque al Día",
            "recargo": "7.50",
            "confirmar_reactivacion": True
        }

        url = '/api/sales/medios-pago/registrar/'
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['medio_pago']['estado'])
        self.assertEqual(Decimal(str(response.data['medio_pago']['recargo'])), Decimal('7.50'))

        medio_previo.refresh_from_db()
        self.assertTrue(medio_previo.estado)
        self.assertEqual(medio_previo.recargo, Decimal('7.50'))

        # Log de reactivación
        log = LogSistema.objects.filter(
            id_usuario=self.admin,
            accion__icontains="Reactivar Medio de Pago"
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)

    def test_registrar_medio_pago_rol_no_admin_denegado(self):
        """Precondición: Solo usuarios con rol de Administrador pueden registrar vías de cobro."""
        self.client.force_authenticate(user=self.cliente)
        payload = {
            "nombre": "Medio Hacker",
            "recargo": "0.00"
        }

        url = '/api/sales/medios-pago/registrar/'
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class AlternarEstadoMedioPagoTestCase(TestCase):
    """
    Pruebas unitarias e integración para el CU-83: Cambiar estado de medio de pago.
    """

    def setUp(self):
        self.client = APIClient()

        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol Cliente'}
        )

        self.admin = Usuario.objects.create(
            email='admin.toggle@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.cliente = Usuario.objects.create(
            email='cliente.toggle@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.medio_activo = MedioPago.objects.create(
            nombre_medio_pago="Tarjeta Débito Visa",
            recargo=Decimal('0.00'),
            estado=True
        )

        self.medio_inactivo = MedioPago.objects.create(
            nombre_medio_pago="Criptomonedas BTC",
            recargo=Decimal('5.00'),
            estado=False
        )

    def test_desactivar_medio_pago_activo_exitoso(self):
        """Paso 1 a 7: Administrador desactiva un medio de pago activo (baja lógica)."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/sales/medios-pago/{self.medio_activo.id_mediopago}/toggle/'

        response = self.client.patch(url, data={}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('mensaje'), "Medio de pago desactivado con éxito.")
        self.assertFalse(response.data.get('medio_pago', {}).get('estado'))

        self.medio_activo.refresh_from_db()
        self.assertFalse(self.medio_activo.estado)

        # Auditoría LogSistema
        log = LogSistema.objects.filter(
            id_usuario=self.admin,
            accion__icontains="Desactivar Medio de Pago (CU-83)"
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn("desactivó", log.detalle)
        self.assertIn(self.medio_activo.nombre_medio_pago, log.detalle)

    def test_activar_medio_pago_inactivo_exitoso(self):
        """Excepción Paso 3: Administrador reactiva un canal previamente desactivado."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/sales/medios-pago/{self.medio_inactivo.id_mediopago}/toggle/'

        response = self.client.patch(url, data={"confirmar": True}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('mensaje'), "Medio de pago activado con éxito.")
        self.assertTrue(response.data.get('medio_pago', {}).get('estado'))

        self.medio_inactivo.refresh_from_db()
        self.assertTrue(self.medio_inactivo.estado)

        # Auditoría LogSistema
        log = LogSistema.objects.filter(
            id_usuario=self.admin,
            accion__icontains="Activar Medio de Pago (CU-83)"
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn("activó", log.detalle)

    def test_toggle_medio_pago_inexistente_retorna_404(self):
        """Si el medio de pago no existe en la BD, retorna 404 Not Found."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/sales/medios-pago/999999/toggle/'

        response = self.client.patch(url, data={}, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("No se encontró el medio de pago", response.data.get('error', ''))

    def test_toggle_medio_pago_usuario_no_admin_denegado(self):
        """Precondición: Solo Administradores pueden cambiar el estado de un medio de pago."""
        self.client.force_authenticate(user=self.cliente)
        url = f'/api/sales/medios-pago/{self.medio_activo.id_mediopago}/toggle/'

        response = self.client.patch(url, data={}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.medio_activo.refresh_from_db()
        self.assertTrue(self.medio_activo.estado)  # No debe haber cambiado

    def test_toggle_medio_pago_sin_autenticar_retorna_401_o_403(self):
        """Peticiones no autenticadas son rechazadas por la seguridad de la API."""
        url = f'/api/sales/medios-pago/{self.medio_activo.id_mediopago}/toggle/'

        response = self.client.patch(url, data={}, format='json')

        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_toggle_ruta_alternativa_estado_patch_y_post(self):
        """Verifica soporte para ruta /estado/ y método POST."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/sales/medios-pago/{self.medio_activo.id_mediopago}/estado/'

        response = self.client.post(url, data={}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data.get('medio_pago', {}).get('estado'))


class RealizarVentaPresencialTestCase(TestCase):
    """
    Pruebas unitarias e integración para el CU-67: Realizar Venta Presencial.
    """

    def setUp(self):
        from catalog_app.models import Producto, CategoriaProducto
        from inventory_app.models import Stock, MovimientoStock

        self.client = APIClient()

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

        self.admin = Usuario.objects.create(
            email='admin.pos@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.tecnico = Usuario.objects.create(
            email='tecnico.pos@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.cliente = Usuario.objects.create(
            email='cliente.pos@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.categoria = CategoriaProducto.objects.create(
            nombre="Accesorios de Telefonía",
            descripcion="Cables, cargadores y fundas",
            estado=True
        )

        # Producto 1: Con stock amplio (10 unidades)
        self.prod_cargador = Producto.objects.create(
            nombre="Cargador Rápido 20W USB-C",
            descripcion="Cargador de carga rápida",
            precio_venta=Decimal('5000.00'),
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.categoria
        )
        self.stock_cargador = Stock.objects.create(
            id_producto=self.prod_cargador,
            stock_minimo=2
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_cargador,
            tipo_movimiento='ingreso',
            cantidad=10,
            fecha=timezone.now().date(),
            motivo="Stock inicial lote compras",
            uso_taller=False
        )

        # Producto 2: Con stock justo (1 unidad)
        self.prod_funda = Producto.objects.create(
            nombre="Funda Silicona Transparente",
            descripcion="Funda para celular",
            precio_venta=Decimal('2500.00'),
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.categoria
        )
        self.stock_funda = Stock.objects.create(
            id_producto=self.prod_funda,
            stock_minimo=1
        )
        MovimientoStock.objects.create(
            id_stock=self.stock_funda,
            tipo_movimiento='ingreso',
            cantidad=1,
            fecha=timezone.now().date(),
            motivo="Stock inicial lote compras",
            uso_taller=False
        )

        # Producto 3: No apto para la venta
        self.prod_no_apto = Producto.objects.create(
            nombre="Batería Dañada para Reciclaje",
            descripcion="Descarte",
            precio_venta=Decimal('100.00'),
            estado=True,
            apto_venta=False,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.categoria
        )

    def test_venta_presencial_consumidor_final_exitosa(self):
        """
        Paso 1 a 8: Técnico registra venta presencial en mostrador asignando
        automáticamente al cliente 'Consumidor Final' cuando no se envía id_cliente.
        """
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            "productos": [
                {
                    "id_producto": self.prod_cargador.id_producto,
                    "cantidad": 2
                }
            ]
        }

        url = '/api/sales/ventas/presencial/'
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data.get('mensaje'), "Venta presencial registrada pendiente de cobro")
        self.assertEqual(Decimal(response.data.get('monto_total')), Decimal('10000.00'))
        self.assertEqual(response.data.get('estado_venta'), 'PENDIENTE')
        self.assertEqual(response.data.get('cliente'), 'consumidorfinal@ifixpos.com')
        self.assertEqual(response.data.get('advertencias_stock'), [])

        id_venta = response.data.get('id_venta')
        venta_db = Venta.objects.get(id_venta=id_venta)
        self.assertEqual(venta_db.estado_venta, 'PENDIENTE')
        self.assertEqual(venta_db.metodo_entrega, 'MOSTRADOR')
        self.assertEqual(venta_db.monto_subtotal, Decimal('10000.00'))

        # Verificar DetalleVenta congelado
        detalle = DetalleVenta.objects.filter(id_venta=venta_db).first()
        self.assertIsNotNone(detalle)
        self.assertEqual(detalle.id_producto, self.prod_cargador)
        self.assertEqual(detalle.cantidad, 2)
        self.assertEqual(detalle.precio_unitario, Decimal('5000.00'))
        self.assertEqual(detalle.subtotal, Decimal('10000.00'))

        # Verificar egreso en MovimientoStock
        mov = MovimientoStock.objects.filter(id_venta=venta_db).first()
        self.assertIsNotNone(mov)
        self.assertEqual(mov.tipo_movimiento, 'venta')
        self.assertEqual(mov.cantidad, 2)
        self.assertEqual(mov.id_stock, self.stock_cargador)

        # Auditoría LogSistema
        log = LogSistema.objects.filter(
            id_usuario=self.tecnico,
            accion__icontains="CU-67"
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn(str(id_venta), log.detalle)

    def test_venta_presencial_con_cliente_especifico_y_advertencia_stock(self):
        """
        Excepción Paso 4: Si la cantidad vendida agota o sobrepasa el stock disponible,
        el sistema registra la venta pero incluye advertencias informativas.
        """
        self.client.force_authenticate(user=self.admin)
        payload = {
            "id_cliente": self.cliente.id_usuario,
            "productos": [
                {
                    "id_producto": self.prod_funda.id_producto,
                    "cantidad": 2  # Tenía 1 unidad disponible
                }
            ]
        }

        url = '/api/sales/venta-presencial/'  # Usando ruta alias
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data.get('monto_total')), Decimal('5000.00'))
        self.assertEqual(response.data.get('cliente'), self.cliente.email)
        self.assertEqual(len(response.data.get('advertencias_stock')), 1)
        self.assertIn("Funda Silicona Transparente", response.data['advertencias_stock'][0])

    def test_venta_presencial_producto_inexistente_retorna_400(self):
        """Excepción Paso 3: Código de producto inexistente en catálogo retorna 400."""
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            "productos": [
                {
                    "id_producto": 999999,
                    "cantidad": 1
                }
            ]
        }

        url = '/api/sales/ventas/presencial/'
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no existen en el catálogo", str(response.data))

    def test_venta_presencial_producto_no_apto_venta_retorna_400(self):
        """Precondición: Productos inhabilitados para venta son rechazados."""
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            "productos": [
                {
                    "id_producto": self.prod_no_apto.id_producto,
                    "cantidad": 1
                }
            ]
        }

        url = '/api/sales/ventas/presencial/'
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no se encuentra habilitado para la venta", str(response.data))

    def test_venta_presencial_cliente_inexistente_retorna_400(self):
        """Si se especifica un id_cliente no registrado en la BD, se aborta la venta con 400."""
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            "id_cliente": 888888,
            "productos": [
                {
                    "id_producto": self.prod_cargador.id_producto,
                    "cantidad": 1
                }
            ]
        }

        url = '/api/sales/ventas/presencial/'
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no existe en el sistema", str(response.data))

    def test_venta_presencial_rol_cliente_denegado_403(self):
        """Precondición: Solo Administrador o Técnico pueden operar la caja en mostrador."""
        self.client.force_authenticate(user=self.cliente)
        payload = {
            "productos": [
                {
                    "id_producto": self.prod_cargador.id_producto,
                    "cantidad": 1
                }
            ]
        }

        url = '/api/sales/ventas/presencial/'
        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_venta_presencial_sin_autenticacion_retorna_401_o_403(self):
        """Peticiones anónimas son rechazadas."""
        payload = {
            "productos": [
                {
                    "id_producto": self.prod_cargador.id_producto,
                    "cantidad": 1
                }
            ]
        }

        url = '/api/sales/ventas/presencial/'
        response = self.client.post(url, data=payload, format='json')

        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class AuditarHistorialBeneficiosTestCase(TestCase):
    """
    Pruebas unitarias e integración para el CU-69: Auditar Historial de Beneficios y Promociones.
    """

    def setUp(self):
        import datetime
        from catalog_app.models import Producto, CategoriaProducto
        from sales_app.models import Beneficio
        from users_app.models import Usuario, RolUsuario, PerfilUsuario

        self.client = APIClient()

        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol Cliente'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )

        self.admin = Usuario.objects.create(
            email='admin.audit@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.cliente1 = Usuario.objects.create(
            email='cliente.promos@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente1,
            nombre='Lucas',
            apellido='Martínez',
            dni='33444555'
        )

        self.tecnico = Usuario.objects.create(
            email='tecnico.audit@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.categoria = CategoriaProducto.objects.create(
            nombre="Smartphones",
            descripcion="Teléfonos móviles",
            estado=True
        )

        self.producto = Producto.objects.create(
            nombre="Cable Carga Rápida Tipo C",
            descripcion="Cable 1 metro",
            precio_venta=Decimal('2000.00'),
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.categoria
        )

        self.hoy = timezone.now().date()
        self.hace_diez_dias = self.hoy - datetime.timedelta(days=10)

        # Beneficio 1: Vigente (emitido hoy, 48 horas)
        self.beneficio_vigente = Beneficio.objects.create(
            id_usuario=self.cliente1,
            id_producto=self.producto,
            motivo="Algoritmo de retención: Cliente con compras recurrentes",
            fecha=self.hoy,
            enviado_momento_compra=True,
            enviado_durante_carrito=False,
            por_desc=Decimal('15.00'),
            tiempo_disp=Decimal('48.00')
        )

        # Beneficio 2: Caducado (emitido hace 10 días, 24 horas)
        self.beneficio_caducado = Beneficio.objects.create(
            id_usuario=self.cliente1,
            id_producto=self.producto,
            motivo="Reactivación cliente inactivo por abandono de carrito",
            fecha=self.hace_diez_dias,
            enviado_momento_compra=False,
            enviado_durante_carrito=True,
            por_desc=Decimal('10.00'),
            tiempo_disp=Decimal('24.00')
        )

    def test_listar_historial_beneficios_admin_exitoso(self):
        """Paso 1 a 4: El Administrador lista el historial consolidado con estado de vigencia."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/sales/beneficios/historial/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

        # El primero por fecha desc es el vigente de hoy
        item_vigente = response.data[0]
        self.assertEqual(item_vigente['id_beneficio'], self.beneficio_vigente.id_beneficio)
        self.assertEqual(item_vigente['cliente_email'], self.cliente1.email)
        self.assertIn("Lucas", item_vigente['cliente_nombre'])
        self.assertEqual(item_vigente['producto_nombre'], self.producto.nombre)
        self.assertEqual(Decimal(item_vigente['por_desc']), Decimal('15.00'))
        self.assertEqual(item_vigente['estado_vigencia'], 'VIGENTE')

        # El segundo es el caducado
        item_caducado = response.data[1]
        self.assertEqual(item_caducado['id_beneficio'], self.beneficio_caducado.id_beneficio)
        self.assertEqual(item_caducado['estado_vigencia'], 'CADUCADO')

    def test_inspeccionar_beneficio_detalle_y_auditoria_log_sistema(self):
        """
        Paso 5 y 6: El Administrador inspecciona el expediente técnico completo
        y el sistema asienta obligatoriamente la traza en LogSistema.
        """
        self.client.force_authenticate(user=self.admin)
        url = f'/api/sales/beneficios/{self.beneficio_vigente.id_beneficio}/auditar/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id_beneficio'], self.beneficio_vigente.id_beneficio)
        self.assertEqual(response.data['motivo'], self.beneficio_vigente.motivo)
        self.assertTrue(response.data['enviado_momento_compra'])
        self.assertFalse(response.data['enviado_durante_carrito'])
        self.assertEqual(response.data['canal_emision'], 'MOMENTO_COMPRA')
        self.assertIsNotNone(response.data['fecha_caducidad_estimada'])

        # Verificar LogSistema generado en core_app (condicionado a lectura pasiva o forzado en auditoría de expediente)
        from core_app.models import ConfiguracionSistema
        ConfiguracionSistema.objects.update_or_create(
            clave='log_operaciones_lectura',
            defaults={'valor': 'True'}
        )
        # Re-solicitar para validar traza cuando la lectura pasiva está activa
        response = self.client.get(url)
        log = LogSistema.objects.filter(
            id_usuario=self.admin,
            accion__icontains="Auditar Beneficio (CU-69)"
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn(str(self.beneficio_vigente.id_beneficio), log.detalle)
        self.assertIn(self.cliente1.email, log.detalle)

    def test_inspeccionar_beneficio_inexistente_retorna_404(self):
        """Si el beneficio no existe en la BD, retorna 404 Not Found."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/sales/beneficios/999999/auditar/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("No se encontró el beneficio", response.data.get('error', ''))

    def test_listar_historial_bloquea_rol_no_admin_403(self):
        """Precondición: Solo Administradores pueden auditar el motor de fidelización."""
        self.client.force_authenticate(user=self.tecnico)
        url = '/api/sales/beneficios/historial/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inspeccionar_beneficio_bloquea_rol_no_admin_403(self):
        """Precondición: Un usuario con rol Cliente o Técnico no puede acceder al expediente."""
        self.client.force_authenticate(user=self.cliente1)
        url = f'/api/sales/beneficios/{self.beneficio_vigente.id_beneficio}/auditar/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_beneficios_sin_autenticar_retorna_401_o_403(self):
        """Peticiones no autenticadas son rechazadas."""
        url = '/api/sales/beneficios/historial/'

        response = self.client.get(url)

        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class RevocarBeneficioTestCase(TestCase):
    """
    Pruebas unitarias e integración para el CU-71: Revocar Beneficio Activo.
    """

    def setUp(self):
        import datetime
        from catalog_app.models import Producto, CategoriaProducto
        from sales_app.models import Beneficio
        from users_app.models import Usuario, RolUsuario, PerfilUsuario

        self.client = APIClient()

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

        self.admin = Usuario.objects.create(
            email='admin.revoke@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.tecnico = Usuario.objects.create(
            email='tecnico.revoke@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.cliente = Usuario.objects.create(
            email='cliente.revoke@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        PerfilUsuario.objects.create(
            id_usuario=self.cliente,
            nombre='Carlos',
            apellido='Benítez',
            dni='28999888'
        )

        self.categoria = CategoriaProducto.objects.create(
            nombre="Accesorios de Telefonía",
            descripcion="Cargadores y protectores",
            estado=True
        )

        self.producto = Producto.objects.create(
            nombre="Cargador Turbo 30W",
            descripcion="Cargador ultra rápido",
            precio_venta=Decimal('7500.00'),
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.categoria
        )

        self.hoy = timezone.now().date()
        self.hace_quince_dias = self.hoy - datetime.timedelta(days=15)

        # 1. Beneficio activo y vigente (emitido hoy, 72 horas)
        self.beneficio_activo = Beneficio.objects.create(
            id_usuario=self.cliente,
            id_producto=self.producto,
            motivo="Algoritmo de Fidelización: Descuento por aniversario",
            fecha=self.hoy,
            enviado_momento_compra=True,
            enviado_durante_carrito=False,
            por_desc=Decimal('20.00'),
            tiempo_disp=Decimal('72.00')
        )

        # 2. Beneficio caducado naturalmente (emitido hace 15 días, 24 horas)
        self.beneficio_caducado = Beneficio.objects.create(
            id_usuario=self.cliente,
            id_producto=self.producto,
            motivo="Promoción flash fin de semana",
            fecha=self.hace_quince_dias,
            enviado_momento_compra=False,
            enviado_durante_carrito=True,
            por_desc=Decimal('10.00'),
            tiempo_disp=Decimal('24.00')
        )

        # 3. Beneficio previamente revocado (tiempo_disp=0 y prefijo [REVOCADO])
        self.beneficio_ya_revocado = Beneficio.objects.create(
            id_usuario=self.cliente,
            id_producto=self.producto,
            motivo="[REVOCADO] Error en cálculo de cupón promocional",
            fecha=self.hoy,
            enviado_momento_compra=True,
            enviado_durante_carrito=False,
            por_desc=Decimal('50.00'),
            tiempo_disp=Decimal('0.00')
        )

    def test_revocar_beneficio_activo_exitoso_con_motivo(self):
        """
        Paso 1 a 7: El Administrador revoca un beneficio activo ingresando justificación.
        El sistema reduce el tiempo_disp a 0, asienta el prefijo [REVOCADO]
        y registra la traza en LogSistema.
        """
        self.client.force_authenticate(user=self.admin)
        url = f'/api/sales/beneficios/{self.beneficio_activo.id_beneficio}/revocar/'
        payload = {
            "motivo_anulacion": "Detección de uso indebido de promoción múltiple"
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('mensaje'), "Beneficio revocado exitosamente.")
        self.assertEqual(response.data.get('id_beneficio'), self.beneficio_activo.id_beneficio)
        self.assertEqual(response.data.get('estado'), "REVOCADO")
        self.assertEqual(response.data.get('motivo_anulacion'), "Detección de uso indebido de promoción múltiple")

        # Verificar actualización en Base de Datos
        self.beneficio_activo.refresh_from_db()
        self.assertEqual(self.beneficio_activo.tiempo_disp, Decimal('0.00'))
        self.assertTrue(self.beneficio_activo.motivo.startswith('[REVOCADO]'))
        self.assertEqual(self.beneficio_activo.estado, 'REVOCADO')

        # Verificar LogSistema generado en core_app
        log = LogSistema.objects.filter(
            id_usuario=self.admin,
            accion__icontains="Revocar Beneficio (CU-71)"
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn(str(self.beneficio_activo.id_beneficio), log.detalle)
        self.assertIn(self.cliente.email, log.detalle)
        self.assertIn("Detección de uso indebido", log.detalle)

    def test_revocar_beneficio_activo_sin_motivo_usa_defecto(self):
        """
        Paso 5 opcional: El Administrador revoca el beneficio sin enviar justificación,
        el sistema asienta el texto por defecto en la auditoría.
        """
        self.client.force_authenticate(user=self.admin)
        url = f'/api/sales/beneficios/{self.beneficio_activo.id_beneficio}/revocar/'

        response = self.client.patch(url, data={}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('motivo_anulacion'), "Sin justificación ingresada")

        self.beneficio_activo.refresh_from_db()
        self.assertEqual(self.beneficio_activo.tiempo_disp, Decimal('0.00'))
        self.assertEqual(self.beneficio_activo.estado, 'REVOCADO')

    def test_revocar_beneficio_caducado_retorna_400(self):
        """
        Excepción Paso 4: Si el tiempo natural del beneficio ya caducó,
        el sistema deniega la operación con 400 Bad Request.
        """
        self.client.force_authenticate(user=self.admin)
        url = f'/api/sales/beneficios/{self.beneficio_caducado.id_beneficio}/revocar/'

        response = self.client.patch(url, data={"motivo_anulacion": "Intento tardío"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ya fue utilizado por el cliente o su tiempo de validez expiró", str(response.data))

    def test_revocar_beneficio_ya_revocado_retorna_400(self):
        """
        Excepción Paso 4: Un beneficio ya revocado (tiempo_disp=0 o prefijo [REVOCADO])
        no puede volver a ser revocado.
        """
        self.client.force_authenticate(user=self.admin)
        url = f'/api/sales/beneficios/{self.beneficio_ya_revocado.id_beneficio}/revocar/'

        response = self.client.patch(url, data={}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ya fue utilizado por el cliente o su tiempo de validez expiró", str(response.data))

    def test_revocar_beneficio_inexistente_retorna_404(self):
        """Si el beneficio no existe en la base de datos, retorna 404 Not Found."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/sales/beneficios/999999/revocar/'

        response = self.client.patch(url, data={}, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("No se encontró el beneficio", response.data.get('error', ''))

    def test_revocar_beneficio_usuario_no_admin_denegado_403(self):
        """
        Precondición: Solo Administradores pueden revocar beneficios.
        Un Técnico o Cliente debe ser rechazado con 403 Forbidden.
        """
        self.client.force_authenticate(user=self.tecnico)
        url = f'/api/sales/beneficios/{self.beneficio_activo.id_beneficio}/revocar/'

        response = self.client.patch(url, data={}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Probar también con cliente
        self.client.force_authenticate(user=self.cliente)
        response_cli = self.client.patch(url, data={}, format='json')
        self.assertEqual(response_cli.status_code, status.HTTP_403_FORBIDDEN)

        # Asegurar que no se modificó
        self.beneficio_activo.refresh_from_db()
        self.assertEqual(self.beneficio_activo.tiempo_disp, Decimal('72.00'))

    def test_revocar_beneficio_sin_autenticar_retorna_401_o_403(self):
        """Peticiones anónimas son rechazadas inmediatamente."""
        url = f'/api/sales/beneficios/{self.beneficio_activo.id_beneficio}/revocar/'

        response = self.client.patch(url, data={}, format='json')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_revocar_beneficio_soporta_metodo_post(self):
        """El endpoint acepta tanto PATCH como POST para flexibilidad de clientes HTTP."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/sales/beneficios/{self.beneficio_activo.id_beneficio}/revocar/'

        response = self.client.post(url, data={"motivo_anulacion": "Revocación vía POST"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('mensaje'), "Beneficio revocado exitosamente.")
        self.beneficio_activo.refresh_from_db()
        self.assertEqual(self.beneficio_activo.estado, 'REVOCADO')


class ReporteLogisticaTestCase(TestCase):
    """
    Suite de pruebas exhaustivas para CU-75: Generar Reporte de Distribución Geográfica y Logística.
    Verifica:
    - Cruce de ventas bajo modalidad 'Envío a domicilio' con dirección congelada en la transacción.
    - Descarte de compras presenciales / mostrador / retiro.
    - Agrupación por territorio (Provincia, Ciudad) y cálculo de volumen, fletes, facturación y ticket promedio.
    - Excepción de zona o periodo sin ventas de envío (error 400).
    - Validación cronológica de fechas de consulta.
    - Filtros segmentados por provincia, ciudad y estado_venta.
    - Asiento de auditoría inmutable en LogSistema.
    - Seguridad de roles y permisos (estrictamente ADMIN).
    """

    def setUp(self):
        self.client = APIClient()
        self.url_logistica = '/api/sales/reportes/logistica/'

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(codigo='ADMIN', defaults={'nombre_rol': 'Administrador'})
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(codigo='TECNICO', defaults={'nombre_rol': 'Técnico'})
        self.rol_cliente, _ = RolUsuario.objects.get_or_create(codigo='CLIENTE', defaults={'nombre_rol': 'Cliente'})

        self.hoy = timezone.now().date()
        self.f_inicio = self.hoy - datetime.timedelta(days=30)
        self.f_fin = self.hoy

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.cu75@test.com',
            fecha_registro=self.hoy,
            is_active=True,
            id_rol=self.rol_admin
        )
        PerfilUsuario.objects.create(id_usuario=self.admin, nombre='Admin', apellido='Logístico')

        self.tecnico = Usuario.objects.create(
            email='tecnico.cu75@test.com',
            fecha_registro=self.hoy,
            is_active=True,
            id_rol=self.rol_tecnico
        )

        self.cliente = Usuario.objects.create(
            email='cliente.cu75@test.com',
            fecha_registro=self.hoy,
            is_active=True,
            id_rol=self.rol_cliente
        )
        PerfilUsuario.objects.create(id_usuario=self.cliente, nombre='Santiago', apellido='Comprador')

        # Geografía
        from geo_app.models import Pais, Provincia, Ciudad, Direccion

        self.pais = Pais.objects.create(nombre_pais='Argentina', cobertura_habilitada=True)

        self.prov_cba = Provincia.objects.create(
            nombre_provincia='Córdoba',
            cobertura_habilitada=True,
            id_pais=self.pais
        )
        self.ciudad_cba = Ciudad.objects.create(
            nombre_ciudad='Córdoba Capital',
            cobertura_habilitada=True,
            id_provincia=self.prov_cba
        )
        self.dir_cba = Direccion.objects.create(
            nro_calle='Av. Colón 1500',
            id_ciudad=self.ciudad_cba,
            id_usuario=self.cliente,
            is_active=True
        )

        self.prov_ba = Provincia.objects.create(
            nombre_provincia='Buenos Aires',
            cobertura_habilitada=True,
            id_pais=self.pais
        )
        self.ciudad_lp = Ciudad.objects.create(
            nombre_ciudad='La Plata',
            cobertura_habilitada=True,
            id_provincia=self.prov_ba
        )
        self.dir_lp = Direccion.objects.create(
            nro_calle='Calle 7 Nro 850',
            id_ciudad=self.ciudad_lp,
            id_usuario=self.cliente,
            is_active=True
        )

    def test_reporte_logistica_consolidado_exitoso(self):
        """Verifica la agrupación territorial, recaudación de fletes y ticket promedio."""
        from sales_app.models import Venta

        # Venta 1: ENVIO a Córdoba Capital (Flete: 3000, Subtotal: 20000 -> Total: 23000)
        Venta.objects.create(
            metodo_entrega='ENVIO',
            fecha_venta=self.f_inicio + datetime.timedelta(days=5),
            estado_venta='COMPLETADA',
            monto_subtotal=Decimal('20000.00'),
            costo_envio=Decimal('3000.00'),
            id_usuario=self.cliente,
            id_direccion_envio=self.dir_cba
        )

        # Venta 2: ENVIO a Córdoba Capital (Flete: 3000, Subtotal: 15000 -> Total: 18000)
        Venta.objects.create(
            metodo_entrega='ENVIO',
            fecha_venta=self.f_inicio + datetime.timedelta(days=10),
            estado_venta='COMPLETADA',
            monto_subtotal=Decimal('15000.00'),
            costo_envio=Decimal('3000.00'),
            id_usuario=self.cliente,
            id_direccion_envio=self.dir_cba
        )

        # Venta 3: ENVIO a La Plata (Flete: 4500, Subtotal: 10000 -> Total: 14500)
        Venta.objects.create(
            metodo_entrega='ENVIO',
            fecha_venta=self.f_inicio + datetime.timedelta(days=12),
            estado_venta='COMPLETADA',
            monto_subtotal=Decimal('10000.00'),
            costo_envio=Decimal('4500.00'),
            id_usuario=self.cliente,
            id_direccion_envio=self.dir_lp
        )

        # Venta 4: RETIRO en mostrador (debe ser ignorada por el motor de envíos)
        Venta.objects.create(
            metodo_entrega='RETIRO',
            fecha_venta=self.f_inicio + datetime.timedelta(days=15),
            estado_venta='COMPLETADA',
            monto_subtotal=Decimal('50000.00'),
            costo_envio=Decimal('0.00'),
            id_usuario=self.cliente,
            id_direccion_envio=None
        )

        # Venta 5: Fuera del rango temporal (hace 45 días)
        Venta.objects.create(
            metodo_entrega='ENVIO',
            fecha_venta=self.f_inicio - datetime.timedelta(days=15),
            estado_venta='COMPLETADA',
            monto_subtotal=Decimal('30000.00'),
            costo_envio=Decimal('3000.00'),
            id_usuario=self.cliente,
            id_direccion_envio=self.dir_cba
        )

        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        response = self.client.get(self.url_logistica, data=params)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(len(data), 2)

        # Córdoba Capital (2 envíos)
        cba = next((t for t in data if t['id_ciudad'] == self.ciudad_cba.id_ciudad), None)
        self.assertIsNotNone(cba)
        self.assertEqual(cba['nombre_provincia'], 'Córdoba')
        self.assertEqual(cba['nombre_ciudad'], 'Córdoba Capital')
        self.assertEqual(cba['volumen_envios'], 2)
        self.assertEqual(Decimal(str(cba['recaudacion_logistica'])), Decimal('6000.00'))
        self.assertEqual(Decimal(str(cba['facturacion_bruta'])), Decimal('41000.00'))
        self.assertEqual(Decimal(str(cba['ticket_promedio'])), Decimal('20500.00'))

        # La Plata (1 envío)
        lp = next((t for t in data if t['id_ciudad'] == self.ciudad_lp.id_ciudad), None)
        self.assertIsNotNone(lp)
        self.assertEqual(lp['nombre_provincia'], 'Buenos Aires')
        self.assertEqual(lp['nombre_ciudad'], 'La Plata')
        self.assertEqual(lp['volumen_envios'], 1)
        self.assertEqual(Decimal(str(lp['recaudacion_logistica'])), Decimal('4500.00'))
        self.assertEqual(Decimal(str(lp['facturacion_bruta'])), Decimal('14500.00'))
        self.assertEqual(Decimal(str(lp['ticket_promedio'])), Decimal('14500.00'))

        # Auditoría en LogSistema
        log = LogSistema.objects.filter(accion="Generar Reporte de Distribución Geográfica (CU-75)").first()
        self.assertIsNotNone(log)
        self.assertIn("Reporte de Distribución Geográfica", log.detalle)

    def test_filtro_segmentado_por_provincia_y_ciudad(self):
        """Verifica que los filtros opcionales de provincia y ciudad aíslen el territorio correcto."""
        from sales_app.models import Venta

        Venta.objects.create(
            metodo_entrega='ENVIO',
            fecha_venta=self.f_inicio + datetime.timedelta(days=2),
            estado_venta='COMPLETADA',
            monto_subtotal=Decimal('10000.00'),
            costo_envio=Decimal('2000.00'),
            id_usuario=self.cliente,
            id_direccion_envio=self.dir_cba
        )
        Venta.objects.create(
            metodo_entrega='ENVIO',
            fecha_venta=self.f_inicio + datetime.timedelta(days=3),
            estado_venta='COMPLETADA',
            monto_subtotal=Decimal('15000.00'),
            costo_envio=Decimal('3500.00'),
            id_usuario=self.cliente,
            id_direccion_envio=self.dir_lp
        )

        self.client.force_authenticate(user=self.admin)

        # Filtro por provincia de Córdoba
        params_prov = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin),
            'id_provincia': self.prov_cba.id_provincia
        }
        res_prov = self.client.get(self.url_logistica, data=params_prov)
        self.assertEqual(res_prov.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_prov.data), 1)
        self.assertEqual(res_prov.data[0]['id_provincia'], self.prov_cba.id_provincia)

        # Filtro por ciudad de La Plata
        params_ciu = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin),
            'id_ciudad': self.ciudad_lp.id_ciudad
        }
        res_ciu = self.client.get(self.url_logistica, data=params_ciu)
        self.assertEqual(res_ciu.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_ciu.data), 1)
        self.assertEqual(res_ciu.data[0]['id_ciudad'], self.ciudad_lp.id_ciudad)

    def test_sin_ventas_de_envio_en_periodo_retorna_400(self):
        """Excepción Paso 5: Si no existen ventas bajo modalidad de envío en la zona/periodo, arroja 400."""
        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': '2021-01-01',
            'fecha_fin': '2021-01-31'
        }
        response = self.client.get(self.url_logistica, data=params)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no existen ventas bajo modalidad de envío", str(response.data))

    def test_rango_fechas_incongruente_retorna_400(self):
        """Excepción Paso 4: Si fecha_inicio supera fecha_fin, arroja error 400."""
        self.client.force_authenticate(user=self.admin)
        params = {
            'fecha_inicio': str(self.hoy),
            'fecha_fin': str(self.hoy - datetime.timedelta(days=1))
        }
        response = self.client.get(self.url_logistica, data=params)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no puede ser posterior", str(response.data))

    def test_seguridad_no_admin_denegado_403(self):
        """Solo administradores pueden consultar el reporte de logística."""
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        self.client.force_authenticate(user=self.tecnico)
        res_tec = self.client.get(self.url_logistica, data=params)
        self.assertEqual(res_tec.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.cliente)
        res_cli = self.client.get(self.url_logistica, data=params)
        self.assertEqual(res_cli.status_code, status.HTTP_403_FORBIDDEN)

    def test_no_autenticado_denegado_401(self):
        """Peticiones sin autenticar deben recibir 401."""
        params = {
            'fecha_inicio': str(self.f_inicio),
            'fecha_fin': str(self.f_fin)
        }
        response = self.client.get(self.url_logistica, data=params)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class ActualizarCantidadCarritoTestCase(TestCase):
    """
    Pruebas unitarias y de integración para la sincronización atómica
    y actualización absoluta de cantidades en el carrito de compras.
    """

    def setUp(self):
        from catalog_app.models import Producto, CategoriaProducto
        from inventory_app.models import Stock, MovimientoStock
        from sales_app.models import CarritoCompra, CarritoProducto
        from users_app.models import Usuario, RolUsuario

        self.client = APIClient()

        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol Cliente'}
        )

        self.cliente = Usuario.objects.create(
            email='cliente.carrito@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        self.categoria = CategoriaProducto.objects.create(
            nombre='Repuestos',
            descripcion='Repuestos varios',
            estado=True
        )

        self.producto = Producto.objects.create(
            nombre='Pantalla OLED Test',
            descripcion='Pantalla de repuesto',
            precio_venta=Decimal('100.00'),
            id_categoria=self.categoria,
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False
        )

        self.stock = Stock.objects.create(
            id_producto=self.producto,
            stock_minimo=1
        )

        MovimientoStock.objects.create(
            id_stock=self.stock,
            tipo_movimiento='ingreso',
            cantidad=10,
            fecha=timezone.now().date(),
            uso_taller=False
        )

        self.url_actualizar = '/api/sales/carrito/actualizar/'

    def test_actualizar_cantidad_absoluta_exitoso(self):
        """Establece directamente la cantidad en 3 unidades."""
        self.client.force_authenticate(user=self.cliente)
        response = self.client.post(self.url_actualizar, {
            'id_producto': self.producto.id_producto,
            'cantidad': 3
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['resultado']['cantidad'], 3)
        self.assertFalse(response.data['resultado']['eliminado'])

    def test_actualizar_cantidad_cero_elimina_producto(self):
        """Si la cantidad es 0, el producto se elimina del carrito."""
        from sales_app.services import agregar_producto_a_carrito
        agregar_producto_a_carrito(usuario=self.cliente, id_producto=self.producto.id_producto, cantidad=2)

        self.client.force_authenticate(user=self.cliente)
        response = self.client.post(self.url_actualizar, {
            'id_producto': self.producto.id_producto,
            'cantidad': 0
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['resultado']['eliminado'])
        self.assertEqual(response.data['resultado']['cantidad'], 0)

    def test_actualizar_superando_stock_retorna_400(self):
        """Si la cantidad excede el stock disponible (10 unidades), retorna error 400."""
        self.client.force_authenticate(user=self.cliente)
        response = self.client.post(self.url_actualizar, {
            'id_producto': self.producto.id_producto,
            'cantidad': 99
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Sin stock suficiente", str(response.data))







from rest_framework.test import APITestCase

class CompraInvitadoValidacionesTestCase(APITestCase):
    """Pruebas de validación de datos para la compra de invitados (CU-18)."""

    def setUp(self):
        from catalog_app.models import CategoriaProducto, Producto
        from inventory_app.models import Stock, MovimientoStock
        from sales_app.models import MedioPago
        from users_app.models import RolUsuario
        from decimal import Decimal
        from django.utils import timezone

        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            id_rol=1,
            defaults={'nombre_rol': 'Cliente', 'codigo': 'CLI', 'descripcion': 'Rol cliente'}
        )
        self.categoria, _ = CategoriaProducto.objects.get_or_create(
            id_categoria=1,
            defaults={'nombre': 'Accesorios', 'descripcion': 'Accesorios varios', 'estado': True}
        )
        self.producto = Producto.objects.create(
            nombre="Cable USB-C Test Invitado",
            descripcion="Cable de datos",
            precio_venta=Decimal('1500.00'),
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.categoria
        )
        self.stock = Stock.objects.create(
            id_producto=self.producto,
            stock_minimo=1
        )
        MovimientoStock.objects.create(
            id_stock=self.stock,
            tipo_movimiento='ingreso',
            cantidad=10,
            fecha=timezone.now().date(),
            motivo="Stock para test invitado",
            uso_taller=False
        )
        self.medio_pago, _ = MedioPago.objects.get_or_create(
            id_mediopago=99,
            defaults={'nombre_medio_pago': 'Efectivo Mostrador Test', 'estado': True, 'recargo': Decimal('0.00')}
        )

    def test_compra_invitado_sin_dni_falla_validacion(self):
        """Verifica que el DNI / CUIL sea estrictamente obligatorio para compras sin cuenta."""
        payload_sin_dni = {
            'items': [{'id_producto': self.producto.id_producto, 'cantidad': 1}],
            'metodo_entrega': 'RETIRO',
            'metodo_pago': self.medio_pago.id_mediopago,
            'nombre_contacto': 'Pedro Invitado',
            'email_contacto': 'pedro.invitado@test.com',
            'telefono_contacto': '+5491122334455',
            'dni_contacto': ''
        }
        res = self.client.post('/api/sales/compras/invitado/', payload_sin_dni, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('dni_contacto', res.data)

    def test_compra_invitado_con_dni_valido_exito(self):
        """Verifica que con DNI / CUIL ingresado la compra se registre exitosamente (201)."""
        payload_valido = {
            'items': [{'id_producto': self.producto.id_producto, 'cantidad': 1}],
            'metodo_entrega': 'RETIRO',
            'metodo_pago': self.medio_pago.id_mediopago,
            'nombre_contacto': 'Pedro Invitado',
            'email_contacto': 'pedro.invitado@test.com',
            'telefono_contacto': '+5491122334455',
            'dni_contacto': '38123456'
        }
        res = self.client.post('/api/sales/compras/invitado/', payload_valido, format='json')
        self.assertEqual(res.status_code, 201, msg=str(res.data))
        self.assertIn('venta', res.data)
        self.assertEqual(res.data['venta']['estado_venta'], 'PENDIENTE')


# ==============================================================================
# PRUEBAS UNITARIAS: MOTOR INTELIGENTE DE BENEFICIOS Y FIDELIZACIÓN
# ==============================================================================

class MotorBeneficiosInteligenteTestCase(TestCase):
    """
    Pruebas unitarias para el motor autónomo de beneficios, acumulabilidad,
    topes de descuento, canje y reversión justa ante cancelaciones.
    """

    def setUp(self):
        from users_app.models import Usuario, RolUsuario
        from catalog_app.models import Producto, CategoriaProducto, Marca, ModeloDispositivo, TipoDispositivo
        from core_app.models import ConfiguracionSistema
        from sales_app.models import MedioPago

        self.rol_cliente, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Rol cliente'}
        )
        self.cliente = Usuario.objects.create(
            email='cliente_motor@test.com',
            contrasena='hash123',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date()
        )

        self.tipo_dev, _ = TipoDispositivo.objects.get_or_create(
            id_tipo_dispositivo=999,
            defaults={'nombre': 'Smartphone', 'estado_activo': True}
        )
        self.marca, _ = Marca.objects.get_or_create(
            id_marca=999,
            defaults={'nombre': 'Motorola', 'estado_activo': True}
        )
        self.modelo, _ = ModeloDispositivo.objects.get_or_create(
            id_modelo=999,
            defaults={'nombre': 'Moto G52', 'estado_activo': True, 'id_marca': self.marca, 'id_tipo_dispositivo': self.tipo_dev}
        )
        self.categoria, _ = CategoriaProducto.objects.get_or_create(
            id_categoria=999,
            defaults={'nombre': 'Accesorios', 'descripcion': 'Accesorios', 'estado': True}
        )

        self.producto = Producto.objects.create(
            nombre='Funda Protectora Moto G52',
            precio_venta=Decimal('10000.00'),
            id_categoria=self.categoria,
            id_modelo=self.modelo,
            estado=True,
            apto_venta=True,
            apto_reparacion=False,
            apto_consumible=False,
            modulo_automatico=False
        )

        # Configuraciones maestras
        ConfiguracionSistema.objects.update_or_create(
            clave='motorBeneficiosActivo',
            defaults={'valor': 'True'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='porcentajeDescuentoMaximo',
            defaults={'valor': '15.0'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='limitePromocionesMensual',
            defaults={'valor': '50'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='periodoRefrigerioCliente',
            defaults={'valor': '0'} # En test desactivamos cooldown temporal para evaluar llamadas consecutivas
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='vigenciaBeneficioDefecto',
            defaults={'valor': '72.0'}
        )

    def test_generar_beneficio_respeta_tope_maximo_y_producto_opcional(self):
        """Verifica que si se solicita un descuento mayor al tope, se recorte a porcentajeDescuentoMaximo y acepte id_producto=None."""
        from sales_app.services import generar_beneficio_cliente

        beneficio = generar_beneficio_cliente(
            usuario_destinatario=self.cliente,
            motivo='Prueba de fidelización',
            por_desc=Decimal('30.00'), # Mayor al 15% configurado
            id_producto=None
        )
        self.assertIsNotNone(beneficio)
        self.assertIsNone(beneficio.id_producto)
        self.assertEqual(beneficio.por_desc, Decimal('15.00')) # Recortado al tope seguro
        self.assertEqual(beneficio.estado, 'ACTIVO')

    def test_generar_beneficio_motor_inactivo_aborta_pacíficamente(self):
        """Verifica que si motorBeneficiosActivo es False, no se emite ningún beneficio."""
        from core_app.models import ConfiguracionSistema
        from sales_app.services import generar_beneficio_cliente

        ConfiguracionSistema.objects.filter(clave='motorBeneficiosActivo').update(valor='False')

        beneficio = generar_beneficio_cliente(
            usuario_destinatario=self.cliente,
            motivo='No debe emitirse',
            por_desc=Decimal('10.00')
        )
        self.assertIsNone(beneficio)

    def test_aplicacion_acumulada_y_canje_en_venta(self):
        """Verifica la acumulación de múltiples beneficios en una venta y su marcado a CANJEADO."""
        from sales_app.models import Venta, DetalleVenta
        from sales_app.services import (
            generar_beneficio_cliente,
            aplicar_y_canjear_beneficios_en_venta
        )

        b1 = generar_beneficio_cliente(
            usuario_destinatario=self.cliente,
            motivo='Cupón específico accesorio',
            por_desc=Decimal('10.00'),
            id_producto=self.producto
        )
        b2 = generar_beneficio_cliente(
            usuario_destinatario=self.cliente,
            motivo='Cupón general',
            por_desc=Decimal('5.00'),
            id_producto=None
        )

        venta = Venta.objects.create(
            id_usuario=self.cliente,
            metodo_entrega='RETIRO',
            fecha_venta=timezone.now().date(),
            estado_venta='PENDIENTE',
            monto_subtotal=Decimal('10000.00'),
            costo_envio=Decimal('0.00')
        )
        DetalleVenta.objects.create(
            id_venta=venta,
            id_producto=self.producto,
            cantidad=1,
            precio_unitario=Decimal('10000.00'),
            subtotal=Decimal('10000.00')
        )

        res = aplicar_y_canjear_beneficios_en_venta(
            venta=venta,
            lista_id_beneficios=[b1.id_beneficio, b2.id_beneficio]
        )

        # Descuento b1: 10% de $10.000 = $1.000
        # Descuento b2: 5% de $10.000 = $500
        # Total descuento = $1.500 -> Nuevo subtotal = $8.500
        self.assertEqual(res['descuento_total'], Decimal('1500.00'))
        self.assertEqual(res['nuevo_subtotal'], Decimal('8500.00'))

        venta.refresh_from_db()
        self.assertEqual(venta.monto_subtotal, Decimal('8500.00'))

        b1.refresh_from_db()
        b2.refresh_from_db()
        self.assertEqual(b1.tiempo_disp, Decimal('0.00'))
        self.assertIn('[CANJEADO - Venta #', b1.motivo)
        self.assertEqual(b1.estado, 'REVOCADO')

    def test_reversion_justa_al_cancelar_venta(self):
        """Verifica que al cancelar una venta, los cupones canjeados se restauren a ACTIVO con sus horas remanentes."""
        from sales_app.models import Venta, DetalleVenta
        from sales_app.services import (
            generar_beneficio_cliente,
            aplicar_y_canjear_beneficios_en_venta,
            revertir_beneficios_de_venta_cancelada
        )

        b = generar_beneficio_cliente(
            usuario_destinatario=self.cliente,
            motivo='Cupón para compra cancelada',
            por_desc=Decimal('10.00'),
            id_producto=self.producto,
            tiempo_disp_horas=Decimal('48.00')
        )

        venta = Venta.objects.create(
            id_usuario=self.cliente,
            metodo_entrega='RETIRO',
            fecha_venta=timezone.now().date(),
            estado_venta='PENDIENTE',
            monto_subtotal=Decimal('10000.00'),
            costo_envio=Decimal('0.00')
        )
        DetalleVenta.objects.create(
            id_venta=venta,
            id_producto=self.producto,
            cantidad=1,
            precio_unitario=Decimal('10000.00'),
            subtotal=Decimal('10000.00')
        )

        aplicar_y_canjear_beneficios_en_venta(venta=venta, lista_id_beneficios=[b.id_beneficio])
        b.refresh_from_db()
        self.assertEqual(b.tiempo_disp, Decimal('0.00'))

        # Cancelar y revertir
        revertidos = revertir_beneficios_de_venta_cancelada(venta=venta)
        self.assertEqual(revertidos, 1)

        b.refresh_from_db()
        self.assertEqual(b.tiempo_disp, Decimal('48.00'))
        self.assertNotIn('[CANJEADO', b.motivo)
        self.assertEqual(b.estado, 'ACTIVO')

    def test_consumidor_final_no_recibe_beneficios(self):
        """
        Verifica rigurosamente que el usuario consumidorfinal@ifixpos.com
        está completamente excluido de recibir o canjear beneficios comerciales en el sistema.
        """
        from sales_app.services import (
            _obtener_o_crear_consumidor_final,
            generar_beneficio_cliente,
            evaluar_beneficio_durante_carrito,
            evaluar_beneficio_post_compra,
            aplicar_y_canjear_beneficios_en_venta
        )
        from sales_app.selectors import (
            obtener_beneficios_activos_cliente,
            obtener_beneficios_activos_usuario,
            obtener_historial_beneficios_cliente
        )
        from sales_app.models import Beneficio, Venta, DetalleVenta, CarritoCompra, CarritoProducto

        consumidor = _obtener_o_crear_consumidor_final()

        # 1. Emisión directa bloqueada
        b_directo = generar_beneficio_cliente(
            usuario_destinatario=consumidor,
            motivo="Intento de beneficio a consumidor final",
            por_desc=Decimal('10.00'),
            id_producto=self.producto
        )
        self.assertIsNone(b_directo)

        # 2. Evaluación durante carrito bloqueada
        carrito = CarritoCompra.objects.create(id_usuario=consumidor, estado='activo', fecha_creacion=timezone.now().date())
        item_c = CarritoProducto.objects.create(id_carrito=carrito, id_producto=self.producto, cantidad=1)
        b_carrito = evaluar_beneficio_durante_carrito(
            id_usuario=consumidor.id_usuario,
            items_carrito=[item_c]
        )
        self.assertEqual(b_carrito, [])

        # 3. Evaluación post-compra bloqueada
        venta_cf = Venta.objects.create(
            id_usuario=consumidor,
            metodo_entrega='MOSTRADOR',
            fecha_venta=timezone.now().date(),
            estado_venta='PAGADA',
            monto_subtotal=Decimal('5000.00'),
            costo_envio=Decimal('0.00')
        )
        b_post_compra = evaluar_beneficio_post_compra(venta=venta_cf)
        self.assertIsNone(b_post_compra)

        # 4. Verificación de cero beneficios persistidos para el consumidor final
        total_beneficios_cf = Beneficio.objects.filter(
            id_usuario__email__iexact='consumidorfinal@ifixpos.com'
        ).count()
        self.assertEqual(total_beneficios_cf, 0)

        # 5. Selectors devuelven vacío para consumidor final
        self.assertEqual(obtener_beneficios_activos_cliente(consumidor.id_usuario), [])
        self.assertEqual(obtener_beneficios_activos_usuario(consumidor.id_usuario), {})
        self.assertEqual(obtener_historial_beneficios_cliente(consumidor.id_usuario).count(), 0)

        # 6. Intentar canjear en venta es rechazado de inmediato
        res_canje = aplicar_y_canjear_beneficios_en_venta(
            venta=venta_cf,
            lista_id_beneficios=[99999]
        )
        self.assertEqual(res_canje['descuento_total'], Decimal('0.00'))
        self.assertEqual(res_canje['beneficios_canjeados'], [])
