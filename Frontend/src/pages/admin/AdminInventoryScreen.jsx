import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';
import RegistrarProductoModal from '../../components/inventory/RegistrarProductoModal';
import ActualizarStockModal from '../../components/inventory/ActualizarStockModal';
import ModificarProductoModal from '../../components/inventory/ModificarProductoModal';
import { formatearMoneda } from '../../utils/productImages';


import { API_BASE_URL } from '../../config/api';
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
  const [compatibilidadFiltro, setCompatibilidadFiltro] = useState('');

  // ---------------------------------------------------------------------------
  // Estados de Modales y Feedback
  // ---------------------------------------------------------------------------
  const [modalRegistroAbierto, setModalRegistroAbierto] = useState(false);
  const [productoAjuste, setProductoAjuste] = useState(null);
  const [productoEdicion, setProductoEdicion] = useState(null);
  const [productoDetalleCompatibilidad, setProductoDetalleCompatibilidad] = useState(null);
  const [toastMensaje, setToastMensaje] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-ocultar alerta de error temporal tras 6 segundos (Regla 6)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const t = setTimeout(() => setErrorMessage(''), 6000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  // Auto-ocultar Toast de éxito tras 6 segundos (Regla 6)
  useEffect(() => {
    if (!toastMensaje) return undefined;
    const t = setTimeout(() => setToastMensaje(null), 6000);
    return () => clearTimeout(t);
  }, [toastMensaje]);

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
      if (textoBusqueda.trim()) {
        params.buscar = textoBusqueda.trim();
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
      if (compatibilidadFiltro) {
        params.tipo_compatibilidad = compatibilidadFiltro;
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
  }, [token, textoBusqueda, categoriaFiltro, nivelStockFiltro, propositoFiltro, compatibilidadFiltro]);

  // Carga inicial al montar pantalla
  useEffect(() => {
    cargarInventario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Limpiar todos los filtros
  const handleLimpiarFiltros = () => {
    setTextoBusqueda('');
    setCategoriaFiltro('');
    setNivelStockFiltro('');
    setPropositoFiltro('');
    setCompatibilidadFiltro('');
  };

  const hayFiltrosActivos = textoBusqueda || categoriaFiltro || nivelStockFiltro || propositoFiltro || compatibilidadFiltro;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra de Navegación Lateral (Rol Administrador) */}
      <AdminSidebar activeMenu="admin-inventory" role="admin" />

      {/* Contenedor Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto relative">
        
        {/* Cabecera Superior Unificada Cyber-Tech */}
        <AdminHeader
          category="Catálogo & Inventario"
          pageName="Catálogo e Inventario"
          title="Control de Stock y Catálogo de Artículos"
        />




        {/* Contenido Principal */}
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
          {/* Cabecera Operativa con Botón Nuevo Producto */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Artículos y Existencias</h2>
            </div>
            <button
              type="button"
              onClick={() => setModalRegistroAbierto(true)}
              className="px-4 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <svg className="w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Nuevo Producto</span>
            </button>
          </div>
          
          

          {/* Barra de Filtros Cyber-Tech (Azul Pizarra #1E293B) */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl">
            <form onSubmit={(e) => { e.preventDefault(); cargarInventario(); }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4 items-center">
              
              {/* Buscador de Texto (Nombre o Código) */}
              <div className="lg:col-span-3 relative">
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
              <div className="lg:col-span-2">
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

              {/* Selector de Ámbito de Compatibilidad Técnica */}
              <div className="lg:col-span-1">
                <select
                  value={compatibilidadFiltro}
                  onChange={(e) => setCompatibilidadFiltro(e.target.value)}
                  className="w-full px-2 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer font-medium"
                >
                  <option value="">Ámbito</option>
                  <option value="UNIVERSAL">Universal</option>
                  <option value="MULTI_MODELO">Multi</option>
                  <option value="MARCAS">Marcas</option>
                  <option value="TIPO_DISPOSITIVO">Formato</option>
                  <option value="MONO_MODELO">Único</option>
                </select>
              </div>

              {/* Acciones de Filtro / Limpiar */}
              <div className="lg:col-span-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={cargando}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 font-mono"
                >
                  {cargando ? '...' : '⚡ Filtrar'}
                </button>
                {hayFiltrosActivos && (
                  <button
                    type="button"
                    onClick={handleLimpiarFiltros}
                    className="py-2.5 px-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-all text-center"
                    title="Restablecer filtros"
                  >
                    ✕
                  </button>
                )}
              </div>

            </form>
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
                                {prod.es_universal ? (
                                  <button
                                    type="button"
                                    onClick={() => setProductoDetalleCompatibilidad(prod)}
                                    className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-medium hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                                    title="Clic para ver detalle de compatibilidad"
                                  >
                                    🌐 Universal
                                  </button>
                                ) : prod.tipo_compatibilidad === 'MULTI_MODELO' ? (
                                  <button
                                    type="button"
                                    onClick={() => setProductoDetalleCompatibilidad(prod)}
                                    className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-medium hover:bg-cyan-500/20 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                                    title="Clic para ver lista de modelos compatibles"
                                  >
                                    📑 Multi-modelo {prod.modelos_compatibles?.length ? `(${prod.modelos_compatibles.length})` : ''}
                                  </button>
                                ) : prod.tipo_compatibilidad === 'MARCAS' ? (
                                  <button
                                    type="button"
                                    onClick={() => setProductoDetalleCompatibilidad(prod)}
                                    className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30 font-medium hover:bg-violet-500/20 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                                    title="Clic para ver marcas compatibles"
                                  >
                                    🏷️ Por Marca {prod.marcas_compatibles?.length ? `(${prod.marcas_compatibles.length})` : ''}
                                  </button>
                                ) : prod.tipo_compatibilidad === 'TIPO_DISPOSITIVO' ? (
                                  <button
                                    type="button"
                                    onClick={() => setProductoDetalleCompatibilidad(prod)}
                                    className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/30 font-medium hover:bg-fuchsia-500/20 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                                    title="Clic para ver formato compatible"
                                  >
                                    💻 Por Formato
                                  </button>
                                ) : (
                                  <>
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
                                  </>
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

      {/* Modal 4: Vista Rápida de Compatibilidad Técnica */}
      <AnimatePresence>
        {productoDetalleCompatibilidad && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#1E293B] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl space-y-4 text-left"
            >
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚡</span>
                  <div>
                    <h3 className="text-sm font-bold text-white leading-tight">Ámbito de Compatibilidad Técnica</h3>
                    <p className="text-[11px] text-slate-400 font-mono truncate max-w-[260px]">{productoDetalleCompatibilidad.nombre}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProductoDetalleCompatibilidad(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Contenido según el modo */}
              <div className="space-y-3">
                {productoDetalleCompatibilidad.es_universal ? (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
                    <span className="text-xl">🌐</span>
                    <div className="space-y-0.5">
                      <strong className="block text-emerald-200 font-semibold">Producto Universal / Genérico</strong>
                      <p className="text-[11px] text-emerald-300/90 leading-relaxed">
                        Apto para cualquier equipo y marca. Es sugerido libremente por el motor comercial en ventas y servicio técnico.
                      </p>
                    </div>
                  </div>
                ) : productoDetalleCompatibilidad.tipo_compatibilidad === 'MULTI_MODELO' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                      <span>Modelos compatibles asignados:</span>
                      <span className="font-mono text-cyan-400 text-[11px]">{productoDetalleCompatibilidad.modelos_compatibles?.length || 0} modelos</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/60 max-h-48 overflow-y-auto flex flex-wrap gap-1.5">
                      {productoDetalleCompatibilidad.modelos_compatibles && productoDetalleCompatibilidad.modelos_compatibles.length > 0 ? (
                        productoDetalleCompatibilidad.modelos_compatibles.map((m) => (
                          <span
                            key={m.id_modelo}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 font-medium"
                          >
                            📱 {m.nombre}
                          </span>
                        ))
                      ) : (
                        <p className="text-xs text-slate-500 italic">No tiene modelos asociados.</p>
                      )}
                    </div>
                  </div>
                ) : productoDetalleCompatibilidad.tipo_compatibilidad === 'MARCAS' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                      <span>Marcas completas asignadas:</span>
                      <span className="font-mono text-violet-400 text-[11px]">{productoDetalleCompatibilidad.marcas_compatibles?.length || 0} marcas</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/60 max-h-48 overflow-y-auto flex flex-wrap gap-1.5">
                      {productoDetalleCompatibilidad.marcas_compatibles && productoDetalleCompatibilidad.marcas_compatibles.length > 0 ? (
                        productoDetalleCompatibilidad.marcas_compatibles.map((mar) => (
                          <span
                            key={mar.id_marca}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-violet-500/15 text-violet-200 border border-violet-500/30 font-medium"
                          >
                            🏷️ {mar.nombre}
                          </span>
                        ))
                      ) : (
                        <p className="text-xs text-slate-500 italic">No tiene marcas asociadas.</p>
                      )}
                    </div>
                  </div>
                ) : productoDetalleCompatibilidad.tipo_compatibilidad === 'TIPO_DISPOSITIVO' ? (
                  <div className="p-3.5 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 text-xs flex items-start gap-2.5">
                    <span className="text-xl">💻</span>
                    <div className="space-y-0.5">
                      <strong className="block text-fuchsia-200 font-semibold">Compatibilidad por Formato</strong>
                      <p className="text-[11px] text-fuchsia-300/90 leading-relaxed">
                        Apto para cualquier dispositivo de tipo {productoDetalleCompatibilidad.tipo_dispositivo || 'seleccionado'} sin distinción de marcas.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs space-y-1">
                    <strong className="block text-white font-semibold">Modelo Único Comercial</strong>
                    <p className="text-[11px] text-slate-400">
                      Marca: {productoDetalleCompatibilidad.marca || 'N/A'} — Modelo: {productoDetalleCompatibilidad.modelo || 'N/A'}
                    </p>
                  </div>
                )}
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setProductoDetalleCompatibilidad(null)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const prod = productoDetalleCompatibilidad;
                    setProductoDetalleCompatibilidad(null);
                    setProductoEdicion(prod);
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-950/40"
                >
                  <span>✏️ Editar Producto</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notificaciones y Alertas Flotantes Cyber-Tech en esquina inferior izquierda (Fixed, Zero CLS) */}
      <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2 pointer-events-none max-w-md">
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="pointer-events-auto bg-rose-950/90 text-rose-200 border border-rose-500/50 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs sm:text-sm font-medium"
            >
              <span className="text-base shrink-0">⚠️</span>
              <p className="flex-1 leading-relaxed">{errorMessage}</p>
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="text-rose-400 hover:text-rose-100 p-1 ml-1"
                aria-label="Cerrar error"
              >
                ✕
              </button>
            </motion.div>
          )}

          {toastMensaje && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="pointer-events-auto bg-emerald-950/90 text-emerald-200 border border-emerald-500/50 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs sm:text-sm font-medium"
            >
              <span className="text-base shrink-0">⚡</span>
              <p className="flex-1 leading-relaxed">{toastMensaje}</p>
              <button
                type="button"
                onClick={() => setToastMensaje(null)}
                className="text-emerald-400 hover:text-emerald-100 p-1 ml-1"
                aria-label="Cerrar notificación"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
