import React from 'react';

/**
 * Componente reutilizable de Paginación Cyber-Tech Dark Mode (Auditoría F8 punto 3).
 * Permite navegar páginas en listados de clientes y paneles administrativos.
 */
export const Paginacion = ({
  paginaActual = 1,
  totalItems = 0,
  itemsPorPagina = 10,
  onCambiarPagina,
  onCambiarItemsPorPagina,
  opcionesPorPagina = [10, 20, 50],
  etiquetaItems = 'registros'
}) => {
  const totalPaginas = Math.max(1, Math.ceil(totalItems / itemsPorPagina));

  if (totalItems <= itemsPorPagina && paginaActual === 1) {
    return null;
  }

  const inicio = totalItems === 0 ? 0 : (paginaActual - 1) * itemsPorPagina + 1;
  const fin = Math.min(totalItems, paginaActual * itemsPorPagina);

  return (
    <nav
      aria-label="Paginación de resultados"
      className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-tarjeta/90 px-4 py-3 text-xs text-slate-300"
    >
      <div className="flex items-center gap-3">
        <span>
          Mostrando <strong className="text-white">{inicio}</strong> a{' '}
          <strong className="text-white">{fin}</strong> de{' '}
          <strong className="text-acento-1">{totalItems}</strong> {etiquetaItems}
        </span>

        {typeof onCambiarItemsPorPagina === 'function' && (
          <label className="flex items-center gap-1.5 text-slate-400">
            <span>Por página:</span>
            <select
              value={itemsPorPagina}
              onChange={(e) => onCambiarItemsPorPagina(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-fondo px-2 py-1 text-xs text-slate-200 focus:border-acento-1 focus:outline-none"
            >
              {opcionesPorPagina.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={paginaActual <= 1}
          onClick={() => onCambiarPagina(paginaActual - 1)}
          className="rounded-lg border border-slate-700 bg-fondo px-3 py-1.5 font-medium text-slate-200 transition hover:border-acento-1 hover:text-acento-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Anterior
        </button>

        <span className="px-2.5 py-1 font-semibold text-slate-200">
          Página <span className="text-acento-1">{paginaActual}</span> de {totalPaginas}
        </span>

        <button
          type="button"
          disabled={paginaActual >= totalPaginas}
          onClick={() => onCambiarPagina(paginaActual + 1)}
          className="rounded-lg border border-slate-700 bg-fondo px-3 py-1.5 font-medium text-slate-200 transition hover:border-acento-1 hover:text-acento-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
};

export default Paginacion;

