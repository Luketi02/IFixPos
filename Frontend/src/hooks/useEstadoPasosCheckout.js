import { useReducer, useCallback } from 'react';

/**
 * Hook con `useReducer` para consolidar el estado de pasos, alertas, carga y pasarela
 * en flujos multi-paso como Checkout y Taller (Fase 3 - F7).
 * Reduce la proliferación de `useState` individuales y evita re-renders intermedios.
 */
const ESTADO_INICIAL_FLUJO = {
  pasoActual: 1,
  enviando: false,
  mensajeError: '',
  advertencias: [],
  esperandoPagoMP: false,
  verificandoPagoMP: false,
  tiempoExpirado: false,
  cancelandoOrden: false,
  mostrarConfirmacionRetorno: false,
  descargandoFactura: false
};

function reductorFlujoCheckout(estado, accion) {
  switch (accion.type) {
    case 'IR_A_PASO':
      return { ...estado, pasoActual: accion.payload, mensajeError: '' };
    case 'INICIAR_ENVIO':
      return { ...estado, enviando: true, mensajeError: '' };
    case 'FINALIZAR_ENVIO':
      return { ...estado, enviando: false };
    case 'ESTABLECER_ERROR':
      return { ...estado, mensajeError: accion.payload || '', enviando: false };
    case 'LIMPIAR_ERROR':
      return { ...estado, mensajeError: '' };
    case 'ESTABLECER_ADVERTENCIAS':
      return {
        ...estado,
        advertencias: Array.isArray(accion.payload) ? accion.payload : []
      };
    case 'ACTUALIZAR_PARCIAL':
      return { ...estado, ...(accion.payload || {}) };
    case 'REINICIAR':
      return { ...ESTADO_INICIAL_FLUJO, ...(accion.payload || {}) };
    default:
      return estado;
  }
}

export function useEstadoPasosCheckout( overridesIniciales = {} ) {
  const [estado, dispatch] = useReducer(reductorFlujoCheckout, {
    ...ESTADO_INICIAL_FLUJO,
    ...overridesIniciales
  });

  const irAPaso = useCallback((paso) => dispatch({ type: 'IR_A_PASO', payload: paso }), []);
  const establecerError = useCallback(
    (mensaje) => dispatch({ type: 'ESTABLECER_ERROR', payload: mensaje }),
    []
  );
  const limpiarError = useCallback(() => dispatch({ type: 'LIMPIAR_ERROR' }), []);
  const establecerAdvertencias = useCallback(
    (lista) => dispatch({ type: 'ESTABLECER_ADVERTENCIAS', payload: lista }),
    []
  );
  const actualizarEstadoFlujo = useCallback(
    (parcial) => dispatch({ type: 'ACTUALIZAR_PARCIAL', payload: parcial }),
    []
  );
  const reiniciarFlujo = useCallback(
    (parcial = {}) => dispatch({ type: 'REINICIAR', payload: parcial }),
    []
  );

  return {
    estadoFlujo: estado,
    irAPaso,
    establecerError,
    limpiarError,
    establecerAdvertencias,
    actualizarEstadoFlujo,
    reiniciarFlujo
  };
}

export default useEstadoPasosCheckout;

