import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import { resolverUrlImagen } from '../../utils/imagenes';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Configuración visual y semántica de los estados de reparación
const ESTADOS_MAP = {
  ESPERANDO_DISPOSITIVO: { label: 'Esperando dispositivo', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  ESPERANDO_DIAGNOSTICO: { label: 'Esperando diagnóstico', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  EN_DIAGNOSTICO: { label: 'En diagnóstico', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  ESPERANDO_CONFIRMACION: { label: 'Esperando confirmación', color: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  EN_REPARACION: { label: 'En reparación', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  ESPERANDO_REPUESTOS: { label: 'Esperando repuestos', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  FINALIZADO: { label: 'Finalizado', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  ENTREGADO: { label: 'Entregado', color: 'bg-teal-500/10 text-teal-300 border-teal-500/30' },
  CANCELADO: { label: 'Cancelado', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
};

export default function AdminRepairsScreen() {
  const { token } = useAuth();

  // Estados de datos principales
  const [reparaciones, setReparaciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [toastMensaje, setToastMensaje] = useState(null);

  // Estados de filtros multicriterio dinámicos
  const [filtroClienteQuery, setFiltroClienteQuery] = useState('');
  const [filtroCodigoSec, setFiltroCodigoSec] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');

  // Debounce para inputs de texto en filtrado dinámico
  const [debouncedClienteQuery, setDebouncedClienteQuery] = useState(filtroClienteQuery);
  const [debouncedCodigoSec, setDebouncedCodigoSec] = useState(filtroCodigoSec);

  // Estado del modal de detalle de reparación
  const [reparacionSeleccionada, setReparacionSeleccionada] = useState(null);
  const [detallesReparacion, setDetallesReparacion] = useState({});
  const [cargandoDetalleId, setCargandoDetalleId] = useState(null);

  // Debounce de 300ms para evitar saturación de peticiones al escribir
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedClienteQuery(filtroClienteQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [filtroClienteQuery]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedCodigoSec(filtroCodigoSec);
    }, 300);
    return () => clearTimeout(handler);
  }, [filtroCodigoSec]);

  // Auto-ocultar alerta de error tras 15 segundos
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage('');
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Auto-ocultar toast informativo tras 15 segundos
  useEffect(() => {
    if (toastMensaje) {
      const timer = setTimeout(() => {
        setToastMensaje(null);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [toastMensaje]);

  // Cierre de modal con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setReparacionSeleccionada(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 1. Cargar categorías de reparación para alimentar el selector de filtros
  useEffect(() => {
    const cargarCategorias = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/workshop/categorias-reparacion/`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        setCategorias(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.warn('No se pudieron cargar las categorías de reparación:', err);
      }
    };
    cargarCategorias();
  }, [token]);

  // 2. Consulta y filtrado dinámico de reparaciones
  const cargarReparaciones = useCallback(async () => {
    setCargando(true);
    setErrorMessage('');

    // Validación de coherencia de fechas cronológicas
    if (filtroFechaDesde && filtroFechaHasta && filtroFechaDesde > filtroFechaHasta) {
      setErrorMessage('La fecha de inicio desde no puede ser posterior a la fecha hasta.');
      setCargando(false);
      return;
    }

    try {
      const params = {};
      if (debouncedClienteQuery.trim()) params.cliente_query = debouncedClienteQuery.trim();
      if (debouncedCodigoSec.trim()) params.codigo_seguridad = debouncedCodigoSec.trim();
      if (filtroEtapa) params.etapa = filtroEtapa;
      if (filtroCategoria) params.id_categoria = filtroCategoria;
      if (filtroFechaDesde) params.fecha_desde = filtroFechaDesde;
      if (filtroFechaHasta) params.fecha_hasta = filtroFechaHasta;

      const res = await axios.get(`${API_BASE_URL}/api/workshop/reparaciones/`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      setReparaciones(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al filtrar reparaciones:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || dataErr?.detail;
      setErrorMessage(msg || 'No fue posible cargar el listado de reparaciones.');
    } finally {
      setCargando(false);
    }
  }, [
    token,
    debouncedClienteQuery,
    debouncedCodigoSec,
    filtroEtapa,
    filtroCategoria,
    filtroFechaDesde,
    filtroFechaHasta
  ]);

  // Ejecución reactiva continua del filtrado dinámico
  useEffect(() => {
    cargarReparaciones();
  }, [cargarReparaciones]);

  // 3. Obtener radiografía completa de una reparación al seleccionarla
  const handleAbrirDetalle = async (rep) => {
    setReparacionSeleccionada(rep);

    if (detallesReparacion[rep.id_reparacion]) {
      return;
    }

    setCargandoDetalleId(rep.id_reparacion);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/workshop/reparaciones/${rep.id_reparacion}/detalles/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDetallesReparacion((prev) => ({
        ...prev,
        [rep.id_reparacion]: res.data
      }));
    } catch (err) {
      console.error('Error al consultar detalles de la reparación:', err);
      setToastMensaje({ tipo: 'error', texto: 'No se pudieron recuperar los detalles completos de la orden.' });
    } finally {
      setCargandoDetalleId(null);
    }
  };

  // 4. Limpieza de todos los filtros
  const handleLimpiarFiltros = () => {
    setFiltroClienteQuery('');
    setFiltroCodigoSec('');
    setFiltroEtapa('');
    setFiltroCategoria('');
    setFiltroFechaDesde('');
    setFiltroFechaHasta('');
  };

  const hayFiltrosActivos = Boolean(
    filtroClienteQuery ||
    filtroCodigoSec ||
    filtroEtapa ||
    filtroCategoria ||
    filtroFechaDesde ||
    filtroFechaHasta
  );

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra de Navegación Lateral */}
      <AdminSidebar activeMenu="admin-repairs" role="admin" />

      {/* Contenedor Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto relative">
        
        {/* Header Superior Cyber-Tech */}
        <header className="border-b border-slate-800 bg-[#1E293B]/85 backdrop-blur-md sticky top-0 z-30 shadow-md shadow-slate-950/20">
          <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            
            {/* Identidad y Título */}
            <div className="flex items-center gap-3">
              <img
                src={logoEmpresa}
                alt="Logo IFixPos"
                className="w-10 h-10 object-contain drop-shadow-[0_2px_10px_rgba(6,182,212,0.4)]"
              />
              <div>
                <span className="font-extrabold text-lg tracking-tight text-white">
                  IFix<span className="text-[#06B6D4]">Pos</span>
                </span>
                <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 uppercase font-mono tracking-widest hidden sm:inline-block">
                  Control de Taller
                </span>
              </div>
            </div>

            {/* Menú de Perfil */}
            <UserProfileDropdown />
          </div>
        </header>

        {/* Notificaciones y Alertas Flotantes */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className="pointer-events-auto bg-rose-950/90 text-rose-200 border border-rose-500/50 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-3 text-sm max-w-md"
              >
                <span className="text-xl">⚠️</span>
                <p className="flex-1 font-medium">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  className="text-rose-400 hover:text-rose-100 transition-colors"
                >
                  ✕
                </button>
              </motion.div>
            )}

            {toastMensaje && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className={`pointer-events-auto px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-3 text-sm max-w-md border ${
                  toastMensaje.tipo === 'error'
                    ? 'bg-rose-950/90 text-rose-200 border-rose-500/50'
                    : 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50'
                }`}
              >
                <span>{toastMensaje.tipo === 'error' ? '❌' : '✅'}</span>
                <p className="flex-1 font-medium">{toastMensaje.texto}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Contenido Central */}
        <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
          
          {/* Cabecera del Panel */}
          <section className="bg-gradient-to-r from-[#1E293B] via-slate-800/80 to-[#1E293B] p-6 rounded-2xl border border-slate-700/80 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-cyan-500/5 via-violet-500/5 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                  <span>Gestión de Reparaciones</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono font-medium">
                    {reparaciones.length} {reparaciones.length === 1 ? 'orden' : 'órdenes'}
                  </span>
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                  Monitoreo operativo de equipos, trazabilidad inmutable de bitácoras y valoraciones de servicio.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={cargarReparaciones}
                  disabled={cargando}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
                  title="Refrescar listado"
                >
                  <svg
                    className={`w-4 h-4 text-cyan-400 ${cargando ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Actualizar</span>
                </button>
              </div>
            </div>
          </section>

          {/* Bloque de Filtros Multicriterio Dinámicos */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold flex items-center gap-2">
                <span>🔍</span> Filtros Dinámicos
              </span>
              <div className="flex items-center gap-3">
                {cargando && (
                  <span className="text-[11px] font-mono text-cyan-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    Filtrando...
                  </span>
                )}
                {hayFiltrosActivos && (
                  <button
                    type="button"
                    onClick={handleLimpiarFiltros}
                    className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
                  >
                    <span>✕</span> Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
              
              {/* Búsqueda por Cliente (DNI, Nombre, Email, Teléfono) */}
              <div className="lg:col-span-4 relative">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Cliente (DNI, Nombre, Email o Teléfono)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={filtroClienteQuery}
                    onChange={(e) => setFiltroClienteQuery(e.target.value)}
                    placeholder="Ej. 30111222, Carlos, @gmail..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all"
                  />
                </div>
              </div>

              {/* Búsqueda por Código de Seguridad */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Código de Seguridad
                </label>
                <input
                  type="text"
                  value={filtroCodigoSec}
                  onChange={(e) => setFiltroCodigoSec(e.target.value)}
                  placeholder="Ej. REP-9921"
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all font-mono"
                />
              </div>

              {/* Selector de Etapa / Estado */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Etapa Operativa
                </label>
                <select
                  value={filtroEtapa}
                  onChange={(e) => setFiltroEtapa(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
                >
                  <option value="">Todas las etapas</option>
                  <option value="ESPERANDO_DISPOSITIVO">Esperando dispositivo</option>
                  <option value="ESPERANDO_DIAGNOSTICO">Esperando diagnóstico</option>
                  <option value="EN_DIAGNOSTICO">En diagnóstico</option>
                  <option value="ESPERANDO_CONFIRMACION">Esperando confirmación</option>
                  <option value="EN_REPARACION">En reparación</option>
                  <option value="ESPERANDO_REPUESTOS">Esperando repuestos</option>
                  <option value="FINALIZADO">Finalizado</option>
                  <option value="ENTREGADO">Entregado</option>
                  <option value="CANCELADO">Cancelado</option>
                </select>
              </div>

              {/* Selector de Categoría de Reparación */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Categoría de Reparación
                </label>
                <select
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
                >
                  <option value="">Todas las categorías</option>
                  {categorias.map((cat) => (
                    <option key={cat.id_categoria} value={cat.id_categoria}>
                      {cat.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fechas: Desde y Hasta */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Fecha Inicio (Desde)
                </label>
                <input
                  type="date"
                  value={filtroFechaDesde}
                  onChange={(e) => setFiltroFechaDesde(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Fecha Inicio (Hasta)
                </label>
                <input
                  type="date"
                  value={filtroFechaHasta}
                  onChange={(e) => setFiltroFechaHasta(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all"
                />
              </div>

              {/* Información y estado de filtrado dinámico */}
              <div className="lg:col-span-6 flex items-end">
                <div className="w-full py-2 px-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Filtrado reactivo en tiempo real
                  </span>
                  <span className="font-mono text-cyan-400 font-semibold">
                    {reparaciones.length} {reparaciones.length === 1 ? 'coincidencia' : 'coincidencias'}
                  </span>
                </div>
              </div>

            </div>
          </section>

          {/* Catálogo de Tarjetas en Grilla (Mismo formato con el que se muestran los dispositivos al Cliente) */}
          <section className="space-y-4">
            {cargando && reparaciones.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-80 rounded-2xl bg-[#1E293B]/60 border border-slate-800 animate-pulse" />
                ))}
              </div>
            ) : reparaciones.length === 0 ? (
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center shadow-lg">
                <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-3xl mx-auto mb-4 text-slate-500">
                  📱
                </div>
                <h3 className="text-lg font-bold text-white mb-1">
                  No se encontraron reparaciones con los criterios especificados
                </h3>
                <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto">
                  Prueba modificando los filtros aplicados o limpia los campos para visualizar todas las órdenes registradas en el sistema.
                </p>
                {hayFiltrosActivos && (
                  <button
                    type="button"
                    onClick={handleLimpiarFiltros}
                    className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 text-xs font-semibold transition-all inline-flex items-center gap-1.5"
                  >
                    Restablecer búsqueda
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <AnimatePresence>
                  {reparaciones.map((rep) => {
                    const imagen = resolverUrlImagen(rep.dispositivo?.imagen);
                    const estadoConf = ESTADOS_MAP[rep.etapa] || {
                      label: rep.etapa,
                      color: 'bg-slate-500/10 text-slate-300 border-slate-500/30'
                    };

                    // Datos del cliente requeridos estrictamente para el resumen: Solo DNI, nombre y apellido
                    const clienteNombre = rep.cliente?.nombre || '';
                    const clienteApellido = rep.cliente?.apellido || '';
                    const clienteNombreCompleto = (clienteNombre || clienteApellido)
                      ? `${clienteNombre} ${clienteApellido}`.trim()
                      : (rep.cliente?.nombre_completo || 'Cliente Registrado');
                    const clienteDni = rep.cliente?.dni || 'S/DNI';

                    return (
                      <motion.article
                        key={rep.id_reparacion}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.25 }}
                        className="group bg-[#1E293B] border border-slate-700/80 rounded-2xl overflow-hidden flex flex-col hover:border-[#8B5CF6]/60 hover:shadow-[0_0_25px_rgba(139,92,246,0.15)] transition-all"
                      >
                        {/* Contenedor Superior de Imagen con Zoom Hover */}
                        <div
                          onClick={() => handleAbrirDetalle(rep)}
                          className="h-40 bg-slate-900 flex items-center justify-center overflow-hidden cursor-pointer relative group/img"
                          title={`Ver detalles de ${rep.dispositivo?.marca} ${rep.dispositivo?.modelo}`}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              handleAbrirDetalle(rep);
                            }
                          }}
                        >
                          {imagen ? (
                            <img
                              src={imagen}
                              alt={`${rep.dispositivo?.marca} ${rep.dispositivo?.modelo}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <svg
                              className="w-14 h-14 text-slate-700"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.4}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
                              />
                            </svg>
                          )}

                          {/* Badge de Orden Flotante */}
                          <div className="absolute top-2.5 left-2.5">
                            <span className="px-2 py-0.5 rounded-lg bg-slate-950/80 backdrop-blur-md text-white font-mono text-[10px] font-bold border border-slate-700/60 shadow">
                              #{rep.id_reparacion}
                            </span>
                          </div>

                          {/* Token de Seguridad Flotante */}
                          {rep.codigo_sec && (
                            <div className="absolute top-2.5 right-2.5">
                              <span className="px-2 py-0.5 rounded-lg bg-violet-950/80 backdrop-blur-md text-violet-300 font-mono text-[10px] font-semibold border border-violet-500/40 shadow">
                                {rep.codigo_sec}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Cuerpo de la Tarjeta */}
                        <div className="p-4 flex-1 flex flex-col gap-2.5">
                          
                          {/* Badges de Tipo y Etapa Operativa */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono font-semibold uppercase">
                              {rep.dispositivo?.tipo || 'Dispositivo'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${estadoConf.color}`}
                            >
                              {estadoConf.label}
                            </span>
                          </div>

                          {/* Marca y Modelo */}
                          <h2
                            onClick={() => handleAbrirDetalle(rep)}
                            className="text-base font-bold text-[#F8FAFC] leading-tight cursor-pointer hover:text-cyan-400 transition-colors"
                          >
                            {rep.dispositivo?.marca} <span className="text-slate-300 font-semibold">{rep.dispositivo?.modelo}</span>
                          </h2>

                          {/* Número de Serie */}
                          <p className="text-[11px] font-mono text-slate-400">
                            Serie: <span className="text-slate-200">{rep.dispositivo?.numero_serie || 'S/N'}</span>
                          </p>

                          {/* Datos del Cliente: Solo DNI, Nombre y Apellido */}
                          <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800 text-xs space-y-1">
                            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold block">
                              Cliente Titular
                            </span>
                            <p className="font-semibold text-slate-200 truncate" title={clienteNombreCompleto}>
                              {clienteNombreCompleto}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400">
                              <span className="text-cyan-400 font-medium">DNI:</span> {clienteDni}
                            </p>
                          </div>

                          {/* Fechas e Información Operativa */}
                          <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between pt-1">
                            <span>Ingreso: <strong className="text-slate-300">{rep.fecha_inicio || 'S/F'}</strong></span>
                            {rep.tecnico && (
                              <span className="truncate max-w-[130px] text-slate-300" title={rep.tecnico}>
                                Téc: {rep.tecnico}
                              </span>
                            )}
                          </div>

                          {/* Footer de la Tarjeta con Botón Ver Detalles */}
                          <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-slate-700/60">
                            <button
                              type="button"
                              onClick={() => handleAbrirDetalle(rep)}
                              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all hover:shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                              title="Ver radiografía completa, bitácoras e historial"
                            >
                              <span>Ver Detalles</span>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </div>

                        </div>
                      </motion.article>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </section>

        </main>
      </div>

      {/* Modal de Detalle Integral / Radiografía de la Reparación */}
      <AnimatePresence>
        {reparacionSeleccionada && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
            {/* Backdrop Blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReparacionSeleccionada(null)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
            />

            {/* Ventana Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-4xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-auto z-10 flex flex-col max-h-[90vh]"
            >
              {/* Header del Modal */}
              <div className="p-4 sm:p-5 border-b border-slate-700/80 flex items-center justify-between gap-4 bg-slate-900/60 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl shrink-0">
                    📱
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-white">
                        Orden #{reparacionSeleccionada.id_reparacion}
                      </span>
                      {reparacionSeleccionada.codigo_sec && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30">
                          Token: {reparacionSeleccionada.codigo_sec}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          ESTADOS_MAP[reparacionSeleccionada.etapa]?.color || 'bg-slate-500/10 text-slate-300 border-slate-500/30'
                        }`}
                      >
                        {ESTADOS_MAP[reparacionSeleccionada.etapa]?.label || reparacionSeleccionada.etapa}
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">
                      {reparacionSeleccionada.dispositivo?.marca} {reparacionSeleccionada.dispositivo?.modelo}
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setReparacionSeleccionada(null)}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
                  title="Cerrar (Esc)"
                >
                  ✕
                </button>
              </div>

              {/* Contenido con Scroll */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
                {cargandoDetalleId === reparacionSeleccionada.id_reparacion && !detallesReparacion[reparacionSeleccionada.id_reparacion] ? (
                  <div className="py-16 text-center">
                    <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-slate-400 font-medium">Recuperando radiografía técnica y bitácoras...</p>
                  </div>
                ) : (
                  <>
                    {/* Fila de 3 Bloques Informativos */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      
                      {/* 1. Radiografía del Dispositivo */}
                      <div className="bg-slate-900/60 border border-slate-700/70 rounded-xl p-4 space-y-3">
                        <h3 className="text-xs uppercase font-mono tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
                          <span>📱</span> Datos del Dispositivo
                        </h3>
                        <div className="text-xs space-y-1.5">
                          <div className="flex justify-between py-1 border-b border-slate-800">
                            <span className="text-slate-400">Tipo de Equipo:</span>
                            <span className="font-medium text-slate-200">{reparacionSeleccionada.dispositivo?.tipo || 'N/D'}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-800">
                            <span className="text-slate-400">Marca y Modelo:</span>
                            <span className="font-semibold text-slate-100">{reparacionSeleccionada.dispositivo?.marca} {reparacionSeleccionada.dispositivo?.modelo}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-800">
                            <span className="text-slate-400">Nro. de Serie / IMEI:</span>
                            <span className="font-mono text-cyan-300 font-medium">{reparacionSeleccionada.dispositivo?.numero_serie || 'No registrado'}</span>
                          </div>
                          {detallesReparacion[reparacionSeleccionada.id_reparacion]?.observaciones_fisicas && (
                            <div className="pt-1">
                              <span className="text-slate-400 block mb-0.5">Estado físico al recibir:</span>
                              <p className="text-slate-300 italic bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                                {detallesReparacion[reparacionSeleccionada.id_reparacion].observaciones_fisicas}
                              </p>
                            </div>
                          )}
                          {reparacionSeleccionada.desc_cliente && (
                            <div className="pt-1">
                              <span className="text-slate-400 block mb-0.5">Problema manifestado:</span>
                              <p className="text-slate-300 italic bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                                "{reparacionSeleccionada.desc_cliente}"
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. Datos del Cliente */}
                      <div className="bg-slate-900/60 border border-slate-700/70 rounded-xl p-4 space-y-3">
                        <h3 className="text-xs uppercase font-mono tracking-wider text-violet-400 font-bold flex items-center gap-1.5">
                          <span>👤</span> Datos del Cliente
                        </h3>
                        <div className="text-xs space-y-2">
                          <div className="flex justify-between py-1 border-b border-slate-800">
                            <span className="text-slate-400">Nombre completo:</span>
                            <span className="font-semibold text-slate-200">
                              {reparacionSeleccionada.cliente?.nombre || reparacionSeleccionada.cliente?.apellido
                                ? `${reparacionSeleccionada.cliente?.nombre || ''} ${reparacionSeleccionada.cliente?.apellido || ''}`.trim()
                                : (reparacionSeleccionada.cliente?.nombre_completo || 'Cliente Registrado')}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-800">
                            <span className="text-slate-400">Documento (DNI):</span>
                            <span className="font-mono text-slate-100 font-medium">{reparacionSeleccionada.cliente?.dni || 'S/DNI'}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-800">
                            <span className="text-slate-400">Correo electrónico:</span>
                            <span className="text-slate-300 truncate max-w-[150px] font-mono" title={reparacionSeleccionada.cliente?.email}>
                              {reparacionSeleccionada.cliente?.email || 'No informado'}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-800">
                            <span className="text-slate-400">Teléfono:</span>
                            <span className="text-slate-200 font-mono">{reparacionSeleccionada.cliente?.telefono || 'Sin teléfono'}</span>
                          </div>
                        </div>
                      </div>

                      {/* 3. Diagnóstico y Técnico */}
                      <div className="bg-slate-900/60 border border-slate-700/70 rounded-xl p-4 space-y-3">
                        <h3 className="text-xs uppercase font-mono tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
                          <span>🔧</span> Diagnóstico y Técnico
                        </h3>
                        <div className="text-xs space-y-2">
                          <div className="flex justify-between py-1 border-b border-slate-800">
                            <span className="text-slate-400">Técnico responsable:</span>
                            <span className="font-medium text-slate-200">{reparacionSeleccionada.tecnico || 'Sin asignar'}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-800">
                            <span className="text-slate-400">Fecha de entrega:</span>
                            <span className="font-mono text-slate-300">{reparacionSeleccionada.fecha_entrega || 'Pendiente'}</span>
                          </div>
                          {detallesReparacion[reparacionSeleccionada.id_reparacion]?.diagnostico ? (
                            <div className="pt-1">
                              <span className="text-slate-400 block mb-0.5">Diagnóstico técnico:</span>
                              <p className="text-slate-300 bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                                {detallesReparacion[reparacionSeleccionada.id_reparacion].diagnostico.descripcion_falla}
                              </p>
                              {detallesReparacion[reparacionSeleccionada.id_reparacion].diagnostico.costo_diagnostico && (
                                <p className="text-emerald-400 font-bold mt-1.5 text-right font-mono">
                                  Presupuesto: ${Number(detallesReparacion[reparacionSeleccionada.id_reparacion].diagnostico.costo_diagnostico).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-slate-500 italic text-[11px] pt-1">
                              Aún no se ha registrado diagnóstico técnico para esta orden.
                            </p>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Calificación y Comentarios (Para Reparaciones Finalizadas) */}
                    {(reparacionSeleccionada.etapa === 'FINALIZADO' || reparacionSeleccionada.etapa === 'ENTREGADO' || detallesReparacion[reparacionSeleccionada.id_reparacion]?.calificacion) && (
                      <div className="bg-gradient-to-r from-amber-500/10 via-[#1E293B] to-slate-900/60 border border-amber-500/30 rounded-xl p-4">
                        <h3 className="text-xs uppercase font-mono tracking-wider text-amber-400 font-bold flex items-center gap-2 mb-2">
                          <span>⭐</span> Calificación y Comentarios del Cliente
                        </h3>
                        {detallesReparacion[reparacionSeleccionada.id_reparacion]?.calificacion ? (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <span
                                    key={star}
                                    className={`text-lg ${
                                      star <= detallesReparacion[reparacionSeleccionada.id_reparacion].calificacion.puntuacion
                                        ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                                        : 'text-slate-600'
                                    }`}
                                  >
                                    ★
                                  </span>
                                ))}
                                <span className="text-xs font-mono font-bold text-amber-300 ml-2">
                                  {detallesReparacion[reparacionSeleccionada.id_reparacion].calificacion.puntuacion} / 5
                                </span>
                              </div>
                              <p className="text-slate-200 text-xs italic bg-slate-950/70 p-2.5 rounded-lg border border-slate-700/60 max-w-2xl">
                                "{detallesReparacion[reparacionSeleccionada.id_reparacion].calificacion.comentario || 'El cliente calificó el servicio sin comentarios adicionales.'}"
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 font-mono block">Fecha de emisión</span>
                              <span className="text-xs text-slate-300 font-mono font-medium">
                                {detallesReparacion[reparacionSeleccionada.id_reparacion].calificacion.fecha || 'Reciente'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">
                            La orden fue completada pero el cliente aún no ha calificado el servicio recibido.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Bitácora Histórica Inmutable de la Reparación Actual */}
                    <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-4 sm:p-5 space-y-3">
                      <h3 className="text-xs uppercase font-mono tracking-wider text-cyan-400 font-bold flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span>📋</span> Bitácora Histórica de la Reparación Actual
                        </span>
                        <span className="text-[10px] font-normal text-slate-400 lowercase">
                          {detallesReparacion[reparacionSeleccionada.id_reparacion]?.bitacora?.length || 0} hitos registrados
                        </span>
                      </h3>

                      {detallesReparacion[reparacionSeleccionada.id_reparacion]?.bitacora && detallesReparacion[reparacionSeleccionada.id_reparacion].bitacora.length > 0 ? (
                        <div className="relative pl-4 sm:pl-6 border-l-2 border-slate-700 space-y-4 my-2">
                          {detallesReparacion[reparacionSeleccionada.id_reparacion].bitacora.map((b, idx) => (
                            <div key={b.id_bitacora || idx} className="relative group">
                              <div className="absolute -left-[21px] sm:-left-[29px] top-1 w-3.5 h-3.5 rounded-full bg-cyan-500 border-2 border-slate-900 shadow-md shadow-cyan-500/40" />

                              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 hover:border-slate-700 transition-colors">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                                  <span className="text-xs font-semibold text-cyan-300">
                                    {b.estado_nombre || 'Actualización de estado'}
                                  </span>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                                    <span>Responsable: <strong className="text-slate-300 font-medium">{b.tecnico || 'Técnico de Taller'}</strong></span>
                                    <span>•</span>
                                    <span>{b.fecha_hora || 'Fecha/Hora s/d'}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap">
                                  {b.comentario || 'Sin comentarios registrados.'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic py-2">
                          No hay eventos adicionales registrados en la bitácora de esta orden.
                        </p>
                      )}
                    </div>

                    {/* Historial de Otras Reparaciones Previas del Dispositivo */}
                    <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-4 sm:p-5 space-y-3">
                      <h3 className="text-xs uppercase font-mono tracking-wider text-violet-400 font-bold flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span>🗂️</span> Historial de Otras Reparaciones del Dispositivo
                        </span>
                        <span className="text-[10px] font-normal text-slate-400 lowercase">
                          {detallesReparacion[reparacionSeleccionada.id_reparacion]?.historial_reparaciones?.length || 0} previas
                        </span>
                      </h3>

                      {detallesReparacion[reparacionSeleccionada.id_reparacion]?.historial_reparaciones && detallesReparacion[reparacionSeleccionada.id_reparacion].historial_reparaciones.length > 0 ? (
                        <div className="space-y-3">
                          {detallesReparacion[reparacionSeleccionada.id_reparacion].historial_reparaciones.map((repPrevia) => (
                            <div
                              key={repPrevia.id_reparacion}
                              className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white">
                                    Orden #{repPrevia.id_reparacion}
                                  </span>
                                  {repPrevia.codigo_sec && (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                      {repPrevia.codigo_sec}
                                    </span>
                                  )}
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 border border-slate-700 font-medium">
                                    {repPrevia.etapa}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  Ingreso: {repPrevia.fecha_inicio || 'S/D'} • Entrega: {repPrevia.fecha_entrega || 'Pendiente'}
                                </div>
                              </div>

                              {repPrevia.diagnostico && (
                                <div className="text-xs">
                                  <span className="text-slate-400 font-medium">Diagnóstico: </span>
                                  <span className="text-slate-300">{repPrevia.diagnostico.descripcion_falla}</span>
                                </div>
                              )}

                              {repPrevia.calificacion && (
                                <div className="text-xs flex items-center gap-2 bg-amber-500/5 p-2 rounded-lg border border-amber-500/20">
                                  <span className="text-amber-400 font-bold">
                                    ★ {repPrevia.calificacion.puntuacion}/5
                                  </span>
                                  <span className="text-slate-300 italic">
                                    "{repPrevia.calificacion.comentario || 'Sin comentario'}"
                                  </span>
                                </div>
                              )}

                              {repPrevia.bitacoras && repPrevia.bitacoras.length > 0 && (
                                <details className="text-xs text-slate-400 pt-1">
                                  <summary className="cursor-pointer hover:text-cyan-400 transition-colors font-medium">
                                    Ver bitácoras ({repPrevia.bitacoras.length})
                                  </summary>
                                  <div className="mt-2 space-y-1.5 pl-3 border-l border-slate-700">
                                    {repPrevia.bitacoras.map((bp, bidx) => (
                                      <div key={bidx} className="text-[11px]">
                                        <span className="text-cyan-300 font-medium">{bp.estado_nombre || bp.estado_alcanzado}</span>
                                        {' - '}
                                        <span className="text-slate-300">{bp.comentario}</span>
                                        <span className="text-slate-500 ml-1">({bp.fecha_hora})</span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic py-2">
                          Este equipo no posee historial previo de reparaciones finalizadas en el taller.
                        </p>
                      )}
                    </div>

                  </>
                )}
              </div>

              {/* Footer del Modal */}
              <div className="p-4 border-t border-slate-700/80 bg-slate-900/60 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setReparacionSeleccionada(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
                >
                  Cerrar Radiografía
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
