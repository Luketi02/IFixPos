import random
from datetime import date, timedelta, time
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.contrib.auth.hashers import make_password

from users_app.models import Usuario, RolUsuario, PerfilUsuario
from geo_app.models import Pais, Provincia, Ciudad, Direccion
from catalog_app.models import (
    CategoriaProducto,
    Producto,
    TipoDispositivo,
    Marca,
    ModeloDispositivo,
)
from inventory_app.models import Stock, MovimientoStock
from workshop_app.models import (
    CategoriaReparacion,
    Dispositivo,
    Reparacion,
    Diagnostico,
    DetalleInsumoReparacion,
    BitacoraReparacion,
    Calificacion,
)
from sales_app.models import Venta, DetalleVenta, MedioPago, Pago
from purchases_app.models import (
    Proveedor,
    SolicitudCotizacion,
    SolicitudCotizacionProducto,
    InvitacionCotizar,
    Cotizacion,
    CotizacionProducto,
    OrdenCompra,
    DetalleOrdenCompra,
    RegistroCompra,
)


class Command(BaseCommand):
    help = "Puebla la base de datos con un universo amplio, realista y consistente de datos de prueba para el ERP y las Métricas de BI (CU-72 a CU-76)."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Iniciando generación de datos de prueba para IFixPos ERP..."))

        hoy = date.today()
        password_hash = make_password('Admin1234!')

        # ======================================================================
        # 1. ROLES DE USUARIO
        # ======================================================================
        rol_admin, _ = RolUsuario.objects.get_or_create(
            codigo='ADMIN',
            defaults={'nombre_rol': 'Administrador', 'descripcion': 'Gestión integral y gerencial de todo el sistema'}
        )
        rol_tec, _ = RolUsuario.objects.get_or_create(
            codigo='TECNICO',
            defaults={'nombre_rol': 'Técnico', 'descripcion': 'Diagnósticos, reparaciones y operaciones de taller'}
        )
        rol_cli, _ = RolUsuario.objects.get_or_create(
            codigo='CLIENTE',
            defaults={'nombre_rol': 'Cliente', 'descripcion': 'Clientes registrados en tienda y taller'}
        )

        # ======================================================================
        # 2. USUARIOS Y PERFILES
        # ======================================================================
        # Administradores
        admins_data = [
            ('admin@ifixpos.com', 'Lucas', 'Rossi', '35111222', '+54 9 11 4111-2233'),
            ('admin2@ifixpos.com', 'Carolina', 'Vedia', '36222333', '+54 9 11 4222-3344'),
        ]
        admins = []
        for email, nom, ape, dni, tel in admins_data:
            u, created = Usuario.objects.get_or_create(
                email=email,
                defaults={
                    'contrasena': password_hash,
                    'fecha_registro': hoy - timedelta(days=120),
                    'id_rol': rol_admin,
                    'is_active': True,
                }
            )
            PerfilUsuario.objects.update_or_create(
                id_usuario=u,
                defaults={'nombre': nom, 'apellido': ape, 'dni': dni, 'telefono': tel}
            )
            admins.append(u)

        # Técnicos Operativos
        tecnicos_data = [
            ('tecnico.marcos@ifixpos.com', 'Marcos', 'Benítez', '37333444', '+54 9 11 5333-4455'),
            ('tecnico.sofia@ifixpos.com', 'Sofía', 'Almirón', '38444555', '+54 9 11 5444-5566'),
            ('tecnico.diego@ifixpos.com', 'Diego', 'Ramírez', '39555666', '+54 9 11 5555-6677'),
            ('tecnico.valentina@ifixpos.com', 'Valentina', 'Cáceres', '40666777', '+54 9 11 5666-7788'),
            ('tecnico.lucas@ifixpos.com', 'Lucas', 'Almada', '41777888', '+54 9 11 5777-8899'),
        ]
        tecnicos = []
        for email, nom, ape, dni, tel in tecnicos_data:
            u, _ = Usuario.objects.get_or_create(
                email=email,
                defaults={
                    'contrasena': password_hash,
                    'fecha_registro': hoy - timedelta(days=90),
                    'id_rol': rol_tec,
                    'is_active': True,
                }
            )
            PerfilUsuario.objects.update_or_create(
                id_usuario=u,
                defaults={'nombre': nom, 'apellido': ape, 'dni': dni, 'telefono': tel}
            )
            tecnicos.append(u)

        # Clientes
        clientes_data = [
            ('matias.perez@gmail.com', 'Matías', 'Pérez', '33100200', '+54 9 11 6001-1001'),
            ('florencia.gomez@hotmail.com', 'Florencia', 'Gómez', '34200300', '+54 9 11 6002-2002'),
            ('agustin.torres@yahoo.com', 'Agustín', 'Torres', '35300400', '+54 9 351 6003-3003'),
            ('camila.diaz@gmail.com', 'Camila', 'Díaz', '36400500', '+54 9 341 6004-4004'),
            ('joaquin.romero@outlook.com', 'Joaquín', 'Romero', '37500600', '+54 9 261 6005-5005'),
            ('martina.lopez@gmail.com', 'Martina', 'López', '38600700', '+54 9 299 6006-6006'),
            ('franco.alvarez@gmail.com', 'Franco', 'Álvarez', '39700800', '+54 9 387 6007-7007'),
            ('lucia.castro@gmail.com', 'Lucía', 'Castro', '40800900', '+54 9 376 6008-8008'),
            ('santiago.medina@gmail.com', 'Santiago', 'Medina', '41900100', '+54 9 11 6009-9009'),
            ('valentina.ortiz@gmail.com', 'Valentina', 'Ortiz', '42010200', '+54 9 351 6010-1010'),
            ('gonzalo.silva@gmail.com', 'Gonzalo', 'Silva', '43120300', '+54 9 341 6011-1111'),
            ('micaela.suarez@gmail.com', 'Micaela', 'Suárez', '44230400', '+54 9 261 6012-1212'),
            ('tomas.blanco@gmail.com', 'Tomás', 'Blanco', '45340500', '+54 9 299 6013-1313'),
            ('jazmin.vega@gmail.com', 'Jazmín', 'Vega', '46450600', '+54 9 387 6014-1414'),
            ('esteban.morales@gmail.com', 'Esteban', 'Morales', '47560700', '+54 9 376 6015-1515'),
        ]
        clientes = []
        for email, nom, ape, dni, tel in clientes_data:
            u, _ = Usuario.objects.get_or_create(
                email=email,
                defaults={
                    'contrasena': password_hash,
                    'fecha_registro': hoy - timedelta(days=random.randint(20, 80)),
                    'id_rol': rol_cli,
                    'is_active': True,
                }
            )
            PerfilUsuario.objects.update_or_create(
                id_usuario=u,
                defaults={'nombre': nom, 'apellido': ape, 'dni': dni, 'telefono': tel}
            )
            clientes.append(u)

        self.stdout.write(self.style.SUCCESS(f"[OK] Usuarios sincronizados: {len(admins)} admins, {len(tecnicos)} técnicos, {len(clientes)} clientes."))

        # ======================================================================
        # 3. GEOGRAFÍA Y DIRECCIONES
        # ======================================================================
        pais_arg = Pais.objects.filter(nombre_pais__icontains='Argentina').first()
        if not pais_arg:
            pais_arg = Pais.objects.create(nombre_pais='Argentina', cobertura_habilitada=True)

        provincias_nombres = [
            ('Autonomous City of Buenos Aires', 'Palermo'),
            ('Buenos Aires', 'La Plata'),
            ('Buenos Aires', 'Mar del Plata'),
            ('Córdoba', 'Córdoba'),
            ('Santa Fe', 'Rosario'),
            ('Mendoza', 'Mendoza'),
            ('Misiones', 'Posadas'),
            ('Neuquén', 'Neuquén'),
            ('Salta', 'Salta'),
            ('Entre Ríos', 'Paraná'),
        ]

        ciudades_muestra = []
        for prov_nom, ciu_nom in provincias_nombres:
            prov = Provincia.objects.filter(id_pais=pais_arg, nombre_provincia__icontains=prov_nom[:7]).first()
            if not prov:
                prov = Provincia.objects.create(nombre_provincia=prov_nom, id_pais=pais_arg, cobertura_habilitada=True)

            ciu = Ciudad.objects.filter(id_provincia=prov, nombre_ciudad__icontains=ciu_nom).first()
            if not ciu:
                ciu = Ciudad.objects.create(nombre_ciudad=ciu_nom, id_provincia=prov, cobertura_habilitada=True)
            ciudades_muestra.append(ciu)

        calles_muestra = [
            'Av. Santa Fe 3420', 'Calle 50 N° 789', 'Av. Colón 1250', 'Bv. Oroño 450',
            'Av. San Martín 1820', 'Av. Corrientes 2450', 'Calle Belgrano 630', 'Av. Mitre 890',
            'Av. Alvear 1540', 'Calle Rivadavia 1120', 'Av. Libertad 330', 'Calle España 950'
        ]

        direcciones_clientes = []
        for idx, cli in enumerate(clientes):
            ciu = ciudades_muestra[idx % len(ciudades_muestra)]
            calle = calles_muestra[idx % len(calles_muestra)]
            d, _ = Direccion.objects.get_or_create(
                id_usuario=cli,
                nro_calle=calle,
                defaults={
                    'alias': f'Domicilio {idx + 1}',
                    'nombre_barrio': 'Centro / Residencial',
                    'nro_dpto': str(idx + 1) if idx % 2 == 0 else None,
                    'piso': (idx % 6) + 1 if idx % 2 == 0 else None,
                    'id_ciudad': ciu,
                    'is_active': True
                }
            )
            direcciones_clientes.append(d)

        self.stdout.write(self.style.SUCCESS(f"[OK] Direcciones creadas en {len(ciudades_muestra)} ciudades principales."))

        # ======================================================================
        # 4. MEDIOS DE PAGO
        # ======================================================================
        medios_pago_defs = [
            ('Efectivo', Decimal('0.00')),
            ('Transferencia', Decimal('0.00')),
            ('Mercado Pago', Decimal('0.00')),
            ('Tarjeta de Débito', Decimal('0.00')),
            ('Tarjeta de Crédito', Decimal('5.00')),
        ]
        medios_pago = []
        for nom, rec in medios_pago_defs:
            mp = MedioPago.objects.filter(nombre_medio_pago__icontains=nom).first()
            if not mp:
                mp = MedioPago.objects.create(nombre_medio_pago=nom, recargo=rec, estado=True)
            medios_pago.append(mp)

        # ======================================================================
        # 5. CATÁLOGO: CATEGORÍAS DE PRODUCTO, PRODUCTOS Y STOCK
        # ======================================================================
        cats_prod_defs = [
            ('Pantallas y Módulos', 'Módulos OLED, AMOLED e Incell para smartphones y tablets'),
            ('Baterías y Alimentación', 'Baterías de ion de litio originales y reforzadas'),
            ('Pines y Conectores de Carga', 'Pines Type-C, Lightning y flex auxiliares'),
            ('Placas y Circuitos Integrados', 'Chips de audio, circuitos integrados PMIC y tristar'),
            ('Accesorios y Fundas', 'Cables reforzados, fundas antigolpe y protectores cerámicos'),
            ('Cámaras y Sensores', 'Módulos de cámara trasera, frontales y flex FaceID'),
            ('Insumos de Soldadura y Taller', 'Estaño en pasta, flux, malla desoldadora y alcohol isopropílico'),
        ]
        cats_prod = []
        for nom, desc in cats_prod_defs:
            c, _ = CategoriaProducto.objects.get_or_create(
                nombre=nom,
                defaults={'descripcion': desc, 'estado': True}
            )
            cats_prod.append(c)

        productos_defs = [
            ('Módulo Display Samsung Galaxy A54 Incell', Decimal('48500.00'), cats_prod[0]),
            ('Módulo Pantalla iPhone 13 OLED Calidad Original', Decimal('92000.00'), cats_prod[0]),
            ('Módulo Display Motorola Moto G82 AMOLED', Decimal('58000.00'), cats_prod[0]),
            ('Módulo Display Xiaomi Redmi Note 12 Pro', Decimal('52000.00'), cats_prod[0]),
            ('Batería Original iPhone 11 (3110 mAh)', Decimal('32000.00'), cats_prod[1]),
            ('Batería Samsung Galaxy S22 Ultra (5000 mAh)', Decimal('38000.00'), cats_prod[1]),
            ('Batería Motorola Moto Edge 30 Neo', Decimal('29000.00'), cats_prod[1]),
            ('Batería Xiaomi Redmi Note 11 (5000 mAh)', Decimal('27500.00'), cats_prod[1]),
            ('Pin de Carga Flex Samsung A32 Type-C', Decimal('12500.00'), cats_prod[2]),
            ('Flex de Carga y Micrófono iPhone 12', Decimal('18000.00'), cats_prod[2]),
            ('Puerto de Carga USB-C Moto G52', Decimal('11500.00'), cats_prod[2]),
            ('IC de Carga Tristar iPhone 11/12', Decimal('22000.00'), cats_prod[3]),
            ('PMIC Power Management Qualcomm Snapdragon', Decimal('26000.00'), cats_prod[3]),
            ('Funda Armor Antigolpe con Anillo iPhone 13', Decimal('8500.00'), cats_prod[4]),
            ('Cable C-to-C 65W Carga Rápida 1.5m', Decimal('9800.00'), cats_prod[4]),
            ('Protector Cerámico 9D Premium Samsung S22', Decimal('4500.00'), cats_prod[4]),
            ('Cámara Trasera Principal Samsung Galaxy S21', Decimal('41000.00'), cats_prod[5]),
            ('Módulo Cámara Frontal iPhone 12 Pro', Decimal('35000.00'), cats_prod[5]),
            ('Flux en Pasta Amtech 559 UV Original (10cc)', Decimal('14500.00'), cats_prod[6]),
            ('Estaño en Pasta Mechanic 183°C (42g)', Decimal('13200.00'), cats_prod[6]),
        ]

        productos = []
        for nom, precio, cat in productos_defs:
            p, _ = Producto.objects.get_or_create(
                nombre=nom,
                defaults={
                    'descripcion': f'Repuesto e insumo técnico original garantizado: {nom}.',
                    'precio_venta': precio,
                    'estado': True,
                    'apto_venta': True,
                    'apto_reparacion': True,
                    'apto_consumible': False,
                    'modulo_automatico': True,
                    'id_categoria': cat,
                }
            )
            if not p.categorias.filter(id_categoria=cat.id_categoria).exists():
                p.categorias.add(cat)

            stk, _ = Stock.objects.get_or_create(
                id_producto=p,
                defaults={'stock_minimo': 5}
            )
            if not MovimientoStock.objects.filter(id_stock=stk, tipo_movimiento='ingreso').exists():
                MovimientoStock.objects.create(
                    id_stock=stk,
                    tipo_movimiento='ingreso',
                    cantidad=random.randint(40, 100),
                    fecha=hoy - timedelta(days=60),
                    motivo='Ingreso por inventario inicial de sistema',
                    uso_taller=True
                )
            productos.append(p)

        self.stdout.write(self.style.SUCCESS(f"[OK] Catálogo e Inventario: {len(cats_prod)} categorías y {len(productos)} repuestos/insumos con stock."))

        # ======================================================================
        # 6. CATEGORÍAS DE REPARACIÓN Y DISPOSITIVOS DE CLIENTES
        # ======================================================================
        # Tomar las categorías de reparación activas existentes o crearlas
        cats_rep = list(CategoriaReparacion.objects.filter(estado_activo=True)[:10])
        if not cats_rep:
            cats_rep_nombres = [
                'Cambio de Módulo y Pantalla',
                'Reemplazo de Batería Interna',
                'Reparación de Pin de Carga',
                'Microelectrónica y Placa',
                'Limpieza y Baño Químico por Líquidos',
                'Cámaras, Sensores y Flex',
            ]
            for nom in cats_rep_nombres:
                cr, _ = CategoriaReparacion.objects.get_or_create(
                    nombre=nom,
                    defaults={'estado_activo': True}
                )
                cats_rep.append(cr)

        # Modelos de dispositivo existentes
        modelos_existentes = list(ModeloDispositivo.objects.filter(estado_activo=True)[:15])
        if not modelos_existentes:
            marca_aux, _ = Marca.objects.get_or_create(nombre='Genérica', defaults={'estado_activo': True})
            tipo_aux, _ = TipoDispositivo.objects.get_or_create(nombre='Smartphone', defaults={'estado_activo': True})
            modelo_default = ModeloDispositivo.objects.create(
                nombre='Galaxy Standard',
                id_marca=marca_aux,
                id_tipo_dispositivo=tipo_aux,
                estado_activo=True
            )
            modelos_existentes = [modelo_default]

        # Dispositivos de clientes
        dispositivos = []
        for idx, cli in enumerate(clientes):
            for d_idx in range(2):
                mod = modelos_existentes[(idx + d_idx) % len(modelos_existentes)]
                disp, _ = Dispositivo.objects.get_or_create(
                    numero_serie=f"IMEI-35{idx:02d}{d_idx:02d}889900",
                    defaults={
                        'fecha_registro': hoy - timedelta(days=random.randint(30, 70)),
                        'id_modelo': mod,
                        'id_usuario': cli,
                        'imagen': None
                    }
                )
                dispositivos.append(disp)

        self.stdout.write(self.style.SUCCESS(f"[OK] Taller: {len(cats_rep)} categorías activas y {len(dispositivos)} dispositivos registrados."))

        # ======================================================================
        # 7. REPARACIONES, DIAGNÓSTICOS, BITÁCORAS, VENTAS Y CALIFICACIONES
        # ======================================================================
        comentarios_5 = [
            "Excelente servicio! La pantalla quedó como de fábrica y entregaron en el mismo día.",
            "Muy conforme con el arreglo. La batería dura perfectamente todo el día.",
            "Gran atención de los técnicos, muy profesionales y claros en el presupuesto.",
            "Reparación impecable de la placa madre. Daban el equipo por muerto y lo revivieron!",
            "Rápido, prolijo y a buen precio. Definitivamente volveré a reparar aquí.",
            "El cambio de pin de carga fue inmediato. Excelente predisposición de los chicos.",
            "Quedó perfecto el FaceID y la cámara frontal. Muy recomendables!",
            "Excelente laburo! Me salvaron todos los datos que tenía en el teléfono.",
        ]
        comentarios_4 = [
            "Muy buen trabajo técnico. Todo funciona como corresponde, buena atención.",
            "Buen servicio. El equipo quedó bien reparado y con repuesto de calidad.",
            "Conforme con el arreglo, muy profesionales al momento de recepcionar.",
            "Quedó excelente el display, aunque la espera en mostrador fue un poco larga.",
        ]
        comentarios_3 = [
            "El teléfono quedó bien reparado pero demoraron 2 días más de lo pactado.",
            "El arreglo funciona pero me costó comunicarme por teléfono para consultar el estado.",
        ]
        comentarios_criticos = [
            "Tardaron demasiado tiempo en conseguir el repuesto y no me avisaron a tiempo.",
            "La atención inicial fue regular y demoraron varios días en completar el diagnóstico.",
        ]

        total_reparaciones_creadas = 0

        # A. Reparaciones ENTREGADAS (Histórico cerrado - CU-73, CU-74, CU-76)
        # 30 reparaciones distribuidas en los últimos 28 días
        for idx in range(30):
            dias_atras = random.randint(2, 28)
            f_inicio = hoy - timedelta(days=dias_atras)
            delta_entrega = random.randint(1, 3)
            f_entrega = f_inicio + timedelta(days=delta_entrega)
            if f_entrega > hoy:
                f_entrega = hoy

            disp = dispositivos[idx % len(dispositivos)]
            tec = tecnicos[idx % len(tecnicos)]
            cat = cats_rep[idx % len(cats_rep)]
            mp = medios_pago[idx % len(medios_pago)]

            costo_mo = Decimal(random.choice([22000, 28000, 35000, 48000, 56000, 68000]))

            # Venta y Cobro de liquidación en caja
            v_rep = Venta.objects.create(
                metodo_entrega='RETIRO_EN_SUCURSAL',
                fecha_venta=f_entrega,
                estado_venta='FINALIZADA',
                codigo_sec=f"VTA-REP-{idx+300}-{hoy.strftime('%m%d')}",
                monto_subtotal=costo_mo,
                costo_envio=Decimal('0.00'),
                id_usuario=disp.id_usuario,
                id_direccion_envio=None
            )
            Pago.objects.create(
                medio_pago=mp,
                monto_pagado=costo_mo,
                fecha_pago=f_entrega,
                detalle=f"Cobro por orden de servicio técnico: {cat.nombre}",
                cod_operacion=f"PAY-REP-{idx+5000}",
                id_venta=v_rep
            )

            rep = Reparacion.objects.create(
                fecha_inicio=f_inicio,
                hora_recepcion=time(10, random.randint(10, 55)),
                fecha_entrega=f_entrega,
                etapa='ENTREGADA',
                codigo_sec=f"SEC-ENT-{idx+1000}",
                desc_cliente=f"Falla reportada en {cat.nombre.lower()}",
                id_dispositivo=disp,
                id_usuario=tec,
                id_venta=v_rep
            )
            rep.categorias.add(cat)

            # Insumo utilizado en taller
            prod_insumo = productos[idx % len(productos)]
            DetalleInsumoReparacion.objects.create(
                cantidad=1,
                precio_unitario=prod_insumo.precio_venta,
                id_reparacion=rep,
                id_producto=prod_insumo
            )

            # Diagnóstico Aceptado
            Diagnostico.objects.create(
                descripcion_falla=f"Diagnóstico técnico verificado: requiere {cat.nombre.lower()}",
                fecha_diagnostico=f_inicio,
                costo_diagnostico=costo_mo,
                id_reparacion=rep
            )

            # Bitácora (Trazabilidad y disciplina - CU-74)
            BitacoraReparacion.objects.create(
                fecha_hora=time(10, 30),
                estado_alcanzado=1,  # Ingreso
                comentario="Recepción física y registro técnico de ingreso.",
                id_reparacion=rep,
                id_usuario=tec
            )
            BitacoraReparacion.objects.create(
                fecha_hora=time(11, 45),
                estado_alcanzado=3,  # En Diagnóstico
                comentario="Inspección en laboratorio completada. Presupuesto emitido.",
                id_reparacion=rep,
                id_usuario=tec
            )
            BitacoraReparacion.objects.create(
                fecha_hora=time(14, 15),
                estado_alcanzado=5,  # Aceptado por cliente / En Reparación
                comentario="Cliente confirmó presupuesto. Inicio de intervención en banco de trabajo.",
                id_reparacion=rep,
                id_usuario=tec
            )
            BitacoraReparacion.objects.create(
                fecha_hora=time(17, 30),
                estado_alcanzado=7,  # Entregado
                comentario="Pruebas de estrés superadas y entrega conforme al cliente.",
                id_reparacion=rep,
                id_usuario=tec
            )

            # Calificación (CSAT - CU-76)
            if idx < 24:
                if idx < 15:
                    punt = 5
                    com = random.choice(comentarios_5)
                elif idx < 19:
                    punt = 4
                    com = random.choice(comentarios_4)
                elif idx < 21:
                    punt = 3
                    com = random.choice(comentarios_3)
                else:
                    punt = random.choice([1, 2])
                    com = random.choice(comentarios_criticos)

                Calificacion.objects.create(
                    puntuacion=punt,
                    comentario=com,
                    fecha=f_entrega,
                    id_reparacion=rep
                )

            total_reparaciones_creadas += 1

        # B. Presupuestos RECHAZADOS (Lucro cesante y fuga comercial - CU-72)
        # 8 presupuestos rechazados
        for idx in range(8):
            dias_atras = random.randint(2, 25)
            f_inicio = hoy - timedelta(days=dias_atras)
            disp = dispositivos[(idx + 10) % len(dispositivos)]
            tec = tecnicos[idx % len(tecnicos)]
            cat = cats_rep[(idx + 2) % len(cats_rep)]
            costo_perdido = Decimal(random.choice([32000, 45000, 58000, 72000, 85000]))

            rep = Reparacion.objects.create(
                fecha_inicio=f_inicio,
                hora_recepcion=time(11, 0),
                fecha_entrega=None,
                etapa='CANCELADA',
                codigo_sec=f"RECH-{idx+100}",
                desc_cliente=f"Revisión de equipo para {cat.nombre.lower()}",
                id_dispositivo=disp,
                id_usuario=tec,
            )
            rep.categorias.add(cat)

            Diagnostico.objects.create(
                descripcion_falla=f"Cotización formal emitida para reparación de {cat.nombre.lower()}",
                fecha_diagnostico=f_inicio,
                costo_diagnostico=costo_perdido,
                id_reparacion=rep
            )

            BitacoraReparacion.objects.create(
                fecha_hora=time(11, 30),
                estado_alcanzado=2,
                comentario="Presupuesto calculado y notificado al cliente.",
                id_reparacion=rep,
                id_usuario=tec
            )
            BitacoraReparacion.objects.create(
                fecha_hora=time(16, 20),
                estado_alcanzado=8,  # CANCELADO / RECHAZADO
                comentario="Cliente rechazó el presupuesto por costo elevado. Equipo devuelto sin reparar.",
                id_reparacion=rep,
                id_usuario=tec
            )
            total_reparaciones_creadas += 1

        # C. Carga Viva en Taller en Tiempo Real (Balanceo técnico - CU-74)
        # 16 reparaciones activas actualmente (en diagnóstico, en reparación, esperando repuestos)
        cargas_por_tecnico = {
            tecnicos[0]: 4,  # Marcos: 4 activos (Carga Óptima)
            tecnicos[1]: 2,  # Sofía: 2 activos (Disponible)
            tecnicos[2]: 6,  # Diego: 6 activos (Sobrecarga)
            tecnicos[3]: 3,  # Valentina: 3 activos (Carga Óptima)
            tecnicos[4]: 1,  # Lucas: 1 activo (Disponible)
        }

        for tec, cant in cargas_por_tecnico.items():
            for c_idx in range(cant):
                f_inicio = hoy - timedelta(days=random.randint(0, 3))
                disp = dispositivos[(total_reparaciones_creadas + c_idx) % len(dispositivos)]
                cat = cats_rep[c_idx % len(cats_rep)]
                etapa_activa = random.choice(['EN_REPARACION', 'ESPERANDO_REPUESTOS', 'ESPERANDO_DIAGNOSTICO'])

                rep = Reparacion.objects.create(
                    fecha_inicio=f_inicio,
                    hora_recepcion=time(9, random.randint(15, 45)),
                    fecha_entrega=None,
                    etapa=etapa_activa,
                    codigo_sec=f"VIVA-{total_reparaciones_creadas}",
                    desc_cliente=f"Falla concurrente en {cat.nombre.lower()}",
                    id_dispositivo=disp,
                    id_usuario=tec,
                )
                rep.categorias.add(cat)

                Diagnostico.objects.create(
                    descripcion_falla=f"En proceso de intervención técnica para {cat.nombre.lower()}",
                    fecha_diagnostico=f_inicio,
                    costo_diagnostico=Decimal('32000.00'),
                    id_reparacion=rep
                )

                BitacoraReparacion.objects.create(
                    fecha_hora=time(10, 0),
                    estado_alcanzado=5 if etapa_activa == 'EN_REPARACION' else 9 if etapa_activa == 'ESPERANDO_REPUESTOS' else 2,
                    comentario=f"Dispositivo en etapa viva de taller: {etapa_activa}",
                    id_reparacion=rep,
                    id_usuario=tec
                )
                total_reparaciones_creadas += 1

        self.stdout.write(self.style.SUCCESS(f"[OK] Reparaciones: {total_reparaciones_creadas} órdenes creadas (30 Entregadas con pagos, 8 Rechazadas con lucro cesante y 16 Carga Viva)."))

        # ======================================================================
        # 8. VENTAS E-COMMERCE Y PRESENCIALES (CU-75 LOGÍSTICA & CU-38 CAJA)
        # ======================================================================
        total_ventas_creadas = 0

        # A. Ventas E-commerce con Envío a Domicilio (distribución geográfica)
        for idx in range(35):
            dias_atras = random.randint(1, 28)
            f_venta = hoy - timedelta(days=dias_atras)
            cli = clientes[idx % len(clientes)]
            dir_envio = direcciones_clientes[idx % len(direcciones_clientes)]
            mp = random.choice(medios_pago)

            costo_env = Decimal(random.choice([3800, 4500, 5200, 6800, 7500, 8900]))
            subtotal = Decimal('0.00')

            v = Venta.objects.create(
                metodo_entrega='ENVIO_A_DOMICILIO',
                fecha_venta=f_venta,
                estado_venta='FINALIZADA',
                codigo_sec=f"VTA-ENV-{idx+500}-{hoy.strftime('%m%d')}",
                monto_subtotal=Decimal('0.00'),
                costo_envio=costo_env,
                id_usuario=cli,
                id_direccion_envio=dir_envio
            )

            prods_venta = random.sample(productos, random.randint(1, 3))
            for p in prods_venta:
                cant = random.randint(1, 2)
                sub = p.precio_venta * cant
                subtotal += sub
                DetalleVenta.objects.create(
                    cantidad=cant,
                    precio_unitario=p.precio_venta,
                    subtotal=sub,
                    id_venta=v,
                    id_producto=p
                )

            v.monto_subtotal = subtotal
            v.save(update_fields=['monto_subtotal'])

            Pago.objects.create(
                medio_pago=mp,
                monto_pagado=subtotal + costo_env,
                fecha_pago=f_venta,
                detalle=f"Pago liquidado de orden de e-commerce con envío a domicilio a {dir_envio.id_ciudad.nombre_ciudad}",
                cod_operacion=f"OP-ECOMM-{idx+7000}",
                id_venta=v
            )
            total_ventas_creadas += 1

        # B. Ventas Presenciales de Mostrador (Sin envío)
        for idx in range(15):
            dias_atras = random.randint(1, 25)
            f_venta = hoy - timedelta(days=dias_atras)
            cli = clientes[idx % len(clientes)]
            mp = medios_pago[0] if idx % 2 == 0 else medios_pago[2]

            subtotal = Decimal('0.00')
            v = Venta.objects.create(
                metodo_entrega='RETIRO_EN_SUCURSAL',
                fecha_venta=f_venta,
                estado_venta='FINALIZADA',
                codigo_sec=f"VTA-POS-{idx+800}-{hoy.strftime('%m%d')}",
                monto_subtotal=Decimal('0.00'),
                costo_envio=Decimal('0.00'),
                id_usuario=cli,
                id_direccion_envio=None
            )

            p = random.choice(productos)
            cant = random.randint(1, 3)
            sub = p.precio_venta * cant
            DetalleVenta.objects.create(
                cantidad=cant,
                precio_unitario=p.precio_venta,
                subtotal=sub,
                id_venta=v,
                id_producto=p
            )
            v.monto_subtotal = sub
            v.save(update_fields=['monto_subtotal'])

            Pago.objects.create(
                medio_pago=mp,
                monto_pagado=sub,
                fecha_pago=f_venta,
                detalle="Cobro de ticket de venta presencial en mostrador",
                cod_operacion=f"POS-CASH-{idx+2000}",
                id_venta=v
            )
            total_ventas_creadas += 1

        self.stdout.write(self.style.SUCCESS(f"[OK] Ventas: {total_ventas_creadas} transacciones comerciales (35 E-Commerce con despacho y 15 Mostrador)."))

        # ======================================================================
        # 9. PROVEEDORES Y COMPRAS
        # ======================================================================
        proveedores_defs = [
            ('30-71458921-9', 'ElectroParts Import S.R.L.', 'ventas@electroparts.com.ar', '+54 11 4789-1122'),
            ('30-71894523-4', 'GlobalTech Distribuciones Mayoristas', 'contacto@globaltech.com.ar', '+54 11 4899-3344'),
            ('30-71239854-1', 'MicroFix Repuestos Córdoba', 'pedidos@microfix.com.ar', '+54 351 456-7890'),
            ('30-71654321-7', 'Rosario Componentes Electrónicos', 'info@rosariocomp.com.ar', '+54 341 423-8899'),
        ]

        provs_creados = []
        for cuit, nom, mail, tel in proveedores_defs:
            p, _ = Proveedor.objects.get_or_create(
                cuit_prov=cuit,
                defaults={
                    'nombre_proveedor': nom,
                    'correo': mail,
                    'telefono': tel,
                    'estado': True,
                    'ofrece_envio': True,
                    'indice_confiabilidad': Decimal('9.50'),
                    'tiempo_promedio_entrega': 3,
                    'nivel': 'Mayorista Oficial',
                    'id_direccion': direcciones_clientes[0] if direcciones_clientes else None
                }
            )
            provs_creados.append(p)

        self.stdout.write(self.style.SUCCESS(f"[OK] Compras: {len(provs_creados)} proveedores comerciales sincronizados."))

        self.stdout.write(self.style.SUCCESS("""
==============================================================================
 ¡BASE DE DATOS POBLADA EXITOSAMENTE CON DATOS REALISTAS!
==============================================================================
• Usuarios: 2 Administradores, 5 Técnicos con perfiles completos y 15 Clientes activos.
• Catálogo e Inventario: 7 Categorías y 20 Artículos con existencias físicas en Stock.
• Taller y Servicios:
    - 30 Reparaciones Entregadas con venta/cobro liquidado y piezas de insumo asignadas.
    - 8 Reparaciones Rechazadas para cálculo de lucro cesante y embudo comercial (CU-72).
    - 16 Reparaciones Activas vivas distribuidas entre técnicos para balanceo en tiempo real (CU-74).
    - 24 Calificaciones CSAT con comentarios y notas de 1 estrellas a 5 estrellas para calidad (CU-76).
• E-Commerce y Ventas:
    - 35 Ventas con Envíos a Domicilio a CABA, Buenos Aires, Córdoba, Rosario, Mendoza, Salta y Posadas (CU-75).
    - 15 Ventas Presenciales de Mostrador con liquidación en Caja (CU-38).
    - 80 Pagos registrados en total distribuidos entre los 5 medios de pago.
==============================================================================
"""))
