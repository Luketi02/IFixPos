from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import PermissionDenied

from core_app.models import ConfiguracionSistema
from core_app.selectors import obtener_todas_las_configuraciones
from core_app.serializers import ConfiguracionUpdateInputSerializer
from core_app.services import actualizar_configuracion_global
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
