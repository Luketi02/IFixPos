/**
 * Constantes centralizadas de negocio, tiempos e identidad de dominio para el Frontend (Fase 3 - F5).
 * Evita literales mágicos dispersos en componentes y mantiene paridad con `core_app/constantes.py`.
 */

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  TECNICO: 'tecnico',
  CLIENTE: 'cliente'
});

export const ESTADOS_VENTA = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  PAGADA: 'PAGADA',
  PAGADO: 'PAGADO',
  CANCELADA: 'CANCELADA',
  EXPIRADA: 'EXPIRADA'
});

/**
 * Evalúa de forma segura si el estado de una venta u orden corresponde a un pago acreditado,
 * contemplando ambas variantes históricas ('PAGADA' y 'PAGADO').
 * @param {string|null|undefined} estado
 * @returns {boolean}
 */
export const ventaEstaPagada = (estado) => {
  if (!estado || typeof estado !== 'string') return false;
  const limpio = estado.trim().toUpperCase();
  return limpio === ESTADOS_VENTA.PAGADA || limpio === ESTADOS_VENTA.PAGADO;
};

/**
 * Duración estándar de auto-ocultamiento de alertas temporales (Regla Global 6: 6 segundos).
 */
export const DURACION_ALERTA_MS = 6000;

/**
 * Intervalos de sondeo (polling) y temporizadores expresados en milisegundos.
 */
export const INTERVALOS_MS = Object.freeze({
  NOTIFICACIONES: 35000,
  SESION_EXPIRADA: 15000,
  ORDEN_PENDIENTE: 15000,
  PAGO_ONLINE_QR: 4000,
  CUENTA_REGRESIVA: 1000
});

/**
 * Paleta oficial Cyber-Tech Dark Mode (Regla Global 6).
 */
export const COLORES_CYBER_TECH = Object.freeze({
  FONDO: '#0F172A',
  TARJETA: '#1E293B',
  ACENTO_CIAN: '#06B6D4',
  ACENTO_VIOLETA: '#8B5CF6'
});

