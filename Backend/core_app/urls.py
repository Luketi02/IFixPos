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
    FiltrarLogsAuditoriaApi,
    ListarCopiasSeguridadApi,
    GenerarCopiaSeguridadApi,
    DescargarCopiaSeguridadApi,
    SolicitarTokenRestauracionApi,
    RestaurarSistemaApi,
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

    # CU-40: Filtrar Logs de Auditoría
    path('logs/', FiltrarLogsAuditoriaApi.as_view(), name='api_filtrar_logs'),
    path('logs/filtrar/', FiltrarLogsAuditoriaApi.as_view(), name='api_filtrar_logs_query'),

    # CU-22: Realizar Copia de Seguridad
    path('backups/', ListarCopiasSeguridadApi.as_view(), name='api_listar_backups'),
    path('backups/manual/', GenerarCopiaSeguridadApi.as_view(), name='api_generar_backup_manual'),
    path('backups/<int:id_backup>/descargar/', DescargarCopiaSeguridadApi.as_view(), name='api_descargar_backup'),

    # CU-23: Restaurar Copia de Seguridad
    path('backups/<int:id_backup>/solicitar-token/', SolicitarTokenRestauracionApi.as_view(), name='api_solicitar_token_restauracion'),
    path('backups/<int:id_backup>/restaurar/', RestaurarSistemaApi.as_view(), name='api_restaurar_sistema'),
]



