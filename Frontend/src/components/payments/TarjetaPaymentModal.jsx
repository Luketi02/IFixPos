import { motion, AnimatePresence } from 'framer-motion';
import { formatearMoneda } from '../../utils/productImages';
import { useAccesibilidadModal } from '../../hooks/useAccesibilidadModal';

/**
 * Modal Reutilizable para pagos con Tarjeta de Débito / Crédito.
 *
 * Se abre de forma homogénea desde el Carrito de Compras, el Diagnóstico Inicial
 * o la Confirmación de Presupuesto de Reparación.
 */
export default function TarjetaPaymentModal({
  isOpen,
  onClose,
  nombreMedioPago = 'Tarjeta de Débito / Crédito',
  montoTotal = 0,
  recargoPorcentaje = 0,
  concepto = 'Operación en IFix',
  codigoSeguridad = null,
  textoConfirmar = 'Confirmar pago con tarjeta',
  procesando = false,
  onConfirmarTarjeta
}) {
  const { contenedorRef } = useAccesibilidadModal(isOpen, onClose, procesando);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
        <motion.div
          ref={contenedorRef}
          role="dialog"
          aria-modal="true"
          aria-label="Confirmación de pago con tarjeta"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md rounded-2xl bg-[#1E293B] border border-violet-500/30 shadow-2xl p-6 text-slate-100 focus:outline-none"
        >
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-700/70">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-400/40 flex items-center justify-center text-violet-300 text-lg">
                💳
              </div>
              <div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-500/15 text-violet-300 border border-violet-500/30">
                  Terminal POS / Tarjeta
                </span>
                <h3 className="text-lg font-extrabold text-white mt-0.5">
                  {nombreMedioPago}
                </h3>
              </div>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={procesando}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                aria-label="Cerrar modal de tarjeta"
              >
                ✕
              </button>
            )}
          </div>

          {/* Resumen de monto */}
          <div className="mt-4 p-4 rounded-xl bg-[#0F172A] border border-slate-800 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Concepto
              </p>
              <p className="text-sm font-bold text-white mt-0.5">{concepto}</p>
              {codigoSeguridad && (
                <p className="text-xs text-cyan-400 font-mono mt-1">
                  Token de seguridad: <span className="font-bold">{codigoSeguridad}</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Total a abonar
              </p>
              <p className="text-xl font-black text-violet-400">
                {formatearMoneda(montoTotal)}
              </p>
              {Number(recargoPorcentaje) > 0 && (
                <p className="text-[10px] text-amber-400 font-semibold">
                  Incluye {recargoPorcentaje}% de recargo financiero
                </p>
              )}
            </div>
          </div>

          {/* Instrucciones */}
          <div className="mt-4 p-4 rounded-xl bg-slate-900/75 border border-slate-700/70 space-y-2 text-xs text-slate-300 leading-relaxed">
            <p className="font-bold text-white">
              ¿Cómo se procesa tu pago con tarjeta?
            </p>
            <p>
              Tu operación quedará vinculada al medio de pago{' '}
              <span className="text-violet-300 font-semibold">{nombreMedioPago}</span>.
              Podrás presentar tu tarjeta física o contactless en nuestra terminal POS
              habilitada o coordinar el enlace de cobro con administración.
            </p>
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={procesando}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Volver
              </button>
            )}
            <button
              type="button"
              disabled={procesando}
              onClick={() =>
                onConfirmarTarjeta?.({
                  metodoPago: 'TARJETA'
                })
              }
              className="flex-1 py-2.5 px-5 rounded-xl bg-violet-500 hover:bg-violet-400 text-white font-black text-xs sm:text-sm shadow-lg shadow-violet-500/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {procesando ? 'Procesando...' : textoConfirmar}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

