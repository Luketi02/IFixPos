import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../../context/useAuth';
import AdminSidebar from '../../../components/navigation/AdminSidebar';
import AdminHeader from '../../../components/navigation/AdminHeader';
import { DualBarChart, HorizontalBarChart, DonutChart } from '../../../components/charts/ReportCharts';
import { exportarInformePDF } from '../../../utils/reportPrinter';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

const formatearPorcentaje = (valor) => {
  const num = Number(valor) || 0;
  return `${num.toFixed(1)}%`;
};

const obtenerFechaFormato = (d) => {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
};

export default function AdminEfficiencyReportScreen() {
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
  const [idCategoria, setIdCategoria] = useState('');
  const [idTipoDispositivo, setIdTipoDispositivo] = useState('');

  // Catálogos para selects
  const [categorias, setCategorias] = useState([]);
  const [tiposDispositivo, setTiposDispositivo] = useState([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(false);

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
  // CARGA DE CATÁLOGOS AUXILIARES (CATEGORÍAS Y TIPOS DE DISPOSITIVOS)
  // ============================================================================
  useEffect(() => {
    const cargarCatalogos = async () => {
      if (!token) return;
      setCargandoCatalogos(true);
      try {
        const [resCats, resTipos] = await Promise.allSettled([
          axios.get(`${API_BASE_URL}/api/workshop/categorias-reparacion/`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_BASE_URL}/api/workshop/tipos-dispositivos/`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        if (resCats.status === 'fulfilled' && Array.isArray(resCats.value.data)) {
          setCategorias(resCats.value.data.filter((c) => c.estado_activo !== false));
        }
        if (resTipos.status === 'fulfilled' && Array.isArray(resTipos.value.data)) {
          setTiposDispositivo(resTipos.value.data.filter((t) => t.estado_activo !== false));
        }
      } catch (err) {
        console.warn('No fue posible cargar los catálogos auxiliares:', err);
      } finally {
        setCargandoCatalogos(false);
      }
    };
    cargarCatalogos();
  }, [token]);

  // ============================================================================
  // CONSULTA Y ANÁLISIS DE DEMANDA Y EFICIENCIA (PASOS 4, 5, 6 Y 7)
  // ============================================================================
  const consultarReporteEficiencia = useCallback(
    async (overrideParams = {}) => {
      const fInicio = overrideParams.fecha_inicio !== undefined ? overrideParams.fecha_inicio : fechaInicio;
      const fFin = overrideParams.fecha_fin !== undefined ? overrideParams.fecha_fin : fechaFin;
      const cat = overrideParams.id_categoria !== undefined ? overrideParams.id_categoria : idCategoria;
      const tipoDisp = overrideParams.id_tipo_dispositivo !== undefined ? overrideParams.id_tipo_dispositivo : idTipoDispositivo;

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
        if (tipoDisp && tipoDisp !== '') {
          params.id_tipo_dispositivo = Number(tipoDisp);
        }

        const res = await axios.get(`${API_BASE_URL}/api/workshop/reportes/eficiencia/`, {
          headers: { Authorization: `Bearer ${token}` },
          params
        });

        const items = Array.isArray(res.data) ? res.data : [];
        if (items.length === 0) {
          setSinDatos(true);
          setMensajeSinDatos('No se encontraron reparaciones finalizadas en el período temporal o filtros indicados.');
          setDatosReporte([]);
        } else {
          setDatosReporte(items);
        }
      } catch (err) {
        console.error('Error al generar reporte de demanda y eficiencia:', err);
        const detalleError = err.response?.data?.error || err.response?.data?.detail;
        const textoError = typeof detalleError === 'object' ? JSON.stringify(detalleError) : String(detalleError || '');

        // Paso 5: Excepción de ausencia de operaciones finalizadas
        if (
          err.response?.status === 400 &&
          (textoError.includes('No existen reparaciones finalizadas') || textoError.includes('sin datos') || textoError.includes('finalizadas'))
        ) {
          setSinDatos(true);
          setMensajeSinDatos(
            textoError || 'No existen reparaciones en estado Finalizado o Entregado bajo el horizonte temporal o filtros indicados.'
          );
          setDatosReporte(null);
        } else {
          dispararAlerta('error', textoError || 'Ocurrió un error al procesar el reporte de demanda y eficiencia.');
        }
      } finally {
        setCargando(false);
      }
    },
    [token, fechaInicio, fechaFin, idCategoria, idTipoDispositivo, dispararAlerta]
  );

  // Ejecución inicial automática al montar el componente
  useEffect(() => {
    consultarReporteEficiencia();
  }, [consultarReporteEficiencia]);

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
    consultarReporteEficiencia({ fecha_inicio: strDesde, fecha_fin: strHasta });
  };

  const handleRestablecerFiltros = () => {
    const strDesde = obtenerFechaFormato(haceTreintaDias);
    const strHasta = obtenerFechaFormato(hoy);
    setFechaInicio(strDesde);
    setFechaFin(strHasta);
    setIdCategoria('');
    setIdTipoDispositivo('');
    consultarReporteEficiencia({
      fecha_inicio: strDesde,
      fecha_fin: strHasta,
      id_categoria: '',
      id_tipo_dispositivo: ''
    });
  };

  // ============================================================================
  // CÁLCULO DE KPIS CONSOLIDADOS (PASOS 6, 7 Y 8)
  // ============================================================================
  const metricasConsolidadas = useMemo(() => {
    if (!datosReporte || !Array.isArray(datosReporte) || datosReporte.length === 0) {
      return null;
    }

    let volumenTotal = 0;
    let facturacionTotal = 0;
    let sumaPonderadaDias = 0;
    let sumaPonderadaHoras = 0;
    let categoriaTopDemanda = null;
    let categoriaTopFacturacion = null;
    let mayorCuelloBotella = null;

    datosReporte.forEach((item) => {
      const vol = Number(item.volumen_reparaciones) || 0;
      const fact = Number(item.facturacion_bruta) || 0;
      const dias = Number(item.tiempo_promedio_dias) || 0;
      const horas = Number(item.tiempo_promedio_horas) || 0;

      volumenTotal += vol;
      facturacionTotal += fact;
      sumaPonderadaDias += vol * dias;
      sumaPonderadaHoras += vol * horas;

      if (!categoriaTopDemanda || vol > categoriaTopDemanda.volumen_reparaciones) {
        categoriaTopDemanda = item;
      }
      if (!categoriaTopFacturacion || fact > Number(categoriaTopFacturacion.facturacion_bruta || 0)) {
        categoriaTopFacturacion = item;
      }
      if (!mayorCuelloBotella || dias > Number(mayorCuelloBotella.tiempo_promedio_dias || 0)) {
        mayorCuelloBotella = item;
      }
    });

    const tiempoPromedioGeneralDias = volumenTotal > 0 ? (sumaPonderadaDias / volumenTotal).toFixed(1) : '0.0';
    const tiempoPromedioGeneralHoras = volumenTotal > 0 ? (sumaPonderadaHoras / volumenTotal).toFixed(1) : '0.0';
    const ticketPromedio = volumenTotal > 0 ? facturacionTotal / volumenTotal : 0;

    return {
      volumenTotal,
      facturacionTotal,
      tiempoPromedioGeneralDias,
      tiempoPromedioGeneralHoras,
      ticketPromedio,
      categoriaTopDemanda,
      categoriaTopFacturacion,
      mayorCuelloBotella
    };
  }, [datosReporte]);

  // ============================================================================
  // CÁLCULO DE GRÁFICOS VISUALES (CU-73: DEMANDA VS FACTURACIÓN, EFICIENCIA Y DONUT)
  // ============================================================================
  const dualBarEficiencia = useMemo(() => {
    if (!datosReporte || !Array.isArray(datosReporte) || datosReporte.length === 0) return [];
    return datosReporte.map((item) => ({
      label: item.nombre_categoria,
      val1: Number(item.facturacion_mano_obra || 0),
      val1Label: formatearMoneda(item.facturacion_mano_obra),
      val2: Number(item.volumen_reparaciones || 0),
      val2Label: `${item.volumen_reparaciones || 0} órdenes`
    }));
  }, [datosReporte]);

  const rankingVelocidad = useMemo(() => {
    if (!datosReporte || !Array.isArray(datosReporte) || datosReporte.length === 0) return [];
    return [...datosReporte]
      .sort((a, b) => Number(b.tiempo_promedio_dias || 0) - Number(a.tiempo_promedio_dias || 0))
      .map((item) => {
        const dias = Number(item.tiempo_promedio_dias) || 0;
        const diag = dias <= 2 ? 'Resolución Ágil' : dias <= 5 ? 'Ritmo Estándar' : 'Cuello de Botella';
        return {
          label: item.nombre_categoria,
          valor: dias,
          valorFormateado: `${dias.toFixed(1)} días`,
          subtitulo: diag,
          color: dias <= 2 ? '#10B981' : dias <= 5 ? '#06B6D4' : '#F43F5E'
        };
      });
  }, [datosReporte]);

  const donutFacturacion = useMemo(() => {
    if (!datosReporte || !Array.isArray(datosReporte) || datosReporte.length === 0) return [];
    const colores = ['#06B6D4', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#3B82F6', '#14B8A6'];
    const totalFact = datosReporte.reduce((acc, i) => acc + Number(i.facturacion_mano_obra || 0), 0) || 1;
    return datosReporte.slice(0, 6).map((item, idx) => {
      const fact = Number(item.facturacion_mano_obra || 0);
      return {
        label: item.nombre_categoria,
        valor: formatearMoneda(fact),
        porcentaje: (fact / totalFact) * 100,
        color: colores[idx % colores.length]
      };
    });
  }, [datosReporte]);

  // ============================================================================
  // EXPORTACIÓN A PDF EJECUTIVO SIN PÁGINAS EN BLANCO
  // ============================================================================
  const handleExportarPDF = () => {
    if (!metricasConsolidadas || !datosReporte) return;
    const { volumenTotal, facturacionTotal, ticketPromedio, tiempoPromedioGeneralDias } = metricasConsolidadas;

    const kpis = [
      { label: 'Demanda Culminada', valor: `${volumenTotal} reparaciones`, detalle: 'Servicios cerrados y entregados' },
      { label: 'Facturación Mano de Obra', valor: formatearMoneda(facturacionTotal), detalle: 'Rendimiento financiero neto' },
      { label: 'Ticket Promedio', valor: formatearMoneda(ticketPromedio), detalle: 'Promedio facturado por trabajo' },
      { label: 'Tiempo Operativo', valor: `${tiempoPromedioGeneralDias} días`, detalle: 'Promedio global inicio a entrega' }
    ];

    const filas = datosReporte.map((i) => {
      const vol = Number(i.volumen_reparaciones || 0);
      const pct = volumenTotal > 0 ? ((vol / volumenTotal) * 100).toFixed(1) : '0.0';
      const dias = Number(i.tiempo_promedio_dias || 0);
      const diag = dias <= 2 ? 'Resolución Ágil' : dias <= 5 ? 'Ritmo Estándar' : 'Cuello de Botella';
      return [
        i.nombre_categoria,
        String(vol),
        formatearMoneda(i.facturacion_mano_obra),
        `${dias.toFixed(1)} días (${i.tiempo_promedio_horas || 0} hs)`,
        `${pct}%`,
        diag
      ];
    });

    const tablas = [
      {
        titulo: 'Matriz de Demanda y Eficiencia por Rubro Técnico',
        columnas: ['Categoría / Rubro', 'Órdenes', 'Facturación Mano Obra', 'Tiempo Medio', 'Participación', 'Diagnóstico Operativo'],
        filas
      }
    ];

    let desgloseTexto = '';
    datosReporte.forEach((i) => {
      const dias = Number(i.tiempo_promedio_dias || 0);
      const diag = dias <= 2 ? 'Resolución Ágil' : dias <= 5 ? 'Ritmo Estándar' : 'Cuello de Botella';
      desgloseTexto += `  • ${i.nombre_categoria}: ${i.volumen_reparaciones || 0} servicios | ${formatearMoneda(i.facturacion_mano_obra)} | ${dias.toFixed(1)} días medio (${diag})\n`;
    });

    const resumenTexto = `=== INFORME GERENCIAL: DEMANDA Y EFICIENCIA POR CATEGORÍA ===\n` +
      `Período Analizado: ${fechaInicio} al ${fechaFin}\n` +
      `--------------------------------------------------------\n` +
      `• Demanda Culminada Total: ${volumenTotal} órdenes cerradas\n` +
      `• Facturación Acumulada Mano de Obra: ${formatearMoneda(facturacionTotal)}\n` +
      `• Ticket Promedio por Trabajo: ${formatearMoneda(ticketPromedio)}\n` +
      `• Tiempo Promedio de Resolución: ${tiempoPromedioGeneralDias} días\n` +
      `--------------------------------------------------------\n` +
      `Desglose Operativo:\n${desgloseTexto}`;

    exportarInformePDF({
      titulo: 'Reporte de Demanda y Eficiencia por Categoría',
      subtitulo: 'Análisis de carga de trabajo, ingresos de mano de obra y detección de cuellos de botella',
      periodo: `${fechaInicio} al ${fechaFin}`,
      kpis,
      tablas,
      resumenTexto,
      usuario: { nombre: 'Administrador General', email: 'admin@ifixpos.com' }
    });
  };

  // ============================================================================
  // COPIAR RESUMEN GERENCIAL AL PORTAPAPELES
  // ============================================================================
  const handleCopiarResumen = () => {
    if (!metricasConsolidadas || !datosReporte) return;
    const { volumenTotal, facturacionTotal, tiempoPromedioGeneralDias, ticketPromedio } = metricasConsolidadas;

    let desgloseRubros = '';
    datosReporte.forEach((item) => {
      desgloseRubros += `  • ${item.nombre_categoria}: ${item.volumen_reparaciones} servicios | ${formatearMoneda(item.facturacion_bruta)} | Prom: ${item.tiempo_promedio_dias} días\n`;
    });

    const texto = `=== INFORME GERENCIAL: DEMANDA Y EFICIENCIA OPERATIVA ===\n` +
      `Período Analizado: ${fechaInicio} al ${fechaFin}\n` +
      `--------------------------------------------------------\n` +
      `• Demanda Culminada Total: ${volumenTotal} reparaciones finalizadas\n` +
      `• Facturación Bruta Acumulada: ${formatearMoneda(facturacionTotal)}\n` +
      `• Ticket Promedio por Trabajo: ${formatearMoneda(ticketPromedio)}\n` +
      `• Tiempo Operativo Promedio: ${tiempoPromedioGeneralDias} días\n` +
      `--------------------------------------------------------\n` +
      `Desglose por Categoría:\n${desgloseRubros}` +
      `========================================================`;

    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-sans overflow-hidden">
      {/* 1. Barra Lateral de Navegación */}
      <AdminSidebar activeMenu="metrics-efficiency" />

      {/* 2. Área de Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <AdminHeader
          category="Métricas y Análisis"
          subcategory="Rendimiento del Taller"
          pageName="Demanda y Eficiencia"
          title="Reporte de Demanda y Eficiencia por Categoría"
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
                  Inteligencia de Negocios &middot; Taller & Facturación
                </span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Demanda y Eficiencia Operativa por Rubro
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Supervisión del volumen de servicios culminados, ingresos brutos generados y tiempo de ciclo medio de resolución para detectar cuellos de botella y rubros más rentables.
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
                onClick={() => consultarReporteEficiencia()}
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
                  Horizonte Temporal & Segmentación Operativa
                </h3>
              </div>

              {/* Botones de Atajos Temporales */}
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
                consultarReporteEficiencia();
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
            >
              {/* 1. Fecha de Inicio */}
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

              {/* 2. Fecha de Fin */}
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

              {/* 3. Categoría de Reparación */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Categoría de Servicio
                </label>
                <select
                  value={idCategoria}
                  onChange={(e) => setIdCategoria(e.target.value)}
                  disabled={cargandoCatalogos}
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

              {/* 4. Tipo de Dispositivo */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Familia de Equipo
                </label>
                <select
                  value={idTipoDispositivo}
                  onChange={(e) => setIdTipoDispositivo(e.target.value)}
                  disabled={cargandoCatalogos}
                  className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
                >
                  <option value="">Todos los Equipos</option>
                  {tiposDispositivo.map((t) => (
                    <option key={t.id_tipo_dispositivo} value={t.id_tipo_dispositivo}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Acciones */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRestablecerFiltros}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer text-center"
                >
                  Limpiar
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
          {/* ESTADO DE CARGA                                                       */}
          {/* ===================================================================== */}
          {cargando && (
            <div className="py-20 text-center space-y-3 bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl">
              <div className="inline-block w-9 h-9 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-mono text-slate-400">
                Auditando historial de órdenes culminadas y calculando tiempos operativos medios...
              </p>
            </div>
          )}

          {/* ===================================================================== */}
          {/* EXCEPCIÓN PASO 5: UNIVERSO VACÍO (SIN ÓRDENES FINALIZADAS)            */}
          {/* ===================================================================== */}
          {!cargando && (sinDatos || !metricasConsolidadas) && (
            <div className="py-16 px-6 text-center space-y-4 bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-3xl">
                ⏱️
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="text-lg font-bold text-white tracking-tight">
                  Sin reparaciones finalizadas en el período
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {mensajeSinDatos || 'No se registran órdenes en estado Finalizado o Entregado dentro del rango temporal y filtros aplicados.'}
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
          {/* TABLERO DE INDICADORES: KPIS Y ANÁLISIS OPERATIVO (PASOS 6, 7 Y 8)    */}
          {/* ===================================================================== */}
          {!cargando && metricasConsolidadas && (
            <>
              {/* 4 Tarjetas KPI Principales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Volumen Culminado */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Carga Culminada</span>
                    <span className="text-base">📦</span>
                  </div>
                  <p className="text-2xl font-black font-mono text-white tracking-tight">
                    {metricasConsolidadas.volumenTotal}{' '}
                    <span className="text-xs font-normal text-slate-400">servicios</span>
                  </p>
                  <p className="text-xs font-mono text-cyan-400 mt-1">
                    Ticket Prom: {formatearMoneda(metricasConsolidadas.ticketPromedio)}
                  </p>
                  <span className="text-[10px] text-slate-500 mt-2 block border-t border-slate-800/80 pt-2">
                    Órdenes con ciclo técnico cerrado (Finalizado/Entregado)
                  </span>
                </div>

                {/* 2. Facturación Bruta */}
                <div className="bg-[#1E293B] border border-emerald-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-colors bg-gradient-to-br from-[#1E293B] to-emerald-950/20">
                  <div className="flex items-center justify-between text-emerald-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Facturación Bruta</span>
                    <span className="text-base">💰</span>
                  </div>
                  <p className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                    {formatearMoneda(metricasConsolidadas.facturacionTotal)}
                  </p>
                  <p className="text-xs font-mono text-emerald-300 mt-1">
                    Ingresos generados por intervenciones
                  </p>
                  <span className="text-[10px] text-emerald-400/80 mt-2 block border-t border-emerald-900/40 pt-2">
                    Costo acumulado de mano de obra en servicios completados
                  </span>
                </div>

                {/* 3. Tiempo Operativo Medio (Eficiencia Temporal) */}
                <div className="bg-[#1E293B] border border-cyan-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-cyan-500/50 transition-colors bg-gradient-to-br from-[#1E293B] to-cyan-950/20">
                  <div className="flex items-center justify-between text-cyan-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Tiempo Medio de Resolución</span>
                    <span className="text-base">⏱️</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-black font-mono text-cyan-400 tracking-tight">
                      {metricasConsolidadas.tiempoPromedioGeneralDias}{' '}
                      <span className="text-xs font-normal text-slate-300">días</span>
                    </p>
                    <span className="text-xs font-mono text-cyan-300">
                      ({metricasConsolidadas.tiempoPromedioGeneralHoras} hs)
                    </span>
                  </div>
                  <p className="text-xs font-mono text-cyan-300/80 mt-1">
                    Delta real entre inicio y entrega
                  </p>
                  <span className="text-[10px] text-cyan-400/80 mt-2 block border-t border-cyan-900/40 pt-2">
                    Promedio ponderado del taller para culminar servicios
                  </span>
                </div>

                {/* 4. Diagnóstico de Rentabilidad y Cuello de Botella */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between text-amber-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Puntos Críticos</span>
                    <span className="text-base">🧭</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs">
                      <span className="text-slate-400">Más Rentable: </span>
                      <strong className="text-emerald-300 font-mono">
                        {metricasConsolidadas.categoriaTopFacturacion?.nombre_categoria || 'N/D'}
                      </strong>
                    </div>
                    <div className="text-xs">
                      <span className="text-slate-400">Cuello de Botella: </span>
                      <strong className="text-rose-300 font-mono">
                        {metricasConsolidadas.mayorCuelloBotella?.nombre_categoria || 'N/D'}{' '}
                        ({metricasConsolidadas.mayorCuelloBotella?.tiempo_promedio_dias || 0}d)
                      </strong>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-2 block border-t border-slate-800/80 pt-2">
                    Detección automática de rubros para optimizar tiempos
                  </span>
                </div>
              </div>

              {/* ================================================================= */}
              {/* DISTRIBUCIÓN OPERATIVA DE LA DEMANDA (VISUAL BARS)                */}
              {/* ================================================================= */}
              <section className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Distribución de Carga de Trabajo y Facturación por Rubro
                    </h3>
                    <p className="text-xs text-slate-400">
                      Participación porcentual sobre el volumen total de reparaciones culminadas en el taller.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Resolución Ágil (&le; 2d)
                    </span>
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Tiempo Normal (2-5d)
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Cuello de Botella (&gt; 5d)
                    </span>
                  </div>
                </div>

                <div className="space-y-4 pt-1">
                  {datosReporte.map((item, idx) => {
                    const pctVolumen =
                      metricasConsolidadas.volumenTotal > 0
                        ? (item.volumen_reparaciones / metricasConsolidadas.volumenTotal) * 100
                        : 0;
                    const dias = Number(item.tiempo_promedio_dias) || 0;
                    const esAgil = dias <= 2.0;
                    const esNormal = dias > 2.0 && dias <= 5.0;

                    return (
                      <div key={item.id_categoria || idx} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <span className="font-semibold text-slate-200">
                            {item.nombre_categoria || 'General / Sin Categoría'}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">
                              {item.volumen_reparaciones} servicios ({formatearPorcentaje(pctVolumen)})
                            </span>
                            <span className="text-emerald-400 font-bold">
                              {formatearMoneda(item.facturacion_bruta)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] border ${
                                esAgil
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                  : esNormal
                                  ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                  : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                              }`}
                            >
                              {item.tiempo_promedio_dias} días
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              esAgil
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : esNormal
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                                : 'bg-gradient-to-r from-amber-500 to-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, pctVolumen))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* ===================================================================== */}
              {/* ===================================================================== */}
              {/* SUITE DE GRÁFICOS VISUALES ANALÍTICOS (CU-73)                       */}
              {/* ===================================================================== */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>📊</span> Cruce de Facturación vs Volumen
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Comparación directa de facturación de mano de obra vs órdenes finalizadas
                      </p>
                    </div>
                  </div>
                  <DualBarChart
                    items={dualBarEficiencia}
                    metrica1Nombre="Facturación Mano Obra ($)"
                    metrica2Nombre="Volumen (Órdenes)"
                    colorA="#10B981"
                    colorB="#06B6D4"
                  />
                </div>

                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>🍩</span> Participación por Rubro
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Distribución porcentual de facturación por categoría de reparación
                      </p>
                    </div>
                  </div>
                  <DonutChart
                    datos={donutFacturacion}
                    totalLabel="Total Facturado"
                    centroValor={metricasConsolidadas ? formatearMoneda(metricasConsolidadas.facturacionTotal) : '$0'}
                  />
                </div>
              </div>

              {rankingVelocidad.length > 0 && (
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>⏱️</span> Eficiencia Temporal: Tiempo Medio de Resolución
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Días promedio desde recepción hasta entrega final (Detección de cuellos de botella)
                      </p>
                    </div>
                  </div>
                  <HorizontalBarChart
                    items={rankingVelocidad}
                    unidad="días"
                  />
                </div>
              )}

              {/* TABLA ANALÍTICA DETALLADA (PASOS 6, 7 Y 8)                            */}
              {/* ===================================================================== */}
              <section className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-4">
                <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">📊</span>
                      <h3 className="text-base font-bold text-white tracking-tight">
                        Matriz de Demanda, Facturación y Eficiencia Temporal
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400">
                      Rendimiento económico y agilidad técnica desagregada por cada rubro de reparación del taller.
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-mono text-cyan-300">
                    {datosReporte.length} rubro(s) analizados
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-700/80 bg-slate-900/60 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-5">Categoría de Reparación</th>
                        <th className="py-3 px-4 text-center">Volumen Culminado</th>
                        <th className="py-3 px-4 text-center">% de la Demanda</th>
                        <th className="py-3 px-4 text-right">Facturación Bruta</th>
                        <th className="py-3 px-4 text-right">Ticket Promedio</th>
                        <th className="py-3 px-4 text-center">Tiempo Promedio</th>
                        <th className="py-3 px-4 text-center">Diagnóstico Operativo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {datosReporte.map((item, idx) => {
                        const pctVolumen =
                          metricasConsolidadas.volumenTotal > 0
                            ? (item.volumen_reparaciones / metricasConsolidadas.volumenTotal) * 100
                            : 0;
                        const ticketProm =
                          item.volumen_reparaciones > 0
                            ? Number(item.facturacion_bruta) / item.volumen_reparaciones
                            : 0;
                        const dias = Number(item.tiempo_promedio_dias) || 0;
                        const esAgil = dias <= 2.0;
                        const esNormal = dias > 2.0 && dias <= 5.0;

                        return (
                          <tr key={item.id_categoria || idx} className="hover:bg-slate-800/40 transition-colors">
                            {/* Categoría */}
                            <td className="py-3.5 px-5 font-semibold text-white whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                                <span>{item.nombre_categoria || 'General / Sin Categoría'}</span>
                              </div>
                            </td>

                            {/* Volumen Culminado */}
                            <td className="py-3.5 px-4 font-mono font-bold text-center text-slate-200">
                              {item.volumen_reparaciones}
                            </td>

                            {/* % de la Demanda */}
                            <td className="py-3.5 px-4 font-mono text-center text-slate-400">
                              {formatearPorcentaje(pctVolumen)}
                            </td>

                            {/* Facturación Bruta */}
                            <td className="py-3.5 px-4 font-mono font-bold text-right text-emerald-400">
                              {formatearMoneda(item.facturacion_bruta)}
                            </td>

                            {/* Ticket Promedio */}
                            <td className="py-3.5 px-4 font-mono text-right text-slate-300">
                              {formatearMoneda(ticketProm)}
                            </td>

                            {/* Tiempo Promedio */}
                            <td className="py-3.5 px-4 font-mono text-center whitespace-nowrap">
                              <span className="font-bold text-cyan-300">
                                {item.tiempo_promedio_dias} d
                              </span>{' '}
                              <span className="text-[10px] text-slate-500">
                                ({item.tiempo_promedio_horas} hs)
                              </span>
                            </td>

                            {/* Diagnóstico Operativo */}
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
                                  esAgil
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                    : esNormal
                                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                    : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                }`}
                              >
                                <span>{esAgil ? '⚡' : esNormal ? '⏱️' : '⚠️'}</span>
                                <span>
                                  {esAgil
                                    ? 'Resolución Ágil'
                                    : esNormal
                                    ? 'Ritmo Estándar'
                                    : 'Cuello de Botella'}
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

