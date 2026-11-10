import React from 'react';

/**
 * Subcomponente modular de Ponderaciones del Algoritmo Inteligente de Taller
 * para AdminConfigScreen (Auditoría F7 / P.2.2 #2).
 */
export const SeccionPonderacionesTaller = ({
  ponderaciones = {},
  onChangePonderacion
}) => {
  const items = [
    { clave: 'pesoAsignacion_CargaLaboral', etiqueta: 'Carga Laboral Activa (%)' },
    { clave: 'pesoAsignacion_Calificacion', etiqueta: 'Calificación de Clientes (%)' },
    { clave: 'pesoAsignacion_Rapidez', etiqueta: 'Rapidez de Resolución (%)' },
    { clave: 'pesoAsignacion_Especialidad', etiqueta: 'Especialidad en Categoría (%)' },
    { clave: 'pesoAsignacion_Efectividad', etiqueta: 'Tasa de Efectividad (%)' }
  ];

  const sumaTotal = items.reduce(
    (acc, item) => acc + (Number(ponderaciones[item.clave]) || 0),
    0
  );

  return (
    <div className="rounded-xl border border-slate-700/60 bg-tarjeta p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">
          Ponderaciones de Asignación Automática de Técnicos
        </h4>
        <span
          className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
            sumaTotal === 100
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-amber-500/20 text-amber-300'
          }`}
        >
          Total: {sumaTotal}%
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {items.map((item) => (
          <label key={item.clave} className="block space-y-1">
            <span className="text-xs text-slate-400">{item.etiqueta}</span>
            <input
              type="number"
              min="0"
              max="100"
              value={ponderaciones[item.clave] ?? 0}
              onChange={(e) => onChangePonderacion(item.clave, Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-fondo px-3 py-1.5 text-sm text-white focus:border-acento-1 focus:outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  );
};

export default SeccionPonderacionesTaller;

