import axios from 'axios';

/**
 * Manejo global de sesión expirada y renovación transparente de tokens JWT.
 * - Interceptor de axios: detecta token vencido e intenta renovarlo con refresh_token.
 * - Si el token de refresco también expiró o es inválido, emite el evento de sesión expirada.
 * - Utilidades para evaluar la expiración (`exp`) del JWT en el cliente.
 */

export const EVENTO_SESION_EXPIRADA = 'ifixpos:sesion-expirada';
export const EVENTO_CUENTA_CAMBIADA = 'ifixpos:cuenta-cambiada';
export const CLAVE_ACCESS_TOKEN = 'access_token';
export const CLAVE_REFRESH_TOKEN = 'refresh_token';

/**
 * Obtiene el token de acceso unificado desde localStorage ('access_token'),
 * migrando transparentemente la clave heredada 'token' si existiera (Fase 1 - F3).
 */
export const obtenerAccessToken = () => {
  let access = localStorage.getItem(CLAVE_ACCESS_TOKEN);
  if (!access) {
    const heredado = localStorage.getItem('token');
    if (heredado) {
      access = heredado;
      localStorage.setItem(CLAVE_ACCESS_TOKEN, heredado);
      localStorage.removeItem('token');
    }
  }
  return access || null;
};

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')
).replace(/\/+$/, '');

// Mensajes del backend que indican que el token/sesión ya no es válido
const PATRON_TOKEN_INVALIDO =
  /token.*(expir|inv[aá]lid|not valid|no es v[aá]lido)|usuario no encontrado o cuenta inactiva|credenciales de autenticaci/i;

// Rutas de autenticación donde no debe inyectarse ni reintentarse automáticamente el JWT previo
const PATRON_RUTA_AUTH_PUBLICA =
  /\/api\/auth\/(login|registro|register|token\/refresh|recuperar|verificar-otp|google)/i;

const instanciasRegistradas = new WeakSet();
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

  if (procesoRefrescoEnCurso) {
    return procesoRefrescoEnCurso;
  }

  procesoRefrescoEnCurso = (async () => {
    try {
      const payload = refreshToken ? { refresh: refreshToken } : {};
      const response = await axios.post(
        `${API_BASE_URL}/api/auth/token/refresh/`,
        payload,
        { withCredentials: true }
      );

      const nuevosTokens = response.data?.tokens;
      if (nuevosTokens?.access) {
        localStorage.setItem('access_token', nuevosTokens.access);
        localStorage.removeItem('token');
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

/**
 * Registra los interceptores de solicitud (inyección automática de Bearer token)
 * y de respuesta (renovación transparente con refresh_token ante 401/403) en una instancia de Axios.
 */
export const registrarInstanciaAxiosConInterceptores = (instanciaAxios = axios) => {
  if (!instanciaAxios || instanciasRegistradas.has(instanciaAxios)) return;
  instanciasRegistradas.add(instanciaAxios);

  // Interceptor de solicitud: inyecta Authorization: Bearer <access_token> si no fue provisto
  instanciaAxios.interceptors.request.use(
    (config) => {
      const url = String(config?.url || '');
      const esPeticionBackend =
        url.startsWith('/api/') ||
        (API_BASE_URL && url.startsWith(API_BASE_URL)) ||
        (! /^https?:\/\//i.test(url) && Boolean(config?.baseURL || API_BASE_URL));

      if (esPeticionBackend && !PATRON_RUTA_AUTH_PUBLICA.test(url)) {
        const yaTieneAuth = Boolean(
          config.headers?.get?.('Authorization') ?? config.headers?.Authorization
        );
        if (!yaTieneAuth) {
          const token = obtenerAccessToken();
          if (token) {
            if (config.headers?.set) {
              config.headers.set('Authorization', `Bearer ${token}`);
            } else {
              config.headers = {
                ...(config.headers || {}),
                Authorization: `Bearer ${token}`
              };
            }
          }
        }
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Interceptor de respuesta: detecta token vencido e intenta renovarlo con refresh_token
  instanciaAxios.interceptors.response.use(
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
              return instanciaAxios(originalRequest);
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

/** Registra el interceptor global (idempotente). */
export const instalarInterceptorSesion = () => {
  if (interceptorInstalado) return;
  interceptorInstalado = true;
  registrarInstanciaAxiosConInterceptores(axios);
};
