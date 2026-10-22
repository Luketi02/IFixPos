import { useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function EntregarDispositivo({ onAlerta }) {
  const { user, token } = useAuth();

  // Detectar rol del usuario (ADMIN vs TECNICO)
  const esAdmin = useMemo(() => {
    const rol = (user?.rol || user?.codigo_rol || user?.id_rol?.codigo || '').toUpperCase();
    return rol === 'ADMIN' || user?.is_superuser === true;
  }, [user]);

  // ============================================================================
  // ESTADOS PRINCIPALES
  // ============================================================================
  // Modo de búsqueda: 'TOKEN' o 'DNI'
  const [modoBusqueda, setModoBusqueda] = useState('TOKEN');
  const [tokenInput, setTokenInput] = useState('');
  const [dniInput, setDniInput] = useState('');
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);

  // Modal / Tooltip de aviso cuando el Técnico intenta cambiar a DNI
  const [modalSeguridadAbierto, setModalSeguridadAbierto] = useState(false);

  // Fase 2: Datos de la Reparación encontrada
  const [reparacion, setReparacion] = useState(null);
  const [comentariosEntrega, setComentariosEntrega] = useState('');
  const [confirmandoEntrega, setConfirmandoEntrega] = useState(false);

  // Fase 3: Ticket de Cierre / Éxito
  const [ticketCierre, setTicketCierre] = useState(null);

  // ============================================================================
  // ESTADOS PARA COBRO DE SALDO PENDIENTE (CU-21)
  // ============================================================================
  const [modalCobroAbierto, setModalCobroAbierto] = useState(false);
  const [medioPagoCobro, setMedioPagoCobro] = useState('Efectivo');
  const [numeroOperacionCobro, setNumeroOperacionCobro] = useState('');
  const [montoCobro, setMontoCobro] = useState('');
  const [detalleCobro, setDetalleCobro] = useState('');
  const [procesandoCobro, setProcesandoCobro] = useState(false);
  const [desgloseDeuda, setDesgloseDeuda] = useState(null);
  const [cargandoDesgloseDeuda, setCargandoDesgloseDeuda] = useState(false);
  const [ticketCobroExito, setTicketCobroExito] = useState(null);

  // Alerta local flotante (resguardo si no se pasa por prop)
  const [alertaLocal, setAlertaLocal] = useState(null);

  const dispararMensaje = useCallback(
    (tipo, mensaje) => {
      if (typeof onAlerta === 'function') {
        onAlerta(tipo, mensaje);
      } else {
        setAlertaLocal({ tipo, mensaje });
        setTimeout(() => setAlertaLocal(null), 6000);
      }
    },
    [onAlerta]
  );

  // ============================================================================
  // FASE 1: Búsqueda del Dispositivo por Token o DNI
  // ============================================================================
  const handleAlternarModoDNI = () => {
    if (!esAdmin) {
      setModalSeguridadAbierto(true);
      return;
    }
    setModoBusqueda((prev) => (prev === 'TOKEN' ? 'DNI' : 'TOKEN'));
    setReparacion(null);
    setTicketCierre(null);
  };

  const handleBuscar = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const valor = modoBusqueda === 'TOKEN' ? tokenInput.trim() : dniInput.trim();
    if (!valor) {
      dispararMensaje('error', `Por favor ingresa el ${modoBusqueda === 'TOKEN' ? 'Código de Seguridad' : 'DNI del cliente'}.`);
      return;
    }

    setCargandoBusqueda(true);
    setReparacion(null);
    setTicketCierre(null);
    setTicketCobroExito(null);

    try {
      const params = {};
      if (modoBusqueda === 'TOKEN') {
        params.codigo_seguridad = valor;
      } else {
        params.dni_cliente = valor;
      }

      const response = await axios.get(`${API_BASE_URL}/api/workshop/reparaciones/entregar/`, {
        params,
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setReparacion(response.data);
      setComentariosEntrega('Se entrega equipo probado frente al cliente.');
    } catch (error) {
      console.error('Error al localizar reparación para entrega:', error);
      const msg = error.response?.data?.error || 'No se encontró ninguna reparación apta para entrega con esos datos.';
      dispararMensaje('error', msg);
    } finally {
      setCargandoBusqueda(false);
    }
  };

  // ============================================================================
  // FASE 2: COBRO DE SALDO DEUDOR (CU-21)
  // ============================================================================
  const tieneSaldoPendiente = useMemo(() => {
    if (!reparacion) return false;
    const saldo = parseFloat(reparacion.saldo_pendiente || 0);
    return saldo > 0;
  }, [reparacion]);

  const handleAbrirModalCobro = async () => {
    if (!reparacion) return;
    setModalCobroAbierto(true);
    setCargandoDesgloseDeuda(true);
    setTicketCobroExito(null);
    setMontoCobro(reparacion.saldo_pendiente || '0.00');
    setMedioPagoCobro('Efectivo');
    setNumeroOperacionCobro('');
    setDetalleCobro('');

    try {
      const identificador = reparacion.codigo_seguridad || reparacion.cliente?.email;
      const response = await axios.get(`${API_BASE_URL}/api/sales/operaciones/pendientes/`, {
        params: { identificador },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setDesgloseDeuda(response.data);
      if (response.data?.total_a_cobrar) {
        setMontoCobro(response.data.total_a_cobrar);
      }
    } catch (err) {
      console.warn('No se pudo cargar desglose detallado de deuda:', err);
      setDesgloseDeuda(null);
    } finally {
      setCargandoDesgloseDeuda(false);
    }
  };

  const esTransferenciaCobro = useMemo(() => {
    return (medioPagoCobro || '').toUpperCase() === 'TRANSFERENCIA';
  }, [medioPagoCobro]);

  const esCobroValido = useMemo(() => {
    if (!reparacion) return false;
    const monto = parseFloat(montoCobro);
    const saldo = parseFloat(reparacion.saldo_pendiente || 0);
    if (!monto || monto <= 0) return false;
    if (Math.abs(monto - saldo) > 0.01) return false;
    if (esTransferenciaCobro && !numeroOperacionCobro.trim()) return false;
    return true;
  }, [reparacion, montoCobro, esTransferenciaCobro, numeroOperacionCobro]);

  const handleEjecutarCobro = async (e) => {
    e.preventDefault();
    if (!esCobroValido || procesandoCobro) return;

    setProcesandoCobro(true);

    try {
      const identificador = reparacion.codigo_seguridad || reparacion.cliente?.email;
      const payload = {
        identificador,
        medio_pago: medioPagoCobro.toUpperCase(),
        monto_pagado: parseFloat(montoCobro).toFixed(2),
        numero_operacion: esTransferenciaCobro ? numeroOperacionCobro.trim() : null,
        detalle: detalleCobro.trim() || `Cobro en mostrador previo a entrega física de ${reparacion.dispositivo?.marca} ${reparacion.dispositivo?.modelo}`
      };

      const response = await axios.post(`${API_BASE_URL}/api/sales/pagos/completar/`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = response.data;
      setTicketCobroExito({
        montoPagado: data.monto_pagado || montoCobro,
        rutaComprobante: data.ruta_comprobante,
        medioPago: medioPagoCobro
      });

      // Actualizar inmediatamente el estado de la reparación a PAGADO y saldo $0
      setReparacion((prev) => ({
        ...prev,
        saldo_pendiente: '0.00',
        etapa: 'PAGADO'
      }));

      dispararMensaje('success', '¡Pago asentado en caja exitosamente! Ahora puedes confirmar la entrega física.');
    } catch (error) {
      console.error('Error al completar el cobro de la reparación:', error);
      const msg = error.response?.data?.error || 'Error al procesar el cobro del saldo pendiente.';
      dispararMensaje('error', typeof msg === 'object' ? JSON.stringify(msg) : msg);
    } finally {
      setProcesandoCobro(false);
    }
  };

  // ============================================================================
  // FASE 3: Confirmación de Entrega Física
  // ============================================================================
  const handleConfirmarEntrega = async (e) => {
    e.preventDefault();
    if (!reparacion || confirmandoEntrega) return;

    // Bloqueo preventivo en frontend si hay saldo
    if (tieneSaldoPendiente) {
      dispararMensaje('error', 'Operación rechazada. Debe cobrar el saldo pendiente antes de liberar el hardware.');
      return;
    }

    setConfirmandoEntrega(true);

    try {
      const payload = {
        codigo_seguridad: modoBusqueda === 'TOKEN' ? tokenInput.trim() : undefined,
        dni_cliente: modoBusqueda === 'DNI' ? dniInput.trim() : undefined,
        comentarios_entrega: comentariosEntrega.trim() || undefined
      };

      const response = await axios.post(`${API_BASE_URL}/api/workshop/reparaciones/entregar/`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = response.data;
      setTicketCierre({
        idReparacion: data.id_reparacion,
        fechaEntrega: data.fecha_entrega,
        etapa: data.etapa,
        cliente: reparacion.cliente?.nombre || 'Cliente',
        dispositivo: `${reparacion.dispositivo?.marca || ''} ${reparacion.dispositivo?.modelo || 'Dispositivo'}`.trim()
      });

      dispararMensaje('success', '¡Equipo entregado con éxito!');
    } catch (error) {
      console.error('Error al confirmar entrega física:', error);
      const msg = error.response?.data?.error || 'Error al autorizar la entrega física del equipo.';
      dispararMensaje('error', msg);
    } finally {
      setConfirmandoEntrega(false);
    }
  };

  // Reiniciar flujo para entregar otro equipo
  const handleReiniciar = () => {
    setTokenInput('');
    setDniInput('');
    setReparacion(null);
    setTicketCierre(null);
    setTicketCobroExito(null);
    setComentariosEntrega('');
  };

  return (
    <div className="space-y-6">
      {/* Alerta local flotante con auto-dismiss a los 6 segundos */}
      <AnimatePresence>
        {alertaLocal && (
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className={`p-4 rounded-xl border flex items-center justify-between text-sm shadow-xl ${
              alertaLocal.tipo === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/90 border-rose-500/50 text-rose-200 shadow-rose-950/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{alertaLocal.tipo === 'success' ? '⚡' : '🛑'}</span>
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

      {/* Modal de Advertencia de Privilegios para Técnicos */}
      <AnimatePresence>
        {modalSeguridadAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1E293B] border border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl relative text-center"
            >
              <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-4 text-2xl">
                🛡️
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">Acceso Restringido</h3>
              <p className="text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed">
                Por estricta política de seguridad contra fraudes y suplantación de identidad,{' '}
                <span className="text-amber-400 font-bold">
                  solo un Administrador puede liberar un equipo sin el Token de Entrega
                </span>
                . Por favor solicita la asistencia de un Administrador para validar el DNI físico original del cliente.
              </p>
              <button
                type="button"
                onClick={() => setModalSeguridadAbierto(false)}
                className="mt-6 w-full py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer"
              >
                Comprendido
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cabecera Principal (Cumpliendo Regla 9: Cero etiquetas de tipo CU-X) */}
      <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-purple-500/10 via-cyan-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <span className="inline-block px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-mono border border-purple-500/30 mb-2">
          Aduana de Salida • Verificación de Liberación
        </span>
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <span>📦</span> Entregar Dispositivo al Cliente
        </h1>
        <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
          Verifica la restitución física del equipo al titular mediante validación criptográfica de su código de seguridad,
          comprobación de saldo deudor cero ($0) y cierre definitivo e inmutable del proceso en bitácora.
        </p>
      </div>

      {/* ====================================================================== */}
      {/* FASE 3: TICKET DE CIERRE EXITOSO                                      */}
      {/* ====================================================================== */}
      <AnimatePresence mode="wait">
        {ticketCierre ? (
          <motion.div
            key="ticket-exito-entrega"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="bg-[#1E293B] border border-emerald-500/40 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden text-center max-w-2xl mx-auto"
          >
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20 animate-bounce">
              <span className="text-3xl text-emerald-300">✓</span>
            </div>

            <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30">
              Proceso Cerrado de Forma Inmutable
            </span>

            <h2 className="text-3xl font-black text-white tracking-tight mt-4">
              ¡Equipo Entregado con Éxito!
            </h2>
            <p className="text-slate-300 text-sm mt-2">
              El ciclo de vida de la reparación ha finalizado formalmente.
            </p>

            <div className="mt-6 p-5 rounded-2xl bg-[#0F172A] border border-slate-700/80 text-left space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>Titular Receptor:</span>
                <span className="text-white font-sans font-semibold">{ticketCierre.cliente}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Dispositivo Restituido:</span>
                <span className="text-cyan-400 font-bold">{ticketCierre.dispositivo}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Estado Terminal:</span>
                <span className="text-emerald-400 font-bold">{ticketCierre.etapa}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Fecha de Entrega:</span>
                <span className="text-slate-200">{ticketCierre.fechaEntrega}</span>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={handleReiniciar}
                className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white text-sm font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                Entregar otro dispositivo
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {/* ================================================================== */}
            {/* FASE 1: ESCÁNER / BUSCADOR DE TOKEN DE ENTREGA                    */}
            {/* ================================================================== */}
            <motion.div
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl"
            >
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
                  {modoBusqueda === 'TOKEN' ? 'Código de Seguridad (Token de Entrega)' : 'Búsqueda por DNI del Cliente (Admin)'}
                </label>
                {esAdmin && (
                  <span className="text-[11px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-full">
                    Modo Admin Activo
                  </span>
                )}
              </div>

              <form onSubmit={handleBuscar} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
                      {modoBusqueda === 'TOKEN' ? '🔑' : '🪪'}
                    </span>
                    <input
                      type="text"
                      value={modoBusqueda === 'TOKEN' ? tokenInput : dniInput}
                      onChange={(e) =>
                        modoBusqueda === 'TOKEN' ? setTokenInput(e.target.value) : setDniInput(e.target.value)
                      }
                      placeholder={
                        modoBusqueda === 'TOKEN'
                          ? 'Ingrese el Código de Seguridad (ej. SEC-REPARACION-123)...'
                          : 'Ingrese el DNI sin puntos del titular...'
                      }
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30 transition-all font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={cargandoBusqueda || !(modoBusqueda === 'TOKEN' ? tokenInput.trim() : dniInput.trim())}
                    className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white text-sm font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {cargandoBusqueda ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Validando...</span>
                      </>
                    ) : (
                      <span>Validar y Buscar</span>
                    )}
                  </button>
                </div>

                {/* Enlace sutil para alternar búsqueda por DNI */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleAlternarModoDNI}
                    className="text-xs text-purple-400 hover:text-purple-300 underline font-mono cursor-pointer transition-colors"
                  >
                    {modoBusqueda === 'TOKEN'
                      ? '¿El cliente perdió el código? Buscar por DNI'
                      : 'Volver a buscar por Código de Seguridad (Token)'}
                  </button>
                </div>
              </form>
            </motion.div>

            {/* ================================================================== */}
            {/* FASE 2: CONFIRMACIÓN Y AUDITORÍA VISUAL DEL HARDWARE              */}
            {/* ================================================================== */}
            <AnimatePresence>
              {reparacion && (
                <motion.div
                  layout
                  initial={{ opacity: 0, height: 0, y: 20 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: 20 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 overflow-hidden"
                >
                  {/* Tarjeta de Resumen del Equipo */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-slate-800">
                    <div className="flex items-center gap-4">
                      {/* Imagen o Thumbnail del Dispositivo */}
                      <div className="w-20 h-20 rounded-2xl bg-[#0F172A] border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                        {reparacion.dispositivo?.imagen ? (
                          <img
                            src={reparacion.dispositivo.imagen}
                            alt="Equipo"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-3xl text-slate-600">📱</span>
                        )}
                      </div>

                      <div>
                        <span className="text-[11px] font-mono uppercase text-slate-400 font-bold block">
                          Dispositivo a Liberar
                        </span>
                        <h3 className="text-xl font-bold text-white mt-0.5">
                          {reparacion.dispositivo?.marca} {reparacion.dispositivo?.modelo}
                        </h3>
                        <p className="text-xs text-slate-400 font-mono mt-1">
                          Nro. Serie / IMEI: <span className="text-slate-200">{reparacion.dispositivo?.serie || 'S/N'}</span>
                        </p>
                        <p className="text-xs text-slate-400 font-mono">
                          Titular: <span className="text-cyan-400 font-semibold">{reparacion.cliente?.nombre}</span>{' '}
                          {reparacion.cliente?.dni ? `(DNI: ${reparacion.cliente.dni})` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Badge de Estado y Saldo */}
                    <div className="flex flex-col sm:items-end gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase text-slate-400">Estado:</span>
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                          {reparacion.etapa}
                        </span>
                      </div>

                      {/* Verificación de saldo deudor */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase text-slate-400">Saldo Pendiente:</span>
                        {tieneSaldoPendiente ? (
                          <span className="px-3 py-1 rounded-full text-xs font-mono font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                            🔴 ADEUDA ${reparacion.saldo_pendiente}
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            ✓ SALDADO ($0.00)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Banner de Acción si tiene Saldo Pendiente (Integración CU-21) */}
                  {tieneSaldoPendiente && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">⚠️</span>
                          <h4 className="text-sm font-bold text-amber-200">
                            Dispositivo con Saldo Pendiente de Cobro
                          </h4>
                        </div>
                        <p className="text-xs text-amber-300/80 max-w-xl">
                          Por regla contable estricta, el equipo no puede ser liberado mientras posea un saldo deudor.
                          Debes asentar el cobro de <strong className="text-white">${reparacion.saldo_pendiente}</strong> para habilitar la entrega física.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleAbrirModalCobro}
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer shrink-0"
                      >
                        <span>💳</span>
                        <span>Cobrar Saldo en Caja</span>
                      </button>
                    </motion.div>
                  )}

                  {/* Formulario de Cierre y Entrega Física */}
                  <form onSubmit={handleConfirmarEntrega} className="space-y-4">
                    <div>
                      <label className="block text-xs font-mono uppercase text-slate-300 font-bold mb-1.5">
                        Comentarios u Observaciones de la Entrega (Opcional)
                      </label>
                      <textarea
                        rows="3"
                        value={comentariosEntrega}
                        onChange={(e) => setComentariosEntrega(e.target.value)}
                        placeholder="Ej. Se entrega equipo probado frente al cliente, accesorios originales y con garantía legal..."
                        className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]"
                      />
                    </div>

                    {/* Botón Crítico: Deshabilitado si hay saldo pendiente */}
                    <button
                      type="submit"
                      disabled={confirmandoEntrega || tieneSaldoPendiente}
                      className={`w-full py-4 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 mt-4 ${
                        tieneSaldoPendiente
                          ? 'bg-slate-800/80 border border-slate-700 text-slate-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white shadow-xl shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                      }`}
                    >
                      {confirmandoEntrega ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Liberando hardware y registrando bitácora...</span>
                        </>
                      ) : tieneSaldoPendiente ? (
                        <>
                          <span>🔒</span>
                          <span>ENTREGA BLOQUEADA (DEBE LIQUIDAR SALDO PENDIENTE)</span>
                        </>
                      ) : (
                        <>
                          <span>🤝</span>
                          <span>CONFIRMAR ENTREGA FÍSICA</span>
                        </>
                      )}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>

      {/* ====================================================================== */}
      {/* MODAL / PANEL DE COBRO DIRECTO DE SALDO (CU-21: COMPLETAR PAGO)        */}
      {/* ====================================================================== */}
      <AnimatePresence>
        {modalCobroAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-[#1E293B] border border-cyan-500/40 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl relative overflow-hidden space-y-5"
            >
              {/* Glow ambiental */}
              <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-cyan-500/10 via-purple-500/5 to-transparent rounded-full blur-2xl pointer-events-none" />

              {ticketCobroExito ? (
                /* Ticket de cobro completado en el modal */
                <div className="text-center py-4 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto text-2xl text-emerald-300">
                    ✓
                  </div>
                  <h3 className="text-2xl font-black text-white">¡Cobro Registrado con Éxito!</h3>
                  <p className="text-xs text-slate-300 max-w-md mx-auto">
                    El saldo adeudado ha sido saldado en su totalidad. El equipo queda habilitado para la entrega física inmediata.
                  </p>

                  <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 text-left text-xs font-mono space-y-1.5 max-w-md mx-auto">
                    <div className="flex justify-between text-slate-400">
                      <span>Monto Abonado:</span>
                      <span className="text-emerald-400 font-bold">${ticketCobroExito.montoPagado}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Medio de Pago:</span>
                      <span className="text-purple-300">{ticketCobroExito.medioPago}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    {ticketCobroExito.rutaComprobante && (
                      <button
                        type="button"
                        onClick={() => {
                          const url = ticketCobroExito.rutaComprobante.startsWith('http')
                            ? ticketCobroExito.rutaComprobante
                            : `${API_BASE_URL}${ticketCobroExito.rutaComprobante}`;
                          window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold hover:bg-cyan-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>📄</span>
                        <span>Ver Factura PDF</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setModalCobroAbierto(false)}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white text-xs font-bold shadow-lg shadow-cyan-500/20 hover:scale-[1.02] transition-all cursor-pointer"
                    >
                      Continuar con la Entrega Física
                    </button>
                  </div>
                </div>
              ) : (
                /* Formulario del CU-21 para Cobro */
                <>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold block">
                        Caja Mostrador
                      </span>
                      <h3 className="text-lg font-black text-white flex items-center gap-2">
                        <span>💳</span> Cobrar Saldo Pendiente
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => setModalCobroAbierto(false)}
                      className="text-slate-400 hover:text-white text-sm p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Resumen de la deuda del equipo */}
                  <div className="p-4 rounded-xl bg-[#0F172A] border border-cyan-500/30 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-mono text-slate-400 block">Equipo a Entregar:</span>
                      <span className="text-sm font-bold text-white">
                        {reparacion?.dispositivo?.marca} {reparacion?.dispositivo?.modelo}
                      </span>
                      <span className="text-xs text-slate-400 block font-mono">
                        Titular: {reparacion?.cliente?.nombre}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
                        TOTAL A COBRAR
                      </span>
                      <span className="text-2xl font-black text-[#06B6D4] font-mono">
                        ${reparacion?.saldo_pendiente}
                      </span>
                    </div>
                  </div>

                  {/* Renglones / Insumos de la deuda si están disponibles */}
                  {cargandoDesgloseDeuda ? (
                    <div className="py-3 text-center text-xs font-mono text-slate-400">
                      Cargando detalles de insumos y costos...
                    </div>
                  ) : desgloseDeuda?.items && desgloseDeuda.items.length > 0 ? (
                    <div className="max-h-36 overflow-y-auto space-y-1 bg-[#0F172A]/50 border border-slate-800 rounded-xl p-2.5">
                      <table className="w-full text-left text-[11px] font-mono">
                        <thead className="text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="py-1">Concepto</th>
                            <th className="py-1 text-center">Cant</th>
                            <th className="py-1 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {desgloseDeuda.items.map((it, idx) => (
                            <tr key={idx}>
                              <td className="py-1">{it.producto}</td>
                              <td className="py-1 text-center">{it.cantidad}</td>
                              <td className="py-1 text-right text-cyan-300 font-bold">${it.subtotal}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {/* Formulario de Pago */}
                  <form onSubmit={handleEjecutarCobro} className="space-y-4 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-mono uppercase text-slate-300 font-bold mb-1">
                          Medio de Pago
                        </label>
                        <select
                          value={medioPagoCobro}
                          onChange={(e) => setMedioPagoCobro(e.target.value)}
                          className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#06B6D4]"
                        >
                          <option value="Efectivo">Efectivo</option>
                          <option value="Transferencia">Transferencia Virtual</option>
                          <option value="Tarjeta">Tarjeta de Débito / Crédito</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-mono uppercase text-slate-300 font-bold mb-1">
                          Monto a Percibir ($)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">
                            $
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={montoCobro}
                            onChange={(e) => setMontoCobro(e.target.value)}
                            className="w-full bg-[#0F172A] border border-slate-700 rounded-xl pl-7 pr-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#06B6D4]"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    {/* Si es transferencia, exigir número de operación */}
                    <AnimatePresence>
                      {esTransferenciaCobro && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-1"
                        >
                          <label className="block text-[11px] font-mono uppercase text-cyan-400 font-bold">
                            Número de Operación / Comprobante Bancario <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="Ej. OP-12345678"
                            value={numeroOperacionCobro}
                            onChange={(e) => setNumeroOperacionCobro(e.target.value)}
                            className="w-full bg-[#0F172A] border border-cyan-500/40 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#06B6D4]"
                            required
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div>
                      <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                        Observaciones (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Cobro realizado en mostrador previo a retiro"
                        value={detalleCobro}
                        onChange={(e) => setDetalleCobro(e.target.value)}
                        className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#06B6D4]"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setModalCobroAbierto(false)}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>

                      <button
                        type="submit"
                        disabled={!esCobroValido || procesandoCobro}
                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white text-xs font-bold shadow-lg shadow-cyan-500/20 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer"
                      >
                        {procesandoCobro ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Asentando cobro...</span>
                          </>
                        ) : (
                          <span>Confirmar Cobro y Facturar</span>
                        )}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

EntregarDispositivo.propTypes = {
  onAlerta: PropTypes.func
};
