import { useEffect, useRef } from 'react';

/**
 * Hook de sondeo periódico (polling) consciente de la visibilidad de la pestaña (Fase 2 - F8).
 * - Pausa automáticamente las ejecuciones cuando `document.visibilityState === 'hidden'`,
 *   evitando tráfico de red y consumo de batería innecesarios en pestañas en segundo plano.
 * - Al volver la pestaña a estado `'visible'`, sincroniza inmediatamente si `sincronizarAlVolver` es true.
 *
 * @param {Function} callback - Función a ejecutar en cada ciclo.
 * @param {number|null} intervaloMs - Intervalo en milisegundos (o `null`/`false` para desactivar).
 * @param {Object} opciones
 * @param {boolean} [opciones.ejecutarAlMontar=false] - Si debe ejecutarse inmediatamente al activarse.
 * @param {boolean} [opciones.sincronizarAlVolver=true] - Si debe ejecutarse al volver la pestaña a ser visible.
 */
export function useIntervaloVisible(
  callback,
  intervaloMs,
  { ejecutarAlMontar = false, sincronizarAlVolver = true } = {}
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!intervaloMs || intervaloMs <= 0) return undefined;

    const estaVisible = () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden';

    const ejecutarSiVisible = () => {
      if (estaVisible() && callbackRef.current) {
        callbackRef.current();
      }
    };

    if (ejecutarAlMontar) {
      ejecutarSiVisible();
    }

    const timerId = setInterval(ejecutarSiVisible, intervaloMs);

    const handleVisibilityChange = () => {
      if (sincronizarAlVolver && estaVisible() && callbackRef.current) {
        callbackRef.current();
      }
    };

    if (typeof document !== 'undefined' && sincronizarAlVolver) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(timerId);
      if (typeof document !== 'undefined' && sincronizarAlVolver) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [intervaloMs, ejecutarAlMontar, sincronizarAlVolver]);
}

export default useIntervaloVisible;

