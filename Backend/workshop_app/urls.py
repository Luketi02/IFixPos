from django.urls import path
from .apis import DispositivoCreateApi

app_name = 'workshop_app'

urlpatterns = [
    path('dispositivos/registrar/', DispositivoCreateApi.as_view(), name='registrar-dispositivo'),
]
