from django.urls import path
from core_app.apis import (
    SupportEmailApi,
    ConfiguracionGlobalApi,
    SubirLogoEmpresaApi,
    ListarNotificacionesApi,
    MarcarNotificacionLeidaApi,
    MarcarTodasLeidasApi,
    EliminarNotificacionApi,
    EliminarTodasNotificacionesApi,
)

urlpatterns = [
    path('config/email-soporte/', SupportEmailApi.as_view(), name='api_email_soporte'),
    path('configuraciones/', ConfiguracionGlobalApi.as_view(), name='api_configuracion_global'),
    path('configuraciones/logo/', SubirLogoEmpresaApi.as_view(), name='api_subir_logo_empresa'),

    # Gestión de Notificaciones (La Campanita)
    path('notificaciones/', ListarNotificacionesApi.as_view(), name='api_listar_notificaciones'),
    path('notificaciones/<int:id_notificacion>/leer/', MarcarNotificacionLeidaApi.as_view(), name='api_marcar_notificacion_leida'),
    path('notificaciones/<int:id_notificacion>/eliminar/', EliminarNotificacionApi.as_view(), name='api_eliminar_notificacion'),
    path('notificaciones/<int:id_notificacion>/', EliminarNotificacionApi.as_view(), name='api_eliminar_notificacion_rest'),
    path('notificaciones/leer-todas/', MarcarTodasLeidasApi.as_view(), name='api_marcar_todas_notificaciones_leidas'),
    path('notificaciones/eliminar-todas/', EliminarTodasNotificacionesApi.as_view(), name='api_eliminar_todas_notificaciones'),
]


