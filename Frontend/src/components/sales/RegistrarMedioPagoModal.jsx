import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Modal Cyber-Tech para Registrar Medio de Pago (CU-82).
 * Solicita el nombre del canal y el porcentaje de recargo opcional.
 * Maneja el flujo de reactivación si el medio de pago ya existía y estaba inactivo.
 */
export default function RegistrarMedioPagoModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  error = '',
  reactivacionPendiente = null,
  onConfirmarReactivacion
}) {
  const [nombre, setNombre] = useState('');
  const [recargo, setRecargo] = useState('0.00');

  useEffect(() => {
    if (isOpen) {
      setNombre('');
      setRecargo('0.00');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    onSubmit({
      nombre: nombre.trim(),
      recargo: recargo === '' ? '0.00' : recargo
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-md bg-[#1E293B] border border-cyan-500/40 rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden my-8"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-700/80 flex items-center justify-between bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 text-lg">
                💳
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">
                  Registrar Canal de Pago
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Configuración de Cobros y Caja
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Alerta de Error */}
            <AnimatePresence>
              {error && !reactivacionPendiente && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 shadow-lg shadow-rose-950/20"
                >
                  <span className="font-bold">!</span>
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Aviso especial de reactivación si ya existía inactivo (Excepción Paso 4 de CU-82) */}
            {reactivacionPendiente ? (
              <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <span>⚠️</span>
                  <span>Medio de pago previamente registrado</span>
                </div>
                <p className="leading-relaxed">
                  Este medio de pago (<strong>{reactivacionPendiente.nombre}</strong>) se encontraba deshabilitado en el sistema.
                  ¿Desea reactivarlo y habilitarlo inmediatamente para la facturación?
                </p>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-500/30">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300 hover:text-white border border-slate-700 hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmarReactivacion}
                    disabled={loading}
                    className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs font-mono tracking-wider transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.35)]"
                  >
                    {loading ? (
                      <span>Reactivando...</span>
                    ) : (
                      <>
                        <span>Sí, Reactivar</span>
                        <span>✓</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Nombre del Medio de Pago */}
                <div>
                  <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Nombre del Medio de Pago <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    disabled={loading}
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej: Mercado Pago, Tarjeta de Crédito, Posnet..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                  />
                  <p className="text-[11px] text-slate-400 font-mono mt-1">
                    Denominación visible en la caja y comprobantes.
                  </p>
                </div>

                {/* Recargo porcentual opcional */}
                <div>
                  <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Recargo Financiero (%) <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      disabled={loading}
                      value={recargo}
                      onChange={(e) => setRecargo(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors pr-8"
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-mono text-cyan-400 font-bold">
                      %
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">
                    Porcentaje adicional aplicado automáticamente al total de la transacción.
                  </p>
                </div>

                {/* Botones de Acción */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/80">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={loading || !nombre.trim()}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-black text-xs font-mono tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v2m0 12v2m8-8h-2M6 12H4m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414" />
                        </svg>
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <span>Registrar Canal</span>
                        <span>✓</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

RegistrarMedioPagoModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
  reactivacionPendiente: PropTypes.object,
  onConfirmarReactivacion: PropTypes.func
};

