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


from .selectors import filtrar_dispositivos_taller, filtrar_mis_dispositivos
from .serializers import DispositivoFiltradoOutputSerializer

class FiltrarDispositivosTallerApi(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            dni_cliente = request.query_params.get('dni_cliente')
            codigo_sec_reparacion = request.query_params.get('codigo_sec_reparacion')
            nro_serie = request.query_params.get('nro_serie')
            etapa_reparacion = request.query_params.get('etapa_reparacion')
            
            id_tecnico_asignado = request.query_params.get('id_tecnico_asignado')
            id_marca = request.query_params.get('id_marca')
            id_modelo = request.query_params.get('id_modelo')
            
            fecha_ingreso_desde = request.query_params.get('fecha_ingreso_desde')
            fecha_ingreso_hasta = request.query_params.get('fecha_ingreso_hasta')

            if id_tecnico_asignado is not None: id_tecnico_asignado = int(id_tecnico_asignado)
            if id_marca is not None: id_marca = int(id_marca)
            if id_modelo is not None: id_modelo = int(id_modelo)

            dispositivos = filtrar_dispositivos_taller(
                dni_cliente=dni_cliente,
                codigo_sec_reparacion=codigo_sec_reparacion,
                nro_serie=nro_serie,
                etapa_reparacion=etapa_reparacion,
                id_tecnico_asignado=id_tecnico_asignado,
                fecha_ingreso_desde=fecha_ingreso_desde, 
                fecha_ingreso_hasta=fecha_ingreso_hasta,
                id_marca=id_marca,
                id_modelo=id_modelo
            )
            
            serializer = DispositivoFiltradoOutputSerializer(dispositivos, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError:
            return Response({"error": "Parámetro inválido."}, status=status.HTTP_400_BAD_REQUEST)


class FiltrarMisDispositivosApi(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            id_usuario_propietario = request.user.id
            if not id_usuario_propietario:
                return Response({"error": "Usuario no autenticado."}, status=status.HTTP_401_UNAUTHORIZED)

            texto_busqueda = request.query_params.get('texto_busqueda')
            etapa_reparacion = request.query_params.get('etapa_reparacion')
            id_marca = request.query_params.get('id_marca')
            id_modelo = request.query_params.get('id_modelo')
            ordenar_mas_recientes = request.query_params.get('ordenar_mas_recientes', 'true').lower() in ['true', '1']

            if id_marca is not None: id_marca = int(id_marca)
            if id_modelo is not None: id_modelo = int(id_modelo)

            dispositivos = filtrar_mis_dispositivos(
                id_usuario_propietario=id_usuario_propietario,
                texto_busqueda=texto_busqueda,
                etapa_reparacion=etapa_reparacion,
                id_marca=id_marca,
                id_modelo=id_modelo,
                ordenar_mas_recientes=ordenar_mas_recientes
            )

            serializer = DispositivoFiltradoOutputSerializer(dispositivos, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
            
        except ValueError:
            return Response({"error": "Parámetro numérico inválido."}, status=status.HTTP_400_BAD_REQUEST)
