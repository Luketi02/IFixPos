import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import DetalleCotizacionModal from './DetalleCotizacionModal';
import DetalleOrdenCompraModal from './DetalleOrdenCompraModal';
import { exportarInformePDF } from '../../utils/reportPrinter';
import { API_BASE_URL } from '../../config/api';

const formatMoneda = (valor) => {
  const num = Number(valor) || 0;
  return `$ ${num.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const formatFecha = (fechaIso) => {
  if (!fechaIso) return '—';
  const partes = String(fechaIso).split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return fechaIso;
};

export default function InspeccionProveedorPanel({
  proveedorBase,
  onVolver,
  onModificarProveedor
}) {
  const { token, user } = useAuth();

  // Parte activa: 'PARTE_1' (Datos Legales, Contacto y Cumplimiento/Entregas) | 'PARTE_2' (Abastecimiento: Cotizaciones y Órdenes de Compra)
  const [parteActiva, setParteActiva] = useState('PARTE_1');

  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [expediente, setExpediente] = useState(null);

  // Filtros internos de la Parte 2
  const [filtroEstadoCotizacion, setFiltroEstadoCotizacion] = useState('TODOS');
  const [busquedaCotizacion, setBusquedaCotizacion] = useState('');
  const [filtroEstadoOrden, setFiltroEstadoOrden] = useState('TODOS');
  const [busquedaOrden, setBusquedaOrden] = useState('');

  // Modales de inspección detallada reutilizados de Cotizaciones y Órdenes de Compra
  const [cotizacionInspeccionada, setCotizacionInspeccionada] = useState(null);
  const [ordenInspeccionada, setOrdenInspeccionada] = useState(null);

  const cuitProveedor = proveedorBase?.cuit_prov || proveedorBase?.cuit || '';

  const cargarExpediente = useCallback(async () => {
    if (!cuitProveedor || !token) return;
    setCargando(true);
    setErrorMsg('');
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/purchases/proveedores/${encodeURIComponent(cuitProveedor)}/inspeccion/`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setExpediente(res.data);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'No fue posible recuperar el expediente completo del proveedor.';
      setErrorMsg(msg);
    } finally {
      setCargando(false);
    }
  }, [cuitProveedor, token]);

  useEffect(() => {
    cargarExpediente();
  }, [cargarExpediente]);

  const prov = expediente?.proveedor || proveedorBase || {};
  const metricas = expediente?.metricas_abastecimiento || {};
  const historialEntregas = useMemo(
    () => (Array.isArray(expediente?.historial_entregas) ? expediente.historial_entregas : []),
    [expediente]
  );
  const cotizaciones = useMemo(
    () => (Array.isArray(expediente?.cotizaciones) ? expediente.cotizaciones : []),
    [expediente]
  );
  const ordenesCompra = useMemo(
    () => (Array.isArray(expediente?.ordenes_compra) ? expediente.ordenes_compra : []),
    [expediente]
  );

  const dir = prov.direccion;
  const textoDireccionCompleta = dir
    ? [
        dir.nro_calle || dir.calle_numero,
        dir.nombre_barrio || dir.barrio,
        dir.ciudad,
        dir.provincia,
        dir.pais
      ]
        .filter(Boolean)
        .join(', ')
    : 'Sin dirección física registrada';

  const confiabilidadNum = Math.round(
    Number(metricas.indice_confiabilidad ?? prov.indice_confiabilidad ?? 60)
  );
  const clasificacion =
    metricas.clasificacion_cumplimiento ||
    (confiabilidadNum >= 70 ? 'CUMPLE' : confiabilidadNum >= 55 ? 'CUMPLE' : 'NO_CUMPLE');

  const cotizacionesFiltradas = useMemo(() => {
    return cotizaciones.filter((c) => {
      if (
        filtroEstadoCotizacion !== 'TODOS' &&
        String(c.estado_cotizacion) !== String(filtroEstadoCotizacion)
      ) {
        return false;
      }
      if (busquedaCotizacion.trim()) {
        const q = busquedaCotizacion.toLowerCase().trim();
        const matchId = String(c.id_cotizacion || '').includes(q);
        const matchSol = String(c.id_solicitud || '').includes(q);
        const matchItems = (c.items || []).some((it) =>
          (it.nombre_producto || '').toLowerCase().includes(q)
        );
        if (!matchId && !matchSol && !matchItems) return false;
      }
      return true;
    });
  }, [cotizaciones, filtroEstadoCotizacion, busquedaCotizacion]);

  const ordenesFiltradas = useMemo(() => {
    return ordenesCompra.filter((o) => {
      if (
        filtroEstadoOrden !== 'TODOS' &&
        String(o.estado_orden) !== String(filtroEstadoOrden)
      ) {
        return false;
      }
      if (busquedaOrden.trim()) {
        const q = busquedaOrden.toLowerCase().trim();
        const matchId = String(o.id_orden || '').includes(q);
        const matchRemito = (o.nro_remito || '').toLowerCase().includes(q);
        const listaDet = o.detalles || o.items || [];
        const matchProd = listaDet.some((d) =>
          (d.nombre_producto || '').toLowerCase().includes(q)
        );
        if (!matchId && !matchRemito && !matchProd) return false;
      }
      return true;
    });
  }, [ordenesCompra, filtroEstadoOrden, busquedaOrden]);

  const handleExportarFichaProveedorPDF = () => {
    const nombreEjecutor =
      [user?.nombre, user?.apellido].filter(Boolean).join(' ').trim() ||
      user?.email ||
      'Administrador';

    exportarInformePDF({
      titulo: `Expediente de Inspección y Cumplimiento: ${prov.nombre_proveedor || 'Proveedor'}`,
      subtitulo: `CUIT: ${prov.cuit_prov || '-'} | Nivel: ${prov.nivel || 'Estándar'} | Dictamen: ${
        metricas.etiqueta_cumplimiento || 'Evaluado'
      }`,
      periodo: 'Historial Integral de Abastecimiento',
      filtros: [
        `Estado: ${prov.estado !== false ? 'Activo' : 'Inactivo'}`,
        `Logística: ${prov.ofrece_envio ? 'Realiza envíos' : 'Solo retiro en sede'}`,
        `Confiabilidad: ${confiabilidadNum}%`
      ],
      codigoReferencia: `PROV-${(prov.cuit_prov || '').replace(/\D/g, '').slice(-6) || 'EXP'}`,
      kpis: [
        {
          label: 'Confiabilidad',
          valor: `${confiabilidadNum}%`,
          detalle: metricas.etiqueta_cumplimiento || 'Índice operativo'
        },
        {
          label: 'Cotizaciones Respondidas',
          valor: `${metricas.total_cotizaciones_respondidas ?? cotizaciones.length}`,
          detalle: `${metricas.cotizaciones_aceptadas ?? 0} aceptadas (Tasa resp: ${
            metricas.tasa_respuesta_cotizaciones ?? 0
          }%)`
        },
        {
          label: 'Órdenes y Recepciones',
          valor: `${metricas.total_recepciones ?? 0} / ${
            metricas.total_ordenes_compra ?? ordenesCompra.length
          }`,
          detalle: `${metricas.entregas_en_tiempo_y_forma ?? 0} entregadas en tiempo y forma`
        },
        {
          label: 'Volumen Recepcionado',
          valor: formatMoneda(metricas.monto_total_recepcionado || 0),
          detalle: `${metricas.total_unidades_recibidas ?? 0} u. recibidas (${
            metricas.tasa_efectividad_unidades ?? 100
          }%)`
        }
      ],
      resumenEjecutivo:
        `Proveedor: ${prov.nombre_proveedor} (CUIT: ${prov.cuit_prov}).\n` +
        `Contacto: ${prov.correo || 'S/D'} | Tel: ${prov.telefono || 'S/D'} | Dirección: ${textoDireccionCompleta}.\n` +
        `Evaluación de Cumplimiento: ${metricas.etiqueta_cumplimiento || ''} — ${
          metricas.motivo_cumplimiento || ''
        }\n` +
        `Entrega Promedio Real: ${
          prov.tiempo_promedio_entrega || 0
        } días | Plazo Promedio Prometido: ${metricas.plazo_prometido_promedio_dias || 0} días.`,
      tablas: [
        {
          titulo: 'Historial de Entregas, Plazos y Cumplimiento por Orden de Compra',
          columnas: [
            { header: 'Orden', key: 'id_orden', render: (f) => `OC #${f.id_orden}` },
            { header: 'Emisión', key: 'fecha_emision', render: (f) => formatFecha(f.fecha_emision) },
            {
              header: 'Recepción',
              key: 'fecha_recepcion',
              render: (f) => formatFecha(f.fecha_recepcion)
            },
            {
              header: 'Plazo Real',
              key: 'dias_transcurridos',
              align: 'center',
              render: (f) =>
                f.dias_transcurridos !== null && f.dias_transcurridos !== undefined
                  ? `${f.dias_transcurridos} d (Ref: ${f.plazo_referencia_dias} d)`
                  : '—'
            },
            {
              header: 'Unidades (Rec/Sol)',
              key: 'unidades',
              align: 'center',
              render: (f) => `${f.unidades_recibidas} / ${f.unidades_solicitadas}`
            },
            { header: 'Estado', key: 'estado_nombre' },
            { header: 'Dictamen de Entrega', key: 'observacion_cumplimiento' }
          ],
          filas: historialEntregas
        },
        {
          titulo: 'Historial de Cotizaciones Presentadas',
          columnas: [
            { header: 'Cotización', key: 'id_cotizacion', render: (c) => `#${c.id_cotizacion}` },
            {
              header: 'Solicitud',
              key: 'id_solicitud',
              render: (c) => (c.id_solicitud ? `Sol. #${c.id_solicitud}` : '—')
            },
            {
              header: 'Plazo Prometido',
              key: 'tiempo_promesa',
              align: 'center',
              render: (c) => `${c.tiempo_promesa || 0} días`
            },
            {
              header: 'Validez',
              key: 'fecha_validez',
              render: (c) => formatFecha(c.fecha_validez)
            },
            { header: 'Estado', key: 'estado' },
            {
              header: 'Monto Cotizado',
              key: 'monto_total_cotizado',
              align: 'right',
              render: (c) => formatMoneda(c.monto_total_cotizado || c.monto_total)
            }
          ],
          filas: cotizaciones
        }
      ],
      usuario: {
        nombre: nombreEjecutor,
        email: user?.email || '',
        rol: user?.rol?.nombre_rol || user?.id_rol?.nombre_rol || 'Administrador'
      }
    });
  };

  const renderBadgeEstadoCotizacion = (estadoNum) => {
    switch (Number(estadoNum)) {
      case 0:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Pendiente de Evaluación
          </span>
        );
      case 1:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Aceptada
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            Descartada
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Rechazada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300">
            Evaluada
          </span>
        );
    }
  };

  const renderBadgeEstadoOrden = (estadoNum) => {
    switch (Number(estadoNum)) {
      case 1:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Esperando Entrega
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Entregada
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Cancelada
          </span>
        );
      case 4:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            Entregada Parcialmente
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300">
            Borrador
          </span>
        );
    }
  };

  const urlArchivoAdjunto = (ruta) => {
    if (!ruta) return null;
    if (String(ruta).startsWith('http')) return ruta;
    const limpia = String(ruta).startsWith('/media/')
      ? ruta
      : `/media/${String(ruta).replace(/^\/+/, '')}`;
    return `${API_BASE_URL}${limpia}`;
  };

  return (
    <div className="space-y-6">
      {/* Barra Superior de Navegación y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVolver}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Volver al Directorio</span>
          </button>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 block">
              Inspección Integral de Proveedor
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
              {prov.nombre_proveedor || 'Proveedor'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleExportarFichaProveedorPDF}
            disabled={cargando}
            className="px-4 py-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Exportar Informe de Cumplimiento (PDF)</span>
          </button>

          <button
            type="button"
            onClick={() => onModificarProveedor && onModificarProveedor(prov)}
            className="px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>Editar Datos</span>
          </button>
        </div>
      </div>

      {/* Cabecera Resumen del Proveedor y Dictamen de Cumplimiento */}
      <div className="bg-gradient-to-r from-[#1E293B] via-[#1E293B] to-slate-900 border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/25 to-violet-500/25 border border-cyan-500/40 flex items-center justify-center text-lg font-black text-cyan-300 shrink-0">
              {(prov.nombre_proveedor || 'PR').slice(0, 2).toUpperCase()}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-xl font-black text-white">{prov.nombre_proveedor}</h3>
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                  CUIT: {prov.cuit_prov}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                  Nivel {prov.nivel || 'Estándar'}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    prov.estado !== false
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      prov.estado !== false ? 'bg-emerald-400' : 'bg-rose-400'
                    }`}
                  />
                  {prov.estado !== false ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <p className="text-xs text-slate-300">
                {metricas.motivo_cumplimiento ||
                  'Evaluando historial de órdenes de compra, tiempos de entrega y recepciones...'}
              </p>
            </div>
          </div>

          {/* Semáforo de Cumplimiento */}
          <div
            className={`p-4 rounded-2xl border min-w-[260px] ${
              clasificacion === 'CUMPLE'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : clasificacion === 'EN_OBSERVACION'
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-mono uppercase tracking-wider opacity-80">
                Dictamen de Cumplimiento
              </span>
              <span className="text-lg font-black font-mono">{confiabilidadNum}%</span>
            </div>
            <div className="text-sm font-extrabold mt-1">
              {metricas.etiqueta_cumplimiento ||
                (clasificacion === 'CUMPLE'
                  ? 'Proveedor Cumplidor'
                  : clasificacion === 'EN_OBSERVACION'
                  ? 'En Observación'
                  : 'Incumplimiento Detectado')}
            </div>
            <div className="w-full h-2 bg-slate-900/90 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  clasificacion === 'CUMPLE'
                    ? 'bg-emerald-400'
                    : clasificacion === 'EN_OBSERVACION'
                    ? 'bg-amber-400'
                    : 'bg-rose-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, confiabilidadNum))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Selector de las 2 Partes para no sobrecargar la pantalla */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 pt-5 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setParteActiva('PARTE_1')}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
              parteActiva === 'PARTE_1'
                ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                : 'bg-[#0F172A]/70 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                  parteActiva === 'PARTE_1'
                    ? 'bg-cyan-400 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                1
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold">
                  Parte 1: Información Legal, Contacto y Cumplimiento
                </p>
                <p className="text-[11px] text-slate-400">
                  Datos fiscales, dirección, confiabilidad e historial de entregas
                </p>
              </div>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900/80 text-cyan-300">
              {historialEntregas.length} entregas
            </span>
          </button>

          <button
            type="button"
            onClick={() => setParteActiva('PARTE_2')}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
              parteActiva === 'PARTE_2'
                ? 'bg-violet-500/15 border-violet-400 text-white shadow-[0_0_20px_rgba(139,92,246,0.15)]'
                : 'bg-[#0F172A]/70 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                  parteActiva === 'PARTE_2'
                    ? 'bg-violet-400 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                2
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold">
                  Parte 2: Módulos de Abastecimiento (Cotizaciones y OC)
                </p>
                <p className="text-[11px] text-slate-400">
                  Total de órdenes, recepciones, cotizaciones con PDF y productos comprados
                </p>
              </div>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900/80 text-violet-300">
              {cotizaciones.length} cotiz. • {ordenesCompra.length} OC
            </span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs flex items-center justify-between">
          <span>⚠️ {errorMsg}</span>
          <button
            type="button"
            onClick={cargarExpediente}
            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 font-bold"
          >
            Reintentar
          </button>
        </div>
      )}

      {cargando ? (
        <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center space-y-3">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400">
            Recopilando expediente legal, historial de entregas, cotizaciones y órdenes de compra...
          </p>
        </div>
      ) : (
        <>
          {/* ================================================================== */}
          {/* PARTE 1: DATOS LEGALES, CONTACTO, CONFIABILIDAD Y ENTREGAS         */}
          {/* ================================================================== */}
          {parteActiva === 'PARTE_1' && (
            <div className="space-y-6">
              {/* Grilla de Información Legal/Fiscal y Contacto/Ubicación */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Tarjeta 1: Información Legal y Comercial */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
                  <div className="flex items-center gap-2.5 border-b border-slate-700/70 pb-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                        Información Legal y Perfil Comercial
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Identificación tributaria y categoría operativa en el padrón
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800">
                      <span className="text-slate-400 block mb-1">Razón Social / Nombre Comercial</span>
                      <span className="text-sm font-bold text-white">{prov.nombre_proveedor || '—'}</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800">
                      <span className="text-slate-400 block mb-1">Identificador Fiscal (CUIT)</span>
                      <span className="text-sm font-mono font-bold text-cyan-300">
                        {prov.cuit_prov || '—'}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800">
                      <span className="text-slate-400 block mb-1">Clasificación / Nivel Comercial</span>
                      <span className="text-sm font-bold text-violet-300">
                        {prov.nivel || 'Estándar'}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800">
                      <span className="text-slate-400 block mb-1">Estado en el Sistema</span>
                      <span
                        className={`text-sm font-bold ${
                          prov.estado !== false ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {prov.estado !== false ? 'Habilitado para Compras' : 'Inactivo / Suspendido'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tarjeta 2: Datos de Contacto y Logística */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
                  <div className="flex items-center gap-2.5 border-b border-slate-700/70 pb-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                        Canales de Contacto y Domicilio Físico
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Medios de comunicación para despacho de solicitudes y órdenes
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800">
                      <span className="text-slate-400 block mb-1">Correo Electrónico Oficial</span>
                      <span className="text-sm font-semibold text-white break-all">
                        {prov.correo || 'Sin correo registrado'}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800">
                      <span className="text-slate-400 block mb-1">Teléfono Comercial</span>
                      <span className="text-sm font-semibold text-white">
                        {prov.telefono || 'Sin teléfono registrado'}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800">
                      <span className="text-slate-400 block mb-1">Modalidad Logística</span>
                      <span className="text-sm font-bold text-cyan-300">
                        {prov.ofrece_envio
                          ? '🚚 Realiza envíos a domicilio'
                          : '🏪 Solo retiro en sucursal del proveedor'}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800">
                      <span className="text-slate-400 block mb-1">Dirección Física / Sede</span>
                      <span className="text-xs font-medium text-slate-200 leading-relaxed">
                        {textoDireccionCompleta}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel de Indicadores de Cumplimiento y Confiabilidad */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/70 pb-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Evaluación de Confiabilidad, Tiempos de Entrega y Cumplimiento
                    </h3>
                    <p className="text-xs text-slate-400">
                      Indicadores utilizados por el algoritmo multicriterio al seleccionar proveedores para Órdenes de Compra.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 bg-[#0F172A] px-3 py-1 rounded-lg border border-slate-800">
                    Regla de Negocio: Base inicial 60% (ajuste dinámico a partir de 5 recepciones)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
                    <span className="text-[11px] font-mono uppercase text-slate-400">
                      Índice de Confiabilidad
                    </span>
                    <div className="text-2xl font-black text-cyan-300 font-mono">
                      {confiabilidadNum}%
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {metricas.total_recepciones < 5
                        ? `${metricas.total_recepciones || 0}/5 recepciones para ajuste automático`
                        : 'Ajustado por desempeño histórico'}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
                    <span className="text-[11px] font-mono uppercase text-slate-400">
                      Entrega Promedio vs Promesa
                    </span>
                    <div className="text-2xl font-black text-white font-mono">
                      {metricas.tiempo_promedio_entrega_dias > 0
                        ? `${metricas.tiempo_promedio_entrega_dias} días`
                        : 'Sin entregas'}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Promesa media en cotizaciones:{' '}
                      <strong className="text-slate-200">
                        {metricas.plazo_prometido_promedio_dias || 0} días
                      </strong>
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
                    <span className="text-[11px] font-mono uppercase text-slate-400">
                      Entregas en Tiempo y Forma
                    </span>
                    <div className="text-2xl font-black text-emerald-400 font-mono">
                      {metricas.entregas_en_tiempo_y_forma ?? 0}{' '}
                      <span className="text-sm font-normal text-slate-400">
                        / {metricas.total_recepciones ?? 0} recep.
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Con demora o parciales:{' '}
                      <strong className="text-amber-300">
                        {metricas.entregas_con_demora_o_parciales ?? 0}
                      </strong>{' '}
                      • Canceladas:{' '}
                      <strong className="text-rose-400">{metricas.ordenes_canceladas ?? 0}</strong>
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
                    <span className="text-[11px] font-mono uppercase text-slate-400">
                      Efectividad de Unidades
                    </span>
                    <div className="text-2xl font-black text-violet-300 font-mono">
                      {metricas.tasa_efectividad_unidades ?? 100}%
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {metricas.total_unidades_recibidas ?? 0} recibidas de{' '}
                      {metricas.total_unidades_solicitadas ?? 0} solicitadas
                    </p>
                  </div>
                </div>
              </div>

              {/* Tabla de Historial de Entregas y Recepciones */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-slate-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Registro Histórico de Entregas y Cumplimiento de Plazos
                    </h3>
                    <p className="text-xs text-slate-400">
                      Auditoría de cada recepción física, días reales de demora, remitos y cumplimiento de cantidades.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 rounded-lg">
                    Total Recepciones Concretadas: {metricas.total_recepciones ?? 0}
                  </span>
                </div>

                {historialEntregas.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-xs">
                    Este proveedor aún no registra órdenes de compra ni entregas en su historial.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900/70 border-b border-slate-700/80 text-[11px] font-mono uppercase text-slate-400">
                          <th className="py-3 px-4">Orden</th>
                          <th className="py-3 px-4">Emisión</th>
                          <th className="py-3 px-4">Recepción</th>
                          <th className="py-3 px-4">N° Remito</th>
                          <th className="py-3 px-4 text-center">Tiempo Real</th>
                          <th className="py-3 px-4 text-center">Unidades (Rec / Sol)</th>
                          <th className="py-3 px-4">Estado</th>
                          <th className="py-3 px-4">Evaluación de Cumplimiento</th>
                          <th className="py-3 px-4 text-right">Inspección</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {historialEntregas.map((ent) => (
                          <tr key={ent.id_orden} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-cyan-300">
                              OC #{ent.id_orden}
                            </td>
                            <td className="py-3.5 px-4 text-slate-300">
                              {formatFecha(ent.fecha_emision)}
                            </td>
                            <td className="py-3.5 px-4 text-slate-300">
                              {formatFecha(ent.fecha_recepcion)}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-300">
                              {ent.nro_remito || '—'}
                            </td>
                            <td className="py-3.5 px-4 text-center font-mono">
                              {ent.dias_transcurridos !== null && ent.dias_transcurridos !== undefined ? (
                                <span
                                  className={
                                    ent.dias_transcurridos <= ent.plazo_referencia_dias
                                      ? 'text-emerald-300 font-bold'
                                      : 'text-amber-300 font-bold'
                                  }
                                >
                                  {ent.dias_transcurridos} d{' '}
                                  <span className="text-slate-500 font-normal">
                                    (ref {ent.plazo_referencia_dias}d)
                                  </span>
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center font-mono text-slate-200">
                              {ent.unidades_recibidas} / {ent.unidades_solicitadas}
                            </td>
                            <td className="py-3.5 px-4">
                              {renderBadgeEstadoOrden(ent.estado_orden)}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                                  ent.cumplio_entrega
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                    : ent.estado_orden === 3
                                    ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {ent.observacion_cumplimiento}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => setOrdenInspeccionada({ id_orden: ent.id_orden })}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer"
                                title="Inspeccionar Orden de Compra"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span>Ver OC</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* PARTE 2: MÓDULOS DE ABASTECIMIENTO (COTIZACIONES Y ÓRDENES)        */}
          {/* ================================================================== */}
          {parteActiva === 'PARTE_2' && (
            <div className="space-y-6">
              {/* Tarjetas Resumen de Abastecimiento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-xl">
                  <span className="text-[11px] font-mono uppercase text-slate-400">
                    Cotizaciones Respondidas
                  </span>
                  <div className="text-2xl font-black text-cyan-300 font-mono mt-1">
                    {metricas.total_cotizaciones_respondidas ?? cotizaciones.length}
                    <span className="text-xs font-normal text-slate-400 ml-1.5">
                      de {metricas.total_invitaciones_cotizar ?? cotizaciones.length} invitaciones
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Aceptadas:{' '}
                    <strong className="text-emerald-400">
                      {metricas.cotizaciones_aceptadas ?? 0}
                    </strong>{' '}
                    • Pendientes:{' '}
                    <strong className="text-amber-300">
                      {metricas.cotizaciones_pendientes ?? 0}
                    </strong>{' '}
                    • Descartadas/Rech:{' '}
                    <strong className="text-slate-300">
                      {(metricas.cotizaciones_descartadas ?? 0) +
                        (metricas.cotizaciones_rechazadas ?? 0)}
                    </strong>
                  </p>
                </div>

                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-xl">
                  <span className="text-[11px] font-mono uppercase text-slate-400">
                    Total Órdenes de Compra
                  </span>
                  <div className="text-2xl font-black text-white font-mono mt-1">
                    {metricas.total_ordenes_compra ?? ordenesCompra.length}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    En tránsito:{' '}
                    <strong className="text-amber-300">
                      {metricas.ordenes_esperando_entrega ?? 0}
                    </strong>{' '}
                    • Canceladas:{' '}
                    <strong className="text-rose-400">{metricas.ordenes_canceladas ?? 0}</strong>
                  </p>
                </div>

                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-xl">
                  <span className="text-[11px] font-mono uppercase text-slate-400">
                    Total Recepciones
                  </span>
                  <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                    {metricas.total_recepciones ?? 0}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Completas:{' '}
                    <strong className="text-emerald-300">
                      {metricas.ordenes_entregadas_completas ?? 0}
                    </strong>{' '}
                    • Parciales:{' '}
                    <strong className="text-cyan-300">
                      {metricas.ordenes_entregadas_parciales ?? 0}
                    </strong>
                  </p>
                </div>

                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-xl">
                  <span className="text-[11px] font-mono uppercase text-slate-400">
                    Volumen Económico Adjudicado
                  </span>
                  <div className="text-xl font-black text-violet-300 font-mono mt-1">
                    {formatMoneda(metricas.monto_total_comprometido || 0)}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Efectivamente recepcionado:{' '}
                    <strong className="text-slate-200">
                      {formatMoneda(metricas.monto_total_recepcionado || 0)}
                    </strong>
                  </p>
                </div>
              </div>

              {/* 1. LISTA DE COTIZACIONES DEL PROVEEDOR */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-slate-700/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Lista de Cotizaciones del Proveedor
                    </h3>
                    <p className="text-xs text-slate-400">
                      Inspecciona los presupuestos recibidos, sus estados de evaluación, renglones cotizados y el PDF formal adjunto.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="text"
                      value={busquedaCotizacion}
                      onChange={(e) => setBusquedaCotizacion(e.target.value)}
                      placeholder="Buscar por # cotización, # solicitud o insumo..."
                      className="px-3 py-1.5 rounded-xl bg-[#0F172A] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-64"
                    />
                    <select
                      value={filtroEstadoCotizacion}
                      onChange={(e) => setFiltroEstadoCotizacion(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-[#0F172A] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                    >
                      <option value="TODOS">Todos los estados ({cotizaciones.length})</option>
                      <option value="0">Pendiente de Evaluación</option>
                      <option value="1">Aceptada</option>
                      <option value="2">Descartada</option>
                      <option value="3">Rechazada</option>
                    </select>
                  </div>
                </div>

                {cotizacionesFiltradas.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-xs">
                    No se encontraron cotizaciones registradas para este proveedor con los filtros seleccionados.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900/70 border-b border-slate-700/80 text-[11px] font-mono uppercase text-slate-400">
                          <th className="py-3 px-4">Cotización</th>
                          <th className="py-3 px-4">Solicitud Asociada</th>
                          <th className="py-3 px-4 text-center">Plazo Prometido</th>
                          <th className="py-3 px-4">Validez de Oferta</th>
                          <th className="py-3 px-4">Insumos Cotizados</th>
                          <th className="py-3 px-4 text-right">Monto Total</th>
                          <th className="py-3 px-4">Estado</th>
                          <th className="py-3 px-4">PDF Adjunto</th>
                          <th className="py-3 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {cotizacionesFiltradas.map((cot) => {
                          const pdfUrl = urlArchivoAdjunto(cot.archivo_adjunto);
                          const itemsCot = Array.isArray(cot.items) ? cot.items : [];
                          return (
                            <tr
                              key={cot.id_cotizacion}
                              className="hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="py-3.5 px-4 font-mono font-bold text-cyan-300">
                                Cotización #{cot.id_cotizacion}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-slate-300">
                                {cot.id_solicitud ? `Solicitud #${cot.id_solicitud}` : '—'}
                              </td>
                              <td className="py-3.5 px-4 text-center font-semibold text-white">
                                {cot.tiempo_promesa} días
                              </td>
                              <td className="py-3.5 px-4 text-slate-300">
                                {formatFecha(cot.fecha_validez)}
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {itemsCot.slice(0, 2).map((it, idx) => (
                                    <span
                                      key={it.id_cotizacion_producto || idx}
                                      className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-200 truncate max-w-[180px]"
                                    >
                                      {it.nombre_producto} (x{it.cantidad || 1})
                                    </span>
                                  ))}
                                  {itemsCot.length > 2 && (
                                    <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[11px] font-semibold">
                                      +{itemsCot.length - 2} más
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                                {formatMoneda(cot.monto_total_cotizado || cot.monto_total)}
                              </td>
                              <td className="py-3.5 px-4">
                                {renderBadgeEstadoCotizacion(cot.estado_cotizacion)}
                              </td>
                              <td className="py-3.5 px-4">
                                {pdfUrl ? (
                                  <a
                                    href={pdfUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-semibold transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span>Ver PDF</span>
                                  </a>
                                ) : (
                                  <span className="text-slate-500 italic">Sin PDF</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => setCotizacionInspeccionada(cot)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer"
                                  title="Inspeccionar datos completos de la cotización y PDF adjunto"
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

              {/* 2. LISTA DE ÓRDENES DE COMPRA DEL PROVEEDOR */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-slate-700/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Lista de Órdenes de Compra y Productos Comprados
                    </h3>
                    <p className="text-xs text-slate-400">
                      Visualiza las órdenes adjudicadas al proveedor, los insumos comprados, cantidades recibidas y sus estados.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="text"
                      value={busquedaOrden}
                      onChange={(e) => setBusquedaOrden(e.target.value)}
                      placeholder="Buscar por # orden, remito o producto..."
                      className="px-3 py-1.5 rounded-xl bg-[#0F172A] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-64"
                    />
                    <select
                      value={filtroEstadoOrden}
                      onChange={(e) => setFiltroEstadoOrden(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-[#0F172A] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                    >
                      <option value="TODOS">Todos los estados ({ordenesCompra.length})</option>
                      <option value="1">Esperando Entrega</option>
                      <option value="2">Entregada</option>
                      <option value="4">Entregada Parcialmente</option>
                      <option value="3">Cancelada</option>
                    </select>
                  </div>
                </div>

                {ordenesFiltradas.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-xs">
                    No se encontraron órdenes de compra para este proveedor con los filtros seleccionados.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900/70 border-b border-slate-700/80 text-[11px] font-mono uppercase text-slate-400">
                          <th className="py-3 px-4">N° Orden</th>
                          <th className="py-3 px-4">Emisión / Recepción</th>
                          <th className="py-3 px-4">Modalidad y Remito</th>
                          <th className="py-3 px-4">Productos Comprados</th>
                          <th className="py-3 px-4 text-right">Monto Total</th>
                          <th className="py-3 px-4">Estado</th>
                          <th className="py-3 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {ordenesFiltradas.map((ord) => {
                          const renglones = Array.isArray(ord.detalles)
                            ? ord.detalles
                            : Array.isArray(ord.items)
                            ? ord.items
                            : [];
                          return (
                            <tr
                              key={ord.id_orden}
                              className="hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="py-3.5 px-4">
                                <span className="font-mono font-bold text-cyan-300 block">
                                  OC #{ord.id_orden}
                                </span>
                                {ord.sol_tec && (
                                  <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    Urgencia Taller
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="text-slate-200">
                                  Emitida: {formatFecha(ord.fecha_emision)}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  Recibida: {formatFecha(ord.fecha_recepcion)}
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="text-slate-200 font-medium">
                                  {ord.tipo_entrega_nombre ||
                                    (Number(ord.tipo_entrega) === 2
                                      ? 'Envío a Domicilio'
                                      : 'Retiro en Sucursal')}
                                </div>
                                <div className="text-[11px] font-mono text-slate-400">
                                  Remito: {ord.nro_remito || 'S/N'}
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="space-y-1 max-w-md">
                                  {renglones.slice(0, 3).map((r, idx) => (
                                    <div
                                      key={r.id_detalle_compra || idx}
                                      className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-[#0F172A] border border-slate-800 text-[11px]"
                                    >
                                      <span className="text-slate-200 font-medium truncate">
                                        {r.nombre_producto}
                                      </span>
                                      <span className="font-mono text-cyan-300 shrink-0">
                                        {r.cantidad_recibida !== null &&
                                        r.cantidad_recibida !== undefined
                                          ? `${r.cantidad_recibida}/${r.cantidad} u.`
                                          : `${r.cantidad} u.`}{' '}
                                        • {formatMoneda(r.precio_unitario)}
                                      </span>
                                    </div>
                                  ))}
                                  {renglones.length > 3 && (
                                    <span className="inline-block text-[11px] text-cyan-400 font-semibold">
                                      + {renglones.length - 3} producto(s) adicional(es)
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                                {formatMoneda(ord.monto_total)}
                              </td>
                              <td className="py-3.5 px-4">
                                {renderBadgeEstadoOrden(ord.estado_orden)}
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => setOrdenInspeccionada(ord)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30 text-xs font-semibold transition-all cursor-pointer"
                                  title="Inspeccionar Orden de Compra y productos comprados"
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
            </div>
          )}
        </>
      )}

      {/* Modal de Inspección de Cotización (con visualización de PDF adjunto e insumos) */}
      {Boolean(cotizacionInspeccionada) && (
        <DetalleCotizacionModal
          isOpen={Boolean(cotizacionInspeccionada)}
          onClose={() => setCotizacionInspeccionada(null)}
          idCotizacion={cotizacionInspeccionada?.id_cotizacion}
          cotizacionInicial={cotizacionInspeccionada}
          onCotizacionEvaluada={() => {
            cargarExpediente();
          }}
        />
      )}

      {/* Modal de Inspección de Orden de Compra (con visualización de productos comprados) */}
      {Boolean(ordenInspeccionada) && (
        <DetalleOrdenCompraModal
          isOpen={Boolean(ordenInspeccionada)}
          onClose={() => setOrdenInspeccionada(null)}
          idOrden={ordenInspeccionada?.id_orden}
          ordenInicial={ordenInspeccionada}
        />
      )}
    </div>
  );
}

InspeccionProveedorPanel.propTypes = {
  proveedorBase: PropTypes.object,
  onVolver: PropTypes.func.isRequired,
  onModificarProveedor: PropTypes.func
};
