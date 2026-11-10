import { useEffect, useRef } from 'react';

const SELECTOR_ENFOCABLES = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * Hook de accesibilidad para diálogos modales (Auditoría F.4.5):
 * - Soporta invocación posicional `useAccesibilidadModal(abierto, onCerrar, bloqueado)`
 *   o por objeto `useAccesibilidadModal({ abierto, onCerrar, contenedorRef, bloqueado })`.
 * - Cierra el modal al presionar la tecla `Escape` (salvo que `bloqueado` sea true).
 * - Atrapa el foco (`Tab` / `Shift+Tab`) dentro del contenedor del modal.
 * - Retorna `{ contenedorRef }` para asignarlo al elemento raíz del diálogo (`ref={contenedorRef}`).
 */
export function useAccesibilidadModal(arg1, arg2, arg3 = false) {
  const refInterno = useRef(null);

  const esObjeto = arg1 !== null && typeof arg1 === 'object' && !Array.isArray(arg1);
  const abierto = esObjeto ? Boolean(arg1.abierto ?? arg1.isOpen) : Boolean(arg1);
  const onCerrar = esObjeto ? (arg1.onCerrar ?? arg1.onClose) : arg2;
  const bloqueado = esObjeto ? Boolean(arg1.bloqueado) : Boolean(arg3);
  const contenedorRef = esObjeto && arg1.contenedorRef ? arg1.contenedorRef : refInterno;

  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;

  useEffect(() => {
    if (!abierto) return undefined;

    const elementoPrevio = document.activeElement;

    const manejarKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (!bloqueado && typeof onCerrarRef.current === 'function') {
          e.stopPropagation();
          onCerrarRef.current();
        }
        return;
      }

      if (e.key === 'Tab' && contenedorRef?.current) {
        const nodos = Array.from(
          contenedorRef.current.querySelectorAll(SELECTOR_ENFOCABLES)
        ).filter((el) => el.offsetParent !== null);

        if (nodos.length === 0) return;

        const primero = nodos[0];
        const ultimo = nodos[nodos.length - 1];

        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    };

    window.addEventListener('keydown', manejarKeyDown);
    return () => {
      window.removeEventListener('keydown', manejarKeyDown);
      if (elementoPrevio && typeof elementoPrevio.focus === 'function') {
        try {
          elementoPrevio.focus();
        } catch {
          // Ignorar si el nodo previo ya fue desmontado
        }
      }
    };
  }, [abierto, contenedorRef, bloqueado]);

  return { contenedorRef };
}

export default useAccesibilidadModal;

