import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';
import SupplierModal from '../../components/purchases/SupplierModal';
import InspeccionProveedorPanel from '../../components/purchases/InspeccionProveedorPanel';
import { exportarInformePDF } from '../../utils/reportPrinter';

import { API_BASE_URL } from '../../config/api';
export default function AdminSuppliersScreen() {
  const { token, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Datos principales
  const [proveedores, setProveedores] = useState([]);
  const [paises, setPaises] = useState([]);

  // Filtros de Búsqueda (Razón Social/Nombre, CUIT y Estado Operativo)
  const [filtroNombre, setFiltroNombre] = useState('');
  const [filtroCuit, setFiltroCuit] = useState('');
  const [filtroEstado, setFiltroEstado] = useState(''); // '' | 'true' | 'false'
  const [filtroEnvio, setFiltroEnvio] = useState(''); // '' | 'true' | 'false'

  // Estados de UI y Alertas
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal de Registro / Modificación y Vista de Inspección Detallada
  const [modalAbierto, setModalAbierto] = useState(false);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);
  const [nombreSugeridoModal, setNombreSugeridoModal] = useState('');
  const [proveedorInspeccionado, setProveedorInspeccionado] = useState(null);
  const [refreshInspeccionKey, setRefreshInspeccionKey] = useState(0);

  // Si se redirige desde Recepción de Compras (Paso 10/11), abrir el modal automáticamente
  useEffect(() => {
    if (location.state?.abrirNuevoProveedor) {
      setProveedorSeleccionado(null);
      setNombreSugeridoModal(location.state?.nombreSugerido || '');
      setModalAbierto(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  // Auto-cierre de alertas a los 6 segundos
  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(''), 6000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(''), 6000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  // Cargar catálogo de países para el formulario de dirección del proveedor
  useEffect(() => {
    if (!token) return;
    const cargarPaises = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/geo/paises/?todas=true`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (Array.isArray(res.data)) {
          setPaises(res.data);
        }
      } catch {
        setPaises([]);
      }
    };
    cargarPaises();
  }, [token]);

  // Consultar proveedores aplicando filtros
  const consultarProveedores = useCallback(
    async (paramsOverride = null) => {
      if (!token) return;
      setCargando(true);
      setErrorMsg('');

      const nombreVal = paramsOverride ? paramsOverride.buscar : filtroNombre;
      const cuitVal = paramsOverride ? paramsOverride.cuit_prov : filtroCuit;
      const estadoVal = paramsOverride ? paramsOverride.estado : filtroEstado;
      const envioVal = paramsOverride ? paramsOverride.ofrece_envio : filtroEnvio;

      // Validación de integridad del CUIT (Paso 4: formato numérico sin letras)
      if (cuitVal && cuitVal.trim()) {
        const limpio = cuitVal.trim().replace(/[-\s]/g, '');
        if (!/^\d+$/.test(limpio)) {
          setCargando(false);
          setErrorMsg(
            'El CUIT de búsqueda presenta un formato inválido: debe contener únicamente dígitos numéricos sin letras.'
          );
          return;
        }
      }

      const queryParams = {};
      if (nombreVal && nombreVal.trim()) queryParams.buscar = nombreVal.trim();
      if (cuitVal && cuitVal.trim()) queryParams.cuit_prov = cuitVal.trim();
      if (estadoVal === 'true' || estadoVal === 'false') queryParams.estado = estadoVal;
      if (envioVal === 'true' || envioVal === 'false') queryParams.ofrece_envio = envioVal;

      try {
        const res = await axios.get(`${API_BASE_URL}/api/purchases/proveedores/`, {
          params: queryParams,
          headers: { Authorization: `Bearer ${token}` }
        });
        const lista = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.proveedores)
          ? res.data.proveedores
          : [];
        setProveedores(lista);
      } catch (err) {
        const data = err.response?.data;
        let msg = 'No se pudo consultar el padrón de proveedores.';
        if (data && typeof data === 'object') {
          if (typeof data.error === 'string') msg = data.error;
          else if (typeof data.detail === 'string') msg = data.detail;
          else if (data.cuit_prov) {
            msg = Array.isArray(data.cuit_prov) ? data.cuit_prov[0] : data.cuit_prov;
          } else {
            const firstKey = Object.keys(data)[0];
            if (firstKey) {
              const val = data[firstKey];
              msg = Array.isArray(val) ? val[0] : String(val);
            }
          }
        }
        setErrorMsg(msg);
      } finally {
        setCargando(false);
      }
    },
    [token, filtroNombre, filtroCuit, filtroEstado, filtroEnvio]
  );

  const consultarProveedoresRef = useRef(consultarProveedores);
  consultarProveedoresRef.current = consultarProveedores;

  // Carga inicial
  useEffect(() => {
    if (!token) return;
    consultarProveedoresRef.current({
      buscar: '',
      cuit_prov: '',
      estado: '',
      ofrece_envio: ''
    });
  }, [token]);

  const handleAplicarFiltros = (e) => {
    if (e) e.preventDefault();
    consultarProveedores();
  };

  const handleLimpiarFiltros = () => {
    setFiltroNombre('');
    setFiltroCuit('');
    setFiltroEstado('');
    setFiltroEnvio('');

    consultarProveedores({
      buscar: '',
      cuit_prov: '',
      estado: '',
      ofrece_envio: ''
    });
  };

  const handleAbrirNuevo = () => {
    setProveedorSeleccionado(null);
    setNombreSugeridoModal('');
    setModalAbierto(true);
  };

  const handleAbrirModificar = (prov) => {
    setNombreSugeridoModal('');
    setProveedorSeleccionado(prov);
    setModalAbierto(true);
  };

  const handleAbrirInspeccion = (prov) => {
    setProveedorInspeccionado(prov);
  };

  const handleGuardadoExitoso = (mensaje, provActualizado = null) => {
    setSuccessMsg(mensaje || 'Operación realizada con éxito.');
    consultarProveedores();
    if (proveedorInspeccionado) {
      if (provActualizado && typeof provActualizado === 'object') {
        setProveedorInspeccionado((prev) => ({ ...prev, ...provActualizado }));
      }
      setRefreshInspeccionKey((k) => k + 1);
    }
  };

  const totalProveedores = proveedores.length;
  const totalActivos = proveedores.filter((p) => p.estado !== false).length;
  const totalCumplen = proveedores.filter(
    (p) => Math.round(Number(p.indice_confiabilidad ?? 60)) >= 60
  ).length;
  const totalIncumplen = totalProveedores - totalCumplen;

  const handleExportarInformeCumplimientoPDF = () => {
    if (proveedores.length === 0) return;

    const nombreEjecutor =
      [user?.nombre, user?.apellido].filter(Boolean).join(' ').trim() ||
      user?.email ||
      'Administrador';

    const filtrosActivos = [
      filtroNombre.trim() ? `Búsqueda: ${filtroNombre.trim()}` : null,
      filtroCuit.trim() ? `CUIT: ${filtroCuit.trim()}` : null,
      filtroEstado === 'true'
        ? 'Estado: Activos'
        : filtroEstado === 'false'
        ? 'Estado: Inactivos'
        : 'Estado: Todos',
      filtroEnvio === 'true'
        ? 'Logística: Realiza envíos'
        : filtroEnvio === 'false'
        ? 'Logística: Retiro en sede'
        : null
    ].filter(Boolean);

    exportarInformePDF({
      titulo: 'Informe Ejecutivo: Cumplimiento y Confiabilidad de Proveedores',
      subtitulo:
        'Auditoría del padrón de proveedores, índice de confiabilidad operativa, tiempos medios de entrega y clasificación de cumplimiento',
      periodo: 'Padrón Actualizado en Tiempo Real',
      filtros: filtrosActivos,
      kpis: [
        {
          label: 'Total Proveedores',
          valor: `${totalProveedores}`,
          detalle: `${totalActivos} activos en padrón`
        },
        {
          label: 'Proveedores que Cumplen',
          valor: `${totalCumplen}`,
          detalle: 'Confiabilidad ≥ 60%'
        },
        {
          label: 'En Observación / No Cumplen',
          valor: `${totalIncumplen}`,
          detalle: 'Confiabilidad < 60% por demoras/parciales'
        },
        {
          label: 'Confiabilidad Media',
          valor: `${
            totalProveedores > 0
              ? Math.round(
                  proveedores.reduce(
                    (acc, p) => acc + Number(p.indice_confiabilidad ?? 60),
                    0
                  ) / totalProveedores
                )
              : 0
          }%`,
          detalle: 'Promedio general del padrón'
        }
      ],
      resumenEjecutivo:
        `Evaluación de cumplimiento sobre ${totalProveedores} proveedores empadronados (${totalActivos} activos). ` +
        `Se identificaron ${totalCumplen} proveedores que cumplen con los parámetros de confiabilidad (≥ 60%) y ` +
        `${totalIncumplen} proveedores con penalizaciones por demoras en entregas, recepciones incompletas o cancelaciones.`,
      tablas: [
        {
          titulo: 'Nómina de Proveedores y Dictamen de Cumplimiento',
          columnas: [
            { header: 'Razón Social / Proveedor', key: 'nombre_proveedor' },
            { header: 'CUIT', key: 'cuit_prov' },
            { header: 'Nivel', key: 'nivel', render: (p) => p.nivel || 'Estándar' },
            {
              header: 'Confiabilidad',
              key: 'indice_confiabilidad',
              align: 'center',
              render: (p) => `${Math.round(Number(p.indice_confiabilidad ?? 60))}%`
            },
            {
              header: 'Entrega Prom.',
              key: 'tiempo_promedio_entrega',
              align: 'center',
              render: (p) =>
                p.tiempo_promedio_entrega && Number(p.tiempo_promedio_entrega) > 0
                  ? `${p.tiempo_promedio_entrega} días`
                  : 'Sin entregas'
            },
            {
              header: 'Dictamen',
              key: 'dictamen',
              render: (p) => {
                const conf = Math.round(Number(p.indice_confiabilidad ?? 60));
                if (conf >= 70) return 'CUMPLE (Alto Desempeño)';
                if (conf >= 60) return 'CUMPLE (Estándar)';
                return 'NO CUMPLE / EN OBSERVACIÓN';
              }
            },
            {
              header: 'Estado',
              key: 'estado',
              align: 'center',
              render: (p) => (p.estado !== false ? 'Activo' : 'Inactivo')
            }
          ],
          filas: proveedores
        }
      ],
      usuario: {
        nombre: nombreEjecutor,
        email: user?.email || '',
        rol: user?.rol?.nombre_rol || user?.id_rol?.nombre_rol || 'Administrador'
      }
    });
  };

  const hayFiltrosActivos = Boolean(
    filtroNombre.trim() ||
      filtroCuit.trim() ||
      filtroEstado !== '' ||
      filtroEnvio !== ''
  );

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra Lateral de Administrador */}
      <AdminSidebar activeMenu="purchases-suppliers" />

      {/* Contenido Principal */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Cabecera Superior Unificada */}
        <AdminHeader
          category="Compras & Abastecimiento"
          pageName="Gestión de Proveedores"
          title="Gestión de Proveedores"
        />

        <div className="p-6 sm:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {proveedorInspeccionado ? (
            <InspeccionProveedorPanel
              key={`${proveedorInspeccionado.cuit_prov}-${refreshInspeccionKey}`}
              proveedorBase={proveedorInspeccionado}
              onVolver={() => setProveedorInspeccionado(null)}
              onModificarProveedor={(prov) => handleAbrirModificar(prov)}
            />
          ) : (
            <>
              {/* Cabecera Operativa con Botón de Informe y Creación */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    Directorio y Cumplimiento de Proveedores
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Inspecciona el cumplimiento de entregas, confiabilidad, cotizaciones y órdenes de compra de cada proveedor.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExportarInformeCumplimientoPDF}
                    disabled={cargando || proveedores.length === 0}
                    className="px-4 py-2.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Informe de Cumplimiento (PDF)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAbrirNuevo}
                    className="px-4 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <svg className="w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Registrar Nuevo Proveedor</span>
                  </button>
                </div>
              </div>
          {/* Alertas Flotantes Cyber-Tech en esquina inferior izquierda (Fixed, Zero CLS) */}
          <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2 pointer-events-none max-w-md">
            <AnimatePresence>
              {successMsg && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className="pointer-events-auto p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs sm:text-sm font-medium flex items-center justify-between shadow-2xl backdrop-blur-md"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-emerald-400 font-bold text-base">⚡</span>
                    <span className="leading-relaxed">{successMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSuccessMsg('')}
                    className="text-emerald-400 hover:text-emerald-200 font-bold ml-2 p-1 text-xs"
                    aria-label="Cerrar éxito"
                  >
                    ✕
                  </button>
                </motion.div>
              )}

              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className="pointer-events-auto p-4 rounded-2xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs sm:text-sm font-medium flex items-center justify-between shadow-2xl backdrop-blur-md"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-rose-400 font-bold text-base">⚠️</span>
                    <span className="leading-relaxed">{errorMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorMsg('')}
                    className="text-rose-400 hover:text-rose-200 font-bold ml-2 p-1 text-xs"
                    aria-label="Cerrar error"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Barra de Filtrado del Padrón de Proveedores */}
          <form
            onSubmit={handleAplicarFiltros}
            className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Filtrar Padrón de Proveedores
                </h2>
                <p className="text-xs text-slate-400">
                  Localiza proveedores por Razón Social / Nombre, CUIT o estado operativo (Activo / Inactivo).
                </p>
              </div>
              {hayFiltrosActivos && (
                <button
                  type="button"
                  onClick={handleLimpiarFiltros}
                  className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Razón Social / Nombre
                </label>
                <input
                  type="text"
                  value={filtroNombre}
                  onChange={(e) => setFiltroNombre(e.target.value)}
                  placeholder="Buscar por nombre o correo..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  CUIT
                </label>
                <input
                  type="text"
                  value={filtroCuit}
                  onChange={(e) => setFiltroCuit(e.target.value)}
                  placeholder="Ej: 30712345679"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 font-mono focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Estado Operativo
                </label>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors"
                >
                  <option value="">Todos los estados</option>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Modalidad Logística
                </label>
                <select
                  value={filtroEnvio}
                  onChange={(e) => setFiltroEnvio(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors"
                >
                  <option value="">Todas las modalidades</option>
                  <option value="true">Realiza envíos</option>
                  <option value="false">Solo retiro en sede</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={cargando}
                  className="flex-1 px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {cargando ? 'Filtrando...' : 'Filtrar'}
                </button>
                <button
                  type="button"
                  onClick={handleLimpiarFiltros}
                  disabled={cargando}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold border border-slate-700 transition-colors"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </form>

          {/* Tabla de Proveedores */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
            {cargando ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-slate-400">Consultando padrón de proveedores...</p>
              </div>
            ) : proveedores.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400 text-xl">
                  🏢
                </div>
                <h3 className="text-base font-bold text-white">No se encontraron resultados</h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                  Ningún proveedor empadronado coincide con los parámetros de búsqueda ingresados.
                </p>
                {hayFiltrosActivos && (
                  <button
                    type="button"
                    onClick={handleLimpiarFiltros}
                    className="mt-2 px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors"
                  >
                    Ver todos los proveedores
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/70 border-b border-slate-700/80 text-[11px] font-mono uppercase text-slate-400">
                      <th className="py-3.5 px-5">Razón Social / Proveedor</th>
                      <th className="py-3.5 px-4">CUIT</th>
                      <th className="py-3.5 px-4">Contacto</th>
                      <th className="py-3.5 px-4">Dirección Física</th>
                      <th className="py-3.5 px-4">Logística y Nivel</th>
                      <th className="py-3.5 px-4">Estado</th>
                      <th className="py-3.5 px-5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-sm">
                    {proveedores.map((prov) => {
                      const activo = prov.estado !== false;
                      const dir = prov.direccion;
                      const textoDireccion = dir
                        ? [
                            dir.nro_calle || dir.calle_numero,
                            dir.ciudad,
                            dir.provincia,
                            dir.pais
                          ]
                            .filter(Boolean)
                            .join(', ')
                        : 'Sin dirección registrada';

                      return (
                        <tr
                          key={prov.cuit_prov}
                          className="hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Razón Social */}
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center text-xs font-bold text-cyan-300 shrink-0">
                                {(prov.nombre_proveedor || 'P').slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-white truncate">
                                  {prov.nombre_proveedor}
                                </p>
                                <p className="text-xs text-slate-400">
                                  Confiabilidad:{' '}
                                  <span className="text-cyan-300 font-semibold">
                                    {Math.round(Number(prov.indice_confiabilidad ?? 60))}%
                                  </span>{' '}
                                  • Entrega Promedio:{' '}
                                  <span className="text-slate-300">
                                    {prov.tiempo_promedio_entrega && Number(prov.tiempo_promedio_entrega) > 0
                                      ? `${prov.tiempo_promedio_entrega} días`
                                      : 'Sin entregas'}
                                  </span>
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* CUIT */}
                          <td className="py-4 px-4 font-mono text-xs text-cyan-300 font-semibold">
                            {prov.cuit_prov}
                          </td>

                          {/* Contacto */}
                          <td className="py-4 px-4">
                            <p className="text-xs text-slate-200 truncate">
                              {prov.correo || 'Sin correo'}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {prov.telefono || 'Sin teléfono'}
                            </p>
                          </td>

                          {/* Dirección Física */}
                          <td className="py-4 px-4 text-xs text-slate-300 max-w-xs">
                            <span className="line-clamp-2">{textoDireccion}</span>
                          </td>

                          {/* Logística y Nivel */}
                          <td className="py-4 px-4">
                            <div className="flex flex-col items-start gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                                {prov.nivel || 'Estándar'}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {prov.ofrece_envio ? '🚚 Realiza envíos' : '🏪 Retiro en sede'}
                              </span>
                            </div>
                          </td>

                          {/* Estado Operativo */}
                          <td className="py-4 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                activo
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  activo ? 'bg-emerald-400' : 'bg-rose-400'
                                }`}
                              />
                              {activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>

                           {/* Acciones: Inspeccionar y Modificar (diferenciados por ícono) */}
                           <td className="py-4 px-5 text-right">
                             <div className="inline-flex items-center justify-end gap-2">
                               <button
                                 type="button"
                                 onClick={() => handleAbrirInspeccion(prov)}
                                 title="Inspeccionar detalles del proveedor, entregas, cotizaciones y órdenes de compra"
                                 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30 text-xs font-semibold transition-all cursor-pointer"
                               >
                                 <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                 </svg>
                                 <span>Inspeccionar</span>
                               </button>

                               <button
                                 type="button"
                                 onClick={() => handleAbrirModificar(prov)}
                                 title="Modificar información legal, contacto o estado del proveedor"
                                 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer"
                               >
                                 <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                 </svg>
                                 <span>Modificar</span>
                               </button>
                             </div>
                           </td>
                         </tr>
                       );
                     })}
                   </tbody>
                 </table>
               </div>
             )}
           </div>
            </>
          )}
        </div>
      </main>

      {/* Modal de Registro y Modificación de Proveedor */}
      <SupplierModal
        isOpen={modalAbierto}
        onClose={() => {
          setModalAbierto(false);
          setProveedorSeleccionado(null);
          setNombreSugeridoModal('');
        }}
        proveedor={proveedorSeleccionado}
        nombreSugerido={nombreSugeridoModal}
        paises={paises}
        onSaved={handleGuardadoExitoso}
      />
    </div>
  );
}

