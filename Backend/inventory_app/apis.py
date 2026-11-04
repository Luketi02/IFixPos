from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied

from inventory_app.selectors import filtrar_stock_inventario
from inventory_app.serializers import ProductoStockOutputSerializer, FiltrarStockInputSerializer


class FiltrarStockApi(APIView):
    """
    CU-35: Filtrar Stock e Inventario.
    Permite a los administradores y técnicos auditar y consultar el padrón de artículos
    físicos con sus existencias, alertas de reposición y filtros taxonómicos.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 1. Validar los filtros mediante el InputSerializer (sin acceso crudo a query_params)
        input_serializer = FiltrarStockInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)
        filtros = input_serializer.validated_data

        try:
            productos = filtrar_stock_inventario(
                usuario=request.user,
                texto_busqueda=filtros['texto_busqueda'],
                nivel_stock=filtros['nivel_stock'],
                id_categoria=filtros['id_categoria'],
                id_proveedor=filtros['id_proveedor'],
                proposito=filtros['proposito'],
                tipo_compatibilidad=filtros.get('tipo_compatibilidad')
            )
        except (PermissionDenied, DjangoPermissionDenied) as e:
            raise PermissionDenied(str(e))

        serializer = ProductoStockOutputSerializer(productos, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ActualizarStockApi(APIView):
    """
    CU-13: Actualizar Stock.
    Permite al administrador ajustar manualmente las cantidades físicas de un producto
    (INGRESO o EGRESO), justificando el motivo y registrando el movimiento y la auditoría.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Se requiere rol de Administrador para actualizar existencias de stock.")

    def post(self, request):
        self._verificar_admin(request.user)

        from inventory_app.serializers import (
            ActualizarStockInputSerializer,
            ActualizarStockOutputSerializer
        )
        from inventory_app.services import actualizar_stock_manual
        from django.core.exceptions import ValidationError as DjangoValidationError

        serializer = ActualizarStockInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            stock = actualizar_stock_manual(
                usuario_admin=request.user,
                datos_validados=serializer.validated_data
            )
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output = ActualizarStockOutputSerializer(stock)
        return Response(
            {
                "mensaje": f"Stock actualizado con éxito para '{stock.id_producto.nombre}'. Saldo actual: {stock.stock_nuevo}.",
                "data": output.data
            },
            status=status.HTTP_200_OK
        )
