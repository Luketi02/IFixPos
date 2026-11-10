/**
 * Módulo centralizado de configuración de seguridad del Frontend (Fase 1 - F1 y F2).
 * - Gestiona la clave pública del sitio para Google reCAPTCHA v2 sin respaldos de prueba en producción.
 * - Define la bandera de entorno para simulación de pagos en desarrollo local.
 */

const RECAPTCHA_TEST_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';

export const PERMITIR_SIMULACION_PAGOS = Boolean(
  import.meta.env.DEV || String(import.meta.env.VITE_PERMITIR_SIMULACION || '').toLowerCase() === 'true'
);

export const obtenerRecaptchaSiteKey = () => {
  const claveConfigurada = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (claveConfigurada && String(claveConfigurada).trim() !== '') {
    return String(claveConfigurada).trim();
  }
  // Solo en desarrollo local se permite la clave pública de prueba de Google
  if (import.meta.env.DEV) {
    return RECAPTCHA_TEST_KEY;
  }
  return '';
};
