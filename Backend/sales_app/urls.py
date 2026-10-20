from django.urls import path
from sales_app.apis import (
    RealizarCompraVirtualApi,
    AgregarAlCarritoApi,
    CarritoDetalleApi
)

urlpatterns = [
    # CU-18: Realizar Compra Virtual
    path('compras/virtual/', RealizarCompraVirtualApi.as_view(), name='api_realizar_compra_virtual'),
    path('checkout/', RealizarCompraVirtualApi.as_view(), name='api_checkout_virtual'),

    # Carrito de Compras
    path('carrito/agregar/', AgregarAlCarritoApi.as_view(), name='api_carrito_agregar'),
    path('carrito/', CarritoDetalleApi.as_view(), name='api_carrito_detalle'),
]
