from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError

from sales_app.serializers import RealizarCompraInputSerializer, VentaOutputSerializer
from sales_app.services import procesar_compra_virtual


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

        ident = identificador or request.query_params.get('identificador')
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


        from sales_app.serializers import CompletarPagoInputSerializer
        from sales_app.selectors import buscar_operacion_pendiente_cobro
        from sales_app.services import registrar_cobro_operacion
        from django.core.exceptions import ObjectDoesNotExist

        # El identificador puede venir en la URL, query params o en el body
        ident = identificador or request.query_params.get('identificador') or request.data.get('identificador')
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


