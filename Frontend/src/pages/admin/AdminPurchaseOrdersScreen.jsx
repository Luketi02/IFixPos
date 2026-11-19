import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';
import DetalleOrdenCompraModal from '../../components/purchases/DetalleOrdenCompraModal';
import GenerarOrdenCompraModal from '../../components/purchases/GenerarOrdenCompraModal';
import RecepcionarCompraModal from '../../components/purchases/RecepcionarCompraModal';

import { API_BASE_URL } from '../../config/api';
export default function AdminPurchaseOrdersScreen() {
  const { token } = useAuth();
  const { id_orden: idOrdenUrl } = useParams();
  const navigate = useNavigate();

  // Estado principal del padrón de Órdenes de Compra
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorAlerta, setErrorAlerta] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');
  const [erroresCampos, setErroresCampos] = useState({});

  // Lista de proveedores para el filtro de Proveedor Destinatario
  const [proveedores, setProveedores] = useState([]);

  // Fila expandida para previsualizar renglones rápidos de una orden
  const [ordenExpandidaId, setOrdenExpandidaId] = useState(null);

  // Modal de Consulta de Orden de Compra en Solo Lectura (CU-57)
  const [modalDetalleOpen, setModalDetalleOpen] = useState(false);
  const [idOrdenDetalle, setIdOrdenDetalle] = useState(null);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState(null);

  // Modal para Generar Nueva Orden de Compra (CU-54)
  const [modalGenerarOpen, setModalGenerarOpen] = useState(false);

  // Modal para Recepcionar Mercadería de Orden de Compra (CU-55)
  const [modalRecepcionarOpen, setModalRecepcionarOpen] = useState(false);
  const [idOrdenRecepcionar, setIdOrdenRecepcionar] = useState(null);
  const [ordenParaRecepcionar, setOrdenParaRecepcionar] = useState(null);

  // Estados del Motor Automatizado e Inteligente de Abastecimiento
  const [estadoMotor, setEstadoMotor] = useState(null);
  const [cargandoEstadoMotor, setCargandoEstadoMotor] = useState(false);
  const [ejecutandoMotor, setEjecutandoMotor] = useState(false);
  const [resumenMotor, setResumenMotor] = useState(null);
  const [modalResumenMotorOpen, setModalResumenMotorOpen] = useState(false);
  const [modalArticulosCriticosOpen, setModalArticulosCriticosOpen] = useState(false);

  // Si se accede mediante enlace directo /admin/ordenes-compra/:id_orden, abrir el expediente automáticamente
  useEffect(() => {
    if (idOrdenUrl !== undefined && idOrdenUrl !== null && String(idOrdenUrl).trim() !== '') {
      setIdOrdenDetalle(idOrdenUrl);
      setOrdenSeleccionada(null);
      setModalDetalleOpen(true);
    }
  }, [idOrdenUrl]);

  const handleAbrirDetalleOrden = (orden) => {
    setOrdenSeleccionada(orden);
    setIdOrdenDetalle(orden.id_orden);
    setModalDetalleOpen(true);
  };

  const handleCerrarDetalleOrden = () => {
    setModalDetalleOpen(false);
    setOrdenSeleccionada(null);
    setIdOrdenDetalle(null);
    if (idOrdenUrl) {
      navigate('/admin/ordenes-compra', { replace: true });
    }
  };

  const handleAbrirRecepcionar = (orden) => {
    setOrdenParaRecepcionar(orden);
    setIdOrdenRecepcionar(orden.id_orden);
    setModalRecepcionarOpen(true);
  };

  const handleCerrarRecepcionar = () => {
    setModalRecepcionarOpen(false);
    setOrdenParaRecepcionar(null);
    setIdOrdenRecepcionar(null);
  };

  // Parámetros estrictos de filtrado (ID Orden, Estado, Fechas Desde/Hasta, Tipo Recepción, Proveedor)
  const [filtros, setFiltros] = useState({
    id_orden: '',
    estado_orden: '',
    fecha_desde: '',
    fecha_hasta: '',
    tipo_entrega: '',
    cuit_prov: ''
  });

  // Auto-cierre de alertas de error a los 6 segundos (Regla 6)
  useEffect(() => {
    if (!errorAlerta) return undefined;
    const timer = setTimeout(() => setErrorAlerta(''), 6000);
    return () => clearTimeout(timer);
  }, [errorAlerta]);

  // Auto-cierre de alertas de éxito a los 6 segundos (Regla 6)
  useEffect(() => {
    if (!mensajeExito) return undefined;
    const timer = setTimeout(() => setMensajeExito(''), 6000);
    return () => clearTimeout(timer);
  }, [mensajeExito]);

  // Carga del estado y diagnósticos del motor inteligente de abastecimiento
  const consultarEstadoMotor = useCallback(async () => {
    try {
      setCargandoEstadoMotor(true);
      const activeToken = token || localStorage.getItem('access_token');
      const config = {
        headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {}
      };
      const resp = await axios.get(`${API_BASE_URL}/api/purchases/motor-abastecimiento/estado/`, config);
      setEstadoMotor(resp.data);
    } catch {
      // Si falla la consulta del motor, no bloqueamos la pantalla
    } finally {
      setCargandoEstadoMotor(false);
    }
  }, [token]);

  useEffect(() => {
    consultarEstadoMotor();
  }, [consultarEstadoMotor]);

  // Ejecución manual forzada del ciclo inteligente de abastecimiento
  const handleEjecutarMotorAhora = async () => {
    try {
      setEjecutandoMotor(true);
      setErrorAlerta('');
      const activeToken = token || localStorage.getItem('access_token');
      const config = {
        headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {}
      };
      const resp = await axios.post(
        `${API_BASE_URL}/api/purchases/motor-abastecimiento/ejecutar/`,
        { forzar_ejecucion: true },
        config
      );
      setResumenMotor(resp.data?.resumen || resp.data);
      setModalResumenMotorOpen(true);
      consultarOrdenesCompra(filtros);
      consultarEstadoMotor();
    } catch (err) {
      const dataErr = err?.response?.data;
      const msg = dataErr?.error || dataErr?.detail || 'No se pudo completar la ejecución del motor de abastecimiento.';
      setErrorAlerta(msg);
    } finally {
      setEjecutandoMotor(false);
    }
  };

  // Carga auxiliar del padrón de proveedores para el selector de filtrado
  useEffect(() => {
    const cargarProveedores = async () => {
      try {
        const activeToken = token || localStorage.getItem('access_token');
        const config = {
          headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {}
        };
        const resp = await axios.get(`${API_BASE_URL}/api/purchases/proveedores/`, config);
        if (Array.isArray(resp.data)) {
          setProveedores(resp.data);
        }
      } catch {
        // Fallback silencioso si no se pudo precargar el listado auxiliar
      }
    };
    cargarProveedores();
  }, [token]);

  // Validación previa en cliente (Doble Validación - Regla 7)
  const validarParametrosFiltro = (params) => {
    const nuevosErrores = {};

    // 1. Validar que el ID de la Orden sea estrictamente numérico positivo
    const idTrim = String(params.id_orden || '').trim();
    if (idTrim !== '') {
      if (!/^\d+$/.test(idTrim) || Number(idTrim) <= 0) {
        nuevosErrores.id_orden = 'El N° de Orden debe ser un valor estrictamente numérico entero positivo.';
      }
    }

    // 2. Validar coherencia cronológica del rango de fechas de emisión
    if (params.fecha_desde && params.fecha_hasta && params.fecha_desde > params.fecha_hasta) {
      nuevosErrores.fechas = 'El rango temporal es inconsistente: la "Fecha Desde" no puede ser posterior a la "Fecha Hasta".';
    }

    setErroresCampos(nuevosErrores);

    if (Object.keys(nuevosErrores).length > 0) {
      const primerMensaje = Object.values(nuevosErrores)[0];
      setErrorAlerta(primerMensaje);
      return false;
    }
    return true;
  };

  // Consulta y filtrado de Órdenes de Compra hacia el Backend
  const consultarOrdenesCompra = useCallback(async (paramsFiltro = filtros) => {
    setErrorAlerta('');

    if (!validarParametrosFiltro(paramsFiltro)) {
      return;
    }

    setCargando(true);
    try {
      const activeToken = token || localStorage.getItem('access_token');
      const config = {
        headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
        params: {}
      };

      const idLimpio = String(paramsFiltro.id_orden || '').trim();
      if (idLimpio) config.params.id_orden = idLimpio;
      if (paramsFiltro.estado_orden !== '') config.params.estado_orden = paramsFiltro.estado_orden;
      if (paramsFiltro.fecha_desde) config.params.fecha_desde = paramsFiltro.fecha_desde;
      if (paramsFiltro.fecha_hasta) config.params.fecha_hasta = paramsFiltro.fecha_hasta;
      if (paramsFiltro.tipo_entrega !== '') config.params.tipo_entrega = paramsFiltro.tipo_entrega;
      if (paramsFiltro.cuit_prov.trim()) config.params.cuit_prov = paramsFiltro.cuit_prov.trim();

      const resp = await axios.get(`${API_BASE_URL}/api/purchases/ordenes-compra/filtrar/`, config);
      setOrdenes(Array.isArray(resp.data) ? resp.data : []);
    } catch (err) {
      const dataErr = err?.response?.data;
      let serverMsg = 'No se pudo procesar la consulta de órdenes de compra.';
      if (typeof dataErr === 'object' && dataErr !== null) {
        const firstVal = Object.values(dataErr)[0];
        if (Array.isArray(firstVal) && firstVal.length > 0) {
          serverMsg = String(firstVal[0]);
        } else if (typeof dataErr.error === 'string') {
          serverMsg = dataErr.error;
        } else if (typeof dataErr.detail === 'string') {
          serverMsg = dataErr.detail;
        }
      }
      setErrorAlerta(serverMsg);
      setOrdenes([]);
    } finally {
      setCargando(false);
    }
  }, [filtros, token]);

  const consultarOrdenesRef = useRef(consultarOrdenesCompra);
  consultarOrdenesRef.current = consultarOrdenesCompra;

  // Carga inicial al montar la pantalla
  useEffect(() => {
    consultarOrdenesRef.current();
  }, [token]);

  const handleFiltroChange = (e) => {
    const { name, value } = e.target;
    setFiltros((prev) => ({ ...prev, [name]: value }));
    if (erroresCampos[name] || ( (name === 'fecha_desde' || name === 'fecha_hasta') && erroresCampos.fechas )) {
      setErroresCampos((prev) => {
        const copia = { ...prev };
        delete copia[name];
        if (name === 'fecha_desde' || name === 'fecha_hasta') delete copia.fechas;
        return copia;
      });
    }
  };

  const handleSubmitFiltros = (e) => {
    e.preventDefault();
    consultarOrdenesCompra(filtros);
  };

  const handleLimpiarFiltros = () => {
    const vacios = {
      id_orden: '',
      estado_orden: '',
      fecha_desde: '',
      fecha_hasta: '',
      tipo_entrega: '',
      cuit_prov: ''
    };
    setErroresCampos({});
    setErrorAlerta('');
    setFiltros(vacios);
    consultarOrdenesCompra(vacios);
  };

  const handleFiltroRapidoEstado = (codigoEstado) => {
    const nuevoEstado = String(filtros.estado_orden) === String(codigoEstado) ? '' : String(codigoEstado);
    const nuevosFiltros = { ...filtros, estado_orden: nuevoEstado };
    setFiltros(nuevosFiltros);
    consultarOrdenesCompra(nuevosFiltros);
  };

  // Cálculo de métricas ejecutivas sobre los resultados actuales
  const metricas = useMemo(() => {
    const total = ordenes.length;
    const esperando = ordenes.filter((o) => o.estado_orden === 1).length;
    const entregadas = ordenes.filter((o) => o.estado_orden === 2 || o.estado_orden === 4).length;
    const canceladas = ordenes.filter((o) => o.estado_orden === 3).length;
    const montoTotal = ordenes.reduce((acc, o) => acc + (Number(o.monto_total) || 0), 0);
    return { total, esperando, entregadas, canceladas, montoTotal };
  }, [ordenes]);

  const formatMoneda = (valor) => {
    const num = Number(valor) || 0;
    return `$ ${num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatFecha = (fechaIso) => {
    if (!fechaIso) return '—';
    const partes = String(fechaIso).split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return fechaIso;
  };

  const renderBadgeEstado = (estadoOrden) => {
    switch (Number(estadoOrden)) {
      case 0:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Borrador
          </span>
        );
      case 1:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Esperando Entrega
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Entregada
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Cancelada / Incumplida
          </span>
        );
      case 4:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            Entregada Parcialmente
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-700/40 text-slate-300 border border-slate-600">
            Desconocido
          </span>
        );
    }
  };

  const renderBadgeRecepcion = (tipoEntrega) => {
    if (Number(tipoEntrega) === 2) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30">
          <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
          </svg>
          Envío a Domicilio
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
        <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        Retiro en Sucursal
      </span>
    );
  };

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-['Lexend',sans-serif] overflow-hidden">
      {/* Sidebar de Navegación Persistente */}
      <AdminSidebar activeMenu="purchases-orders" />

      {/* Contenedor Principal con Scroll */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Cabecera Superior Unificada */}
        <AdminHeader
          category="Compras & Abastecimiento"
          pageName="Órdenes de Compra"
          title="Gestión de Órdenes de Compra"
        />

        {/* Cuerpo Principal */}
        <main className="p-8 space-y-6">
          {/* Cabecera Operativa con Botón de Creación */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Registro y Emisión de Órdenes</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleEjecutarMotorAhora}
                disabled={ejecutandoMotor}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer shadow-lg ${
                  ejecutandoMotor
                    ? 'bg-violet-950/60 border-violet-500/40 text-violet-300 cursor-not-allowed'
                    : 'bg-violet-600 hover:bg-violet-500 text-white border-violet-400/50 shadow-[0_0_15px_rgba(139,92,246,0.3)]'
                }`}
              >
                {ejecutandoMotor ? (
                  <>
                    <svg className="w-4 h-4 text-violet-300 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Optimizando Compras...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-violet-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Ejecutar Abastecimiento Inteligente</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setModalGenerarOpen(true)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                <svg className="w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                <span>Nueva Orden Manual</span>
              </button>
            </div>
          </div>
          {/* Alertas Flotantes Cyber-Tech en esquina inferior izquierda (Fixed, Zero CLS) */}
          <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2 pointer-events-none max-w-md">
            <AnimatePresence>
              {errorAlerta && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className="pointer-events-auto p-4 bg-rose-950/90 border border-rose-500/50 rounded-2xl text-rose-200 text-xs sm:text-sm font-medium flex items-center justify-between shadow-2xl backdrop-blur-md"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-rose-400 text-base">⚠️</span>
                    <span className="leading-relaxed">{errorAlerta}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorAlerta('')}
                    className="text-slate-400 hover:text-white p-1 ml-2 text-xs font-mono"
                    aria-label="Cerrar error"
                  >
                    ✕
                  </button>
                </motion.div>
              )}

              {mensajeExito && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className="pointer-events-auto p-4 bg-emerald-950/90 border border-emerald-500/50 rounded-2xl text-emerald-200 text-xs sm:text-sm font-medium flex items-center justify-between shadow-2xl backdrop-blur-md"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-emerald-400 text-base">⚡</span>
                    <span className="leading-relaxed">{mensajeExito}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMensajeExito('')}
                    className="text-slate-400 hover:text-white p-1 ml-2 text-xs font-mono"
                    aria-label="Cerrar éxito"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Banner Cyber-Tech: Motor Automatizado e Inteligente de Abastecimiento */}
          {estadoMotor && (
            <div className="p-4 sm:p-5 bg-gradient-to-r from-[#1E293B] via-slate-900 to-[#1E293B] border border-cyan-500/30 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center shrink-0 text-cyan-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">Motor de Abastecimiento Continuo</span>
                    {estadoMotor.activo ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Activo y Operativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Pausado
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      Disparo: {estadoMotor.modo_disparador === 'HIBRIDO' ? 'Híbrido' : estadoMotor.modo_disparador === 'TRANSACCIONAL' ? 'Eventos en Vivo' : 'Programado'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      Lote: {estadoMotor.estrategia_lote === 'BRECHA_MINIMO' ? 'Brecha a Mínimo' : estadoMotor.estrategia_lote === 'DOBLE_MINIMO' ? 'Doble Mínimo' : 'Fijo Mínimo'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Audita stock crítico, demanda de taller ({estadoMotor.espera_urgencia_taller_horas === 0 ? 'emisión al instante' : `${estadoMotor.espera_urgencia_taller_horas}hs espera`}), cotizaciones vigentes y evalúa la mejor compra con matriz multicriterio.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 self-end lg:self-center">
                <button
                  type="button"
                  onClick={() => setModalArticulosCriticosOpen(true)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-2 ${
                    (estadoMotor.articulos_deficitarios_count || 0) > 0
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700/80'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                  <span>
                    {estadoMotor.articulos_deficitarios_count || 0} Insumo(s) en Déficit
                  </span>
                </button>

                <button
                  type="button"
                  onClick={consultarEstadoMotor}
                  disabled={cargandoEstadoMotor}
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                  title="Actualizar diagnóstico del motor"
                >
                  <svg className={`w-4 h-4 ${cargandoEstadoMotor ? 'animate-spin text-cyan-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Tarjetas de Resumen Operativo (KPIs) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-[#1E293B] border border-slate-800 rounded-2xl">
              <div className="text-slate-400 text-xs font-medium">Órdenes Localizadas</div>
              <div className="text-2xl font-black text-white mt-1">{metricas.total}</div>
              <div className="text-[11px] text-slate-500 mt-1">Documentos en bandeja actual</div>
            </div>

            <div className="p-4 bg-[#1E293B] border border-amber-500/20 rounded-2xl">
              <div className="text-amber-400 text-xs font-medium">Esperando Entrega</div>
              <div className="text-2xl font-black text-amber-300 mt-1">{metricas.esperando}</div>
              <div className="text-[11px] text-slate-500 mt-1">Mercadería pendiente de ingreso</div>
            </div>

            <div className="p-4 bg-[#1E293B] border border-emerald-500/20 rounded-2xl">
              <div className="text-emerald-400 text-xs font-medium">Órdenes Recepcionadas</div>
              <div className="text-2xl font-black text-emerald-300 mt-1">{metricas.entregadas}</div>
              <div className="text-[11px] text-slate-500 mt-1">Entregas completas o parciales</div>
            </div>

            <div className="p-4 bg-[#1E293B] border border-cyan-500/20 rounded-2xl">
              <div className="text-cyan-400 text-xs font-medium">Volumen Comprometido</div>
              <div className="text-2xl font-black text-cyan-300 mt-1">{formatMoneda(metricas.montoTotal)}</div>
              <div className="text-[11px] text-slate-500 mt-1">Suma de órdenes listadas</div>
            </div>
          </div>

          {/* Panel de Filtros de Órdenes de Compra */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Parámetros de Búsqueda y Filtrado de Órdenes</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Filtre el registro histórico y activo por número exacto de orden, estado logístico, fechas de emisión, modalidad de recepción o proveedor adjudicado
                </p>
              </div>

              {/* Botones rápidos de segmentación por estado */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { code: '', label: 'Todas' },
                  { code: '0', label: 'Borrador' },
                  { code: '1', label: 'Esperando Entrega' },
                  { code: '2', label: 'Entregada' },
                  { code: '4', label: 'Entrega Parcial' },
                  { code: '3', label: 'Cancelada / Incumplida' }
                ].map((tab) => {
                  const activo = String(filtros.estado_orden) === tab.code;
                  return (
                    <button
                      key={tab.label}
                      type="button"
                      onClick={() =>
                        tab.code === ''
                          ? (() => {
                              const nf = { ...filtros, estado_orden: '' };
                              setFiltros(nf);
                              consultarOrdenesCompra(nf);
                            })()
                          : handleFiltroRapidoEstado(tab.code)
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                        activo
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                          : 'bg-[#0F172A] text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleSubmitFiltros} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                {/* 1. Búsqueda exacta: ID de la Orden */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    N° de Orden (Exacto)
                  </label>
                  <input
                    type="text"
                    name="id_orden"
                    value={filtros.id_orden}
                    onChange={handleFiltroChange}
                    placeholder="Ej: 105"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                      erroresCampos.id_orden
                        ? 'border-rose-500 focus:border-rose-400'
                        : 'border-slate-700/80 focus:border-cyan-400'
                    }`}
                  />
                  {erroresCampos.id_orden && (
                    <p className="mt-1 text-[11px] text-rose-400">{erroresCampos.id_orden}</p>
                  )}
                </div>

                {/* 2. Filtro Categórico: Estado de la Orden */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Estado de la Orden
                  </label>
                  <select
                    name="estado_orden"
                    value={filtros.estado_orden}
                    onChange={handleFiltroChange}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700/80 text-xs text-white focus:outline-none focus:border-cyan-400 transition-colors"
                  >
                    <option value="">Todos los estados</option>
                    <option value="0">Borrador</option>
                    <option value="1">Esperando Entrega</option>
                    <option value="2">Entregada</option>
                    <option value="4">Entregada Parcialmente</option>
                    <option value="3">Cancelada / Incumplida</option>
                  </select>
                </div>

                {/* 3. Filtro Categórico: Tipo de Recepción */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Tipo de Recepción
                  </label>
                  <select
                    name="tipo_entrega"
                    value={filtros.tipo_entrega}
                    onChange={handleFiltroChange}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700/80 text-xs text-white focus:outline-none focus:border-cyan-400 transition-colors"
                  >
                    <option value="">Todas las modalidades</option>
                    <option value="1">Retiro en Sucursal</option>
                    <option value="2">Envío a Domicilio</option>
                  </select>
                </div>

                {/* 4. Filtro Categórico: Proveedor Destinatario */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Proveedor Destinatario
                  </label>
                  <select
                    name="cuit_prov"
                    value={filtros.cuit_prov}
                    onChange={handleFiltroChange}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700/80 text-xs text-white focus:outline-none focus:border-cyan-400 transition-colors"
                  >
                    <option value="">Todos los proveedores</option>
                    {proveedores.map((prov) => (
                      <option key={prov.cuit_prov} value={prov.cuit_prov}>
                        {prov.nombre_proveedor} ({prov.cuit_prov})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. Rango Temporal: Fecha Desde */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Emisión Desde
                  </label>
                  <input
                    type="date"
                    name="fecha_desde"
                    value={filtros.fecha_desde}
                    onChange={handleFiltroChange}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-xs text-white focus:outline-none transition-colors ${
                      erroresCampos.fechas
                        ? 'border-rose-500 focus:border-rose-400'
                        : 'border-slate-700/80 focus:border-cyan-400'
                    }`}
                  />
                </div>

                {/* 6. Rango Temporal: Fecha Hasta */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Emisión Hasta
                  </label>
                  <input
                    type="date"
                    name="fecha_hasta"
                    value={filtros.fecha_hasta}
                    onChange={handleFiltroChange}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-xs text-white focus:outline-none transition-colors ${
                      erroresCampos.fechas
                        ? 'border-rose-500 focus:border-rose-400'
                        : 'border-slate-700/80 focus:border-cyan-400'
                    }`}
                  />
                </div>
              </div>

              {erroresCampos.fechas && (
                <p className="text-[11px] text-rose-400">{erroresCampos.fechas}</p>
              )}

              {/* Acciones del Formulario de Filtrado */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={handleLimpiarFiltros}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700 transition-colors"
                >
                  Limpiar Criterios
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all flex items-center gap-2 font-mono"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>⚡ Filtrar</span>
                </button>
              </div>
            </form>
          </div>

          {/* Tabla de Resultados de Órdenes de Compra */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Registro Histórico y Activo de Órdenes de Compra</span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-400">
                  {ordenes.length} orden(es) localizada(s)
                </span>
              </div>

              <button
                type="button"
                onClick={() => setModalGenerarOpen(true)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 transition-all flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                <span>Nueva Orden de Compra</span>
              </button>
            </div>

            {cargando ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <svg className="w-8 h-8 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <p className="text-xs">Consultando documentos de reabastecimiento...</p>
              </div>
            ) : ordenes.length === 0 ? (
              /* Excepción Paso 5: Mensaje exacto requerido "No se encontraron resultados" */
              <div className="py-16 text-center text-slate-400 px-6">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto mb-3 text-slate-500">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h4 className="text-sm font-bold text-slate-200 mb-1">
                  No se encontraron resultados
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Ninguna orden de compra registrada coincide con los parámetros de búsqueda especificados.
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
                      <th className="px-5 py-3.5">N° Orden</th>
                      <th className="px-4 py-3.5">Emisión / Recepción</th>
                      <th className="px-5 py-3.5">Proveedor Destinatario</th>
                      <th className="px-4 py-3.5 text-center">Tipo de Recepción</th>
                      <th className="px-4 py-3.5 text-center">Ítems</th>
                      <th className="px-5 py-3.5 text-right">Monto Total</th>
                      <th className="px-4 py-3.5 text-center">Estado</th>
                      <th className="px-5 py-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {ordenes.map((orden) => {
                      const expandida = ordenExpandidaId === orden.id_orden;
                      const listaItems = Array.isArray(orden.items) ? orden.items : [];

                      return (
                        <FragmentFilaOrden
                          key={orden.id_orden}
                          orden={orden}
                          expandida={expandida}
                          listaItems={listaItems}
                          onVerDetalle={() => handleAbrirDetalleOrden(orden)}
                          onRecepcionar={() => handleAbrirRecepcionar(orden)}
                          onToggleExpandir={() =>
                            setOrdenExpandidaId((prev) => (prev === orden.id_orden ? null : orden.id_orden))
                          }
                          formatFecha={formatFecha}
                          formatMoneda={formatMoneda}
                          renderBadgeEstado={renderBadgeEstado}
                          renderBadgeRecepcion={renderBadgeRecepcion}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal de Consulta de Orden de Compra en Solo Lectura */}
      <DetalleOrdenCompraModal
        isOpen={modalDetalleOpen}
        onClose={handleCerrarDetalleOrden}
        idOrden={idOrdenDetalle}
        ordenInicial={ordenSeleccionada}
        onRecepcionar={(ordenData) => {
          setModalDetalleOpen(false);
          handleAbrirRecepcionar(ordenData);
        }}
      />

      {/* Modal de Generación y Optimización de Órdenes de Compra (montaje condicional) */}
      {modalGenerarOpen && (
        <GenerarOrdenCompraModal
          isOpen={modalGenerarOpen}
          onClose={() => setModalGenerarOpen(false)}
          onOrdenesEmitidas={(nuevasOrdenes) => {
            consultarOrdenesCompra(filtros);
            if (Array.isArray(nuevasOrdenes) && nuevasOrdenes.length > 0) {
              setMensajeExito(
                `Se generaron y despacharon ${nuevasOrdenes.length} orden(es) de compra en estado "Esperando Entrega" con su comprobante PDF enviado al proveedor.`
              );
            }
          }}
        />
      )}

      {/* Modal de Recepción Física de Mercadería y Conciliación */}
      <RecepcionarCompraModal
        isOpen={modalRecepcionarOpen}
        onClose={handleCerrarRecepcionar}
        idOrden={idOrdenRecepcionar}
        ordenInicial={ordenParaRecepcionar}
        onRecepcionExitosa={(res) => {
          consultarOrdenesCompra(filtros);
          setMensajeExito(
            res?.mensaje ||
              `Mercadería de la Orden #${idOrdenRecepcionar} recepcionada exitosamente e inventario actualizado.`
          );
        }}
      />

      {/* Modal de Artículos Críticos y Faltantes Detectados por el Motor */}
      <AnimatePresence>
        {modalArticulosCriticosOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1E293B] border border-slate-700 rounded-2xl max-w-3xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-bold">
                    !
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Insumos y Repuestos en Estado Crítico</h3>
                    <p className="text-xs text-slate-400">Artículos con stock físico insuficiente o requeridos por el taller técnico</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalArticulosCriticosOpen(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-3 custom-scrollbar">
                {(!estadoMotor?.articulos_deficitarios || estadoMotor.articulos_deficitarios.length === 0) ? (
                  <div className="py-12 text-center text-slate-400">
                    <p className="text-sm font-semibold text-emerald-300">¡Niveles de inventario óptimos!</p>
                    <p className="text-xs text-slate-500 mt-1">No se detectaron faltantes ni requerimientos de taller desatendidos.</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#0F172A] text-slate-400 uppercase font-semibold border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-2.5">Artículo / Repuesto</th>
                        <th className="px-3 py-2.5 text-center">Stock Físico</th>
                        <th className="px-3 py-2.5 text-center">En Tránsito</th>
                        <th className="px-3 py-2.5 text-center">Taller Urgente</th>
                        <th className="px-3 py-2.5 text-center">A Reponer</th>
                        <th className="px-3 py-2.5 text-center">Cotización</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {estadoMotor.articulos_deficitarios.map((art) => (
                        <tr key={art.id_producto} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">{art.nombre}</div>
                            <div className="text-[10px] text-slate-400 font-mono">Mínimo: {art.stock_minimo} unid.</div>
                          </td>
                          <td className="px-3 py-3 text-center font-mono font-bold text-slate-200">
                            {art.stock_fisico}
                          </td>
                          <td className="px-3 py-3 text-center font-mono text-cyan-300">
                            {art.stock_transito}
                          </td>
                          <td className="px-3 py-3 text-center font-mono">
                            {art.demanda_taller > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 font-bold">
                                {art.demanda_taller}
                              </span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td className="px-3 py-3 text-center font-mono font-bold text-amber-400">
                            {art.cantidad_a_pedir}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {art.tiene_cotizacion_vigente ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                Vigente
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                Requiere Sondeo
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {estadoMotor?.articulos_deficitarios?.length || 0} producto(s) evaluados
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setModalArticulosCriticosOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalArticulosCriticosOpen(false);
                      handleEjecutarMotorAhora();
                    }}
                    disabled={ejecutandoMotor}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white"
                  >
                    Abastecer Todo Ahora
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Resumen Ejecutivo Post-Ejecución del Motor */}
      <AnimatePresence>
        {modalResumenMotorOpen && resumenMotor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1E293B] border border-cyan-500/40 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center font-bold text-lg">
                    ✓
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Ciclo de Abastecimiento Completado</h3>
                    <p className="text-xs text-cyan-300 font-mono">El motor inteligente procesó las necesidades operativas</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalResumenMotorOpen(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 text-center">
                  <div className="text-[11px] text-slate-400">Órdenes Generadas</div>
                  <div className="text-2xl font-black text-cyan-400 mt-1">
                    {resumenMotor.ordenes_emitidas?.length || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">En Esperando Entrega</div>
                </div>

                <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 text-center">
                  <div className="text-[11px] text-slate-400">Solicitudes de Cotización</div>
                  <div className="text-2xl font-black text-amber-400 mt-1">
                    {resumenMotor.solicitudes_cotizacion_creadas?.length || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Sondeo selectivo a proveedores</div>
                </div>

                <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 text-center">
                  <div className="text-[11px] text-slate-400">Incumplimientos / Bajas</div>
                  <div className="text-2xl font-black text-rose-400 mt-1">
                    {resumenMotor.ordenes_canceladas_por_incumplimiento?.length || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Penalizaciones aplicadas</div>
                </div>
              </div>

              {resumenMotor.ordenes_emitidas && resumenMotor.ordenes_emitidas.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-200">Detalle de Órdenes Formalizadas:</h4>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {resumenMotor.ordenes_emitidas.map((ord, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white">{ord.proveedor}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {ord.items_count} producto(s) | {ord.es_urgencia_taller ? '⚡ Urgencia Taller' : 'Stock General'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-cyan-300">
                            {formatMoneda(ord.monto_total)}
                          </div>
                          <div className="text-[10px] text-emerald-400">Comprobante PDF enviado</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {resumenMotor.solicitudes_cotizacion_creadas && resumenMotor.solicitudes_cotizacion_creadas.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                  <span className="font-bold">Sondeo de Mercado Despachado: </span>
                  Se emitieron solicitudes de cotización para {resumenMotor.solicitudes_cotizacion_creadas.length} insumo(s) sin cotizaciones vigentes, convocando únicamente a proveedores que no cuentan con oferta activa.
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setModalResumenMotorOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors"
                >
                  Entendido y Aceptar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

function FragmentFilaOrden({
  orden,
  expandida,
  listaItems,
  onVerDetalle,
  onRecepcionar,
  onToggleExpandir,
  formatFecha,
  formatMoneda,
  renderBadgeEstado,
  renderBadgeRecepcion
}) {
  return (
    <>
      <tr
        onClick={onVerDetalle}
        className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
      >
        {/* N° Orden y Origen */}
        <td className="px-5 py-3.5 font-semibold text-white">
          <div className="flex items-center gap-2">
            <span className="font-mono text-cyan-400 font-bold">#{orden.id_orden}</span>
            {orden.sol_tec ? (
              <span className="px-2 py-0.5 text-[10px] rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/30">
                ⚡ Urgencia Taller
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] rounded-md bg-slate-700/50 text-slate-300 border border-slate-600/60">
                Stock General
              </span>
            )}
          </div>
          {orden.nro_remito && (
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
              Remito: {orden.nro_remito}
            </div>
          )}
        </td>

        {/* Emisión / Recepción */}
        <td className="px-4 py-3.5">
          <div className="text-slate-200 font-medium">{formatFecha(orden.fecha_emision)}</div>
          <div className="text-[11px] text-slate-500">
            {orden.fecha_recepcion
              ? `Recibida: ${formatFecha(orden.fecha_recepcion)}`
              : 'Recepción pendiente'}
          </div>
        </td>

        {/* Proveedor Destinatario */}
        <td className="px-5 py-3.5">
          <div className="font-semibold text-white">
            {orden.nombre_proveedor || orden.proveedor?.nombre_proveedor || 'Proveedor Adjudicado'}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            CUIT: {orden.cuit_prov || orden.proveedor?.cuit_prov || '—'}
          </div>
        </td>

        {/* Tipo de Recepción */}
        <td className="px-4 py-3.5 text-center">
          {renderBadgeRecepcion(orden.tipo_entrega)}
        </td>

        {/* Cantidad de Ítems */}
        <td className="px-4 py-3.5 text-center">
          <span className="font-bold text-slate-200">
            {orden.cantidad_items ?? listaItems.length} renglón(es)
          </span>
          <div className="text-[11px] text-slate-500">
            {orden.total_unidades ??
              listaItems.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0)}{' '}
            unid.
          </div>
        </td>

        {/* Monto Total */}
        <td className="px-5 py-3.5 text-right font-bold text-emerald-300 font-mono">
          {formatMoneda(orden.monto_total)}
        </td>

        {/* Estado */}
        <td className="px-4 py-3.5 text-center">
          {renderBadgeEstado(orden.estado_orden)}
        </td>

        {/* Acciones: Recepcionar Mercadería (si está Esperando Entrega), Ver Detalle y Desplegar Renglones */}
        <td className="px-5 py-3.5 text-right">
          <div className="inline-flex items-center justify-end gap-2">
            {Number(orden.estado_orden) === 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRecepcionar();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.15)] transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
                <span>Recepcionar Mercadería</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onVerDetalle();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Ver Detalle</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpandir();
              }}
              title={expandida ? 'Ocultar vista rápida de renglones' : 'Vista rápida de renglones'}
              className="inline-flex items-center justify-center w-8 h-8 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${expandida ? 'rotate-180 text-cyan-400' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </td>
      </tr>

      {/* Sub-fila expandible con el desglose de artículos solicitados */}
      {expandida && (
        <tr className="bg-[#0F172A]/90 border-b border-slate-800">
          <td colSpan={8} className="px-6 py-4">
            <div className="rounded-xl border border-slate-800 bg-[#1E293B]/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  Renglones Adjudicados en la Orden #{orden.id_orden}
                </h4>
                {orden.proveedor?.correo && (
                  <span className="text-[11px] text-slate-400">
                    Contacto proveedor: <strong className="text-slate-200">{orden.proveedor.correo}</strong>
                    {orden.proveedor.telefono ? ` · Tel: ${orden.proveedor.telefono}` : ''}
                  </span>
                )}
              </div>

              {listaItems.length === 0 ? (
                <p className="text-xs text-slate-500">Sin renglones detallados registrados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[11px] text-slate-400 uppercase border-b border-slate-800">
                      <tr>
                        <th className="py-2 pr-4">Producto / Repuesto</th>
                        <th className="py-2 px-4 text-center">Cant. Solicitada</th>
                        <th className="py-2 px-4 text-center">Cant. Recibida</th>
                        <th className="py-2 px-4 text-right">Precio Unitario</th>
                        <th className="py-2 pl-4 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {listaItems.map((it) => (
                        <tr key={it.id_detalle_compra || it.id_producto}>
                          <td className="py-2 pr-4 font-medium text-white">
                            {it.nombre_producto || `Producto #${it.id_producto}`}
                          </td>
                          <td className="py-2 px-4 text-center font-mono text-slate-300">
                            {it.cantidad}
                          </td>
                          <td className="py-2 px-4 text-center font-mono">
                            {it.cantidad_recibida !== null && it.cantidad_recibida !== undefined ? (
                              <span className="text-emerald-300 font-semibold">{it.cantidad_recibida}</span>
                            ) : (
                              <span className="text-slate-500">Pendiente</span>
                            )}
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-slate-300">
                            {formatMoneda(it.precio_unitario)}
                          </td>
                          <td className="py-2 pl-4 text-right font-mono font-semibold text-cyan-300">
                            {formatMoneda(it.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
