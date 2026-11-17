import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  formatearEstadoReparacion,
  obtenerColorBadgeEstado,
  desglosarItemsComentarioBitacora
} from '../../utils/repairStatus';
import { resolverUrlImagen } from '../../utils/imagenes';

/**
 * Modal de Inspección Detallada de Eventos de Bitácora.
 * Permite a Clientes, Técnicos y Administradores auditar:
 * - El estado alcanzado y la transición técnica.
 * - Fecha, hora y responsable de la actualización.
 * - Mensaje y justificación completa.
 * - Evidencias fotográficas (con visor lightbox a pantalla completa).
 * - Detalles financieros y de pagos vinculados al hito.
 */
export default function DetalleBitacoraModal({
  isOpen,
  onClose,
  registro,
  reparacion = null,
  imagenesRespaldo = []
}) {
  const [fotoAmpliada, setFotoAmpliada] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (fotoAmpliada) {
          setFotoAmpliada(null);
        } else if (isOpen) {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, fotoAmpliada, onClose]);

  if (!isOpen || !registro) return null;

  // 1. Determinar datos del estado y desglosar ítems del mensaje
  const estadoNombre = registro.estado_nombre || registro.estado_alcanzado_nombre || 'Actualización de Orden';
  const estiloEstadoBadge = obtenerColorBadgeEstado(estadoNombre, true);
  const itemsMensaje = desglosarItemsComentarioBitacora(registro.comentario);

  // 2. Determinar imágenes vinculadas
  // Prioriza las imágenes específicas del registro; si es evento de recepción, incluye las de respaldo de la reparación
  const comentarioLower = (registro.comentario || '').toLowerCase();
  const esEventoRecepcion =
    registro.estado_alcanzado === 2 ||
    registro.estado_alcanzado === 10 ||
    comentarioLower.includes('recepcionado') ||
    comentarioLower.includes('físico:') ||
    comentarioLower.includes('fisico:');

  const imagenes = (registro.imagenes && registro.imagenes.length > 0)
    ? registro.imagenes
    : (esEventoRecepcion && imagenesRespaldo.length > 0 ? imagenesRespaldo : []);

  // 3. Determinar información de pago
  const pagoInfo = registro.pago || null;

  // 4. Datos del dispositivo y orden
  const dispMarca = reparacion?.dispositivo?.marca || '';
  const dispModelo = reparacion?.dispositivo?.modelo || '';
  const dispNombre = `${dispMarca} ${dispModelo}`.trim() || 'Dispositivo en Servicio';
  const dispSerie = reparacion?.dispositivo?.numero_serie || 'Sin registrar';
  const codigoOrden = reparacion?.codigo_sec || (reparacion?.id_reparacion ? `REP-${reparacion.id_reparacion}` : '');

  // 5. Formateo de fecha y hora
  const fechaTexto = registro.fecha || (registro.fecha_hora ? String(registro.fecha_hora).split(' ')[0] : 'No registrada');
  const horaTexto = registro.hora || (registro.fecha_hora ? String(registro.fecha_hora).split(' ')[1] : '');

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-2xl bg-[#0F172A] border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabecera del Modal */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-lg shadow-sm">
                🔍
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Inspección de Registro de Bitácora</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Trazabilidad técnica, evidencias físicas y transacciones del evento
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-slate-700"
              title="Cerrar ventana (Esc)"
            >
              ✕
            </button>
          </div>

          {/* Cuerpo con Scroll Estilizado */}
          <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
            
            {/* 1. Tarjeta de Estado y Metadatos de la Transición */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    Estado Alcanzado:
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${estiloEstadoBadge}`}>
                    {formatearEstadoReparacion(estadoNombre)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                  <span className="text-cyan-400">🕒</span>
                  <span>{fechaTexto}</span>
                  {horaTexto && <span className="text-slate-400">a las {horaTexto} hs</span>}
                </div>
              </div>

              {/* Responsable del Evento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-slate-400">
                <div>
                  <span className="text-slate-500 block text-[11px]">Responsable del Registro:</span>
                  <span className="text-slate-200 font-semibold">
                    {registro.tecnico || registro.usuario || 'Sistema IFixPos'}
                  </span>
                </div>
                {registro.rol_usuario && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Rol en el Sistema:</span>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                      {registro.rol_usuario}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Desglose por Ítems del Mensaje y Justificación Técnica */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>📝</span>
                  <span>Desglose de Información del Evento</span>
                </h4>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                  {itemsMensaje.length} {itemsMensaje.length === 1 ? 'ítem registrado' : 'ítems registrados'}
                </span>
              </div>
              <div className="space-y-2">
                {itemsMensaje.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/90 flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3"
                  >
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400 shrink-0 sm:min-w-[160px] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                      <span>{item.etiqueta}:</span>
                    </span>
                    <span className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans break-words">
                      {item.valor}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Evidencias Fotográficas de Recepción */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>📷</span>
                  <span>Evidencias y Respaldo Fotográfico</span>
                </h4>
                <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded">
                  {imagenes.length} {imagenes.length === 1 ? 'fotografía' : 'fotografías'}
                </span>
              </div>

              {imagenes.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center text-xs text-slate-500 italic">
                  No se asociaron fotografías físicas a este hito de la bitácora.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {imagenes.map((imgItem, idx) => {
                    const urlImg = resolverUrlImagen(imgItem.imagen);
                    return (
                      <div
                        key={imgItem.id_imagen_recepcion || idx}
                        onClick={() => setFotoAmpliada(imgItem)}
                        className="group relative bg-slate-900/80 border border-slate-800 hover:border-cyan-500/60 rounded-xl p-2.5 transition-all cursor-pointer shadow-md hover:shadow-cyan-950/30"
                      >
                        <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-slate-950 mb-2 border border-slate-800/80">
                          {urlImg ? (
                            <img
                              src={urlImg}
                              alt={imgItem.descripcion || 'Evidencia fotográfica'}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
                              Imagen no disponible
                            </div>
                          )}
                          <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="px-2.5 py-1 rounded-lg bg-cyan-500/90 text-slate-950 text-xs font-bold shadow-lg">
                              🔍 Ampliar Foto
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-200 font-medium line-clamp-2" title={imgItem.descripcion}>
                          {imgItem.descripcion || 'Constatación física del dispositivo en mostrador'}
                        </p>
                        {imgItem.fecha_subida && (
                          <span className="text-[10px] font-mono text-slate-500 block mt-1">
                            Capturada: {imgItem.fecha_subida}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Transacción Financiera y Pagos (si aplica) */}
            {pagoInfo && (
              <div className="space-y-2 pt-1">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>💳</span>
                  <span>Transacción Financiera Acreditada</span>
                </h4>
                <div className="bg-gradient-to-br from-slate-900 via-slate-900/90 to-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-mono text-emerald-400 uppercase font-bold block">
                        Monto Abonado
                      </span>
                      <span className="text-2xl font-black font-mono text-emerald-300 tracking-tight">
                        ${Number(pagoInfo.monto_pagado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-mono uppercase text-slate-400 block">Medio de Pago</span>
                      <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        {pagoInfo.medio_pago || 'Efectivo'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-slate-800">
                    <div>
                      <span className="text-slate-500 block text-[11px]">N° Transacción / Comprobante:</span>
                      <span className="text-slate-200 font-semibold">{pagoInfo.cod_operacion || 'N/A'}</span>
                    </div>
                    {pagoInfo.fecha_pago && (
                      <div>
                        <span className="text-slate-500 block text-[11px]">Fecha de Pago:</span>
                        <span className="text-slate-300">{pagoInfo.fecha_pago}</span>
                      </div>
                    )}
                  </div>

                  {pagoInfo.detalle && (
                    <p className="text-xs text-slate-400 font-mono italic bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                      {pagoInfo.detalle}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 5. Ficha Resumida del Equipo y Orden */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Dispositivo:</span>
                <span className="text-slate-200 font-bold">{dispNombre}</span>
                <span className="text-slate-400 ml-1.5">• N. Serie: {dispSerie}</span>
              </div>
              {codigoOrden && (
                <div className="text-right">
                  <span className="text-slate-500 block text-[10px] uppercase">Código de Orden:</span>
                  <span className="text-cyan-400 font-bold">{codigoOrden}</span>
                </div>
              )}
            </div>

          </div>

          {/* Pie del Modal */}
          <div className="flex items-center justify-end px-5 py-3.5 border-t border-slate-800 bg-slate-900/60">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer"
            >
              Cerrar Inspección
            </button>
          </div>
        </motion.div>

        {/* Visor Lightbox a Pantalla Completa para Fotografías */}
        {fotoAmpliada && (
          <div
            className="fixed inset-0 z-60 bg-black/90 backdrop-blur-lg flex flex-col items-center justify-center p-4"
            onClick={() => setFotoAmpliada(null)}
          >
            <div className="relative max-w-4xl max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setFotoAmpliada(null)}
                className="absolute -top-10 right-0 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg transition-colors cursor-pointer"
              >
                ✕ Cerrar Foto (Esc)
              </button>

              <img
                src={resolverUrlImagen(fotoAmpliada.imagen)}
                alt={fotoAmpliada.descripcion || 'Evidencia fotográfica ampliada'}
                className="max-w-full max-h-[75vh] object-contain rounded-xl border border-cyan-500/40 shadow-2xl"
              />

              <div className="mt-3 text-center bg-slate-900/90 border border-slate-800 px-4 py-2 rounded-xl max-w-lg">
                <p className="text-xs sm:text-sm text-white font-medium">
                  {fotoAmpliada.descripcion || 'Constatación física de recepción en mostrador'}
                </p>
                {fotoAmpliada.fecha_subida && (
                  <span className="text-[11px] font-mono text-cyan-400 block mt-0.5">
                    Fecha de Captura: {fotoAmpliada.fecha_subida}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
}
