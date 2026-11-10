import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../../context/useAuth';
import AdminSidebar from '../../../components/navigation/AdminSidebar';
import AdminHeader from '../../../components/navigation/AdminHeader';
import { HorizontalBarChart, DualBarChart } from '../../../components/charts/ReportCharts';
import { exportarInformePDF } from '../../../utils/reportPrinter';

import { API_BASE_URL } from '../../../config/api';
// ==============================================================================
// UTILIDADES DE FORMATEO MONETARIO Y FECHAS
// ==============================================================================
const formatearMoneda = (monto) => {
  const num = Number(monto) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

const obtenerFechaFormato = (d) => {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
};

export default function AdminProductivityReportScreen() {
  const { token } = useAuth();

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
  const [idTecnico, setIdTecnico] = useState('');

  // Estados de datos
  const [datosReporte, setDatosReporte] = useState([]);
  const [listaTecnicos, setListaTecnicos] = useState([]);
  const [cargando, setCargando] = useState(false);
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
  // CONSULTA Y ANÁLISIS BIFÁSICO DE PRODUCTIVIDAD (PASOS 4, 5, 6 Y 7)
  // ============================================================================
  const consultarReporteProductividad = useCallback(
    async (overrideParams = {}) => {
      const fInicio = overrideParams.fecha_inicio !== undefined ? overrideParams.fecha_inicio : fechaInicio;
      const fFin = overrideParams.fecha_fin !== undefined ? overrideParams.fecha_fin : fechaFin;
      const tec = overrideParams.id_tecnico !== undefined ? overrideParams.id_tecnico : idTecnico;

      // Paso 4: Validación de consistencia cronológica
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
      try {
        const params = {
          fecha_inicio: fInicio,
          fecha_fin: fFin
        };
        if (tec && tec !== '') {
          params.id_tecnico = Number(tec);
        }

        const res = await axios.get(`${API_BASE_URL}/api/workshop/reportes/productividad/`, {
          headers: { Authorization: `Bearer ${token}` },
          params
        });

        const items = Array.isArray(res.data) ? res.data : [];
        setDatosReporte(items);

        // Si no tenemos la lista de técnicos para el select, poblarla con el reporte completo
        if (listaTecnicos.length === 0 && items.length > 0 && !tec) {
          setListaTecnicos(
            items.map((i) => ({
              id_tecnico: i.id_tecnico,
              nombre_completo: i.nombre_completo,
              email: i.email
            }))
          );
        }
      } catch (err) {
        console.error('Error al generar reporte de productividad técnica:', err);
        const detalleError = err.response?.data?.error || err.response?.data?.detail;
        const textoError = typeof detalleError === 'object' ? JSON.stringify(detalleError) : String(detalleError || '');
        dispararAlerta('error', textoError || 'Ocurrió un error al procesar el reporte de productividad técnica.');
      } finally {
        setCargando(false);
      }
    },
    [token, fechaInicio, fechaFin, idTecnico, listaTecnicos.length, dispararAlerta]
  );

  // Ejecución inicial automática
  useEffect(() => {
    consultarReporteProductividad();
  }, [consultarReporteProductividad]);

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
    consultarReporteProductividad({ fecha_inicio: strDesde, fecha_fin: strHasta });
  };

  const handleRestablecerFiltros = () => {
    const strDesde = obtenerFechaFormato(haceTreintaDias);
    const strHasta = obtenerFechaFormato(hoy);
    setFechaInicio(strDesde);
    setFechaFin(strHasta);
    setIdTecnico('');
    consultarReporteProductividad({ fecha_inicio: strDesde, fecha_fin: strHasta, id_tecnico: '' });
  };

  // ============================================================================
  // CÁLCULO DE KPIS CONSOLIDADOS DEL EQUIPO TÉCNICO (PASO 8)
  // ============================================================================
  const metricasConsolidadas = useMemo(() => {
    if (!datosReporte || datosReporte.length === 0) return null;

    let cargaVivaTotal = 0;
    let volumenFinalizadoTotal = 0;
    let facturacionTotal = 0;
    let interaccionesBitacoraTotal = 0;
    let tecnicoMayorCarga = null;
    let tecnicoMayorFacturacion = null;

    datosReporte.forEach((tec) => {
      const carga = Number(tec.carga_tiempo_real) || 0;
      const vol = Number(tec.volumen_finalizadas) || 0;
      const fact = Number(tec.facturacion_mano_obra) || 0;
      const bitacora = Number(tec.registros_bitacora) || 0;

      cargaVivaTotal += carga;
      volumenFinalizadoTotal += vol;
      facturacionTotal += fact;
      interaccionesBitacoraTotal += bitacora;

      if (!tecnicoMayorCarga || carga > Number(tecnicoMayorCarga.carga_tiempo_real || 0)) {
        tecnicoMayorCarga = tec;
      }
      if (!tecnicoMayorFacturacion || fact > Number(tecnicoMayorFacturacion.facturacion_mano_obra || 0)) {
        tecnicoMayorFacturacion = tec;
      }
    });

    const totalTecnicos = datosReporte.length;
    const cargaPromedioPorTecnico = totalTecnicos > 0 ? (cargaVivaTotal / totalTecnicos).toFixed(1) : '0';

    return {
      totalTecnicos,
      cargaVivaTotal,
      volumenFinalizadoTotal,
      facturacionTotal,
      interaccionesBitacoraTotal,
      cargaPromedioPorTecnico,
      tecnicoMayorCarga,
      tecnicoMayorFacturacion
    };
  }, [datosReporte]);

  // ============================================================================
  // EXPORTACIÓN A PDF PROFESIONAL DE ALTA FIDELIDAD (SIN HOJAS EN BLANCO)
  // ============================================================================
  const handleExportarPDF = () => {
    if (!datosReporte || datosReporte.length === 0) {
      dispararAlerta('error', 'No hay datos cargados para exportar el reporte.');
      return;
    }

    const { totalTecnicos, cargaVivaTotal, volumenFinalizadoTotal, facturacionTotal, interaccionesBitacoraTotal, cargaPromedioPorTecnico } =
      metricasConsolidadas || {};

    const columnas = [
      { header: 'Técnico Operativo', key: 'nombre_completo', render: (f) => `${f.nombre_completo} (${f.email})` },
      { header: 'Carga Viva (En Curso)', key: 'carga_tiempo_real', align: 'center', render: (f) => `${f.carga_tiempo_real} equipos` },
      { header: 'Órdenes Culminadas', key: 'volumen_finalizadas', align: 'center' },
      { header: 'Facturación Mano Obra', key: 'facturacion_mano_obra', align: 'right', render: (f) => formatearMoneda(f.facturacion_mano_obra) },
      { header: 'Velocidad Media', key: 'velocidad_media_dias', align: 'center', render: (f) => f.volumen_finalizadas > 0 ? `${f.velocidad_media_dias} d (${f.velocidad_media_horas} hs)` : 'Sin culminaciones' },
      { header: 'Eventos Bitácora', key: 'registros_bitacora', align: 'center', render: (f) => `${f.registros_bitacora} eventos` }
    ];

    exportarInformePDF({
      titulo: 'Informe Ejecutivo: Productividad y Carga de Trabajo Técnica',
      subtitulo: `Horizonte Histórico: ${fechaInicio} al ${fechaFin} | Radiografía de Taller: Tiempo Real`,
      resumenEjecutivo: `Auditoría integral del personal técnico operativo (${totalTecnicos || 0} profesionales). Se identificó una carga viva concurrente en taller de ${cargaVivaTotal || 0} dispositivos (~${cargaPromedioPorTecnico || 0} equipos/téc), un volumen de ${volumenFinalizadoTotal || 0} órdenes culminadas y una facturación acumulada por mano de obra de ${formatearMoneda(facturacionTotal || 0)}, con ${interaccionesBitacoraTotal || 0} registros de trazabilidad en bitácora.`,
      kpis: [
        { label: 'Carga Viva Actual', valor: `${cargaVivaTotal || 0} eq.`, detalle: `~${cargaPromedioPorTecnico || 0} / técnico` },
        { label: 'Órdenes Culminadas', valor: `${volumenFinalizadoTotal || 0}`, detalle: 'Cerradas en período' },
        { label: 'Facturación Mano Obra', valor: formatearMoneda(facturacionTotal || 0), detalle: 'Ingreso acumulado' },
        { label: 'Auditoría Bitácora', valor: `${interaccionesBitacoraTotal || 0}`, detalle: 'Eventos de trazabilidad' }
      ],
      tablas: [
        {
          titulo: 'Desglose Individual de Desempeño Técnico y Disponibilidad',
          columnas,
          filas: datosReporte
        }
      ]
    });
  };

  // ============================================================================
  // COPIAR RESUMEN GERENCIAL AL PORTAPAPELES
  // ============================================================================
  const handleCopiarResumen = () => {
    if (!metricasConsolidadas || !datosReporte) return;
    const { totalTecnicos, cargaVivaTotal, volumenFinalizadoTotal, facturacionTotal, interaccionesBitacoraTotal } =
      metricasConsolidadas;

    let desgloseTecnicos = '';
    datosReporte.forEach((tec) => {
      desgloseTecnicos += `  • ${tec.nombre_completo} (${tec.email}):\n` +
        `      - Carga Actual en Vivo: ${tec.carga_tiempo_real} equipos\n` +
        `      - Órdenes Culminadas: ${tec.volumen_finalizadas} servicios\n` +
        `      - Facturación Mano de Obra: ${formatearMoneda(tec.facturacion_mano_obra)}\n` +
        `      - Velocidad Media: ${tec.velocidad_media_dias > 0 ? `${tec.velocidad_media_dias} días` : 'Sin finalizaciones en período'}\n` +
        `      - Interacciones en Bitácora: ${tec.registros_bitacora} eventos\n`;
    });

    const texto = `=== INFORME GERENCIAL: PRODUCTIVIDAD Y CARGA DE TRABAJO TÉCNICA ===\n` +
      `Período Analizado (Histórico): ${fechaInicio} al ${fechaFin}\n` +
      `Carga Viva (Tiempo Real): Instantáneo al momento de consulta\n` +
      `--------------------------------------------------------\n` +
      `• Personal Técnico Auditado: ${totalTecnicos} profesionales\n` +
      `• Carga Viva Total en Proceso: ${cargaVivaTotal} equipos en taller\n` +
      `• Trabajos Finalizados en Período: ${volumenFinalizadoTotal} órdenes\n` +
      `• Facturación Acumulada de Mano de Obra: ${formatearMoneda(facturacionTotal)}\n` +
      `• Auditoría de Interacciones en Bitácora: ${interaccionesBitacoraTotal} registros\n` +
      `--------------------------------------------------------\n` +
      `Desglose Individual por Empleado:\n${desgloseTecnicos}` +
      `========================================================`;

    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-sans overflow-hidden">
      {/* 1. Barra Lateral de Navegación */}
      <AdminSidebar activeMenu="metrics-productivity" />

      {/* 2. Área de Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <AdminHeader
          category="Métricas y Análisis"
          subcategory="Equipo de Taller"
          pageName="Productividad Técnica"
          title="Reporte de Productividad y Carga de Trabajo Técnica"
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
          {/* Encabezado Principal y Acciones */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
                  Análisis Bifásico &middot; Operaciones y Recursos Humanos
                </span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Productividad y Carga de Trabajo Técnica
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Evaluación integral del personal operativo: radiografía en tiempo real de equipos asignados para balanceo de carga, combinada con rendimiento histórico y disciplina en bitácora.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {metricasConsolidadas && (
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
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-cyan-500/20"
                    title="Generar y descargar informe ejecutivo en PDF"
                  >
                    <span>📑</span>
                    <span>Descargar PDF</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => consultarReporteProductividad()}
                disabled={cargando}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 text-xs font-mono font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                <span>{cargando ? '🔄' : '⚡'}</span>
                <span>{cargando ? 'Calculando...' : 'Actualizar'}</span>
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
                  Horizonte Histórico & Segmentación por Técnico
                </h3>
              </div>

              {/* Botones de Atajos Temporales */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono text-slate-400 uppercase mr-1">Atajos Históricos:</span>
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
                consultarReporteProductividad();
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end"
            >
              {/* 1. Fecha de Inicio */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Fecha de Inicio (Histórico) <span className="text-cyan-400 font-bold">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* 2. Fecha de Fin */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Fecha de Fin (Histórico) <span className="text-cyan-400 font-bold">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* 3. Técnico Específico (Opcional) */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Técnico Operativo
                </label>
                <select
                  value={idTecnico}
                  onChange={(e) => setIdTecnico(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  <option value="">Todo el Personal Técnico</option>
                  {listaTecnicos.map((tec) => (
                    <option key={tec.id_tecnico} value={tec.id_tecnico}>
                      {tec.nombre_completo} ({tec.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Acciones */}
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
                  {cargando ? 'Procesando...' : 'Analizar'}
                </button>
              </div>
            </form>
          </section>

          {/* ===================================================================== */}
          {/* NOTA METODOLÓGICA BIFÁSICA (COMENTARIOS CU-74)                        */}
          {/* ===================================================================== */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
            <span className="text-cyan-400 text-base mt-0.5">⚡</span>
            <div className="space-y-1">
              <p className="font-semibold text-white">
                Metodología de Análisis Bifásico (Tiempo Real + Histórico)
              </p>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                La <strong className="text-cyan-300">Carga de Trabajo Actual</strong> consulta el estado vivo del taller en el instante presente (ignorando el filtro de fechas) para balancear órdenes entre técnicos activos. En paralelo, el <strong className="text-emerald-300">Rendimiento Histórico</strong> (facturación, velocidad y bitácora) se restringe estrictamente a la ventana temporal indicada.
              </p>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* ESTADO DE CARGA                                                       */}
          {/* ===================================================================== */}
          {cargando && (
            <div className="py-20 text-center space-y-3 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl">
              <div className="inline-block w-9 h-9 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-mono text-slate-400">
                Auditando carga en tiempo real y consolidando desempeño histórico de técnicos...
              </p>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TABLERO DE INDICADORES: KPIS Y RADIOGRAFÍA (PASOS 5, 6, 7 Y 8)        */}
          {/* ===================================================================== */}
          {!cargando && metricasConsolidadas && (
            <>
              {/* 4 Tarjetas KPI Globales de Taller */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Carga Viva en Taller (Tiempo Real - Inmune a fechas) */}
                <div className="bg-[#1E293B] border border-cyan-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-cyan-500/50 transition-colors bg-gradient-to-br from-[#1E293B] to-cyan-950/20">
                  <div className="flex items-center justify-between text-cyan-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Carga Viva (Tiempo Real)</span>
                    <span className="text-base">⚡</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-black font-mono text-cyan-400 tracking-tight">
                      {metricasConsolidadas.cargaVivaTotal}{' '}
                      <span className="text-xs font-normal text-slate-300">equipos</span>
                    </p>
                    <span className="text-xs font-mono text-cyan-300">
                      (~{metricasConsolidadas.cargaPromedioPorTecnico} / téc)
                    </span>
                  </div>
                  <p className="text-xs font-mono text-cyan-300/80 mt-1">
                    En diagnóstico, reparación o espera de repuesto
                  </p>
                  <span className="text-[10px] text-cyan-400/80 mt-2 block border-t border-cyan-900/40 pt-2">
                    Instantáneo &middot; Inmune a filtros de fecha
                  </span>
                </div>

                {/* 2. Trabajos Finalizados (Histórico) */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Órdenes Culminadas</span>
                    <span className="text-base">📦</span>
                  </div>
                  <p className="text-2xl font-black font-mono text-white tracking-tight">
                    {metricasConsolidadas.volumenFinalizadoTotal}{' '}
                    <span className="text-xs font-normal text-slate-400">servicios</span>
                  </p>
                  <p className="text-xs font-mono text-slate-400 mt-1">
                    Cerradas por {metricasConsolidadas.totalTecnicos} técnico(s)
                  </p>
                  <span className="text-[10px] text-slate-500 mt-2 block border-t border-slate-800/80 pt-2">
                    Servicios entregados dentro del horizonte temporal
                  </span>
                </div>

                {/* 3. Facturación de Mano de Obra (Histórico) */}
                <div className="bg-[#1E293B] border border-emerald-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-colors bg-gradient-to-br from-[#1E293B] to-emerald-950/20">
                  <div className="flex items-center justify-between text-emerald-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Facturación Mano de Obra</span>
                    <span className="text-base">💰</span>
                  </div>
                  <p className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                    {formatearMoneda(metricasConsolidadas.facturacionTotal)}
                  </p>
                  <p className="text-xs font-mono text-emerald-300 mt-1">
                    Ingresos generados por el equipo
                  </p>
                  <span className="text-[10px] text-emerald-400/80 mt-2 block border-t border-emerald-900/40 pt-2">
                    Cobro neto de intervenciones técnicas cerradas
                  </span>
                </div>

                {/* 4. Auditoría de Disciplina (Bitácora de Reparación) */}
                <div className="bg-[#1E293B] border border-violet-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-violet-500/50 transition-colors bg-gradient-to-br from-[#1E293B] to-violet-950/20">
                  <div className="flex items-center justify-between text-violet-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Disciplina & Bitácora</span>
                    <span className="text-base">📝</span>
                  </div>
                  <p className="text-2xl font-black font-mono text-violet-400 tracking-tight">
                    {metricasConsolidadas.interaccionesBitacoraTotal}{' '}
                    <span className="text-xs font-normal text-slate-300">eventos</span>
                  </p>
                  <p className="text-xs font-mono text-violet-300 mt-1">
                    Actualizaciones y notas técnicas asentadas
                  </p>
                  <span className="text-[10px] text-violet-400/80 mt-2 block border-t border-violet-900/40 pt-2">
                    Nivel de cumplimiento en la trazabilidad del sistema
                  </span>
                </div>
              </div>

              {/* ================================================================= */}
                            {/* ===================================================================== */}
              {/* VISUALIZACIONES ANALÍTICAS Y GRÁFICOS (OBJ-07)                        */}
              {/* ===================================================================== */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfico 1: Rendimiento Comparativo (Órdenes vs Facturación Mano de Obra) */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>📊</span> Rendimiento y Facturación
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Comparación de volumen de órdenes cerradas vs facturación generada
                      </p>
                    </div>
                  </div>
                  <DualBarChart
                    data={datosReporte.map((tec) => ({
                      label: tec.nombre_completo.split(' ')[0] + ' ' + (tec.nombre_completo.split(' ')[1] ? tec.nombre_completo.split(' ')[1][0] + '.' : ''),
                      valA: Number(tec.volumen_finalizadas) || 0,
                      valB: Number(tec.facturacion_mano_obra) || 0
                    }))}
                    labelA="Órdenes Culminadas"
                    labelB="Facturación Mano Obra"
                    colorA="#06B6D4"
                    colorB="#10B981"
                    formatterB={(val) => formatearMoneda(val)}
                  />
                </div>

                {/* Gráfico 2: Disciplina Operativa en Bitácora */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>📝</span> Disciplina en Bitácora Técnica
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Trazabilidad y registro de eventos operativos por técnico
                      </p>
                    </div>
                  </div>
                  <HorizontalBarChart
                    data={datosReporte.map((tec) => ({
                      label: tec.nombre_completo,
                      valor: Number(tec.registros_bitacora) || 0,
                      sublabel: `${tec.volumen_finalizadas} servicios cerrados`
                    }))}
                    color="#8B5CF6"
                    unit="eventos"
                  />
                </div>
              </div>

              {/* BALANCEO DE CARGA EN TIEMPO REAL (PASO 5)                         */}
              {/* ================================================================= */}
              <section className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Radiografía de Balanceo de Carga en Tiempo Real
                    </h3>
                    <p className="text-xs text-slate-400">
                      Disponibilidad actual del personal técnico para asignación inmediata de nuevos dispositivos recibidos.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Disponible (0-2)
                    </span>
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Carga Óptima (3-5)
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Sobrecarga (&gt; 5)
                    </span>
                  </div>
                </div>

                <div className="space-y-4 pt-1">
                  {datosReporte.map((tec) => {
                    const carga = Number(tec.carga_tiempo_real) || 0;
                    const esLibre = carga <= 2;
                    const esOptimo = carga > 2 && carga <= 5;
                    const porcentajeVisual = Math.min(100, Math.max(carga * 15, 6));

                    return (
                      <div key={tec.id_tecnico} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{tec.nombre_completo}</span>
                            <span className="text-[10px] text-slate-500 font-normal">({tec.email})</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-bold text-white">
                              {carga} equipo(s) activo(s)
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                esLibre
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                  : esOptimo
                                  ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                  : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                              }`}
                            >
                              {esLibre ? '🟢 Disponible' : esOptimo ? '🔵 Carga Normal' : '🔴 Sobrecarga'}
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              esLibre
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : esOptimo
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                                : 'bg-gradient-to-r from-amber-500 to-rose-500'
                            }`}
                            style={{ width: `${porcentajeVisual}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* ===================================================================== */}
              {/* MATRIZ DE PRODUCTIVIDAD Y RENDIMIENTO INDIVIDUAL (PASOS 6, 7 Y 8)     */}
              {/* ===================================================================== */}
              <section className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-4">
                <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">👨‍🔧</span>
                      <h3 className="text-base font-bold text-white tracking-tight">
                        Matriz de Desempeño Individual, Facturación y Disciplina
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400">
                      Consolidado por empleado operativo: volumen entregado, mano de obra cobrada, velocidad de resolución y eventos en bitácora.
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-mono text-cyan-300">
                    {datosReporte.length} técnico(s) evaluados
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-700/80 bg-slate-900/60 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-5">Técnico Operativo</th>
                        <th className="py-3 px-4 text-center">Carga Viva (En Curso)</th>
                        <th className="py-3 px-4 text-center">Órdenes Culminadas</th>
                        <th className="py-3 px-4 text-right">Facturación Mano Obra</th>
                        <th className="py-3 px-4 text-center">Velocidad Promedio</th>
                        <th className="py-3 px-4 text-center">Auditoría Bitácora</th>
                        <th className="py-3 px-4 text-center">Estado de Desempeño</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {datosReporte.map((tec) => {
                        const finalizadas = Number(tec.volumen_finalizadas) || 0;
                        const dias = Number(tec.velocidad_media_dias) || 0;
                        const bitacora = Number(tec.registros_bitacora) || 0;
                        const carga = Number(tec.carga_tiempo_real) || 0;

                        return (
                          <tr key={tec.id_tecnico} className="hover:bg-slate-800/40 transition-colors">
                            {/* Técnico */}
                            <td className="py-3.5 px-5 font-semibold text-white whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                                <div>
                                  <p className="font-semibold text-white">{tec.nombre_completo}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">{tec.email}</p>
                                </div>
                              </div>
                            </td>

                            {/* Carga Viva */}
                            <td className="py-3.5 px-4 font-mono font-bold text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-xs border ${
                                  carga === 0
                                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                                    : carga <= 3
                                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                    : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                }`}
                              >
                                {carga} activo(s)
                              </span>
                            </td>

                            {/* Órdenes Culminadas */}
                            <td className="py-3.5 px-4 font-mono font-bold text-center text-slate-200">
                              {finalizadas}
                            </td>

                            {/* Facturación Mano de Obra */}
                            <td className="py-3.5 px-4 font-mono font-bold text-right text-emerald-400">
                              {formatearMoneda(tec.facturacion_mano_obra)}
                            </td>

                            {/* Velocidad Promedio */}
                            <td className="py-3.5 px-4 font-mono text-center whitespace-nowrap">
                              {finalizadas > 0 ? (
                                <div>
                                  <span className="font-bold text-cyan-300">{dias} d</span>{' '}
                                  <span className="text-[10px] text-slate-500">
                                    ({tec.velocidad_media_horas} hs)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-500 italic text-[11px]">
                                  Sin culminaciones
                                </span>
                              )}
                            </td>

                            {/* Auditoría de Interacciones en Bitácora */}
                            <td className="py-3.5 px-4 font-mono text-center whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] border ${
                                  bitacora >= 10
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 font-bold'
                                    : bitacora > 0
                                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                }`}
                              >
                                <span>{bitacora} eventos</span>
                              </span>
                            </td>

                            {/* Estado de Desempeño */}
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
                                  finalizadas >= 5 && bitacora >= 5
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                    : finalizadas > 0 || bitacora > 0 || carga > 0
                                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                <span>
                                  {finalizadas >= 5 && bitacora >= 5
                                    ? '⭐ Alto Rendimiento'
                                    : finalizadas > 0 || bitacora > 0 || carga > 0
                                    ? '⚡ Activo Regular'
                                    : '💤 En Pausa / Sin Actividad'}
                                </span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

