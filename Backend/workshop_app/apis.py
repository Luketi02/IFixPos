from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.exceptions import ValidationError

from .serializers import (
    DispositivoInputSerializer,
    DispositivoCreateInputSerializer,
    DispositivoOutputSerializer,
    TipoDispositivoOutputSerializer,
    MarcaOutputSerializer,
    ModeloDispositivoOutputSerializer,
    DispositivoFiltradoOutputSerializer
)
from .services import registrar_dispositivo, crear_dispositivo
from .selectors import (
    obtener_tipos_dispositivos,
    obtener_marcas,
    obtener_modelos_por_marca,
    filtrar_dispositivos_taller,
    filtrar_mis_dispositivos
)


# ==============================================================================
# APIS DE CATÁLOGOS GEOGRÁFICOS / DISPOSITIVOS (Lectura para Frontend)
# ==============================================================================

class TiposDispositivosListApi(APIView):
    """
    Retorna el listado de tipos de dispositivos activos para alimentar selects.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        tipos = obtener_tipos_dispositivos()
        serializer = TipoDispositivoOutputSerializer(tipos, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class MarcasDispositivosListApi(APIView):
    """
    Retorna el catálogo de marcas activas para alimentar selects dependientes.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        marcas = obtener_marcas()
        serializer = MarcaOutputSerializer(marcas, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ModelosPorMarcaListApi(APIView):
    """
    Retorna los modelos pertenecientes a una marca seleccionada.
    Soporta id_marca en URL o como query param (?id_marca=X).
    """
    permission_classes = [AllowAny]

    def get(self, request, id_marca=None):
        id_marca_param = id_marca or request.query_params.get('id_marca')
        if not id_marca_param:
            return Response(
                {"error": "Debe especificar el identificador de marca ('id_marca')."},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            id_marca_int = int(id_marca_param)
        except (ValueError, TypeError):
            return Response(
                {"error": "El parámetro 'id_marca' debe ser un número entero válido."},
                status=status.HTTP_400_BAD_REQUEST
            )

        modelos = obtener_modelos_por_marca(id_marca_int)
        serializer = ModeloDispositivoOutputSerializer(modelos, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ==============================================================================
# CU-06: REGISTRAR DISPOSITIVO
# ==============================================================================

class DispositivoCreateApi(APIView):
    """
    API endpoint para registrar un dispositivo vinculado a un cliente. (CU-06)
    Admite tanto JSON como FormData multipart para adjuntar imágenes.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        # Aceptar indistintamente DispositivoInputSerializer (nuevo) o DispositivoCreateInputSerializer
        serializer = DispositivoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            dispositivo = registrar_dispositivo(
                usuario_ejecutor=request.user,
                datos_validados=serializer.validated_data
            )
        except ValidationError as e:
            error_message = str(e.detail[0]) if hasattr(e, 'detail') and isinstance(e.detail, list) else str(e)
            return Response({"error": error_message}, status=status.HTTP_400_BAD_REQUEST)

        output_serializer = DispositivoOutputSerializer(dispositivo)
        return Response({
            "mensaje": "Dispositivo registrado exitosamente.",
            "id_dispositivo": dispositivo.id_dispositivo,
            "dispositivo": output_serializer.data
        }, status=status.HTTP_201_CREATED)

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
