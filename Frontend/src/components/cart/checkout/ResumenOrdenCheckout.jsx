import React from 'react';
import { formatearMoneda } from '../../../utils/productImages';

/**
 * Subcomponente modular de Resumen de Orden para CheckoutModal (Auditoría F7 / P.2.2 #2).
 */
export const ResumenOrdenCheckout = ({
  subtotal = 0,
  descuento = 0,
  costoEnvio = 0,
  recargo = 0,
  totalFinal = 0,
  metodoEntrega = 'RETIRO'
}) => {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-tarjeta/80 p-4 space-y-2 text-sm">
      <div className="flex justify-between text-slate-300">
        <span>Subtotal productos</span>
        <span className="font-medium text-white">{formatearMoneda(subtotal)}</span>
      </div>

      {Number(descuento) > 0 && (
        <div className="flex justify-between text-emerald-400">
          <span>Descuento por beneficio</span>
          <span>- {formatearMoneda(descuento)}</span>
        </div>
      )}

      {metodoEntrega === 'ENVIO' && (
        <div className="flex justify-between text-slate-300">
          <span>Costo de envío</span>
          <span className="font-medium text-white">
            {Number(costoEnvio) > 0 ? formatearMoneda(costoEnvio) : 'Sin cargo'}
          </span>
        </div>
      )}

      {Number(recargo) > 0 && (
        <div className="flex justify-between text-amber-300">
          <span>Recargo medio de pago</span>
          <span>+ {formatearMoneda(recargo)}</span>
        </div>
      )}

      <div className="flex justify-between border-t border-slate-700 pt-2 text-base font-bold text-white">
        <span>Total a abonar</span>
        <span className="text-acento-1">{formatearMoneda(totalFinal)}</span>
      </div>
    </div>
  );
};

export default ResumenOrdenCheckout;

