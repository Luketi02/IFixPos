import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Tipos de notificaciones que nunca deben renderizarse en la campanita
// (códigos OTP o verificaciones que se envían exclusivamente por correo)
const TIPOS_EXCLUIDOS = [
  'ACTIVACION',
  'RECUPERACION',
  'OTP',
  'VERIFICACION',
  'CODIGO_VERIFICACION'
];

/**
 * Formatea fechas tipo 'YYYY-MM-DD' o ISO de forma legible en español.
 */
function formatearFechaNotificacion(fechaStr) {
  if (!fechaStr) return '';
  try {
    const partes = String(fechaStr).split('T')[0].split('-');
    if (partes.length === 3) {
      const year = parseInt(partes[0], 10);
      const month = parseInt(partes[1], 10) - 1;
      const day = parseInt(partes[2], 10);
      const fecha = new Date(year, month, day);

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const diffDias = Math.round((hoy - fecha) / (1000 * 60 * 60 * 24));

      if (diffDias === 0) return 'Hoy';
      if (diffDias === 1) return 'Ayer';
      if (diffDias > 1 && diffDias < 7) return `Hace ${diffDias} días`;

      return fecha.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
    return String(fechaStr);
  } catch {
    return String(fechaStr);
  }
}

/**
 * Retorna un ícono temático según la categoría de la alerta.
 */
function obtenerIconoTipo(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t.includes('DIAGNOSTICO')) return '🔧';
  if (t.includes('REPARACION') || t.includes('ESTADO')) return '📱';
  if (t.includes('BENEFICIO') || t.includes('DESCUENTO')) return '🎁';
  if (t.includes('COMPRA') || t.includes('VENTA') || t.includes('PAGO')) return '💳';
  return '🔔';
}

/**
 * Retorna un título legible según el tipo de notificación.
 */
function obtenerTituloTipo(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t.includes('DIAGNOSTICO')) return 'Presupuesto y Diagnóstico Técnico';
  if (t.includes('ESTADO')) return 'Actualización de Reparación';
  if (t.includes('DECISION')) return 'Decisión de Presupuesto Registrada';
  if (t.includes('REPARACION')) return 'Orden de Servicio Técnico';
  if (t.includes('BENEFICIO')) return 'Beneficio o Promoción';
  if (t.includes('COMPRA') || t.includes('VENTA')) return 'Novedad de Compra / Venta';
  return 'Aviso del Sistema';
}

/**
 * Badge estilizado según el estado de la reparación.
 */
function renderBadgeEstado(estado) {
  if (!estado) return null;
  const e = String(estado).toUpperCase().replace(/ /g, '_');
  const estilos = {
    ESPERANDO_DISPOSITIVO: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    ESPERANDO_DIAGNOSTICO: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    EN_DIAGNOSTICO: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    ESPERANDO_CONFIRMACION: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    EN_REPARACION: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    ESPERANDO_REPUESTOS: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    FINALIZADO: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    ENTREGADO: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    CANCELADO: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  const estilo = estilos[e] || 'bg-slate-700 text-slate-300 border-slate-600';
  const texto = e.replace(/_/g, ' ');
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${estilo}`}>
      {texto}
    </span>
  );
}

/**
 * Transforma mensajes de notificaciones para que sean cálidos, humanos y comprensibles para el cliente.
 * Remueve identificadores numéricos (#123) y agrega contexto amigable.
 */
function humanizarMensaje(notif) {
  if (!notif) return '';
  let txt = notif.mensaje || '';
  const datos = notif.datos_dispositivo;
  const modeloStr = datos?.marca && datos?.modelo ? `(${datos.marca} ${datos.modelo})` : (datos?.modelo ? `(${datos.modelo})` : '');

  // 1. Caso "Nueva orden de servicio #123 generada para su dispositivo."
  if (txt.includes('Nueva orden de servicio')) {
    const parteModelo = modeloStr ? ` ${modeloStr}` : '';
    return `Nueva orden de servicio generada para su dispositivo${parteModelo}. Presione aquí para obtener más detalles.`.replace(/\s+/g, ' ').replace(' .', '.');
  }

  // 2. Caso "Dispositivo recepcionado físicamente en mostrador para la orden #123."
  if (txt.includes('recepcionado físicamente') && !txt.includes('Presione aquí')) {
    return `Recibimos su dispositivo ${modeloStr} en nuestro taller. Presione aquí para ver el comprobante y el seguimiento.`.replace(/\s+/g, ' ');
  }

  // 3. Caso "Su presupuesto ya se encuentra disponible para revisión"
  if (txt.includes('presupuesto ya se encuentra disponible')) {
    return `El presupuesto para su dispositivo ${modeloStr} ya se encuentra disponible. Presione aquí para revisarlo y confirmar la reparación.`.replace(/\s+/g, ' ');
  }

  // 4. Caso "El estado de su reparación ha cambiado a ESPERANDO_REPUESTOS..."
  if (txt.includes('El estado de su reparación') && !txt.includes('Presione aquí')) {
    const estados = {
      ESPERANDO_DISPOSITIVO: 'Esperando dispositivo en mostrador',
      ESPERANDO_DIAGNOSTICO: 'Esperando diagnóstico técnico',
      EN_DIAGNOSTICO: 'En diagnóstico técnico',
      ESPERANDO_CONFIRMACION: 'Esperando confirmación de presupuesto',
      EN_REPARACION: 'En reparación',
      ESPERANDO_REPUESTOS: 'Esperando repuestos',
      FINALIZADO: 'Reparación finalizada',
      ENTREGADO: 'Dispositivo entregado',
      CANCELADO: 'Reparación cancelada',
    };
    for (const [k, v] of Object.entries(estados)) {
      txt = txt.replace(new RegExp(k, 'g'), v);
    }
    txt = txt.replace(/#\d+\s*/g, '');
    return `${txt}. Presione aquí para ver los detalles.`.replace(/\s+/g, ' ');
  }

  // 5. Caso "Actualización de su dispositivo..." pero con códigos en crudo
  if (txt.includes('ESPERANDO_REPUESTOS')) {
    txt = txt.replace('ESPERANDO_REPUESTOS', 'Esperando Repuestos');
  }

  // 6. Limpiar cualquier mención de ID o #numérico que confunda al cliente
  txt = txt.replace(/#\d+\s*/g, '');
  return txt.trim();
}

/**
 * Componente Campanita de Notificaciones para la barra de navegación superior (Header).
 * - Carga en tiempo real las alertas y el contador de no leídas desde /api/core/notificaciones/.
 * - Permite marcar individualmente o masivamente como leídas.
 * - Permite eliminar notificaciones de forma individual o masiva.
 * - Abre un modal interactivo con datos del equipo y botón directo a los detalles de reparación.
 * - Excluye automáticamente códigos de verificación OTP o correos de autenticación.
 */
export default function NotificationBell() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notificaciones, setNotificaciones] = useState([]);
  const [noLeidasCount, setNoLeidasCount] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [notificacionSeleccionada, setNotificacionSeleccionada] = useState(null);

  const dropdownRef = useRef(null);

  // Filtrado defensivo de notificaciones excluidas
  const notificacionesFiltradas = useMemo(() => {
    return notificaciones.filter((n) => {
      const tipo = String(n.tipo || '').toUpperCase();
      return !TIPOS_EXCLUIDOS.includes(tipo);
    });
  }, [notificaciones]);

  // Cargar notificaciones desde el backend
  const cargarNotificaciones = useCallback(async () => {
    if (!token) return;

    try {
      const res = await axios.get(`${API_BASE_URL}/api/core/notificaciones/`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const lista = Array.isArray(res.data?.notificaciones) ? res.data.notificaciones : [];
      const conteo = typeof res.data?.no_leidas_count === 'number'
        ? res.data.no_leidas_count
        : lista.filter((n) => !n.leida).length;

      setNotificaciones(lista);
      setNoLeidasCount(conteo);
    } catch (err) {
      // Manejo silencioso en polling para no interferir en la UX del usuario
      console.warn('No se pudieron sincronizar las notificaciones:', err);
    }
  }, [token]);

  // 1. Carga inicial al montar y polling periódico cada 315 segundos
  useEffect(() => {
    cargarNotificaciones();

    const interval = setInterval(() => {
      cargarNotificaciones();
    }, 35000);

    return () => clearInterval(interval);
  }, [cargarNotificaciones]);

  // 2. Refrescar al abrir el panel desplegable
  useEffect(() => {
    if (isOpen) {
      cargarNotificaciones();
    }
  }, [isOpen, cargarNotificaciones]);

  // 3. Manejo de cierre al hacer clic afuera o pulsar Escape
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // 4. Marcar una notificación individual como leída
  const handleMarcarLeida = async (idNotificacion, yaLeida) => {
    if (yaLeida) return;

    // Actualización optimista en el frontend
    setNotificaciones((prev) =>
      prev.map((item) =>
        item.id_notificacion === idNotificacion ? { ...item, leida: true } : item
      )
    );
    setNoLeidasCount((prev) => Math.max(0, prev - 1));

    try {
      await axios.patch(
        `${API_BASE_URL}/api/core/notificaciones/${idNotificacion}/leer/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Error al marcar notificación como leída:', err);
      // Revertir con recarga en caso de fallo
      cargarNotificaciones();
    }
  };

  // 4.1. Seleccionar notificación para abrir modal y marcar como leída
  const handleSeleccionarNotificacion = (notif) => {
    if (!notif) return;
    handleMarcarLeida(notif.id_notificacion, notif.leida);
    setNotificacionSeleccionada(notif);
    setIsOpen(false);
  };

  // 4.2. Navegación directa al detalle de la reparación o dispositivo
  const irADetalleReparacion = (notifParam) => {
    const obj = notifParam || notificacionSeleccionada;
    if (!obj) return;

    const rolCodigo = (user?.rol?.codigo || user?.id_rol?.codigo || '').toUpperCase();
    const esTecnicoOAdmin = ['TECNICO', 'ADMIN'].includes(rolCodigo);

    let url = obj.url_destino;
    if (!url) {
      if (obj.id_reparacion) {
        url = esTecnicoOAdmin
          ? `/tecnico/reparaciones/${obj.id_reparacion}`
          : `/cliente/reparaciones/${obj.id_reparacion}`;
      } else if (obj.id_dispositivo) {
        url = `/cliente/dispositivos/${obj.id_dispositivo}`;
      } else if (obj.datos_dispositivo?.id_dispositivo) {
        url = `/cliente/dispositivos/${obj.datos_dispositivo.id_dispositivo}`;
      }
    } else if (esTecnicoOAdmin && obj.id_reparacion && url.startsWith('/cliente/reparaciones/')) {
      url = `/tecnico/reparaciones/${obj.id_reparacion}`;
    }

    if (obj.id_notificacion && !obj.leida) {
      handleMarcarLeida(obj.id_notificacion, false);
    }

    setNotificacionSeleccionada(null);
    setIsOpen(false);
    if (url) {
      navigate(url);
    }
  };

  // 5. Marcar todas las notificaciones como leídas
  const handleMarcarTodasLeidas = async () => {
    if (noLeidasCount === 0 || procesandoAccion) return;

    setProcesandoAccion(true);
    // Actualización optimista inmediata
    setNotificaciones((prev) => prev.map((item) => ({ ...item, leida: true })));
    setNoLeidasCount(0);

    try {
      await axios.patch(
        `${API_BASE_URL}/api/core/notificaciones/leer-todas/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Error al marcar todas las notificaciones como leídas:', err);
      cargarNotificaciones();
    } finally {
      setProcesandoAccion(false);
    }
  };

  // 6. Eliminar una notificación individual
  const handleEliminarNotificacion = async (e, idNotificacion, estabaLeida) => {
    e.stopPropagation(); // Evitar disparar el evento de marcar como leída

    // Actualización optimista: quitar del array
    setNotificaciones((prev) => prev.filter((item) => item.id_notificacion !== idNotificacion));
    if (!estabaLeida) {
      setNoLeidasCount((prev) => Math.max(0, prev - 1));
    }

    try {
      await axios.delete(`${API_BASE_URL}/api/core/notificaciones/${idNotificacion}/eliminar/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Error al eliminar notificación:', err);
      cargarNotificaciones();
    }
  };

  // 7. Vaciar / Eliminar todas las notificaciones
  const handleEliminarTodas = async () => {
    if (notificacionesFiltradas.length === 0 || procesandoAccion) return;

    setProcesandoAccion(true);
    setNotificaciones([]);
    setNoLeidasCount(0);

    try {
      await axios.delete(`${API_BASE_URL}/api/core/notificaciones/eliminar-todas/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Error al vaciar todas las notificaciones:', err);
      cargarNotificaciones();
    } finally {
      setProcesandoAccion(false);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Botón Disparador de la Campana */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Abrir centro de notificaciones"
        title={noLeidasCount > 0 ? `Tienes ${noLeidasCount} notificaciones no leídas` : 'Notificaciones'}
        className="relative p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/40 text-slate-400 hover:text-[#06B6D4] transition-all duration-200 outline-none focus:ring-2 focus:ring-cyan-500/30 group"
      >
        {/* Ícono de Campana SVG Limpio */}
        <svg
          className="w-5 h-5 transition-transform duration-200 group-hover:scale-110"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {/* Burbuja Badge con Conteo */}
        {noLeidasCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 bg-gradient-to-r from-cyan-500 to-[#06B6D4] text-slate-950 font-black text-[10px] min-w-[19px] h-[19px] px-1 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-[0_0_10px_rgba(6,182,212,0.6)] animate-pulse"
          >
            {noLeidasCount > 99 ? '99+' : noLeidasCount}
          </motion.span>
        )}
      </button>

      {/* Panel Desplegable (Dropdown) Flotante Cyber-Tech */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 mt-2.5 w-80 sm:w-96 bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl shadow-cyan-950/40 z-50 overflow-hidden flex flex-col backdrop-blur-xl"
            role="menu"
            aria-orientation="vertical"
          >
            {/* Cabecera del Panel */}
            <div className="p-4 border-b border-slate-700/70 bg-slate-900/60 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Notificaciones</span>
                  {noLeidasCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono font-bold">
                      {noLeidasCount} nuevas
                    </span>
                  )}
                </h3>
              </div>

              {/* Acciones de Cabecera */}
              <div className="flex items-center gap-2">
                {noLeidasCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarcarTodasLeidas}
                    disabled={procesandoAccion}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold transition-colors disabled:opacity-50"
                    title="Marcar todas las alertas como leídas"
                  >
                    Marcar todas leídas
                  </button>
                )}

                {notificacionesFiltradas.length > 0 && (
                  <button
                    type="button"
                    onClick={handleEliminarTodas}
                    disabled={procesandoAccion}
                    className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors p-1"
                    title="Vaciar todas las notificaciones"
                  >
                    Vaciar
                  </button>
                )}
              </div>
            </div>

            {/* Cuerpo: Lista Scrollable de Alertas */}
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/70 select-none">
              {cargando ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-2" />
                  <span>Sincronizando alertas...</span>
                </div>
              ) : notificacionesFiltradas.length === 0 ? (
                /* Estado Vacío Amigable */
                <div className="py-12 px-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/70 border border-slate-700/80 flex items-center justify-center text-2xl mx-auto mb-3 shadow-inner">
                    ✨
                  </div>
                  <p className="text-slate-200 font-semibold text-xs sm:text-sm">
                    No tienes notificaciones nuevas :3
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Te avisaremos aquí sobre el progreso de tus órdenes y novedades técnicas.
                  </p>
                </div>
              ) : (
                notificacionesFiltradas.map((notif) => {
                  const esNoLeida = !notif.leida;

                  return (
                    <div
                      key={notif.id_notificacion}
                      onClick={() => handleSeleccionarNotificacion(notif)}
                      className={`group relative p-3.5 transition-all cursor-pointer flex items-start gap-3 ${
                        esNoLeida
                          ? 'bg-slate-800/60 hover:bg-slate-800 border-l-[3.5px] border-[#8B5CF6]'
                          : 'bg-transparent hover:bg-slate-800/30 opacity-75 hover:opacity-100'
                      }`}
                      role="menuitem"
                      title="Haz clic para ver detalles del aviso y su equipo"
                    >
                      {/* Ícono de la notificación */}
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm border ${
                          esNoLeida
                            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                            : 'bg-slate-800/80 border-slate-700 text-slate-400'
                        }`}
                      >
                        {obtenerIconoTipo(notif.tipo)}
                      </div>

                      {/* Contenido del Mensaje y Fecha */}
                      <div className="flex-1 min-w-0 pr-6">
                        <p
                          className={`text-xs leading-relaxed break-words ${
                            esNoLeida ? 'text-white font-medium' : 'text-slate-300'
                          }`}
                        >
                          {humanizarMensaje(notif)}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                            <span>{formatearFechaNotificacion(notif.fecha_envio)}</span>
                            {esNoLeida && (
                              <span className="flex items-center gap-1 text-[#8B5CF6] font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]" />
                                Nueva
                              </span>
                            )}
                          </div>

                        </div>
                      </div>

                      {/* Botón de Borrar (Eliminar individual) */}
                      <button
                        type="button"
                        onClick={(e) =>
                          handleEliminarNotificacion(e, notif.id_notificacion, notif.leida)
                        }
                        className="absolute top-3.5 right-3 w-6 h-6 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-70 group-hover:opacity-100 transition-all flex items-center justify-center"
                        title="Eliminar notificación"
                        aria-label="Eliminar notificación"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Informativo */}
            {notificacionesFiltradas.length > 0 && (
              <div className="p-2.5 border-t border-slate-700/70 bg-slate-900/60 text-center">
                <span className="text-[10px] text-slate-500 font-mono">
                  {notificacionesFiltradas.length}{' '}
                  {notificacionesFiltradas.length === 1 ? 'notificación registrada' : 'notificaciones registradas'}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Cyber-Tech: Detalle de Notificación y Acceso a la Reparación montado en Portal centrado */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {notificacionSeleccionada && (
              <div
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
              >
                {/* Backdrop con Blur y Oscurecimiento */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setNotificacionSeleccionada(null)}
                  className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
                />

                {/* Contenedor del Modal Centrado */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  transition={{ duration: 0.2 }}
                  className="relative w-full max-w-lg bg-[#1E293B] border border-cyan-500/40 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.3)] overflow-hidden text-white p-6 z-10 flex flex-col my-auto"
                >
                  {/* Botón de Cierre Superior */}
                  <button
                    type="button"
                    onClick={() => setNotificacionSeleccionada(null)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Cerrar modal"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  {/* Cabecera del Modal */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-2xl shadow-[0_0_15px_rgba(6,182,212,0.25)] shrink-0">
                      {obtenerIconoTipo(notificacionSeleccionada.tipo)}
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                        {obtenerTituloTipo(notificacionSeleccionada.tipo)}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-xs font-mono text-slate-400">
                        <span>{formatearFechaNotificacion(notificacionSeleccionada.fecha_envio)}</span>
                        <span>•</span>
                        <span className="text-cyan-400">{notificacionSeleccionada.tipo}</span>
                      </div>
                    </div>
                  </div>

                  {/* Cuerpo del Mensaje */}
                  <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 mb-4">
                    <p className="text-sm text-slate-200 leading-relaxed break-words font-medium">
                      {humanizarMensaje(notificacionSeleccionada)}
                    </p>
                  </div>

                  {/* Tarjeta de Datos del Dispositivo y Reparación (si aplica) */}
                  {notificacionSeleccionada.datos_dispositivo && (
                    <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-4 mb-5 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span>📱</span> Dispositivo Vinculado
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold">
                          Servicio Técnico
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Equipo:</span>
                          <span className="font-semibold text-slate-100">
                            {notificacionSeleccionada.datos_dispositivo.tipo} {notificacionSeleccionada.datos_dispositivo.marca} {notificacionSeleccionada.datos_dispositivo.modelo}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[11px]">Nro. de Serie:</span>
                          <span className="font-mono text-slate-300">
                            {notificacionSeleccionada.datos_dispositivo.numero_serie || 'S/N'}
                          </span>
                        </div>

                        {notificacionSeleccionada.datos_dispositivo.estado_reparacion && (
                          <div className="sm:col-span-2 pt-1 flex items-center gap-2">
                            <span className="text-slate-400 text-[11px]">Estado actual:</span>
                            {renderBadgeEstado(notificacionSeleccionada.datos_dispositivo.estado_reparacion)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Botones de Acción */}
                  <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setNotificacionSeleccionada(null)}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Cerrar
                    </button>

                    <button
                      type="button"
                      onClick={() => irADetalleReparacion(notificacionSeleccionada)}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-[#06B6D4] hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-bold text-xs shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all flex items-center justify-center gap-2 group cursor-pointer"
                    >
                      <span>Ver Detalles de la Reparación</span>
                      <svg
                        className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

    </div>
  );
}
