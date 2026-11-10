import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

import { API_BASE_URL } from '../../config/api';
export default function ModificarSolicitudModal({
  isOpen,
  onClose,
  solicitud,
  token,
  proveedoresPadron = [],
  productosCatalogo = [],
  cargandoAuxiliares = false,
  onGuardadoExitoso,
  onAbrirNuevoProveedor,
  onAbrirNuevoProducto
}) {
  // ---------------------------------------------------------------------------
  // Estados Locales de Formulario de Modificación
  // ---------------------------------------------------------------------------
  const [proveedoresSeleccionados, setProveedoresSeleccionados] = useState([]);
  const [itemsSolicitados, setItemsSolicitados] = useState([]);
  const [busquedaProveedor, setBusquedaProveedor] = useState('');
  const [busquedaInsumo, setBusquedaInsumo] = useState('');
  const [insumoSeleccionadoId, setInsumoSeleccionadoId] = useState('');

  // Carga manual de insumo para sondeo
  const [mostrarCargaManual, setMostrarCargaManual] = useState(false);
  const [manualMarca, setManualMarca] = useState('');
  const [manualModelo, setManualModelo] = useState('');
  const [manualDescripcion, setManualDescripcion] = useState('');

  // Flujo de confirmación y procesamiento (Paso 5 y 6 de CU-16)
  const [confirmandoEmision, setConfirmandoEmision] = useState(false);
  const [confirmandoGuardadoBorrador, setConfirmandoGuardadoBorrador] = useState(false);
  const [procesandoGuardado, setProcesandoGuardado] = useState(false);
  const [errorModal, setErrorModal] = useState('');

  // Regla 6: Auto-desaparición de alertas de error en 6 segundos
  useEffect(() => {
    if (!errorModal) return undefined;
    const timer = setTimeout(() => setErrorModal(''), 6000);
    return () => clearTimeout(timer);
  }, [errorModal]);

  const esSolicitudTecnica = Boolean(solicitud?.sol_tec);

  // ---------------------------------------------------------------------------
  // Precarga de Datos Existentes de la Solicitud
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !solicitud) return;

    // Inicializar ítems solicitados existentes
    const productosExistentes = (solicitud.productos || []).map((p, idx) => {
      const esManual = Boolean(p.es_manual);
      return {
        uid: esManual ? `manual-init-${idx}-${p.id_producto || Date.now()}` : `cat-${p.id_producto || idx}`,
        es_manual: esManual,
        es_tecnico: esSolicitudTecnica, // Restricción Comentarios CU-16
        id_producto: p.id_producto,
        marca: p.marca || '',
        modelo: p.modelo || '',
        descripcion: p.descripcion || '',
        nombre_mostrar: p.nombre_producto || `${p.marca || ''} ${p.modelo || ''} — ${p.descripcion || ''}`.trim(),
        detalle_mostrar: esManual
          ? `Sondeo Manual • ${p.descripcion || 'Especificación técnica libre'}`
          : (p.categoria || 'Catálogo General')
      };
    });
    setItemsSolicitados(productosExistentes);

    // Inicializar proveedores previamente asignados o invitados
    const cots = solicitud.cotizaciones || solicitud.matriz_ofertas || [];
    const cuitsExistentes = cots
      .map((c) => c.proveedor?.cuit_prov || c.proveedor?.cuit)
      .filter(Boolean);
    setProveedoresSeleccionados(cuitsExistentes);

    // Reset de campos de búsqueda y confirmación
    setBusquedaProveedor('');
    setBusquedaInsumo('');
    setInsumoSeleccionadoId('');
    setMostrarCargaManual(false);
    setManualMarca('');
    setManualModelo('');
    setManualDescripcion('');
    setConfirmandoEmision(false);
    setConfirmandoGuardadoBorrador(false);
    setErrorModal('');
  }, [isOpen, solicitud, esSolicitudTecnica]);

  // ---------------------------------------------------------------------------
  // Filtros de Proveedores
  // ---------------------------------------------------------------------------
  const proveedoresFiltrados = useMemo(() => {
    const q = busquedaProveedor.trim().toLowerCase();
    if (!q) return proveedoresPadron;
    return proveedoresPadron.filter(
      (p) =>
        (p.nombre_proveedor || '').toLowerCase().includes(q) ||
        (p.cuit_prov || '').toLowerCase().includes(q) ||
        (p.correo || '').toLowerCase().includes(q)
    );
  }, [proveedoresPadron, busquedaProveedor]);

  const objetosProveedoresSeleccionados = useMemo(() => {
    return proveedoresSeleccionados
      .map((cuit) => proveedoresPadron.find((p) => p.cuit_prov === cuit))
      .filter(Boolean);
  }, [proveedoresSeleccionados, proveedoresPadron]);

  const proveedoresInactivosSeleccionados = useMemo(() => {
    return objetosProveedoresSeleccionados.filter((p) => !p.estado);
  }, [objetosProveedoresSeleccionados]);

  const toggleSeleccionProveedor = (cuitProv) => {
    setErrorModal('');
    setProveedoresSeleccionados((prev) =>
      prev.includes(cuitProv) ? prev.filter((c) => c !== cuitProv) : [...prev, cuitProv]
    );
  };

  const quitarProveedoresInactivos = () => {
    const inactivosCuits = new Set(proveedoresInactivosSeleccionados.map((p) => p.cuit_prov));
    setProveedoresSeleccionados((prev) => prev.filter((cuit) => !inactivosCuits.has(cuit)));
    setErrorModal('');
  };

  // ---------------------------------------------------------------------------
  // Filtros y Manipulación de Insumos
  // ---------------------------------------------------------------------------
  const productosFiltrados = useMemo(() => {
    const q = busquedaInsumo.trim().toLowerCase();
    const activos = productosCatalogo.filter((p) => p.estado !== false);
    if (!q) return activos;
    return activos.filter(
      (p) =>
        (p.nombre || '').toLowerCase().includes(q) ||
        (p.nombre_categoria || p.categoria || '').toLowerCase().includes(q) ||
        (p.descripcion || '').toLowerCase().includes(q)
    );
  }, [productosCatalogo, busquedaInsumo]);

  const agregarInsumoDeCatalogo = (productoObj) => {
    setErrorModal('');
    if (!productoObj) {
      setErrorModal('Seleccione un insumo o repuesto válido del catálogo.');
      return;
    }

    const idProd = productoObj.id_producto;
    setItemsSolicitados((prev) => {
      const yaExiste = prev.some((item) => !item.es_manual && item.id_producto === idProd);
      if (yaExiste) return prev;
      return [
        ...prev,
        {
          uid: `cat-${idProd}`,
          es_manual: false,
          id_producto: idProd,
          nombre_mostrar: productoObj.nombre,
          detalle_mostrar: productoObj.nombre_categoria || productoObj.categoria || 'Catálogo General'
        }
      ];
    });

    setInsumoSeleccionadoId('');
  };

  const agregarInsumoManual = () => {
    setErrorModal('');
    const marcaLimpia = manualMarca.trim();
    const modeloLimpio = manualModelo.trim();
    const descLimpia = manualDescripcion.trim();

    if (!marcaLimpia || !modeloLimpio || !descLimpia) {
      setErrorModal(
        'Para la carga manual del insumo debe completar obligatoriamente Marca, Modelo y Descripción técnica.'
      );
      return;
    }

    setItemsSolicitados((prev) => [
      ...prev,
      {
        uid: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        es_manual: true,
        marca: marcaLimpia,
        modelo: modeloLimpio,
        descripcion: descLimpia,
        nombre_mostrar: `${marcaLimpia} ${modeloLimpio} — ${descLimpia}`,
        detalle_mostrar: `Sondeo Manual • Marca: ${marcaLimpia} | Modelo: ${modeloLimpio}`
      }
    ]);

    setManualMarca('');
    setManualModelo('');
    setManualDescripcion('');
    setMostrarCargaManual(false);
  };

  const eliminarItemSolicitado = (uid) => {
    const item = itemsSolicitados.find((i) => i.uid === uid);
    if (item?.es_tecnico) {
      setErrorModal(
        'Operación restringida: Los insumos determinados por el área técnica para la reparación no pueden ser eliminados.'
      );
      return;
    }
    setItemsSolicitados((prev) => prev.filter((i) => i.uid !== uid));
  };

  // ---------------------------------------------------------------------------
  // Validaciones de Negocio (CU-16 Paso 4)
  // ---------------------------------------------------------------------------
  const validarFormulario = () => {
    if (proveedoresSeleccionados.length === 0) {
      setErrorModal('Debe seleccionar al menos un proveedor destinatario para la solicitud.');
      return false;
    }

    if (proveedoresInactivosSeleccionados.length > 0) {
      const nombresInactivos = proveedoresInactivosSeleccionados
        .map((p) => p.nombre_proveedor)
        .join(', ');
      setErrorModal(
        `Operación bloqueada: Los siguientes proveedores seleccionados se encuentran inactivos (${nombresInactivos}). Debe quitarlos o seleccionar proveedores activos.`
      );
      return false;
    }

    if (itemsSolicitados.length === 0) {
      setErrorModal('Debe mantener al menos un insumo o repuesto en la lista requerida.');
      return false;
    }

    return true;
  };

  // Paso 5: Confirmación de Emisión o Guardado
  const handleAvanzarConfirmacion = (e) => {
    if (e) e.preventDefault();
    setErrorModal('');
    if (!validarFormulario()) return;
    setConfirmandoGuardadoBorrador(false);
    setConfirmandoEmision(true);
  };

  const handleAvanzarGuardadoBorrador = (e) => {
    if (e) e.preventDefault();
    setErrorModal('');
    if (!validarFormulario()) return;
    setConfirmandoEmision(false);
    setConfirmandoGuardadoBorrador(true);
  };

  // ---------------------------------------------------------------------------
  // Persistencia: Guardar como Borrador o Emitir Formalmente
  // ---------------------------------------------------------------------------
  const ejecutarGuardado = async (emitir = false) => {
    setErrorModal('');
    if (!validarFormulario()) return;

    setProcesandoGuardado(true);
    try {
      const payload = {
        ids_proveedores: proveedoresSeleccionados,
        productos: itemsSolicitados.map((item) =>
          item.es_manual
            ? {
                es_manual: true,
                marca: item.marca,
                modelo: item.modelo,
                descripcion: item.descripcion
              }
            : {
                id_producto: item.id_producto
              }
        ),
        emitir_solicitud: Boolean(emitir)
      };

      const res = await axios.patch(
        `${API_BASE_URL}/api/purchases/solicitudes-cotizacion/${solicitud.id_solicitud}/modificar/`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const solicitudActualizada = res.data?.solicitud || res.data;
      onGuardadoExitoso(!emitir, solicitudActualizada);
    } catch (err) {
      const data = err.response?.data;
      let msg = 'Error al actualizar la solicitud de cotización.';
      if (typeof data?.error === 'string') {
        msg = data.error;
      } else if (Array.isArray(data?.error)) {
        msg = data.error[0];
      } else if (data?.detail) {
        msg = data.detail;
      } else if (data && typeof data === 'object') {
        const firstVal = Object.values(data)[0];
        if (Array.isArray(firstVal)) msg = firstVal[0];
        else if (typeof firstVal === 'string') msg = firstVal;
      }
      setErrorModal(msg);
    } finally {
      setProcesandoGuardado(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="bg-[#1E293B] border border-cyan-500/30 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden my-auto"
      >
        {/* Cabecera del Modal */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#0F172A]/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
              {confirmandoEmision
                ? 'Confirmación Final • Emisión Formal'
                : 'Modificación de Pliego en Borrador'}
            </span>
            <h2 className="text-lg sm:text-xl font-black text-white">
              {confirmandoEmision
                ? `Resumen de Emisión • Solicitud #${solicitud?.id_solicitud}`
                : `Modificar Solicitud de Cotización #${solicitud?.id_solicitud}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={procesandoGuardado}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Alerta de Error con Regla 6 */}
          <AnimatePresence>
            {errorModal && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="bg-rose-500/15 border border-rose-500/40 text-rose-200 px-4 py-3 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-rose-400 text-base">⚠</span>
                  <span>{errorModal}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorModal('')}
                  className="text-rose-300 hover:text-white text-xs font-mono cursor-pointer shrink-0"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {confirmandoGuardadoBorrador ? (
            /* VISTA DE CONFIRMACIÓN DE GUARDADO EN BORRADOR (PASO 5 Y 6 CU-16) */
            <div className="space-y-6">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex items-start gap-4">
                <span className="text-2xl">📝</span>
                <div className="space-y-1 text-sm">
                  <h3 className="font-bold text-white">
                    Confirmar Guardado de Cambios en Borrador
                  </h3>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    ¿Desea guardar las modificaciones en la Solicitud de Cotización #{solicitud?.id_solicitud} manteniendo
                    su estado en <span className="text-amber-300 font-semibold">&ldquo;Borrador&rdquo;</span>?
                    Los cambios se registrarán en la base de datos sin emitir invitaciones ni notificar por correo a los proveedores.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-amber-400">
                    Proveedores Asignados ({objetosProveedoresSeleccionados.length})
                  </h4>
                  <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto">
                    {objetosProveedoresSeleccionados.map((p) => (
                      <div key={p.cuit_prov} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-white">{p.nombre_proveedor}</div>
                          <div className="text-xs text-slate-400 font-mono">CUIT: {p.cuit_prov}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Activo
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-amber-400">
                    Insumos del Borrador ({itemsSolicitados.length})
                  </h4>
                  <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto">
                    {itemsSolicitados.map((item) => (
                      <div key={item.uid} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">{item.nombre_mostrar}</div>
                          <div className="text-xs text-slate-400">{item.detalle_mostrar}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                            item.es_manual
                              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                              : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          {item.es_manual ? 'Sondeo Manual' : 'Catálogo'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : !confirmandoEmision ? (
            /* VISTA DE EDICIÓN (PROVEEDORES + INSUMOS) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* COLUMNA IZQUIERDA: PROVEEDORES DESTINATARIOS */}
              <div className="lg:col-span-5 bg-[#0F172A]/70 border border-slate-800 rounded-2xl p-5 flex flex-col space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    1. Proveedores Destinatarios
                  </h3>
                  <p className="text-xs text-slate-400">
                    Añada o quite proveedores activos destinatarios del pliego.
                  </p>
                </div>

                {/* Buscador de Proveedores */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={busquedaProveedor}
                    onChange={(e) => setBusquedaProveedor(e.target.value)}
                    placeholder="Buscar proveedor por nombre o CUIT..."
                    className="w-full bg-[#1E293B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                  />
                  {onAbrirNuevoProveedor && (
                    <button
                      type="button"
                      onClick={() => onAbrirNuevoProveedor(busquedaProveedor.trim())}
                      title="Registrar un nuevo proveedor"
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-cyan-500/30 shrink-0 cursor-pointer"
                    >
                      + Prov
                    </button>
                  )}
                </div>

                {/* Advertencia si hay proveedores inactivos seleccionados */}
                {proveedoresInactivosSeleccionados.length > 0 && (
                  <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-200 space-y-2">
                    <div className="font-bold text-amber-300">
                      ⚠ Proveedor inactivo seleccionado
                    </div>
                    <p>
                      El sistema no permite emitir solicitudes a proveedores inactivos.
                    </p>
                    <button
                      type="button"
                      onClick={quitarProveedoresInactivos}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold border border-amber-400/40 transition-colors cursor-pointer"
                    >
                      Quitar proveedores inactivos
                    </button>
                  </div>
                )}

                {/* Lista de Proveedores del Padrón */}
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {cargandoAuxiliares ? (
                    <div className="py-8 text-center text-xs text-slate-400 font-mono">
                      Cargando padrón de proveedores...
                    </div>
                  ) : proveedoresFiltrados.length === 0 ? (
                    <div className="bg-[#1E293B] border border-amber-500/30 rounded-xl p-4 text-center space-y-3">
                      <p className="text-xs text-amber-300 font-semibold">
                        El proveedor &ldquo;{busquedaProveedor}&rdquo; no existe en el padrón.
                      </p>
                      {onAbrirNuevoProveedor && (
                        <button
                          type="button"
                          onClick={() => onAbrirNuevoProveedor(busquedaProveedor.trim())}
                          className="px-3.5 py-1.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer"
                        >
                          Registrar Proveedor
                        </button>
                      )}
                    </div>
                  ) : (
                    proveedoresFiltrados.map((prov) => {
                      const seleccionado = proveedoresSeleccionados.includes(prov.cuit_prov);
                      return (
                        <div
                          key={prov.cuit_prov}
                          onClick={() => toggleSeleccionProveedor(prov.cuit_prov)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            seleccionado
                              ? prov.estado
                                ? 'bg-cyan-500/10 border-[#06B6D4] shadow-md shadow-cyan-950/30'
                                : 'bg-rose-500/15 border-rose-500/60'
                              : 'bg-[#1E293B]/90 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white truncate">
                                {prov.nombre_proveedor}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                  prov.estado
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                }`}
                              >
                                {prov.estado ? 'Activo' : 'Inactivo'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                              CUIT: {prov.cuit_prov} • {prov.correo || 'Sin correo'}
                            </div>
                          </div>

                          <input
                            type="checkbox"
                            checked={seleccionado}
                            onChange={() => {}}
                            className="w-4 h-4 accent-[#06B6D4] rounded cursor-pointer"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* COLUMNA DERECHA: LISTADO DE INSUMOS Y REPUESTOS */}
              <div className="lg:col-span-7 bg-[#0F172A]/70 border border-slate-800 rounded-2xl p-5 flex flex-col space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      2. Listado de Insumos / Repuestos Requeridos
                    </h3>
                    <p className="text-xs text-slate-400">
                      Modifique los artículos o agregue nuevos ítems para el sondeo.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMostrarCargaManual((prev) => !prev)}
                      className="px-3 py-1.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 text-xs font-bold border border-violet-500/30 transition-all cursor-pointer"
                    >
                      {mostrarCargaManual ? 'Ocultar Carga Manual' : '+ Carga Manual'}
                    </button>
                    {onAbrirNuevoProducto && (
                      <button
                        type="button"
                        onClick={onAbrirNuevoProducto}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-cyan-500/30 transition-all cursor-pointer"
                      >
                        + Catálogo
                      </button>
                    )}
                  </div>
                </div>

                {/* Selector desde Catálogo */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-3.5 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                        Filtrar Catálogo
                      </label>
                      <input
                        type="text"
                        value={busquedaInsumo}
                        onChange={(e) => setBusquedaInsumo(e.target.value)}
                        placeholder="Buscar repuesto o insumo..."
                        className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                        Insumo del Catálogo
                      </label>
                      <select
                        value={insumoSeleccionadoId}
                        onChange={(e) => setInsumoSeleccionadoId(e.target.value)}
                        className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#06B6D4] cursor-pointer"
                      >
                        <option value="">Seleccione un insumo...</option>
                        {productosFiltrados.map((prod) => (
                          <option key={prod.id_producto} value={prod.id_producto}>
                            {prod.nombre} (Stock: {prod.cantidad_actual ?? 0})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const prodObj = productosCatalogo.find(
                            (p) => String(p.id_producto) === String(insumoSeleccionadoId)
                          );
                          agregarInsumoDeCatalogo(prodObj);
                        }}
                        className="w-full px-3.5 py-2 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                </div>

                {/* Panel de Carga Manual */}
                <AnimatePresence>
                  {mostrarCargaManual && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-violet-950/25 border border-violet-500/40 rounded-xl p-4 space-y-3"
                    >
                      <span className="text-xs font-bold text-violet-300 block">
                        Carga Manual de Insumo Técnico para Sondeo
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-mono text-slate-300 mb-1">
                            Marca *
                          </label>
                          <input
                            type="text"
                            value={manualMarca}
                            onChange={(e) => setManualMarca(e.target.value)}
                            placeholder="Ej. Samsung / Apple"
                            className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-400"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-mono text-slate-300 mb-1">
                            Modelo *
                          </label>
                          <input
                            type="text"
                            value={manualModelo}
                            onChange={(e) => setManualModelo(e.target.value)}
                            placeholder="Ej. Galaxy S23 Ultra"
                            className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-400"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-mono text-slate-300 mb-1">
                            Descripción Técnica *
                          </label>
                          <input
                            type="text"
                            value={manualDescripcion}
                            onChange={(e) => setManualDescripcion(e.target.value)}
                            placeholder="Ej. Flex de carga original"
                            className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-400"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setMostrarCargaManual(false)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={agregarInsumoManual}
                          className="px-4 py-1.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer"
                        >
                          Añadir Ítem Manual
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Lista de Ítems Modificados */}
                <div className="flex-1 bg-[#1E293B] border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                  <div className="px-4 py-2.5 bg-[#0F172A]/60 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-slate-400">
                      Renglones de la Solicitud ({itemsSolicitados.length})
                    </span>
                  </div>

                  {itemsSolicitados.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No hay insumos en esta solicitud. Debe añadir al menos uno.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800 max-h-56 overflow-y-auto">
                      {itemsSolicitados.map((item) => (
                        <div
                          key={item.uid}
                          className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-800/30"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">
                                {item.nombre_mostrar}
                              </span>
                              {item.es_tecnico && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                  title="Insumo determinado por el área técnica de taller para la reparación en curso"
                                >
                                  Taller Requerido
                                </span>
                              )}
                              {item.es_manual ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                  Sondeo Manual
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                  Catálogo
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {item.detalle_mostrar}
                            </div>
                          </div>

                          {item.es_tecnico ? (
                            <button
                              type="button"
                              disabled={true}
                              title="Insumo crítico requerido por el área técnica de taller. No puede ser eliminado de la solicitud."
                              className="p-1.5 rounded-lg bg-slate-800 text-slate-500 text-xs cursor-not-allowed opacity-40 shrink-0"
                            >
                              🔒
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => eliminarItemSolicitado(item.uid)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs transition-colors cursor-pointer shrink-0"
                              title="Quitar renglón"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* VISTA DE CONFIRMACIÓN DE EMISIÓN */
            <div className="space-y-6">
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-5 flex items-start gap-4">
                <span className="text-2xl">📨</span>
                <div className="space-y-1 text-sm">
                  <h3 className="font-bold text-white">
                    Confirmación de Emisión Formal de Solicitud #{solicitud?.id_solicitud}
                  </h3>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Al confirmar, el estado del pliego cambiará a{' '}
                    <span className="text-cyan-300 font-semibold">&ldquo;Enviada a Proveedores&rdquo;</span>,
                    se generarán tokens criptográficos únicos para cada proveedor destinatario y se despacharán
                    los correos electrónicos de notificación.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                    Proveedores a Notificar ({objetosProveedoresSeleccionados.length})
                  </h4>
                  <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto">
                    {objetosProveedoresSeleccionados.map((p) => (
                      <div key={p.cuit_prov} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-white">{p.nombre_proveedor}</div>
                          <div className="text-xs text-slate-400 font-mono">
                            CUIT: {p.cuit_prov} • {p.correo || 'Sin correo'}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Activo
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                    Insumos del Pliego ({itemsSolicitados.length})
                  </h4>
                  <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto">
                    {itemsSolicitados.map((item) => (
                      <div key={item.uid} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">
                            {item.nombre_mostrar}
                          </div>
                          <div className="text-xs text-slate-400">{item.detalle_mostrar}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                            item.es_manual
                              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                              : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          {item.es_manual ? 'Sondeo Manual' : 'Catálogo'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pie del Modal */}
        <div className="px-6 py-4 border-t border-slate-800 bg-[#0F172A]/90 flex flex-wrap items-center justify-between gap-3">
          {confirmandoGuardadoBorrador ? (
            <>
              {/* Excepción Paso 5: Cancelar confirmación y retornar al formulario conservando datos */}
              <button
                type="button"
                onClick={() => setConfirmandoGuardadoBorrador(false)}
                disabled={procesandoGuardado}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold border border-slate-700 transition-all cursor-pointer"
              >
                ← Volver a Edición
              </button>

              <button
                type="button"
                onClick={() => ejecutarGuardado(false)}
                disabled={procesandoGuardado}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-amber-500/25 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>{procesandoGuardado ? 'Guardando Borrador...' : 'Confirmar y Guardar Borrador'}</span>
              </button>
            </>
          ) : !confirmandoEmision ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={procesandoGuardado}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold border border-slate-700 transition-all cursor-pointer"
              >
                Cancelar Modificación
              </button>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleAvanzarGuardadoBorrador}
                  disabled={procesandoGuardado}
                  className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs sm:text-sm font-bold border border-amber-500/40 transition-all cursor-pointer"
                >
                  {procesandoGuardado ? 'Guardando Cambios...' : 'Guardar Cambios como Borrador'}
                </button>

                <button
                  type="button"
                  onClick={handleAvanzarConfirmacion}
                  disabled={procesandoGuardado}
                  className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>Emitir y Solicitar Precios</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmandoEmision(false)}
                disabled={procesandoGuardado}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold border border-slate-700 transition-all cursor-pointer"
              >
                ← Volver a Modificar
              </button>

              <button
                type="button"
                onClick={() => ejecutarGuardado(true)}
                disabled={procesandoGuardado}
                className="px-6 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>
                  {procesandoGuardado
                    ? 'Despachando Solicitud y Tokens...'
                    : 'Confirmar y Emitir Solicitud'}
                </span>
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

ModificarSolicitudModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  solicitud: PropTypes.object,
  token: PropTypes.string.isRequired,
  proveedoresPadron: PropTypes.array,
  productosCatalogo: PropTypes.array,
  cargandoAuxiliares: PropTypes.bool,
  onGuardadoExitoso: PropTypes.func.isRequired,
  onAbrirNuevoProveedor: PropTypes.func,
  onAbrirNuevoProducto: PropTypes.func
};
