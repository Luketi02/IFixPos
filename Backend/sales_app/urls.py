from django.urls import path
from sales_app.apis import (
    RealizarCompraVirtualApi,
    AgregarAlCarritoApi,
    CarritoDetalleApi,
    QuitarDelCarritoApi,
    CompletarPagoApi,
    FiltrarCobrosPagosApi
)

urlpatterns = [
    # CU-18: Realizar Compra Virtual
    path('compras/virtual/', RealizarCompraVirtualApi.as_view(), name='api_realizar_compra_virtual'),
    path('checkout/', RealizarCompraVirtualApi.as_view(), name='api_checkout_virtual'),

    # Carrito de Compras
    path('carrito/agregar/', AgregarAlCarritoApi.as_view(), name='api_carrito_agregar'),
    path('carrito/quitar/', QuitarDelCarritoApi.as_view(), name='api_carrito_quitar'),
    path('carrito/', CarritoDetalleApi.as_view(), name='api_carrito_detalle'),

    # CU-21: Completar Pago y CU-20: Generar Factura
    path('pagos/completar/', CompletarPagoApi.as_view(), name='api_completar_pago'),
    path('pagos/completar/<str:identificador>/', CompletarPagoApi.as_view(), name='api_completar_pago_identificador'),
    path('operaciones/pendientes/', CompletarPagoApi.as_view(), name='api_operaciones_pendientes'),

    # CU-38: Filtrar Cobros y Pagos
    path('pagos/filtrar/', FiltrarCobrosPagosApi.as_view(), name='api_filtrar_cobros_pagos'),
    path('cobros/filtrar/', FiltrarCobrosPagosApi.as_view(), name='api_filtrar_cobros_alias'),
]


