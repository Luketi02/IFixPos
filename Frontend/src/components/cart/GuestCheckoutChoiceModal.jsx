import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';

export default function GuestCheckoutChoiceModal({
  isOpen,
  onClose,
  onSelectRegister,
  onSelectGuest
}) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
        
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 text-slate-100 font-['Lexend'] transform-gpu will-change-transform"
        >
          {/* Botón de Cierre */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Cerrar ventana"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Encabezado */}
          <div className="text-center space-y-1.5 pr-6 sm:pr-0">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(6,182,212,0.2)]">
              🛍️
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Finalizar tu Compra
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Elige cómo deseas continuar con los artículos de tu carrito
            </p>
          </div>

          {/* Opciones de Continuación */}
          <div className="space-y-4">
            
            {/* Opción 1 (Recomendada): Registrarse y Continuar */}
            <div className="relative p-5 rounded-2xl bg-gradient-to-b from-purple-950/40 to-slate-900/90 border-2 border-purple-500/50 hover:border-purple-400 transition-all shadow-[0_0_25px_rgba(139,92,246,0.15)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold tracking-wider uppercase">
                  ⭐ Recomendado
                </span>
                <span className="text-xs text-purple-400 font-mono font-semibold">+ Beneficios Exclusivos</span>
              </div>

              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Registrarse y continuar</span>
                  <span className="text-base">🎁</span>
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Aprovecha tus compras para obtener beneficios en la tienda y ten cerca de ti un centro de reparaciones de dispositivos disponible 24/7 fácil de usar.
                </p>
              </div>

              <ul className="text-[11px] text-slate-400 space-y-1.5 pt-1">
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400 font-bold">✔</span>
                  <span>Acumula beneficios y descuentos progresivos en tus compras.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400 font-bold">✔</span>
                  <span>Historial de facturas y seguimiento en vivo de tus reparaciones.</span>
                </li>
              </ul>

              <button
                type="button"
                onClick={onSelectRegister}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all flex items-center justify-center gap-2 transform active:scale-[0.98]"
              >
                <span>Crear Cuenta y Continuar Compra</span>
                <span className="text-sm">→</span>
              </button>
            </div>

            {/* Opción 2: Continuar sin Cuenta (Invitado) */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-700/80 hover:border-slate-600 transition-all space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 text-sm">
                  ⚡
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Continuar sin cuenta</h3>
                  <span className="text-[11px] text-slate-400 block -mt-0.5">Compra rápida y directa como invitado</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Completa tu orden sin crear contraseña. Te solicitaremos únicamente los datos indispensables para emitir tu comprobante y coordinar el retiro o envío.
              </p>

              <button
                type="button"
                onClick={onSelectGuest}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 border border-slate-700 hover:border-cyan-500/40 font-bold text-xs transition-all flex items-center justify-center gap-2"
              >
                <span>Continuar como Invitado</span>
                <span className="text-sm">→</span>
              </button>
            </div>

          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
            >
              Volver a la tienda para seguir comprando
            </button>
          </div>

        </motion.div>

      </div>
    </AnimatePresence>
  );
}

GuestCheckoutChoiceModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelectRegister: PropTypes.func.isRequired,
  onSelectGuest: PropTypes.func.isRequired
};

