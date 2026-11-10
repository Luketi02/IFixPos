import React from 'react';

/**
 * Subcomponente modular para selección de beneficios/cupones activos en el Checkout (Auditoría F7 / P.2.2 #2).
 */
export const SelectorBeneficioCheckout = ({
  beneficios = [],
  beneficioSeleccionadoId = '',
  onSeleccionarBeneficio,
  deshabilitado = false
}) => {
  if (!Array.isArray(beneficios) || beneficios.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-3.5 space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-acento-2">
        Beneficio o Cupón Disponible
      </label>
      <select
        value={beneficioSeleccionadoId || ''}
        disabled={deshabilitado}
        onChange={(e) => onSeleccionarBeneficio(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-lg border border-slate-700 bg-fondo px-3 py-2 text-sm text-slate-100 focus:border-acento-2 focus:outline-none"
      >
        <option value="">No aplicar beneficio en esta compra</option>
        {beneficios.map((b) => (
          <option key={b.id_beneficio} value={b.id_beneficio}>
            {b.porcentaje_descuento || b.por_desc}% OFF — {b.motivo}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SelectorBeneficioCheckout;

