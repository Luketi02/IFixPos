import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../../context/useAuth';
import AdminSidebar from '../../../components/navigation/AdminSidebar';
import AdminHeader from '../../../components/navigation/AdminHeader';
import { StarHistogramChart, HorizontalBarChart } from '../../../components/charts/ReportCharts';
import { exportarInformePDF } from '../../../utils/reportPrinter';

import { API_BASE_URL } from '../../../config/api';
// ==============================================================================
// UTILIDADES DE FORMATEO Y ESTILOS
// ==============================================================================
const formatearFecha = (fechaStr) => {
  if (!fechaStr) return 'Sin fecha';
  const partes = String(fechaStr).split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return fechaStr;
};

const obtenerFechaFormato = (d) => {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
};

// Renderizado de estrellas visuales
const renderEstrellasVisuales = (puntuacion, max = 5, sizeClass = 'text-base') => {
  const estrellas = [];
  const punt = Number(puntuacion) || 0;
  for (let i = 1; i <= max; i++) {
    const llena = i <= Math.round(punt);
    estrellas.push(
      <span
        key={i}
        className={`${sizeClass} ${
          llena ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]' : 'text-slate-600'
        }`}
      >
        ★
      </span>
    );
  }
  return <div className="inline-flex items-center gap-0.5">{estrellas}</div>;
};

export default function AdminSatisfactionReportScreen() {
  const { token } = useAuth();

  // ============================================================================
  // ESTADOS DE PARÁMETROS TEMPORALES Y FILTROS (PASOS 2 Y 3)
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
  const [idCategoria, setIdCategoria] = useState('');
  const [rangoEstrellasMin, setRangoEstrellasMin] = useState('');
  const [rangoEstrellasMax, setRangoEstrellasMax] = useState('');
  const [filtroRapidoEstrellas, setFiltroRapidoEstrellas] = useState('todas'); // 'todas' | 'criticas' | 'excelencia'

  // Catálogos auxiliares
  const [listaCategorias, setListaCategorias] = useState([]);
  const [listaTecnicos, setListaTecnicos] = useState([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(false);

  // Estados de datos
  const [datosReporte, setDatosReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [sinDatos, setSinDatos] = useState(false);
  const [mensajeSinDatos, setMensajeSinDatos] = useState('');
  const [alerta, setAlerta] = useState(null);
  const [copiado, setCopiado] = useState(false);

  // Pestaña activa para visualización detallada
  const [pestanaActiva, setPestanaActiva] = useState('matriz'); // 'matriz' | 'tecnicos' | 'categorias' | 'comentarios'
  const [busquedaComentario, setBusquedaComentario] = useState('');
  const [filtroEstrellaComentario, setFiltroEstrellaComentario] = useState('todas');

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
  // CARGA DE CATÁLOGOS AUXILIARES (CATEGORÍAS DE REPARACIÓN)
  // ============================================================================
  useEffect(() => {
    const cargarCategorias = async () => {
      if (!token) return;
      setCargandoCatalogos(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/workshop/categorias-reparacion/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const items = Array.isArray(res.data) ? res.data : [];
        setListaCategorias(items.filter((c) => c.estado_activo !== false));
      } catch (err) {
        console.warn('No fue posible cargar las categorías de reparación:', err);
      } finally {
        setCargandoCatalogos(false);
      }
    };
    cargarCategorias();
  }, [token]);

  // ============================================================================
  // CONSULTA Y ANÁLISIS DE SATISFACCIÓN (PASOS 4 Y 5)
  // ============================================================================
  const consultarReporteSatisfaccion = useCallback(
    async (overrideParams = {}) => {
      const fInicio = overrideParams.fecha_inicio !== undefined ? overrideParams.fecha_inicio : fechaInicio;
      const fFin = overrideParams.fecha_fin !== undefined ? overrideParams.fecha_fin : fechaFin;
      const tec = overrideParams.id_tecnico !== undefined ? overrideParams.id_tecnico : idTecnico;
      const cat = overrideParams.id_categoria !== undefined ? overrideParams.id_categoria : idCategoria;
      const starMin = overrideParams.rango_estrellas_min !== undefined ? overrideParams.rango_estrellas_min : rangoEstrellasMin;
      const starMax = overrideParams.rango_estrellas_max !== undefined ? overrideParams.rango_estrellas_max : rangoEstrellasMax;

      // Paso 4a: Validación de consistencia temporal
      if (!fInicio || !fFin) {
        dispararAlerta('error', 'Debes definir obligatoriamente la Fecha Desde y la Fecha Hasta.');
        return;
      }

      if (fInicio > fFin) {
        dispararAlerta(
          'error',
          'El rango cronológico es inválido: la fecha de inicio no puede ser superior a la fecha de fin.'
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

        if (tec && tec !== '') {
          params.id_tecnico = Number(tec);
        }
        if (cat && cat !== '') {
          params.id_categoria = Number(cat);
        }
        if (starMin !== '' && starMin !== null && starMin !== undefined) {
          params.rango_estrellas_min = Number(starMin);
        }
        if (starMax !== '' && starMax !== null && starMax !== undefined) {
          params.rango_estrellas_max = Number(starMax);
        }

        const res = await axios.get(`${API_BASE_URL}/api/workshop/reportes/satisfaccion/`, {
          headers: { Authorization: `Bearer ${token}` },
          params
        });

        const data = res.data;
        setDatosReporte(data);

        // Si la lista de técnicos para el select está vacía, poblarla con los técnicos reportados
        if (listaTecnicos.length === 0 && data.promedio_por_tecnico?.length > 0 && !tec) {
          setListaTecnicos(
            data.promedio_por_tecnico.map((t) => ({
              id_tecnico: t.id_tecnico,
              nombre_completo: t.nombre_completo
            }))
          );
        }
      } catch (err) {
        console.error('Error al generar reporte de satisfacción:', err);
        const detalleError = err.response?.data?.error || err.response?.data?.detail;
        const textoError = typeof detalleError === 'object' ? JSON.stringify(detalleError) : String(detalleError || '');

        // Paso 5a: Excepción de ausencia de calificaciones
        if (
          err.response?.status === 400 &&
          textoError.toLowerCase().includes('no existen calificaciones')
        ) {
          setSinDatos(true);
          setMensajeSinDatos(
            textoError ||
              'Bajo los parámetros establecidos no existen calificaciones válidas para analizar en este período.'
          );
          setDatosReporte(null);
        } else {
          dispararAlerta('error', textoError || 'Ocurrió un error al procesar el reporte de satisfacción y calidad.');
        }
      } finally {
        setCargando(false);
      }
    },
    [token, fechaInicio, fechaFin, idTecnico, idCategoria, rangoEstrellasMin, rangoEstrellasMax, listaTecnicos.length, dispararAlerta]
  );

  // Carga automática inicial al montar el componente
  useEffect(() => {
    if (token) {
      consultarReporteSatisfaccion();
    }
  }, [token]);

  // ============================================================================
  // PREAJUSTES TEMPORALES RÁPIDOS
  // ============================================================================
  const aplicarAtajoRango = (diasAtras) => {
    const ahora = new Date();
    const desde = new Date();
    if (diasAtras === 'mes_actual') {
      desde.setDate(1);
    } else if (diasAtras === 'anio_actual') {
      desde.setMonth(0, 1);
    } else {
      desde.setDate(ahora.getDate() - diasAtras);
    }

    const strDesde = obtenerFechaFormato(desde);
    const strHasta = obtenerFechaFormato(ahora);

    setFechaInicio(strDesde);
    setFechaFin(strHasta);
    consultarReporteSatisfaccion({ fecha_inicio: strDesde, fecha_fin: strHasta });
  };

  const handleRestablecerFiltros = () => {
    const strDesde = obtenerFechaFormato(haceTreintaDias);
    const strHasta = obtenerFechaFormato(hoy);
    setFechaInicio(strDesde);
    setFechaFin(strHasta);
    setIdTecnico('');
    setIdCategoria('');
    setRangoEstrellasMin('');
    setRangoEstrellasMax('');
    setFiltroRapidoEstrellas('todas');
    consultarReporteSatisfaccion({
      fecha_inicio: strDesde,
      fecha_fin: strHasta,
      id_tecnico: '',
      id_categoria: '',
      rango_estrellas_min: '',
      rango_estrellas_max: ''
    });
  };

  // Manejo de botones de filtro rápido de estrellas
  const handleCambiarFiltroRapidoEstrellas = (tipo) => {
    setFiltroRapidoEstrellas(tipo);
    if (tipo === 'criticas') {
      setRangoEstrellasMin(1);
      setRangoEstrellasMax(3);
      consultarReporteSatisfaccion({ rango_estrellas_min: 1, rango_estrellas_max: 3 });
    } else if (tipo === 'excelencia') {
      setRangoEstrellasMin(4);
      setRangoEstrellasMax(5);
      consultarReporteSatisfaccion({ rango_estrellas_min: 4, rango_estrellas_max: 5 });
    } else {
      setRangoEstrellasMin('');
      setRangoEstrellasMax('');
      consultarReporteSatisfaccion({ rango_estrellas_min: '', rango_estrellas_max: '' });
    }
  };

  // ============================================================================
  // CÁLCULO DE KPIS Y DESTACADOS
  // ============================================================================
  const metricasDestacadas = useMemo(() => {
    if (!datosReporte) return null;

    const { promedio_por_tecnico = [], promedio_por_categoria = [] } = datosReporte;

    let mejorTecnico = null;
    let peorTecnico = null;
    if (promedio_por_tecnico.length > 0) {
      mejorTecnico = [...promedio_por_tecnico].sort((a, b) => b.promedio_estrellas - a.promedio_estrellas)[0];
      peorTecnico = [...promedio_por_tecnico].sort((a, b) => a.promedio_estrellas - b.promedio_estrellas)[0];
    }

    let mejorCategoria = null;
    let peorCategoria = null;
    if (promedio_por_categoria.length > 0) {
      mejorCategoria = [...promedio_por_categoria].sort((a, b) => b.promedio_estrellas - a.promedio_estrellas)[0];
      peorCategoria = [...promedio_por_categoria].sort((a, b) => a.promedio_estrellas - b.promedio_estrellas)[0];
    }

    return {
      mejorTecnico,
      peorTecnico,
      mejorCategoria,
      peorCategoria
    };
  }, [datosReporte]);

  // ============================================================================
  // CÁLCULO DE HISTOGRAMA DE FRECUENCIA DE ESTRELLAS (1★ A 5★)
  // ============================================================================
  const distribucionEstrellas = useMemo(() => {
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    if (!datosReporte?.comentarios || !Array.isArray(datosReporte.comentarios)) return dist;
    datosReporte.comentarios.forEach((c) => {
      const p = Number(c.puntuacion);
      if (dist[p] !== undefined) {
        dist[p] += 1;
      }
    });
    return dist;
  }, [datosReporte]);

  // ============================================================================
  // FILTRADO DINÁMICO DE COMENTARIOS CUALITATIVOS
  // ============================================================================
  const comentariosFiltrados = useMemo(() => {
    if (!datosReporte?.comentarios) return [];
    let list = datosReporte.comentarios;

    // Filtro por estrella
    if (filtroEstrellaComentario !== 'todas') {
      const star = Number(filtroEstrellaComentario);
      list = list.filter((c) => c.puntuacion === star);
    }

    // Filtro de búsqueda textual
    if (busquedaComentario.trim()) {
      const q = busquedaComentario.toLowerCase();
      list = list.filter(
        (c) =>
          c.comentario?.toLowerCase().includes(q) ||
          c.cliente_nombre?.toLowerCase().includes(q) ||
          c.tecnico_nombre?.toLowerCase().includes(q) ||
          c.categorias?.some((cat) => cat.toLowerCase().includes(q))
      );
    }

    return list;
  }, [datosReporte, filtroEstrellaComentario, busquedaComentario]);

  // ============================================================================
  // EXPORTACIÓN A PDF PROFESIONAL DE ALTA FIDELIDAD (SIN HOJAS EN BLANCO)
  // ============================================================================
  const handleExportarPDF = () => {
    if (!datosReporte) {
      dispararAlerta('error', 'No hay datos cargados para exportar el reporte de satisfacción.');
      return;
    }

    const {
      csat_global,
      total_resenas,
      resenas_criticas_total,
      porcentaje_criticas,
      promedio_por_tecnico = [],
      promedio_por_categoria = [],
      matriz_calidad = []
    } = datosReporte;

    const columnasMatriz = [
      { header: 'Técnico Responsable', key: 'nombre_tecnico' },
      { header: 'Rubro / Categoría', key: 'nombre_categoria' },
      { header: 'Evaluaciones', key: 'total_resenas', align: 'center' },
      { header: 'CSAT (Promedio)', key: 'promedio_estrellas', align: 'center', render: (f) => `${Number(f.promedio_estrellas).toFixed(2)} ★` }
    ];

    const columnasTecnicos = [
      { header: 'Técnico Operativo', key: 'nombre_completo' },
      { header: 'Total Reseñas', key: 'total_resenas', align: 'center' },
      { header: 'CSAT Promedio', key: 'promedio_estrellas', align: 'center', render: (f) => `${Number(f.promedio_estrellas).toFixed(2)} ★` }
    ];

    exportarInformePDF({
      titulo: 'Informe Ejecutivo: Satisfacción del Cliente y Calidad (CSAT)',
      subtitulo: `Período Auditado: ${fechaInicio} al ${fechaFin} | Taller Central`,
      resumenEjecutivo: `Auditoría global de calidad post-servicio sobre un volumen de ${total_resenas} valoraciones de clientes. Se obtuvo un índice CSAT global de ${csat_global.toFixed(2)} / 5.00 estrellas. Se identificaron ${resenas_criticas_total} reseñas críticas (≤ 3★, equivalente al ${porcentaje_criticas.toFixed(1)}% del total) que demandan seguimiento preventivo o correctivo.`,
      kpis: [
        { label: 'Índice CSAT Global', valor: `${csat_global.toFixed(2)} / 5.00 ★`, detalle: csat_global >= 4 ? 'Nivel Excelente' : 'Requiere Atención' },
        { label: 'Total Evaluaciones', valor: `${total_resenas}`, detalle: 'Opiniones de clientes' },
        { label: 'Reseñas Críticas', valor: `${resenas_criticas_total} (${porcentaje_criticas.toFixed(1)}%)`, detalle: 'Calificación ≤ 3★' },
        { label: 'Técnico Líder', valor: metricasDestacadas?.mejorTecnico?.nombre_completo || 'N/A', detalle: `${metricasDestacadas?.mejorTecnico?.promedio_estrellas?.toFixed(1) || '-'} ★ de promedio` }
      ],
      tablas: [
        {
          titulo: 'Rendimiento Promedio por Personal Técnico',
          columnas: columnasTecnicos,
          filas: promedio_por_tecnico
        },
        {
          titulo: 'Matriz Cruzada de Calidad: Técnico × Rubro de Servicio',
          columnas: columnasMatriz,
          filas: matriz_calidad
        }
      ]
    });
  };

  // ============================================================================
  // COPIAR RESUMEN GERENCIAL AL PORTAPAPELES
  // ============================================================================
  const handleCopiarResumen = () => {
    if (!datosReporte) return;
    const { total_resenas, csat_global, resenas_criticas_total, porcentaje_criticas, promedio_por_tecnico, promedio_por_categoria } =
      datosReporte;

    let desgloseTecnicos = '';
    (promedio_por_tecnico || []).forEach((t) => {
      desgloseTecnicos += `  • ${t.nombre_completo}: ${t.promedio_estrellas.toFixed(2)} ★ (${t.total_resenas} reseñas)
`;
    });

    let desgloseCategorias = '';
    (promedio_por_categoria || []).forEach((c) => {
      desgloseCategorias += `  • ${c.nombre_categoria}: ${c.promedio_estrellas.toFixed(2)} ★ (${c.total_resenas} reseñas)
`;
    });

    const texto = `=== INFORME GERENCIAL: ÍNDICE DE SATISFACCIÓN Y CALIDAD (CSAT) ===
` +
      `Período Analizado: ${fechaInicio} al ${fechaFin}
` +
      `--------------------------------------------------------
` +
      `• CSAT Global: ${csat_global.toFixed(2)} / 5.00 Estrellas
` +
      `• Volumen Total de Reseñas: ${total_resenas} evaluaciones
` +
      `• Reseñas Críticas (≤ 3★): ${resenas_criticas_total} (${porcentaje_criticas.toFixed(1)}% del total)
` +
      `--------------------------------------------------------
` +
      `Desglose por Personal Técnico:
${desgloseTecnicos || '  Sin datos'}` +
      `--------------------------------------------------------
` +
      `Desglose por Categoría de Reparación:
${desgloseCategorias || '  Sin datos'}` +
      `========================================================`;

    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-sans overflow-hidden">
      {/* 1. Barra Lateral de Navegación */}
      <AdminSidebar activeMenu="metrics-satisfaction" />

      {/* 2. Área de Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <AdminHeader
          category="Métricas y Análisis"
          subcategory="Calidad & Clientes"
          pageName="Satisfacción y Calidad"
          title="Reporte de Satisfacción y Calidad (CSAT)"
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
                  Auditoría Post-Servicio &middot; Percepción del Cliente
                </span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Satisfacción y Calidad Técnica (CSAT)
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Auditoría del nivel de satisfacción tras la entrega de equipos, midiendo el desempeño de los técnicos asignados y rubros de servicio para detectar disconformidades críticas.
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
                onClick={() => consultarReporteSatisfaccion()}
                disabled={cargando}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 text-xs font-mono font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                <span>{cargando ? '🔄' : '⚡'}</span>
                <span>{cargando ? 'Analizando...' : 'Actualizar'}</span>
              </button>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* PANEL DE FILTROS Y PARÁMETROS (PASOS 2 Y 3)                           */}
          {/* ===================================================================== */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">🎯</span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Parámetros de Auditoría de Calidad
                </h3>
              </div>

              {/* Botones de Atajos Temporales */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-mono text-slate-400 mr-1">Rango rápido:</span>
                <button
                  type="button"
                  onClick={() => aplicarAtajoRango(30)}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                >
                  30 días
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtajoRango('mes_actual')}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                >
                  Mes actual
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtajoRango(90)}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                >
                  90 días
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtajoRango('anio_actual')}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                >
                  Año actual
                </button>
                <button
                  type="button"
                  onClick={handleRestablecerFiltros}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer ml-1"
                  title="Restablecer todos los filtros"
                >
                  Limpiar
                </button>
              </div>
            </div>

            {/* Campos de Filtros */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Fecha Desde */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5">
                  Fecha Desde <span className="text-cyan-400 font-bold">*</span>
                </label>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                />
              </div>

              {/* Fecha Hasta */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5">
                  Fecha Hasta <span className="text-cyan-400 font-bold">*</span>
                </label>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                />
              </div>

              {/* Personal Técnico */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5">
                  Personal Técnico
                </label>
                <select
                  value={idTecnico}
                  onChange={(e) => {
                    setIdTecnico(e.target.value);
                    consultarReporteSatisfaccion({ id_tecnico: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                >
                  <option value="">Todo el Personal Técnico</option>
                  {listaTecnicos.map((tec) => (
                    <option key={tec.id_tecnico} value={tec.id_tecnico}>
                      {tec.nombre_completo}
                    </option>
                  ))}
                </select>
              </div>

              {/* Categoría de Reparación */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5">
                  Categoría de Servicio
                </label>
                <select
                  value={idCategoria}
                  onChange={(e) => {
                    setIdCategoria(e.target.value);
                    consultarReporteSatisfaccion({ id_categoria: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                >
                  <option value="">Todas las Categorías</option>
                  {listaCategorias.map((cat) => (
                    <option key={cat.id_categoria} value={cat.id_categoria}>
                      {cat.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Segmentación por Estrellas (Paso 6: Aislamiento de Reseñas Críticas) */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-slate-400">Enfoque de Calidad:</span>
                <button
                  type="button"
                  onClick={() => handleCambiarFiltroRapidoEstrellas('todas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    filtroRapidoEstrellas === 'todas'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                      : 'bg-slate-800/70 hover:bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  Todas las Reseñas (1★ - 5★)
                </button>
                <button
                  type="button"
                  onClick={() => handleCambiarFiltroRapidoEstrellas('criticas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                    filtroRapidoEstrellas === 'criticas'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 font-bold shadow-lg shadow-rose-950/50'
                      : 'bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 border border-rose-900/40'
                  }`}
                >
                  <span>⚠️</span>
                  <span>Solo Reseñas Críticas (≤ 3★)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCambiarFiltroRapidoEstrellas('excelencia')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                    filtroRapidoEstrellas === 'excelencia'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold'
                      : 'bg-slate-800/70 hover:bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  <span>⭐</span>
                  <span>Excelencia (4★ - 5★)</span>
                </button>
              </div>

              {/* Rango de Estrellas Personalizado */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-400">Rango estrellas:</span>
                <select
                  value={rangoEstrellasMin}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRangoEstrellasMin(val);
                    setFiltroRapidoEstrellas('custom');
                    consultarReporteSatisfaccion({ rango_estrellas_min: val });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Min ★</option>
                  <option value="1">1 ★</option>
                  <option value="2">2 ★</option>
                  <option value="3">3 ★</option>
                  <option value="4">4 ★</option>
                  <option value="5">5 ★</option>
                </select>
                <span className="text-slate-500 text-xs font-mono">hasta</span>
                <select
                  value={rangoEstrellasMax}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRangoEstrellasMax(val);
                    setFiltroRapidoEstrellas('custom');
                    consultarReporteSatisfaccion({ rango_estrellas_max: val });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Max ★</option>
                  <option value="1">1 ★</option>
                  <option value="2">2 ★</option>
                  <option value="3">3 ★</option>
                  <option value="4">4 ★</option>
                  <option value="5">5 ★</option>
                </select>
              </div>
            </div>
          </section>

          {/* ===================================================================== */}
          {/* ESTADO DE AUSENCIA DE DATOS (PASO 5A)                                  */}
          {/* ===================================================================== */}
          {sinDatos && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#1E293B] border border-amber-500/30 rounded-2xl p-8 text-center space-y-4 shadow-xl"
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl text-amber-400">
                💬
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Sin Calificaciones en el Período
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  {mensajeSinDatos ||
                    'Bajo los parámetros establecidos no existen calificaciones de clientes registradas para analizar.'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleRestablecerFiltros}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 text-xs font-mono font-medium transition-all cursor-pointer"
                >
                  Ampliar Rango de Búsqueda
                </button>
              </div>
            </motion.div>
          )}

          {/* ===================================================================== */}
          {/* ESTADO DE CARGA                                                       */}
          {/* ===================================================================== */}
          {cargando && (
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Procesando evaluaciones y compilando CSAT de clientes...
              </p>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TABLERO CONSOLIDADO DE CALIDAD Y SATISFACCIÓN (PASOS 4 Y 5)            */}
          {/* ===================================================================== */}
          {!cargando && datosReporte && (
            <div className="space-y-6">
              {/* TARJETAS KPI DE ALTO IMPACTO (CYBER-TECH DARK) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. CSAT Global */}
                <div className="bg-[#1E293B] border border-cyan-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-cyan-500/60 transition-all">
                  <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl group-hover:bg-cyan-500/20 transition-all" />
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-semibold">
                      Índice CSAT Global
                    </span>
                    <span className="text-lg">⭐</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-white font-mono tracking-tight">
                      {datosReporte.csat_global.toFixed(2)}
                    </span>
                    <span className="text-xs font-mono text-slate-400">/ 5.00</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div>{renderEstrellasVisuales(datosReporte.csat_global, 5, 'text-sm')}</div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        datosReporte.csat_global >= 4.0
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : datosReporte.csat_global >= 3.0
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {datosReporte.csat_global >= 4.0
                        ? 'Excelente'
                        : datosReporte.csat_global >= 3.0
                        ? 'Regular'
                        : 'Crítico'}
                    </span>
                  </div>
                </div>

                {/* 2. Volumen de Reseñas */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-600 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold">
                      Volumen de Evaluaciones
                    </span>
                    <span className="text-lg">📝</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-white font-mono tracking-tight">
                      {datosReporte.total_resenas}
                    </span>
                    <span className="text-xs font-mono text-slate-400">opiniones</span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 mt-2">
                    Calificaciones asentadas en el período
                  </p>
                </div>

                {/* 3. Reseñas Críticas (Disconformidades) */}
                <div className="bg-[#1E293B] border border-rose-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-rose-500/60 transition-all">
                  <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-rose-500/10 rounded-full blur-xl group-hover:bg-rose-500/20 transition-all" />
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-rose-400 uppercase tracking-wider font-semibold">
                      Reseñas Críticas (≤ 3★)
                    </span>
                    <span className="text-lg">⚠️</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-rose-400 font-mono tracking-tight">
                      {datosReporte.resenas_criticas_total}
                    </span>
                    <span className="text-xs font-mono text-rose-300 font-bold">
                      ({datosReporte.porcentaje_criticas.toFixed(1)}%)
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-rose-300/80 mt-2">
                    Requieren auditoría o contacto directo
                  </p>
                </div>

                {/* 4. Categoría y Técnico Líder */}
                <div className="bg-[#1E293B] border border-violet-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-violet-500/60 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-violet-400 uppercase tracking-wider font-semibold">
                      Líderes de Excelencia
                    </span>
                    <span className="text-lg">🏆</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-mono truncate max-w-[120px]" title={metricasDestacadas?.mejorTecnico?.nombre_completo}>
                        Técnico: <strong className="text-slate-200">{metricasDestacadas?.mejorTecnico?.nombre_completo || 'N/A'}</strong>
                      </span>
                      <span className="text-amber-400 font-mono font-bold">
                        {metricasDestacadas?.mejorTecnico ? `${metricasDestacadas.mejorTecnico.promedio_estrellas.toFixed(1)}★` : '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                      <span className="text-slate-400 font-mono truncate max-w-[120px]" title={metricasDestacadas?.mejorCategoria?.nombre_categoria}>
                        Rubro: <strong className="text-slate-200">{metricasDestacadas?.mejorCategoria?.nombre_categoria || 'N/A'}</strong>
                      </span>
                      <span className="text-amber-400 font-mono font-bold">
                        {metricasDestacadas?.mejorCategoria ? `${metricasDestacadas.mejorCategoria.promedio_estrellas.toFixed(1)}★` : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

                            {/* ===================================================================== */}
              {/* VISUALIZACIONES ANALÍTICAS Y GRÁFICOS (OBJ-07)                        */}
              {/* ===================================================================== */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Gráfico 1: Histograma de Distribución de Estrellas (1★ - 5★) */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>⭐</span> Distribución de Calificaciones
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Frecuencia y proporción de valoraciones (1★ a 5★)
                      </p>
                    </div>
                  </div>
                  <StarHistogramChart
                    distribution={distribucionEstrellas}
                    total={datosReporte.total_resenas || 0}
                  />
                </div>

                {/* Gráfico 2: Ranking CSAT por Técnico */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>👨‍🔧</span> CSAT por Técnico
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Promedio de satisfacción por miembro del equipo
                      </p>
                    </div>
                  </div>
                  <HorizontalBarChart
                    data={(datosReporte.promedio_por_tecnico || []).map((t) => ({
                      label: t.nombre_completo,
                      valor: Number(t.promedio_estrellas) || 0,
                      sublabel: `${t.total_resenas} opiniones`
                    }))}
                    color="#06B6D4"
                    unit="★"
                  />
                </div>

                {/* Gráfico 3: Ranking CSAT por Rubro / Categoría */}
                <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                        <span>🏷️</span> CSAT por Categoría
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Percepción de calidad técnica por tipo de servicio
                      </p>
                    </div>
                  </div>
                  <HorizontalBarChart
                    data={(datosReporte.promedio_por_categoria || []).map((c) => ({
                      label: c.nombre_categoria,
                      valor: Number(c.promedio_estrellas) || 0,
                      sublabel: `${c.total_resenas} opiniones`
                    }))}
                    color="#8B5CF6"
                    unit="★"
                  />
                </div>
              </div>

              {/* BARRA DE PESTAÑAS DE VISUALIZACIÓN ANALÍTICA */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setPestanaActiva('matriz')}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    pestanaActiva === 'matriz'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-950/40'
                      : 'bg-slate-800/60 hover:bg-slate-800 text-slate-400 border border-slate-700/60'
                  }`}
                >
                  <span>🧬</span>
                  <span>Matriz de Calidad (Técnico × Rubro)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPestanaActiva('tecnicos')}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    pestanaActiva === 'tecnicos'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-950/40'
                      : 'bg-slate-800/60 hover:bg-slate-800 text-slate-400 border border-slate-700/60'
                  }`}
                >
                  <span>👨‍🔧</span>
                  <span>Desglose por Técnico ({datosReporte.promedio_por_tecnico?.length || 0})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPestanaActiva('categorias')}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    pestanaActiva === 'categorias'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-950/40'
                      : 'bg-slate-800/60 hover:bg-slate-800 text-slate-400 border border-slate-700/60'
                  }`}
                >
                  <span>🏷️</span>
                  <span>Desglose por Categoría ({datosReporte.promedio_por_categoria?.length || 0})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPestanaActiva('comentarios')}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    pestanaActiva === 'comentarios'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-950/40'
                      : 'bg-slate-800/60 hover:bg-slate-800 text-slate-400 border border-slate-700/60'
                  }`}
                >
                  <span>💬</span>
                  <span>Muro de Feedback Cualitativo ({datosReporte.comentarios?.length || 0})</span>
                </button>
              </div>

              {/* ================================================================= */}
              {/* PESTAÑA 1: MATRIZ DE CALIDAD (CRUCE TÉCNICO X CATEGORÍA)           */}
              {/* ================================================================= */}
              {pestanaActiva === 'matriz' && (
                <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40">
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        Matriz de Desempeño Cruzado (Técnico × Categoría)
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Identifica fortalezas y vulnerabilidades técnicas por rubro en cada miembro del equipo de taller.
                      </p>
                    </div>
                    <span className="text-xs font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2.5 py-1 rounded-lg">
                      {datosReporte.matriz_calidad?.length || 0} combinaciones analizadas
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider bg-slate-900/60">
                          <th className="py-3 px-4 font-semibold">Técnico Responsable</th>
                          <th className="py-3 px-4 font-semibold">Rubro / Categoría</th>
                          <th className="py-3 px-4 font-semibold text-center">Evaluaciones</th>
                          <th className="py-3 px-4 font-semibold text-center">CSAT (1 - 5★)</th>
                          <th className="py-3 px-4 font-semibold">Nivel Visual</th>
                          <th className="py-3 px-4 font-semibold text-right">Diagnóstico</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-xs">
                        {(datosReporte.matriz_calidad || []).map((m, idx) => {
                          const promedio = Number(m.promedio_estrellas) || 0;
                          return (
                            <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-3 px-4 font-medium text-slate-200">
                                <div className="flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 flex items-center justify-center font-mono text-[10px]">
                                    {m.nombre_tecnico ? m.nombre_tecnico.charAt(0).toUpperCase() : 'T'}
                                  </span>
                                  <span>{m.nombre_tecnico}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-300 font-mono">
                                <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700">
                                  {m.nombre_categoria}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-slate-300">
                                {m.total_resenas}
                              </td>
                              <td className="py-3 px-4 text-center font-mono font-bold">
                                <span
                                  className={
                                    promedio >= 4.0
                                      ? 'text-emerald-400'
                                      : promedio >= 3.0
                                      ? 'text-amber-400'
                                      : 'text-rose-400'
                                  }
                                >
                                  {promedio.toFixed(2)} ★
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                {renderEstrellasVisuales(promedio, 5, 'text-xs')}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span
                                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                                    promedio >= 4.5
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : promedio >= 3.5
                                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                      : promedio >= 3.0
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  }`}
                                >
                                  {promedio >= 4.5
                                    ? 'Sobresaliente'
                                    : promedio >= 3.5
                                    ? 'Estándar Óptimo'
                                    : promedio >= 3.0
                                    ? 'Monitorear'
                                    : 'Refuerzo Requerido'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* ================================================================= */}
              {/* PESTAÑA 2: DESGLOSE POR TÉCNICO                                   */}
              {/* ================================================================= */}
              {pestanaActiva === 'tecnicos' && (
                <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        Rendimiento de Calidad por Empleado
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Promedio general de valoraciones acumuladas por cada técnico en el período seleccionado.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(datosReporte.promedio_por_tecnico || []).map((tec, idx) => {
                      const promedio = Number(tec.promedio_estrellas) || 0;
                      const porcentajeBarra = (promedio / 5.0) * 100;
                      return (
                        <div
                          key={idx}
                          className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/40 text-violet-300 flex items-center justify-center font-mono font-bold text-sm">
                                {tec.nombre_completo.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-white tracking-tight">
                                  {tec.nombre_completo}
                                </h4>
                                <span className="text-[10px] font-mono text-slate-400">
                                  {tec.total_resenas} calificación(es)
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-base font-black font-mono ${
                                  promedio >= 4.0
                                    ? 'text-emerald-400'
                                    : promedio >= 3.0
                                    ? 'text-amber-400'
                                    : 'text-rose-400'
                                }`}
                              >
                                {promedio.toFixed(2)} ★
                              </span>
                            </div>
                          </div>

                          {/* Barra de Progreso CSAT */}
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-3">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                promedio >= 4.0
                                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                  : promedio >= 3.0
                                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                                  : 'bg-gradient-to-r from-rose-500 to-red-400'
                              }`}
                              style={{ width: `${porcentajeBarra}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2">
                            <div>{renderEstrellasVisuales(promedio, 5, 'text-xs')}</div>
                            <span>{porcentajeBarra.toFixed(0)}% de efectividad</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ================================================================= */}
              {/* PESTAÑA 3: DESGLOSE POR CATEGORÍA                                 */}
              {/* ================================================================= */}
              {pestanaActiva === 'categorias' && (
                <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        Percepción de Calidad por Rubro de Servicio
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Impacto proporcional en multi-categorías evaluando qué tipo de reparaciones generan mayor satisfacción.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(datosReporte.promedio_por_categoria || []).map((cat, idx) => {
                      const promedio = Number(cat.promedio_estrellas) || 0;
                      const porcentajeBarra = (promedio / 5.0) * 100;
                      return (
                        <div
                          key={idx}
                          className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center font-mono font-bold text-sm">
                                🏷️
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-white tracking-tight">
                                  {cat.nombre_categoria}
                                </h4>
                                <span className="text-[10px] font-mono text-slate-400">
                                  {cat.total_resenas} calificación(es) asociadas
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-base font-black font-mono ${
                                  promedio >= 4.0
                                    ? 'text-emerald-400'
                                    : promedio >= 3.0
                                    ? 'text-amber-400'
                                    : 'text-rose-400'
                                }`}
                              >
                                {promedio.toFixed(2)} ★
                              </span>
                            </div>
                          </div>

                          {/* Barra de Progreso CSAT */}
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-3">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                promedio >= 4.0
                                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                                  : promedio >= 3.0
                                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                                  : 'bg-gradient-to-r from-rose-500 to-red-400'
                              }`}
                              style={{ width: `${porcentajeBarra}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2">
                            <div>{renderEstrellasVisuales(promedio, 5, 'text-xs')}</div>
                            <span>{porcentajeBarra.toFixed(0)}% del máximo</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ================================================================= */}
              {/* PESTAÑA 4: MURO DE FEEDBACK CUALITATIVO (COMENTARIOS DE CLIENTES)  */}
              {/* ================================================================= */}
              {pestanaActiva === 'comentarios' && (
                <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        Muro de Testimonios y Feedback Directo
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Comentarios literales redactados por los clientes al momento de retirar sus equipos reparados.
                      </p>
                    </div>

                    {/* Filtros locales del muro */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        placeholder="Buscar en testimonios..."
                        value={busquedaComentario}
                        onChange={(e) => setBusquedaComentario(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-500 w-44"
                      />

                      <select
                        value={filtroEstrellaComentario}
                        onChange={(e) => setFiltroEstrellaComentario(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                      >
                        <option value="todas">Todas las ★</option>
                        <option value="5">Solo 5 ★</option>
                        <option value="4">Solo 4 ★</option>
                        <option value="3">Solo 3 ★</option>
                        <option value="2">Solo 2 ★</option>
                        <option value="1">Solo 1 ★</option>
                      </select>
                    </div>
                  </div>

                  {comentariosFiltrados.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs font-mono">
                      No se encontraron testimonios que coincidan con la búsqueda o filtro aplicado.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {comentariosFiltrados.map((com, idx) => {
                        const esCritica = com.puntuacion <= 3;
                        return (
                          <div
                            key={idx}
                            className={`rounded-xl p-4 border transition-all ${
                              esCritica
                                ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/70 shadow-lg shadow-rose-950/30'
                                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div>{renderEstrellasVisuales(com.puntuacion, 5, 'text-sm')}</div>
                                <span className="text-xs font-bold font-mono text-white">
                                  {com.puntuacion} ★
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {esCritica && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                                    Reseña Crítica
                                  </span>
                                )}
                                <span className="text-[11px] font-mono text-slate-500">
                                  {formatearFecha(com.fecha)}
                                </span>
                              </div>
                            </div>

                            {/* Comentario literal */}
                            <blockquote className="text-xs text-slate-200 italic my-2.5 bg-slate-950/40 p-3 rounded-lg border border-slate-800/80">
                              "{com.comentario || 'El cliente no dejó comentarios adicionales por escrito.'}"
                            </blockquote>

                            {/* Metadata: Cliente, Técnico y Categorías */}
                            <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
                              <div className="flex items-center justify-between">
                                <span>Cliente: <strong className="text-slate-300 font-medium">{com.cliente_nombre}</strong></span>
                                <span>Técnico: <strong className="text-cyan-300 font-medium">{com.tecnico_nombre}</strong></span>
                              </div>
                              {com.categorias?.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                  <span className="text-slate-500">Rubros:</span>
                                  {com.categorias.map((cName, cIdx) => (
                                    <span
                                      key={cIdx}
                                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700"
                                    >
                                      {cName}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
