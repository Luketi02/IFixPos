import axios from 'axios';

/**
 * Manejo global de sesión expirada.
 * - Interceptor de axios: detecta respuestas de token inválido/expirado enviadas por el backend.
 * - Utilidades para leer la expiración (`exp`) del JWT en el cliente.
 * Cualquier pantalla que use `axios` queda cubierta sin tocar su código.
 */

export const EVENTO_SESION_EXPIRADA = 'ifixpos:sesion-expirada';

// Mensajes del backend que indican que el token/sesión ya no es válido
const PATRON_TOKEN_INVALIDO =
  /token de autenticaci|token.*(expir|inv[aá]lid)|usuario no encontrado o cuenta inactiva|credenciales de autenticaci/i;

let interceptorInstalado = false;
let yaNotificada = false;

/** Emite (una sola vez por sesión caducada) el evento que abre el modal. */
export const notificarSesionExpirada = () => {
  if (yaNotificada) return;
  yaNotificada = true;
  window.dispatchEvent(new CustomEvent(EVENTO_SESION_EXPIRADA));
};

/** Permite volver a notificar luego de cerrar el modal. */
export const reiniciarNotificacionSesion = () => {
  yaNotificada = false;
};

/** Indica si un JWT ya venció según su claim `exp` (sin verificar firma). */
export const tokenEstaExpirado = (token) => {
  if (!token || typeof token !== 'string') return false;
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' && json.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
};

const extraerDetalle = (data) => {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.join(' ');
  return [data.detail, data.error, data.mensaje].filter((v) => typeof v === 'string').join(' ');
};

/** Registra el interceptor global (idempotente). */
export const instalarInterceptorSesion = () => {
  if (interceptorInstalado) return;
  interceptorInstalado = true;

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      const headers = error?.config?.headers;
      const enviabaToken = Boolean(headers?.get?.('Authorization') ?? headers?.Authorization);

      // DRF devuelve 403 (no 401) cuando el autenticador JWT no define cabecera WWW-Authenticate
      if (enviabaToken && (status === 401 || status === 403)) {
        if (PATRON_TOKEN_INVALIDO.test(extraerDetalle(error.response.data))) {
          notificarSesionExpirada();
        }
      }
      return Promise.reject(error);
    }
  );
};
