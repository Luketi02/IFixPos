import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../../config/api';
import { formatearMoneda } from '../../utils/productImages';
import { useIntervaloVisible } from '../../utils/polling';
import { QRCodeSVG } from '../common/CodigoQRDiferido';
import CuentaRegresiva from '../common/CuentaRegresiva';
import { useAccesibilidadModal } from '../../hooks/useAccesibilidadModal';

/**
 * Modal de Pasarela Mercado Pago y Comprobante Final.
 * Comparte exactamente la misma interfaz, experiencia visual, apertura de pasarela,
 * reloj de reserva y pantalla de éxito con descarga de Factura PDF que el Checkout del Carrito.
 */
export default function MercadoPagoPaymentModal({
  isOpen,
  onClose,
  idVenta,
  montoTotal = 0,
  concepto = 'Operación en IFixPos',
  codigoSeguridad = null,
  expiraEn = null,
  segundosRestantes = null,
  permitirContinuarPendiente = true,
  textoBotonPendiente = 'Continuar y abonar luego',
  textoBotonCancelar = null,
  urlPreferenciaInicial = '',
  onPagoAcreditado,
  onContinuarPendiente,
  onCancelarOperacion
}) {
  const [mpPreferencia, setMpPreferencia] = useState(
    urlPreferenciaInicial ? { init_point: urlPreferenciaInicial } : null
  );
  const [cargandoPreferencia, setCargandoPreferencia] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [verificandoPagoMP, setVerificandoPagoMP] = useState(false);
  const [pagoConfirmado, setPagoConfirmado] = useState(false);
  const [datosVentaPagada, setDatosVentaPagada] = useState(null);
  const [tiempoExpirado, setTiempoExpirado] = useState(false);
  const [copiadoExito, setCopiadoExito] = useState(false);
  const [descargandoFactura, setDescargandoFactura] = useState(false);

  const { contenedorRef } = useAccesibilidadModal(
    isOpen,
    () => {
      if (!cargandoPreferencia && !verificandoPagoMP) {
        if (pagoConfirmado) {
          onPagoAcreditado?.({
            idVenta,
            metodoPago: 'MERCADOPAGO',
            datosEstado: datosVentaPagada
          });
        } else {
          onClose?.();
        }
      }
    },
    cargandoPreferencia || verificandoPagoMP
  );

  // Sincronizar URL inicial si el padre ya la obtuvo
  useEffect(() => {
    if (urlPreferenciaInicial) {
      setMpPreferencia((prev) => ({ ...(prev || {}), init_point: urlPreferenciaInicial }));
    }
  }, [urlPreferenciaInicial]);

  // Reiniciar estados al cerrar/abrir el modal
  useEffect(() => {
    if (!isOpen) {
      setErrorMessage('');
      setPagoConfirmado(false);
      setDatosVentaPagada(null);
      setTiempoExpirado(false);
      if (!urlPreferenciaInicial) {
        setMpPreferencia(null);
      }
    }
  }, [isOpen, urlPreferenciaInicial]);

  // Auto-ocultar alertas temporales a los 6 segundos (Regla 6)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  const obtenerCabecerasAuth = useCallback(() => {
    const token =
      localStorage.getItem('access_token') ||
      localStorage.getItem('accessToken') ||
      localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const generarPreferenciaMP = useCallback(
    async (abrirVentana = true) => {
      if (!idVenta) {
        setErrorMessage('No se encontró una orden de pago activa para vincular con Mercado Pago.');
        return;
      }

      setCargandoPreferencia(true);
      setErrorMessage('');
      try {
        const res = await axios.post(
          `${API_BASE_URL}/api/sales/mercadopago/crear-preferencia/`,
          { id_venta: idVenta },
          { headers: obtenerCabecerasAuth() }
        );
        setMpPreferencia(res.data);
        const link = res.data?.init_point || res.data?.sandbox_init_point || '';
        if (!link) {
          setErrorMessage('Mercado Pago no devolvió un enlace válido. Puedes reintentar.');
        } else if (abrirVentana && !res.data?.modo_simulacion) {
          window.open(link, '_blank', 'noopener,noreferrer');
        }
      } catch (err) {
        const msg =
          err.response?.data?.message ||
          err.response?.data?.error ||
          err.response?.data?.detail ||
          'No se pudo conectar con la pasarela de Mercado Pago en este momento.';
        setErrorMessage(msg);
      } finally {
        setCargandoPreferencia(false);
      }
    },
    [idVenta, obtenerCabecerasAuth]
  );

  // Generar preferencia automáticamente al abrir el modal (sin abrir pestaña externa automáticamente)
  useEffect(() => {
    if (isOpen && idVenta && !urlPreferenciaInicial) {
      generarPreferenciaMP(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, idVenta, urlPreferenciaInicial]);

  const consultarEstadoPago = useCallback(
    async (esManual = false) => {
      if (!idVenta || pagoConfirmado) return;
      if (esManual) {
        setVerificandoPagoMP(true);
        setErrorMessage('');
      }

      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/sales/compras/virtual/${idVenta}/estado/`,
          { headers: obtenerCabecerasAuth() }
        );
        const estadoActual = String(res.data?.estado_venta || '').toUpperCase();
        const acreditado =
          Boolean(res.data?.pagada) ||
          estadoActual === 'PAGADA' ||
          estadoActual === 'PAGADO' ||
          estadoActual === 'COMPLETADA';

        if (acreditado) {
          setDatosVentaPagada(res.data);
          setPagoConfirmado(true);
        } else if (esManual) {
          setErrorMessage(
            'Mercado Pago aún no reportó la acreditación. Si ya realizaste la transferencia o pago, aguarda unos instantes.'
          );
        }
      } catch {
        if (esManual) {
          setErrorMessage('No pudimos verificar el estado de acreditación en este momento.');
        }
      } finally {
        if (esManual) setVerificandoPagoMP(false);
      }
    },
    [idVenta, pagoConfirmado, obtenerCabecerasAuth]
  );

  // Sondeo en tiempo real cada 4 segundos mientras espera el pago
  useIntervaloVisible(
    () => {
      consultarEstadoPago(false);
    },
    isOpen && idVenta && !pagoConfirmado ? 4000 : null,
    { ejecutarAlMontar: false, sincronizarAlVolver: true }
  );

  const handleSimularPagoMP = async () => {
    if (!import.meta.env.DEV || !idVenta || verificandoPagoMP) return;
    setVerificandoPagoMP(true);
    setErrorMessage('');
    try {
      await axios.post(
        `${API_BASE_URL}/api/sales/mercadopago/webhook/?data.id=SIMULADO-${idVenta}`,
        {
          type: 'payment',
          data: { id: `SIMULADO-${idVenta}` },
          simular_venta_id: idVenta
        },
        { headers: obtenerCabecerasAuth() }
      );
      await consultarEstadoPago(true);
    } catch (err) {
      await consultarEstadoPago(true);
      if (!pagoConfirmado) {
        setErrorMessage(
          err.response?.data?.motivo ||
            err.response?.data?.error ||
            'No se pudo simular la acreditación del pago.'
        );
      }
    } finally {
      setVerificandoPagoMP(false);
    }
  };

  const handleCopiarCodigo = () => {
    const cod = datosVentaPagada?.codigo_sec || codigoSeguridad || '';
    if (!cod) return;
    navigator.clipboard.writeText(cod);
    setCopiadoExito(true);
    setTimeout(() => setCopiadoExito(false), 2500);
  };

  const handleDescargarFactura = async () => {
    if (!idVenta) return;
    setDescargandoFactura(true);
    setErrorMessage('');
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/sales/compras/virtual/${idVenta}/factura/`,
        {
          headers: obtenerCabecerasAuth(),
          responseType: 'blob'
        }
      );
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      const codRef = datosVentaPagada?.codigo_sec || codigoSeguridad || idVenta;
      link.download = `Factura_${codRef}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch {
      setErrorMessage('No pudimos generar o visualizar la factura en este momento.');
    } finally {
      setDescargandoFactura(false);
    }
  };

  const handleFinalizarExito = () => {
    onPagoAcreditado?.({
      idVenta,
      metodoPago: 'MERCADOPAGO',
      datosEstado: datosVentaPagada
    });
  };

  if (!isOpen) return null;

  const urlPasarela = mpPreferencia?.init_point || mpPreferencia?.sandbox_init_point || urlPreferenciaInicial || '';
  const codigoMostrar = datosVentaPagada?.codigo_sec || codigoSeguridad || 'CONFIRMADO';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 font-sans">
        <motion.div
          ref={contenedorRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mp-checkout-titulo"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-2xl bg-[#0F172A] border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden flex flex-col max-h-[92vh] focus:outline-none"
        >
          {/* Cabecera idéntica al Checkout Virtual del Carrito */}
          <div className="px-6 py-4 bg-[#1E293B]/90 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
              <div>
                <h2
                  id="mp-checkout-titulo"
                  className="text-lg font-black text-white tracking-tight flex items-center gap-2"
                >
                  <span>Pasarela de Pago Virtual</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 uppercase font-mono">
                    Operación Segura
                  </span>
                </h2>
                <p className="text-xs text-slate-400">{concepto}</p>
              </div>
            </div>

            {!pagoConfirmado && onClose && (
              <button
                type="button"
                disabled={cargandoPreferencia || verificandoPagoMP}
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all disabled:opacity-30 cursor-pointer"
                title="Cerrar ventana"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Alerta de Error Temporal */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                role="alert"
                aria-live="assertive"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-6 pt-4 shrink-0"
              >
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs sm:text-sm flex items-center justify-between gap-3 shadow-lg shadow-rose-950/20">
                  <div className="flex items-center gap-2.5">
                    <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{errorMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorMessage('')}
                    className="text-rose-400 hover:text-rose-200 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Cuerpo Dinámico con Scroll Interno */}
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {!pagoConfirmado ? (
              /* =============================================================== */
              /* PANTALLA INTERACTIVA: ESPERANDO PAGO EN MERCADO PAGO (IDÉNTICA) */
              /* =============================================================== */
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="py-2 text-center space-y-5"
              >
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#009EE3]/15 border border-[#009EE3]/40 flex items-center justify-center text-[#009EE3]">
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5l4.5 2.5-4.5 2.5zm5.5-5.5h-2.1c-.2-1.8-1.5-3.2-3.4-3.4V5.5c3 .4 5.3 2.6 5.5 5.5z" />
                  </svg>
                </div>

                <div>
                  <h3 className="text-xl font-black text-white tracking-tight flex items-center justify-center gap-2">
                    <span>Esperando Pago en Mercado Pago</span>
                    <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block"></span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Abona mediante transferencia bancaria inmediata, débito o dinero en cuenta en la pasarela oficial.
                  </p>
                </div>

                {/* Tarjeta Principal con Monto, QR y Botón Web */}
                <div className="max-w-md mx-auto p-4 rounded-xl bg-slate-900/90 border border-[#009EE3]/40 space-y-3.5">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Total de la Operación:</span>
                    <span className="font-mono text-cyan-400 font-bold text-sm">
                      {formatearMoneda(montoTotal)}
                    </span>
                  </div>

                  {tiempoExpirado ? (
                    <div className="w-full py-3 px-4 rounded-xl bg-slate-800/80 border border-rose-500/40 text-rose-300 font-bold text-xs tracking-wide flex items-center justify-center gap-2 text-center">
                      <span>⚠️ Link Expirado — Tiempo de Sesión Finalizado</span>
                    </div>
                  ) : cargandoPreferencia ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-3 text-slate-300">
                      <div className="w-9 h-9 border-2 border-[#009EE3] border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-bold">Generando enlace y código QR seguro...</span>
                    </div>
                  ) : urlPasarela ? (
                    <>
                      <div className="py-2 flex flex-col items-center justify-center space-y-2.5">
                        <div className="p-3 bg-white rounded-2xl shadow-xl border-2 border-[#009EE3]/50 inline-flex items-center justify-center">
                          <QRCodeSVG
                            value={urlPasarela}
                            size={160}
                            level="M"
                            includeMargin={false}
                          />
                        </div>
                        <div className="text-center space-y-1">
                          <p className="text-[11px] text-slate-200 flex items-center justify-center gap-1.5 font-medium">
                            <span>📱</span>
                            <span>Escanea con la cámara de tu celular para pagar desde el móvil</span>
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Abre directamente la pasarela oficial de Mercado Pago en tu navegador móvil sin necesidad de iniciar sesión en la PC.
                          </p>
                        </div>
                      </div>

                      <div className="relative flex py-0.5 items-center">
                        <div className="flex-grow border-t border-slate-800"></div>
                        <span className="flex-shrink mx-3 text-[10px] uppercase font-mono text-slate-400 tracking-wider">
                          o si prefieres en la computadora
                        </span>
                        <div className="flex-grow border-t border-slate-800"></div>
                      </div>

                      <a
                        href={urlPasarela}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#009EE3] to-cyan-500 hover:from-[#0089c7] hover:to-cyan-400 text-white font-extrabold text-xs tracking-wide flex items-center justify-center gap-2 transition-colors cursor-pointer block"
                      >
                        <span>Abrir Pasarela en Mercado Pago Web</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    </>
                  ) : (
                    <div className="py-4 text-center space-y-3 bg-slate-950/60 rounded-xl border border-amber-500/30 p-4">
                      <p className="text-xs text-amber-300 font-semibold">
                        ⚠️ No se pudo generar el enlace de pago automáticamente.
                      </p>
                      <button
                        type="button"
                        disabled={cargandoPreferencia}
                        onClick={() => generarPreferenciaMP(false)}
                        className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 active:scale-95 transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <span>🔄 Generar Link y Código QR de Mercado Pago</span>
                      </button>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-center gap-2 text-[11px] text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                    <span>Conexión activa: sincronizando acreditación con Mercado Pago</span>
                  </div>
                </div>

                {/* Banner de Modo Simulación / Desarrollo (idéntico al Checkout del Carrito) */}
                {import.meta.env.DEV && (
                  <div className="max-w-md mx-auto p-3.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-left space-y-2">
                    <p className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
                      <span>🧪</span>
                      <span>Modo de Prueba / Desarrollo Activo</span>
                    </p>
                    <p className="text-[11px] text-slate-300">
                      Puedes simular la acreditación instantánea del Webhook de Mercado Pago para probar el circuito completo:
                    </p>
                    <button
                      type="button"
                      disabled={verificandoPagoMP}
                      onClick={handleSimularPagoMP}
                      className="w-full py-2 px-3 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/40 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {verificandoPagoMP ? 'Simulando Webhook...' : '⚡ Simular Aprobación Instantánea'}
                    </button>
                  </div>
                )}

                {/* Temporizador de Vigencia del Enlace (idéntico a TemporizadorReservaModal) */}
                <CuentaRegresiva
                  expiraEn={expiraEn}
                  segundosIniciales={segundosRestantes || 1800}
                  onExpirado={() => setTiempoExpirado(true)}
                >
                  {(segundos, textoMMSS) => (
                    <div className="max-w-md mx-auto p-3.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 flex items-center justify-between text-xs shadow-md">
                      <div className="flex items-center gap-2 text-slate-300 text-left">
                        <span className="text-base">⏱️</span>
                        <div>
                          <p className="font-bold text-white leading-tight">Enlace de pago habilitado</p>
                          <p className="text-[11px] text-slate-400">Tu sesión de pasarela se mantendrá activa durante:</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`font-mono font-black text-base tracking-widest ${
                            segundos <= 300 ? 'text-rose-400 font-bold' : 'text-cyan-400'
                          }`}
                        >
                          {textoMMSS}
                        </span>
                        <p className="text-[10px] text-slate-500 uppercase font-mono">Minutos</p>
                      </div>
                    </div>
                  )}
                </CuentaRegresiva>

                {/* Acciones de Verificación Manual y Retorno */}
                <div className="max-w-md mx-auto space-y-2.5 pt-1">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      disabled={verificandoPagoMP || cargandoPreferencia}
                      onClick={() => consultarEstadoPago(true)}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                    >
                      {verificandoPagoMP ? 'Verificando...' : 'Comprobar Acreditación'}
                    </button>

                    {permitirContinuarPendiente && onContinuarPendiente && (
                      <button
                        type="button"
                        onClick={onContinuarPendiente}
                        className="py-2.5 px-4 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span>{textoBotonPendiente}</span>
                      </button>
                    )}
                  </div>

                  {textoBotonCancelar && onCancelarOperacion && (
                    <button
                      type="button"
                      onClick={onCancelarOperacion}
                      className="w-full py-2 px-4 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {textoBotonCancelar}
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              /* =============================================================== */
              /* PANTALLA DE ÉXITO Y COMPROBANTE PDF (IDÉNTICA AL PASO 5)       */
              /* =============================================================== */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-4 text-center space-y-6"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-cyan-300 shadow-xl shadow-cyan-500/30">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <div>
                  <h3 className="text-xl font-extrabold text-white tracking-tight">
                    ¡Pago Acreditado con Éxito!
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Tu pago de {formatearMoneda(montoTotal)} por concepto de <strong className="text-slate-200">{concepto}</strong> fue procesado y registrado en el sistema.
                  </p>
                </div>

                {/* Tarjeta con Código Oficial de Seguridad */}
                <div className="max-w-md mx-auto p-4 rounded-xl bg-slate-900/90 border border-cyan-500/40 space-y-2.5">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-base">🛡️</span>
                    <span className="text-[11px] text-cyan-300 uppercase font-mono font-bold tracking-wider">
                      Código de Seguridad y Seguimiento
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-2xl font-black font-mono tracking-widest text-cyan-400">
                      {codigoMostrar}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopiarCodigo}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs cursor-pointer"
                      title="Copiar código"
                    >
                      {copiadoExito ? '✓ Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Conserva este código de seguridad para cualquier consulta o gestión sobre tu equipo en nuestra sucursal.
                  </p>
                </div>

                {/* Botón de Visualización y Descarga de Factura en PDF */}
                <div className="max-w-md mx-auto pt-1">
                  <button
                    type="button"
                    disabled={descargandoFactura}
                    onClick={handleDescargarFactura}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 text-slate-950 font-black text-xs tracking-wide shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40"
                  >
                    {descargandoFactura ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                        <span>Generando Comprobante Fiscal en PDF...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <span>Ver / Descargar Factura Oficial en PDF</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Pie del Modal idéntico al Checkout del Carrito */}
          <div className="px-6 py-4 bg-[#1E293B]/90 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
            {!pagoConfirmado ? (
              <div className="w-full flex items-center justify-center py-1">
                <span className="text-xs text-slate-400 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                  <span>Esperando acreditación de pago en tiempo real con Mercado Pago...</span>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleFinalizarExito}
                className="w-full py-3 px-6 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all cursor-pointer"
              >
                Continuar y ver Estado de la Reparación
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
