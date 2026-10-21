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
