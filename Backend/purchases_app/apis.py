from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.exceptions import PermissionDenied, ValidationError as DRFValidationError
from django.core.exceptions import (
    PermissionDenied as DjangoPermissionDenied,
    ObjectDoesNotExist,
    ValidationError as DjangoValidationError
)

from purchases_app.selectors import (
    obtener_estado_motor_abastecimiento,
    obtener_articulos_deficitarios_con_transito,
    filtrar_proveedores,
    filtrar_ordenes_compra,
    filtrar_solicitudes_cotizacion,
    filtrar_cotizaciones,
    obtener_proveedor_completo,
    listar_solicitudes_cotizacion,
    obtener_detalle_solicitud,
    obtener_invitacion_por_token,
    obtener_cotizaciones_por_solicitud,
    obtener_detalle_cotizacion,
    calcular_mejores_ofertas,
    obtener_orden_esperando_entrega,
    obtener_detalle_orden_compra,
    listar_compras_directas,
    obtener_expediente_inspeccion_proveedor
)
from purchases_app.serializers import (
    FiltrarProveedoresInputSerializer,
    ProveedorOutputSerializer,
    FiltrarOrdenesCompraInputSerializer,
    OrdenCompraOutputSerializer,
    FiltrarSolicitudCotizacionInputSerializer,
    SolicitudCotizacionOutputSerializer,
    FiltrarCotizacionesInputSerializer,
    CotizacionOutputSerializer,
    RegistrarProveedorInputSerializer,
    ModificarProveedorInputSerializer,
    ProveedorDetalleOutputSerializer,
    ExpedienteInspeccionProveedorOutputSerializer,
    GenerarSolicitudInputSerializer,
    SolicitudCotizacionListOutputSerializer,
    SolicitudCotizacionDetailOutputSerializer,
    ModificarSolicitudInputSerializer,
    ResponderCotizacionInputSerializer,
    FichaCotizacionPortalOutputSerializer,
    CotizacionResumenOutputSerializer,
    CotizacionDetalleOutputSerializer,
    EvaluarCotizacionInputSerializer,
    CalcularMejorCompraInputSerializer,
    EmitirOrdenesCompraInputSerializer,
    OrdenCompraCompletaOutputSerializer,
    RecepcionarCompraInputSerializer,
    ChecklistRecepcionOutputSerializer,
    RecepcionCompraOutputSerializer,
    OrdenCompraDetailOutputSerializer,
    RegistrarCompraDirectaInputSerializer,
    RegistroCompraOutputSerializer
)
from purchases_app.services import (
    ejecutar_ciclo_abastecimiento_automatico,
    registrar_proveedor,
    modificar_proveedor,
    generar_solicitud_cotizacion,
    modificar_solicitud_cotizacion,
    eliminar_solicitud_cotizacion,
    procesar_respuesta_cotizacion,
    evaluar_cotizacion,
    emitir_ordenes_compra,
    recepcionar_orden_compra,
    registrar_compra_directa,
    registrar_auditoria_filtro_ordenes_compra
)


def _exigir_rol_admin(usuario):
    rol = getattr(usuario, 'id_rol', None) or getattr(usuario, 'rol', None)
    codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
    nombre_rol = (getattr(rol, 'nombre_rol', '') or '').lower()
    if codigo_rol != 'ADMIN' and nombre_rol != 'administrador':
        raise PermissionDenied("Se requiere rol de Administrador para realizar esta acción.")


# ==============================================================================
# CU-36: FILTRAR PROVEEDORES
# ==============================================================================

class FiltrarProveedoresApi(APIView):
    """
    CU-36: Filtrar Proveedores.
    Endpoint exclusivo para Administradores.
    Permite buscar proveedores por Nombre comercial o CUIT, y filtrar por envío y nivel.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_admin(request.user)

        serializer = FiltrarProveedoresInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        proveedores = filtrar_proveedores(
            usuario_ejecutor=request.user,
            filtros=serializer.validated_data
        )

        output = ProveedorOutputSerializer(proveedores, many=True)
        return Response(output.data, status=status.HTTP_200_OK)

    def post(self, request):
        """Soporta creación directa de proveedor en /api/purchases/proveedores/."""
        return RegistrarProveedorApi().post(request)



# ==============================================================================
# CU-37: FILTRAR ÓRDENES DE COMPRA
# ==============================================================================

class FiltrarOrdenesCompraApi(APIView):
    """
    CU-37: Filtrar Órdenes de Compra.
    Endpoint exclusivo para Administradores.
    Permite auditar órdenes de compra por ID, estado, rango de fechas, modalidad de entrega y proveedor.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_admin(request.user)

        serializer = FiltrarOrdenesCompraInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        ordenes = filtrar_ordenes_compra(
            usuario_ejecutor=request.user,
            filtros=serializer.validated_data
        )

        output = OrdenCompraOutputSerializer(ordenes, many=True)
        datos_salida = output.data

        registrar_auditoria_filtro_ordenes_compra(
            usuario_admin=request.user,
            filtros=serializer.validated_data,
            total_resultados=len(datos_salida)
        )

        return Response(datos_salida, status=status.HTTP_200_OK)


# ==============================================================================
# CU-41: FILTRAR SOLICITUD DE COTIZACIÓN
# ==============================================================================

class FiltrarSolicitudesCotizacionApi(APIView):
    """
    CU-41: Filtrar Solicitud de Cotización.
    Endpoint exclusivo para Administradores.
    Permite buscar solicitudes por ID, estado, rango de fechas y producto incluido.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_admin(request.user)

        serializer = FiltrarSolicitudCotizacionInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        solicitudes = filtrar_solicitudes_cotizacion(
            usuario_ejecutor=request.user,
            filtros=serializer.validated_data
        )

        output = SolicitudCotizacionOutputSerializer(solicitudes, many=True)
        return Response(output.data, status=status.HTTP_200_OK)


# ==============================================================================
# CU-60: FILTRAR COTIZACIONES
# ==============================================================================

class FiltrarCotizacionesApi(APIView):
    """
    CU-60: Filtrar Cotizaciones.
    Endpoint exclusivo para Administradores.
    Permite evaluar y filtrar propuestas económicas de proveedores por estado, validez o solicitud.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_admin(request.user)

        serializer = FiltrarCotizacionesInputSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        cotizaciones = filtrar_cotizaciones(
            usuario_ejecutor=request.user,
            filtros=serializer.validated_data
        )

        output = CotizacionOutputSerializer(cotizaciones, many=True)
        return Response(output.data, status=status.HTTP_200_OK)


# ==============================================================================
# CU-24: REGISTRAR PROVEEDOR
# ==============================================================================

class RegistrarProveedorApi(APIView):
    """
    CU-24: Registrar Proveedor.
    Permite al Administrador dar de alta una nueva entidad proveedora en el sistema
    capturando sus datos comerciales, fiscales y su dirección física.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _exigir_rol_admin(request.user)

        serializer = RegistrarProveedorInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            proveedor = registrar_proveedor(
                usuario_admin=request.user,
                datos_validados=serializer.validated_data
            )
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output = ProveedorDetalleOutputSerializer(proveedor)
        return Response(
            {
                "mensaje": "Proveedor registrado exitosamente.",
                "proveedor": output.data
            },
            status=status.HTTP_201_CREATED
        )


# ==============================================================================
# CU-28: MODIFICAR PROVEEDOR
# ==============================================================================

class ModificarProveedorApi(APIView):
    """
    CU-28: Modificar Proveedor.
    Permite al Administrador actualizar la información de contacto, datos fiscales
    o alternar el estado operativo (Activo/Inactivo) de un proveedor empadronado.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_proveedor: str):
        _exigir_rol_admin(request.user)

        serializer = ModificarProveedorInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            proveedor = modificar_proveedor(
                usuario_admin=request.user,
                id_proveedor=id_proveedor,
                datos_validados=serializer.validated_data
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

        output = ProveedorDetalleOutputSerializer(proveedor)
        return Response(
            {
                "mensaje": "Proveedor modificado exitosamente.",
                "proveedor": output.data
            },
            status=status.HTTP_200_OK
        )

    def put(self, request, id_proveedor: str):
        return self.patch(request, id_proveedor)

    def get(self, request, id_proveedor: str):
        if str(id_proveedor).strip().lower() == 'filtrar':
            return FiltrarProveedoresApi().get(request)

        _exigir_rol_admin(request.user)

        try:
            proveedor = obtener_proveedor_completo(id_proveedor)
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

        output = ProveedorDetalleOutputSerializer(proveedor)
        return Response(output.data, status=status.HTTP_200_OK)


# ==============================================================================
# CU-14: GENERAR SOLICITUD DE COTIZACIÓN
# ==============================================================================

class GenerarSolicitudCotizacionApi(APIView):
    """
    CU-14: Generar Solicitud de Cotización.
    Permite al Administrador confeccionar y despachar un pedido de cotización
    hacia múltiples proveedores activos, o guardarlo como borrador sin emitir invitaciones.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _exigir_rol_admin(request.user)

        serializer = GenerarSolicitudInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            solicitud = generar_solicitud_cotizacion(
                usuario_admin=request.user,
                datos_validados=serializer.validated_data
            )
        except (DjangoValidationError, DRFValidationError) as e:
            if hasattr(e, 'detail'):
                detail = e.detail
                if isinstance(detail, list):
                    err_msg = str(detail[0])
                elif isinstance(detail, dict):
                    err_msg = str(detail)
                else:
                    err_msg = str(detail)
            elif hasattr(e, 'messages'):
                err_msg = e.messages[0] if len(e.messages) == 1 else e.messages
            else:
                err_msg = str(e)

            return Response(
                {"error": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        solicitud_cargada = obtener_detalle_solicitud(solicitud.id_solicitud)
        output = SolicitudCotizacionDetailOutputSerializer(solicitud_cargada)
        return Response(
            {
                "mensaje": "Solicitud de cotización generada exitosamente.",
                "solicitud": output.data
            },
            status=status.HTTP_201_CREATED
        )


# ==============================================================================
# CU-15: CONSULTAR SOLICITUD DE COTIZACIÓN (LISTA Y DETALLE)
# ==============================================================================

class ListarSolicitudesCotizacionApi(APIView):
    """
    CU-15: Consultar Solicitudes de Cotización (Listado).
    Despliega el historial de solicitudes de cotización emitidas y en borrador.
    Permite también recepcionar POST para crear una nueva solicitud en el mismo endpoint base.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_admin(request.user)

        solicitudes = listar_solicitudes_cotizacion()
        output = SolicitudCotizacionListOutputSerializer(solicitudes, many=True)
        return Response(output.data, status=status.HTTP_200_OK)

    def post(self, request):
        """Permite generar una nueva solicitud de cotización vía POST en /solicitudes-cotizacion/."""
        return GenerarSolicitudCotizacionApi().post(request)


class DetalleSolicitudCotizacionApi(APIView):
    """
    CU-15: Consultar Solicitud de Cotización (Detalle).
    Exhibe el expediente completo: cabecera, lista detallada de repuestos e insumos solicitados,
    padrón de proveedores invitados y la matriz de ofertas recibidas con sus estados y tokens.
    Soporta también operaciones de actualización (PUT/PATCH) y baja física (DELETE).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_solicitud: int):
        _exigir_rol_admin(request.user)

        try:
            solicitud = obtener_detalle_solicitud(id_solicitud)
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

        output = SolicitudCotizacionDetailOutputSerializer(solicitud)
        return Response(output.data, status=status.HTTP_200_OK)

    def patch(self, request, id_solicitud: int):
        return ModificarSolicitudCotizacionApi().patch(request, id_solicitud)

    def put(self, request, id_solicitud: int):
        return ModificarSolicitudCotizacionApi().put(request, id_solicitud)

    def delete(self, request, id_solicitud: int):
        return EliminarSolicitudCotizacionApi().delete(request, id_solicitud)


# ==============================================================================
# CU-16: MODIFICAR SOLICITUD DE COTIZACIÓN
# ==============================================================================

class ModificarSolicitudCotizacionApi(APIView):
    """
    CU-16: Modificar Solicitud de Cotización.
    Permite al Administrador editar la lista de repuestos y el padrón de proveedores
    de un sondeo que se encuentre en estado 'Borrador'.
    Puede mantenerse en borrador o transicionar a emisión formal ('Enviada a Proveedores').
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_solicitud: int):
        _exigir_rol_admin(request.user)

        serializer = ModificarSolicitudInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            solicitud = modificar_solicitud_cotizacion(
                usuario_admin=request.user,
                id_solicitud=id_solicitud,
                datos_validados=serializer.validated_data
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DjangoValidationError, DRFValidationError) as e:
            if hasattr(e, 'detail'):
                detail = e.detail
                if isinstance(detail, list):
                    err_msg = str(detail[0])
                elif isinstance(detail, dict):
                    err_msg = str(detail)
                else:
                    err_msg = str(detail)
            elif hasattr(e, 'messages'):
                err_msg = e.messages[0] if len(e.messages) == 1 else e.messages
            else:
                err_msg = str(e)

            return Response(
                {"error": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        solicitud_cargada = obtener_detalle_solicitud(solicitud.id_solicitud)
        output = SolicitudCotizacionDetailOutputSerializer(solicitud_cargada)
        return Response(
            {
                "mensaje": "Solicitud de cotización modificada exitosamente.",
                "solicitud": output.data
            },
            status=status.HTTP_200_OK
        )

    def put(self, request, id_solicitud: int):
        return self.patch(request, id_solicitud)


# ==============================================================================
# CU-17: ELIMINAR SOLICITUD DE COTIZACIÓN
# ==============================================================================

class EliminarSolicitudCotizacionApi(APIView):
    """
    CU-17: Eliminar Solicitud de Cotización.
    Permite al Administrador eliminar definitivamente un documento de sondeo en estado 'Borrador'.
    Bloquea la operación si el documento ya superó la fase de borrador o si está vinculado
    a requerimientos técnicos de una reparación en curso (sol_tec = True).
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, id_solicitud: int):
        _exigir_rol_admin(request.user)

        try:
            eliminar_solicitud_cotizacion(
                usuario_admin=request.user,
                id_solicitud=id_solicitud
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DjangoValidationError, DRFValidationError) as e:
            if hasattr(e, 'detail'):
                detail = e.detail
                if isinstance(detail, list):
                    err_msg = str(detail[0])
                elif isinstance(detail, dict):
                    err_msg = str(detail)
                else:
                    err_msg = str(detail)
            elif hasattr(e, 'messages'):
                err_msg = e.messages[0] if len(e.messages) == 1 else e.messages
            else:
                err_msg = str(e)

            return Response(
                {"error": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


# ==============================================================================
# CU-25: RESPONDER SOLICITUD DE COTIZACIÓN
# ==============================================================================

class ResponderCotizacionApi(APIView):
    """
    CU-25: Responder Solicitud de Cotización.
    Permite a un proveedor externo interactuar con el sistema a través de un enlace seguro
    para consultar los repuestos requeridos (GET) y enviar su propuesta formal o declinar (POST).
    Excepción de seguridad: No requiere autenticación tradicional (permission_classes = [AllowAny]),
    la seguridad se basa estrictamente en la validez y vigencia del token criptográfico unívoco.
    Soporta multipart/form-data para carga del PDF contable de respaldo.
    """
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, token_acceso: str):
        """
        Paso 1, 2 y 3: Consulta del portal por enlace seguro.
        Despliega el detalle de la solicitud y repuestos a cotizar.
        """
        try:
            invitacion = obtener_invitacion_por_token(token_acceso)
        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response(
                {"error": str(e) or "El enlace es inválido o ha expirado."},
                status=status.HTTP_403_FORBIDDEN
            )
        except (DjangoValidationError, DRFValidationError) as e:
            err_msg = e.messages[0] if hasattr(e, 'messages') else str(e)
            return Response(
                {"error": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

        output = FichaCotizacionPortalOutputSerializer(invitacion)
        return Response(output.data, status=status.HTTP_200_OK)

    def post(self, request, token_acceso: str):
        """
        Paso 4 a 9: Carga de precios y formalización de oferta o declinación.
        """
        # Paso 2: Valida el token y la vigencia de la Solicitud antes de procesar el payload
        try:
            obtener_invitacion_por_token(token_acceso)
        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response(
                {"error": str(e) or "El enlace es inválido o ha expirado."},
                status=status.HTTP_403_FORBIDDEN
            )
        except (DjangoValidationError, DRFValidationError) as e:
            err_msg = e.messages[0] if hasattr(e, 'messages') else str(e)
            return Response(
                {"error": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = ResponderCotizacionInputSerializer(data=request.data)
        if not serializer.is_valid():
            primer_error = next(iter(serializer.errors.values()))
            mensaje_error = primer_error[0] if isinstance(primer_error, list) else str(primer_error)
            return Response(
                {"error": mensaje_error, "detalles": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            cotizacion = procesar_respuesta_cotizacion(
                token_acceso=token_acceso,
                datos_validados=serializer.validated_data
            )
        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response(
                {"error": str(e) or "El enlace es inválido o ha expirado."},
                status=status.HTTP_403_FORBIDDEN
            )
        except (DjangoValidationError, DRFValidationError) as e:
            if hasattr(e, 'detail'):
                detail = e.detail
                err_msg = str(detail[0]) if isinstance(detail, list) else str(detail)
            elif hasattr(e, 'messages'):
                err_msg = e.messages[0] if len(e.messages) == 1 else e.messages
            else:
                err_msg = str(e)

            return Response(
                {"error": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

        accion = serializer.validated_data.get('accion')
        mensaje_exito = (
            "Su cotización ha sido enviada exitosamente."
            if accion == 'COTIZAR'
            else "Ha declinado la solicitud de cotización exitosamente."
        )

        return Response(
            {
                "mensaje": mensaje_exito,
                "id_cotizacion": cotizacion.id_cotizacion,
                "estado_cotizacion": cotizacion.estado_cotizacion,
                "estado": cotizacion.estado_nombre
            },
            status=status.HTTP_200_OK
        )


# ==============================================================================
# CU-52: INSPECCIONAR COTIZACIONES
# ==============================================================================

class ListarCotizacionesPorSolicitudApi(APIView):
    """
    CU-52: Inspeccionar Cotizaciones.
    Permite al Administrador visualizar la lista comparativa de ofertas económicas
    asociadas a una solicitud de cotización específica.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_solicitud: int):
        _exigir_rol_admin(request.user)

        try:
            cotizaciones = obtener_cotizaciones_por_solicitud(id_solicitud)
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DjangoValidationError, DRFValidationError) as e:
            err_msg = e.messages[0] if hasattr(e, 'messages') else str(e)
            return Response(
                {"error": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output = CotizacionResumenOutputSerializer(cotizaciones, many=True)
        return Response(output.data, status=status.HTTP_200_OK)


class DetalleCotizacionApi(APIView):
    """
    CU-52: Inspeccionar Cotizaciones (Vista Detallada).
    Despliega el expediente completo de una cotización con sus renglones desglosados,
    proveedor emisor, plazo y subtotales.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_cotizacion: int):
        _exigir_rol_admin(request.user)

        try:
            cotizacion = obtener_detalle_cotizacion(id_cotizacion)
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

        output = CotizacionDetalleOutputSerializer(cotizacion)
        return Response(output.data, status=status.HTTP_200_OK)


# ==============================================================================
# CU-53: EVALUAR COTIZACIÓN
# ==============================================================================

class EvaluarCotizacionApi(APIView):
    """
    CU-53: Evaluar Cotización.
    Permite al Administrador dictaminar ('ACEPTAR' o 'RECHAZAR') sobre una propuesta económica.
    Al aceptar, valida los precios históricos; al evaluar la última oferta pendiente,
    cierra automáticamente el sondeo de mercado ('Cerrada/Evaluada').
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_cotizacion: int):
        _exigir_rol_admin(request.user)

        serializer = EvaluarCotizacionInputSerializer(data=request.data)
        if not serializer.is_valid():
            primer_error = next(iter(serializer.errors.values()))
            mensaje_error = primer_error[0] if isinstance(primer_error, list) else str(primer_error)
            return Response(
                {"error": mensaje_error, "detalles": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            cotizacion = evaluar_cotizacion(
                usuario_admin=request.user,
                id_cotizacion=id_cotizacion,
                datos_validados=serializer.validated_data
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DjangoValidationError, DRFValidationError) as e:
            err_msg = e.messages[0] if hasattr(e, 'messages') else str(e)
            return Response(
                {"error": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output = CotizacionDetalleOutputSerializer(cotizacion)
        return Response(
            {
                "mensaje": f"Cotización evaluada exitosamente ({cotizacion.estado_nombre}).",
                "cotizacion": output.data
            },
            status=status.HTTP_200_OK
        )

    def put(self, request, id_cotizacion: int):
        return self.patch(request, id_cotizacion)


# ==============================================================================
# CU-54: GENERAR ORDEN DE COMPRA (ALGORITMO MEJOR COMPRA Y EMISIÓN)
# ==============================================================================

class CalcularMejorCompraApi(APIView):
    """
    CU-54 (Paso 3 y 4): Algoritmo de Mejor Compra.
    Calcula los insumos ganadores por menor precio y disponibilidad de envío,
    agrupándolos por proveedor y reportando advertencias de insumos huérfanos.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _exigir_rol_admin(request.user)

        serializer = CalcularMejorCompraInputSerializer(data=request.data)
        if not serializer.is_valid():
            primer_error = next(iter(serializer.errors.values()))
            mensaje_error = primer_error[0] if isinstance(primer_error, list) else str(primer_error)
            return Response(
                {"error": mensaje_error, "detalles": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            resultado = calcular_mejores_ofertas(
                productos_solicitados=serializer.validated_data['productos'],
                requiere_envio=serializer.validated_data.get('requiere_envio', False)
            )
        except (DjangoValidationError, DRFValidationError) as e:
            err_msg = e.messages[0] if hasattr(e, 'messages') else str(e)
            return Response(
                {"error": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(resultado, status=status.HTTP_200_OK)


class EmitirOrdenesCompraApi(APIView):
    """
    CU-54 (Paso 6, 7 y 8): Emisión de Órdenes de Compra.
    Instancia las órdenes formales con estado 'Esperando Entrega', congela precios
    unitarios, genera el PDF institucional y despacha el correo al proveedor.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _exigir_rol_admin(request.user)

        serializer = EmitirOrdenesCompraInputSerializer(data=request.data)
        if not serializer.is_valid():
            primer_error = next(iter(serializer.errors.values()))
            mensaje_error = primer_error[0] if isinstance(primer_error, list) else str(primer_error)
            return Response(
                {"error": mensaje_error, "detalles": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            ordenes = emitir_ordenes_compra(
                usuario_admin=request.user,
                borradores_aprobados=serializer.validated_data['borradores']
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except (DjangoValidationError, DRFValidationError) as e:
            err_msg = e.messages[0] if hasattr(e, 'messages') else str(e)
            return Response(
                {"error": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output = OrdenCompraCompletaOutputSerializer(ordenes, many=True)
        return Response(
            {
                "mensaje": f"Se emitieron {len(ordenes)} órdenes de compra exitosamente.",
                "ordenes": output.data
            },
            status=status.HTTP_201_CREATED
        )


class RecepcionarCompraApi(APIView):
    """
    CU-55: Recepcionar Compra.
    GET: Despliega el formulario de conciliación (Checklist) precargando las cantidades esperadas.
    PATCH / POST: Registra el ingreso físico de la mercadería, actualiza stock, evalúa parcial/excedente
    y reactiva reparaciones de servicio técnico que esperan insumos.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_orden: int):
        _exigir_rol_admin(request.user)
        try:
            orden = obtener_orden_esperando_entrega(id_orden)
        except ObjectDoesNotExist as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except (DjangoValidationError, DRFValidationError) as e:
            err_msg = e.messages[0] if hasattr(e, 'messages') else str(e)
            return Response({"error": err_msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ChecklistRecepcionOutputSerializer(orden)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, id_orden: int):
        return self._procesar_recepcion(request, id_orden)

    def post(self, request, id_orden: int):
        return self._procesar_recepcion(request, id_orden)

    def _procesar_recepcion(self, request, id_orden: int):
        _exigir_rol_admin(request.user)

        serializer = RecepcionarCompraInputSerializer(data=request.data)
        if not serializer.is_valid():
            primer_error = next(iter(serializer.errors.values()))
            mensaje_error = primer_error[0] if isinstance(primer_error, list) else str(primer_error)
            return Response(
                {"error": mensaje_error, "detalles": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            orden = recepcionar_orden_compra(
                usuario_admin=request.user,
                id_orden=id_orden,
                datos_validados=serializer.validated_data
            )
        except ObjectDoesNotExist as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except DjangoValidationError as e:
            # Si el código es 'requiere_confirmacion_excedente', devolver estructura para aviso modal en frontend
            if getattr(e, 'code', None) == 'requiere_confirmacion_excedente' or (
                hasattr(e, 'message_dict') and 'confirmar_excedente' in e.message_dict
            ):
                detalles = e.message_dict if hasattr(e, 'message_dict') else {"confirmar_excedente": [str(e)]}
                msg = (
                    detalles['confirmar_excedente'][0]
                    if 'confirmar_excedente' in detalles and detalles['confirmar_excedente']
                    else str(e)
                )
                return Response(
                    {
                        "requiere_confirmacion_excedente": True,
                        "error": msg,
                        "detalles": detalles
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            err_msg = e.messages[0] if hasattr(e, 'messages') else str(e)
            return Response({"error": err_msg}, status=status.HTTP_400_BAD_REQUEST)
        except DRFValidationError as e:
            err_msg = e.detail if hasattr(e, 'detail') else str(e)
            return Response({"error": err_msg}, status=status.HTTP_400_BAD_REQUEST)

        output_data = {
            "id_orden": orden.id_orden,
            "estado_orden": orden.estado_orden,
            "estado_nombre": orden.estado_nombre,
            "nro_remito": orden.nro_remito,
            "fecha_recepcion": str(orden.fecha_recepcion),
            "es_entrega_parcial": getattr(orden, 'es_entrega_parcial', False),
            "total_abonar": getattr(orden, 'total_abonar', Decimal("0.00")),
            "reparaciones_reactivadas": getattr(orden, 'reparaciones_reactivadas', []),
            "mensaje": f"Mercadería recepcionada exitosamente. Estado final: '{orden.estado_nombre}'."
        }
        return Response(output_data, status=status.HTTP_200_OK)


class ConsultarOrdenCompraApi(APIView):
    """
    CU-57: Consultar Orden de Compra.
    Modo de solo lectura del archivo digital inmutable de la Orden de Compra.
    Exhibe cabecera, datos fiscales del proveedor adjudicado, grilla económica
    con cantidades solicitadas y recibidas, precios unitarios históricos congelados y total a abonar.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_orden: int):
        _exigir_rol_admin(request.user)

        try:
            orden = obtener_detalle_orden_compra(id_orden)
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e) or "El documento solicitado no existe o no está disponible."},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = OrdenCompraDetailOutputSerializer(orden)
        return Response(serializer.data, status=status.HTTP_200_OK)


class RegistrarCompraDirectaApi(APIView):
    """
    CU-31: Registrar Compra.
    Permite al Administrador asentar administrativamente la adquisición de artículos
    fuera del circuito automatizado de Órdenes de Compra (ej. equipos usados de clientes
    en mostrador o insumos urgentes), garantizando la trazabilidad del gasto.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_admin(request.user)

        buscar = (request.query_params.get('buscar') or '').strip()
        impacto_raw = request.query_params.get('impacto_stock')
        impacto_stock = None
        if impacto_raw is not None and str(impacto_raw).strip() != '':
            val_low = str(impacto_raw).strip().lower()
            if val_low in ('true', '1', 'si', 'sí'):
                impacto_stock = True
            elif val_low in ('false', '0', 'no'):
                impacto_stock = False

        compras = listar_compras_directas(
            usuario_ejecutor=request.user,
            buscar=buscar,
            impacto_stock=impacto_stock
        )
        output = RegistroCompraOutputSerializer(compras, many=True)
        return Response(output.data, status=status.HTTP_200_OK)

    def post(self, request):
        _exigir_rol_admin(request.user)

        serializer = RegistrarCompraDirectaInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            compra = registrar_compra_directa(
                usuario_admin=request.user,
                datos_validados=serializer.validated_data
            )
        except DjangoValidationError as e:
            err_msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"error": err_msg}, status=status.HTTP_400_BAD_REQUEST)
        except DRFValidationError as e:
            err_msg = e.detail if hasattr(e, 'detail') else str(e)
            return Response({"error": err_msg}, status=status.HTTP_400_BAD_REQUEST)

        compra_data = RegistroCompraOutputSerializer(compra).data
        return Response(
            {
                "mensaje": "Compra registrada exitosamente.",
                "compra": compra_data
            },
            status=status.HTTP_201_CREATED
        )





# ==============================================================================
# MOTOR AUTÓNOMO DE ABASTECIMIENTO INTELIGENTE (APIS)
# ==============================================================================

class EjecutarMotorAbastecimientoApi(APIView):
    """
    Disparo manual del Motor Autónomo de Abastecimiento por parte del Administrador.
    Permite forzar la ejecución inmediata para evaluar faltantes, generar órdenes de compra
    y despachar solicitudes de cotización.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _exigir_rol_admin(request.user)

        forzar = bool(request.data.get('forzar', True))
        try:
            resultado = ejecutar_ciclo_abastecimiento_automatico(
                usuario_ejecutor=request.user,
                forzar_ejecucion=forzar,
                origen_disparo='MANUAL'
            )
        except (DjangoValidationError, DRFValidationError) as e:
            err_msg = e.messages[0] if hasattr(e, 'messages') else str(e)
            return Response({"error": err_msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response(resultado, status=status.HTTP_200_OK)


class EstadoMotorAbastecimientoApi(APIView):
    """
    Consulta en tiempo real del estado del Motor de Abastecimiento:
    parámetros activos, órdenes en tránsito, reparaciones en espera y artículos deficitarios.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _exigir_rol_admin(request.user)

        estado = obtener_estado_motor_abastecimiento()
        articulos_deficitarios = obtener_articulos_deficitarios_con_transito()

        return Response({
            **estado,
            "total_articulos_deficitarios": len(articulos_deficitarios),
            "articulos_deficitarios": articulos_deficitarios
        }, status=status.HTTP_200_OK)


class InspeccionarProveedorApi(APIView):
    """
    Endpoint para inspeccionar en detalle a un proveedor:
    datos legales y de contacto, confiabilidad, cumplimiento de entregas,
    recepciones históricas, cotizaciones respondidas y órdenes de compra.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id_proveedor: str):
        _exigir_rol_admin(request.user)

        try:
            expediente = obtener_expediente_inspeccion_proveedor(
                usuario_ejecutor=request.user,
                id_proveedor=id_proveedor
            )
        except ObjectDoesNotExist as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

        output = ExpedienteInspeccionProveedorOutputSerializer(expediente)
        return Response(output.data, status=status.HTTP_200_OK)

