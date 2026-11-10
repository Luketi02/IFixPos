import axios from 'axios';
import {
  obtenerAccessToken,
  registrarInstanciaAxiosConInterceptores
} from '../utils/sesionExpirada';

/**
 * Configuración centralizada de comunicación HTTP con el Backend de IFixPos (Fase 2 - F4).
 * - Exporta `API_BASE_URL` en un único punto de verdad sin quemar `localhost` en producción.
 * - Exporta la instancia `http` de Axios preconfigurada con inyección automática de JWT
 *   (`Authorization: Bearer <access_token>`) y renovación transparente de sesión.
 */
const urlEntorno = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

export const API_BASE_URL =
  urlEntorno || (import.meta.env.DEV ? 'http://localhost:8000' : '');

/**
 * Construye una URL absoluta hacia el backend a partir de una ruta relativa.
 * @param {string} ruta - Ruta del endpoint (ej. '/api/catalog/productos/')
 * @returns {string}
 */
export const construirUrlApi = (ruta = '') => {
  if (!ruta) return API_BASE_URL;
  if (/^https?:\/\//i.test(ruta)) return ruta;
  const rutaNormalizada = ruta.startsWith('/') ? ruta : `/${ruta}`;
  return `${API_BASE_URL}${rutaNormalizada}`;
};

/**
 * Instancia única de Axios para llamadas al backend de IFixPos.
 * Inyecta automáticamente `Authorization: Bearer <token>` si hay sesión activa
 * y delega el manejo de 401/refresh al interceptor global de `sesionExpirada`.
 */
export const http = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    Accept: 'application/json'
  }
});

// Conecta la instancia `http` al sistema de inyección de JWT y refresco automático
registrarInstanciaAxiosConInterceptores(http);

export { obtenerAccessToken };
export default http;

