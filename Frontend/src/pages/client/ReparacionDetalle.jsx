import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import { resolverUrlImagen } from '../../utils/imagenes';
import { formatearFecha } from '../../utils/fechas';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function ReparacionDetalle() {
  const { id_reparacion } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [reparacion, setReparacion] = useState(null);
  const [cargadoId, setCargadoId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const isLoading = cargadoId !== id_reparacion;

  // Auto-ocultamiento de alertas de error a los 6 segundos
  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  useEffect(() => {
    let activo = true;

    axios
      .get(`${API_BASE_URL}/api/workshop/reparaciones/${id_reparacion}/detalles/`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (!activo) return;
        setReparacion(res.data);
      })
      .catch((err) => {
        if (!activo) return;
        console.error('Error al consultar detalle de reparación:', err);
        const status = err.response?.status;
        const data = err.response?.data;
        const msg = data?.detail || data?.error || (Array.isArray(data) ? data.join(' ') : null);

        if (status === 404) {
          setErrorMessage('Orden de reparación no encontrada.');
        } else if (status === 403) {
          setErrorMessage(msg || 'Acceso Denegado: No posee permisos sobre este equipo.');
        } else {
          setErrorMessage(msg || 'No fue posible cargar el detalle de la reparación.');
        }
      })
      .finally(() => {
        if (activo) setCargadoId(id_reparacion);
      });

    return () => {
      activo = false;
    };
  }, [id_reparacion, token]);

  const rolCodigo = (user?.rol?.codigo || user?.id_rol?.codigo || '').toUpperCase();
  const esPersonalTecnico = ['ADMIN', 'TECNICO'].includes(rolCodigo);

  const imagenDispositivo = resolverUrlImagen(reparacion?.dispositivo?.imagen);
  const idDisp = reparacion?.dispositivo?.id_dispositivo;
  const bitacora = reparacion?.bitacora || [];

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
              {idDisp && (
                <>
                  <span className="text-slate-600">/</span>
                  <Link
                    to={`/cliente/dispositivos/${idDisp}`}
                    className="text-slate-400 hover:text-cyan-400 transition-colors truncate max-w-[120px]"
                  >
                    Equipo #{idDisp}
                  </Link>
                </>
              )}
              <span className="text-slate-600">/</span>
              <span className="text-cyan-400 font-semibold font-mono">
                Reparación #{id_reparacion}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <UserProfileDropdown align="right" />
          </div>
        </header>

        <main className="flex-1 p-6 sm:p-10 max-w-6xl mx-auto w-full">
          {/* Botón Volver Dinámico */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => {
                if (idDisp) navigate(`/cliente/dispositivos/${idDisp}`);
                else navigate('/cliente/dispositivos');
              }}
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
              <span>{idDisp ? 'Volver al Dispositivo' : 'Volver a Mis Dispositivos'}</span>
            </button>
          </div>

          {/* Alerta de Error con fade-out */}
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
          </AnimatePresence>

          {/* Estado de Carga: Skeleton Cyber-Tech */}
          {isLoading ? (
            <div className="space-y-6">
              <div className="h-32 rounded-2xl bg-[#1E293B] border border-slate-800 animate-pulse" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="h-44 rounded-2xl bg-[#1E293B] border border-slate-800 animate-pulse" />
                  <div className="h-44 rounded-2xl bg-[#1E293B] border border-slate-800 animate-pulse" />
                </div>
                <div className="h-96 rounded-2xl bg-[#1E293B] border border-slate-800 animate-pulse" />
              </div>
            </div>
          ) : !reparacion ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 bg-[#1E293B]/50 border border-dashed border-slate-700 rounded-2xl"
            >
              <p className="text-slate-200 font-semibold">No se pudo cargar la orden de reparación.</p>
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
              {/* 1. CABECERA PRINCIPAL */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-7 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                    {imagenDispositivo ? (
                      <img
                        src={imagenDispositivo}
                        alt="Dispositivo"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg className="w-8 h-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                      </svg>
                    )}
                  </div>

                  <div className="min-w-0">
                    <span className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider block">
                      Orden de Reparación #{reparacion.id_reparacion}
                    </span>
                    <h1 className="text-xl sm:text-2xl font-black text-white truncate">
                      {reparacion.dispositivo?.marca} {reparacion.dispositivo?.modelo}
                    </h1>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Serie: <span className="text-slate-200">{reparacion.dispositivo?.numero_serie || 'S/N'}</span>
                      {reparacion.tecnico && (
                        <> • Técnico: <span className="text-cyan-300 font-semibold">{reparacion.tecnico}</span></>
                      )}
                    </p>
                  </div>
                </div>

                {/* Badge Grande y Vistoso del Estado Actual */}
                <div className="flex flex-col sm:items-end justify-center shrink-0">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Estado Actual
                  </span>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-bold text-sm sm:text-base font-mono shadow-[0_0_20px_rgba(6,182,212,0.25)]">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>{reparacion.etapa}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 mt-1">
                    Inició: {formatearFecha(reparacion.fecha_inicio)} {reparacion.fecha_entrega ? `• Entregado: ${formatearFecha(reparacion.fecha_entrega)}` : ''}
                  </span>
                </div>
              </div>

              {/* Panel Privado de Seguridad (Solo ADMIN / TECNICO) */}
              {esPersonalTecnico && (reparacion.credencial_acceso || reparacion.codigo_sec) && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[10px] uppercase">
                      Panel Técnico
                    </span>
                    <span>Credenciales internas para pruebas:</span>
                  </div>
                  <div className="flex items-center gap-4 font-mono font-bold">
                    {reparacion.codigo_sec && (
                      <span>Código Sec: <strong className="text-white">{reparacion.codigo_sec}</strong></span>
                    )}
                    {reparacion.credencial_acceso && (
                      <span>PIN/Clave: <strong className="text-white">{reparacion.credencial_acceso}</strong></span>
                    )}
                  </div>
                </div>
              )}

              {/* GRID PRINCIPAL: 2 Columnas en PC, 1 en Móvil */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                
                {/* ================= COLUMNA IZQUIERDA ================= */}
                <div className="space-y-6">
                  
                  {/* Tarjeta 1: Diagnóstico Técnico */}
                  <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="border-b border-slate-700/60 pb-3 flex items-center justify-between">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        Diagnóstico Técnico
                      </h2>
                      {reparacion.diagnostico?.fecha_diagnostico && (
                        <span className="text-[11px] font-mono text-slate-400">
                          {formatearFecha(reparacion.diagnostico.fecha_diagnostico)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-3 text-xs">
                      {/* Problema reportado por el cliente */}
                      <div>
                        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wide block">
                          Problema Reportado
                        </span>
                        <p className="mt-1 text-slate-200 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                          {reparacion.desc_cliente || 'No especificado por el cliente.'}
                        </p>
                      </div>

                      {/* Dictamen del Técnico */}
                      <div>
                        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wide block">
                          Falla Detectada / Resolución
                        </span>
                        <p className="mt-1 text-slate-200 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                          {reparacion.diagnostico?.descripcion_falla || 'Pendiente de diagnóstico técnico en taller.'}
                        </p>
                      </div>

                      {/* Costo Estimado */}
                      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-700 flex items-center justify-between">
                        <span className="text-slate-300 font-semibold font-mono text-xs">
                          Costo Estimado de Diagnóstico / Mano de Obra:
                        </span>
                        <span className="text-base font-black text-cyan-400 font-mono">
                          {reparacion.diagnostico?.costo_diagnostico !== null && reparacion.diagnostico?.costo_diagnostico !== undefined
                            ? `$${Number(reparacion.diagnostico.costo_diagnostico).toFixed(2)}`
                            : 'A determinar'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta 2: Insumos Utilizados */}
                  <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="border-b border-slate-700/60 pb-3 flex items-center justify-between">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                        Insumos & Repuestos Utilizados
                      </h2>
                      <span className="text-xs font-mono text-slate-400">
                        {reparacion.insumos?.length || 0} ítem(s)
                      </span>
                    </div>

                    {!reparacion.insumos || reparacion.insumos.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center italic">
                        No se han registrado consumos de repuestos en esta orden de servicio.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 text-xs">
                          {reparacion.insumos.map((insumo) => (
                            <div key={insumo.id_detalle_insumo} className="p-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-200 truncate">
                                  {insumo.nombre_producto || `Producto #${insumo.id_producto}`}
                                </p>
                                <p className="text-[11px] text-slate-400 font-mono">
                                  {insumo.cantidad} x ${Number(insumo.precio_unitario).toFixed(2)}
                                </p>
                              </div>
                              <span className="font-mono font-bold text-slate-100 text-xs shrink-0">
                                ${Number(insumo.subtotal).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tarjeta 3: Calificación (Solo si existe) */}
                  {reparacion.calificacion && (
                    <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-3">
                      <div className="border-b border-slate-700/60 pb-3 flex items-center justify-between">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          Calificación del Cliente
                        </h2>
                        <span className="text-[11px] font-mono text-slate-400">
                          {formatearFecha(reparacion.calificacion.fecha)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-base text-amber-400">
                        <span>{'★'.repeat(reparacion.calificacion.puntuacion || 0)}</span>
                        <span className="text-xs font-mono text-slate-300 font-bold">
                          {reparacion.calificacion.puntuacion} / 5
                        </span>
                      </div>

                      {reparacion.calificacion.comentario && (
                        <p className="text-xs text-slate-300 italic bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                          &ldquo;{reparacion.calificacion.comentario}&rdquo;
                        </p>
                      )}
                    </div>
                  )}

                </div>

                {/* ================= COLUMNA DERECHA: LA BITÁCORA (TIMELINE) ================= */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-7 shadow-xl space-y-6">
                  <div className="border-b border-slate-700/60 pb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                      Línea de Tiempo (Bitácora Técnica)
                    </h2>
                    <span className="text-xs font-mono text-cyan-400">
                      {bitacora.length} registro(s)
                    </span>
                  </div>

                  {bitacora.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs italic">
                      Aún no hay actualizaciones asentadas en la bitácora de esta reparación.
                    </div>
                  ) : (
                    <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-700">
                      {bitacora.map((item, index) => {
                        const esUltimo = index === bitacora.length - 1;
                        return (
                          <div key={item.id_bitacora} className="relative group">
                            {/* Punto / Nodo en la línea */}
                            <div
                              className={`absolute -left-[19px] top-1.5 w-3.5 h-3.5 rounded-full border-2 transition-all ${
                                esUltimo
                                  ? 'bg-[#8B5CF6] border-[#C4B5FD] shadow-[0_0_12px_rgba(139,92,246,0.6)] scale-110'
                                  : 'bg-slate-700 border-slate-500'
                              }`}
                            />

                            {/* Contenido del evento */}
                            <div
                              className={`p-4 rounded-xl border text-xs transition-all ${
                                esUltimo
                                  ? 'bg-slate-900/90 border-[#8B5CF6]/50 shadow-lg shadow-purple-950/20'
                                  : 'bg-slate-900/60 border-slate-800'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                <span
                                  className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                    esUltimo
                                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {esUltimo ? 'Último cambio' : `Evento #${item.id_bitacora}`}
                                </span>
                                <span className="font-mono text-[11px] text-slate-400">
                                  Hora: {item.fecha_hora || '—'}
                                </span>
                              </div>

                              <p className="text-slate-100 font-medium text-xs leading-relaxed">
                                {item.comentario}
                              </p>

                              {item.tecnico && (
                                <p className="text-[10px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
                                  Registrado por: <span className="text-slate-300">{item.tecnico}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
