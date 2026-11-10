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
    DispositivoTallerFiltradoOutputSerializer,
    FiltrarDispositivosTallerInputSerializer,
    DispositivoListOutputSerializer,
    DispositivoUpdateInputSerializer,
    IniciarReparacionInputSerializer
)
from .services import (
    registrar_dispositivo,
    crear_dispositivo,
    editar_dispositivo_cliente,
    iniciar_reparacion
)
from .selectors import (
    obtener_tipos_dispositivos,
    obtener_marcas,
    obtener_modelos_por_marca,
    filtrar_dispositivos_taller,
    filtrar_mis_dispositivos,
    filtrar_dispositivos_cliente
)


# ==============================================================================
# HELPERS DE SEGURIDAD Y CONTROL DE ACCESO BASADO EN ROLES
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

def _exigir_rol_cliente(usuario):
    if _obtener_codigo_rol(usuario) != 'CLIENTE':
        raise PermissionDenied("Esta acción está reservada para clientes.")



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
        from workshop_app.serializers import FiltroModelosPorMarcaInputSerializer
        input_serializer = FiltroModelosPorMarcaInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)
        id_marca_param = id_marca or input_serializer.validated_data.get('id_marca')
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
        # Regla de Negocio Estricta: Únicamente los clientes pueden registrar dispositivos
        rol_codigo = ''
        if hasattr(request.user, 'id_rol') and request.user.id_rol:
            rol_codigo = (request.user.id_rol.codigo or '').upper()
        elif hasattr(request.user, 'rol') and request.user.rol:
            rol_codigo = (request.user.rol.codigo or '').upper()

        if rol_codigo != 'CLIENTE':
            return Response(
                {"error": "Acceso denegado: Únicamente los clientes pueden registrar dispositivos en el sistema."},
                status=status.HTTP_403_FORBIDDEN
            )

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

# ==============================================================================
# CU-33: FILTRAR DISPOSITIVO (TALLER / ADMINISTRACIÓN)
# ==============================================================================

class FiltrarDispositivosTallerApi(APIView):
    """
    CU-33: Filtrar Dispositivo.
    Permite al personal del taller (ADMIN y TECNICO) filtrar y localizar
    dispositivos y reparaciones según criterios exactos (DNI, código de seguridad,
    marca, modelo, número de serie) y filtros categóricos/temporales
    (etapa de reparación, técnico asignado, rango de fechas).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_taller(request.user)

        serializer = FiltrarDispositivosTallerInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        filtros = serializer.validated_data

        dispositivos = filtrar_dispositivos_taller(
            dni_cliente=filtros.get('dni_cliente'),
            codigo_sec_reparacion=filtros.get('codigo_sec_reparacion'),
            nro_serie=filtros.get('nro_serie'),
            marca=filtros.get('marca'),
            id_marca=filtros.get('id_marca'),
            modelo=filtros.get('modelo'),
            id_modelo=filtros.get('id_modelo'),
            etapa_reparacion=filtros.get('etapa_reparacion'),
            id_tecnico_asignado=filtros.get('id_tecnico_asignado'),
            fecha_ingreso_desde=filtros.get('fecha_ingreso_desde'),
            fecha_ingreso_hasta=filtros.get('fecha_ingreso_hasta'),
            excluir_reparaciones_activas=filtros.get('excluir_reparaciones_activas', False),
        )

        output_serializer = DispositivoTallerFiltradoOutputSerializer(dispositivos, many=True)
        data = output_serializer.data

        if not data:
            return Response(
                {"mensaje": "No se encontraron resultados", "resultados": []},
                status=status.HTTP_200_OK
            )

        return Response(data, status=status.HTTP_200_OK)


class FiltrarMisDispositivosApi(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            id_usuario_propietario = request.user.id_usuario
            if not id_usuario_propietario:
                return Response({"error": "Usuario no autenticado."}, status=status.HTTP_401_UNAUTHORIZED)

            from workshop_app.serializers import FiltrarMisDispositivosInputSerializer
            input_serializer = FiltrarMisDispositivosInputSerializer(data=request.query_params)
            input_serializer.is_valid(raise_exception=True)
            filtros = input_serializer.validated_data
            texto_busqueda = filtros.get('texto_busqueda') or None
            etapa_reparacion = filtros.get('etapa_reparacion') or None
            id_marca = filtros.get('id_marca')
            id_modelo = filtros.get('id_modelo')
            ordenar_mas_recientes = filtros.get('ordenar_mas_recientes', True)

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


class MisDispositivosApi(APIView):
    """GET: filtra los dispositivos del cliente (CU-34). PUT: edita un dispositivo (CU-07)."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        _exigir_rol_cliente(request.user)
        from workshop_app.serializers import FiltrarDispositivosClienteInputSerializer
        input_serializer = FiltrarDispositivosClienteInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)
        filtros = input_serializer.validated_data

        dispositivos = filtrar_dispositivos_cliente(
            usuario_cliente=request.user,
            texto_busqueda=filtros.get('buscar') or None,
            id_marca=filtros.get('marca'),
            id_modelo=filtros.get('modelo'),
            estado_reparacion=(filtros.get('estado') or '').strip() or None
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
# CU-26: INICIAR REPARACIÓN (ORDEN DE SERVICIO)
# ==============================================================================

class IniciarReparacionApi(APIView):
    """
    CU-26: Iniciar Reparación.
    Permite instanciar formalmente una nueva orden de servicio técnico para un
    dispositivo previamente empadronado.
    Accesible para CLIENTE, TECNICO y ADMIN autenticados.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = IniciarReparacionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reparacion = iniciar_reparacion(
            usuario_ejecutor=request.user,
            datos_validados=serializer.validated_data
        )

        return Response({
            "mensaje": "Orden de servicio iniciada exitosamente.",
            "id_reparacion": reparacion.id_reparacion,
            "codigo_seguridad": reparacion.codigo_sec,
            "etapa": reparacion.etapa,
            "fecha_inicio": reparacion.fecha_inicio,
            "costo_diagnostico": float(reparacion.id_venta.monto_subtotal) if reparacion.id_venta else 0.0,
            "estado_pago": reparacion.id_venta.estado_venta if reparacion.id_venta else "PENDIENTE",
            "id_venta": reparacion.id_venta.id_venta if reparacion.id_venta else None
        }, status=status.HTTP_201_CREATED)


class ConfiguracionDiagnosticoApi(APIView):
    """
    Retorna el costo monetario base parametrizado del diagnóstico de servicio técnico.
    Accesible para usuarios autenticados para informar el valor antes de abrir una orden.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from core_app.selectors import obtener_costo_diagnostico_base
        costo = obtener_costo_diagnostico_base()
        return Response({
            "costo_diagnostico_base": float(costo)
        }, status=status.HTTP_200_OK)


# ==============================================================================
# CATEGORÍAS DE REPARACIÓN (CU-62, CU-63, CU-64)
# ==============================================================================


class CategoriaReparacionApi(APIView):
    """
    CU-64: Filtrar Categoría de Reparación y CU-62: Crear Categoría de Reparación.
    - Requiere IsAuthenticated.
    - GET (CU-64): Permite acceso a roles ADMIN y TECNICO. Captura 'buscar' y 'estado'.
    - POST (CU-62): Exige rol ADMIN. Valida con CategoriaReparacionCreateInputSerializer.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from workshop_app.serializers import (
            CategoriaReparacionOutputSerializer,
            FiltroCategoriasReparacionInputSerializer
        )
        input_serializer = FiltroCategoriasReparacionInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)
        filtros = input_serializer.validated_data

        rol = _obtener_codigo_rol(request.user)
        estado = filtros['estado_activo']

        if rol == 'CLIENTE':
            if not estado or str(estado).strip().lower() not in ('true', '1', 'activo', 'activa', 'si'):
                raise PermissionDenied("Se requiere rol de Administrador o Técnico para realizar esta acción.")
        else:
            _exigir_rol_taller(request.user)

        from workshop_app.selectors import filtrar_categorias_reparacion

        categorias = filtrar_categorias_reparacion(
            texto_busqueda=filtros['texto_busqueda'],
            estado_activo=estado
        )
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


class RecepcionarDispositivoApi(APIView):
    """
    CU-45: Recepcionar Dispositivo.
    Endpoint para que el personal del taller (Técnico o Administrador)
    verifique los datos precargados, asiente el estado estético/físico
    del equipo frente al cliente y avance la reparación al estado 'ESPERANDO_DIAGNOSTICO'.
    """
    permission_classes = [IsAuthenticated]

    def _procesar_recepcion(self, request, id_reparacion: int):
        _exigir_rol_taller(request.user)

        from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError
        from workshop_app.serializers import (
            RecepcionarDispositivoInputSerializer,
            ReparacionRecepcionadaOutputSerializer
        )
        from workshop_app.services import recepcionar_dispositivo_taller

        serializer = RecepcionarDispositivoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            reparacion = recepcionar_dispositivo_taller(
                usuario_tecnico=request.user,
                id_reparacion=id_reparacion,
                datos_validados=serializer.validated_data
            )
        except ObjectDoesNotExist:
            return Response(
                {"error": f"No se encontró la orden de reparación con ID {id_reparacion}."},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DjangoValidationError, DRFValidationError) as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output = ReparacionRecepcionadaOutputSerializer(reparacion)
        return Response(
            {
                "mensaje": "Dispositivo recepcionado exitosamente. El equipo ingresó formalmente a la fila de diagnóstico.",
                "reparacion": output.data
            },
            status=status.HTTP_200_OK
        )

    def post(self, request, id_reparacion: int):
        return self._procesar_recepcion(request, id_reparacion)

    def put(self, request, id_reparacion: int):
        return self._procesar_recepcion(request, id_reparacion)


class ListarReparacionesApi(APIView):
    """
    CU-58: Filtrar Reparaciones.
    Motor de búsqueda de reparaciones con control de acceso horizontal y vertical:
    - Autenticación requerida para todos los roles (CLIENTE, TECNICO, ADMIN).
    - El cliente solo puede consultar y filtrar sus propias reparaciones.
    - El personal técnico y administrativo puede realizar búsquedas globales por cliente,
      técnico asignado, código de seguridad, etapa, categorías y rangos de fechas.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError
        from workshop_app.serializers import (
            FiltroReparacionesInputSerializer,
            ReparacionListOutputSerializer
        )
        from workshop_app.selectors import filtrar_reparaciones

        serializer = FiltroReparacionesInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        try:
            reparaciones = filtrar_reparaciones(
                usuario_ejecutor=request.user,
                filtros=serializer.validated_data
            )
        except (DjangoValidationError, DRFValidationError) as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_serializer = ReparacionListOutputSerializer(
            reparaciones,
            many=True,
            context={'request': request, 'usuario': request.user}
        )
        return Response(output_serializer.data, status=status.HTTP_200_OK)


# ==============================================================================
# CU-08: CARGAR DIAGNÓSTICO TÉCNICO (ENDPOINTS HTTP)
# ==============================================================================

class CargarDiagnosticoApi(APIView):
    """
    CU-08: Cargar Diagnóstico Técnico.
    Endpoint exclusivo para Técnicos y Administradores para asentar la evaluación
    técnica formal de una reparación en estado 'EN_DIAGNOSTICO', registrar insumos,
    fijar el costo de mano de obra y avanzar la orden a 'ESPERANDO_CONFIRMACION'.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, id_reparacion: int):
        _exigir_rol_taller(request.user)

        from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError
        from workshop_app.serializers import (
            CargarDiagnosticoInputSerializer,
            DiagnosticoOutputSerializer
        )
        from workshop_app.services import cargar_diagnostico_tecnico

        serializer = CargarDiagnosticoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            diagnostico = cargar_diagnostico_tecnico(
                usuario_tecnico=request.user,
                id_reparacion=id_reparacion,
                datos_validados=serializer.validated_data
            )
        except ObjectDoesNotExist:
            return Response(
                {"error": f"No se encontró la orden de reparación con ID {id_reparacion}."},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DjangoValidationError, DRFValidationError) as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output = DiagnosticoOutputSerializer(diagnostico)
        return Response(
            {
                "mensaje": "Diagnóstico técnico registrado exitosamente. La orden transicionó a 'ESPERANDO_CONFIRMACION'.",
                "diagnostico": output.data,
                "reparacion": {
                    "id_reparacion": diagnostico.id_reparacion_id,
                    "etapa": "ESPERANDO_CONFIRMACION"
                }
            },
            status=status.HTTP_201_CREATED
        )

    def get(self, request, id_reparacion: int):
        from rest_framework.exceptions import PermissionDenied as DRFPermissionDenied, NotFound as DRFNotFound, ValidationError as DRFValidationError
        from django.core.exceptions import PermissionDenied as DjangoPermissionDenied, ObjectDoesNotExist, ValidationError as DjangoValidationError
        from workshop_app.selectors import obtener_diagnostico_cliente
        from workshop_app.serializers import DiagnosticoClienteOutputSerializer

        try:
            diagnostico = obtener_diagnostico_cliente(
                usuario_cliente=request.user,
                id_reparacion=id_reparacion
            )
        except (DRFPermissionDenied, DjangoPermissionDenied) as e:
            return Response(
                {"error": str(e) if str(e) else "Acceso Denegado: No posee permisos para consultar esta orden."},
                status=status.HTTP_403_FORBIDDEN
            )
        except (DRFNotFound, ObjectDoesNotExist) as e:
            msg = getattr(e, 'detail', None) or str(e)
            return Response(
                {"error": str(msg)},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DRFValidationError, DjangoValidationError) as e:
            msg = getattr(e, 'detail', None) or (e.messages if hasattr(e, 'messages') else [str(e)])
            return Response(
                {"error": msg[0] if isinstance(msg, list) and len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DiagnosticoClienteOutputSerializer(diagnostico)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ==============================================================================
# CU-56: CONSULTAR DIAGNÓSTICO TÉCNICO (CLIENTE)
# ==============================================================================

class ConsultarDiagnosticoClienteApi(APIView):
    """
    CU-56: Consultar Diagnóstico Técnico.
    Endpoint exclusivo para clientes para consultar el informe técnico emitido
    sobre su dispositivo, conociendo la falla detectada, repuestos requeridos y presupuesto total.
    Aplica Seguridad Horizontal estricta (CU-56 Paso 2).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_reparacion: int):
        _exigir_rol_cliente(request.user)

        from rest_framework.exceptions import PermissionDenied as DRFPermissionDenied, NotFound as DRFNotFound, ValidationError as DRFValidationError
        from django.core.exceptions import PermissionDenied as DjangoPermissionDenied, ObjectDoesNotExist, ValidationError as DjangoValidationError
        from workshop_app.selectors import obtener_diagnostico_cliente
        from workshop_app.serializers import DiagnosticoClienteOutputSerializer

        try:
            diagnostico = obtener_diagnostico_cliente(
                usuario_cliente=request.user,
                id_reparacion=id_reparacion
            )
        except (DRFPermissionDenied, DjangoPermissionDenied) as e:
            return Response(
                {"error": str(e) if str(e) else "Acceso Denegado: No posee permisos para consultar esta orden."},
                status=status.HTTP_403_FORBIDDEN
            )
        except (DRFNotFound, ObjectDoesNotExist) as e:
            msg = getattr(e, 'detail', None) or str(e)
            return Response(
                {"error": str(msg)},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DRFValidationError, DjangoValidationError) as e:
            msg = getattr(e, 'detail', None) or (e.messages if hasattr(e, 'messages') else [str(e)])
            return Response(
                {"error": msg[0] if isinstance(msg, list) and len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DiagnosticoClienteOutputSerializer(diagnostico)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ==============================================================================
# CU-09: CONFIRMAR O RECHAZAR REPARACIÓN (CLIENTE)
# ==============================================================================

class DecisionReparacionApi(APIView):
    """
    CU-09: Confirmar o rechazar reparación.
    Endpoint para que el cliente acepte o rechace el presupuesto técnico de su equipo.
    Si acepta: avanza a 'EN_REPARACION' y genera Venta asociada a insumos en estado PENDIENTE.
    Si rechaza: avanza a 'CANCELADO' y finaliza el ciclo operativo.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, id_reparacion: int):
        _exigir_rol_cliente(request.user)

        from rest_framework.exceptions import PermissionDenied as DRFPermissionDenied, NotFound as DRFNotFound, ValidationError as DRFValidationError
        from django.core.exceptions import PermissionDenied as DjangoPermissionDenied, ObjectDoesNotExist, ValidationError as DjangoValidationError
        from workshop_app.serializers import DecisionReparacionInputSerializer
        from workshop_app.services import procesar_decision_reparacion

        serializer = DecisionReparacionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            reparacion = procesar_decision_reparacion(
                usuario_cliente=request.user,
                id_reparacion=id_reparacion,
                datos_validados=serializer.validated_data
            )
        except (DRFPermissionDenied, DjangoPermissionDenied) as e:
            return Response(
                {"error": str(e) if str(e) else "Acceso Denegado: No posee permisos sobre esta reparación."},
                status=status.HTTP_403_FORBIDDEN
            )
        except (DRFNotFound, ObjectDoesNotExist) as e:
            msg = getattr(e, 'detail', None) or str(e)
            return Response(
                {"error": str(msg)},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DRFValidationError, DjangoValidationError) as e:
            msg = getattr(e, 'detail', None) or (e.messages if hasattr(e, 'messages') else [str(e)])
            return Response(
                {"error": msg[0] if isinstance(msg, list) and len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        decision = serializer.validated_data['decision']
        mensaje_exito = (
            "Presupuesto de reparación aceptado exitosamente. Se ha generado la orden de insumos asociada."
            if decision == 'ACEPTAR'
            else "Presupuesto de reparación rechazado. La orden ha sido cancelada."
        )

        return Response(
            {
                "mensaje": mensaje_exito,
                "reparacion": {
                    "id_reparacion": reparacion.id_reparacion,
                    "etapa": reparacion.etapa,
                    "id_venta": reparacion.id_venta_id
                }
            },
            status=status.HTTP_200_OK
        )


class CambiarEstadoReparacionApi(APIView):
    """
    CU-10: Actualizar estado de reparación.
    Endpoint exclusivo para técnicos y administradores de taller.
    Permite modificar la etapa de avance operativo de una reparación en curso
    respetando las reglas de la máquina de estados e insertando bitácora y notificación.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_reparacion: int):
        _exigir_rol_taller(request.user)

        from rest_framework.exceptions import PermissionDenied as DRFPermissionDenied, NotFound as DRFNotFound, ValidationError as DRFValidationError
        from django.core.exceptions import PermissionDenied as DjangoPermissionDenied, ObjectDoesNotExist, ValidationError as DjangoValidationError
        from workshop_app.serializers import CambiarEstadoReparacionInputSerializer
        from workshop_app.services import cambiar_estado_reparacion

        serializer = CambiarEstadoReparacionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            reparacion = cambiar_estado_reparacion(
                usuario_tecnico=request.user,
                id_reparacion=id_reparacion,
                datos_validados=serializer.validated_data
            )
        except (DRFPermissionDenied, DjangoPermissionDenied) as e:
            return Response(
                {"error": str(e) if str(e) else "Acceso Denegado: Permisos insuficientes para modificar esta reparación."},
                status=status.HTTP_403_FORBIDDEN
            )
        except (DRFNotFound, ObjectDoesNotExist) as e:
            msg = getattr(e, 'detail', None) or str(e)
            return Response(
                {"error": str(msg)},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DRFValidationError, DjangoValidationError) as e:
            msg = getattr(e, 'detail', None) or (e.messages if hasattr(e, 'messages') else [str(e)])
            return Response(
                {"error": msg[0] if isinstance(msg, list) and len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "mensaje": f"Estado de la reparación actualizado a '{reparacion.etapa}' exitosamente.",
                "reparacion": {
                    "id_reparacion": reparacion.id_reparacion,
                    "etapa": reparacion.etapa
                }
            },
            status=status.HTTP_200_OK
        )


# ==============================================================================
# CU-46: Entregar Dispositivo (Endpoint HTTP)
# ==============================================================================

class EntregarDispositivoApi(APIView):
    """
    CU-46: Entregar Dispositivo.
    Permite al personal del taller (Técnicos o Administradores) registrar formalmente
    la entrega física del dispositivo al cliente, verificando código de seguridad o DNI,
    inexistencia de saldos deudores y transicionando el estado a ENTREGADO de forma inmutable.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_taller(request.user)

        from workshop_app.selectors import buscar_reparacion_para_entrega
        from workshop_app.serializers import BuscarReparacionEntregaInputSerializer
        from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
        from rest_framework.exceptions import PermissionDenied as DRFPermissionDenied
        from sales_app.services import _calcular_total_operacion

        input_serializer = BuscarReparacionEntregaInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)
        filtros = input_serializer.validated_data

        codigo = filtros['codigo_seguridad']
        dni = filtros['dni_cliente']

        try:
            reparacion = buscar_reparacion_para_entrega(
                usuario_ejecutor=request.user,
                codigo_seguridad=codigo,
                dni_cliente=dni
            )
        except DRFPermissionDenied as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Extraer datos de cliente, dispositivo y estado financiero
        disp = reparacion.id_dispositivo
        cliente = getattr(reparacion, 'id_usuario', None) or (getattr(disp, 'id_usuario', None) if disp else None)
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

        # Comprobar deuda pendiente
        etapa_limpia = (reparacion.etapa or '').strip().upper().replace(' ', '_')
        venta_vinculada = getattr(reparacion, 'id_venta', None)
        total_costo = _calcular_total_operacion(reparacion)

        saldo_pendiente = "0.00"
        if etapa_limpia == 'PAGADO':
            saldo_pendiente = "0.00"
        elif venta_vinculada and str(venta_vinculada.estado_venta).strip().upper() == 'PAGADO':
            saldo_pendiente = "0.00"
        else:
            saldo_pendiente = str(total_costo)

        disp_marca = ""
        disp_modelo = ""
        disp_imagen = ""
        disp_serie = ""
        if disp:
            disp_serie = disp.numero_serie or ""
            disp_imagen = disp.imagen or ""
            if disp.id_modelo:
                disp_modelo = disp.id_modelo.nombre or ""
                if disp.id_modelo.id_marca:
                    disp_marca = disp.id_modelo.id_marca.nombre or ""

        return Response(
            {
                "id_reparacion": reparacion.id_reparacion,
                "codigo_seguridad": reparacion.codigo_sec or "",
                "etapa": reparacion.etapa,
                "fecha_inicio": str(reparacion.fecha_inicio),
                "cliente": {
                    "nombre": cliente_nombre,
                    "dni": cliente_dni,
                    "email": cliente_email
                },
                "dispositivo": {
                    "id_dispositivo": getattr(disp, 'id_dispositivo', None),
                    "marca": disp_marca,
                    "modelo": disp_modelo,
                    "serie": disp_serie,
                    "imagen": disp_imagen
                },
                "saldo_pendiente": saldo_pendiente,
                "total_costo": str(total_costo)
            },
            status=status.HTTP_200_OK
        )

    def post(self, request):
        _exigir_rol_taller(request.user)


        from workshop_app.serializers import EntregarDispositivoInputSerializer
        from workshop_app.services import entregar_dispositivo_cliente
        from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
        from rest_framework.exceptions import PermissionDenied as DRFPermissionDenied

        serializer = EntregarDispositivoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            reparacion = entregar_dispositivo_cliente(
                usuario_tecnico=request.user,
                datos_validados=serializer.validated_data
            )
        except DRFPermissionDenied as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "mensaje": "Equipo entregado con éxito.",
                "id_reparacion": reparacion.id_reparacion,
                "etapa": reparacion.etapa,
                "fecha_entrega": str(reparacion.fecha_entrega)
            },
            status=status.HTTP_200_OK
        )


# ==============================================================================
# CU-19: CALIFICAR SERVICIO TÉCNICO (CLIENTE)
# ==============================================================================

class CalificarReparacionApi(APIView):
    """
    CU-19: Calificar Servicio Técnico.
    Endpoint exclusivo para clientes autenticados.
    Permite valorar una reparación finalizada ('ENTREGADO') registrando puntuación (1 a 5)
    y comentario cualitativo.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, id_reparacion: int):
        _exigir_rol_cliente(request.user)

        from rest_framework.exceptions import (
            PermissionDenied as DRFPermissionDenied,
            NotFound as DRFNotFound,
            ValidationError as DRFValidationError
        )
        from django.core.exceptions import (
            PermissionDenied as DjangoPermissionDenied,
            ObjectDoesNotExist,
            ValidationError as DjangoValidationError
        )
        from workshop_app.serializers import (
            CalificarReparacionInputSerializer,
            CalificacionOutputSerializer
        )
        from workshop_app.services import calificar_reparacion

        serializer = CalificarReparacionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            calificacion = calificar_reparacion(
                usuario_cliente=request.user,
                id_reparacion=id_reparacion,
                datos_validados=serializer.validated_data
            )
        except (DRFPermissionDenied, DjangoPermissionDenied) as e:
            return Response(
                {"error": str(e) if str(e) else "Acceso Denegado: No posee permisos para calificar esta reparación."},
                status=status.HTTP_403_FORBIDDEN
            )
        except (DRFNotFound, ObjectDoesNotExist) as e:
            msg = getattr(e, 'detail', None) or str(e)
            return Response(
                {"error": str(msg)},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DRFValidationError, DjangoValidationError) as e:
            msg = getattr(e, 'detail', None) or (e.messages if hasattr(e, 'messages') else [str(e)])
            return Response(
                {"error": msg[0] if isinstance(msg, list) and len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_serializer = CalificacionOutputSerializer(calificacion)

        return Response(
            {
                "mensaje": "Gracias por su retroalimentación.",
                "calificacion": output_serializer.data
            },
            status=status.HTTP_201_CREATED
        )


# ==============================================================================
# CU-51: CONSULTAR CALIFICACIÓN DE SERVICIO
# ==============================================================================

class ConsultarCalificacionApi(APIView):
    """
    CU-51: Consultar Calificación de Servicio.
    Endpoint de solo lectura para Clientes, Técnicos y Administradores.
    Permite visualizar la valoración cualitativa y cuantitativa de una reparación finalizada,
    aplicando Seguridad Horizontal según el rol del usuario autenticado.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_reparacion: int):
        from rest_framework.exceptions import (
            PermissionDenied as DRFPermissionDenied,
            NotFound as DRFNotFound,
            ValidationError as DRFValidationError
        )
        from django.core.exceptions import (
            PermissionDenied as DjangoPermissionDenied,
            ObjectDoesNotExist,
            ValidationError as DjangoValidationError
        )
        from workshop_app.selectors import obtener_calificacion_reparacion
        from workshop_app.serializers import CalificacionOutputSerializer

        try:
            calificacion = obtener_calificacion_reparacion(
                usuario_ejecutor=request.user,
                id_reparacion=id_reparacion
            )
        except (DRFPermissionDenied, DjangoPermissionDenied) as e:
            return Response(
                {"error": str(e) if str(e) else "Acceso Denegado: No posee permisos para consultar esta calificación."},
                status=status.HTTP_403_FORBIDDEN
            )
        except (DRFNotFound, ObjectDoesNotExist) as e:
            msg = getattr(e, 'detail', None) or str(e)
            return Response(
                {"error": str(msg)},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DRFValidationError, DjangoValidationError) as e:
            msg = getattr(e, 'detail', None) or (e.messages if hasattr(e, 'messages') else [str(e)])
            return Response(
                {"error": msg[0] if isinstance(msg, list) and len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = CalificacionOutputSerializer(calificacion)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ReporteConversionApi(APIView):
    """
    CU-72: Generar Reporte de Conversión de Presupuestos.
    Evalúa la efectividad comercial del taller cruzando la emisión de presupuestos
    con las respuestas finales del cliente, exponiendo el nivel de aceptación global,
    el lucro cesante y las tasas de rechazo segmentadas por tipo de servicio.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_admin(request.user)

        from rest_framework.exceptions import ValidationError as DRFValidationError
        from django.core.exceptions import ValidationError as DjangoValidationError
        from workshop_app.serializers import (
            FiltroReportesInputSerializer,
            ReporteConversionOutputSerializer
        )
        from workshop_app.services import generar_auditoria_reporte_conversion

        serializer = FiltroReportesInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        try:
            resultado = generar_auditoria_reporte_conversion(
                usuario_admin=request.user,
                filtros_validados=serializer.validated_data
            )
        except (DRFValidationError, DjangoValidationError) as e:
            err_msg = getattr(e, 'detail', None) or (e.messages if hasattr(e, 'messages') else [str(e)])
            return Response(
                {"error": err_msg[0] if isinstance(err_msg, list) and len(err_msg) == 1 else err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_serializer = ReporteConversionOutputSerializer(resultado)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class ReporteEficienciaApi(APIView):
    """
    CU-73: Generar Reporte de Demanda y Eficiencia por Categoría.
    Evalúa la carga operativa y la viabilidad comercial de los distintos rubros del taller,
    cruzando volumen de servicios finalizados, facturación bruta y tiempo operativo medio de resolución.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_admin(request.user)

        from rest_framework.exceptions import ValidationError as DRFValidationError
        from django.core.exceptions import ValidationError as DjangoValidationError
        from workshop_app.serializers import (
            FiltroReportesInputSerializer,
            ReporteEficienciaOutputSerializer
        )
        from workshop_app.services import generar_auditoria_reporte_eficiencia

        serializer = FiltroReportesInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        try:
            resultado = generar_auditoria_reporte_eficiencia(
                usuario_admin=request.user,
                filtros_validados=serializer.validated_data
            )
        except (DRFValidationError, DjangoValidationError) as e:
            err_msg = getattr(e, 'detail', None) or (e.messages if hasattr(e, 'messages') else [str(e)])
            return Response(
                {"error": err_msg[0] if isinstance(err_msg, list) and len(err_msg) == 1 else err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_serializer = ReporteEficienciaOutputSerializer(resultado, many=True)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class ReporteProductividadApi(APIView):
    """
    CU-74: Generar Reporte de Productividad y Carga de Trabajo Técnica.
    Evalúa integralmente el rendimiento laboral y la disciplina operativa de los técnicos,
    así como su nivel actual de asignación en tiempo real para facilitar el balanceo de carga.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_admin(request.user)

        from rest_framework.exceptions import ValidationError as DRFValidationError
        from django.core.exceptions import ValidationError as DjangoValidationError
        from workshop_app.serializers import (
            FiltroProductividadInputSerializer,
            ReporteProductividadItemOutputSerializer
        )
        from workshop_app.services import generar_auditoria_productividad

        serializer = FiltroProductividadInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        try:
            resultado = generar_auditoria_productividad(
                usuario_admin=request.user,
                filtros_validados=serializer.validated_data
            )
        except (DRFValidationError, DjangoValidationError) as e:
            err_msg = getattr(e, 'detail', None) or (e.messages if hasattr(e, 'messages') else [str(e)])
            return Response(
                {"error": err_msg[0] if isinstance(err_msg, list) and len(err_msg) == 1 else err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_serializer = ReporteProductividadItemOutputSerializer(resultado, many=True)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


# ==============================================================================
# CU-76: GENERAR REPORTE DE SATISFACCIÓN Y CALIDAD (APIS)
# ==============================================================================

class ReporteSatisfaccionApi(APIView):
    """
    CU-76: Generar Reporte de Satisfacción y Calidad.
    Permite a la gerencia auditar la percepción de calidad del cliente cruzando las calificaciones
    recibidas con el personal técnico responsable y los rubros intervenidos.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_admin(request.user)

        from rest_framework.exceptions import ValidationError as DRFValidationError
        from django.core.exceptions import ValidationError as DjangoValidationError
        from workshop_app.serializers import (
            FiltroSatisfaccionInputSerializer,
            ReporteSatisfaccionOutputSerializer
        )
        from workshop_app.services import generar_auditoria_reporte_satisfaccion

        serializer = FiltroSatisfaccionInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        try:
            resultado = generar_auditoria_reporte_satisfaccion(
                usuario_admin=request.user,
                filtros_validados=serializer.validated_data
            )
        except (DRFValidationError, DjangoValidationError) as e:
            err_msg = getattr(e, 'detail', None) or (e.messages if hasattr(e, 'messages') else [str(e)])
            return Response(
                {"error": err_msg[0] if isinstance(err_msg, list) and len(err_msg) == 1 else err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_serializer = ReporteSatisfaccionOutputSerializer(resultado)
        return Response(output_serializer.data, status=status.HTTP_200_OK)








