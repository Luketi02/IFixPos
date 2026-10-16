from django.urls import path
from core_app.apis import SupportEmailApi, ConfiguracionGlobalApi, SubirLogoEmpresaApi

urlpatterns = [
    path('config/email-soporte/', SupportEmailApi.as_view(), name='api_email_soporte'),
    path('configuraciones/', ConfiguracionGlobalApi.as_view(), name='api_configuracion_global'),
    path('configuraciones/logo/', SubirLogoEmpresaApi.as_view(), name='api_subir_logo_empresa'),
]
