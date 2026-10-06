from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.core.exceptions import ValidationError
from users_app.serializers import (
    LoginInputSerializer, GoogleLoginSerializer,
    RegistroPublicoInputSerializer, RegistroInternoInputSerializer,
    UsuarioOutputSerializer, LogoutInputSerializer,
    GenerarTokenInputSerializer, RestablecerCredencialesInputSerializer,
    RecuperarContrasenaInputSerializer,
    EditarPerfilInputSerializer, PerfilOutputSerializer
)
from users_app.services import (
    autenticar_y_obtener_tokens, autenticar_con_google, CredencialesInvalidasError,
    registrar_cuenta_publica, registrar_cuenta_interna, cerrar_sesion_usuario,
    generar_token_seguridad, validar_y_restablecer_credencial,
    solicitar_recuperacion_contrasena, editar_perfil_usuario
)


class LoginApi(APIView):
    """
    Controlador HTTP puro para el manejo del inicio de sesión.
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = LoginInputSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            resultado = autenticar_y_obtener_tokens(
                email=serializer.validated_data['email'],
                password_plano=serializer.validated_data['password']
            )
            return Response(resultado, status=status.HTTP_200_OK)
            
        except CredencialesInvalidasError as e:
            return Response({"detail": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class GoogleLoginApi(APIView):
    """
    Controlador HTTP puro para el manejo del inicio de sesión con Google.
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            resultado = autenticar_con_google(
                google_token=serializer.validated_data['google_token']
            )
            return Response(resultado, status=status.HTTP_200_OK)
            
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RegistroPublicoApi(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegistroPublicoInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            usuario = registrar_cuenta_publica(
                **serializer.validated_data
            )
        except ValidationError as e:
            # Los errores de validación en Django devuelven listas u objetos
            return Response({"detail": e.messages if hasattr(e, 'messages') else str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        output_serializer = UsuarioOutputSerializer(usuario)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class RegistroInternoApi(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RegistroInternoInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        # Dependiendo de tu JWT auth (DRF SimpleJWT u otro), request.user puede ser tu modelo.
        # En ese caso: getattr(request.user, 'id_usuario', getattr(request.user, 'id', None))
        id_ejecutor = getattr(request.user, 'id_usuario', getattr(request.user, 'id', None))
        rol_ejecutor = ""
        if hasattr(request.user, 'id_rol') and request.user.id_rol:
            rol_ejecutor = request.user.id_rol.nombre_rol
            
        if not id_ejecutor:
            return Response({"detail": "Usuario no autenticado o token inválido"}, status=status.HTTP_401_UNAUTHORIZED)
            
        try:
            usuario = registrar_cuenta_interna(
                id_ejecutor=id_ejecutor,
                rol_ejecutor=rol_ejecutor,
                **serializer.validated_data
            )
        except ValidationError as e:
            return Response({"detail": e.messages if hasattr(e, 'messages') else str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        output_serializer = UsuarioOutputSerializer(usuario)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class LogoutApi(APIView):
    """
    Endpoint para procesar el cierre de sesión, invalidando el token.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = LogoutInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        id_ejecutor = getattr(request.user, 'id_usuario', getattr(request.user, 'id', None))
        
        if not id_ejecutor:
            return Response({"detail": "Usuario no autenticado."}, status=status.HTTP_401_UNAUTHORIZED)
            
        cerrar_sesion_usuario(
            id_usuario=id_ejecutor,
            refresh_token=serializer.validated_data['refresh_token']
        )
        
        return Response({"mensaje": "Sesión cerrada correctamente"}, status=status.HTTP_200_OK)


class GenerarTokenSeguridadApi(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GenerarTokenInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            generar_token_seguridad(email=serializer.validated_data['email'])
        except ValidationError as e:
            return Response({"detail": e.messages if hasattr(e, 'messages') else str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({"mensaje": "Token generado y enviado correctamente."}, status=status.HTTP_200_OK)


class RestablecerCredencialesApi(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RestablecerCredencialesInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            validar_y_restablecer_credencial(
                email=serializer.validated_data['email'],
                token=serializer.validated_data['token'],
                nueva_contrasena=serializer.validated_data['nueva_contrasena']
            )
        except ValidationError as e:
            return Response({"detail": e.messages if hasattr(e, 'messages') else str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({"mensaje": "Contraseña restablecida correctamente."}, status=status.HTTP_200_OK)


class SolicitarRecuperacionContrasenaApi(APIView):
    """
    Endpoint público para solicitar la recuperación de contraseña sin permitir enumeración.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RecuperarContrasenaInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            solicitar_recuperacion_contrasena(
                email=serializer.validated_data['email'],
                captcha_token=serializer.validated_data['captcha_token']
            )
        except ValidationError as e:
            # Capturamos validaciones que sí se pueden mostrar (como el fallo del Captcha)
            return Response({"detail": e.messages if hasattr(e, 'messages') else str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        # Respuesta estricta anti-enumeración, siempre la misma:
        mensaje_seguro = "Si el correo está registrado en nuestro sistema, recibirá instrucciones para recuperar su contraseña en los próximos minutos."
        return Response({"mensaje": mensaje_seguro}, status=status.HTTP_200_OK)


class EditarPerfilApi(APIView):
    """
    Endpoint para editar el perfil del usuario autenticado de forma segura (prevención IDOR).
    """
    permission_classes = [IsAuthenticated]

    def put(self, request):
        serializer = EditarPerfilInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        id_usuario = getattr(request.user, 'id_usuario', getattr(request.user, 'id', None))
        if not id_usuario:
            return Response({"detail": "Usuario no autenticado"}, status=status.HTTP_401_UNAUTHORIZED)
            
        try:
            datos_perfil = editar_perfil_usuario(
                id_usuario=id_usuario,
                **serializer.validated_data
            )
        except ValidationError as e:
            return Response({"detail": e.messages if hasattr(e, 'messages') else str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        output_serializer = PerfilOutputSerializer(datos_perfil)
        return Response(output_serializer.data, status=status.HTTP_200_OK)
