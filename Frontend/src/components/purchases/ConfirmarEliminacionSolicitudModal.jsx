import PropTypes from 'prop-types';
import { motion } from 'framer-motion';

export default function ConfirmarEliminacionSolicitudModal({
  isOpen,
  onClose,
  solicitud,
  onConfirmar,
  eliminando = false
}) {
  if (!isOpen || !solicitud) return null;

  const totalProductos = Array.isArray(solicitud.productos)
    ? solicitud.productos.length
    : (solicitud.total_productos ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        className="bg-[#1E293B] border border-rose-500/40 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto"
      >
        {/* Cabecera de Alerta Crítica */}
        <div className="px-6 py-4 border-b border-slate-800 bg-rose-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-rose-400 block font-bold">
                Advertencia de Seguridad Crítica
              </span>
              <h3 className="text-base sm:text-lg font-black text-white">
                Eliminar Solicitud de Cotización #{solicitud.id_solicitud}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={eliminando}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-6 space-y-4">
          <p className="text-slate-200 text-sm leading-relaxed">
            ¿Está seguro de que desea eliminar definitivamente la{' '}
            <strong className="text-white">Solicitud de Cotización #{solicitud.id_solicitud}</strong>?
          </p>

          <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400 font-mono">Fecha de Emisión:</span>
              <span className="font-semibold text-white">{solicitud.fecha_emision}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400 font-mono">Estado Actual:</span>
              <span className="font-semibold text-amber-300">Borrador (Sin emitir)</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400 font-mono">Renglones de Insumos:</span>
              <span className="font-semibold text-cyan-300">{totalProductos} artículo(s)</span>
            </div>
          </div>

          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex items-start gap-3">
            <span className="text-xl">⚠</span>
            <div className="text-xs text-rose-200 space-y-1">
              <p className="font-bold text-rose-300">Acción Irreversible (Borrado Físico)</p>
              <p className="text-slate-300 leading-relaxed">
                Esta acción eliminará de forma permanente el documento maestro y todos sus renglones de detalles
                en la base de datos en cascada. La transacción quedará asentada inmutablemente en los registros de auditoría.
              </p>
            </div>
          </div>
        </div>

        {/* Pie del Modal */}
        <div className="px-6 py-4 border-t border-slate-800 bg-[#0F172A]/80 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={eliminando}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={() => onConfirmar(solicitud)}
            disabled={eliminando}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-rose-900/30 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>🗑</span>
            <span>{eliminando ? 'Eliminando registro...' : 'Confirmar y Eliminar Registro'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

ConfirmarEliminacionSolicitudModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  solicitud: PropTypes.object,
  onConfirmar: PropTypes.func.isRequired,
  eliminando: PropTypes.bool
};

