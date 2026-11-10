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
  const [mostrarTodosLosEstados, setMostrarTodosLosEstados] = useState(false);

  // Estados de Envío y Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Referencias para accesibilidad y navegación por teclado
  const selectRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-limpieza de mensaje de error a los 15 segundos (Regla 6 de UX)
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage('');
      }, 15000);
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

  // Identificar si la orden se encuentra en un estado terminal irreversible donde la actualización no está permitida
  const esEstadoBloqueado = useMemo(() => {
    const estadosBloqueados = [
      'ESPERANDO_DISPOSITIVO',
      'ENTREGADO',
      'ENTREGADA',
      'CANCELADO',
      'CANCELADA'
    ];
    return estadosBloqueados.includes(estadoActualNorm);
  }, [estadoActualNorm]);

  // Transiciones inteligentes sugeridas según la Máquina de Estados del CU-10
  const opcionesSugeridas = useMemo(() => {
    if (esEstadoBloqueado) return [];

    if (estadoActualNorm === 'EN_REPARACION') {
      return [
        { value: 'FINALIZADO', label: 'Finalizado (Reparación completada y verificada)' },
        { value: 'ESPERANDO_REPUESTOS', label: 'Esperando Repuestos (Pausa por falta de insumos)' },
        { value: 'ESPERANDO_DIAGNOSTICO', label: 'Nuevo Diagnóstico (Reevaluación / Presupuesto)' }
      ];
    }
    if (estadoActualNorm === 'ESPERANDO_REPUESTOS') {
      return [
        { value: 'EN_REPARACION', label: 'En Reparación (Reanudación de trabajo técnico)' },
        { value: 'ESPERANDO_DIAGNOSTICO', label: 'Nuevo Diagnóstico (Reevaluación / Presupuesto)' }
      ];
    }
    if (estadoActualNorm === 'FINALIZADO') {
      return [
        { value: 'EN_REPARACION', label: 'En Reparación (Retrabajo por control de calidad)' },
        { value: 'ESPERANDO_DIAGNOSTICO', label: 'Nuevo Diagnóstico (Reevaluación / Presupuesto)' }
      ];
    }
    // Estados iniciales o intermedios
    return [
      { value: 'EN_REPARACION', label: 'En Reparación (Iniciar labor en banco)' },
      { value: 'ESPERANDO_REPUESTOS', label: 'Esperando Repuestos (Pausa por insumos)' },
      { value: 'FINALIZADO', label: 'Finalizado (Completar orden)' },
      { value: 'ESPERANDO_DIAGNOSTICO', label: 'Esperando Diagnóstico (Nuevo Diagnóstico / Reevaluación)' }
    ];
  }, [estadoActualNorm, esEstadoBloqueado]);

  // Lista exhaustiva para cuando el técnico activa el selector completo
  const todasLasOpciones = useMemo(() => [
    { value: 'ESPERANDO_DIAGNOSTICO', label: 'Nuevo Diagnóstico (Reevaluación / Presupuesto)' },
    { value: 'EN_DIAGNOSTICO', label: 'En Diagnóstico' },
    { value: 'EN_REPARACION', label: 'En Reparación' },
    { value: 'ESPERANDO_REPUESTOS', label: 'Esperando Repuestos' },
    { value: 'FINALIZADO', label: 'Finalizado' }
  ], []);

  // Opciones activas a renderizar en el <select>
  const opcionesRenderizadas = useMemo(() => {
    if (esEstadoBloqueado) return [];
    const base = mostrarTodosLosEstados ? todasLasOpciones : opcionesSugeridas;
    // Excluir el estado actual de las opciones para evitar transiciones al mismo estado
    return base.filter((op) => op.value !== estadoActualNorm);
  }, [mostrarTodosLosEstados, todasLasOpciones, opcionesSugeridas, estadoActualNorm, esEstadoBloqueado]);

  // Reiniciar estado cada vez que se abre el modal con una nueva reparación
  useEffect(() => {
    if (isOpen) {
      setNuevoEstado('');
      setComentario('');
      setErrorMessage('');
      setMostrarTodosLosEstados(false);

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

  // Envío del cambio de estado al backend
  const handleSubmit = async (e) => {
    e.preventDefault();
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
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
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
                No está permitido actualizar el estado manualmente cuando la orden se encuentra en etapa{' '}
                <strong>"{formatearEstadoReparacion(reparacion.etapa)}"</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Formulario de Transición */}
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* 1. Selector de Nuevo Estado */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="select-nuevo-estado" className="block text-xs font-semibold text-slate-300">
                Nuevo Estado Operativo <span className="text-cyan-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => setMostrarTodosLosEstados((prev) => !prev)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
              >
                {mostrarTodosLosEstados ? 'Mostrar solo sugeridos' : 'Mostrar todas las opciones'}
              </button>
            </div>

            <select
              id="select-nuevo-estado"
              ref={selectRef}
              value={nuevoEstado}
              onChange={(e) => setNuevoEstado(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:border-[#06B6D4] transition-all cursor-pointer font-medium"
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
              placeholder="Describe detalladamente el avance técnico, justificación del cambio, componentes reemplazados o pruebas realizadas..."
              rows={4}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all resize-none font-sans"
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
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50"
              tabIndex={3}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!puedeConfirmar}
              className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-bold tracking-tight shadow-[0_0_18px_rgba(6,182,212,0.4)] hover:shadow-[0_0_24px_rgba(6,182,212,0.6)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all flex items-center gap-2"
              tabIndex={4}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Transaccionando estado...</span>
                </>
              ) : (
                <>
                  <span>⚙️</span>
                  <span>Transaccionar Estado</span>
                </>
              )}
            </button>
          </div>

        </form>
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
