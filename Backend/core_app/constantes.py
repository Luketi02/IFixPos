"""
Constantes globales, enumeraciones (TextChoices) y utilidades de dominio para IFixPos.
Centraliza estados, códigos de rol, límites por defecto y normalizadores (Fase 3 - §2.3 y §2.4).
"""
from typing import Any, Optional
from django.db import models


class CodigoRol(models.TextChoices):
    ADMIN = 'ADMIN', 'Administrador'
    GERENTE = 'GERENTE', 'Gerente'
    TECNICO = 'TECNICO', 'Técnico'
    CLIENTE = 'CLIENTE', 'Cliente'


class EstadoVenta(models.TextChoices):
    PENDIENTE = 'PENDIENTE', 'Pendiente de Pago'
    PAGADA = 'PAGADA', 'Pagada'
    PAGADO = 'PAGADO', 'Pagado (Mostrador)'
    CANCELADA = 'CANCELADA', 'Cancelada'
    CANCELADO = 'CANCELADO', 'Cancelado'
    ANULADO = 'ANULADO', 'Anulado'


class MetodoEntrega(models.TextChoices):
    RETIRO = 'RETIRO', 'Retiro en Local'
    RETIRO_EN_LOCAL = 'RETIRO EN LOCAL', 'Retiro en Local'
    ENVIO = 'ENVIO', 'Envío a Domicilio'
    ENVIO_A_DOMICILIO = 'ENVIO A DOMICILIO', 'Envío a Domicilio'


class EtapaReparacion(models.TextChoices):
    ESPERANDO_DISPOSITIVO = 'ESPERANDO_DISPOSITIVO', 'Esperando Dispositivo'
    NUEVO_DIAGNOSTICO = 'NUEVO_DIAGNOSTICO', 'Nuevo Diagnóstico'
    ESPERANDO_CONFIRMACION = 'ESPERANDO_CONFIRMACION', 'Esperando Confirmación'
    PENDIENTE_PAGO = 'PENDIENTE_PAGO', 'Pendiente de Pago'
    EN_REPARACION = 'EN_REPARACION', 'En Reparación'
    ESPERANDO_REPUESTO = 'ESPERANDO_REPUESTO', 'Esperando Repuesto'
    FINALIZADO = 'FINALIZADO', 'Finalizado'
    ENTREGADO = 'ENTREGADO', 'Entregado'
    CANCELADO = 'CANCELADO', 'Cancelado'


class CodigoMedioPago(models.TextChoices):
    MERCADO_PAGO = 'MP', 'Mercado Pago / Pasarela Online'
    EFECTIVO = 'EFECTIVO', 'Efectivo en Mostrador'
    TRANSFERENCIA = 'TRANSFERENCIA', 'Transferencia Bancaria'
    TARJETA = 'TARJETA', 'Tarjeta Débito / Crédito'
    OTRO = 'OTRO', 'Otro Medio de Pago'


class EstadoOrdenCompra(models.TextChoices):
    EMITIDA = 'EMITIDA', 'Emitida'
    ENVIADA = 'ENVIADA', 'Enviada al Proveedor'
    RECIBIDA = 'RECIBIDA', 'Recibida'
    COMPLETADA = 'COMPLETADA', 'Completada'
    CANCELADA = 'CANCELADA', 'Cancelada'


class EstadoSolicitudCotizacion(models.TextChoices):
    BORRADOR = 'BORRADOR', 'Borrador'
    ABIERTA = 'ABIERTA', 'Abierta'
    EN_EVALUACION = 'EN_EVALUACION', 'En Evaluación'
    ADJUDICADA = 'ADJUDICADA', 'Adjudicada'
    CERRADA = 'CERRADA', 'Cerrada'
    CANCELADA = 'CANCELADA', 'Cancelada'


def deducir_codigo_medio_pago(nombre: Optional[str]) -> str:
    """
    Deduce el código técnico inmutable (`CodigoMedioPago`) a partir del nombre comercial.
    """
    texto = str(nombre or '').strip().lower()
    if 'mercado' in texto or texto == 'mp' or 'qr' in texto or 'pasarela' in texto:
        return CodigoMedioPago.MERCADO_PAGO
    if 'efectivo' in texto or 'contado' in texto:
        return CodigoMedioPago.EFECTIVO
    if 'transfer' in texto or 'cbu' in texto or 'alias' in texto:
        return CodigoMedioPago.TRANSFERENCIA
    if 'tarjeta' in texto or 'debito' in texto or 'débito' in texto or 'credito' in texto or 'crédito' in texto:
        return CodigoMedioPago.TARJETA
    return CodigoMedioPago.OTRO


ESTADOS_VENTA_PAGADA = ('PAGADA', 'PAGADO')
ESTADOS_VENTA_CANCELADA = ('CANCELADA', 'CANCELADO', 'ANULADO')

EMAIL_CONSUMIDOR_FINAL = 'consumidorfinal@ifixpos.com'
MIN_INTENTOS_LOGIN_PERMITIDOS = 3
MAX_LONGITUD_LOG = 1000

# Valores por defecto para parámetros de negocio en ConfiguracionSistema (§2.3)
RESERVA_VENTA_PENDIENTE_MINUTOS_DEFECTO = 30
VALIDEZ_COTIZACION_DIAS_DEFECTO = 15
VIDA_ACCESS_TOKEN_MINUTOS_DEFECTO = 60
VIDA_OTP_RECUPERACION_MINUTOS_DEFECTO = 15
VIDA_OTP_ADMIN_MINUTOS_DEFECTO = 5
LONGITUD_CODIGO_SEGURIDAD_DEFECTO = 10
LIMITE_RESULTADOS_GEO_DEFECTO = 100
MAX_TAMANO_ARCHIVO_BYTES_DEFECTO = 10 * 1024 * 1024  # 10 MB

EXTENSIONES_IMAGEN_PERMITIDAS_DEFECTO = (
    '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.jfif', '.heic', '.heif'
)
EXTENSIONES_ARCHIVO_PERMITIDAS_DEFECTO = (
    '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.jfif', '.heic', '.heif', '.pdf'
)


def venta_esta_pagada(venta_o_estado: Any) -> bool:
    """
    Evalúa de forma canónica si una instancia de Venta o un string de estado
    corresponde a una operación pagada ('PAGADA' o 'PAGADO').
    """
    if hasattr(venta_o_estado, 'estado_venta'):
        valor = getattr(venta_o_estado, 'estado_venta', '')
    else:
        valor = venta_o_estado
    return str(valor or '').strip().upper() in ESTADOS_VENTA_PAGADA


def venta_esta_cancelada(venta_o_estado: Any) -> bool:
    """
    Evalúa si una instancia de Venta o un string de estado corresponde
    a una operación cancelada o anulada.
    """
    if hasattr(venta_o_estado, 'estado_venta'):
        valor = getattr(venta_o_estado, 'estado_venta', '')
    else:
        valor = venta_o_estado
    return str(valor or '').strip().upper() in ESTADOS_VENTA_CANCELADA


def normalizar_estado_venta(estado: Optional[str]) -> str:
    """
    Normaliza el estado de venta hacia su representación canónica.
    """
    limpio = str(estado or '').strip().upper()
    if limpio in ESTADOS_VENTA_PAGADA:
        return EstadoVenta.PAGADA
    if limpio in ('CANCELADO', 'CANCELADA'):
        return EstadoVenta.CANCELADA
    return limpio


def truncar_log(texto: Optional[str], max_len: int = MAX_LONGITUD_LOG) -> str:
    """
    Trunca de forma segura el detalle de auditoría para LogSistema o Notificacion
    evitando desbordamientos de columna en la base de datos.
    """
    if not texto:
        return ""
    return str(texto)[:max_len]


DIAS_SEMANA_VALIDOS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']
MODALIDADES_BACKUP_VALIDAS = ['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'MULTINIVEL']
CATEGORIAS_BACKUP = ['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'MANUAL']

# ==============================================================================
# CATÁLOGO CANÓNICO DE CONFIGURACIONES MAESTRAS DEL SISTEMA (CU-42)
# ==============================================================================
# Define el 100% de parámetros del ERP con sus valores por defecto, tipo de dato
# y categoría. Se utiliza para el autosanado y persistencia en base de datos.

CATALOGO_CONFIGURACIONES_SISTEMA = {
    # 🛡️ Seguridad
    'tiempoSesionInactiva': {
        'valor_defecto': '168',
        'tipo': 'DECIMAL',
        'categoria': 'seguridad',
        'descripcion': 'Tiempo en horas para mantener el control de inactividad; al superarse, fuerza el cierre de sesión.'
    },
    'maxIntentosLogin': {
        'valor_defecto': '10',
        'tipo': 'ENTERO',
        'categoria': 'seguridad',
        'descripcion': 'Cantidad de intentos fallidos permitidos antes de bloquear la cuenta temporalmente.'
    },
    'minutosVidaAccessToken': {
        'valor_defecto': str(VIDA_ACCESS_TOKEN_MINUTOS_DEFECTO),
        'tipo': 'ENTERO',
        'categoria': 'seguridad',
        'descripcion': 'Vigencia en minutos del token JWT de acceso antes de requerir su renovación atómica.'
    },
    'minutosVidaOtpRecuperacion': {
        'valor_defecto': str(VIDA_OTP_RECUPERACION_MINUTOS_DEFECTO),
        'tipo': 'ENTERO',
        'categoria': 'seguridad',
        'descripcion': 'Minutos de validez del código OTP de 6 dígitos para recuperación de contraseña.'
    },
    'minutosVidaOtpAdmin': {
        'valor_defecto': str(VIDA_OTP_ADMIN_MINUTOS_DEFECTO),
        'tipo': 'ENTERO',
        'categoria': 'seguridad',
        'descripcion': 'Minutos de validez de códigos OTP para autorizaciones de alta seguridad administrativa.'
    },

    # 💻 Sistema
    'tamanoMaxArchivoMB': {
        'valor_defecto': '10',
        'tipo': 'ENTERO',
        'categoria': 'sistema',
        'descripcion': 'Límite máximo en Megabytes permitido para la subida de archivos al sistema.'
    },
    'emailAlertasSistema': {
        'valor_defecto': 'alertas@ifixnet.com',
        'tipo': 'TEXTO',
        'categoria': 'sistema',
        'descripcion': 'Casilla de correo destino donde el servidor despacha notificaciones críticas y alertas internas.'
    },
    'extensionesPermitidasArchivos': {
        'valor_defecto': '.jpg,.jpeg,.png,.webp,.pdf',
        'tipo': 'TEXTO',
        'categoria': 'sistema',
        'descripcion': 'Lista blanca de extensiones permitidas para fotos de ingreso, comprobantes y catálogo.'
    },
    'limiteResultadosBusquedaGeo': {
        'valor_defecto': str(LIMITE_RESULTADOS_GEO_DEFECTO),
        'tipo': 'ENTERO',
        'categoria': 'sistema',
        'descripcion': 'Límite máximo de resultados retornados en búsquedas geográficas rápidas para optimizar red.'
    },

    # 💾 Respaldos (Backups)
    'backupAutomatico': {
        'valor_defecto': 'False',
        'tipo': 'BOOLEANO',
        'categoria': 'seguridad',
        'descripcion': 'Interruptor maestro que permite activar o desactivar los respaldos automáticos del ERP.'
    },
    'backupModalidad': {
        'valor_defecto': 'MULTINIVEL',
        'tipo': 'TEXTO',
        'categoria': 'seguridad',
        'descripcion': 'Esquema de respaldos: DIARIO, SEMANAL, QUINCENAL, MENSUAL o MULTINIVEL.'
    },
    'backupDiarioActivo': {
        'valor_defecto': 'True',
        'tipo': 'BOOLEANO',
        'categoria': 'seguridad',
        'descripcion': 'Habilita o deshabilita la capa de respaldos diarios.'
    },
    'backupFrecuenciaHoras': {
        'valor_defecto': '24',
        'tipo': 'ENTERO',
        'categoria': 'seguridad',
        'descripcion': 'Establece cada cuántas horas debe correr el respaldo automático diario (ej. 6, 12, 24).'
    },
    'backupHoraEjecucion': {
        'valor_defecto': '03:00',
        'tipo': 'TEXTO',
        'categoria': 'seguridad',
        'descripcion': 'Define el horario exacto en formato 24h para el volcado diario.'
    },
    'backupSemanalActivo': {
        'valor_defecto': 'True',
        'tipo': 'BOOLEANO',
        'categoria': 'seguridad',
        'descripcion': 'Habilita o deshabilita la capa de respaldos semanales.'
    },
    'backupDiaSemana': {
        'valor_defecto': 'SABADO',
        'tipo': 'TEXTO',
        'categoria': 'seguridad',
        'descripcion': 'Día de la semana fijado para el respaldo semanal (LUNES a DOMINGO).'
    },
    'backupHoraSemanal': {
        'valor_defecto': '02:00',
        'tipo': 'TEXTO',
        'categoria': 'seguridad',
        'descripcion': 'Define el horario exacto en formato 24h para el volcado semanal.'
    },
    'backupQuincenalActivo': {
        'valor_defecto': 'True',
        'tipo': 'BOOLEANO',
        'categoria': 'seguridad',
        'descripcion': 'Habilita o deshabilita la capa de respaldos quincenales (cada 15 días).'
    },
    'backupHoraQuincenal': {
        'valor_defecto': '04:00',
        'tipo': 'TEXTO',
        'categoria': 'seguridad',
        'descripcion': 'Define el horario exacto en formato 24h para el volcado quincenal.'
    },
    'backupMensualActivo': {
        'valor_defecto': 'True',
        'tipo': 'BOOLEANO',
        'categoria': 'seguridad',
        'descripcion': 'Habilita o deshabilita la capa de respaldos mensuales (cada 30 días).'
    },
    'backupHoraMensual': {
        'valor_defecto': '05:00',
        'tipo': 'TEXTO',
        'categoria': 'seguridad',
        'descripcion': 'Define el horario exacto en formato 24h para el volcado mensual.'
    },
    'backupRetencionCopias': {
        'valor_defecto': '5',
        'tipo': 'ENTERO',
        'categoria': 'seguridad',
        'descripcion': 'Cantidad máxima de copias históricas de respaldo a conservar por categoría en el servidor (FIFO).'
    },
    'backupUltimaEjecucion': {
        'valor_defecto': '',
        'tipo': 'TEXTO',
        'categoria': 'seguridad',
        'descripcion': 'Registro en formato JSON de la última ejecución automática de cada nivel.'
    },

    # 🚚 Ventas, Pagos y Logística
    'envioLocal': {
        'valor_defecto': '0',
        'tipo': 'DECIMAL',
        'categoria': 'fidelizacion',
        'descripcion': 'Valor monetario configurable para el costo de logística dentro de la ciudad de origen.'
    },
    'envioRegional': {
        'valor_defecto': '0',
        'tipo': 'DECIMAL',
        'categoria': 'fidelizacion',
        'descripcion': 'Valor monetario configurable para el costo de logística fuera de la ciudad pero en la provincia.'
    },
    'envioNacional': {
        'valor_defecto': '0',
        'tipo': 'DECIMAL',
        'categoria': 'fidelizacion',
        'descripcion': 'Valor monetario configurable para el costo de logística destinado al resto del país.'
    },
    'minutosReservaVentaPendiente': {
        'valor_defecto': str(RESERVA_VENTA_PENDIENTE_MINUTOS_DEFECTO),
        'tipo': 'ENTERO',
        'categoria': 'fidelizacion',
        'descripcion': 'Tiempo límite de gracia para abonar una orden pendiente antes de cancelar y liberar stock.'
    },
    'longitudCodigoSeguridad': {
        'valor_defecto': str(LONGITUD_CODIGO_SEGURIDAD_DEFECTO),
        'tipo': 'ENTERO',
        'categoria': 'fidelizacion',
        'descripcion': 'Cantidad de caracteres alfanuméricos de los códigos de seguridad para retiro de órdenes.'
    },
    'minutosExpiracionPreferenciaMP': {
        'valor_defecto': '30',
        'tipo': 'ENTERO',
        'categoria': 'fidelizacion',
        'descripcion': 'Tiempo de vida en minutos de la preferencia y código QR generado por Mercado Pago.'
    },
    'mpPublicKey': {
        'valor_defecto': 'S/N',
        'tipo': 'TEXTO',
        'categoria': 'fidelizacion',
        'descripcion': 'Clave pública oficial de Mercado Pago de la empresa (Checkout Pro).'
    },
    'mpAccessToken': {
        'valor_defecto': 'S/N',
        'tipo': 'TEXTO',
        'categoria': 'fidelizacion',
        'descripcion': 'Token privado de acceso de Mercado Pago para procesar cobros y acreditaciones.'
    },
    'mpWebhookSecret': {
        'valor_defecto': 'S/N',
        'tipo': 'TEXTO',
        'categoria': 'fidelizacion',
        'descripcion': 'Secreto de validación de firma para Webhooks y notificaciones IPN de Mercado Pago.'
    },

    # 🏢 Institucional (Master Data)
    'nombreLocal': {
        'valor_defecto': 'IFix Servicio Técnico & Store',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Nombre comercial oficial de la empresa, utilizado para facturación y presentación.'
    },
    'direccionLocal': {
        'valor_defecto': 'S/N',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Referencia al ID de la tabla Dirección con los datos físicos de la sede de la empresa.'
    },
    'imagenLocal': {
        'valor_defecto': '/itemLogoVentana.svg',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Enlace o ruta relativa al logo oficial de la empresa, utilizado en interfaz y PDF.'
    },
    'cuilLocal': {
        'valor_defecto': '00-00000000-0',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Identificación fiscal (CUIT/CUIL), vital para validez legal de órdenes y comprobantes.'
    },
    'telefonoLocal': {
        'valor_defecto': 'S/N',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Número telefónico de contacto comercial visible en los encabezados y notificaciones.'
    },
    'emailLocal': {
        'valor_defecto': 'contacto@empresa.com',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Casilla de correo oficial desde donde el sistema despacha solicitudes y alertas.'
    },
    'emailAdministracion': {
        'valor_defecto': 'S/N',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Casilla de correo administrativo oficial para mostrar en el sistema.'
    },
    'emailRRHH': {
        'valor_defecto': 'S/N',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Casilla de correo referente al sector de recursos humanos.'
    },
    'emailInfo': {
        'valor_defecto': 'S/N',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Casilla de correo donde se recibe información general y notificaciones.'
    },
    'emailPrensa': {
        'valor_defecto': 'S/N',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Casilla de correo para difusión y comunicados.'
    },
    'emailLegal': {
        'valor_defecto': 'S/N',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Casilla de correo donde se recibe información legal oficial.'
    },
    'emailSoporte': {
        'valor_defecto': 'soporte@ifixnet.com',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Casilla de correo para soporte técnico del sistema y reportes de usuarios.'
    },
    'bancoLocal': {
        'valor_defecto': 'Banco de la Nación Argentina',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Nombre de la entidad bancaria donde el comercio posee su cuenta oficial.'
    },
    'titularCuentaLocal': {
        'valor_defecto': 'IFix Servicio Técnico S.R.L.',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Titular o razón social oficial para verificar la cuenta al realizar transferencias.'
    },
    'cbuLocal': {
        'valor_defecto': '0110599540000012345678',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Clave Bancaria Uniforme (CBU/CVU) oficial para recibir transferencias de clientes.'
    },
    'aliasLocal': {
        'valor_defecto': 'IFIX.TALLER.POS',
        'tipo': 'TEXTO',
        'categoria': 'institucional',
        'descripcion': 'Alias alfanumérico bancario para transferencias inmediatas.'
    },

    # 📦 Abastecimiento y Compras (Algoritmo)
    'autoAbastecimientoActivo': {
        'valor_defecto': 'True',
        'tipo': 'BOOLEANO',
        'categoria': 'algoritmo',
        'descripcion': 'Activa o desactiva la ejecución del algoritmo de abastecimiento y compras.'
    },
    'frecuenciaGeneracionOC_dias': {
        'valor_defecto': '5',
        'tipo': 'ENTERO',
        'categoria': 'algoritmo',
        'descripcion': 'Días que el sistema espera agrupando faltantes antes de generar la Orden de Compra.'
    },
    'diasEsperaCotizacion': {
        'valor_defecto': '5',
        'tipo': 'ENTERO',
        'categoria': 'algoritmo',
        'descripcion': 'Tiempo máximo de gracia (días hábiles) para que proveedores coticen antes de cerrar.'
    },
    'diasValidezCotizacion': {
        'valor_defecto': str(VALIDEZ_COTIZACION_DIAS_DEFECTO),
        'tipo': 'ENTERO',
        'categoria': 'algoritmo',
        'descripcion': 'Cantidad de días durante los cuales las cotizaciones de proveedores siguen válidas.'
    },
    'pesoEvaluacion_Confiabilidad': {
        'valor_defecto': '20',
        'tipo': 'ENTERO',
        'categoria': 'algoritmo',
        'descripcion': 'Porcentaje de importancia (%) del historial de cumplimiento y responsabilidad del proveedor.'
    },
    'pesoEvaluacion_Tiempo': {
        'valor_defecto': '20',
        'tipo': 'ENTERO',
        'categoria': 'algoritmo',
        'descripcion': 'Porcentaje (%) que recae sobre la velocidad de entrega prometida en la cotización.'
    },
    'pesoEvaluacion_Nivel': {
        'valor_defecto': '20',
        'tipo': 'ENTERO',
        'categoria': 'algoritmo',
        'descripcion': 'Peso porcentual (%) otorgado a la categoría económica o nivel comercial del proveedor.'
    },
    'pesoEvaluacion_Economico': {
        'valor_defecto': '20',
        'tipo': 'ENTERO',
        'categoria': 'algoritmo',
        'descripcion': 'Peso porcentual (%) otorgado al precio total ofrecido.'
    },
    'pesoEvaluacion_Envio': {
        'valor_defecto': '20',
        'tipo': 'ENTERO',
        'categoria': 'algoritmo',
        'descripcion': 'Peso porcentual (%) otorgado a la categoría de envío ofrecida por los proveedores.'
    },
    'criterioObligatorio_Envio': {
        'valor_defecto': 'False',
        'tipo': 'BOOLEANO',
        'categoria': 'algoritmo',
        'descripcion': 'Requisito excluyente: descarta cotizaciones que no incluyan servicio de despacho.'
    },
    'modoDisparadorAbastecimiento': {
        'valor_defecto': 'HIBRIDO',
        'tipo': 'TEXTO',
        'categoria': 'algoritmo',
        'descripcion': 'Modo de disparo del algoritmo de reposición (HIBRIDO, TRANSACCIONAL, PROGRAMADO).'
    },
    'estrategiaLoteReposicion': {
        'valor_defecto': 'BRECHA_MINIMO',
        'tipo': 'TEXTO',
        'categoria': 'algoritmo',
        'descripcion': 'Estrategia de cálculo de lote (BRECHA_MINIMO, DOBLE_MINIMO, STOCK_MINIMO_FIJO).'
    },
    'esperaUrgenciaTecnicaHoras': {
        'valor_defecto': '0',
        'tipo': 'ENTERO',
        'categoria': 'algoritmo',
        'descripcion': 'Horas de espera para consolidar solicitudes técnicas urgentes del taller.'
    },
    'toleranciaHorasIncumplimientoUrgente': {
        'valor_defecto': '24',
        'tipo': 'ENTERO',
        'categoria': 'algoritmo',
        'descripcion': 'Tolerancia en horas de demora antes de penalizar incumplimiento de pedidos urgentes.'
    },
    'diasToleranciaIncumplimientoProveedor': {
        'valor_defecto': '3',
        'tipo': 'ENTERO',
        'categoria': 'algoritmo',
        'descripcion': 'Días de gracia ante demoras antes de penalizar la confiabilidad del proveedor.'
    },

    # 🔍 Auditoría (Logs Master Switch)
    'log_seguridad_accesos': {
        'valor_defecto': 'True',
        'tipo': 'BOOLEANO',
        'categoria': 'auditoria',
        'descripcion': 'Registra inicios de sesión fallidos, bloqueos de cuenta y recuperaciones de clave.'
    },
    'log_caja_anulaciones': {
        'valor_defecto': 'True',
        'tipo': 'BOOLEANO',
        'categoria': 'auditoria',
        'descripcion': 'Registra anulaciones de cobros o reversión de pagos en caja frente a fraudes.'
    },
    'log_stock_ajustes_manuales': {
        'valor_defecto': 'True',
        'tipo': 'BOOLEANO',
        'categoria': 'auditoria',
        'descripcion': 'Registra alteraciones manuales directas de inventario que no provienen de venta/taller.'
    },
    'log_roles_permisos': {
        'valor_defecto': 'True',
        'tipo': 'BOOLEANO',
        'categoria': 'auditoria',
        'descripcion': 'Registra cuando un Administrador altera privilegios de sistema a otro usuario.'
    },
    'log_operaciones_lectura': {
        'valor_defecto': 'False',
        'tipo': 'BOOLEANO',
        'categoria': 'auditoria',
        'descripcion': 'Determina si el sistema registra consultas y visualizaciones pasivas en auditoría.'
    },

    # 🎁 Fidelización (Motor de Beneficios)
    'motorBeneficiosActivo': {
        'valor_defecto': 'True',
        'tipo': 'BOOLEANO',
        'categoria': 'fidelizacion',
        'descripcion': 'Interruptor maestro. Apaga por completo la generación automática de beneficios.'
    },
    'limitePromocionesMensual': {
        'valor_defecto': '15',
        'tipo': 'ENTERO',
        'categoria': 'fidelizacion',
        'descripcion': 'Tope máximo global de beneficios que el algoritmo puede emitir por mes calendario.'
    },
    'porcentajeDescuentoMaximo': {
        'valor_defecto': '5.0',
        'tipo': 'DECIMAL',
        'categoria': 'fidelizacion',
        'descripcion': 'Impide que el algoritmo ofrezca un descuento mayor a este porcentaje.'
    },
    'periodoRefrigerioCliente': {
        'valor_defecto': '7',
        'tipo': 'ENTERO',
        'categoria': 'fidelizacion',
        'descripcion': 'Días de enfriamiento mínimo antes de que un mismo cliente reciba una nueva promoción.'
    },
    'vigenciaBeneficioDefecto': {
        'valor_defecto': '72.0',
        'tipo': 'DECIMAL',
        'categoria': 'fidelizacion',
        'descripcion': 'Tiempo base en horas que durará el beneficio comercial antes de caducar.'
    },

    # 🔧 Taller y Servicio Técnico
    'costo_diagnostico_base': {
        'valor_defecto': '5000.0',
        'tipo': 'DECIMAL',
        'categoria': 'taller',
        'descripcion': 'Costo monetario base de diagnóstico cobrado por única vez al iniciar una orden.'
    },
    'costoManoDeObra': {
        'valor_defecto': '30000.0',
        'tipo': 'DECIMAL',
        'categoria': 'taller',
        'descripcion': 'Costo base predeterminado de mano de obra técnica para diagnósticos y presupuestos.'
    },
    'permitirCostoManoDeObraPropio': {
        'valor_defecto': 'False',
        'tipo': 'BOOLEANO',
        'categoria': 'taller',
        'descripcion': 'Autoriza o prohíbe que el técnico modifique manualmente el valor de mano de obra.'
    },
    'autoAsignacionTecnicosActiva': {
        'valor_defecto': 'True',
        'tipo': 'BOOLEANO',
        'categoria': 'taller',
        'descripcion': 'Activa la asignación automática inteligente de técnicos a órdenes de trabajo.'
    },
    'pesoAsignacion_CargaLaboral': {
        'valor_defecto': '30',
        'tipo': 'ENTERO',
        'categoria': 'taller',
        'descripcion': 'Peso porcentual (%) del balanceo de carga de órdenes activas de los técnicos.'
    },
    'pesoAsignacion_Calificacion': {
        'valor_defecto': '25',
        'tipo': 'ENTERO',
        'categoria': 'taller',
        'descripcion': 'Peso porcentual (%) del promedio de satisfacción y estrellas de los técnicos.'
    },
    'pesoAsignacion_Rapidez': {
        'valor_defecto': '20',
        'tipo': 'ENTERO',
        'categoria': 'taller',
        'descripcion': 'Peso porcentual (%) de la velocidad media histórica de resolución.'
    },
    'pesoAsignacion_Especialidad': {
        'valor_defecto': '15',
        'tipo': 'ENTERO',
        'categoria': 'taller',
        'descripcion': 'Peso porcentual (%) de la coincidencia con la categoría de especialidad técnica.'
    },
    'pesoAsignacion_Efectividad': {
        'valor_defecto': '10',
        'tipo': 'ENTERO',
        'categoria': 'taller',
        'descripcion': 'Peso porcentual (%) de la tasa de reparaciones exitosas sin reingresos.'
    },
    'diasGarantiaReparacion': {
        'valor_defecto': '90',
        'tipo': 'ENTERO',
        'categoria': 'taller',
        'descripcion': 'Plazo formal de garantía técnica en días posteriores a la entrega del dispositivo.'
    },
    'diasLimiteRetiroEquipo': {
        'valor_defecto': '60',
        'tipo': 'ENTERO',
        'categoria': 'taller',
        'descripcion': 'Días límite de guarda tras finalizar la reparación antes de aplicar costos o rezago.'
    }
}


