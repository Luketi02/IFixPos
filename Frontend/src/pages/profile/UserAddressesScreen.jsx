import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { getDashboardPath } from '../../utils/roleRoutes';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import DireccionModal from '../../components/geo/DireccionModal';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function UserAddressesScreen() {
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [direcciones, setDirecciones] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  // Estados del modal
  const [modalAbierto, setModalAbierto] = useState(false);
  const [direccionEnEdicion, setDireccionEnEdicion] = useState(null);

  // Feedback visual
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Auto-ocultar alertas según reglas del proyecto (Error: 6s, Éxito: 5s)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const t = setTimeout(() => setErrorMessage(''), 15000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const t = setTimeout(() => setSuccessMessage(''), 15000);
    return () => clearTimeout(t);
  }, [successMessage]);

  // Cargar lista de direcciones
  const cargarDirecciones = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/geo/mis-direcciones/?todas=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = Array.isArray(response.data) ? response.data : response.data?.resultados || [];
      setDirecciones(data);
    } catch (err) {
      console.error('Error al cargar direcciones:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || dataErr?.detail;
      setErrorMessage(msg || 'No fue posible cargar tus direcciones. Intenta nuevamente.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    cargarDirecciones();
  }, [cargarDirecciones]);

  // Abrir Modal en Modo Crear
  const abrirCreacion = () => {
    setDireccionEnEdicion(null);
    setModalAbierto(true);
  };

  // Abrir Modal en Modo Edición
  const abrirEdicion = (direccion) => {
    setDireccionEnEdicion(direccion);
    setModalAbierto(true);
  };

  // Cerrar Modal
  const cerrarModal = () => {
    setModalAbierto(false);
    setDireccionEnEdicion(null);
  };

  // Callback cuando se guarda exitosamente
  const handleGuardado = (mensaje) => {
    setSuccessMessage(mensaje || 'Dirección guardada con éxito.');
    cargarDirecciones();
  };

  // Conmutar estado de dirección (Activar / Desactivar - Soft Delete)
  const handleToggleEstado = async (idDireccion, estadoActual) => {
    setTogglingId(idDireccion);
    setErrorMessage('');
    try {
      const res = await axios.patch(
        `${API_BASE_URL}/api/geo/mis-direcciones/${idDireccion}/`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const nuevoEstado = res.data?.nuevo_estado !== undefined ? res.data.nuevo_estado : !estadoActual;
      const accionTexto = nuevoEstado ? 'activada' : 'desactivada';
      setSuccessMessage(`Dirección ${accionTexto} con éxito.`);

      // Actualizar estado local inmediatamente para respuesta instantánea
      setDirecciones((prev) =>
        prev.map((d) => (d.id_direccion === idDireccion ? { ...d, is_active: nuevoEstado } : d))
      );
    } catch (err) {
      console.error('Error al alternar estado de dirección:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || dataErr?.detail;
      setErrorMessage(msg || 'No fue posible cambiar el estado de la dirección.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleBack = () => {
    navigate(getDashboardPath(user?.rol));
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F8FAFC] font-sans flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Header Superior Cyber-Tech */}
      <header className="border-b border-slate-800 bg-[#1E293B]/85 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800/80 border border-transparent hover:border-slate-700 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver a mi Panel</span>
            </button>

            <div className="hidden sm:flex items-center gap-2 border-l border-slate-700/60 pl-4">
              <img
                src={logoEmpresa}
                alt="Logo IFixPos"
                className="w-7 h-7 object-contain drop-shadow-[0_2px_8px_rgba(6,182,212,0.4)]"
              />
              <span className="text-xs font-mono text-cyan-400 uppercase font-semibold tracking-wider">
                Libreta de Direcciones
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <UserProfileDropdown align="right" />
          </div>
        </div>
      </header>

      {/* Toast Flotante de Éxito */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="fixed top-20 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-900/95 border border-emerald-500/60 shadow-[0_10px_35px_rgba(16,185,129,0.3)] text-white backdrop-blur-xl"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-lg font-bold">
              ✓
            </div>
            <div>
              <p className="text-sm font-bold text-white tracking-tight">Operación Exitosa</p>
              <p className="text-xs text-emerald-300 font-mono">{successMessage}</p>
            </div>
            <button
              onClick={() => setSuccessMessage('')}
              className="text-slate-400 hover:text-white text-xs ml-2 font-mono"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 w-full space-y-6">
        
        {/* Barra de Navegación de Cuenta (Pestañas Rápidas) */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-[#1E293B]/70 border border-slate-800 shadow-md">
          <button
            type="button"
            onClick={() => navigate('/editar-perfil')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Editar Perfil</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/perfil/preferencias')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Preferencias de Usuario</span>
          </button>

          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-500/15 border border-cyan-500/40 shadow-sm shadow-cyan-950/40 cursor-default"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Libreta de Direcciones</span>
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-6"
        >
          {/* Cabecera de la Sección */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <span className="inline-block px-3 py-1 rounded-full bg-violet-500/10 text-violet-300 text-xs font-mono border border-violet-500/30 mb-2">
                Gestión Territorial & Logística
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#F8FAFC]">
                Mis Direcciones
              </h1>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                Administra tus domicilios físicos para recepción de repuestos, envíos de órdenes de reparación y facturación oficial.
              </p>
            </div>

            <div className="relative z-10 shrink-0">
              <button
                type="button"
                onClick={abrirCreacion}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-sm font-bold transition-all shadow-[0_0_18px_rgba(6,182,212,0.35)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                </svg>
                <span>Nueva Dirección</span>
              </button>
            </div>

            <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 bg-gradient-to-br from-cyan-500/15 to-violet-600/15 rounded-full blur-3xl pointer-events-none" />
          </div>

          {/* Alertas Suaves de Notificación */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                role="alert"
                className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3 shadow-lg"
              >
                <span className="text-base">⚠️</span>
                <span className="flex-1">{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  className="text-rose-400 hover:text-rose-200 text-xs font-mono"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Grilla de Direcciones */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-56 rounded-2xl bg-[#1E293B]/60 border border-slate-800 animate-pulse p-6 space-y-4"
                >
                  <div className="h-5 bg-slate-700/50 rounded-md w-1/2" />
                  <div className="h-4 bg-slate-700/40 rounded-md w-3/4" />
                  <div className="h-4 bg-slate-700/30 rounded-md w-2/3" />
                  <div className="h-8 bg-slate-700/20 rounded-xl mt-6" />
                </div>
              ))}
            </div>
          ) : direcciones.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 bg-[#1E293B]/50 border border-dashed border-slate-700/80 rounded-2xl space-y-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mx-auto">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-base font-bold text-slate-200">
                Aún no tienes direcciones registradas
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Registra tu primer domicilio para asociarlo a tus compras, presupuestos y órdenes de taller.
              </p>
              <button
                type="button"
                onClick={abrirCreacion}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-all cursor-pointer"
              >
                <span>+ Agregar Primera Dirección</span>
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <AnimatePresence>
                {direcciones.map((dir) => {
                  // Extracción de datos geográficos anidados
                  const ciudadNombre = dir.ciudad_info?.nombre || dir.ciudad_detalle?.nombre || dir.ciudad || 'Ciudad';
                  const provinciaNombre = dir.ciudad_info?.provincia?.nombre || dir.ciudad_detalle?.provincia?.nombre || dir.provincia || 'Provincia';
                  const paisNombre = dir.ciudad_info?.provincia?.pais?.nombre || dir.ciudad_detalle?.provincia?.pais?.nombre || dir.pais || 'País';
                  const calleNumero = dir.nro_calle || dir.calle_numero || 'Sin calle';
                  const barrio = dir.nombre_barrio || dir.barrio || '';
                  const pisoDpto = [
                    dir.piso ? `Piso ${dir.piso}` : null,
                    dir.nro_dpto ? `Dpto ${dir.nro_dpto}` : null
                  ].filter(Boolean).join(' • ');

                  const isTogglingThis = togglingId === dir.id_direccion;

                  return (
                    <motion.article
                      key={dir.id_direccion}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.25 }}
                      className={`group bg-[#1E293B] border rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ${
                        dir.is_active
                          ? 'border-slate-700/80 hover:border-[#8B5CF6]/60 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]'
                          : 'border-slate-800 opacity-75 hover:opacity-100 bg-[#1A2333]'
                      }`}
                    >
                      {/* Cabecera de Tarjeta: Alias y Badge de Estado */}
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0 flex-1">
                            <h2 className="text-base font-bold text-[#F8FAFC] truncate tracking-tight" title={dir.alias || 'Dirección'}>
                              {dir.alias || 'Dirección Personal'}
                            </h2>
                          </div>

                          {/* Badge visual de estado */}
                          <div>
                            {dir.is_active ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Activa
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                Inactiva
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Detalle del Domicilio */}
                        <div className="space-y-2 text-xs">
                          {/* Calle y Número */}
                          <div className="flex items-start gap-2 text-slate-200 font-semibold">
                            <svg className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            <span className="truncate">{calleNumero}</span>
                          </div>

                          {/* Piso / Dpto y Barrio */}
                          <div className="pl-6 space-y-0.5 text-slate-400">
                            {pisoDpto && <p className="font-mono text-[11px] text-slate-300">{pisoDpto}</p>}
                            {barrio && <p className="text-[11px]">Barrio {barrio}</p>}
                          </div>

                          {/* Ciudad, Provincia y País (Jerarquía Geográfica Anidada) */}
                          <div className="flex items-start gap-2 pt-2 border-t border-slate-700/50 text-cyan-300 font-medium">
                            <svg className="w-4 h-4 text-[#8B5CF6] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="truncate text-xs">
                              {ciudadNombre}, {provinciaNombre}, {paisNombre}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Acciones de la Tarjeta */}
                      <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-slate-700/60">
                        {/* Botón Editar (Ícono de Lápiz) */}
                        <button
                          type="button"
                          onClick={() => abrirEdicion(dir)}
                          aria-label={`Editar dirección ${dir.alias || dir.id_direccion}`}
                          title="Editar Dirección"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-[#8B5CF6]/20 text-slate-300 hover:text-[#C4B5FD] border border-slate-700 hover:border-[#8B5CF6]/50 text-xs font-semibold transition-all cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                          </svg>
                          <span>Editar</span>
                        </button>

                        {/* Botón Activar / Desactivar (Ícono de Ojo / Switch - Soft Delete) */}
                        <button
                          type="button"
                          onClick={() => handleToggleEstado(dir.id_direccion, dir.is_active)}
                          disabled={isTogglingThis}
                          aria-label={dir.is_active ? 'Desactivar dirección' : 'Activar dirección'}
                          title={dir.is_active ? 'Desactivar dirección (Soft-Delete)' : 'Reactivar dirección'}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                            dir.is_active
                              ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30 hover:border-rose-500/50'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:border-emerald-500/50'
                          }`}
                        >
                          {isTogglingThis ? (
                            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : dir.is_active ? (
                            // Ícono de Ojo / Desactivar
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                            </svg>
                          ) : (
                            // Ícono de Ojo / Activar
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                          <span>{dir.is_active ? 'Desactivar' : 'Activar'}</span>
                        </button>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </main>

      {/* Modal Inteligente de Direcciones (Crear / Editar) */}
      <DireccionModal
        isOpen={modalAbierto}
        onClose={cerrarModal}
        direccionData={direccionEnEdicion}
        onSaved={handleGuardado}
      />

    </div>
  );
}
