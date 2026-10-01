from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError

from .serializers import (
    MarcaInputSerializer,
    MarcaOutputSerializer,
    ModeloInputSerializer,
    ModeloOutputSerializer
)
from .services import crear_o_reactivar_marca, crear_o_reactivar_modelo

class MarcaCreateApi(APIView):
    """
    API endpoint para registrar una marca. (CU-77)
    """
    def post(self, request):
        serializer = MarcaInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            marca = crear_o_reactivar_marca(
                nombre=serializer.validated_data.get('nombre')
            )
        except ValidationError as e:
            return Response({"error": str(e.detail[0]) if isinstance(e.detail, list) else str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        output_serializer = MarcaOutputSerializer(marca)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class ModeloCreateApi(APIView):
    """
    API endpoint para registrar un modelo de dispositivo. (CU-79)
    """
    def post(self, request):
        serializer = ModeloInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            modelo = crear_o_reactivar_modelo(
                nombre=serializer.validated_data.get('nombre'),
                id_marca=serializer.validated_data.get('id_marca'),
                id_tipo_dispositivo=serializer.validated_data.get('id_tipo_dispositivo')
            )
        except ValidationError as e:
            return Response({"error": str(e.detail[0]) if isinstance(e.detail, list) else str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        output_serializer = ModeloOutputSerializer(modelo)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)
