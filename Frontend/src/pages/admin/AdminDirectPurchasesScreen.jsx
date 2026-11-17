import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';

import { API_BASE_URL } from '../../config/api';
export default function AdminDirectPurchasesScreen() {
  const { token } = useAuth();
  const navigate = useNavigate();

  // Estado del listado histórico de compras directas
  const [compras, setCompras] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Filtros de búsqueda
  const [filtroBuscar, setFiltroBuscar] = useState('');
  const [filtroImpacto, setFiltroImpacto] = useState(''); // '' | 'true' | 'false'

  // Alertas globales (con auto-cierre a los 6 segundos)
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Control del Modal de Registro de Nueva Compra
  const [modalAbierto, setModalAbierto] = useState(false);

  // Campos del Formulario (Paso 2)
  const [origenVendedor, setOrigenVendedor] = useState('');
  const [descripcionArticulo, setDescripcionArticulo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [montoPagado, setMontoPagado] = useState('');
  const [impactoStock, setImpactoStock] = useState(false);
  const [cantidad, setCantidad] = useState('1');

  // Estados internos del flujo modal (Paso 5 Confirmación y Paso 9 Consulta de Proveedor)
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [modalError, setModalError] = useState('');
  const [compraRegistrada, setCompraRegistrada] = useState(null); // Cuando no es null, activa Paso 9

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

  useEffect(() => {
    if (!modalError) return;
    const timer = setTimeout(() => setModalError(''), 6000);
    return () => clearTimeout(timer);
  }, [modalError]);

  // Consultar historial de compras directas
  const consultarCompras = useCallback(
    async (paramsOverride = null) => {
      if (!token) return;
      setCargando(true);
      setErrorMsg('');

      const buscarVal = paramsOverride ? paramsOverride.buscar : filtroBuscar;
      const impactoVal = paramsOverride ? paramsOverride.impacto_stock : filtroImpacto;

      const queryParams = {};
      if (buscarVal && buscarVal.trim()) queryParams.buscar = buscarVal.trim();
      if (impactoVal === 'true' || impactoVal === 'false') {
        queryParams.impacto_stock = impactoVal;
      }

      try {
        const res = await axios.get(`${API_BASE_URL}/api/purchases/compras-directas/`, {
          params: queryParams,
          headers: { Authorization: `Bearer ${token}` }
        });
        setCompras(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        const data = err.response?.data;
        let msg = 'No se pudo consultar el registro de compras directas.';
        if (data && typeof data === 'object') {
          if (typeof data.error === 'string') msg = data.error;
          else if (typeof data.detail === 'string') msg = data.detail;
        }
        setErrorMsg(msg);
      } finally {
        setCargando(false);
      }
    },
    [token, filtroBuscar, filtroImpacto]
  );

  const consultarComprasRef = useRef(consultarCompras);
  consultarComprasRef.current = consultarCompras;

  useEffect(() => {
    if (!token) return;
    consultarComprasRef.current({ buscar: '', impacto_stock: '' });
  }, [token]);

  const handleFiltrar = (e) => {
    if (e) e.preventDefault();
    consultarCompras();
  };

  const handleLimpiarFiltros = () => {
    setFiltroBuscar('');
    setFiltroImpacto('');
    consultarCompras({ buscar: '', impacto_stock: '' });
  };

  // Paso 1: Ejecutar acción "Registrar Nueva Compra"
  const handleAbrirModal = () => {
    setOrigenVendedor('');
    setDescripcionArticulo('');
    setMotivo('');
    setMontoPagado('');
    setImpactoStock(false);
    setCantidad('1');
    setConfirmando(false);
    setModalError('');
    setCompraRegistrada(null);
    setModalAbierto(true);
  };

  // Excepción Paso 3: Cancelar operación y descartar datos en memoria
  const handleCerrarModal = () => {
    if (guardando) return;
    setModalAbierto(false);
    setConfirmando(false);
    setModalError('');
    setCompraRegistrada(null);
  };

  // Validaciones en tiempo real (Doble Validación)
  const origenLimpio = origenVendedor.trim();
  const descripcionLimpia = descripcionArticulo.trim();
  const motivoLimpio = motivo.trim();
  const montoNumerico = parseFloat(montoPagado);
  const montoValido = !Number.isNaN(montoNumerico) && montoNumerico > 0;
  const cantidadNumerica = parseInt(cantidad, 10);
  const cantidadValida = !impactoStock || (!Number.isNaN(cantidadNumerica) && cantidadNumerica > 0);

  const formularioValido =
    Boolean(origenLimpio) &&
    Boolean(descripcionLimpia) &&
    Boolean(motivoLimpio) &&
    montoValido &&
    cantidadValida;

  // Paso 3 y 4: Validar campos y desplegar confirmación (Paso 5)
  const handleSolicitarConfirmacion = (e) => {
    e.preventDefault();
    setModalError('');

    if (!origenLimpio) {
      setModalError('El origen o vendedor de la compra es obligatorio.');
      return;
    }
    if (!descripcionLimpia) {
      setModalError('La descripción del artículo o servicio adquirido es obligatoria.');
      return;
    }
    if (!motivoLimpio) {
      setModalError('El motivo o justificación operativa del gasto es obligatorio.');
      return;
    }
    if (!montoValido) {
      setModalError('El monto pagado debe ser estrictamente mayor a cero.');
      return;
    }
    if (impactoStock && (!cantidadValida || cantidadNumerica <= 0)) {
      setModalError('Debes indicar una cantidad de unidades mayor a cero para impactar en el stock.');
      return;
    }

    setConfirmando(true);
  };

  // Paso 6, 7 y 8: Confirmar operación, impactar stock si corresponde y persistir
  const handleConfirmarRegistro = async () => {
    setGuardando(true);
    setModalError('');

    const payload = {
      origen_vendedor: origenLimpio,
      descripcion_articulo: descripcionLimpia,
      motivo: motivoLimpio,
      monto_pagado: montoNumerico.toFixed(2),
      impacto_stock: Boolean(impactoStock),
      cantidad: impactoStock ? cantidadNumerica : 0
    };

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/purchases/compras-directas/registrar/`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const nuevaCompra = res.data?.compra || {
        origen_vendedor: origenLimpio,
        descripcion_articulo: descripcionLimpia,
        motivo: motivoLimpio,
        monto_pagado: montoNumerico.toFixed(2),
        impacto_stock: Boolean(impactoStock),
        producto_nombre: impactoStock ? descripcionLimpia : null
      };

      setSuccessMsg(res.data?.mensaje || 'Compra registrada exitosamente.');
      consultarCompras();

      // Avanzar al Paso 9: Preguntar al Administrador si desea generar un nuevo proveedor
      setConfirmando(false);
      setCompraRegistrada(nuevaCompra);
    } catch (err) {
      setConfirmando(false);
      const data = err.response?.data;
      let msg = 'No se pudo registrar la compra directa.';
      if (data && typeof data === 'object') {
        if (typeof data.error === 'string') msg = data.error;
        else if (typeof data.detail === 'string') msg = data.detail;
        else if (Array.isArray(data.non_field_errors)) msg = data.non_field_errors[0];
        else {
          const firstKey = Object.keys(data)[0];
          if (firstKey) {
            const val = data[firstKey];
            msg = Array.isArray(val) ? val[0] : String(val);
          }
        }
      }
      setModalError(msg);
    } finally {
      setGuardando(false);
    }
  };

  // Paso 10 y 11: Continuar con el nuevo proveedor y redirigir al registro de proveedor
  const handleIrARegistrarProveedor = () => {
    const nombreSugerido = compraRegistrada?.origen_vendedor || origenLimpio;
    setModalAbierto(false);
    setCompraRegistrada(null);
    navigate('/admin/proveedores', {
      state: {
        abrirNuevoProveedor: true,
        nombreSugerido
      }
    });
  };

  // Métricas resumen
  const totalCompras = compras.length;
  const totalMontoInvertido = compras.reduce(
    (acc, c) => acc + (parseFloat(c.monto_pagado) || 0),
    0
  );
  const totalConStock = compras.filter((c) => Boolean(c.impacto_stock)).length;
  const totalSinStock = totalCompras - totalConStock;

  const hayFiltrosActivos = Boolean(filtroBuscar.trim() || filtroImpacto !== '');

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra Lateral de Administrador */}
      <AdminSidebar activeMenu="purchases-direct" />

      {/* Contenido Principal */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Cabecera Superior Unificada */}
        <AdminHeader
          category="Compras & Abastecimiento"
          pageName="Recepción de Compras"
          title="Recepción de Compras Directas"
        />

        <div className="p-6 sm:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Cabecera Operativa con Botón de Creación */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Registro de Adquisiciones</h2>
            </div>
            <button
              type="button"
              onClick={handleAbrirModal}
              className="px-4 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              <svg className="w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Registrar Nueva Compra</span>
            </button>
          </div>
          {/* Tarjetas de Estadísticas Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Operaciones Registradas
                </p>
                <p className="text-2xl font-black text-white mt-1">{totalCompras}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-lg">
                🧾
              </div>
            </div>

            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Total Abonado
                </p>
                <p className="text-2xl font-black text-cyan-400 mt-1">
                  ${totalMontoInvertido.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 text-lg">
                💳
              </div>
            </div>

            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Con Impacto en Stock
                </p>
                <p className="text-2xl font-black text-emerald-400 mt-1">{totalConStock}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg">
                📦
              </div>
            </div>

            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Gastos sin Stock
                </p>
                <p className="text-2xl font-black text-amber-400 mt-1">{totalSinStock}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-lg">
                📋
              </div>
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
                    <span className="text-emerald-400 text-base">⚡</span>
                    <span className="leading-relaxed">{successMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSuccessMsg('')}
                    className="text-emerald-400 hover:text-emerald-200 p-1 ml-2 text-xs font-mono"
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
                    <span className="text-rose-400 text-base">⚠️</span>
                    <span className="leading-relaxed">{errorMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorMsg('')}
                    className="text-rose-400 hover:text-rose-200 p-1 ml-2 text-xs font-mono"
                    aria-label="Cerrar error"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Barra de Filtros */}
          <form
            onSubmit={handleFiltrar}
            className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              <div className="sm:col-span-6">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Origen / Vendedor, Artículo o Motivo
                </label>
                <input
                  type="text"
                  value={filtroBuscar}
                  onChange={(e) => setFiltroBuscar(e.target.value)}
                  placeholder="Buscar por vendedor, descripción del artículo o motivo..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Directiva de Stock
                </label>
                <select
                  value={filtroImpacto}
                  onChange={(e) => setFiltroImpacto(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors cursor-pointer"
                >
                  <option value="">Todas las compras</option>
                  <option value="true">Con impacto en stock</option>
                  <option value="false">Sin impacto en stock</option>
                </select>
              </div>

              <div className="sm:col-span-3 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={cargando}
                  className="flex-1 px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span>{cargando ? 'Filtrando...' : 'Filtrar'}</span>
                </button>
                {hayFiltrosActivos && (
                  <button
                    type="button"
                    onClick={handleLimpiarFiltros}
                    disabled={cargando}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold border border-slate-700 transition-colors cursor-pointer"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Tabla de Compras Directas Registradas */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
            {cargando ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-slate-400">Consultando registro de compras directas...</p>
              </div>
            ) : compras.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400 text-xl">
                  🛍️
                </div>
                <h3 className="text-base font-bold text-white">No hay compras registradas</h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                  {hayFiltrosActivos
                    ? 'Ninguna compra directa coincide con los criterios de búsqueda seleccionados.'
                    : 'Aún no se han asentado compras directas fuera del circuito de órdenes de compra.'}
                </p>
                <div className="pt-2 flex items-center justify-center gap-3">
                  {hayFiltrosActivos && (
                    <button
                      type="button"
                      onClick={handleLimpiarFiltros}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Ver todas las compras
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAbrirModal}
                    className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all inline-flex items-center gap-2 cursor-pointer"
                  >
                    <span>Registrar Nueva Compra</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/70 border-b border-slate-700/80 text-[11px] font-mono uppercase text-slate-400">
                      <th className="py-3.5 px-5">Origen / Vendedor</th>
                      <th className="py-3.5 px-4">Artículo o Servicio</th>
                      <th className="py-3.5 px-4">Motivo del Gasto</th>
                      <th className="py-3.5 px-4">Monto Pagado</th>
                      <th className="py-3.5 px-4">Impacto en Stock</th>
                      <th className="py-3.5 px-4">Responsable</th>
                      <th className="py-3.5 px-5 text-right">Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-sm">
                    {compras.map((item, idx) => (
                      <tr
                        key={item.id_compra || idx}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-4 px-5 font-semibold text-white">
                          {item.origen_vendedor}
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-200 max-w-xs">
                          <p className="line-clamp-2 font-medium">{item.descripcion_articulo}</p>
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-400 max-w-xs">
                          <span className="line-clamp-2">{item.motivo}</span>
                        </td>
                        <td className="py-4 px-4 font-mono text-xs font-bold text-cyan-300">
                          ${parseFloat(item.monto_pagado || 0).toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </td>
                        <td className="py-4 px-4">
                          {item.impacto_stock ? (
                            <div className="flex flex-col items-start gap-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Ingresado a Stock
                              </span>
                              {item.producto_nombre && (
                                <span className="text-[11px] text-slate-400 truncate max-w-[180px]">
                                  Catálogo: {item.producto_nombre}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                              Sin impacto en stock
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-300">
                          {item.email_administrador || 'Administrador'}
                        </td>
                        <td className="py-4 px-5 text-right font-mono text-xs text-slate-400">
                          {item.fecha_compra || '--:--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal de Registro de Compra Directa y Redirección a Nuevo Proveedor */}
      <AnimatePresence>
        {modalAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            >
              {/* Cabecera del Modal */}
              <div className="px-6 py-5 bg-slate-900/70 border-b border-slate-700/80 flex items-center justify-between">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mb-1">
                    {compraRegistrada ? 'Operación Registrada' : 'Adquisición Directa'}
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    {compraRegistrada
                      ? 'Compra Asentada Exitosamente'
                      : 'Registrar Nueva Compra'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {compraRegistrada
                      ? 'La transacción y su auditoría han sido registradas en el sistema.'
                      : 'Completa los datos del vendedor, artículo adquirido, motivo y directiva de impacto en stock.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCerrarModal}
                  disabled={guardando}
                  className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Cuerpo del Modal: Paso 9 (Consulta de Nuevo Proveedor) vs Formulario (Pasos 2-6) */}
              {compraRegistrada ? (
                <div className="p-6 space-y-5">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                      <span>✓</span>
                      <span>Gasto administrativo y comprobante interno registrados</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-200 pt-1">
                      <p>
                        <span className="text-slate-400">Origen / Vendedor:</span>{' '}
                        <strong className="text-white">{compraRegistrada.origen_vendedor}</strong>
                      </p>
                      <p>
                        <span className="text-slate-400">Monto Abonado:</span>{' '}
                        <strong className="font-mono text-cyan-300">
                          ${parseFloat(compraRegistrada.monto_pagado || 0).toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </strong>
                      </p>
                      <p className="sm:col-span-2">
                        <span className="text-slate-400">Artículo / Servicio:</span>{' '}
                        <strong className="text-white">{compraRegistrada.descripcion_articulo}</strong>
                      </p>
                      <p className="sm:col-span-2">
                        <span className="text-slate-400">Impacto en Stock:</span>{' '}
                        <strong
                          className={
                            compraRegistrada.impacto_stock ? 'text-emerald-400' : 'text-slate-300'
                          }
                        >
                          {compraRegistrada.impacto_stock
                            ? 'Sí — Nuevo artículo dado de alta e incorporado al inventario'
                            : 'No — Registrado únicamente como gasto administrativo'}
                        </strong>
                      </p>
                    </div>
                  </div>

                  {/* Paso 9: Preguntar al Administrador si desea generar un nuevo proveedor */}
                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-cyan-500/30 space-y-3">
                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      <span className="text-cyan-400">🏢</span>
                      <span>¿Deseas registrar un nuevo proveedor en el padrón?</span>
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      Si el vendedor o entidad <strong className="text-cyan-300">&ldquo;{compraRegistrada.origen_vendedor}&rdquo;</strong> aún no se encuentra empadronado, puedes continuar ahora mismo hacia el formulario de alta de proveedores para incorporarlo formalmente.
                    </p>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleCerrarModal}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold border border-slate-700 transition-colors cursor-pointer"
                      >
                        No, finalizar operación
                      </button>
                      <button
                        type="button"
                        onClick={handleIrARegistrarProveedor}
                        className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Continuar con Nuevo Proveedor</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleSolicitarConfirmacion}
                  className="p-6 overflow-y-auto space-y-5 flex-1"
                >
                  {/* Alerta de Error del Formulario */}
                  <AnimatePresence>
                    {modalError && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start justify-between gap-3"
                      >
                        <span>{modalError}</span>
                        <button
                          type="button"
                          onClick={() => setModalError('')}
                          className="text-rose-400 hover:text-rose-200 font-bold"
                        >
                          ✕
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Campos del Paso 2 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Origen / Vendedor <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={origenVendedor}
                        onChange={(e) => setOrigenVendedor(e.target.value)}
                        placeholder="Ej: Casa de Repuestos Centro / Cliente particular en mostrador"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Descripción del Artículo o Servicio <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={descripcionArticulo}
                        onChange={(e) => setDescripcionArticulo(e.target.value)}
                        placeholder="Ej: Módulo Display OLED iPhone 13 Pro / Equipo usado para repuestos"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Motivo de la Compra <span className="text-cyan-400">*</span>
                      </label>
                      <textarea
                        rows={2}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Ej: Reposición urgente para orden de taller prioritaria / Adquisición en mostrador"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Monto Pagado ($) <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={montoPagado}
                        onChange={(e) => setMontoPagado(e.target.value)}
                        placeholder="Ej: 45000.00"
                        className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-sm text-white placeholder-slate-500 font-mono focus:outline-none transition-colors ${
                          montoPagado && !montoValido
                            ? 'border-rose-500/60 focus:border-rose-400'
                            : 'border-slate-700 focus:border-cyan-400'
                        }`}
                      />
                      {montoPagado && !montoValido && (
                        <p className="text-[11px] text-rose-400 mt-1">
                          El monto abonado debe ser mayor a cero.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Cantidad de Productos Comprados{' '}
                        {impactoStock && <span className="text-cyan-400">*</span>}
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={cantidad}
                        onChange={(e) => setCantidad(e.target.value)}
                        disabled={!impactoStock}
                        placeholder="1"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white font-mono focus:outline-none transition-colors disabled:opacity-40"
                      />
                    </div>
                  </div>

                  {/* Directiva de Impacto en Stock */}
                  <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={impactoStock}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setImpactoStock(checked);
                          if (checked && (!cantidad || parseInt(cantidad, 10) <= 0)) {
                            setCantidad('1');
                          }
                        }}
                        className="mt-0.5 w-4 h-4 accent-cyan-500 rounded"
                      />
                      <div>
                        <span className="text-xs sm:text-sm font-bold text-white block">
                          Directiva de Impacto en Stock
                        </span>
                        <span className="text-xs text-slate-400 block mt-0.5">
                          Al activar esta directiva, el sistema dará de alta automáticamente el artículo en el catálogo e incrementará su existencia física en el inventario por la cantidad indicada.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Paso 5 y 6: Confirmación Previa */}
                  <AnimatePresence>
                    {confirmando && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/40 space-y-3"
                      >
                        <div className="space-y-1.5">
                          <p className="text-sm font-bold text-cyan-300">
                            Confirmar registro de compra directa
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-200 bg-slate-900/70 p-3 rounded-lg border border-slate-800">
                            <p>
                              <span className="text-slate-400">Origen / Vendedor:</span>{' '}
                              <strong className="text-white">{origenLimpio}</strong>
                            </p>
                            <p>
                              <span className="text-slate-400">Monto Pagado:</span>{' '}
                              <strong className="font-mono text-cyan-300">
                                ${montoValido ? montoNumerico.toFixed(2) : '0.00'}
                              </strong>
                            </p>
                            <p className="sm:col-span-2">
                              <span className="text-slate-400">Artículo / Servicio:</span>{' '}
                              <strong className="text-white">{descripcionLimpia}</strong>
                            </p>
                            <p className="sm:col-span-2">
                              <span className="text-slate-400">Motivo:</span>{' '}
                              <strong className="text-slate-200">{motivoLimpio}</strong>
                            </p>
                            <p className="sm:col-span-2">
                              <span className="text-slate-400">Impacto en Stock:</span>{' '}
                              <strong
                                className={impactoStock ? 'text-emerald-400' : 'text-amber-300'}
                              >
                                {impactoStock
                                  ? `Sí (${cantidadNumerica} unidad/es — Costo unitario: $${(
                                      montoNumerico / cantidadNumerica
                                    ).toFixed(2)})`
                                  : 'No (Solo asiento administrativo del gasto)'}
                              </strong>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setConfirmando(false)}
                            disabled={guardando}
                            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Volver a editar
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmarRegistro}
                            disabled={guardando}
                            className="px-5 py-2 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                          >
                            {guardando ? 'Registrando...' : 'Confirmar y Registrar'}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Pie del Modal */}
                  {!confirmando && (
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={handleCerrarModal}
                        disabled={guardando}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={!formularioValido || guardando}
                        className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Continuar y Revisar
                      </button>
                    </div>
                  )}
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

