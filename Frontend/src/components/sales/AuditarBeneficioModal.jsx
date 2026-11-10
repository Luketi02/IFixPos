import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

import { API_BASE_URL } from '../../config/api';
export default function AuditarBeneficioModal({
  beneficioId,
  beneficioInicial,
  token,
  onClose,
  onAlerta,
  onSolicitarRevocacion
}) {
  const [beneficio, setBeneficio] = useState(beneficioInicial || null);
  const [cargando, setCargando] = useState(true);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let cancelado = false;

    const cargarExpediente = async () => {
      if (!beneficioId) return;
      setCargando(true);
      try {
        // Llama a la API oficial de inspección (CU-69) que registra el LogSistema
        const res = await axios.get(`${API_BASE_URL}/api/sales/beneficios/${beneficioId}/detalle/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!cancelado && res.data) {
          setBeneficio(res.data);
        }
      } catch (err) {
        console.error('Error al inspeccionar expediente de beneficio:', err);
        if (!cancelado) {
          if (typeof onAlerta === 'function') {
            onAlerta('error', 'No fue posible registrar la auditoría detallada del beneficio.');
          }
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    };

    cargarExpediente();

    return () => {
      cancelado = true;
    };
  }, [beneficioId, token, onAlerta]);

  if (!beneficioId) return null;

  // Cálculos de caducidad y tiempos
  const datos = beneficio || beneficioInicial || {};
  const esVigente = (datos.estado_vigencia || '').toUpperCase() === 'VIGENTE';
  const horasDisponibles = parseFloat(datos.tiempo_disp || 0);

  // Formato de canal de emisión amigable
  const canalTexto = () => {
    if (datos.enviado_momento_compra) {
      return {
        label: 'Momento de Compra',
        desc: 'Disparado automáticamente por el motor de fidelización tras concretar un pedido o pago.',
        badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
        icono: '🛍️'
      };
    }
    if (datos.enviado_durante_carrito) {
      return {
        label: 'Durante Armado de Carrito',
        desc: 'Sugerencia predictiva emergente en tiempo real mientras el cliente configuraba su cesta.',
        badge: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
        icono: '🛒'
      };
    }
    return {
      label: 'Notificación de Campaña',
      desc: 'Incentivo emitido por algoritmos de retención y reactivación de clientes inactivos.',
      badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      icono: '📢'
    };
  };

  const canalInfo = canalTexto();

  const handleCopiarResumen = () => {
    const texto = `EXPEDIENTE DE BENEFICIO
Cliente: ${datos.cliente_nombre || 'Cliente'} (${datos.email_cliente || ''})
Producto Sugerido: ${datos.nombre_producto || datos.producto_nombre || 'N/A'}
Descuento: ${parseFloat(datos.por_desc || 0)}%
Fecha de Emisión: ${datos.fecha || 'N/A'}
Vigencia: ${horasDisponibles} horas (Hasta ${datos.fecha_caducidad_estimada || 'Fin de período'})
Canal: ${canalInfo.label}
Estado: ${esVigente ? 'Vigente' : 'Caducado'}
Motivo: ${datos.motivo || 'N/A'}`;

    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
      if (typeof onAlerta === 'function') {
        onAlerta('success', 'Ficha de auditoría copiada al portapapeles.');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="bg-[#1E293B] border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Cabecera del Modal */}
        <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4 bg-[#0F172A]/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
                Auditoría de Fidelización Comercial
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-semibold ${
                  esVigente
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}
              >
                {esVigente ? '● Activo / Vigente' : '○ Expirado / Caducado'}
              </span>
            </div>
            <h3 className="text-lg font-black text-white tracking-tight">
              Expediente de Beneficio Otorgado
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Contenido del Expediente (Scrollable) */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {cargando ? (
            <div className="py-12 text-center text-slate-400">
              <div className="inline-block w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs font-mono">Consultando y auditando expediente en el sistema...</p>
            </div>
          ) : (
            <>
              {/* Sección 1: Motivo Algorítmico */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 space-y-2">
                <span className="text-[10px] font-mono uppercase text-cyan-400 tracking-wider font-semibold block">
                  Lógica y Motivo del Disparo Algorítmico
                </span>
                <p className="text-sm font-semibold text-white leading-relaxed">
                  {datos.motivo || 'Recomendación generada por el motor predictivo de ventas.'}
                </p>
                <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                  <span className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border font-semibold inline-flex items-center gap-1.5 ${canalInfo.badge}`}>
                    <span>{canalInfo.icono}</span>
                    <span>{canalInfo.label}</span>
                  </span>
                  <span className="text-[11px] text-slate-400 truncate">
                    {canalInfo.desc}
                  </span>
                </div>
              </div>

              {/* Sección 2: Destinatario y Producto en Dos Columnas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Cliente */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">
                    Cliente Beneficiario
                  </span>
                  <p className="text-sm font-bold text-white truncate">
                    {datos.cliente_nombre || datos.nombre_cliente || 'Consumidor Registrado'}
                  </p>
                  <p className="text-xs font-mono text-cyan-400 truncate">
                    {datos.cliente_email || datos.email_cliente || 'correo@registrado.com'}
                  </p>
                </div>

                {/* Oferta y Descuento */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">
                    Incentivo Económico
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono text-violet-400">
                      {parseFloat(datos.por_desc || 0)}%
                    </span>
                    <span className="text-xs text-slate-400 font-mono">de descuento</span>
                  </div>
                  <span className="text-[11px] text-slate-400 block">
                    Vigencia: <strong className="text-slate-200 font-mono">{horasDisponibles} horas</strong>
                  </span>
                </div>
              </div>

              {/* Sección 3: Producto Sugerido */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Artículo o Repuesto Vinculado
                </span>
                <p className="text-xs font-bold text-white">
                  {datos.producto_nombre || datos.nombre_producto || 'Sin producto específico asociado'}
                </p>
              </div>

              {/* Sección 4: Trazabilidad Temporal y Caducidad */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-3.5 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-mono text-[11px] block">Fecha de Emisión:</span>
                  <span className="font-mono font-bold text-white mt-0.5 block">
                    {datos.fecha || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-mono text-[11px] block">Caducidad Estimada:</span>
                  <span className="font-mono font-bold text-cyan-300 mt-0.5 block">
                    {datos.fecha_caducidad_estimada || 'Fin de la ventana establecida'}
                  </span>
                </div>
              </div>

              {/* Nota Inmutable de Auditoría */}
              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-[11px] text-slate-400 flex items-start gap-2.5">
                <span className="text-cyan-400 text-sm mt-0.5">ℹ️</span>
                <span>
                  Esta inspección gerencial es una operación de <strong>solo lectura</strong> y ha quedado registrada
                  inmutablemente en el registro de auditoría interna del sistema con fecha, hora y usuario ejecutor.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Pie del Modal */}
        <div className="p-4 border-t border-slate-800 bg-[#0F172A]/50 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopiarResumen}
            disabled={cargando}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>{copiado ? '✓ Copiado' : '📋'}</span>
            <span>{copiado ? 'Copiado al Portapapeles' : 'Copiar Resumen'}</span>
          </button>

          <div className="flex items-center gap-2">
            {esVigente && (
              <button
                type="button"
                onClick={() => {
                  if (typeof onSolicitarRevocacion === 'function') {
                    onSolicitarRevocacion(datos);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all inline-flex items-center gap-1.5"
              >
                <span>🚫</span>
                <span>Revocar Beneficio</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 text-xs font-extrabold shadow-md shadow-cyan-500/20 transition-all active:scale-95"
            >
              Cerrar Expediente
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

AuditarBeneficioModal.propTypes = {
  beneficioId: PropTypes.number,
  beneficioInicial: PropTypes.object,
  token: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onAlerta: PropTypes.func,
  onSolicitarRevocacion: PropTypes.func
};
