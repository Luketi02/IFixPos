import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';

import { API_BASE_URL } from '../../config/api';
export default function ClientBenefitsModal({ isOpen, onClose, onUsarEnTienda }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('activos'); // 'activos' | 'historial'
  const [activos, setActivos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      cargarBeneficios();
    }
  }, [isOpen]);

  const cargarBeneficios = async () => {
    setCargando(true);
    setError(null);
    try {
      const token = localStorage.getItem('access_token');
      const res = await axios.get(`${API_BASE_URL}/api/sales/beneficios/mis-beneficios/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setActivos(res.data.activos || []);
      setHistorial(res.data.historial || []);
    } catch (err) {
      console.error('Error al cargar beneficios del cliente:', err);
      setError('No fue posible cargar tus cupones y beneficios. Por favor, intenta más tarde.');
    } finally {
      setCargando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        {/* Contenedor Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-[#0F172A] border border-slate-700/80 rounded-2xl shadow-2xl shadow-cyan-950/40 flex flex-col max-h-[90vh] overflow-hidden"
        >
          {/* Cabecera Cyber-Tech */}
          <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-violet-500/20 border border-cyan-500/40 text-cyan-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-wide">
                  Mis Beneficios y Cupones
                </h3>
                <p className="text-xs text-slate-400">
                  Descuentos exclusivos generados para tus compras y servicios técnicos
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Cerrar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navegación por Pestañas */}
          <div className="flex border-b border-slate-800 bg-slate-900/40 px-5 pt-3 gap-2">
            <button
              onClick={() => setTab('activos')}
              className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                tab === 'activos'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Disponibles para Canjear</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono ${
                activos.length > 0 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold' : 'bg-slate-800 text-slate-400'
              }`}>
                {activos.length}
              </span>
            </button>

            <button
              onClick={() => setTab('historial')}
              className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                tab === 'historial'
                  ? 'border-violet-400 text-violet-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Historial Completo</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-800 text-slate-400">
                {historial.length}
              </span>
            </button>
          </div>

          {/* Cuerpo de la Lista */}
          <div className="p-5 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
            {cargando && (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <div className="w-7 h-7 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs">Consultando beneficios disponibles...</p>
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            {!cargando && !error && tab === 'activos' && activos.length === 0 && (
              <div className="py-12 text-center text-slate-400 space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 mx-auto flex items-center justify-center text-slate-500">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4M12 4v16" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-300">No tienes beneficios activos en este momento</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    ¡Continúa explorando la tienda o reparando tus dispositivos para desbloquear recompensas y cupones exclusivos!
                  </p>
                </div>
              </div>
            )}

            {!cargando && !error && tab === 'historial' && historial.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                <p className="text-sm">Aún no registras historial de beneficios.</p>
              </div>
            )}

            {/* Listado de Beneficios Activos */}
            {!cargando && tab === 'activos' && activos.map((b, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-gradient-to-r from-[#1E293B] to-[#1E293B]/80 border border-cyan-500/30 hover:border-cyan-500/60 shadow-lg shadow-black/30 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {b.por_desc}% OFF
                    </span>
                    <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
                      Válido por {Math.round(b.tiempo_disp)}h
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Emitido el {b.fecha}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-white truncate">
                    {b.producto_nombre}
                  </h4>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {b.motivo}
                  </p>
                </div>

                <div className="flex flex-col sm:items-end w-full sm:w-auto">
                  <button
                    onClick={() => {
                      onClose();
                      if (onUsarEnTienda) onUsarEnTienda();
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 shadow-md shadow-cyan-950/30 transition-all cursor-pointer text-center"
                  >
                    Usar en la Tienda
                  </button>
                  <span className="text-[10px] text-slate-400 mt-1">
                    Acumulable en Checkout
                  </span>
                </div>
              </motion.div>
            ))}

            {/* Listado de Historial */}
            {!cargando && tab === 'historial' && historial.map((b, idx) => {
              const estaCanjeado = b.motivo && b.motivo.includes('[CANJEADO');
              const estaRevocado = b.estado === 'REVOCADO' && !estaCanjeado;
              const estaCaducado = b.estado === 'CADUCADO';
              const estaActivo = b.estado === 'ACTIVO';

              let badgeColor = 'bg-slate-700 text-slate-300 border-slate-600';
              let badgeTexto = b.estado;

              if (estaCanjeado) {
                badgeColor = 'bg-violet-500/20 text-violet-300 border-violet-500/40';
                badgeTexto = 'CANJEADO';
              } else if (estaActivo) {
                badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                badgeTexto = 'ACTIVO';
              } else if (estaCaducado) {
                badgeColor = 'bg-slate-800 text-slate-400 border-slate-700';
                badgeTexto = 'CADUCADO';
              } else if (estaRevocado) {
                badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
                badgeTexto = 'REVOCADO';
              }

              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${badgeColor}`}>
                        {badgeTexto}
                      </span>
                      <span className="text-xs font-bold text-slate-200">
                        {b.por_desc}% OFF
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {b.fecha}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 truncate">
                      {b.producto_nombre}
                    </p>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {b.motivo}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Informativo */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Los cupones se aplican y acumulan automáticamente al finalizar tu compra.</span>
            </span>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
            >
              Entendido
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

