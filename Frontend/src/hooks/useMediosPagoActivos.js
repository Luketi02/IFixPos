import { useState, useEffect, useMemo, useCallback } from 'react';
import { obtenerCatalogoCacheado } from '../utils/cacheCatalogos';
import { procesarMediosPagoActivos, clasificarMedioPago } from '../utils/mediosPago';

/**
 * Hook reutilizable para obtener y gestionar los medios de pago activos desde la base de datos
 * (`GET /api/sales/medios-pago/`).
 *
 * - Filtra estrictamente aquellos con `estado === true` (sin opciones hardcodeadas de respaldo).
 * - Clasifica cada medio de pago (`MERCADOPAGO`, `TRANSFERENCIA`, `TARJETA`, `EFECTIVO`, `OTRO`)
 *   para saber qué modal abrir al seleccionarlo o confirmarlo.
 * - Deshabilita automáticamente `EFECTIVO` cuando `metodoEntrega === 'ENVIO'` y reajusta
 *   la selección activa si el usuario cambia a envío a domicilio.
 *
 * @param {Object} opciones
 * @param {boolean} [opciones.habilitado=true] - Si debe consultar el endpoint inmediatamente.
 * @param {string} [opciones.metodoEntrega='RETIRO'] - `'RETIRO'` | `'ENVIO'` | `'PRESENCIAL'`.
 * @param {string} [opciones.tipoPreferidoInicial=null] - Tipo de modal preferido por defecto (ej. `'MERCADOPAGO'` o `'EFECTIVO'`).
 */
export function useMediosPagoActivos({
  habilitado = true,
  metodoEntrega = 'RETIRO',
  tipoPreferidoInicial = null
} = {}) {
  const [listaCruda, setListaCruda] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [idMedioSeleccionado, setIdMedioSeleccionado] = useState(null);

  const cargarMediosPago = useCallback(
    async ({ forzarRecarga = false, signal } = {}) => {
      setCargando(true);
      setError('');
      try {
        const data = await obtenerCatalogoCacheado(
          'sales:medios-pago',
          '/api/sales/medios-pago/',
          {
            ttlMs: 60 * 1000,
            forzarRecarga,
            signal
          }
        );

        const lista = Array.isArray(data)
          ? data
          : Array.isArray(data?.medios_pago)
          ? data.medios_pago
          : Array.isArray(data?.results)
          ? data.results
          : [];

        setListaCruda(lista);
      } catch (err) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
          return;
        }
        setListaCruda([]);
        setError('No se pudieron cargar los medios de pago habilitados. Reintentá en unos instantes.');
      } finally {
        if (!signal?.aborted) {
          setCargando(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!habilitado) return undefined;
    const controller = new AbortController();
    cargarMediosPago({ signal: controller.signal });
    return () => controller.abort();
  }, [habilitado, cargarMediosPago]);

  const mediosPago = useMemo(
    () => procesarMediosPagoActivos(listaCruda, { metodoEntrega }),
    [listaCruda, metodoEntrega]
  );

  const mediosPagoHabilitados = useMemo(
    () => mediosPago.filter((m) => !m.deshabilitado),
    [mediosPago]
  );

  // Mantener siempre una selección válida y compatible con el método de entrega actual
  useEffect(() => {
    if (mediosPagoHabilitados.length === 0) {
      if (idMedioSeleccionado !== null) {
        setIdMedioSeleccionado(null);
      }
      return;
    }

    const actualSigueValido = mediosPagoHabilitados.some(
      (m) => String(m.id_mediopago) === String(idMedioSeleccionado)
    );

    if (!actualSigueValido) {
      let candidato = null;
      if (tipoPreferidoInicial) {
        candidato = mediosPagoHabilitados.find(
          (m) => m.tipoModal === tipoPreferidoInicial
        );
      }
      if (!candidato) {
        candidato = mediosPagoHabilitados[0];
      }
      setIdMedioSeleccionado(candidato ? candidato.id_mediopago : null);
    }
  }, [mediosPagoHabilitados, idMedioSeleccionado, tipoPreferidoInicial]);

  const medioSeleccionado = useMemo(
    () =>
      mediosPago.find((m) => String(m.id_mediopago) === String(idMedioSeleccionado)) ||
      null,
    [mediosPago, idMedioSeleccionado]
  );

  const seleccionarPorId = useCallback(
    (id) => {
      const encontrado = mediosPago.find((m) => String(m.id_mediopago) === String(id));
      if (encontrado && !encontrado.deshabilitado) {
        setIdMedioSeleccionado(encontrado.id_mediopago);
      }
    },
    [mediosPago]
  );

  const buscarMedioPorValor = useCallback(
    (valor) => {
      if (!valor) return null;
      const porId = mediosPago.find((m) => String(m.id_mediopago) === String(valor));
      if (porId) return porId;

      const clasificado = clasificarMedioPago(valor);
      return (
        mediosPago.find((m) => m.tipoModal === clasificado.tipoModal) ||
        mediosPago.find(
          (m) =>
            String(m.nombre_medio_pago).toUpperCase() === String(valor).trim().toUpperCase()
        ) ||
        null
      );
    },
    [mediosPago]
  );

  return {
    mediosPago,
    mediosPagoHabilitados,
    medioSeleccionado,
    idMedioSeleccionado,
    setIdMedioSeleccionado: seleccionarPorId,
    buscarMedioPorValor,
    cargandoMediosPago: cargando,
    errorMediosPago: error,
    recargarMediosPago: () => cargarMediosPago({ forzarRecarga: true })
  };
}

export default useMediosPagoActivos;

