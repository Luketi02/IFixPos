import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';
import SupplierModal from '../../components/purchases/SupplierModal';

import { API_BASE_URL } from '../../config/api';
export default function AdminSuppliersScreen() {
  const { token } = useAuth();
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

  // Modal de Registro / Modificación
  const [modalAbierto, setModalAbierto] = useState(false);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);
  const [nombreSugeridoModal, setNombreSugeridoModal] = useState('');

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

  const handleGuardadoExitoso = (mensaje) => {
    setSuccessMsg(mensaje || 'Operación realizada con éxito.');
    consultarProveedores();
  };

  const totalProveedores = proveedores.length;
  const totalActivos = proveedores.filter((p) => p.estado !== false).length;
  const totalInactivos = totalProveedores - totalActivos;

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
          {/* Cabecera Operativa con Botón de Creación */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Directorio de Proveedores</h2>
            </div>
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
          {/* Alertas de Éxito y Error */}
          <AnimatePresence>
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between shadow-lg"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>{successMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMsg('')}
                  className="text-emerald-400 hover:text-emerald-200 font-bold"
                >
                  ✕
                </button>
              </motion.div>
            )}

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between shadow-lg"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-rose-400 font-bold">⚠</span>
                  <span>{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="text-rose-400 hover:text-rose-200 font-bold"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

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

                          {/* Acción: Modificar */}
                          <td className="py-4 px-5 text-right">
                            <button
                              type="button"
                              onClick={() => handleAbrirModificar(prov)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all"
                            >
                              Modificar
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

