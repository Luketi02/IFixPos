import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Tabla genérica Cyber-Tech para catálogos y taxonomías.
 * Incluye:
 * 1. Ordenamiento por cualquier columna (ID, Nombre, Estado, etc.) con flechas indicadoras.
 * 2. Selección múltiple de filas con barra flotante de acciones masivas (Dar de baja masiva / Activar masivo).
 * 3. Restricción Estricta de Inmutabilidad: CERO botones de editar o borrar físico.
 */
export default function CatalogTable({
  columns = [],
  data = [],
  loading = false,
  onToggleStatus,
  statusField = 'estado_activo',
  idField = 'id',
  emptyMessage = 'No se encontraron registros en el catálogo.',
  selectedIds = [],
  onSelectionChange,
  onBulkDeactivate,
  onBulkActivate
}) {
  // Estado interno de ordenamiento
  const [sortKey, setSortKey] = useState(idField);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'

  // Manejo de clic en cabecera para ordenar
  const handleSort = (key) => {
    if (!key) return;
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Datos ordenados según la columna activa
  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const copy = [...data];
    return copy.sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      // Si es campo de estado
      if (sortKey === statusField || sortKey === 'estado') {
        valA = Boolean(a[statusField] !== undefined ? a[statusField] : a.estado);
        valB = Boolean(b[statusField] !== undefined ? b[statusField] : b.estado);
      }

      // Si es texto, comparación insensible a mayúsculas
      if (typeof valA === 'string' && typeof valB === 'string') {
        const comp = valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
        return sortDirection === 'asc' ? comp : -comp;
      }

      // Si son números o booleanos
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDirection, statusField]);

  // Manejador de selección de todas las filas
  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    const allIds = sortedData.map((item) => (item[idField] !== undefined ? item[idField] : item.id));
    if (selectedIds.length === allIds.length && allIds.length > 0) {
      onSelectionChange([]);
    } else {
      onSelectionChange(allIds);
    }
  };

  // Manejador de selección de una fila individual
  const handleToggleRow = (id) => {
    if (!onSelectionChange) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((item) => item !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center">
        <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 mb-3 animate-pulse">
          <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-300">Cargando catálogo...</p>
        <p className="text-xs text-slate-500 mt-1">Sincronizando información con el servidor</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-2xl text-slate-400 mb-3">
          🔍
        </div>
        <h4 className="text-sm font-semibold text-slate-200">Sin resultados</h4>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">{emptyMessage}</p>
      </div>
    );
  }

  const isAllSelected = sortedData.length > 0 && selectedIds.length === sortedData.length;
  const isPartiallySelected = selectedIds.length > 0 && selectedIds.length < sortedData.length;

  return (
    <div className="relative space-y-3">
      {/* Barra de Acciones Masivas Flotante (Punto 6) */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-[#1E293B] border border-cyan-500/40 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2 text-slate-200">
              <span className="w-2.5 h-2.5 rounded-full bg-[#06B6D4] animate-pulse" />
              <span className="font-bold text-cyan-300">{selectedIds.length}</span>
              <span>registro(s) seleccionado(s)</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onBulkActivate && (
                <button
                  type="button"
                  onClick={onBulkActivate}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-semibold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  title="Activar todos los registros seleccionados directamente"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Activar Seleccionados</span>
                </button>
              )}

              {onBulkDeactivate && (
                <button
                  type="button"
                  onClick={onBulkDeactivate}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-semibold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  title="Dar de baja lógica a todos los registros seleccionados"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Dar de Baja Seleccionados</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onSelectionChange && onSelectionChange([])}
                className="px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Limpiar selección
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contenedor de la Tabla */}
      <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-700/80 bg-slate-900/60 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
                {/* Checkbox para seleccionar todos */}
                {onSelectionChange && (
                  <th className="py-3.5 px-3 sm:px-4 text-center w-12">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isPartiallySelected;
                      }}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-[#06B6D4] focus:ring-1 focus:ring-[#8B5CF6] focus:ring-offset-0 cursor-pointer"
                      title={isAllSelected ? 'Deseleccionar todos' : 'Seleccionar todos los visibles'}
                    />
                  </th>
                )}

                {/* Columnas dinámicas ordenables (Punto 2) */}
                {columns.map((col, idx) => {
                  const key = col.key || idx;
                  const isCurrentSort = sortKey === key;
                  return (
                    <th
                      key={key}
                      onClick={() => col.sortable !== false && handleSort(key)}
                      className={`py-3.5 px-4 sm:px-6 ${col.className || ''} ${
                        col.sortable !== false ? 'cursor-pointer hover:text-cyan-300 transition-colors' : ''
                      }`}
                      title={col.sortable !== false ? `Ordenar por ${col.label}` : undefined}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{col.label}</span>
                        {col.sortable !== false && (
                          <span className="text-[10px] text-slate-500">
                            {isCurrentSort ? (
                              sortDirection === 'asc' ? (
                                <span className="text-cyan-400 font-bold">▲</span>
                              ) : (
                                <span className="text-cyan-400 font-bold">▼</span>
                              )
                            ) : (
                              <span className="opacity-40 hover:opacity-100">⇅</span>
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}

                {/* Columna Estado Ordenable */}
                <th
                  onClick={() => handleSort(statusField)}
                  className="py-3.5 px-4 sm:px-6 text-center cursor-pointer hover:text-cyan-300 transition-colors"
                  title="Ordenar por estado operativo"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Estado</span>
                    <span className="text-[10px] text-slate-500">
                      {sortKey === statusField ? (
                        sortDirection === 'asc' ? (
                          <span className="text-cyan-400 font-bold">▲</span>
                        ) : (
                          <span className="text-cyan-400 font-bold">▼</span>
                        )
                      ) : (
                        <span className="opacity-40">⇅</span>
                      )}
                    </span>
                  </div>
                </th>

                {/* Columna Acción Switch */}
                <th className="py-3.5 px-4 sm:px-6 text-right">Acción (Baja / Alta)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40 text-xs">
              {sortedData.map((item, rowIdx) => {
                const isItemActive =
                  item[statusField] !== undefined
                    ? Boolean(item[statusField])
                    : item.estado !== undefined
                    ? Boolean(item.estado)
                    : true;

                const itemId = item[idField] !== undefined ? item[idField] : rowIdx;
                const isSelected = selectedIds.includes(itemId);

                return (
                  <motion.tr
                    key={itemId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15, delay: Math.min(rowIdx * 0.015, 0.25) }}
                    className={`transition-colors group ${
                      isSelected
                        ? 'bg-cyan-950/20 hover:bg-cyan-950/30'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Checkbox de selección individual */}
                    {onSelectionChange && (
                      <td className="py-4 px-3 sm:px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRow(itemId)}
                          className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-[#06B6D4] focus:ring-1 focus:ring-[#8B5CF6] focus:ring-offset-0 cursor-pointer"
                        />
                      </td>
                    )}

                    {/* Celdas de datos dinámicas */}
                    {columns.map((col, colIdx) => (
                      <td key={col.key || colIdx} className={`py-4 px-4 sm:px-6 ${col.className || 'text-slate-200'}`}>
                        {col.render ? col.render(item, isItemActive) : item[col.key] || '—'}
                      </td>
                    ))}

                    {/* Estado (Pill Visual) */}
                    <td className="py-4 px-4 sm:px-6 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                          isItemActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isItemActive ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-400'
                          }`}
                        />
                        {isItemActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Única Acción Permitida: Switch / Toggle de Soft Delete */}
                    <td className="py-4 px-4 sm:px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <label
                          className="relative inline-flex items-center cursor-pointer select-none"
                          title={isItemActive ? 'Inhabilitar registro (Soft Delete)' : 'Reactivar registro directamente'}
                        >
                          <input
                            type="checkbox"
                            checked={isItemActive}
                            onChange={() => onToggleStatus && onToggleStatus(item)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-800 border border-slate-600/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#06B6D4] peer-checked:border-cyan-400 shadow-inner"></div>
                        </label>
                        <span className="text-[11px] font-medium text-slate-400 w-16 text-left">
                          {isItemActive ? 'Habilitado' : 'Baja'}
                        </span>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
