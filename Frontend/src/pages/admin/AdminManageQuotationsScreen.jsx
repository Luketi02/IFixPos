import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';
import DetalleCotizacionModal from '../../components/purchases/DetalleCotizacionModal';
import EvaluarCotizacionModal from '../../components/purchases/EvaluarCotizacionModal';

import { API_BASE_URL } from '../../config/api';
export default function AdminManageQuotationsScreen() {
  const { token } = useAuth();

  // Estados de Cotizaciones
  const [cotizaciones, setCotizaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorAlerta, setErrorAlerta] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  // Proveedores y Catálogo para los dropdowns de filtrado
  const [proveedores, setProveedores] = useState([]);
  const [catalogoProductos, setCatalogoProductos] = useState([]);

  // CU-60: Parámetros de Filtro
  const [filtros, setFiltros] = useState({
    id_cotizacion: '',
    id_solicitud: '',
    cuit_prov: '',
    estado_cotizacion: '',
    fecha_validez_desde: '',
    fecha_validez_hasta: '',
    id_producto: '',
    buscar_producto: ''
  });

  // Modal de Inspección Detallada (CU-52)
  const [cotizacionSeleccionada, setCotizacionSeleccionada] = useState(null);
  const [modalDetalleOpen, setModalDetalleOpen] = useState(false);

  // Modal Rápido de Evaluación (CU-53) desde la tabla
  const [cotizacionParaEvaluar, setCotizacionParaEvaluar] = useState(null);
  const [modoEvaluacionRapida, setModoEvaluacionRapida] = useState('ACEPTAR');
  const [modalEvaluarRapidoOpen, setModalEvaluarRapidoOpen] = useState(false);

  // Auto-cierre de alertas (Regla 6)
  useEffect(() => {
    if (!errorAlerta) return undefined;
    const timer = setTimeout(() => setErrorAlerta(''), 6000);
    return () => clearTimeout(timer);
  }, [errorAlerta]);

  useEffect(() => {
    if (!mensajeExito) return undefined;
    const timer = setTimeout(() => setMensajeExito(''), 6000);
    return () => clearTimeout(timer);
  }, [mensajeExito]);

  // Cargar lista de proveedores para selector
  useEffect(() => {
    const cargarAuxiliares = async () => {
      try {
        const activeToken = token || localStorage.getItem('access_token');
        const config = { headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {} };
        const [respProv, respProd] = await Promise.allSettled([
          axios.get(`${API_BASE_URL}/api/purchases/proveedores/`, config),
          axios.get(`${API_BASE_URL}/api/catalog/productos/`, config)
        ]);

        if (respProv.status === 'fulfilled' && Array.isArray(respProv.value.data)) {
          setProveedores(respProv.value.data);
        }
        if (respProd.status === 'fulfilled' && Array.isArray(respProd.value.data)) {
          setCatalogoProductos(respProd.value.data);
        }
      } catch (e) {
        // Fallback silencioso si aún no hay productos
      }
    };
    cargarAuxiliares();
  }, [token]);

  // CU-60: Carga y Filtrado de Cotizaciones
  const consultarCotizaciones = useCallback(async (paramsFiltro = filtros) => {
    setCargando(true);
    setErrorAlerta('');

    // Validación previa de consistencia temporal (Paso 4)
    if (
      paramsFiltro.fecha_validez_desde &&
      paramsFiltro.fecha_validez_hasta &&
      paramsFiltro.fecha_validez_desde > paramsFiltro.fecha_validez_hasta
    ) {
      setErrorAlerta('El rango temporal es inconsistente: la fecha "Desde" no puede ser posterior a la fecha "Hasta".');
      setCargando(false);
      return;
    }

    try {
      const activeToken = token || localStorage.getItem('access_token');
      const config = {
        headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
        params: {}
      };

      if (paramsFiltro.id_cotizacion) config.params.id_cotizacion = paramsFiltro.id_cotizacion;
      if (paramsFiltro.id_solicitud) config.params.id_solicitud = paramsFiltro.id_solicitud;
      if (paramsFiltro.cuit_prov) config.params.cuit_prov = paramsFiltro.cuit_prov;
      if (paramsFiltro.estado_cotizacion !== '') config.params.estado_cotizacion = paramsFiltro.estado_cotizacion;
      if (paramsFiltro.fecha_validez_desde) config.params.fecha_validez_desde = paramsFiltro.fecha_validez_desde;
      if (paramsFiltro.fecha_validez_hasta) config.params.fecha_validez_hasta = paramsFiltro.fecha_validez_hasta;
      if (paramsFiltro.id_producto) config.params.id_producto = paramsFiltro.id_producto;
      if (paramsFiltro.buscar_producto) config.params.buscar_producto = paramsFiltro.buscar_producto;

      const resp = await axios.get(`${API_BASE_URL}/api/purchases/cotizaciones/filtrar/`, config);
      setCotizaciones(Array.isArray(resp.data) ? resp.data : []);
    } catch (err) {
      const serverMsg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.response?.data?.non_field_errors?.[0] ||
        'No se pudo consultar el padrón de cotizaciones.';
      setErrorAlerta(serverMsg);
      setCotizaciones([]);
    } finally {
      setCargando(false);
    }
  }, [filtros, token]);

  useEffect(() => {
    consultarCotizaciones();
  }, [consultarCotizaciones]);

  // Manejo de cambios en el formulario de filtros
  const handleFiltroChange = (e) => {
    const { name, value } = e.target;
    setFiltros((prev) => ({ ...prev, [name]: value }));
  };

  const handleBuscar = (e) => {
    e.preventDefault();
    consultarCotizaciones(filtros);
  };

  const handleLimpiarFiltros = () => {
    const filtrosVacios = {
      id_cotizacion: '',
      id_solicitud: '',
      cuit_prov: '',
      estado_cotizacion: '',
      fecha_validez_desde: '',
      fecha_validez_hasta: '',
      id_producto: '',
      buscar_producto: ''
    };
    setFiltros(filtrosVacios);
    consultarCotizaciones(filtrosVacios);
  };

  // KPIs de la pantalla
  const metricas = useMemo(() => {
    const total = cotizaciones.length;
    let pendientes = 0;
    let aceptadas = 0;
    let descartadas = 0;
    let rechazadas = 0;

    cotizaciones.forEach((c) => {
      if (c.estado_cotizacion === 0) pendientes += 1;
      else if (c.estado_cotizacion === 1) aceptadas += 1;
      else if (c.estado_cotizacion === 2) descartadas += 1;
      else if (c.estado_cotizacion === 3) rechazadas += 1;
    });

    return { total, pendientes, aceptadas, descartadas, rechazadas };
  }, [cotizaciones]);

  // Acciones sobre cotizaciones
  const handleInspeccionar = (cotiz) => {
    setCotizacionSeleccionada(cotiz);
    setModalDetalleOpen(true);
  };

  const handleEvaluarRapido = (cotiz, modo) => {
    setCotizacionParaEvaluar(cotiz);
    setModoEvaluacionRapida(modo);
    setModalEvaluarRapidoOpen(true);
  };

  const handleEvaluacionCompletada = (cotizActualizada) => {
    setMensajeExito(
      `La cotización #${cotizActualizada.id_cotizacion} fue evaluada exitosamente como ${cotizActualizada.estado_nombre || 'actualizada'}.`
    );
    consultarCotizaciones(filtros);
  };

  const formatMoneda = (valor) => {
    const num = Number(valor) || 0;
    return `$ ${num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getVigenciaBadge = (fechaStr) => {
    if (!fechaStr) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const [y, m, d] = fechaStr.split('-').map(Number);
    const fVenc = new Date(y, m - 1, d);
    const diffDias = Math.ceil((fVenc - hoy) / (1000 * 60 * 60 * 24));

    if (diffDias < 0) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 border border-rose-500/30 text-rose-400">
          Vencida
        </span>
      );
    }
    if (diffDias === 0) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 animate-pulse">
          Vence hoy
        </span>
      );
    }
    if (diffDias <= 3) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
          {diffDias} d. restantes
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
        Vigente
      </span>
    );
  };

  return (
    <div className="flex h-screen bg-[#0F172A] font-['Lexend'] text-slate-100 overflow-hidden">
      {/* Barra Lateral */}
      <AdminSidebar currentRoute="/admin/gestionar-cotizaciones" />

      {/* Contenedor Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Cabecera Superior Unificada */}
        <AdminHeader
          category="Compras & Abastecimiento"
          pageName="Gestionar Cotizaciones"
          title="Evaluación de Cotizaciones"
        />

        {/* Contenido */}
        <main className="p-8 space-y-6">
          {/* Mensajes de Alerta y Éxito */}
          <AnimatePresence>
            {errorAlerta && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{errorAlerta}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorAlerta('')}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </motion.div>
            )}

            {mensajeExito && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{mensajeExito}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMensajeExito('')}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tarjetas KPIs Cyber-Tech */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-[#1E293B] border border-slate-800 rounded-2xl">
              <div className="text-slate-400 text-xs font-medium">Total Cotizaciones</div>
              <div className="text-2xl font-black text-white mt-1">{metricas.total}</div>
              <div className="text-[11px] text-slate-500 mt-1">Registradas en el sistema</div>
            </div>

            <div className="p-4 bg-[#1E293B] border border-amber-500/30 rounded-2xl relative overflow-hidden">
              <div className="text-amber-400 text-xs font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Pendientes de Evaluación
              </div>
              <div className="text-2xl font-black text-amber-300 mt-1">{metricas.pendientes}</div>
              <div className="text-[11px] text-amber-400/80 mt-1">Esperando aprobación o descarte</div>
            </div>

            <div className="p-4 bg-[#1E293B] border border-emerald-500/30 rounded-2xl">
              <div className="text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Aceptadas (Precios Oficiales)
              </div>
              <div className="text-2xl font-black text-emerald-300 mt-1">{metricas.aceptadas}</div>
              <div className="text-[11px] text-emerald-400/80 mt-1">Sostén cotizado activo</div>
            </div>

            <div className="p-4 bg-[#1E293B] border border-slate-800 rounded-2xl">
              <div className="text-slate-400 text-xs font-medium">Descartadas / Rechazadas</div>
              <div className="text-2xl font-black text-slate-300 mt-1">
                {metricas.descartadas + metricas.rechazadas}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {metricas.descartadas} descartadas • {metricas.rechazadas} declinadas
              </div>
            </div>
          </div>

          {/* Panel de Filtros de Búsqueda (CU-60) */}
          <div className="p-6 bg-[#1E293B] border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span>Criterios de Filtrado y Segmentación de Cotizaciones</span>
              </div>
              <span className="text-[11px] text-slate-400">
                Filtre por pliego, proveedor, estado o rango de validez
              </span>
            </div>

            <form onSubmit={handleBuscar} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Búsqueda Exacta: N° Cotización */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    N° de Cotización:
                  </label>
                  <input
                    type="number"
                    name="id_cotizacion"
                    min="1"
                    placeholder="Ej. 12"
                    value={filtros.id_cotizacion}
                    onChange={handleFiltroChange}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Búsqueda Exacta: N° Solicitud Asociada */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    N° Solicitud Asociada:
                  </label>
                  <input
                    type="number"
                    name="id_solicitud"
                    min="1"
                    placeholder="Ej. 4"
                    value={filtros.id_solicitud}
                    onChange={handleFiltroChange}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Filtro Categórico: Proveedor Emisor */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Proveedor Emisor:
                  </label>
                  <select
                    name="cuit_prov"
                    value={filtros.cuit_prov}
                    onChange={handleFiltroChange}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Todos los Proveedores</option>
                    {proveedores.map((p) => (
                      <option key={p.cuit_prov} value={p.cuit_prov}>
                        {p.nombre_proveedor} ({p.cuit_prov})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro Categórico: Estado Actual */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Estado de la Cotización:
                  </label>
                  <select
                    name="estado_cotizacion"
                    value={filtros.estado_cotizacion}
                    onChange={handleFiltroChange}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Todos los Estados</option>
                    <option value="0">Pendiente de Evaluación</option>
                    <option value="1">Aceptada (Precios Oficiales)</option>
                    <option value="2">Descartada por Administrador</option>
                    <option value="3">Rechazada por Proveedor</option>
                  </select>
                </div>

                {/* Filtro Cronológico: Validez Desde */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Validez Desde:
                  </label>
                  <input
                    type="date"
                    name="fecha_validez_desde"
                    value={filtros.fecha_validez_desde}
                    onChange={handleFiltroChange}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500 [color-scheme:dark]"
                  />
                </div>

                {/* Filtro Cronológico: Validez Hasta */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Validez Hasta:
                  </label>
                  <input
                    type="date"
                    name="fecha_validez_hasta"
                    value={filtros.fecha_validez_hasta}
                    onChange={handleFiltroChange}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500 [color-scheme:dark]"
                  />
                </div>

                {/* Búsqueda por Contenido: Insumo / Repuesto Específico */}
                <div className="md:col-span-2">
                  <label className="block text-slate-400 font-semibold mb-1">
                    Insumo o Repuesto Cotizado (Cruce relacional):
                  </label>
                  <div className="flex gap-2">
                    <select
                      name="id_producto"
                      value={filtros.id_producto}
                      onChange={handleFiltroChange}
                      className="w-1/2 px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500 truncate"
                    >
                      <option value="">Seleccionar desde Catálogo...</option>
                      {catalogoProductos.map((prod) => (
                        <option key={prod.id_producto} value={prod.id_producto}>
                          {prod.nombre}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      name="buscar_producto"
                      placeholder="O escriba nombre del insumo..."
                      value={filtros.buscar_producto}
                      onChange={handleFiltroChange}
                      className="w-1/2 px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* Botones de Filtrado */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleLimpiarFiltros}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-medium transition-colors"
                >
                  Limpiar Filtros
                </button>
                <button
                  type="submit"
                  disabled={cargando}
                  className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>Filtrar Cotizaciones</span>
                </button>
              </div>
            </form>
          </div>

          {/* Tabla Cyber-Tech de Cotizaciones */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <span>Bandeja General de Cotizaciones Recibidas</span>
              </h3>
              <span className="text-xs text-slate-400">
                {cotizaciones.length} propuesta(s) encontrada(s)
              </span>
            </div>

            {cargando ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <svg className="w-8 h-8 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <p className="text-xs">Aplicando filtros y cargando propuestas...</p>
              </div>
            ) : cotizaciones.length === 0 ? (
              /* Excepción Paso 5: Mensaje exacto requerido */
              <div className="py-16 text-center text-slate-400 px-6">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto mb-3 text-slate-500">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h4 className="text-sm font-bold text-slate-200 mb-1">
                  No se encontraron cotizaciones con los criterios especificados
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Pruebe modificando los parámetros de búsqueda, limpiando los filtros o consultando por otro proveedor.
                </p>
                <button
                  type="button"
                  onClick={handleLimpiarFiltros}
                  className="mt-4 px-4 py-2 text-xs font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded-xl transition-colors"
                >
                  Restablecer Todos los Filtros
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0F172A]/70 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3">Cotización</th>
                      <th className="px-4 py-3">Solicitud</th>
                      <th className="px-5 py-3">Proveedor Emisor</th>
                      <th className="px-4 py-3 text-center">Plazo Entrega</th>
                      <th className="px-4 py-3 text-center">Vigencia</th>
                      <th className="px-5 py-3 text-right">Monto Total</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-5 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {cotizaciones.map((cot) => {
                      const vigencia = cot.fecha_validez ? getVigenciaBadge(cot.fecha_validez) : null;
                      const esPendiente = cot.estado_cotizacion === 0;

                      return (
                        <tr
                          key={cot.id_cotizacion}
                          className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                          onClick={() => handleInspeccionar(cot)}
                        >
                          {/* Cotización */}
                          <td className="px-5 py-3 font-semibold text-white">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-cyan-400">
                                #{cot.id_cotizacion}
                              </span>
                              {cot.archivo_adjunto && (
                                <span title="Posee PDF adjunto" className="text-slate-400">
                                  📎
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {cot.items?.length || 0} renglón(es) cotizado(s)
                            </div>
                          </td>

                          {/* Solicitud */}
                          <td className="px-4 py-3">
                            {cot.id_solicitud ? (
                              <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                                #{cot.id_solicitud}
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>

                          {/* Proveedor */}
                          <td className="px-5 py-3">
                            <div className="font-semibold text-white">
                              {cot.nombre_proveedor || cot.proveedor?.nombre || 'Proveedor'}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {cot.cuit_prov || cot.proveedor?.cuit || ''}
                            </div>
                          </td>

                          {/* Plazo Entrega */}
                          <td className="px-4 py-3 text-center">
                            <span className="font-semibold text-slate-200">
                              {cot.tiempo_promesa} d.
                            </span>
                          </td>

                          {/* Vigencia */}
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[11px] font-mono text-slate-300">
                                {cot.fecha_validez || '-'}
                              </span>
                              {vigencia}
                            </div>
                          </td>

                          {/* Monto Total Cotizado */}
                          <td className="px-5 py-3 text-right font-mono font-bold text-white text-sm">
                            {formatMoneda(cot.monto_total_cotizado || cot.monto_total)}
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3 text-center">
                            {cot.estado_cotizacion === 0 && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 inline-flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                Pendiente
                              </span>
                            )}
                            {cot.estado_cotizacion === 1 && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 inline-flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Aceptada
                              </span>
                            )}
                            {cot.estado_cotizacion === 2 && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300">
                                Descartada
                              </span>
                            )}
                            {cot.estado_cotizacion === 3 && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/15 border border-rose-500/30 text-rose-400">
                                Rechazada
                              </span>
                            )}
                          </td>

                          {/* Acciones */}
                          <td
                            className="px-5 py-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-2">
                              {/* Botón Inspeccionar (CU-52) */}
                              <button
                                type="button"
                                onClick={() => handleInspeccionar(cot)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs font-semibold flex items-center gap-1"
                                title="Inspeccionar detalle completo"
                              >
                                <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span>Ver</span>
                              </button>

                              {/* Acciones Rápidas de Evaluación (CU-53) solo si está Pendiente */}
                              {esPendiente && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleEvaluarRapido(cot, 'ACEPTAR')}
                                    className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white transition-colors"
                                    title="Aceptar Cotización (Convalidar Precios)"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleEvaluarRapido(cot, 'RECHAZAR')}
                                    className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white transition-colors"
                                    title="Descartar Oferta"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </>
                              )}
                            </div>
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

      {/* Modal de Inspección Detallada (CU-52) */}
      <DetalleCotizacionModal
        isOpen={modalDetalleOpen}
        onClose={() => setModalDetalleOpen(false)}
        cotizacionInicial={cotizacionSeleccionada}
        idCotizacion={cotizacionSeleccionada?.id_cotizacion}
        onCotizacionEvaluada={handleEvaluacionCompletada}
      />

      {/* Modal Rápido de Evaluación (CU-53) */}
      <EvaluarCotizacionModal
        isOpen={modalEvaluarRapidoOpen}
        onClose={() => setModalEvaluarRapidoOpen(false)}
        cotizacion={cotizacionParaEvaluar}
        modo={modoEvaluacionRapida}
        onExito={handleEvaluacionCompletada}
      />
    </div>
  );
}
