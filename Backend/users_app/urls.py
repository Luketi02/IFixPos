from django.urls import path
from users_app.apis import (
    LoginApi, 
    GoogleLoginApi,
    RegistroPublicoApi,
    RegistroInternoApi,
    LogoutApi,
    GenerarTokenSeguridadApi,
    RestablecerCredencialesApi,
    SolicitarRecuperacionContrasenaApi,
    EditarPerfilApi,
    SubirFotoPerfilApi,
    FiltrarUsuariosApi,
    CompletarOnboardingApi,
    VerificarCorreoApi
)

urlpatterns = [
    path('login/', LoginApi.as_view(), name='api_login'),
    path('login/google/', GoogleLoginApi.as_view(), name='api_login_google'),
    path('logout/', LogoutApi.as_view(), name='api_logout'),
    path('registro/publico/', RegistroPublicoApi.as_view(), name='api_registro_publico'),
    path('verificar-correo/', VerificarCorreoApi.as_view(), name='api_verificar_correo'),
    path('registro/interno/', RegistroInternoApi.as_view(), name='api_registro_interno'),
    path('token/generar/', GenerarTokenSeguridadApi.as_view(), name='api_generar_token'),
    path('token/restablecer/', RestablecerCredencialesApi.as_view(), name='api_restablecer_credenciales'),
    path('recuperar-contrasena/solicitar/', SolicitarRecuperacionContrasenaApi.as_view(), name='api_solicitar_recuperacion'),
    path('perfil/editar/', EditarPerfilApi.as_view(), name='api_editar_perfil'),
    path('perfil/foto/', SubirFotoPerfilApi.as_view(), name='api_subir_foto_perfil'),
    path('filtrar/', FiltrarUsuariosApi.as_view(), name='api_filtrar_usuarios'),
    path('onboarding/completar/', CompletarOnboardingApi.as_view(), name='api_completar_onboarding'),
    path('onboarding/', CompletarOnboardingApi.as_view(), name='api_onboarding'),
]
