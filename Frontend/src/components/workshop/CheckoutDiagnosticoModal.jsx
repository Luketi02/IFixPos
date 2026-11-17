import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { formatearMoneda } from '../../utils/productImages';
import CuentaRegresiva from '../common/CuentaRegresiva';
import { API_BASE_URL } from '../../config/api';
import { useIntervaloVisible } from '../../utils/polling';
import { obtenerCatalogoCacheado } from '../../utils/cacheCatalogos';
import { QRCodeSVG } from '../common/CodigoQRDiferido';
import { useAccesibilidadModal } from '../../hooks/useAccesibilidadModal';
import { procesarMediosPagoActivos, TIPOS_MODAL_PAGO } from '../../utils/mediosPago';
import PaymentMethodModalDispatcher from '../payments/PaymentMethodModalDispatcher';

const REGEX_LETRAS = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/;
const REGEX_DNI = /^\d{7,11}$/;
const REGEX_TELEFONO = /^\+?\d{9,15}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function TemporizadorReservaModal({ expiraEn = null, segundosIniciales = 1800, onExpirado }) {
  return (
    <CuentaRegresiva
      expiraEn={expiraEn}
      segundosIniciales={segundosIniciales}
      onExpirado={onExpirado}
    >
      {(segundos, textoMMSS) => (
        <div className="max-w-md mx-auto p-3.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 flex items-center justify-between text-xs shadow-md">
          <div className="flex items-center gap-2 text-slate-300 text-left">
            <span className="text-base">⏱️</span>
            <div>
              <p className="font-bold text-white leading-tight">Orden de pago activa</p>
              <p className="text-[11px] text-slate-400">Tu enlace se mantendrá habilitado durante:</p>
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
  );
}

/**
 * Modal de Checkout Virtual para Abono de Diagnóstico Inicial en ReparacionDetalle.
 * Replica exactamente la interfaz, experiencia paso a paso, validaciones fiscales,
 * tarjetas de selección de pago (excluyendo Efectivo), pantalla de Mercado Pago
 * y pantalla de éxito con descarga de Factura PDF del Checkout del Carrito.
 */
export default function CheckoutDiagnosticoModal({
  isOpen,
  onClose,
  reparacion,
  montoDiagnostico = 5000,
  medioPagoInicial = null,
  onPagoCompletado
}) {
  const { user, token, updateUser } = useAuth();

  // Pasos del Checkout: 1: Facturación, 2: Pago, 3: Revisión, 4: Éxito
  const [pasoActual, setPasoActual] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiadoExito, setCopiadoExito] = useState(false);

  const [facturacion, setFacturacion] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    telefono: '',
    email: ''
  });
  const [erroresCampos, setErroresCampos] = useState({});
  const [camposTocados, setCamposTocados] = useState({});

  const [mediosPago, setMediosPago] = useState([]);
  const [cargandoMediosPago, setCargandoMediosPago] = useState(false);
  const [medioPagoSeleccionadoId, setMedioPagoSeleccionadoId] = useState(null);
  const [errorMedioPago, setErrorMedioPago] = useState('');

  // Estados de resultado de la venta y pasarela Mercado Pago
  const [resultadoVenta, setResultadoVenta] = useState(null);
  const [mpPreferencia, setMpPreferencia] = useState(null);
  const [esperandoPagoMP, setEsperandoPagoMP] = useState(false);
  const [verificandoPagoMP, setVerificandoPagoMP] = useState(false);
  const [tiempoExpirado, setTiempoExpirado] = useState(false);
  const [descargandoFactura, setDescargandoFactura] = useState(false);
  const [modalInstruccionesPagoAbierto, setModalInstruccionesPagoAbierto] = useState(false);

  const { contenedorRef: modalAccesibilidadRef } = useAccesibilidadModal(
    isOpen,
    () => {
      if (!isSubmitting && !verificandoPagoMP) {
        if (pasoActual === 4) {
          onPagoCompletado?.(resultadoVenta);
        }
        onClose?.();
      }
    },
    isSubmitting || verificandoPagoMP
  );

  const estaRegistrado = Boolean(user && user.email);
  const tieneNombre = useMemo(() => Boolean(user?.nombre && String(user.nombre).trim() !== ''), [user?.nombre]);
  const tieneApellido = useMemo(() => Boolean(user?.apellido && String(user.apellido).trim() !== ''), [user?.apellido]);
  const tieneDni = useMemo(() => Boolean(user?.dni && String(user.dni).trim() !== ''), [user?.dni]);
  const tieneTelefono = useMemo(() => Boolean(user?.telefono && String(user.telefono).trim() !== ''), [user?.telefono]);
  const cuentaCompletada = tieneNombre && tieneApellido && tieneDni && tieneTelefono;

  useEffect(() => {
    if (user) {
      setFacturacion((prev) => ({
        nombre: user.nombre || prev.nombre || '',
        apellido: user.apellido || prev.apellido || '',
        dni: user.dni || prev.dni || '',
        telefono: user.telefono || prev.telefono || '',
        email: user.email || prev.email || ''
      }));
    }
  }, [user]);

  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  const validarCampo = useCallback((nombreCampo, valor) => {
    const val = String(valor || '').trim();
    switch (nombreCampo) {
      case 'nombre':
        if (!val) return 'El nombre es obligatorio. Ejemplo: Juan';
        if (val.length < 2) return 'El nombre debe tener al menos 2 letras. Ejemplo: Juan';
        if (!REGEX_LETRAS.test(val)) return 'El nombre solo debe contener letras.';
        return '';
      case 'apellido':
        if (!val) return 'El apellido es obligatorio. Ejemplo: Rodriguez';
        if (val.length < 2) return 'El apellido debe tener al menos 2 letras. Ejemplo: Rodriguez';
        if (!REGEX_LETRAS.test(val)) return 'El apellido solo debe contener letras.';
        return '';
      case 'dni':
        if (!val) return 'El DNI / documento fiscal es obligatorio. Ejemplo: 38945612';
        if (!REGEX_DNI.test(val)) return 'El DNI debe tener entre 7 y 11 dígitos numéricos.';
        return '';
      case 'telefono': {
        if (!val) return 'El número de teléfono es obligatorio.';
        const telLimpio = val.replace(/\s+/g, '');
        if (!REGEX_TELEFONO.test(telLimpio)) return 'El teléfono debe contener entre 9 y 15 dígitos numéricos.';
        return '';
      }
      case 'email':
        if (!val) return 'El correo electrónico es obligatorio.';
        if (!REGEX_EMAIL.test(val)) return 'El formato de correo no es válido.';
        return '';
      default:
        return '';
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'dni' && value !== '' && !/^\d+$/.test(value)) return;
    if ((name === 'nombre' || name === 'apellido') && value !== '' && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]*$/.test(value)) return;

    setFacturacion((prev) => ({ ...prev, [name]: value }));
    if (camposTocados[name] || erroresCampos[name]) {
      setErroresCampos((prev) => ({ ...prev, [name]: validarCampo(name, value) }));
    }
  };

  const handleInputBlur = (e) => {
    const { name, value } = e.target;
    setCamposTocados((prev) => ({ ...prev, [name]: true }));
    setErroresCampos((prev) => ({ ...prev, [name]: validarCampo(name, value) }));
  };

  // Cargar medios de pago activos excluyendo estrictamente EFECTIVO
  const cargarMediosPago = useCallback(async () => {
    if (!token) return;
    setCargandoMediosPago(true);
    try {
      const datos = await obtenerCatalogoCacheado(
        'sales:medios-pago',
        '/api/sales/medios-pago/',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const lista = Array.isArray(datos)
        ? datos.filter((m) => m && Boolean(m.estado))
        : [];
      setMediosPago(lista);
    } catch {
      setMediosPago([]);
      setErrorMedioPago('No se pudieron cargar los medios de pago habilitados. Reintenta en unos segundos.');
    } finally {
      setCargandoMediosPago(false);
    }
  }, [token]);

  // Procesar medios y excluir EFECTIVO (el cliente abona por plataforma)
  const mediosPagoProcesados = useMemo(() => {
    const todos = procesarMediosPagoActivos(mediosPago, { metodoEntrega: 'RETIRO' });
    return todos.filter((m) => m.tipoModal !== TIPOS_MODAL_PAGO.EFECTIVO);
  }, [mediosPago]);

  useEffect(() => {
    if (mediosPagoProcesados.length > 0) {
      if (medioPagoInicial?.id_mediopago) {
        const coincideInicial = mediosPagoProcesados.find(
          (m) => String(m.id_mediopago) === String(medioPagoInicial.id_mediopago)
        );
        if (coincideInicial) {
          setMedioPagoSeleccionadoId(coincideInicial.id_mediopago);
          return;
        }
      }
      const existe = mediosPagoProcesados.some((m) => m.id_mediopago === medioPagoSeleccionadoId);
      if (!medioPagoSeleccionadoId || !existe) {
        const mp =
          mediosPagoProcesados.find((m) => m.tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO) ||
          mediosPagoProcesados[0];
        setMedioPagoSeleccionadoId(mp ? mp.id_mediopago : null);
      }
    }
  }, [mediosPagoProcesados, medioPagoSeleccionadoId, medioPagoInicial]);

  const medioPagoSeleccionado = useMemo(
    () => mediosPagoProcesados.find((m) => m.id_mediopago === medioPagoSeleccionadoId) || null,
    [mediosPagoProcesados, medioPagoSeleccionadoId]
  );

  // Reiniciar estado al abrir el modal
  useEffect(() => {
    if (isOpen) {
      cargarMediosPago();
      setPasoActual(1);
      setEsperandoPagoMP(false);
      setMpPreferencia(null);
      setResultadoVenta(null);
      setTiempoExpirado(false);
      setErrorMessage('');
      setErrorMedioPago('');
    }
  }, [isOpen, cargarMediosPago]);

  const recargoPorcentaje = Number(medioPagoSeleccionado?.recargo || 0);
  const montoRecargo = recargoPorcentaje > 0 ? (Number(montoDiagnostico) * recargoPorcentaje) / 100 : 0;
  const montoTotalFinal = Number(montoDiagnostico) + montoRecargo;

  const dispMarca = reparacion?.dispositivo?.marca || '';
  const dispModelo = reparacion?.dispositivo?.modelo || '';
  const dispNombre = `${dispMarca} ${dispModelo}`.trim() || 'Dispositivo en Taller';
  const dispSerie = reparacion?.dispositivo?.numero_serie || 'Sin registrar';
  const codigoOrden = reparacion?.codigo_seguridad || reparacion?.codigo_sec || `REP-${reparacion?.id_reparacion}`;

  const handleAvanzarPaso = async () => {
    setErrorMessage('');

    if (pasoActual === 1) {
      const errNombre = validarCampo('nombre', facturacion.nombre);
      const errApellido = validarCampo('apellido', facturacion.apellido);
      const errDni = validarCampo('dni', facturacion.dni);
      const errTelefono = validarCampo('telefono', facturacion.telefono);
      const errEmail = validarCampo('email', facturacion.email);

      const nuevosErrores = {
        nombre: errNombre,
        apellido: errApellido,
        dni: errDni,
        telefono: errTelefono,
        email: errEmail
      };
      setErroresCampos(nuevosErrores);
      setCamposTocados({ nombre: true, apellido: true, dni: true, telefono: true, email: true });

      if (errNombre || errApellido || errDni || errTelefono || errEmail) {
        setErrorMessage('Por favor revisa y completa los campos fiscales obligatorios antes de continuar.');
        return;
      }

      if (estaRegistrado && !cuentaCompletada && updateUser) {
        try {
          setIsSubmitting(true);
          await axios.put(
            `${API_BASE_URL}/api/users/perfil/editar/`,
            {
              nombre: facturacion.nombre.trim(),
              apellido: facturacion.apellido.trim(),
              dni: facturacion.dni.trim(),
              telefono: facturacion.telefono.trim()
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          updateUser({
            nombre: facturacion.nombre.trim(),
            apellido: facturacion.apellido.trim(),
            dni: facturacion.dni.trim(),
            telefono: facturacion.telefono.trim()
          });
        } catch {
          // Continuar incluso si la sincronización de perfil secundario falla
        } finally {
          setIsSubmitting(false);
        }
      }

      setPasoActual(2);
      return;
    }

    if (pasoActual === 2) {
      if (!medioPagoSeleccionado) {
        setErrorMedioPago('Por favor selecciona un método de pago digital habilitado.');
        return;
      }
      setPasoActual(3);
    }
  };

  const handleRetrocederPaso = () => {
    setErrorMessage('');
    if (pasoActual > 1) {
      setPasoActual((prev) => prev - 1);
    }
  };

  // Confirmar y Pagar desde el Paso 3 (Revisión)
  const handleConfirmarPagoDiagnostico = async () => {
    if (!reparacion?.id_reparacion || !medioPagoSeleccionado) return;
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const resPrep = await axios.post(
        `${API_BASE_URL}/api/workshop/reparaciones/${reparacion.id_reparacion}/pagar-diagnostico/`,
        {
          accion: 'PREPARAR',
          medio_pago: String(
            medioPagoSeleccionado.id_mediopago ||
              medioPagoSeleccionado.codigo ||
              medioPagoSeleccionado.nombre_medio_pago
          )
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const idVenta = resPrep.data?.id_venta || reparacion?.id_venta;
      const datosVenta = {
        id_venta: idVenta,
        codigo_sec: codigoOrden,
        monto_total: montoTotalFinal
      };
      setResultadoVenta(datosVenta);

      const esMP =
        medioPagoSeleccionado.tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO ||
        String(medioPagoSeleccionado.nombre_medio_pago || '').toLowerCase().includes('mercado');

      if (esMP) {
        try {
          const resPref = await axios.post(
            `${API_BASE_URL}/api/sales/mercadopago/crear-preferencia/`,
            { id_venta: idVenta },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setMpPreferencia(resPref.data);
          setEsperandoPagoMP(true);
          // Mostramos el QR y las instrucciones dentro del modal sin abrir una pestaña externa automáticamente.
        } catch (prefErr) {
          const errDetalle =
            prefErr.response?.data?.error ||
            prefErr.response?.data?.detail ||
            'Inconveniente al conectar con Mercado Pago.';
          setErrorMessage(errDetalle);
          setEsperandoPagoMP(true);
        }
      } else {
        // Abrir modal de instrucciones de Transferencia o Tarjeta
        setModalInstruccionesPagoAbierto(true);
      }
    } catch (err) {
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || dataErr?.detail;
      setErrorMessage(msg || 'No fue posible iniciar el pago del diagnóstico.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirmar pago cuando el medio es Transferencia o Tarjeta
  const handleConfirmarOtroMedioDigital = async () => {
    if (!reparacion?.id_reparacion || !medioPagoSeleccionado) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const resConf = await axios.post(
        `${API_BASE_URL}/api/workshop/reparaciones/${reparacion.id_reparacion}/pagar-diagnostico/`,
        {
          accion: 'CONFIRMAR',
          medio_pago: String(
            medioPagoSeleccionado.id_mediopago ||
              medioPagoSeleccionado.codigo ||
              medioPagoSeleccionado.nombre_medio_pago
          )
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setModalInstruccionesPagoAbierto(false);
      setResultadoVenta((prev) => ({
        ...(prev || {}),
        id_venta: resConf.data?.id_venta || prev?.id_venta,
        codigo_sec: codigoOrden,
        estado_venta: 'PAGADA'
      }));
      setPasoActual(4);
    } catch (err) {
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || dataErr?.detail;
      setErrorMessage(msg || 'No fue posible acreditar el pago del diagnóstico.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReintentarMP = async () => {
    const idVenta = resultadoVenta?.id_venta || reparacion?.id_venta;
    if (!idVenta || !token) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const resPref = await axios.post(
        `${API_BASE_URL}/api/sales/mercadopago/crear-preferencia/`,
        { id_venta: idVenta },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMpPreferencia(resPref.data);
      setEsperandoPagoMP(true);
      const urlPago = resPref.data?.init_point || resPref.data?.sandbox_init_point;
      if (urlPago && !resPref.data?.modo_simulacion) {
        window.open(urlPago, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || 'No se pudo conectar con Mercado Pago.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sondeo en tiempo real para acreditación de Mercado Pago
  const sondearEstadoPagoMP = useCallback(async () => {
    if (!esperandoPagoMP || !resultadoVenta?.id_venta || !token) return;
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/sales/compras/virtual/${resultadoVenta.id_venta}/estado/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.pagada) {
        setEsperandoPagoMP(false);
        setResultadoVenta((prev) => ({ ...prev, estado_venta: 'PAGADA' }));
        setPasoActual(4);
      }
    } catch {
      // Sondeo silencioso
    }
  }, [esperandoPagoMP, resultadoVenta, token]);

  useIntervaloVisible(
    sondearEstadoPagoMP,
    esperandoPagoMP && resultadoVenta?.id_venta && token ? 4000 : null,
    { ejecutarAlMontar: false, sincronizarAlVolver: true }
  );

  const handleVerificarAcreditacionMP = async () => {
    if (!resultadoVenta?.id_venta || !token) return;
    setVerificandoPagoMP(true);
    setErrorMessage('');
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/sales/compras/virtual/${resultadoVenta.id_venta}/estado/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.pagada) {
        setEsperandoPagoMP(false);
        setResultadoVenta((prev) => ({ ...prev, estado_venta: 'PAGADA' }));
        setPasoActual(4);
      } else {
        setErrorMessage(
          'Mercado Pago aún no reportó la acreditación. Si ya realizaste la transferencia o pago, aguarda unos instantes.'
        );
      }
    } catch {
      setErrorMessage('No pudimos verificar el estado de acreditación en este momento.');
    } finally {
      setVerificandoPagoMP(false);
    }
  };

  const handleSimularPagoMP = async () => {
    if (!import.meta.env.DEV || !resultadoVenta?.id_venta) return;
    setVerificandoPagoMP(true);
    setErrorMessage('');
    try {
      await axios.post(
        `${API_BASE_URL}/api/sales/mercadopago/webhook/?data.id=SIMULADO-${resultadoVenta.id_venta}`,
        {
          type: 'payment',
          data: { id: `SIMULADO-${resultadoVenta.id_venta}` },
          simular_venta_id: resultadoVenta.id_venta
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEsperandoPagoMP(false);
      setResultadoVenta((prev) => ({ ...prev, estado_venta: 'PAGADA' }));
      setPasoActual(4);
    } catch {
      await handleVerificarAcreditacionMP();
    } finally {
      setVerificandoPagoMP(false);
    }
  };

  const handleCopiarCodigo = () => {
    if (!codigoOrden) return;
    navigator.clipboard.writeText(codigoOrden);
    setCopiadoExito(true);
    setTimeout(() => setCopiadoExito(false), 2500);
  };

  const handleDescargarFactura = async () => {
    const idVenta = resultadoVenta?.id_venta || reparacion?.id_venta;
    if (!idVenta || !token) return;
    setDescargandoFactura(true);
    setErrorMessage('');
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/sales/compras/virtual/${idVenta}/factura/`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.download = `Factura_Diagnostico_${codigoOrden}.pdf`;
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

  if (!isOpen) return null;

  // Evitar apilamiento de modales (Zero Modal Stacking)
  if (modalInstruccionesPagoAbierto) {
    return (
      <PaymentMethodModalDispatcher
        isOpen={modalInstruccionesPagoAbierto}
        onClose={() => setModalInstruccionesPagoAbierto(false)}
        medioPago={medioPagoSeleccionado}
        idVenta={resultadoVenta?.id_venta || null}
        montoTotal={montoTotalFinal}
        concepto={`Pago de Diagnóstico — ${dispNombre}`}
        codigoSeguridad={codigoOrden}
        procesando={isSubmitting}
        textoConfirmar="Confirmar y ver Comprobante"
        onPagoConfirmado={handleConfirmarOtroMedioDigital}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 flex items-center justify-center p-3 sm:p-4 md:p-6 font-sans">
      <motion.div
        ref={modalAccesibilidadRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-diagnostico-titulo"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-3xl bg-[#0F172A] border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Cabecera del Checkout Cyber-Tech (Idéntica al Carrito) */}
        <div className="px-6 py-4 bg-[#1E293B]/90 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
            </div>
            <div>
              <h2
                id="checkout-diagnostico-titulo"
                className="text-lg font-black text-white tracking-tight flex items-center gap-2"
              >
                Checkout Virtual
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 uppercase font-mono">
                  Pago Seguro
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Abono de diagnóstico inicial para habilitar la revisión técnica de tu equipo
              </p>
            </div>
          </div>

          {pasoActual !== 4 && (
            <button
              type="button"
              disabled={isSubmitting || verificandoPagoMP}
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all disabled:opacity-30 cursor-pointer"
              title="Cerrar checkout"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Stepper Indicador de Pasos */}
        {pasoActual !== 4 && !esperandoPagoMP && (
          <div className="px-6 py-3 bg-slate-900/60 border-b border-slate-800/80 shrink-0">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {[
                { num: 1, label: 'Facturación' },
                { num: 2, label: 'Pago' },
                { num: 3, label: 'Revisión' }
              ].map((step) => {
                const activo = pasoActual === step.num;
                const completado = pasoActual > step.num;
                return (
                  <div
                    key={step.num}
                    className={`flex items-center justify-center gap-2 py-1.5 px-2 rounded-lg transition-all ${
                      activo
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 font-bold'
                        : completado
                        ? 'bg-slate-800/60 text-slate-300 font-medium'
                        : 'text-slate-500 opacity-60'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-mono ${
                        activo
                          ? 'bg-cyan-400 text-slate-950 font-black'
                          : completado
                          ? 'bg-slate-700 text-cyan-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {completado ? '✓' : step.num}
                    </span>
                    <span className="truncate">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
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
          {/* ================================================================= */}
          {/* PASO 1: DATOS FISCALES (IDÉNTICO AL CARRITO)                      */}
          {/* ================================================================= */}
          {pasoActual === 1 && !esperandoPagoMP && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                  Información Fiscal del Titular
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Los datos fiscales son exigidos para la emisión inmutable de la factura legal del diagnóstico.
                </p>
              </div>

              {estaRegistrado && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-center gap-3 shadow-md ${
                    cuentaCompletada
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 shadow-emerald-950/20'
                      : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200 shadow-cyan-950/20'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                      cuentaCompletada
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-white">
                      {cuentaCompletada
                        ? 'Tus datos de cuenta fueron precargados correctamente'
                        : 'Completamos los datos disponibles de tu cuenta'}
                    </p>
                    <p className="text-[11px] text-slate-300">
                      {cuentaCompletada
                        ? 'Tus datos fiscales están verificados en tu perfil y protegidos contra modificaciones durante la orden.'
                        : 'Completa los campos faltantes para emitir el comprobante fiscal del diagnóstico.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Nombre */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      Nombre <span className="text-cyan-400">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400">{tieneNombre ? '🔒 Protegido' : 'Solo letras'}</span>
                  </div>
                  <input
                    type="text"
                    name="nombre"
                    value={facturacion.nombre}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    disabled={tieneNombre}
                    placeholder="Ej. Juan"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
                      tieneNombre
                        ? 'bg-slate-800/60 border-slate-700/60 text-slate-300 cursor-not-allowed select-none opacity-85'
                        : erroresCampos.nombre
                        ? 'bg-slate-900/80 border-rose-500/80 text-white'
                        : 'bg-slate-900/80 border-slate-700/80 focus:border-cyan-500 text-white'
                    }`}
                  />
                  {erroresCampos.nombre && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-0.5">
                      <span>⚠️</span>
                      <span>{erroresCampos.nombre}</span>
                    </p>
                  )}
                </div>

                {/* 2. Apellido */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      Apellido <span className="text-cyan-400">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400">{tieneApellido ? '🔒 Protegido' : 'Solo letras'}</span>
                  </div>
                  <input
                    type="text"
                    name="apellido"
                    value={facturacion.apellido}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    disabled={tieneApellido}
                    placeholder="Ej. Rodriguez"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
                      tieneApellido
                        ? 'bg-slate-800/60 border-slate-700/60 text-slate-300 cursor-not-allowed select-none opacity-85'
                        : erroresCampos.apellido
                        ? 'bg-slate-900/80 border-rose-500/80 text-white'
                        : 'bg-slate-900/80 border-slate-700/80 focus:border-cyan-500 text-white'
                    }`}
                  />
                  {erroresCampos.apellido && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-0.5">
                      <span>⚠️</span>
                      <span>{erroresCampos.apellido}</span>
                    </p>
                  )}
                </div>

                {/* 3. DNI / CUIT */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      DNI / CUIT Fiscal <span className="text-cyan-400">*</span>
                    </label>
                    {tieneDni ? (
                      <span className="text-[10px] text-emerald-400 font-mono font-medium">✓ Registrado (Protegido)</span>
                    ) : (
                      <span className="text-[10px] text-slate-400">7 a 11 números</span>
                    )}
                  </div>
                  <input
                    type="text"
                    name="dni"
                    value={facturacion.dni}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    disabled={tieneDni}
                    placeholder="Ej. 38945612"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono tracking-wider transition-all ${
                      tieneDni
                        ? 'bg-slate-800/60 border-slate-700/60 text-slate-300 cursor-not-allowed select-none opacity-85'
                        : erroresCampos.dni
                        ? 'bg-slate-900/80 border-rose-500/80 text-white'
                        : 'bg-slate-900/80 border-cyan-500/40 focus:border-cyan-400 text-white'
                    }`}
                  />
                  {erroresCampos.dni && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-0.5">
                      <span>⚠️</span>
                      <span>{erroresCampos.dni}</span>
                    </p>
                  )}
                </div>

                {/* 4. Teléfono */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      Teléfono de Contacto <span className="text-cyan-400">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400">{tieneTelefono ? '🔒 Protegido' : '9 a 15 dígitos'}</span>
                  </div>
                  <input
                    type="tel"
                    name="telefono"
                    value={facturacion.telefono}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    disabled={tieneTelefono}
                    placeholder="Ej. +5491145678901"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
                      tieneTelefono
                        ? 'bg-slate-800/60 border-slate-700/60 text-slate-300 cursor-not-allowed select-none opacity-85'
                        : erroresCampos.telefono
                        ? 'bg-slate-900/80 border-rose-500/80 text-white'
                        : 'bg-slate-900/80 border-slate-700/80 focus:border-cyan-500 text-white'
                    }`}
                  />
                  {erroresCampos.telefono && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-0.5">
                      <span>⚠️</span>
                      <span>{erroresCampos.telefono}</span>
                    </p>
                  )}
                </div>

                {/* 5. Correo Electrónico */}
                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      Correo de Recepción de Factura <span className="text-cyan-400">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {estaRegistrado ? '🔒 Cuenta oficial' : 'Comprobante digital'}
                    </span>
                  </div>
                  <input
                    type="email"
                    name="email"
                    value={facturacion.email}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    disabled={estaRegistrado}
                    placeholder="Ej. cliente@ifixpos.com"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono transition-all ${
                      estaRegistrado
                        ? 'bg-slate-800/60 border-slate-700/60 text-slate-300 cursor-not-allowed select-none opacity-85'
                        : 'bg-slate-900/80 border-slate-700/80 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-slate-300 text-xs flex items-center gap-3">
                <svg className="w-5 h-5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <span>
                  Los datos fiscales son validados contra las normas de registro de IFixPos y se emiten de forma inmutable en el comprobante fiscal.
                </span>
              </div>
            </motion.div>
          )}

          {/* ================================================================= */}
          {/* PASO 2: MÉTODO DE PAGO Y AVISO PCI-DSS (SIN EFECTIVO)             */}
          {/* ================================================================= */}
          {pasoActual === 2 && !esperandoPagoMP && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  Selecciona el Método de Pago
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Elige el canal digital para abonar el diagnóstico inicial desde la plataforma.
                </p>
              </div>

              {errorMedioPago && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{errorMedioPago}</span>
                </div>
              )}

              {cargandoMediosPago ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Cargando canales de pago habilitados...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {mediosPagoProcesados.map((medio) => {
                    const seleccionado = medio.id_mediopago === medioPagoSeleccionadoId;
                    const nombre = medio.nombre_medio_pago || medio.nombre || 'Medio de Pago';
                    const esMP = medio.tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO;
                    const esTransferencia = medio.tipoModal === TIPOS_MODAL_PAGO.TRANSFERENCIA;

                    return (
                      <div
                        key={medio.id_mediopago}
                        onClick={() => {
                          setMedioPagoSeleccionadoId(medio.id_mediopago);
                          setErrorMedioPago('');
                        }}
                        title={nombre}
                        className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                          seleccionado
                            ? esMP
                              ? 'bg-sky-500/15 border-sky-400 shadow-lg shadow-sky-950/30'
                              : 'bg-cyan-500/15 border-cyan-400 shadow-lg shadow-cyan-950/20'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                              esMP
                                ? 'bg-[#009EE3]/15 border-[#009EE3]/40 text-[#009EE3]'
                                : 'bg-slate-800 border-slate-700 text-cyan-400'
                            }`}
                          >
                            {esMP ? (
                              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5l4.5 2.5-4.5 2.5zm5.5-5.5h-2.1c-.2-1.8-1.5-3.2-3.4-3.4V5.5c3 .4 5.3 2.6 5.5 5.5z" />
                              </svg>
                            ) : esTransferencia ? (
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.8}
                                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.8}
                                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                                />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold text-white capitalize truncate">{nombre}</p>
                              {esMP && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono uppercase font-semibold">
                                  ⚡ Automático
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">{medio.descripcionCorta}</p>
                          </div>
                        </div>

                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            seleccionado
                              ? esMP
                                ? 'border-sky-400 bg-sky-400'
                                : 'border-cyan-400 bg-cyan-400'
                              : 'border-slate-600'
                          }`}
                        >
                          {seleccionado && <div className="w-1.5 h-1.5 rounded-full bg-slate-950"></div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Cartel de Seguridad PCI-DSS (Idéntico al Carrito) */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 text-slate-300 text-xs space-y-2">
                <div className="flex items-center gap-2 text-cyan-400 font-bold">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <span>Cumplimiento y Seguridad de Pago (PCI-DSS)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Para garantizar la máxima seguridad y privacidad, <strong>IFixPos no captura, procesa ni almacena datos sensibles de tarjetas ni credenciales bancarias</strong>. Toda transacción virtual se delega por completo a pasarelas de cobro certificadas bajo protocolos de encriptación TLS 1.3 de grado bancario.
                </p>
              </div>
            </motion.div>
          )}

          {/* ================================================================= */}
          {/* PASO 3: REVISIÓN FINAL DE TU ORDEN (IDÉNTICO AL CARRITO)          */}
          {/* ================================================================= */}
          {pasoActual === 3 && !esperandoPagoMP && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  Revisión Final de tu Orden
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verifica el detalle del servicio técnico y tus datos antes de concretar el abono.
                </p>
              </div>

              {/* Resumen del Concepto de Diagnóstico */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Concepto a Facturar (1 ítem)
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold uppercase">
                    Pago único por reparación
                  </span>
                </div>

                <div className="py-2 flex items-center justify-between gap-3 text-xs border-t border-slate-800/80 pt-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300 text-base shrink-0">
                      🔧
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">
                        Pago de Diagnóstico — {dispNombre}
                      </p>
                      <p className="text-slate-400 text-[11px] font-mono">
                        N. Serie: {dispSerie} • 1 x {formatearMoneda(montoDiagnostico)}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-cyan-400 shrink-0">
                    {formatearMoneda(montoDiagnostico)}
                  </span>
                </div>
              </div>

              {/* Desglose de Equipo, Facturación y Pago */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                    Dispositivo en Taller
                  </span>
                  <p className="font-bold text-white truncate">{dispNombre}</p>
                  <p className="text-slate-400 text-[11px] font-mono">
                    N. Serie: {dispSerie}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                    Facturación y Pago
                  </span>
                  <p className="font-bold text-white truncate">
                    {facturacion.nombre} {facturacion.apellido} (DNI: {facturacion.dni})
                  </p>
                  <p className="text-cyan-400 text-[11px]">
                    Canal: {medioPagoSeleccionado?.nombre_medio_pago || medioPagoSeleccionado?.nombre || 'Seleccionado'}
                  </p>
                </div>
              </div>

              {/* Desglose Total Financiero */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-cyan-950/40 border border-cyan-500/30 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Arancel de Diagnóstico Inicial:</span>
                  <span className="font-mono">{formatearMoneda(montoDiagnostico)}</span>
                </div>

                {montoRecargo > 0 && (
                  <div className="flex items-center justify-between text-xs text-amber-300">
                    <span>Recargo por medio de pago ({recargoPorcentaje}%):</span>
                    <span className="font-mono">+{formatearMoneda(montoRecargo)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Cobertura de Reevaluaciones Futuras:</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                    Sin cargo adicional ($0.00)
                  </span>
                </div>

                <div className="pt-2.5 border-t border-slate-700/80 flex items-center justify-between">
                  <span className="text-sm font-bold text-white">Total Final a Pagar:</span>
                  <span className="text-xl font-black font-mono text-cyan-400">
                    {formatearMoneda(montoTotalFinal)}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ================================================================= */}
          {/* PANTALLA INTERACTIVA: ESPERANDO PAGO DE MERCADO PAGO (IDÉNTICA)   */}
          {/* ================================================================= */}
          {esperandoPagoMP && resultadoVenta && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="py-6 text-center space-y-5"
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

              <div className="max-w-md mx-auto p-4 rounded-xl bg-slate-900/90 border border-[#009EE3]/40 space-y-3.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Total de la Orden:</span>
                  <span className="font-mono text-cyan-400 font-bold text-sm">
                    {formatearMoneda(montoTotalFinal)}
                  </span>
                </div>

                {tiempoExpirado ? (
                  <div className="w-full py-3 px-4 rounded-xl bg-slate-800/80 border border-rose-500/40 text-rose-300 font-bold text-xs tracking-wide flex items-center justify-center gap-2 text-center">
                    <span>⚠️ Link Expirado — Tiempo de Sesión Finalizado</span>
                  </div>
                ) : (
                  <>
                    {mpPreferencia?.init_point || mpPreferencia?.sandbox_init_point ? (
                      <>
                        <div className="py-2 flex flex-col items-center justify-center space-y-2.5">
                          <div className="p-3 bg-white rounded-2xl shadow-xl border-2 border-[#009EE3]/50 inline-flex items-center justify-center">
                            <QRCodeSVG
                              value={mpPreferencia.init_point || mpPreferencia.sandbox_init_point}
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
                          href={mpPreferencia.init_point || mpPreferencia.sandbox_init_point || '#'}
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
                          disabled={isSubmitting}
                          onClick={handleReintentarMP}
                          className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 active:scale-95 transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <span>Generando enlace...</span>
                          ) : (
                            <span>🔄 Generar Link y Código QR de Mercado Pago</span>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                )}

                <div className="pt-2 border-t border-slate-800 flex items-center justify-center gap-2 text-[11px] text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                  <span>Conexión activa: sincronizando acreditación con Mercado Pago</span>
                </div>
              </div>

              {/* Banner de Modo Simulación / Desarrollo */}
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
                    className="w-full py-2 px-3 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/40 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {verificandoPagoMP ? 'Simulando Webhook...' : '⚡ Simular Aprobación Instantánea'}
                  </button>
                </div>
              )}

              <TemporizadorReservaModal
                segundosIniciales={30 * 60}
                onExpirado={() => setTiempoExpirado(true)}
              />

              <div className="max-w-md mx-auto space-y-3 pt-1">
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    disabled={verificandoPagoMP}
                    onClick={handleVerificarAcreditacionMP}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    {verificandoPagoMP ? 'Verificando...' : 'Comprobar Acreditación'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="py-2.5 px-4 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Volver a la Reparación (Pagar luego)</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ================================================================= */}
          {/* PASO 4: PANTALLA DE ÉXITO Y COMPROBANTE (IDÉNTICA AL CARRITO)     */}
          {/* ================================================================= */}
          {pasoActual === 4 && resultadoVenta && !esperandoPagoMP && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6 text-center space-y-6"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-cyan-300 shadow-xl shadow-cyan-500/30">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-white tracking-tight">
                  ¡Pago de Diagnóstico Confirmado con Éxito!
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Tu abono ha sido acreditado. El dispositivo pasó automáticamente a <strong className="text-cyan-300">Esperando Diagnóstico</strong> y será evaluado por el técnico asignado.
                </p>
              </div>

              {/* Tarjeta con Código Oficial de Seguridad */}
              <div className="max-w-md mx-auto p-4 rounded-xl bg-slate-900/90 border border-cyan-500/40 space-y-2.5">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-base">🛡️</span>
                  <span className="text-[11px] text-cyan-300 uppercase font-mono font-bold tracking-wider">
                    Código de Seguridad de la Reparación
                  </span>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-2xl font-black font-mono tracking-widest text-cyan-400">
                    {codigoOrden}
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
                  Conserva este código de seguridad; te servirá para el seguimiento y retiro de tu dispositivo en nuestra Sede Central.
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

              {/* Instrucciones y Confirmación por Correo */}
              <div className="max-w-md mx-auto text-left p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-2.5 text-slate-300">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <span>🔧</span>
                  <span>Próximos Pasos:</span>
                </p>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Nuestro especialista técnico comenzará el diagnóstico de tu equipo ({dispNombre}) y te notificaremos apenas el informe técnico y el presupuesto estén listos.
                </p>
                <p className="text-[11px] text-cyan-400 pt-1 flex items-center gap-1.5 font-medium">
                  <span>✉️</span>
                  <span>
                    Te enviamos un correo electrónico a <b>{facturacion.email || user?.email}</b> con los detalles del equipo y tu Factura PDF adjunta.
                  </span>
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Pie de Acciones / Botones (Idéntico al Carrito) */}
        <div className="px-6 py-4 bg-[#1E293B]/90 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          {esperandoPagoMP ? (
            <div className="w-full flex items-center justify-center py-1">
              <span className="text-xs text-slate-400 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                <span>Esperando acreditación de pago en tiempo real con Mercado Pago...</span>
              </span>
            </div>
          ) : pasoActual === 4 ? (
            <button
              type="button"
              onClick={() => {
                onPagoCompletado?.(resultadoVenta);
                onClose?.();
              }}
              className="w-full py-3 px-6 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all cursor-pointer"
            >
              Volver al Detalle de la Reparación
            </button>
          ) : (
            <>
              {pasoActual > 1 ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleRetrocederPaso}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs tracking-wide border border-slate-700 transition-all disabled:opacity-40 cursor-pointer"
                >
                  ← Paso Anterior
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onClose}
                  className="py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 font-semibold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              )}

              {pasoActual < 3 ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleAvanzarPaso}
                  className="py-2.5 px-6 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                >
                  <span>Continuar</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmarPagoDiagnostico}
                  className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 text-slate-950 font-extrabold text-xs tracking-wide shadow-lg shadow-cyan-500/30 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                      <span>Procesando Orden...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirmar y Pagar • {formatearMoneda(montoTotalFinal)}</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
