import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../../context/useAuth';
import AdminSidebar from '../../../components/navigation/AdminSidebar';
import AdminHeader from '../../../components/navigation/AdminHeader';
import { FunnelChart, DonutChart, HorizontalBarChart } from '../../../components/charts/ReportCharts';
import { exportarInformePDF } from '../../../utils/reportPrinter';
import { API_BASE_URL } from '../../../config/api';
import { formatearMoneda, formatearPorcentaje } from '../../../utils/productImages';

// Generador de fechas auxiliares en formato YYYY-MM-DD
const obtenerFechaFormato = (d) => {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
};

export default function AdminConversionReportScreen() {
  const { token, user } = useAuth();

  // ============================================================================
  // ESTADOS DE PARÁMETROS TEMPORALES Y SEGMENTACIÓN (PASOS 2 Y 3)
  // ============================================================================
  const hoy = useMemo(() => new Date(), []);
  const haceTreintaDias = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);

  const [fechaInicio, setFechaInicio] = useState(obtenerFechaFormato(haceTreintaDias));
  const [fechaFin, setFechaFin] = useState(obtenerFechaFormato(hoy));
  const [idCategoria, setIdCategoria] = useState('');
  const [categorias, setCategorias] = useState([]);
  const [cargandoCategorias, setCargandoCategorias] = useState(false);

  // Estados de datos del reporte
  const [datosReporte, setDatosReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [sinDatos, setSinDatos] = useState(false);
  const [mensajeSinDatos, setMensajeSinDatos] = useState('');
  const [alerta, setAlerta] = useState(null);
  const [copiado, setCopiado] = useState(false);

  // ============================================================================
  // GESTIÓN DE ALERTAS SUAVES (REGLA 6)
  // ============================================================================
  const dispararAlerta = useCallback((tipo, mensaje) => {
    setAlerta({ tipo, mensaje });
    setTimeout(() => {
      setAlerta(null);
    }, 6000);
  }, []);

  // ============================================================================
  // CARGA DE CATEGORÍAS DE REPARACIÓN PARA EL SELECTOR
  // ============================================================================
  useEffect(() => {
    const cargarCategorias = async () => {
      if (!token) return;
      setCargandoCategorias(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/workshop/categorias-reparacion/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const items = Array.isArray(res.data) ? res.data : [];
        setCategorias(items.filter((c) => c.estado_activo !== false));
      } catch (err) {
        console.warn('No fue posible cargar las categorías de reparación:', err);
      } finally {
        setCargandoCategorias(false);
      }
    };
    cargarCategorias();
  }, [token]);

  // ============================================================================
  // CONSULTA Y ANÁLISIS DEL EMBUDO DE CONVERSIÓN (PASOS 4, 5 Y 6)
  // ============================================================================
  const consultarReporteConversion = useCallback(
    async (overrideParams = {}) => {
      const fInicio = overrideParams.fecha_inicio !== undefined ? overrideParams.fecha_inicio : fechaInicio;
      const fFin = overrideParams.fecha_fin !== undefined ? overrideParams.fecha_fin : fechaFin;
      const cat = overrideParams.id_categoria !== undefined ? overrideParams.id_categoria : idCategoria;

      // Paso 4: Validación de coherencia del rango temporal
      if (!fInicio || !fFin) {
        dispararAlerta('error', 'Debes definir obligatoriamente la Fecha de Inicio y la Fecha de Fin para el análisis.');
        return;
      }

      if (fInicio > fFin) {
        dispararAlerta(
          'error',
          'La fecha de inicio (Desde) no puede ser cronológicamente posterior a la fecha de fin (Hasta).'
        );
        return;
      }

      setCargando(true);
      setSinDatos(false);
      setMensajeSinDatos('');

      try {
        const params = {
          fecha_inicio: fInicio,
          fecha_fin: fFin
        };
        if (cat && cat !== '') {
          params.id_categoria = Number(cat);
        }

        const res = await axios.get(`${API_BASE_URL}/api/workshop/reportes/conversion/`, {
          headers: { Authorization: `Bearer ${token}` },
          params
        });

        setDatosReporte(res.data);
      } catch (err) {
        console.error('Error al generar reporte de conversión de presupuestos:', err);
        const detalleError = err.response?.data?.error || err.response?.data?.detail;
        const textoError = typeof detalleError === 'object' ? JSON.stringify(detalleError) : String(detalleError || '');

        // Paso 5: Excepción de ausencia de actividad comercial (evita división por cero)
        if (
          err.response?.status === 400 &&
          (textoError.includes('No se ha emitido ningún presupuesto') || textoError.includes('sin presupuesto'))
        ) {
          setSinDatos(true);
          setMensajeSinDatos(
            textoError || 'No se ha emitido ningún presupuesto ni diagnóstico técnico en el periodo temporal solicitado.'
          );
          setDatosReporte(null);
        } else {
          dispararAlerta('error', textoError || 'Ocurrió un error al procesar el reporte de conversión.');
        }
      } finally {
        setCargando(false);
      }
    },
    [token, fechaInicio, fechaFin, idCategoria, dispararAlerta]
  );

  // Ejecución inicial automática al montar el componente
  useEffect(() => {
    consultarReporteConversion();
  }, [consultarReporteConversion]);

  // ============================================================================
  // ATAJOS RÁPIDOS DE HORIZONTE TEMPORAL
  // ============================================================================
  const aplicarAtajoTemporal = (tipo) => {
    const ahora = new Date();
    let desde = new Date();

    if (tipo === '30_DIAS') {
      desde.setDate(ahora.getDate() - 30);
    } else if (tipo === 'MES_ACTUAL') {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    } else if (tipo === '90_DIAS') {
      desde.setDate(ahora.getDate() - 90);
    } else if (tipo === 'ANIO_ACTUAL') {
      desde = new Date(ahora.getFullYear(), 0, 1);
    }

    const strDesde = obtenerFechaFormato(desde);
    const strHasta = obtenerFechaFormato(ahora);

    setFechaInicio(strDesde);
    setFechaFin(strHasta);
    consultarReporteConversion({ fecha_inicio: strDesde, fecha_fin: strHasta });
  };

  const handleRestablecerFiltros = () => {
    const strDesde = obtenerFechaFormato(haceTreintaDias);
    const strHasta = obtenerFechaFormato(hoy);
    setFechaInicio(strDesde);
    setFechaFin(strHasta);
    setIdCategoria('');
    consultarReporteConversion({ fecha_inicio: strDesde, fecha_fin: strHasta, id_categoria: '' });
  };

  // ============================================================================
  // COPIAR RESUMEN GERENCIAL AL PORTAPAPELES
  // ============================================================================
  const handleCopiarResumen = () => {
    if (!datosReporte) return;
    const { macro, periodo } = datosReporte;
    const texto = `=== INFORME GERENCIAL: CONVERSIÓN DE PRESUPUESTOS ===\n` +
      `Período Analizado: ${periodo?.fecha_inicio} al ${periodo?.fecha_fin}\n` +
      `--------------------------------------------------------\n` +
      `• Total Presupuestado: ${formatearMoneda(macro?.total_presupuestado)} (${macro?.total_presupuestos} presupuestos)\n` +
      `• Tasa de Aceptación (Conversión): ${formatearPorcentaje(macro?.tasa_conversion)} (${macro?.total_aceptados} aprobados - ${formatearMoneda(macro?.monto_aceptado)})\n` +
      `• Tasa de Fuga: ${formatearPorcentaje(macro?.tasa_fuga)} (${macro?.total_rechazados} desestimados)\n` +
      `• Lucro Cesante (Capital Perdido): ${formatearMoneda(macro?.lucro_cesante)}\n` +
      `• Presupuestos Pendientes: ${macro?.total_pendientes} (${formatearMoneda(macro?.monto_pendiente)})\n` +
      `========================================================`;
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  // Extracción de macro y micro para facilitar renderizado
  const macro = datosReporte?.macro;
  const micro = datosReporte?.micro || [];

  // ============================================================================
  // CÁLCULO DE GRÁFICOS VISUALES (CU-72: EMBUDO, DONUT Y RANKING)
  // ============================================================================
  const funnelStages = useMemo(() => {
    if (!macro) return [];
    return [
      {
        label: 'Presupuestos Emitidos',
        valor: macro.total_presupuestos,
        porcentaje: 100,
        monto: formatearMoneda(macro.total_presupuestado),
        desc: 'Universo Total de Cotizaciones'
      },
      {
        label: 'Presupuestos Aceptados',
        valor: macro.total_aceptados,
        porcentaje: Number(macro.tasa_conversion || 0).toFixed(1),
        monto: formatearMoneda(macro.monto_aceptado),
        desc: 'Conversión Comercial Confirmada'
      },
      {
        label: 'Fuga Comercial (Rechazados)',
        valor: macro.total_rechazados,
        porcentaje: Number(macro.tasa_fuga || 0).toFixed(1),
        monto: formatearMoneda(macro.lucro_cesante),
        desc: 'Lucro Cesante por Desestimación'
      }
    ];
  }, [macro]);

  const donutMonetario = useMemo(() => {
    if (!macro || Number(macro.total_presupuestado) <= 0) return [];
    const tot = Number(macro.total_presupuestado) || 1;
    const aceptado = Number(macro.monto_aceptado) || 0;
    const lucro = Number(macro.lucro_cesante) || 0;
    const pendiente = Number(macro.monto_pendiente) || 0;

    return [
      {
        label: 'Capital Aceptado',
        valor: formatearMoneda(aceptado),
        porcentaje: (aceptado / tot) * 100,
        color: '#10B981'
      },
      {
        label: 'Lucro Cesante',
        valor: formatearMoneda(lucro),
        porcentaje: (lucro / tot) * 100,
        color: '#F43F5E'
      },
      {
        label: 'En Evaluación',
        valor: formatearMoneda(pendiente),
        porcentaje: (pendiente / tot) * 100,
        color: '#F59E0B'
      }
    ];
  }, [macro]);

  const rankingRechazoCategorias = useMemo(() => {
    if (!micro || micro.length === 0) return [];
    return [...micro]
      .sort((a, b) => Number(b.tasa_rechazo ?? 0) - Number(a.tasa_rechazo ?? 0))
      .map((c) => {
        const tasa = Number(c.tasa_rechazo ?? 0);
        const rech = c.total_rechazados ?? 0;
        const tot = c.total_presupuestos ?? 0;
        return {
          label: c.nombre_categoria,
          valor: tasa,
          valorFormateado: formatearPorcentaje(tasa),
          subtitulo: `${rech} de ${tot} rechazados`,
          color: tasa > 40 ? '#F43F5E' : tasa > 20 ? '#F59E0B' : '#10B981'
        };
      });
  }, [micro]);

  // ============================================================================
  // EXPORTACIÓN A PDF EJECUTIVO SIN PÁGINAS EN BLANCO
  // ============================================================================
  const handleExportarPDF = () => {
    if (!datosReporte || !macro) return;

    const kpis = [
      { label: 'Volumen Cotizado', valor: `${macro.total_presupuestos} casos`, detalle: formatearMoneda(macro.total_presupuestado) },
      { label: 'Tasa Aceptación', valor: formatearPorcentaje(macro.tasa_conversion), detalle: `${macro.total_aceptados} aprobados (${formatearMoneda(macro.monto_aceptado)})` },
      { label: 'Lucro Cesante (Fuga)', valor: formatearMoneda(macro.lucro_cesante), detalle: `Tasa Fuga: ${formatearPorcentaje(macro.tasa_fuga)} (${macro.total_rechazados} rechazados)` },
      { label: 'En Evaluación', valor: `${macro.total_pendientes} casos`, detalle: formatearMoneda(macro.monto_pendiente) }
    ];

    const filasCategorias = micro.map((c) => {
      const tot = c.total_presupuestos ?? 0;
      const acep = c.total_aceptados ?? 0;
      const rech = c.total_rechazados ?? 0;
      const tasa = Number(c.tasa_rechazo ?? 0);
      return [
        c.nombre_categoria,
        String(tot),
        String(acep),
        String(rech),
        formatearPorcentaje(tasa),
        tasa > 40 ? 'Fuga Crítica (>40%)' : tasa > 20 ? 'Alerta Media (>20%)' : 'Aceptación Alta'
      ];
    });

    const tablas = [
      {
        titulo: 'Desglose y Fricción por Categoría de Reparación',
        columnas: ['Categoría / Rubro', 'Cotizados', 'Aceptados', 'Rechazados', 'Tasa Rechazo', 'Diagnóstico Comercial'],
        filas: filasCategorias
      }
    ];

    let desgloseTexto = '';
    micro.forEach((c) => {
      const tot = c.total_presupuestos ?? 0;
      const acep = c.total_aceptados ?? 0;
      const rech = c.total_rechazados ?? 0;
      const tasa = Number(c.tasa_rechazo ?? 0);
      desgloseTexto += `  • ${c.nombre_categoria}: ${tot} cotizaciones | ${acep} aceptados | ${rech} rechazados (${formatearPorcentaje(tasa)} rechazo)\n`;
    });

    const resumenTexto = `=== INFORME GERENCIAL: CONVERSIÓN DE PRESUPUESTOS Y EMBUDO DE TALLER ===\n` +
      `Período Analizado: ${fechaInicio} al ${fechaFin}\n` +
      `--------------------------------------------------------\n` +
      `• Total Presupuestado: ${macro.total_presupuestos} órdenes (${formatearMoneda(macro.total_presupuestado)})\n` +
      `• Presupuestos Confirmados (Aceptados): ${macro.total_aceptados} (${formatearPorcentaje(macro.tasa_conversion)})\n` +
      `• Facturación Asegurada: ${formatearMoneda(macro.monto_aceptado)}\n` +
      `• Tasa de Fuga Comercial: ${formatearPorcentaje(macro.tasa_fuga)}\n` +
      `• Lucro Cesante (Capital Perdido): ${formatearMoneda(macro.lucro_cesante)}\n` +
      `• En Evaluación: ${macro.total_pendientes} órdenes (${formatearMoneda(macro.monto_pendiente)})\n` +
      `--------------------------------------------------------\n` +
      `Comportamiento por Rubro Técnico:\n${desgloseTexto}`;

    const nombreEjecutor =
      [user?.nombre, user?.apellido].filter(Boolean).join(' ').trim() ||
      user?.email ||
      'Usuario Autenticado';

    exportarInformePDF({
      titulo: 'Reporte de Conversión de Presupuestos (Embudo de Taller)',
      subtitulo: 'Evaluación de efectividad comercial, embudo de ventas y cuantificación de lucro cesante',
      periodo: `${fechaInicio} al ${fechaFin}`,
      kpis,
      tablas,
      resumenTexto,
      usuario: { nombre: nombreEjecutor, email: user?.email || '' }
    });
  };

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-sans overflow-hidden">
      {/* 1. Barra Lateral de Navegación */}
      <AdminSidebar activeMenu="metrics-conversion" />

      {/* 2. Área de Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <AdminHeader
          category="Métricas y Análisis"
          subcategory="Embudo de Taller"
          pageName="Conversión de Presupuestos"
          title="Reporte de Conversión de Presupuestos"
        />

        {/* Alerta flotante Cyber-Tech */}
        <AnimatePresence>
          {alerta && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className={`mx-6 mt-4 p-4 rounded-xl border flex items-center justify-between text-sm shadow-xl z-20 ${
                alerta.tipo === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{alerta.tipo === 'success' ? '✓' : '⚠'}</span>
                <span className="font-medium">{alerta.mensaje}</span>
              </div>
              <button
                type="button"
                onClick={() => setAlerta(null)}
                className="text-xs px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* Encabezado Principal y Acciones de Exportación */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
                  Inteligencia de Negocios &middot; Taller
                </span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Conversión de Presupuestos &middot; Embudo de Ventas
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Evaluación de la efectividad comercial del taller, nivel de aceptación global, fuga de capital (lucro cesante) y análisis segmentado por tipo de servicio.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {datosReporte && (
                <>
                  <button
                    type="button"
                    onClick={handleCopiarResumen}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Copiar resumen al portapapeles"
                  >
                    <span>{copiado ? '✓' : '📋'}</span>
                    <span>{copiado ? 'Copiado' : 'Copiar Resumen'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportarPDF}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-cyan-950/20"
                    title="Descargar o imprimir informe ejecutivo oficial en PDF"
                  >
                    <span>📄</span>
                    <span>Descargar PDF</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => consultarReporteConversion()}
                disabled={cargando}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 text-xs font-mono font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                <span>{cargando ? '🔄' : '⚡'}</span>
                <span>{cargando ? 'Analizando...' : 'Actualizar'}</span>
              </button>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* PANEL DE FILTROS Y PARÁMETROS TEMPORALES (PASOS 2, 3 Y 4)             */}
          {/* ===================================================================== */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">🗓️</span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Horizonte Temporal & Segmentación de Servicios
                </h3>
              </div>

              {/* Botones de Atajos Temporales Rápidos */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono text-slate-400 uppercase mr-1">Atajos:</span>
                <button
                  type="button"
                  onClick={() => aplicarAtajoTemporal('30_DIAS')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700 text-[11px] font-mono transition-colors cursor-pointer"
                >
                  Últimos 30 días
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtajoTemporal('MES_ACTUAL')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700 text-[11px] font-mono transition-colors cursor-pointer"
                >
                  Mes Actual
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtajoTemporal('90_DIAS')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700 text-[11px] font-mono transition-colors cursor-pointer"
                >
                  Últimos 90 días
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtajoTemporal('ANIO_ACTUAL')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700 text-[11px] font-mono transition-colors cursor-pointer"
                >
                  Año Actual
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                consultarReporteConversion();
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end"
            >
              {/* 1. Fecha de Inicio (Obligatoria) */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Fecha de Inicio <span className="text-cyan-400 font-bold">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* 2. Fecha de Fin (Obligatoria) */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Fecha de Fin <span className="text-cyan-400 font-bold">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* 3. Categoría de Reparación (Opcional) */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Categoría de Reparación
                </label>
                <select
                  value={idCategoria}
                  onChange={(e) => setIdCategoria(e.target.value)}
                  disabled={cargandoCategorias}
                  className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
                >
                  <option value="">Todas las Categorías</option>
                  {categorias.map((cat) => (
                    <option key={cat.id_categoria} value={cat.id_categoria}>
                      {cat.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Botones de Filtrado */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRestablecerFiltros}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer text-center"
                >
                  Restablecer
                </button>
                <button
                  type="submit"
                  disabled={cargando}
                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 text-xs font-bold font-mono uppercase tracking-wider shadow-lg shadow-cyan-500/25 active:scale-95 transition-all disabled:opacity-50 cursor-pointer text-center"
                >
                  {cargando ? 'Calculando...' : 'Analizar'}
                </button>
              </div>
            </form>
          </section>

          {/* ===================================================================== */}
          {/* ESTADO DE CARGA                                                       */}
          {/* ===================================================================== */}
          {cargando && (
            <div className="py-20 text-center space-y-3 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl">
              <div className="inline-block w-9 h-9 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-mono text-slate-400">
                Procesando universo de presupuestos y calculando tasas de conversión...
              </p>
            </div>
          )}

          {/* ===================================================================== */}
          {/* EXCEPCIÓN PASO 5: UNIVERSO VACÍO (SIN ACTIVIDAD DE PRESUPUESTOS)      */}
          {/* ===================================================================== */}
          {!cargando && sinDatos && (
            <div className="py-16 px-6 text-center space-y-4 bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-3xl">
                📉
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="text-lg font-bold text-white tracking-tight">
                  Sin actividad comercial de presupuestos
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {mensajeSinDatos || 'En el periodo temporal solicitado no se emitió ningún presupuesto técnico en el sistema.'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => aplicarAtajoTemporal('90_DIAS')}
                  className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-semibold transition-all cursor-pointer"
                >
                  Explorar Últimos 90 días
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtajoTemporal('ANIO_ACTUAL')}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono font-semibold transition-all cursor-pointer"
                >
                  Año Completo
                </button>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TABLERO DE INDICADORES: NIVEL MACRO & EMBUDO (PASOS 5 & 7)            */}
          {/* ===================================================================== */}
          {!cargando && !sinDatos && macro && (
            <>
              {/* 4 Tarjetas KPI de Nivel Macro (Financiero) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Volumen Total Presupuestado */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Volumen Cotizado</span>
                    <span className="text-base">📋</span>
                  </div>
                  <p className="text-2xl font-black font-mono text-white tracking-tight">
                    {macro.total_presupuestos}{' '}
                    <span className="text-xs font-normal text-slate-400">equipos</span>
                  </p>
                  <p className="text-sm font-bold font-mono text-cyan-400 mt-1">
                    {formatearMoneda(macro.total_presupuestado)}
                  </p>
                  <span className="text-[10px] text-slate-500 mt-2 block border-t border-slate-800/80 pt-2">
                    Masa total de órdenes cotizadas en el periodo
                  </span>
                </div>

                {/* 2. Tasa de Aceptación Global (Conversión) */}
                <div className="bg-[#1E293B] border border-emerald-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-colors bg-gradient-to-br from-[#1E293B] to-emerald-950/20">
                  <div className="flex items-center justify-between text-emerald-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Tasa de Aceptación</span>
                    <span className="text-base">🎯</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                      {formatearPorcentaje(macro.tasa_conversion)}
                    </p>
                    <span className="text-xs font-mono text-emerald-300">
                      ({macro.total_aceptados} aprobados)
                    </span>
                  </div>
                  <p className="text-sm font-bold font-mono text-emerald-300 mt-1">
                    {formatearMoneda(macro.monto_aceptado)}
                  </p>
                  <span className="text-[10px] text-emerald-400/80 mt-2 block border-t border-emerald-900/40 pt-2">
                    Capital comercial confirmado y en ejecución
                  </span>
                </div>

                {/* 3. Fuga de Capital (Lucro Cesante) */}
                <div className="bg-[#1E293B] border border-rose-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-rose-500/50 transition-colors bg-gradient-to-br from-[#1E293B] to-rose-950/20">
                  <div className="flex items-center justify-between text-rose-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Lucro Cesante (Fuga)</span>
                    <span className="text-base">⚠️</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-black font-mono text-rose-400 tracking-tight">
                      {formatearMoneda(macro.lucro_cesante)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono text-rose-300">
                      Tasa de Fuga: {formatearPorcentaje(macro.tasa_fuga)}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      ({macro.total_rechazados} rechazados)
                    </span>
                  </div>
                  <span className="text-[10px] text-rose-400/80 mt-2 block border-t border-rose-900/40 pt-2">
                    Capital desestimado por rechazo de clientes
                  </span>
                </div>

                {/* 4. En Decisión (Pendientes) */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between text-amber-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>En Evaluación</span>
                    <span className="text-base">⏳</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-black font-mono text-amber-300 tracking-tight">
                      {macro.total_pendientes}{' '}
                      <span className="text-xs font-normal text-slate-400">equipos</span>
                    </p>
                    <span className="text-xs font-mono text-slate-400">
                      ({macro.total_presupuestos > 0 ? ((macro.total_pendientes / macro.total_presupuestos) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                  <p className="text-sm font-bold font-mono text-amber-400 mt-1">
                    {formatearMoneda(macro.monto_pendiente)}
                  </p>
                  <span className="text-[10px] text-slate-500 mt-2 block border-t border-slate-800/80 pt-2">
                    A la espera de respuesta del cliente
                  </span>
                </div>
              </div>

              {/* ================================================================= */}
              {/* ===================================================================== */}
              {/* SUITE DE GRÁFICOS VISUALES ANALÍTICOS (CU-72)                       */}
              {/* ===================================================================== */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>📉</span> Embudo de Conversión Comercial
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Tránsito desde la cotización hasta la confirmación de la reparación o fuga
                      </p>
                    </div>
                  </div>
                  <FunnelChart etapas={funnelStages} />
                </div>

                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>🍩</span> Distribución Monetaria del Presupuesto
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Proporción de capital asegurado vs lucro cesante por presupuestos desestimados
                      </p>
                    </div>
                  </div>
                  <DonutChart
                    datos={donutMonetario}
                    totalLabel="Total Cotizado"
                    centroValor={formatearMoneda(macro.total_presupuestado)}
                  />
                </div>
              </div>

              {rankingRechazoCategorias.length > 0 && (
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>📊</span> Ranking de Rechazo por Rubro Técnico
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Porcentaje de fuga comercial y desestimación por categoría de reparación
                      </p>
                    </div>
                  </div>
                  <HorizontalBarChart
                    items={rankingRechazoCategorias}
                    unidad="%"
                  />
                </div>
              )}

              {/* EMBUDO DE CONVERSIÓN VISUAL (FUNNEL PIPELINE)                      */}
              {/* ================================================================= */}
              <section className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Diagrama del Embudo de Ventas del Taller
                    </h3>
                    <p className="text-xs text-slate-400">
                      Visualización proporcional de tránsito: de presupuestos cotizados hacia aceptación o fuga comercial.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Aceptados
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Rechazados
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Pendientes
                    </span>
                  </div>
                </div>

                {/* Barras Proporcionales del Embudo */}
                <div className="space-y-4 pt-1">
                  {/* Etapa 1: Base total */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1.5">
                      <span className="text-slate-300 font-bold">1. Presupuestos Emitidos (Universo 100%)</span>
                      <span className="text-cyan-400 font-bold">
                        {macro.total_presupuestos} casos &middot; {formatearMoneda(macro.total_presupuestado)}
                      </span>
                    </div>
                    <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                      <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full w-full" />
                    </div>
                  </div>

                  {/* Etapa 2: Aceptados */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1.5">
                      <span className="text-emerald-400 font-bold">
                        2. Presupuestos Aceptados ({formatearPorcentaje(macro.tasa_conversion)})
                      </span>
                      <span className="text-emerald-300">
                        {macro.total_aceptados} aprobados &middot; {formatearMoneda(macro.monto_aceptado)}
                      </span>
                    </div>
                    <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, Math.max(0, Number(macro.tasa_conversion)))}%` }}
                      />
                    </div>
                  </div>

                  {/* Etapa 3: Rechazados (Fuga) */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1.5">
                      <span className="text-rose-400 font-bold">
                        3. Presupuestos Rechazados &middot; Fuga ({formatearPorcentaje(macro.tasa_fuga)})
                      </span>
                      <span className="text-rose-300">
                        {macro.total_rechazados} desestimados &middot; Lucro Cesante: {formatearMoneda(macro.lucro_cesante)}
                      </span>
                    </div>
                    <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-orange-500 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, Math.max(0, Number(macro.tasa_fuga)))}%` }}
                      />
                    </div>
                  </div>

                  {/* Etapa 4: Pendientes */}
                  {macro.total_pendientes > 0 && (
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1.5">
                        <span className="text-amber-400 font-bold">
                          4. En Decisión del Cliente ({macro.total_presupuestos > 0 ? ((macro.total_pendientes / macro.total_presupuestos) * 100).toFixed(2) : 0}%)
                        </span>
                        <span className="text-amber-300">
                          {macro.total_pendientes} en espera &middot; {formatearMoneda(macro.monto_pendiente)}
                        </span>
                      </div>
                      <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(100, Math.max(0, (macro.total_pendientes / macro.total_presupuestos) * 100))}%`
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ================================================================= */}
              {/* TABLERO DE NIVEL MICRO: COMPORTAMIENTO POR RUBRO (PASO 6 & 7)      */}
              {/* ================================================================= */}
              <section className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-4">
                <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">🔬</span>
                      <h3 className="text-base font-bold text-white tracking-tight">
                        Análisis de Nivel Micro &middot; Comportamiento por Categoría
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400">
                      Tasa de rechazo y aceptación segmentada por rubro técnico. Cuantificación estricta de incidencias (equipos).
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-mono text-cyan-300">
                    {micro.length} rubro(s) evaluados
                  </span>
                </div>

                {/* Nota metodológica según comentarios CU-72 */}
                <div className="mx-5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2.5">
                  <span className="text-cyan-400 text-sm mt-0.5">ℹ️</span>
                  <p className="leading-relaxed">
                    <strong className="text-slate-200">Principio de Consistencia Contable:</strong> En el análisis de comportamiento por rubro se cuantifican estrictamente incidencias (volumen de equipos), omitiendo la suma de importes monetarios por categoría para evitar duplicaciones contables cuando una reparación abarca múltiples fallas.
                  </p>
                </div>

                {micro.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 font-mono">
                    No se registran diagnósticos asociados a categorías específicas en este corte.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-700/80 bg-slate-900/60 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                          <th className="py-3 px-5">Categoría de Reparación</th>
                          <th className="py-3 px-4 text-center">Incidencias (Equipos)</th>
                          <th className="py-3 px-4 text-center">Aceptados</th>
                          <th className="py-3 px-4 text-center">Rechazados</th>
                          <th className="py-3 px-4">Tasa de Rechazo (Fuga)</th>
                          <th className="py-3 px-4 text-center">Diagnóstico Comercial</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {micro.map((cat, idx) => {
                          const rechazoNum = Number(cat.tasa_rechazo) || 0;
                          const esBajoRechazo = rechazoNum <= 20;
                          const esModerado = rechazoNum > 20 && rechazoNum <= 40;

                          return (
                            <tr key={cat.id_categoria || idx} className="hover:bg-slate-800/40 transition-colors">
                              {/* Nombre de la categoría */}
                              <td className="py-3.5 px-5 font-semibold text-white whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                                  <span>{cat.nombre_categoria || 'General / Sin Categoría'}</span>
                                </div>
                              </td>

                              {/* Total de Presupuestos / Incidencias */}
                              <td className="py-3.5 px-4 font-mono font-bold text-center text-slate-200">
                                {cat.total_presupuestos}
                              </td>

                              {/* Aceptados */}
                              <td className="py-3.5 px-4 font-mono text-center text-emerald-400 font-semibold">
                                {cat.total_aceptados}
                              </td>

                              {/* Rechazados */}
                              <td className="py-3.5 px-4 font-mono text-center text-rose-400 font-semibold">
                                {cat.total_rechazados}
                              </td>

                              {/* Tasa de Rechazo con barra de progreso */}
                              <td className="py-3.5 px-4 whitespace-nowrap min-w-[160px]">
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[11px] font-mono">
                                    <span
                                      className={
                                        esBajoRechazo
                                          ? 'text-emerald-400 font-bold'
                                          : esModerado
                                          ? 'text-amber-400 font-bold'
                                          : 'text-rose-400 font-bold'
                                      }
                                    >
                                      {formatearPorcentaje(cat.tasa_rechazo)}
                                    </span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        esBajoRechazo
                                          ? 'bg-emerald-400'
                                          : esModerado
                                          ? 'bg-amber-400'
                                          : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${Math.min(100, Math.max(0, rechazoNum))}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* Diagnóstico Comercial */}
                              <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
                                    esBajoRechazo
                                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                      : esModerado
                                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                      : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                  }`}
                                >
                                  {esBajoRechazo
                                    ? 'Alta Retención'
                                    : esModerado
                                    ? 'Fuga Moderada'
                                    : 'Fuga Crítica'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

