import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import DispositivoModal from '../../components/devices/DispositivoModal';
import IniciarReparacionModal from '../../components/devices/IniciarReparacionModal';
import DevicePlaceholder from '../../components/common/DevicePlaceholder';
import Paginacion from '../../components/common/Paginacion';
import { EsqueletoTarjetas } from '../../components/common/EsqueletoCarga';
import { resolverUrlImagen } from '../../utils/imagenes';
import { formatearEstadoReparacion, obtenerColorBadgeEstado } from '../../utils/repairStatus';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

import { API_BASE_URL } from '../../config/api';

const ETAPAS_CERRADAS = new Set([
  'FINALIZADO',
  'FINALIZADA',
  'ENTREGADO',
  'ENTREGADA',
  'CANCELADO',
  'CANCELADA'
]);

const obtenerEtapaActivaDispositivo = (dispositivo) => {
  if (dispositivo?.etapa_reparacion_activa) {
    return dispositivo.etapa_reparacion_activa;
  }
  if (Array.isArray(dispositivo?.reparaciones)) {
    const activa = dispositivo.reparaciones.find((r) => {
      const etapa = String(r?.etapa || '').trim().toUpperCase();
      return etapa && !ETAPAS_CERRADAS.has(etapa);
    });
    return activa?.etapa || null;
  }
  return null;
};
const FILTER_CLASS =
  'w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-[#F8FAFC] placeholder-slate-500 text-xs font-medium transition-all duration-200 focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)] disabled:opacity-50 disabled:cursor-not-allowed';

export default function MisDispositivos() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [dispositivos, setDispositivos] = useState([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const TAMANO_PAGINA = 12;
  const [recarga, setRecarga] = useState(0);

  // Filtros (CU-34)
  const [busqueda, setBusqueda] = useState('');
  const [filtrosAplicados, setFiltrosAplicados] = useState(false);
  const [marcaFiltro, setMarcaFiltro] = useState('');
  const [modeloFiltro, setModeloFiltro] = useState('');
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);

  // Modales
  const [modalAbierto, setModalAbierto] = useState(false);
  const [dispositivoEnEdicion, setDispositivoEnEdicion] = useState(null);
  const [aperturaId, setAperturaId] = useState(0);

  const [modalReparacionAbierto, setModalReparacionAbierto] = useState(false);
  const [dispositivoParaReparar, setDispositivoParaReparar] = useState(null);

  // Feedback
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Las alertas desaparecen solas (error: 6 s, éxito: 6 s)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const t = setTimeout(() => setErrorMessage(''), 6000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const t = setTimeout(() => setSuccessMessage(''), 6000);
    return () => clearTimeout(t);
  }, [successMessage]);

  // Catálogo de marcas para el filtro
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/api/workshop/marcas/`)
      .then((res) => setMarcas(Array.isArray(res.data) ? res.data : []))
      .catch(() => setErrorMessage('No fue posible cargar las marcas para el filtro.'));
  }, []);

  // Cascada del filtro: al cambiar la marca se reinicia el modelo y se cargan sus modelos
  const handleMarcaFiltroChange = (e) => {
    const idMarca = e.target.value;
    setMarcaFiltro(idMarca);
    setModeloFiltro('');
    setModelos([]);
    if (!idMarca) return;
    axios
      .get(`${API_BASE_URL}/api/workshop/marcas/${idMarca}/modelos/`)
      .then((res) => setModelos(Array.isArray(res.data) ? res.data : []))
      .catch(() => setErrorMessage('No fue posible cargar los modelos de la marca.'));
  };

  // Función manual de consulta de dispositivos (CU-34)
  const [cargandoDispositivos, setCargandoDispositivos] = useState(false);

  const consultarDispositivos = useCallback(
    async (paramsOverride = null) => {
      if (!token) return;
      setCargandoDispositivos(true);
      const bVal = paramsOverride ? paramsOverride.buscar : busqueda.trim();
      const mVal = paramsOverride ? paramsOverride.marca : marcaFiltro;
      const modVal = paramsOverride ? paramsOverride.modelo : modeloFiltro;

      const params = {};
      if (bVal) params.buscar = bVal;
      if (mVal) params.marca = mVal;
      if (modVal) params.modelo = modVal;

      try {
        const res = await axios.get(`${API_BASE_URL}/api/workshop/mis-dispositivos/`, {
          params,
          headers: { Authorization: `Bearer ${token}` }
        });
        const lista = Array.isArray(res.data)
          ? res.data
          : res.data?.results || res.data?.resultados || [];
        setDispositivos(lista);
        setFiltrosAplicados(Boolean(bVal || mVal || modVal));
        setPaginaActual(1);
      } catch (err) {
        console.error('Error al cargar dispositivos:', err);
        const data = err.response?.data;
        const detalle = Array.isArray(data) ? data.join(' ') : data?.detail || data?.error;
        setErrorMessage(
          typeof detalle === 'string' ? detalle : 'No fue posible cargar tus dispositivos. Intenta nuevamente.'
        );
      } finally {
        setCargandoDispositivos(false);
      }
    },
    [token, busqueda, marcaFiltro, modeloFiltro]
  );

  // Carga inicial al montar o tras guardar un dispositivo
  useEffect(() => {
    if (!token) return undefined;
    let activo = true;

    Promise.resolve().then(() => {
      if (activo) setCargandoDispositivos(true);
    });

    axios
      .get(`${API_BASE_URL}/api/workshop/mis-dispositivos/`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (!activo) return;
        const lista = Array.isArray(res.data)
          ? res.data
          : res.data?.results || res.data?.resultados || [];
        setDispositivos(lista);
        setFiltrosAplicados(false);
        setPaginaActual(1);
      })
      .catch((err) => {
        if (!activo) return;
        console.error('Error al cargar dispositivos:', err);
        const data = err.response?.data;
        const detalle = Array.isArray(data) ? data.join(' ') : data?.detail || data?.error;
        setErrorMessage(
          typeof detalle === 'string' ? detalle : 'No fue posible cargar tus dispositivos. Intenta nuevamente.'
        );
      })
      .finally(() => {
        if (activo) setCargandoDispositivos(false);
      });

    return () => {
      activo = false;
    };
  }, [token, recarga]);

  const abrirCreacion = () => {
    setDispositivoEnEdicion(null);
    setAperturaId((n) => n + 1);
    setModalAbierto(true);
  };

  const abrirEdicion = (dispositivo) => {
    if (!dispositivo.editable) {
      setErrorMessage('La edición está prohibida: el dispositivo ya posee historial técnico o se encuentra en proceso de reparación.');
      return;
    }
    setDispositivoEnEdicion(dispositivo);
    setAperturaId((n) => n + 1);
    setModalAbierto(true);
  };

  const cerrarModal = () => setModalAbierto(false);

  const handleGuardado = (mensaje) => {
    setSuccessMessage(mensaje);
    setRecarga((n) => n + 1);
  };

  const handleEliminar = () => {
    // El backend aún no expone un endpoint de baja de dispositivos.
    setErrorMessage('La eliminación de dispositivos aún no está disponible.');
  };

  const hayFiltros = filtrosAplicados;

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F8FAFC] font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      <AdminSidebar activeMenu="client-devices-list" />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-16 border-b border-slate-800 bg-[#1E293B]/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <img
              src={logoEmpresa}
              alt="Logo IFixPos"
              className="w-8 h-8 object-contain drop-shadow-[0_2px_8px_rgba(6,182,212,0.4)]"
            />
            <span className="text-xs font-mono text-cyan-400 font-semibold">Mis Dispositivos</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/tienda')}
              className="px-3.5 py-1.5 rounded-lg border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors"
            >
              Volver
            </button>
            <UserProfileDropdown align="right" />
          </div>
        </header>

        <main className="flex-1 p-6 sm:p-10 max-w-6xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-6"
          >
            {/* Cabecera */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#F8FAFC]">Mis Dispositivos</h1>
                <p className="text-sm text-slate-400 mt-1">
                  Administra los equipos asociados a tu cuenta.
                </p>
              </div>
              <button
                type="button"
                onClick={abrirCreacion}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-sm font-bold transition-all shadow-[0_0_18px_rgba(6,182,212,0.35)] hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                </svg>
                Nuevo Dispositivo
              </button>
            </div>

            {/* Alertas Flotantes Cyber-Tech en esquina inferior izquierda (Fixed, Zero CLS) */}
            <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2 pointer-events-none max-w-md">
              <AnimatePresence>
                {errorMessage && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 15, scale: 0.95 }}
                    transition={{ duration: 0.25 }}
                    role="alert"
                    className="pointer-events-auto p-4 rounded-2xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs sm:text-sm font-medium flex items-center justify-between shadow-2xl backdrop-blur-md"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-rose-400 text-base">⚠️</span>
                      <span className="leading-relaxed">{errorMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setErrorMessage('')}
                      className="text-rose-400 hover:text-rose-200 p-1 ml-2 text-xs font-mono"
                      aria-label="Cerrar error"
                    >
                      ✕
                    </button>
                  </motion.div>
                )}
                {successMessage && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 15, scale: 0.95 }}
                    transition={{ duration: 0.25 }}
                    className="pointer-events-auto p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs sm:text-sm font-medium flex items-center justify-between shadow-2xl backdrop-blur-md"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-emerald-400 text-base">⚡</span>
                      <span className="leading-relaxed">{successMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSuccessMessage('')}
                      className="text-emerald-400 hover:text-emerald-200 p-1 ml-2 text-xs font-mono"
                      aria-label="Cerrar éxito"
                    >
                      ✕
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Barra de filtros (CU-34) con envío manual */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                consultarDispositivos();
              }}
              className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-center"
            >
              <div className="relative md:col-span-4">
                <svg
                  className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
                </svg>
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por marca o modelo..."
                  maxLength={100}
                  aria-label="Buscar dispositivos"
                  className={`${FILTER_CLASS} pl-10`}
                />
              </div>
              <div className="md:col-span-3">
                <select
                  value={marcaFiltro}
                  onChange={handleMarcaFiltroChange}
                  aria-label="Filtrar por marca"
                  className={FILTER_CLASS}
                >
                  <option value="">Todas las marcas</option>
                  {marcas.map((m) => (
                    <option key={m.id_marca} value={m.id_marca}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3">
                <select
                  value={modeloFiltro}
                  onChange={(e) => setModeloFiltro(e.target.value)}
                  disabled={!marcaFiltro}
                  aria-label="Filtrar por modelo"
                  className={FILTER_CLASS}
                >
                  <option value="">{marcaFiltro ? 'Todos los modelos' : 'Elige una marca primero'}</option>
                  {modelos.map((m) => (
                    <option key={m.id_modelo} value={m.id_modelo}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={cargandoDispositivos}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 font-mono"
                >
                  {cargandoDispositivos ? '...' : '⚡ Filtrar'}
                </button>
              </div>
            </form>

            {/* Grilla */}
            {cargandoDispositivos ? (
              <EsqueletoTarjetas cantidad={6} />
            ) : dispositivos.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16 bg-[#1E293B]/50 border border-dashed border-slate-700 rounded-2xl"
              >
                <p className="text-slate-200 font-semibold">
                  {hayFiltros ? 'No se encontraron resultados' : 'Aún no tienes dispositivos registrados'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {hayFiltros
                    ? 'Prueba con otros criterios de búsqueda.'
                    : 'Registra tu primer equipo con el botón "Nuevo Dispositivo".'}
                </p>
              </motion.div>
            ) : (
              <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <AnimatePresence>
                  {dispositivos
                    .slice((paginaActual - 1) * TAMANO_PAGINA, paginaActual * TAMANO_PAGINA)
                    .map((d) => {
                    const imagen = resolverUrlImagen(d.imagen);
                    const etapaActiva = obtenerEtapaActivaDispositivo(d);
                    return (
                      <motion.article
                        key={d.id_dispositivo}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.25 }}
                        className="group bg-[#1E293B] border border-slate-700/80 rounded-2xl overflow-hidden flex flex-col hover:border-[#8B5CF6]/60 hover:shadow-[0_0_25px_rgba(139,92,246,0.15)] transition-all"
                      >
                        <div
                          onClick={() => navigate(`/cliente/dispositivos/${d.id_dispositivo}`)}
                          className="h-40 bg-slate-900 flex items-center justify-center overflow-hidden cursor-pointer relative group/img"
                          title={`Ver detalles de ${d.marca} ${d.modelo}`}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              navigate(`/cliente/dispositivos/${d.id_dispositivo}`);
                            }
                          }}
                        >
                          {imagen ? (
                            <img
                              src={imagen}
                              alt={`${d.marca} ${d.modelo}`}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (<DevicePlaceholder tipo={d.tipo} className="w-16 h-16" />
                          )}
                        </div>

                        <div className="p-4 flex-1 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono font-semibold uppercase">
                              {d.tipo || 'Sin tipo'}
                            </span>
                            {etapaActiva && (
                              <span
                                title={`Estado actual de la reparación: ${formatearEstadoReparacion(etapaActiva)}`}
                                className={`px-2 py-0.5 rounded-full border text-[10px] font-mono font-semibold ${obtenerColorBadgeEstado(etapaActiva)}`}
                              >
                                {formatearEstadoReparacion(etapaActiva)}
                              </span>
                            )}
                          </div>
                          <h2
                            onClick={() => navigate(`/cliente/dispositivos/${d.id_dispositivo}`)}
                            className="text-base font-bold text-[#F8FAFC] leading-tight cursor-pointer hover:text-cyan-400 transition-colors"
                          >
                            {d.marca} <span className="text-slate-300 font-semibold">{d.modelo}</span>
                          </h2>
                          <p className="text-[11px] font-mono text-slate-400">
                            N. Serie: <span className="text-slate-200">{d.numero_serie || 'Sin registrar'}</span>
                          </p>

                          <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-slate-700/60">
                            <button
                              type="button"
                              onClick={() => navigate(`/cliente/dispositivos/${d.id_dispositivo}`)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all hover:shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                              title="Ver Ficha Técnica e Historial"
                            >
                              <span>Ver Detalles</span>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setDispositivoParaReparar(d);
                                  setModalReparacionAbierto(true);
                                }}
                                aria-label={`Iniciar Reparación para ${d.marca} ${d.modelo}`}
                                title="Iniciar Reparación"
                                className="w-9 h-9 flex items-center justify-center rounded-lg bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 transition-all hover:shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233l2.844-2.844a2.25 2.25 0 000-3.182l-.84-.84a2.25 2.25 0 00-3.182 0l-2.844 2.844m4.022 4.022l-4.022-4.022" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => abrirEdicion(d)}
                                disabled={!d.editable}
                                aria-label={`Editar ${d.marca} ${d.modelo}`}
                                title={
                                  d.editable
                                    ? `Editar ${d.marca} ${d.modelo}`
                                    : 'Edición prohibida: el equipo posee historial técnico o se encuentra en proceso de reparación'
                                }
                                className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all ${
                                  d.editable
                                    ? 'bg-slate-800 hover:bg-[#8B5CF6]/20 text-slate-300 hover:text-[#C4B5FD] border-slate-700 hover:border-[#8B5CF6]/50 cursor-pointer shadow-sm'
                                    : 'bg-slate-900/60 text-slate-600 border-slate-800/80 cursor-not-allowed opacity-40'
                                }`}
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
                                  />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={handleEliminar}
                                aria-label={`Eliminar ${d.marca} ${d.modelo}`}
                                title="Eliminar"
                                className="w-9 h-9 flex items-center justify-center rounded-lg bg-orange-300/10 hover:bg-orange-300/20 text-orange-300 border border-orange-300/30 transition-all"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </AnimatePresence>
              </div>
              <Paginacion
                paginaActual={paginaActual}
                totalPaginas={Math.ceil(dispositivos.length / TAMANO_PAGINA)}
                totalRegistros={dispositivos.length}
                tamanoPagina={TAMANO_PAGINA}
                onCambiarPagina={setPaginaActual}
              />
              </>
            )}
          </motion.div>
        </main>
      </div>

      <DispositivoModal
        key={aperturaId}
        isOpen={modalAbierto}
        onClose={cerrarModal}
        dispositivoData={dispositivoEnEdicion}
        onSaved={handleGuardado}
      />

      <IniciarReparacionModal
        isOpen={modalReparacionAbierto}
        onClose={() => {
          setModalReparacionAbierto(false);
          setDispositivoParaReparar(null);
        }}
        dispositivo={dispositivoParaReparar}
        onSuccess={(resultado) => {
          setSuccessMessage(
            `¡Reparación iniciada con éxito! Su solicitud ha sido registrada. Código para presentar en mostrador: ${resultado?.codigo_seguridad}`
          );
          setRecarga((n) => n + 1);
        }}
      />
    </div>
  );
}

