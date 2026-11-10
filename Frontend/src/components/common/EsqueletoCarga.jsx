import React from 'react';

/**
 * Esqueletos de carga (Skeletons) con estética Cyber-Tech Dark Mode (Auditoría F.4.6 / Regla 6).
 * Evitan saltos bruscos de layout (CLS) mientras se resuelven las peticiones asíncronas.
 */
export const EsqueletoTarjetas = ({ cantidad = 6, columnas = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' }) => {
  const indices = Array.from({ length: cantidad }, (_, i) => `skeleton-card-${i}`);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Cargando contenido..."
      className={`grid ${columnas} gap-5`}
    >
      {indices.map((id) => (
        <div
          key={id}
          className="rounded-2xl border border-slate-700/60 bg-tarjeta p-5 shadow-lg animate-pulse"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="h-5 w-1/3 rounded-md bg-slate-700/70" />
            <div className="h-6 w-20 rounded-full bg-slate-700/60" />
          </div>
          <div className="mb-3 h-4 w-3/4 rounded bg-slate-700/60" />
          <div className="mb-5 h-3 w-1/2 rounded bg-slate-800" />
          <div className="flex items-center justify-between border-t border-slate-700/50 pt-4">
            <div className="h-4 w-24 rounded bg-slate-700/50" />
            <div className="h-8 w-28 rounded-lg bg-slate-700/70" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const EsqueletoTabla = ({ filas = 5, columnas = 5 }) => {
  const idsFilas = Array.from({ length: filas }, (_, i) => `skeleton-row-${i}`);
  const idsCols = Array.from({ length: columnas }, (_, j) => `skeleton-col-${j}`);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Cargando registros..."
      className="w-full overflow-hidden rounded-xl border border-slate-700/60 bg-tarjeta animate-pulse"
    >
      <div className="border-b border-slate-700/60 bg-slate-800/70 px-4 py-3 flex gap-4">
        {idsCols.map((cid) => (
          <div key={cid} className="h-4 flex-1 rounded bg-slate-700/70" />
        ))}
      </div>
      <div className="divide-y divide-slate-800">
        {idsFilas.map((rid) => (
          <div key={rid} className="flex items-center gap-4 px-4 py-3.5">
            {idsCols.map((cid) => (
              <div key={`${rid}-${cid}`} className="h-3.5 flex-1 rounded bg-slate-700/50" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EsqueletoTarjetas;

