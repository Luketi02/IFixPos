import React from 'react';
import { formatearMoneda } from '../../../utils/productImages';

/**
 * Subcomponente modular de resumen de comprobante emitido en Punto de Venta Presencial (Auditoría F7 / P.2.2 #2).
 */
export const ModalComprobanteVentaPos = ({
  abierto,
  venta,
  onCerrar,
  onDescargarPdf
}) => {
  if (!abierto || !venta) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comprobante de venta presencial"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-tarjeta p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
          <h3 className="text-lg font-bold text-white">Venta Registrada con Éxito</h3>
          <span className="rounded-full bg-emerald-500/20 px-3 py-0.5 text-xs font-semibold text-emerald-300">
            {venta.estado_venta || 'PAGADA'}
          </span>
        </div>

        <div className="space-y-2 text-sm text-slate-300">
          <div className="flex justify-between">
            <span>Código de Seguridad:</span>
            <strong className="font-mono text-acento-1">{venta.codigo_sec}</strong>
          </div>
          <div className="flex justify-between">
            <span>Total Abonado:</span>
            <strong className="text-white">{formatearMoneda(venta.monto_total || venta.monto_subtotal)}</strong>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/60">
          {typeof onDescargarPdf === 'function' && (
            <button
              type="button"
              onClick={onDescargarPdf}
              className="rounded-xl bg-acento-1 px-4 py-2 text-xs font-bold text-slate-950 transition hover:brightness-110"
            >
              Descargar Comprobante PDF
            </button>
          )}
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-xl border border-slate-700 bg-fondo px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalComprobanteVentaPos;

