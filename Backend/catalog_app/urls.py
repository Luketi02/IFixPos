from django.urls import path
from .apis import (
    MarcaCreateApi,
    MarcaApi,
    MarcaEstadoApi,
    ModeloCreateApi,
    ModeloDispositivoApi,
    ModeloDispositivoEstadoApi,
    CategoriaListApi,
    CategoriaProductoApi,
    CategoriaProductoEstadoApi,
    ProductoTiendaListApi,
    ProductoCreateApi,
    ProductoSubirImagenApi,
    ProductoDetailApi,
    TipoDispositivoApi,
    TipoDispositivoEstadoApi
)

app_name = 'catalog_app'

urlpatterns = [
    path('marcas/', MarcaApi.as_view(), name='marcas'),
    path('marcas/registrar/', MarcaCreateApi.as_view(), name='registrar-marca'),
    path('marcas/<int:id_marca>/estado/', MarcaEstadoApi.as_view(), name='cambiar-estado-marca'),
    path('modelos/', ModeloDispositivoApi.as_view(), name='modelos'),
    path('modelos/registrar/', ModeloCreateApi.as_view(), name='registrar-modelo'),
    path('modelos/<int:id_modelo>/estado/', ModeloDispositivoEstadoApi.as_view(), name='cambiar-estado-modelo'),
    path('categorias/', CategoriaProductoApi.as_view(), name='categorias'),
    path('categorias/activas/', CategoriaListApi.as_view(), name='listar-categorias-activas'),
    path('categorias/<int:id_categoria>/estado/', CategoriaProductoEstadoApi.as_view(), name='cambiar-estado-categoria'),
    path('productos/', ProductoTiendaListApi.as_view(), name='listar-productos'),
    path('productos/tienda/', ProductoTiendaListApi.as_view(), name='listar-productos-tienda'),
    path('productos/registrar/', ProductoCreateApi.as_view(), name='registrar-producto'),
    path('productos/subir-imagen/', ProductoSubirImagenApi.as_view(), name='subir-imagen-producto'),
    path('productos/<int:id_producto>/', ProductoDetailApi.as_view(), name='detalle-producto'),
    path('productos/<int:id_producto>/modificar/', ProductoDetailApi.as_view(), name='modificar-producto'),
    path('tipos-dispositivos/', TipoDispositivoApi.as_view(), name='tipos-dispositivos'),
    path('tipos-dispositivos/<int:id_tipo>/estado/', TipoDispositivoEstadoApi.as_view(), name='cambiar-estado-tipo-dispositivo'),
]
