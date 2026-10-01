from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError

from .serializers import DispositivoCreateInputSerializer, DispositivoOutputSerializer
from .services import crear_dispositivo

class DispositivoCreateApi(APIView):
    """
    API endpoint para registrar un dispositivo vinculado a un cliente. (CU-06)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DispositivoCreateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Obtenemos el id del ejecutor (técnico o cliente) desde el token de sesión
        id_ejecutor = request.user.id
        
        if not id_ejecutor:
            return Response(
                {"error": "No se pudo identificar al usuario autenticado de la sesión."}, 
                status=status.HTTP_401_UNAUTHORIZED
            )
            
        try:
            dispositivo = crear_dispositivo(
                id_ejecutor=id_ejecutor,
                id_usuario=serializer.validated_data.get('id_usuario'),
                id_modelo=serializer.validated_data.get('id_modelo'),
                numero_serie=serializer.validated_data.get('numero_serie'),
                imagen=serializer.validated_data.get('imagen')
            )
        except ValidationError as e:
            # Capturamos excepciones de lógica de negocio y devolvemos 400
            error_message = str(e.detail[0]) if isinstance(e.detail, list) else str(e)
            return Response({"error": error_message}, status=status.HTTP_400_BAD_REQUEST)
            
        output_serializer = DispositivoOutputSerializer(dispositivo)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)
