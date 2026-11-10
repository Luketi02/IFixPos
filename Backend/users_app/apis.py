from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.conf import settings
from django.core.exceptions import ValidationError
from users_app.serializers import (
    LoginInputSerializer, GoogleLoginSerializer,
    RegistroPublicoInputSerializer, RegistroInternoInputSerializer,
    UsuarioOutputSerializer, LogoutInputSerializer, RefreshTokenInputSerializer,
    GenerarTokenInputSerializer, RestablecerCredencialesInputSerializer,
    RecuperarContrasenaInputSerializer,
    EditarPerfilInputSerializer, PerfilOutputSerializer,
    CompletarOnboardingInputSerializer,
    ValidarCodigoInputSerializer
)
from users_app.services import (
    autenticar_y_obtener_tokens, autenticar_con_google, CredencialesInvalidasError,
    registrar_cuenta_publica, registrar_cuenta_interna, cerrar_sesion_usuario,
    generar_token_seguridad, validar_y_restablecer_credencial,
    solicitar_recuperacion_contrasena, editar_perfil_usuario,
    completar_perfil_onboarding, verificar_y_activar_usuario,
    guardar_archivo_foto_perfil, refrescar_token_jwt
)

NOMBRE_COOKIE_REFRESH = 'ifixpos_refresh_token'


def _adjuntar_cookie_refresh(response: Response, refresh_token: str | None) -> Response:
    """
    Adjunta de forma retrocompatible el refresh_token en una cookie HttpOnly + SameSite=Lax
    para mitigar robo de sesión de larga duración vía XSS sin romper clientes que lean el JSON.
    """
    if refresh_token:
        response.set_cookie(
            key=NOMBRE_COOKIE_REFRESH,
            value=refresh_token,
            httponly=True,
            secure=not getattr(settings, 'DEBUG', False),
            samesite='Lax',
            max_age=7 * 24 * 3600,
            path='/'
        )
    return response


class LoginApi(APIView):
    """
    Controlador HTTP puro para el manejo del inicio de sesión.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'login'
    
    def post(self, request):
        serializer = LoginInputSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            resultado = autenticar_y_obtener_tokens(
                email=serializer.validated_data['email'],
                password_plano=serializer.validated_data['password']
            )
            resp = Response(resultado, status=status.HTTP_200_OK)
            tokens = resultado.get('tokens') if isinstance(resultado, dict) else None
            return _adjuntar_cookie_refresh(resp, tokens.get('refresh') if isinstance(tokens, dict) else None)
            
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
            resp = Response(resultado, status=status.HTTP_200_OK)
            tokens = resultado.get('tokens') if isinstance(resultado, dict) else None
            return _adjuntar_cookie_refresh(resp, tokens.get('refresh') if isinstance(tokens, dict) else None)
            
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


class VerificarCorreoApi(APIView):
    """
    Endpoint público para validar el código OTP de verificación de correo y activar la cuenta.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'otp'

    def post(self, request):
        serializer = ValidarCodigoInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            resultado = verificar_y_activar_usuario(
                email=serializer.validated_data['email'],
                codigo=serializer.validated_data['codigo']
            )
            resp = Response(resultado, status=status.HTTP_200_OK)
            tokens = resultado.get('tokens') if isinstance(resultado, dict) else None
            return _adjuntar_cookie_refresh(resp, tokens.get('refresh') if isinstance(tokens, dict) else None)
        except ValidationError as e:
            return Response(
                {"detail": e.messages if hasattr(e, 'messages') else str(e)}, 
                status=status.HTTP_400_BAD_REQUEST
            )


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
        datos_entrada = dict(request.data) if isinstance(request.data, dict) else request.data.copy()
        if not datos_entrada.get('refresh_token') and request.COOKIES.get(NOMBRE_COOKIE_REFRESH):
            datos_entrada['refresh_token'] = request.COOKIES.get(NOMBRE_COOKIE_REFRESH)

        serializer = LogoutInputSerializer(data=datos_entrada)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        id_ejecutor = getattr(request.user, 'id_usuario', getattr(request.user, 'id', None))
        
        if not id_ejecutor:
            return Response({"detail": "Usuario no autenticado."}, status=status.HTTP_401_UNAUTHORIZED)
            
        cerrar_sesion_usuario(
            id_usuario=id_ejecutor,
            refresh_token=serializer.validated_data['refresh_token']
        )
        
        resp = Response({"mensaje": "Sesión cerrada correctamente"}, status=status.HTTP_200_OK)
        resp.delete_cookie(NOMBRE_COOKIE_REFRESH, path='/')
        return resp


class RefreshTokenApi(APIView):
    """
    Controlador HTTP para renovar el par de tokens JWT a partir del token de refresco
    (recibido ya sea en el cuerpo JSON o mediante cookie HttpOnly `ifixpos_refresh_token`).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        datos_entrada = dict(request.data) if isinstance(request.data, dict) else request.data.copy()
        if not datos_entrada.get('refresh') and request.COOKIES.get(NOMBRE_COOKIE_REFRESH):
            datos_entrada['refresh'] = request.COOKIES.get(NOMBRE_COOKIE_REFRESH)

        serializer = RefreshTokenInputSerializer(data=datos_entrada)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            tokens = refrescar_token_jwt(refresh_token=serializer.validated_data['refresh'])
            resp = Response({"tokens": tokens}, status=status.HTTP_200_OK)
            return _adjuntar_cookie_refresh(resp, tokens.get('refresh') if isinstance(tokens, dict) else None)
        except ValidationError as e:
            msg = e.detail if hasattr(e, 'detail') else str(e)
            if isinstance(msg, list) and len(msg) > 0:
                msg = msg[0]
            return Response({"detail": str(msg)}, status=status.HTTP_401_UNAUTHORIZED)


class GenerarTokenSeguridadApi(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'otp'

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


class SubirFotoPerfilApi(APIView):
    """
    Endpoint para subir una imagen de perfil desde el dispositivo.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        archivo = request.FILES.get('foto')
        if not archivo:
            return Response({"detail": "Debes adjuntar un archivo de imagen válido."}, status=status.HTTP_400_BAD_REQUEST)

        id_usuario = getattr(request.user, 'id_usuario', getattr(request.user, 'id', None))
        if not id_usuario:
            return Response({"detail": "Usuario no autenticado"}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            url_foto = guardar_archivo_foto_perfil(id_usuario=id_usuario, archivo=archivo)
            return Response({"foto_url": url_foto, "mensaje": "Imagen subida exitosamente."}, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response({"detail": e.messages if hasattr(e, 'messages') else str(e)}, status=status.HTTP_400_BAD_REQUEST)



class CompletarOnboardingApi(APIView):
    """
    Endpoint de onboarding para usuarios provenientes de Google.
    Exige DNI y Teléfono para completar el perfil.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CompletarOnboardingInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        id_usuario = getattr(request.user, 'id_usuario', getattr(request.user, 'id', None))
        if not id_usuario:
            return Response({"detail": "Usuario no autenticado"}, status=status.HTTP_401_UNAUTHORIZED)
            
        try:
            resultado = completar_perfil_onboarding(
                id_usuario=id_usuario,
                dni=serializer.validated_data['dni'],
                telefono=serializer.validated_data['telefono'],
                nombre=serializer.validated_data.get('nombre'),
                apellido=serializer.validated_data.get('apellido'),
                telefono_alt=serializer.validated_data.get('telefono_alt')
            )
            return Response(resultado, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response({"detail": e.messages if hasattr(e, 'messages') else str(e)}, status=status.HTTP_400_BAD_REQUEST)


from users_app.selectors import filtrar_usuarios
from users_app.serializers import UsuarioFiltradoOutputSerializer, FiltrarUsuariosInputSerializer

class FiltrarUsuariosApi(APIView):
    permission_classes = [IsAuthenticated] 

    def get(self, request):
        # CU-32: Solo Administradores y Técnicos tienen autorización para consultar/filtrar usuarios
        rol_codigo = getattr(getattr(request.user, 'id_rol', None), 'codigo', '')
        rol_nombre = getattr(getattr(request.user, 'id_rol', None), 'nombre_rol', '')
        es_autorizado = rol_codigo in ['ADMIN', 'TECNICO'] or rol_nombre in ['Administrador', 'Técnico']
        if not es_autorizado:
            return Response(
                {"error": "No posee permisos para buscar o listar usuarios del sistema."},
                status=status.HTTP_403_FORBIDDEN
            )

        input_serializer = FiltrarUsuariosInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)

        usuarios = filtrar_usuarios(**input_serializer.validated_data)
        serializer = UsuarioFiltradoOutputSerializer(usuarios, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


from users_app.serializers import ModificarUsuarioAdminInputSerializer
from users_app.services import modificar_usuario_por_admin

class ModificarUsuarioAdminApi(APIView):
    """
    CU-44: Modificar Usuario por Administrador.
    Permite al administrador modificar datos personales, de contacto, reasignar rol
    y forzar nueva contraseña de cualquier usuario registrado en el sistema.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol_codigo = getattr(getattr(user, 'id_rol', None), 'codigo', '')
        rol_nombre = getattr(getattr(user, 'id_rol', None), 'nombre_rol', '')
        return rol_codigo == 'ADMIN' or rol_nombre == 'Administrador'

    def put(self, request, id_usuario: int):
        if not self._verificar_admin(request.user):
            return Response(
                {"error": "Acceso restringido. Solo los administradores pueden modificar cuentas de usuario."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = ModificarUsuarioAdminInputSerializer(
            data=request.data,
            context={'id_usuario_destino': id_usuario}
        )
        serializer.is_valid(raise_exception=True)

        try:
            usuario_actualizado = modificar_usuario_por_admin(
                usuario_admin=request.user,
                id_usuario_destino=id_usuario,
                datos_validados=serializer.validated_data
            )
        except ValidationError as e:
            return Response(
                {"detail": e.messages if hasattr(e, 'messages') else str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "mensaje": "Usuario actualizado correctamente.",
                "id_usuario": usuario_actualizado.id_usuario,
                "email": usuario_actualizado.email,
                "rol": usuario_actualizado.id_rol.nombre_rol if usuario_actualizado.id_rol else None
            },
            status=status.HTTP_200_OK
        )

    def patch(self, request, id_usuario: int):
        return self.put(request, id_usuario=id_usuario)


from users_app.serializers import ModificarRolInputSerializer, RolUsuarioOutputSerializer
from users_app.services import modificar_rol_sistema
from users_app.selectors import obtener_roles_sistema


class ListarRolesApi(APIView):
    """
    Endpoint de solo lectura para listar todos los roles del sistema.
    Accesible para Administradores y Técnicos (para filtros CU-32 y gestión CU-84).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rol_codigo = getattr(getattr(request.user, 'id_rol', None), 'codigo', '')
        rol_nombre = getattr(getattr(request.user, 'id_rol', None), 'nombre_rol', '')
        es_autorizado = rol_codigo in ['ADMIN', 'TECNICO'] or rol_nombre in ['Administrador', 'Técnico']
        if not es_autorizado:
            return Response(
                {"error": "No posee permisos para consultar los roles del sistema."},
                status=status.HTTP_403_FORBIDDEN
            )

        roles = obtener_roles_sistema()
        serializer = RolUsuarioOutputSerializer(roles, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ModificarRolApi(APIView):
    """
    CU-84: Modificar Rol de Sistema por Administrador.
    Permite modificar la configuración de nombre y descripción de los roles.
    Requiere autenticación y rol estricto de ADMIN.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol_codigo = getattr(getattr(user, 'id_rol', None), 'codigo', '')
        rol_nombre = getattr(getattr(user, 'id_rol', None), 'nombre_rol', '')
        return rol_codigo == 'ADMIN' or rol_nombre == 'Administrador'

    def patch(self, request, id_rol: int):
        if not self._verificar_admin(request.user):
            return Response(
                {"error": "Acceso restringido. Solo los administradores pueden modificar roles del sistema."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = ModificarRolInputSerializer(
            data=request.data,
            context={'id_rol': id_rol}
        )
        serializer.is_valid(raise_exception=True)

        try:
            rol_actualizado = modificar_rol_sistema(
                usuario_admin=request.user,
                id_rol=id_rol,
                datos_validados=serializer.validated_data
            )
        except ValidationError as e:
            return Response(
                {"detail": e.messages if hasattr(e, 'messages') else str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_serializer = RolUsuarioOutputSerializer(rol_actualizado)
        return Response(
            {
                "mensaje": "Rol actualizado correctamente.",
                "rol": output_serializer.data
            },
            status=status.HTTP_200_OK
        )

    def put(self, request, id_rol: int):
        return self.patch(request, id_rol=id_rol)


class CambiarSesionDevApi(APIView):
    """
    Controlador de desarrollo para conmutación rápida de perfiles y sesiones:
    - Cliente: cliente@ifixpos.com
    - Técnico: tecnico@ifixpos.com
    - Administrador: lucas.mino1508@gmail.com
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from users_app.models import Usuario, PerfilUsuario
        from users_app.services import generar_tokens_jwt
        from users_app.selectors import perfil_esta_completo

        rol_destino = str(request.data.get('rol', '')).strip().upper()
        email_destino = str(request.data.get('email', '')).strip().lower()

        usuario = None
        if email_destino:
            usuario = Usuario.objects.filter(email__iexact=email_destino, is_active=True).first()

        if not usuario and rol_destino:
            if rol_destino == 'ADMIN' or rol_destino == 'ADMINISTRADOR':
                usuario = Usuario.objects.filter(email='lucas.mino1508@gmail.com', is_active=True).first()
                if not usuario:
                    usuario = Usuario.objects.filter(id_rol__codigo='ADMIN', is_active=True).first()
            elif rol_destino == 'TECNICO':
                usuario = Usuario.objects.filter(email='tecnico@ifixpos.com', is_active=True).first()
                if not usuario:
                    usuario = Usuario.objects.filter(id_rol__codigo='TECNICO', is_active=True).first()
            elif rol_destino == 'CLIENTE':
                usuario = Usuario.objects.filter(email='cliente@ifixpos.com', is_active=True).first()
                if not usuario:
                    usuario = Usuario.objects.filter(id_rol__codigo='CLIENTE', is_active=True).first()

        if not usuario:
            return Response(
                {"error": f"No se encontró un usuario activo para el rol '{rol_destino}' o correo '{email_destino}'."},
                status=status.HTTP_404_NOT_FOUND
            )

        tokens = generar_tokens_jwt(usuario)
        perfil = PerfilUsuario.objects.filter(id_usuario=usuario).first()

        return Response({
            "mensaje": f"Sesión cambiada con éxito a {usuario.id_rol.nombre_rol} ({usuario.email})",
            "tokens": tokens,
            "usuario": {
                "id_usuario": usuario.id_usuario,
                "email": usuario.email,
                "rol": usuario.id_rol.nombre_rol if usuario.id_rol else None,
                "nombre": perfil.nombre if perfil and perfil.nombre else "",
                "apellido": perfil.apellido if perfil and perfil.apellido else "",
                "dni": perfil.dni if perfil and perfil.dni else "",
                "telefono": perfil.telefono if perfil and perfil.telefono else "",
                "telefono_alt": perfil.telefono_alt if perfil and perfil.telefono_alt else "",
                "foto_perfil": perfil.foto_perfil if perfil and perfil.foto_perfil else "",
                "perfil_completo": perfil_esta_completo(usuario.id_usuario)
            }
        }, status=status.HTTP_200_OK)



class PreferenciasUsuarioApi(APIView):
    """
    Frontera HTTP para consultar y actualizar las preferencias personales del usuario autenticado.
    Cumple la arquitectura estricta HackSoftware:
    - Verificación de permisos (IsAuthenticated)
    - Cero lógica de base de datos directa
    - InputSerializer para validar entradas
    - Invocación a Selector para lecturas
    - Invocación a Service para escrituras
    - OutputSerializer para respuestas
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from users_app.selectors import obtener_preferencias_usuario
        from users_app.serializers import PreferenciasUsuarioOutputSerializer

        usuario = request.user
        id_usuario = getattr(usuario, 'id_usuario', getattr(usuario, 'id', None))
        if not id_usuario:
            return Response({"detail": "Usuario no autenticado."}, status=status.HTTP_401_UNAUTHORIZED)

        preferencias = obtener_preferencias_usuario(id_usuario=id_usuario)
        output_serializer = PreferenciasUsuarioOutputSerializer(preferencias)
        return Response(output_serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        from users_app.serializers import PreferenciasUsuarioInputSerializer, PreferenciasUsuarioOutputSerializer
        from users_app.services import guardar_preferencias_usuario

        usuario = request.user
        id_usuario = getattr(usuario, 'id_usuario', getattr(usuario, 'id', None))
        if not id_usuario:
            return Response({"detail": "Usuario no autenticado."}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = PreferenciasUsuarioInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        pref = guardar_preferencias_usuario(
            usuario=usuario,
            datos_validados=serializer.validated_data
        )

        output_serializer = PreferenciasUsuarioOutputSerializer(pref)
        return Response(output_serializer.data, status=status.HTTP_200_OK)
