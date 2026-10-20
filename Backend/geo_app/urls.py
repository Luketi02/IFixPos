from django.urls import path
from geo_app.apis import (
    PaisesListApi,
    ProvinciasListApi,
    CiudadesListApi,
    MisDireccionesApi,
    MisDireccionesDetalleApi,
    DireccionDetalleApi,
    DireccionSedeApi,
    ZonasCoberturaApi
)

urlpatterns = [
    # Zonas de Cobertura Logística (CU-50, CU-59)
    path('zonas-cobertura/', ZonasCoberturaApi.as_view(), name='api_zonas_cobertura'),

    # Catálogos Geográficos en Cascada
    path('paises/', PaisesListApi.as_view(), name='api_paises_list'),
    path('paises/<int:id_pais>/provincias/', ProvinciasListApi.as_view(), name='api_paises_provincias_list'),
    path('provincias/', ProvinciasListApi.as_view(), name='api_provincias_list'),
    path('provincias/<int:id_provincia>/ciudades/', CiudadesListApi.as_view(), name='api_provincias_ciudades_list'),
    path('ciudades/', CiudadesListApi.as_view(), name='api_ciudades_list'),

    # Dirección física de la sede (direccionLocal), independiente de la libreta personal
    path('direccion-sede/', DireccionSedeApi.as_view(), name='api_direccion_sede'),

    # Libreta de Direcciones Personales (CU-47, CU-48, CU-49)
    path('mis-direcciones/', MisDireccionesApi.as_view(), name='api_mis_direcciones'),
    path('mis-direcciones/<int:id_direccion>/', MisDireccionesDetalleApi.as_view(), name='api_mis_direcciones_detalle'),
]
