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
    EditarPerfilApi
)

urlpatterns = [
    path('login/', LoginApi.as_view(), name='api_login'),
    path('login/google/', GoogleLoginApi.as_view(), name='api_login_google'),
    path('logout/', LogoutApi.as_view(), name='api_logout'),
    path('registro/publico/', RegistroPublicoApi.as_view(), name='api_registro_publico'),
    path('registro/interno/', RegistroInternoApi.as_view(), name='api_registro_interno'),
    path('token/generar/', GenerarTokenSeguridadApi.as_view(), name='api_generar_token'),
    path('token/restablecer/', RestablecerCredencialesApi.as_view(), name='api_restablecer_credenciales'),
    path('recuperar-contrasena/solicitar/', SolicitarRecuperacionContrasenaApi.as_view(), name='api_solicitar_recuperacion'),
    path('perfil/editar/', EditarPerfilApi.as_view(), name='api_editar_perfil'),
]
