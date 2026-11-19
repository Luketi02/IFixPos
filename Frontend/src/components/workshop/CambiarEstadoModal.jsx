import { useState, useEffect, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { formatearEstadoReparacion } from '../../utils/repairStatus';

import { API_BASE_URL } from '../../config/api';
/**
 * Modal Inteligente Cyber-Tech para el CU-10: Actualizar estado de reparación.
 * Permite al técnico seleccionar el nuevo estado operativo de avance o retrabajo,
 * registrar el comentario obligatorio de auditoría y notificar automáticamente al cliente.
 */
export default function CambiarEstadoModal({
  isOpen,
  onClose,
  reparacion,
  onSuccess
}) {
  const { token } = useAuth();

  // Estados del Formulario
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [comentario, setComentario] = useState('');
  const [confirmandoCambio, setConfirmandoCambio] = useState(false);

  // Estados de Envío y Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Referencias para accesibilidad y navegación por teclado
  const selectRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-limpieza de mensaje de error a los 6 segundos (Regla 6 de UX)
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage('');
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Normalización del estado actual
  const estadoActualNorm = useMemo(() => {
    if (!reparacion?.etapa) return '';
    return reparacion.etapa
      .toUpperCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s\-]+/g, '_');
  }, [reparacion?.etapa]);

  // Detectar si está en ESPERANDO_DIAGNOSTICO por primera vez (sin diagnóstico previo ni reingreso en bitácora)
  const esPrimerEsperandoDiagnostico = useMemo(() => {
    if (estadoActualNorm !== 'ESPERANDO_DIAGNOSTICO' || !reparacion) return false;
    const cantidadDiagnosticos = Array.isArray(reparacion.diagnosticos)
      ? reparacion.diagnosticos.length
      : reparacion.diagnostico_vigente
      ? 1
      : 0;
    const vecesEnBitacora = Array.isArray(reparacion.historial_bitacora)
      ? reparacion.historial_bitacora.filter((item) => {
          const codNum = Number(item?.estado_alcanzado);
          const nomNorm = String(item?.estado_nombre || item?.estado_alcanzado_nombre || '')
            .toUpperCase()
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\s\-]+/g, '_');
          return codNum === 2 || nomNorm === 'ESPERANDO_DIAGNOSTICO';
        }).length
      : 0;
    return cantidadDiagnosticos === 0 && vecesEnBitacora < 2;
  }, [estadoActualNorm, reparacion]);

  // Identificar si la orden está bloqueada para actualización manual de estado
  const esEstadoBloqueado = useMemo(() => {
    const estadosBloqueados = [
      'ESPERANDO_DISPOSITIVO',
      'ENTREGADO',
      'ENTREGADA',
      'CANCELADO',
      'CANCELADA'
    ];
    return estadosBloqueados.includes(estadoActualNorm) || esPrimerEsperandoDiagnostico;
  }, [estadoActualNorm, esPrimerEsperandoDiagnostico]);

  // Lista completa de estados operativos permitidos para que el técnico pueda pasar a cualquiera
  const todasLasOpciones = useMemo(
    () => [
      { value: 'ESPERANDO_DIAGNOSTICO', label: 'Esperando Diagnóstico (Nuevo Diagnóstico / Reevaluación)' },
      { value: 'EN_DIAGNOSTICO', label: 'En Diagnóstico' },
      { value: 'ESPERANDO_CONFIRMACION', label: 'Esperando Confirmación' },
      { value: 'EN_REPARACION', label: 'En Reparación' },
      { value: 'ESPERANDO_REPUESTOS', label: 'Esperando Repuestos' },
      { value: 'FINALIZADO', label: 'Finalizado' }
    ],
    []
  );

  // Opciones activas a renderizar en el <select> (todas excepto el estado actual)
  const opcionesRenderizadas = useMemo(() => {
    if (esEstadoBloqueado) return [];
    return todasLasOpciones.filter((op) => op.value !== estadoActualNorm);
  }, [todasLasOpciones, estadoActualNorm, esEstadoBloqueado]);

  // Reiniciar estado cada vez que se abre el modal con una nueva reparación
  useEffect(() => {
    if (isOpen) {
      setNuevoEstado('');
      setComentario('');
      setErrorMessage('');
      setConfirmandoCambio(false);

      // Foco automático en el selector al abrirse para navegación por teclado fluida (Tab)
      setTimeout(() => {
        if (selectRef.current && !esEstadoBloqueado) {
          selectRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen, reparacion, esEstadoBloqueado]);

  // Manejo de la tecla Escape para cerrar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !reparacion) return null;

  // Datos para la cabecera
  const marcaEquipo = reparacion.dispositivo?.marca || 'Dispositivo';
  const modeloEquipo = reparacion.dispositivo?.modelo || '';
  const tituloCabecera = `Actualizar Estado - ${marcaEquipo} ${modeloEquipo}`.trim();

  // Validación en tiempo real (Frontend)
  const comentarioValido = comentario.trim().length > 0;
  const nuevoEstadoValido = Boolean(nuevoEstado && nuevoEstado !== estadoActualNorm);
  const puedeConfirmar = comentarioValido && nuevoEstadoValido && !isSubmitting && !esEstadoBloqueado;

  // Paso 1 -> Solicitar confirmación antes de enviar
  const handleSolicitarConfirmacion = (e) => {
    e.preventDefault();
    if (!puedeConfirmar) return;
    setErrorMessage('');
    setConfirmandoCambio(true);
  };

  // Paso 2 -> Envío definitivo del cambio de estado al backend tras confirmación
  const handleConfirmarEnvio = async () => {
    if (!puedeConfirmar) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const payload = {
        nuevo_estado: nuevoEstado,
        comentario: comentario.trim()
      };

      const res = await axios.patch(
        `${API_BASE_URL}/api/workshop/reparaciones/${reparacion.id_reparacion}/estado/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const mensajeExito = res.data?.mensaje || 'Estado actualizado. Cliente notificado.';
      if (typeof onSuccess === 'function') {
        onSuccess(mensajeExito, reparacion.id_reparacion, nuevoEstado);
      }
      onClose();
    } catch (err) {
      console.error('Error al actualizar estado de la reparación:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string'
        ? dataErr
        : dataErr?.error || dataErr?.detail || dataErr?.mensaje || 'Error al actualizar el estado de la reparación.';
      setConfirmandoCambio(false);
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-lg bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl shadow-cyan-950/40 p-6 sm:p-7 space-y-6 text-slate-100 my-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Cabecera del Modal */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-700/80 pb-4">
          <div className="space-y-1.5">
            <h2 id="modal-title" className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
              {tituloCabecera}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400 font-medium">Estado Actual:</span>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-tight bg-cyan-500/15 text-cyan-300 border border-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.35)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                {formatearEstadoReparacion(reparacion.etapa)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
            title="Cerrar modal (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Alerta de Error con Fade-out a los 6 segundos (Regla de UX) */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs sm:text-sm p-3.5 rounded-xl shadow-lg flex items-start gap-2.5"
            >
              <span className="text-base leading-none">⚠️</span>
              <div className="flex-1 font-medium">{errorMessage}</div>
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="text-rose-400 hover:text-rose-100 font-bold ml-1"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {esEstadoBloqueado && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
            <span className="text-base leading-none">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold text-white">Actualización de estado no permitida</p>
              <p className="text-amber-300/90 mt-0.5">
                {esPrimerEsperandoDiagnostico ? (
                  <>
                    La reparación se encuentra en <strong>"Esperando Diagnóstico"</strong> por primera vez. Debes registrar primero el diagnóstico técnico inicial antes de transicionar manualmente de estado.
                  </>
                ) : (
                  <>
                    No está permitido actualizar el estado manualmente cuando la orden se encuentra en etapa{' '}
                    <strong>"{formatearEstadoReparacion(reparacion.etapa)}"</strong>.
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Confirmación previa dentro del mismo modal */}
        {confirmandoCambio ? (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-3">
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <span>🛡️</span>
                <span>Confirmar actualización de estado</span>
              </p>
              <p className="text-xs text-slate-300">
                ¿Confirmas cambiar el estado de la reparación de{' '}
                <strong className="text-slate-100">{formatearEstadoReparacion(reparacion.etapa)}</strong> a{' '}
                <strong className="text-cyan-300">{formatearEstadoReparacion(nuevoEstado)}</strong>?
              </p>
              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
                <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-1">
                  Observación registrada para el cliente:
                </span>
                <p className="whitespace-pre-line">{comentario.trim()}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-700/80 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmandoCambio(false)}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Volver a editar
              </button>
              <button
                type="button"
                onClick={handleConfirmarEnvio}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-bold tracking-tight shadow-[0_0_18px_rgba(6,182,212,0.4)] transition-all flex items-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Actualizando estado...</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Confirmar actualización</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Formulario de Transición */
          <form onSubmit={handleSolicitarConfirmacion} className="space-y-5">
            
            {/* 1. Selector de Nuevo Estado */}
            <div className="space-y-1.5">
              <label htmlFor="select-nuevo-estado" className="block text-xs font-semibold text-slate-300">
                Nuevo Estado Operativo <span className="text-cyan-400">*</span>
              </label>

              <select
                id="select-nuevo-estado"
                ref={selectRef}
                value={nuevoEstado}
                onChange={(e) => setNuevoEstado(e.target.value)}
                disabled={esEstadoBloqueado}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:border-[#06B6D4] transition-all cursor-pointer font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                tabIndex={1}
                required
              >
                <option value="" disabled>
                  -- Selecciona el nuevo estado del equipo --
                </option>
                {opcionesRenderizadas.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Comentario Técnico Obligatorio */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="textarea-comentario" className="block text-xs font-semibold text-slate-300">
                  Observaciones / Comentario Técnico <span className="text-cyan-400">*</span>
                </label>
                <span className="text-[11px] font-mono text-slate-500">
                  {comentario.trim().length} car.
                </span>
              </div>

              <textarea
                id="textarea-comentario"
                ref={textareaRef}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                disabled={esEstadoBloqueado}
                placeholder="Describe detalladamente el avance técnico, justificación del cambio, componentes reemplazados o pruebas realizadas..."
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all resize-none font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                tabIndex={2}
                required
              />

              {/* Subtítulo de advertencia obligatorio según especificación */}
              <p className="text-[11px] text-amber-400/90 font-medium flex items-center gap-1.5 pt-0.5">
                <span>🔔</span>
                <span>Obligatorio: Este comentario justificará la transición y será enviado automáticamente al cliente.</span>
              </p>
            </div>

            {/* Acciones del Modal */}
            <div className="pt-3 border-t border-slate-700/80 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                tabIndex={3}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={!puedeConfirmar}
                className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-bold tracking-tight shadow-[0_0_18px_rgba(6,182,212,0.4)] hover:shadow-[0_0_24px_rgba(6,182,212,0.6)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                tabIndex={4}
              >
                <span>⚙️</span>
                <span>Continuar</span>
              </button>
            </div>

          </form>
        )}
      </motion.div>
    </div>
  );
}

CambiarEstadoModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  reparacion: PropTypes.object,
  onSuccess: PropTypes.func
};
