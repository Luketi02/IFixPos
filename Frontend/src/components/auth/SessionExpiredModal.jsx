import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import {
  EVENTO_SESION_EXPIRADA,
  notificarSesionExpirada,
  obtenerAccessToken,
  reiniciarNotificacionSesion,
  renovarTokenSesion,
  tokenEstaExpirado,
  tokenProximoAExpirar
} from '../../utils/sesionExpirada';
import { useIntervaloVisible } from '../../utils/polling';

/**
 * Modal global de sesión expirada. Se muestra cuando el backend rechaza el token
 * o cuando el JWT guardado ya venció. Tanto "Continuar" como la "X" cierran la
 * sesión local y redirigen al inicio de sesión.
 */
export default function SessionExpiredModal() {
  const navigate = useNavigate();
  const { token, logout } = useAuth();
  const [visible, setVisible] = useState(false);

  // Escucha el evento emitido por el interceptor de axios
  useEffect(() => {
    const abrir = () => setVisible(true);
    window.addEventListener(EVENTO_SESION_EXPIRADA, abrir);
    return () => window.removeEventListener(EVENTO_SESION_EXPIRADA, abrir);
  }, []);

  // Verificación proactiva del JWT: si está próximo a vencer o vencido mientras el usuario está activo,
  // renueva silenciosamente con el refresh_token; solo notifica sesión expirada si el refresco falla.
  const verificarExpiracion = useCallback(async () => {
    const tokenActual = obtenerAccessToken() || token;
    if (!tokenActual) return;

    if (tokenEstaExpirado(tokenActual) || tokenProximoAExpirar(tokenActual, 90)) {
      try {
        await renovarTokenSesion();
      } catch {
        notificarSesionExpirada();
      }
    }
  }, [token]);

  useIntervaloVisible(verificarExpiracion, token ? 15000 : null, {
    ejecutarAlMontar: true,
    sincronizarAlVolver: true
  });

  const cerrarYRedirigir = () => {
    setVisible(false);
    logout();
    reiniciarNotificacionSesion();
    navigate('/login', { replace: true });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="sesion-expirada"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sesion-expirada-titulo"
            className="relative w-full max-w-md bg-[#1E293B] border border-slate-700/80 rounded-2xl p-7 shadow-2xl shadow-black/50 text-center"
          >
            <button
              type="button"
              onClick={cerrarYRedirigir}
              aria-label="Cerrar"
              className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
            >
              ✕
            </button>

            <div className="mx-auto w-14 h-14 rounded-2xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 flex items-center justify-center text-[#C4B5FD] shadow-[0_0_20px_rgba(139,92,246,0.25)]">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            </div>

            <h2 id="sesion-expirada-titulo" className="text-lg font-black text-[#F8FAFC] mt-4">
              Sesión expirada
            </h2>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              Tu token de sesión ya expiró, vuelve a iniciar sesión.
            </p>

            <button
              type="button"
              onClick={cerrarYRedirigir}
              autoFocus
              className="mt-6 w-full px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-sm font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/60"
            >
              Continuar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
