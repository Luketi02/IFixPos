from django.urls import path
from .apis import DispositivoCreateApi, FiltrarDispositivosTallerApi, FiltrarMisDispositivosApi

app_name = 'workshop_app'

urlpatterns = [
    path('dispositivos/registrar/', DispositivoCreateApi.as_view(), name='registrar-dispositivo'),
    path('dispositivos/taller/filtrar/', FiltrarDispositivosTallerApi.as_view(), name='filtrar-dispositivos-taller'),
    path('dispositivos/mis-dispositivos/', FiltrarMisDispositivosApi.as_view(), name='filtrar-mis-dispositivos'),
]
