import { motion, AnimatePresence } from 'framer-motion';

/**
 * Modal de confirmación para el cambio de estado operativo (Soft Delete / Reactivación).
 * Comunica claramente el impacto funcional de inhabilitar o activar una entidad.
 */
export default function CatalogStatusConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  itemName = '',
  currentStatus = true,
  entityTitle = 'Registro',
  implicationsText = '',
  loading = false
}) {
  if (!isOpen) return null;

  const willDeactivate = Boolean(currentStatus);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={loading ? undefined : onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden z-10"
        >
          {/* Cabecera */}
          <div className="p-6 border-b border-slate-700/60">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                  willDeactivate
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                }`}
              >
                {willDeactivate ? '⚠️' : '✨'}
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F8FAFC]">
                  {willDeactivate ? `Inhabilitar ${entityTitle}` : `Reactivar ${entityTitle}`}
                </h3>
                <p className="text-xs text-slate-400 truncate max-w-[260px]">
                  {itemName}
                </p>
              </div>
            </div>
          </div>

          {/* Cuerpo informativo */}
          <div className="p-6 space-y-4">
            <p className="text-xs leading-relaxed text-slate-300">
              {willDeactivate ? (
                <>
                  ¿Está seguro de que desea <strong className="text-amber-300">dar de baja</strong> este registro?{' '}
                  {implicationsText || 'El elemento dejará de estar disponible para nuevas operaciones, protegiendo relacionalmente el historial preexistente mediante borrado lógico.'}
                </>
              ) : (
                <>
                  ¿Desea <strong className="text-cyan-300">reactivar</strong> este registro? Volverá a estar inmediatamente disponible en los selectores y formularios del sistema.
                </>
              )}
            </p>

            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">Nota de Auditoría:</span> Esta acción no elimina datos físicos y queda registrada inmutablemente en el registro de auditoría.
            </div>
          </div>

          {/* Botones */}
          <div className="p-4 bg-slate-900/40 border-t border-slate-700/60 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95 flex items-center gap-2 ${
                willDeactivate
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                  : 'bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Procesando...</span>
                </>
              ) : (
                <span>{willDeactivate ? 'Confirmar Baja Lógica' : 'Confirmar Reactivación'}</span>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
