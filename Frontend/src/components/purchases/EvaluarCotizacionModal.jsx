import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function EvaluarCotizacionModal({
  isOpen,
  onClose,
  cotizacion,
  modo = 'ACEPTAR', // 'ACEPTAR' | 'RECHAZAR'
  onExito
}) {
  const { token } = useAuth();
  const [comentarios, setComentarios] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // Auto-cierre de error en 6 segundos (Regla 6)
  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (isOpen) {
      setComentarios('');
      setError('');
      setEnviando(false);
    }
  }, [isOpen]);

  if (!isOpen || !cotizacion) return null;

  const esAceptar = modo === 'ACEPTAR';
  const nombreProveedor =
    cotizacion?.proveedor?.nombre ||
    cotizacion?.proveedor?.nombre_proveedor ||
    cotizacion?.nombre_proveedor ||
    'Proveedor';

  const formatMoneda = (valor) => {
    const num = Number(valor) || 0;
    return `$ ${num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleConfirmar = async (e) => {
    e.preventDefault();
    setError('');

    if (!esAceptar && !comentarios.trim()) {
      setError('Debe proporcionar un motivo o justificación obligatoria para descartar la cotización.');
      return;
    }

    setEnviando(true);
    try {
      const activeToken = token || localStorage.getItem('access_token') || localStorage.getItem('token');
      const config = {
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
        }
      };

      const payload = {
        accion: esAceptar ? 'ACEPTAR' : 'RECHAZAR',
        comentarios: comentarios.trim()
      };

      const resp = await axios.patch(
        `${API_BASE_URL}/api/purchases/cotizaciones/${cotizacion.id_cotizacion}/evaluar/`,
        payload,
        config
      );

      if (onExito) {
        onExito(resp.data?.cotizacion || resp.data);
      }
      onClose();
    } catch (err) {
      const serverMsg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.response?.data?.comentarios?.[0] ||
        'Ocurrió un error al procesar la evaluación de la cotización.';
      setError(serverMsg);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-lg bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-200"
        >
          {/* Cabecera Modal */}
          <div
            className={`px-6 py-5 border-b flex items-center justify-between ${
              esAceptar
                ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 to-slate-900'
                : 'border-rose-500/30 bg-gradient-to-r from-rose-950/40 to-slate-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  esAceptar
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                }`}
              >
                {esAceptar ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-wide">
                  {esAceptar ? 'Aprobar Cotización y Precios' : 'Descartar Propuesta Comercial'}
                </h3>
                <p className="text-xs text-slate-400">
                  Cotización #{cotizacion.id_cotizacion} • {nombreProveedor}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={enviando}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Formulario / Contenido */}
          <form onSubmit={handleConfirmar} className="p-6 space-y-5">
            {/* Alerta de Error Suave */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-start gap-2.5"
                >
                  <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Resumen de la Oferta */}
            <div className="p-3.5 bg-[#0F172A]/70 border border-slate-700/60 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span>Proveedor Emisor:</span>
                <span className="font-semibold text-white">{nombreProveedor}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Plazo Prometido de Entrega:</span>
                <span className="font-semibold text-cyan-400">{cotizacion.tiempo_promesa} días hábiles</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Vencimiento de Precios:</span>
                <span className="font-semibold text-slate-200">{cotizacion.fecha_validez}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300 pt-1.5 border-t border-slate-800">
                <span className="font-bold text-slate-200">Monto Total Cotizado:</span>
                <span className="font-extrabold text-sm text-cyan-300">
                  {formatMoneda(cotizacion.monto_total_cotizado || cotizacion.monto_total)}
                </span>
              </div>
            </div>

            {/* Mensaje Contextual de Negocio */}
            {esAceptar ? (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300/90 leading-relaxed flex items-start gap-2.5">
                <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  <strong>Sostén Cotizado de Insumos:</strong> Al aceptar esta cotización, los precios unitarios de cada insumo quedarán formalmente convalidados y activados en el catálogo histórico para compras y reabastecimiento inteligente hasta el <span className="font-bold text-emerald-200">{cotizacion.fecha_validez}</span>.
                </span>
              </div>
            ) : (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300/90 leading-relaxed flex items-start gap-2.5">
                <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>
                  <strong>Descarte de Propuesta:</strong> Esta propuesta será catalogada como rechazada por la administración y sus precios no integrarán el catálogo oficial de reposición. Debe registrar la causa del rechazo (ej. precios excesivos, plazos inviables).
                </span>
              </div>
            )}

            {/* Campo de Comentarios / Justificación */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                {esAceptar ? 'Observaciones de Aprobación (Opcional):' : 'Motivo / Justificación del Descarte (Obligatorio):'}
              </label>
              <textarea
                rows={3}
                value={comentarios}
                onChange={(e) => setComentarios(e.target.value)}
                placeholder={
                  esAceptar
                    ? 'Ingrese observaciones internas sobre las condiciones comerciales acordadas...'
                    : 'Explique detalladamente el motivo por el cual se descarta esta oferta...'
                }
                className={`w-full px-3.5 py-2.5 bg-[#0F172A] border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 transition-all resize-none ${
                  esAceptar
                    ? 'border-slate-700 focus:border-emerald-500 focus:ring-emerald-500'
                    : 'border-slate-700 focus:border-rose-500 focus:ring-rose-500'
                }`}
                maxLength={950}
              />
              <div className="text-right text-[11px] text-slate-500">
                {comentarios.length} / 950 caracteres
              </div>
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
              <button
                type="button"
                onClick={onClose}
                disabled={enviando}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={enviando}
                className={`px-5 py-2 text-xs font-bold rounded-xl transition-all shadow-lg flex items-center gap-2 ${
                  esAceptar
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/40'
                    : 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-950/40'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {enviando ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Procesando...</span>
                  </>
                ) : (
                  <>
                    {esAceptar ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Convalidar y Aceptar Oferta</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>Confirmar Descarte</span>
                      </>
                    )}
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

