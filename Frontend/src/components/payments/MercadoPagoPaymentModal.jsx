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
 * Modal Universal de Pasarela Mercado Pago (QR Dinámico + Redirección Web + Polling).
 *
 * Diseñado para abrirse de forma idéntica desde:
 * - Checkout de Carrito de Compras (`CheckoutModal` / `GuestCheckoutModal`)
 * - Solicitud y Pago de Diagnóstico Inicial (`IniciarReparacionModal`)
 * - Aceptación de Presupuesto de Reparación (`ReparacionDetalle`)
 *
 * Cumple estrictamente la Regla 10: jamás expone `id_venta` ni IDs internos en la UI del cliente.
 */
export default function MercadoPagoPaymentModal({
  isOpen,
  onClose,
  idVenta,
  montoTotal = 0,
  concepto = 'Operación en IFix',
  subtituloContexto = 'Escaneá el código QR desde la app de Mercado Pago o cualquier billetera virtual interoperable.',
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
  const [urlPreferencia, setUrlPreferencia] = useState(urlPreferenciaInicial || '');
  const [cargandoPreferencia, setCargandoPreferencia] = useState(false);
  const [errorPreferencia, setErrorPreferencia] = useState('');
  const [verificandoEstado, setVerificandoEstado] = useState(false);
  const [simulandoPagoDev, setSimulandoPagoDev] = useState(false);
  const [pagoConfirmado, setPagoConfirmado] = useState(false);
  const [mensajeFeedback, setMensajeFeedback] = useState('');

  const { contenedorRef } = useAccesibilidadModal(
    isOpen,
    onClose,
    cargandoPreferencia || simulandoPagoDev
  );

  // Sincronizar URL inicial si el padre ya la obtuvo
  useEffect(() => {
    if (urlPreferenciaInicial) {
      setUrlPreferencia(urlPreferenciaInicial);
    }
  }, [urlPreferenciaInicial]);

  // Limpiar estado al cerrar el modal
  useEffect(() => {
    if (!isOpen) {
      setErrorPreferencia('');
      setMensajeFeedback('');
      setPagoConfirmado(false);
    }
  }, [isOpen]);

  // Autocierre de mensajes de error a los 6 segundos (Regla 6)
  useEffect(() => {
    if (!errorPreferencia && !mensajeFeedback) return undefined;
    const timer = setTimeout(() => {
      setErrorPreferencia('');
      setMensajeFeedback('');
    }, 6000);
    return () => clearTimeout(timer);
  }, [errorPreferencia, mensajeFeedback]);

  const obtenerCabecerasAuth = useCallback(() => {
    const token =
      localStorage.getItem('access_token') ||
      localStorage.getItem('accessToken') ||
      localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const generarPreferenciaMP = useCallback(async () => {
    if (!idVenta) {
      setErrorPreferencia('No se encontró una orden de pago activa para vincular con Mercado Pago.');
      return;
    }

    setCargandoPreferencia(true);
    setErrorPreferencia('');
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/sales/mercadopago/crear-preferencia/`,
        { id_venta: idVenta },
        { headers: obtenerCabecerasAuth() }
      );
      const link = res.data?.init_point || res.data?.sandbox_init_point || '';
      if (!link) {
        setErrorPreferencia('Mercado Pago no devolvió un enlace válido. Podés reintentar.');
      } else {
        setUrlPreferencia(link);
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'No se pudo generar el código QR de Mercado Pago en este momento.';
      setErrorPreferencia(msg);
    } finally {
      setCargandoPreferencia(false);
    }
  }, [idVenta, obtenerCabecerasAuth]);

  // Generar preferencia automáticamente al abrir si aún no tenemos link
  useEffect(() => {
    if (isOpen && idVenta && !urlPreferencia && !cargandoPreferencia) {
      generarPreferenciaMP();
    }
  }, [isOpen, idVenta, urlPreferencia, cargandoPreferencia, generarPreferenciaMP]);

  const consultarEstadoPago = useCallback(
    async (esManual = false) => {
      if (!idVenta || pagoConfirmado) return;
      if (esManual) setVerificandoEstado(true);

      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/sales/compras/virtual/${idVenta}/estado/`,
          { headers: obtenerCabecerasAuth() }
        );
        const estadoActual = String(res.data?.estado_venta || '').toUpperCase();
        const acreditado =
          Boolean(res.data?.pagada) ||
          estadoActual === 'PAGADA' ||
          estadoActual === 'COMPLETADA';

        if (acreditado) {
          setPagoConfirmado(true);
          onPagoAcreditado?.({
            idVenta,
            metodoPago: 'MERCADOPAGO',
            datosEstado: res.data
          });
        } else if (esManual) {
          setMensajeFeedback('El pago aún figura pendiente de acreditación. Si ya abonaste, aguardá unos segundos.');
        }
      } catch {
        if (esManual) {
          setErrorPreferencia('No se pudo verificar el estado del pago en este instante.');
        }
      } finally {
        if (esManual) setVerificandoEstado(false);
      }
    },
    [idVenta, pagoConfirmado, obtenerCabecerasAuth, onPagoAcreditado]
  );

  // Polling inteligente cada 4 segundos mientras el modal está abierto y visible
  useIntervaloVisible(
    () => {
      consultarEstadoPago(false);
    },
    4000,
    Boolean(isOpen && idVenta && !pagoConfirmado)
  );

  const simularAcreditacionDev = async () => {
    if (!idVenta || simulandoPagoDev) return;
    setSimulandoPagoDev(true);
    setErrorPreferencia('');
    try {
      await axios.post(
        `${API_BASE_URL}/api/sales/mercadopago/webhook/`,
        {
          simular_venta_id: idVenta,
          cod_operacion: `MP-SIM-${Date.now()}`
        },
        { headers: obtenerCabecerasAuth() }
      );
      await consultarEstadoPago(true);
    } catch (err) {
      setErrorPreferencia(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'No se pudo simular la acreditación del pago.'
      );
    } finally {
      setSimulandoPagoDev(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
        <motion.div
          ref={contenedorRef}
          role="dialog"
          aria-modal="true"
          aria-label="Pasarela de pago Mercado Pago"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-[#1E293B] border border-cyan-500/30 shadow-2xl shadow-cyan-950/50 p-6 text-slate-100 focus:outline-none"
        >
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-700/70">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-400/40 flex items-center justify-center text-sky-400 font-black text-lg shadow-inner">
                MP
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  Pasarela Oficial • Acreditación Automática
                </span>
                <h3 className="text-lg font-extrabold text-white mt-0.5">
                  Pago con Mercado Pago
                </h3>
              </div>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                aria-label="Cerrar ventana de pago"
              >
                ✕
              </button>
            )}
          </div>

          {/* Resumen de monto y concepto */}
          <div className="mt-4 p-4 rounded-xl bg-[#0F172A] border border-slate-800 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Concepto de la operación
              </p>
              <p className="text-sm font-bold text-slate-100 mt-0.5">{concepto}</p>
              {codigoSeguridad && (
                <p className="text-xs text-cyan-400 font-mono mt-1">
                  Token de seguridad: <span className="font-bold">{codigoSeguridad}</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Total a abonar
              </p>
              <p className="text-xl font-black text-cyan-400">
                {formatearMoneda(montoTotal)}
              </p>
            </div>
          </div>

          {/* Temporizador opcional de reserva */}
          {(expiraEn || (typeof segundosRestantes === 'number' && segundosRestantes > 0)) && (
            <div className="mt-3">
              <CuentaRegresiva
                expiraEn={expiraEn}
                segundosIniciales={segundosRestantes || 1800}
              >
                {(segundos, textoMMSS) => (
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-cyan-500/25 flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">
                      ⏱️ Tiempo de reserva activa:
                    </span>
                    <span
                      className={`font-mono font-black text-sm tracking-widest ${
                        segundos <= 300 ? 'text-rose-400' : 'text-cyan-400'
                      }`}
                    >
                      {textoMMSS}
                    </span>
                  </div>
                )}
              </CuentaRegresiva>
            </div>
          )}

          {/* Cuerpo del QR y acciones */}
          <div className="mt-5 text-center space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
              {subtituloContexto}
            </p>

            {/* Tarjeta blanca del QR */}
            <div className="mx-auto w-fit p-4 rounded-2xl bg-white shadow-xl border-4 border-sky-500/30 flex flex-col items-center justify-center min-h-[232px] min-w-[232px]">
              {cargandoPreferencia ? (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-slate-700">
                  <div className="w-9 h-9 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold">Generando código QR seguro...</span>
                </div>
              ) : urlPreferencia ? (
                <>
                  <QRCodeSVG
                    value={urlPreferencia}
                    size={200}
                    level="M"
                    includeMargin={true}
                  />
                  <span className="mt-1.5 text-[11px] font-bold text-slate-700 tracking-wide">
                    Escaneá con Mercado Pago o tu app bancaria
                  </span>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 p-4 max-w-[210px]">
                  <span className="text-xs text-rose-600 font-semibold text-center">
                    No se pudo cargar el código QR automáticamente.
                  </span>
                  <button
                    type="button"
                    onClick={generarPreferenciaMP}
                    className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Reintentar generación de QR
                  </button>
                </div>
              )}
            </div>

            {/* Indicador de escucha activa */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>Esperando confirmación automática del pago en tiempo real...</span>
            </div>

            {/* Alertas suaves con autocierre (Regla 6) */}
            {errorPreferencia && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                {errorPreferencia}
              </div>
            )}

            {mensajeFeedback && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
                {mensajeFeedback}
              </div>
            )}

            {/* Botones principales de acción */}
            <div className="pt-2 space-y-2.5">
              {urlPreferencia && (
                <a
                  href={urlPreferencia}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <span>Ir a pagar en la web de Mercado Pago</span>
                  <span>↗</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => consultarEstadoPago(true)}
                disabled={verificandoEstado || cargandoPreferencia}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {verificandoEstado
                  ? 'Verificando acreditación...'
                  : 'Ya realicé el pago, verificar ahora'}
              </button>

              {import.meta.env.DEV && idVenta && (
                <button
                  type="button"
                  onClick={simularAcreditacionDev}
                  disabled={simulandoPagoDev}
                  className="w-full py-2 px-4 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/40 text-violet-300 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {simulandoPagoDev
                    ? 'Simulando acreditación...'
                    : '⚡ Simular Pago Aprobado (Modo Desarrollo)'}
                </button>
              )}

              {permitirContinuarPendiente && onContinuarPendiente && (
                <button
                  type="button"
                  onClick={onContinuarPendiente}
                  className="w-full py-2.5 px-4 rounded-xl bg-transparent hover:bg-slate-800/70 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {textoBotonPendiente}
                </button>
              )}

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
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

