import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import CyberNumberInput from '../common/CyberNumberInput';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function ActualizarStockModal({ isOpen, onClose, producto, onSuccess }) {
  const { token } = useAuth();

  const [tipoOperacion, setTipoOperacion] = useState('INGRESO');
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [usadoTaller, setUsadoTaller] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-ocultar error temporal tras 15 segundos (Regla 6)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const t = setTimeout(() => setErrorMessage(''), 15000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  // Al abrir o cambiar de producto, resetear estados
  useEffect(() => {
    if (!isOpen || !producto) return;
    setTipoOperacion('INGRESO');
    setCantidad('1');
    setMotivo('');
    setUsadoTaller(Boolean(producto.apto_reparacion || producto.apto_consumible));
    setErrorMessage('');
  }, [isOpen, producto]);

  const stockActual = producto?.cantidad_actual ?? 0;
  const cantNum = parseInt(cantidad, 10) || 0;

  // Validación en tiempo real (Frontend)
  const esEgreso = tipoOperacion === 'EGRESO';
  const egresoExcedeStock = esEgreso && cantNum > stockActual;
  const cantidadValida = cantNum > 0;
  const motivoValido = motivo.trim() !== '';

  const formularioValido =
    producto &&
    cantidadValida &&
    motivoValido &&
    !egresoExcedeStock &&
    !enviando;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formularioValido) return;

    setEnviando(true);
    setErrorMessage('');

    try {
      const payload = {
        id_producto: producto.id_producto,
        tipo_operacion: tipoOperacion,
        cantidad: cantNum,
        motivo: motivo.trim(),
        usado_taller: Boolean(usadoTaller)
      };

      const res = await axios.post(
        `${API_BASE_URL}/api/inventory/stock/actualizar/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const nuevoSaldo = res.data?.data?.stock_nuevo ?? (esEgreso ? stockActual - cantNum : stockActual + cantNum);
      const msgExito = res.data?.mensaje || `Stock actualizado con éxito. Saldo nuevo: ${nuevoSaldo}.`;
      
      if (onSuccess) onSuccess(msgExito);
      onClose();
    } catch (err) {
      console.error('Error al actualizar stock:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || dataErr?.detail || (Array.isArray(dataErr?.non_field_errors) ? dataErr.non_field_errors[0] : null);
      setErrorMessage(msg || 'No fue posible registrar el movimiento de stock.');
    } finally {
      setEnviando(false);
    }
  };

  if (!producto) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6 selection:bg-cyan-500/30 selection:text-cyan-200">
          {/* Backdrop desenfocado */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity"
          />

          {/* Contenedor Compacto del Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.25 }}
            className="relative w-full max-w-md bg-[#1E293B] border border-violet-500/40 rounded-2xl shadow-2xl shadow-violet-950/30 overflow-hidden my-8 z-10"
          >
            {/* Cabecera del Modal */}
            <div className="px-6 py-5 border-b border-slate-700/80 bg-slate-900/50 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-white tracking-tight truncate">
                    Ajustar Stock Manual
                  </h2>
                  <p className="text-xs text-[#06B6D4] font-semibold truncate">
                    {producto.nombre}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tarjeta de Saldo Actual */}
            <div className="mx-6 mt-4 p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                  Saldo en Inventario
                </span>
                <span className="text-xs text-slate-300">
                  Mínimo configurado: <strong className="text-white font-mono">{producto.stock_minimo ?? 0}</strong>
                </span>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-black font-mono ${
                  stockActual <= 0 ? 'text-rose-400' : stockActual <= (producto.stock_minimo || 0) ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {stockActual}
                </span>
                <span className="text-[10px] text-slate-400 ml-1">unidades</span>
              </div>
            </div>

            {/* Alerta de Error Temporal (6 segundos) */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-6 pt-3"
                >
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between gap-2 shadow-inner">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>{errorMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setErrorMessage('')}
                      className="text-rose-400 hover:text-rose-200"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              
              {/* Tipo de Operación */}
              <div className="space-y-1.5">
                <label htmlFor="tipo-operacion-ajuste" className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  Tipo de Operación <span className="text-violet-400">*</span>
                </label>
                <select
                  id="tipo-operacion-ajuste"
                  value={tipoOperacion}
                  onChange={(e) => setTipoOperacion(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer font-medium"
                >
                  <option value="INGRESO">🟢 INGRESO (+ Sumar unidades)</option>
                  <option value="EGRESO">🔴 EGRESO (- Retirar unidades)</option>
                </select>
              </div>

              {/* Cantidad a Ajustar */}
              <div className="space-y-1.5">
                <label htmlFor="cantidad-ajuste" className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Cantidad de Unidades <span className="text-violet-400">*</span></span>
                  {cantNum > 0 && (
                    <span className="text-[11px] font-mono text-cyan-400">
                      Nuevo saldo proyectado: <strong className="text-white">{esEgreso ? stockActual - cantNum : stockActual + cantNum}</strong>
                    </span>
                  )}
                </label>
                <CyberNumberInput
                  id="cantidad-ajuste"
                  min="1"
                  step="1"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  placeholder="1"
                  required
                  className={egresoExcedeStock ? '!border-rose-500' : ''}
                  inputClassName={`font-bold ${egresoExcedeStock ? '!text-rose-300' : ''}`}
                />

                {/* Error de Validación en Tiempo Real (CU-13) */}
                {egresoExcedeStock && (
                  <motion.p
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[11px] text-rose-400 font-medium flex items-center gap-1.5 pt-0.5"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Egreso superior al stock disponible ({stockActual} unidades disponibles).
                  </motion.p>
                )}
              </div>

              {/* Motivo del Ajuste */}
              <div className="space-y-1.5">
                <label htmlFor="motivo-ajuste" className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  Motivo o Justificación <span className="text-violet-400">*</span>
                </label>
                <input
                  id="motivo-ajuste"
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej. Mercadería dañada, ajuste de inventario, reposición"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all"
                />
              </div>

              {/* Usado en Taller (Toggle) */}
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-700/80 hover:border-violet-500/40 cursor-pointer transition-all">
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-slate-200 block">
                    Destinado al Laboratorio / Taller
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Registra si el insumo fue consumido en servicios técnicos.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={usadoTaller}
                  onChange={(e) => setUsadoTaller(e.target.checked)}
                  className="w-4 h-4 accent-[#8B5CF6] rounded cursor-pointer"
                />
              </label>

              {/* Botones */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-700/80">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={enviando}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-semibold transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={!formularioValido}
                  className={`px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg ${
                    formularioValido
                      ? 'bg-[#8B5CF6] hover:bg-violet-400 text-white shadow-violet-500/25 active:scale-95 cursor-pointer'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                  }`}
                >
                  {enviando ? (
                    <>
                      <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Aplicando...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Confirmar Ajuste</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
