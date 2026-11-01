import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import NotificationBell from '../../components/navigation/NotificationBell';
import { resolverUrlImagen } from '../../utils/imagenes';
import { formatearFecha } from '../../utils/fechas';
import { formatearEstadoReparacion, obtenerColorBadgeEstado } from '../../utils/repairStatus';
import CargarDiagnosticoModal from '../../components/workshop/CargarDiagnosticoModal';
import CambiarEstadoModal from '../../components/workshop/CambiarEstadoModal';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function TecnicoReparacionDetalle() {
  const { id_reparacion } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [reparacion, setReparacion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modales operativos
  const [modalDiagnosticoAbierto, setModalDiagnosticoAbierto] = useState(false);
  const [modalEstadoAbierto, setModalEstadoAbierto] = useState(false);

  // Auto-limpieza de mensajes tras 15 segundos (Regla de UX)
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

  // Carga de radiografía técnica de la reparación
  const cargarDetalle = useCallback(async () => {
    if (!token || !id_reparacion) return;
    setCargando(true);
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/workshop/reparaciones/${id_reparacion}/detalles/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReparacion(res.data);
    } catch (err) {
      console.error('Error al cargar detalle técnico:', err);
      const msg = err.response?.data?.detail || err.response?.data?.error || 'No fue posible cargar el detalle de la reparación.';
      setErrorMessage(msg);
    } finally {
      setCargando(false);
    }
  }, [token, id_reparacion]);

  useEffect(() => {
    cargarDetalle();
  }, [cargarDetalle]);

  // Callback tras guardar un nuevo diagnóstico
  const handleDiagnosticoExitoso = (msg) => {
    setSuccessMessage(msg || 'Nuevo diagnóstico registrado con éxito.');
    cargarDetalle();
  };

  // Callback tras cambiar estado
  const handleCambioEstadoExitoso = (msg) => {
    setSuccessMessage(msg || 'Estado operativo actualizado con éxito.');
    cargarDetalle();
  };

  if (cargando) {
    return (
      <div className="flex min-h-screen bg-[#0F172A] text-slate-100 font-['Lexend']">
        <AdminSidebar />
        <main className="flex-1 p-6 md:p-8 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
            <p className="text-sm font-mono text-cyan-400">Cargando radiografía técnica...</p>
          </div>
        </main>
      </div>
    );
  }

  if (errorMessage && !reparacion) {
    return (
      <div className="flex min-h-screen bg-[#0F172A] text-slate-100 font-['Lexend']">
        <AdminSidebar />
        <main className="flex-1 p-6 md:p-8 flex items-center justify-center">
          <div className="bg-[#1E293B] border border-rose-500/30 rounded-2xl p-8 max-w-lg text-center space-y-4 shadow-xl">
            <span className="text-4xl block">⚠️</span>
            <h2 className="text-xl font-bold text-white">Error al cargar la orden</h2>
            <p className="text-sm text-slate-400">{errorMessage}</p>
            <button
              type="button"
              onClick={() => navigate('/tecnico/dispositivos/en-curso')}
              className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
            >
              Volver a Reparaciones en Curso
            </button>
          </div>
        </main>
      </div>
    );
  }

  const disp = reparacion?.dispositivo || {};
  const cliente = reparacion?.cliente || {};
  const bitacora = reparacion?.bitacora || [];
  const diagnosticoVigente = reparacion?.diagnostico;
  const listaDiagnosticos = reparacion?.diagnosticos && reparacion.diagnosticos.length > 0
    ? reparacion.diagnosticos
    : (diagnosticoVigente ? [diagnosticoVigente] : []);
  const insumos = reparacion?.insumos || [];
  const imagenDisp = resolverUrlImagen(disp?.imagen);

  const etapaRaw = (reparacion?.etapa || '').toUpperCase();
  const etapaNormalizada = etapaRaw.replace(/[\s\-]+/g, '_');
  const esEstadoTerminal = ['ENTREGADO', 'ENTREGADA', 'CANCELADO', 'CANCELADA'].includes(etapaNormalizada);

  return (
    <div className="flex min-h-screen bg-[#0F172A] text-slate-100 font-['Lexend'] antialiased">
      <AdminSidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header Superior Unificado del Taller */}
        <AdminHeader
          category="Taller & Servicio Técnico"
          subcategory="Reparaciones"
          pageName={`Orden #${reparacion?.id_reparacion || ''}`}
          title={`Radiografía Técnica • ${disp?.marca || ''} ${disp?.modelo || ''}`}
          onBack={() => navigate('/tecnico/dispositivos/en-curso')}
        />

        {/* Feedback Alerts */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-6 mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </div>
              <button type="button" onClick={() => setErrorMessage('')} className="text-rose-400 hover:text-rose-200">
                ✕
              </button>
            </motion.div>
          )}

          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-6 mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span>✓</span>
                <span>{successMessage}</span>
              </div>
              <button type="button" onClick={() => setSuccessMessage('')} className="text-emerald-400 hover:text-emerald-200">
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Contenido Principal */}
        <div className="p-6 md:p-8 space-y-6 max-w-7xl">
          {/* 1. Cabecera Operativa: Estado y Botones de Acción */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start sm:items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-700 p-2 flex items-center justify-center shrink-0">
                <img
                  src={imagenDisp || logoEmpresa}
                  alt={disp?.modelo || 'Dispositivo'}
                  className="w-full h-full object-contain"
                  onError={(e) => { e.currentTarget.src = logoEmpresa; }}
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-mono font-bold border tracking-tight ${obtenerColorBadgeEstado(
                      reparacion?.etapa
                    )}`}
                  >
                    {formatearEstadoReparacion(reparacion?.etapa)}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Ingresado el {formatearFecha(reparacion?.fecha_inicio)}
                  </span>
                </div>

                <h2 className="text-2xl font-black text-white">
                  {disp?.marca} {disp?.modelo}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                  <span>Tipo: <strong className="text-slate-200">{disp?.tipo || 'Dispositivo'}</strong></span>
                  {disp?.numero_serie && (
                    <span>&bull; S/N: <strong className="text-cyan-400 font-mono">{disp.numero_serie}</strong></span>
                  )}
                  {reparacion?.codigo_sec && (
                    <span>&bull; Cód. Retiro: <strong className="text-purple-400 font-mono">{reparacion.codigo_sec}</strong></span>
                  )}
                </div>
              </div>
            </div>

            {/* Acciones Rápidas del Técnico */}
            {!esEstadoTerminal && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setModalDiagnosticoAbierto(true)}
                  className="px-4 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Nuevo Diagnóstico</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalEstadoAbierto(true)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[#8B5CF6] hover:text-purple-300 border border-[#8B5CF6]/40 hover:border-[#8B5CF6]/80 font-bold text-xs transition-all shadow-sm hover:shadow-[0_0_15px_rgba(139,92,246,0.25)] flex items-center gap-2"
                >
                  <span className="text-base leading-none">⚙️</span>
                  <span>Actualizar Estado</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. Columnas: Datos del Cliente + Falla Reportada */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tarjeta del Cliente */}
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs tracking-wider uppercase font-mono">
                <span>👤</span>
                <span>Titular del Equipo</span>
              </div>
              <div>
                <p className="text-base font-bold text-white">{cliente.nombre_completo || 'Cliente Registrado'}</p>
                <p className="text-xs text-slate-400 mt-0.5">{cliente.email}</p>
              </div>
              <div className="pt-2 border-t border-slate-800 text-xs text-slate-300 space-y-1.5 font-sans">
                {cliente.telefono && (
                  <p className="flex items-center gap-2">
                    <span className="text-slate-500">Tel:</span>
                    <strong className="text-white font-mono">{cliente.telefono}</strong>
                  </p>
                )}
                {cliente.dni && (
                  <p className="flex items-center gap-2">
                    <span className="text-slate-500">DNI:</span>
                    <strong className="text-white font-mono">{cliente.dni}</strong>
                  </p>
                )}
                {reparacion?.tecnico && (
                  <p className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                    <span className="text-slate-500">Técnico Asignado:</span>
                    <strong className="text-purple-300">{reparacion.tecnico}</strong>
                  </p>
                )}
              </div>
            </div>

            {/* Falla Inicial Reportada */}
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-3 lg:col-span-2">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs tracking-wider uppercase font-mono">
                <span>📋</span>
                <span>Falla Manifestada por el Cliente</span>
              </div>
              <p className="text-sm text-slate-200 bg-slate-900/70 p-3.5 rounded-xl border border-slate-800 italic leading-relaxed">
                &ldquo;{reparacion?.desc_cliente || 'Sin descripción inicial reportada por el cliente.'}&rdquo;
              </p>
              {reparacion?.credencial_acceso && reparacion.credencial_acceso !== 'Ninguna' && (
                <div className="inline-flex items-center gap-2 text-xs font-mono text-purple-300 bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/20">
                  <span>🔑 PIN/Credencial de Acceso:</span>
                  <strong className="text-white">{reparacion.credencial_acceso}</strong>
                </div>
              )}
            </div>
          </div>

          {/* 3. Sección: Historial de Diagnósticos y Presupuestos */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-cyan-400">🔬</span>
                  <span>Historial de Diagnósticos y Evaluaciones Técnicas</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Registro cronológico de evaluaciones emitidas sobre el dispositivo ({listaDiagnosticos.length} registradas).
                </p>
              </div>

              {!esEstadoTerminal && (
                <button
                  type="button"
                  onClick={() => setModalDiagnosticoAbierto(true)}
                  className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <span>+</span>
                  <span>Cargar Nuevo Diagnóstico</span>
                </button>
              )}
            </div>

            {listaDiagnosticos.length === 0 ? (
              <div className="text-center py-8 bg-slate-900/50 rounded-xl border border-dashed border-slate-800 p-6">
                <span className="text-3xl block mb-2">🔍</span>
                <p className="text-sm text-slate-300 font-semibold">Aún no se ha registrado ningún diagnóstico técnico.</p>
                <p className="text-xs text-slate-500 mt-1">Presione en &ldquo;Nuevo Diagnóstico&rdquo; para evaluar la unidad.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {listaDiagnosticos.map((diag, idx) => {
                  const esVigente = idx === 0;
                  return (
                    <div
                      key={diag.id_diagnostico || idx}
                      className={`p-5 rounded-xl border transition-all ${
                        esVigente
                          ? 'bg-gradient-to-r from-slate-900/90 to-slate-900/60 border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
                          : 'bg-slate-900/40 border-slate-800 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold tracking-tight border ${
                              esVigente
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {esVigente ? 'Diagnóstico Vigente (Activo)' : `Evaluación Previa #${listaDiagnosticos.length - idx}`}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            Fecha: {formatearFecha(diag.fecha_diagnostico)}
                          </span>
                        </div>

                        {diag.costo_diagnostico !== undefined && diag.costo_diagnostico !== null && (
                          <div className="text-right">
                            <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-mono">
                              Mano de Obra
                            </span>
                            <span className="text-sm font-black text-cyan-400 font-mono">
                              ${Number(diag.costo_diagnostico).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block">
                          Detalle Técnico de Fallas Detectadas:
                        </span>
                        <p className="text-xs sm:text-sm text-slate-200 bg-slate-950/60 p-3 rounded-lg border border-slate-800 whitespace-pre-wrap leading-relaxed">
                          {diag.descripcion_falla || 'Sin detalle de falla especificado.'}
                        </p>
                      </div>

                      {/* Si es el diagnóstico vigente, mostramos los insumos presupuestados */}
                      {esVigente && insumos.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-800/80">
                          <span className="text-xs font-mono text-purple-300 uppercase tracking-wider block mb-2 font-semibold">
                            Repuestos e Insumos Presupuestados ({insumos.length}):
                          </span>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead>
                                <tr className="text-slate-400 border-b border-slate-800 font-mono">
                                  <th className="py-2 pr-3">Insumo / Repuesto</th>
                                  <th className="py-2 px-3 text-center">Cant.</th>
                                  <th className="py-2 px-3 text-right">Unitario</th>
                                  <th className="py-2 pl-3 text-right">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 font-sans">
                                {insumos.map((ins, iIdx) => {
                                  const cant = Number(ins.cantidad || 0);
                                  const pu = Number(ins.precio_unitario || 0);
                                  const subt = ins.subtotal !== undefined ? Number(ins.subtotal) : cant * pu;
                                  return (
                                    <tr key={iIdx} className="text-slate-300">
                                      <td className="py-2 pr-3 font-medium text-white">{ins.producto || 'Insumo'}</td>
                                      <td className="py-2 px-3 text-center font-mono">{cant}</td>
                                      <td className="py-2 px-3 text-right font-mono">${pu.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                      <td className="py-2 pl-3 text-right font-mono font-bold text-cyan-300">${subt.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Sección: Calificación del Cliente (CU-51) */}
          {reparacion?.calificacion && (
            <div className="bg-[#1E293B] border border-amber-500/40 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 text-sm">
                    ⭐
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-wide">
                      Calificación y Opinión del Cliente
                    </h3>
                    <p className="text-xs text-slate-400">
                      Evaluación cualitativa y cuantitativa registrada por el usuario
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {formatearFecha(reparacion.calificacion.fecha)}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-lg text-amber-400">
                  <span>{'★'.repeat(reparacion.calificacion.puntuacion || 0)}</span>
                  <span className="text-sm font-mono text-slate-200 font-bold">
                    {reparacion.calificacion.puntuacion} / 5
                  </span>
                </div>
                {reparacion.calificacion.comentario && (
                  <p className="text-xs sm:text-sm text-slate-200 italic bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                    &ldquo;{reparacion.calificacion.comentario}&rdquo;
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 5. Sección: Bitácora Completa de Cambios (Timeline) */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-purple-400">📜</span>
                <span>Bitácora de Trazabilidad y Cambios de Estado</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Historial cronológico inmutable de eventos, justificaciones y avances del dispositivo ({bitacora.length} registros).
              </p>
            </div>

            {bitacora.length === 0 ? (
              <div className="text-center py-8 bg-slate-900/50 rounded-xl border border-dashed border-slate-800 p-6">
                <p className="text-xs text-slate-400">No hay eventos registrados en la bitácora aún.</p>
              </div>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-700">
                {bitacora.map((item, idx) => {
                  const estadoNombre = item.estado_alcanzado_nombre || `Estado ${item.estado_alcanzado}`;
                  return (
                    <div key={item.id_bitacora || idx} className="relative group">
                      {/* Nodo del Timeline */}
                      <span className="absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full bg-[#1E293B] border-2 border-cyan-400 group-hover:scale-125 transition-transform" />

                      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2 hover:border-slate-700 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold tracking-tight border ${obtenerColorBadgeEstado(
                              estadoNombre
                            )}`}
                          >
                            {formatearEstadoReparacion(estadoNombre)}
                          </span>

                          <span className="text-[11px] font-mono text-slate-400">
                            {item.fecha_hora || 'Hora no registrada'}
                          </span>
                        </div>

                        {item.comentario && (
                          <p className="text-xs sm:text-sm text-slate-200 font-sans leading-relaxed">
                            {item.comentario}
                          </p>
                        )}

                        {item.usuario && (
                          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80">
                            <span>Registrado por:</span>
                            <span className="text-cyan-400 font-semibold">{item.usuario}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modales */}
        <CargarDiagnosticoModal
          isOpen={modalDiagnosticoAbierto}
          onClose={() => setModalDiagnosticoAbierto(false)}
          reparacion={reparacion}
          onSuccess={handleDiagnosticoExitoso}
        />

        <CambiarEstadoModal
          isOpen={modalEstadoAbierto}
          onClose={() => setModalEstadoAbierto(false)}
          reparacion={reparacion}
          onSuccess={handleCambioEstadoExitoso}
        />
      </main>
    </div>
  );
}
