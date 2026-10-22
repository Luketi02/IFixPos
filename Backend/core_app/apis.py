from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import PermissionDenied

from core_app.models import ConfiguracionSistema
from core_app.selectors import (
    obtener_todas_las_configuraciones,
    obtener_notificaciones_usuario,
    contar_notificaciones_no_leidas,
)
from core_app.serializers import (
    ConfiguracionUpdateInputSerializer,
    NotificacionOutputSerializer,
)
from core_app.services import (
    actualizar_configuracion_global,
    marcar_notificacion_leida,
    marcar_todas_notificaciones_leidas,
    eliminar_notificacion,
    eliminar_todas_notificaciones,
)
from users_app.models import Usuario

# Compatibilidad transparente para acceso como propiedad request.user.rol
if not hasattr(Usuario, 'rol'):
    Usuario.rol = property(lambda self: getattr(self, 'id_rol', None))


class SupportEmailApi(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        from core_app.selectors import obtener_email_soporte
        return Response({"email": obtener_email_soporte()})


class ConfiguracionGlobalApi(APIView):
    """
    API endpoint para consultar y actualizar la configuración global del sistema (CU-42).
    Acceso exclusivo para usuarios con rol 'ADMIN'.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'rol', None) or getattr(user, 'id_rol', None)
        codigo_rol = getattr(rol, 'codigo', None)
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Acceso denegado. Se requieren permisos de Administrador para gestionar la configuración global.")

    def get(self, request):
        self._verificar_admin(request.user)
        configuraciones = obtener_todas_las_configuraciones()
        return Response(configuraciones, status=status.HTTP_200_OK)

    def put(self, request):
        self._verificar_admin(request.user)
        serializer = ConfiguracionUpdateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resultado = actualizar_configuracion_global(
            usuario_admin=request.user,
            datos_validados=serializer.validated_data
        )

        return Response({
            "mensaje": "Configuraciones globales actualizadas exitosamente.",
            "resultado": resultado,
            "configuraciones": obtener_todas_las_configuraciones()
        }, status=status.HTTP_200_OK)


class SubirLogoEmpresaApi(APIView):
    """
    API endpoint para cargar o reemplazar el logo de la empresa (imagenLocal).
    Acceso exclusivo para administradores.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'rol', None) or getattr(user, 'id_rol', None)
        codigo_rol = getattr(rol, 'codigo', None)
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Acceso denegado. Se requieren permisos de Administrador para subir el logo.")

    def post(self, request):
        from django.core.exceptions import ValidationError
        self._verificar_admin(request.user)

        archivo = request.FILES.get('logo') or request.FILES.get('imagen') or request.FILES.get('file')
        if not archivo:
            return Response(
                {"error": "No se recibió ningún archivo de imagen para el logo institucional."},
                status=status.HTTP_400_BAD_REQUEST
            )

        from core_app.services import guardar_logo_empresa
        try:
            url_logo = guardar_logo_empresa(archivo=archivo, usuario_admin=request.user)
            return Response({
                "mensaje": "Logo institucional actualizado exitosamente.",
                "imagen_url": url_logo,
                "configuraciones": obtener_todas_las_configuraciones()
            }, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response(
                {"error": e.messages if hasattr(e, 'messages') else str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


# ==============================================================================
# GESTIÓN DE NOTIFICACIONES (LA CAMPANITA)
# ==============================================================================

class ListarNotificacionesApi(APIView):
    """
    GET /api/core/notificaciones/
    Retorna el listado de notificaciones del usuario autenticado ordenadas cronológicamente,
    junto con el contador de no leídas para alimentar la campanita del frontend.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notificaciones_qs = obtener_notificaciones_usuario(usuario=request.user)
        no_leidas_count = contar_notificaciones_no_leidas(usuario=request.user)
        serializer = NotificacionOutputSerializer(notificaciones_qs, many=True)
        return Response({
            "no_leidas_count": no_leidas_count,
            "notificaciones": serializer.data
        }, status=status.HTTP_200_OK)


class MarcarNotificacionLeidaApi(APIView):
    """
    PATCH /api/core/notificaciones/<int:id_notificacion>/leer/
    Marca una notificación específica como leída (leida=True).
    Garantiza que el usuario autenticado sea el titular legítimo de la alerta.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_notificacion: int):
        from django.core.exceptions import ObjectDoesNotExist
        from rest_framework.exceptions import NotFound

        try:
            notificacion = marcar_notificacion_leida(
                usuario=request.user,
                id_notificacion=id_notificacion
            )
            return Response({
                "mensaje": "Notificación marcada como leída.",
                "id_notificacion": notificacion.id_notificacion,
                "leida": notificacion.leida
            }, status=status.HTTP_200_OK)
        except ObjectDoesNotExist:
            raise NotFound(f"No existe ninguna notificación con ID {id_notificacion}.")

    def delete(self, request, id_notificacion: int):
        from django.core.exceptions import ObjectDoesNotExist
        from rest_framework.exceptions import NotFound

        try:
            eliminar_notificacion(usuario=request.user, id_notificacion=id_notificacion)
            return Response({
                "mensaje": "Notificación eliminada exitosamente.",
                "id_notificacion": id_notificacion
            }, status=status.HTTP_200_OK)
        except ObjectDoesNotExist:
            raise NotFound(f"No existe ninguna notificación con ID {id_notificacion}.")


class EliminarNotificacionApi(APIView):
    """
    DELETE /api/core/notificaciones/<int:id_notificacion>/eliminar/
    Elimina físicamente una alerta específica del usuario autenticado.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, id_notificacion: int):
        from django.core.exceptions import ObjectDoesNotExist
        from rest_framework.exceptions import NotFound

        try:
            eliminar_notificacion(usuario=request.user, id_notificacion=id_notificacion)
            return Response({
                "mensaje": "Notificación eliminada exitosamente.",
                "id_notificacion": id_notificacion
            }, status=status.HTTP_200_OK)
        except ObjectDoesNotExist:
            raise NotFound(f"No existe ninguna notificación con ID {id_notificacion}.")


class MarcarTodasLeidasApi(APIView):
    """
    PATCH /api/core/notificaciones/leer-todas/
    Marca masivamente como leídas todas las notificaciones pendientes del usuario autenticado.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        actualizadas = marcar_todas_notificaciones_leidas(usuario=request.user)
        return Response({
            "mensaje": "Todas las notificaciones fueron marcadas como leídas.",
            "actualizadas": actualizadas
        }, status=status.HTTP_200_OK)


class EliminarTodasNotificacionesApi(APIView):
    """
    DELETE /api/core/notificaciones/eliminar-todas/
    Elimina todas las notificaciones visibles de la campanita para el usuario autenticado.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        total = eliminar_todas_notificaciones(usuario=request.user)
        return Response({
            "mensaje": "Todas las notificaciones fueron eliminadas exitosamente.",
            "eliminadas": total
        }, status=status.HTTP_200_OK)

