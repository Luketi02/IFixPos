import React from 'react';

/**
 * Componente modular para la gestión de compatibilidades técnicas de productos en IFixPos.
 * Soporta 5 modos de compatibilidad:
 * 1. MONO_MODELO: Modelo específico puntual (1 marca -> 1 modelo).
 * 2. MULTI_MODELO: Múltiples modelos específicos (N a M con chips interactivos).
 * 3. MARCAS: Compatibilidad con una o más marcas completas.
 * 4. TIPO_DISPOSITIVO: Compatibilidad genérica por formato de dispositivo.
 * 5. UNIVERSAL: Apto para cualquier equipo y marca.
 */
export default function ProductCompatibilitySection({
  formData,
  setFormData,
  marcas = [],
  modelos = [],
  tiposDispositivo = [],
  cargandoModelos = false,
  abrirModalNuevaMarca,
  abrirModalNuevoModelo
}) {
  const modoActual = formData.tipo_compatibilidad || 'MONO_MODELO';

  const cambiarModo = (nuevoModo) => {
    setFormData((prev) => {
      const esUniv = nuevoModo === 'UNIVERSAL';
      return {
        ...prev,
        tipo_compatibilidad: nuevoModo,
        es_universal: esUniv,
        // Si pasa a universal, limpiamos referencias específicas
        id_modelo: nuevoModo === 'MONO_MODELO' ? prev.id_modelo : (prev.ids_modelos_compatibles?.[0] || prev.id_modelo || '')
      };
    });
  };

  // Manejo de modelos múltiples (chips)
  const agregarModeloCompatible = (idModelo) => {
    if (!idModelo) return;
    const strId = String(idModelo);
    setFormData((prev) => {
      const actuales = (prev.ids_modelos_compatibles || []).map(String);
      if (actuales.includes(strId)) return prev;
      const nuevos = [...actuales, strId];
      return {
        ...prev,
        ids_modelos_compatibles: nuevos,
        id_modelo: prev.id_modelo || strId
      };
    });
  };

  const removerModeloCompatible = (idModelo) => {
    const strId = String(idModelo);
    setFormData((prev) => {
      const nuevos = (prev.ids_modelos_compatibles || []).map(String).filter((id) => id !== strId);
      return {
        ...prev,
        ids_modelos_compatibles: nuevos,
        id_modelo: prev.id_modelo === strId ? (nuevos[0] || '') : prev.id_modelo
      };
    });
  };

  // Manejo de marcas múltiples (chips)
  const agregarMarcaCompatible = (idMarca) => {
    if (!idMarca) return;
    const strId = String(idMarca);
    setFormData((prev) => {
      const actuales = (prev.ids_marcas_compatibles || []).map(String);
      if (actuales.includes(strId)) return prev;
      const nuevos = [...actuales, strId];
      return {
        ...prev,
        ids_marcas_compatibles: nuevos,
        id_marca: prev.id_marca || strId
      };
    });
  };

  const removerMarcaCompatible = (idMarca) => {
    const strId = String(idMarca);
    setFormData((prev) => {
      const nuevos = (prev.ids_marcas_compatibles || []).map(String).filter((id) => id !== strId);
      return {
        ...prev,
        ids_marcas_compatibles: nuevos,
        id_marca: prev.id_marca === strId ? (nuevos[0] || '') : prev.id_marca
      };
    });
  };

  return (
    <div className="sm:col-span-2 space-y-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-700/70 shadow-inner">
      {/* Encabezado de la sección */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
          <span>Ámbito de Compatibilidad Técnica</span>
        </label>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
          ⚡ Motor Inteligente
        </span>
      </div>

      {/* Botones de Selección de Modo */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {[
          { id: 'MONO_MODELO', label: 'Modelo Único', icon: '📱' },
          { id: 'MULTI_MODELO', label: 'Multi-Modelo', icon: '📑' },
          { id: 'MARCAS', label: 'Por Marca(s)', icon: '🏷️' },
          { id: 'TIPO_DISPOSITIVO', label: 'Por Formato', icon: '💻' },
          { id: 'UNIVERSAL', label: 'Universal', icon: '🌐' }
        ].map((modo) => {
          const activo = modoActual === modo.id;
          return (
            <button
              key={modo.id}
              type="button"
              onClick={() => cambiarModo(modo.id)}
              className={`px-2 py-2 rounded-xl text-xs font-medium transition-all text-center flex flex-col items-center justify-center gap-1 border cursor-pointer ${
                activo
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/70 shadow-[0_0_12px_rgba(6,182,212,0.25)] ring-1 ring-cyan-400/50'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="text-sm">{modo.icon}</span>
              <span className="text-[11px] leading-tight">{modo.label}</span>
            </button>
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* 1. MODO UNIVERSAL                                                  */}
      {/* =================================================================== */}
      {modoActual === 'UNIVERSAL' && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
          <span className="text-xl">🌐</span>
          <div className="space-y-0.5">
            <strong className="block text-emerald-200 font-semibold">Compatibilidad Universal Activa</strong>
            <p className="text-[11px] text-emerald-300/90 leading-relaxed">
              Este producto no depende de ninguna marca ni modelo específico. Será sugerido en la tienda y por el motor autónomo como accesorio universal (ej. auriculares Bluetooth, paños de microfibra, pasta térmica o cargadores multipropósito).
            </p>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. MODO MONO_MODELO (Modelo Específico)                            */}
      {/* =================================================================== */}
      {modoActual === 'MONO_MODELO' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Marca */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="id-marca-mono" className="text-xs font-semibold text-slate-300">
                Marca Comercial
              </label>
              {abrirModalNuevaMarca && (
                <button
                  type="button"
                  onClick={abrirModalNuevaMarca}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline"
                >
                  + Nueva Marca
                </button>
              )}
            </div>
            <select
              id="id-marca-mono"
              name="id_marca"
              value={formData.id_marca || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__crear_nueva_marca__' && abrirModalNuevaMarca) {
                  abrirModalNuevaMarca();
                  return;
                }
                setFormData((prev) => ({ ...prev, id_marca: val, id_modelo: '' }));
              }}
              className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-xs focus:ring-2 focus:ring-[#8B5CF6] cursor-pointer"
            >
              <option value="">Seleccione marca...</option>
              {marcas.map((m) => (
                <option key={m.id_marca} value={m.id_marca}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Modelo */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="id-modelo-mono" className="text-xs font-semibold text-slate-300">
                Modelo Específico
              </label>
              {abrirModalNuevoModelo && (
                <button
                  type="button"
                  onClick={abrirModalNuevoModelo}
                  disabled={!formData.id_marca}
                  className={`text-[11px] ${
                    formData.id_marca ? 'text-cyan-400 hover:text-cyan-300 hover:underline' : 'text-slate-600'
                  }`}
                >
                  + Nuevo Modelo
                </button>
              )}
            </div>
            <select
              id="id-modelo-mono"
              name="id_modelo"
              value={formData.id_modelo || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__crear_nuevo__' && abrirModalNuevoModelo) {
                  abrirModalNuevoModelo();
                  return;
                }
                setFormData((prev) => ({ ...prev, id_modelo: val }));
              }}
              disabled={!formData.id_marca || cargandoModelos}
              className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-xs focus:ring-2 focus:ring-[#8B5CF6] cursor-pointer disabled:opacity-50"
            >
              <option value="">
                {!formData.id_marca ? 'Seleccione marca primero...' : 'Seleccione modelo...'}
              </option>
              {modelos.map((mod) => (
                <option key={mod.id_modelo} value={mod.id_modelo}>
                  {mod.nombre}
                </option>
              ))}
            </select>
          </div>
          {!formData.id_modelo && (
            <div className="sm:col-span-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Requerido para Modo Único: Seleccione una marca y el modelo comercial correspondiente.</span>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. MODO MULTI_MODELO (Múltiples Modelos N a M)                     */}
      {/* =================================================================== */}
      {modoActual === 'MULTI_MODELO' && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Filtro de Marca */}
            <div className="space-y-1.5">
              <label htmlFor="id-marca-multi" className="text-xs font-semibold text-slate-300">
                1. Seleccione Marca para listar modelos
              </label>
              <select
                id="id-marca-multi"
                value={formData.id_marca || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, id_marca: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-xs focus:ring-2 focus:ring-[#8B5CF6] cursor-pointer"
              >
                <option value="">Todas las marcas o seleccione una...</option>
                {marcas.map((m) => (
                  <option key={m.id_marca} value={m.id_marca}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector para Añadir Modelo */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="id-add-modelo" className="text-xs font-semibold text-slate-300">
                  2. Añadir Modelo Compatible
                </label>
                {abrirModalNuevoModelo && formData.id_marca && (
                  <button
                    type="button"
                    onClick={abrirModalNuevoModelo}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline"
                  >
                    + Nuevo Modelo
                  </button>
                )}
              </div>
              <select
                id="id-add-modelo"
                onChange={(e) => {
                  agregarModeloCompatible(e.target.value);
                  e.target.value = '';
                }}
                disabled={!formData.id_marca || cargandoModelos}
                className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-xs focus:ring-2 focus:ring-cyan-400 cursor-pointer disabled:opacity-50"
              >
                <option value="">
                  {!formData.id_marca ? 'Seleccione marca primero...' : '+ Seleccione modelo para agregar...'}
                </option>
                {modelos
                  .filter((m) => !(formData.ids_modelos_compatibles || []).map(String).includes(String(m.id_modelo)))
                  .map((mod) => (
                    <option key={mod.id_modelo} value={mod.id_modelo}>
                      {mod.nombre}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Chips de Modelos Seleccionados */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <span className="text-[11px] font-mono uppercase text-slate-400 block font-semibold">
              Modelos compatibles asignados ({formData.ids_modelos_compatibles?.length || 0}):
            </span>
            {(!formData.ids_modelos_compatibles || formData.ids_modelos_compatibles.length === 0) ? (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>Aún no has agregado modelos. Elige una marca y añade al menos un modelo compatible.</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {formData.ids_modelos_compatibles.map((idMod) => {
                  const modObj = modelos.find((m) => String(m.id_modelo) === String(idMod));
                  const nombre = modObj ? modObj.nombre : `Modelo #${idMod}`;
                  return (
                    <span
                      key={idMod}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 font-medium"
                    >
                      <span>📱 {nombre}</span>
                      <button
                        type="button"
                        onClick={() => removerModeloCompatible(idMod)}
                        className="text-cyan-400 hover:text-rose-400 transition-colors cursor-pointer text-xs ml-0.5"
                        title="Quitar modelo compatible"
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 4. MODO MARCAS (Por Marcas Completas)                              */}
      {/* =================================================================== */}
      {modoActual === 'MARCAS' && (
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <label htmlFor="id-add-marca" className="text-xs font-semibold text-slate-300">
              Añadir Marcas Compatibles
            </label>
            <select
              id="id-add-marca"
              onChange={(e) => {
                agregarMarcaCompatible(e.target.value);
                e.target.value = '';
              }}
              className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-xs focus:ring-2 focus:ring-violet-400 cursor-pointer"
            >
              <option value="">+ Seleccione marca para agregar...</option>
              {marcas
                .filter((m) => !(formData.ids_marcas_compatibles || []).map(String).includes(String(m.id_marca)))
                .map((m) => (
                  <option key={m.id_marca} value={m.id_marca}>
                    {m.nombre}
                  </option>
                ))}
            </select>
          </div>

          {/* Chips de Marcas Seleccionadas */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <span className="text-[11px] font-mono uppercase text-slate-400 block font-semibold">
              Marcas compatibles asignadas ({formData.ids_marcas_compatibles?.length || 0}):
            </span>
            {(!formData.ids_marcas_compatibles || formData.ids_marcas_compatibles.length === 0) ? (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>Aún no has agregado marcas. Añade al menos una marca compatible a la lista.</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {formData.ids_marcas_compatibles.map((idMar) => {
                  const marObj = marcas.find((m) => String(m.id_marca) === String(idMar));
                  const nombre = marObj ? marObj.nombre : `Marca #${idMar}`;
                  return (
                    <span
                      key={idMar}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-violet-500/15 text-violet-200 border border-violet-500/30 font-medium"
                    >
                      <span>🏷️ {nombre}</span>
                      <button
                        type="button"
                        onClick={() => removerMarcaCompatible(idMar)}
                        className="text-violet-400 hover:text-rose-400 transition-colors cursor-pointer text-xs ml-0.5"
                        title="Quitar marca"
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 5. MODO TIPO_DISPOSITIVO (Por Formato)                             */}
      {/* =================================================================== */}
      {modoActual === 'TIPO_DISPOSITIVO' && (
        <div className="space-y-2 pt-1">
          <label htmlFor="id-tipo-disp-modo" className="text-xs font-semibold text-slate-300">
            Formato / Tipo de Dispositivo Compatible
          </label>
          <select
            id="id-tipo-disp-modo"
            name="id_tipo_dispositivo"
            value={formData.id_tipo_dispositivo || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, id_tipo_dispositivo: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-xs focus:ring-2 focus:ring-[#8B5CF6] cursor-pointer"
          >
            <option value="">Seleccione formato de dispositivo...</option>
            {tiposDispositivo.map((t) => (
              <option key={t.id_tipo_dispositivo} value={t.id_tipo_dispositivo}>
                {t.nombre}
              </option>
            ))}
          </select>
          {!formData.id_tipo_dispositivo && (
            <p className="text-[11px] text-amber-400 flex items-center gap-1.5 font-medium">
              <span>⚠️</span>
              <span>Requerido: Debe seleccionar un formato o tipo de dispositivo compatible.</span>
            </p>
          )}
          <p className="text-[11px] text-slate-400 italic">
            El producto será sugerido para cualquier dispositivo del formato seleccionado (ej. cualquier Celular o cualquier Notebook), sin importar la marca.
          </p>
        </div>
      )}
    </div>
  );
}

