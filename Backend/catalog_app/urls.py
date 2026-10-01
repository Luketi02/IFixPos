from django.urls import path
from .apis import MarcaCreateApi, ModeloCreateApi

app_name = 'catalog_app'

urlpatterns = [
    path('marcas/registrar/', MarcaCreateApi.as_view(), name='registrar-marca'),
    path('modelos/registrar/', ModeloCreateApi.as_view(), name='registrar-modelo'),
]
