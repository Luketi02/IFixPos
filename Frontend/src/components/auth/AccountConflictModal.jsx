import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { EVENTO_CUENTA_CAMBIADA } from '../../utils/sesionExpirada';
import { getDashboardPath } from '../../utils/roleRoutes';

/**
 * Modal global para prevenir el uso simultáneo de 2 cuentas en el mismo navegador.
 * Se dispara cuando otra pestaña del navegador inicia sesión con una cuenta diferente.
 */
export default function AccountConflictModal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conflictData, setConflictData] = useState(null);

  useEffect(() => {
    const handleConflict = (event) => {
      const { anterior, nueva } = event.detail || {};
      setConflictData({ anterior, nueva });
    };

    window.addEventListener(EVENTO_CUENTA_CAMBIADA, handleConflict);
    return () => window.removeEventListener(EVENTO_CUENTA_CAMBIADA, handleConflict);
  }, []);

  const sincronizarYContinuar = () => {
    const nuevaCuenta = conflictData?.nueva;
    setConflictData(null);
    if (nuevaCuenta && nuevaCuenta.rol) {
      navigate(getDashboardPath(nuevaCuenta.rol), { replace: true });
    } else {
      window.location.reload();
    }
  };

  if (!conflictData) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="conflicto-cuentas-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          role="alertdialog"
          aria-modal="true"
          className="relative w-full max-w-md bg-[#1E293B] border border-amber-500/40 rounded-2xl p-7 shadow-2xl shadow-black/60 text-center"
        >
          {/* Icono de Seguridad / Conflicto */}
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)] mb-4">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-slate-100 mb-2">
            Cambio de Sesión Detectado
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            Se ha iniciado sesión con otra cuenta en otra pestaña de este navegador. Por seguridad, no se permite operar simultáneamente con dos cuentas en el mismo navegador.
          </p>

          {/* Tarjeta con los datos de la cuenta activa actual */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-700/80 mb-5 text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block mb-1">
              Nueva Cuenta Activa en el Navegador
            </span>
            <p className="text-sm font-semibold text-slate-200">
              {conflictData.nueva?.nombre
                ? `${conflictData.nueva.nombre} ${conflictData.nueva.apellido || ''}`
                : conflictData.nueva?.email}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {conflictData.nueva?.email} • Rol: <span className="text-violet-400 font-medium">{conflictData.nueva?.rol}</span>
            </p>
          </div>

          <p className="text-xs text-slate-400 mb-6">
            Esta pestaña se actualizará a la cuenta activa para evitar inconsistencias en tus operaciones.
          </p>

          <button
            type="button"
            onClick={sincronizarYContinuar}
            autoFocus
            className="w-full py-3 px-4 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98]"
          >
            Actualizar y Continuar
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

