from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError, ObjectDoesNotExist

from sales_app.serializers import RealizarCompraInputSerializer, VentaOutputSerializer
from sales_app.services import procesar_compra_virtual


def _exigir_rol_cliente(user) -> None:
    """
    Seguridad horizontal del carrito: el carrito de compras es un recurso exclusivo
    del rol CLIENTE. Cualquier otro rol autenticado recibe 403.
    """
    rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
    codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
    if codigo_rol != 'CLIENTE':
        raise PermissionDenied("El carrito de compras es de uso exclusivo para clientes.")


class RealizarCompraVirtualApi(APIView):
    """
    CU-18: Realizar Compra Virtual (Checkout e-commerce).
    Permite a un cliente autenticado finalizar la compra de los artículos de su carrito.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_cliente(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol not in ['CLIENTE', 'ADMIN']:
            raise PermissionDenied("Se requiere poseer rol de Cliente para realizar compras virtuales.")

    def post(self, request):
        self._verificar_cliente(request.user)

        serializer = RealizarCompraInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            venta = procesar_compra_virtual(
                usuario_cliente=request.user,
                datos_compra=serializer.validated_data
            )
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output = VentaOutputSerializer(venta)
        return Response(
            {
                "mensaje": "Compra virtual procesada con éxito.",
                "id_venta": venta.id_venta,
                "venta": output.data
            },
            status=status.HTTP_201_CREATED
        )


class AgregarAlCarritoApi(APIView):
    """
    Endpoint para agregar productos al carrito de compras virtual del cliente.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _exigir_rol_cliente(request.user)
        from sales_app.serializers import AgregarAlCarritoInputSerializer
        from sales_app.services import agregar_producto_a_carrito

        serializer = AgregarAlCarritoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        id_producto = serializer.validated_data['id_producto']
        cantidad = serializer.validated_data.get('cantidad', 1)

        try:
            resultado = agregar_producto_a_carrito(
                usuario=request.user,
                id_producto=id_producto,
                cantidad=cantidad
            )
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "mensaje": f"¡{resultado['producto_nombre']} agregado al carrito! :3",
                "resultado": resultado
            },
            status=status.HTTP_200_OK
        )


class CarritoDetalleApi(APIView):
    """
    Endpoint para consultar el estado actual del carrito de compras del usuario autenticado.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_cliente(request.user)
        from sales_app.selectors import obtener_resumen_carrito
        from sales_app.serializers import CarritoResumenOutputSerializer

        resumen = obtener_resumen_carrito(usuario=request.user)
        serializer = CarritoResumenOutputSerializer(resumen)
        return Response(serializer.data, status=status.HTTP_200_OK)


class QuitarDelCarritoApi(APIView):
    """
    Endpoint para remover o decrementar artículos del carrito de compras virtual.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _exigir_rol_cliente(request.user)
        from sales_app.serializers import QuitarDelCarritoInputSerializer
        from sales_app.services import quitar_producto_de_carrito

        serializer = QuitarDelCarritoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        id_producto = serializer.validated_data['id_producto']
        cantidad = serializer.validated_data.get('cantidad', None)

        try:
            resultado = quitar_producto_de_carrito(
                usuario=request.user,
                id_producto=id_producto,
                cantidad=cantidad
            )
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        mensaje = (
            f"Producto '{resultado['producto_nombre']}' eliminado del carrito."
            if resultado['eliminado_completo']
            else f"Se actualizó la cantidad de '{resultado['producto_nombre']}' en tu carrito."
        )

        return Response(
            {
                "mensaje": mensaje,
                "resultado": resultado
            },
            status=status.HTTP_200_OK
        )


class ActualizarCantidadCarritoApi(APIView):
    """
    Endpoint para establecer directamente la cantidad absoluta de un producto en el carrito activo.
    Elimina por completo condiciones de carrera y desincronizaciones de red.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _exigir_rol_cliente(request.user)
        from sales_app.serializers import ActualizarCantidadCarritoInputSerializer
        from sales_app.services import actualizar_cantidad_producto_carrito

        serializer = ActualizarCantidadCarritoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        id_producto = serializer.validated_data['id_producto']
        cantidad = serializer.validated_data['cantidad']

        try:
            resultado = actualizar_cantidad_producto_carrito(
                usuario=request.user,
                id_producto=id_producto,
                cantidad=cantidad
            )
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        mensaje = (
            f"Producto '{resultado['producto_nombre']}' eliminado del carrito."
            if resultado['eliminado']
            else f"Cantidad de '{resultado['producto_nombre']}' actualizada a {resultado['cantidad']}."
        )

        return Response(
            {
                "mensaje": mensaje,
                "resultado": resultado
            },
            status=status.HTTP_200_OK
        )


class CompletarPagoApi(APIView):
    """
    CU-21: Completar pago y CU-20: Generar Factura.
    Permite a un Técnico o Administrador registrar formalmente el cobro de una
    operación pendiente (Venta o Reparación) identificándola por código o email.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_rol_cajero(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol not in ['TECNICO', 'ADMIN']:
            raise PermissionDenied("Se requiere poseer rol de Técnico o Administrador para completar cobros.")

    def get(self, request, identificador=None):
        self._verificar_rol_cajero(request.user)

        from sales_app.selectors import buscar_operacion_pendiente_cobro
        from sales_app.services import _calcular_total_operacion
        from sales_app.models import Venta
        from workshop_app.models import Reparacion
        from django.core.exceptions import ObjectDoesNotExist

        from sales_app.serializers import BuscarOperacionCobroInputSerializer
        input_query = BuscarOperacionCobroInputSerializer(data=request.query_params)
        input_query.is_valid(raise_exception=True)

        ident = identificador or input_query.validated_data.get('identificador')
        if not ident:
            return Response(
                {"error": "Debe especificar el código de seguridad o correo del cliente."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            operacion = buscar_operacion_pendiente_cobro(identificador=ident)
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

        total_adeudado = _calcular_total_operacion(operacion)
        cliente = getattr(operacion, 'id_usuario', None)
        cliente_nombre = "Cliente"
        cliente_dni = ""
        cliente_email = ""
        if cliente:
            cliente_email = cliente.email or ""
            perfil = getattr(cliente, 'perfilusuario', None)
            if perfil:
                cliente_nombre = f"{perfil.nombre or ''} {perfil.apellido or ''}".strip() or cliente_email
                cliente_dni = perfil.dni or ""
            else:
                cliente_nombre = cliente_email

        if isinstance(operacion, Venta):
            tipo_operacion = "Venta"
            id_operacion = operacion.id_venta
            items = [
                {
                    "producto": det.id_producto.nombre if det.id_producto else "Producto",
                    "cantidad": det.cantidad,
                    "precio_unitario": str(det.precio_unitario),
                    "subtotal": str(det.subtotal)
                }
                for det in operacion.detalleventa_set.all()
            ]
            estado = operacion.estado_venta
        else:
            tipo_operacion = "Reparación"
            id_operacion = operacion.id_reparacion
            items = []
            diag = operacion.diagnostico_set.order_by('-id_diagnostico').first()
            if diag and diag.costo_diagnostico:
                items.append({
                    "producto": f"Diagnóstico / Mano de Obra ({diag.descripcion_falla[:40]}...)",
                    "cantidad": 1,
                    "precio_unitario": str(diag.costo_diagnostico),
                    "subtotal": str(diag.costo_diagnostico)
                })
            for insumo in operacion.detalleinsumoreparacion_set.all():
                st = Decimal(str(insumo.cantidad or 0)) * Decimal(str(insumo.precio_unitario or 0))
                items.append({
                    "producto": insumo.id_producto.nombre if insumo.id_producto else "Insumo",
                    "cantidad": insumo.cantidad,
                    "precio_unitario": str(insumo.precio_unitario),
                    "subtotal": str(st)
                })
            estado = operacion.etapa

        return Response(
            {
                "id_operacion": id_operacion,
                "tipo_operacion": tipo_operacion,
                "codigo_seguridad": operacion.codigo_sec or "",
                "estado": estado,
                "cliente": {
                    "nombre": cliente_nombre,
                    "email": cliente_email,
                    "dni": cliente_dni
                },
                "total_a_cobrar": str(total_adeudado),
                "items": items
            },
            status=status.HTTP_200_OK
        )

    def post(self, request, identificador=None):
        self._verificar_rol_cajero(request.user)


        from sales_app.serializers import CompletarPagoInputSerializer, BuscarOperacionCobroInputSerializer
        from sales_app.selectors import buscar_operacion_pendiente_cobro
        from sales_app.services import registrar_cobro_operacion
        from django.core.exceptions import ObjectDoesNotExist

        input_query = BuscarOperacionCobroInputSerializer(data=request.query_params)
        input_query.is_valid(raise_exception=True)

        # El identificador puede venir en la URL, query params o en el body
        ident = identificador or input_query.validated_data.get('identificador') or request.data.get('identificador')
        if not ident:
            return Response(
                {"error": "Debe especificar el código de seguridad o correo del cliente para localizar la operación."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = CompletarPagoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            operacion = buscar_operacion_pendiente_cobro(identificador=ident)
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            pago = registrar_cobro_operacion(
                usuario_ejecutor=request.user,
                operacion=operacion,
                datos_validados=serializer.validated_data
            )
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "mensaje": "Cobro registrado con éxito y comprobante generado.",
                "id_pago": pago.id_pago,
                "monto_pagado": str(pago.monto_pagado),
                "ruta_comprobante": pago.ruta_comprobante
            },
            status=status.HTTP_201_CREATED
        )


# ==============================================================================
# CU-38: FILTRAR COBROS Y PAGOS (AUDITORÍA FINANCIERA Y ARQUEO DE CAJA)
# ==============================================================================

class FiltrarCobrosPagosApi(APIView):
    """
    CU-38: Filtrar Cobros y Pagos.
    Permite al personal responsable de la caja y administración (ADMIN y TECNICO)
    auditar el flujo de caja del negocio, localizando transacciones financieras exactas
    o agrupando operaciones según su estado de liquidación, método de cobro y período contable.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_rol_auditoria(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol not in ['ADMIN', 'TECNICO']:
            raise PermissionDenied("Se requiere poseer rol de Administrador o Técnico para filtrar cobros y pagos.")

    def get(self, request):
        self._verificar_rol_auditoria(request.user)

        from sales_app.serializers import FiltroCobrosPagosInputSerializer, TransaccionCobroPagoOutputSerializer
        from sales_app.selectors import filtrar_cobros_y_pagos
        from sales_app.services import registrar_auditoria_filtro_cobros

        serializer = FiltroCobrosPagosInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        filtros = serializer.validated_data

        # Capa de lectura pura (Selector)
        resultado = filtrar_cobros_y_pagos(
            usuario_ejecutor=request.user,
            filtros=filtros
        )

        # Auditoría estricta en LogSistema (Service)
        registrar_auditoria_filtro_cobros(
            usuario_ejecutor=request.user,
            filtros_aplicados=filtros,
            cantidad_encontrada=resultado['total_transacciones']
        )

        output_serializer = TransaccionCobroPagoOutputSerializer(resultado['resultados'], many=True)
        datos_serializados = output_serializer.data

        # Excepción Paso 5: si no se hallan registros
        if not datos_serializados:
            return Response(
                {
                    "mensaje": "No se encontraron resultados",
                    "total_transacciones": 0,
                    "resumen": resultado['resumen'],
                    "resultados": []
                },
                status=status.HTTP_200_OK
            )

        return Response(
            {
                "mensaje": "Transacciones comerciales filtradas con éxito.",
                "total_transacciones": resultado['total_transacciones'],
                "resumen": resultado['resumen'],
                "resultados": datos_serializados
            },
            status=status.HTTP_200_OK
        )


# ==============================================================================
# CU-70: FILTRAR BENEFICIOS OTORGADOS
# ==============================================================================

class FiltrarBeneficiosOtorgadosApi(APIView):
    """
    CU-70: Filtrar Beneficios Otorgados.
    Endpoint exclusivo para Administradores.
    Permite auditar el historial de recomendaciones, cupones y descuentos otorgados
    por el motor predictivo y de fidelización comercial.
    """
    permission_classes = [IsAuthenticated]

    def _exigir_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Se requiere rol de Administrador para consultar el historial de beneficios.")

    def get(self, request):
        self._exigir_admin(request.user)

        from sales_app.selectors import filtrar_beneficios_otorgados
        from sales_app.serializers import FiltrarBeneficiosInputSerializer, BeneficioOtorgadoOutputSerializer

        serializer = FiltrarBeneficiosInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        beneficios = filtrar_beneficios_otorgados(
            usuario_ejecutor=request.user,
            filtros=serializer.validated_data
        )

        output = BeneficioOtorgadoOutputSerializer(beneficios, many=True)
        return Response(output.data, status=status.HTTP_200_OK)


# ==============================================================================
# CU-82: REGISTRAR MEDIO DE PAGO
# ==============================================================================

from sales_app.serializers import RegistrarMedioPagoInputSerializer, MedioPagoOutputSerializer
from sales_app.services import registrar_o_reactivar_medio_pago
from sales_app.selectors import obtener_medios_pago

class RegistrarMedioPagoApi(APIView):
    """
    CU-82: Registrar medio de pago y consulta de medios de pago disponibles (CU-18).
    Permite al Administrador dar de alta un nuevo canal de cobro o reactivar uno existente,
    y a cualquier cliente o invitado consultar los canales de cobro activos para abonar su compra.
    """
    permission_classes = [AllowAny]

    def _verificar_admin(self, user):
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
        return codigo_rol == 'ADMIN' or nombre_rol == 'administrador'

    def get(self, request):
        es_admin = False
        if request.user and getattr(request.user, 'is_authenticated', False):
            rol = getattr(request.user, 'id_rol', None) or getattr(request.user, 'rol', None)
            codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
            nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
            es_admin = codigo_rol == 'ADMIN' or nombre_rol == 'administrador'
        
        ver_todos = es_admin and request.query_params.get('todos', '').lower() == 'true'
        medios = obtener_medios_pago(solo_activos=not ver_todos)
        serializer = MedioPagoOutputSerializer(medios, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        if not self._verificar_admin(request.user):
            return Response(
                {"error": "Acceso restringido. Solo los administradores pueden registrar o reactivar medios de pago."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = RegistrarMedioPagoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            medio_pago = registrar_o_reactivar_medio_pago(
                usuario_admin=request.user,
                datos_validados=serializer.validated_data
            )
        except DjangoValidationError as e:
            return Response(
                {"detail": e.message_dict if hasattr(e, 'message_dict') else (e.messages if hasattr(e, 'messages') else str(e))},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_serializer = MedioPagoOutputSerializer(medio_pago)
        return Response(
            {
                "mensaje": "Medio de pago registrado con éxito.",
                "medio_pago": output_serializer.data
            },
            status=status.HTTP_201_CREATED
        )



# ==============================================================================
# CU-83: CAMBIAR ESTADO DE MEDIO DE PAGO
# ==============================================================================

from sales_app.serializers import AlternarEstadoMedioPagoInputSerializer
from sales_app.services import alternar_estado_medio_pago

class AlternarEstadoMedioPagoApi(APIView):
    """
    CU-83: Cambiar estado de medio de pago.
    Permite al Administrador alternar entre Activo e Inactivo un canal de cobro.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
        return codigo_rol == 'ADMIN' or nombre_rol == 'administrador'

    def patch(self, request, id_medio_pago: int):
        if not self._verificar_admin(request.user):
            return Response(
                {"error": "Acceso restringido. Solo los administradores pueden cambiar el estado de los medios de pago."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = AlternarEstadoMedioPagoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            medio_pago = alternar_estado_medio_pago(
                usuario_admin=request.user,
                id_medio_pago=id_medio_pago
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except DjangoValidationError as e:
            return Response(
                {"detail": e.message_dict if hasattr(e, 'message_dict') else (e.messages if hasattr(e, 'messages') else str(e))},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_serializer = MedioPagoOutputSerializer(medio_pago)
        mensaje_exito = (
            "Medio de pago activado con éxito."
            if medio_pago.estado else
            "Medio de pago desactivado con éxito."
        )

        return Response(
            {
                "mensaje": mensaje_exito,
                "medio_pago": output_serializer.data
            },
            status=status.HTTP_200_OK
        )

    def post(self, request, id_medio_pago: int):
        return self.patch(request, id_medio_pago)


# ==============================================================================
# CU-67: REALIZAR VENTA PRESENCIAL
# ==============================================================================

from sales_app.serializers import RealizarVentaPresencialInputSerializer
from sales_app.services import crear_venta_presencial

class RealizarVentaPresencialApi(APIView):
    """
    CU-67: Realizar Venta Presencial.
    Permite al personal operativo de mostrador (Técnico o Administrador)
    registrar una venta directa de productos, congelando precios y descontando inventario,
    dejándola en estado PENDIENTE para su cobro y facturación.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_operador(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
        return codigo_rol in ['ADMIN', 'TECNICO'] or nombre_rol in ['administrador', 'técnico', 'tecnico']

    def post(self, request):
        if not self._verificar_operador(request.user):
            return Response(
                {"error": "Acceso restringido. Solo el personal de administración o técnico puede registrar ventas presenciales."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = RealizarVentaPresencialInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            venta, warnings, ruta_pdf = crear_venta_presencial(
                usuario_cajero=request.user,
                datos_validados=serializer.validated_data
            )
        except DjangoValidationError as e:
            return Response(
                {"detail": e.message_dict if hasattr(e, 'message_dict') else (e.messages if hasattr(e, 'messages') else str(e))},
                status=status.HTTP_400_BAD_REQUEST
            )

        if ruta_pdf:
            return Response(
                {
                    "mensaje": "Venta presencial y cobro registrados exitosamente en mostrador.",
                    "id_venta": venta.id_venta,
                    "codigo_seguridad": venta.codigo_sec,
                    "monto_total": str(venta.monto_subtotal),
                    "estado_venta": venta.estado_venta,
                    "cliente": venta.id_usuario.email if venta.id_usuario else "Consumidor Final",
                    "advertencias_stock": warnings,
                    "cobrada": True,
                    "ruta_comprobante": ruta_pdf
                },
                status=status.HTTP_201_CREATED
            )

        return Response(
            {
                "mensaje": "Venta presencial registrada pendiente de cobro",
                "id_venta": venta.id_venta,
                "codigo_seguridad": venta.codigo_sec,
                "monto_total": str(venta.monto_subtotal),
                "estado_venta": venta.estado_venta,
                "cliente": venta.id_usuario.email if venta.id_usuario else "Consumidor Final",
                "advertencias_stock": warnings,
                "cobrada": False
            },
            status=status.HTTP_201_CREATED
        )


# ==============================================================================
# CU-69: AUDITAR HISTORIAL DE BENEFICIOS Y PROMOCIONES (APIS)
# ==============================================================================

from sales_app.selectors import obtener_historial_beneficios
from sales_app.serializers import BeneficioListOutputSerializer, BeneficioDetailOutputSerializer
from sales_app.services import auditar_inspeccion_beneficio

class ListarHistorialBeneficiosApi(APIView):
    """
    CU-69: Auditar Historial de Beneficios y Promociones (Listado Consolidado).
    Permite al perfil gerencial (Administrador) listar y consultar todas las sugerencias,
    descuentos y beneficios emitidos por el motor algorítmico de fidelización.
    """
    permission_classes = [IsAuthenticated]

    def _exigir_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
        if codigo_rol != 'ADMIN' and nombre_rol != 'administrador':
            raise PermissionDenied("Se requiere rol de Administrador para auditar el historial de beneficios.")

    def get(self, request):
        self._exigir_admin(request.user)

        from sales_app.serializers import FiltrarHistorialBeneficiosInputSerializer
        input_serializer = FiltrarHistorialBeneficiosInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)

        beneficios = obtener_historial_beneficios(filtros=dict(input_serializer.validated_data))
        serializer = BeneficioListOutputSerializer(beneficios, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class InspeccionarBeneficioApi(APIView):
    """
    CU-69: Inspección de Expediente de Beneficio.
    Expone el detalle técnico del disparo algorítmico y genera obligatoriamente
    la traza de auditoría en LogSistema.
    """
    permission_classes = [IsAuthenticated]

    def _exigir_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
        if codigo_rol != 'ADMIN' and nombre_rol != 'administrador':
            raise PermissionDenied("Se requiere rol de Administrador para auditar beneficios.")

    def get(self, request, id_beneficio: int):
        self._exigir_admin(request.user)

        try:
            beneficio = auditar_inspeccion_beneficio(
                usuario_admin=request.user,
                id_beneficio=id_beneficio
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = BeneficioDetailOutputSerializer(beneficio)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ==============================================================================
# CU-71: REVOCAR BENEFICIO ACTIVO (APIS)
# ==============================================================================

from sales_app.serializers import RevocarBeneficioInputSerializer
from sales_app.services import revocar_beneficio_activo

class RevocarBeneficioApi(APIView):
    """
    CU-71: Revocar Beneficio Activo.
    Permite al Administrador invalidar de forma inmediata un beneficio o descuento,
    bloqueando su aplicación en futuras transacciones comerciales.
    """
    permission_classes = [IsAuthenticated]

    def _exigir_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
        if codigo_rol != 'ADMIN' and nombre_rol != 'administrador':
            raise PermissionDenied("Se requiere rol de Administrador para revocar beneficios.")

    def patch(self, request, id_beneficio: int):
        self._exigir_admin(request.user)

        serializer = RevocarBeneficioInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            beneficio = revocar_beneficio_activo(
                usuario_admin=request.user,
                id_beneficio=id_beneficio,
                datos_validados=serializer.validated_data
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except DjangoValidationError as e:
            return Response(
                {"detail": e.message_dict if hasattr(e, 'message_dict') else (e.messages if hasattr(e, 'messages') else str(e))},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "mensaje": "Beneficio revocado exitosamente.",
                "id_beneficio": beneficio.id_beneficio,
                "estado": "REVOCADO",
                "motivo_anulacion": serializer.validated_data.get('motivo_anulacion', 'Sin justificación ingresada')
            },
            status=status.HTTP_200_OK
        )

    def post(self, request, id_beneficio: int):
        return self.patch(request, id_beneficio)


# ==============================================================================
# CU-75: GENERAR REPORTE DE DISTRIBUCIÓN GEOGRÁFICA Y LOGÍSTICA (APIS)
# ==============================================================================

class ReporteLogisticaApi(APIView):
    """
    CU-75: Generar Reporte de Distribución Geográfica y Logística.
    Permite a la gerencia visualizar la concentración territorial de las ventas bajo modalidad e-commerce,
    analizando el volumen logístico, la recaudación de fletes y el ticket promedio por territorio.
    """
    permission_classes = [IsAuthenticated]

    def _exigir_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
        if codigo_rol != 'ADMIN' and nombre_rol != 'administrador':
            raise PermissionDenied("Se requiere rol de Administrador para consultar el reporte logístico.")

    def get(self, request):
        self._exigir_admin(request.user)

        from rest_framework.exceptions import ValidationError as DRFValidationError
        from django.core.exceptions import ValidationError as DjangoValidationError
        from sales_app.serializers import (
            FiltroLogisticaInputSerializer,
            ReporteLogisticaItemOutputSerializer
        )
        from sales_app.services import generar_auditoria_logistica

        serializer = FiltroLogisticaInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        try:
            resultado = generar_auditoria_logistica(
                usuario_admin=request.user,
                filtros_validados=serializer.validated_data
            )
        except (DRFValidationError, DjangoValidationError) as e:
            err_msg = getattr(e, 'detail', None) or (e.messages if hasattr(e, 'messages') else [str(e)])
            return Response(
                {"error": err_msg[0] if isinstance(err_msg, list) and len(err_msg) == 1 else err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_serializer = ReporteLogisticaItemOutputSerializer(resultado, many=True)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


# ==============================================================================
# MERCADO PAGO INTEGRACIÓN OFICIAL (APIS HTTP)
# ==============================================================================

class MercadoPagoCrearPreferenciaApi(APIView):
    """
    Endpoint para generar una Preferencia de Pago en Mercado Pago asociada a una Venta Virtual.
    - POST: Valida id_venta, comprueba titularidad y llama al servicio crear_preferencia_mercadopago.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from sales_app.serializers import (
            MercadoPagoCrearPreferenciaInputSerializer,
            MercadoPagoPreferenciaOutputSerializer
        )
        from sales_app.selectors import obtener_venta_por_id
        from sales_app.services import crear_preferencia_mercadopago

        input_serializer = MercadoPagoCrearPreferenciaInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        id_venta = input_serializer.validated_data['id_venta']

        venta = obtener_venta_por_id(id_venta)
        if not venta:
            return Response(
                {"error": "La orden de venta solicitada no existe."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Validar que la venta pertenezca al usuario o que sea operador de mostrador (admin o técnico)
        id_user_venta = getattr(venta.id_usuario, 'id_usuario', getattr(venta.id_usuario, 'pk', None))
        id_user_req = getattr(request.user, 'id_usuario', getattr(request.user, 'pk', None))
        rol = getattr(request.user, 'id_rol', None) or getattr(request.user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
        es_operador = codigo_rol in ['ADMIN', 'TECNICO'] or nombre_rol in ['administrador', 'técnico', 'tecnico']

        if id_user_venta != id_user_req and not es_operador:
            return Response(
                {"error": "No posee autorización para generar pagos sobre esta orden de compra."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            preferencia = crear_preferencia_mercadopago(venta=venta, usuario=request.user)
        except Exception as e:
            return Response(
                {"error": f"Inconveniente con la pasarela de pagos: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_serializer = MercadoPagoPreferenciaOutputSerializer(preferencia)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class MercadoPagoWebhookApi(APIView):
    """
    Endpoint público para recepción de notificaciones Webhook (IPN) de Mercado Pago.
    Permiso: AllowAny. Valida y acredita el pago en tiempo real de forma inmutable.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from sales_app.services import procesar_webhook_mercadopago

        resultado = procesar_webhook_mercadopago(
            data=request.data if isinstance(request.data, dict) else {},
            query_params=request.query_params.dict()
        )
        return Response(resultado, status=status.HTTP_200_OK)


class MercadoPagoConfigPublicaApi(APIView):
    """
    Expone la clave pública (Public Key) de Mercado Pago para inicializar pasarelas en el frontend.
    Lee prioritariamente desde ConfiguracionSistema (BD) con fallback seguro al entorno.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        from core_app.selectors import (
            obtener_mercadopago_access_token,
            obtener_mercadopago_public_key
        )
        access_token = obtener_mercadopago_access_token()
        public_key = obtener_mercadopago_public_key()

        return Response(
            {
                "public_key": public_key,
                "habilitado": bool(access_token and 'TU_ACCESS_TOKEN' not in access_token)
            },
            status=status.HTTP_200_OK
        )


class ConsultarEstadoVentaApi(APIView):
    """
    Permite al frontend consultar en tiempo real si una venta fue acreditada y pagada.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_venta: int):
        from sales_app.selectors import obtener_venta_por_id
        from sales_app.serializers import EstadoVentaOutputSerializer

        venta = obtener_venta_por_id(id_venta)
        if not venta:
            return Response(
                {"error": "La orden de compra no fue encontrada."},
                status=status.HTTP_404_NOT_FOUND
            )

        id_user_venta = getattr(venta.id_usuario, 'id_usuario', getattr(venta.id_usuario, 'pk', None))
        id_user_req = getattr(request.user, 'id_usuario', getattr(request.user, 'pk', None))
        rol = getattr(request.user, 'id_rol', None) or getattr(request.user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
        es_operador = codigo_rol in ['ADMIN', 'TECNICO'] or nombre_rol in ['administrador', 'técnico', 'tecnico']

        if id_user_venta != id_user_req and not es_operador:
            return Response(
                {"error": "No posee autorización para consultar esta venta."},
                status=status.HTTP_403_FORBIDDEN
            )

        ultimo_pago = venta.pago_set.order_by('-id_pago').first() if hasattr(venta, 'pago_set') else None
        ruta_comp = None
        if ultimo_pago and ultimo_pago.ruta_comprobante:
            ruta_comp = f"/media/{ultimo_pago.ruta_comprobante.lstrip('/')}"

        data = {
            "id_venta": venta.id_venta,
            "estado_venta": venta.estado_venta,
            "codigo_sec": venta.codigo_sec,
            "pagada": venta.estado_venta == "PAGADA",
            "ruta_comprobante": ruta_comp
        }
        output_serializer = EstadoVentaOutputSerializer(data)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class CancelarVentaVirtualApi(APIView):
    """
    Permite cancelar una venta virtual pendiente y restituir inmediatamente
    el stock apartado al catálogo público disponible.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, id_venta: int):
        from sales_app.services import cancelar_venta_y_restituir_stock
        rol = getattr(request.user, 'id_rol', None) or getattr(request.user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
        es_operador = codigo_rol in ['ADMIN', 'TECNICO'] or nombre_rol in ['administrador', 'técnico', 'tecnico']

        usuario_filtro = None if es_operador else request.user
        motivo_str = "Cancelación en mostrador / cliente desiste de la compra" if es_operador else "Cancelación voluntaria por el cliente desde el modal de checkout"

        try:
            venta = cancelar_venta_y_restituir_stock(
                id_venta=id_venta,
                usuario=usuario_filtro,
                motivo=motivo_str
            )
            return Response(
                {
                    "mensaje": "La orden fue cancelada exitosamente y los repuestos fueron devueltos al catálogo.",
                    "id_venta": venta.id_venta,
                    "estado_venta": venta.estado_venta
                },
                status=status.HTTP_200_OK
            )
        except ValidationError as e:
            return Response(
                {"error": e.messages if hasattr(e, 'messages') else str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class ConsultarCostoEnvioApi(APIView):
    """
    Endpoint para cotizar en tiempo real el costo de flete/envío según la configuración del sistema
    y la dirección de entrega seleccionada (Local, Regional o Nacional).
    Permiso: AllowAny (accesible para clientes antes y durante el checkout).
    """
    permission_classes = [AllowAny]

    def get(self, request):
        from sales_app.selectors import calcular_costo_envio_sistema
        from sales_app.serializers import CostoEnvioOutputSerializer

        id_dir_raw = request.query_params.get('id_direccion')
        id_dir = int(id_dir_raw) if id_dir_raw and id_dir_raw.isdigit() else None

        id_ciudad_raw = request.query_params.get('id_ciudad')
        id_ciudad = int(id_ciudad_raw) if id_ciudad_raw and id_ciudad_raw.isdigit() else None

        resultado = calcular_costo_envio_sistema(id_dir, id_ciudad=id_ciudad)
        serializer = CostoEnvioOutputSerializer(resultado)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ConsultarCompraPendienteActivaApi(APIView):
    """
    Permite al cliente consultar si tiene una orden en estado PENDIENTE con reserva temporal
    de stock activa (menos de 30 minutos). Permite retomar el flujo de pago sin perder su selección.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from sales_app.selectors import obtener_venta_pendiente_activa
        from sales_app.serializers import CompraPendienteActivaOutputSerializer

        datos = obtener_venta_pendiente_activa(request.user)
        if datos:
            payload = {
                "tiene_pendiente": True,
                "venta": datos,
                "segundos_restantes": datos["segundos_restantes"]
            }
        else:
            payload = {
                "tiene_pendiente": False,
                "venta": None,
                "segundos_restantes": 0
            }

        serializer = CompraPendienteActivaOutputSerializer(payload)
        return Response(serializer.data, status=status.HTTP_200_OK)


class DescargarFacturaVentaApi(APIView):
    """
    CU-20: Visualización y Descarga de Factura / Comprobante Fiscal en PDF.
    Permite al cliente obtener el documento PDF oficial emitido tras la acreditación
    de su compra virtual.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_venta: int):
        from sales_app.selectors import obtener_factura_pdf_venta
        from django.http import FileResponse
        from django.core.exceptions import ValidationError

        try:
            ruta_abs, nombre_descarga = obtener_factura_pdf_venta(
                id_venta=id_venta,
                usuario=request.user
            )
            archivo = open(ruta_abs, 'rb')
            response = FileResponse(archivo, content_type='application/pdf')
            response['Content-Disposition'] = f'inline; filename="{nombre_descarga}"'
            return response
        except ValidationError as ve:
            return Response(
                {"error": str(ve.detail if hasattr(ve, 'detail') else ve)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {"error": f"Inconveniente al recuperar factura PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )









class RealizarCompraInvitadoApi(APIView):
    """
    Checkout para Visitantes / Clientes Sin Cuenta Registrada.
    Permite procesar compras de e-commerce públicas de forma atómica:
    - No requiere autenticación previa (AllowAny).
    - Asocia la venta al usuario estándar 'Cliente sin cuenta' (email y clave S/N).
    - Descuenta stock en tiempo real y genera el link de pago o comprobante de retiro.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from sales_app.serializers import (
            RealizarCompraInvitadoInputSerializer,
            CompraInvitadoOutputSerializer
        )
        from sales_app.services import procesar_compra_invitado

        serializer = RealizarCompraInvitadoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            resultado = procesar_compra_invitado(datos_compra=serializer.validated_data)
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {"error": f"Error al procesar la compra de invitado: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        output = CompraInvitadoOutputSerializer(resultado)
        return Response(
            {
                "mensaje": "Compra de invitado procesada con éxito.",
                "id_venta": resultado['id_venta'],
                "venta": output.data
            },
            status=status.HTTP_201_CREATED
        )


# ==============================================================================
# MOTOR INTELIGENTE DE BENEFICIOS Y FIDELIZACIÓN (APIS)
# ==============================================================================

class MisBeneficiosClienteApi(APIView):
    """
    Retorna la lista de beneficios activos e historial para el cliente autenticado.
    Permite nutrir la pestaña 'Mis Beneficios y Cupones' y el selector de Checkout.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from sales_app.selectors import (
            obtener_beneficios_activos_cliente,
            obtener_historial_beneficios_cliente
        )
        from sales_app.serializers import BeneficioClienteOutputSerializer

        activos = obtener_beneficios_activos_cliente(request.user.id_usuario)
        historial = obtener_historial_beneficios_cliente(request.user.id_usuario)

        ser_activos = BeneficioClienteOutputSerializer(activos, many=True)
        ser_historial = BeneficioClienteOutputSerializer(historial, many=True)

        return Response({
            "activos": ser_activos.data,
            "historial": ser_historial.data,
            "total_activos": len(activos)
        }, status=status.HTTP_200_OK)


class BeneficioRecomendacionCarritoApi(APIView):
    """
    Evalúa en tiempo real los artículos del carrito del cliente y devuelve
    sugerencias predictivas de accesorios compatibles con descuento.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from sales_app.models import CarritoCompra, CarritoProducto
        from sales_app.services import evaluar_beneficio_durante_carrito
        from sales_app.serializers import BeneficioClienteOutputSerializer

        carrito = CarritoCompra.objects.filter(
            id_usuario=request.user,
            estado__iexact='activo'
        ).first()

        if not carrito:
            return Response({"recomendaciones": []}, status=status.HTTP_200_OK)

        items = list(CarritoProducto.objects.filter(id_carrito=carrito).select_related('id_producto'))
        nuevos_beneficios = evaluar_beneficio_durante_carrito(
            id_usuario=request.user.id_usuario,
            items_carrito=items
        )

        return Response({
            "recomendaciones": BeneficioClienteOutputSerializer(nuevos_beneficios, many=True).data
        }, status=status.HTTP_200_OK)


class DepuracionMotorBeneficiosApi(APIView):
    """
    Panel administrativo y depuración: Consulta métricas del motor predictivo
    y permite disparar el análisis predictivo bajo demanda.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Se requiere rol de Administrador para acceder a la telemetría del motor.")

    def get(self, request):
        self._verificar_admin(request.user)
        from sales_app.selectors import obtener_metricas_motor_beneficios
        metricas = obtener_metricas_motor_beneficios()
        return Response(metricas, status=status.HTTP_200_OK)

    def post(self, request):
        self._verificar_admin(request.user)
        from sales_app.services import evaluar_beneficios_predictivos_sistema
        from sales_app.selectors import obtener_metricas_motor_beneficios

        resumen = evaluar_beneficios_predictivos_sistema()
        metricas_actualizadas = obtener_metricas_motor_beneficios()

        return Response({
            "mensaje": "Ciclo predictivo de beneficios ejecutado con éxito.",
            "resumen_ejecucion": resumen,
            "metricas": metricas_actualizadas
        }, status=status.HTTP_200_OK)
