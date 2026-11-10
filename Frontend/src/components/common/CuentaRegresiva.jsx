import { useState, useEffect, useRef } from 'react';

/**
 * Calcula los segundos restantes a partir de un timestamp ISO (`expiraEn`)
 * o una cantidad inicial de segundos (`segundosIniciales`).
 */
function resolverTimestampFin(expiraEn, segundosIniciales) {
  if (expiraEn) {
    const parseado = Date.parse(expiraEn);
    if (!Number.isNaN(parseado)) {
      return parseado;
    }
  }
  const segs = Math.max(0, Number(segundosIniciales) || 0);
  return Date.now() + segs * 1000;
}

/**
 * Formatea segundos en `MM:SS`.
 */
export function formatearTiempoMMSS(segundosTotales) {
  const segs = Math.max(0, Math.floor(Number(segundosTotales) || 0));
  const minutos = String(Math.floor(segs / 60)).padStart(2, '0');
  const segundos = String(segs % 60).padStart(2, '0');
  return `${minutos}:${segundos}`;
}

/**
 * Componente compartido `<CuentaRegresiva />` sincronizado con la hora oficial (Wall-Clock Time)
 * y consciente de la visibilidad de la pestaña (Fase 2 - F7).
 *
 * Acepta tanto `expiraEn` (ISO 8601 enviado por el backend en `expira_en`) como `segundosIniciales`
 * (`segundos_restantes`), priorizando `expiraEn` para exactitud absoluta entre pestañas.
 *
 * @param {Object} props
 * @param {string|null} [props.expiraEn] - Fecha/hora ISO de expiración (`venta.expira_en`).
 * @param {number} [props.segundosIniciales=0] - Segundos restantes iniciales (`venta.segundos_restantes`).
 * @param {string|number} [props.identificador] - Clave opcional (ej. `id_venta`) para reiniciar el reloj al cambiar de orden.
 * @param {Function} [props.onExpirado] - Callback invocado una única vez cuando el contador llega a 0.
 * @param {Function} [props.children] - Render prop opcional `(segundos, textoMMSS) => ReactNode`.
 * @param {string} [props.className] - Clases CSS cuando se renderiza como texto directo.
 */
export default function CuentaRegresiva({
  expiraEn = null,
  segundosIniciales = 0,
  identificador = null,
  onExpirado,
  children,
  className = ''
}) {
  const tiempoFinRef = useRef(resolverTimestampFin(expiraEn, segundosIniciales));
  const expiradoNotificadoRef = useRef(false);
  const onExpiradoRef = useRef(onExpirado);

  useEffect(() => {
    onExpiradoRef.current = onExpirado;
  }, [onExpirado]);

  const [segundos, setSegundos] = useState(() => {
    const difMs = resolverTimestampFin(expiraEn, segundosIniciales) - Date.now();
    return Math.max(0, Math.ceil(difMs / 1000));
  });

  useEffect(() => {
    const nuevoFin = resolverTimestampFin(expiraEn, segundosIniciales);
    tiempoFinRef.current = nuevoFin;
    expiradoNotificadoRef.current = false;
    const restantes = Math.max(0, Math.ceil((nuevoFin - Date.now()) / 1000));
    setSegundos(restantes);
  }, [expiraEn, segundosIniciales, identificador]);

  useEffect(() => {
    const calcularRestante = () => {
      const difMs = tiempoFinRef.current - Date.now();
      return Math.max(0, Math.ceil(difMs / 1000));
    };

    const sincronizarTiempo = () => {
      const segs = calcularRestante();
      setSegundos(segs);
      if (segs <= 0 && !expiradoNotificadoRef.current) {
        expiradoNotificadoRef.current = true;
        if (onExpiradoRef.current) {
          onExpiradoRef.current();
        }
      }
    };

    sincronizarTiempo();

    const timer = setInterval(() => {
      // Pausar actualizaciones innecesarias del DOM cuando la pestaña está oculta
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      sincronizarTiempo();
    }, 1000);

    const handleVisibilidad = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        sincronizarTiempo();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilidad);
    window.addEventListener('focus', handleVisibilidad);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilidad);
      window.removeEventListener('focus', handleVisibilidad);
    };
  }, [expiraEn, segundosIniciales, identificador]);

  const textoMMSS = formatearTiempoMMSS(segundos);

  if (typeof children === 'function') {
    return children(segundos, textoMMSS);
  }

  return <span className={className}>{textoMMSS}</span>;
}

