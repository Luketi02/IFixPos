import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import EvaluarCotizacionModal from './EvaluarCotizacionModal';

import { API_BASE_URL } from '../../config/api';
export default function DetalleCotizacionModal({
  isOpen,
  onClose,
  idCotizacion,
  cotizacionInicial = null,
  onCotizacionEvaluada
}) {
  const { token } = useAuth();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [cotizacion, setCotizacion] = useState(null);

  // Sub-modal de Evaluación (CU-53)
  const [modalEvaluarOpen, setModalEvaluarOpen] = useState(false);
  const [modoEvaluacion, setModoEvaluacion] = useState('ACEPTAR'); // 'ACEPTAR' | 'RECHAZAR'

  // Auto-cierre de alertas de error en 6 segundos (Regla 6)
  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  // Carga del Expediente Formal (CU-52 Paso 4 y 5)
  useEffect(() => {
    if (!isOpen) {
      setCotizacion(null);
      setError('');
      return;
    }

    const targetId = idCotizacion || cotizacionInicial?.id_cotizacion;
    if (!targetId) return;

    const cargarDetalle = async () => {
      setCargando(true);
      setError('');
      try {
        const activeToken = token || localStorage.getItem('access_token');
        const config = {
          headers: activeToken
            ? {
                Authorization: `Bearer ${activeToken}`
              }
            : {}
        };
        const resp = await axios.get(
          `${API_BASE_URL}/api/purchases/cotizaciones/${targetId}/`,
          config
        );
        setCotizacion(resp.data);
      } catch (err) {
        if (cotizacionInicial) {
          setCotizacion(cotizacionInicial);
        } else {
          setError(
            err?.response?.data?.error ||
            err?.response?.data?.detail ||
            'No se pudo obtener el expediente detallado de la cotización.'
          );
        }
      } finally {
        setCargando(false);
      }
    };

    cargarDetalle();
  }, [isOpen, idCotizacion, cotizacionInicial, token]);

  if (!isOpen) return null;

  const data = cotizacion || cotizacionInicial;

  const formatMoneda = (valor) => {
    const num = Number(valor) || 0;
    return `$ ${num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Cálculo de vigencia temporal
  const calcularVigencia = (fechaStr) => {
    if (!fechaStr) return { texto: 'Sin fecha', expirada: false, dias: 0 };
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const [y, m, d] = fechaStr.split('-').map(Number);
    const fechaVenc = new Date(y, m - 1, d);
    const diffMs = fechaVenc - hoy;
    const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias < 0) {
      return { texto: `Vencida (hace ${Math.abs(diffDias)} días)`, expirada: true, dias: diffDias };
    }
    if (diffDias === 0) {
      return { texto: 'Vence hoy', expirada: false, dias: 0, urgente: true };
    }
    return {
      texto: `Vigente (${diffDias} días restantes)`,
      expirada: false,
      dias: diffDias,
      urgente: diffDias <= 3
    };
  };

  const infoVigencia = data?.fecha_validez ? calcularVigencia(data.fecha_validez) : null;
  const esPendiente = data?.estado_cotizacion === 0;
  const esAceptada = data?.estado_cotizacion === 1;

  const handleAbrirEvaluar = (modo) => {
    setModoEvaluacion(modo);
    setModalEvaluarOpen(true);
  };

  const handleExitoEvaluacion = (cotizacionActualizada) => {
    setCotizacion(cotizacionActualizada);
    if (onCotizacionEvaluada) {
      onCotizacionEvaluada(cotizacionActualizada);
    }
  };

  const prov = data?.proveedor || {};
  const nombreProv = prov.nombre || prov.nombre_proveedor || data?.nombre_proveedor || 'Proveedor';
  const cuitProv = prov.cuit || prov.cuit_prov || data?.cuit_prov || '-';

  return (
    <>
      <AnimatePresence>
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-4xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-200"
          >
            {/* Cabecera */}
            <div className="px-6 py-5 border-b border-slate-700/80 bg-gradient-to-r from-[#0F172A] to-[#1E293B] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white tracking-wide">
                      Cotización #{data?.id_cotizacion || '...'}
                    </h3>
                    {data?.id_solicitud && (
                      <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 rounded-md">
                        Solicitud Asociada #{data.id_solicitud}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Inspección formal de propuesta económica y análisis de insumos
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Badge de Estado */}
                {data?.estado_cotizacion === 0 && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    Pendiente de Evaluación
                  </span>
                )}
                {data?.estado_cotizacion === 1 && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Aceptada • Precios Fijados
                  </span>
                )}
                {data?.estado_cotizacion === 2 && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/15 border border-purple-500/40 text-purple-300 flex items-center gap-1.5">
                    Descartada por Admin
                  </span>
                )}
                {data?.estado_cotizacion === 3 && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 border border-rose-500/40 text-rose-400 flex items-center gap-1.5">
                    Rechazada por Proveedor
                  </span>
                )}

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
            </div>

            {/* Alerta de Error Suave */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 bg-rose-500/15 border-b border-rose-500/40 text-rose-300 text-xs px-6 flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Cuerpo del Modal con Scroll */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {cargando && !data ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                  <svg className="w-8 h-8 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <p>Consultando expediente de cotización...</p>
                </div>
              ) : (
                <>
                  {/* Tarjetas Superiores: Proveedor y Condiciones Comerciales */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Tarjeta Proveedor */}
                    <div className="p-4 bg-[#0F172A]/70 border border-slate-700/60 rounded-xl space-y-2.5">
                      <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wider text-[11px]">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <span>Datos del Proveedor Emisor</span>
                      </div>
                      <div className="text-sm font-bold text-white">{nombreProv}</div>
                      <div className="space-y-1 text-slate-300">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Identificador Fiscal / CUIT:</span>
                          <span className="font-mono text-slate-200">{cuitProv}</span>
                        </div>
                        {prov.correo && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Correo de Contacto:</span>
                            <span className="text-slate-200">{prov.correo}</span>
                          </div>
                        )}
                        {prov.telefono && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Teléfono:</span>
                            <span className="text-slate-200">{prov.telefono}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                          <span className="text-slate-400">Modalidad de Envío:</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            prov.ofrece_envio ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {prov.ofrece_envio ? 'Envío a Domicilio Ofrecido' : 'Solo Retiro en Local'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Tarjeta Condiciones Comerciales */}
                    <div className="p-4 bg-[#0F172A]/70 border border-slate-700/60 rounded-xl space-y-2.5">
                      <div className="flex items-center gap-2 text-violet-400 font-bold uppercase tracking-wider text-[11px]">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Condiciones de la Oferta</span>
                      </div>
                      <div className="space-y-1.5 text-slate-300">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Plazo de Entrega Prometido:</span>
                          <span className="font-bold text-white text-xs px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-md">
                            {data?.tiempo_promesa} días hábiles
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Fecha Límite de Validez:</span>
                          <span className="font-semibold text-slate-200">{data?.fecha_validez || 'No definida'}</span>
                        </div>
                        {infoVigencia && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Estado de Vigencia:</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              infoVigencia.expirada
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : infoVigencia.urgente
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            }`}>
                              {infoVigencia.texto}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-1.5 border-t border-slate-800">
                          <span className="text-slate-400">Presupuesto Formal (PDF):</span>
                          {data?.archivo_adjunto ? (
                            <a
                              href={
                                data.archivo_adjunto.startsWith('http')
                                  ? data.archivo_adjunto
                                  : `${API_BASE_URL}/media/${data.archivo_adjunto}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline decoration-cyan-500/50 hover:decoration-cyan-400"
                            >
                              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Descargar Documento PDF
                            </a>
                          ) : (
                            <span className="text-slate-500 italic">No adjuntado</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Observaciones del Proveedor / Justificación */}
                  {data?.comentarios && (
                    <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Comentarios / Observaciones del Proveedor:
                      </div>
                      <p className="text-slate-200 text-xs italic leading-relaxed">
                        "{data.comentarios}"
                      </p>
                    </div>
                  )}

                  {/* Sostén Cotizado de Insumos Activo (Badge si es aceptada) */}
                  {esAceptada && (
                    <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <div>
                          <div className="font-bold text-emerald-300 text-xs">
                            Sostén Cotizado Oficial y Vigente
                          </div>
                          <div className="text-[11px] text-emerald-400/80">
                            Los precios desglosados a continuación se encuentran convalidados en la base de compras inteligente.
                          </div>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg">
                        Activo hasta {data.fecha_validez}
                      </span>
                    </div>
                  )}

                  {/* Tabla Desglosada de Insumos Cotizados */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-sm text-white flex items-center gap-2">
                        <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        Renglones de Insumos / Repuestos Cotizados
                      </h4>
                      <span className="text-slate-400 text-xs">
                        {data?.items?.length || 0} artículo(s) cotizado(s)
                      </span>
                    </div>

                    <div className="border border-slate-700/80 rounded-xl overflow-hidden bg-[#0F172A]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-800/80 text-slate-300 font-semibold border-b border-slate-700">
                          <tr>
                            <th className="px-4 py-2.5">Insumo / Repuesto</th>
                            <th className="px-3 py-2.5">Categoría</th>
                            <th className="px-3 py-2.5 text-center">Cantidad</th>
                            <th className="px-3 py-2.5 text-right">Precio Unitario</th>
                            <th className="px-4 py-2.5 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-300">
                          {data?.items?.map((item, idx) => (
                            <tr key={item.id_cotizacion_producto || idx} className="hover:bg-slate-800/40 transition-colors">
                              <td className="px-4 py-2.5 font-medium text-white">
                                {item.nombre_producto || `Insumo #${item.id_producto}`}
                              </td>
                              <td className="px-3 py-2.5 text-slate-400">
                                {item.categoria || '-'}
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-slate-200">
                                {item.cantidad || 1}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-cyan-400 font-semibold">
                                {formatMoneda(item.precio_unitario || item.precio_ofrecido)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-white font-bold">
                                {formatMoneda(
                                  item.subtotal ||
                                  (Number(item.cantidad || 1) * Number(item.precio_ofrecido || item.precio_unitario || 0))
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-900 border-t-2 border-slate-700">
                          <tr>
                            <td colSpan={4} className="px-4 py-3 text-right font-bold text-slate-300 text-xs uppercase">
                              Importe Total Cotizado:
                            </td>
                            <td className="px-4 py-3 text-right font-extrabold text-base text-cyan-300 font-mono">
                              {formatMoneda(data?.monto_total || data?.monto_total_cotizado)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Pie del Modal con Acciones */}
            <div className="px-6 py-4 border-t border-slate-700/80 bg-slate-900 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-400">
                {esPendiente ? (
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Propuesta en espera de veredicto administrativo
                  </span>
                ) : esAceptada ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Oferta aceptada por gerencia
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Oferta resuelta ({data?.estado_nombre || 'Evaluada'})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Cerrar
                </button>

                {/* Acciones de Evaluación (CU-53) solo si está Pendiente */}
                {esPendiente && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAbrirEvaluar('RECHAZAR')}
                      className="px-4 py-2 text-xs font-bold text-rose-300 hover:text-white bg-rose-500/20 hover:bg-rose-600 border border-rose-500/40 rounded-xl transition-all flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>Rechazar Oferta</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAbrirEvaluar('ACEPTAR')}
                      className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Aceptar Cotización</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {/* Submodal de Evaluación (CU-53) */}
      <EvaluarCotizacionModal
        isOpen={modalEvaluarOpen}
        onClose={() => setModalEvaluarOpen(false)}
        cotizacion={data}
        modo={modoEvaluacion}
        onExito={handleExitoEvaluacion}
      />
    </>
  );
}

