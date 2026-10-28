import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import RegistrarProductoModal from '../../components/inventory/RegistrarProductoModal';
import ActualizarStockModal from '../../components/inventory/ActualizarStockModal';
import ModificarProductoModal from '../../components/inventory/ModificarProductoModal';
import { formatearMoneda } from '../../utils/productImages';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function AdminInventoryScreen() {
  const { token } = useAuth();

  // ---------------------------------------------------------------------------
  // Estados de Datos
  // ---------------------------------------------------------------------------
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);

  // ---------------------------------------------------------------------------
  // Estados de Filtros con Debounce
  // ---------------------------------------------------------------------------
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [nivelStockFiltro, setNivelStockFiltro] = useState('');
  const [propositoFiltro, setPropositoFiltro] = useState('');

  // ---------------------------------------------------------------------------
  // Estados de Modales y Feedback
  // ---------------------------------------------------------------------------
  const [modalRegistroAbierto, setModalRegistroAbierto] = useState(false);
  const [productoAjuste, setProductoAjuste] = useState(null);
  const [productoEdicion, setProductoEdicion] = useState(null);
  const [toastMensaje, setToastMensaje] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-ocultar alerta de error temporal tras 15 segundos (Regla 6)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const t = setTimeout(() => setErrorMessage(''), 15000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  // Auto-ocultar Toast de éxito tras 15 segundos
  useEffect(() => {
    if (!toastMensaje) return undefined;
    const t = setTimeout(() => setToastMensaje(null), 15000);
    return () => clearTimeout(t);
  }, [toastMensaje]);

  // Debounce de 500ms para el campo de búsqueda de texto
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBusqueda(textoBusqueda);
    }, 500);
    return () => clearTimeout(handler);
  }, [textoBusqueda]);

  // Cargar categorías activas para el filtro
  useEffect(() => {
    const cargarCategorias = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/catalog/categorias/`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        setCategorias(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error al cargar categorías para filtro:', err);
      }
    };
    cargarCategorias();
  }, [token]);

  // ---------------------------------------------------------------------------
  // Carga y Filtrado de Inventario (Consumiendo FiltrarStockApi)
  // ---------------------------------------------------------------------------
  const cargarInventario = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    try {
      const params = {};
      if (debouncedBusqueda.trim()) {
        params.buscar = debouncedBusqueda.trim();
      }
      if (categoriaFiltro) {
        params.id_categoria = categoriaFiltro;
      }
      if (nivelStockFiltro) {
        params.nivel_stock = nivelStockFiltro;
      }
      if (propositoFiltro) {
        params.proposito = propositoFiltro;
      }

      const res = await axios.get(`${API_BASE_URL}/api/inventory/stock/`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      setProductos(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar inventario:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || dataErr?.detail;
      setErrorMessage(msg || 'No fue posible auditar el inventario. Verifique sus permisos de administrador.');
    } finally {
      setCargando(false);
    }
  }, [token, debouncedBusqueda, categoriaFiltro, nivelStockFiltro, propositoFiltro]);

  useEffect(() => {
    cargarInventario();
  }, [cargarInventario]);

  // Limpiar todos los filtros
  const handleLimpiarFiltros = () => {
    setTextoBusqueda('');
    setCategoriaFiltro('');
    setNivelStockFiltro('');
    setPropositoFiltro('');
  };

  const hayFiltrosActivos = textoBusqueda || categoriaFiltro || nivelStockFiltro || propositoFiltro;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra de Navegación Lateral (Rol Administrador) */}
      <AdminSidebar activeMenu="admin-inventory" role="admin" />

      {/* Contenedor Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto relative">
        
        {/* Header Superior Cyber-Tech */}
        <header className="border-b border-slate-800 bg-[#1E293B]/85 backdrop-blur-md sticky top-0 z-30 shadow-md shadow-slate-950/20">
          <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            
            {/* Logo y Titulación */}
            <div className="flex items-center gap-3">
              <img
                src={logoEmpresa}
                alt="Logo IFixPos"
                className="w-10 h-10 object-contain drop-shadow-[0_2px_10px_rgba(6,182,212,0.4)]"
              />
              <div>
                <span className="font-extrabold text-lg tracking-tight text-white">
                  IFix<span className="text-[#06B6D4]">Pos</span>
                </span>
                <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/30 uppercase font-mono tracking-widest hidden sm:inline-block">
                  Control de Inventario
                </span>
              </div>
            </div>

            {/* Perfil con Desplegable */}
            <UserProfileDropdown align="right" />
          </div>
        </header>

        {/* Alerta de Error Temporal (6 segundos) */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-4"
            >
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-sm flex items-center justify-between gap-3 shadow-lg shadow-rose-950/20 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  className="text-rose-400 hover:text-rose-200 p-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Contenido Principal */}
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
          
          {/* Cabecera Principal con Botón "Nuevo Producto" */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                Catálogo e Inventario
                <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono font-medium">
                  Auditoría Maestra
                </span>
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Supervisa existencias físicas en tiempo real, umbrales de alerta y gestiona ajustes manuales de stock.
              </p>
            </div>

            {/* Botón Nuevo Producto (Turquesa Neón) */}
            <button
              type="button"
              onClick={() => setModalRegistroAbierto(true)}
              className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <svg className="w-5 h-5 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Nuevo Producto</span>
            </button>
          </div>

          {/* Barra de Filtros Cyber-Tech (Azul Pizarra #1E293B) */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4 items-center">
              
              {/* Buscador de Texto (Nombre o Código) */}
              <div className="lg:col-span-4 relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={textoBusqueda}
                  onChange={(e) => setTextoBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, código o ID..."
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all"
                />
                {textoBusqueda && (
                  <button
                    type="button"
                    onClick={() => setTextoBusqueda('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Selector de Categoría */}
              <div className="lg:col-span-3">
                <select
                  value={categoriaFiltro}
                  onChange={(e) => setCategoriaFiltro(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
                >
                  <option value="">Todas las categorías</option>
                  {categorias.map((cat) => (
                    <option key={cat.id_categoria} value={cat.id_categoria}>
                      {cat.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selector de Nivel de Stock */}
              <div className="lg:col-span-2">
                <select
                  value={nivelStockFiltro}
                  onChange={(e) => setNivelStockFiltro(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer font-medium"
                >
                  <option value="">Todos los niveles</option>
                  <option value="NORMAL">Normal (Disponible)</option>
                  <option value="ALERTA">⚠️ Alerta de Mínimo</option>
                  <option value="CRITICO">🚨 Crítico / Agotado</option>
                </select>
              </div>

              {/* Selector de Propósito */}
              <div className="lg:col-span-2">
                <select
                  value={propositoFiltro}
                  onChange={(e) => setPropositoFiltro(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
                >
                  <option value="">Todos los propósitos</option>
                  <option value="VENTA">Venta al Público</option>
                  <option value="REPARACION">Uso en Taller</option>
                </select>
              </div>

              {/* Acciones de Filtro / Limpiar */}
              <div className="lg:col-span-1 flex items-center justify-end">
                {hayFiltrosActivos && (
                  <button
                    type="button"
                    onClick={handleLimpiarFiltros}
                    className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-all text-center"
                    title="Restablecer filtros"
                  >
                    Limpiar
                  </button>
                )}
              </div>

            </div>
          </section>

          {/* Tabla de Resultados de Inventario */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
            
            {/* Cabecera de la Tabla y Contador */}
            <div className="p-4 sm:px-6 border-b border-slate-700/80 flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
                Padrón de Productos ({productos.length})
              </span>
              <button
                type="button"
                onClick={cargarInventario}
                disabled={cargando}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Actualizar tabla"
              >
                <svg className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refrescar</span>
              </button>
            </div>

            {/* Contenedor con Scroll Horizontal */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/60 text-slate-400 text-[11px] font-mono uppercase tracking-wider border-b border-slate-700/80">
                  <tr>
                    <th scope="col" className="px-6 py-3.5 font-semibold">Producto / Insumo</th>
                    <th scope="col" className="px-6 py-3.5 font-semibold">Categoría</th>
                    <th scope="col" className="px-6 py-3.5 font-semibold">Propósito</th>
                    <th scope="col" className="px-6 py-3.5 font-semibold">Precio Venta</th>
                    <th scope="col" className="px-6 py-3.5 font-semibold text-center">Stock Mínimo</th>
                    <th scope="col" className="px-6 py-3.5 font-semibold text-center">Stock Actual</th>
                    <th scope="col" className="px-6 py-3.5 font-semibold text-center">Nivel</th>
                    <th scope="col" className="px-6 py-3.5 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {cargando ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-6 py-4"><div className="h-4 w-40 bg-slate-800 rounded" /></td>
                        <td className="px-6 py-4"><div className="h-4 w-24 bg-slate-800 rounded" /></td>
                        <td className="px-6 py-4"><div className="h-4 w-16 bg-slate-800 rounded" /></td>
                        <td className="px-6 py-4"><div className="h-4 w-20 bg-slate-800 rounded" /></td>
                        <td className="px-6 py-4"><div className="h-4 w-10 bg-slate-800 rounded mx-auto" /></td>
                        <td className="px-6 py-4"><div className="h-4 w-12 bg-slate-800 rounded mx-auto" /></td>
                        <td className="px-6 py-4"><div className="h-4 w-16 bg-slate-800 rounded mx-auto" /></td>
                        <td className="px-6 py-4"><div className="h-8 w-8 bg-slate-800 rounded ml-auto" /></td>
                      </tr>
                    ))
                  ) : productos.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                        <div className="max-w-sm mx-auto space-y-2">
                          <p className="font-semibold text-slate-200">No se encontraron productos</p>
                          <p className="text-xs">No hay registros que coincidan con los filtros seleccionados.</p>
                          {hayFiltrosActivos && (
                            <button
                              type="button"
                              onClick={handleLimpiarFiltros}
                              className="text-xs text-cyan-400 hover:underline pt-2 inline-block"
                            >
                              Restablecer todos los filtros
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    productos.map((prod) => {
                      const cantActual = prod.cantidad_actual ?? 0;
                      const stockMin = prod.stock_minimo ?? 0;
                      const esBajoMinimo = cantActual <= stockMin;
                      const esCritico = cantActual <= 0;

                      return (
                        <tr
                          key={prod.id_producto}
                          className="hover:bg-slate-800/50 transition-colors group"
                        >
                          {/* Producto / Nombre, Marca y Modelo */}
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <span className="font-bold text-[#F8FAFC] group-hover:text-cyan-300 transition-colors block">
                                {prod.nombre}
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-mono text-slate-400">
                                  ID: #{prod.id_producto}
                                </span>
                                {prod.marca && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-medium">
                                    🏷️ {prod.marca}
                                  </span>
                                )}
                                {prod.modelo && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium">
                                    📱 {prod.modelo}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Categoría (Soporte Múltiples) */}
                          <td className="px-6 py-4 text-slate-300 text-xs font-medium">
                            {prod.categorias && prod.categorias.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {prod.categorias.map((c) => (
                                  <span
                                    key={c.id_categoria}
                                    className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                  >
                                    {c.nombre}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              prod.categoria || 'Sin categoría'
                            )}
                          </td>

                          {/* Propósito */}
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {prod.apto_venta && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                  Venta
                                </span>
                              )}
                              {prod.apto_reparacion && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/30">
                                  Taller
                                </span>
                              )}
                              {prod.apto_consumible && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                  Insumo
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Precio */}
                          <td className="px-6 py-4 text-cyan-400 font-bold font-mono text-sm whitespace-nowrap">
                            {formatearMoneda(prod.precio_venta)}
                          </td>

                          {/* Stock Mínimo */}
                          <td className="px-6 py-4 text-center font-mono text-xs text-slate-400">
                            {stockMin}
                          </td>

                          {/* Stock Actual Resaltado */}
                          <td className="px-6 py-4 text-center">
                            <span
                              className={`inline-block px-3 py-1 rounded-full font-mono font-bold text-xs ${
                                esCritico
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : esBajoMinimo
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {cantActual}
                            </span>
                          </td>

                          {/* Nivel de Stock (Cualitativo) */}
                          <td className="px-6 py-4 text-center">
                            <span className="text-xs font-medium text-slate-300">
                              {prod.nivel_stock || (esCritico ? 'Crítico / Agotado' : esBajoMinimo ? 'Alerta de Mínimo' : 'Normal')}
                            </span>
                          </td>

                          {/* Acciones: Botones Editar Producto y Ajustar Stock */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Botón Editar Producto (CU-68) */}
                              <button
                                type="button"
                                onClick={() => setProductoEdicion(prod)}
                                className="p-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 transition-all active:scale-95 group/btn inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                                title="Modificar Datos y Configuración del Producto"
                              >
                                <svg className="w-4 h-4 transition-transform group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span className="text-xs font-semibold pr-1 hidden lg:inline">Editar</span>
                              </button>

                              {/* Botón Ajustar Stock (+/- Balanza) */}
                              <button
                                type="button"
                                onClick={() => setProductoAjuste(prod)}
                                className="p-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/30 text-violet-300 border border-violet-500/40 hover:border-violet-400 transition-all active:scale-95 group/btn inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                                title="Ajustar Stock Manual (+ / -)"
                              >
                                <svg className="w-4 h-4 transition-transform group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                                </svg>
                                <span className="text-xs font-semibold pr-1 hidden lg:inline">Ajustar</span>
                              </button>
                            </div>
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </section>

        </main>
      </div>

      {/* Modal 1: Registrar Nuevo Producto (CU-12) */}
      <RegistrarProductoModal
        isOpen={modalRegistroAbierto}
        onClose={() => setModalRegistroAbierto(false)}
        onSuccess={(msg) => {
          setToastMensaje(msg);
          cargarInventario();
        }}
      />

      {/* Modal 2: Actualizar Stock Manual (CU-13) */}
      <ActualizarStockModal
        isOpen={Boolean(productoAjuste)}
        producto={productoAjuste}
        onClose={() => setProductoAjuste(null)}
        onSuccess={(msg) => {
          setToastMensaje(msg);
          cargarInventario();
        }}
      />

      {/* Modal 3: Modificar Producto Existente (CU-68) */}
      <ModificarProductoModal
        isOpen={Boolean(productoEdicion)}
        producto={productoEdicion}
        onClose={() => setProductoEdicion(null)}
        onSuccess={(msg) => {
          setToastMensaje(msg);
          cargarInventario();
        }}
      />

      {/* Toast Flotante de Notificación Exitosa */}
      <AnimatePresence>
        {toastMensaje && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm"
          >
            <div className="bg-[#1E293B] border border-cyan-500/40 rounded-2xl p-4 shadow-2xl shadow-cyan-950/40 backdrop-blur-md flex items-center gap-3 text-left">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white text-xs sm:text-sm font-semibold flex-1">
                {toastMensaje}
              </p>
              <button
                type="button"
                onClick={() => setToastMensaje(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
