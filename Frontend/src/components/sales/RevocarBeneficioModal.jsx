import React, { useState } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion } from 'framer-motion';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function RevocarBeneficioModal({
  beneficio,
  token,
  onClose,
  onExito,
  onAlerta
}) {
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [procesando, setProcesando] = useState(false);

  if (!beneficio) return null;

  const handleConfirmarRevocacion = async (e) => {
    if (e) e.preventDefault();
    if (procesando) return;

    setProcesando(true);
    try {
      const payload = {
        motivo_anulacion: motivoAnulacion.trim() || 'Ajuste administrativo / Revocación manual'
      };

      const res = await axios.patch(
        `${API_BASE_URL}/api/sales/beneficios/${beneficio.id_beneficio}/revocar/`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        }
      );

      const mensaje = res.data?.mensaje || 'Beneficio revocado exitosamente.';
      if (typeof onAlerta === 'function') {
        onAlerta('success', `¡Beneficio revocado! ${mensaje}`);
      }
      if (typeof onExito === 'function') {
        onExito(res.data);
      }
      onClose();
    } catch (err) {
      console.error('Error al revocar beneficio activo:', err);
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        'No fue posible revocar el beneficio. Verifica si ya fue utilizado o si expiró.';
      const textoFinal = typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg;
      if (typeof onAlerta === 'function') {
        onAlerta('error', textoFinal);
      }
    } finally {
      setProcesando(false);
    }
  };

  const nombreCliente =
    beneficio.cliente_nombre ||
    beneficio.nombre_cliente ||
    beneficio.email_cliente ||
    beneficio.cliente_email ||
    'Cliente';

  const producto =
    beneficio.producto_nombre ||
    beneficio.nombre_producto ||
    'Producto asociado';

  const descuento = parseFloat(beneficio.por_desc || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        className="bg-[#1E293B] border border-rose-500/40 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 text-lg">
              ⚠️
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 block font-bold">
                Operación Administrativa
              </span>
              <h3 className="text-base font-black text-white">
                Revocar Beneficio Activo
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {/* Resumen del Beneficio */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400 font-mono">Cliente Destinatario:</span>
            <span className="text-white font-semibold truncate max-w-[200px]" title={nombreCliente}>
              {nombreCliente}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400 font-mono">Artículo / Repuesto:</span>
            <span className="text-slate-300 font-medium truncate max-w-[200px]" title={producto}>
              {producto}
            </span>
          </div>
          <div className="flex justify-between border-t border-slate-800/80 pt-2">
            <span className="text-slate-400 font-mono">Descuento Asignado:</span>
            <span className="text-sm font-black font-mono text-cyan-400">
              {descuento}%
            </span>
          </div>
        </div>

        {/* Advertencia Explicativa */}
        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/20 text-slate-300 text-xs leading-relaxed space-y-1">
          <p className="font-semibold text-rose-300 flex items-center gap-1.5">
            <span>🛡️</span>
            <span>Impacto Inmediato e Irreversible</span>
          </p>
          <p className="text-[11px] text-slate-400">
            Al confirmar la revocación, el beneficio quedará marcado como <strong>inválido</strong> e interrumpirá
            su temporizador de validez, bloqueando de inmediato cualquier intento de canje en carritos de compra o servicios.
          </p>
        </div>

        {/* Formulario: Motivo Justificativo (Paso 4 & 5) */}
        <form onSubmit={handleConfirmarRevocacion} className="space-y-4">
          <div>
            <label className="text-[11px] font-mono text-slate-300 uppercase block mb-1">
              Motivo o Justificación de la Revocación (Opcional)
            </label>
            <textarea
              rows="3"
              placeholder="Ej: Ajuste por error algorítmico en el cálculo / Fin anticipado de campaña / Cancelación comercial acordada."
              value={motivoAnulacion}
              onChange={(e) => setMotivoAnulacion(e.target.value)}
              className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors resize-none"
            />
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              disabled={procesando}
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={procesando}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white text-xs font-extrabold shadow-lg shadow-rose-950/40 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              {procesando ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Revocando...</span>
                </>
              ) : (
                <>
                  <span>✕</span>
                  <span>Confirmar Revocación</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

RevocarBeneficioModal.propTypes = {
  beneficio: PropTypes.object,
  token: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onExito: PropTypes.func,
  onAlerta: PropTypes.func
};

