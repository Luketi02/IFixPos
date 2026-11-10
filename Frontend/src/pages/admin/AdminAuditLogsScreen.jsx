import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';

import { API_BASE_URL } from '../../config/api';
// ==============================================================================
// TRADUCCIONES HUMANAS Y AMIGABLES PARA EL ADMINISTRADOR (MÓDULOS Y ENTIDADES)
// ==============================================================================
const MAPA_MODULOS = {
  core_app: {
    nombre: 'Configuración del Sistema',
    abreviado: 'Configuración',
    icono: '⚙️',
    badge: 'bg-violet-500/10 text-violet-300 border-violet-500/30'
  },
  sales_app: {
    nombre: 'Ventas y Facturación',
    abreviado: 'Ventas',
    icono: '🛒',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
  },
  workshop_app: {
    nombre: 'Taller y Reparaciones',
    abreviado: 'Taller',
    icono: '🔧',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30'
  },
  purchases_app: {
    nombre: 'Compras y Proveedores',
    abreviado: 'Compras',
    icono: '📦',
    badge: 'bg-sky-500/10 text-sky-300 border-sky-500/30'
  },
  catalog_app: {
    nombre: 'Catálogo de Productos',
    abreviado: 'Catálogo',
    icono: '🏷️',
    badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
  },
  inventory_app: {
    nombre: 'Inventario y Stock',
    abreviado: 'Stock',
    icono: '📊',
    badge: 'bg-teal-500/10 text-teal-300 border-teal-500/30'
  },
  users_app: {
    nombre: 'Usuarios y Cuentas',
    abreviado: 'Usuarios',
    icono: '👥',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/30'
  },
  geo_app: {
    nombre: 'Geografía y Cobertura',
    abreviado: 'Geografía',
    icono: '📍',
    badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
  },
  // Formatos históricos o directos de autenticación / usuarios
  usuarios: {
    nombre: 'Usuarios y Cuentas',
    abreviado: 'Usuarios',
    icono: '👥',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/30'
  },
  autenticacion: {
    nombre: 'Autenticación y Seguridad',
    abreviado: 'Seguridad',
    icono: '🔐',
    badge: 'bg-rose-500/10 text-rose-300 border-rose-500/30'
  },
  auth: {
    nombre: 'Autenticación y Seguridad',
    abreviado: 'Seguridad',
    icono: '🔐',
    badge: 'bg-rose-500/10 text-rose-300 border-rose-500/30'
  }
};

const MAPA_TABLAS = {
  usuario: 'Usuario',
  perfil_usuario: 'Perfil de Usuario',
  rol_usuario: 'Rol de Seguridad',
  token_seguridad: 'Token de Seguridad',
  pago: 'Pago / Cobro',
  medio_pago: 'Medio de Pago',
  venta: 'Venta Presencial / Online',
  detalle_venta: 'Detalle de Venta',
  beneficio: 'Beneficio de Fidelización',
  reparacion: 'Orden de Reparación',
  dispositivo: 'Dispositivo Técnico',
  diagnostico: 'Diagnóstico Técnico',
  categoria_reparacion: 'Categoría de Falla',
  calificacion: 'Calificación de Servicio',
  orden_compra: 'Orden de Compra',
  solicitud_cotizacion: 'Solicitud de Cotización',
  cotizacion: 'Cotización de Proveedor',
  registro_compra: 'Comprobante de Compra',
  proveedor: 'Proveedor',
  producto: 'Producto Comercial',
  categoria_producto: 'Categoría de Producto',
  marca: 'Marca Registrada',
  modelo: 'Modelo de Dispositivo',
  stock: 'Existencias de Stock',
  movimiento_stock: 'Movimiento de Stock',
  copia_seguridad: 'Copia de Seguridad',
  configuracion_sistema: 'Configuración Global',
  direccion: 'Dirección Geográfica',
  ciudad: 'Ciudad',
  provincia: 'Provincia',
  pais: 'País'
};

const formatearModulo = (moduloRaw) => {
  if (!moduloRaw) {
    return {
      nombre: 'Configuración del Sistema',
      abreviado: 'Configuración',
      icono: '⚙️',
      badge: 'bg-violet-500/10 text-violet-300 border-violet-500/30'
    };
  }
  const clave = String(moduloRaw)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (MAPA_MODULOS[clave]) return MAPA_MODULOS[clave];

  // Búsquedas por inclusión
  if (clave.includes('autentica') || clave.includes('auth')) return MAPA_MODULOS.autenticacion;
  if (clave.includes('user') || clave.includes('usuario')) return MAPA_MODULOS.users_app;
  if (clave.includes('sale') || clave.includes('venta')) return MAPA_MODULOS.sales_app;
  if (clave.includes('work') || clave.includes('taller') || clave.includes('reparac')) return MAPA_MODULOS.workshop_app;
  if (clave.includes('purchase') || clave.includes('compra') || clave.includes('provee')) return MAPA_MODULOS.purchases_app;
  if (clave.includes('catalog') || clave.includes('catalogo')) return MAPA_MODULOS.catalog_app;
  if (clave.includes('invent') || clave.includes('stock')) return MAPA_MODULOS.inventory_app;
  if (clave.includes('geo')) return MAPA_MODULOS.geo_app;
  if (clave.includes('core') || clave.includes('config')) return MAPA_MODULOS.core_app;

  return {
    nombre: String(moduloRaw).replace(/_/g, ' '),
    abreviado: String(moduloRaw).replace(/_app$/i, ''),
    icono: '📌',
    badge: 'bg-slate-800 text-slate-300 border-slate-700'
  };
};

const formatearTabla = (tablaRaw, idRegistro) => {
  if (!tablaRaw) return null;
  const clave = String(tablaRaw).trim().toLowerCase();
  const nombreLimpio = MAPA_TABLAS[clave] || String(tablaRaw).replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  return {
    nombre: nombreLimpio,
    referencia: idRegistro ? `Ref. #${idRegistro}` : null
  };
};

export default function AdminAuditLogsScreen() {
  const { token } = useAuth();

  // ============================================================================
  // ESTADOS DE FILTROS Y PARÁMETROS DE BÚSQUEDA (CU-40)
  // ============================================================================
  const [buscarTexto, setBuscarTexto] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [moduloOrigen, setModuloOrigen] = useState('TODOS');
  const [tipoAccion, setTipoAccion] = useState('TODOS');
  const [usuarioQuery, setUsuarioQuery] = useState('');

  // Estados de datos
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [alerta, setAlerta] = useState(null);

  // Modal de expediente detallado
  const [logSeleccionado, setLogSeleccionado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  // ============================================================================
  // GESTIÓN DE NOTIFICACIONES Y ALERTAS SUAVES (REGLAS 6 & 1)
  // ============================================================================
  const dispararAlerta = useCallback((tipo, mensaje) => {
    setAlerta({ tipo, mensaje });
    setTimeout(() => {
      setAlerta(null);
    }, 6000);
  }, []);

  // ============================================================================
  // CONSULTA Y FILTRADO DE LOGS (PASOS 4 & 5 DEL CU-40)
  // ============================================================================
  const consultarLogs = useCallback(
    async (filtrosOverride = {}) => {
      // 1. Doble validación en React: coherencia temporal
      const fDesde = filtrosOverride.fecha_desde !== undefined ? filtrosOverride.fecha_desde : fechaDesde;
      const fHasta = filtrosOverride.fecha_hasta !== undefined ? filtrosOverride.fecha_hasta : fechaHasta;

      if (fDesde && fHasta && fDesde > fHasta) {
        dispararAlerta(
          'error',
          'La fecha de inicio (Desde) no puede ser cronológicamente posterior a la fecha de fin (Hasta).'
        );
        return;
      }

      const hDesde = filtrosOverride.hora_desde !== undefined ? filtrosOverride.hora_desde : horaDesde;
      const hHasta = filtrosOverride.hora_hasta !== undefined ? filtrosOverride.hora_hasta : horaHasta;

      if (hDesde && hHasta && hDesde > hHasta) {
        dispararAlerta(
          'error',
          'La hora de inicio (Desde) no puede ser cronológicamente posterior a la hora de fin (Hasta).'
        );
        return;
      }

      setCargando(true);
      try {
        const queryParams = {};

        const texto = filtrosOverride.buscar !== undefined ? filtrosOverride.buscar : buscarTexto;
        if (texto && texto.trim()) {
          queryParams.buscar = texto.trim();
        }

        if (fDesde) queryParams.fecha_desde = fDesde;
        if (fHasta) queryParams.fecha_hasta = fHasta;
        if (hDesde) queryParams.hora_desde = hDesde.length === 5 ? `${hDesde}:00` : hDesde;
        if (hHasta) queryParams.hora_hasta = hHasta.length === 5 ? `${hHasta}:00` : hHasta;

        const mod = filtrosOverride.modulo_origen !== undefined ? filtrosOverride.modulo_origen : moduloOrigen;
        if (mod && mod !== 'TODOS') {
          queryParams.modulo_origen = mod;
        }

        const tipo = filtrosOverride.tipo !== undefined ? filtrosOverride.tipo : tipoAccion;
        if (tipo && tipo !== 'TODOS') {
          queryParams.tipo = tipo;
        }

        const uQuery = filtrosOverride.usuario_query !== undefined ? filtrosOverride.usuario_query : usuarioQuery;
        if (uQuery && uQuery.trim()) {
          queryParams.usuario_query = uQuery.trim();
        }

        const res = await axios.get(`${API_BASE_URL}/api/core/logs/`, {
          params: queryParams,
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = Array.isArray(res.data) ? res.data : [];
        setLogs(data);
      } catch (err) {
        console.error('Error al consultar logs de auditoría:', err);
        const msg = err.response?.data?.detail || err.response?.data?.error || 'No fue posible obtener los registros de auditoría.';
        dispararAlerta('error', typeof msg === 'object' ? JSON.stringify(msg) : msg);
      } finally {
        setCargando(false);
      }
    },
    [token, buscarTexto, fechaDesde, fechaHasta, horaDesde, horaHasta, moduloOrigen, tipoAccion, usuarioQuery, dispararAlerta]
  );

  useEffect(() => {
    consultarLogs();
  }, [consultarLogs]);

  // ============================================================================
  // ACCIONES DE FILTRADO
  // ============================================================================
  const handleAplicarFiltros = (e) => {
    if (e) e.preventDefault();
    consultarLogs();
  };

  const handleRestablecerFiltros = () => {
    setBuscarTexto('');
    setFechaDesde('');
    setFechaHasta('');
    setHoraDesde('');
    setHoraHasta('');
    setModuloOrigen('TODOS');
    setTipoAccion('TODOS');
    setUsuarioQuery('');
    consultarLogs({
      buscar: '',
      fecha_desde: '',
      fecha_hasta: '',
      hora_desde: '',
      hora_hasta: '',
      modulo_origen: 'TODOS',
      tipo: 'TODOS',
      usuario_query: ''
    });
  };

  // ============================================================================
  // MÉTRICAS KPI DE TRAZABILIDAD
  // ============================================================================
  const metricasKPI = useMemo(() => {
    const total = logs.length;
    let seguridad = 0;
    let modificaciones = 0;
    let errores = 0;

    logs.forEach((l) => {
      const tipo = (l.tipo || '').toUpperCase();
      if (tipo.includes('SEGURIDAD')) seguridad++;
      else if (tipo.includes('MODIF') || tipo.includes('ELIMIN') || tipo.includes('BAJA')) modificaciones++;
      else if (tipo.includes('ERROR') || tipo.includes('FALLA') || tipo.includes('ADVERT')) errores++;
    });

    return { total, seguridad, modificaciones, errores };
  }, [logs]);

  // ============================================================================
  // ESTILOS DINÁMICOS POR TIPO DE LOG
  // ============================================================================
  const obtenerEstiloTipo = (tipo) => {
    const t = (tipo || '').toUpperCase();
    if (t.includes('ERROR') || t.includes('FALLA')) {
      return {
        badge: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
        dot: 'bg-rose-400'
      };
    }
    if (t.includes('ELIMIN') || t.includes('REVOC') || t.includes('BAJA')) {
      return {
        badge: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
        dot: 'bg-orange-400'
      };
    }
    if (t.includes('SEGURIDAD')) {
      return {
        badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
        dot: 'bg-amber-400'
      };
    }
    if (t.includes('CREACION') || t.includes('ALTA') || t.includes('REGISTRO')) {
      return {
        badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
        dot: 'bg-emerald-400'
      };
    }
    if (t.includes('MODIF') || t.includes('ACTUALIZ')) {
      return {
        badge: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
        dot: 'bg-sky-400'
      };
    }
    if (t.includes('ADMIN') || t.includes('SISTEMA') || t.includes('CONFIG')) {
      return {
        badge: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
        dot: 'bg-violet-400'
      };
    }
    return {
      badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      dot: 'bg-cyan-400'
    };
  };

  const handleCopiarDetalle = (texto) => {
    if (!texto) return;
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-sans overflow-hidden">
      {/* 1. Barra Lateral de Navegación */}
      <AdminSidebar activeMenu="admin-audit-logs" />

      {/* 2. Área de Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <AdminHeader breadcrumb="Auditoría › Logs del Sistema" />

        {/* Alerta flotante Cyber-Tech */}
        <AnimatePresence>
          {alerta && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className={`mx-6 mt-4 p-4 rounded-xl border flex items-center justify-between text-sm shadow-xl z-20 ${
                alerta.tipo === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{alerta.tipo === 'success' ? '✓' : '⚠'}</span>
                <span className="font-medium">{alerta.mensaje}</span>
              </div>
              <button
                type="button"
                onClick={() => setAlerta(null)}
                className="text-xs px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                Cerrar
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* Encabezado Principal */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
                  Centro de Control & Seguridad
                </span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Logs de Auditoría y Trazabilidad
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Supervisión cronológica de eventos del sistema, alteraciones de datos, accesos de usuarios e incidentes operativos.
              </p>
            </div>

            <button
              type="button"
              onClick={() => consultarLogs()}
              disabled={cargando}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 text-xs font-mono font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              <span>{cargando ? '🔄' : '⚡'}</span>
              <span>{cargando ? 'Actualizando...' : 'Actualizar Traza'}</span>
            </button>
          </div>

          {/* Tarjetas KPI de Auditoría */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                Total de Eventos
              </span>
              <p className="text-2xl font-black font-mono text-cyan-400 mt-1">
                {metricasKPI.total}
              </p>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Registros recuperados
              </span>
            </div>

            <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider block">
                Eventos de Seguridad
              </span>
              <p className="text-2xl font-black font-mono text-amber-300 mt-1">
                {metricasKPI.seguridad}
              </p>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Accesos, OTP y tokens
              </span>
            </div>

            <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-[11px] font-mono text-sky-400 uppercase tracking-wider block">
                Modificaciones & Bajas
              </span>
              <p className="text-2xl font-black font-mono text-sky-300 mt-1">
                {metricasKPI.modificaciones}
              </p>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Alteración en tablas
              </span>
            </div>

            <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-[11px] font-mono text-rose-400 uppercase tracking-wider block">
                Errores & Anomalías
              </span>
              <p className="text-2xl font-black font-mono text-rose-300 mt-1">
                {metricasKPI.errores}
              </p>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Excepciones detectadas
              </span>
            </div>
          </div>

          {/* Formulario de Filtros de Trazabilidad (CU-40 Paso 2) */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔎</span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Parámetros de Filtrado y Trazabilidad
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRestablecerFiltros}
                className="text-xs text-slate-400 hover:text-cyan-300 font-mono transition-colors"
              >
                Limpiar Filtros
              </button>
            </div>

            <form onSubmit={handleAplicarFiltros} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Búsqueda por texto (acción, detalle, id de registro) */}
                <div>
                  <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                    Acción o Registro Afectado
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Creación, Venta, Token..."
                    value={buscarTexto}
                    onChange={(e) => setBuscarTexto(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                {/* 2. Módulo de Origen */}
                <div>
                  <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                    Módulo del Sistema
                  </label>
                  <select
                    value={moduloOrigen}
                    onChange={(e) => setModuloOrigen(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  >
                    <option value="TODOS">Todos los Módulos</option>
                    <option value="Usuarios">Usuarios & Cuentas</option>
                    <option value="Autenticación">Autenticación & Seguridad</option>
                    <option value="workshop_app">Taller & Reparaciones</option>
                    <option value="sales_app">Ventas & Facturación</option>
                    <option value="catalog_app">Catálogo & Productos</option>
                    <option value="inventory_app">Inventario & Stock</option>
                    <option value="purchases_app">Compras & Proveedores</option>
                    <option value="core_app">Configuración del Sistema</option>
                    <option value="geo_app">Geografía & Zonas</option>
                  </select>
                </div>

                {/* 3. Tipo de Acción / Evento */}
                <div>
                  <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                    Tipo de Acción
                  </label>
                  <select
                    value={tipoAccion}
                    onChange={(e) => setTipoAccion(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  >
                    <option value="TODOS">Todos los Tipos</option>
                    <option value="SEGURIDAD">Seguridad & Accesos</option>
                    <option value="CREACION">Creación de Registros</option>
                    <option value="MODIFICACION">Modificación de Datos</option>
                    <option value="ELIMINACION">Eliminación / Bajas</option>
                    <option value="ERROR">Errores & Excepciones</option>
                    <option value="INFO">Información General</option>
                    <option value="ADMINISTRACION">Administración del Sistema</option>
                    <option value="CONSULTA_AUDITORIA">Auditoría / Inspección</option>
                    <option value="REGISTRO_PAGO">Registros de Pago</option>
                  </select>
                </div>

                {/* 4. Usuario Responsable */}
                <div>
                  <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                    Usuario / Administrador Responsable
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre, apellido, DNI o email..."
                    value={usuarioQuery}
                    onChange={(e) => setUsuarioQuery(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                {/* 5. Fecha Desde */}
                <div>
                  <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                    Fecha Desde
                  </label>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                {/* 6. Fecha Hasta */}
                <div>
                  <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                    Fecha Hasta
                  </label>
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                {/* 7. Hora Desde */}
                <div>
                  <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                    Hora Desde
                  </label>
                  <input
                    type="time"
                    step="1"
                    value={horaDesde}
                    onChange={(e) => setHoraDesde(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                {/* 8. Hora Hasta */}
                <div>
                  <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                    Hora Hasta
                  </label>
                  <input
                    type="time"
                    step="1"
                    value={horaHasta}
                    onChange={(e) => setHoraHasta(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>

              {/* Botones de Ejecución de Filtro */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleRestablecerFiltros}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
                >
                  Restablecer
                </button>
                <button
                  type="submit"
                  disabled={cargando}
                  className="px-6 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 text-xs font-bold font-mono uppercase tracking-wider shadow-lg shadow-cyan-500/25 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {cargando ? 'Filtrando...' : 'Aplicar Filtros'}
                </button>
              </div>
            </form>
          </section>

          {/* Grilla / Tabla de Registros de Auditoría */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
            {cargando ? (
              <div className="py-16 text-center space-y-3">
                <div className="inline-block w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-mono text-slate-400">
                  Consultando registros históricos en base de datos...
                </p>
              </div>
            ) : logs.length === 0 ? (
              /* Excepción Paso 5: Mensaje exacto 'No se encontraron resultados' */
              <div className="py-16 text-center space-y-3 px-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 text-2xl">
                  🔍
                </div>
                <h4 className="text-base font-bold text-white tracking-tight">
                  No se encontraron resultados
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Ningún evento registrado coincide con los criterios de trazabilidad ingresados. Ajusta los parámetros de búsqueda o restablece los filtros.
                </p>
                <button
                  type="button"
                  onClick={handleRestablecerFiltros}
                  className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-semibold transition-all mt-2"
                >
                  Restablecer Filtros
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700/80 bg-slate-900/60 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Fecha & Hora</th>
                      <th className="py-3 px-4">Tipo de Acción</th>
                      <th className="py-3 px-4">Módulo</th>
                      <th className="py-3 px-4">Acción Registrada</th>
                      <th className="py-3 px-4">Usuario Responsable</th>
                      <th className="py-3 px-4">Tabla / Referencia</th>
                      <th className="py-3 px-4 text-center">Expediente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {logs.map((log, index) => {
                      const estilo = obtenerEstiloTipo(log.tipo);
                      const modInfo = formatearModulo(log.modulo_origen);
                      const tabInfo = formatearTabla(log.tabla_afectada, log.id_registro_afectado);
                      return (
                        <tr
                          key={log.id_log || index}
                          className="hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Sello de Fecha y Hora */}
                          <td className="py-3 px-4 font-mono whitespace-nowrap">
                            <div className="font-bold text-cyan-400">
                              {log.hora || (log.fecha_hora ? log.fecha_hora.substring(11, 19) : '--:--:--')}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {log.fecha || (log.fecha_hora ? log.fecha_hora.substring(0, 10) : '')}
                            </div>
                          </td>

                          {/* Tipo de Acción Badge */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border flex items-center gap-1.5 w-fit ${estilo.badge}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${estilo.dot}`} />
                              {log.tipo || 'GENERAL'}
                            </span>
                          </td>

                          {/* Módulo Origen Amigable */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${modInfo.badge}`}
                              title={modInfo.nombre}
                            >
                              <span>{modInfo.icono}</span>
                              <span>{modInfo.nombre}</span>
                            </span>
                          </td>

                          {/* Acción Principal */}
                          <td className="py-3 px-4 font-medium text-white max-w-xs truncate" title={log.accion}>
                            {log.accion}
                          </td>

                          {/* Usuario Responsable */}
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">
                              {log.nombre_usuario || 'Sistema'}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 truncate max-w-xs">
                              {log.email_usuario} {log.rol_usuario && `• ${log.rol_usuario}`}
                            </div>
                          </td>

                          {/* Entidad / Tabla Afectada */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {tabInfo ? (
                              <div>
                                <span className="font-medium text-slate-200 text-xs block">
                                  {tabInfo.nombre}
                                </span>
                                {tabInfo.referencia && (
                                  <span className="text-[10px] font-mono text-cyan-400/80 block">
                                    {tabInfo.referencia}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>

                          {/* Botón de Inspección */}
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setLogSeleccionado(log)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700 text-xs font-mono font-medium transition-all"
                            >
                              Ver Detalle
                            </button>
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

      {/* ===================================================================== */}
      {/* MODAL DE EXPEDIENTE DETALLADO DEL EVENTO DE AUDITORÍA                */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {logSeleccionado && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1E293B] border border-slate-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-5"
            >
              {/* Header Modal */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block">
                    Expediente de Auditoría • Evento de Trazabilidad
                  </span>
                  <h3 className="text-lg font-black text-white tracking-tight">
                    {logSeleccionado.accion}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setLogSeleccionado(null)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Ficha de Detalles */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <div>
                  <span className="text-slate-400 font-mono uppercase block text-[10px]">
                    Fecha y Hora:
                  </span>
                  <p className="font-mono font-bold text-cyan-400 text-sm mt-0.5">
                    {logSeleccionado.fecha ? `${logSeleccionado.fecha} • ${logSeleccionado.hora || ''}` : (logSeleccionado.fecha_hora || 'N/D')}
                  </p>
                </div>

                <div>
                  <span className="text-slate-400 font-mono uppercase block text-[10px]">
                    Tipo de Acción:
                  </span>
                  <p className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                    {logSeleccionado.tipo || 'GENERAL'}
                  </p>
                </div>

                <div>
                  <span className="text-slate-400 font-mono uppercase block text-[10px]">
                    Módulo de Origen:
                  </span>
                  {(() => {
                    const modInfo = formatearModulo(logSeleccionado.modulo_origen);
                    return (
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${modInfo.badge}`}
                        >
                          <span>{modInfo.icono}</span>
                          <span>{modInfo.nombre}</span>
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <span className="text-slate-400 font-mono uppercase block text-[10px]">
                    Entidad Afectada / Registro:
                  </span>
                  {(() => {
                    const tabInfo = formatearTabla(logSeleccionado.tabla_afectada, logSeleccionado.id_registro_afectado);
                    return tabInfo ? (
                      <p className="font-semibold text-slate-200 mt-1 flex items-center gap-2">
                        <span>{tabInfo.nombre}</span>
                        {tabInfo.referencia && (
                          <span className="text-xs font-mono text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/50">
                            {tabInfo.referencia}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-slate-400 mt-1 italic">Sin entidad vinculada</p>
                    );
                  })()}
                </div>

                <div className="sm:col-span-2 pt-2 border-t border-slate-800/80">
                  <span className="text-slate-400 font-mono uppercase block text-[10px]">
                    Operador / Usuario Responsable:
                  </span>
                  <div className="mt-1 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white text-sm">
                        {logSeleccionado.nombre_usuario || 'Sistema Automático'}
                      </p>
                      <p className="font-mono text-xs text-slate-400">
                        {logSeleccionado.email_usuario}
                      </p>
                    </div>
                    {logSeleccionado.rol_usuario && (
                      <span className="px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30 text-[10px] font-mono font-semibold">
                        {logSeleccionado.rol_usuario}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Detalle o Payload Registrado */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-mono text-slate-300 uppercase block">
                    Detalle Extendido del Evento
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopiarDetalle(logSeleccionado.detalle || logSeleccionado.accion)}
                    className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
                  >
                    <span>{copiado ? '✓ Copiado' : '📋 Copiar Detalle'}</span>
                  </button>
                </div>
                <div className="p-3.5 bg-[#0F172A] border border-slate-800 rounded-xl font-mono text-xs text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {logSeleccionado.detalle || logSeleccionado.accion || 'Sin información adicional registrada para este evento.'}
                </div>
              </div>

              {/* Botón de Cierre */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setLogSeleccionado(null)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold font-mono transition-all"
                >
                  Cerrar Expediente
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

