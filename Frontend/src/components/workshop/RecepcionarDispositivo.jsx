import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { formatearEstadoReparacion } from '../../utils/repairStatus';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function RecepcionarDispositivo({ onAlerta }) {
  const { token } = useAuth();

  // Estados de Fase 1: Búsqueda
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [reparacionesPendientes, setReparacionesPendientes] = useState([]);
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);
  const [busquedaRealizada, setBusquedaRealizada] = useState(false);

  // Estados de Fase 2: Formulario de Recepción
  const [reparacionSeleccionada, setReparacionSeleccionada] = useState(null);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
  const [cargandoCategorias, setCategoriasCargando] = useState(false);

  const [formDatos, setFormDatos] = useState({
    descripcion_problema: '',
    credencial_acceso: '',
    ids_categorias: [],
    observaciones_fisicas: ''
  });

  // Estados para el buscador desplegable de categorías
  const [busquedaCategoria, setBusquedaCategoria] = useState('');
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const dropdownRef = useRef(null);

  // Estados de Envío y Ticket de Éxito
  const [enviando, setEnviando] = useState(false);
  const [ticketExito, setTicketExito] = useState(null);

  // Alerta local de respaldo si no viene onAlerta
  const [alertaLocal, setAlertaLocal] = useState(null);

  const dispararMensaje = useCallback(
    (tipo, mensaje) => {
      if (typeof onAlerta === 'function') {
        onAlerta(tipo, mensaje);
      } else {
        setAlertaLocal({ tipo, mensaje });
        setTimeout(() => setAlertaLocal(null), 6000);
      }
    },
    [onAlerta]
  );

  // 1. Cargar Categorías de Reparación Activas
  useEffect(() => {
    let cancelado = false;
    const fetchCategorias = async () => {
      setCategoriasCargando(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/workshop/categorias-reparacion/?estado=true`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!cancelado && Array.isArray(res.data)) {
          setCategoriasDisponibles(res.data);
        }
      } catch (err) {
        console.error('Error al cargar categorías de reparación:', err);
      } finally {
        if (!cancelado) setCategoriasCargando(false);
      }
    };
    fetchCategorias();
    return () => {
      cancelado = true;
    };
  }, [token]);

  // Cerrar el dropdown al hacer clic fuera del componente
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Categorías filtradas en tiempo real según el texto escrito
  const categoriasFiltradas = useMemo(() => {
    const q = busquedaCategoria.toLowerCase().trim();
    if (!q) return categoriasDisponibles;
    return categoriasDisponibles.filter((c) => (c.nombre || '').toLowerCase().includes(q));
  }, [categoriasDisponibles, busquedaCategoria]);

  // 2. Búsqueda de Reparaciones en 'ESPERANDO_DISPOSITIVO'
  const buscarReparaciones = useCallback(
    async (queryManual = null) => {
      setCargandoBusqueda(true);
      setBusquedaRealizada(true);
      const query = queryManual !== null ? queryManual : terminoBusqueda;
      const queryLimpia = query.trim();

      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        let lista = [];

        if (!queryLimpia) {
          // Búsqueda general de todas las órdenes en espera de entrega física
          const res = await axios.get(`${API_BASE_URL}/api/workshop/reparaciones/`, {
            params: { etapa: 'ESPERANDO_DISPOSITIVO' },
            headers
          });
          lista = Array.isArray(res.data) ? res.data : [];
        } else {
          // Búsqueda combinada: Por cliente (DNI, Email, Nombre) y por Código de Seguridad
          const [resCliente, resCodigo] = await Promise.allSettled([
            axios.get(`${API_BASE_URL}/api/workshop/reparaciones/`, {
              params: { etapa: 'ESPERANDO_DISPOSITIVO', cliente_query: queryLimpia },
              headers
            }),
            axios.get(`${API_BASE_URL}/api/workshop/reparaciones/`, {
              params: { etapa: 'ESPERANDO_DISPOSITIVO', codigo_seguridad: queryLimpia },
              headers
            })
          ]);

          const listaCliente = resCliente.status === 'fulfilled' && Array.isArray(resCliente.value.data)
            ? resCliente.value.data
            : [];
          const listaCodigo = resCodigo.status === 'fulfilled' && Array.isArray(resCodigo.value.data)
            ? resCodigo.value.data
            : [];

          // Unificar resultados eliminando duplicados por id_reparacion
          const mapa = new Map();
          [...listaCliente, ...listaCodigo].forEach((rep) => {
            if (rep && rep.id_reparacion) {
              mapa.set(rep.id_reparacion, rep);
            }
          });
          lista = Array.from(mapa.values());
        }

        // Filtro estricto en UI: solo mostrar reparaciones en 'ESPERANDO_DISPOSITIVO'
        const soloEsperando = lista.filter((rep) => {
          const etapa = (rep.etapa || '').toUpperCase().trim();
          return etapa === 'ESPERANDO_DISPOSITIVO';
        });

        setReparacionesPendientes(soloEsperando);
      } catch (err) {
        console.error('Error al consultar reparaciones pendientes:', err);
        dispararMensaje('error', 'Ocurrió un error al consultar las órdenes pendientes de recepción.');
        setReparacionesPendientes([]);
      } finally {
        setCargandoBusqueda(false);
      }
    },
    [terminoBusqueda, token, dispararMensaje]
  );

  // Carga inicial automática de órdenes pendientes
  useEffect(() => {
    buscarReparaciones('');
  }, [buscarReparaciones]);

  // 3. Manejo de Selección de una Reparación para la Fase 2
  const handleSeleccionarReparacion = (rep) => {
    setReparacionSeleccionada(rep);
    setTicketExito(null);

    // Precargar campos del formulario
    const desc = rep.desc_cliente || rep.descripcion_problema || '';
    const credencial = rep.credencial_acceso || 'Ninguna';
    const cats = Array.isArray(rep.categorias)
      ? rep.categorias.map((c) => (typeof c === 'object' ? c.id_categoria : c))
      : [];

    setFormDatos({
      descripcion_problema: desc,
      credencial_acceso: credencial,
      ids_categorias: cats,
      observaciones_fisicas: ''
    });

    // Desplazar suavemente hacia el formulario
    window.scrollTo({ top: 350, behavior: 'smooth' });
  };

  // 4. Cancelar Edición / Volver a Fase 1
  const handleCancelarRecepcion = () => {
    setReparacionSeleccionada(null);
    setBusquedaCategoria('');
    setDropdownAbierto(false);
    setFormDatos({
      descripcion_problema: '',
      credencial_acceso: '',
      ids_categorias: [],
      observaciones_fisicas: ''
    });
  };

  // 5. Manejador de Categorías (Toggle Checkboxes)
  const handleToggleCategoria = (idCat) => {
    setFormDatos((prev) => {
      const yaSeleccionada = prev.ids_categorias.includes(idCat);
      if (yaSeleccionada) {
        return {
          ...prev,
          ids_categorias: prev.ids_categorias.filter((id) => id !== idCat)
        };
      }
      return {
        ...prev,
        ids_categorias: [...prev.ids_categorias, idCat]
      };
    });
  };

  // 6. Validación de Envío
  const esFormularioValido = useMemo(() => {
    const obsLimpia = (formDatos.observaciones_fisicas || '').trim();
    const descLimpia = (formDatos.descripcion_problema || '').trim();
    const tieneCategorias = Array.isArray(formDatos.ids_categorias) && formDatos.ids_categorias.length > 0;

    return obsLimpia.length >= 5 && descLimpia.length > 0 && tieneCategorias;
  }, [formDatos]);

  // 7. Envío a la API de Recepción (CU-45)
  const handleConfirmarRecepcion = async (e) => {
    e.preventDefault();

    if (!reparacionSeleccionada) return;

    const obsFisicas = (formDatos.observaciones_fisicas || '').trim();
    if (obsFisicas.length < 5) {
      dispararMensaje(
        'error',
        'Debe completar las observaciones físicas del equipo con al menos 5 caracteres para salvaguardar la responsabilidad del taller.'
      );
      return;
    }

    if (!formDatos.ids_categorias || formDatos.ids_categorias.length === 0) {
      dispararMensaje('error', 'Debe seleccionar al menos una categoría de reparación.');
      return;
    }

    setEnviando(true);

    try {
      const payload = {
        descripcion_problema: formDatos.descripcion_problema.trim(),
        credencial_acceso: (formDatos.credencial_acceso || '').trim() || 'Ninguna',
        ids_categorias: formDatos.ids_categorias,
        observaciones_fisicas: obsFisicas
      };

      const res = await axios.post(
        `${API_BASE_URL}/api/workshop/reparaciones/${reparacionSeleccionada.id_reparacion}/recepcionar/`,
        payload,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }
      );

      const dataRespuesta = res.data;
      const repActualizada = dataRespuesta.reparacion || dataRespuesta;

      // Generar ticket de éxito detallado
      setTicketExito({
        id_reparacion: reparacionSeleccionada.id_reparacion,
        codigo_seguridad: reparacionSeleccionada.codigo_seguridad || reparacionSeleccionada.codigo_sec || 'N/A',
        cliente: reparacionSeleccionada.cliente,
        dispositivo: reparacionSeleccionada.dispositivo,
        fecha_recepcion: new Date().toLocaleDateString('es-AR'),
        hora_recepcion: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        nuevo_estado: 'Esperando Diagnóstico',
        observaciones_fisicas: obsFisicas,
        datosBackend: repActualizada
      });

      dispararMensaje(
        'success',
        '¡Dispositivo recepcionado con éxito! El sistema ha emitido y enviado el comprobante PDF al cliente.'
      );

      // Ocultar formulario de edición
      setReparacionSeleccionada(null);

      // Actualizar listado de pendientes en segundo plano
      buscarReparaciones(terminoBusqueda);
    } catch (err) {
      console.error('Error al recepcionar dispositivo:', err);
      const resError = err.response?.data;
      let mensajeError = 'No fue posible completar la recepción del dispositivo.';

      if (resError) {
        if (typeof resError.error === 'string') {
          mensajeError = resError.error;
        } else if (typeof resError.detail === 'string') {
          mensajeError = resError.detail;
        } else if (resError.observaciones_fisicas) {
          mensajeError = Array.isArray(resError.observaciones_fisicas)
            ? resError.observaciones_fisicas[0]
            : resError.observaciones_fisicas;
        } else if (typeof resError === 'string') {
          mensajeError = resError;
        }
      }

      dispararMensaje('error', mensajeError);
    } finally {
      setEnviando(false);
    }
  };

  // 8. Reiniciar y preparar para recepcionar otro equipo
  const handleRecepcionarOtro = () => {
    setTicketExito(null);
    setReparacionSeleccionada(null);
    setTerminoBusqueda('');
    buscarReparaciones('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      {/* Alerta local flotante en caso de no estar conectada por prop */}
      <AnimatePresence>
        {alertaLocal && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium shadow-xl ${
              alertaLocal.tipo === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{alertaLocal.tipo === 'success' ? '⚡' : '⚠️'}</span>
              <span>{alertaLocal.mensaje}</span>
            </div>
            <button
              onClick={() => setAlertaLocal(null)}
              className="text-slate-400 hover:text-white ml-3 text-sm"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Encabezado del Módulo Mostrador */}
      <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-mono font-semibold border border-cyan-500/30">
              Mesa de Entrada & Mostrador
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Auditoría Física y Emisión de Comprobante
            </span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Recepcionar Dispositivo en Taller
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
            Verifica los datos precargados por el cliente, asienta el estado estético del equipo al momento exacto de su ingreso al mostrador y emite el comprobante digital formal.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => buscarReparaciones(terminoBusqueda)}
            disabled={cargandoBusqueda}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <span className={cargandoBusqueda ? 'animate-spin' : ''}>🔄</span>
            <span>Actualizar Pendientes</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TICKET GIGANTE DE ÉXITO (POST-RECEPCIÓN)                                   */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {ticketExito && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="bg-gradient-to-b from-[#1E293B] to-[#0F172A] border-2 border-[#06B6D4]/50 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-cyan-950/40 relative overflow-hidden"
          >
            {/* Resplandor Cyber-Tech en fondo */}
            <div className="absolute -right-16 -top-16 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -left-16 -bottom-16 w-56 h-56 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-[#06B6D4]/60 flex items-center justify-center text-3xl shadow-lg shadow-cyan-500/20">
                📦
              </div>

              <div>
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                  Ingreso Asentado con Éxito
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-white mt-2 tracking-tight">
                  ¡Dispositivo Recepcionado con Éxito!
                </h2>
                <p className="text-sm text-cyan-200/90 mt-1">
                  El sistema ha emitido y enviado el comprobante PDF oficial al correo electrónico del cliente.
                </p>
              </div>

              {/* Ficha Resumida del Comprobante Generado */}
              <div className="w-full bg-[#0F172A]/80 border border-slate-700/80 rounded-xl p-4 sm:p-5 text-left text-xs space-y-3 font-sans">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="font-mono text-slate-400 uppercase tracking-wider text-[11px]">
                    Orden Técnica N° #{ticketExito.id_reparacion}
                  </span>
                  <span className="font-mono text-cyan-300 font-bold bg-cyan-500/10 px-2.5 py-0.5 rounded border border-cyan-500/30">
                    PIN: {ticketExito.codigo_seguridad}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-300">
                  <div>
                    <span className="text-slate-400 block text-[11px] font-mono">Cliente:</span>
                    <span className="font-semibold text-white text-sm">
                      {ticketExito.cliente?.nombre_completo || ticketExito.cliente?.email || 'Cliente'}
                    </span>
                    <span className="text-slate-400 block text-[11px] mt-0.5">
                      DNI: {ticketExito.cliente?.dni || 'No declarado'} • {ticketExito.cliente?.email}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px] font-mono">Dispositivo Ingresado:</span>
                    <span className="font-semibold text-white text-sm">
                      {ticketExito.dispositivo?.marca} {ticketExito.dispositivo?.modelo}
                    </span>
                    <span className="text-cyan-400 font-mono block text-[11px] mt-0.5">
                      SN: {ticketExito.dispositivo?.numero_serie || 'Sin número de serie'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px] font-mono">Fecha y Hora de Ingreso:</span>
                    <span className="font-mono text-white">
                      {ticketExito.fecha_recepcion} a las {ticketExito.hora_recepcion} hs
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px] font-mono">Nuevo Estado en Circuito:</span>
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {formatearEstadoReparacion(ticketExito.nuevo_estado)}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-2.5">
                  <span className="text-slate-400 block text-[11px] font-mono mb-1">
                    Auditoría Estética y Observaciones Físicas:
                  </span>
                  <p className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg text-slate-200 text-xs italic">
                    &ldquo;{ticketExito.observaciones_fisicas}&rdquo;
                  </p>
                </div>
              </div>

              {/* Botón para volver a la Fase 1 */}
              <div className="pt-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleRecepcionarOtro}
                  className="w-full sm:w-auto px-8 py-3 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-cyan-500/25 hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>✨</span>
                  <span>Recepcionar Otro Equipo</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* FASE 1: BUSCADOR DESTACADO DE ÓRDENES EN 'ESPERANDO_DISPOSITIVO'             */}
      {/* ========================================================================= */}
      {!ticketExito && (
        <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>🔍</span>
                <span>Fase 1: Búsqueda de Orden Pendiente de Ingreso</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Localiza la orden del cliente para verificar los datos cargados previamente de forma virtual.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/30 self-start sm:self-auto">
              {reparacionesPendientes.length} órdenes en espera
            </span>
          </div>

          {/* Formulario del Buscador */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              buscarReparaciones();
            }}
            className="flex flex-col sm:flex-row gap-3 items-stretch"
          >
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Ingrese DNI, Correo o Código de Seguridad del cliente..."
                value={terminoBusqueda}
                onChange={(e) => setTerminoBusqueda(e.target.value)}
                className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-3.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6] transition-all duration-200 font-sans pr-10"
              />
              {terminoBusqueda && (
                <button
                  type="button"
                  onClick={() => {
                    setTerminoBusqueda('');
                    buscarReparaciones('');
                  }}
                  className="absolute right-3 top-3 text-slate-400 hover:text-white text-xs p-1"
                  title="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={cargandoBusqueda}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] text-white text-xs sm:text-sm font-bold shadow-lg shadow-purple-500/20 hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{cargandoBusqueda ? 'Buscando...' : 'Buscar Orden'}</span>
              <span>🔍</span>
            </button>
          </form>

          {/* Listado de Resultados de Órdenes Pendientes */}
          <div className="border-t border-slate-700/60 pt-4">
            {cargandoBusqueda ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-28 bg-slate-900/60 rounded-xl border border-slate-800 animate-pulse"
                  />
                ))}
              </div>
            ) : reparacionesPendientes.length === 0 ? (
              <div className="py-10 text-center text-slate-400 space-y-2">
                <span className="text-3xl">📭</span>
                <p className="text-sm font-semibold text-slate-300">
                  {busquedaRealizada && terminoBusqueda
                    ? 'No se encontraron órdenes en espera de dispositivo con ese criterio.'
                    : 'No hay reparaciones en estado "Esperando Dispositivo" actualmente.'}
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Verifica que el cliente haya iniciado formalmente su orden de reparación o que no haya sido recepcionada con anterioridad.
                </p>
                {terminoBusqueda && (
                  <button
                    type="button"
                    onClick={() => {
                      setTerminoBusqueda('');
                      buscarReparaciones('');
                    }}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-cyan-400 font-semibold transition-colors"
                  >
                    Ver todas las órdenes en espera
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[460px] overflow-y-auto pr-1">
                {reparacionesPendientes.map((rep) => {
                  const isSelected = reparacionSeleccionada?.id_reparacion === rep.id_reparacion;
                  const clienteNombre =
                    rep.cliente?.nombre_completo ||
                    rep.cliente?.email ||
                    'Cliente del Sistema';
                  const disp = rep.dispositivo || {};
                  const pinSeguridad = rep.codigo_seguridad || rep.codigo_sec || null;

                  return (
                    <div
                      key={rep.id_reparacion}
                      onClick={() => handleSeleccionarReparacion(rep)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-3 ${
                        isSelected
                          ? 'bg-slate-800 border-[#06B6D4] shadow-lg shadow-cyan-950/40 ring-1 ring-[#06B6D4]'
                          : 'bg-[#0F172A]/80 border-slate-700/80 hover:border-[#8B5CF6]/60 hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="space-y-2">
                        {/* Cabecera de la Tarjeta */}
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-cyan-400">
                            Orden #{rep.id_reparacion}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            {formatearEstadoReparacion(rep.etapa)}
                          </span>
                        </div>

                        {/* Datos del Dispositivo */}
                        <div>
                          <h4 className="text-white font-bold text-sm tracking-tight">
                            {disp.marca || 'Equipo'} {disp.modelo || ''}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span className="font-mono text-cyan-300">
                              SN: {disp.numero_serie || 'S/N'}
                            </span>
                            <span>•</span>
                            <span>{disp.tipo || 'Dispositivo'}</span>
                          </div>
                        </div>

                        {/* Datos del Cliente */}
                        <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80 text-xs">
                          <div className="text-slate-300 font-semibold truncate flex items-center gap-1.5">
                            <span>👤</span>
                            <span>{clienteNombre}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
                            <span>DNI: {rep.cliente?.dni || 'No declarado'}</span>
                            <span className="font-mono text-slate-400">
                              📅 {rep.fecha_inicio || 'Hoy'}
                            </span>
                          </div>
                        </div>

                        {/* Código de Seguridad y Credencial si existen */}
                        <div className="space-y-1">
                          {pinSeguridad && (
                            <div className="text-[11px] font-mono text-purple-300 flex items-center justify-between bg-purple-950/30 px-2 py-1 rounded border border-purple-800/40">
                              <span>Código de Entrega:</span>
                              <span className="font-bold">{pinSeguridad}</span>
                            </div>
                          )}
                          {rep.credencial_acceso && rep.credencial_acceso !== 'Ninguna' && (
                            <div className="text-[11px] font-mono text-cyan-300 flex items-center justify-between bg-cyan-950/40 px-2 py-1 rounded border border-cyan-800/40">
                              <span>Credencial Cliente:</span>
                              <span className="font-bold">🔑 {rep.credencial_acceso}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botón o indicador de selección */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSeleccionarReparacion(rep);
                        }}
                        className={`w-full py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'bg-[#06B6D4] text-slate-950 shadow-md shadow-cyan-500/20'
                            : 'bg-slate-800 text-slate-200 hover:bg-[#06B6D4]/10 hover:text-[#06B6D4] border border-slate-700'
                        }`}
                      >
                        <span>{isSelected ? '✓ Seleccionada para mostrador' : 'Recepcionar este equipo'}</span>
                        <span>📦</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FASE 2: FORMULARIO DE RECEPCIÓN Y AUDITORÍA FÍSICA (EL MOSTRADOR)          */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {!ticketExito && reparacionSeleccionada && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: 15 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: 15 }}
            transition={{ duration: 0.35 }}
            className="overflow-hidden"
          >
            <div className="bg-[#1E293B] border-2 border-[#8B5CF6]/50 rounded-2xl p-6 sm:p-7 shadow-2xl shadow-purple-950/30 space-y-6">
              
              {/* Barra Superior de la Fase 2 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 text-xs font-mono font-bold border border-purple-500/30 uppercase tracking-wider">
                      Fase 2: El Mostrador
                    </span>
                    <span className="text-xs text-cyan-400 font-mono font-bold">
                      Orden #{reparacionSeleccionada.id_reparacion}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white mt-1 tracking-tight">
                    Auditoría de Ingreso y Confirmación de Recepción
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Revisa con el cliente los datos declarados virtualmente y asienta el estado estético/físico frente a él.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCancelarRecepcion}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors self-start sm:self-center"
                >
                  ✕ Descartar y Cambiar Orden
                </button>
              </div>

              {/* Ficha Resumida del Equipo y Titular */}
              <div className="bg-[#0F172A]/90 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-mono block text-[11px]">Cliente Titular:</span>
                  <span className="font-bold text-white text-sm">
                    {reparacionSeleccionada.cliente?.nombre_completo ||
                      reparacionSeleccionada.cliente?.email ||
                      'Cliente'}
                  </span>
                  <span className="text-slate-400 block text-[11px]">
                    DNI: {reparacionSeleccionada.cliente?.dni || 'No declarado'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 font-mono block text-[11px]">Equipo a Recepcionar:</span>
                  <span className="font-bold text-white text-sm">
                    {reparacionSeleccionada.dispositivo?.marca} {reparacionSeleccionada.dispositivo?.modelo}
                  </span>
                  <span className="text-cyan-400 font-mono block text-[11px]">
                    Serie: {reparacionSeleccionada.dispositivo?.numero_serie || 'Sin número de serie'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 font-mono block text-[11px]">Credencial Declarada:</span>
                  <span className="font-mono font-bold text-cyan-300 text-sm flex items-center gap-1.5 mt-0.5">
                    <span>🔑</span>
                    <span>{reparacionSeleccionada.credencial_acceso || 'Ninguna'}</span>
                  </span>
                  <span className="text-slate-400 block text-[11px] mt-0.5">
                    PIN Entrega: <strong className="text-purple-300 font-mono">{reparacionSeleccionada.codigo_seguridad || reparacionSeleccionada.codigo_sec || 'N/A'}</strong>
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 font-mono block text-[11px]">Estado Inicial:</span>
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    {formatearEstadoReparacion(reparacionSeleccionada.etapa)}
                  </span>
                  <span className="text-slate-400 block text-[11px] mt-0.5">
                    Transiciona a: <strong className="text-amber-300">Esperando Diagnóstico</strong>
                  </span>
                </div>
              </div>

              {/* Formulario Principal de Edición y Auditoría Física */}
              <form onSubmit={handleConfirmarRecepcion} className="space-y-5">
                
                {/* 1. Descripción del Problema (Editable) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                      Descripción del Problema Declarado por el Cliente
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Editable en mostrador
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={formDatos.descripcion_problema}
                    onChange={(e) =>
                      setFormDatos({ ...formDatos, descripcion_problema: e.target.value })
                    }
                    placeholder="Detalla o corrige el síntoma declarado por el cliente..."
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4] transition-colors leading-relaxed"
                    required
                  />
                </div>

                {/* 2. Categorías de Reparación (Chips interactivos / Checkboxes) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                      Categorías de Servicio Asociadas *
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {formDatos.ids_categorias.length} seleccionada(s)
                    </span>
                  </div>

                  {cargandoCategorias ? (
                    <div className="h-10 bg-slate-900 rounded-xl border border-slate-800 animate-pulse" />
                  ) : categoriasDisponibles.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No hay categorías activas registradas.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {/* Campo buscador con lista desplegable interactiva (Combobox) */}
                      <div ref={dropdownRef} className="relative">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Escribe para buscar categoría (ej. Pantalla, Batería, Conector)..."
                            value={busquedaCategoria}
                            onFocus={() => setDropdownAbierto(true)}
                            onChange={(e) => {
                              setBusquedaCategoria(e.target.value);
                              setDropdownAbierto(true);
                            }}
                            className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-white placeholder-slate-500 text-xs font-medium focus:outline-none focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 transition-all duration-200"
                          />
                          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">
                            🔍
                          </span>
                          <button
                            type="button"
                            onClick={() => setDropdownAbierto(!dropdownAbierto)}
                            className="absolute right-2.5 top-2 text-cyan-400 hover:text-cyan-300 p-1 text-xs"
                            title="Desplegar categorías"
                          >
                            {dropdownAbierto ? '▲' : '▼'}
                          </button>
                        </div>

                        {/* Menú flotante desplegable */}
                        <AnimatePresence>
                          {dropdownAbierto && (
                            <motion.div
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              transition={{ duration: 0.15 }}
                              className="absolute z-30 left-0 right-0 mt-1 bg-[#0F172A] border border-cyan-500/40 rounded-xl shadow-2xl shadow-cyan-950/60 max-h-56 overflow-y-auto overflow-x-hidden custom-scrollbar divide-y divide-slate-800/60"
                            >
                              {categoriasFiltradas.length === 0 ? (
                                <div className="p-3 text-center text-xs text-slate-400 italic">
                                  No se encontraron categorías que coincidan con &ldquo;{busquedaCategoria}&rdquo;.
                                </div>
                              ) : (
                                categoriasFiltradas.map((cat) => {
                                  const yaSeleccionada = formDatos.ids_categorias.includes(cat.id_categoria);
                                  return (
                                    <button
                                      key={cat.id_categoria}
                                      type="button"
                                      onClick={() => {
                                        handleToggleCategoria(cat.id_categoria);
                                      }}
                                      className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                                        yaSeleccionada
                                          ? 'bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                                      }`}
                                    >
                                      <span className="font-medium truncate">{cat.nombre}</span>
                                      {yaSeleccionada ? (
                                        <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/40 shrink-0">
                                          ✓ Asignada
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-mono text-slate-500 hover:text-cyan-400">
                                          + Asignar
                                        </span>
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Chips de categorías asignadas */}
                      {formDatos.ids_categorias.length > 0 ? (
                        <div className="flex flex-wrap gap-2 p-2.5 bg-[#0F172A]/80 border border-slate-800 rounded-xl">
                          {formDatos.ids_categorias.map((idCat) => {
                            const cat = categoriasDisponibles.find((c) => c.id_categoria === idCat);
                            const nombre = cat ? cat.nombre : `Categoría #${idCat}`;
                            return (
                              <span
                                key={idCat}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500/15 border border-[#06B6D4]/40 text-cyan-200 text-xs font-semibold shadow-sm"
                              >
                                <span>{nombre}</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleCategoria(idCat)}
                                  className="text-cyan-400 hover:text-white hover:bg-cyan-500/30 rounded-full w-4 h-4 flex items-center justify-center text-[10px] transition-colors cursor-pointer"
                                  title={`Quitar ${nombre}`}
                                >
                                  ✕
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          Escribe en el campo o abre la lista para asociar categorías a la orden.
                        </p>
                      )}
                    </div>
                  )}
                  {formDatos.ids_categorias.length === 0 && (
                    <p className="text-[11px] text-rose-400 font-mono mt-1">
                      ⚠️ Debe seleccionar al menos una categoría de servicio para avanzar.
                    </p>
                  )}
                </div>

                {/* 3. Credencial de Acceso (PIN / Patrón / Contraseña) */}
                <div>
                  <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                    Credencial o Patrón de Acceso al Dispositivo
                  </label>
                  <input
                    type="text"
                    value={formDatos.credencial_acceso}
                    onChange={(e) =>
                      setFormDatos({ ...formDatos, credencial_acceso: e.target.value })
                    }
                    placeholder="Ej. PIN 1234, Patrón en L, o 'Ninguna' si no posee bloqueo"
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4] transition-colors"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Indica el código de desbloqueo provisto por el cliente para pruebas técnicas, o deja &ldquo;Ninguna&rdquo;.
                  </p>
                </div>

                {/* 4. EL CAMPO LEGAL (Crítico): Observaciones Físicas y Estéticas */}
                <div className="bg-amber-500/5 border-2 border-amber-500/40 rounded-xl p-4 sm:p-5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <label className="text-xs font-mono font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span>⚖️</span>
                      <span>Observaciones Físicas y Estado Estético del Equipo (Campo Legal) *</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-amber-400">
                      Obligatorio • Mín. 5 caracteres
                    </span>
                  </div>

                  {/* Subtítulo de Advertencia Requerido */}
                  <p className="text-xs font-semibold text-amber-200/90 leading-snug">
                    Obligatorio: Detalle rayones, golpes o estado general para salvaguardar la responsabilidad del taller.
                  </p>

                  <textarea
                    rows={4}
                    value={formDatos.observaciones_fisicas}
                    onChange={(e) =>
                      setFormDatos({ ...formDatos, observaciones_fisicas: e.target.value })
                    }
                    placeholder="Ej. Pantalla con micro-rayones en zona superior derecha, bisel metálico golpeado en esquina inferior, módulo enciende correctamente, sin tarjeta SIM ni funda..."
                    className="w-full bg-[#0F172A] border border-amber-500/50 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-colors leading-relaxed mt-1"
                    required
                  />

                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                    <span>
                      {formDatos.observaciones_fisicas.trim().length < 5 ? (
                        <span className="text-rose-400">
                          ⚠️ Faltan {5 - formDatos.observaciones_fisicas.trim().length} caracteres mínimos
                        </span>
                      ) : (
                        <span className="text-emerald-400">
                          ✓ Validación estética completada para comprobante legal
                        </span>
                      )}
                    </span>
                    <span>{formDatos.observaciones_fisicas.trim().length} caracteres</span>
                  </div>
                </div>

                {/* Botones de Acción */}
                <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-700/80">
                  <button
                    type="button"
                    onClick={handleCancelarRecepcion}
                    disabled={enviando}
                    className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all cursor-pointer"
                  >
                    Cancelar Operación
                  </button>

                  <button
                    type="submit"
                    disabled={!esFormularioValido || enviando}
                    className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-black text-xs sm:text-sm tracking-wide transition-all flex items-center justify-center gap-2 ${
                      esFormularioValido && !enviando
                        ? 'bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-slate-950 shadow-xl shadow-cyan-500/25 hover:opacity-95 hover:shadow-cyan-500/35 cursor-pointer active:scale-[0.99]'
                        : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                    }`}
                  >
                    {enviando ? (
                      <>
                        <span className="animate-spin">🔄</span>
                        <span>Validando ingreso...</span>
                      </>
                    ) : (
                      <>
                        <span>📦</span>
                        <span>Confirmar Recepción e Ingresar a Taller</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

RecepcionarDispositivo.propTypes = {
  onAlerta: PropTypes.func
};
