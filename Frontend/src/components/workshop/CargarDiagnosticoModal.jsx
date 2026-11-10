import { useState, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import CyberNumberInput from '../common/CyberNumberInput';

import { API_BASE_URL } from '../../config/api';
/**
 * Modal Inteligente Cyber-Tech para el CU-08: Cargar Diagnóstico Técnico.
 * Permite registrar la evaluación técnica, seleccionar insumos del inventario,
 * calcular el presupuesto en tiempo real y solicitar confirmación antes del envío.
 */
export default function CargarDiagnosticoModal({
  isOpen,
  onClose,
  reparacion,
  onSuccess
}) {
  const { token } = useAuth();

  // Estados del Formulario (Paso 2 y 3)
  const [descripcionFalla, setDescripcionFalla] = useState('');
  const [costoManoObra, setCostoManoObra] = useState('30000.0');
  const [permitirCostoPropio, setPermitirCostoPropio] = useState(false);
  const [insumosSeleccionados, setInsumosSeleccionados] = useState([]);

  // Estados del Buscador de Insumos
  const [catalogoProductos, setCatalogoProductos] = useState([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [busquedaInsumo, setBusquedaInsumo] = useState('');
  const [dropdownInsumoAbierto, setDropdownInsumoAbierto] = useState(false);
  const dropdownRef = useRef(null);

  // Estados del Flujo de Confirmación y Envío (Pasos 4 y 5)
  const [vistaConfirmacion, setVistaConfirmacion] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorLocal, setErrorLocal] = useState('');

  // Auto-limpieza de error local a los 15 segundos (Regla 6)
  useEffect(() => {
    if (!errorLocal) return undefined;
    const t = setTimeout(() => setErrorLocal(''), 15000);
    return () => clearTimeout(t);
  }, [errorLocal]);

  // Cerrar dropdown al hacer clic afuera
  useEffect(() => {
    const handleClickAfuera = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownInsumoAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickAfuera);
    return () => document.removeEventListener('mousedown', handleClickAfuera);
  }, []);

  // Reiniciar estado y cargar configuración institucional al abrir el modal con una reparación
  useEffect(() => {
    if (!isOpen) return;

    setDescripcionFalla('');
    setInsumosSeleccionados([]);
    setBusquedaInsumo('');
    setDropdownInsumoAbierto(false);
    setVistaConfirmacion(false);
    setErrorLocal('');

    // Consultar configuración dinámica del sistema para Costo de Mano de Obra y Permiso de Edición
    const fetchConfiguracionesTaller = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/core/configuraciones/`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = res.data || {};
        const valorManoObra = data.costoManoDeObra !== undefined && data.costoManoDeObra !== null && data.costoManoDeObra !== ''
          ? String(data.costoManoDeObra)
          : '30000.0';
        const permiteEditar = data.permitirCostoManoDeObraPropio === true || String(data.permitirCostoManoDeObraPropio).toLowerCase() === 'true';

        setCostoManoObra(valorManoObra);
        setPermitirCostoPropio(permiteEditar);
      } catch (err) {
        console.error('Error al consultar configuraciones de taller para diagnóstico:', err);
        setCostoManoObra('30000.0');
        setPermitirCostoPropio(false);
      }
    };

    fetchConfiguracionesTaller();
  }, [isOpen, reparacion, token]);

  // Cargar catálogo de stock/insumos disponibles
  useEffect(() => {
    if (!isOpen || !token) return;

    let cancelado = false;
    const cargarCatalogo = async () => {
      setCargandoCatalogo(true);
      try {
        // Intentar primero con el endpoint de stock filtrado para taller
        let res;
        try {
          res = await axios.get(`${API_BASE_URL}/api/inventory/stock/?proposito=REPARACION`, {
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch {
          // Fallback al listado general de stock
          res = await axios.get(`${API_BASE_URL}/api/inventory/stock/`, {
            headers: { Authorization: `Bearer ${token}` }
          });
        }

        if (!cancelado && Array.isArray(res.data)) {
          // Filtrar preferentemente aquellos aptos para reparación
          const adaptados = res.data
            .filter((p) => p.apto_reparacion !== false)
            .map((p) => ({
              id_producto: p.id_producto,
              nombre: p.nombre,
              precio_venta: Number(p.precio_venta) || 0,
              stock_actual: Number(p.cantidad_actual) || 0,
              categoria: p.categoria || 'Repuesto / Insumo'
            }));
          setCatalogoProductos(adaptados);
        }
      } catch (err) {
        console.error('Error al cargar insumos del inventario:', err);
      } finally {
        if (!cancelado) setCargandoCatalogo(false);
      }
    };

    cargarCatalogo();
    return () => {
      cancelado = true;
    };
  }, [isOpen, token]);

  // Filtrado reactivo de insumos por término de búsqueda
  const insumosFiltrados = useMemo(() => {
    const q = busquedaInsumo.trim().toLowerCase();
    if (!q) return catalogoProductos.slice(0, 8);
    return catalogoProductos
      .filter((p) => p.nombre.toLowerCase().includes(q))
      .slice(0, 10);
  }, [busquedaInsumo, catalogoProductos]);

  // Agregar insumo a la lista temporal
  const handleAgregarInsumo = (producto) => {
    setInsumosSeleccionados((prev) => {
      const existe = prev.find((item) => item.id_producto === producto.id_producto);
      if (existe) {
        // Si ya está, incrementa su cantidad
        return prev.map((item) =>
          item.id_producto === producto.id_producto
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          id_producto: producto.id_producto,
          nombre: producto.nombre,
          precio_unitario: producto.precio_venta,
          stock_actual: producto.stock_actual,
          cantidad: 1
        }
      ];
    });
    setBusquedaInsumo('');
    setDropdownInsumoAbierto(false);
  };

  // Modificar cantidad de un insumo
  const handleCambiarCantidad = (id_producto, nuevaCantidad) => {
    const cant = Math.max(1, parseInt(nuevaCantidad, 10) || 1);
    setInsumosSeleccionados((prev) =>
      prev.map((item) =>
        item.id_producto === id_producto ? { ...item, cantidad: cant } : item
      )
    );
  };

  // Remover insumo de la tabla temporal
  const handleRemoverInsumo = (id_producto) => {
    setInsumosSeleccionados((prev) =>
      prev.filter((item) => item.id_producto !== id_producto)
    );
  };

  // Cálculo Reactivo de Totales
  const subtotalInsumos = useMemo(() => {
    return insumosSeleccionados.reduce(
      (acc, item) => acc + item.cantidad * item.precio_unitario,
      0
    );
  }, [insumosSeleccionados]);

  const numManoObra = useMemo(() => {
    const val = parseFloat(costoManoObra);
    return isNaN(val) || val < 0 ? 0 : val;
  }, [costoManoObra]);

  const totalPresupuesto = useMemo(() => {
    return subtotalInsumos + numManoObra;
  }, [subtotalInsumos, numManoObra]);

  // Validación de formulario para pasar a Confirmación
  const esFormularioValido = useMemo(() => {
    const fallaValida = descripcionFalla.trim().length >= 5;
    const manoObraValida = costoManoObra !== '' && !isNaN(parseFloat(costoManoObra)) && parseFloat(costoManoObra) >= 0;
    return fallaValida && manoObraValida;
  }, [descripcionFalla, costoManoObra]);

  // Paso 4: Solicitar confirmación final
  const handleIrAConfirmacion = (e) => {
    e.preventDefault();
    if (!esFormularioValido) {
      setErrorLocal('Complete la descripción de la falla (mínimo 5 caracteres) y el costo de mano de obra.');
      return;
    }
    setVistaConfirmacion(true);
  };

  // Paso 5: Confirmar y emitir el diagnóstico al backend
  const handleConfirmarYEnviar = async () => {
    if (!reparacion?.id_reparacion) return;
    setEnviando(true);
    setErrorLocal('');

    const payload = {
      descripcion_falla: descripcionFalla.trim(),
      falla_detectada: descripcionFalla.trim(),
      costo_mano_obra: numManoObra,
      insumos: insumosSeleccionados.map((item) => ({
        id_producto: item.id_producto,
        cantidad: item.cantidad
      }))
    };

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/workshop/reparaciones/${reparacion.id_reparacion}/diagnostico/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const mensajeExito =
        res.data?.mensaje ||
        `Diagnóstico registrado exitosamente para la orden #${reparacion.id_reparacion}. Presupuesto total: $${totalPresupuesto.toFixed(2)}`;

      if (typeof onSuccess === 'function') {
        onSuccess(mensajeExito, reparacion.id_reparacion);
      }
      onClose();
    } catch (err) {
      console.error('Error al registrar diagnóstico:', err);
      const dataErr = err.response?.data;
      let msg = 'No fue posible registrar el diagnóstico técnico.';
      if (typeof dataErr === 'string') msg = dataErr;
      else if (dataErr?.error) msg = typeof dataErr.error === 'string' ? dataErr.error : JSON.stringify(dataErr.error);
      else if (dataErr?.descripcion_falla) msg = dataErr.descripcion_falla[0];
      else if (dataErr?.costo_mano_obra) msg = dataErr.costo_mano_obra[0];
      else if (dataErr?.detail) msg = dataErr.detail;

      setErrorLocal(msg);
      setVistaConfirmacion(false); // Regresa a la vista de edición para corregir
    } finally {
      setEnviando(false);
    }
  };

  if (!isOpen || !reparacion) return null;

  const nombreEquipo =
    reparacion.dispositivo?.modelo
      ? `${reparacion.dispositivo?.marca || ''} ${reparacion.dispositivo.modelo}`.trim()
      : 'Dispositivo en Servicio';

  const clienteNombre =
    reparacion.cliente?.nombre_completo ||
    reparacion.cliente?.email ||
    reparacion.cliente ||
    'Cliente registrado';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-4xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]"
      >
        {/* Cabecera del Modal */}
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[11px] text-cyan-400 font-semibold uppercase tracking-wider">
                Servicio Técnico Especializado
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">
              Diagnóstico Técnico - <span className="text-[#06B6D4]">{nombreEquipo}</span>
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5 truncate">
              Cliente: <span className="text-slate-200">{clienteNombre}</span>
              {reparacion.dispositivo?.numero_serie && (
                <> • Serie: <span className="text-slate-300 font-mono">{reparacion.dispositivo.numero_serie}</span></>
              )}
            </p>
          </div>

          <button
            type="button"
            disabled={enviando}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800/80 transition-colors shrink-0 disabled:opacity-50"
            aria-label="Cerrar modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Alerta de Error Local (fade-out 6s) */}
        <AnimatePresence>
          {errorLocal && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-rose-500/10 border-b border-rose-500/30 px-6 py-3 flex items-center justify-between gap-3 text-rose-300 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-rose-400 font-bold text-sm">⚠️</span>
                <span>{errorLocal}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorLocal('')}
                className="text-rose-400 hover:text-rose-200 text-xs font-mono"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cuerpo del Modal */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <AnimatePresence mode="wait">
            {!vistaConfirmacion ? (
              /* ============================================================= */
              /* VISTA 1: FORMULARIO DE EVALUACIÓN TÉCNICA                     */
              /* ============================================================= */
              <motion.form
                key="formulario"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleIrAConfirmacion}
                className="space-y-6"
              >
                {/* SECCIÓN A: FALLA DETECTADA */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="diagnostico-falla"
                      className="block text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold"
                    >
                      1. Falla Detectada en Taller <span className="text-cyan-400">*</span>
                    </label>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {descripcionFalla.length}/1000 caract.
                    </span>
                  </div>
                  <textarea
                    id="diagnostico-falla"
                    rows={4}
                    required
                    value={descripcionFalla}
                    onChange={(e) => setDescripcionFalla(e.target.value)}
                    placeholder="Describa de forma precisa el problema técnico verificado, pruebas ejecutadas en banco de trabajo y solución a aplicar..."
                    className="w-full rounded-xl bg-slate-900/80 border border-slate-700/80 text-slate-100 placeholder-slate-500 text-xs sm:text-sm p-3.5 outline-none transition-all focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6] resize-none"
                  />
                  {reparacion.desc_cliente && (
                    <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                      <span className="text-cyan-400 shrink-0 font-bold">Reporte inicial del cliente:</span>
                      <span className="italic truncate">&ldquo;{reparacion.desc_cliente}&rdquo;</span>
                    </div>
                  )}
                </div>

                {/* SECCIÓN B: SELECTOR DINÁMICO DE INSUMOS */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold">
                        2. Insumos y Repuestos de Inventario
                      </label>
                      <p className="text-[11px] text-slate-400">
                        Seleccione los repuestos requeridos. Dejar vacío si solo requiere mano de obra/software.
                      </p>
                    </div>
                    <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/20 self-start sm:self-auto">
                      {insumosSeleccionados.length} {insumosSeleccionados.length === 1 ? 'insumo' : 'insumos'}
                    </span>
                  </div>

                  {/* Input Buscador con Autocompletado */}
                  <div className="relative" ref={dropdownRef}>
                    <div className="relative">
                      <input
                        type="text"
                        value={busquedaInsumo}
                        onFocus={() => setDropdownInsumoAbierto(true)}
                        onChange={(e) => {
                          setBusquedaInsumo(e.target.value);
                          setDropdownInsumoAbierto(true);
                        }}
                        placeholder="Buscar repuesto por nombre (ej. Pantalla, Batería, Flex, Conector)..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-slate-100 placeholder-slate-500 text-xs sm:text-sm outline-none transition-all focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]"
                      />
                      <svg
                        className="w-4 h-4 text-slate-500 absolute left-3.5 top-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      {cargandoCatalogo && (
                        <span className="absolute right-3.5 top-3 text-[10px] text-cyan-400 font-mono animate-pulse">
                          Cargando stock...
                        </span>
                      )}
                    </div>

                    {/* Desplegable de Resultados */}
                    <AnimatePresence>
                      {dropdownInsumoAbierto && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          transition={{ duration: 0.15 }}
                          className="absolute z-20 left-0 right-0 mt-1.5 max-h-56 overflow-y-auto rounded-xl bg-[#0F172A] border border-cyan-500/40 shadow-2xl divide-y divide-slate-800"
                        >
                          {insumosFiltrados.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400">
                              No se encontraron repuestos con ese término.
                            </div>
                          ) : (
                            insumosFiltrados.map((prod) => (
                              <button
                                key={prod.id_producto}
                                type="button"
                                onClick={() => handleAgregarInsumo(prod)}
                                className="w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-slate-800/80 transition-colors group"
                              >
                                <div className="min-w-0 pr-3">
                                  <p className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-cyan-300 truncate">
                                    {prod.nombre}
                                  </p>
                                  <span className="text-[10px] font-mono text-slate-500">
                                    Stock disp: {prod.stock_actual} un.
                                  </span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-xs font-mono font-bold text-cyan-400">
                                    ${prod.precio_venta.toFixed(2)}
                                  </span>
                                  <span className="block text-[10px] font-mono text-purple-400 group-hover:underline">
                                    + Agregar
                                  </span>
                                </div>
                              </button>
                            ))
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Tabla Temporal de Insumos */}
                  {insumosSeleccionados.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900/40">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                          <tr>
                            <th className="p-3">Insumo</th>
                            <th className="p-3 text-center">Cant.</th>
                            <th className="p-3 text-right">Precio Unit.</th>
                            <th className="p-3 text-right">Subtotal</th>
                            <th className="p-3 text-center">Quitar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-200">
                          {insumosSeleccionados.map((item) => {
                            const itemSubtotal = item.cantidad * item.precio_unitario;
                            return (
                              <tr key={item.id_producto} className="hover:bg-slate-800/40 transition-colors">
                                <td className="p-3 font-semibold text-white">
                                  {item.nombre}
                                  <span className="block text-[10px] font-mono text-slate-500">
                                    Stock disp: {item.stock_actual}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <div className="inline-flex items-center gap-1.5 bg-slate-800 rounded-lg p-1 border border-slate-700">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCambiarCantidad(item.id_producto, item.cantidad - 1)
                                      }
                                      className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 text-xs font-mono"
                                    >
                                      -
                                    </button>
                                    <span className="w-6 text-center font-mono font-bold text-xs text-white">
                                      {item.cantidad}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCambiarCantidad(item.id_producto, item.cantidad + 1)
                                      }
                                      className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 text-xs font-mono"
                                    >
                                      +
                                    </button>
                                  </div>
                                </td>
                                <td className="p-3 text-right font-mono text-slate-300">
                                  ${item.precio_unitario.toFixed(2)}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-cyan-300">
                                  ${itemSubtotal.toFixed(2)}
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoverInsumo(item.id_producto)}
                                    className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/10 transition-colors"
                                    title="Quitar insumo"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-center text-xs text-slate-400">
                      No se han vinculado insumos del inventario (reparación solo software / mano de obra).
                    </div>
                  )}
                </div>

                {/* SECCIÓN C: MANO DE OBRA Y TOTALES EN VIVO */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="diagnostico-mano-obra"
                        className="block text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold"
                      >
                        3. Costo de Mano de Obra ($) <span className="text-cyan-400">*</span>
                      </label>
                      {!permitirCostoPropio && (
                        <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 flex items-center gap-1">
                          <span>🔒</span>
                          <span>Fijado por administración</span>
                        </span>
                      )}
                    </div>
                    <CyberNumberInput
                      id="diagnostico-mano-obra"
                      name="costo_mano_obra"
                      min="0"
                      step="0.50"
                      prefix="$"
                      required
                      disabled={!permitirCostoPropio}
                      value={costoManoObra}
                      onChange={(e) => setCostoManoObra(e.target.value)}
                      placeholder="30000.0"
                    />
                    <p className="text-[11px] text-slate-500">
                      {permitirCostoPropio
                        ? "Edición manual habilitada por configuración institucional."
                        : "Costo predeterminado institucional. La edición manual se encuentra bloqueada según las políticas vigentes del sistema."}
                    </p>
                  </div>

                  {/* Componente Visual del Total en Vivo */}
                  <div className="rounded-2xl p-4 bg-gradient-to-br from-cyan-950/40 via-slate-900 to-purple-950/30 border border-cyan-500/40 flex flex-col justify-between shadow-lg">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>Insumos: ${subtotalInsumos.toFixed(2)}</span>
                      <span>Mano de Obra: ${numManoObra.toFixed(2)}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex items-baseline justify-between mt-2">
                      <span className="text-xs font-mono uppercase font-bold text-slate-300 tracking-wider">
                        Presupuesto Total:
                      </span>
                      <span className="text-2xl sm:text-3xl font-black text-[#06B6D4] font-mono tracking-tight drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">
                        ${totalPresupuesto.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botones de Acción */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!esFormularioValido}
                    className="px-6 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.35)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
                  >
                    <span>Guardar Diagnóstico</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              </motion.form>
            ) : (
              /* ============================================================= */
              /* VISTA 2: PANTALLA DE CONFIRMACIÓN (PASOS 4 Y 5 DEL CU)         */
              /* ============================================================= */
              <motion.div
                key="confirmacion"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="space-y-6 py-2"
              >
                <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm font-mono uppercase tracking-wider">
                    <span>⚠️ Confirmación Requerida</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
                    ¿Confirma el diagnóstico por un total de{' '}
                    <strong className="text-cyan-400 font-mono text-base font-black">
                      ${totalPresupuesto.toFixed(2)}
                    </strong>
                    ? El equipo pasará automáticamente al estado{' '}
                    <strong className="text-amber-300 font-mono font-semibold">
                      &quot;Esperando Confirmación&quot;
                    </strong>{' '}
                    y se emitirá una notificación al cliente para su aprobación o rechazo.
                  </p>
                </div>

                {/* Resumen del Diagnóstico */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-500 block font-semibold">
                      Falla Registrada:
                    </span>
                    <p className="text-slate-200 italic mt-0.5">&ldquo;{descripcionFalla}&rdquo;</p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-slate-300">
                    <span>Mano de obra técnica:</span>
                    <span className="font-mono font-bold">${numManoObra.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-300">
                    <span>Insumos vinculados ({insumosSeleccionados.length}):</span>
                    <span className="font-mono font-bold">${subtotalInsumos.toFixed(2)}</span>
                  </div>

                  <div className="pt-2 border-t border-slate-700/80 flex items-center justify-between text-sm">
                    <span className="font-bold text-white">Importe Presupuestado:</span>
                    <span className="font-mono font-black text-cyan-400 text-lg">
                      ${totalPresupuesto.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Botones de Confirmación / Retorno */}
                <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => setVistaConfirmacion(false)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Regresar a Editar
                  </button>
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={handleConfirmarYEnviar}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {enviando ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Guardando y Notificando...</span>
                      </>
                    ) : (
                      <>
                        <span>Confirmar y Notificar al Cliente</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

CargarDiagnosticoModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  reparacion: PropTypes.object,
  onSuccess: PropTypes.func
};
