import axios from 'axios';

/**
 * Manejo global de sesión expirada y renovación transparente de tokens JWT.
 * - Interceptor de axios: detecta token vencido e intenta renovarlo con refresh_token.
 * - Si el token de refresco también expiró o es inválido, emite el evento de sesión expirada.
 * - Utilidades para evaluar la expiración (`exp`) del JWT en el cliente.
 */

export const EVENTO_SESION_EXPIRADA = 'ifixpos:sesion-expirada';
export const EVENTO_CUENTA_CAMBIADA = 'ifixpos:cuenta-cambiada';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Mensajes del backend que indican que el token/sesión ya no es válido
const PATRON_TOKEN_INVALIDO =
  /token.*(expir|inv[aá]lid|not valid|no es v[aá]lido)|usuario no encontrado o cuenta inactiva|credenciales de autenticaci/i;

let interceptorInstalado = false;
let yaNotificada = false;
let procesoRefrescoEnCurso = null;

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
  return [data.detail, data.error, data.mensaje, data.code].filter((v) => typeof v === 'string').join(' ');
};

/**
 * Intenta renovar el access_token mediante el endpoint backend /api/auth/token/refresh/.
 * Devuelve una promesa compartida si hay múltiples peticiones simultáneas (evita tormentas de refresh).
 */
export const renovarTokenSesion = async () => {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    throw new Error('No hay token de refresco disponible');
  }

  if (procesoRefrescoEnCurso) {
    return procesoRefrescoEnCurso;
  }

  procesoRefrescoEnCurso = (async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, {
        refresh: refreshToken
      });

      const nuevosTokens = response.data?.tokens;
      if (nuevosTokens?.access) {
        localStorage.setItem('access_token', nuevosTokens.access);
        localStorage.setItem('token', nuevosTokens.access);
        if (nuevosTokens.refresh) {
          localStorage.setItem('refresh_token', nuevosTokens.refresh);
        }
        return nuevosTokens.access;
      }
      throw new Error('Respuesta de refresco incompleta');
    } finally {
      procesoRefrescoEnCurso = null;
    }
  })();

  return procesoRefrescoEnCurso;
};

/** Registra el interceptor global (idempotente). */
export const instalarInterceptorSesion = () => {
  if (interceptorInstalado) return;
  interceptorInstalado = true;

  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      const status = error?.response?.status;
      const headers = originalRequest?.headers;
      const enviabaToken = Boolean(headers?.get?.('Authorization') ?? headers?.Authorization);
      const url = originalRequest?.url || '';

      // Si es una petición de autenticación o refresco que falló, no reintentamos
      const esRutaAuth = url.includes('/api/auth/token/refresh/') || url.includes('/api/auth/login/');

      if (enviabaToken && (status === 401 || status === 403)) {
        const detalle = extraerDetalle(error?.response?.data);
        const esErrorToken = PATRON_TOKEN_INVALIDO.test(detalle) || status === 401;

        if (esErrorToken && !originalRequest._retry && !esRutaAuth) {
          originalRequest._retry = true;
          try {
            const nuevoAccess = await renovarTokenSesion();
            if (nuevoAccess) {
              if (originalRequest.headers.set) {
                originalRequest.headers.set('Authorization', `Bearer ${nuevoAccess}`);
              } else {
                originalRequest.headers['Authorization'] = `Bearer ${nuevoAccess}`;
              }
              return axios(originalRequest);
            }
          } catch (refreshErr) {
            notificarSesionExpirada();
            return Promise.reject(refreshErr);
          }
        } else if (esRutaAuth && url.includes('/token/refresh/')) {
          notificarSesionExpirada();
        } else if (esErrorToken && originalRequest._retry) {
          notificarSesionExpirada();
        }
      }

      return Promise.reject(error);
    }
  );
};
