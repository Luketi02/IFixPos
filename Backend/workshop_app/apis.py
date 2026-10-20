from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.exceptions import ValidationError, PermissionDenied

from .serializers import (
    DispositivoInputSerializer,
    DispositivoCreateInputSerializer,
    DispositivoOutputSerializer,
    TipoDispositivoOutputSerializer,
    MarcaOutputSerializer,
    ModeloDispositivoOutputSerializer,
    DispositivoFiltradoOutputSerializer,
    DispositivoListOutputSerializer,
    DispositivoUpdateInputSerializer
)
from .services import registrar_dispositivo, crear_dispositivo, editar_dispositivo_cliente
from .selectors import (
    obtener_tipos_dispositivos,
    obtener_marcas,
    obtener_modelos_por_marca,
    filtrar_dispositivos_taller,
    filtrar_mis_dispositivos,
    filtrar_dispositivos_cliente
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
            id_usuario_propietario = request.user.id_usuario
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


# ==============================================================================
# CU-34 (Filtrar Mis Dispositivos) y CU-07 (Editar Dispositivo)
# ==============================================================================

def _exigir_rol_cliente(usuario):
    rol = getattr(usuario, 'id_rol', None)
    if not rol or (rol.codigo or '').upper() != 'CLIENTE':
        raise PermissionDenied("Esta acción está reservada para clientes.")


class MisDispositivosApi(APIView):
    """GET: filtra los dispositivos del cliente (CU-34). PUT: edita un dispositivo (CU-07)."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        _exigir_rol_cliente(request.user)
        try:
            id_marca = request.query_params.get('marca')
            id_modelo = request.query_params.get('modelo')
            id_marca = int(id_marca) if id_marca else None
            id_modelo = int(id_modelo) if id_modelo else None
        except ValueError:
            raise ValidationError("Los parámetros 'marca' y 'modelo' deben ser números enteros.")

        texto = (request.query_params.get('buscar') or '').strip() or None
        if texto and (len(texto) > 100 or any(c in texto for c in '<>;{}\\')):
            raise ValidationError("El texto de búsqueda contiene caracteres no permitidos.")

        dispositivos = filtrar_dispositivos_cliente(
            usuario_cliente=request.user,
            texto_busqueda=texto,
            id_marca=id_marca,
            id_modelo=id_modelo,
            estado_reparacion=(request.query_params.get('estado') or '').strip() or None
        )
        data = DispositivoListOutputSerializer(dispositivos, many=True).data
        if not data:
            return Response({"mensaje": "No se encontraron resultados", "resultados": []}, status=status.HTTP_200_OK)
        return Response(data, status=status.HTTP_200_OK)

    def put(self, request, id_dispositivo=None):
        _exigir_rol_cliente(request.user)
        if id_dispositivo is None:
            raise ValidationError("Debe especificar el identificador del dispositivo.")
        serializer = DispositivoUpdateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        editar_dispositivo_cliente(
            usuario_cliente=request.user,
            id_dispositivo=id_dispositivo,
            datos_validados=serializer.validated_data
        )
        return Response({"mensaje": "Dispositivo actualizado exitosamente."}, status=status.HTTP_200_OK)


# ==============================================================================
# CU-11: Consultar Detalles del Dispositivo y CU-61: Consultar Detalle de Reparación
# ==============================================================================

class DispositivoDetalleApi(APIView):
    """
    CU-11: Consulta la ficha técnica completa del dispositivo, su reparación activa
    y su historial previo de servicios. Exclusivo para el CLIENTE propietario.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_dispositivo):
        from workshop_app.selectors import obtener_detalle_dispositivo
        from workshop_app.serializers import DispositivoDetalleOutputSerializer

        _exigir_rol_cliente(request.user)
        dispositivo = obtener_detalle_dispositivo(
            usuario_cliente=request.user,
            id_dispositivo=id_dispositivo
        )
        serializer = DispositivoDetalleOutputSerializer(dispositivo)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ReparacionDetalleApi(APIView):
    """
    CU-61: Radiografía integral de la reparación.
    Accesible para ADMIN, TECNICO y CLIENTE (éste último solo sobre sus propios equipos).
    Aplica Seguridad Vertical: contraseñas del equipo ocultas para el Cliente.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_reparacion):
        from workshop_app.selectors import obtener_reparacion_detallada
        from workshop_app.serializers import ReparacionDetalleOutputSerializer

        reparacion = obtener_reparacion_detallada(
            usuario_solicitante=request.user,
            id_reparacion=id_reparacion
        )
        serializer = ReparacionDetalleOutputSerializer(
            reparacion,
            context={'request': request, 'usuario': request.user}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


# ==============================================================================
# CATEGORÍAS DE REPARACIÓN (CU-62, CU-63, CU-64)
# ==============================================================================

def _obtener_codigo_rol(usuario):
    rol = getattr(usuario, 'id_rol', None) or getattr(usuario, 'rol', None)
    return (getattr(rol, 'codigo', '') or '').upper()

def _exigir_rol_admin(usuario):
    if _obtener_codigo_rol(usuario) != 'ADMIN':
        raise PermissionDenied("Se requiere rol de Administrador para realizar esta acción.")

def _exigir_rol_taller(usuario):
    if _obtener_codigo_rol(usuario) not in ('ADMIN', 'TECNICO'):
        raise PermissionDenied("Se requiere rol de Administrador o Técnico para realizar esta acción.")


class CategoriaReparacionApi(APIView):
    """
    CU-64: Filtrar Categoría de Reparación y CU-62: Crear Categoría de Reparación.
    - Requiere IsAuthenticated.
    - GET (CU-64): Permite acceso a roles ADMIN y TECNICO. Captura 'buscar' y 'estado'.
    - POST (CU-62): Exige rol ADMIN. Valida con CategoriaReparacionCreateInputSerializer.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_taller(request.user)

        from workshop_app.selectors import filtrar_categorias_reparacion
        from workshop_app.serializers import CategoriaReparacionOutputSerializer

        buscar = (
            request.query_params.get('buscar')
            or request.query_params.get('q')
            or request.query_params.get('search')
            or request.query_params.get('texto_busqueda')
        )
        estado = (
            request.query_params.get('estado')
            or request.query_params.get('estado_activo')
        )

        categorias = filtrar_categorias_reparacion(texto_busqueda=buscar, estado_activo=estado)
        serializer = CategoriaReparacionOutputSerializer(categorias, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        _exigir_rol_admin(request.user)

        from workshop_app.serializers import (
            CategoriaReparacionCreateInputSerializer,
            CategoriaReparacionOutputSerializer
        )
        from workshop_app.services import crear_categoria_reparacion

        serializer = CategoriaReparacionCreateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        categoria = crear_categoria_reparacion(
            usuario_admin=request.user,
            nombre=serializer.validated_data['nombre']
        )

        output_serializer = CategoriaReparacionOutputSerializer(categoria)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class CategoriaReparacionEstadoApi(APIView):
    """
    CU-63: Cambiar Estado de Categoría de Reparación.
    - Requiere IsAuthenticated y rol ADMIN.
    - PATCH (CU-63): Recibe id_categoria por URL, invoca cambiar_estado_categoria_reparacion
      y retorna HTTP 200 OK.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_categoria: int):
        _exigir_rol_admin(request.user)

        from django.core.exceptions import ObjectDoesNotExist
        from workshop_app.services import cambiar_estado_categoria_reparacion
        from workshop_app.serializers import CategoriaReparacionOutputSerializer

        try:
            categoria_modificada = cambiar_estado_categoria_reparacion(
                usuario_admin=request.user,
                id_categoria=id_categoria
            )
        except ObjectDoesNotExist:
            return Response(
                {"error": f"No se encontró la categoría de reparación con ID {id_categoria}."},
                status=status.HTTP_404_NOT_FOUND
            )

        output_serializer = CategoriaReparacionOutputSerializer(categoria_modificada)
        data = dict(output_serializer.data)
        data["mensaje"] = f"Estado de la categoría de reparación actualizado a {'Activo' if categoria_modificada.estado_activo else 'Inactivo'}."
        data["categoria"] = output_serializer.data
        return Response(data, status=status.HTTP_200_OK)
