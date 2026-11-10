import { useState, useEffect, useCallback } from 'react';
import { DURACION_ALERTA_MS } from '../config/constantes';

/**
 * Mapa de códigos de error normalizados del backend (`core_app/exceptions.py`)
 * hacia mensajes amigables en español para el usuario final.
 */
const MENSAJES_POR_CODIGO = Object.freeze({
  throttled: 'Has realizado demasiadas solicitudes seguidas. Por favor aguarda unos segundos e intenta nuevamente.',
  not_authenticated: 'Tu sesión no está activa. Por favor inicia sesión para continuar.',
  authentication_failed: 'No pudimos validar tus credenciales de acceso.',
  permission_denied: 'No cuentas con los permisos necesarios para realizar esta operación.',
  not_found: 'El recurso solicitado no se encuentra disponible.'
});

/**
 * Extrae un mensaje legible en español a partir de cualquier error de Axios / DRF,
 * soportando el contrato estructurado `{ error, codigo, campos }` de IFixPos (Fase 3 - F.4.2).
 *
 * @param {any} err - Error capturado en bloque `catch`.
 * @param {string} [porDefecto='Ocurrió un inconveniente al procesar la solicitud.'] - Mensaje de respaldo.
 * @returns {string}
 */
export const extraerMensajeError = (
  err,
  porDefecto = 'Ocurrió un inconveniente al procesar la solicitud.'
) => {
  const data = err?.response?.data;
  if (!data) {
    return err?.message && !/Request failed with status code/i.test(err.message)
      ? err.message
      : porDefecto;
  }

  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(String).join(' ');

  if (typeof data === 'object') {
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
    }
    if (typeof data.detail === 'string' && data.detail.trim()) {
      return data.detail.trim();
    }
    if (typeof data.mensaje === 'string' && data.mensaje.trim()) {
      return data.mensaje.trim();
    }
    if (data.campos && typeof data.campos === 'object') {
      const partesCampos = Object.entries(data.campos)
        .map(([campo, val]) => {
          const texto = Array.isArray(val) ? val.join(' ') : String(val);
          return campo !== 'non_field_errors' && campo !== 'detail' ? `${campo}: ${texto}` : texto;
        })
        .filter(Boolean);
      if (partesCampos.length > 0) return partesCampos.join(' | ');
    }
    if (typeof data.codigo === 'string' && MENSAJES_POR_CODIGO[data.codigo]) {
      return MENSAJES_POR_CODIGO[data.codigo];
    }

    const valores = Object.entries(data)
      .filter(([k]) => !['codigo', 'status_code'].includes(k))
      .map(([k, v]) => {
        if (v === null || v === undefined) return '';
        const txt = Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return k !== 'non_field_errors' && k !== 'error' ? `${k}: ${txt}` : txt;
      })
      .filter(Boolean);

    if (valores.length > 0) return valores.join(' | ');
  }

  return porDefecto;
};

/**
 * Extrae las advertencias no bloqueantes (`advertencias: string[]`) devueltas por el backend
 * tras completar una operación (ej. demora en envío de correo de comprobante - Fase 3 F.4.3).
 *
 * @param {any} data - Objeto `res.data` devuelto por el backend.
 * @returns {string[]}
 */
export const extraerAdvertenciasRespuesta = (data) => {
  if (!data || typeof data !== 'object') return [];
  const directas = Array.isArray(data.advertencias) ? data.advertencias : [];
  const anidadas = Array.isArray(data.venta?.advertencias) ? data.venta.advertencias : [];
  return [...directas, ...anidadas].filter((a) => typeof a === 'string' && a.trim().length > 0);
};

/**
 * Hook reutilizable para manejar mensajes de alerta o confirmación con auto-ocultamiento suave
 * a los 6 segundos por defecto, cumpliendo la Regla Global 6 (Fase 3 - F5).
 *
 * @param {number} [duracionMs=DURACION_ALERTA_MS]
 * @returns {[string, Function, Function]} `[mensaje, mostrarMensaje, limpiarMensaje]`
 */
export function useMensajeTemporal(duracionMs = DURACION_ALERTA_MS) {
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    if (!mensaje) return undefined;
    const timer = setTimeout(() => {
      setMensaje('');
    }, duracionMs);
    return () => clearTimeout(timer);
  }, [mensaje, duracionMs]);

  const limpiarMensaje = useCallback(() => {
    setMensaje('');
  }, []);

  return [mensaje, setMensaje, limpiarMensaje];
}

export default extraerMensajeError;

