from django.urls import path
from .apis import (
    TiposDispositivosListApi,
    MarcasDispositivosListApi,
    ModelosPorMarcaListApi,
    DispositivoCreateApi,
    FiltrarDispositivosTallerApi,
    FiltrarMisDispositivosApi,
    MisDispositivosApi,
    DispositivoDetalleApi,
    ReparacionDetalleApi,
    CategoriaReparacionApi,
    CategoriaReparacionEstadoApi
)

app_name = 'workshop_app'

urlpatterns = [
    # Catálogos de dispositivos para selects del Frontend (CU-06)
    path('tipos-dispositivos/', TiposDispositivosListApi.as_view(), name='tipos-dispositivos'),
    path('marcas/', MarcasDispositivosListApi.as_view(), name='marcas-dispositivos'),
    path('marcas/<int:id_marca>/modelos/', ModelosPorMarcaListApi.as_view(), name='modelos-por-marca-path'),
    path('modelos/', ModelosPorMarcaListApi.as_view(), name='modelos-por-marca-query'),

    # Registro y consulta de dispositivos (CU-06, CU-33, CU-34)
    path('dispositivos/registrar/', DispositivoCreateApi.as_view(), name='registrar-dispositivo'),
    path('dispositivos/taller/filtrar/', FiltrarDispositivosTallerApi.as_view(), name='filtrar-dispositivos-taller'),
    path('dispositivos/mis-dispositivos/', FiltrarMisDispositivosApi.as_view(), name='filtrar-mis-dispositivos'),
    path('mis-dispositivos/', MisDispositivosApi.as_view(), name='mis-dispositivos'),
    path('mis-dispositivos/<int:id_dispositivo>/', MisDispositivosApi.as_view(), name='mis-dispositivos-detalle'),

    # CU-11: Consultar Detalles del Dispositivo
    path('dispositivos/<int:id_dispositivo>/detalles/', DispositivoDetalleApi.as_view(), name='dispositivo-detalles'),

    # CU-61: Consultar Detalle de Reparación
    path('reparaciones/<int:id_reparacion>/detalles/', ReparacionDetalleApi.as_view(), name='reparacion-detalles'),

    # CU-62, CU-63, CU-64: Categorías de Reparación
    path('categorias-reparacion/', CategoriaReparacionApi.as_view(), name='categorias-reparacion'),
    path('categorias-reparacion/<int:id_categoria>/estado/', CategoriaReparacionEstadoApi.as_view(), name='cambiar-estado-categoria-reparacion'),
]

