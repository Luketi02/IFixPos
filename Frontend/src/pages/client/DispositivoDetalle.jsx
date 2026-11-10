import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import { resolverUrlImagen } from '../../utils/imagenes';
import { formatearFecha } from '../../utils/fechas';
import { formatearEstadoReparacion } from '../../utils/repairStatus';
import IniciarReparacionModal from '../../components/devices/IniciarReparacionModal';
import CalificarServicioModal from '../../components/workshop/CalificarServicioModal';
import CapsulaGuiaReparacion from '../../components/devices/CapsulaGuiaReparacion';
import DevicePlaceholder from '../../components/common/DevicePlaceholder';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

import { API_BASE_URL } from '../../config/api';
export default function DispositivoDetalle() {
  const { id_dispositivo } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [dispositivo, setDispositivo] = useState(null);
  const [cargadoId, setCargadoId] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [modalReparacionAbierto, setModalReparacionAbierto] = useState(false);
  const [modalCalificarAbierto, setModalCalificarAbierto] = useState(false);
  const [reparacionACalificar, setReparacionACalificar] = useState(null);
  const [bitacoraActivaAbierta, setBitacoraActivaAbierta] = useState(true);
  const [reparacionHistorialBitacoraAbierta, setReparacionHistorialBitacoraAbierta] = useState({});

  const isLoading = cargadoId !== `${id_dispositivo}-${recarga}`;

  // Auto-ocultamiento de errores a los 15 segundos
  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(''), 15000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  // Auto-ocultamiento de mensajes de éxito a los 15 segundos
  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = setTimeout(() => setSuccessMessage(''), 15000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    let activo = true;

    axios
      .get(`${API_BASE_URL}/api/workshop/dispositivos/${id_dispositivo}/detalles/`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (!activo) return;
        setDispositivo(res.data);
      })
      .catch((err) => {
        if (!activo) return;
        console.error('Error al consultar detalles del dispositivo:', err);
        const status = err.response?.status;
        const data = err.response?.data;
        const msg = data?.detail || data?.error || (Array.isArray(data) ? data.join(' ') : null);

        if (status === 404) {
          setErrorMessage('Dispositivo no encontrado. Verifica el identificador del equipo.');
        } else if (status === 403) {
          setErrorMessage(msg || 'Acceso Denegado: No posees permisos para consultar este equipo.');
        } else {
          setErrorMessage(msg || 'No fue posible cargar los detalles del dispositivo.');
        }
      })
      .finally(() => {
        if (activo) setCargadoId(`${id_dispositivo}-${recarga}`);
      });

    return () => {
      activo = false;
    };
  }, [id_dispositivo, token, recarga]);

  const imagenUrl = resolverUrlImagen(dispositivo?.imagen);

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F8FAFC] font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      <AdminSidebar activeMenu="client-devices-list" />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header Superior */}
        <header className="h-16 border-b border-slate-800 bg-[#1E293B]/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <img
              src={logoEmpresa}
              alt="Logo IFixPos"
              className="w-8 h-8 object-contain drop-shadow-[0_2px_8px_rgba(6,182,212,0.4)]"
            />
            <div className="flex items-center gap-2 text-xs font-mono">
              <Link to="/cliente/dispositivos" className="text-slate-400 hover:text-cyan-400 transition-colors">
                Mis Dispositivos
              </Link>
              <span className="text-slate-600">/</span>
              <span className="text-cyan-400 font-semibold truncate max-w-[160px] sm:max-w-xs">
                {dispositivo ? `${dispositivo.marca} ${dispositivo.modelo}` : 'Detalles'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <UserProfileDropdown align="right" />
          </div>
        </header>

        <main className="flex-1 p-6 sm:p-10 max-w-5xl mx-auto w-full">
          {/* Botón Volver sutil */}
          <div className="mb-6">
            <Link
              to="/cliente/dispositivos"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#94A3B8] hover:text-[#06B6D4] transition-colors group"
            >
              <svg
                className="w-4 h-4 transition-transform group-hover:-translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver a Mis Dispositivos
            </Link>
          </div>

          {/* Alertas de Feedback */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                role="alert"
                className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3 shadow-lg shadow-rose-950/20"
              >
                <span className="text-rose-400 font-bold mt-0.5">!</span>
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

            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                role="status"
                className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-start gap-3 shadow-lg shadow-emerald-950/20"
              >
                <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                <span className="flex-1">{successMessage}</span>
                <button
                  type="button"
                  onClick={() => setSuccessMessage('')}
                  className="text-emerald-400 hover:text-emerald-200 text-xs font-mono"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Estado de Carga: Skeleton Cyber-Tech */}
          {isLoading ? (
            <div className="space-y-6">
              {/* Skeleton Ficha */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row gap-6 animate-pulse">
                <div className="w-36 h-36 rounded-2xl bg-slate-900 shrink-0" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-slate-800 rounded w-1/4" />
                  <div className="h-8 bg-slate-800 rounded w-2/3" />
                  <div className="h-4 bg-slate-800 rounded w-1/2" />
                  <div className="h-4 bg-slate-800 rounded w-1/3" />
                </div>
              </div>
              {/* Skeleton Secciones */}
              <div className="h-48 rounded-2xl bg-[#1E293B]/70 border border-slate-800 animate-pulse" />
              <div className="h-64 rounded-2xl bg-[#1E293B]/70 border border-slate-800 animate-pulse" />
            </div>
          ) : !dispositivo ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 bg-[#1E293B]/50 border border-dashed border-slate-700 rounded-2xl"
            >
              <p className="text-slate-200 font-semibold">No se pudo cargar la información del equipo.</p>
              <button
                type="button"
                onClick={() => navigate('/cliente/dispositivos')}
                className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-cyan-400 border border-slate-700 font-semibold transition-colors"
              >
                Regresar al listado
              </button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="space-y-6"
            >
              {/* 1. FICHA TÉCNICA (Tarjeta Superior) */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  {/* Foto del Equipo */}
                  <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                    {imagenUrl ? (
                      <img
                        src={imagenUrl}
                        alt={`${dispositivo.marca} ${dispositivo.modelo}`}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    ) : (<DevicePlaceholder tipo={dispositivo.tipo} className="w-20 h-20" />
                    )}
                  </div>

                  {/* Datos del Dispositivo */}
                  <div className="flex-1 text-center sm:text-left space-y-3">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[11px] font-mono font-semibold uppercase">
                        {dispositivo.tipo || 'Dispositivo'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-medium">
                        Equipo Registrado
                      </span>
                    </div>

                    <div>
                      <h1 className="text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight">
                        {dispositivo.marca}{' '}
                        <span className="text-slate-300 font-semibold">{dispositivo.modelo}</span>
                      </h1>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-700/60 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-slate-400 block text-[11px] font-mono uppercase tracking-wider">
                          Número de Serie / IMEI
                        </span>
                        <span className="font-mono text-slate-100 font-semibold text-xs">
                          {dispositivo.numero_serie || 'No registrado (S/N)'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-slate-400 block text-[11px] font-mono uppercase tracking-wider">
                          Fecha de Ingreso
                        </span>
                        <span className="font-mono text-slate-100 font-semibold text-xs">
                          {formatearFecha(dispositivo.fecha_registro)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. SECCIÓN REPARACIÓN ACTIVA O INICIAR REPARACIÓN */}
              {dispositivo.reparacion_activa ? (
                <div className="space-y-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="relative rounded-2xl p-6 sm:p-7 bg-gradient-to-r from-cyan-950/30 via-[#1E293B] to-slate-900 border-2 border-[#06B6D4] shadow-[0_0_30px_rgba(6,182,212,0.18)]"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#06B6D4] animate-ping" />
                          <span className="text-[11px] font-mono font-bold tracking-wider text-cyan-400 uppercase">
                            Servicio Técnico en Curso
                          </span>
                        </div>
                        <h2 className="text-xl font-black text-white">
                          Seguimiento de Reparación en Curso
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 font-mono font-semibold">
                            {formatearEstadoReparacion(dispositivo.reparacion_activa.etapa)}
                          </span>
                          <span className="text-slate-400 font-mono">
                            Iniciada el {formatearFecha(dispositivo.reparacion_activa.fecha_inicio)}
                          </span>
                        </div>
                        {dispositivo.reparacion_activa.desc_cliente && (
                          <p className="text-xs text-slate-300 mt-2 italic bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                            &ldquo;{dispositivo.reparacion_activa.desc_cliente}&rdquo;
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/cliente/reparaciones/${dispositivo.reparacion_activa.id_reparacion}`)
                        }
                        className="px-5 py-3 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:scale-[1.02] active:scale-[0.98] shrink-0 self-start sm:self-center flex items-center gap-2"
                      >
                        <span>Ver Estado de Reparación</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </button>
                    </div>
                  </motion.div>

                  {/* Cápsula de orientación y próximos pasos según el estado técnico */}
                  <CapsulaGuiaReparacion
                    etapa={dispositivo.reparacion_activa.etapa}
                    codigoSeguridad={dispositivo.reparacion_activa.codigo_sec}
                  />
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-2xl p-6 sm:p-7 bg-gradient-to-r from-slate-900 via-[#1E293B] to-slate-900 border border-slate-700/80 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-5"
                >
                  <div className="space-y-1.5 text-center sm:text-left">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] font-mono font-bold tracking-wider text-emerald-400 uppercase">
                        Dispositivo Disponible • Sin Reparaciones Activas
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-white">
                      ¿Este equipo requiere servicio técnico o diagnóstico?
                    </h2>
                    <p className="text-xs text-slate-300 max-w-xl">
                      Inicia una nueva orden de servicio para registrar fallas, síntomas y obtener el Código de Seguridad (Token de Entrega) indispensable para presentar en el taller.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setModalReparacionAbierto(true)}
                    className="px-6 py-3.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-bold transition-all shadow-[0_0_25px_rgba(6,182,212,0.4)] hover:scale-[1.02] active:scale-[0.98] shrink-0 flex items-center gap-2 cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233l2.844-2.844a2.25 2.25 0 000-3.182l-.84-.84a2.25 2.25 0 00-3.182 0l-2.844 2.844m4.022 4.022l-4.022-4.022" />
                    </svg>
                    <span>Iniciar Reparación</span>
                  </button>
                </motion.div>
              )}

              {/* 3. HISTORIAL DE REPARACIONES PREVIAS */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 space-y-4">
                <div className="border-b border-slate-700/60 pb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                    Historial de Reparaciones
                  </h2>
                  <span className="text-xs font-mono text-slate-400">
                    {dispositivo.historial_reparaciones?.length || 0} registro(s)
                  </span>
                </div>

                {!dispositivo.historial_reparaciones || dispositivo.historial_reparaciones.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center italic">
                    Este equipo aún no posee registros de reparaciones anteriores en su historial.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    {dispositivo.historial_reparaciones.map((rep) => (
                      <div
                        key={rep.id_reparacion}
                        className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between gap-3 group"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white">
                              Servicio de Reparación
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono">
                              {formatearEstadoReparacion(rep.etapa)}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-400 font-mono">
                            Inicio: {formatearFecha(rep.fecha_inicio)} {rep.fecha_entrega ? `• Entrega: ${formatearFecha(rep.fecha_entrega)}` : ''}
                          </p>

                          {rep.tecnico && (
                            <p className="text-[11px] text-slate-400">
                              Técnico: <span className="text-slate-300">{rep.tecnico}</span>
                            </p>
                          )}

                          {rep.resumen_diagnostico && (
                            <p className="text-xs text-slate-300 line-clamp-2">
                              {rep.resumen_diagnostico}
                            </p>
                          )}

                          {rep.calificacion && (
                            <div className="flex items-center gap-1.5 text-xs text-amber-400 pt-1">
                              <span>{'★'.repeat(rep.calificacion.puntuacion || 0)}</span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                ({rep.calificacion.puntuacion}/5)
                              </span>
                            </div>
                          )}

                          {/* Bitácora histórica colapsable */}
                          {rep.bitacora && rep.bitacora.length > 0 && (
                            <div className="pt-2 border-t border-slate-800/80 mt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setReparacionHistorialBitacoraAbierta((prev) => ({
                                    ...prev,
                                    [rep.id_reparacion]: !prev[rep.id_reparacion]
                                  }))
                                }
                                className="text-[11px] font-mono text-[#8B5CF6] hover:text-[#C4B5FD] flex items-center justify-between w-full py-0.5 cursor-pointer"
                              >
                                <span>Ver historial de avances ({rep.bitacora.length} registros)</span>
                                <span>{reparacionHistorialBitacoraAbierta[rep.id_reparacion] ? '▲' : '▼'}</span>
                              </button>
                              {reparacionHistorialBitacoraAbierta[rep.id_reparacion] && (
                                <div className="mt-2 space-y-2 pl-2 border-l-2 border-purple-900/60 text-xs">
                                  {rep.bitacora.map((hb) => (
                                    <div key={hb.id_bitacora} className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px]">
                                      <div className="flex items-center justify-between text-purple-300 font-semibold mb-0.5">
                                        <span>{hb.estado_nombre || formatearEstadoReparacion(hb.estado_alcanzado)}</span>
                                        <span className="font-mono text-[10px] text-slate-400">{hb.fecha_hora}</span>
                                      </div>
                                      <p className="text-slate-300 text-[11px]">{hb.comentario}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                          {/* CU-19: Botón Calificar si está entregado y sin calificación */}
                          {rep.etapa === 'ENTREGADO' && !rep.calificacion ? (
                            <button
                              type="button"
                              onClick={() => {
                                setReparacionACalificar({
                                  ...rep,
                                  dispositivo: {
                                    marca: dispositivo.marca,
                                    modelo: dispositivo.modelo
                                  }
                                });
                                setModalCalificarAbierto(true);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-bold border border-amber-500/40 transition-all flex items-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                            >
                              <span>⭐</span>
                              <span>Calificar Servicio</span>
                            </button>
                          ) : (
                            <div />
                          )}

                          <button
                            type="button"
                            onClick={() => navigate(`/cliente/reparaciones/${rep.id_reparacion}`)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-[#8B5CF6]/20 text-slate-300 hover:text-[#C4B5FD] text-xs font-semibold border border-slate-700 hover:border-[#8B5CF6]/50 transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <span>Ver Historial</span>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </main>
      </div>

      {/* Modal Iniciar Reparación */}
      <IniciarReparacionModal
        isOpen={modalReparacionAbierto}
        onClose={() => setModalReparacionAbierto(false)}
        dispositivo={dispositivo}
        onSuccess={(resultado) => {
          setSuccessMessage(
            `¡Reparación iniciada con éxito! Su solicitud para ${dispositivo?.marca || ''} ${dispositivo?.modelo || ''} ha sido registrada. Código para presentar en mostrador: ${resultado?.codigo_seguridad}`
          );
          setRecarga((n) => n + 1);
        }}
      />

      {/* Modal Calificar Servicio Técnico (CU-19) */}
      <CalificarServicioModal
        isOpen={modalCalificarAbierto}
        onClose={() => {
          setModalCalificarAbierto(false);
          setReparacionACalificar(null);
        }}
        reparacion={reparacionACalificar}
        onSuccess={() => {
          setSuccessMessage('¡Muchas gracias por su calificación y retroalimentación!');
          setRecarga((n) => n + 1);
        }}
      />
    </div>
  );
}
