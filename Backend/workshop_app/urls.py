from django.urls import path
from .apis import (
    TiposDispositivosListApi,
    MarcasDispositivosListApi,
    ModelosPorMarcaListApi,
    DispositivoCreateApi,
    FiltrarDispositivosTallerApi,
    FiltrarMisDispositivosApi
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
]
