import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { formatearMoneda, obtenerImagenProducto } from '../../utils/productImages';
import DireccionModal from '../geo/DireccionModal';
import { QRCodeSVG } from 'qrcode.react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// =============================================================================
// REGLAS DE VALIDACIÓN ESTRICTAS (IDÉNTICAS AL REGISTRO Y ADUANA BACKEND)
// =============================================================================
const REGEX_LETRAS = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/;
const REGEX_DNI = /^\d{7,11}$/;
const REGEX_TELEFONO = /^\+?\d{9,15}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// =============================================================================
// SUBCOMPONENTE AISLADO: RELOJ TEMPORIZADOR DE RESERVA (0 RE-RENDERS AL MODAL)
// Sincronizado estrictamente con la hora oficial del sistema (Wall-Clock Time)
// =============================================================================
function TemporizadorReservaModal({ segundosIniciales = 1800, onExpirado }) {
  const tiempoFinRef = useRef(Date.now() + Math.max(0, segundosIniciales) * 1000);
  const [segundos, setSegundos] = useState(Math.max(0, segundosIniciales));

  useEffect(() => {
    tiempoFinRef.current = Date.now() + Math.max(0, segundosIniciales) * 1000;
    setSegundos(Math.max(0, segundosIniciales));
  }, [segundosIniciales]);

  useEffect(() => {
    const calcularRestante = () => {
      const difMs = tiempoFinRef.current - Date.now();
      return Math.max(0, Math.ceil(difMs / 1000));
    };

    const sincronizarTiempo = () => {
      const segs = calcularRestante();
      setSegundos(segs);
      if (segs <= 0 && onExpirado) {
        onExpirado();
      }
    };

    sincronizarTiempo();
    const timer = setInterval(sincronizarTiempo, 1000);

    // Eventos para sincronizar de inmediato al salir y volver de WhatsApp o de otra pestaña
    const handleVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        sincronizarTiempo();
      }
    };
    const handleFocus = () => {
      sincronizarTiempo();
    };

    document.addEventListener('visibilitychange', handleVisibilidad);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilidad);
      window.removeEventListener('focus', handleFocus);
    };
  }, [onExpirado]);

  return (
    <div className="max-w-md mx-auto p-3.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 flex items-center justify-between text-xs shadow-md">
      <div className="flex items-center gap-2 text-slate-300">
        <span className="text-base">⏱️</span>
        <div>
          <p className="font-bold text-white leading-tight">Stock apartado temporalmente</p>
          <p className="text-[11px] text-slate-400">Tu reserva se mantendrá activa durante:</p>
        </div>
      </div>
      <div className="text-right">
        <span
          className={`font-mono font-black text-base tracking-widest ${
            segundos <= 300 ? 'text-rose-400 font-bold' : 'text-cyan-400'
          }`}
        >
          {String(Math.floor(segundos / 60)).padStart(2, '0')}:
          {String(segundos % 60).padStart(2, '0')}
        </span>
        <p className="text-[10px] text-slate-500 uppercase font-mono">Minutos</p>
      </div>
    </div>
  );
}

export default function CheckoutModal({
  isOpen,
  onClose,
  itemsCarrito = [],
  montoSubtotal = 0,
  onCompraCompletada,
  onOrdenCancelada,
  ordenParaRetomar = null,
  onOrdenCerradaConPendiente = null,
  onRetornarAlCarrito = null
}) {
  const { user, token, updateUser } = useAuth();

  // ---------------------------------------------------------------------------
  // Estados del Flujo (Pasos del Checkout)
  // ---------------------------------------------------------------------------
  // 1: Facturación, 2: Entrega, 3: Pago, 4: Revisión, 5: Éxito
  const [pasoActual, setPasoActual] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiadoExito, setCopiadoExito] = useState(false);

  // Sincronización fresca del carrito con la base de datos para evitar desajustes
  const [itemsLocales, setItemsLocales] = useState(Array.isArray(itemsCarrito) ? itemsCarrito : []);
  const [subtotalLocal, setSubtotalLocal] = useState(Number(montoSubtotal || 0));
  const [sincronizandoCarritoServidor, setSincronizandoCarritoServidor] = useState(false);

  useEffect(() => {
    if (Array.isArray(itemsCarrito)) {
      setItemsLocales(itemsCarrito);
    }
    if (montoSubtotal !== undefined) {
      setSubtotalLocal(Number(montoSubtotal || 0));
    }
  }, [itemsCarrito, montoSubtotal]);

  const sincronizarCarritoConServidor = useCallback(async () => {
    if (!token) return;
    setSincronizandoCarritoServidor(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/sales/carrito/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setItemsLocales(Array.isArray(res.data.items) ? res.data.items : []);
        setSubtotalLocal(Number(res.data.monto_subtotal || 0));
      }
    } catch (err) {
      console.warn('No se pudo verificar el carrito con el servidor:', err);
    } finally {
      setSincronizandoCarritoServidor(false);
    }
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      sincronizarCarritoConServidor();
    }
  }, [isOpen, sincronizarCarritoConServidor]);

  useEffect(() => {
    if (pasoActual === 4 && isOpen) {
      sincronizarCarritoConServidor();
    }
  }, [pasoActual, isOpen, sincronizarCarritoConServidor]);

  // ---------------------------------------------------------------------------
  // Paso 1: Datos de Facturación (Mismos campos y validaciones que en Registro)
  // ---------------------------------------------------------------------------
  const [facturacion, setFacturacion] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    telefono: '',
    email: ''
  });

  const [erroresCampos, setErroresCampos] = useState({});
  const [camposTocados, setCamposTocados] = useState({});

  // Sincronizar datos del usuario autenticado al abrir o actualizar
  const estaRegistrado = Boolean(user && user.email);

  // Detección granular de qué datos ya posee la cuenta del usuario
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


  // ---------------------------------------------------------------------------
  // Paso 2: Método de Entrega y Direcciones
  // ---------------------------------------------------------------------------
  const [metodoEntrega, setMetodoEntrega] = useState('RETIRO'); // 'RETIRO' o 'ENVIO'
  const [direcciones, setDirecciones] = useState([]);
  const [cargandoDirecciones, setCargandoDirecciones] = useState(false);
  const [direccionSeleccionadaId, setDireccionSeleccionadaId] = useState(null);
  const [errorDireccion, setErrorDireccion] = useState('');
  const [modalNuevaDireccionAbierto, setModalNuevaDireccionAbierto] = useState(false);
  const [costoEnvioEstimado, setCostoEnvioEstimado] = useState(0);
  const [detalleTarifaEnvio, setDetalleTarifaEnvio] = useState(null);
  const [cargandoCostoEnvio, setCargandoCostoEnvio] = useState(false);

  // ---------------------------------------------------------------------------
  // Paso 3: Medio de Pago
  // ---------------------------------------------------------------------------
  const [mediosPago, setMediosPago] = useState([]);
  const [cargandoMediosPago, setCargandoMediosPago] = useState(false);
  const [medioPagoSeleccionadoId, setMedioPagoSeleccionadoId] = useState(null);
  const [errorMedioPago, setErrorMedioPago] = useState('');

  // ---------------------------------------------------------------------------
  // Paso 5: Resultado de la Venta
  // ---------------------------------------------------------------------------
  const [resultadoVenta, setResultadoVenta] = useState(null);

  // Estados de Integración Mercado Pago Automatizada
  const [mpPreferencia, setMpPreferencia] = useState(null);
  const [esperandoPagoMP, setEsperandoPagoMP] = useState(false);
  const [verificandoPagoMP, setVerificandoPagoMP] = useState(false);
  const [tiempoExpirado, setTiempoExpirado] = useState(false);
  const [cancelandoOrden, setCancelandoOrden] = useState(false);
  const [mostrarConfirmacionRetorno, setMostrarConfirmacionRetorno] = useState(false);
  const [descargandoFactura, setDescargandoFactura] = useState(false);

  // Auto-ocultar alertas temporales a los 15 segundos
  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(''), 15000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  // ---------------------------------------------------------------------------
  // Función Validadora por Campo (Reutiliza Reglas de Registro y Aduana)
  // ---------------------------------------------------------------------------
  const validarCampo = useCallback((nombreCampo, valor) => {
    const val = String(valor || '').trim();

    switch (nombreCampo) {
      case 'nombre':
        if (!val) {
          return 'El nombre es obligatorio. Ejemplo: Juan';
        }
        if (val.length < 2) {
          return 'El nombre debe tener al menos 2 letras. Ejemplo: Juan';
        }
        if (!REGEX_LETRAS.test(val)) {
          return 'El nombre solo debe contener letras (no se permiten números ni símbolos). Ejemplo: Juan';
        }
        return '';

      case 'apellido':
        if (!val) {
          return 'El apellido es obligatorio. Ejemplo: Rodriguez';
        }
        if (val.length < 2) {
          return 'El apellido debe tener al menos 2 letras. Ejemplo: Rodriguez';
        }
        if (!REGEX_LETRAS.test(val)) {
          return 'El apellido solo debe contener letras (no se permiten números ni símbolos). Ejemplo: Rodriguez';
        }
        return '';

      case 'dni':
        if (!val) {
          return 'El DNI / documento fiscal es obligatorio. Ejemplo: 38945612';
        }
        if (!/^\d+$/.test(val)) {
          return 'El DNI debe contener única y exclusivamente dígitos numéricos. Ejemplo: 38945612';
        }
        if (val.length < 7 || val.length > 11) {
          return 'El DNI debe tener entre 7 y 11 dígitos numéricos sin puntos ni guiones. Ejemplo: 38945612';
        }
        return '';

      case 'telefono':
        if (!val) {
          return 'El número de teléfono es obligatorio. Ejemplo: +5491145678901 o 1145678901';
        }
        const telLimpio = val.replace(/\s+/g, '');
        if (!REGEX_TELEFONO.test(telLimpio)) {
          return 'El teléfono debe contener entre 9 y 15 dígitos numéricos (puede iniciar con +). Ejemplo: +5491145678901';
        }
        return '';

      case 'email':
        if (!val) {
          return 'El correo electrónico es obligatorio. Ejemplo: cliente@ifixpos.com';
        }
        if (!REGEX_EMAIL.test(val)) {
          return 'El formato de correo no es válido. Ejemplo: cliente@ifixpos.com';
        }
        return '';

      default:
        return '';
    }
  }, []);

  // Manejo de cambio en los inputs con validación en tiempo real si ya fue tocado
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Filtros de teclado amigables (mismos que en RegisterScreen)
    if (name === 'dni' && value !== '' && !/^\d+$/.test(value)) {
      return; // No permitir letras en DNI
    }
    if ((name === 'nombre' || name === 'apellido') && value !== '' && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]*$/.test(value)) {
      return; // No permitir números en Nombre o Apellido
    }

    setFacturacion((prev) => ({
      ...prev,
      [name]: value
    }));

    // Si el campo ya tiene error o fue tocado, revalidar reactivamente
    if (camposTocados[name] || erroresCampos[name]) {
      const err = validarCampo(name, value);
      setErroresCampos((prev) => ({
        ...prev,
        [name]: err
      }));
    }
  };

  const handleInputBlur = (e) => {
    const { name, value } = e.target;
    setCamposTocados((prev) => ({ ...prev, [name]: true }));
    const err = validarCampo(name, value);
    setErroresCampos((prev) => ({
      ...prev,
      [name]: err
    }));
  };

  // ---------------------------------------------------------------------------
  // Carga de Direcciones del Cliente
  // ---------------------------------------------------------------------------
  const cargarDirecciones = useCallback(async () => {
    if (!token) return;
    setCargandoDirecciones(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/geo/mis-direcciones/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const lista = Array.isArray(res.data) ? res.data : [];
      setDirecciones(lista);

      if (lista.length > 0) {
        setDireccionSeleccionadaId((prev) => prev || lista[0].id_direccion);
        setErrorDireccion('');
      }
    } catch (err) {
      console.warn('No se pudieron obtener las direcciones del usuario:', err);
    } finally {
      setCargandoDirecciones(false);
    }
  }, [token]);

  // ---------------------------------------------------------------------------
  // Carga de Medios de Pago Activos
  // ---------------------------------------------------------------------------
  const cargarMediosPago = useCallback(async () => {
    if (!token) return;
    setCargandoMediosPago(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/sales/medios-pago/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const lista = Array.isArray(res.data) ? res.data : [];
      setMediosPago(lista);

      if (lista.length > 0) {
        setMedioPagoSeleccionadoId((prev) => prev || lista[0].id_mediopago);
        setErrorMedioPago('');
      }
    } catch (err) {
      console.warn('No se pudieron cargar los medios de pago:', err);
      const fallback = [
        { id_mediopago: 1, nombre_medio_pago: 'Transferencia Bancaria', estado: true },
        { id_mediopago: 2, nombre_medio_pago: 'Efectivo en Mostrador', estado: true }
      ];
      setMediosPago(fallback);
      setMedioPagoSeleccionadoId((prev) => prev || fallback[0].id_mediopago);
    } finally {
      setCargandoMediosPago(false);
    }
  }, [token]);

  // ---------------------------------------------------------------------------
  // Cotización Oficial del Costo de Envío según Configuración del Sistema
  // ---------------------------------------------------------------------------
  const cargarCostoEnvio = useCallback(async (idDir = null) => {
    setCargandoCostoEnvio(true);
    try {
      const url = idDir
        ? `${API_BASE_URL}/api/sales/compras/costo-envio/?id_direccion=${idDir}`
        : `${API_BASE_URL}/api/sales/compras/costo-envio/`;
      const res = await axios.get(url);
      if (res.data) {
        setCostoEnvioEstimado(Number(res.data.costo || 0));
        setDetalleTarifaEnvio(res.data);
      }
    } catch (err) {
      console.warn('Inconveniente al cotizar flete según configuración:', err);
    } finally {
      setCargandoCostoEnvio(false);
    }
  }, []);

  useEffect(() => {
    if (metodoEntrega === 'ENVIO') {
      cargarCostoEnvio(direccionSeleccionadaId);
    } else {
      setCostoEnvioEstimado(0);
    }
  }, [metodoEntrega, direccionSeleccionadaId, cargarCostoEnvio]);

  useEffect(() => {
    if (isOpen) {
      if (ordenParaRetomar) {
        setResultadoVenta(ordenParaRetomar);
        setEsperandoPagoMP(true);
        setTiempoExpirado(Boolean(ordenParaRetomar.segundos_restantes !== undefined && ordenParaRetomar.segundos_restantes <= 0));
        setMpPreferencia({
          init_point: ordenParaRetomar.init_point,
          preference_id: ordenParaRetomar.preference_id
        });
        setPasoActual(4);
      } else {
        cargarDirecciones();
        cargarMediosPago();
        cargarCostoEnvio(direccionSeleccionadaId);
        setPasoActual(1);
        setEsperandoPagoMP(false);
        setMpPreferencia(null);
        setResultadoVenta(null);
        setTiempoExpirado(false);
      }

      setErroresCampos({});
      setCamposTocados({});
      setErrorDireccion('');
      setErrorMedioPago('');
    } else {
      setPasoActual(1);
      setErrorMessage('');
      setResultadoVenta(null);
      setErroresCampos({});
      setCamposTocados({});
      setEsperandoPagoMP(false);
      setMpPreferencia(null);
      setTiempoExpirado(false);
    }
  }, [isOpen, ordenParaRetomar?.id_venta]);

  // ---------------------------------------------------------------------------
  // Cálculos Financieros
  // ---------------------------------------------------------------------------
  const costoEnvioFinal = metodoEntrega === 'ENVIO' ? Number(costoEnvioEstimado || 0) : 0;
  const montoTotalFinal = Number(subtotalLocal || 0) + costoEnvioFinal;

  // Total exacto de la orden a mostrar en pantalla de espera de Mercado Pago (sin depender del carrito vaciado)
  const totalEsperandoMP = useMemo(() => {
    if (resultadoVenta) {
      const tot = Number(resultadoVenta.total ?? resultadoVenta.monto_total ?? 0);
      if (tot > 0) return tot;
      const sub = Number(resultadoVenta.monto_subtotal || 0);
      const env = Number(resultadoVenta.costo_envio || 0);
      if (sub + env > 0) return sub + env;
    }
    return montoTotalFinal > 0 ? montoTotalFinal : Number(subtotalLocal || 0) + Number(costoEnvioEstimado || 0);
  }, [resultadoVenta, montoTotalFinal, subtotalLocal, costoEnvioEstimado]);

  const direccionSeleccionada = useMemo(() => {
    return direcciones.find((d) => d.id_direccion === direccionSeleccionadaId) || null;
  }, [direcciones, direccionSeleccionadaId]);

  const medioPagoSeleccionado = useMemo(() => {
    return mediosPago.find((m) => m.id_mediopago === medioPagoSeleccionadoId) || null;
  }, [mediosPago, medioPagoSeleccionadoId]);

  // ---------------------------------------------------------------------------
  // Validación de Datos de Facturación (Exclusivo para la Compra)
  // ---------------------------------------------------------------------------
  const handleValidarDatosFacturacion = () => {
    // Validar todos los campos del Paso 1
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
    setCamposTocados({
      nombre: true,
      apellido: true,
      dni: true,
      telefono: true,
      email: true
    });

    const hayErrores = Object.values(nuevosErrores).some((e) => Boolean(e));
    if (hayErrores) {
      setErrorMessage('Por favor revisa los campos señalados con error para continuar.');
      return false;
    }

    return true;
  };

  // ---------------------------------------------------------------------------
  // Avance de Pasos con Validación y Persistencia Selectiva
  // ---------------------------------------------------------------------------
  const handleAvanzarPaso = async () => {
    setErrorMessage('');

    // Validación Paso 1: Facturación
    if (pasoActual === 1) {
      // 1. Validar rigurosamente los campos del formulario
      const ok = handleValidarDatosFacturacion();
      if (!ok) return;

      // 2. Determinar si el usuario acaba de completar campos que faltaban en su cuenta
      const completoNombre = !tieneNombre && Boolean(facturacion.nombre.trim());
      const completoApellido = !tieneApellido && Boolean(facturacion.apellido.trim());
      const completoDni = !tieneDni && Boolean(facturacion.dni.trim());
      const completoTelefono = !tieneTelefono && Boolean(facturacion.telefono.trim());

      const requiereGuardarEnCuenta = completoNombre || completoApellido || completoDni || completoTelefono;

      // Si la cuenta ya tenía todos los datos completos, NO se permite editar el perfil ni se altera la cuenta
      if (!requiereGuardarEnCuenta) {
        setPasoActual(2);
        return;
      }

      // Si había campos faltantes y fueron completados, los guardamos de forma segura en la cuenta
      setIsSubmitting(true);
      try {
        const payload = {
          nombre: (facturacion.nombre || user?.nombre || '').trim(),
          apellido: (facturacion.apellido || user?.apellido || '').trim(),
          email: (user?.email || facturacion.email || '').trim(),
          telefono: (facturacion.telefono || user?.telefono || '').trim().replace(/\s+/g, ''),
          dni: (facturacion.dni || user?.dni || '').trim() || null,
          telefono_alt: user?.telefono_alt || null,
          foto_perfil: user?.foto_perfil || null
        };

        const res = await axios.put(`${API_BASE_URL}/api/auth/perfil/editar/`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (updateUser) {
          updateUser({
            ...user,
            ...res.data,
            perfil_completo: true
          });
        }

        setPasoActual(2);
      } catch (err) {
        console.error('Error al registrar datos faltantes en la cuenta:', err);
        const dataErr = err.response?.data;
        const msg = typeof dataErr === 'string'
          ? dataErr
          : dataErr?.detail || dataErr?.error || dataErr?.dni?.[0] || dataErr?.nombre?.[0] || dataErr?.apellido?.[0] || dataErr?.telefono?.[0];
        setErrorMessage(msg || 'No pudimos registrar los datos faltantes en tu cuenta. Verifica el formato e intenta nuevamente.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Validación Paso 2: Entrega
    if (pasoActual === 2) {
      if (metodoEntrega === 'ENVIO') {
        if (!direccionSeleccionadaId) {
          setErrorDireccion('Debes seleccionar una dirección de tu libreta o registrar una nueva. Ejemplo: Selecciona tu domicilio o pulsa "+ Agregar Nueva Dirección".');
          setErrorMessage('Por favor selecciona o registra una dirección de entrega a domicilio.');
          return;
        }
      }
      setErrorDireccion('');
      setPasoActual(3);
      return;
    }

    // Validación Paso 3: Pago
    if (pasoActual === 3) {
      if (!medioPagoSeleccionadoId) {
        setErrorMedioPago('Debes seleccionar un canal de pago habilitado. Ejemplo: Haz clic sobre "Transferencia Bancaria" o "Efectivo en Mostrador".');
        setErrorMessage('Por favor selecciona un método de pago para continuar.');
        return;
      }
      setErrorMedioPago('');
      setPasoActual(4);
      return;
    }
  };

  const handleRetrocederPaso = () => {
    setErrorMessage('');
    setPasoActual((prev) => Math.max(1, prev - 1));
  };

  const handleNuevaDireccionGuardada = (direccionGuardada) => {
    setModalNuevaDireccionAbierto(false);
    cargarDirecciones();
    if (direccionGuardada?.id_direccion) {
      setDireccionSeleccionadaId(direccionGuardada.id_direccion);
      setErrorDireccion('');
    }
  };

  // ---------------------------------------------------------------------------
  // Cancelación Segura de Orden en Curso y Restitución de Stock
  // ---------------------------------------------------------------------------
  const handleCancelarOrden = useCallback(async (motivo = 'usuario') => {
    if (!resultadoVenta?.id_venta || !token) return;
    setCancelandoOrden(true);
    setErrorMessage('');
    try {
      await axios.post(
        `${API_BASE_URL}/api/sales/compras/virtual/${resultadoVenta.id_venta}/cancelar/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setEsperandoPagoMP(false);
      setMpPreferencia(null);
      setResultadoVenta(null);
      setTiempoExpirado(false);
      setPasoActual(1);
      setMostrarConfirmacionRetorno(false);

      if (onOrdenCancelada) {
        try {
          await onOrdenCancelada(motivo === 'retorno_carrito');
        } catch (_) {}
      }

      if (motivo === 'retorno_carrito' && onRetornarAlCarrito) {
        try {
          onRetornarAlCarrito();
        } catch (_) {}
      }

      if (motivo === 'tiempo_expirado') {
        setErrorMessage('El tiempo de reserva de 30 minutos ha finalizado. Los repuestos han sido devueltos a tu carrito.');
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Error al cancelar la orden:', err);
      setErrorMessage('No pudimos cancelar la reserva en este momento.');
    } finally {
      setCancelandoOrden(false);
    }
  }, [resultadoVenta?.id_venta, token, onOrdenCancelada, onClose, onRetornarAlCarrito]);

  const handleExpirarReserva = useCallback(() => {
    setTiempoExpirado(true);
    handleCancelarOrden('tiempo_expirado');
  }, [handleCancelarOrden]);

  // ---------------------------------------------------------------------------
  // Sondeo (Polling) en Tiempo Real para Acreditación de Mercado Pago (Webhook)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!esperandoPagoMP || !resultadoVenta?.id_venta || !token) return;

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/sales/compras/virtual/${resultadoVenta.id_venta}/estado/`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.data?.pagada) {
          setEsperandoPagoMP(false);
          setResultadoVenta((prev) => ({ ...prev, estado_venta: 'PAGADA' }));
          setPasoActual(5);
          if (onCompraCompletada) {
            onCompraCompletada({ ...resultadoVenta, estado_venta: 'PAGADA' });
          }
        }
      } catch (err) {
        // Sondeo silencioso
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [esperandoPagoMP, resultadoVenta?.id_venta, token, onCompraCompletada]);

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
        setPasoActual(5);
      } else {
        setErrorMessage('Mercado Pago aún no reportó la acreditación. Si ya realizaste la transferencia o pago, aguarda unos instantes.');
      }
    } catch (err) {
      setErrorMessage('No pudimos verificar el estado de acreditación en este momento.');
    } finally {
      setVerificandoPagoMP(false);
    }
  };

  const handleSimularPagoMP = async () => {
    if (!resultadoVenta?.id_venta) return;
    setVerificandoPagoMP(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/sales/mercadopago/webhook/?data.id=SIMULADO-${resultadoVenta.id_venta}`,
        {
          type: 'payment',
          data: { id: `SIMULADO-${resultadoVenta.id_venta}` }
        }
      );
      setEsperandoPagoMP(false);
      setResultadoVenta((prev) => ({ ...prev, estado_venta: 'PAGADA' }));
      setPasoActual(5);
    } catch (err) {
      const res = await axios.get(
        `${API_BASE_URL}/api/sales/compras/virtual/${resultadoVenta.id_venta}/estado/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.pagada) {
        setEsperandoPagoMP(false);
        setPasoActual(5);
      }
    } finally {
      setVerificandoPagoMP(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Confirmación Final de la Compra (POST /api/sales/compras/virtual/)
  // ---------------------------------------------------------------------------
  const handleConfirmarCompra = async () => {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const payload = {
        metodo_entrega: metodoEntrega,
        metodo_pago: medioPagoSeleccionadoId,
        id_direccion_envio: metodoEntrega === 'ENVIO' ? direccionSeleccionadaId : null
      };

      const res = await axios.post(`${API_BASE_URL}/api/sales/compras/virtual/`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const datosVenta = res.data?.venta || res.data;
      setResultadoVenta(datosVenta);

      // Si el medio de pago seleccionado es Mercado Pago, generar la preferencia oficial
      const nombreMedio = String(medioPagoSeleccionado?.nombre_medio_pago || '').toLowerCase();
      const esMP = nombreMedio.includes('mercado') || nombreMedio.includes('mp');

      if (esMP) {
        try {
          const resPref = await axios.post(
            `${API_BASE_URL}/api/sales/mercadopago/crear-preferencia/`,
            { id_venta: datosVenta.id_venta },
            { headers: { Authorization: `Bearer ${token}` } }
          );

          setMpPreferencia(resPref.data);
          setEsperandoPagoMP(true);

          const urlPago = resPref.data.init_point || resPref.data.sandbox_init_point;
          if (urlPago && !resPref.data.modo_simulacion) {
            window.open(urlPago, '_blank', 'noopener,noreferrer');
          }
        } catch (prefErr) {
          console.warn('Inconveniente al generar preferencia de Mercado Pago:', prefErr);
          setErrorMessage('Tu orden fue registrada, pero hubo un detalle al conectar con Mercado Pago. Podrás abonarla luego.');
          setPasoActual(5);
          if (onCompraCompletada) {
            onCompraCompletada(datosVenta);
          }
        }
      } else {
        setPasoActual(5);
        if (onCompraCompletada) {
          onCompraCompletada(datosVenta);
        }
      }
    } catch (err) {
      console.error('Error al procesar la compra virtual:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || dataErr?.detail || dataErr?.mensaje;
      setErrorMessage(msg || 'Ocurrió un inconveniente al procesar tu compra. Revisa el stock disponible de tus artículos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopiarCodigo = () => {
    const cod = resultadoVenta?.codigo_sec || '';
    if (!cod) return;
    navigator.clipboard.writeText(cod);
    setCopiadoExito(true);
    setTimeout(() => setCopiadoExito(false), 2500);
  };

  const handleDescargarFactura = async () => {
    const idVenta = resultadoVenta?.id_venta || ordenParaRetomar?.id_venta;
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
      link.download = `Factura_${resultadoVenta?.codigo_sec || idVenta}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error('Error al descargar factura PDF:', err);
      setErrorMessage('No pudimos generar o visualizar la factura en este momento.');
    } finally {
      setDescargandoFactura(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 flex items-center justify-center p-3 sm:p-4 md:p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-3xl bg-[#0F172A] border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Cabecera del Checkout Cyber-Tech */}
        <div className="px-6 py-4 bg-[#1E293B]/90 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                Checkout Virtual
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 uppercase font-mono">
                  Compra Segura
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Concreta tu pedido y protege la garantía de tus repuestos
              </p>
            </div>
          </div>

          {pasoActual !== 5 && (
            <button
              type="button"
              disabled={isSubmitting || cancelandoOrden}
              onClick={() => {
                if (esperandoPagoMP && resultadoVenta?.id_venta) {
                  if (onOrdenCerradaConPendiente) {
                    onOrdenCerradaConPendiente(resultadoVenta);
                  }
                  onClose();
                } else {
                  onClose();
                }
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all disabled:opacity-30"
              title="Cerrar checkout"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Stepper Indicador de Pasos */}
        {pasoActual !== 5 && !esperandoPagoMP && (
          <div className="px-6 py-3 bg-slate-900/60 border-b border-slate-800/80 shrink-0">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {[
                { num: 1, label: 'Facturación' },
                { num: 2, label: 'Entrega' },
                { num: 3, label: 'Pago' },
                { num: 4, label: 'Revisión' }
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
                    <span className="hidden sm:inline truncate">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Alerta de Error Temporal (Fade-out 15s) */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
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
                  className="text-rose-400 hover:text-rose-200 text-xs"
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
          {/* PASO 1: DATOS FISCALES (CON VALIDACIÓN INDIVIDUAL Y EJEMPLOS)     */}
          {/* ================================================================= */}
          {pasoActual === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                  Información Fiscal del Comprador
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Los datos fiscales son exigidos para la emisión inmutable de la factura legal y comprobante de garantía.
                </p>
              </div>

              {/* Banner informativo de datos de registro utilizados */}
              {estaRegistrado && (
                <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-3 shadow-md ${
                  cuentaCompletada
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 shadow-emerald-950/20'
                    : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200 shadow-cyan-950/20'
                }`}>
                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                    cuentaCompletada
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  }`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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
                        : 'Los campos registrados están protegidos. Completa los campos faltantes (como DNI o Apellido) para facturar tu orden; se guardarán en tu cuenta para tus próximas compras.'}
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
                    <span className="text-[10px] text-slate-400">
                      {tieneNombre ? '🔒 Protegido' : 'Solo letras'}
                    </span>
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
                        ? 'bg-slate-900/80 border-rose-500/80 bg-rose-500/5 focus:border-rose-400 focus:ring-1 focus:ring-rose-400 text-white'
                        : 'bg-slate-900/80 border-slate-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-white'
                    }`}
                  />
                  {erroresCampos.nombre && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-0.5 leading-tight">
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
                    <span className="text-[10px] text-slate-400">
                      {tieneApellido ? '🔒 Protegido' : 'Solo letras'}
                    </span>
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
                        ? 'bg-slate-900/80 border-rose-500/80 bg-rose-500/5 focus:border-rose-400 focus:ring-1 focus:ring-rose-400 text-white'
                        : 'bg-slate-900/80 border-slate-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-white'
                    }`}
                  />
                  {erroresCampos.apellido && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-0.5 leading-tight">
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
                        ? 'bg-slate-900/80 border-rose-500/80 bg-rose-500/5 focus:border-rose-400 focus:ring-1 focus:ring-rose-400 text-white'
                        : 'bg-slate-900/80 border-cyan-500/40 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 text-white'
                    }`}
                  />
                  {erroresCampos.dni && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-0.5 leading-tight">
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
                    <span className="text-[10px] text-slate-400">
                      {tieneTelefono ? '🔒 Protegido' : '9 a 15 dígitos'}
                    </span>
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
                        ? 'bg-slate-900/80 border-rose-500/80 bg-rose-500/5 focus:border-rose-400 focus:ring-1 focus:ring-rose-400 text-white'
                        : 'bg-slate-900/80 border-slate-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-white'
                    }`}
                  />
                  {erroresCampos.telefono && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-0.5 leading-tight">
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
                        : erroresCampos.email
                        ? 'bg-slate-900/80 border-rose-500/80 bg-rose-500/5 focus:border-rose-400 focus:ring-1 focus:ring-rose-400 text-white'
                        : 'bg-slate-900/80 border-slate-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-white'
                    }`}
                  />
                  {erroresCampos.email && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-0.5 leading-tight">
                      <span>⚠️</span>
                      <span>{erroresCampos.email}</span>
                    </p>
                  )}
                </div>

              </div>

              <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-slate-300 text-xs flex items-center gap-3">
                <svg className="w-5 h-5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>
                  Los datos fiscales son validados contra las normas de registro de IFixPos y se emiten de forma inmutable en el comprobante fiscal.
                </span>
              </div>
            </motion.div>
          )}

          {/* ================================================================= */}
          {/* PASO 2: MODALIDAD DE ENTREGA                                      */}
          {/* ================================================================= */}
          {pasoActual === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  Selecciona la Modalidad de Entrega
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Puedes retirar sin costo en nuestra sede técnica o recibir tus repuestos a domicilio.
                </p>
              </div>

              {/* Selector de Modalidad */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Opción Retiro */}
                <div
                  onClick={() => {
                    setMetodoEntrega('RETIRO');
                    setErrorDireccion('');
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                    metodoEntrega === 'RETIRO'
                      ? 'bg-cyan-500/10 border-cyan-400 shadow-lg shadow-cyan-950/30'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase font-mono">
                      Gratis ($0)
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Retiro en Sede Central</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Retira en nuestro mostrador técnico de atención al cliente presentando tu código.
                    </p>
                  </div>
                  <div className="text-[11px] text-cyan-400 font-medium flex items-center gap-1.5 pt-2 border-t border-slate-800">
                    <span>✓ Disponible de inmediato tras el cobro</span>
                  </div>
                </div>

                {/* Opción Envío a Domicilio */}
                <div
                  onClick={() => setMetodoEntrega('ENVIO')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                    metodoEntrega === 'ENVIO'
                      ? 'bg-cyan-500/10 border-cyan-400 shadow-lg shadow-cyan-950/30'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-mono">
                      {costoEnvioEstimado > 0 ? formatearMoneda(costoEnvioEstimado) : 'Flete Configurado'}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Envío a Domicilio</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Despachamos tus artículos a través de nuestra red logística de distribución.
                    </p>
                  </div>
                  <div className="text-[11px] text-purple-400 font-medium flex items-center gap-1.5 pt-2 border-t border-slate-800">
                    <span>✓ Seguimiento y despacho protegido</span>
                  </div>
                </div>
              </div>

              {/* Si eligió Envío a Domicilio: Libreta de Direcciones */}
              {metodoEntrega === 'ENVIO' && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">
                        Dirección de Destino <span className="text-cyan-400">*</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalNuevaDireccionAbierto(true)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Agregar Nueva Dirección</span>
                    </button>
                  </div>

                  {errorDireccion && (
                    <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                      <span>⚠️</span>
                      <span>{errorDireccion}</span>
                    </div>
                  )}

                  {cargandoDirecciones ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Cargando direcciones registradas...
                    </div>
                  ) : direcciones.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 text-center space-y-3">
                      <p className="text-xs text-slate-400">
                        No posees ninguna dirección guardada en tu libreta.
                      </p>
                      <button
                        type="button"
                        onClick={() => setModalNuevaDireccionAbierto(true)}
                        className="py-2 px-4 rounded-xl bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs font-bold transition-all"
                      >
                        + Cargar Dirección de Entrega
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {direcciones.map((dir) => {
                        const seleccionada = dir.id_direccion === direccionSeleccionadaId;
                        const calleNumero = dir.calle_numero || dir.nro_calle || 'Sin calle';
                        const barrio = dir.barrio || dir.nombre_barrio || '';
                        const pisoDpto = [
                          dir.piso ? `Piso ${dir.piso}` : '',
                          dir.nro_dpto ? `Dpto ${dir.nro_dpto}` : ''
                        ].filter(Boolean).join(' • ');
                        const ciudadNombre = dir.ciudad_info?.nombre || dir.ciudad_detalle?.nombre || dir.ciudad || '';
                        const provinciaNombre = dir.ciudad_info?.provincia?.nombre || dir.ciudad_detalle?.provincia?.nombre || dir.provincia || '';

                        return (
                          <div
                            key={dir.id_direccion}
                            onClick={() => {
                              setDireccionSeleccionadaId(dir.id_direccion);
                              setErrorDireccion('');
                            }}
                            className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                              seleccionada
                                ? 'bg-cyan-500/15 border-cyan-400 shadow-md shadow-cyan-950/20'
                                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                  seleccionada ? 'border-cyan-400 bg-cyan-400' : 'border-slate-600'
                                }`}
                              >
                                {seleccionada && <div className="w-1.5 h-1.5 rounded-full bg-slate-950"></div>}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">
                                  {calleNumero}
                                  {pisoDpto ? `, ${pisoDpto}` : ''}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">
                                  {[barrio ? `B° ${barrio}` : '', ciudadNombre, provinciaNombre].filter(Boolean).join(', ')}
                                </p>
                              </div>
                            </div>
                            {dir.alias && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 shrink-0 font-medium">
                                {dir.alias}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ================================================================= */}
          {/* PASO 3: MÉTODO DE PAGO Y AVISO PCI-DSS                           */}
          {/* ================================================================= */}
          {pasoActual === 3 && (
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
                  Elige el canal de cobro para abonar tu orden de compra.
                </p>
              </div>

              {errorMedioPago && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{errorMedioPago}</span>
                </div>
              )}

              {/* Lista de Medios de Pago */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mediosPago.map((medio) => {
                  const seleccionado = medio.id_mediopago === medioPagoSeleccionadoId;
                  const nombre = medio.nombre_medio_pago || medio.nombre || 'Medio de Pago';
                  const esMP = nombre.toLowerCase().includes('mercado') || nombre.toLowerCase().includes('mp');
                  const esTransferencia = !esMP && nombre.toLowerCase().includes('transfer');
                  const esEfectivo = !esMP && nombre.toLowerCase().includes('efectivo');

                  return (
                    <div
                      key={medio.id_mediopago}
                      onClick={() => {
                        setMedioPagoSeleccionadoId(medio.id_mediopago);
                        setErrorMedioPago('');
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
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
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5l4.5 2.5-4.5 2.5zm5.5-5.5h-2.1c-.2-1.8-1.5-3.2-3.4-3.4V5.5c3 .4 5.3 2.6 5.5 5.5z"/>
                            </svg>
                          ) : esTransferencia ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                          ) : esEfectivo ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold text-white capitalize truncate">
                              {nombre}
                            </p>
                            {esMP && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono uppercase font-semibold">
                                ⚡ Automático
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">
                            {esMP
                              ? 'Transferencia inmediata, débito o dinero en cuenta'
                              : esTransferencia
                              ? 'CBU / Alias provisto tras confirmar'
                              : esEfectivo
                              ? 'Abona al momento de recibir o retirar'
                              : 'Canal habilitado para la orden'}
                          </p>
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

              {/* Cartel de Seguridad PCI-DSS */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 text-slate-300 text-xs space-y-2">
                <div className="flex items-center gap-2 text-cyan-400 font-bold">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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
          {/* PASO 4: REVISIÓN GENERAL Y CONFIRMACIÓN                          */}
          {/* ================================================================= */}
          {pasoActual === 4 && !esperandoPagoMP && (
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
                  Verifica los artículos y datos antes de concretar la operación comercial.
                </p>
              </div>

              {/* Lista Resumen de Productos */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Artículos en Carrito ({itemsLocales.length})
                  </h4>
                  {sincronizandoCarritoServidor && (
                    <span className="text-[10px] text-cyan-400 font-mono animate-pulse">
                      Sincronizando...
                    </span>
                  )}
                </div>

                <div className="divide-y divide-slate-800/80 max-h-40 overflow-y-auto pr-1">
                  {itemsLocales.map((item) => (
                    <div key={item.id_producto} className="py-2 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={obtenerImagenProducto({ nombre: item.producto_nombre })}
                          alt={item.producto_nombre}
                          className="w-9 h-9 rounded-lg object-cover bg-slate-800 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{item.producto_nombre}</p>
                          <p className="text-slate-400 text-[11px]">
                            {item.cantidad} x {formatearMoneda(item.precio_unitario)}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-cyan-400 shrink-0">
                        {formatearMoneda(item.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Desglose de Entrega, Facturación y Pago */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Destino */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Modalidad de Entrega</span>
                  <p className="font-bold text-white">
                    {metodoEntrega === 'RETIRO' ? 'Retiro en Sede Central' : 'Envío a Domicilio'}
                  </p>
                  <p className="text-slate-400 text-[11px]">
                    {metodoEntrega === 'RETIRO'
                      ? 'Local Central IFixPos - Área de Entregas'
                      : direccionSeleccionada
                      ? `${direccionSeleccionada.calle_numero || direccionSeleccionada.nro_calle || 'Domicilio'}${
                          direccionSeleccionada.piso ? `, Piso ${direccionSeleccionada.piso}` : ''
                        }${
                          direccionSeleccionada.nro_dpto ? ` Dpto ${direccionSeleccionada.nro_dpto}` : ''
                        }, ${
                          direccionSeleccionada.ciudad_info?.nombre || direccionSeleccionada.ciudad_detalle?.nombre || direccionSeleccionada.ciudad || ''
                        }`
                      : 'Dirección seleccionada'}
                  </p>
                </div>

                {/* Facturación y Pago */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Facturación y Pago</span>
                  <p className="font-bold text-white truncate">
                    {facturacion.nombre} {facturacion.apellido} (DNI: {facturacion.dni})
                  </p>
                  <p className="text-cyan-400 text-[11px]">
                    Canal: {medioPagoSeleccionado?.nombre_medio_pago || medioPagoSeleccionado?.nombre || 'Seleccionado'}
                  </p>
                </div>
              </div>

              {/* Desglose Total Financiero */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-cyan-950/40 border border-cyan-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Subtotal Artículos:</span>
                  <span className="font-mono">{formatearMoneda(subtotalLocal)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>Costo de Entrega / Flete:</span>
                    {metodoEntrega === 'ENVIO' && detalleTarifaEnvio?.descripcion && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium">
                        {detalleTarifaEnvio.descripcion}
                      </span>
                    )}
                    {metodoEntrega === 'RETIRO' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                        Retiro en Sede Central
                      </span>
                    )}
                  </div>
                  <span className="font-mono">
                    {cargandoCostoEnvio ? (
                      <span className="text-slate-400 animate-pulse text-[11px]">Cotizando...</span>
                    ) : costoEnvioFinal === 0 ? (
                      'Gratis ($0.00)'
                    ) : (
                      formatearMoneda(costoEnvioFinal)
                    )}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-700/80 flex items-center justify-between text-base font-black">
                  <span className="text-white">Total Final a Pagar:</span>
                  <span className="text-xl font-mono text-cyan-400">
                    {formatearMoneda(montoTotalFinal)}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ================================================================= */}
          {/* PANTALLA INTERACTIVA: ESPERANDO PAGO DE MERCADO PAGO             */}
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
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5l4.5 2.5-4.5 2.5zm5.5-5.5h-2.1c-.2-1.8-1.5-3.2-3.4-3.4V5.5c3 .4 5.3 2.6 5.5 5.5z"/>
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

              {/* Botón y Código QR para abrir la pasarela en celular o PC */}
              <div className="max-w-md mx-auto p-4 rounded-xl bg-slate-900/90 border border-[#009EE3]/40 space-y-3.5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Total de la Orden:</span>
                  <span className="font-mono text-cyan-400 font-bold text-sm">
                    {formatearMoneda(totalEsperandoMP)}
                  </span>
                </div>

                {tiempoExpirado ? (
                  <div className="w-full py-3 px-4 rounded-xl bg-slate-800/80 border border-rose-500/40 text-rose-300 font-bold text-xs tracking-wide flex items-center justify-center gap-2 text-center">
                    <span>⚠️ Link Expirado — Reserva de Stock Finalizada</span>
                  </div>
                ) : (
                  <>
                    {/* Código QR Dinámico para pago ágil con el celular */}
                    {(mpPreferencia?.init_point || mpPreferencia?.sandbox_init_point || resultadoVenta?.init_point || ordenParaRetomar?.init_point) && (
                      <div className="py-2 flex flex-col items-center justify-center space-y-2.5">
                        <div className="p-3 bg-white rounded-2xl shadow-xl border-2 border-[#009EE3]/50 inline-flex items-center justify-center">
                          <QRCodeSVG
                            value={mpPreferencia?.init_point || mpPreferencia?.sandbox_init_point || resultadoVenta?.init_point || ordenParaRetomar?.init_point}
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
                    )}

                    <div className="relative flex py-0.5 items-center">
                      <div className="flex-grow border-t border-slate-800"></div>
                      <span className="flex-shrink mx-3 text-[10px] uppercase font-mono text-slate-400 tracking-wider">o si prefieres en la computadora</span>
                      <div className="flex-grow border-t border-slate-800"></div>
                    </div>

                    <a
                      href={mpPreferencia?.init_point || mpPreferencia?.sandbox_init_point || resultadoVenta?.init_point || ordenParaRetomar?.init_point || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#009EE3] to-cyan-500 hover:from-[#0089c7] hover:to-cyan-400 text-white font-extrabold text-xs tracking-wide flex items-center justify-center gap-2 transition-colors cursor-pointer block"
                    >
                      <span>Abrir Pasarela en Mercado Pago Web</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </>
                )}

                <div className="pt-2 border-t border-slate-800 flex items-center justify-center gap-2 text-[11px] text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                  <span>Conexión activa: sincronizando acreditación con Mercado Pago</span>
                </div>
              </div>

              {/* Banner de Modo Simulación / Desarrollo */}
              {mpPreferencia?.modo_simulacion && (
                <div className="max-w-md mx-auto p-3.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-left space-y-2">
                  <p className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
                    <span>🧪</span>
                    <span>Modo de Prueba / Desarrollo Activo</span>
                  </p>
                  <p className="text-[11px] text-slate-300">
                    Las credenciales de Mercado Pago están pendientes en <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">Backend/.env</code>. Puedes simular la acreditación instantánea para probar el circuito completo:
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

              {/* Temporizador Aislado de Reserva de Stock TTL */}
              <TemporizadorReservaModal
                segundosIniciales={resultadoVenta?.segundos_restantes || ordenParaRetomar?.segundos_restantes || 30 * 60}
                onExpirado={handleExpirarReserva}
              />

              {/* Acciones de Verificación Manual, Retorno al Carrito y Cancelación */}
              <div className="max-w-md mx-auto space-y-3 pt-1">
                {!mostrarConfirmacionRetorno ? (
                  <>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        disabled={verificandoPagoMP || cancelandoOrden}
                        onClick={handleVerificarAcreditacionMP}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                      >
                        {verificandoPagoMP ? 'Verificando...' : 'Comprobar Acreditación'}
                      </button>
                      <button
                        type="button"
                        disabled={cancelandoOrden}
                        onClick={() => {
                          if (onOrdenCerradaConPendiente) {
                            onOrdenCerradaConPendiente(resultadoVenta);
                          }
                          onClose();
                        }}
                        className="py-2.5 px-4 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span>Seguir en Tienda (Mantener Reserva ⏱️)</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={cancelandoOrden}
                      onClick={() => setMostrarConfirmacionRetorno(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/30 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span>Retornar al carrito</span>
                    </button>

                    <p className="text-[11px] text-slate-400 text-center pt-1 leading-normal">
                      💡 Si cierras esta ventana, tu reserva de repuestos se mantendrá protegida y podrás retomar el pago en cualquier momento desde el aviso superior de la tienda.
                    </p>
                  </>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-900 border border-amber-500/40 text-left space-y-3 shadow-xl">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                      <span className="text-base">⚠️</span>
                      <h4>¿Deseas volver al carrito y anular esta orden?</h4>
                    </div>

                    <div className="space-y-2 text-xs text-slate-300 bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                      <p className="flex items-start gap-2">
                        <span className="text-amber-400 font-bold">•</span>
                        <span><strong>Orden y Link de pago obsoletos:</strong> La compra actual y el enlace de pago de Mercado Pago quedarán sin validez.</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-rose-400 font-bold">•</span>
                        <span><strong>Liberación de reserva de stock:</strong> El temporizador de 30 minutos finalizará y los repuestos volverán a estar disponibles para otros clientes.</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-cyan-400 font-bold">•</span>
                        <span><strong>Tus artículos siguen en tu carrito:</strong> Podrás seguir agregando repuestos o modificando tu pedido con total comodidad.</span>
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <button
                        type="button"
                        disabled={cancelandoOrden}
                        onClick={() => setMostrarConfirmacionRetorno(false)}
                        className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                      >
                        Continuar con el Pago
                      </button>
                      <button
                        type="button"
                        disabled={cancelandoOrden}
                        onClick={() => handleCancelarOrden('retorno_carrito')}
                        className="flex-1 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                      >
                        {cancelandoOrden ? (
                          <>
                            <div className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                            <span>Liberando reserva...</span>
                          </>
                        ) : (
                          <span>Confirmar y Retornar al Carrito</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ================================================================= */}
          {/* PASO 5: PANTALLA DE ÉXITO Y COMPROBANTE                         */}
          {/* ================================================================= */}
          {pasoActual === 5 && resultadoVenta && !esperandoPagoMP && (
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
                  ¡Compra Confirmada con Éxito!
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Tu orden ha sido registrada y pagada. Los repuestos han sido reservados y descontados del inventario en tiempo real.
                </p>
              </div>

              {/* Tarjeta con Código Oficial de Orden: Retiro en Local vs Envío */}
              <div className="max-w-md mx-auto p-4 rounded-xl bg-slate-900/90 border border-cyan-500/40 space-y-2.5">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-base">{metodoEntrega === 'RETIRO' ? '📍' : '🛡️'}</span>
                  <span className="text-[11px] text-cyan-300 uppercase font-mono font-bold tracking-wider">
                    {metodoEntrega === 'RETIRO' ? 'Código para Retiro en Local' : 'Código de Seguridad y Gestión'}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-2xl font-black font-mono tracking-widest text-cyan-400">
                    {resultadoVenta.codigo_sec || 'CONFIRMADO'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopiarCodigo}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs"
                    title="Copiar código"
                  >
                    {copiadoExito ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  {metodoEntrega === 'RETIRO'
                    ? 'Guarda este código de seguridad; lo vas a necesitar al momento de retirar tus productos en nuestra sede central junto con tu DNI.'
                    : 'Guarda este código de seguridad; te servirá para reclamos o consultas en caso de que tus productos no lleguen a tu ubicación.'}
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Ver / Descargar Factura Oficial en PDF</span>
                    </>
                  )}
                </button>
              </div>

              {/* Instrucciones según Modalidad y Confirmación por Correo */}
              <div className="max-w-md mx-auto text-left p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-2.5 text-slate-300">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <span>📦</span>
                  <span>Próximos Pasos:</span>
                </p>
                {metodoEntrega === 'RETIRO' ? (
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Tus repuestos te esperan en nuestra Sede Central. Recuerda guardar tu código de seguridad y presentarlo en mostrador junto con tu DNI para retirar.
                  </p>
                ) : (
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Por favor mantente atento durante los próximos días hábiles: tu compra llegará pronto al destino seleccionado. Conserva tu código de seguridad para cualquier seguimiento o reclamo.
                  </p>
                )}
                <p className="text-[11px] text-cyan-400 pt-1 flex items-center gap-1.5 font-medium">
                  <span>✉️</span>
                  <span>Te enviamos un correo electrónico a <b>{facturacion.email || user?.email}</b> con los detalles, este código y tu Factura PDF adjunta.</span>
                </p>
                <div className="pt-2 border-t border-slate-800 text-center">
                  <p className="text-xs text-amber-300 font-semibold">
                    ¡Muchas gracias por comprar en nuestra tienda virtual!
                  </p>
                </div>
              </div>
            </motion.div>
          )}

        </div>

        {/* Pie de Acciones / Botones */}
        <div className="px-6 py-4 bg-[#1E293B]/90 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          {esperandoPagoMP ? (
            <div className="w-full flex items-center justify-center py-1">
              <span className="text-xs text-slate-400 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                <span>Esperando acreditación de pago en tiempo real con Mercado Pago...</span>
              </span>
            </div>
          ) : pasoActual === 5 ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 px-6 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all"
            >
              Volver al inicio
            </button>
          ) : (
            <>
              {pasoActual > 1 ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleRetrocederPaso}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs tracking-wide border border-slate-700 transition-all disabled:opacity-40"
                >
                  ← Paso Anterior
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onClose}
                  className="py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 font-semibold text-xs transition-all"
                >
                  Cancelar
                </button>
              )}

              {pasoActual < 4 ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleAvanzarPaso}
                  className="py-2.5 px-6 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-40"
                >
                  {isSubmitting && pasoActual === 1 ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                      <span>Guardando en cuenta...</span>
                    </>
                  ) : (
                    <>
                      <span>Continuar</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmarCompra}
                  className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 text-slate-950 font-extrabold text-xs tracking-wide shadow-lg shadow-cyan-500/30 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-40"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                      <span>Procesando Orden...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirmar y Procesar Compra</span>
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

        {/* Modal Secundario para Registrar Nueva Dirección */}
        <DireccionModal
          isOpen={modalNuevaDireccionAbierto}
          onClose={() => setModalNuevaDireccionAbierto(false)}
          onSaved={handleNuevaDireccionGuardada}
        />
      </motion.div>
    </div>
  );
}
