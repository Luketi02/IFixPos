import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../../context/useAuth';
import AdminSidebar from '../../../components/navigation/AdminSidebar';
import AdminHeader from '../../../components/navigation/AdminHeader';
import { DualBarChart, DonutChart } from '../../../components/charts/ReportCharts';
import { exportarInformePDF } from '../../../utils/reportPrinter';
import { API_BASE_URL } from '../../../config/api';

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

const formatearFecha = (fechaIso) => {
  if (!fechaIso) return '—';
  const partes = String(fechaIso).split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return fechaIso;
};

export default function AdminSalesReportScreen() {
  const { token, user } = useAuth();

  const hoy = useMemo(() => new Date(), []);
  const haceTreintaDias = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);

  // Filtros
  const [fechaInicio, setFechaInicio] = useState(obtenerFechaFormato(haceTreintaDias));
  const [fechaFin, setFechaFin] = useState(obtenerFechaFormato(hoy));
  const [canalFiltro, setCanalFiltro] = useState('TODAS'); // 'TODAS' | 'PRESENCIAL' | 'VIRTUAL'
  const [estadoFiltro, setEstadoFiltro] = useState('TODOS'); // 'TODOS' | 'PAGADA' | 'PENDIENTE' | 'CANCELADA'
  const [idMedioPago, setIdMedioPago] = useState('');
  const [buscarTexto, setBuscarTexto] = useState('');

  // Catálogo de medios de pago
  const [mediosPago, setMediosPago] = useState([]);

  // Datos del reporte
  const [datosReporte, setDatosReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [alerta, setAlerta] = useState(null);
  const [copiado, setCopiado] = useState(false);

  // Pestaña activa de listado: 'TODAS' | 'PRESENCIALES' | 'VIRTUALES' | 'EGRESOS'
  const [pestanaListado, setPestanaListado] = useState('TODAS');
  const listadoOperacionesRef = useRef(null);

  const irAListadoOperaciones = useCallback((pestana) => {
    setPestanaListado(pestana);
    setTimeout(() => {
      listadoOperacionesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }, []);

  // Modal de inspección detallada de una venta
  const [ventaInspeccionada, setVentaInspeccionada] = useState(null);

  const dispararAlerta = useCallback((tipo, mensaje) => {
    setAlerta({ tipo, mensaje });
    setTimeout(() => {
      setAlerta(null);
    }, 6000);
  }, []);

  // Cargar medios de pago para el selector
  useEffect(() => {
    if (!token) return;
    axios
      .get(`${API_BASE_URL}/api/sales/medios-pago/`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (Array.isArray(res.data)) {
          setMediosPago(res.data);
        }
      })
      .catch(() => {});
  }, [token]);

  const consultarReporteVentas = useCallback(
    async (overrideParams = {}) => {
      if (!token) return;
      const fInicio =
        overrideParams.fecha_inicio !== undefined ? overrideParams.fecha_inicio : fechaInicio;
      const fFin = overrideParams.fecha_fin !== undefined ? overrideParams.fecha_fin : fechaFin;
      const cVal = overrideParams.canal !== undefined ? overrideParams.canal : canalFiltro;
      const eVal =
        overrideParams.estado_venta !== undefined ? overrideParams.estado_venta : estadoFiltro;
      const mpVal =
        overrideParams.id_medio_pago !== undefined ? overrideParams.id_medio_pago : idMedioPago;
      const bVal = overrideParams.buscar !== undefined ? overrideParams.buscar : buscarTexto;

      if (!fInicio || !fFin) {
        dispararAlerta('error', 'Debes especificar la fecha de inicio y la fecha de fin.');
        return;
      }
      if (fInicio > fFin) {
        dispararAlerta('error', 'La fecha inicial no puede ser posterior a la fecha final.');
        return;
      }

      setCargando(true);
      try {
        const params = {
          fecha_inicio: fInicio,
          fecha_fin: fFin,
          canal: cVal,
          estado_venta: eVal
        };
        if (mpVal) params.id_medio_pago = mpVal;
        if (bVal && bVal.trim()) params.buscar = bVal.trim();

        const res = await axios.get(`${API_BASE_URL}/api/sales/reportes/ventas/`, {
          params,
          headers: { Authorization: `Bearer ${token}` }
        });
        setDatosReporte(res.data);
      } catch (err) {
        const msg =
          err?.response?.data?.error ||
          err?.response?.data?.detail ||
          'No fue posible obtener el reporte de inspección de ventas y arqueo.';
        dispararAlerta('error', typeof msg === 'object' ? JSON.stringify(msg) : String(msg));
      } finally {
        setCargando(false);
      }
    },
    [token, fechaInicio, fechaFin, canalFiltro, estadoFiltro, idMedioPago, buscarTexto, dispararAlerta]
  );

  useEffect(() => {
    consultarReporteVentas();
  }, [consultarReporteVentas]);

  const aplicarAtajoTemporal = (tipo) => {
    const ahora = new Date();
    let desde = new Date();
    if (tipo === '7_DIAS') {
      desde.setDate(ahora.getDate() - 6);
    } else if (tipo === '30_DIAS') {
      desde.setDate(ahora.getDate() - 30);
    } else if (tipo === 'MES_ACTUAL') {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    } else if (tipo === 'ANIO_ACTUAL') {
      desde = new Date(ahora.getFullYear(), 0, 1);
    }
    const strDesde = obtenerFechaFormato(desde);
    const strHasta = obtenerFechaFormato(ahora);
    setFechaInicio(strDesde);
    setFechaFin(strHasta);
    consultarReporteVentas({ fecha_inicio: strDesde, fecha_fin: strHasta });
  };

  const handleRestablecerFiltros = () => {
    const strDesde = obtenerFechaFormato(haceTreintaDias);
    const strHasta = obtenerFechaFormato(hoy);
    setFechaInicio(strDesde);
    setFechaFin(strHasta);
    setCanalFiltro('TODAS');
    setEstadoFiltro('TODOS');
    setIdMedioPago('');
    setBuscarTexto('');
    setPestanaListado('TODAS');
    consultarReporteVentas({
      fecha_inicio: strDesde,
      fecha_fin: strHasta,
      canal: 'TODAS',
      estado_venta: 'TODOS',
      id_medio_pago: '',
      buscar: ''
    });
  };

  const kpis = datosReporte?.kpis_ventas || {};
  const arqueo = datosReporte?.arqueo_caja || {};
  const evolucionSemanal = useMemo(
    () => (Array.isArray(datosReporte?.evolucion_semanal) ? datosReporte.evolucion_semanal : []),
    [datosReporte]
  );
  const todasLasVentas = useMemo(
    () => (Array.isArray(datosReporte?.ventas) ? datosReporte.ventas : []),
    [datosReporte]
  );
  const ventasPresenciales = useMemo(
    () => todasLasVentas.filter((v) => v.canal === 'PRESENCIAL'),
    [todasLasVentas]
  );
  const ventasVirtuales = useMemo(
    () => todasLasVentas.filter((v) => v.canal === 'VIRTUAL'),
    [todasLasVentas]
  );
  const egresosDetalle = useMemo(
    () => (Array.isArray(datosReporte?.egresos_detalle) ? datosReporte.egresos_detalle : []),
    [datosReporte]
  );

  const ventasVisiblesEnTabla = useMemo(() => {
    if (pestanaListado === 'PRESENCIALES') return ventasPresenciales;
    if (pestanaListado === 'VIRTUALES') return ventasVirtuales;
    return todasLasVentas;
  }, [pestanaListado, todasLasVentas, ventasPresenciales, ventasVirtuales]);

  // Datos para gráficos
  const chartSemanal = useMemo(() => {
    return evolucionSemanal.map((sem) => ({
      label: sem.etiqueta_semana,
      val1: Number(sem.monto_total || 0),
      val1Label: formatearMoneda(sem.monto_total || 0),
      val2: Number(sem.total_ventas || 0),
      val2Label: `${sem.total_ventas || 0} ventas (${sem.ventas_presenciales} pres. / ${sem.ventas_virtuales} virt.)`
    }));
  }, [evolucionSemanal]);

  const donutCanales = useMemo(() => {
    const mPres = Number(arqueo.ingresos_ventas_presenciales || 0);
    const mVirt = Number(arqueo.ingresos_ventas_virtuales || 0);
    const mTal = Number(arqueo.ingresos_servicios_taller || 0);
    const total = mPres + mVirt + mTal || 1;
    return [
      {
        label: 'Ventas Presenciales (Local)',
        valor: formatearMoneda(mPres),
        porcentaje: (mPres / total) * 100,
        color: '#06B6D4'
      },
      {
        label: 'Ventas Virtuales (Online)',
        valor: formatearMoneda(mVirt),
        porcentaje: (mVirt / total) * 100,
        color: '#8B5CF6'
      },
      {
        label: 'Servicios de Taller',
        valor: formatearMoneda(mTal),
        porcentaje: (mTal / total) * 100,
        color: '#10B981'
      }
    ].filter((i) => i.porcentaje > 0);
  }, [arqueo]);

  // Exportación a PDF Ejecutivo
  const handleExportarPDF = () => {
    if (!datosReporte) return;

    const nombreEjecutor =
      [user?.nombre, user?.apellido].filter(Boolean).join(' ').trim() ||
      user?.email ||
      'Administrador';

    const mpSel = mediosPago.find(
      (m) => String(m.id_mediopago || m.id_medio_pago) === String(idMedioPago)
    );
    const filtrosActivos = [
      `Canal: ${canalFiltro === 'TODAS' ? 'Presencial y Virtual' : canalFiltro}`,
      `Estado: ${estadoFiltro}`,
      mpSel ? `Medio de Pago: ${mpSel.nombre || mpSel.nombre_medio_pago}` : 'Medios de Pago: Todos',
      buscarTexto.trim() ? `Búsqueda: "${buscarTexto.trim()}"` : null
    ].filter(Boolean);

    exportarInformePDF({
      titulo: 'Informe Ejecutivo: Inspección de Ventas y Arqueo de Ingresos / Egresos',
      subtitulo:
        'Auditoría integral de ventas semanales, operaciones presenciales y virtuales, detalle de clientes/productos y balance financiero',
      periodo: `${fechaInicio} al ${fechaFin}`,
      filtros: filtrosActivos,
      kpis: [
        {
          label: 'Ventas Comerciales',
          valor: `${kpis.total_ventas || 0} oper.`,
          detalle: `Prom. semanal: ${kpis.promedio_ventas_semanales || 0}/sem (${
            kpis.ventas_ultima_semana || 0
          } últ. 7d)`
        },
        {
          label: 'Presenciales vs Virtuales',
          valor: `${kpis.cantidad_ventas_presenciales || 0} / ${
            kpis.cantidad_ventas_virtuales || 0
          }`,
          detalle: `Pres: ${formatearMoneda(
            kpis.monto_ventas_presenciales
          )} | Virt: ${formatearMoneda(kpis.monto_ventas_virtuales)}`
        },
        {
          label: 'Total Ingresos (Arqueo)',
          valor: formatearMoneda(arqueo.total_ingresos || 0),
          detalle: `Ventas + Taller: ${formatearMoneda(arqueo.ingresos_servicios_taller || 0)}`
        },
        {
          label: 'Total Egresos y Balance',
          valor: formatearMoneda(arqueo.balance_neto || 0),
          detalle: `Egresos: ${formatearMoneda(arqueo.total_egresos || 0)}`
        }
      ],
      resumenEjecutivo:
        `Arqueo y auditoría comercial del período ${fechaInicio} al ${fechaFin}.\n` +
        `• Total Ventas Comerciales: ${kpis.total_ventas || 0} (${
          kpis.total_ventas_pagadas || 0
        } pagadas, ${kpis.total_ventas_pendientes || 0} pendientes, ${
          kpis.total_ventas_canceladas || 0
        } canceladas) | Promedio Semanal: ${kpis.promedio_ventas_semanales || 0} ventas/semana.\n` +
        `• Ventas Presenciales en Local: ${
          kpis.cantidad_ventas_presenciales || 0
        } operaciones (${formatearMoneda(kpis.monto_ventas_presenciales || 0)}).\n` +
        `• Ventas Virtuales (E-Commerce): ${
          kpis.cantidad_ventas_virtuales || 0
        } operaciones (${formatearMoneda(kpis.monto_ventas_virtuales || 0)}).\n` +
        `• Arqueo de Caja: Ingresos Totales ${formatearMoneda(
          arqueo.total_ingresos || 0
        )} vs. Egresos Totales ${formatearMoneda(
          arqueo.total_egresos || 0
        )} (Órdenes de Compra: ${formatearMoneda(
          arqueo.egresos_ordenes_compra || 0
        )} + Compras Directas: ${formatearMoneda(
          arqueo.egresos_compras_directas || 0
        )}) => Resultado Neto: ${formatearMoneda(arqueo.balance_neto || 0)}.`,
      tablas: [
        {
          titulo: 'Evolución de Ventas Semanales (Presenciales vs. Virtuales)',
          columnas: [
            { header: 'Semana', key: 'etiqueta_semana' },
            { header: 'Ventas Presenciales', key: 'ventas_presenciales', align: 'center' },
            { header: 'Ventas Virtuales', key: 'ventas_virtuales', align: 'center' },
            { header: 'Total Ventas', key: 'total_ventas', align: 'center' },
            {
              header: 'Facturación Presencial',
              key: 'monto_presencial',
              align: 'right',
              render: (s) => formatearMoneda(s.monto_presencial)
            },
            {
              header: 'Facturación Virtual',
              key: 'monto_virtual',
              align: 'right',
              render: (s) => formatearMoneda(s.monto_virtual)
            },
            {
              header: 'Total Semana',
              key: 'monto_total',
              align: 'right',
              render: (s) => formatearMoneda(s.monto_total)
            }
          ],
          filas: evolucionSemanal
        },
        {
          titulo: 'Registro Detallado de Ventas Realizadas (Presenciales y Virtuales)',
          columnas: [
            { header: 'Código', key: 'codigo_sec' },
            { header: 'Fecha', key: 'fecha_venta', render: (v) => formatearFecha(v.fecha_venta) },
            { header: 'Canal', key: 'canal_etiqueta' },
            {
              header: 'Cliente / Usuario',
              key: 'cliente',
              render: (v) =>
                `${v.cliente?.nombre_completo || 'Consumidor Final'}${
                  v.cliente?.dni && v.cliente.dni !== '—' ? ` (DNI: ${v.cliente.dni})` : ''
                }`
            },
            {
              header: 'Productos Comprados',
              key: 'productos',
              render: (v) =>
                (v.productos || [])
                  .map((p) => `${p.nombre_producto} (x${p.cantidad})`)
                  .join(', ')
            },
            { header: 'Medio Pago', key: 'medios_pago_resumen' },
            { header: 'Estado', key: 'estado_venta' },
            {
              header: 'Monto Total',
              key: 'monto_total',
              align: 'right',
              render: (v) => formatearMoneda(v.monto_total)
            }
          ],
          filas: todasLasVentas
        },
        {
          titulo: 'Arqueo de Egresos Registrados en el Período',
          columnas: [
            { header: 'Ref.', key: 'id_referencia' },
            { header: 'Fecha', key: 'fecha', render: (e) => formatearFecha(e.fecha) },
            { header: 'Tipo de Egreso', key: 'tipo_etiqueta' },
            { header: 'Proveedor / Origen', key: 'origen' },
            { header: 'Detalle / Concepto', key: 'descripcion' },
            {
              header: 'Monto Egreso',
              key: 'monto',
              align: 'right',
              render: (e) => formatearMoneda(e.monto)
            }
          ],
          filas: egresosDetalle
        }
      ],
      usuario: {
        nombre: nombreEjecutor,
        email: user?.email || '',
        rol: user?.rol?.nombre_rol || user?.id_rol?.nombre_rol || 'Administrador'
      }
    });
  };

  const handleCopiarResumen = () => {
    if (!datosReporte) return;
    const texto =
      `=== INFORME GERENCIAL: VENTAS Y ARQUEO DE CAJA ===\n` +
      `Período Analizado: ${fechaInicio} al ${fechaFin}\n` +
      `--------------------------------------------------------\n` +
      `• Total Ventas Comerciales: ${kpis.total_ventas || 0} (${kpis.total_ventas_pagadas || 0} pagadas)\n` +
      `• Ritmo Semanal: ${kpis.promedio_ventas_semanales || 0} ventas/semana (${kpis.ventas_ultima_semana || 0} en últimos 7 días)\n` +
      `• Ventas Presenciales (Mostrador): ${kpis.cantidad_ventas_presenciales || 0} op. (${formatearMoneda(kpis.monto_ventas_presenciales || 0)})\n` +
      `• Ventas Virtuales (Tienda Online): ${kpis.cantidad_ventas_virtuales || 0} op. (${formatearMoneda(kpis.monto_ventas_virtuales || 0)})\n` +
      `• Ticket Promedio: ${formatearMoneda(kpis.ticket_promedio || 0)}\n` +
      `--------------------------------------------------------\n` +
      `ARQUEO DE INGRESOS Y EGRESOS:\n` +
      `  + Ingresos Ventas Presenciales: ${formatearMoneda(arqueo.ingresos_ventas_presenciales || 0)}\n` +
      `  + Ingresos Ventas Virtuales:    ${formatearMoneda(arqueo.ingresos_ventas_virtuales || 0)}\n` +
      `  + Ingresos Servicios de Taller: ${formatearMoneda(arqueo.ingresos_servicios_taller || 0)}\n` +
      `  = TOTAL INGRESOS:               ${formatearMoneda(arqueo.total_ingresos || 0)}\n` +
      `  - Egresos Órdenes de Compra:    ${formatearMoneda(arqueo.egresos_ordenes_compra || 0)}\n` +
      `  - Egresos Compras Directas:     ${formatearMoneda(arqueo.egresos_compras_directas || 0)}\n` +
      `  = TOTAL EGRESOS:                ${formatearMoneda(arqueo.total_egresos || 0)}\n` +
      `  => BALANCE NETO DEL PERÍODO:    ${formatearMoneda(arqueo.balance_neto || 0)}\n` +
      `========================================================`;

    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-sans overflow-hidden">
      <AdminSidebar activeMenu="metrics-sales" />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <AdminHeader
          category="Métricas y Análisis"
          subcategory="Comercial & Caja"
          pageName="Ventas y Arqueo"
          title="Inspección de Ventas y Arqueo de Ingresos / Egresos"
        />

        {/* Notificación Push en esquina inferior izquierda */}
        <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2 pointer-events-none max-w-md">
          <AnimatePresence>
            {alerta && (
              <motion.div
                initial={{ opacity: 0, x: -24, y: 12 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: -24, y: 12 }}
                className={`pointer-events-auto p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs sm:text-sm shadow-2xl ${
                  alerta.tipo === 'success'
                    ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-100'
                    : 'bg-rose-950/95 border-rose-500/60 text-rose-100'
                }`}
              >
                <span>{alerta.mensaje}</span>
                <button
                  type="button"
                  onClick={() => setAlerta(null)}
                  className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* Encabezado Principal y Acciones */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
                  Inteligencia Comercial &middot; Ventas &amp; Tesorería
                </span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Inspección de Ventas &middot; Arqueo de Ingresos y Egresos
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Audita las cantidades de ventas semanales, arqueo de ingresos y egresos, desglose de ventas presenciales y virtuales, y el expediente detallado de cada operación.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleCopiarResumen}
                disabled={!datosReporte}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{copiado ? '✓ Resumen Copiado' : '📋 Copiar Resumen'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportarPDF}
                disabled={!datosReporte}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 hover:opacity-95 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>📄 Exportar Informe PDF</span>
              </button>
            </div>
          </div>

          {/* Barra de Filtros y Atajos de Horizonte Temporal */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                Parámetros de Auditoría Comercial
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => aplicarAtajoTemporal('7_DIAS')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-mono cursor-pointer"
                >
                  Últimos 7 días (Semanal)
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtajoTemporal('30_DIAS')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-mono cursor-pointer"
                >
                  Últimos 30 días
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtajoTemporal('MES_ACTUAL')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-mono cursor-pointer"
                >
                  Mes Actual
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtajoTemporal('ANIO_ACTUAL')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-mono cursor-pointer"
                >
                  Año Actual
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
                  Fecha Desde
                </label>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
                  Fecha Hasta
                </label>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
                  Canal de Venta
                </label>
                <select
                  value={canalFiltro}
                  onChange={(e) => setCanalFiltro(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="TODAS">Todos (Presencial + Virtual)</option>
                  <option value="PRESENCIAL">🏪 Solo Ventas Presenciales</option>
                  <option value="VIRTUAL">🌐 Solo Ventas Virtuales</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
                  Estado
                </label>
                <select
                  value={estadoFiltro}
                  onChange={(e) => setEstadoFiltro(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="TODOS">Todos los estados</option>
                  <option value="PAGADA">Pagadas / Acreditadas</option>
                  <option value="PENDIENTE">Pendientes de Cobro</option>
                  <option value="CANCELADA">Canceladas</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
                  Cliente o Producto
                </label>
                <input
                  type="text"
                  value={buscarTexto}
                  onChange={(e) => setBuscarTexto(e.target.value)}
                  placeholder="DNI, nombre, email o producto..."
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => consultarReporteVentas()}
                  disabled={cargando}
                  className="flex-1 px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold text-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {cargando ? 'Consultando...' : 'Analizar'}
                </button>
                <button
                  type="button"
                  onClick={handleRestablecerFiltros}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </div>

          {/* 1. TARJETAS KPI PRINCIPALES DE VENTAS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-cyan-400">
                  Ritmo de Ventas Semanales
                </span>
                <span className="text-base">📅</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">
                {kpis.promedio_ventas_semanales ?? 0}
                <span className="text-xs font-normal text-slate-400 ml-1.5">ventas / semana</span>
              </div>
              <p className="text-xs text-slate-400">
                Últimos 7 días:{' '}
                <strong className="text-cyan-300">{kpis.ventas_ultima_semana ?? 0} ventas</strong> •
                Total período: <strong className="text-white">{kpis.total_ventas ?? 0}</strong>
              </p>
            </div>

            <div
              onClick={() => irAListadoOperaciones('PRESENCIALES')}
              className="bg-[#1E293B] border border-cyan-500/30 hover:border-cyan-400 rounded-2xl p-5 shadow-xl space-y-1.5 cursor-pointer transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-cyan-300">
                  Ventas Presenciales (Local)
                </span>
                <span className="text-base">🏪</span>
              </div>
              <div className="text-2xl font-black text-cyan-300 font-mono">
                {kpis.cantidad_ventas_presenciales ?? 0}
                <span className="text-xs font-normal text-slate-400 ml-1.5">operaciones</span>
              </div>
              <p className="text-xs text-slate-400 flex items-center justify-between">
                <span>Facturado: {formatearMoneda(kpis.monto_ventas_presenciales || 0)}</span>
                <span className="text-cyan-400 font-semibold underline">Ver detalle</span>
              </p>
            </div>

            <div
              onClick={() => irAListadoOperaciones('VIRTUALES')}
              className="bg-[#1E293B] border border-violet-500/30 hover:border-violet-400 rounded-2xl p-5 shadow-xl space-y-1.5 cursor-pointer transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-violet-300">
                  Ventas Virtuales (Online)
                </span>
                <span className="text-base">🌐</span>
              </div>
              <div className="text-2xl font-black text-violet-300 font-mono">
                {kpis.cantidad_ventas_virtuales ?? 0}
                <span className="text-xs font-normal text-slate-400 ml-1.5">operaciones</span>
              </div>
              <p className="text-xs text-slate-400 flex items-center justify-between">
                <span>Facturado: {formatearMoneda(kpis.monto_ventas_virtuales || 0)}</span>
                <span className="text-violet-400 font-semibold underline">Ver detalle</span>
              </p>
            </div>

            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-emerald-400">
                  Facturación y Ticket Medio
                </span>
                <span className="text-base">💳</span>
              </div>
              <div className="text-xl font-black text-emerald-400 font-mono">
                {formatearMoneda(kpis.facturacion_ventas_comerciales || 0)}
              </div>
              <p className="text-xs text-slate-400">
                Ticket promedio:{' '}
                <strong className="text-white">
                  {formatearMoneda(kpis.ticket_promedio || 0)}
                </strong>{' '}
                ({kpis.total_ventas_pagadas ?? 0} pagadas)
              </p>
            </div>
          </div>

          {/* 2. ARQUEO DE INGRESOS Y EGRESOS (TESORERÍA DEL PERÍODO) */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Arqueo Consolidado de Ingresos y Egresos
                </h2>
                <p className="text-xs text-slate-400">
                  Balance financiero entre los ingresos acreditados (ventas presenciales, virtuales y servicios de taller) y los egresos por abastecimiento y compras directas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => irAListadoOperaciones('EGRESOS')}
                className="text-xs font-bold text-amber-300 hover:text-amber-200 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
              >
                Inspeccionar Detalle de Egresos ({egresosDetalle.length}) →
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Columna 1: Ingresos */}
              <div className="p-4 rounded-2xl bg-emerald-950/25 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase font-bold text-emerald-300">
                    + Total Ingresos Acreditados
                  </span>
                  <span className="text-lg font-black font-mono text-emerald-400">
                    {formatearMoneda(arqueo.total_ingresos || 0)}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs border-t border-emerald-500/20 pt-2.5">
                  <div className="flex justify-between text-slate-300">
                    <span>🏪 Ventas Presenciales (Mostrador):</span>
                    <span className="font-mono font-bold text-white">
                      {formatearMoneda(arqueo.ingresos_ventas_presenciales || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>🌐 Ventas Virtuales (Tienda Online):</span>
                    <span className="font-mono font-bold text-white">
                      {formatearMoneda(arqueo.ingresos_ventas_virtuales || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>🛠️ Cobros de Taller y Diagnósticos:</span>
                    <span className="font-mono font-bold text-white">
                      {formatearMoneda(arqueo.ingresos_servicios_taller || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Columna 2: Egresos */}
              <div className="p-4 rounded-2xl bg-rose-950/25 border border-rose-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase font-bold text-rose-300">
                    - Total Egresos Registrados
                  </span>
                  <span className="text-lg font-black font-mono text-rose-400">
                    {formatearMoneda(arqueo.total_egresos || 0)}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs border-t border-rose-500/20 pt-2.5">
                  <div className="flex justify-between text-slate-300">
                    <span>📦 Órdenes de Compra a Proveedores:</span>
                    <span className="font-mono font-bold text-white">
                      {formatearMoneda(arqueo.egresos_ordenes_compra || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>🧾 Compras Directas y Gastos:</span>
                    <span className="font-mono font-bold text-white">
                      {formatearMoneda(arqueo.egresos_compras_directas || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px] pt-1">
                    <span>Operaciones de egreso contabilizadas:</span>
                    <span className="font-mono">{egresosDetalle.length} reg.</span>
                  </div>
                </div>
              </div>

              {/* Columna 3: Balance Neto y Medios de Pago */}
              <div className="p-4 rounded-2xl bg-[#0F172A] border border-cyan-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase font-bold text-cyan-300">
                    = Resultado Neto (Arqueo)
                  </span>
                  <span
                    className={`text-lg font-black font-mono ${
                      Number(arqueo.balance_neto || 0) >= 0
                        ? 'text-cyan-300'
                        : 'text-rose-400'
                    }`}
                  >
                    {formatearMoneda(arqueo.balance_neto || 0)}
                  </span>
                </div>
                <div className="space-y-1 text-xs border-t border-slate-800 pt-2">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Acreditaciones por Medio de Pago:
                  </span>
                  {(arqueo.desglose_medios_pago || []).length === 0 ? (
                    <span className="text-slate-500 italic">Sin pagos acreditados en el período</span>
                  ) : (
                    (arqueo.desglose_medios_pago || []).slice(0, 4).map((mp) => (
                      <div key={mp.medio_pago} className="flex justify-between text-slate-300">
                        <span className="truncate">
                          {mp.medio_pago} ({mp.cantidad_pagos}):
                        </span>
                        <span className="font-mono font-semibold text-cyan-300">
                          {formatearMoneda(mp.monto_total)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 3. EVOLUCIÓN SEMANAL DE VENTAS Y DISTRIBUCIÓN POR CANAL */}
          {evolucionSemanal.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-4">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Cantidades y Facturación de Ventas Semanales
                  </h3>
                  <p className="text-xs text-slate-400">
                    Desglose semana a semana del volumen de ventas presenciales y virtuales.
                  </p>
                </div>

                <DualBarChart
                  items={chartSemanal}
                  label1="Facturación Semanal ($)"
                  label2="Cantidad de Ventas"
                  color1="#06B6D4"
                  color2="#8B5CF6"
                />

                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900/70 border-b border-slate-700/80 text-[10px] font-mono uppercase text-slate-400">
                        <th className="py-2.5 px-3">Semana</th>
                        <th className="py-2.5 px-3 text-center">Presenciales</th>
                        <th className="py-2.5 px-3 text-center">Virtuales</th>
                        <th className="py-2.5 px-3 text-center">Total Ventas</th>
                        <th className="py-2.5 px-3 text-right">Monto Presencial</th>
                        <th className="py-2.5 px-3 text-right">Monto Virtual</th>
                        <th className="py-2.5 px-3 text-right">Total Semana</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {evolucionSemanal.map((sem) => (
                        <tr key={sem.clave_semana} className="hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-mono font-semibold text-white">
                            {sem.etiqueta_semana}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-cyan-300 font-bold">
                            {sem.ventas_presenciales}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-violet-300 font-bold">
                            {sem.ventas_virtuales}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-white">
                            {sem.total_ventas}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            {formatearMoneda(sem.monto_presencial)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            {formatearMoneda(sem.monto_virtual)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                            {formatearMoneda(sem.monto_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:col-span-4 bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Composición de Ingresos por Canal
                  </h3>
                  <p className="text-xs text-slate-400">
                    Participación sobre la recaudación total del período.
                  </p>
                </div>

                {donutCanales.length > 0 ? (
                  <DonutChart
                    segments={donutCanales}
                    centerLabel="Ingresos"
                    centerValue={formatearMoneda(arqueo.total_ingresos || 0)}
                  />
                ) : (
                  <div className="py-12 text-center text-xs text-slate-500">
                    Sin ingresos acreditados en este rango temporal.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. LISTADO E INSPECCIÓN DETALLADA DE VENTAS (PRESENCIALES, VIRTUALES Y EGRESOS) */}
          <div
            ref={listadoOperacionesRef}
            className="scroll-mt-6 bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Registro Detallado de Operaciones
                </h2>
                <p className="text-xs text-slate-400">
                  Visualiza cuáles son las ventas presenciales y virtuales, e inspecciona el cliente, los productos comprados y el pago de cada venta.
                </p>
              </div>

              {/* Pestañas selectoras */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPestanaListado('TODAS')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    pestanaListado === 'TODAS'
                      ? 'bg-cyan-400 text-slate-950'
                      : 'bg-[#0F172A] text-slate-300 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  Todas las Ventas ({todasLasVentas.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPestanaListado('PRESENCIALES')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    pestanaListado === 'PRESENCIALES'
                      ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400'
                      : 'bg-[#0F172A] text-slate-300 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  🏪 Presenciales ({ventasPresenciales.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPestanaListado('VIRTUALES')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    pestanaListado === 'VIRTUALES'
                      ? 'bg-violet-500/25 text-violet-200 border border-violet-400'
                      : 'bg-[#0F172A] text-slate-300 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  🌐 Virtuales ({ventasVirtuales.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPestanaListado('EGRESOS')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    pestanaListado === 'EGRESOS'
                      ? 'bg-rose-500/25 text-rose-200 border border-rose-400'
                      : 'bg-[#0F172A] text-slate-300 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  📉 Egresos del Arqueo ({egresosDetalle.length})
                </button>
              </div>
            </div>

            {pestanaListado === 'EGRESOS' ? (
              egresosDetalle.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  No se registraron egresos (órdenes de compra ni compras directas) en el período seleccionado.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900/70 border-b border-slate-700/80 text-[11px] font-mono uppercase text-slate-400">
                        <th className="py-3.5 px-4">Referencia</th>
                        <th className="py-3.5 px-4">Fecha</th>
                        <th className="py-3.5 px-4">Tipo de Egreso</th>
                        <th className="py-3.5 px-4">Proveedor / Vendedor</th>
                        <th className="py-3.5 px-4">Detalle de Productos / Motivo</th>
                        <th className="py-3.5 px-4">Estado</th>
                        <th className="py-3.5 px-4 text-right">Monto Egreso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {egresosDetalle.map((eg) => (
                        <tr key={eg.id_referencia} className="hover:bg-slate-800/40">
                          <td className="py-3.5 px-4 font-mono font-bold text-rose-300">
                            {eg.id_referencia}
                          </td>
                          <td className="py-3.5 px-4 text-slate-300">
                            {formatearFecha(eg.fecha)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-semibold">
                              {eg.tipo_etiqueta}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-white">{eg.origen}</td>
                          <td className="py-3.5 px-4 text-slate-300 max-w-md">{eg.descripcion}</td>
                          <td className="py-3.5 px-4 text-slate-300">{eg.estado}</td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-400">
                            -{formatearMoneda(eg.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : ventasVisiblesEnTabla.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                No se encontraron ventas registradas para los criterios y canal seleccionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/70 border-b border-slate-700/80 text-[11px] font-mono uppercase text-slate-400">
                      <th className="py-3.5 px-4">Operación / Fecha</th>
                      <th className="py-3.5 px-4">Canal y Modalidad</th>
                      <th className="py-3.5 px-4">Cliente / Usuario</th>
                      <th className="py-3.5 px-4">Productos Comprados</th>
                      <th className="py-3.5 px-4">Medio de Pago</th>
                      <th className="py-3.5 px-4">Estado</th>
                      <th className="py-3.5 px-4 text-right">Monto Total</th>
                      <th className="py-3.5 px-4 text-right">Inspección</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {ventasVisiblesEnTabla.map((v) => {
                      const prods = Array.isArray(v.productos) ? v.productos : [];
                      return (
                        <tr key={v.id_venta} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-bold text-cyan-300 block">
                              {v.codigo_sec}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {formatearFecha(v.fecha_venta)}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                                v.canal === 'PRESENCIAL'
                                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                  : 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                              }`}
                            >
                              <span>{v.canal === 'PRESENCIAL' ? '🏪' : '🌐'}</span>
                              <span>{v.canal_etiqueta}</span>
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <p className="font-bold text-white">
                              {v.cliente?.nombre_completo || 'Consumidor Final'}
                            </p>
                            {!v.cliente?.es_consumidor_final && (
                              <p className="text-[11px] text-slate-400 font-mono">
                                {v.cliente?.dni && v.cliente.dni !== '—'
                                  ? `DNI: ${v.cliente.dni} • `
                                  : ''}
                                {v.cliente?.email}
                              </p>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {prods.slice(0, 2).map((p, idx) => (
                                <span
                                  key={`${p.id_producto}-${idx}`}
                                  className="px-2 py-0.5 rounded bg-[#0F172A] border border-slate-800 text-[11px] text-slate-200 truncate max-w-[190px]"
                                >
                                  {p.nombre_producto} (x{p.cantidad})
                                </span>
                              ))}
                              {prods.length > 2 && (
                                <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[11px] font-bold">
                                  +{prods.length - 2} más
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-slate-300 font-medium">
                            {v.medios_pago_resumen}
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                v.estado_venta === 'PAGADA'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : v.estado_venta === 'CANCELADA'
                                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {v.estado_venta}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                            {formatearMoneda(v.monto_total)}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setVentaInspeccionada(v)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              <span>Inspeccionar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* MODAL DE INSPECCIÓN DETALLADA DE LA VENTA (USUARIO, PRODUCTOS, PAGOS Y COMPROBANTE) */}
      <AnimatePresence>
        {ventaInspeccionada && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="w-full max-w-3xl bg-[#1E293B] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Cabecera del Modal */}
              <div className="px-6 py-4 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 block">
                    Expediente de Venta Comercial • {ventaInspeccionada.canal_etiqueta}
                  </span>
                  <h3 className="text-lg font-extrabold text-white">
                    Operación {ventaInspeccionada.codigo_sec}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setVentaInspeccionada(null)}
                  className="text-slate-400 hover:text-white text-sm px-2 py-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Cuerpo del Modal */}
              <div className="p-6 overflow-y-auto space-y-5 text-xs">
                {/* Datos del Cliente y Modalidad */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold">
                      Cliente / Usuario Comprador
                    </span>
                    <p className="text-sm font-bold text-white">
                      {ventaInspeccionada.cliente?.nombre_completo || 'Consumidor Final'}
                    </p>
                    <p className="text-slate-300 font-mono">
                      DNI: {ventaInspeccionada.cliente?.dni || '—'}
                    </p>
                    <p className="text-slate-300">
                      Correo: {ventaInspeccionada.cliente?.email || '—'}
                    </p>
                    <p className="text-slate-300">
                      Teléfono: {ventaInspeccionada.cliente?.telefono || '—'}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-violet-400 font-bold">
                      Detalles de Canal y Logística
                    </span>
                    <p className="text-sm font-bold text-white">
                      {ventaInspeccionada.canal_etiqueta}
                    </p>
                    <p className="text-slate-300">
                      Fecha de Operación: {formatearFecha(ventaInspeccionada.fecha_venta)}
                    </p>
                    <p className="text-slate-300">
                      Estado:{' '}
                      <strong className="text-emerald-400">
                        {ventaInspeccionada.estado_venta}
                      </strong>
                    </p>
                    {ventaInspeccionada.direccion_envio && (
                      <p className="text-slate-300">
                        Destino Envío: {ventaInspeccionada.direccion_envio}
                      </p>
                    )}
                  </div>
                </div>

                {/* Tabla de Productos Comprados */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                    Productos e Insumos Incluidos ({ventaInspeccionada.total_unidades} u.)
                  </h4>
                  <div className="rounded-xl border border-slate-700/80 overflow-hidden bg-[#0F172A]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400">
                          <th className="py-2.5 px-4">Producto</th>
                          <th className="py-2.5 px-3">Categoría</th>
                          <th className="py-2.5 px-3 text-center">Cantidad</th>
                          <th className="py-2.5 px-3 text-right">Precio Unitario</th>
                          <th className="py-2.5 px-4 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {(ventaInspeccionada.productos || []).map((p, idx) => (
                          <tr key={`${p.id_producto}-${idx}`}>
                            <td className="py-2.5 px-4 font-semibold text-white">
                              {p.nombre_producto}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">{p.categoria}</td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-cyan-300">
                              {p.cantidad}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              {formatearMoneda(p.precio_unitario)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-white">
                              {formatearMoneda(p.subtotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-900 border-t border-slate-800">
                        {Number(ventaInspeccionada.costo_envio) > 0 && (
                          <tr>
                            <td colSpan={4} className="py-2 px-4 text-right text-slate-400">
                              Costo de Envío:
                            </td>
                            <td className="py-2 px-4 text-right font-mono text-slate-200">
                              {formatearMoneda(ventaInspeccionada.costo_envio)}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td
                            colSpan={4}
                            className="py-3 px-4 text-right font-bold uppercase text-slate-300"
                          >
                            Total de la Venta:
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-sm text-emerald-400">
                            {formatearMoneda(ventaInspeccionada.monto_total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Beneficios Aplicados (si los hubo) */}
                {Array.isArray(ventaInspeccionada.beneficios_aplicados) &&
                  ventaInspeccionada.beneficios_aplicados.length > 0 && (
                    <div className="p-4 rounded-xl bg-violet-950/30 border border-violet-500/30 space-y-2">
                      <span className="text-[11px] font-mono uppercase text-violet-300 font-bold block">
                        Beneficios / Cupones Canjeados en esta Venta
                      </span>
                      {ventaInspeccionada.beneficios_aplicados.map((b) => (
                        <div
                          key={b.id_beneficio}
                          className="flex items-center justify-between text-xs text-slate-200"
                        >
                          <span>
                            • {b.motivo} ({b.producto_nombre})
                          </span>
                          <span className="font-mono font-bold text-violet-300">
                            -{b.por_desc}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Pagos Registrados */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                    Pagos y Comprobantes Asociados
                  </h4>
                  {(ventaInspeccionada.pagos || []).length === 0 ? (
                    <div className="p-3 rounded-xl bg-[#0F172A] border border-slate-800 text-slate-400">
                      Esta operación aún no registra pagos acreditados.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {ventaInspeccionada.pagos.map((pg) => (
                        <div
                          key={pg.id_pago}
                          className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-bold text-white">
                              {pg.medio_pago} •{' '}
                              <span className="text-emerald-400 font-mono">
                                {formatearMoneda(pg.monto_pagado)}
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono">
                              Fecha: {formatearFecha(pg.fecha_pago)} • Ref: {pg.cod_operacion || 'S/N'}
                            </p>
                          </div>

                          {pg.ruta_comprobante && (
                            <a
                              href={
                                pg.ruta_comprobante.startsWith('http')
                                  ? pg.ruta_comprobante
                                  : `${API_BASE_URL}${pg.ruta_comprobante}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-colors"
                            >
                              📄 Ver Factura PDF
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Pie del Modal */}
              <div className="px-6 py-4 bg-[#0F172A] border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setVentaInspeccionada(null)}
                  className="px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold text-xs cursor-pointer"
                >
                  Cerrar Inspección
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
