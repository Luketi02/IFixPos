from django.urls import path
from purchases_app.apis import (
    FiltrarProveedoresApi,
    RegistrarProveedorApi,
    ModificarProveedorApi,
    InspeccionarProveedorApi,
    FiltrarOrdenesCompraApi,
    FiltrarSolicitudesCotizacionApi,
    FiltrarCotizacionesApi,
    GenerarSolicitudCotizacionApi,
    ListarSolicitudesCotizacionApi,
    DetalleSolicitudCotizacionApi,
    ModificarSolicitudCotizacionApi,
    EliminarSolicitudCotizacionApi,
    ResponderCotizacionApi,
    ListarCotizacionesPorSolicitudApi,
    DetalleCotizacionApi,
    EvaluarCotizacionApi,
    CalcularMejorCompraApi,
    EmitirOrdenesCompraApi,
    RecepcionarCompraApi,
    ConsultarOrdenCompraApi,
    RegistrarCompraDirectaApi,
    EjecutarMotorAbastecimientoApi,
    EstadoMotorAbastecimientoApi
)

app_name = 'purchases_app'

urlpatterns = [
    # CU-24: Registrar Proveedor
    path('proveedores/registrar/', RegistrarProveedorApi.as_view(), name='registrar-proveedor'),

    # CU-36: Filtrar Proveedores (GET lista / POST alta)
    path('proveedores/filtrar/', FiltrarProveedoresApi.as_view(), name='filtrar-proveedores-query'),
    path('proveedores/', FiltrarProveedoresApi.as_view(), name='filtrar-proveedores'),

    # Inspección Integral de Proveedor y Cumplimiento
    path('proveedores/<str:id_proveedor>/inspeccion/', InspeccionarProveedorApi.as_view(), name='inspeccionar-proveedor'),

    # CU-28: Modificar Proveedor
    path('proveedores/<str:id_proveedor>/modificar/', ModificarProveedorApi.as_view(), name='modificar-proveedor-action'),
    path('proveedores/<str:id_proveedor>/', ModificarProveedorApi.as_view(), name='modificar-proveedor'),

    # CU-14: Generar Solicitud de Cotización (POST)
    path('solicitudes-cotizacion/generar/', GenerarSolicitudCotizacionApi.as_view(), name='generar-solicitud-cotizacion'),

    # CU-41: Filtrar Solicitud de Cotización
    path('solicitudes-cotizacion/filtrar/', FiltrarSolicitudesCotizacionApi.as_view(), name='filtrar-solicitudes-cotizacion-query'),

    # CU-16: Modificar Solicitud de Cotización (PUT / PATCH)
    path('solicitudes-cotizacion/<int:id_solicitud>/modificar/', ModificarSolicitudCotizacionApi.as_view(), name='modificar-solicitud-cotizacion-action'),

    # CU-17: Eliminar Solicitud de Cotización (DELETE)
    path('solicitudes-cotizacion/<int:id_solicitud>/eliminar/', EliminarSolicitudCotizacionApi.as_view(), name='eliminar-solicitud-cotizacion-action'),

    # CU-15: Consultar Solicitud de Cotización (Detalle, actualización y baja directa)
    path('solicitudes-cotizacion/<int:id_solicitud>/', DetalleSolicitudCotizacionApi.as_view(), name='detalle-solicitud-cotizacion'),
    path('solicitudes-cotizacion/', ListarSolicitudesCotizacionApi.as_view(), name='listar-solicitudes-cotizacion'),

    # CU-37: Filtrar Órdenes de Compra
    path('ordenes-compra/', FiltrarOrdenesCompraApi.as_view(), name='filtrar-ordenes-compra'),
    path('ordenes-compra/filtrar/', FiltrarOrdenesCompraApi.as_view(), name='filtrar-ordenes-compra-query'),

    # CU-60: Filtrar Cotizaciones
    path('cotizaciones/', FiltrarCotizacionesApi.as_view(), name='filtrar-cotizaciones'),
    path('cotizaciones/filtrar/', FiltrarCotizacionesApi.as_view(), name='filtrar-cotizaciones-query'),

    # CU-25: Responder Solicitud de Cotización (Portal Externo del Proveedor)
    path('cotizar/<str:token_acceso>/responder/', ResponderCotizacionApi.as_view(), name='responder-cotizacion'),
    path('cotizar/<str:token_acceso>/', ResponderCotizacionApi.as_view(), name='portal-cotizacion-token'),

    # CU-52: Inspeccionar Cotizaciones
    path('solicitudes-cotizacion/<int:id_solicitud>/cotizaciones/', ListarCotizacionesPorSolicitudApi.as_view(), name='listar-cotizaciones-solicitud'),
    path('cotizaciones/<int:id_cotizacion>/', DetalleCotizacionApi.as_view(), name='detalle-cotizacion'),

    # CU-53: Evaluar Cotización (PATCH / PUT)
    path('cotizaciones/<int:id_cotizacion>/evaluar/', EvaluarCotizacionApi.as_view(), name='evaluar-cotizacion'),

    # CU-54: Generar Orden de Compra (Cálculo de Mejor Compra y Emisión)
    path('ordenes-compra/calcular-mejor-compra/', CalcularMejorCompraApi.as_view(), name='calcular-mejor-compra'),
    path('ordenes-compra/emitir/', EmitirOrdenesCompraApi.as_view(), name='emitir-ordenes-compra'),

    # CU-55: Recepcionar Compra (GET Checklist / PATCH Recepción)
    path('ordenes-compra/<int:id_orden>/recepcionar/', RecepcionarCompraApi.as_view(), name='recepcionar-orden-compra'),

    # CU-57: Consultar Orden de Compra (Detalle Solo Lectura)
    path('ordenes-compra/<int:id_orden>/', ConsultarOrdenCompraApi.as_view(), name='consultar-orden-compra'),

    # CU-31: Registrar Compra (Compra Directa)
    path('compras-directas/', RegistrarCompraDirectaApi.as_view(), name='listar-compras-directas'),
    path('compras-directas/registrar/', RegistrarCompraDirectaApi.as_view(), name='registrar-compra-directa'),
    # MOTOR AUTÓNOMO DE ABASTECIMIENTO INTELIGENTE
    path('motor-abastecimiento/ejecutar/', EjecutarMotorAbastecimientoApi.as_view(), name='motor-abastecimiento-ejecutar'),
    path('motor-abastecimiento/estado/', EstadoMotorAbastecimientoApi.as_view(), name='motor-abastecimiento-estado'),
]

