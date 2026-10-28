import { useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function CompletarPago({ onAlerta }) {
  const { token } = useAuth();

  // ============================================================================
  // ESTADOS DEL MOTOR DE BÚSQUEDA Y FILTRADO CONTABLE (CU-38)
  // ============================================================================
  const [busquedaExacta, setBusquedaExacta] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('PENDIENTE');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [medioPagoFiltro, setMedioPagoFiltro] = useState('');
  const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false);

  // Datos recuperados de transacciones
  const [transacciones, setTransacciones] = useState([]);
  const [resumenCaja, setResumenCaja] = useState({
    total_recaudado: '0.00',
    total_pendiente: '0.00',
    total_anulado: '0.00'
  });
  const [cargandoLista, setCargandoLista] = useState(false);

  // ============================================================================
  // ESTADOS DEL FLUJO DE COBRO (CU-21)
  // ============================================================================
  const [operacionSeleccionada, setOperacionSeleccionada] = useState(null);
  const [desgloseOperacion, setDesgloseOperacion] = useState(null);
  const [cargandoDesglose, setCargandoDesglose] = useState(false);

  // Formulario de cobro
  const [medioPago, setMedioPago] = useState('Efectivo');
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [montoAbonado, setMontoAbonado] = useState('');
  const [detalle, setDetalle] = useState('');
  const [procesandoPago, setProcesandoPago] = useState(false);

  // Fase 3: Ticket de Éxito
  const [ticketExito, setTicketExito] = useState(null);

  // Alerta local suave
  const [alertaLocal, setAlertaLocal] = useState(null);

  const dispararMensaje = useCallback(
    (tipo, mensaje) => {
      if (typeof onAlerta === 'function') {
        onAlerta(tipo, mensaje);
      } else {
        setAlertaLocal({ tipo, mensaje });
        setTimeout(() => setAlertaLocal(null), 15000);
      }
    },
    [onAlerta]
  );

  // ============================================================================
  // MOTOR DE CONSULTA: FILTRAR COBROS Y PAGOS (CU-38)
  // ============================================================================
  const cargarTransacciones = useCallback(
    async (filtrosOverride = {}) => {
      setCargandoLista(true);
      try {
        const queryParams = {
          estado_pago: filtrosOverride.estado_pago !== undefined ? filtrosOverride.estado_pago : estadoFiltro,
          busqueda_exacta:
            filtrosOverride.busqueda_exacta !== undefined
              ? filtrosOverride.busqueda_exacta
              : busquedaExacta.trim() || undefined,
          fecha_desde:
            filtrosOverride.fecha_desde !== undefined ? filtrosOverride.fecha_desde : fechaDesde || undefined,
          fecha_hasta:
            filtrosOverride.fecha_hasta !== undefined ? filtrosOverride.fecha_hasta : fechaHasta || undefined,
          medio_pago:
            filtrosOverride.medio_pago !== undefined
              ? filtrosOverride.medio_pago
              : medioPagoFiltro.trim() || undefined
        };

        // Doble validación en React: fechas coherentes
        if (queryParams.fecha_desde && queryParams.fecha_hasta && queryParams.fecha_desde > queryParams.fecha_hasta) {
          dispararMensaje('error', 'La fecha de inicio (desde) no puede ser posterior a la fecha hasta.');
          setCargandoLista(false);
          return;
        }

        const response = await axios.get(`${API_BASE_URL}/api/sales/pagos/filtrar/`, {
          params: queryParams,
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = response.data;
        setTransacciones(data.resultados || []);
        if (data.resumen) {
          setResumenCaja(data.resumen);
        }

        if (!data.resultados || data.resultados.length === 0) {
          if (busquedaExacta.trim()) {
            dispararMensaje('warning', 'No se encontraron operaciones pendientes para los criterios ingresados.');
          }
        }
      } catch (error) {
        console.error('Error al filtrar transacciones:', error);
        const msg = error.response?.data?.error || error.response?.data?.mensaje || 'Error al consultar operaciones.';
        dispararMensaje('error', typeof msg === 'object' ? JSON.stringify(msg) : msg);
      } finally {
        setCargandoLista(false);
      }
    },
    [token, estadoFiltro, busquedaExacta, fechaDesde, fechaHasta, medioPagoFiltro, dispararMensaje]
  );

  // Carga inicial de operaciones pendientes de mostrador
  useEffect(() => {
    cargarTransacciones();
  }, [cargarTransacciones]);

  // Manejar submit del formulario de búsqueda
  const handleBuscar = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    cargarTransacciones();
  };

  // Atajo para Arqueo de Caja del Día (Fecha hoy + Estado Pendiente)
  const handleArqueoHoy = () => {
    const hoyStr = new Date().toISOString().split('T')[0];
    setFechaDesde(hoyStr);
    setFechaHasta(hoyStr);
    setEstadoFiltro('PENDIENTE');
    setBusquedaExacta('');
    setMedioPagoFiltro('');
    cargarTransacciones({
      fecha_desde: hoyStr,
      fecha_hasta: hoyStr,
      estado_pago: 'PENDIENTE',
      busqueda_exacta: undefined,
      medio_pago: undefined
    });
  };

  const handleLimpiarFiltros = () => {
    setBusquedaExacta('');
    setEstadoFiltro('PENDIENTE');
    setFechaDesde('');
    setFechaHasta('');
    setMedioPagoFiltro('');
    cargarTransacciones({
      busqueda_exacta: undefined,
      estado_pago: 'PENDIENTE',
      fecha_desde: undefined,
      fecha_hasta: undefined,
      medio_pago: undefined
    });
  };

  // ============================================================================
  // FASE 2: SELECCIÓN Y PREPARACIÓN DE LA OPERACIÓN A COBRAR (CU-21)
  // ============================================================================
  const handleSeleccionarOperacion = async (item) => {
    const identificador = item.codigo_seguridad || item.cliente?.email;
    if (!identificador) {
      dispararMensaje('error', 'La transacción no posee código de seguridad ni correo vinculado.');
      return;
    }

    setOperacionSeleccionada(item);
    setCargandoDesglose(true);
    setTicketExito(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/api/sales/operaciones/pendientes/`, {
        params: { identificador },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = response.data;
      setDesgloseOperacion(data);
      // Precargar datos del formulario con el total a cobrar exacto
      setMontoAbonado(data.total_a_cobrar || String(item.monto) || '0.00');
      setMedioPago('Efectivo');
      setNumeroOperacion('');
      setDetalle('');
    } catch (error) {
      console.error('Error al recuperar detalles de la operación:', error);
      const msg = error.response?.data?.error || 'No se pudieron recuperar los renglones de la operación.';
      dispararMensaje('error', msg);
      // Usar datos básicos del ítem como fallback
      setDesgloseOperacion({
        id_operacion: item.id_operacion,
        tipo_operacion: item.tipo_operacion,
        codigo_seguridad: item.codigo_seguridad,
        estado: item.estado_pago,
        cliente: item.cliente,
        total_a_cobrar: String(item.monto),
        items: []
      });
      setMontoAbonado(String(item.monto) || '0.00');
    } finally {
      setCargandoDesglose(false);
    }
  };

  const handleVolverALista = () => {
    setOperacionSeleccionada(null);
    setDesgloseOperacion(null);
    setTicketExito(null);
    cargarTransacciones();
  };

  // ============================================================================
  // FASE 3: CONFIRMACIÓN DEL COBRO EN CAJA
  // ============================================================================
  const esTransferencia = useMemo(() => {
    return (medioPago || '').toUpperCase() === 'TRANSFERENCIA';
  }, [medioPago]);

  const totalAdeudadoNum = useMemo(() => {
    return parseFloat(desgloseOperacion?.total_a_cobrar || operacionSeleccionada?.monto || 0);
  }, [desgloseOperacion, operacionSeleccionada]);

  const esFormularioValido = useMemo(() => {
    if (!operacionSeleccionada) return false;
    const monto = parseFloat(montoAbonado);
    if (!monto || monto <= 0) return false;
    // Validación estricta del monto adeudado (Paso 4)
    if (Math.abs(monto - totalAdeudadoNum) > 0.01) return false;
    if (esTransferencia && !numeroOperacion.trim()) return false;
    return true;
  }, [operacionSeleccionada, montoAbonado, totalAdeudadoNum, esTransferencia, numeroOperacion]);

  const handleConfirmarCobro = async (e) => {
    e.preventDefault();
    if (!esFormularioValido || procesandoPago) return;

    setProcesandoPago(true);

    try {
      const identificador = operacionSeleccionada.codigo_seguridad || operacionSeleccionada.cliente?.email;
      const payload = {
        identificador,
        medio_pago: medioPago.toUpperCase(),
        monto_pagado: parseFloat(montoAbonado).toFixed(2),
        numero_operacion: esTransferencia ? numeroOperacion.trim() : null,
        detalle: detalle.trim() || undefined
      };

      const response = await axios.post(`${API_BASE_URL}/api/sales/pagos/completar/`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = response.data;
      setTicketExito({
        montoPagado: data.monto_pagado || montoAbonado,
        rutaComprobante: data.ruta_comprobante,
        medioPago,
        cliente: operacionSeleccionada.cliente?.nombre || 'Cliente',
        tipoOperacion: operacionSeleccionada.tipo_operacion,
        codigoSeguridad: operacionSeleccionada.codigo_seguridad
      });
      dispararMensaje('success', '¡Pago registrado exitosamente en caja!');
      // Refrescar listado en segundo plano
      cargarTransacciones();
    } catch (error) {
      console.error('Error al registrar cobro:', error);
      const msg = error.response?.data?.error || 'Error al procesar el cobro. Verifica los datos ingresados.';
      dispararMensaje('error', typeof msg === 'object' ? JSON.stringify(msg) : msg);
    } finally {
      setProcesandoPago(false);
    }
  };

  const handleDescargarFactura = () => {
    if (!ticketExito?.rutaComprobante) return;
    const url = ticketExito.rutaComprobante.startsWith('http')
      ? ticketExito.rutaComprobante
      : `${API_BASE_URL}${ticketExito.rutaComprobante}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      {/* Alerta local flotante (Cyber-Tech suave con auto-descarte) */}
      <AnimatePresence>
        {alertaLocal && (
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className={`p-4 rounded-xl border flex items-center justify-between text-sm shadow-xl ${
              alertaLocal.tipo === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : alertaLocal.tipo === 'warning'
                ? 'bg-amber-950/90 border-amber-500/50 text-amber-200'
                : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">
                {alertaLocal.tipo === 'success' ? '⚡' : alertaLocal.tipo === 'warning' ? '🔔' : '⚠️'}
              </span>
              <span>{alertaLocal.mensaje}</span>
            </div>
            <button
              onClick={() => setAlertaLocal(null)}
              className="text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cabecera Principal (Cumpliendo Regla 9: Cero etiquetas CU-X) */}
      <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-cyan-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-mono border border-cyan-500/30 mb-2">
              Gestión de Caja & Liquidaciones
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>💳</span> Completar Pago de Operación
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
              Localiza órdenes de servicio y ventas mediante filtros contables precisos, asienta el ingreso en caja y
              emite automáticamente el comprobante fiscal en formato PDF.
            </p>
          </div>

          {/* Atajo de Arqueo de Caja del Día */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleArqueoHoy}
              className="px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 text-xs font-bold hover:bg-cyan-500/20 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/10 cursor-pointer"
              title="Filtrar operaciones pendientes con fecha de hoy para arqueo de caja"
            >
              <span>📊</span>
              <span>Arqueo de Hoy</span>
            </button>
          </div>
        </div>

        {/* Tarjetas de Resumen de Caja */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-800">
          <div className="bg-[#0F172A]/70 border border-amber-500/30 rounded-xl p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block">
              Cuentas por Cobrar (Pendientes)
            </span>
            <span className="text-xl font-black text-amber-300 font-mono mt-0.5 block">
              ${resumenCaja.total_pendiente}
            </span>
          </div>

          <div className="bg-[#0F172A]/70 border border-emerald-500/30 rounded-xl p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold block">
              Total Recaudado (Liquidado)
            </span>
            <span className="text-xl font-black text-emerald-300 font-mono mt-0.5 block">
              ${resumenCaja.total_recaudado}
            </span>
          </div>

          <div className="bg-[#0F172A]/70 border border-slate-700 rounded-xl p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
              Operaciones Encontradas
            </span>
            <span className="text-xl font-black text-white font-mono mt-0.5 block">
              {transacciones.length}
            </span>
          </div>
        </div>
      </div>

      {/* ====================================================================== */}
      {/* VISTA 1: TICKET DE ÉXITO (TRAS COMPLETAR COBRO)                        */}
      {/* ====================================================================== */}
      <AnimatePresence mode="wait">
        {ticketExito ? (
          <motion.div
            key="fase-exito"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="bg-[#1E293B] border border-emerald-500/40 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden text-center max-w-2xl mx-auto"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 via-transparent to-transparent pointer-events-none" />

            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20 animate-bounce">
              <span className="text-3xl text-emerald-300">✓</span>
            </div>

            <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30">
              Operación Liquidada
            </span>

            <h2 className="text-3xl font-black text-white tracking-tight mt-4">
              ¡Cobro Registrado Exitosamente!
            </h2>
            <p className="text-slate-300 text-sm mt-2">
              Se ha asentado el cobro en caja y la operación ha transicionado a{' '}
              <span className="text-emerald-400 font-bold">PAGADO</span>.
            </p>

            <div className="mt-6 p-5 rounded-2xl bg-[#0F172A] border border-slate-700/80 text-left space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>Cliente:</span>
                <span className="text-white font-sans font-semibold">{ticketExito.cliente}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Tipo de Operación:</span>
                <span className="text-cyan-400 font-bold">{ticketExito.tipoOperacion}</span>
              </div>
              {ticketExito.codigoSeguridad && (
                <div className="flex justify-between items-center text-slate-400">
                  <span>Código de Seguridad:</span>
                  <span className="text-amber-300 font-bold">{ticketExito.codigoSeguridad}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-slate-400">
                <span>Medio de Pago:</span>
                <span className="text-purple-300 font-semibold">{ticketExito.medioPago}</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                <span className="text-slate-300 font-bold">MONTO PERCIBIDO:</span>
                <span className="text-xl font-black text-[#06B6D4]">${ticketExito.montoPagado}</span>
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                type="button"
                onClick={handleDescargarFactura}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white text-sm font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="text-lg">📄</span>
                <span>Descargar Factura PDF</span>
              </button>

              <button
                type="button"
                onClick={handleVolverALista}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm font-semibold hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
              >
                Cobrar otra operación
              </button>
            </div>
          </motion.div>
        ) : operacionSeleccionada ? (
          /* ================================================================== */
          /* VISTA 2: FORMULARIO DE COBRO Y DESGLOSE (CU-21)                    */
          /* ================================================================== */
          <motion.div
            key="fase-formulario-cobro"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="space-y-6"
          >
            {/* Botón de Retorno */}
            <button
              type="button"
              onClick={handleVolverALista}
              className="px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-700 hover:text-white transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>←</span>
              <span>Volver al listado de cobros</span>
            </button>

            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
              {/* Cabecera del Documento Seleccionado */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                      {operacionSeleccionada.tipo_operacion}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {operacionSeleccionada.estado_pago}
                    </span>
                    {operacionSeleccionada.codigo_seguridad && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono text-slate-300 bg-slate-800 border border-slate-700">
                        Código: {operacionSeleccionada.codigo_seguridad}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-white mt-2">
                    Titular:{' '}
                    <span className="text-slate-200">
                      {operacionSeleccionada.cliente?.nombre || 'Consumidor'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {operacionSeleccionada.cliente?.email}{' '}
                    {operacionSeleccionada.cliente?.dni ? `• DNI: ${operacionSeleccionada.cliente?.dni}` : ''}
                  </p>
                </div>

                <div className="bg-[#0F172A] border border-cyan-500/30 rounded-2xl p-4 sm:px-6 text-right w-full md:w-auto">
                  <span className="text-[11px] font-mono uppercase text-slate-400 font-bold block">
                    TOTAL A COBRAR
                  </span>
                  <span className="text-3xl font-black text-[#06B6D4] font-mono tracking-tight">
                    ${desgloseOperacion?.total_a_cobrar || operacionSeleccionada.monto}
                  </span>
                </div>
              </div>

              {/* Desglose de Renglones / Insumos */}
              {cargandoDesglose ? (
                <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-mono">Cargando desglose de conceptos...</span>
                </div>
              ) : desgloseOperacion?.items && desgloseOperacion.items.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-mono uppercase text-slate-400 font-bold">
                    Renglones e Insumos de la Operación
                  </h4>
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800/60 text-slate-400 font-mono uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-4">Concepto / Producto</th>
                          <th className="py-2.5 px-4 text-center">Cant.</th>
                          <th className="py-2.5 px-4 text-right">Precio Unit.</th>
                          <th className="py-2.5 px-4 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
                        {desgloseOperacion.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-4 font-sans font-medium text-white">{item.producto}</td>
                            <td className="py-2.5 px-4 text-center">{item.cantidad}</td>
                            <td className="py-2.5 px-4 text-right">${item.precio_unitario}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-cyan-300">${item.subtotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* Formulario de Definición del Cobro */}
              <form onSubmit={handleConfirmarCobro} className="space-y-5 pt-2">
                <h4 className="text-xs font-mono uppercase text-purple-400 font-bold tracking-wider">
                  Definición del Pago y Liquidación
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Medio de Pago */}
                  <div>
                    <label className="block text-xs font-mono uppercase text-slate-300 font-bold mb-1.5">
                      Medio de Pago
                    </label>
                    <select
                      value={medioPago}
                      onChange={(e) => setMedioPago(e.target.value)}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]"
                    >
                      <option value="Efectivo">Efectivo</option>
                      <option value="Transferencia">Transferencia Virtual</option>
                      <option value="Tarjeta">Tarjeta de Débito / Crédito</option>
                    </select>
                  </div>

                  {/* Monto Abonado */}
                  <div>
                    <label className="block text-xs font-mono uppercase text-slate-300 font-bold mb-1.5">
                      Monto a Percibir ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={montoAbonado}
                        onChange={(e) => setMontoAbonado(e.target.value)}
                        className={`w-full bg-[#0F172A] border rounded-xl pl-8 pr-4 py-3 text-sm text-white font-mono focus:outline-none transition-all ${
                          Math.abs(parseFloat(montoAbonado || 0) - totalAdeudadoNum) > 0.01
                            ? 'border-amber-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400'
                            : 'border-slate-700 focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]'
                        }`}
                        required
                      />
                    </div>
                    {Math.abs(parseFloat(montoAbonado || 0) - totalAdeudadoNum) > 0.01 && (
                      <p className="text-[11px] text-amber-400 mt-1">
                        ⚠️ El monto debe coincidir exactamente con el total adeudado (${totalAdeudadoNum.toFixed(2)}).
                      </p>
                    )}
                  </div>
                </div>

                {/* Número de Operación: Obligatorio si es Transferencia */}
                <AnimatePresence>
                  {esTransferencia && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-1.5"
                    >
                      <label className="block text-xs font-mono uppercase text-cyan-400 font-bold">
                        Número de Operación / Transferencia <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. TRANSF-123456789 / CBU comprobante"
                        value={numeroOperacion}
                        onChange={(e) => setNumeroOperacion(e.target.value)}
                        className="w-full bg-[#0F172A] border border-cyan-500/40 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30"
                        required
                      />
                      <p className="text-[11px] text-slate-400">
                        Parámetro obligatorio para la conciliación y auditoría contable de transferencias.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Detalle / Observaciones */}
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 font-bold mb-1.5">
                    Observaciones del Cobro (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Cobro realizado en mostrador durante cierre de turno"
                    value={detalle}
                    onChange={(e) => setDetalle(e.target.value)}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#06B6D4]"
                  />
                </div>

                {/* Botón de Confirmación */}
                <button
                  type="submit"
                  disabled={!esFormularioValido || procesandoPago}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white text-sm font-bold shadow-xl shadow-cyan-500/20 hover:shadow-cyan-500/40 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
                >
                  {procesandoPago ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Procesando pago y generando factura fiscal...</span>
                    </>
                  ) : (
                    <span>Confirmar Cobro y Emitir Comprobante</span>
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          /* ================================================================== */
          /* VISTA 3: FILTRAR Y LOCALIZAR OPERACIONES (CU-38)                   */
          /* ================================================================== */
          <div className="space-y-6">
            {/* Panel de Filtros Multicriterio */}
            <motion.div
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-4"
            >
              <form onSubmit={handleBuscar} className="space-y-4">
                {/* Fila 1: Búsqueda exacta y selector de estado */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-8 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
                      🔍
                    </span>
                    <input
                      type="text"
                      value={busquedaExacta}
                      onChange={(e) => setBusquedaExacta(e.target.value)}
                      placeholder="Buscar por Código de Seguridad o Correo del Cliente..."
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30 transition-all font-sans"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <select
                      value={estadoFiltro}
                      onChange={(e) => setEstadoFiltro(e.target.value)}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-[#8B5CF6] font-sans"
                    >
                      <option value="PENDIENTE">Estado: Pendiente (Por Cobrar)</option>
                      <option value="PAGADO">Estado: Pagado (Histórico)</option>
                      <option value="ANULADO">Estado: Anulado / Cancelado</option>
                      <option value="TODOS">Todos los Estados</option>
                    </select>
                  </div>
                </div>

                {/* Toggle de Filtros Avanzados (Fechas y Medios) */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
                    className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>{mostrarFiltrosAvanzados ? '▲ Ocultar filtros avanzados' : '▼ Filtros de fecha y método de pago'}</span>
                  </button>

                  {(fechaDesde || fechaHasta || medioPagoFiltro || busquedaExacta) && (
                    <button
                      type="button"
                      onClick={handleLimpiarFiltros}
                      className="text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>

                {/* Filtros Temporales y de Método de Cobro */}
                <AnimatePresence>
                  {mostrarFiltrosAvanzados && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800"
                    >
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                          Fecha Desde
                        </label>
                        <input
                          type="date"
                          value={fechaDesde}
                          onChange={(e) => setFechaDesde(e.target.value)}
                          className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                          Fecha Hasta
                        </label>
                        <input
                          type="date"
                          value={fechaHasta}
                          onChange={(e) => setFechaHasta(e.target.value)}
                          className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                          Método de Pago
                        </label>
                        <select
                          value={medioPagoFiltro}
                          onChange={(e) => setMedioPagoFiltro(e.target.value)}
                          className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                        >
                          <option value="">Cualquier método</option>
                          <option value="Efectivo">Efectivo</option>
                          <option value="Transferencia">Transferencia</option>
                          <option value="Tarjeta">Tarjeta</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Botón de Ejecución del Filtrado */}
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={cargandoLista}
                    className="px-7 py-3 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white text-xs font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center gap-2 cursor-pointer"
                  >
                    {cargandoLista ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Filtrando...</span>
                      </>
                    ) : (
                      <>
                        <span>⚡</span>
                        <span>Aplicar Filtros</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>

            {/* Listado de Operaciones y Transacciones */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono uppercase text-slate-400 font-bold tracking-wider">
                  Listado de Transacciones ({transacciones.length})
                </h3>
              </div>

              {cargandoLista ? (
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center">
                  <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs font-mono text-slate-400">Consultando operaciones contables...</p>
                </div>
              ) : transacciones.length === 0 ? (
                /* Excepción Paso 2: Sin operaciones */
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center"
                >
                  <span className="text-4xl block mb-3">🔍</span>
                  <h4 className="text-base font-bold text-white">No se encontraron resultados</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    No existen operaciones comerciales que coincidan con los parámetros de búsqueda provistos.
                    Prueba modificando el rango de fechas o el estado del pago.
                  </p>
                  <button
                    type="button"
                    onClick={handleLimpiarFiltros}
                    className="mt-4 px-5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition-all cursor-pointer"
                  >
                    Ver todas las operaciones pendientes
                  </button>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {transacciones.map((t, idx) => {
                    const esPendiente = t.estado_pago === 'PENDIENTE';
                    const esPagado = t.estado_pago === 'PAGADO';
                    return (
                      <motion.div
                        key={idx}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`bg-[#1E293B] border rounded-2xl p-5 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all ${
                          esPendiente
                            ? 'border-amber-500/30 hover:border-amber-500/60'
                            : esPagado
                            ? 'border-emerald-500/30 hover:border-emerald-500/60'
                            : 'border-slate-700/80'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                              {t.tipo_operacion}
                            </span>

                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                                esPendiente
                                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/40 animate-pulse'
                                  : esPagado
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                                  : 'bg-rose-500/10 text-rose-300 border-rose-500/40'
                              }`}
                            >
                              {t.estado_pago}
                            </span>

                            {t.codigo_seguridad && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono text-slate-300 bg-[#0F172A] border border-slate-700">
                                Código: {t.codigo_seguridad}
                              </span>
                            )}

                            {t.medio_pago && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono text-purple-300 bg-purple-500/10 border border-purple-500/30">
                                {t.medio_pago}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            <span className="font-semibold text-white">
                              {t.cliente?.nombre || 'Consumidor'}
                            </span>
                            {t.cliente?.email && (
                              <span className="text-slate-400 font-mono text-[11px]">
                                {t.cliente.email}
                              </span>
                            )}
                            {t.cliente?.dni && (
                              <span className="text-slate-400 font-mono text-[11px]">
                                DNI: {t.cliente.dni}
                              </span>
                            )}
                            <span className="text-slate-500 font-mono text-[11px]">
                              Fecha: {t.fecha}
                            </span>
                          </div>

                          {t.detalle && (
                            <p className="text-[11px] text-slate-400 line-clamp-1">{t.detalle}</p>
                          )}
                        </div>

                        {/* Monto y Botón de Acción */}
                        <div className="flex items-center justify-between md:justify-end gap-5 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-800">
                          <div className="text-left md:text-right">
                            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                              {esPendiente ? 'Total a Cobrar' : 'Monto Percibido'}
                            </span>
                            <span
                              className={`text-xl font-black font-mono ${
                                esPendiente ? 'text-amber-400' : esPagado ? 'text-emerald-400' : 'text-slate-400'
                              }`}
                            >
                              ${t.monto}
                            </span>
                          </div>

                          {esPendiente ? (
                            <button
                              type="button"
                              onClick={() => handleSeleccionarOperacion(t)}
                              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white text-xs font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>💳</span>
                              <span>Cobrar en Caja</span>
                            </button>
                          ) : t.ruta_comprobante ? (
                            <button
                              type="button"
                              onClick={() => {
                                const url = t.ruta_comprobante.startsWith('http')
                                  ? t.ruta_comprobante
                                  : `${API_BASE_URL}${t.ruta_comprobante}`;
                                window.open(url, '_blank', 'noopener,noreferrer');
                              }}
                              className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-700 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>📄</span>
                              <span>Factura PDF</span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500 font-mono italic">
                              Operación archivada
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

CompletarPago.propTypes = {
  onAlerta: PropTypes.func
};
