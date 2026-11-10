import axios from 'axios';
import { construirUrlApi } from '../config/api';

/**
 * Caché ligera en memoria y deduplicación de peticiones en vuelo para catálogos
 * estáticos o semi-estáticos del Frontend (Fase 2 - F8).
 * - Evita re-descargar catálogos (`/api/catalog/categorias/activas/`, `/api/sales/medios-pago/`,
 *   `/api/workshop/categorias-reparacion/`, etc.) cada vez que se monta una vista o modal.
 * - Deduplica llamadas concurrentes a la misma clave mientras la promesa está en vuelo.
 * - Soporta `AbortSignal` para cancelar la espera del consumidor si el componente se desmonta.
 */

const TTL_POR_DEFECTO_MS = 60 * 1000; // 60 segundos
const almacenamientoCache = new Map();
const promesasEnVuelo = new Map();

/**
 * Obtiene un recurso desde la caché en memoria o lo solicita al backend si expiró.
 *
 * @param {string} clave - Identificador único de caché (ej. 'catalog:categorias-activas').
 * @param {string} url - Ruta relativa o absoluta del endpoint.
 * @param {Object} opciones
 * @param {number} [opciones.ttlMs=60000] - Tiempo de vida en milisegundos.
 * @param {AbortSignal} [opciones.signal] - Señal opcional de AbortController.
 * @param {Object} [opciones.headers] - Cabeceras HTTP adicionales.
 * @param {Object} [opciones.params] - Parámetros de query opcionales.
 * @param {boolean} [opciones.forzarRecarga=false] - Ignora la caché existente y refresca.
 * @returns {Promise<any>} Datos (`res.data`) devueltos por el endpoint.
 */
export async function obtenerCatalogoCacheado(
  clave,
  url,
  {
    ttlMs = TTL_POR_DEFECTO_MS,
    signal,
    headers,
    params,
    forzarRecarga = false
  } = {}
) {
  if (signal?.aborted) {
    const abortErr = new Error('Petición cancelada antes de iniciar');
    abortErr.name = 'CanceledError';
    throw abortErr;
  }

  const ahora = Date.now();

  if (!forzarRecarga && almacenamientoCache.has(clave)) {
    const entrada = almacenamientoCache.get(clave);
    if (entrada && entrada.expiraEn > ahora) {
      return entrada.datos;
    }
    almacenamientoCache.delete(clave);
  }

  let promesaCompartida = !forzarRecarga ? promesasEnVuelo.get(clave) : null;

  if (!promesaCompartida) {
    const urlFinal = construirUrlApi(url);
    promesaCompartida = axios
      .get(urlFinal, { headers, params })
      .then((res) => {
        almacenamientoCache.set(clave, {
          datos: res.data,
          expiraEn: Date.now() + ttlMs
        });
        return res.data;
      })
      .finally(() => {
        promesasEnVuelo.delete(clave);
      });

    promesasEnVuelo.set(clave, promesaCompartida);
  }

  if (!signal) {
    return promesaCompartida;
  }

  // Si el componente consumidor pasa un AbortSignal, permitimos desuscribirse sin abortar a otros consumidores
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const abortErr = new Error('Petición cancelada por desmontaje');
      abortErr.name = 'CanceledError';
      reject(abortErr);
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });

    promesaCompartida
      .then((datos) => {
        signal.removeEventListener('abort', onAbort);
        resolve(datos);
      })
      .catch((err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });
  });
}

/**
 * Invalida entradas de la caché de catálogos.
 * @param {string} [prefijo] - Si se indica, elimina solo las claves que comiencen con ese prefijo; si se omite, limpia toda la caché.
 */
export function invalidarCacheCatalogos(prefijo = '') {
  if (!prefijo) {
    almacenamientoCache.clear();
    promesasEnVuelo.clear();
    return;
  }
  for (const clave of almacenamientoCache.keys()) {
    if (clave.startsWith(prefijo)) {
      almacenamientoCache.delete(clave);
    }
  }
}

/**
 * Indica si un error de Axios o Fetch corresponde a una cancelación intencional (`AbortController`).
 */
export function esErrorCancelacion(error) {
  return Boolean(
    error &&
      (axios.isCancel?.(error) ||
        error.name === 'CanceledError' ||
        error.name === 'AbortError' ||
        error.code === 'ERR_CANCELED')
  );
}

