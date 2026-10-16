from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.core.exceptions import PermissionDenied, ObjectDoesNotExist, ValidationError

from geo_app.selectors import (
    obtener_paises,
    obtener_provincias_por_pais,
    obtener_todas_las_provincias,
    obtener_ciudades_por_provincia,
    obtener_direcciones_activas_usuario,
    obtener_todas_direcciones_usuario,
    obtener_direccion_por_id,
    filtrar_zonas_cobertura
)
from geo_app.serializers import (
    PaisOutputSerializer,
    ProvinciaOutputSerializer,
    CiudadOutputSerializer,
    DireccionOutputSerializer,
    DireccionInputSerializer,
    ZonaCoberturaOutputSerializer,
    ActualizarCoberturaZonasInputSerializer
)
from geo_app.services import (
    registrar_direccion,
    modificar_direccion,
    cambiar_estado_direccion,
    actualizar_cobertura_zonas
)


# ==============================================================================
# CATÁLOGOS GEOGRÁFICOS (Lectura en Cascada)
# ==============================================================================

class PaisesListApi(APIView):
    """
    Endpoint para obtener el listado de países con cobertura habilitada.
    Soporta ?todas=true para listar todos sin filtrar por cobertura.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        solo_habilitados = request.query_params.get('todas', '').lower() not in ['true', '1']
        paises = obtener_paises(solo_habilitados=solo_habilitados)
        serializer = PaisOutputSerializer(paises, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProvinciasListApi(APIView):
    """
    Endpoint para obtener provincias dependientes de un país.
    Soporta id_pais como parámetro en URL o como query param 'pais_id' / 'id_pais'.
    Soporta ?todas=true para listar todas las provincias sin filtrar por cobertura.
    """
    permission_classes = [AllowAny]

    def get(self, request, id_pais=None):
        pais_id = id_pais or request.query_params.get('pais_id') or request.query_params.get('id_pais')
        solo_habilitadas = request.query_params.get('todas', '').lower() not in ['true', '1']

        if not pais_id:
            # Si no se especifica país pero se solicita ?todas=true, listar todas las provincias
            if not solo_habilitadas:
                provincias = obtener_todas_las_provincias(solo_habilitadas=False)
                serializer = ProvinciaOutputSerializer(provincias, many=True)
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(
                {"error": "Debe especificar el identificador de país ('pais_id')."},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            provincias = obtener_provincias_por_pais(int(pais_id), solo_habilitadas=solo_habilitadas)
        except (ValueError, TypeError):
            return Response(
                {"error": "El parámetro 'pais_id' debe ser un número entero."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ProvinciaOutputSerializer(provincias, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CiudadesListApi(APIView):
    """
    Endpoint para obtener ciudades dependientes de una provincia.
    Soporta id_provincia como parámetro en URL o como query param 'provincia_id' / 'id_provincia'.
    Soporta ?todas=true para listar todas las ciudades sin filtrar por cobertura.
    """
    permission_classes = [AllowAny]

    def get(self, request, id_provincia=None):
        provincia_id = id_provincia or request.query_params.get('provincia_id') or request.query_params.get('id_provincia')
        if not provincia_id:
            return Response(
                {"error": "Debe especificar el identificador de provincia ('provincia_id')."},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            solo_habilitadas = request.query_params.get('todas', '').lower() not in ['true', '1']
            ciudades = obtener_ciudades_por_provincia(int(provincia_id), solo_habilitadas=solo_habilitadas)
        except (ValueError, TypeError):
            return Response(
                {"error": "El parámetro 'provincia_id' debe ser un número entero."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = CiudadOutputSerializer(ciudades, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ==============================================================================
# GESTIÓN DE DIRECCIONES (CU-47, CU-48, CU-49)
# ==============================================================================

class MisDireccionesApi(APIView):
    """
    Endpoint de colección para la gestión de direcciones del usuario en sesión.
    - GET: Lista las direcciones activas (o todas si se incluye ?todas=true).
    - POST: Registra una nueva dirección (CU-47).
    - PUT: Modifica una dirección recibiendo id_direccion en el cuerpo o URL (CU-48).
    - PATCH / DELETE: Borrado lógico / reactivación (CU-49).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        todas = request.query_params.get('todas', '').lower() in ['true', '1']
        if todas:
            direcciones = obtener_todas_direcciones_usuario(request.user.id_usuario)
        else:
            direcciones = obtener_direcciones_activas_usuario(request.user.id_usuario)

        serializer = DireccionOutputSerializer(direcciones, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = DireccionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        direccion = registrar_direccion(
            usuario=request.user,
            datos=serializer.validated_data
        )

        output = DireccionOutputSerializer(direccion)
        return Response(
            {
                "mensaje": "Dirección registrada con éxito.",
                "direccion": output.data
            },
            status=status.HTTP_201_CREATED
        )

    def put(self, request, id_direccion=None):
        target_id = id_direccion or request.data.get('id_direccion')
        if not target_id:
            return Response(
                {"error": "Debe especificar el 'id_direccion' a modificar."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DireccionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            direccion = modificar_direccion(
                usuario=request.user,
                id_direccion=int(target_id),
                datos=serializer.validated_data
            )
        except ObjectDoesNotExist as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except PermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        output = DireccionOutputSerializer(direccion)
        return Response(
            {
                "mensaje": "Dirección modificada con éxito.",
                "direccion": output.data
            },
            status=status.HTTP_200_OK
        )

    def patch(self, request, id_direccion=None):
        target_id = id_direccion or request.data.get('id_direccion')
        if not target_id:
            return Response(
                {"error": "Debe especificar el 'id_direccion' para conmutar su estado."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            direccion = cambiar_estado_direccion(
                usuario=request.user,
                id_direccion=int(target_id)
            )
        except ObjectDoesNotExist as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except PermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        output = DireccionOutputSerializer(direccion)
        estado_msg = "activada" if direccion.is_active else "desactivada"
        return Response(
            {
                "mensaje": f"Dirección {estado_msg} con éxito.",
                "direccion": output.data
            },
            status=status.HTTP_200_OK
        )

    def delete(self, request, id_direccion=None):
        return self.patch(request, id_direccion=id_direccion)


class DireccionDetalleApi(APIView):
    """
    Endpoint detallado con ID en URL para modificar, consultar o cambiar estado de una dirección:
    /api/geo/mis-direcciones/<int:id_direccion>/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_direccion):
        direccion = obtener_direccion_por_id(id_direccion)
        if not direccion:
            return Response({"error": "Dirección no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        rol_codigo = getattr(getattr(request.user, 'id_rol', None), 'codigo', '')
        if direccion.id_usuario_id != request.user.id_usuario and rol_codigo.upper() != 'ADMIN':
            return Response({"error": "No tienes permiso para ver esta dirección."}, status=status.HTTP_403_FORBIDDEN)

        output = DireccionOutputSerializer(direccion)
        return Response(output.data, status=status.HTTP_200_OK)

    def put(self, request, id_direccion):
        serializer = DireccionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            direccion = modificar_direccion(
                usuario=request.user,
                id_direccion=id_direccion,
                datos=serializer.validated_data
            )
        except ObjectDoesNotExist as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except PermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        output = DireccionOutputSerializer(direccion)
        return Response(
            {
                "mensaje": "Dirección modificada con éxito.",
                "direccion": output.data
            },
            status=status.HTTP_200_OK
        )

    def patch(self, request, id_direccion):
        try:
            direccion = cambiar_estado_direccion(
                usuario=request.user,
                id_direccion=id_direccion
            )
        except ObjectDoesNotExist as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except PermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        output = DireccionOutputSerializer(direccion)
        estado_msg = "activada" if direccion.is_active else "desactivada"
        return Response(
            {
                "mensaje": f"Dirección {estado_msg} con éxito.",
                "direccion": output.data
            },
            status=status.HTTP_200_OK
        )

    def delete(self, request, id_direccion):
        return self.patch(request, id_direccion=id_direccion)


# ==============================================================================
# GESTIÓN DE ZONAS DE COBERTURA LOGÍSTICA (CU-50 / CU-59)
# ==============================================================================

class ZonasCoberturaApi(APIView):
    """
    API endpoint para Administrar (CU-50) y Filtrar (CU-59) Zonas de Cobertura Logística.
    Acceso exclusivo para usuarios con rol 'ADMIN'.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo = getattr(rol, 'codigo', '')
        if (codigo or '').upper() != 'ADMIN':
            raise PermissionDenied("Acceso denegado. Se requieren permisos de Administrador para gestionar zonas de cobertura.")

    def get(self, request):
        self._verificar_admin(request.user)

        nivel = (request.query_params.get('nivel') or request.query_params.get('nivel_taxonomico') or 'PAIS').upper()
        padre_id_raw = request.query_params.get('padre_id')
        padre_id = int(padre_id_raw) if padre_id_raw and str(padre_id_raw).isdigit() else None
        estado = request.query_params.get('estado')
        busqueda = request.query_params.get('busqueda', '')

        try:
            # Regla de Rendimiento Crítica en API HTTP:
            # En nivel CIUDAD, si no se especifica provincia (padre_id) ni búsqueda, no serializar 152.000 registros
            if nivel == 'CIUDAD' and not padre_id and not busqueda.strip():
                return Response([], status=status.HTTP_200_OK)

            queryset = filtrar_zonas_cobertura(
                nivel_taxonomico=nivel,
                padre_id=padre_id,
                estado=estado,
                busqueda=busqueda
            )

            # Si se busca ciudades globalmente sin especificar provincia, limitar a 100 resultados
            if nivel == 'CIUDAD' and not padre_id and busqueda.strip():
                queryset = queryset[:100]
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)

        # Mapear queryset a estructura unificada de salida
        resultados = []
        if nivel == 'PAIS':
            for p in queryset:
                resultados.append({
                    'id': p.id_pais,
                    'nombre': p.nombre_pais,
                    'cobertura_habilitada': p.cobertura_habilitada,
                    'nivel': 'PAIS',
                    'padre_id': None,
                    'padre_nombre': None
                })
        elif nivel == 'PROVINCIA':
            for pr in queryset:
                resultados.append({
                    'id': pr.id_provincia,
                    'nombre': pr.nombre_provincia,
                    'cobertura_habilitada': pr.cobertura_habilitada,
                    'nivel': 'PROVINCIA',
                    'padre_id': pr.id_pais_id,
                    'padre_nombre': pr.id_pais.nombre_pais if pr.id_pais else None
                })
        elif nivel == 'CIUDAD':
            for c in queryset:
                resultados.append({
                    'id': c.id_ciudad,
                    'nombre': c.nombre_ciudad,
                    'cobertura_habilitada': c.cobertura_habilitada,
                    'nivel': 'CIUDAD',
                    'padre_id': c.id_provincia_id,
                    'padre_nombre': c.id_provincia.nombre_provincia if c.id_provincia else None
                })

        serializer = ZonaCoberturaOutputSerializer(resultados, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        self._verificar_admin(request.user)

        serializer = ActualizarCoberturaZonasInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            resultado = actualizar_cobertura_zonas(
                usuario_admin=request.user,
                nivel_taxonomico=serializer.validated_data['nivel_taxonomico'],
                zonas_modificadas=serializer.validated_data['zonas_modificadas']
            )
            return Response(resultado, status=status.HTTP_200_OK)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request):
        return self.put(request)
