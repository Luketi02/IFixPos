import json
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from purchases_app.models import (
    Proveedor,
    SolicitudCotizacion,
    SolicitudCotizacionProducto,
    InvitacionCotizar,
    Cotizacion,
    CotizacionProducto,
    OrdenCompra,
    DetalleOrdenCompra,
    RegistroCompra
)
from catalog_app.models import CategoriaProducto, Producto
from geo_app.models import Pais, Provincia, Ciudad, Direccion
from users_app.models import Usuario, RolUsuario
from core_app.models import LogSistema


class RegistrarProveedorTestCase(TestCase):
    """
    Pruebas unitarias e integración para el CU-24: Registrar Proveedor.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
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

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.prov@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.prov@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente.prov@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Geografía
        self.pais = Pais.objects.create(nombre_pais="Argentina", cobertura_habilitada=True)
        self.provincia = Provincia.objects.create(nombre_provincia="Buenos Aires", cobertura_habilitada=True, id_pais=self.pais)
        self.ciudad = Ciudad.objects.create(nombre_ciudad="CABA", cobertura_habilitada=True, id_provincia=self.provincia)

        self.payload_valido = {
            "nombre": "Distribuidora Tech SA",
            "cuit": "30-71234567-9",
            "correo": "contacto@distribuidoratech.com",
            "telefono": "+54 11 4455-6677",
            "direccion": {
                "calle": "Av. Corrientes",
                "numero": "1234",
                "ciudad": self.ciudad.id_ciudad,
                "barrio": "Balvanera",
                "piso": 2,
                "dpto": "A"
            },
            "ofrece_envio": True,
            "indice_confiabilidad": "9.50",
            "tiempo_promedio_entrega": 3,
            "nivel": "Mayorista"
        }

    def test_registrar_proveedor_exitoso_ruta_dedicada(self):
        """Paso 1 a 8: Administrador registra formalmente un nuevo proveedor con dirección y estado Activo."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/proveedores/registrar/'

        response = self.client.post(url, data=self.payload_valido, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data.get('mensaje'), "Proveedor registrado exitosamente.")

        data_prov = response.data.get('proveedor', {})
        self.assertEqual(data_prov.get('cuit_prov'), "30-71234567-9")
        self.assertEqual(data_prov.get('nombre_proveedor'), "Distribuidora Tech SA")
        self.assertEqual(data_prov.get('correo'), "contacto@distribuidoratech.com")
        self.assertTrue(data_prov.get('estado'))
        self.assertIsNotNone(data_prov.get('direccion'))
        self.assertIn("Av. Corrientes 1234", data_prov['direccion'].get('nro_calle', ''))

        # Verificación en base de datos
        prov_db = Proveedor.objects.get(cuit_prov="30-71234567-9")
        self.assertEqual(prov_db.nombre_proveedor, "Distribuidora Tech SA")
        self.assertTrue(prov_db.estado)
        self.assertIsNotNone(prov_db.id_direccion)
        self.assertEqual(prov_db.id_direccion.id_ciudad, self.ciudad)

        # Auditoría en LogSistema
        log = LogSistema.objects.filter(
            id_usuario=self.admin,
            accion__icontains="CU-24"
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn("30-71234567-9", log.detalle)
        self.assertIn("Distribuidora Tech SA", log.detalle)

    def test_registrar_proveedor_exitoso_ruta_base_post(self):
        """Verifica que POST en /api/purchases/proveedores/ también procese el alta de proveedor."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/proveedores/'

        response = self.client.post(url, data=self.payload_valido, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Proveedor.objects.filter(cuit_prov="30-71234567-9").exists())

    def test_registrar_proveedor_cuit_duplicado_retorna_400(self):
        """Excepción Paso 4: Si el CUIT ya existe en la base de datos, rechaza con 400."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/proveedores/registrar/'

        # Primer registro exitoso
        self.client.post(url, data=self.payload_valido, format='json')

        # Segundo intento con mismo CUIT pero distinto correo
        payload_dup = dict(self.payload_valido)
        payload_dup["correo"] = "otro.correo@tech.com"
        payload_dup["nombre"] = "Otra Razón Social"

        response = self.client.post(url, data=payload_dup, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ya se encuentra registrado", str(response.data))

    def test_registrar_proveedor_correo_duplicado_retorna_400(self):
        """Excepción Paso 4: Si el correo electrónico ya existe en la base de datos, rechaza con 400."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/proveedores/registrar/'

        # Primer registro exitoso
        self.client.post(url, data=self.payload_valido, format='json')

        # Segundo intento con distinto CUIT pero mismo correo
        payload_dup = dict(self.payload_valido)
        payload_dup["cuit"] = "30-99887766-5"
        payload_dup["nombre"] = "Sucursal Norte Tech"

        response = self.client.post(url, data=payload_dup, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ya se encuentra registrado", str(response.data))

    def test_registrar_proveedor_ciudad_inexistente_retorna_400(self):
        """Excepción Paso 4: Validación de existencia de la ciudad en la dirección."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/proveedores/registrar/'

        payload_error = dict(self.payload_valido)
        payload_error["direccion"] = dict(self.payload_valido["direccion"])
        payload_error["direccion"]["ciudad"] = 99999

        response = self.client.post(url, data=payload_error, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no existe en el sistema", str(response.data))

    def test_registrar_proveedor_campos_obligatorios_vacios_retorna_400(self):
        """Validación estricta de presencia de campos obligatorios en el InputSerializer."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/proveedores/registrar/'

        response = self.client.post(url, data={}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("nombre", response.data)
        self.assertIn("cuit", response.data)
        self.assertIn("correo", response.data)
        self.assertIn("telefono", response.data)
        self.assertIn("direccion", response.data)

    def test_registrar_proveedor_no_admin_denegado_403(self):
        """Precondición: Solo Administradores pueden empadronar proveedores."""
        self.client.force_authenticate(user=self.tecnico)
        url = '/api/purchases/proveedores/registrar/'

        response = self.client.post(url, data=self.payload_valido, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Probar con Cliente
        self.client.force_authenticate(user=self.cliente)
        response_cli = self.client.post(url, data=self.payload_valido, format='json')
        self.assertEqual(response_cli.status_code, status.HTTP_403_FORBIDDEN)

    def test_registrar_proveedor_sin_autenticar_retorna_401_o_403(self):
        """Peticiones anónimas son rechazadas."""
        url = '/api/purchases/proveedores/registrar/'

        response = self.client.post(url, data=self.payload_valido, format='json')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class ModificarProveedorTestCase(TestCase):
    """
    Pruebas unitarias e integración para el CU-28: Modificar Proveedor.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.modprov@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.modprov@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Geografía
        self.pais = Pais.objects.create(nombre_pais="Argentina", cobertura_habilitada=True)
        self.provincia = Provincia.objects.create(nombre_provincia="Córdoba", cobertura_habilitada=True, id_pais=self.pais)
        self.ciudad_cba = Ciudad.objects.create(nombre_ciudad="Córdoba Capital", cobertura_habilitada=True, id_provincia=self.provincia)
        self.ciudad_villa_maria = Ciudad.objects.create(nombre_ciudad="Villa María", cobertura_habilitada=True, id_provincia=self.provincia)

        # Dirección inicial
        self.direccion1 = Direccion.objects.create(
            id_usuario=None,
            id_ciudad=self.ciudad_cba,
            nro_calle="San Martín 500",
            nombre_barrio="Centro",
            is_active=True
        )

        # Proveedor 1
        self.prov1 = Proveedor.objects.create(
            cuit_prov="30-11223344-5",
            nombre_proveedor="Insumos del Centro SRL",
            correo="ventas@insumoscentro.com",
            telefono="0351-4433221",
            estado=True,
            ofrece_envio=True,
            indice_confiabilidad=Decimal('8.50'),
            tiempo_promedio_entrega=5,
            nivel="Distribuidor",
            id_direccion=self.direccion1
        )

        # Proveedor 2
        self.prov2 = Proveedor.objects.create(
            cuit_prov="30-99887766-1",
            nombre_proveedor="Mayorista Electrónica SA",
            correo="info@mayoristaelectrónica.com",
            telefono="011-55443322",
            estado=True,
            ofrece_envio=False,
            indice_confiabilidad=Decimal('9.00'),
            tiempo_promedio_entrega=2,
            nivel="Mayorista"
        )

    def test_modificar_proveedor_datos_contacto_exitoso(self):
        """Paso 1 a 7: Modificación exitosa de nombre, correo y teléfono."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/proveedores/{self.prov1.cuit_prov}/'
        payload = {
            "nombre": "Insumos del Centro y Asociados SRL",
            "correo": "nuevo.contacto@insumoscentro.com",
            "telefono": "0351-9988776"
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('mensaje'), "Proveedor modificado exitosamente.")
        self.assertEqual(response.data.get('proveedor', {}).get('nombre_proveedor'), "Insumos del Centro y Asociados SRL")

        self.prov1.refresh_from_db()
        self.assertEqual(self.prov1.nombre_proveedor, "Insumos del Centro y Asociados SRL")
        self.assertEqual(self.prov1.correo, "nuevo.contacto@insumoscentro.com")
        self.assertEqual(self.prov1.telefono, "0351-9988776")

        # Auditoría LogSistema
        log = LogSistema.objects.filter(
            id_usuario=self.admin,
            accion__icontains="CU-28"
        ).order_by('-id_log').first()
        self.assertIsNotNone(log)
        self.assertIn(self.prov1.cuit_prov, log.detalle)

    def test_modificar_proveedor_alternar_estado_soft_delete(self):
        """Verifica la baja lógica (Soft Delete: estado=False) y posterior reactivación."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/proveedores/{self.prov1.cuit_prov}/'

        # 1. Desactivar
        response_baja = self.client.patch(url, data={"estado": False}, format='json')
        self.assertEqual(response_baja.status_code, status.HTTP_200_OK)
        self.assertFalse(response_baja.data.get('proveedor', {}).get('estado'))

        self.prov1.refresh_from_db()
        self.assertFalse(self.prov1.estado)

        # 2. Reactivar
        response_alta = self.client.patch(url, data={"estado": True}, format='json')
        self.assertEqual(response_alta.status_code, status.HTTP_200_OK)
        self.assertTrue(response_alta.data.get('proveedor', {}).get('estado'))

        self.prov1.refresh_from_db()
        self.assertTrue(self.prov1.estado)

    def test_modificar_proveedor_direccion_existente(self):
        """Paso 3 y 7: Actualización de la dirección vinculada al proveedor."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/proveedores/{self.prov1.cuit_prov}/'
        payload = {
            "direccion": {
                "calle": "Bv. Chacabuco",
                "numero": "789",
                "ciudad": self.ciudad_villa_maria.id_ciudad,
                "barrio": "Nueva Córdoba",
                "piso": 1,
                "dpto": "B"
            }
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.direccion1.refresh_from_db()
        self.assertIn("Bv. Chacabuco 789", self.direccion1.nro_calle)
        self.assertEqual(self.direccion1.id_ciudad, self.ciudad_villa_maria)

    def test_modificar_proveedor_duplicidad_cuit_con_otro_retorna_400(self):
        """Excepción Paso 4: Si se intenta asignar el CUIT de otro proveedor existente, rechaza con 400."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/proveedores/{self.prov1.cuit_prov}/'

        # Intentar ponerle a prov1 el CUIT de prov2
        payload = {"cuit": self.prov2.cuit_prov}

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ya se encuentra registrado", str(response.data))

    def test_modificar_proveedor_mismo_cuit_propio_permitido(self):
        """Permite reenviar el mismo CUIT propio sin disparar falso positivo de duplicidad."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/proveedores/{self.prov1.cuit_prov}/'

        payload = {
            "cuit": self.prov1.cuit_prov,
            "nombre": "Insumos Renombrados"
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.prov1.refresh_from_db()
        self.assertEqual(self.prov1.nombre_proveedor, "Insumos Renombrados")

    def test_modificar_proveedor_inexistente_retorna_404(self):
        """Si el proveedor no existe en el sistema, retorna 404 Not Found."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/proveedores/99-00000000-0/'

        response = self.client.patch(url, data={"nombre": "Fantasma"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("No se encontró el proveedor", response.data.get('error', ''))

    def test_modificar_proveedor_no_admin_denegado_403(self):
        """Precondición: Solo Administradores pueden modificar proveedores."""
        self.client.force_authenticate(user=self.tecnico)
        url = f'/api/purchases/proveedores/{self.prov1.cuit_prov}/'

        response = self.client.patch(url, data={"nombre": "Intento Técnico"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_modificar_proveedor_sin_autenticar_retorna_401_o_403(self):
        """Peticiones anónimas son rechazadas."""
        url = f'/api/purchases/proveedores/{self.prov1.cuit_prov}/'

        response = self.client.patch(url, data={"nombre": "Intento Anónimo"}, format='json')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_modificar_proveedor_soporta_metodo_put(self):
        """Acepta método HTTP PUT además de PATCH."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/proveedores/{self.prov1.cuit_prov}/'

        response = self.client.put(url, data={"telefono": "0351-1111222"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.prov1.refresh_from_db()
        self.assertEqual(self.prov1.telefono, "0351-1111222")


# ==============================================================================
# CU-14: GENERAR SOLICITUD DE COTIZACIÓN (TESTS)
# ==============================================================================

class GenerarSolicitudCotizacionTestCase(TestCase):
    """
    Pruebas unitarias y de integración para el CU-14: Generar Solicitud de Cotización.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.cotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.cotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Categoría y Productos
        self.categoria = CategoriaProducto.objects.create(
            nombre="Repuestos de Pantalla",
            estado=True
        )
        self.producto1 = Producto.objects.create(
            nombre="Módulo OLED iPhone 13 Pro",
            descripcion="Pantalla Super Retina XDR",
            precio_venta=Decimal("120000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )
        self.producto2 = Producto.objects.create(
            nombre="Batería Original Samsung S22",
            descripcion="Batería Li-ion 3700mAh",
            precio_venta=Decimal("45000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )

        # Proveedores
        self.prov_activo_1 = Proveedor.objects.create(
            cuit_prov="30-11111111-1",
            nombre_proveedor="Mayorista Pantallas SA",
            correo="ventas@pantallas.com",
            telefono="011-4321-0001",
            estado=True
        )
        self.prov_activo_2 = Proveedor.objects.create(
            cuit_prov="30-22222222-2",
            nombre_proveedor="Distribuidora Baterías SRL",
            correo="contacto@baterias.com",
            telefono="011-4321-0002",
            estado=True
        )
        self.prov_inactivo = Proveedor.objects.create(
            cuit_prov="30-33333333-3",
            nombre_proveedor="Proveedor Suspendido SA",
            correo="baja@proveedor.com",
            telefono="011-4321-0003",
            estado=False
        )

        self.payload_valido = {
            "ids_proveedores": [self.prov_activo_1.cuit_prov, self.prov_activo_2.cuit_prov],
            "productos": [
                {
                    "id_producto": self.producto1.id_producto,
                    "cantidad_requerida": 10
                },
                {
                    "id_producto": self.producto2.id_producto,
                    "cantidad_requerida": 5
                }
            ],
            "guardar_como_borrador": False
        }

    def test_generar_solicitud_enviada_a_proveedores_exitoso(self):
        """Paso 1 a 10: Administrador genera y emite una solicitud con invitaciones y tokens únicos."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/solicitudes-cotizacion/generar/'

        response = self.client.post(url, data=self.payload_valido, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data.get('mensaje'), "Solicitud de cotización generada exitosamente.")

        data_sol = response.data.get('solicitud', {})
        id_solicitud = data_sol.get('id_solicitud')
        self.assertIsNotNone(id_solicitud)
        self.assertEqual(data_sol.get('estado'), "Enviada a Proveedores")

        # Verificar cabecera en BD
        sol_db = SolicitudCotizacion.objects.get(id_solicitud=id_solicitud)
        self.assertEqual(sol_db.estado_solicitud, SolicitudCotizacion.ESTADO_ENVIADA)

        # Verificar productos asociados
        items_db = list(sol_db.solicitudcotizacionproducto_set.all())
        self.assertEqual(len(items_db), 2)
        cantidades = {item.id_producto_id: item.cantidad for item in items_db}
        self.assertEqual(cantidades[self.producto1.id_producto], 10)
        self.assertEqual(cantidades[self.producto2.id_producto], 5)

        # Verificar invitaciones y cotizaciones generadas
        invitaciones = list(sol_db.invitacioncotizar_set.all())
        self.assertEqual(len(invitaciones), 2)
        for inv in invitaciones:
            self.assertIsNotNone(inv.token_acceso)
            self.assertTrue(len(inv.token_acceso) > 10)
            self.assertEqual(inv.estado_invitacion, InvitacionCotizar.ESTADO_PENDIENTE)
            # Cotización hija
            cot_hija = inv.cotizacion_set.first()
            self.assertIsNotNone(cot_hija)
            self.assertEqual(cot_hija.estado_cotizacion, Cotizacion.ESTADO_PENDIENTE)

        # Verificar log de auditoría
        log = LogSistema.objects.filter(
            accion="Generar Solicitud de Cotización (CU-14)",
            id_registro_afectado=str(id_solicitud)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("emitió la Solicitud de Cotización", log.detalle)

    def test_generar_solicitud_soporta_post_en_endpoint_base(self):
        """Permite invocar POST también en /api/purchases/solicitudes-cotizacion/."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/solicitudes-cotizacion/'

        response = self.client.post(url, data=self.payload_valido, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_generar_solicitud_guardar_como_borrador(self):
        """Excepción Paso 5: Al seleccionar 'guardar_como_borrador' se persiste en Borrador sin crear invitaciones."""
        self.client.force_authenticate(user=self.admin)
        payload = dict(self.payload_valido)
        payload['guardar_como_borrador'] = True

        response = self.client.post('/api/purchases/solicitudes-cotizacion/generar/', data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data_sol = response.data.get('solicitud', {})
        self.assertEqual(data_sol.get('estado'), "Borrador")

        sol_db = SolicitudCotizacion.objects.get(id_solicitud=data_sol.get('id_solicitud'))
        self.assertEqual(sol_db.estado_solicitud, SolicitudCotizacion.ESTADO_BORRADOR)
        # Sin invitaciones emitidas
        self.assertEqual(sol_db.invitacioncotizar_set.count(), 0)

        # Log en estado Borrador
        log = LogSistema.objects.filter(
            accion="Generar Solicitud de Cotización (CU-14)",
            id_registro_afectado=str(sol_db.id_solicitud)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("Borrador", log.detalle)

    def test_generar_solicitud_proveedor_inactivo_retorna_400(self):
        """Excepción Paso 4: Si algún proveedor seleccionado está inactivo, rechaza con 400 Bad Request."""
        self.client.force_authenticate(user=self.admin)
        payload = dict(self.payload_valido)
        payload['ids_proveedores'] = [self.prov_activo_1.cuit_prov, self.prov_inactivo.cuit_prov]

        response = self.client.post('/api/purchases/solicitudes-cotizacion/generar/', data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("inactivos", str(response.data.get('error', '')))

    def test_generar_solicitud_proveedor_inexistente_retorna_400(self):
        """Excepción Paso 4: Si algún proveedor no existe, rechaza con 400 Bad Request."""
        self.client.force_authenticate(user=self.admin)
        payload = dict(self.payload_valido)
        payload['ids_proveedores'] = [self.prov_activo_1.cuit_prov, "99-99999999-9"]

        response = self.client.post('/api/purchases/solicitudes-cotizacion/generar/', data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no existen", str(response.data.get('error', '')))

    def test_generar_solicitud_producto_inexistente_retorna_400(self):
        """Excepción Paso 4: Si el insumo no existe en el catálogo, interrumpe el proceso."""
        self.client.force_authenticate(user=self.admin)
        payload = dict(self.payload_valido)
        payload['productos'] = [{"id_producto": 999999, "cantidad_requerida": 2}]

        response = self.client.post('/api/purchases/solicitudes-cotizacion/generar/', data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no existe", str(response.data.get('error', '')))

    def test_generar_solicitud_sin_productos_retorna_400(self):
        """Validación: Lista de productos no puede estar vacía."""
        self.client.force_authenticate(user=self.admin)
        payload = dict(self.payload_valido)
        payload['productos'] = []

        response = self.client.post('/api/purchases/solicitudes-cotizacion/generar/', data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generar_solicitud_no_admin_denegado_403(self):
        """Precondición: Solo Administradores pueden generar solicitudes."""
        self.client.force_authenticate(user=self.tecnico)
        response = self.client.post('/api/purchases/solicitudes-cotizacion/generar/', data=self.payload_valido, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ==============================================================================
# CU-15: CONSULTAR SOLICITUD DE COTIZACIÓN (TESTS)
# ==============================================================================

class ConsultarSolicitudCotizacionTestCase(TestCase):
    """
    Pruebas unitarias y de integración para el CU-15: Consultar Solicitud de cotización.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.consultacotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.consultacotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Categoría y Producto
        self.categoria = CategoriaProducto.objects.create(nombre="Herramientas", estado=True)
        self.producto = Producto.objects.create(
            nombre="Estación de Soldar Baku",
            descripcion="Estación digital de calor",
            precio_venta=Decimal("75000.00"),
            estado=True,
            apto_venta=False,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )

        # Proveedor
        self.proveedor = Proveedor.objects.create(
            cuit_prov="30-44444444-4",
            nombre_proveedor="Herramientas Profesionales SA",
            correo="ventas@herramientas.com",
            telefono="011-5555-4444",
            estado=True
        )

        # Solicitud 1 (Enviada)
        self.solicitud1 = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_ENVIADA
        )
        self.item1 = SolicitudCotizacionProducto.objects.create(
            id_solicitud=self.solicitud1,
            id_producto=self.producto,
            cantidad=3
        )
        self.invitacion1 = InvitacionCotizar.objects.create(
            id_solicitud=self.solicitud1,
            cuit_prov=self.proveedor,
            token_acceso="token_seguro_prueba_12345",
            estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE
        )
        self.cotizacion1 = Cotizacion.objects.create(
            id_invitacion=self.invitacion1,
            tiempo_promesa=5,
            estado_cotizacion=Cotizacion.ESTADO_PENDIENTE,
            fecha_validez=timezone.now().date() + timezone.timedelta(days=20),
            comentarios="En espera de confirmación de stock",
            archivo_adjunto="https://storage.ifixpos.com/cotizaciones/cotiz_444.pdf"
        )

        # Solicitud 2 (Borrador)
        self.solicitud2 = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date() - timezone.timedelta(days=2),
            estado_solicitud=SolicitudCotizacion.ESTADO_BORRADOR
        )

    def test_listar_solicitudes_cotizacion_vacio(self):
        """Excepción Paso 2: Si no existen solicitudes, retorna lista vacía con status 200."""
        SolicitudCotizacion.objects.all().delete()
        self.client.force_authenticate(user=self.admin)

        response = self.client.get('/api/purchases/solicitudes-cotizacion/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_listar_solicitudes_cotizacion_exitoso(self):
        """Paso 1 a 3: Despliega listado histórico de solicitudes de cotización emitidas y en borrador."""
        self.client.force_authenticate(user=self.admin)

        response = self.client.get('/api/purchases/solicitudes-cotizacion/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 2)

        # Verificar atributos en el listado
        item_primero = response.data[0]
        self.assertIn('id_solicitud', item_primero)
        self.assertIn('fecha_emision', item_primero)
        self.assertIn('estado', item_primero)
        self.assertIn('total_proveedores', item_primero)
        self.assertIn('total_productos', item_primero)

    def test_consultar_detalle_solicitud_exitoso(self):
        """Paso 4: Exhibe la cabecera, lista detallada de insumos, proveedores y matriz de ofertas con tokens."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud1.id_solicitud}/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data.get('id_solicitud'), self.solicitud1.id_solicitud)
        self.assertEqual(data.get('estado'), "Enviada a Proveedores")

        # Lista de productos
        prods = data.get('productos', [])
        self.assertEqual(len(prods), 1)
        self.assertEqual(prods[0].get('nombre_producto'), self.producto.nombre)
        self.assertEqual(prods[0].get('cantidad_requerida'), 3)

        # Matriz de ofertas / cotizaciones
        cotizs = data.get('cotizaciones', [])
        self.assertEqual(len(cotizs), 1)
        oferta = cotizs[0]
        self.assertEqual(oferta.get('estado'), "Pendiente de Evaluación")
        self.assertIn("portal-proveedor/cotizar?token=", oferta.get('link_acceso', ''))
        self.assertEqual(oferta.get('comentarios'), "En espera de confirmación de stock")
        self.assertEqual(oferta['proveedor'].get('cuit'), self.proveedor.cuit_prov)

    def test_consultar_detalle_solicitud_inexistente_retorna_404(self):
        """Si la solicitud no existe, levanta 404 Not Found."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/solicitudes-cotizacion/999999/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("No se encontró la solicitud", response.data.get('error', ''))

    def test_consultar_solicitudes_no_admin_denegado_403(self):
        """Precondición: Solo Administradores pueden consultar solicitudes de cotización."""
        self.client.force_authenticate(user=self.tecnico)
        response = self.client.get('/api/purchases/solicitudes-cotizacion/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        url_detalle = f'/api/purchases/solicitudes-cotizacion/{self.solicitud1.id_solicitud}/'
        response_det = self.client.get(url_detalle)
        self.assertEqual(response_det.status_code, status.HTTP_403_FORBIDDEN)


# ==============================================================================
# CU-16: MODIFICAR SOLICITUD DE COTIZACIÓN (TESTS)
# ==============================================================================

class ModificarSolicitudCotizacionTestCase(TestCase):
    """
    Pruebas unitarias y de integración para el CU-16: Modificar Solicitud de Cotización.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.modcotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.modcotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Categoría y Productos
        self.categoria = CategoriaProducto.objects.create(nombre="Repuestos Varios", estado=True)
        self.prod1 = Producto.objects.create(
            nombre="Cámara Trasera iPhone 12",
            descripcion="Módulo dual cámara",
            precio_venta=Decimal("80000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )
        self.prod2 = Producto.objects.create(
            nombre="Pin de Carga Moto G20",
            descripcion="Módulo flex de carga",
            precio_venta=Decimal("15000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )

        # Proveedores
        self.prov_activo_1 = Proveedor.objects.create(
            cuit_prov="30-55555555-5",
            nombre_proveedor="Mayorista Óptico SA",
            correo="ventas@optico.com",
            telefono="011-5555-0001",
            estado=True
        )
        self.prov_activo_2 = Proveedor.objects.create(
            cuit_prov="30-66666666-6",
            nombre_proveedor="Distribuidora Flex SRL",
            correo="ventas@flex.com",
            telefono="011-6666-0002",
            estado=True
        )
        self.prov_inactivo = Proveedor.objects.create(
            cuit_prov="30-77777777-7",
            nombre_proveedor="Insumos Dados de Baja SA",
            correo="baja@insumos.com",
            telefono="011-7777-0003",
            estado=False
        )

        # Solicitud en estado Borrador
        self.solicitud_borrador = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_BORRADOR,
            sol_tec=False
        )
        SolicitudCotizacionProducto.objects.create(
            id_solicitud=self.solicitud_borrador,
            id_producto=self.prod1,
            cantidad=2
        )

        # Solicitud en estado Enviada a Proveedores
        self.solicitud_enviada = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_ENVIADA,
            sol_tec=False
        )

    def test_modificar_solicitud_mantener_borrador_exitoso(self):
        """Paso 1 a 7: Modifica la lista de insumos y proveedores manteniendo estado 'Borrador'."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud_borrador.id_solicitud}/modificar/'

        payload = {
            "ids_proveedores": [self.prov_activo_1.cuit_prov, self.prov_activo_2.cuit_prov],
            "productos": [
                {
                    "id_producto": self.prod2.id_producto,
                    "cantidad_requerida": 8
                }
            ],
            "emitir_solicitud": False
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('mensaje'), "Solicitud de cotización modificada exitosamente.")

        # Verificar en BD
        self.solicitud_borrador.refresh_from_db()
        self.assertEqual(self.solicitud_borrador.estado_solicitud, SolicitudCotizacion.ESTADO_BORRADOR)
        items = list(self.solicitud_borrador.solicitudcotizacionproducto_set.all())
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].id_producto_id, self.prod2.id_producto)
        self.assertEqual(items[0].cantidad, 8)

        # Log
        log = LogSistema.objects.filter(
            accion="Modificar Solicitud de Cotización (CU-16)",
            id_registro_afectado=str(self.solicitud_borrador.id_solicitud)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("modificó el borrador", log.detalle)

    def test_modificar_solicitud_y_emitir_a_proveedores_exitoso(self):
        """Paso 7: Al seleccionar 'emitir_solicitud' transiciona a 'Enviada' y despacha tokens a proveedores."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud_borrador.id_solicitud}/modificar/'

        payload = {
            "ids_proveedores": [self.prov_activo_1.cuit_prov, self.prov_activo_2.cuit_prov],
            "productos": [
                {
                    "id_producto": self.prod1.id_producto,
                    "cantidad_requerida": 15
                }
            ],
            "emitir_solicitud": True
        }

        response = self.client.put(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.solicitud_borrador.refresh_from_db()
        self.assertEqual(self.solicitud_borrador.estado_solicitud, SolicitudCotizacion.ESTADO_ENVIADA)

        # Invitaciones y cotizaciones creadas
        invitaciones = list(self.solicitud_borrador.invitacioncotizar_set.all())
        self.assertEqual(len(invitaciones), 2)
        for inv in invitaciones:
            self.assertIsNotNone(inv.token_acceso)
            self.assertEqual(inv.estado_invitacion, InvitacionCotizar.ESTADO_PENDIENTE)
            self.assertEqual(inv.cotizacion_set.count(), 1)

        # Log
        log = LogSistema.objects.filter(
            accion="Modificar Solicitud de Cotización (CU-16)",
            id_registro_afectado=str(self.solicitud_borrador.id_solicitud)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("emitió formalmente", log.detalle)

    def test_modificar_solicitud_no_borrador_bloqueada_retorna_400(self):
        """Excepción Paso 1: Si ya superó el estado de 'Borrador', bloquea la modificación con 400."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud_enviada.id_solicitud}/modificar/'

        payload = {
            "ids_proveedores": [self.prov_activo_1.cuit_prov],
            "productos": [{"id_producto": self.prod1.id_producto, "cantidad_requerida": 1}],
            "emitir_solicitud": False
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("superó la fase de borrador", response.data.get('error', ''))

    def test_modificar_solicitud_proveedor_inactivo_retorna_400(self):
        """Excepción Paso 4: Proveedor inactivo interrumpe el guardado."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud_borrador.id_solicitud}/modificar/'

        payload = {
            "ids_proveedores": [self.prov_activo_1.cuit_prov, self.prov_inactivo.cuit_prov],
            "productos": [{"id_producto": self.prod1.id_producto, "cantidad_requerida": 1}]
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("inactivos", response.data.get('error', ''))

    def test_modificar_solicitud_inexistente_retorna_404(self):
        """Solicitud no encontrada retorna 404 Not Found."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/solicitudes-cotizacion/999999/modificar/'

        payload = {
            "ids_proveedores": [self.prov_activo_1.cuit_prov],
            "productos": [{"id_producto": self.prod1.id_producto, "cantidad_requerida": 1}]
        }

        response = self.client.patch(url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_modificar_solicitud_no_admin_denegado_403(self):
        """Precondición: Solo Administrador puede modificar solicitudes."""
        self.client.force_authenticate(user=self.tecnico)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud_borrador.id_solicitud}/modificar/'
        response = self.client.patch(url, data={}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_modificar_solicitud_tecnica_amputar_insumo_restringido_400(self):
        """Comentarios CU-16: Bloquea amputar insumos determinados por el área técnica para la reparación."""
        sol_tecnica = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_BORRADOR,
            sol_tec=True
        )
        SolicitudCotizacionProducto.objects.create(
            id_solicitud=sol_tecnica,
            id_producto=self.prod1,
            cantidad=1
        )
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/solicitudes-cotizacion/{sol_tecnica.id_solicitud}/modificar/'

        # Intenta modificar dejando solo el prod2 y quitando el prod1 original
        payload = {
            "ids_proveedores": [self.prov_activo_1.cuit_prov],
            "productos": [{"id_producto": self.prod2.id_producto, "cantidad_requerida": 1}]
        }
        response = self.client.patch(url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("insumos técnicos", response.data.get('error', '').lower())


# ==============================================================================
# CU-17: ELIMINAR SOLICITUD DE COTIZACIÓN (TESTS)
# ==============================================================================

class EliminarSolicitudCotizacionTestCase(TestCase):
    """
    Pruebas unitarias y de integración para el CU-17: Eliminar Solicitud de Cotización.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.elimsotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.elimcotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Categoría y Producto
        self.categoria = CategoriaProducto.objects.create(nombre="Insumos Técnicos", estado=True)
        self.producto = Producto.objects.create(
            nombre="Pasta Térmica Arctic MX-4",
            descripcion="Compuesto térmico de alto rendimiento",
            precio_venta=Decimal("12000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=False,
            id_categoria=self.categoria
        )

        # Solicitud 1: Borrador normal eliminable
        self.solicitud_borrador_libre = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_BORRADOR,
            sol_tec=False
        )
        SolicitudCotizacionProducto.objects.create(
            id_solicitud=self.solicitud_borrador_libre,
            id_producto=self.producto,
            cantidad=4
        )

        # Solicitud 2: Borrador vinculado a reparación técnica (sol_tec = True)
        self.solicitud_borrador_tecnica = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_BORRADOR,
            sol_tec=True
        )

        # Solicitud 3: Enviada a proveedores (no borrador)
        self.solicitud_enviada = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_ENVIADA,
            sol_tec=False
        )

    def test_eliminar_solicitud_borrador_exitoso_ruta_dedicada(self):
        """Paso 1 a 5: Administrador elimina definitivamente un borrador libre en cascada."""
        self.client.force_authenticate(user=self.admin)
        id_sol = self.solicitud_borrador_libre.id_solicitud
        url = f'/api/purchases/solicitudes-cotizacion/{id_sol}/eliminar/'

        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        # Verificación en BD
        self.assertFalse(SolicitudCotizacion.objects.filter(id_solicitud=id_sol).exists())
        self.assertFalse(SolicitudCotizacionProducto.objects.filter(id_solicitud_id=id_sol).exists())

        # Log
        log = LogSistema.objects.filter(
            accion="Eliminar Solicitud de Cotización (CU-17)",
            id_registro_afectado=str(id_sol)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("eliminó definitivamente", log.detalle)

    def test_eliminar_solicitud_borrador_soporta_metodo_delete_canónico(self):
        """Soporta DELETE directo en /api/purchases/solicitudes-cotizacion/<id>/."""
        sol = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_BORRADOR,
            sol_tec=False
        )
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/solicitudes-cotizacion/{sol.id_solicitud}/'

        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(SolicitudCotizacion.objects.filter(id_solicitud=sol.id_solicitud).exists())

    def test_eliminar_solicitud_no_borrador_bloqueada_retorna_400(self):
        """Excepción Paso 2: Si ya fue enviada/cotizada, bloquea el borrado con 400 Bad Request."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud_enviada.id_solicitud}/eliminar/'

        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("superó la fase de borrador", response.data.get('error', ''))
        # No se elimina
        self.assertTrue(SolicitudCotizacion.objects.filter(id_solicitud=self.solicitud_enviada.id_solicitud).exists())

    def test_eliminar_solicitud_vinculada_a_reparacion_sol_tec_bloqueada_retorna_400(self):
        """Excepción Paso 2: Si sol_tec == True, prohíbe la eliminación para proteger el taller."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud_borrador_tecnica.id_solicitud}/eliminar/'

        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Insumos requeridos por el área técnica", response.data.get('error', ''))
        # No se elimina
        self.assertTrue(SolicitudCotizacion.objects.filter(id_solicitud=self.solicitud_borrador_tecnica.id_solicitud).exists())

    def test_eliminar_solicitud_inexistente_retorna_404(self):
        """Solicitud inexistente retorna 404 Not Found."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/solicitudes-cotizacion/999999/eliminar/'

        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_eliminar_solicitud_no_admin_denegado_403(self):
        """Precondición: Solo Administradores pueden eliminar solicitudes."""
        self.client.force_authenticate(user=self.tecnico)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud_borrador_libre.id_solicitud}/eliminar/'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ==============================================================================
# CU-25: RESPONDER SOLICITUD DE COTIZACIÓN (TESTS)
# ==============================================================================

class ResponderCotizacionTestCase(TestCase):
    """
    Pruebas unitarias y de integración para el CU-25: Responder Solicitud de Cotización.
    Valida el flujo seguro de interacción de proveedores externos mediante tokens unívocos.
    """

    def setUp(self):
        self.client = APIClient()

        # Categoría y Repuestos
        self.categoria = CategoriaProducto.objects.create(nombre="Repuestos Pantallas", estado=True)
        self.prod1 = Producto.objects.create(
            nombre="Módulo Pantalla OLED Samsung S21",
            descripcion="Pantalla original con marco",
            precio_venta=Decimal("120000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )
        self.prod2 = Producto.objects.create(
            nombre="Batería Original iPhone 11",
            descripcion="Batería 3110 mAh",
            precio_venta=Decimal("45000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )

        # Proveedores
        self.prov1 = Proveedor.objects.create(
            cuit_prov="30-88888888-8",
            nombre_proveedor="Pantallas y Repuestos SA",
            correo="ventas@pantallas.com",
            telefono="011-8888-1111",
            estado=True
        )
        self.prov2 = Proveedor.objects.create(
            cuit_prov="30-99999999-9",
            nombre_proveedor="Distribuidora Global Parts SRL",
            correo="ventas@globalparts.com",
            telefono="011-9999-2222",
            estado=True
        )

        # Solicitud de Cotización en estado Enviada a Proveedores
        self.solicitud = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_ENVIADA,
            sol_tec=False
        )

        # Ítems solicitados
        self.item_sol1 = SolicitudCotizacionProducto.objects.create(
            id_solicitud=self.solicitud,
            id_producto=self.prod1,
            cantidad=5
        )
        self.item_sol2 = SolicitudCotizacionProducto.objects.create(
            id_solicitud=self.solicitud,
            id_producto=self.prod2,
            cantidad=10
        )

        # Token seguro e Invitación Proveedor 1
        self.token_prov1 = "token_criptografico_seguro_prov1_abc123"
        self.invitacion1 = InvitacionCotizar.objects.create(
            id_solicitud=self.solicitud,
            cuit_prov=self.prov1,
            token_acceso=self.token_prov1,
            estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE
        )
        self.cotizacion1 = Cotizacion.objects.create(
            id_invitacion=self.invitacion1,
            tiempo_promesa=0,
            estado_cotizacion=Cotizacion.ESTADO_PENDIENTE,
            fecha_validez=timezone.now().date() + timezone.timedelta(days=15)
        )

        # Token seguro e Invitación Proveedor 2
        self.token_prov2 = "token_criptografico_seguro_prov2_def456"
        self.invitacion2 = InvitacionCotizar.objects.create(
            id_solicitud=self.solicitud,
            cuit_prov=self.prov2,
            token_acceso=self.token_prov2,
            estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE
        )
        self.cotizacion2 = Cotizacion.objects.create(
            id_invitacion=self.invitacion2,
            tiempo_promesa=0,
            estado_cotizacion=Cotizacion.ESTADO_PENDIENTE,
            fecha_validez=timezone.now().date() + timezone.timedelta(days=15)
        )

    def test_consultar_portal_proveedor_exitoso_get(self):
        """Paso 1, 2 y 3: Proveedor accede por enlace seguro y consulta insumos a cotizar sin login."""
        url = f'/api/purchases/cotizar/{self.token_prov1}/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data.get('id_solicitud'), self.solicitud.id_solicitud)
        self.assertEqual(data.get('estado_solicitud'), "Enviada a Proveedores")
        self.assertEqual(data['proveedor'].get('cuit'), self.prov1.cuit_prov)

        # Lista de repuestos solicitados
        prods = data.get('productos_solicitados', [])
        self.assertEqual(len(prods), 2)
        self.assertEqual(prods[0].get('id_producto'), self.prod1.id_producto)
        self.assertEqual(prods[0].get('cantidad_requerida'), 5)
        self.assertEqual(prods[1].get('id_producto'), self.prod2.id_producto)
        self.assertEqual(prods[1].get('cantidad_requerida'), 10)

    def test_consultar_portal_token_inexistente_retorna_403(self):
        """Excepción Paso 2: Si el token no existe, bloquea el acceso con 403 Forbidden."""
        url = '/api/purchases/cotizar/token_falso_inexistente_999/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("inválido o ha expirado", response.data.get('error', ''))

    def test_consultar_portal_solicitud_no_vigente_retorna_400(self):
        """Excepción Paso 2: Si la solicitud no está en estado 'Enviada', bloquea con 400."""
        self.solicitud.estado_solicitud = SolicitudCotizacion.ESTADO_BORRADOR
        self.solicitud.save()

        url = f'/api/purchases/cotizar/{self.token_prov1}/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no se encuentra vigente", response.data.get('error', ''))

    def test_responder_cotizacion_cotizar_exitoso_multipart(self):
        """
        Paso 4 a 9: Proveedor envía su propuesta formal con precios desglosados, plazo,
        validez y archivo PDF de respaldo.
        """
        url = f'/api/purchases/cotizar/{self.token_prov1}/responder/'

        pdf_dummy = SimpleUploadedFile(
            "presupuesto_formal_samsung.pdf",
            b"%PDF-1.4 Presupuesto Formal Oficial",
            content_type="application/pdf"
        )
        fecha_futura = (timezone.now().date() + timezone.timedelta(days=30)).isoformat()

        items_payload = [
            {"id_producto": self.prod1.id_producto, "precio_ofrecido": "95500.00"},
            {"id_producto": self.prod2.id_producto, "precio_ofrecido": "38200.50"}
        ]

        payload = {
            "accion": "COTIZAR",
            "plazo_entrega": 5,
            "fecha_validez": fecha_futura,
            "comentarios": "Valores sujetos a variaciones del dólar oficial",
            "archivo_adjunto": pdf_dummy,
            "items": json.dumps(items_payload)
        }

        response = self.client.post(url, data=payload, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("enviada exitosamente", response.data.get('mensaje', ''))

        # Verificación de persistencia en Cotizacion
        self.cotizacion1.refresh_from_db()
        self.assertEqual(self.cotizacion1.estado_cotizacion, Cotizacion.ESTADO_PENDIENTE)
        self.assertEqual(self.cotizacion1.tiempo_promesa, 5)
        self.assertEqual(str(self.cotizacion1.fecha_validez), fecha_futura)
        self.assertIn(".pdf", self.cotizacion1.archivo_adjunto)

        # Verificación de ítems numéricos congelados en CotizacionProducto
        items_db = list(self.cotizacion1.cotizacionproducto_set.order_by('id_producto'))
        self.assertEqual(len(items_db), 2)
        self.assertEqual(items_db[0].id_producto_id, self.prod1.id_producto)
        self.assertEqual(items_db[0].precio_ofrecido, Decimal("95500.00"))
        self.assertEqual(items_db[1].id_producto_id, self.prod2.id_producto)
        self.assertEqual(items_db[1].precio_ofrecido, Decimal("38200.50"))

        # Verificación de invalidación del token y estado de invitación
        self.invitacion1.refresh_from_db()
        self.assertEqual(self.invitacion1.estado_invitacion, InvitacionCotizar.ESTADO_COTIZADA)
        self.assertIsNone(self.invitacion1.token_acceso)

        # Verificación de cambio de estado en la solicitud maestra (Paso 9 / Comentarios)
        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado_solicitud, SolicitudCotizacion.ESTADO_COTIZADA)

        # Auditoría LogSistema
        log = LogSistema.objects.filter(
            accion="Responder Solicitud de Cotización (CU-25)",
            id_registro_afectado=str(self.cotizacion1.id_cotizacion)
        ).first()
        self.assertIsNotNone(log)
        self.assertIsNone(log.id_usuario)
        self.assertIn("envió su cotización", log.detalle)

    def test_token_ya_utilizado_queda_invalido_retorna_403(self):
        """Paso 9: El token se destruye impidiendo alteraciones futuras (403 Forbidden)."""
        url = f'/api/purchases/cotizar/{self.token_prov1}/responder/'
        pdf_dummy = SimpleUploadedFile("presupuesto.pdf", b"%PDF-1.4 Cotiz", content_type="application/pdf")
        payload = {
            "accion": "COTIZAR",
            "plazo_entrega": 3,
            "fecha_validez": (timezone.now().date() + timezone.timedelta(days=10)).isoformat(),
            "archivo_adjunto": pdf_dummy,
            "items": json.dumps([{"id_producto": self.prod1.id_producto, "precio_ofrecido": "10000.00"}])
        }

        # Primera respuesta exitosa
        resp1 = self.client.post(url, data=payload, format='multipart')
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)

        # Segundo intento con el mismo token
        resp2 = self.client.post(url, data=payload, format='multipart')
        self.assertEqual(resp2.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("inválido o ha expirado", resp2.data.get('error', ''))

    def test_responder_cotizacion_declinar_exitoso(self):
        """Excepción Paso 4: Proveedor declina la solicitud ingresando motivo obligatorio."""
        url = f'/api/purchases/cotizar/{self.token_prov1}/responder/'
        payload = {
            "accion": "DECLINAR",
            "comentarios": "No contamos con stock de pantallas en este trimestre."
        }

        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("declinado la solicitud", response.data.get('mensaje', ''))

        # Verificación en BD
        self.cotizacion1.refresh_from_db()
        self.assertEqual(self.cotizacion1.estado_cotizacion, Cotizacion.ESTADO_RECHAZADA)
        self.assertEqual(self.cotizacion1.comentarios, "No contamos con stock de pantallas en este trimestre.")

        self.invitacion1.refresh_from_db()
        self.assertEqual(self.invitacion1.estado_invitacion, InvitacionCotizar.ESTADO_RECHAZADA)
        self.assertIsNone(self.invitacion1.token_acceso)

        # Como el proveedor 2 todavía no respondió, la solicitud principal sigue en 'Enviada'
        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado_solicitud, SolicitudCotizacion.ESTADO_ENVIADA)

    def test_declinar_todos_los_proveedores_transiciona_solicitud_a_rechazada(self):
        """
        Excepción Paso 4 y Comentarios: Si TODOS los proveedores invitados declinan,
        la Solicitud de Cotización principal transiciona a 'Rechazada' (3).
        """
        url1 = f'/api/purchases/cotizar/{self.token_prov1}/responder/'
        url2 = f'/api/purchases/cotizar/{self.token_prov2}/responder/'

        # Proveedor 1 declina
        self.client.post(url1, data={"accion": "DECLINAR", "comentarios": "Sin stock prov 1."}, format='json')
        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado_solicitud, SolicitudCotizacion.ESTADO_ENVIADA)

        # Proveedor 2 declina (último restante)
        resp2 = self.client.post(url2, data={"accion": "DECLINAR", "comentarios": "Sin stock prov 2."}, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)

        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado_solicitud, SolicitudCotizacion.ESTADO_RECHAZADA)

    def test_cotizar_sin_archivo_pdf_retorna_400(self):
        """Excepción Paso 7: Falta de archivo adjunto PDF interrumpe el guardado."""
        url = f'/api/purchases/cotizar/{self.token_prov1}/responder/'
        payload = {
            "accion": "COTIZAR",
            "plazo_entrega": 4,
            "fecha_validez": (timezone.now().date() + timezone.timedelta(days=10)).isoformat(),
            "items": json.dumps([{"id_producto": self.prod1.id_producto, "precio_ofrecido": "10000.00"}])
        }

        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("archivo_adjunto", str(response.data))

    def test_cotizar_archivo_formato_invalido_no_pdf_retorna_400(self):
        """Excepción Paso 7: El archivo adjunto debe ser estrictamente un documento PDF."""
        url = f'/api/purchases/cotizar/{self.token_prov1}/responder/'
        archivo_txt = SimpleUploadedFile("presupuesto.txt", b"Texto plano", content_type="text/plain")
        payload = {
            "accion": "COTIZAR",
            "plazo_entrega": 4,
            "fecha_validez": (timezone.now().date() + timezone.timedelta(days=10)).isoformat(),
            "archivo_adjunto": archivo_txt,
            "items": json.dumps([{"id_producto": self.prod1.id_producto, "precio_ofrecido": "10000.00"}])
        }

        response = self.client.post(url, data=payload, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("documento PDF", str(response.data))

    def test_cotizar_fecha_validez_en_pasado_retorna_400(self):
        """Excepción Paso 7: La fecha de validez no puede ser anterior a la actual."""
        url = f'/api/purchases/cotizar/{self.token_prov1}/responder/'
        pdf_dummy = SimpleUploadedFile("presupuesto.pdf", b"%PDF-1.4", content_type="application/pdf")
        fecha_ayer = (timezone.now().date() - timezone.timedelta(days=1)).isoformat()

        payload = {
            "accion": "COTIZAR",
            "plazo_entrega": 4,
            "fecha_validez": fecha_ayer,
            "archivo_adjunto": pdf_dummy,
            "items": json.dumps([{"id_producto": self.prod1.id_producto, "precio_ofrecido": "10000.00"}])
        }

        response = self.client.post(url, data=payload, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("fecha actual", str(response.data))

    def test_cotizar_sin_plazo_entrega_retorna_400(self):
        """Excepción Paso 7: El plazo de entrega es obligatorio."""
        url = f'/api/purchases/cotizar/{self.token_prov1}/responder/'
        pdf_dummy = SimpleUploadedFile("presupuesto.pdf", b"%PDF-1.4", content_type="application/pdf")
        payload = {
            "accion": "COTIZAR",
            "fecha_validez": (timezone.now().date() + timezone.timedelta(days=10)).isoformat(),
            "archivo_adjunto": pdf_dummy,
            "items": json.dumps([{"id_producto": self.prod1.id_producto, "precio_ofrecido": "10000.00"}])
        }

        response = self.client.post(url, data=payload, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("plazo_entrega", str(response.data))

    def test_cotizar_todos_precios_en_cero_retorna_400(self):
        """Paso 7: Valida que al menos un producto haya sido cotizado con precio mayor a cero."""
        url = f'/api/purchases/cotizar/{self.token_prov1}/responder/'
        pdf_dummy = SimpleUploadedFile("presupuesto.pdf", b"%PDF-1.4", content_type="application/pdf")
        payload = {
            "accion": "COTIZAR",
            "plazo_entrega": 5,
            "fecha_validez": (timezone.now().date() + timezone.timedelta(days=10)).isoformat(),
            "archivo_adjunto": pdf_dummy,
            "items": json.dumps([
                {"id_producto": self.prod1.id_producto, "precio_ofrecido": "0.00"},
                {"id_producto": self.prod2.id_producto, "precio_ofrecido": "0.00"}
            ])
        }

        response = self.client.post(url, data=payload, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("precio mayor a cero", str(response.data))

    def test_declinar_sin_comentarios_retorna_400(self):
        """Excepción Paso 4: Declinar requiere justificación o comentario obligatorio."""
        url = f'/api/purchases/cotizar/{self.token_prov1}/responder/'
        payload = {
            "accion": "DECLINAR",
            "comentarios": "   "
        }

        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("comentario obligatorio", str(response.data))


# ==============================================================================
# CU-52: INSPECCIONAR COTIZACIONES (TESTS)
# ==============================================================================

class InspeccionarCotizacionesTestCase(TestCase):
    """
    Pruebas unitarias e integrales para CU-52: Inspeccionar Cotizaciones.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles y Usuarios
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )
        self.admin = Usuario.objects.create(
            email='admin.inspcotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.inspcotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Categoría y Producto
        self.categoria = CategoriaProducto.objects.create(nombre="Módulos Táctiles", estado=True)
        self.prod = Producto.objects.create(
            nombre="Táctil iPad 9na Gen",
            descripcion="Vidrio digitalizador",
            precio_venta=Decimal("35000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )

        # Proveedor
        self.prov = Proveedor.objects.create(
            cuit_prov="30-11112222-3",
            nombre_proveedor="Digital Parts SA",
            correo="ventas@digitalparts.com",
            telefono="011-4444-8888",
            estado=True
        )

        # Solicitud 1 con cotización
        self.solicitud_con_cotiz = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_COTIZADA,
            sol_tec=False
        )
        SolicitudCotizacionProducto.objects.create(
            id_solicitud=self.solicitud_con_cotiz,
            id_producto=self.prod,
            cantidad=4
        )
        self.invitacion = InvitacionCotizar.objects.create(
            id_solicitud=self.solicitud_con_cotiz,
            cuit_prov=self.prov,
            token_acceso=None,
            estado_invitacion=InvitacionCotizar.ESTADO_COTIZADA
        )
        self.cotizacion = Cotizacion.objects.create(
            id_invitacion=self.invitacion,
            tiempo_promesa=3,
            archivo_adjunto="cotizaciones/presupuesto_formal.pdf",
            estado_cotizacion=Cotizacion.ESTADO_PENDIENTE,
            comentarios="Valores con IVA incluido",
            fecha_validez=timezone.now().date() + timezone.timedelta(days=15)
        )
        CotizacionProducto.objects.create(
            id_cotizacion=self.cotizacion,
            id_producto=self.prod,
            precio_ofrecido=Decimal("28000.00")
        )

        # Solicitud 2 sin cotizaciones
        self.solicitud_vacia = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_ENVIADA,
            sol_tec=False
        )

    def test_listar_cotizaciones_por_solicitud_exitoso(self):
        """Paso 1, 2 y 3: Administrador consulta lista comparativa de ofertas de una solicitud."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud_con_cotiz.id_solicitud}/cotizaciones/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        oferta = response.data[0]
        self.assertEqual(oferta.get('id_cotizacion'), self.cotizacion.id_cotizacion)
        self.assertEqual(oferta['proveedor'].get('cuit'), self.prov.cuit_prov)
        self.assertEqual(oferta.get('tiempo_promesa'), 3)
        self.assertEqual(oferta.get('estado'), "Pendiente de Evaluación")
        # Monto total cotizado = 4 * 28000.00 = 112000.00
        self.assertEqual(Decimal(str(oferta.get('monto_total_cotizado'))), Decimal("112000.00"))

    def test_listar_cotizaciones_solicitud_sin_ofertas_retorna_404(self):
        """Excepción Paso 2: Si no existen cotizaciones recibidas para la solicitud, retorna 404."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud_vacia.id_solicitud}/cotizaciones/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("Aún no se han recibido cotizaciones", response.data.get('error', ''))

    def test_detalle_cotizacion_exitoso(self):
        """Paso 4 y 5: Despliega el expediente formal desglosado con subtotales y comentarios."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/cotizaciones/{self.cotizacion.id_cotizacion}/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data.get('id_cotizacion'), self.cotizacion.id_cotizacion)
        self.assertEqual(data.get('comentarios'), "Valores con IVA incluido")
        self.assertEqual(data['proveedor'].get('nombre'), self.prov.nombre_proveedor)

        items = data.get('items', [])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].get('nombre_producto'), self.prod.nombre)
        self.assertEqual(items[0].get('cantidad'), 4)
        self.assertEqual(Decimal(str(items[0].get('precio_unitario'))), Decimal("28000.00"))
        self.assertEqual(Decimal(str(items[0].get('subtotal'))), Decimal("112000.00"))
        self.assertEqual(Decimal(str(data.get('monto_total'))), Decimal("112000.00"))

    def test_detalle_cotizacion_inexistente_retorna_404(self):
        """Cotización no encontrada retorna 404 Not Found."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/cotizaciones/999999/'

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_inspeccionar_cotizaciones_requiere_admin_403(self):
        """Precondición: Solo Administrador puede inspeccionar cotizaciones."""
        self.client.force_authenticate(user=self.tecnico)
        url = f'/api/purchases/solicitudes-cotizacion/{self.solicitud_con_cotiz.id_solicitud}/cotizaciones/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ==============================================================================
# CU-53: EVALUAR COTIZACIÓN (TESTS)
# ==============================================================================

class EvaluarCotizacionTestCase(TestCase):
    """
    Pruebas unitarias e integrales para CU-53: Evaluar Cotización.
    """

    def setUp(self):
        self.client = APIClient()

        # Rol y Usuario Administrador
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )
        self.admin = Usuario.objects.create(
            email='admin.evalcotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.evalcotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Categoría y Repuesto
        self.categoria = CategoriaProducto.objects.create(nombre="Repuestos Baterías", estado=True)
        self.prod = Producto.objects.create(
            nombre="Batería Samsung A52",
            descripcion="Batería 4500mAh",
            precio_venta=Decimal("20000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )

        # Proveedor 1 y 2
        self.prov1 = Proveedor.objects.create(
            cuit_prov="30-33334444-5",
            nombre_proveedor="Baterías Directas SA",
            correo="ventas@batdirectas.com",
            telefono="011-3333-1111",
            estado=True
        )
        self.prov2 = Proveedor.objects.create(
            cuit_prov="30-55556666-7",
            nombre_proveedor="Importadora Baterías SRL",
            correo="ventas@importbat.com",
            telefono="011-5555-2222",
            estado=True
        )

        # Solicitud con 2 cotizaciones pendientes
        self.solicitud = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_COTIZADA,
            sol_tec=False
        )
        SolicitudCotizacionProducto.objects.create(
            id_solicitud=self.solicitud,
            id_producto=self.prod,
            cantidad=10
        )

        # Cotización 1
        self.inv1 = InvitacionCotizar.objects.create(
            id_solicitud=self.solicitud,
            cuit_prov=self.prov1,
            token_acceso=None,
            estado_invitacion=InvitacionCotizar.ESTADO_COTIZADA
        )
        self.cotiz1 = Cotizacion.objects.create(
            id_invitacion=self.inv1,
            tiempo_promesa=4,
            estado_cotizacion=Cotizacion.ESTADO_PENDIENTE,
            fecha_validez=timezone.now().date() + timezone.timedelta(days=20)
        )
        CotizacionProducto.objects.create(
            id_cotizacion=self.cotiz1,
            id_producto=self.prod,
            precio_ofrecido=Decimal("12000.00")
        )

        # Cotización 2
        self.inv2 = InvitacionCotizar.objects.create(
            id_solicitud=self.solicitud,
            cuit_prov=self.prov2,
            token_acceso=None,
            estado_invitacion=InvitacionCotizar.ESTADO_COTIZADA
        )
        self.cotiz2 = Cotizacion.objects.create(
            id_invitacion=self.inv2,
            tiempo_promesa=6,
            estado_cotizacion=Cotizacion.ESTADO_PENDIENTE,
            fecha_validez=timezone.now().date() + timezone.timedelta(days=20)
        )
        CotizacionProducto.objects.create(
            id_cotizacion=self.cotiz2,
            id_producto=self.prod,
            precio_ofrecido=Decimal("13500.00")
        )

    def test_aceptar_cotizacion_exitoso(self):
        """Paso 3 y 4: Administrador acepta cotización y convalida precios oficiales."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/cotizaciones/{self.cotiz1.id_cotizacion}/evaluar/'

        payload = {
            "accion": "ACEPTAR",
            "comentarios": "Excelente precio y plazo de entrega"
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.cotiz1.refresh_from_db()
        self.assertEqual(self.cotiz1.estado_cotizacion, Cotizacion.ESTADO_ACEPTADA)
        self.assertEqual(self.cotiz1.estado_nombre, "Aceptada")

        # Como cotiz2 sigue pendiente, la solicitud sigue en estado COTIZADA
        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado_solicitud, SolicitudCotizacion.ESTADO_COTIZADA)

        # Log
        log = LogSistema.objects.filter(
            accion="Evaluar Cotización (CU-53)",
            id_registro_afectado=str(self.cotiz1.id_cotizacion)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("Aceptada", log.detalle)

    def test_descartar_cotizacion_exitoso(self):
        """Excepción Paso 3: Administrador descarta cotización con justificación obligatoria/opcional."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/cotizaciones/{self.cotiz2.id_cotizacion}/evaluar/'

        payload = {
            "accion": "RECHAZAR",
            "comentarios": "Plazo de entrega excesivo y precio superior a la media"
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.cotiz2.refresh_from_db()
        self.assertEqual(self.cotiz2.estado_cotizacion, Cotizacion.ESTADO_DESCARTADA)
        self.assertEqual(self.cotiz2.comentarios, "Plazo de entrega excesivo y precio superior a la media")

    def test_evaluar_ultima_oferta_pendiente_cierra_solicitud_maestra(self):
        """
        Paso 6: Si todas las ofertas ya fueron evaluadas (Aceptadas o Rechazadas),
        transiciona automáticamente la Solicitud de Cotización a 'Cerrada/Evaluada'.
        """
        self.client.force_authenticate(user=self.admin)

        # Evaluar oferta 1: Aceptar
        url1 = f'/api/purchases/cotizaciones/{self.cotiz1.id_cotizacion}/evaluar/'
        self.client.patch(url1, data={"accion": "ACEPTAR"}, format='json')

        # Evaluar oferta 2: Descartar (última restante)
        url2 = f'/api/purchases/cotizaciones/{self.cotiz2.id_cotizacion}/evaluar/'
        resp2 = self.client.patch(url2, data={"accion": "RECHAZAR", "comentarios": "Precio alto"}, format='json')

        self.assertEqual(resp2.status_code, status.HTTP_200_OK)

        # Solicitud cerrada
        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado_solicitud, SolicitudCotizacion.ESTADO_CERRADA)
        self.assertEqual(self.solicitud.estado_nombre, "Cerrada/Evaluada")

    def test_evaluar_cotizacion_no_pendiente_retorna_400(self):
        """Precondición: Solo se pueden evaluar cotizaciones en estado Pendiente."""
        self.cotiz1.estado_cotizacion = Cotizacion.ESTADO_ACEPTADA
        self.cotiz1.save()

        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/cotizaciones/{self.cotiz1.id_cotizacion}/evaluar/'

        response = self.client.patch(url, data={"accion": "ACEPTAR"}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Solo es posible evaluar cotizaciones en estado 'Pendiente", response.data.get('error', ''))

    def test_evaluar_cotizacion_no_admin_denegado_403(self):
        """Precondición: Solo Administrador puede evaluar cotizaciones."""
        self.client.force_authenticate(user=self.tecnico)
        url = f'/api/purchases/cotizaciones/{self.cotiz1.id_cotizacion}/evaluar/'
        response = self.client.patch(url, data={"accion": "ACEPTAR"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ==============================================================================
# CU-54: GENERAR ORDEN DE COMPRA (TESTS)
# ==============================================================================

class GenerarOrdenCompraTestCase(TestCase):
    """
    Pruebas unitarias e integrales para CU-54: Generar Orden de Compra.
    """

    def setUp(self):
        self.client = APIClient()

        # Rol y Usuario
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )
        self.admin = Usuario.objects.create(
            email='admin.genorden@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.genorden@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Categoría y Repuestos
        self.categoria = CategoriaProducto.objects.create(nombre="Herramientas y Repuestos", estado=True)
        self.prod1 = Producto.objects.create(
            nombre="Destornillador Precision Torx",
            descripcion="Set de puntas magnéticas",
            precio_venta=Decimal("15000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )
        self.prod2 = Producto.objects.create(
            nombre="Flux Amtech 559",
            descripcion="Jeringa de flux para soldadura SMD",
            precio_venta=Decimal("8000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=True,
            id_categoria=self.categoria
        )
        self.prod_sin_oferta = Producto.objects.create(
            nombre="Osciloscopio Digital Hantek",
            descripcion="Osciloscopio 100MHz",
            precio_venta=Decimal("350000.00"),
            estado=True,
            apto_venta=False,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=False,
            id_categoria=self.categoria
        )

        # Proveedor 1 (Con envío, mejor precio para prod1)
        self.prov1 = Proveedor.objects.create(
            cuit_prov="30-77778888-9",
            nombre_proveedor="Herramientas Express SA",
            correo="ventas@herramientasexpress.com",
            telefono="011-7777-1111",
            ofrece_envio=True,
            estado=True
        )

        # Proveedor 2 (Sin envío, mejor precio para prod2)
        self.prov2 = Proveedor.objects.create(
            cuit_prov="30-88889999-0",
            nombre_proveedor="Química de Soldadura SRL",
            correo="ventas@quimicasoldadura.com",
            telefono="011-8888-2222",
            ofrece_envio=False,
            estado=True
        )

        # Cotizaciones ACEPTADAS y vigentes
        sol = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_CERRADA,
            sol_tec=False
        )

        # Oferta Prov 1 para prod1 ($7,000) y prod2 ($5,500)
        inv1 = InvitacionCotizar.objects.create(id_solicitud=sol, cuit_prov=self.prov1, estado_invitacion=1)
        cot1 = Cotizacion.objects.create(
            id_invitacion=inv1,
            tiempo_promesa=2,
            estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            fecha_validez=timezone.now().date() + timezone.timedelta(days=30)
        )
        CotizacionProducto.objects.create(id_cotizacion=cot1, id_producto=self.prod1, precio_ofrecido=Decimal("7000.00"))
        CotizacionProducto.objects.create(id_cotizacion=cot1, id_producto=self.prod2, precio_ofrecido=Decimal("5500.00"))

        # Oferta Prov 2 para prod1 ($7,500) y prod2 ($4,000 - mejor precio para prod2)
        inv2 = InvitacionCotizar.objects.create(id_solicitud=sol, cuit_prov=self.prov2, estado_invitacion=1)
        cot2 = Cotizacion.objects.create(
            id_invitacion=inv2,
            tiempo_promesa=1,
            estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            fecha_validez=timezone.now().date() + timezone.timedelta(days=30)
        )
        CotizacionProducto.objects.create(id_cotizacion=cot2, id_producto=self.prod1, precio_ofrecido=Decimal("7500.00"))
        CotizacionProducto.objects.create(id_cotizacion=cot2, id_producto=self.prod2, precio_ofrecido=Decimal("4000.00"))

    def test_calcular_mejor_compra_exitoso(self):
        """Paso 3, 4 y 5: Algoritmo selecciona las mejores ofertas históricas y agrupa borradores por proveedor."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/ordenes-compra/calcular-mejor-compra/'

        payload = {
            "productos": [
                {"id_producto": self.prod1.id_producto, "cantidad": 5},
                {"id_producto": self.prod2.id_producto, "cantidad": 10}
            ],
            "requiere_envio": False
        }

        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data.get('total_borradores'), 2)
        self.assertEqual(len(data.get('productos_huerfanos', [])), 0)

        # Borradores agrupados
        borradores = {b['cuit_prov']: b for b in data.get('borradores', [])}

        # Para prod1 debe ganar Prov1 ($7000 * 5 = $35000)
        borrador_prov1 = borradores.get(self.prov1.cuit_prov)
        self.assertIsNotNone(borrador_prov1)
        self.assertEqual(len(borrador_prov1['items']), 1)
        self.assertEqual(borrador_prov1['items'][0]['id_producto'], self.prod1.id_producto)
        self.assertEqual(Decimal(str(borrador_prov1['items'][0]['precio_unitario'])), Decimal("7000.00"))
        self.assertEqual(Decimal(str(borrador_prov1['monto_total'])), Decimal("35000.00"))

        # Para prod2 debe ganar Prov2 ($4000 * 10 = $40000)
        borrador_prov2 = borradores.get(self.prov2.cuit_prov)
        self.assertIsNotNone(borrador_prov2)
        self.assertEqual(len(borrador_prov2['items']), 1)
        self.assertEqual(borrador_prov2['items'][0]['id_producto'], self.prod2.id_producto)
        self.assertEqual(Decimal(str(borrador_prov2['items'][0]['precio_unitario'])), Decimal("4000.00"))
        self.assertEqual(Decimal(str(borrador_prov2['monto_total'])), Decimal("40000.00"))

    def test_calcular_mejor_compra_con_envio_filtra_proveedores_sin_envio(self):
        """Si requiere_envio = True, solo se adjudica a proveedores con ofrece_envio = True."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/ordenes-compra/calcular-mejor-compra/'

        payload = {
            "productos": [
                {"id_producto": self.prod2.id_producto, "cantidad": 2}
            ],
            "requiere_envio": True
        }

        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        # Prov2 tiene menor precio ($4000) pero ofrece_envio=False. Por tanto gana Prov1 ($5500, ofrece_envio=True)
        borradores = data.get('borradores', [])
        self.assertEqual(len(borradores), 1)
        self.assertEqual(borradores[0]['cuit_prov'], self.prov1.cuit_prov)
        self.assertEqual(borradores[0]['tipo_entrega'], OrdenCompra.TIPO_ENTREGA_ENVIO)
        self.assertEqual(Decimal(str(borradores[0]['items'][0]['precio_unitario'])), Decimal("5500.00"))

    def test_calcular_mejor_compra_producto_sin_oferta_reporta_huerfano(self):
        """Excepción Paso 3: Producto sin precio histórico vigente se reporta en productos_huerfanos."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/ordenes-compra/calcular-mejor-compra/'

        payload = {
            "productos": [
                {"id_producto": self.prod_sin_oferta.id_producto, "cantidad": 1}
            ]
        }

        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        huerfanos = data.get('productos_huerfanos', [])
        self.assertEqual(len(huerfanos), 1)
        self.assertEqual(huerfanos[0]['id_producto'], self.prod_sin_oferta.id_producto)
        self.assertIn("No existe cotización aceptada", huerfanos[0]['motivo'])

    def test_emitir_ordenes_compra_exitoso(self):
        """Paso 6, 7 y 8: Emisión formal de órdenes en estado 'Esperando Entrega' con DetalleOrdenCompra."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/ordenes-compra/emitir/'

        payload = {
            "borradores": [
                {
                    "cuit_prov": self.prov1.cuit_prov,
                    "tipo_entrega": OrdenCompra.TIPO_ENTREGA_ENVIO,
                    "sol_tec": False,
                    "items": [
                        {
                            "id_producto": self.prod1.id_producto,
                            "cantidad": 10,
                            "precio_unitario": "7000.00"
                        }
                    ]
                }
            ]
        }

        response = self.client.post(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("órdenes de compra exitosamente", response.data.get('mensaje', ''))

        ordenes = response.data.get('ordenes', [])
        self.assertEqual(len(ordenes), 1)
        ord_data = ordenes[0]
        self.assertEqual(ord_data.get('estado'), "Esperando Entrega")
        self.assertEqual(ord_data.get('tipo_entrega_nombre'), "Envío a Domicilio")
        self.assertEqual(Decimal(str(ord_data.get('monto_total'))), Decimal("70000.00"))

        # En BD
        id_orden = ord_data['id_orden']
        orden_db = OrdenCompra.objects.filter(id_orden=id_orden).first()
        self.assertIsNotNone(orden_db)
        self.assertEqual(orden_db.estado_orden, OrdenCompra.ESTADO_ESPERANDO_ENTREGA)
        detalles = list(orden_db.detalleordencompra_set.all())
        self.assertEqual(len(detalles), 1)
        self.assertEqual(detalles[0].id_producto_id, self.prod1.id_producto)
        self.assertEqual(detalles[0].cantidad, 10)
        self.assertEqual(detalles[0].precio_unitario, Decimal("7000.00"))

        # Log
        log = LogSistema.objects.filter(
            accion="Generar Orden de Compra (CU-54)",
            id_registro_afectado=f"#{id_orden}"
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("emitió 1 órdenes de compra", log.detalle)

    def test_emitir_ordenes_compra_no_admin_denegado_403(self):
        """Precondición: Solo Administrador puede emitir órdenes de compra."""
        self.client.force_authenticate(user=self.tecnico)
        url = '/api/purchases/ordenes-compra/emitir/'
        response = self.client.post(url, data={"borradores": []}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ==============================================================================
# CU-55: RECEPCIONAR COMPRA (TESTS)
# ==============================================================================

class RecepcionarCompraTestCase(TestCase):
    """
    Pruebas unitarias e integrales para CU-55: Recepcionar Compra.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles y Usuarios
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
            email='admin.recepcion@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
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
        self.cliente_user = Usuario.objects.create(
            email='cliente.recepcion@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Catálogo
        self.categoria = CategoriaProducto.objects.create(nombre="Módulos y Pantallas", estado=True)
        self.prod1 = Producto.objects.create(
            nombre="Módulo Pantalla OLED iPhone 13",
            descripcion="Pantalla OLED original ensamblada",
            precio_venta=Decimal("85000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )
        self.prod2 = Producto.objects.create(
            nombre="Batería Samsung S21",
            descripcion="Batería 4000mAh original",
            precio_venta=Decimal("25000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=True,
            id_categoria=self.categoria
        )

        # Proveedor
        self.proveedor = Proveedor.objects.create(
            cuit_prov="30-99887766-5",
            nombre_proveedor="Distribuidora Repuestos Global SA",
            correo="logistica@repuestosglobal.com",
            telefono="011-4444-5555",
            ofrece_envio=True,
            estado=True
        )

        # Orden de Compra en espera de entrega (sol_tec = False por defecto)
        self.orden = OrdenCompra.objects.create(
            fecha_emision=timezone.now().date(),
            estado_orden=OrdenCompra.ESTADO_ESPERANDO_ENTREGA,
            sol_tec=False,
            tipo_entrega=OrdenCompra.TIPO_ENTREGA_ENVIO,
            cuit_prov=self.proveedor
        )
        self.det1 = DetalleOrdenCompra.objects.create(
            id_orden=self.orden,
            id_producto=self.prod1,
            cantidad=10,
            precio_unitario=Decimal("50000.00")
        )
        self.det2 = DetalleOrdenCompra.objects.create(
            id_orden=self.orden,
            id_producto=self.prod2,
            cantidad=5,
            precio_unitario=Decimal("15000.00")
        )

    def test_obtener_checklist_recepcion_exitoso_200(self):
        """Paso 1 y 2: Consulta el checklist precargado de la orden en espera de entrega."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/recepcionar/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['id_orden'], self.orden.id_orden)
        self.assertEqual(data['estado_nombre'], "Esperando Entrega")
        self.assertEqual(data['proveedor']['nombre'], "Distribuidora Repuestos Global SA")
        self.assertEqual(len(data['items']), 2)
        # Total esperado: 10 * 50000 + 5 * 15000 = 500000 + 75000 = 575000
        self.assertEqual(Decimal(str(data['total_esperado'])), Decimal("575000.00"))

    def test_obtener_checklist_orden_no_esperando_entrega_falla_400(self):
        """Paso 2 (Excepciones): Bloquea consultar checklist si la orden no está en espera de entrega."""
        self.orden.estado_orden = OrdenCompra.ESTADO_ENTREGADA
        self.orden.save()

        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/recepcionar/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no se encuentra en estado de espera de entrega", response.data.get('error', ''))

    def test_obtener_checklist_orden_inexistente_404(self):
        """Verifica 404 al consultar una orden inexistente."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/ordenes-compra/999999/recepcionar/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_recepcionar_compra_total_exacta_exitosa_200(self):
        """
        Pasos 3, 4, 5, 6, 7, 8: Recepción exacta de mercadería:
        - Autogenera código interno unívoco de remito si el campo está vacío.
        - Incrementa el stock en inventory_app (MovimientoStock tipo compra).
        - Transiciona la orden a estado 'Entregada'.
        - Genera log de auditoría.
        """
        from inventory_app.models import Stock, MovimientoStock

        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/recepcionar/'

        payload = {
            "nro_remito": "",  # Vacío para autogenerar
            "confirmar_excedente": False,
            "items": [
                {"id_detalle_compra": self.det1.id_detalle_compra, "cantidad_recibida": 10},
                {"id_detalle_compra": self.det2.id_detalle_compra, "cantidad_recibida": 5}
            ]
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['estado_orden'], OrdenCompra.ESTADO_ENTREGADA)
        self.assertEqual(data['estado_nombre'], "Entregada")
        self.assertFalse(data['es_entrega_parcial'])
        self.assertTrue(data['nro_remito'].startswith(f"REC-{self.orden.id_orden}-"))
        self.assertEqual(Decimal(str(data['total_abonar'])), Decimal("575000.00"))

        # Verificación en BD
        self.orden.refresh_from_db()
        self.assertEqual(self.orden.estado_orden, OrdenCompra.ESTADO_ENTREGADA)
        self.assertIsNotNone(self.orden.fecha_recepcion)

        # Stock actualizado
        stock_prod1 = Stock.objects.filter(id_producto=self.prod1).first()
        self.assertIsNotNone(stock_prod1)
        mov1 = MovimientoStock.objects.filter(id_stock=stock_prod1, tipo_movimiento='compra').first()
        self.assertIsNotNone(mov1)
        self.assertEqual(mov1.cantidad, 10)

        stock_prod2 = Stock.objects.filter(id_producto=self.prod2).first()
        self.assertIsNotNone(stock_prod2)
        mov2 = MovimientoStock.objects.filter(id_stock=stock_prod2, tipo_movimiento='compra').first()
        self.assertIsNotNone(mov2)
        self.assertEqual(mov2.cantidad, 5)

        # Detalles actualizados
        self.det1.refresh_from_db()
        self.assertEqual(self.det1.cantidad_recibida, 10)
        self.assertEqual(self.det1.cantidad, 10)

        # Log
        log = LogSistema.objects.filter(
            accion="Recepcionar Compra (CU-55)",
            id_registro_afectado=str(self.orden.id_orden)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("recepcionó la orden", log.detalle)

    def test_recepcionar_compra_con_remito_manual(self):
        """Verifica que si el Administrador ingresa un remito formal, se asienta fielmente."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/recepcionar/'

        payload = {
            "nro_remito": "REMITO-OFICIAL-88321",
            "confirmar_excedente": False,
            "items": [
                {"id_detalle_compra": self.det1.id_detalle_compra, "cantidad_recibida": 10},
                {"id_detalle_compra": self.det2.id_detalle_compra, "cantidad_recibida": 5}
            ]
        }

        response = self.client.patch(url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['nro_remito'], "REMITO-OFICIAL-88321")

        self.orden.refresh_from_db()
        self.assertEqual(self.orden.nro_remito, "REMITO-OFICIAL-88321")

    def test_recepcionar_compra_parcial_asigna_estado_entregada_parcialmente(self):
        """Paso 8 (Excepciones): Si hay faltantes, asigna 'Entregada Parcialmente' para trazabilidad del reclamo."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/recepcionar/'

        payload = {
            "nro_remito": "REM-PARCIAL-101",
            "confirmar_excedente": False,
            "items": [
                {"id_detalle_compra": self.det1.id_detalle_compra, "cantidad_recibida": 7},  # 7 de 10 esperados
                {"id_detalle_compra": self.det2.id_detalle_compra, "cantidad_recibida": 5}
            ]
        }

        response = self.client.patch(url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        self.assertEqual(data['estado_orden'], OrdenCompra.ESTADO_ENTREGADA_PARCIALMENTE)
        self.assertEqual(data['estado_nombre'], "Entregada Parcialmente")
        self.assertTrue(data['es_entrega_parcial'])
        # Total abonar ajustado: 7 * 50000 + 5 * 15000 = 350000 + 75000 = 425000
        self.assertEqual(Decimal(str(data['total_abonar'])), Decimal("425000.00"))

        self.orden.refresh_from_db()
        self.assertEqual(self.orden.estado_orden, OrdenCompra.ESTADO_ENTREGADA_PARCIALMENTE)

    def test_recepcionar_compra_excedente_sin_confirmar_falla_400(self):
        """Paso 5 (Excepciones): Advertencia obligatoria ante excedente físico no confirmado."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/recepcionar/'

        payload = {
            "nro_remito": "REM-EXC-202",
            "confirmar_excedente": False,
            "items": [
                {"id_detalle_compra": self.det1.id_detalle_compra, "cantidad_recibida": 12},  # 12 > 10
                {"id_detalle_compra": self.det2.id_detalle_compra, "cantidad_recibida": 5}
            ]
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(response.data.get('requiere_confirmacion_excedente'))
        self.assertIn("excedente de mercadería", response.data.get('error', ''))

        # Asegurar que nada cambió en BD
        self.orden.refresh_from_db()
        self.assertEqual(self.orden.estado_orden, OrdenCompra.ESTADO_ESPERANDO_ENTREGA)

    def test_recepcionar_compra_excedente_con_confirmacion_exitosa(self):
        """Paso 5 (Excepciones): Excedente confirmado por el Administrador incrementa stock y ajusta total."""
        from inventory_app.models import Stock, MovimientoStock

        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/recepcionar/'

        payload = {
            "nro_remito": "REM-EXC-CONFIRMADO",
            "confirmar_excedente": True,
            "items": [
                {"id_detalle_compra": self.det1.id_detalle_compra, "cantidad_recibida": 14},  # 14 > 10
                {"id_detalle_compra": self.det2.id_detalle_compra, "cantidad_recibida": 5}
            ]
        }

        response = self.client.patch(url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['estado_orden'], OrdenCompra.ESTADO_ENTREGADA)
        # Total abonar con excedente: 14 * 50000 + 5 * 15000 = 700000 + 75000 = 775000
        self.assertEqual(Decimal(str(data['total_abonar'])), Decimal("775000.00"))

        # Stock recibió 14 unidades
        stock_prod1 = Stock.objects.filter(id_producto=self.prod1).first()
        mov1 = MovimientoStock.objects.filter(id_stock=stock_prod1, tipo_movimiento='compra').first()
        self.assertEqual(mov1.cantidad, 14)

    def test_recepcionar_compra_reactiva_reparaciones_fifo_sol_tec_true(self):
        """
        Paso 9: Reactividad Técnica (FIFO):
        Si la compra fue solicitada por un técnico (sol_tec = True), las reparaciones
        más antiguas en espera del insumo pasan automáticamente a 'EN_REPARACION'
        y registran el evento en BitacoraReparacion.
        """
        from workshop_app.models import (
            Dispositivo,
            Reparacion,
            DetalleInsumoReparacion,
            BitacoraReparacion
        )
        from catalog_app.models import TipoDispositivo, Marca, ModeloDispositivo

        # Habilitar sol_tec en la orden
        self.orden.sol_tec = True
        self.orden.save()

        # Dispositivo de prueba
        tipo = TipoDispositivo.objects.create(nombre="Smartphone", estado_activo=True)
        marca = Marca.objects.create(nombre="Apple", estado_activo=True)
        modelo = ModeloDispositivo.objects.create(nombre="iPhone 13", id_marca=marca, id_tipo_dispositivo=tipo, estado_activo=True)
        disp = Dispositivo.objects.create(
            numero_serie="SN-IPH13-TEST",
            fecha_registro=timezone.now().date(),
            id_modelo=modelo,
            id_usuario=self.cliente_user
        )

        hoy = timezone.now().date()

        # Reparación 1 (Más antigua: hace 5 días) - Necesita 2 unidades de prod1
        rep1 = Reparacion.objects.create(
            fecha_inicio=hoy - timezone.timedelta(days=5),
            etapa='ESPERANDO_REPUESTOS',
            id_dispositivo=disp,
            id_usuario=self.cliente_user
        )
        DetalleInsumoReparacion.objects.create(
            id_reparacion=rep1,
            id_producto=self.prod1,
            cantidad=2,
            precio_unitario=self.prod1.precio_venta
        )

        # Reparación 2 (Más nueva: hace 1 día) - Necesita 3 unidades de prod1
        rep2 = Reparacion.objects.create(
            fecha_inicio=hoy - timezone.timedelta(days=1),
            etapa='ESPERANDO_REPUESTOS',
            id_dispositivo=disp,
            id_usuario=self.cliente_user
        )
        DetalleInsumoReparacion.objects.create(
            id_reparacion=rep2,
            id_producto=self.prod1,
            cantidad=3,
            precio_unitario=self.prod1.precio_venta
        )

        # Recepcionamos 3 unidades de prod1 (suficiente para rep1 que necesita 2, pero sobran 1, insuficiente para rep2)
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/recepcionar/'

        payload = {
            "nro_remito": "REM-TECNICO-FIFO",
            "confirmar_excedente": False,
            "items": [
                {"id_detalle_compra": self.det1.id_detalle_compra, "cantidad_recibida": 3},
                {"id_detalle_compra": self.det2.id_detalle_compra, "cantidad_recibida": 5}
            ]
        }

        response = self.client.patch(url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Reparación 1 debe estar reactivada a EN_REPARACION
        rep1.refresh_from_db()
        self.assertEqual(rep1.etapa, 'EN_REPARACION')

        # Bitácora registrada para rep1
        bitacora_rep1 = BitacoraReparacion.objects.filter(
            id_reparacion=rep1,
            estado_alcanzado=5
        ).first()
        self.assertIsNotNone(bitacora_rep1)
        self.assertIn("Insumos recepcionados. Reparación reactivada automáticamente", bitacora_rep1.comentario)

        # Reparación 2 debe continuar en ESPERANDO_REPUESTOS
        rep2.refresh_from_db()
        self.assertEqual(rep2.etapa, 'ESPERANDO_REPUESTOS')

        # Response lista reparaciones reactivadas
        self.assertIn(rep1.id_reparacion, response.data.get('reparaciones_reactivadas', []))

    def test_recepcionar_compra_no_admin_denegado_403(self):
        """Precondición: Solo Administrador puede recepcionar mercadería."""
        self.client.force_authenticate(user=self.tecnico)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/recepcionar/'

        payload = {
            "nro_remito": "REM-123",
            "items": [{"id_detalle_compra": self.det1.id_detalle_compra, "cantidad_recibida": 10}]
        }

        response = self.client.patch(url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_recepcionar_compra_cantidades_negativas_bloqueadas_400(self):
        """Paso 6: Validación estricta que impide registrar cantidades recibidas negativas."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/recepcionar/'

        payload = {
            "nro_remito": "REM-NEG",
            "items": [
                {"id_detalle_compra": self.det1.id_detalle_compra, "cantidad_recibida": -2}
            ]
        }

        response = self.client.patch(url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ==============================================================================
# CU-57: CONSULTAR ORDEN DE COMPRA (TESTS)
# ==============================================================================

class ConsultarOrdenCompraTestCase(TestCase):
    """
    Pruebas unitarias e integrales para CU-57: Consultar Orden de Compra.
    Verifica:
    - Consulta exitosa en modo solo lectura de la Orden de Compra (200 OK).
    - Despliegue íntegro de cabecera, proveedor, líneas con precios unitarios congelados y total a abonar.
    - Exposición de número de remito y cantidades recibidas para órdenes ya entregadas.
    - Manejo de excepción 404 con mensaje unívoco ("El documento solicitado no existe o no está disponible").
    - Control de seguridad: solo perfil Administrador autorizado (403 Forbidden para otros roles).
    - Protección contra acceso no autenticado (401 Unauthorized).
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
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

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.consultaroc@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.consultaroc@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente.consultaroc@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_cliente,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Catálogo
        self.categoria = CategoriaProducto.objects.create(nombre="Repuestos de Placa", estado=True)
        self.prod1 = Producto.objects.create(
            nombre="IC de Carga Tristar U2",
            descripcion="Circuito integrado de administración de carga",
            precio_venta=Decimal("12000.00"),
            estado=True,
            apto_venta=False,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=True,
            id_categoria=self.categoria
        )
        self.prod2 = Producto.objects.create(
            nombre="Estaño en Pasta Mechanic 183°C",
            descripcion="Pote 50g soldadura SMD",
            precio_venta=Decimal("15000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=True,
            modulo_automatico=True,
            id_categoria=self.categoria
        )

        # Proveedor
        self.proveedor = Proveedor.objects.create(
            cuit_prov="30-11223344-5",
            nombre_proveedor="MicroElectrónica Argentina SA",
            correo="ventas@microelectronica.com.ar",
            telefono="011-5555-4444",
            ofrece_envio=True,
            estado=True
        )

        # Orden de Compra de prueba
        self.orden = OrdenCompra.objects.create(
            fecha_emision=timezone.now().date(),
            estado_orden=OrdenCompra.ESTADO_ESPERANDO_ENTREGA,
            sol_tec=True,
            tipo_entrega=OrdenCompra.TIPO_ENTREGA_ENVIO,
            cuit_prov=self.proveedor
        )
        self.det1 = DetalleOrdenCompra.objects.create(
            id_orden=self.orden,
            id_producto=self.prod1,
            cantidad=20,
            precio_unitario=Decimal("6500.00")
        )
        self.det2 = DetalleOrdenCompra.objects.create(
            id_orden=self.orden,
            id_producto=self.prod2,
            cantidad=5,
            precio_unitario=Decimal("8000.00")
        )

    def test_consultar_orden_compra_exitosa_200(self):
        """Paso 1 y 2: El Administrador accede a la consulta de la orden y obtiene la ficha digital completa."""
        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        # Cabecera
        self.assertEqual(data['id_orden'], self.orden.id_orden)
        self.assertEqual(data['estado_orden'], OrdenCompra.ESTADO_ESPERANDO_ENTREGA)
        self.assertEqual(data['estado_nombre'], "Esperando Entrega")
        self.assertTrue(data['sol_tec'])
        self.assertEqual(data['tipo_entrega_nombre'], "Envío a Domicilio")
        self.assertIsNone(data['nro_remito'])

        # Proveedor
        prov_data = data['proveedor']
        self.assertEqual(prov_data['cuit'], "30-11223344-5")
        self.assertEqual(prov_data['razon_social'], "MicroElectrónica Argentina SA")
        self.assertEqual(prov_data['correo'], "ventas@microelectronica.com.ar")
        self.assertEqual(prov_data['telefono'], "011-5555-4444")

        # Grilla Económica
        items = data['detalles']
        self.assertEqual(len(items), 2)
        # Renglón 1: 20 * 6500 = 130000
        # Renglón 2: 5 * 8000 = 40000
        # Total esperado: 170000
        self.assertEqual(Decimal(str(data['monto_total'])), Decimal("170000.00"))
        self.assertEqual(Decimal(str(data['total_abonar'])), Decimal("170000.00"))

        item1 = next(it for it in items if it['id_detalle_compra'] == self.det1.id_detalle_compra)
        self.assertEqual(item1['nombre_producto'], "IC de Carga Tristar U2")
        self.assertEqual(item1['cantidad'], 20)
        self.assertIsNone(item1['cantidad_recibida'])
        self.assertEqual(Decimal(str(item1['precio_unitario'])), Decimal("6500.00"))
        self.assertEqual(Decimal(str(item1['subtotal'])), Decimal("130000.00"))

    def test_consultar_orden_compra_entregada_con_remito_y_cantidades_recibidas(self):
        """Verifica la consulta de una orden ya recepcionada con remito y cantidades reales."""
        self.orden.estado_orden = OrdenCompra.ESTADO_ENTREGADA
        self.orden.nro_remito = "REM-OFICIAL-9944"
        self.orden.fecha_recepcion = timezone.now().date()
        self.orden.save()

        self.det1.cantidad_recibida = 20
        self.det1.save()
        self.det2.cantidad_recibida = 5
        self.det2.save()

        self.client.force_authenticate(user=self.admin)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['estado_nombre'], "Entregada")
        self.assertEqual(data['nro_remito'], "REM-OFICIAL-9944")
        self.assertEqual(str(data['fecha_recepcion']), str(self.orden.fecha_recepcion))

        item1 = next(it for it in data['detalles'] if it['id_detalle_compra'] == self.det1.id_detalle_compra)
        self.assertEqual(item1['cantidad_recibida'], 20)

    def test_consultar_orden_compra_inexistente_retorna_404_con_mensaje_exacto(self):
        """Paso 2 (Excepciones): Si el documento no existe, retorna 404 y mensaje específico."""
        self.client.force_authenticate(user=self.admin)
        url = '/api/purchases/ordenes-compra/999999/'

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data.get('error'), "El documento solicitado no existe o no está disponible.")

    def test_consultar_orden_compra_no_admin_denegado_403(self):
        """Precondición: Solo Administrador tiene permiso para consultar el archivo de órdenes de compra."""
        self.client.force_authenticate(user=self.tecnico)
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/'

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.cliente)
        response_cli = self.client.get(url)
        self.assertEqual(response_cli.status_code, status.HTTP_403_FORBIDDEN)

    def test_consultar_orden_compra_no_autenticado_401(self):
        """Verifica que peticiones anónimas sean rechazadas con 401 o 403."""
        url = f'/api/purchases/ordenes-compra/{self.orden.id_orden}/'
        response = self.client.get(url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class RegistrarCompraDirectaTestCase(TestCase):
    """
    Pruebas unitarias e integración para el CU-31: Registrar Compra.
    Verifica el registro administrativo directo fuera del circuito de órdenes de compra,
    con y sin impacto en stock, auditoría en LogSistema y restricciones de acceso.
    """

    def setUp(self):
        self.client = APIClient()

        # Roles
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

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin_compra_directa@ifixpos.com',
            contrasena='hash_admin_123',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_admin,
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico_compra_directa@ifixpos.com',
            contrasena='hash_tec_123',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_tecnico,
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente_compra_directa@ifixpos.com',
            contrasena='hash_cli_123',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_cliente,
            is_active=True
        )

        self.url = '/api/purchases/compras-directas/registrar/'

    def test_registrar_compra_directa_sin_impacto_stock_exitoso(self):
        """
        Paso 1 a 8: Registro exitoso de compra directa sin impacto en stock.
        Se crea el RegistroCompra, id_producto permanece en None y se genera LogSistema.
        """
        self.client.force_authenticate(user=self.admin)
        payload = {
            "origen_vendedor": "Cliente Mostrador - Carlos Vega",
            "descripcion_articulo": "Notebook Lenovo ThinkPad usada para repuestos",
            "motivo": "Aprovechamiento de pantalla LCD, flex y teclado",
            "monto_pagado": "85000.00",
            "impacto_stock": False
        }

        response = self.client.post(self.url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data.get('mensaje'), "Compra registrada exitosamente.")

        data = response.data.get('compra', {})
        self.assertEqual(data.get('origen_vendedor'), "Cliente Mostrador - Carlos Vega")
        self.assertEqual(data.get('descripcion_articulo'), "Notebook Lenovo ThinkPad usada para repuestos")
        self.assertEqual(Decimal(str(data.get('monto_pagado'))), Decimal("85000.00"))
        self.assertFalse(data.get('impacto_stock'))
        self.assertIsNone(data.get('id_producto'))
        self.assertIsNone(data.get('id_producto_generado'))
        self.assertEqual(data.get('id_administrador'), self.admin.id_usuario)

        # Verificación en BD
        compra_db = RegistroCompra.objects.filter(id_compra=data.get('id_compra')).first()
        self.assertIsNotNone(compra_db)
        self.assertFalse(compra_db.impacto_stock)
        self.assertIsNone(compra_db.id_producto)
        self.assertEqual(compra_db.id_usuario_id, self.admin.id_usuario)

        # Verificación de auditoría en LogSistema
        log = LogSistema.objects.filter(
            accion="Registrar Compra Directa (CU-31)",
            id_registro_afectado=str(compra_db.id_compra)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("Impacto en stock: No", log.detalle)
        self.assertIn("Carlos Vega", log.detalle)

    def test_registrar_compra_directa_con_impacto_stock_exitoso(self):
        """
        Paso 1 a 8: Registro exitoso de compra directa con impacto en stock.
        Se crea el producto en catalog_app, se crea stock y movimiento de ingreso en inventory_app,
        se enlaza id_producto al RegistroCompra y se genera LogSistema.
        """
        from inventory_app.models import Stock, MovimientoStock

        self.client.force_authenticate(user=self.admin)
        payload = {
            "origen_vendedor": "Distribuidora Mayorista Express",
            "descripcion_articulo": "Pasta Térmica Arctic MX-4 4g",
            "motivo": "Compra directa de urgencia para taller",
            "monto_pagado": "36000.00",
            "impacto_stock": True,
            "cantidad": 12
        }

        response = self.client.post(self.url, data=payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data.get('mensaje'), "Compra registrada exitosamente.")

        data = response.data.get('compra', {})
        self.assertTrue(data.get('impacto_stock'))
        self.assertIsNotNone(data.get('id_producto'))
        self.assertEqual(data.get('producto_nombre'), "Pasta Térmica Arctic MX-4 4g")

        # Verificación en BD de RegistroCompra
        compra_db = RegistroCompra.objects.filter(id_compra=data.get('id_compra')).first()
        self.assertIsNotNone(compra_db)
        self.assertTrue(compra_db.impacto_stock)
        self.assertIsNotNone(compra_db.id_producto)

        # Verificación del Producto creado
        prod = compra_db.id_producto
        self.assertEqual(prod.nombre, "Pasta Térmica Arctic MX-4 4g")
        self.assertTrue(prod.estado)
        self.assertTrue(prod.apto_venta)

        # Verificación de Stock y MovimientoStock
        stock = Stock.objects.filter(id_producto=prod).first()
        self.assertIsNotNone(stock)
        mov = MovimientoStock.objects.filter(id_stock=stock, tipo_movimiento='compra').first()
        self.assertIsNotNone(mov)
        self.assertEqual(mov.cantidad, 12)

        # Verificación de auditoría en LogSistema
        log = LogSistema.objects.filter(
            accion="Registrar Compra Directa (CU-31)",
            id_registro_afectado=str(compra_db.id_compra)
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("Impacto en stock: Sí", log.detalle)

    def test_registrar_compra_directa_monto_cero_o_negativo_error_400(self):
        """Excepción: El monto pagado debe ser estrictamente mayor a cero."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            "origen_vendedor": "Proveedor Rápido",
            "descripcion_articulo": "Cables USB-C",
            "motivo": "Carga de taller",
            "monto_pagado": "0.00",
            "impacto_stock": False
        }

        response = self.client.post(self.url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        error_str = str(response.data)
        self.assertIn("El monto pagado debe ser mayor a cero", error_str)

        payload['monto_pagado'] = "-500.00"
        response_neg = self.client.post(self.url, data=payload, format='json')
        self.assertEqual(response_neg.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("El monto pagado debe ser mayor a cero", str(response_neg.data))

    def test_registrar_compra_directa_impacto_stock_sin_cantidad_valida_error_400(self):
        """Excepción: Si impacto_stock es True, cantidad debe ser mayor a cero."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            "origen_vendedor": "Proveedor Rápido",
            "descripcion_articulo": "Batería iPhone 11",
            "motivo": "Repuesto",
            "monto_pagado": "25000.00",
            "impacto_stock": True,
            "cantidad": 0
        }

        response = self.client.post(self.url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Debe especificar una cantidad válida para impactar en el stock", str(response.data))

    def test_registrar_compra_directa_campos_obligatorios_vacios_error_400(self):
        """Excepción: Campos obligatorios requeridos vacíos deben generar error de validación."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.url, data={}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("origen_vendedor", response.data)
        self.assertIn("descripcion_articulo", response.data)
        self.assertIn("motivo", response.data)
        self.assertIn("monto_pagado", response.data)

    def test_registrar_compra_directa_no_admin_denegado_403(self):
        """Precondición: Solo Administrador tiene permiso para asentar compras directas."""
        self.client.force_authenticate(user=self.tecnico)
        payload = {
            "origen_vendedor": "Local Amigo",
            "descripcion_articulo": "Pinzas de precisión",
            "motivo": "Herramienta",
            "monto_pagado": "8000.00"
        }
        response_tec = self.client.post(self.url, data=payload, format='json')
        self.assertEqual(response_tec.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.cliente)
        response_cli = self.client.post(self.url, data=payload, format='json')
        self.assertEqual(response_cli.status_code, status.HTTP_403_FORBIDDEN)

    def test_registrar_compra_directa_no_autenticado_401(self):
        """Peticiones anónimas deben ser rechazadas con 401."""
        payload = {
            "origen_vendedor": "Local Amigo",
            "descripcion_articulo": "Pinzas de precisión",
            "motivo": "Herramienta",
            "monto_pagado": "8000.00"
        }
        response = self.client.post(self.url, data=payload, format='json')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


# ==============================================================================
# CU-41: FILTRAR SOLICITUD DE COTIZACIÓN (TESTS)
# ==============================================================================

class FiltrarSolicitudCotizacionTestCase(TestCase):
    """
    Pruebas unitarias e integración para el CU-41: Filtrar Solicitud de Cotización.
    """

    def setUp(self):
        self.client = APIClient()
        self.url = '/api/purchases/solicitudes-cotizacion/filtrar/'

        # Roles
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )

        # Usuarios
        self.admin = Usuario.objects.create(
            email='admin.filtrosol@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.filtrosol@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Categoría y Productos
        self.categoria = CategoriaProducto.objects.create(
            nombre="Repuestos de Pantallas",
            estado=True
        )
        self.prod_pantalla = Producto.objects.create(
            nombre="Pantalla OLED iPhone 11",
            descripcion="Display Super Retina",
            precio_venta=Decimal("95000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )
        self.prod_bateria = Producto.objects.create(
            nombre="Batería Original iPhone 11",
            descripcion="Batería 3110mAh",
            precio_venta=Decimal("38000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )

        # Solicitud 1: Borrador con pantalla
        self.sol1 = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date() - timezone.timedelta(days=10),
            estado_solicitud=SolicitudCotizacion.ESTADO_BORRADOR,
            sol_tec=False
        )
        SolicitudCotizacionProducto.objects.create(
            id_solicitud=self.sol1,
            id_producto=self.prod_pantalla,
            cantidad=5
        )

        # Solicitud 2: Enviada con batería
        self.sol2 = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_ENVIADA,
            sol_tec=True
        )
        SolicitudCotizacionProducto.objects.create(
            id_solicitud=self.sol2,
            id_producto=self.prod_bateria,
            cantidad=3
        )

    def test_filtrar_solicitudes_por_id_exacto(self):
        """Paso 2 y 5: Búsqueda exacta por idSolicitud."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'id_solicitud': self.sol1.id_solicitud})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_solicitud'], self.sol1.id_solicitud)

    def test_filtrar_solicitudes_por_estado_categorico(self):
        """Paso 2 y 5: Filtro categórico por estado de la solicitud."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'estado_solicitud': SolicitudCotizacion.ESTADO_ENVIADA})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_solicitud'], self.sol2.id_solicitud)
        self.assertEqual(response.data[0]['estado'], 'Enviada a Proveedores')

    def test_filtrar_solicitudes_por_rango_fechas(self):
        """Paso 2 y 5: Filtros cronológicos por rango de fecha de emisión (Desde / Hasta)."""
        self.client.force_authenticate(user=self.admin)
        hoy = timezone.now().date()
        response = self.client.get(self.url, {
            'fecha_desde': str(hoy - timezone.timedelta(days=2)),
            'fecha_hasta': str(hoy)
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_solicitud'], self.sol2.id_solicitud)

    def test_filtrar_solicitudes_por_producto_busqueda_contenido(self):
        """Paso 2 y 5: Búsqueda por contenido de insumo o producto incluido en el pedido."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'buscar_producto': 'Pantalla'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_solicitud'], self.sol1.id_solicitud)

    def test_filtrar_solicitudes_fecha_desde_mayor_que_hasta_error_400(self):
        """Excepción Paso 4: Si fecha_desde es posterior a fecha_hasta, notifica error 400."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {
            'fecha_desde': '2026-10-25',
            'fecha_hasta': '2026-10-20'
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no puede ser posterior", str(response.data))

    def test_filtrar_solicitudes_id_invalido_error_400(self):
        """Excepción Paso 4: Si id_solicitud no es un entero positivo válido, notifica error 400."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'id_solicitud': 'abc'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filtrar_solicitudes_sin_coincidencias_retorna_vacio(self):
        """Excepción Paso 5: Si ningún registro coincide, retorna lista vacía."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'buscar_producto': 'InexistenteRepuestoXYZ'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_filtrar_solicitudes_no_admin_denegado_403(self):
        """Precondición: Exclusivo para rol de Administrador."""
        self.client.force_authenticate(user=self.tecnico)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ==============================================================================
# CU-60: FILTRAR COTIZACIONES (TESTS)
# ==============================================================================

class FiltrarCotizacionesTestCase(TestCase):
    """
    Pruebas unitarias e integrales para CU-60: Filtrar Cotizaciones.
    """

    def setUp(self):
        self.client = APIClient()
        self.url = '/api/purchases/cotizaciones/filtrar/'

        # Roles y Usuarios
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )
        self.admin = Usuario.objects.create(
            email='admin.filtcotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.filtcotiz@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Categoría y Repuestos
        self.categoria = CategoriaProducto.objects.create(nombre="Pantallas OLED", estado=True)
        self.prod1 = Producto.objects.create(
            nombre="Pantalla iPhone 13 Pro",
            descripcion="Pantalla OLED Super Retina XDR",
            precio_venta=Decimal("120000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )
        self.prod2 = Producto.objects.create(
            nombre="Batería iPhone 13",
            descripcion="Batería original 3227mAh",
            precio_venta=Decimal("45000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )

        # Proveedores
        self.prov1 = Proveedor.objects.create(
            cuit_prov="30-77778888-9",
            nombre_proveedor="Apple Parts Oficial SA",
            correo="ventas@appleparts.com",
            telefono="011-7777-8888",
            estado=True
        )
        self.prov2 = Proveedor.objects.create(
            cuit_prov="30-99990000-1",
            nombre_proveedor="Tech Distribuidores SRL",
            correo="ventas@techdist.com",
            telefono="011-9999-0000",
            estado=True
        )

        # Solicitudes
        self.solicitud1 = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_COTIZADA,
            sol_tec=False
        )
        SolicitudCotizacionProducto.objects.create(
            id_solicitud=self.solicitud1,
            id_producto=self.prod1,
            cantidad=3
        )

        self.solicitud2 = SolicitudCotizacion.objects.create(
            fecha_emision=timezone.now().date(),
            estado_solicitud=SolicitudCotizacion.ESTADO_COTIZADA,
            sol_tec=False
        )
        SolicitudCotizacionProducto.objects.create(
            id_solicitud=self.solicitud2,
            id_producto=self.prod2,
            cantidad=5
        )

        # Invitaciones y Cotizaciones
        self.inv1 = InvitacionCotizar.objects.create(
            id_solicitud=self.solicitud1,
            cuit_prov=self.prov1,
            estado_invitacion=InvitacionCotizar.ESTADO_COTIZADA
        )
        self.cotiz1 = Cotizacion.objects.create(
            id_invitacion=self.inv1,
            tiempo_promesa=5,
            estado_cotizacion=Cotizacion.ESTADO_PENDIENTE,
            fecha_validez=timezone.now().date() + timezone.timedelta(days=10),
            comentarios="Garantía 6 meses"
        )
        CotizacionProducto.objects.create(
            id_cotizacion=self.cotiz1,
            id_producto=self.prod1,
            precio_ofrecido=Decimal("85000.00")
        )

        self.inv2 = InvitacionCotizar.objects.create(
            id_solicitud=self.solicitud2,
            cuit_prov=self.prov2,
            estado_invitacion=InvitacionCotizar.ESTADO_COTIZADA
        )
        self.cotiz2 = Cotizacion.objects.create(
            id_invitacion=self.inv2,
            tiempo_promesa=3,
            estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            fecha_validez=timezone.now().date() + timezone.timedelta(days=25),
            comentarios="Precios con flete bonificado"
        )
        CotizacionProducto.objects.create(
            id_cotizacion=self.cotiz2,
            id_producto=self.prod2,
            precio_ofrecido=Decimal("29000.00")
        )

    def test_filtrar_cotizaciones_sin_filtros_retorna_todas(self):
        """Paso 1 y 5: Administrador consulta el listado general de propuestas sin filtros."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [c['id_cotizacion'] for c in response.data]
        self.assertIn(self.cotiz1.id_cotizacion, ids)
        self.assertIn(self.cotiz2.id_cotizacion, ids)

    def test_filtrar_por_id_cotizacion_exacto(self):
        """Paso 2: Búsqueda exacta por idCotizacion."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'id_cotizacion': self.cotiz1.id_cotizacion})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_cotizacion'], self.cotiz1.id_cotizacion)

    def test_filtrar_por_id_solicitud_asociada(self):
        """Paso 2: Búsqueda exacta por idSolicitud asociada."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'id_solicitud': self.solicitud2.id_solicitud})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_cotizacion'], self.cotiz2.id_cotizacion)

    def test_filtrar_por_proveedor_emisor(self):
        """Paso 2: Filtro categórico por Proveedor emisor (CUIT o Nombre)."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'cuit_prov': 'Apple Parts'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_cotizacion'], self.cotiz1.id_cotizacion)

    def test_filtrar_por_estado_actual(self):
        """Paso 2: Filtro por Estado actual de cotización (Aceptada = 1)."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'estado_cotizacion': 1})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_cotizacion'], self.cotiz2.id_cotizacion)

    def test_filtrar_por_rango_fecha_validez(self):
        """Paso 2: Filtro cronológico por Rango de Fecha de Validez."""
        self.client.force_authenticate(user=self.admin)
        hoy = timezone.now().date()
        response = self.client.get(self.url, {
            'fecha_validez_desde': (hoy + timezone.timedelta(days=20)).isoformat(),
            'fecha_validez_hasta': (hoy + timezone.timedelta(days=30)).isoformat()
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_cotizacion'], self.cotiz2.id_cotizacion)

    def test_filtrar_por_insumo_cotizado(self):
        """Paso 2: Búsqueda por contenido (Insumo/Repuesto específico cotizado)."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'id_producto': self.prod1.id_producto})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_cotizacion'], self.cotiz1.id_cotizacion)

    def test_filtrar_fechas_inconsistentes_error_400(self):
        """Excepción Paso 4: Rango de validez cronológicamente inconsistente retorna 400."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {
            'fecha_validez_desde': '2026-11-20',
            'fecha_validez_hasta': '2026-11-10'
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("inconsistente", str(response.data))

    def test_filtrar_id_invalido_error_400(self):
        """Excepción Paso 4: Si id_cotizacion no es numérico, retorna 400."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'id_cotizacion': 'no_es_un_numero'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filtrar_sin_coincidencias_retorna_vacio(self):
        """Excepción Paso 5: Sin coincidencias retorna lista vacía."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'buscar_producto': 'ArticuloInexistente999'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_filtrar_no_admin_denegado_403(self):
        """Precondición: Exclusivo para rol Administrador."""
        self.client.force_authenticate(user=self.tecnico)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ==============================================================================
# CU-37: FILTRAR ÓRDENES DE COMPRA (TESTS)
# ==============================================================================

class FiltrarOrdenesCompraTestCase(TestCase):
    """
    Pruebas unitarias e integrales para el CU-37: Filtrar Órdenes de Compra.
    """

    def setUp(self):
        self.client = APIClient()
        self.url = '/api/purchases/ordenes-compra/filtrar/'

        # Roles y Usuarios
        self.rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Rol Administrador'}
        )
        self.rol_tecnico, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Rol Técnico'}
        )
        self.admin = Usuario.objects.create(
            email='admin.filtoc@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_admin,
            fecha_registro=timezone.now().date(),
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.filtoc@test.com',
            contrasena='hash_pwd',
            id_rol=self.rol_tecnico,
            fecha_registro=timezone.now().date(),
            is_active=True
        )

        # Categoría y Productos
        self.categoria = CategoriaProducto.objects.create(nombre="Módulos y Displays", estado=True)
        self.prod1 = Producto.objects.create(
            nombre="Módulo Samsung S23 Ultra",
            descripcion="Display Dynamic AMOLED 2X",
            precio_venta=Decimal("180000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )
        self.prod2 = Producto.objects.create(
            nombre="Pin de Carga USB-C S23",
            descripcion="Subplaca de carga original",
            precio_venta=Decimal("25000.00"),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.categoria
        )

        # Proveedores
        self.prov1 = Proveedor.objects.create(
            cuit_prov="30-55556666-7",
            nombre_proveedor="Samsung Parts Mayorista SA",
            correo="ventas@samsungparts.com",
            telefono="011-5555-6666",
            estado=True,
            ofrece_envio=True
        )
        self.prov2 = Proveedor.objects.create(
            cuit_prov="30-12123434-5",
            nombre_proveedor="Importadora Microcomponentes SRL",
            correo="info@microcomp.com",
            telefono="011-1212-3434",
            estado=True,
            ofrece_envio=False
        )

        hoy = timezone.now().date()

        # Orden 1: Esperando Entrega, Envío a Domicilio, Prov 1
        self.orden1 = OrdenCompra.objects.create(
            fecha_emision=hoy - timezone.timedelta(days=7),
            estado_orden=OrdenCompra.ESTADO_ESPERANDO_ENTREGA,
            sol_tec=True,
            tipo_entrega=OrdenCompra.TIPO_ENTREGA_ENVIO,
            cuit_prov=self.prov1
        )
        DetalleOrdenCompra.objects.create(
            id_orden=self.orden1,
            id_producto=self.prod1,
            cantidad=4,
            precio_unitario=Decimal("110000.00")
        )

        # Orden 2: Entregada, Retiro en Sucursal, Prov 2
        self.orden2 = OrdenCompra.objects.create(
            fecha_emision=hoy,
            estado_orden=OrdenCompra.ESTADO_ENTREGADA,
            sol_tec=False,
            nro_remito="REM-0001-8899",
            fecha_recepcion=hoy,
            tipo_entrega=OrdenCompra.TIPO_ENTREGA_RETIRO,
            cuit_prov=self.prov2
        )
        DetalleOrdenCompra.objects.create(
            id_orden=self.orden2,
            id_producto=self.prod2,
            cantidad=10,
            cantidad_recibida=10,
            precio_unitario=Decimal("12000.00")
        )

    def test_filtrar_ordenes_sin_filtros_retorna_todas_y_audita_log(self):
        """Paso 1 y 5: Consulta sin filtros retorna todas las órdenes y valida la política de logs."""
        from core_app.models import ConfiguracionSistema
        # Por defecto no se generan logs al filtrar para alto rendimiento
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertFalse(
            LogSistema.objects.filter(
                id_usuario=self.admin,
                accion__icontains="CU-37"
            ).exists()
        )

        # Si el flag 'log_operaciones_lectura' está activo, sí se registra la traza
        ConfiguracionSistema.objects.update_or_create(
            clave='log_operaciones_lectura',
            defaults={'valor': 'True', 'descripcion': 'Lectura pasiva'}
        )
        response_con_log = self.client.get(self.url)
        self.assertEqual(response_con_log.status_code, status.HTTP_200_OK)
        self.assertTrue(
            LogSistema.objects.filter(
                id_usuario=self.admin,
                accion__icontains="CU-37"
            ).exists()
        )

    def test_filtrar_por_id_orden_exacto(self):
        """Paso 2: Búsqueda exacta por id_orden / idOrden."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'id_orden': self.orden1.id_orden})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_orden'], self.orden1.id_orden)
        self.assertEqual(response.data[0]['estado_nombre'], 'Esperando Entrega')

    def test_filtrar_por_estado_orden_categorico(self):
        """Paso 2: Filtro categórico por estado de la orden."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'estado_orden': OrdenCompra.ESTADO_ENTREGADA})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_orden'], self.orden2.id_orden)
        self.assertEqual(response.data[0]['nro_remito'], 'REM-0001-8899')

    def test_filtrar_por_rango_fechas_emision(self):
        """Paso 2: Filtro temporal por rango de fechas de emisión (Fecha Desde / Fecha Hasta)."""
        self.client.force_authenticate(user=self.admin)
        hoy = timezone.now().date()
        response = self.client.get(self.url, {
            'fecha_desde': (hoy - timezone.timedelta(days=2)).isoformat(),
            'fecha_hasta': hoy.isoformat()
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_orden'], self.orden2.id_orden)

    def test_filtrar_por_tipo_entrega(self):
        """Paso 2: Filtro por tipo de recepción (1: Retiro en Sucursal, 2: Envío a Domicilio)."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'tipo_entrega': OrdenCompra.TIPO_ENTREGA_ENVIO})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_orden'], self.orden1.id_orden)
        self.assertEqual(response.data[0]['tipo_entrega_nombre'], 'Envío a Domicilio')

    def test_filtrar_por_proveedor_destinatario(self):
        """Paso 2: Filtro por proveedor destinatario (CUIT o Razón Social)."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'cuit_prov': 'Samsung Parts'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id_orden'], self.orden1.id_orden)

    def test_filtrar_id_orden_no_numerico_retorna_400(self):
        """Excepción Paso 4: Si el ID de la orden no es numérico positivo, retorna 400."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'id_orden': 'orden_invalida'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filtrar_rango_fechas_inconsistente_retorna_400(self):
        """Excepción Paso 4: Si Fecha Desde > Fecha Hasta, retorna 400."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {
            'fecha_desde': '2026-10-30',
            'fecha_hasta': '2026-10-15'
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no puede ser posterior", str(response.data))

    def test_filtrar_sin_coincidencias_retorna_vacio(self):
        """Excepción Paso 5: Si ninguna orden coincide, retorna lista vacía."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {'cuit_prov': '99-99999999-9'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_filtrar_no_admin_denegado_403(self):
        """Precondición: Solo Administrador puede filtrar órdenes de compra."""
        self.client.force_authenticate(user=self.tecnico)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)










# ==============================================================================
# MOTOR AUTÓNOMO DE ABASTECIMIENTO INTELIGENTE (TESTS)
# ==============================================================================

class MotorAbastecimientoAutomaticoTestCase(TestCase):
    """
    Pruebas unitarias y de integración para el Motor Autónomo de Abastecimiento:
      - Matriz de Decisión Multicriterio (CU-54).
      - Regla de Sondeo Selectivo: Exclusión de proveedores con cotización vigente (CU-14).
      - Auditoría de Stock en Tránsito y Demanda Urgente de Taller.
      - Protocolo de Cancelación por Incumplimiento de Proveedores.
      - Endpoints de Ejecución Manual y Consulta de Estado.
    """

    def setUp(self):
        self.client = APIClient()

        # Rol y Usuarios
        self.rol_admin = RolUsuario.objects.create(codigo='ADMIN', nombre_rol='Administrador')
        self.rol_tec = RolUsuario.objects.create(codigo='TECNICO', nombre_rol='Técnico')
        self.rol_cli = RolUsuario.objects.create(codigo='CLIENTE', nombre_rol='Cliente')

        self.admin = Usuario.objects.create(
            email='admin.motor@ifixpos.com',
            contrasena='Test1234!',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_admin,
            is_active=True
        )
        self.tecnico = Usuario.objects.create(
            email='tecnico.motor@ifixpos.com',
            contrasena='Test1234!',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_tec,
            is_active=True
        )
        self.cliente = Usuario.objects.create(
            email='cliente.motor@ifixpos.com',
            contrasena='Test1234!',
            fecha_registro=timezone.now().date(),
            id_rol=self.rol_cli,
            is_active=True
        )

        # Geografía
        self.pais = Pais.objects.create(nombre_pais='Argentina', cobertura_habilitada=True)
        self.provincia = Provincia.objects.create(nombre_provincia='Misiones', id_pais=self.pais, cobertura_habilitada=True)
        self.ciudad = Ciudad.objects.create(nombre_ciudad='Posadas', id_provincia=self.provincia, cobertura_habilitada=True)
        self.direccion = Direccion.objects.create(
            alias='Sede Central',
            nro_calle='Av. Corrientes 100',
            id_ciudad=self.ciudad,
            id_usuario=self.admin
        )

        # Configuración Global
        from core_app.models import ConfiguracionSistema
        ConfiguracionSistema.objects.update_or_create(
            clave='autoAbastecimientoActivo', defaults={'valor': 'True'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='modoDisparadorAbastecimiento', defaults={'valor': 'HIBRIDO'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='estrategiaLoteReposicion', defaults={'valor': 'BRECHA_MINIMO'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='frecuenciaGeneracionOC_dias', defaults={'valor': '5'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='esperaUrgenciaTecnicaHoras', defaults={'valor': '0'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='criterioObligatorio_Envio', defaults={'valor': 'False'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='diasToleranciaIncumplimientoProveedor', defaults={'valor': '3'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='toleranciaHorasIncumplimientoUrgente', defaults={'valor': '24'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='pesoEvaluacion_Economico', defaults={'valor': '20'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='pesoEvaluacion_Confiabilidad', defaults={'valor': '20'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='pesoEvaluacion_Tiempo', defaults={'valor': '20'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='pesoEvaluacion_Nivel', defaults={'valor': '20'}
        )
        ConfiguracionSistema.objects.update_or_create(
            clave='pesoEvaluacion_Envio', defaults={'valor': '20'}
        )

        # Catálogo
        self.cat_prod = CategoriaProducto.objects.create(nombre='Pantallas Test', estado=True)
        self.producto = Producto.objects.create(
            nombre='Display OLED Test A1',
            descripcion='Pantalla de repuesto test',
            precio_venta=Decimal('50000.00'),
            estado=True,
            apto_venta=True,
            apto_reparacion=True,
            apto_consumible=False,
            modulo_automatico=True,
            id_categoria=self.cat_prod
        )

        from inventory_app.models import Stock, MovimientoStock
        self.stock = Stock.objects.create(id_producto=self.producto, stock_minimo=10)

        # Proveedores
        self.prov_a = Proveedor.objects.create(
            cuit_prov='30-11111111-1',
            nombre_proveedor='Distribuidora Económica A',
            correo='contacto@prova.com',
            telefono='+54 11 1111-1111',
            estado=True,
            ofrece_envio=False,
            indice_confiabilidad=Decimal('40.00'),
            tiempo_promedio_entrega=7,
            nivel='Distribuidor Local'
        )
        self.prov_b = Proveedor.objects.create(
            cuit_prov='30-22222222-2',
            nombre_proveedor='Mayorista Premium B',
            correo='ventas@provb.com',
            telefono='+54 11 2222-2222',
            estado=True,
            ofrece_envio=True,
            indice_confiabilidad=Decimal('95.00'),
            tiempo_promedio_entrega=1,
            nivel='Mayorista Oficial'
        )
        self.prov_c = Proveedor.objects.create(
            cuit_prov='30-33333333-3',
            nombre_proveedor='Importador Regional C',
            correo='info@provc.com',
            telefono='+54 11 3333-3333',
            estado=True,
            ofrece_envio=True,
            indice_confiabilidad=Decimal('70.00'),
            tiempo_promedio_entrega=3,
            nivel='Distribuidor Regional'
        )

    def test_calcular_mejores_ofertas_multicriterio(self):
        """
        CU-54: Evalúa la matriz multicriterio.
        Aunque Prov A tenga un precio ligeramente menor ($20.000 vs $22.000),
        Prov B supera ampliamente en confiabilidad (95 vs 40), entrega (1 día vs 7),
        ofrece envío y es Mayorista Oficial, ganando la adjudicación.
        """
        from purchases_app.selectors import calcular_mejores_ofertas

        hoy = timezone.now().date()

        # Oferta A
        sol_a = SolicitudCotizacion.objects.create(fecha_emision=hoy, estado_solicitud=SolicitudCotizacion.ESTADO_COTIZADA)
        inv_a = InvitacionCotizar.objects.create(id_solicitud=sol_a, cuit_prov=self.prov_a, token_acceso='tok-a', estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE)
        cot_a = Cotizacion.objects.create(
            id_invitacion=inv_a,
            estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            fecha_validez=hoy + timezone.timedelta(days=10),
            tiempo_promesa=7
        )
        CotizacionProducto.objects.create(id_cotizacion=cot_a, id_producto=self.producto, precio_ofrecido=Decimal('20000.00'))

        # Oferta B
        sol_b = SolicitudCotizacion.objects.create(fecha_emision=hoy, estado_solicitud=SolicitudCotizacion.ESTADO_COTIZADA)
        inv_b = InvitacionCotizar.objects.create(id_solicitud=sol_b, cuit_prov=self.prov_b, token_acceso='tok-b', estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE)
        cot_b = Cotizacion.objects.create(
            id_invitacion=inv_b,
            estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            fecha_validez=hoy + timezone.timedelta(days=10),
            tiempo_promesa=1
        )
        CotizacionProducto.objects.create(id_cotizacion=cot_b, id_producto=self.producto, precio_ofrecido=Decimal('22000.00'))

        resultado = calcular_mejores_ofertas(
            productos_solicitados=[{'id_producto': self.producto.id_producto, 'cantidad': 5}]
        )

        self.assertEqual(len(resultado['borradores']), 1)
        borrador = resultado['borradores'][0]
        # Prov B debe ser el ganador por su puntaje ponderado global superior
        self.assertEqual(borrador['cuit_prov'], self.prov_b.cuit_prov)
        self.assertEqual(borrador['nombre_proveedor'], self.prov_b.nombre_proveedor)
        self.assertIn('evaluacion_multicriterio', borrador['items'][0])

    def test_calcular_mejores_ofertas_criterio_envio_obligatorio(self):
        """
        CU-54: Si se exige envío a domicilio obligatorio, descarta a proveedores que no ofrecen envío.
        """
        from purchases_app.selectors import calcular_mejores_ofertas
        from core_app.models import ConfiguracionSistema

        ConfiguracionSistema.objects.filter(clave='criterioObligatorio_Envio').update(valor='True')
        hoy = timezone.now().date()

        # Oferta A (precio muy bajo $10.000, pero NO ofrece envío)
        sol_a = SolicitudCotizacion.objects.create(fecha_emision=hoy, estado_solicitud=SolicitudCotizacion.ESTADO_COTIZADA)
        inv_a = InvitacionCotizar.objects.create(id_solicitud=sol_a, cuit_prov=self.prov_a, token_acceso='tok-a2', estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE)
        cot_a = Cotizacion.objects.create(
            id_invitacion=inv_a,
            estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            fecha_validez=hoy + timezone.timedelta(days=10),
            tiempo_promesa=2
        )
        CotizacionProducto.objects.create(id_cotizacion=cot_a, id_producto=self.producto, precio_ofrecido=Decimal('10000.00'))

        # Oferta B (precio $25.000, pero SÍ ofrece envío)
        sol_b = SolicitudCotizacion.objects.create(fecha_emision=hoy, estado_solicitud=SolicitudCotizacion.ESTADO_COTIZADA)
        inv_b = InvitacionCotizar.objects.create(id_solicitud=sol_b, cuit_prov=self.prov_b, token_acceso='tok-b2', estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE)
        cot_b = Cotizacion.objects.create(
            id_invitacion=inv_b,
            estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            fecha_validez=hoy + timezone.timedelta(days=10),
            tiempo_promesa=3
        )
        CotizacionProducto.objects.create(id_cotizacion=cot_b, id_producto=self.producto, precio_ofrecido=Decimal('25000.00'))

        resultado = calcular_mejores_ofertas(
            productos_solicitados=[{'id_producto': self.producto.id_producto, 'cantidad': 2}],
            requiere_envio=True
        )

        self.assertEqual(len(resultado['borradores']), 1)
        self.assertEqual(resultado['borradores'][0]['cuit_prov'], self.prov_b.cuit_prov)

    def test_obtener_proveedores_candidatos_para_cotizacion_regla_exclusion(self):
        """
        CU-14 (Regla de Sondeo Selectivo):
        NO se envían solicitudes a proveedores que YA cuentan con cotización vigente para el producto.
        Solo se incluyen proveedores que NO han cotizado ese producto o cuya cotización ha expirado.
        """
        from purchases_app.selectors import obtener_proveedores_candidatos_para_cotizacion

        hoy = timezone.now().date()

        # Prov A tiene cotización VIGENTE para el producto -> DEBE SER EXCLUIDO
        sol_a = SolicitudCotizacion.objects.create(fecha_emision=hoy, estado_solicitud=SolicitudCotizacion.ESTADO_COTIZADA)
        inv_a = InvitacionCotizar.objects.create(id_solicitud=sol_a, cuit_prov=self.prov_a, token_acceso='tok-vigente', estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE)
        cot_a = Cotizacion.objects.create(
            id_invitacion=inv_a,
            estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            fecha_validez=hoy + timezone.timedelta(days=15),
            tiempo_promesa=2
        )
        CotizacionProducto.objects.create(id_cotizacion=cot_a, id_producto=self.producto, precio_ofrecido=Decimal('30000.00'))

        # Prov B NO TIENE cotización para este producto -> DEBE SER INCLUIDO

        # Prov C tiene cotización EXPIRADA para este producto -> DEBE SER INCLUIDO para renovar precio
        sol_c = SolicitudCotizacion.objects.create(fecha_emision=hoy - timezone.timedelta(days=40), estado_solicitud=SolicitudCotizacion.ESTADO_COTIZADA)
        inv_c = InvitacionCotizar.objects.create(id_solicitud=sol_c, cuit_prov=self.prov_c, token_acceso='tok-vencido', estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE)
        cot_c = Cotizacion.objects.create(
            id_invitacion=inv_c,
            estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            fecha_validez=hoy - timezone.timedelta(days=5),  # VENCIDA
            tiempo_promesa=4
        )
        CotizacionProducto.objects.create(id_cotizacion=cot_c, id_producto=self.producto, precio_ofrecido=Decimal('32000.00'))

        candidatos = list(obtener_proveedores_candidatos_para_cotizacion(self.producto.id_producto))
        candidatos_cuits = [c.cuit_prov for c in candidatos]

        # Prov A no debe estar (su oferta está vigente)
        self.assertNotIn(self.prov_a.cuit_prov, candidatos_cuits)
        # Prov B debe estar (nunca cotizó)
        self.assertIn(self.prov_b.cuit_prov, candidatos_cuits)
        # Prov C debe estar (su oferta venció)
        self.assertIn(self.prov_c.cuit_prov, candidatos_cuits)

    def test_obtener_articulos_deficitarios_con_transito_y_lotes(self):
        """
        Detección de stock crítico considerando el stock en tránsito no vencido
        y las diferentes estrategias de cálculo de lote.
        """
        from purchases_app.selectors import obtener_articulos_deficitarios_con_transito
        from inventory_app.models import MovimientoStock

        # 1. Con stock 0 y stock_minimo 10 -> déficit detectado
        deficit = obtener_articulos_deficitarios_con_transito()
        self.assertTrue(any(d['id_producto'] == self.producto.id_producto for d in deficit))
        item_def = next(d for d in deficit if d['id_producto'] == self.producto.id_producto)
        self.assertEqual(item_def['cantidad_a_pedir'], 10)  # BRECHA_MINIMO: 10 - 0 = 10

        # 2. Si se emite una orden de compra por 10 unidades que está en tránsito vigente:
        orden_transito = OrdenCompra.objects.create(
            fecha_emision=timezone.now().date(),
            estado_orden=OrdenCompra.ESTADO_ESPERANDO_ENTREGA,
            sol_tec=False,
            tipo_entrega=OrdenCompra.TIPO_ENTREGA_RETIRO,
            cuit_prov=self.prov_b
        )
        DetalleOrdenCompra.objects.create(
            id_orden=orden_transito,
            id_producto=self.producto,
            cantidad=10,
            precio_unitario=Decimal('20000.00')
        )

        # El stock proyectado ahora es 0 + 10 = 10, cubriendo el mínimo de 10 -> Ya no es deficitario
        deficit_con_transito = obtener_articulos_deficitarios_con_transito()
        self.assertFalse(any(d['id_producto'] == self.producto.id_producto for d in deficit_con_transito))

    def test_ejecutar_ciclo_abastecimiento_completo(self):
        """
        Prueba de extremo a extremo de la ejecución autónoma del motor.
        Genera automáticamente la Orden de Compra formal con ReportLab y asiento en LogSistema.
        """
        from purchases_app.services import ejecutar_ciclo_abastecimiento_automatico

        hoy = timezone.now().date()

        # Asegurar cotización vigente para que avance a la Fase 2 y 3
        sol = SolicitudCotizacion.objects.create(fecha_emision=hoy, estado_solicitud=SolicitudCotizacion.ESTADO_COTIZADA)
        inv = InvitacionCotizar.objects.create(id_solicitud=sol, cuit_prov=self.prov_b, token_acceso='tok-auto', estado_invitacion=InvitacionCotizar.ESTADO_PENDIENTE)
        cot = Cotizacion.objects.create(
            id_invitacion=inv,
            estado_cotizacion=Cotizacion.ESTADO_ACEPTADA,
            fecha_validez=hoy + timezone.timedelta(days=15),
            tiempo_promesa=2
        )
        CotizacionProducto.objects.create(id_cotizacion=cot, id_producto=self.producto, precio_ofrecido=Decimal('24000.00'))

        resultado = ejecutar_ciclo_abastecimiento_automatico(
            usuario_ejecutor=self.admin,
            forzar_ejecucion=True,
            origen_disparo='TEST'
        )

        self.assertEqual(resultado['status'], 'COMPLETADO')
        self.assertTrue(len(resultado['ordenes_emitidas']) >= 1)
        orden_info = resultado['ordenes_emitidas'][0]
        self.assertEqual(orden_info['proveedor'], self.prov_b.nombre_proveedor)

        # Verificar que la orden exista físicamente en la BD en estado Esperando Entrega
        orden_db = OrdenCompra.objects.get(pk=orden_info['id_orden'])
        self.assertEqual(orden_db.estado_orden, OrdenCompra.ESTADO_ESPERANDO_ENTREGA)
        self.assertTrue(orden_db.detalles.filter(id_producto=self.producto).exists())

    def test_protocolo_incumplimiento_proveedor_timeout(self):
        """
        Verifica que una orden esperando entrega con sol_tec=True que superó su límite de tolerancia
        urgente sea cancelada por incumplimiento y penalice el índice de confiabilidad del proveedor.
        """
        from purchases_app.services import ejecutar_ciclo_abastecimiento_automatico

        hoy = timezone.now().date()

        # Orden urgente emitida hace 10 días por Prov A (demora esperada 7 días + 1 día tolerancia = 8 días límite < 10)
        conf_inicial = self.prov_a.indice_confiabilidad or Decimal('40.00')
        orden_vencida = OrdenCompra.objects.create(
            fecha_emision=hoy - timezone.timedelta(days=10),
            estado_orden=OrdenCompra.ESTADO_ESPERANDO_ENTREGA,
            sol_tec=True,
            tipo_entrega=OrdenCompra.TIPO_ENTREGA_RETIRO,
            cuit_prov=self.prov_a
        )
        DetalleOrdenCompra.objects.create(
            id_orden=orden_vencida,
            id_producto=self.producto,
            cantidad=3,
            precio_unitario=Decimal('20000.00')
        )

        resultado = ejecutar_ciclo_abastecimiento_automatico(
            usuario_ejecutor=self.admin,
            forzar_ejecucion=True,
            origen_disparo='TEST'
        )

        # La orden debe haber sido cancelada por incumplimiento
        orden_vencida.refresh_from_db()
        self.assertEqual(orden_vencida.estado_orden, OrdenCompra.ESTADO_CANCELADA)

        # El proveedor A debe haber recibido la penalización
        self.prov_a.refresh_from_db()
        self.assertEqual(self.prov_a.indice_confiabilidad, max(Decimal('0.00'), conf_inicial - Decimal('10.00')))

    def test_endpoints_api_ejecutar_y_estado(self):
        """
        Verifica el acceso y respuesta de los endpoints:
          POST /api/purchases/motor-abastecimiento/ejecutar/
          GET  /api/purchases/motor-abastecimiento/estado/
        """
        # 1. No autenticado -> 401
        res = self.client.post('/api/purchases/motor-abastecimiento/ejecutar/', {})
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 2. Autenticado como Técnico -> 403
        self.client.force_authenticate(user=self.tecnico)
        res = self.client.post('/api/purchases/motor-abastecimiento/ejecutar/', {})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Autenticado como Administrador -> 200
        self.client.force_authenticate(user=self.admin)
        res_ejecutar = self.client.post('/api/purchases/motor-abastecimiento/ejecutar/', {'forzar': True})
        self.assertEqual(res_ejecutar.status_code, status.HTTP_200_OK)
        self.assertIn('status', res_ejecutar.data)

        # 4. Consulta de estado -> 200
        res_estado = self.client.get('/api/purchases/motor-abastecimiento/estado/')
        self.assertEqual(res_estado.status_code, status.HTTP_200_OK)
        self.assertIn('auto_abastecimiento_activo', res_estado.data)
        self.assertIn('articulos_deficitarios', res_estado.data)
