import { useState } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import DetalleCotizacionModal from './DetalleCotizacionModal';

export default function DetalleSolicitudModal({
  isOpen,
  onClose,
  solicitud,
  cargando = false,
  onModificar,
  onEliminar
}) {
  const [tokenCopiado, setTokenCopiado] = useState('');
  const [cotizacionAInspeccionarId, setCotizacionAInspeccionarId] = useState(null);
  const [modalCotizOpen, setModalCotizOpen] = useState(false);

  if (!isOpen) return null;

  const copiarEnlaceProveedor = (linkRelativo) => {
    if (!linkRelativo) return;
    const urlCompleta = `${window.location.origin}${linkRelativo}`;
    navigator.clipboard.writeText(urlCompleta);
    setTokenCopiado(linkRelativo);
    setTimeout(() => setTokenCopiado(''), 3000);
  };

  const obtenerBadgeEstado = (estadoNum, estadoTexto) => {
    switch (Number(estadoNum)) {
      case 0:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {estadoTexto || 'Borrador'}
          </span>
        );
      case 1:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            {estadoTexto || 'Enviada a Proveedores'}
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {estadoTexto || 'Cotizada'}
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            {estadoTexto || 'Rechazada'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            {estadoTexto || 'Cerrada / Evaluada'}
          </span>
        );
    }
  };

  const obtenerBadgeEstadoCotizacion = (estadoTexto) => {
    const txt = (estadoTexto || '').toLowerCase();
    if (txt.includes('cotizada')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Cotizada
        </span>
      );
    }
    if (txt.includes('aceptada')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          Aceptada
        </span>
      );
    }
    if (txt.includes('rechazada') || txt.includes('declinada') || txt.includes('descartada')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
          {estadoTexto}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        {estadoTexto || 'Pendiente de Evaluación'}
      </span>
    );
  };

  const esBorrador = Number(solicitud?.estado_solicitud) === 0;
  const listaProductos = Array.isArray(solicitud?.productos) ? solicitud.productos : [];
  const listaCotizaciones = Array.isArray(solicitud?.cotizaciones)
    ? solicitud.cotizaciones
    : Array.isArray(solicitud?.matriz_ofertas)
    ? solicitud.matriz_ofertas
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="bg-[#1E293B] border border-cyan-500/30 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-auto"
      >
        {/* Cabecera del Modal */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#0F172A]/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 block">
                Pliego de Sondeo de Mercado B2B
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white">
                Solicitud de Cotización #{solicitud?.id_solicitud}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {cargando ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-400 font-mono">
                Cargando expediente completo de la solicitud...
              </p>
            </div>
          ) : (
            <>
              {/* Tarjeta de Metadatos de la Solicitud */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#0F172A]/80 border border-slate-800 rounded-2xl p-4">
                <div className="space-y-1">
                  <span className="text-[11px] font-mono uppercase text-slate-400 block">
                    Fecha de Emisión
                  </span>
                  <div className="text-sm font-bold text-white">
                    {solicitud?.fecha_emision || 'No definida'}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-mono uppercase text-slate-400 block">
                    Origen / Destino
                  </span>
                  <div className="text-xs font-medium text-slate-200">
                    {solicitud?.sol_tec
                      ? 'Requerimiento Técnico Taller'
                      : 'Abastecimiento General de Stock'}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-mono uppercase text-slate-400 block">
                    Estado General
                  </span>
                  <div>
                    {obtenerBadgeEstado(solicitud?.estado_solicitud, solicitud?.estado)}
                  </div>
                </div>
              </div>

              {/* Sección 1: Insumos y Repuestos Requeridos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-2">
                    <span>📦</span>
                    <span>Insumos y Repuestos Requeridos ({listaProductos.length})</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    Pliego de Especificaciones Técnicas
                  </span>
                </div>

                {listaProductos.length === 0 ? (
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 text-center text-xs text-slate-500 italic">
                    No se especificaron insumos para esta solicitud.
                  </div>
                ) : (
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80">
                    {listaProductos.map((p, idx) => (
                      <div
                        key={p.id_solicitud_producto || idx}
                        className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-cyan-400">#{idx + 1}</span>
                            <span className="text-sm font-bold text-white">
                              {p.nombre_producto}
                            </span>
                            {p.es_manual ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                Sondeo Manual
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                Catálogo General
                              </span>
                            )}
                          </div>
                          {p.descripcion && (
                            <p className="text-xs text-slate-300 font-mono leading-relaxed">
                              {p.descripcion}
                            </p>
                          )}
                          {p.categoria && (
                            <p className="text-[11px] text-slate-400">
                              Categoría: <span className="text-slate-300">{p.categoria}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sección 2: Padrón de Proveedores y Matriz de Ofertas Recibidas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-2">
                    <span>🏢</span>
                    <span>Padrón de Proveedores y Matriz de Ofertas Recibidas ({listaCotizaciones.length})</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    Estado de Respuestas y Enlaces Seguros
                  </span>
                </div>

                {esBorrador ? (
                  <div className="bg-[#0F172A] border border-amber-500/30 rounded-xl p-5 flex items-start gap-4">
                    <span className="text-2xl">📝</span>
                    <div className="space-y-1.5 text-xs">
                      <div className="font-bold text-amber-300 text-sm">
                        Solicitud en Estado Borrador
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        Esta solicitud de cotización se encuentra actualmente resguardada en estado Borrador.
                        Los enlaces criptográficos seguros de respuesta y las invitaciones formales por correo se
                        generarán automáticamente en el momento en que se emita formalmente hacia el mercado.
                      </p>
                      {onModificar && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => onModificar(solicitud)}
                            className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold text-xs border border-amber-400/40 transition-all flex items-center gap-2 cursor-pointer"
                          >
                            <span>✏</span>
                            <span>Editar Ítems y Proveedores del Borrador</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : listaCotizaciones.length === 0 ? (
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 text-center text-xs text-slate-400">
                    No se registran invitaciones despachadas para este pliego.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {listaCotizaciones.map((cot, idx) => {
                      const prov = cot.proveedor || {};
                      const linkCompleto = cot.link_acceso
                        ? `${window.location.origin}${cot.link_acceso}`
                        : '';

                      return (
                        <div
                          key={cot.id_invitacion || cot.id_cotizacion || idx}
                          className="bg-[#0F172A] border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 space-y-4 transition-all"
                        >
                          {/* Encabezado del Proveedor */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800/80 pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-white">
                                  {prov.nombre_proveedor || prov.nombre || 'Proveedor Invitado'}
                                </h4>
                                {prov.nivel && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                                    {prov.nivel}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 font-mono mt-0.5">
                                CUIT: {prov.cuit_prov || prov.cuit} • Correo: {prov.correo || 'Sin correo'} {prov.telefono ? `• Tel: ${prov.telefono}` : ''}
                              </div>
                            </div>

                            <div>
                              {obtenerBadgeEstadoCotizacion(cot.estado)}
                            </div>
                          </div>

                          {/* Datos Técnicos de la Cotización */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div className="bg-[#1E293B]/60 p-3 rounded-lg border border-slate-800/80">
                              <span className="text-[11px] font-mono text-slate-400 block mb-0.5">
                                Plazo de Entrega Prometido
                              </span>
                              <span className="font-semibold text-white">
                                {cot.tiempo_promesa && Number(cot.tiempo_promesa) > 0
                                  ? `${cot.tiempo_promesa} días corridos`
                                  : 'Pendiente de cotización'}
                              </span>
                            </div>

                            <div className="bg-[#1E293B]/60 p-3 rounded-lg border border-slate-800/80">
                              <span className="text-[11px] font-mono text-slate-400 block mb-0.5">
                                Validez de Precios Ofrecidos
                              </span>
                              <span className="font-semibold text-white">
                                {cot.fecha_validez || 'No especificada'}
                              </span>
                            </div>

                            <div className="bg-[#1E293B]/60 p-3 rounded-lg border border-slate-800/80 flex flex-col justify-center">
                              <span className="text-[11px] font-mono text-slate-400 block mb-0.5">
                                Presupuesto Formal (PDF)
                              </span>
                              {cot.archivo_adjunto ? (
                                <a
                                  href={cot.archivo_adjunto}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-cyan-400 hover:text-cyan-300 font-bold inline-flex items-center gap-1 text-xs"
                                >
                                  <span>📄</span>
                                  <span>Ver Documento Adjunto</span>
                                </a>
                              ) : (
                                <span className="text-slate-500 italic text-[11px]">
                                  Sin archivo adjunto
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Comentarios u Observaciones del Proveedor */}
                          {cot.comentarios && (
                            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs">
                              <span className="text-slate-400 font-mono block text-[11px] mb-1">
                                Comentarios / Observaciones del Proveedor:
                              </span>
                              <p className="text-slate-200 italic">{cot.comentarios}</p>
                            </div>
                          )}

                          {/* Enlace Seguro de Respuesta para el Proveedor */}
                          {cot.link_acceso && (
                            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <span className="text-[11px] font-mono uppercase text-cyan-400 block mb-1">
                                  Enlace Criptográfico Seguro de Acceso para el Proveedor
                                </span>
                                <div className="text-xs font-mono text-slate-300 truncate bg-[#0F172A] px-3 py-1.5 rounded-lg border border-slate-800">
                                  {linkCompleto}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => copiarEnlaceProveedor(cot.link_acceso)}
                                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-cyan-500/30 transition-all cursor-pointer shrink-0"
                              >
                                {tokenCopiado === cot.link_acceso
                                  ? '✓ Enlace Seguro Copiado'
                                  : 'Copiar Enlace Seguro'}
                              </button>
                            </div>
                          )}

                          {/* Botón para Inspeccionar y Evaluar Cotización (CU-52 / CU-53) */}
                          {cot.id_cotizacion && (
                            <div className="pt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setCotizacionAInspeccionarId(cot.id_cotizacion);
                                  setModalCotizOpen(true);
                                }}
                                className="px-3.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span>Inspeccionar Cotización y Precios</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Pie del Modal */}
        <div className="px-6 py-4 border-t border-slate-800 bg-[#0F172A]/90 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            Cerrar Consulta
          </button>

          {esBorrador && (
            <div className="flex flex-wrap items-center gap-3">
              {onEliminar && (
                <button
                  type="button"
                  onClick={() => onEliminar(solicitud)}
                  className="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>🗑</span>
                  <span>Eliminar Solicitud</span>
                </button>
              )}

              {onModificar && (
                <button
                  type="button"
                  onClick={() => onModificar(solicitud)}
                  className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>✏</span>
                  <span>Modificar Solicitud</span>
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Modal de Inspección de Cotización recibida (CU-52 / CU-53) */}
      <DetalleCotizacionModal
        isOpen={modalCotizOpen}
        onClose={() => setModalCotizOpen(false)}
        idCotizacion={cotizacionAInspeccionarId}
      />
    </div>
  );
}

DetalleSolicitudModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  solicitud: PropTypes.object,
  cargando: PropTypes.bool,
  onModificar: PropTypes.func,
  onEliminar: PropTypes.func
};
