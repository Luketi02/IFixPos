/**
 * Utilidades centralizadas para la clasificación, normalización y filtrado
 * de Medios de Pago provenientes de la base de datos (`GET /api/sales/medios-pago/`).
 *
 * Permite que cualquier pantalla del cliente (Carrito, Diagnóstico Inicial,
 * Confirmación de Presupuesto de Reparación) interprete los medios de pago activos
 * de forma 100% dinámica y determine qué modal de pago abrir al seleccionarlos.
 */

export const TIPOS_MODAL_PAGO = Object.freeze({
  MERCADOPAGO: 'MERCADOPAGO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  TARJETA: 'TARJETA',
  EFECTIVO: 'EFECTIVO',
  OTRO: 'OTRO'
});

/**
 * Normaliza un texto removiendo tildes y pasándolo a mayúsculas para comparación segura.
 * @param {string} texto
 * @returns {string}
 */
export function normalizarTextoMedioPago(texto = '') {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Clasifica un objeto `MedioPago` de la base de datos (o un código/nombre en texto)
 * en uno de los tipos canónicos de pasarela/modal (`TIPOS_MODAL_PAGO`).
 *
 * @param {Object|string} medio - Objeto `{ id_mediopago, codigo, nombre_medio_pago, recargo, estado }` o string.
 * @returns {{
 *   tipoModal: string,
 *   codigoNormalizado: string,
 *   nombreMostrar: string,
 *   descripcionCorta: string,
 *   etiquetaBadge: string,
 *   permiteEnvioDomicilio: boolean,
 *   esPasarelaOnline: boolean,
 *   recargoPorcentaje: number
 * }}
 */
export function clasificarMedioPago(medio) {
  const esObjeto = medio !== null && typeof medio === 'object';
  const codigoRaw = esObjeto ? medio.codigo || '' : String(medio || '');
  const nombreRaw = esObjeto
    ? medio.nombre_medio_pago || medio.nombre || medio.codigo || ''
    : String(medio || '');
  const recargoNum = esObjeto ? Number(medio.recargo || 0) : 0;

  const codigoNorm = normalizarTextoMedioPago(codigoRaw);
  const nombreNorm = normalizarTextoMedioPago(nombreRaw);
  const combinado = `${codigoNorm} ${nombreNorm}`;

  // 1. Mercado Pago / Billetera Virtual / QR
  if (
    codigoNorm === 'MP' ||
    codigoNorm === 'MERCADO_PAGO' ||
    combinado.includes('MERCADO PAGO') ||
    combinado.includes('MERCADOPAGO') ||
    combinado.includes('QR')
  ) {
    return {
      tipoModal: TIPOS_MODAL_PAGO.MERCADOPAGO,
      codigoNormalizado: 'MP',
      nombreMostrar: nombreRaw || 'Mercado Pago',
      descripcionCorta: 'Acreditación instantánea vía código QR o redirección web segura',
      etiquetaBadge: 'Online / QR',
      permiteEnvioDomicilio: true,
      esPasarelaOnline: true,
      recargoPorcentaje: Number.isFinite(recargoNum) ? recargoNum : 0
    };
  }

  // 2. Transferencia Bancaria / CBU / Alias
  if (
    codigoNorm === 'TRANSFERENCIA' ||
    combinado.includes('TRANSFERENCIA') ||
    combinado.includes('BANCARIA') ||
    combinado.includes('CBU') ||
    combinado.includes('ALIAS')
  ) {
    return {
      tipoModal: TIPOS_MODAL_PAGO.TRANSFERENCIA,
      codigoNormalizado: 'TRANSFERENCIA',
      nombreMostrar: nombreRaw || 'Transferencia Bancaria',
      descripcionCorta: 'Transferencia inmediata por CBU / CVU o Alias bancario',
      etiquetaBadge: 'CBU / Alias',
      permiteEnvioDomicilio: true,
      esPasarelaOnline: true,
      recargoPorcentaje: Number.isFinite(recargoNum) ? recargoNum : 0
    };
  }

  // 3. Tarjeta de Crédito / Débito
  if (
    codigoNorm === 'TARJETA' ||
    combinado.includes('TARJETA') ||
    combinado.includes('DEBITO') ||
    combinado.includes('CREDITO')
  ) {
    return {
      tipoModal: TIPOS_MODAL_PAGO.TARJETA,
      codigoNormalizado: 'TARJETA',
      nombreMostrar: nombreRaw || 'Tarjeta de Débito / Crédito',
      descripcionCorta: 'Pago con tarjeta física o acreditación asistida',
      etiquetaBadge: 'Débito / Crédito',
      permiteEnvioDomicilio: true,
      esPasarelaOnline: false,
      recargoPorcentaje: Number.isFinite(recargoNum) ? recargoNum : 0
    };
  }

  // 4. Efectivo / Mostrador / Presencial
  if (
    codigoNorm === 'EFECTIVO' ||
    combinado.includes('EFECTIVO') ||
    combinado.includes('PRESENCIAL') ||
    combinado.includes('MOSTRADOR') ||
    combinado.includes('CONTADO')
  ) {
    return {
      tipoModal: TIPOS_MODAL_PAGO.EFECTIVO,
      codigoNormalizado: 'EFECTIVO',
      nombreMostrar: nombreRaw || 'Efectivo en Sucursal',
      descripcionCorta: 'Aboná presencialmente en la caja del taller o tienda',
      etiquetaBadge: 'En Sucursal',
      permiteEnvioDomicilio: false,
      esPasarelaOnline: false,
      recargoPorcentaje: Number.isFinite(recargoNum) ? recargoNum : 0
    };
  }

  // 5. Otro medio de pago configurado en base de datos
  return {
    tipoModal: TIPOS_MODAL_PAGO.OTRO,
    codigoNormalizado: codigoNorm || 'OTRO',
    nombreMostrar: nombreRaw || 'Medio de Pago',
    descripcionCorta: 'Medio de pago habilitado por la sucursal',
    etiquetaBadge: 'Habilitado',
    permiteEnvioDomicilio: true,
    esPasarelaOnline: false,
    recargoPorcentaje: Number.isFinite(recargoNum) ? recargoNum : 0
  };
}

/**
 * Filtra y enriquece la lista cruda de `GET /api/sales/medios-pago/`
 * conservando únicamente los medios de pago activos (`estado === true`)
 * y evaluando su disponibilidad según el método de entrega (`RETIRO` vs `ENVIO`).
 *
 * @param {Array} listaCruda - Respuesta del endpoint `/api/sales/medios-pago/`.
 * @param {Object} opciones
 * @param {string} [opciones.metodoEntrega='RETIRO'] - `'RETIRO'` | `'ENVIO'` | `'PRESENCIAL'`
 * @returns {Array} Lista de medios de pago enriquecidos con metadatos de UI y modal.
 */
export function procesarMediosPagoActivos(listaCruda = [], { metodoEntrega = 'RETIRO' } = {}) {
  if (!Array.isArray(listaCruda)) return [];

  const entregaNorm = normalizarTextoMedioPago(metodoEntrega || 'RETIRO');
  const esEnvioDomicilio = entregaNorm === 'ENVIO';

  return listaCruda
    .filter((item) => item && Boolean(item.estado))
    .map((item) => {
      const clasificacion = clasificarMedioPago(item);
      const deshabilitadoPorEnvio = esEnvioDomicilio && !clasificacion.permiteEnvioDomicilio;

      return {
        ...item,
        id_mediopago: item.id_mediopago,
        codigo: item.codigo || clasificacion.codigoNormalizado,
        nombre_medio_pago: item.nombre_medio_pago || item.nombre || clasificacion.nombreMostrar,
        recargo: Number(item.recargo || 0),
        estado: Boolean(item.estado),
        ...clasificacion,
        deshabilitado: deshabilitadoPorEnvio,
        motivoDeshabilitado: deshabilitadoPorEnvio
          ? 'No disponible para envíos a domicilio (exclusivo para retiro o atención en sucursal).'
          : null
      };
    });
}

