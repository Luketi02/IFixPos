import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import { resolverUrlImagen } from '../../utils/imagenes';
import { formatearFecha } from '../../utils/fechas';
import {
  formatearEstadoReparacion,
  obtenerColorBadgeEstado,
  obtenerResumenCortoBitacora
} from '../../utils/repairStatus';
import CapsulaGuiaReparacion from '../../components/devices/CapsulaGuiaReparacion';
import CalificarServicioModal from '../../components/workshop/CalificarServicioModal';
import DetalleBitacoraModal from '../../components/workshop/DetalleBitacoraModal';
import CheckoutDiagnosticoModal from '../../components/workshop/CheckoutDiagnosticoModal';
import PaymentMethodModalDispatcher from '../../components/payments/PaymentMethodModalDispatcher';
import { useMediosPagoActivos } from '../../hooks/useMediosPagoActivos';
import { TIPOS_MODAL_PAGO } from '../../utils/mediosPago';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

import { API_BASE_URL } from '../../config/api';
export default function ReparacionDetalle() {
  const { id_reparacion } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [reparacion, setReparacion] = useState(null);
  const [diagnosticoDetallado, setDiagnosticoDetallado] = useState(null);
  const [cargadoId, setCargadoId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Estados locales para el Formulario de Decisión Comercial (CU-09)
  const [decision, setDecision] = useState(null); // 'ACEPTAR' | 'RECHAZAR' | null
  const [metodoEntrega, setMetodoEntrega] = useState('RETIRO');
  const [comentariosCliente, setComentariosCliente] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Medios de pago dinámicos desde la base de datos (/api/sales/medios-pago/)
  const {
    mediosPago,
    medioSeleccionado,
    idMedioSeleccionado,
    setIdMedioSeleccionado,
    cargandoMediosPago,
    errorMediosPago
  } = useMediosPagoActivos({
    habilitado: true,
    metodoEntrega: 'ENVIO', // Excluye/deshabilita Efectivo en toda la pantalla de detalles de la reparación
    tipoPreferidoInicial: TIPOS_MODAL_PAGO.MERCADOPAGO
  });

  // Estado para abrir el modal reutilizable de pasarela/instrucciones tras aceptar el presupuesto
  const [modalPagoPresupuesto, setModalPagoPresupuesto] = useState({
    abierto: false,
    idVenta: null,
    medioPago: null,
    montoTotal: 0
  });

  // Estados para el pago del Diagnóstico Inicial desde ReparacionDetalle (CU-26 / CU-45)
  const [idMedioDiagSeleccionado, setIdMedioDiagSeleccionado] = useState('');
  const [procesandoPagoDiag, setProcesandoPagoDiag] = useState(false);
  const [modalPagoDiagnostico, setModalPagoDiagnostico] = useState({
    abierto: false,
    idVenta: null,
    medioPago: null,
    montoTotal: 0
  });

  // Estado local para Modal de Calificación (CU-19)
  const [modalCalificarAbierto, setModalCalificarAbierto] = useState(false);

  // Estado local para Modal de Inspección Detallada de Bitácora
  const [registroInspeccion, setRegistroInspeccion] = useState(null);

  const isLoading = cargadoId !== id_reparacion;

  // Auto-ocultamiento de alertas de error a los 15 segundos (Regla Global de UX)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(''), 15000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  // Auto-ocultamiento de alertas de éxito a los 15 segundos
  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = setTimeout(() => setSuccessMessage(''), 15000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // Función reutilizable para cargar la información de la reparación y diagnóstico
  const cargarDetalle = useCallback(async () => {
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/workshop/reparaciones/${id_reparacion}/detalles/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReparacion(res.data);

      // Consumo específico del Diagnóstico Técnico y Presupuesto (CU-56)
      try {
        const diagRes = await axios.get(
          `${API_BASE_URL}/api/workshop/reparaciones/${id_reparacion}/diagnostico/cliente/`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setDiagnosticoDetallado(diagRes.data);
      } catch (diagErr) {
        // Si el técnico aún no emitió diagnóstico (404), mantenemos null
        setDiagnosticoDetallado(null);
      }
    } catch (err) {
      console.error('Error al consultar detalle de reparación:', err);
      const status = err.response?.status;
      const data = err.response?.data;
      const msg = data?.detail || data?.error || (Array.isArray(data) ? data.join(' ') : null);

      if (status === 404) {
        setErrorMessage('Orden de reparación no encontrada.');
      } else if (status === 403) {
        setErrorMessage(msg || 'Acceso Denegado: No posee permisos sobre este equipo.');
      } else {
        setErrorMessage(msg || 'No fue posible cargar el detalle de la reparación.');
      }
    } finally {
      setCargadoId(id_reparacion);
    }
  }, [id_reparacion, token]);

  useEffect(() => {
    cargarDetalle();
  }, [cargarDetalle]);

  const rolCodigo = (user?.rol?.codigo || user?.id_rol?.codigo || '').toUpperCase();
  const esPersonalTecnico = ['ADMIN', 'TECNICO'].includes(rolCodigo);

  const imagenDispositivo = resolverUrlImagen(reparacion?.dispositivo?.imagen);
  const idDisp = reparacion?.dispositivo?.id_dispositivo;
  const bitacora = reparacion?.bitacora || [];

  // Datos consolidados del diagnóstico (del endpoint específico o del payload detallado)
  const diagData = diagnosticoDetallado || reparacion?.diagnostico;
  const insumosData = diagnosticoDetallado?.insumos_utilizados || reparacion?.insumos || [];

  // Cálculos económicos de la propuesta
  const costoManoObra = Number(
    diagData?.costo_mano_obra ?? diagData?.costo_diagnostico ?? 0
  );

  const costoInsumos = diagnosticoDetallado?.costo_insumos !== undefined
    ? Number(diagnosticoDetallado.costo_insumos)
    : insumosData.reduce(
        (acc, item) =>
          acc + Number(item.subtotal || Number(item.cantidad || 0) * Number(item.precio_unitario || 0)),
        0
      );

  const costoTotalEstimado = diagnosticoDetallado?.costo_total !== undefined
    ? Number(diagnosticoDetallado.costo_total)
    : costoManoObra + costoInsumos;

  // Evaluación estricta de precondición operativa para el Panel de Decisión (CU-09)
  const etapaNormalizada = (reparacion?.etapa || '')
    .toUpperCase()
    .trim()
    .replace(' ', '_')
    .replace('Á', 'A')
    .replace('É', 'E')
    .replace('Í', 'I')
    .replace('Ó', 'O')
    .replace('Ú', 'U');

  const estaEsperandoConfirmacion = etapaNormalizada === 'ESPERANDO_CONFIRMACION';
  const estaEsperandoPagoDiagnostico = etapaNormalizada === 'ESPERANDO_PAGO_DIAGNOSTICO';
  const estaEsperandoDispositivo = etapaNormalizada === 'ESPERANDO_DISPOSITIVO';
  const estadoPagoUpper = String(reparacion?.estado_pago || '').toUpperCase();
  const tieneDiagnosticosPrevios =
    Boolean(diagData) || (Array.isArray(reparacion?.diagnosticos) && reparacion.diagnosticos.length > 0);
  const debeDiagnosticoInicial =
    !tieneDiagnosticosPrevios &&
    (estaEsperandoPagoDiagnostico || (estaEsperandoDispositivo && reparacion?.debe_diagnostico === true)) &&
    estadoPagoUpper !== 'PAGADA' &&
    estadoPagoUpper !== 'PAGADO';
  const montoDiagnostico = Number(reparacion?.costo_diagnostico || 5000);

  const esClienteActivo = !esPersonalTecnico || rolCodigo === 'CLIENTE';
  const puedeTomarDecision = estaEsperandoConfirmacion && esClienteActivo && Boolean(diagData);

  // Medios de pago permitidos para abonar diagnóstico desde la plataforma (excluyendo Efectivo)
  const mediosPagoDiagnostico = mediosPago.filter(
    (m) => m.tipoModal !== TIPOS_MODAL_PAGO.EFECTIVO
  );

  // Inicializar medio de pago para diagnóstico priorizando Mercado Pago o cualquier medio digital (nunca Efectivo)
  useEffect(() => {
    if (mediosPagoDiagnostico.length > 0) {
      const existeEnLista = mediosPagoDiagnostico.some(
        (m) => String(m.id_mediopago) === String(idMedioDiagSeleccionado)
      );
      if (!idMedioDiagSeleccionado || !existeEnLista) {
        const preferido =
          mediosPagoDiagnostico.find((m) => m.tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO) ||
          mediosPagoDiagnostico[0];
        if (preferido) {
          setIdMedioDiagSeleccionado(String(preferido.id_mediopago));
        }
      }
    }
  }, [mediosPagoDiagnostico, idMedioDiagSeleccionado]);

  const medioDiagSeleccionado =
    mediosPagoDiagnostico.find((m) => String(m.id_mediopago) === String(idMedioDiagSeleccionado)) ||
    mediosPagoDiagnostico[0] ||
    null;

  // Abrir modal para abonar el diagnóstico inicial desde la plataforma
  const handleIniciarPagoDiagnostico = async () => {
    if (!medioDiagSeleccionado) {
      setErrorMessage('Por favor selecciona un medio de pago digital habilitado para abonar el diagnóstico.');
      return;
    }

    setProcesandoPagoDiag(true);
    setErrorMessage('');
    let idVentaDiag = reparacion?.id_venta || null;
    let montoDiag = montoDiagnostico;

    try {
      const resPrep = await axios.post(
        `${API_BASE_URL}/api/workshop/reparaciones/${id_reparacion}/pagar-diagnostico/`,
        {
          accion: 'PREPARAR',
          medio_pago: String(
            medioDiagSeleccionado.id_mediopago ||
              medioDiagSeleccionado.codigo ||
              medioDiagSeleccionado.nombre_medio_pago
          )
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      idVentaDiag = resPrep.data?.id_venta || idVentaDiag;
      montoDiag = Number(resPrep.data?.monto_total || montoDiag);
    } catch (err) {
      // Si la reparación aún no tenía id_venta y el backend devolvió un error explícito de negocio, informarlo
      if (!idVentaDiag) {
        const data = err.response?.data;
        const msg = data?.error || data?.detail || 'No fue posible preparar la orden de pago del diagnóstico.';
        setErrorMessage(msg);
        setProcesandoPagoDiag(false);
        return;
      }
    }

    setProcesandoPagoDiag(false);
    setModalPagoDiagnostico({
      abierto: true,
      idVenta: idVentaDiag,
      medioPago: medioDiagSeleccionado,
      montoTotal: montoDiag
    });
  };

  // Confirmar acreditación del pago de diagnóstico desde el modal del medio elegido
  const handleConfirmarPagoDiagnosticoModal = async (datosModal) => {
    const tipoModal = datosModal?.tipoModal || medioDiagSeleccionado?.tipoModal;

    // Si eligió Efectivo, es informativo para abonar presencialmente en caja
    if (tipoModal === TIPOS_MODAL_PAGO.EFECTIVO) {
      setModalPagoDiagnostico((prev) => ({ ...prev, abierto: false }));
      setSuccessMessage(
        'Recuerda presentar tu Código de Seguridad en la caja de nuestra sucursal para abonar el diagnóstico en efectivo.'
      );
      return;
    }

    // Si fue Mercado Pago, el webhook/simulador ya acreditó la venta y actualizó la reparación
    if (tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO) {
      setModalPagoDiagnostico((prev) => ({ ...prev, abierto: false }));
      setSuccessMessage(
        '¡Pago de diagnóstico acreditado con éxito! Tu dispositivo ya pasó a Esperando Diagnóstico y será evaluado por el técnico.'
      );
      await cargarDetalle();
      return;
    }

    // Para Transferencia o Tarjeta, confirmar acreditación en el backend
    setProcesandoPagoDiag(true);
    try {
      const medioUsado = datosModal?.medioPago || medioDiagSeleccionado;
      const resConf = await axios.post(
        `${API_BASE_URL}/api/workshop/reparaciones/${id_reparacion}/pagar-diagnostico/`,
        {
          accion: 'CONFIRMAR',
          medio_pago: String(
            medioUsado?.id_mediopago || medioUsado?.codigo || medioUsado?.nombre_medio_pago || 'ONLINE'
          )
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setModalPagoDiagnostico((prev) => ({ ...prev, abierto: false }));
      setSuccessMessage(
        resConf.data?.mensaje ||
          '¡Pago de diagnóstico acreditado con éxito! Tu dispositivo ya se encuentra listo para recibir el diagnóstico del técnico.'
      );
      await cargarDetalle();
    } catch (err) {
      const data = err.response?.data;
      const msg = data?.error || data?.detail || 'No fue posible registrar el pago del diagnóstico.';
      setErrorMessage(msg);
    } finally {
      setProcesandoPagoDiag(false);
    }
  };

  // Manejador del envío de la decisión del cliente
  const handleEnviarDecision = async (e) => {
    e.preventDefault();
    if (!decision) return;

    if (decision === 'ACEPTAR') {
      if (!metodoEntrega || !medioSeleccionado) {
        setErrorMessage('Por favor seleccione el método de entrega y un medio de pago habilitado.');
        return;
      }
      if (metodoEntrega === 'ENVIO' && medioSeleccionado.deshabilitado) {
        setErrorMessage('El pago en efectivo en mostrador no está permitido para envíos a domicilio. Seleccione otro medio de pago.');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage('');

    const payload = {
      decision,
      comentarios_cliente: comentariosCliente.trim() || undefined
    };

    if (decision === 'ACEPTAR' && medioSeleccionado) {
      payload.metodo_entrega = metodoEntrega;
      payload.metodo_pago = String(
        medioSeleccionado.id_mediopago ||
          medioSeleccionado.codigo ||
          medioSeleccionado.nombre_medio_pago
      );
    }

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/workshop/reparaciones/${id_reparacion}/decision/`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const msgExito =
        res.data?.mensaje ||
        (decision === 'ACEPTAR'
          ? '¡Presupuesto aceptado exitosamente! La orden de insumos fue generada y los técnicos iniciaron los trabajos.'
          : 'Presupuesto de reparación rechazado. La orden de servicio ha sido cancelada.');

      const idVentaGenerada =
        res.data?.reparacion?.id_venta || res.data?.id_venta || null;
      const medioElegidoSnapshot = medioSeleccionado;

      setSuccessMessage(msgExito);
      setDecision(null);
      setComentariosCliente('');

      // Recarga inmediata de los datos para actualizar estado y timeline
      await cargarDetalle();

      // Si aceptó el presupuesto, abrir el modal correspondiente al medio de pago elegido
      if (decision === 'ACEPTAR' && medioElegidoSnapshot) {
        setModalPagoPresupuesto({
          abierto: true,
          idVenta: idVentaGenerada,
          medioPago: medioElegidoSnapshot,
          montoTotal: costoTotalEstimado
        });
      }
    } catch (err) {
      console.error('Error al enviar decisión sobre la reparación:', err);
      const data = err.response?.data;
      const msg = data?.error || data?.detail || (Array.isArray(data) ? data.join(' ') : null);
      setErrorMessage(msg || 'No fue posible registrar su decisión. Por favor intente nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F8FAFC] font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      <AdminSidebar activeMenu="client-devices-list" />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header Superior */}
        <header className="h-16 border-b border-slate-800 bg-[#1E293B]/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <img
              src={logoEmpresa}
              alt="Logo IFixPos"
              className="w-8 h-8 object-contain drop-shadow-[0_2px_8px_rgba(6,182,212,0.4)]"
            />
            <div className="flex items-center gap-2 text-xs font-mono">
              <Link to="/cliente/dispositivos" className="text-slate-400 hover:text-cyan-400 transition-colors">
                Mis Dispositivos
              </Link>
              {idDisp && (
                <>
                  <span className="text-slate-600">/</span>
                  <Link
                    to={`/cliente/dispositivos/${idDisp}`}
                    className="text-slate-400 hover:text-cyan-400 transition-colors truncate max-w-[140px]"
                  >
                    {reparacion?.dispositivo?.marca || 'Dispositivo'} {reparacion?.dispositivo?.modelo || ''}
                  </Link>
                </>
              )}
              <span className="text-slate-600">/</span>
              <span className="text-cyan-400 font-semibold">
                Seguimiento de Reparación
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <UserProfileDropdown align="right" />
          </div>
        </header>

        <main className="flex-1 p-6 sm:p-10 max-w-6xl mx-auto w-full">
          {/* Botón Volver Dinámico */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => {
                if (idDisp) navigate(`/cliente/dispositivos/${idDisp}`);
                else navigate('/cliente/dispositivos');
              }}
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#94A3B8] hover:text-[#06B6D4] transition-colors group cursor-pointer"
            >
              <svg
                className="w-4 h-4 transition-transform group-hover:-translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>{idDisp ? 'Volver al Dispositivo' : 'Volver a Mis Dispositivos'}</span>
            </button>
          </div>

          {/* Alertas de Notificación con fade-out a 6 segundos */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                role="alert"
                className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3 shadow-lg shadow-rose-950/20"
              >
                <span className="text-rose-400 font-bold mt-0.5">!</span>
                <span className="flex-1">{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  className="text-rose-400 hover:text-rose-200 text-xs font-mono cursor-pointer"
                >
                  ✕
                </button>
              </motion.div>
            )}

            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                role="status"
                className="mb-6 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-sm flex items-start gap-3 shadow-lg shadow-emerald-950/20"
              >
                <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                <span className="flex-1 font-medium">{successMessage}</span>
                <button
                  type="button"
                  onClick={() => setSuccessMessage('')}
                  className="text-emerald-400 hover:text-emerald-200 text-xs font-mono cursor-pointer"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Estado de Carga: Skeleton Cyber-Tech */}
          {isLoading ? (
            <div className="space-y-6">
              <div className="h-32 rounded-2xl bg-[#1E293B] border border-slate-800 animate-pulse" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="h-64 rounded-2xl bg-[#1E293B] border border-slate-800 animate-pulse" />
                  <div className="h-44 rounded-2xl bg-[#1E293B] border border-slate-800 animate-pulse" />
                </div>
                <div className="h-96 rounded-2xl bg-[#1E293B] border border-slate-800 animate-pulse" />
              </div>
            </div>
          ) : !reparacion ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 bg-[#1E293B]/50 border border-dashed border-slate-700 rounded-2xl"
            >
              <p className="text-slate-200 font-semibold">No se pudo cargar la orden de reparación.</p>
              <button
                type="button"
                onClick={() => navigate('/cliente/dispositivos')}
                className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-cyan-400 border border-slate-700 font-semibold transition-colors cursor-pointer"
              >
                Regresar al listado
              </button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="space-y-6"
            >
              {/* 1. CABECERA PRINCIPAL */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-7 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                    {imagenDispositivo ? (
                      <img
                        src={imagenDispositivo}
                        alt="Dispositivo"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg className="w-8 h-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                      </svg>
                    )}
                  </div>

                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider block">
                      Seguimiento del Servicio Técnico
                    </span>
                    <h1 className="text-xl sm:text-2xl font-black text-white truncate">
                      {reparacion.dispositivo?.marca} {reparacion.dispositivo?.modelo}
                    </h1>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      N. Serie: <span className="text-slate-200">{reparacion.dispositivo?.numero_serie || 'Sin registrar'}</span>
                      {reparacion.tecnico && (
                        <> • Técnico: <span className="text-cyan-300 font-semibold">{reparacion.tecnico}</span></>
                      )}
                    </p>
                  </div>
                </div>

                {/* Badge Grande y Vistoso del Estado Actual */}
                <div className="flex flex-col sm:items-end justify-center shrink-0">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Estado Actual
                  </span>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-bold text-sm sm:text-base font-mono shadow-[0_0_20px_rgba(6,182,212,0.25)]">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>{formatearEstadoReparacion(reparacion.etapa)}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 mt-1">
                    Inició: {formatearFecha(reparacion.fecha_inicio)} {reparacion.fecha_entrega ? `• Entregado: ${formatearFecha(reparacion.fecha_entrega)}` : ''}
                  </span>
                </div>
              </div>

              {/* Cápsula de Orientación al Cliente según el Estado Técnico */}
              <CapsulaGuiaReparacion
                etapa={reparacion.etapa}
                codigoSeguridad={reparacion.codigo_seguridad || reparacion.codigo_sec}
              />

              {/* Panel Privado de Seguridad (Solo ADMIN / TECNICO) */}
              {esPersonalTecnico && (reparacion.credencial_acceso || reparacion.codigo_sec) && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[10px] uppercase">
                      Panel Técnico
                    </span>
                    <span>Credenciales internas para pruebas:</span>
                  </div>
                  <div className="flex items-center gap-4 font-mono font-bold">
                    {reparacion.codigo_sec && (
                      <span>Código Sec: <strong className="text-white">{reparacion.codigo_sec}</strong></span>
                    )}
                    {reparacion.credencial_acceso && (
                      <span>PIN/Clave: <strong className="text-white">{reparacion.credencial_acceso}</strong></span>
                    )}
                  </div>
                </div>
              )}

              {/* GRID PRINCIPAL: 2 Columnas en PC, 1 en Móvil */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                
                {/* ================= COLUMNA IZQUIERDA ================= */}
                <div className="space-y-6">

                  {/* Tarjeta 0: Panel de Abono de Diagnóstico Inicial (Cuando está en ESPERANDO_PAGO_DIAGNOSTICO o adeuda el 1° diagnóstico) */}
                  {debeDiagnosticoInicial && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[#1E293B] border-2 border-amber-500/45 rounded-2xl p-6 sm:p-7 shadow-[0_0_30px_rgba(245,158,11,0.14)] space-y-5 relative overflow-hidden"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700/70 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300 text-xl shrink-0">
                            💳
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h2 className="text-base font-bold text-white font-mono tracking-wide">
                                Abono de Diagnóstico Inicial
                              </h2>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                Pago único
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 font-mono mt-0.5">
                              Requisito previo para iniciar la evaluación técnica del dispositivo
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                            Arancel de Diagnóstico
                          </span>
                          <span className="text-2xl font-black font-mono text-amber-300">
                            ${montoDiagnostico.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 leading-relaxed space-y-1.5">
                        <p>
                          <strong className="text-amber-300">¿Por qué figura pendiente este pago?</strong> Si al iniciar la solicitud elegiste abonar en efectivo o dejaste el equipo en el local sin abonar en el momento, la orden aguarda la acreditación del diagnóstico para que el técnico comience a revisarlo.
                        </p>
                        <p className="text-slate-400">
                          ℹ️ <strong className="text-slate-200">Regla de servicio:</strong> Solo se abona el <strong>primer diagnóstico</strong>. Si más adelante tu equipo requiere un nuevo diagnóstico o reevaluación técnica, no tendrá ningún costo adicional.
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                        <span className="text-[11px] text-slate-400 font-mono">
                          Al acreditarse el pago, el equipo pasará automáticamente a <strong className="text-cyan-300">Esperando Diagnóstico</strong>.
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setModalPagoDiagnostico({
                              abierto: true,
                              idVenta: reparacion?.id_venta || null,
                              medioPago: medioDiagSeleccionado,
                              montoTotal: montoDiagnostico
                            })
                          }
                          disabled={procesandoPagoDiag}
                          className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs font-mono uppercase tracking-wider shadow-[0_0_20px_rgba(245,158,11,0.35)] transition-all cursor-pointer disabled:opacity-50 shrink-0 flex items-center justify-center gap-2"
                        >
                          <span>💳</span>
                          <span>Abonar Diagnóstico Ahora</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                  
                  {/* Tarjeta 1: Informe Técnico y Presupuesto (CU-56) */}
                  <div className="bg-[#1E293B] border-2 border-cyan-500/40 hover:border-cyan-400/60 transition-all rounded-2xl p-6 sm:p-7 shadow-[0_0_30px_rgba(6,182,212,0.12)] space-y-6 relative overflow-hidden">
                    <div className="border-b border-slate-700/60 pb-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-white font-mono tracking-wide">
                            Informe Técnico y Presupuesto
                          </h2>
                          <p className="text-[11px] text-slate-400 font-mono">
                            Dictamen oficial emitido por el especialista de taller
                          </p>
                        </div>
                      </div>

                      {diagData?.fecha_diagnostico && (
                        <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                          Fecha: {formatearFecha(diagData.fecha_diagnostico)}
                        </span>
                      )}
                    </div>

                    {!diagData ? (
                      estaEsperandoPagoDiagnostico ? (
                        <div className="p-6 rounded-xl bg-slate-900/70 border border-amber-500/30 text-center space-y-2.5">
                          <div className="w-11 h-11 mx-auto rounded-full bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-300 text-lg">
                            💳
                          </div>
                          <p className="text-sm font-semibold text-slate-100">
                            Evaluación técnica en espera del pago de diagnóstico
                          </p>
                          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                            Tu dispositivo ya fue recepcionado en el taller. En cuanto se acredite el pago único del diagnóstico inicial (desde esta página o en caja del local), el técnico asignado comenzará la evaluación.
                          </p>
                        </div>
                      ) : estaEsperandoDispositivo ? (
                        <div className="p-6 rounded-xl bg-slate-900/70 border border-slate-800 text-center space-y-2.5">
                          <div className="w-11 h-11 mx-auto rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-300 text-lg">
                            📦
                          </div>
                          <p className="text-sm font-semibold text-slate-100">
                            Aguardando la entrega física del dispositivo en sucursal
                          </p>
                          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                            Acércate a nuestro mostrador con tu dispositivo y tu código de seguridad para que podamos recepcionarlo físicamente e iniciar su revisión técnica.
                          </p>
                        </div>
                      ) : (
                        <div className="p-6 rounded-xl bg-slate-900/70 border border-slate-800 text-center space-y-2">
                          <div className="w-10 h-10 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-sm font-semibold text-slate-200">
                            El equipo está siendo evaluado por nuestros técnicos.
                          </p>
                          <p className="text-xs text-slate-400">
                            Le notificaremos en cuanto el informe técnico y el presupuesto se encuentren listos.
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="space-y-5 text-xs">
                        {/* Técnico Asignado y Problema Reportado */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                              Técnico Asignado
                            </span>
                            <span className="text-xs font-bold text-cyan-300 font-mono mt-0.5 block truncate">
                              {diagData.tecnico_asignado || reparacion.tecnico || 'Técnico Especialista'}
                            </span>
                          </div>

                          <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                              Problema Reportado
                            </span>
                            <p className="text-xs text-slate-300 mt-0.5 truncate" title={reparacion.desc_cliente}>
                              {reparacion.desc_cliente || 'Sin descripción previa informada.'}
                            </p>
                          </div>
                        </div>

                        {/* Falla Detectada / Dictamen Técnico */}
                        <div>
                          <span className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            Falla Detectada & Resolución Propuesta
                          </span>
                          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs sm:text-sm leading-relaxed">
                            {diagData.descripcion_falla || 'Evaluación técnica completada.'}
                          </div>
                        </div>

                        {/* Insumos & Repuestos Presupuestados */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                              Repuestos & Materiales Requeridos
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {insumosData.length} ítem(s)
                            </span>
                          </div>

                          {insumosData.length === 0 ? (
                            <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/80 text-center text-slate-400 italic">
                              Esta orden no requiere consumo de repuestos físicos (solución por calibración o mano de obra).
                            </div>
                          ) : (
                            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/80 divide-y divide-slate-800/80">
                              {insumosData.map((item, idx) => (
                                <div key={item.id_detalle_insumo || idx} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/40 transition-colors">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-200 truncate">
                                      {item.nombre_producto || 'Repuesto / Insumo'}
                                    </p>
                                    <p className="text-[11px] text-slate-400 font-mono">
                                      Cantidad: <strong className="text-slate-300">{item.cantidad}</strong> • Unitario: ${Number(item.precio_unitario).toFixed(2)}
                                    </p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="font-mono font-bold text-slate-100 text-xs sm:text-sm">
                                      ${Number(item.subtotal || (Number(item.cantidad) * Number(item.precio_unitario))).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Desglose Económico y Costo Total Resaltado */}
                        <div className="p-5 rounded-xl bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-cyan-500/30 space-y-3">
                          <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
                            <span>Mano de Obra del Técnico:</span>
                            <span className="font-semibold">${costoManoObra.toFixed(2)}</span>
                          </div>
                          {insumosData.length > 0 && (
                            <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
                              <span>Subtotal Insumos / Repuestos:</span>
                              <span className="font-semibold">${costoInsumos.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-4">
                            <div>
                              <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-300 font-bold block">
                                Costo Total Estimado
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Presupuesto formal cerrado
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-3xl sm:text-4xl font-black text-cyan-400 font-mono tracking-tight drop-shadow-[0_2px_14px_rgba(6,182,212,0.45)]">
                                ${costoTotalEstimado.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tarjeta 2: Panel de Decisión Comercial (CU-09) - Condicional */}
                  {puedeTomarDecision && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[#1E293B] border-2 border-purple-500/40 rounded-2xl p-6 sm:p-7 shadow-[0_0_30px_rgba(139,92,246,0.18)] space-y-5"
                    >
                      <div className="border-b border-slate-700/60 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse" />
                          <h2 className="text-base font-bold text-white font-mono tracking-wide">
                            Decisión sobre la Reparación
                          </h2>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Su equipo se encuentra esperando su confirmación. Seleccione una opción para dar inicio a la reparación o cancelar la orden de servicio.
                        </p>
                      </div>

                      {/* Botones Principales Aceptar / Rechazar */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => setDecision(decision === 'ACEPTAR' ? null : 'ACEPTAR')}
                          className={`py-3.5 px-5 rounded-xl font-black text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                            decision === 'ACEPTAR'
                              ? 'bg-cyan-400 text-slate-950 shadow-[0_0_25px_rgba(6,182,212,0.5)] scale-[1.02] ring-2 ring-cyan-300'
                              : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 hover:border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                          }`}
                        >
                          <span>✅</span>
                          <span>ACEPTAR PRESUPUESTO</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDecision(decision === 'RECHAZAR' ? null : 'RECHAZAR')}
                          className={`py-3.5 px-5 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                            decision === 'RECHAZAR'
                              ? 'bg-rose-500 text-white shadow-[0_0_25px_rgba(244,63,94,0.5)] scale-[1.02] ring-2 ring-rose-300'
                              : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 hover:border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                          }`}
                        >
                          <span>❌</span>
                          <span>RECHAZAR</span>
                        </button>
                      </div>

                      {/* Formulario Dinámico Desplegable */}
                      <AnimatePresence>
                        {decision && (
                          <motion.form
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            onSubmit={handleEnviarDecision}
                            className="overflow-hidden"
                          >
                            {decision === 'ACEPTAR' ? (
                              <div className="p-5 rounded-xl bg-cyan-950/20 border border-cyan-500/40 space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                                    Confirmar Aceptación de Servicio
                                  </span>
                                  <span className="text-[11px] font-mono text-slate-400">Paso final de confirmación</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  {/* Selector Método de Entrega */}
                                  <div>
                                    <label className="block text-[11px] font-mono text-slate-300 uppercase tracking-wider mb-1.5 font-bold">
                                      Método de Entrega <span className="text-cyan-400">*</span>
                                    </label>
                                    <select
                                      value={metodoEntrega}
                                      onChange={(e) => setMetodoEntrega(e.target.value)}
                                      required
                                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                                    >
                                      <option value="RETIRO">Retiro en local / mostrador</option>
                                      <option value="ENVIO">Envío a domicilio</option>
                                    </select>
                                  </div>

                                  {/* Selector Dinámico de Método de Pago desde Base de Datos */}
                                  <div>
                                    <label className="block text-[11px] font-mono text-slate-300 uppercase tracking-wider mb-1.5 font-bold">
                                      Método de Pago <span className="text-cyan-400">*</span>
                                    </label>
                                    <select
                                      value={idMedioSeleccionado || ''}
                                      onChange={(e) => setIdMedioSeleccionado(e.target.value)}
                                      required
                                      disabled={cargandoMediosPago || mediosPago.length === 0}
                                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors disabled:opacity-50"
                                    >
                                      {cargandoMediosPago ? (
                                        <option value="">Cargando medios de pago...</option>
                                      ) : mediosPagoDiagnostico.length === 0 ? (
                                        <option value="">Sin medios de pago digitales habilitados</option>
                                      ) : (
                                        mediosPagoDiagnostico.map((medio) => (
                                          <option
                                            key={medio.id_mediopago}
                                            value={medio.id_mediopago}
                                            className="text-slate-100 bg-slate-900"
                                          >
                                            {medio.nombre_medio_pago}
                                            {Number(medio.recargo) > 0
                                              ? ` (+${Number(medio.recargo)}%)`
                                              : ''}
                                          </option>
                                        ))
                                      )}
                                    </select>
                                    {errorMediosPago && (
                                      <p className="text-[10px] text-rose-400 font-mono mt-1">
                                        {errorMediosPago}
                                      </p>
                                    )}
                                    {metodoEntrega === 'ENVIO' && (
                                      <p className="text-[10px] text-amber-400/90 font-mono mt-1.5 flex items-center gap-1">
                                        <span>ℹ️</span>
                                        <span>Los envíos a domicilio requieren un medio de pago electrónico o bancario habilitado.</span>
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Comentarios Adicionales */}
                                <div>
                                  <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                                    Comentarios o aclaraciones adicionales (Opcional)
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={comentariosCliente}
                                    onChange={(e) => setComentariosCliente(e.target.value)}
                                    placeholder="Ej: Prefiero retirar por la tarde, coordinar antes de despachar..."
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                                  />
                                </div>

                                {/* Botones de acción */}
                                <div className="flex items-center justify-end gap-3 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => setDecision(null)}
                                    disabled={isSubmitting}
                                    className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    Cancelar
                                  </button>

                                  <button
                                    type="submit"
                                    disabled={
                                      isSubmitting ||
                                      cargandoMediosPago ||
                                      !metodoEntrega ||
                                      !medioSeleccionado ||
                                      medioSeleccionado.deshabilitado
                                    }
                                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-black text-xs font-mono tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                                  >
                                    {isSubmitting ? (
                                      <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v2m0 12v2m8-8h-2M6 12H4m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414" />
                                        </svg>
                                        <span>Procesando transacción...</span>
                                      </>
                                    ) : (
                                      <span>Confirmar Reparación</span>
                                    )}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-5 rounded-xl bg-rose-950/25 border border-rose-500/40 space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-mono font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                                    Confirmar Rechazo del Presupuesto
                                  </span>
                                  <span className="text-[11px] font-mono text-slate-400">Cancelación del servicio</span>
                                </div>

                                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/20 text-rose-200 text-xs">
                                  ⚠️ <strong>Aviso:</strong> Al rechazar el presupuesto, la orden de reparación pasará al estado <strong>Cancelado</strong> y los técnicos detendrán los trabajos sobre el equipo.
                                </div>

                                <div>
                                  <label className="block text-[11px] font-mono text-slate-300 uppercase tracking-wider mb-1.5 font-bold">
                                    ¿Por qué rechaza el presupuesto? (Opcional)
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={comentariosCliente}
                                    onChange={(e) => setComentariosCliente(e.target.value)}
                                    placeholder="Ej: El presupuesto excede lo esperado, prefiero retirar el equipo..."
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs placeholder:text-slate-500 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 transition-colors"
                                  />
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => setDecision(null)}
                                    disabled={isSubmitting}
                                    className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    Volver
                                  </button>

                                  <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(244,63,94,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                                  >
                                    {isSubmitting ? (
                                      <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v2m0 12v2m8-8h-2M6 12H4m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414" />
                                        </svg>
                                        <span>Procesando cancelación...</span>
                                      </>
                                    ) : (
                                      <span>Confirmar Cancelación</span>
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* Tarjeta 3: Calificación (CU-19 y CU-51) */}
                  {reparacion.calificacion ? (
                    <div className="bg-[#1E293B] border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-3">
                      <div className="border-b border-slate-700/60 pb-3 flex items-center justify-between">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          Calificación del Cliente
                        </h2>
                        <span className="text-[11px] font-mono text-slate-400">
                          {formatearFecha(reparacion.calificacion.fecha)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-base text-amber-400">
                        <span>{'★'.repeat(reparacion.calificacion.puntuacion || 0)}</span>
                        <span className="text-xs font-mono text-slate-300 font-bold">
                          {reparacion.calificacion.puntuacion} / 5
                        </span>
                      </div>

                      {reparacion.calificacion.comentario && (
                        <p className="text-xs text-slate-300 italic bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                          &ldquo;{reparacion.calificacion.comentario}&rdquo;
                        </p>
                      )}
                    </div>
                  ) : (
                    /* Si la reparación está en estado ENTREGADO y aún no tiene calificación, permitir calificar */
                    reparacion.etapa === 'ENTREGADO' && !esPersonalTecnico && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gradient-to-r from-amber-950/30 via-[#1E293B] to-slate-900 border border-amber-500/40 rounded-2xl p-6 shadow-xl space-y-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 text-lg">
                            ⭐
                          </div>
                          <div>
                            <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                              ¿Qué te pareció el servicio técnico?
                            </h2>
                            <p className="text-xs text-slate-300">
                              Tu equipo ya ha sido entregado. Valora la reparación, ¡te lo agradeceremos mucho!
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setModalCalificarAbierto(true)}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs font-mono tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(245,158,11,0.35)] flex items-center gap-2 cursor-pointer"
                          >
                            <span>Calificar Servicio</span>
                            <span>⭐</span>
                          </button>
                        </div>
                      </motion.div>
                    )
                  )}

                </div>

                {/* ================= COLUMNA DERECHA: LA BITÁCORA (TIMELINE) ================= */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-7 shadow-xl space-y-6">
                  <div className="border-b border-slate-700/60 pb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                      Línea de Tiempo (Bitácora Técnica)
                    </h2>
                    <span className="text-xs font-mono text-cyan-400">
                      {bitacora.length} registro(s)
                    </span>
                  </div>

                  {bitacora.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs italic">
                      Aún no hay actualizaciones asentadas en la bitácora de esta reparación.
                    </div>
                  ) : (
                    <div className="relative pl-7 space-y-6 before:content-[''] before:absolute before:left-2 before:top-3 before:bottom-3 before:w-[2px] before:bg-gradient-to-b before:from-cyan-500/40 before:via-slate-700 before:to-slate-800">
                      {(() => {
                        const indiceActualBitacora = bitacora.reduce((ultimoIdx, itemActual, idxActual, arr) => {
                          const idAct = Number(itemActual?.id_bitacora);
                          const idUlt = Number(arr[ultimoIdx]?.id_bitacora);
                          if (!Number.isNaN(idAct) && !Number.isNaN(idUlt) && idAct !== idUlt) {
                            return idAct > idUlt ? idxActual : ultimoIdx;
                          }
                          return idxActual;
                        }, 0);

                        return bitacora.map((item, index) => {
                          const esUltimo = index === indiceActualBitacora;
                          const regAnterior = index > 0 ? bitacora[index - 1] : null;
                          const estadoAnterior =
                            regAnterior?.estado_nombre ||
                            regAnterior?.estado_alcanzado_nombre ||
                            regAnterior?.estado_alcanzado ||
                            null;
                          const estadoNombre =
                            item.estado_nombre || item.estado_alcanzado_nombre || 'Actualización técnica';
                          const resumenEjecutivo = obtenerResumenCortoBitacora(item, estadoAnterior);

                        return (
                          <div key={item.id_bitacora || index} className="relative group">
                            {/* Punto / Nodo en la línea */}
                            <div
                              className={`absolute -left-[25px] top-2.5 w-3.5 h-3.5 rounded-full border-2 transition-all ${
                                esUltimo
                                  ? 'bg-cyan-400 border-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.6)] scale-110 ring-4 ring-cyan-500/20'
                                  : 'bg-slate-900 border-slate-600 group-hover:border-slate-400'
                              }`}
                            />

                            {/* Contenido resumido del evento */}
                            <div
                              className={`p-4 rounded-xl border text-xs transition-all ${
                                esUltimo
                                  ? 'bg-slate-900/90 border-cyan-500/35 shadow-md'
                                  : 'bg-slate-900/50 border-slate-800/90 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-md border ${obtenerColorBadgeEstado(
                                      estadoNombre,
                                      esUltimo
                                    )}`}
                                  >
                                    {formatearEstadoReparacion(estadoNombre)}
                                  </span>
                                  {esUltimo && (
                                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                                      Estado actual
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-[11px] text-slate-400">
                                  {item.fecha_hora_display || item.fecha_hora || '—'}
                                </span>
                              </div>

                              <p className="text-slate-200 font-medium text-xs leading-relaxed">
                                {resumenEjecutivo}
                              </p>

                              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                                {item.tecnico ? (
                                  <span className="text-[10px] font-mono text-slate-400">
                                    Registrado por: <span className="text-slate-300 font-medium">{item.tecnico}</span>
                                    {item.rol_usuario && (
                                      <span className="ml-1.5 text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                        {item.rol_usuario}
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono text-slate-500">Evento de sistema</span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setRegistroInspeccion(item)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-slate-800/90 hover:bg-cyan-500/15 text-cyan-400 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500/40 transition-all cursor-pointer"
                                  title="Inspeccionar análisis completo de este evento, evidencias fotográficas y pagos"
                                >
                                  <span>🔍</span>
                                  <span>Inspeccionar análisis</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                        });
                      })()}
                    </div>
                  )}
                </div>

              </div>
            </motion.div>
          )}
        </main>
      </div>

      {/* Modal Calificar Servicio Técnico (CU-19) */}
      <CalificarServicioModal
        isOpen={modalCalificarAbierto}
        onClose={() => setModalCalificarAbierto(false)}
        reparacion={reparacion}
        onSuccess={(nuevaCalificacion) => {
          setSuccessMessage('¡Muchas gracias por su calificación y retroalimentación!');
          setReparacion((prev) => (prev ? { ...prev, calificacion: nuevaCalificacion } : prev));
        }}
      />

      {/* Modal reutilizable del medio de pago seleccionado al aceptar el presupuesto */}
      <PaymentMethodModalDispatcher
        isOpen={modalPagoPresupuesto.abierto}
        onClose={() =>
          setModalPagoPresupuesto((prev) => ({ ...prev, abierto: false }))
        }
        medioPago={modalPagoPresupuesto.medioPago}
        idVenta={modalPagoPresupuesto.idVenta}
        montoTotal={modalPagoPresupuesto.montoTotal}
        concepto={`Presupuesto de Reparación • ${reparacion?.dispositivo?.marca || ''} ${reparacion?.dispositivo?.modelo || ''}`.trim()}
        codigoSeguridad={reparacion?.codigo_seguridad || reparacion?.codigo_sec || null}
        permitirContinuarPendiente={true}
        textoBotonPendiente="Continuar y abonar al retirar el equipo"
        textoConfirmar="Confirmar compromiso de pago"
        onPagoConfirmado={async () => {
          setModalPagoPresupuesto((prev) => ({ ...prev, abierto: false }));
          setSuccessMessage('¡Pago confirmado exitosamente! Tu reparación ya se encuentra en curso.');
          await cargarDetalle();
        }}
        onContinuarPendiente={() => {
          setModalPagoPresupuesto((prev) => ({ ...prev, abierto: false }));
        }}
      />

      {/* Modal de Checkout Virtual para abonar el Diagnóstico Inicial (mismo flujo y diseño que el Carrito) */}
      <CheckoutDiagnosticoModal
        isOpen={modalPagoDiagnostico.abierto}
        onClose={() =>
          setModalPagoDiagnostico((prev) => ({ ...prev, abierto: false }))
        }
        reparacion={reparacion}
        montoDiagnostico={modalPagoDiagnostico.montoTotal || montoDiagnostico}
        medioPagoInicial={modalPagoDiagnostico.medioPago || medioDiagSeleccionado}
        onPagoCompletado={async () => {
          setModalPagoDiagnostico((prev) => ({ ...prev, abierto: false }));
          setSuccessMessage(
            '¡Pago de diagnóstico acreditado con éxito! Tu dispositivo ya se encuentra en fila para evaluación técnica.'
          );
          await cargarDetalle();
        }}
      />

      {/* Modal Inspección Detallada de Bitácora y Evidencias */}
      <DetalleBitacoraModal
        isOpen={Boolean(registroInspeccion)}
        onClose={() => setRegistroInspeccion(null)}
        registro={registroInspeccion}
        reparacion={reparacion}
        imagenesRespaldo={reparacion?.imagenes_recepcion || []}
      />
    </div>
  );
}
