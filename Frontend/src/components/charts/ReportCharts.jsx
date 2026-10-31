import React, { useState, useMemo } from 'react';

// ==============================================================================
// PALETA CROMÁTICA CYBER-TECH
// ==============================================================================
const COLORES_DEFAULT = [
  '#06B6D4', // Cyan
  '#10B981', // Emerald
  '#8B5CF6', // Purple / Violet
  '#F59E0B', // Amber
  '#F43F5E', // Rose
  '#3B82F6', // Blue
  '#14B8A6', // Teal
  '#A855F7'  // Fuchsia
];

// ==============================================================================
// 1. EMBUDO COMERCIAL DE CONVERSIÓN (SALES FUNNEL CHART - CU-72)
// ==============================================================================
export function FunnelChart({
  etapas,
  stages,
  data,
  titulo
}) {
  const [etapaHover, setEtapaHover] = useState(null);
  const items = etapas || stages || data || [];

  if (!items || items.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 text-xs font-mono">
        Sin datos suficientes para proyectar el embudo de conversión.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {titulo && (
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📉</span>
            <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono">
              {titulo}
            </h4>
          </div>
          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded-full">
            Embudo Comercial
          </span>
        </div>
      )}

      <div className="space-y-3 pt-1">
        {items.map((etapa, idx) => {
          const anchoPct = Math.max(25, Math.min(100, Number(etapa.porcentaje) || 100));
          const esAceptado = String(etapa.label || '').toLowerCase().includes('aceptad');
          const esRechazado =
            String(etapa.label || '').toLowerCase().includes('rechazad') ||
            String(etapa.label || '').toLowerCase().includes('fuga');

          return (
            <div
              key={idx}
              onMouseEnter={() => setEtapaHover(etapa)}
              onMouseLeave={() => setEtapaHover(null)}
              className="group cursor-pointer transition-all"
            >
              {/* Encabezado de Renglón */}
              <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                <span className="font-semibold text-slate-200 group-hover:text-white transition-colors">
                  {idx + 1}. {etapa.label}
                </span>
                <div className="flex items-center gap-3">
                  {etapa.monto && (
                    <span className="text-slate-400 text-[11px]">{etapa.monto}</span>
                  )}
                  <span
                    className={`font-black ${
                      esAceptado
                        ? 'text-emerald-400'
                        : esRechazado
                        ? 'text-rose-400'
                        : 'text-cyan-400'
                    }`}
                  >
                    {etapa.valor} ({etapa.porcentaje}%)
                  </span>
                </div>
              </div>

              {/* Barra / Trapecio del Embudo */}
              <div className="w-full bg-slate-900/80 rounded-xl h-8 p-1 overflow-hidden border border-slate-800 flex items-center">
                <div
                  className={`h-full rounded-lg transition-all duration-700 relative overflow-hidden flex items-center px-3 shadow-md ${
                    esAceptado
                      ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400'
                      : esRechazado
                      ? 'bg-gradient-to-r from-rose-500 via-rose-600 to-red-500'
                      : 'bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-500'
                  }`}
                  style={{ width: `${anchoPct}%` }}
                >
                  <span className="text-[10px] font-black font-mono text-slate-950 uppercase tracking-wider truncate">
                    {etapa.desc || etapa.label}
                  </span>
                  <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {etapaHover && (
        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center justify-between animate-fade-in">
          <span>{etapaHover.desc || etapaHover.label}:</span>
          <span className="text-white font-bold">{etapaHover.monto || `${etapaHover.valor} presupuestos`}</span>
        </div>
      )}
    </div>
  );
}

// ==============================================================================
// 2. GRÁFICO DONUT / CIRCULAR (DONUT CHART - CU-72 / CU-73 / CU-75)
// ==============================================================================
export function DonutChart({
  datos,
  data,
  items,
  titulo,
  centroLabel = 'Total',
  totalLabel,
  centroValor = ''
}) {
  const rawList = datos || data || items || [];

  const list = useMemo(() => {
    if (!rawList || rawList.length === 0) return [];
    const sumValores = rawList.reduce((acc, i) => acc + (Number(i.valor ?? i.value ?? 0) || 0), 0) || 1;

    return rawList.map((item, idx) => {
      const v = Number(item.valor ?? item.value ?? 0) || 0;
      const pct = item.porcentaje !== undefined
        ? Number(item.porcentaje)
        : (v / sumValores) * 100;
      return {
        label: item.label || `Item ${idx + 1}`,
        valor: item.valorFormatted || item.valor || v,
        porcentaje: pct,
        color: item.color || COLORES_DEFAULT[idx % COLORES_DEFAULT.length]
      };
    });
  }, [rawList]);

  if (list.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 text-xs font-mono">
        Sin datos disponibles para el desglose circular.
      </div>
    );
  }

  const radio = 40;
  const circunferencia = 2 * Math.PI * radio;
  let offsetAcumulado = 0;

  return (
    <div className="space-y-4">
      {titulo && (
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🍩</span>
            <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono">
              {titulo}
            </h4>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-around gap-6 pt-2">
        {/* SVG Donut */}
        <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={radio}
              className="text-slate-800"
              strokeWidth="12"
              stroke="currentColor"
              fill="transparent"
            />
            {list.map((item, idx) => {
              const pct = Math.max(0, Math.min(100, Number(item.porcentaje) || 0));
              const strokeDash = (pct / 100) * circunferencia;
              const strokeOffset = -offsetAcumulado;
              offsetAcumulado += strokeDash;

              return (
                <circle
                  key={idx}
                  cx="50"
                  cy="50"
                  r={radio}
                  stroke={item.color}
                  strokeWidth="12"
                  strokeDasharray={`${strokeDash} ${circunferencia - strokeDash}`}
                  strokeDashoffset={strokeOffset}
                  fill="transparent"
                  strokeLinecap="round"
                  className="transition-all duration-700 hover:opacity-80"
                />
              );
            })}
          </svg>

          {/* Centro del Donut */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              {totalLabel || centroLabel}
            </span>
            {centroValor && (
              <span className="text-xs font-black text-white font-mono truncate max-w-[85px]">
                {centroValor}
              </span>
            )}
          </div>
        </div>

        {/* Leyenda de Datos */}
        <div className="space-y-2 flex-1 max-w-xs w-full">
          {list.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 truncate max-w-[65%]">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-slate-300 truncate" title={item.label}>
                  {item.label}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-white font-bold">{item.valor}</span>
                <span className="text-slate-500 text-[11px] ml-1.5 font-semibold">
                  ({Number(item.porcentaje || 0).toFixed(1)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==============================================================================
// 3. GRÁFICO DE BARRAS HORIZONTALES (HORIZONTAL BAR CHART - TODAS LAS MÉTRICAS)
// ==============================================================================
export function HorizontalBarChart({
  items,
  data,
  datos,
  titulo,
  unidad = '',
  unit = '',
  color = '#06B6D4',
  maxValor = null
}) {
  const rawList = items || data || datos || [];
  const sufijo = unidad || unit || '';

  const list = useMemo(() => {
    if (!rawList || rawList.length === 0) return [];
    return rawList.map((i, idx) => {
      const v = Number(i.valor ?? i.val ?? i.value ?? 0);
      return {
        label: i.label || `Registro ${idx + 1}`,
        valor: v,
        valorFormateado: i.valorFormateado || (sufijo ? `${v} ${sufijo}` : `${v}`),
        subtitulo: i.subtitulo || i.sublabel || '',
        color: i.color || color
      };
    });
  }, [rawList, sufijo, color]);

  if (list.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 text-xs font-mono">
        Sin datos para la escala comparativa.
      </div>
    );
  }

  const maximo = maxValor || Math.max(...list.map((i) => i.valor), 1);

  return (
    <div className="space-y-4">
      {titulo && (
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📊</span>
            <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono">
              {titulo}
            </h4>
          </div>
          {sufijo && (
            <span className="text-[11px] font-mono text-slate-400">
              Escala: {sufijo}
            </span>
          )}
        </div>
      )}

      <div className="space-y-3 pt-1">
        {list.map((item, idx) => {
          const pct = Math.max(4, Math.min(100, (item.valor / maximo) * 100));

          return (
            <div key={idx} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 truncate max-w-[70%]">
                  <span className="text-slate-500 text-[11px]">{idx + 1}.</span>
                  <span className="font-semibold text-slate-200 truncate" title={item.label}>
                    {item.label}
                  </span>
                  {item.subtitulo && (
                    <span className="text-[10px] text-slate-500 hidden sm:inline truncate">
                      ({item.subtitulo})
                    </span>
                  )}
                </div>
                <span className="font-bold text-white font-mono shrink-0">
                  {item.valorFormateado}
                </span>
              </div>

              {/* Barra */}
              <div className="w-full bg-slate-900/80 rounded-full h-2.5 overflow-hidden border border-slate-800">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: item.color
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==============================================================================
// 4. GRÁFICO COMPARATIVO DOBLE MÉTRICA (DUAL BAR CHART - CU-73 / CU-74 / CU-75)
// ==============================================================================
export function DualBarChart({
  items,
  data,
  datos,
  titulo,
  metrica1Nombre,
  labelA,
  metrica2Nombre,
  labelB,
  colorA = '#06B6D4',
  colorB = '#10B981',
  formatterA,
  formatterB
}) {
  const rawList = items || data || datos || [];
  const nombreA = labelA || metrica1Nombre || 'Métrica A';
  const nombreB = labelB || metrica2Nombre || 'Métrica B';

  const list = useMemo(() => {
    if (!rawList || rawList.length === 0) return [];
    return rawList.map((i, idx) => {
      const v1 = Number(i.val1 ?? i.valA ?? 0);
      const v2 = Number(i.val2 ?? i.valB ?? 0);
      return {
        label: i.label || `Ítem ${idx + 1}`,
        val1: v1,
        val1Label: i.val1Label || (formatterA ? formatterA(v1) : String(v1)),
        val2: v2,
        val2Label: i.val2Label || (formatterB ? formatterB(v2) : String(v2))
      };
    });
  }, [rawList, formatterA, formatterB]);

  if (list.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 text-xs font-mono">
        Sin datos para la comparación dual de variables.
      </div>
    );
  }

  const maxVal1 = Math.max(...list.map((i) => i.val1), 1);
  const maxVal2 = Math.max(...list.map((i) => i.val2), 1);

  return (
    <div className="space-y-4">
      {/* Cabecera opcional y Leyenda de métricas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        {titulo ? (
          <div className="flex items-center gap-2">
            <span className="text-base">⚖️</span>
            <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono">
              {titulo}
            </h4>
          </div>
        ) : <div />}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorA }} />
            <span className="text-slate-300">{nombreA}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorB }} />
            <span className="text-slate-300">{nombreB}</span>
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-1">
        {list.map((item, idx) => {
          const pct1 = Math.max(3, Math.min(100, (item.val1 / maxVal1) * 100));
          const pct2 = Math.max(3, Math.min(100, (item.val2 / maxVal2) * 100));

          return (
            <div key={idx} className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-xs font-bold text-white font-mono truncate block" title={item.label}>
                {item.label}
              </span>

              {/* Barra 1 */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">{nombreA}</span>
                  <span className="font-bold text-cyan-400">{item.val1Label}</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct1}%`,
                      backgroundColor: colorA
                    }}
                  />
                </div>
              </div>

              {/* Barra 2 */}
              <div className="space-y-0.5 pt-0.5">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">{nombreB}</span>
                  <span className="font-bold text-emerald-400">{item.val2Label}</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct2}%`,
                      backgroundColor: colorB
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==============================================================================
// 5. HISTOGRAMA DE ESTRELLAS DE CALIDAD (STAR HISTOGRAM CHART - CU-76)
// ==============================================================================
export function StarHistogramChart({
  distribucion,
  distribution,
  total,
  titulo
}) {
  const dist = distribucion || distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const estrellas = [5, 4, 3, 2, 1];
  const totalCalculado = total !== undefined ? total : Object.values(dist).reduce((a, b) => a + Number(b || 0), 0);
  const maxCount = Math.max(...Object.values(dist).map(v => Number(v || 0)), 1);

  return (
    <div className="space-y-4">
      {titulo && (
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">⭐</span>
            <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono">
              {titulo}
            </h4>
          </div>
          <span className="text-[11px] font-mono text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-full">
            {totalCalculado} opiniones
          </span>
        </div>
      )}

      <div className="space-y-2.5 pt-1">
        {estrellas.map((star) => {
          const cantidad = Number(dist[star] || 0);
          const pct = totalCalculado > 0 ? (cantidad / totalCalculado) * 100 : 0;
          const barraPct = Math.max(cantidad > 0 ? 5 : 0, Math.min(100, (cantidad / maxCount) * 100));
          const esCritico = star <= 3;

          return (
            <div key={star} className="flex items-center gap-3 text-xs font-mono">
              {/* Etiqueta de Estrellas */}
              <div className="w-14 flex items-center justify-end gap-1">
                <span className="font-bold text-white">{star}</span>
                <span className="text-amber-400 text-sm">★</span>
              </div>

              {/* Barra de Frecuencia */}
              <div className="flex-1 bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    star >= 4
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : star === 3
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                      : 'bg-gradient-to-r from-rose-500 to-red-500'
                  }`}
                  style={{ width: `${barraPct}%` }}
                />
              </div>

              {/* Cantidad y Porcentaje */}
              <div className="w-20 text-right flex items-center justify-end gap-1.5 shrink-0">
                <span className={`font-bold ${esCritico && cantidad > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                  {cantidad}
                </span>
                <span className="text-slate-500 text-[10px]">
                  ({pct.toFixed(0)}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
