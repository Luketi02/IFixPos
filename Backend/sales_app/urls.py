from django.urls import path
from sales_app.apis import (
    MisBeneficiosClienteApi,
    BeneficioRecomendacionCarritoApi,
    DepuracionMotorBeneficiosApi,
    RealizarCompraInvitadoApi,
    RealizarCompraVirtualApi,
    AgregarAlCarritoApi,
    ActualizarCantidadCarritoApi,
    CarritoDetalleApi,
    QuitarDelCarritoApi,
    CompletarPagoApi,
    FiltrarCobrosPagosApi,
    FiltrarBeneficiosOtorgadosApi,
    RegistrarMedioPagoApi,
    AlternarEstadoMedioPagoApi,
    RealizarVentaPresencialApi,
    ListarHistorialBeneficiosApi,
    InspeccionarBeneficioApi,
    RevocarBeneficioApi,
    ReporteLogisticaApi,
    MercadoPagoCrearPreferenciaApi,
    MercadoPagoWebhookApi,
    MercadoPagoConfigPublicaApi,
    ConsultarEstadoVentaApi,
    CancelarVentaVirtualApi,
    ConsultarCostoEnvioApi,
    ConsultarCompraPendienteActivaApi,
    DescargarFacturaVentaApi
)

urlpatterns = [
    # CU-18: Realizar Compra Virtual e Invitados
    path('compras/invitado/', RealizarCompraInvitadoApi.as_view(), name='api_compra_invitado'),
    path('compras/virtual/', RealizarCompraVirtualApi.as_view(), name='api_realizar_compra_virtual'),
    path('checkout/', RealizarCompraVirtualApi.as_view(), name='api_checkout_virtual'),

    # Carrito de Compras
    path('carrito/agregar/', AgregarAlCarritoApi.as_view(), name='api_carrito_agregar'),
    path('carrito/actualizar/', ActualizarCantidadCarritoApi.as_view(), name='api_carrito_actualizar'),
    path('carrito/quitar/', QuitarDelCarritoApi.as_view(), name='api_carrito_quitar'),
    path('carrito/', CarritoDetalleApi.as_view(), name='api_carrito_detalle'),

    # CU-21: Completar Pago y CU-20: Generar Factura
    path('pagos/completar/', CompletarPagoApi.as_view(), name='api_completar_pago'),
    path('pagos/completar/<str:identificador>/', CompletarPagoApi.as_view(), name='api_completar_pago_identificador'),
    path('operaciones/pendientes/', CompletarPagoApi.as_view(), name='api_operaciones_pendientes'),

    # CU-38: Filtrar Cobros y Pagos
    path('pagos/filtrar/', FiltrarCobrosPagosApi.as_view(), name='api_filtrar_cobros_pagos'),
    path('cobros/filtrar/', FiltrarCobrosPagosApi.as_view(), name='api_filtrar_cobros_alias'),

    # CU-70: Filtrar Beneficios Otorgados
    path('beneficios/', FiltrarBeneficiosOtorgadosApi.as_view(), name='api_filtrar_beneficios'),
    path('beneficios/filtrar/', FiltrarBeneficiosOtorgadosApi.as_view(), name='api_filtrar_beneficios_query'),

    # CU-69: Auditar Historial de Beneficios y Promociones
    path('beneficios/historial/', ListarHistorialBeneficiosApi.as_view(), name='api_historial_beneficios'),
    path('beneficios/<int:id_beneficio>/auditar/', InspeccionarBeneficioApi.as_view(), name='api_auditar_beneficio'),
    path('beneficios/<int:id_beneficio>/detalle/', InspeccionarBeneficioApi.as_view(), name='api_inspeccionar_beneficio'),

    # CU-71: Revocar Beneficio Activo
    path('beneficios/<int:id_beneficio>/revocar/', RevocarBeneficioApi.as_view(), name='api_revocar_beneficio'),

    # Motor Inteligente de Beneficios: Cliente, Checkout y Depuración
    path('beneficios/mis-beneficios/', MisBeneficiosClienteApi.as_view(), name='api_mis_beneficios_cliente'),
    path('beneficios/recomendacion-carrito/', BeneficioRecomendacionCarritoApi.as_view(), name='api_beneficio_recomendacion_carrito'),
    path('beneficios/depurar-predictivo/', DepuracionMotorBeneficiosApi.as_view(), name='api_depurar_motor_beneficios'),

    # CU-82: Registrar medio de pago
    path('medios-pago/registrar/', RegistrarMedioPagoApi.as_view(), name='api_registrar_medio_pago'),
    path('medios-pago/', RegistrarMedioPagoApi.as_view(), name='api_medios_pago_list_create'),

    # CU-83: Cambiar estado de medio de pago
    path('medios-pago/<int:id_medio_pago>/toggle/', AlternarEstadoMedioPagoApi.as_view(), name='api_toggle_medio_pago'),
    path('medios-pago/<int:id_medio_pago>/estado/', AlternarEstadoMedioPagoApi.as_view(), name='api_cambiar_estado_medio_pago'),

    # CU-67: Realizar Venta Presencial
    path('ventas/presencial/', RealizarVentaPresencialApi.as_view(), name='api_realizar_venta_presencial'),
    path('venta-presencial/', RealizarVentaPresencialApi.as_view(), name='api_venta_presencial_alias'),

    # CU-75: Generar Reporte de Distribución Geográfica y Logística
    path('reportes/logistica/', ReporteLogisticaApi.as_view(), name='api_reporte_logistica'),

    # Integración Oficial Mercado Pago (Automatizada)
    path('mercadopago/crear-preferencia/', MercadoPagoCrearPreferenciaApi.as_view(), name='api_mp_crear_preferencia'),
    path('mercadopago/webhook/', MercadoPagoWebhookApi.as_view(), name='api_mp_webhook'),
    path('mercadopago/config/', MercadoPagoConfigPublicaApi.as_view(), name='api_mp_config'),
    path('compras/virtual/<int:id_venta>/estado/', ConsultarEstadoVentaApi.as_view(), name='api_estado_venta_virtual'),
    path('compras/virtual/<int:id_venta>/cancelar/', CancelarVentaVirtualApi.as_view(), name='api_cancelar_venta_virtual'),
    path('compras/costo-envio/', ConsultarCostoEnvioApi.as_view(), name='api_costo_envio'),
    path('compras/virtual/pendiente-activa/', ConsultarCompraPendienteActivaApi.as_view(), name='api_compra_pendiente_activa'),
    path('compras/virtual/<int:id_venta>/factura/', DescargarFacturaVentaApi.as_view(), name='api_descargar_factura_venta'),
]


