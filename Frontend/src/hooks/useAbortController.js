import { useRef, useEffect, useCallback } from 'react';

/**
 * Hook reutilizable para gestionar `AbortController` en peticiones HTTP (Auditoría F8).
 * Cancela automáticamente la petición anterior si se dispara una nueva consulta
 * y aborta cualquier petición activa cuando el componente se desmonta.
 */
export function useAbortController() {
  const controllerRef = useRef(null);

  const crearSignal = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const nuevoController = new AbortController();
    controllerRef.current = nuevoController;
    return nuevoController.signal;
  }, []);

  const abortar = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  return { crearSignal, abortar };
}

export default useAbortController;

