import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../../context/useAuth';
import AdminSidebar from '../../../components/navigation/AdminSidebar';
import AdminHeader from '../../../components/navigation/AdminHeader';
import { HorizontalBarChart, DualBarChart, DonutChart } from '../../../components/charts/ReportCharts';
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

export default function AdminLogisticsReportScreen() {
  const { token } = useAuth();

  // ============================================================================
  // ESTADOS DE PARÁMETROS TEMPORALES Y GEOGRÁFICOS (PASOS 2 Y 3)
  // ============================================================================
  const hoy = useMemo(() => new Date(), []);
  const haceTreintaDias = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);

  const [fechaInicio, setFechaInicio] = useState(obtenerFechaFormato(haceTreintaDias));
  const [fechaFin, setFechaFin] = useState(obtenerFechaFormato(hoy));
  const [idProvincia, setIdProvincia] = useState('');
  const [idCiudad, setIdCiudad] = useState('');
  const [estadoVenta, setEstadoVenta] = useState('');

  // Catálogos territoriales
  const [provincias, setProvincias] = useState([]);
  const [ciudades, setCiudades] = useState([]);
  const [cargandoGeo, setCargandoGeo] = useState(false);

  // Estados de datos
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
  // CARGA DE PROVINCIAS (CATÁLOGO INICIAL)
  // ============================================================================
  useEffect(() => {
    const cargarProvincias = async () => {
      if (!token) return;
      setCargandoGeo(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/geo/provincias/?todas=true`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const items = Array.isArray(res.data) ? res.data : [];
        setProvincias(items);
      } catch (err) {
        console.warn('No fue posible cargar las provincias:', err);
      } finally {
        setCargandoGeo(false);
      }
    };
    cargarProvincias();
  }, [token]);

  // ============================================================================
  // CARGA DE CIUDADES EN CASCADA AL SELECCIONAR PROVINCIA
  // ============================================================================
  useEffect(() => {
    if (!idProvincia) {
      setCiudades([]);
      setIdCiudad('');
      return;
    }

    const cargarCiudades = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/geo/provincias/${idProvincia}/ciudades/?todas=true`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const items = Array.isArray(res.data) ? res.data : [];
        setCiudades(items);
      } catch (err) {
        console.warn('No fue posible cargar las ciudades de la provincia:', err);
        setCiudades([]);
      }
    };
    cargarCiudades();
  }, [idProvincia, token]);

  // ============================================================================
  // CONSULTA Y ANÁLISIS DE DISTRIBUCIÓN GEOGRÁFICA (PASOS 4, 5, 6 Y 7)
  // ============================================================================
  const consultarReporteLogistico = useCallback(
    async (overrideParams = {}) => {
      const fInicio = overrideParams.fecha_inicio !== undefined ? overrideParams.fecha_inicio : fechaInicio;
      const fFin = overrideParams.fecha_fin !== undefined ? overrideParams.fecha_fin : fechaFin;
      const prov = overrideParams.id_provincia !== undefined ? overrideParams.id_provincia : idProvincia;
      const ciu = overrideParams.id_ciudad !== undefined ? overrideParams.id_ciudad : idCiudad;
      const est = overrideParams.estado_venta !== undefined ? overrideParams.estado_venta : estadoVenta;

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
        if (prov && prov !== '') params.id_provincia = Number(prov);
        if (ciu && ciu !== '') params.id_ciudad = Number(ciu);
        if (est && est !== '') params.estado_venta = est;

        const res = await axios.get(`${API_BASE_URL}/api/sales/reportes/logistica/`, {
          headers: { Authorization: `Bearer ${token}` },
          params
        });

        const items = Array.isArray(res.data) ? res.data : [];
        if (items.length === 0) {
          setSinDatos(true);
          setMensajeSinDatos('En el periodo o zona consultada no existen ventas bajo modalidad de envío a domicilio.');
          setDatosReporte([]);
        } else {
          setDatosReporte(items);
        }
      } catch (err) {
        console.error('Error al generar reporte logístico:', err);
        const detalleError = err.response?.data?.error || err.response?.data?.detail;
        const textoError = typeof detalleError === 'object' ? JSON.stringify(detalleError) : String(detalleError || '');

        // Paso 5: Excepción de ausencia de operaciones de envío
        if (
          err.response?.status === 400 &&
          (textoError.includes('no existen ventas bajo modalidad de envío') ||
            textoError.includes('modalidad de envío') ||
            textoError.includes('sin envíos'))
        ) {
          setSinDatos(true);
          setMensajeSinDatos(
            textoError || 'En el periodo o zona consultada no existen ventas bajo modalidad de envío a domicilio.'
          );
          setDatosReporte(null);
        } else {
          dispararAlerta('error', textoError || 'Ocurrió un error al procesar el reporte de distribución logística.');
        }
      } finally {
        setCargando(false);
      }
    },
    [token, fechaInicio, fechaFin, idProvincia, idCiudad, estadoVenta, dispararAlerta]
  );

  // Ejecución inicial automática
  useEffect(() => {
    consultarReporteLogistico();
  }, [consultarReporteLogistico]);

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
    consultarReporteLogistico({ fecha_inicio: strDesde, fecha_fin: strHasta });
  };

  const handleRestablecerFiltros = () => {
    const strDesde = obtenerFechaFormato(haceTreintaDias);
    const strHasta = obtenerFechaFormato(hoy);
    setFechaInicio(strDesde);
    setFechaFin(strHasta);
    setIdProvincia('');
    setIdCiudad('');
    setEstadoVenta('');
    consultarReporteLogistico({
      fecha_inicio: strDesde,
      fecha_fin: strHasta,
      id_provincia: '',
      id_ciudad: '',
      estado_venta: ''
    });
  };

  // ============================================================================
  // CÁLCULO DE KPIS CONSOLIDADOS TERRITORIALES (PASOS 6, 7 Y 8)
  // ============================================================================
  const metricasConsolidadas = useMemo(() => {
    if (!datosReporte || !Array.isArray(datosReporte) || datosReporte.length === 0) {
      return null;
    }

    let volumenTotal = 0;
    let recaudacionLogisticaTotal = 0;
    let facturacionBrutaTotal = 0;
    let zonaTopVolumen = null;
    let zonaTopFacturacion = null;

    datosReporte.forEach((item) => {
      const vol = Number(item.volumen_envios) || 0;
      const rec = Number(item.recaudacion_logistica) || 0;
      const fact = Number(item.facturacion_bruta) || 0;

      volumenTotal += vol;
      recaudacionLogisticaTotal += rec;
      facturacionBrutaTotal += fact;

      if (!zonaTopVolumen || vol > Number(zonaTopVolumen.volumen_envios || 0)) {
        zonaTopVolumen = item;
      }
      if (!zonaTopFacturacion || fact > Number(zonaTopFacturacion.facturacion_bruta || 0)) {
        zonaTopFacturacion = item;
      }
    });

    const ticketPromedioGlobal = volumenTotal > 0 ? facturacionBrutaTotal / volumenTotal : 0;
    const fletePromedio = volumenTotal > 0 ? recaudacionLogisticaTotal / volumenTotal : 0;

    return {
      totalZonas: datosReporte.length,
      volumenTotal,
      recaudacionLogisticaTotal,
      facturacionBrutaTotal,
      ticketPromedioGlobal,
      fletePromedio,
      zonaTopVolumen,
      zonaTopFacturacion
    };
  }, [datosReporte]);

  // ============================================================================
  // EXPORTACIÓN A PDF PROFESIONAL DE ALTA FIDELIDAD (SIN HOJAS EN BLANCO)
  // ============================================================================
  const handleExportarPDF = () => {
    if (!datosReporte || !Array.isArray(datosReporte) || datosReporte.length === 0) {
      dispararAlerta('error', 'No hay datos cargados para exportar el reporte logístico.');
      return;
    }

    const { totalZonas, volumenTotal, recaudacionLogisticaTotal, facturacionBrutaTotal, ticketPromedioGlobal, fletePromedio } =
      metricasConsolidadas || {};

    const columnas = [
      { header: 'Provincia', key: 'nombre_provincia' },
      { header: 'Ciudad / Localidad', key: 'nombre_ciudad' },
      { header: 'Envíos', key: 'volumen_envios', align: 'center' },
      {
        header: '% Part.',
        key: 'pct',
        align: 'center',
        render: (f) => formatearPorcentaje(volumenTotal > 0 ? (f.volumen_envios / volumenTotal) * 100 : 0)
      },
      { header: 'Recaudación Fletes', key: 'recaudacion_logistica', align: 'right', render: (f) => formatearMoneda(f.recaudacion_logistica) },
      { header: 'Facturación Bruta', key: 'facturacion_bruta', align: 'right', render: (f) => formatearMoneda(f.facturacion_bruta) },
      { header: 'Ticket Promedio', key: 'ticket_promedio', align: 'right', render: (f) => formatearMoneda(f.ticket_promedio) }
    ];

    exportarInformePDF({
      titulo: 'Informe Ejecutivo: Distribución Geográfica y Logística',
      subtitulo: `Período: ${fechaInicio} al ${fechaFin} | Modalidad: Ventas con Envío a Domicilio`,
      resumenEjecutivo: `Análisis de concentración geográfica de ventas e-commerce en ${totalZonas || 0} localidades. Se registraron ${volumenTotal || 0} despachos a domicilio con una recaudación logística acumulada de ${formatearMoneda(recaudacionLogisticaTotal || 0)} (flete promedio: ${formatearMoneda(fletePromedio || 0)}) y una facturación bruta regional de ${formatearMoneda(facturacionBrutaTotal || 0)}, alcanzando un ticket promedio por despacho de ${formatearMoneda(ticketPromedioGlobal || 0)}.`,
      kpis: [
        { label: 'Destinos Activos', valor: `${totalZonas || 0}`, detalle: 'Ciudades atendidas' },
        { label: 'Volumen Despachado', valor: `${volumenTotal || 0} envíos`, detalle: 'Paquetes entregados' },
        { label: 'Recaudación Fletes', valor: formatearMoneda(recaudacionLogisticaTotal || 0), detalle: `Prom: ${formatearMoneda(fletePromedio || 0)}` },
        { label: 'Facturación Regional', valor: formatearMoneda(facturacionBrutaTotal || 0), detalle: `Ticket: ${formatearMoneda(ticketPromedioGlobal || 0)}` }
      ],
      tablas: [
        {
          titulo: 'Desglose Territorial de Ventas, Envíos y Fletes',
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
    const { volumenTotal, recaudacionLogisticaTotal, facturacionBrutaTotal, ticketPromedioGlobal, totalZonas } =
      metricasConsolidadas;

    let desgloseZonas = '';
    datosReporte.forEach((item) => {
      desgloseZonas += `  • ${item.nombre_ciudad}, ${item.nombre_provincia}: ${item.volumen_envios} envíos | Fletes: ${formatearMoneda(item.recaudacion_logistica)} | Facturación: ${formatearMoneda(item.facturacion_bruta)} | Ticket Prom: ${formatearMoneda(item.ticket_promedio)}\n`;
    });

    const texto = `=== INFORME GERENCIAL: DISTRIBUCIÓN GEOGRÁFICA Y LOGÍSTICA ===\n` +
      `Período Analizado: ${fechaInicio} al ${fechaFin}\n` +
      `Modalidad Auditada: Envío a domicilio (E-commerce)\n` +
      `--------------------------------------------------------\n` +
      `• Destinos Territoriales Activos: ${totalZonas} ciudades/localidades\n` +
      `• Volumen Total de Envíos Despachados: ${volumenTotal} paquetes\n` +
      `• Recaudación por Logística (Fletes): ${formatearMoneda(recaudacionLogisticaTotal)}\n` +
      `• Facturación Bruta Regional: ${formatearMoneda(facturacionBrutaTotal)}\n` +
      `• Ticket Promedio por Envío: ${formatearMoneda(ticketPromedioGlobal)}\n` +
      `--------------------------------------------------------\n` +
      `Desglose por Territorio:\n${desgloseZonas}` +
      `========================================================`;

    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-sans overflow-hidden">
      {/* 1. Barra Lateral de Navegación */}
      <AdminSidebar activeMenu="metrics-logistics" />

      {/* 2. Área de Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <AdminHeader
          category="Métricas y Análisis"
          subcategory="E-Commerce & Envíos"
          pageName="Distribución y Logística"
          title="Reporte de Distribución Geográfica y Logística"
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
                  Inteligencia Comercial &middot; E-Commerce & Logística
                </span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Distribución Geográfica y Rendimiento Logístico
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Análisis de concentración territorial de ventas e-commerce: volumen de fletes despachados, recaudación logística, facturación regional y ticket promedio por zona de entrega.
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
                onClick={() => consultarReporteLogistico()}
                disabled={cargando}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 text-xs font-mono font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                <span>{cargando ? '🔄' : '⚡'}</span>
                <span>{cargando ? 'Analizando...' : 'Actualizar'}</span>
              </button>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* PANEL DE FILTROS Y PARÁMETROS GEOGRÁFICOS (PASOS 2, 3 Y 4)            */}
          {/* ===================================================================== */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">🗺️</span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Horizonte Temporal & Segmentación Territorial
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
                consultarReporteLogistico();
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
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
                  className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
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
                  className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* 3. Provincia */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Provincia
                </label>
                <select
                  value={idProvincia}
                  onChange={(e) => setIdProvincia(e.target.value)}
                  disabled={cargandoGeo}
                  className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
                >
                  <option value="">Todas las Provincias</option>
                  {provincias.map((p) => (
                    <option key={p.id_provincia} value={p.id_provincia}>
                      {p.nombre_provincia}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Ciudad */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Ciudad
                </label>
                <select
                  value={idCiudad}
                  onChange={(e) => setIdCiudad(e.target.value)}
                  disabled={!idProvincia || ciudades.length === 0}
                  className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
                >
                  <option value="">Todas las Ciudades</option>
                  {ciudades.map((c) => (
                    <option key={c.id_ciudad} value={c.id_ciudad}>
                      {c.nombre_ciudad}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Estado de Venta */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Estado de Venta
                </label>
                <select
                  value={estadoVenta}
                  onChange={(e) => setEstadoVenta(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  <option value="">Todos los Estados</option>
                  <option value="PAGADA">Pagada</option>
                  <option value="FINALIZADA">Finalizada / Entregada</option>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="CANCELADA">Cancelada</option>
                </select>
              </div>

              {/* 6. Botones de Filtrado */}
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
                  {cargando ? 'Filtrando...' : 'Analizar'}
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
                Aislando direcciones selladas en ventas e-commerce y procesando métricas logísticas...
              </p>
            </div>
          )}

          {/* ===================================================================== */}
          {/* EXCEPCIÓN PASO 5: UNIVERSO VACÍO (SIN VENTAS DE ENVÍO)                */}
          {/* ===================================================================== */}
          {!cargando && (sinDatos || !metricasConsolidadas) && (
            <div className="py-16 px-6 text-center space-y-4 bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-3xl">
                🚚
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="text-lg font-bold text-white tracking-tight">
                  Sin ventas bajo modalidad de envío
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {mensajeSinDatos || 'En el periodo o zona consultada no existen operaciones con destino a domicilio registradas.'}
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
          {/* TABLERO DE INDICADORES: KPIS Y MATRIZ LOGÍSTICA (PASOS 6, 7 Y 8)      */}
          {/* ===================================================================== */}
          {!cargando && metricasConsolidadas && (
            <>
              {/* 4 Tarjetas KPI Principales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Volumen de Envíos Despachados */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Volumen Logístico</span>
                    <span className="text-base">📦</span>
                  </div>
                  <p className="text-2xl font-black font-mono text-white tracking-tight">
                    {metricasConsolidadas.volumenTotal}{' '}
                    <span className="text-xs font-normal text-slate-400">envíos</span>
                  </p>
                  <p className="text-xs font-mono text-cyan-400 mt-1">
                    En {metricasConsolidadas.totalZonas} territorio(s) activos
                  </p>
                  <span className="text-[10px] text-slate-500 mt-2 block border-t border-slate-800/80 pt-2">
                    Operaciones e-commerce con destino a domicilio
                  </span>
                </div>

                {/* 2. Recaudación por Logística (Fletes) */}
                <div className="bg-[#1E293B] border border-cyan-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-cyan-500/50 transition-colors bg-gradient-to-br from-[#1E293B] to-cyan-950/20">
                  <div className="flex items-center justify-between text-cyan-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Recaudación Fletes</span>
                    <span className="text-base">🚚</span>
                  </div>
                  <p className="text-2xl font-black font-mono text-cyan-400 tracking-tight">
                    {formatearMoneda(metricasConsolidadas.recaudacionLogisticaTotal)}
                  </p>
                  <p className="text-xs font-mono text-cyan-300 mt-1">
                    Flete Promedio: {formatearMoneda(metricasConsolidadas.fletePromedio)}
                  </p>
                  <span className="text-[10px] text-cyan-400/80 mt-2 block border-t border-cyan-900/40 pt-2">
                    Ingresos recaudados por concepto de fletes y tarifas
                  </span>
                </div>

                {/* 3. Facturación Bruta Regional */}
                <div className="bg-[#1E293B] border border-emerald-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-colors bg-gradient-to-br from-[#1E293B] to-emerald-950/20">
                  <div className="flex items-center justify-between text-emerald-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Facturación Regional</span>
                    <span className="text-base">💰</span>
                  </div>
                  <p className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                    {formatearMoneda(metricasConsolidadas.facturacionBrutaTotal)}
                  </p>
                  <p className="text-xs font-mono text-emerald-300 mt-1">
                    Ticket Prom: {formatearMoneda(metricasConsolidadas.ticketPromedioGlobal)}
                  </p>
                  <span className="text-[10px] text-emerald-400/80 mt-2 block border-t border-emerald-900/40 pt-2">
                    Masa total vendida en ventas a domicilio (artículos + flete)
                  </span>
                </div>

                {/* 4. Núcleo de Mayor Concentración */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between text-amber-400 text-xs font-mono uppercase tracking-wider mb-2">
                    <span>Núcleo Principal</span>
                    <span className="text-base">📍</span>
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-white text-sm truncate">
                      {metricasConsolidadas.zonaTopVolumen?.nombre_ciudad || 'N/D'}
                    </p>
                    <p className="text-xs text-slate-400 font-mono">
                      {metricasConsolidadas.zonaTopVolumen?.nombre_provincia || ''} &middot;{' '}
                      <span className="text-cyan-400 font-bold">
                        {metricasConsolidadas.zonaTopVolumen?.volumen_envios || 0} envíos
                      </span>
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-2 block border-t border-slate-800/80 pt-2">
                    Mayor densidad logística para convenios de mensajería
                  </span>
                </div>
              </div>

              {/* ================================================================= */}
                            {/* ===================================================================== */}
              {/* VISUALIZACIONES ANALÍTICAS Y GRÁFICOS (OBJ-07)                        */}
              {/* ===================================================================== */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfico 1: Participación por Zona (Donut) */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>🗺️</span> Participación por Territorio
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Distribución de despachos por ciudad / localidad
                      </p>
                    </div>
                  </div>
                  <DonutChart
                    data={datosReporte.slice(0, 6).map((item) => ({
                      label: `${item.nombre_ciudad}`,
                      value: Number(item.volumen_envios) || 0
                    }))}
                    totalLabel="Envíos Totales"
                  />
                </div>

                {/* Gráfico 2: Facturación Regional vs Recaudación Fletes */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>💰</span> Facturación vs Recaudación Logística
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Volumen financiero generado vs masa de fletes percibida
                      </p>
                    </div>
                  </div>
                  <DualBarChart
                    data={datosReporte.slice(0, 7).map((item) => ({
                      label: item.nombre_ciudad,
                      valA: Number(item.facturacion_bruta) || 0,
                      valB: Number(item.recaudacion_logistica) || 0
                    }))}
                    labelA="Facturación Bruta"
                    labelB="Recaudación Fletes"
                    colorA="#10B981"
                    colorB="#06B6D4"
                    formatterA={(v) => formatearMoneda(v)}
                    formatterB={(v) => formatearMoneda(v)}
                  />
                </div>
              </div>

              {/* DISTRIBUCIÓN TERRITORIAL DE ENVÍOS (VISUAL BARS)                  */}
              {/* ================================================================= */}
              <section className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Concentración Territorial de Envíos y Facturación
                    </h3>
                    <p className="text-xs text-slate-400">
                      Participación porcentual de despachos sobre el total de ventas e-commerce entregadas a domicilio.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Alta Concentración (&ge; 25%)
                    </span>
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Demanda Media (10-24%)
                    </span>
                    <span className="flex items-center gap-1.5 text-violet-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-violet-400" /> Zona Emergente (&lt; 10%)
                    </span>
                  </div>
                </div>

                <div className="space-y-4 pt-1">
                  {datosReporte.map((item, idx) => {
                    const pctVolumen =
                      metricasConsolidadas.volumenTotal > 0
                        ? (item.volumen_envios / metricasConsolidadas.volumenTotal) * 100
                        : 0;
                    const esAlta = pctVolumen >= 25;
                    const esMedia = pctVolumen >= 10 && pctVolumen < 25;

                    return (
                      <div key={`${item.id_provincia}-${item.id_ciudad}-${idx}`} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">
                              {item.nombre_ciudad}
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({item.nombre_provincia})
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">
                              {item.volumen_envios} envíos ({formatearPorcentaje(pctVolumen)})
                            </span>
                            <span className="text-cyan-400 font-medium">
                              Fletes: {formatearMoneda(item.recaudacion_logistica)}
                            </span>
                            <span className="text-emerald-400 font-bold">
                              {formatearMoneda(item.facturacion_bruta)}
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              esAlta
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : esMedia
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                                : 'bg-gradient-to-r from-violet-500 to-indigo-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(3, pctVolumen))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* ===================================================================== */}
              {/* TABLA ANALÍTICA DETALLADA (PASOS 6, 7 Y 8)                            */}
              {/* ===================================================================== */}
              <section className="bg-[#1E293B] border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-4">
                <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">📍</span>
                      <h3 className="text-base font-bold text-white tracking-tight">
                        Matriz Geográfica: Volumen, Fletes y Facturación por Territorio
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400">
                      Direcciones físicas selladas unívocamente al cierre de compra, agrupadas por Ciudad y Provincia.
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-mono text-cyan-300">
                    {datosReporte.length} localidad(es) analizadas
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-700/80 bg-slate-900/60 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-5">Provincia de Destino</th>
                        <th className="py-3 px-4">Ciudad / Localidad</th>
                        <th className="py-3 px-4 text-center">Volumen de Envíos</th>
                        <th className="py-3 px-4 text-center">% de Participación</th>
                        <th className="py-3 px-4 text-right">Recaudación Fletes</th>
                        <th className="py-3 px-4 text-right">Facturación Bruta</th>
                        <th className="py-3 px-4 text-right">Ticket Promedio</th>
                        <th className="py-3 px-4 text-center">Densidad Comercial</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {datosReporte.map((item, idx) => {
                        const pctVolumen =
                          metricasConsolidadas.volumenTotal > 0
                            ? (item.volumen_envios / metricasConsolidadas.volumenTotal) * 100
                            : 0;
                        const esAlta = pctVolumen >= 25;
                        const esMedia = pctVolumen >= 10 && pctVolumen < 25;

                        return (
                          <tr
                            key={`${item.id_provincia}-${item.id_ciudad}-${idx}`}
                            className="hover:bg-slate-800/40 transition-colors"
                          >
                            {/* Provincia */}
                            <td className="py-3.5 px-5 font-semibold text-slate-300 whitespace-nowrap">
                              {item.nombre_provincia}
                            </td>

                            {/* Ciudad */}
                            <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                                <span>{item.nombre_ciudad}</span>
                              </div>
                            </td>

                            {/* Volumen de Envíos */}
                            <td className="py-3.5 px-4 font-mono font-bold text-center text-slate-200">
                              {item.volumen_envios}
                            </td>

                            {/* % Participación */}
                            <td className="py-3.5 px-4 font-mono text-center text-slate-400">
                              {formatearPorcentaje(pctVolumen)}
                            </td>

                            {/* Recaudación Fletes */}
                            <td className="py-3.5 px-4 font-mono font-bold text-right text-cyan-400">
                              {formatearMoneda(item.recaudacion_logistica)}
                            </td>

                            {/* Facturación Bruta */}
                            <td className="py-3.5 px-4 font-mono font-bold text-right text-emerald-400">
                              {formatearMoneda(item.facturacion_bruta)}
                            </td>

                            {/* Ticket Promedio */}
                            <td className="py-3.5 px-4 font-mono text-right text-slate-300">
                              {formatearMoneda(item.ticket_promedio)}
                            </td>

                            {/* Densidad Comercial */}
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
                                  esAlta
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                    : esMedia
                                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                    : 'bg-violet-500/10 text-violet-300 border-violet-500/30'
                                }`}
                              >
                                {esAlta
                                  ? 'Alta Concentración'
                                  : esMedia
                                  ? 'Demanda Media'
                                  : 'Zona Emergente'}
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
