from django.urls import path
from inventory_app.apis import FiltrarStockApi, ActualizarStockApi

urlpatterns = [
    # CU-35: Filtrar Stock e Inventario
    path('stock/', FiltrarStockApi.as_view(), name='api_filtrar_stock'),
    path('filtrar/', FiltrarStockApi.as_view(), name='api_filtrar_stock_alias'),

    # CU-13: Actualizar Stock
    path('stock/actualizar/', ActualizarStockApi.as_view(), name='api_actualizar_stock_manual'),
]
