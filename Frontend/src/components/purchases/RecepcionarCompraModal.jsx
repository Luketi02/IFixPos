import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';

import { API_BASE_URL } from '../../config/api';
export default function RecepcionarCompraModal({
  isOpen,
  onClose,
  idOrden,
  ordenInicial = null,
  onRecepcionExitosa
}) {
  const { token } = useAuth();

  // Estados de carga y checklist
  const [cargandoChecklist, setCargandoChecklist] = useState(false);
  const [procesandoIngreso, setProcesandoIngreso] = useState(false);
  const [checklist, setChecklist] = useState(null);
  const [itemsConciliacion, setItemsConciliacion] = useState([]);
  const [nroRemito, setNroRemito] = useState('');

  // Estados de alertas y pasos de confirmación de excepciones (Excedente / Faltante / Éxito)
  const [errorAlerta, setErrorAlerta] = useState('');
  const [modalConfirmacionTipo, setModalConfirmacionTipo] = useState(null); // 'EXCEDENTE' | 'FALTANTE' | 'MIXTO' | null
  const [resultadoRecepcion, setResultadoRecepcion] = useState(null);

  // Auto-cierre de alertas de error a los 6 segundos (Regla 6)
  useEffect(() => {
    if (!errorAlerta) return undefined;
    const timer = setTimeout(() => setErrorAlerta(''), 6000);
    return () => clearTimeout(timer);
  }, [errorAlerta]);

  const obtenerHeaders = useCallback(() => {
    const activeToken = token || localStorage.getItem('access_token');
    return {
      headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {}
    };
  }, [token]);

  // Paso 2: Cargar el formulario de conciliación (Checklist) verificando estado "Esperando Entrega"
  const cargarChecklist = useCallback(async () => {
    if (!idOrden) return;
    setCargandoChecklist(true);
    setErrorAlerta('');
    setModalConfirmacionTipo(null);
    setResultadoRecepcion(null);

    try {
      const resp = await axios.get(
        `${API_BASE_URL}/api/purchases/ordenes-compra/${idOrden}/recepcionar/`,
        obtenerHeaders()
      );
      const data = resp.data;
      setChecklist(data);
      setNroRemito(data.nro_remito || '');

      const renglones = Array.isArray(data.items) ? data.items : [];
      setItemsConciliacion(
        renglones.map((item) => ({
          id_detalle_compra: item.id_detalle_compra,
          id_producto: item.id_producto,
          nombre_producto: item.nombre_producto || `Repuesto #${item.id_producto}`,
          cantidad_esperada: Number(item.cantidad_esperada) || 0,
          cantidad_recibida:
            item.cantidad_recibida !== null && item.cantidad_recibida !== undefined
              ? Number(item.cantidad_recibida)
              : Number(item.cantidad_esperada) || 0,
          precio_unitario: Number(item.precio_unitario) || 0
        }))
      );
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'No se pudo cargar el formulario de conciliación. Verifique que la Orden de Compra se encuentre en estado "Esperando Entrega".';
      setErrorAlerta(msg);
      setChecklist(null);
    } finally {
      setCargandoChecklist(false);
    }
  }, [idOrden, obtenerHeaders]);

  useEffect(() => {
    if (isOpen && idOrden) {
      cargarChecklist();
    } else if (!isOpen) {
      setChecklist(null);
      setItemsConciliacion([]);
      setNroRemito('');
      setErrorAlerta('');
      setModalConfirmacionTipo(null);
      setResultadoRecepcion(null);
    }
  }, [isOpen, idOrden, cargarChecklist]);

  // Paso 3: Ajustar valores numéricos de cada ítem (por faltantes o excedentes)
  const handleCantidadChange = (idDetalle, nuevoValorRaw) => {
    setModalConfirmacionTipo(null);
    if (nuevoValorRaw === '') {
      setItemsConciliacion((prev) =>
        prev.map((it) =>
          it.id_detalle_compra === idDetalle ? { ...it, cantidad_recibida: '' } : it
        )
      );
      return;
    }

    const parsed = parseInt(nuevoValorRaw, 10);
    if (Number.isNaN(parsed)) return;

    setItemsConciliacion((prev) =>
      prev.map((it) =>
        it.id_detalle_compra === idDetalle
          ? { ...it, cantidad_recibida: Math.max(0, parsed) }
          : it
      )
    );
  };

  const handleAjustarDelta = (idDetalle, delta) => {
    setModalConfirmacionTipo(null);
    setItemsConciliacion((prev) =>
      prev.map((it) => {
        if (it.id_detalle_compra !== idDetalle) return it;
        const actual = Number(it.cantidad_recibida) || 0;
        return { ...it, cantidad_recibida: Math.max(0, actual + delta) };
      })
    );
  };

  const handleRestaurarCantidadesEsperadas = () => {
    setModalConfirmacionTipo(null);
    setItemsConciliacion((prev) =>
      prev.map((it) => ({
        ...it,
        cantidad_recibida: it.cantidad_esperada
      }))
    );
  };

  // Paso 4: Cálculo dinámico del "Total a Abonar" y análisis de faltantes / excedentes
  const resumenConciliacion = useMemo(() => {
    let totalEsperado = 0;
    let totalAbonar = 0;
    let unidadesEsperadas = 0;
    let unidadesRecibidas = 0;
    const itemsConExcedente = [];
    const itemsConFaltante = [];
    let tieneCantidadInvalida = false;

    itemsConciliacion.forEach((it) => {
      const esp = Number(it.cantidad_esperada) || 0;
      const recRaw = it.cantidad_recibida;
      const rec = recRaw === '' ? -1 : Number(recRaw);
      const precio = Number(it.precio_unitario) || 0;

      if (recRaw === '' || Number.isNaN(rec) || rec < 0 || !Number.isInteger(rec)) {
        tieneCantidadInvalida = true;
      }

      const recValido = rec >= 0 ? rec : 0;
      totalEsperado += esp * precio;
      totalAbonar += recValido * precio;
      unidadesEsperadas += esp;
      unidadesRecibidas += recValido;

      if (recValido > esp) {
        itemsConExcedente.push({
          ...it,
          diferencia: recValido - esp,
          costoExtra: (recValido - esp) * precio
        });
      } else if (recValido < esp) {
        itemsConFaltante.push({
          ...it,
          diferencia: esp - recValido,
          ahorroFaltante: (esp - recValido) * precio
        });
      }
    });

    const hayExcedente = itemsConExcedente.length > 0;
    const hayFaltante = itemsConFaltante.length > 0;
    const diferenciaMonetaria = totalAbonar - totalEsperado;
    const estadoProyectado = hayFaltante ? 'Entregada Parcialmente' : 'Entregada';

    return {
      totalEsperado,
      totalAbonar,
      diferenciaMonetaria,
      unidadesEsperadas,
      unidadesRecibidas,
      itemsConExcedente,
      itemsConFaltante,
      hayExcedente,
      hayFaltante,
      tieneCantidadInvalida,
      estadoProyectado
    };
  }, [itemsConciliacion]);

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

  // Paso 5 y Excepciones (Paso 5 Excedente / Paso 8 Faltante)
  const handleIniciarConfirmacion = (e) => {
    if (e) e.preventDefault();
    setErrorAlerta('');

    // Paso 6: Validar que las cantidades no sean negativas ni vacías
    if (resumenConciliacion.tieneCantidadInvalida) {
      setErrorAlerta(
        'Todas las cantidades recibidas deben ser números enteros mayores o iguales a cero (no negativas).'
      );
      return;
    }

    // Si hay tanto excedente como faltante en distintos renglones
    if (resumenConciliacion.hayExcedente && resumenConciliacion.hayFaltante) {
      setModalConfirmacionTipo('MIXTO');
      return;
    }

    // Excepción Paso 5: Advertencia por excedente de mercadería
    if (resumenConciliacion.hayExcedente) {
      setModalConfirmacionTipo('EXCEDENTE');
      return;
    }

    // Excepción Paso 8: Alerta por faltante físico (Entrega Parcial)
    if (resumenConciliacion.hayFaltante) {
      setModalConfirmacionTipo('FALTANTE');
      return;
    }

    // Sin discrepancias: ejecutar directamente el ingreso (Paso 6 en adelante)
    ejecutarRecepcionCompra(false);
  };

  // Pasos 6, 7, 8, 9 y 10: Impacto definitivo en Backend
  const ejecutarRecepcionCompra = async (confirmarExcedenteFlag = false) => {
    setErrorAlerta('');
    setProcesandoIngreso(true);

    try {
      const payload = {
        nro_remito: nroRemito.trim(),
        confirmar_excedente: Boolean(confirmarExcedenteFlag),
        items: itemsConciliacion.map((it) => ({
          id_detalle_compra: it.id_detalle_compra,
          cantidad_recibida: Number(it.cantidad_recibida) || 0
        }))
      };

      const resp = await axios.patch(
        `${API_BASE_URL}/api/purchases/ordenes-compra/${idOrden}/recepcionar/`,
        payload,
        obtenerHeaders()
      );

      setModalConfirmacionTipo(null);
      setResultadoRecepcion(resp.data);

      if (typeof onRecepcionExitosa === 'function') {
        onRecepcionExitosa(resp.data);
      }
    } catch (err) {
      const dataErr = err?.response?.data;
      if (dataErr?.requiere_confirmacion_excedente) {
        setModalConfirmacionTipo('EXCEDENTE');
      } else {
        const msg =
          dataErr?.error ||
          dataErr?.detail ||
          'Ocurrió un error al procesar la recepción de mercadería.';
        setErrorAlerta(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
    } finally {
      setProcesandoIngreso(false);
    }
  };

  if (!isOpen) return null;

  const datosCabecera = checklist || ordenInicial || {};
  const proveedorObj = datosCabecera.proveedor || {};

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-5xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8 font-['Lexend',sans-serif] text-slate-100 flex flex-col max-h-[92vh]"
        >
          {/* Barra Superior del Modal */}
          <div className="px-6 py-4 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-bold text-white">
                    Recepción y Conciliación Física de Mercadería
                  </h2>
                  {idOrden && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      Orden #{idOrden}
                    </span>
                  )}
                  {datosCabecera.sol_tec && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/40">
                      Urgencia Taller Técnico
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Contraste las cantidades físicas recibidas contra la orden original, registre el remito y actualice el inventario real
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={procesandoIngreso}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
            >
              ✕
            </button>
          </div>

          {/* Cuerpo desplazable */}
          <div className="p-6 overflow-y-auto space-y-5 flex-1">
            {/* Alerta de Error con auto-cierre a los 6s */}
            <AnimatePresence>
              {errorAlerta && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="p-4 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center justify-between shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">{errorAlerta}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorAlerta('')}
                    className="text-slate-400 hover:text-white ml-4"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {cargandoChecklist ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <svg className="w-9 h-9 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <p className="text-xs">Verificando estado de la Orden de Compra y preparando checklist...</p>
              </div>
            ) : resultadoRecepcion ? (
              /* =====================================================================
               * PANTALLA DE ÉXITO POST-RECEPCIÓN (PASOS 7, 8, 9 Y 10)
               * ===================================================================== */
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 py-4"
              >
                <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    ¡Ingreso de Mercadería Confirmado y Stock Actualizado!
                  </h3>
                  <p className="text-xs text-slate-300 max-w-xl mx-auto">
                    {resultadoRecepcion.mensaje}
                  </p>
                </div>

                {/* Tarjetas de Resumen del Cierre Logístico */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-xl">
                    <div className="text-[11px] text-slate-400 uppercase font-semibold">Estado Alcanzado</div>
                    <div className="mt-1.5">
                      {resultadoRecepcion.es_entrega_parcial ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          {resultadoRecepcion.estado_nombre || 'Entregada Parcialmente'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          {resultadoRecepcion.estado_nombre || 'Entregada'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-xl">
                    <div className="text-[11px] text-slate-400 uppercase font-semibold">Comprobante / Remito</div>
                    <div className="text-sm font-mono font-bold text-cyan-300 mt-1.5 break-all">
                      {resultadoRecepcion.nro_remito}
                    </div>
                  </div>

                  <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-xl">
                    <div className="text-[11px] text-slate-400 uppercase font-semibold">Fecha de Recepción</div>
                    <div className="text-sm font-bold text-white mt-1.5">
                      {formatFecha(resultadoRecepcion.fecha_recepcion)}
                    </div>
                  </div>

                  <div className="p-4 bg-[#0F172A] border border-emerald-500/30 rounded-xl">
                    <div className="text-[11px] text-emerald-400 uppercase font-semibold">Total Final a Abonar</div>
                    <div className="text-base font-black text-emerald-300 font-mono mt-1">
                      {formatMoneda(resultadoRecepcion.total_abonar)}
                    </div>
                  </div>
                </div>

                {/* Paso 9: Información de Reactividad Técnica si sol_tec era verdadero */}
                {datosCabecera.sol_tec && (
                  <div className="p-5 bg-violet-500/10 border border-violet-500/30 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2.5 text-violet-300 font-bold text-xs">
                      <svg className="w-5 h-5 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Alerta Técnica Emitida y Sincronización con Taller</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Se notificó automáticamente al personal técnico sobre la disponibilidad de los repuestos ingresados.
                    </p>
                    {Array.isArray(resultadoRecepcion.reparaciones_reactivadas) &&
                    resultadoRecepcion.reparaciones_reactivadas.length > 0 ? (
                      <div className="pt-2">
                        <span className="text-[11px] font-semibold text-violet-300 block mb-1.5">
                          Reparaciones pausadas que pasaron automáticamente de &ldquo;Esperando Insumos&rdquo; a &ldquo;En Reparación&rdquo; (con registro en Bitácora):
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {resultadoRecepcion.reparaciones_reactivadas.map((idRep) => (
                            <span
                              key={idRep}
                              className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-violet-500/20 text-violet-200 border border-violet-500/40"
                            >
                              Reparación #{idRep}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        No se encontraron reparaciones en espera que requirieran transición inmediata o las unidades quedaron reservadas en stock general de taller.
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            ) : !checklist ? (
              <div className="py-12 text-center text-slate-400">
                <p className="text-xs">No se pudo cargar la información de conciliación para esta orden.</p>
              </div>
            ) : (
              /* =====================================================================
               * FORMULARIO DE CONCILIACIÓN (CHECKLIST - PASOS 2, 3, 4 Y 5)
               * ===================================================================== */
              <>
                {/* Resumen de Cabecera y Proveedor */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-xl">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Proveedor Adjudicado
                    </div>
                    <div className="text-sm font-bold text-white mt-1">
                      {proveedorObj.nombre_proveedor || proveedorObj.nombre || 'Proveedor'}
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      CUIT: {proveedorObj.cuit_prov || proveedorObj.cuit || '—'}
                    </div>
                  </div>

                  <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-xl">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Emisión y Modalidad Logística
                    </div>
                    <div className="text-sm font-bold text-white mt-1">
                      Emitida el {formatFecha(checklist.fecha_emision)}
                    </div>
                    <div className="text-xs text-cyan-300 mt-0.5">
                      {checklist.tipo_entrega_nombre ||
                        (Number(checklist.tipo_entrega) === 2 ? 'Envío a Domicilio' : 'Retiro en Sucursal')}
                    </div>
                  </div>

                  {/* Campo Opcional N° de Comprobante / Remito (Paso 2 y 6) */}
                  <div className="p-4 bg-[#0F172A] border border-cyan-500/30 rounded-xl">
                    <label className="block text-[11px] font-semibold text-cyan-300 uppercase tracking-wider mb-1">
                      N° de Comprobante / Remito Físico (Opcional)
                    </label>
                    <input
                      type="text"
                      value={nroRemito}
                      onChange={(e) => setNroRemito(e.target.value)}
                      placeholder="Ej: REM-0001-00048210 (Vacío = Autogenerar)"
                      maxLength={100}
                      className="w-full px-3 py-2 rounded-lg bg-[#1E293B] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Si se deja en blanco, el sistema generará un código interno unívoco de recepción.
                    </p>
                  </div>
                </div>

                {/* Banner informativo si la orden pertenece a un requerimiento técnico (solTec) */}
                {checklist.sol_tec && (
                  <div className="p-3.5 bg-violet-500/10 border border-violet-500/30 rounded-xl flex items-center gap-3 text-xs text-violet-200">
                    <svg className="w-5 h-5 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>
                      <strong>Orden vinculada al Taller Técnico:</strong> Al confirmar el ingreso de estos repuestos, el sistema alertará al área técnica y reanudará automáticamente las reparaciones más antiguas en estado <em>&ldquo;Esperando Insumos&rdquo;</em>.
                    </span>
                  </div>
                )}

                {/* Tabla Checklist de Conciliación de Renglones (Pasos 2, 3 y 4) */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        Checklist de Conciliación de Artículos e Insumos
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Ajuste las cantidades físicas realmente recibidas por faltantes o excedentes
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleRestaurarCantidadesEsperadas}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                    >
                      Restablecer a Cantidades Esperadas
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                        <tr>
                          <th className="px-5 py-3">Repuesto / Insumo</th>
                          <th className="px-4 py-3 text-center">Cant. Esperada</th>
                          <th className="px-4 py-3 text-center">Cant. Real Recibida</th>
                          <th className="px-4 py-3 text-center">Estado de Conciliación</th>
                          <th className="px-4 py-3 text-right">Precio Unit. Histórico</th>
                          <th className="px-5 py-3 text-right">Subtotal Proyectado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {itemsConciliacion.map((item) => {
                          const esp = Number(item.cantidad_esperada) || 0;
                          const rec = item.cantidad_recibida === '' ? 0 : Number(item.cantidad_recibida) || 0;
                          const diff = rec - esp;
                          const subtotalFila = rec * (Number(item.precio_unitario) || 0);

                          return (
                            <tr
                              key={item.id_detalle_compra}
                              className={`transition-colors ${
                                diff > 0
                                  ? 'bg-violet-500/5 hover:bg-violet-500/10'
                                  : diff < 0
                                  ? 'bg-amber-500/5 hover:bg-amber-500/10'
                                  : 'hover:bg-slate-800/40'
                              }`}
                            >
                              {/* Nombre del Producto */}
                              <td className="px-5 py-3.5">
                                <div className="font-semibold text-white">{item.nombre_producto}</div>
                              </td>

                              {/* Cantidad Esperada */}
                              <td className="px-4 py-3.5 text-center">
                                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-mono font-bold">
                                  {esp} unid.
                                </span>
                              </td>

                              {/* Control Numérico de Cantidad Real Recibida */}
                              <td className="px-4 py-3.5 text-center">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleAjustarDelta(item.id_detalle_compra, -1)}
                                    disabled={rec <= 0}
                                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold disabled:opacity-40 transition-colors"
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={item.cantidad_recibida}
                                    onChange={(e) =>
                                      handleCantidadChange(item.id_detalle_compra, e.target.value)
                                    }
                                    className={`w-20 px-2.5 py-1.5 rounded-lg bg-[#1E293B] border text-center font-mono font-bold text-white focus:outline-none ${
                                      item.cantidad_recibida === '' || Number(item.cantidad_recibida) < 0
                                        ? 'border-rose-500'
                                        : diff > 0
                                        ? 'border-violet-400'
                                        : diff < 0
                                        ? 'border-amber-400'
                                        : 'border-slate-700 focus:border-cyan-400'
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleAjustarDelta(item.id_detalle_compra, 1)}
                                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold transition-colors"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>

                              {/* Badge de Conciliación por Renglón */}
                              <td className="px-4 py-3.5 text-center">
                                {diff === 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                    ✓ Completo
                                  </span>
                                ) : diff > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/40">
                                    ▲ Excedente (+{diff} unid.)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    ▼ Faltante ({diff} unid.)
                                  </span>
                                )}
                              </td>

                              {/* Precio Unitario Histórico Congelado */}
                              <td className="px-4 py-3.5 text-right font-mono text-slate-300">
                                {formatMoneda(item.precio_unitario)}
                              </td>

                              {/* Subtotal Real Calculado */}
                              <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-300">
                                {formatMoneda(subtotalFila)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Panel Financiero Dinámico: Total a Abonar y Estado Proyectado (Paso 4) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-[#0F172A] border border-slate-800 rounded-2xl">
                  <div>
                    <div className="text-[11px] text-slate-400 font-medium">Monto Original Solicitado</div>
                    <div className="text-base font-bold text-slate-200 font-mono mt-0.5">
                      {formatMoneda(resumenConciliacion.totalEsperado)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {resumenConciliacion.unidadesEsperadas} unid. pactadas
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-400 font-medium">Variación por Conciliación</div>
                    <div
                      className={`text-base font-bold font-mono mt-0.5 ${
                        resumenConciliacion.diferenciaMonetaria > 0
                          ? 'text-violet-300'
                          : resumenConciliacion.diferenciaMonetaria < 0
                          ? 'text-amber-300'
                          : 'text-slate-400'
                      }`}
                    >
                      {resumenConciliacion.diferenciaMonetaria > 0
                        ? `+ ${formatMoneda(resumenConciliacion.diferenciaMonetaria)}`
                        : resumenConciliacion.diferenciaMonetaria < 0
                        ? `- ${formatMoneda(Math.abs(resumenConciliacion.diferenciaMonetaria))}`
                        : '$ 0,00'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {resumenConciliacion.unidadesRecibidas} unid. físicas declaradas
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-400 font-medium">Estado Final Proyectado</div>
                    <div className="mt-1">
                      {resumenConciliacion.hayFaltante ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Entregada Parcialmente
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Entregada
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="md:text-right bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                    <div className="text-[11px] text-emerald-300 font-bold uppercase tracking-wider">
                      Total a Abonar
                    </div>
                    <div className="text-xl font-black text-emerald-300 font-mono mt-0.5">
                      {formatMoneda(resumenConciliacion.totalAbonar)}
                    </div>
                  </div>
                </div>

                {/* =================================================================
                 * BLOQUES INTERACTIVOS DE CONFIRMACIÓN DE EXCEPCIONES (PASO 5 y PASO 8)
                 * ================================================================= */}
                <AnimatePresence>
                  {modalConfirmacionTipo && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className={`p-5 rounded-2xl border space-y-4 ${
                        modalConfirmacionTipo === 'EXCEDENTE' || modalConfirmacionTipo === 'MIXTO'
                          ? 'bg-violet-500/15 border-violet-500/50'
                          : 'bg-amber-500/15 border-amber-500/50'
                      }`}
                    >
                      {/* Excepción Paso 5: Mensaje exacto por Excedente */}
                      {(modalConfirmacionTipo === 'EXCEDENTE' || modalConfirmacionTipo === 'MIXTO') && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2.5 text-violet-200 font-bold text-sm">
                            <svg className="w-5 h-5 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>
                              Está registrando un excedente de mercadería. El Total a Abonar aumentará. ¿Desea continuar?
                            </span>
                          </div>
                          <ul className="text-xs text-slate-300 space-y-1 pl-7 list-disc">
                            {resumenConciliacion.itemsConExcedente.map((it) => (
                              <li key={it.id_detalle_compra}>
                                <strong>{it.nombre_producto}:</strong> se esperaban {it.cantidad_esperada} unid. y se ingresan{' '}
                                <strong>{it.cantidad_recibida} unid.</strong> (+{it.diferencia} unid. adicionales / +{formatMoneda(it.costoExtra)}).
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Excepción Paso 8: Alerta por Faltante Físico -> Entregada Parcialmente */}
                      {(modalConfirmacionTipo === 'FALTANTE' || modalConfirmacionTipo === 'MIXTO') && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2.5 text-amber-200 font-bold text-sm">
                            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>
                              Inconsistencia por faltante físico detectada: La orden se registrará como &ldquo;Entregada Parcialmente&rdquo;
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 pl-7">
                            Las cantidades ingresadas son menores a las pedidas originalmente. Al confirmar, el stock se incrementará únicamente con las unidades físicas recibidas y la Orden de Compra quedará en estado <strong>&ldquo;Entregada Parcialmente&rdquo;</strong> para mantener abierta la trazabilidad del reclamo al proveedor:
                          </p>
                          <ul className="text-xs text-amber-200/90 space-y-1 pl-11 list-disc">
                            {resumenConciliacion.itemsConFaltante.map((it) => (
                              <li key={it.id_detalle_compra}>
                                <strong>{it.nombre_producto}:</strong> se pidieron {it.cantidad_esperada} unid. y se reciben{' '}
                                <strong>{it.cantidad_recibida} unid.</strong> (Faltan {it.diferencia} unid.).
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setModalConfirmacionTipo(null)}
                          disabled={procesandoIngreso}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                        >
                          Revisar Cantidades
                        </button>
                        <button
                          type="button"
                          onClick={() => ejecutarRecepcionCompra(true)}
                          disabled={procesandoIngreso}
                          className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                          {procesandoIngreso ? (
                            <span>Registrando ingreso...</span>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Sí, Confirmar y Registrar Ingreso</span>
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>

          {/* Pie del Modal */}
          <div className="px-6 py-4 bg-[#0F172A] border-t border-slate-800 flex items-center justify-between shrink-0">
            <div className="text-xs text-slate-400">
              {!resultadoRecepcion && checklist && (
                <span>
                  El stock de los repuestos se incrementará estrictamente según las cantidades reales confirmadas.
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={procesandoIngreso}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                {resultadoRecepcion ? 'Cerrar Resumen' : 'Cancelar'}
              </button>

              {!resultadoRecepcion && checklist && !modalConfirmacionTipo && (
                <button
                  type="button"
                  onClick={handleIniciarConfirmacion}
                  disabled={procesandoIngreso || cargandoChecklist}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.35)] transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {procesandoIngreso ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Procesando Recepción...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.3} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Confirmar Ingreso</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

