import { useState, useCallback, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';

import { API_BASE_URL } from '../../config/api';
export default function CompletarPago({ onAlerta }) {
  const { token } = useAuth();
  const location = useLocation();

  // ============================================================================
  // ESTADOS DEL MOTOR DE BÚSQUEDA Y FILTRADO CONTABLE (CU-38)
  // ============================================================================
  const [busquedaExacta, setBusquedaExacta] = useState(
    location.state?.busquedaExacta || location.state?.codigo_sec || ''
  );
  const [estadoFiltro, setEstadoFiltro] = useState('PENDIENTE');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [medioPagoFiltro, setMedioPagoFiltro] = useState('');

  // Catálogo dinámico de medios de pago en base de datos (CU-82 / CU-18)
  const [catalogoMediosPago, setCatalogoMediosPago] = useState([]);
  const [cargandoMedios, setCargandoMedios] = useState(false);

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

  // Formulario de cobro (Simple y Cobro Mixto)
  const [medioPago, setMedioPago] = useState('Efectivo');
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [montoAbonado, setMontoAbonado] = useState('');
  const [detalle, setDetalle] = useState('');
  const [procesandoPago, setProcesandoPago] = useState(false);

  // Estados de Cobro Mixto (paso a paso uno a uno)
  const [cobroMixto, setCobroMixto] = useState(false);
  const [tramosMixtos, setTramosMixtos] = useState([]);
  const [ejecutandoMixto, setEjecutandoMixto] = useState(false);
  const [indiceTramoActual, setIndiceTramoActual] = useState(0);

  // Fase 3: Ticket de Éxito
  const [ticketExito, setTicketExito] = useState(null);

  // Alerta local suave con auto-cierre de 6 segundos (Regla 6)
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
  // CARGA DINÁMICA DE MEDIOS DE PAGO ACTIVOS (DESDE BACKEND)
  // ============================================================================
  useEffect(() => {
    const cargarMedios = async () => {
      if (!token) return;
      setCargandoMedios(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/sales/medios-pago/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const items = Array.isArray(res.data) ? res.data : [];
        const activos = items.filter((m) => m.estado !== false && m.estado_activo !== false);
        setCatalogoMediosPago(activos);
      } catch (err) {
        console.warn('No se pudo cargar el catálogo de medios de pago:', err);
      } finally {
        setCargandoMedios(false);
      }
    };
    cargarMedios();
  }, [token]);

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
              : (medioPagoFiltro.trim() || undefined)
        };

        // Doble validación en React: coherencia cronológica de fechas
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
        const listaResultados = data.resultados || [];
        setTransacciones(listaResultados);
        if (data.resumen) {
          setResumenCaja(data.resumen);
        }

        if (filtrosOverride.auto_seleccionar && listaResultados.length > 0) {
          const codigoBuscado = String(queryParams.busqueda_exacta || '').trim().toUpperCase();
          const itemObjetivo =
            listaResultados.find(
              (item) => String(item.codigo_seguridad || '').trim().toUpperCase() === codigoBuscado
            ) || listaResultados[0];
          handleSeleccionarOperacion(itemObjetivo, filtrosOverride.medio_pago_preferido);
        }
      } catch (error) {
        console.error('Error al filtrar transacciones:', error);
        const msg = error.response?.data?.error || error.response?.data?.mensaje || 'Error al consultar operaciones.';
        dispararMensaje('error', typeof msg === 'object' ? JSON.stringify(msg) : msg);
      } finally {
        setCargandoLista(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, estadoFiltro, busquedaExacta, fechaDesde, fechaHasta, medioPagoFiltro, dispararMensaje]
  );

  // Carga inicial o recepción de búsqueda externa (desde Nueva Reparación, Recepcionar o En Curso)
  useEffect(() => {
    const busquedaExterna = location.state?.busquedaExacta || location.state?.codigo_sec || '';
    const autoSeleccionar = Boolean(location.state?.autoSeleccionar);
    const medioPreferido = location.state?.medioPagoPreferido || 'Efectivo';
    if (busquedaExterna) {
      setBusquedaExacta(busquedaExterna);
      setEstadoFiltro('PENDIENTE');
      cargarTransacciones({
        busqueda_exacta: busquedaExterna,
        estado_pago: 'PENDIENTE',
        auto_seleccionar: autoSeleccionar,
        medio_pago_preferido: medioPreferido
      });
    } else {
      cargarTransacciones({ estado_pago: 'PENDIENTE' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, location.state]);

  // Manejar submit manual del formulario de búsqueda al presionar "Filtrar"
  const handleBuscar = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    cargarTransacciones();
  };

  // Manejador de cambio de Medio de Pago (selecciona sin disparar consulta hasta dar Filtrar)
  const handleCambioMedioPago = (nuevoMedio) => {
    setMedioPagoFiltro(nuevoMedio);
  };

  // Atajos rápidos temporales
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

  const handleUltimos7Dias = () => {
    const hoy = new Date();
    const hace7 = new Date();
    hace7.setDate(hace7.getDate() - 7);
    const desdeStr = hace7.toISOString().split('T')[0];
    const hastaStr = hoy.toISOString().split('T')[0];
    setFechaDesde(desdeStr);
    setFechaHasta(hastaStr);
    cargarTransacciones({ fecha_desde: desdeStr, fecha_hasta: hastaStr });
  };

  const handleMesActual = () => {
    const hoy = new Date();
    const primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const desdeStr = primeroMes.toISOString().split('T')[0];
    const hastaStr = hoy.toISOString().split('T')[0];
    setFechaDesde(desdeStr);
    setFechaHasta(hastaStr);
    cargarTransacciones({ fecha_desde: desdeStr, fecha_hasta: hastaStr });
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
  const handleSeleccionarOperacion = async (item, medioPagoPreferido = null) => {
    const identificador = item.codigo_seguridad || item.cliente?.email;
    if (!identificador && !item.id_operacion) {
      dispararMensaje('error', 'La transacción no posee código de seguridad ni correo vinculado.');
      return;
    }

    setOperacionSeleccionada(item);
    setCargandoDesglose(true);
    setTicketExito(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/api/sales/operaciones/pendientes/`, {
        params: {
          identificador: identificador || undefined,
          id_operacion: item.id_operacion,
          tipo_operacion: item.tipo_operacion
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = response.data;
      setDesgloseOperacion(data);
      // Precargar datos del formulario con el total a cobrar exacto
      setMontoAbonado(data.total_a_cobrar || String(item.monto) || '0.00');
      // Seleccionar medio preferido (ej. Efectivo desde mostrador) o primer medio activo disponible
      const medioEfectivoCatalogo = catalogoMediosPago.find((m) =>
        (m.nombre_medio_pago || '').toLowerCase().includes('efectivo')
      )?.nombre_medio_pago;
      const primerMedio =
        medioPagoPreferido ||
        medioEfectivoCatalogo ||
        catalogoMediosPago[0]?.nombre_medio_pago ||
        'Efectivo';
      setMedioPago(primerMedio);
      setNumeroOperacion('');
      setDetalle('');
      setCobroMixto(false);
      setTramosMixtos([]);
      setEjecutandoMixto(false);
      setIndiceTramoActual(0);
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
    setCobroMixto(false);
    setTramosMixtos([]);
    setEjecutandoMixto(false);
    setIndiceTramoActual(0);
    cargarTransacciones();
  };

  // ============================================================================
  // CONFIRMACIÓN DEL COBRO Y TRANSICIÓN DE ESTADO (CU-21 & CU-20)
  // ============================================================================
  const listaNombresMedios = useMemo(() => {
    if (catalogoMediosPago.length > 0) {
      return catalogoMediosPago.map((m) => m.nombre_medio_pago).filter(Boolean);
    }
    return ['Efectivo', 'Transferencia Virtual', 'Tarjeta de Débito / Crédito'];
  }, [catalogoMediosPago]);

  const esMedioTransferencia = useCallback((nombreMedio) => {
    const m = String(nombreMedio || '').toLowerCase();
    return m.includes('transf') || m.includes('bancari') || m.includes('cbu');
  }, []);

  const esTransferencia = useMemo(
    () => esMedioTransferencia(medioPago),
    [medioPago, esMedioTransferencia]
  );

  const totalAdeudadoNum = useMemo(() => {
    if (!desgloseOperacion?.total_a_cobrar) {
      return parseFloat(operacionSeleccionada?.monto || 0);
    }
    return parseFloat(desgloseOperacion.total_a_cobrar || 0);
  }, [desgloseOperacion, operacionSeleccionada]);

  // Activar / desactivar Cobro Mixto inicializando 2 tramos con medios distintos
  const handleToggleCobroMixto = (activar) => {
    if (activar) {
      if (listaNombresMedios.length < 2) {
        dispararMensaje('warning', 'Se necesitan al menos 2 medios de pago habilitados para realizar un cobro mixto.');
        return;
      }
      const primer = medioPago && listaNombresMedios.includes(medioPago) ? medioPago : listaNombresMedios[0];
      const segundo = listaNombresMedios.find((m) => m !== primer) || listaNombresMedios[1];
      const mitad = Math.floor((totalAdeudadoNum / 2) * 100) / 100;
      const resto = Math.max(0, Number((totalAdeudadoNum - mitad).toFixed(2)));
      setTramosMixtos([
        { id: 1, medio_pago: primer, monto_pagado: mitad > 0 ? mitad.toFixed(2) : '', numero_operacion: '' },
        { id: 2, medio_pago: segundo, monto_pagado: resto > 0 ? resto.toFixed(2) : '', numero_operacion: '' }
      ]);
      setCobroMixto(true);
      setEjecutandoMixto(false);
      setIndiceTramoActual(0);
    } else {
      setCobroMixto(false);
      setEjecutandoMixto(false);
      setIndiceTramoActual(0);
      setMontoAbonado(totalAdeudadoNum.toFixed(2));
    }
  };

  const handleActualizarTramoMixto = (idx, campo, valor) => {
    setTramosMixtos((prev) => {
      const copia = prev.map((t) => ({ ...t }));
      copia[idx][campo] = valor;
      // Si se edita el monto del primer tramo y hay exactamente 2 tramos, autocompletar el saldo en el tramo 2
      if (campo === 'monto_pagado' && idx === 0 && copia.length === 2) {
        const m1 = parseFloat(valor || 0);
        if (!isNaN(m1) && m1 >= 0 && m1 <= totalAdeudadoNum) {
          copia[1].monto_pagado = (totalAdeudadoNum - m1).toFixed(2);
        }
      }
      return copia;
    });
  };

  const handleAgregarTramoMixto = () => {
    const usados = new Set(tramosMixtos.map((t) => t.medio_pago));
    const disponible = listaNombresMedios.find((m) => !usados.has(m));
    if (!disponible) return;
    setTramosMixtos((prev) => [
      ...prev,
      { id: Date.now(), medio_pago: disponible, monto_pagado: '0.00', numero_operacion: '' }
    ]);
  };

  const handleQuitarTramoMixto = (idx) => {
    if (tramosMixtos.length <= 2) return;
    setTramosMixtos((prev) => prev.filter((_, i) => i !== idx));
  };

  const sumaTramosMixtos = useMemo(() => {
    return tramosMixtos.reduce((acc, t) => acc + (parseFloat(t.monto_pagado || 0) || 0), 0);
  }, [tramosMixtos]);

  const configuracionMixtaValida = useMemo(() => {
    if (!cobroMixto || tramosMixtos.length < 2) return false;
    const medios = new Set();
    for (const t of tramosMixtos) {
      const m = parseFloat(t.monto_pagado);
      if (isNaN(m) || m <= 0) return false;
      if (!t.medio_pago || medios.has(t.medio_pago)) return false;
      medios.add(t.medio_pago);
    }
    return Math.abs(sumaTramosMixtos - totalAdeudadoNum) <= 0.01;
  }, [cobroMixto, tramosMixtos, sumaTramosMixtos, totalAdeudadoNum]);

  const esFormularioValido = useMemo(() => {
    if (cobroMixto) return configuracionMixtaValida;
    const monto = parseFloat(montoAbonado);
    if (isNaN(monto) || monto <= 0) return false;
    // El monto debe cubrir exactamente el total a cobrar
    if (Math.abs(monto - totalAdeudadoNum) > 0.01) return false;
    // Si es transferencia, el número de operación es obligatorio
    if (esTransferencia && !numeroOperacion.trim()) return false;
    return true;
  }, [cobroMixto, configuracionMixtaValida, montoAbonado, totalAdeudadoNum, esTransferencia, numeroOperacion]);

  const enviarCobroAlBackend = async ({ esMixto = false } = {}) => {
    setProcesandoPago(true);
    try {
      const codSeguridad =
        operacionSeleccionada?.codigo_seguridad ||
        desgloseOperacion?.codigo_seguridad ||
        '';

      const ident =
        codSeguridad ||
        operacionSeleccionada?.cliente?.email ||
        desgloseOperacion?.cliente?.email ||
        busquedaExacta.trim() ||
        undefined;

      const payload = esMixto
        ? {
            identificador: ident,
            codigo_seguridad: codSeguridad || undefined,
            id_operacion: operacionSeleccionada.id_operacion,
            tipo_operacion: operacionSeleccionada.tipo_operacion,
            detalle: detalle.trim() || undefined,
            pagos_mixtos: tramosMixtos.map((t) => ({
              medio_pago: t.medio_pago,
              monto_pagado: parseFloat(t.monto_pagado),
              numero_operacion: t.numero_operacion?.trim() || undefined
            }))
          }
        : {
            identificador: ident,
            codigo_seguridad: codSeguridad || undefined,
            id_operacion: operacionSeleccionada.id_operacion,
            tipo_operacion: operacionSeleccionada.tipo_operacion,
            monto_pagado: parseFloat(montoAbonado),
            medio_pago: medioPago,
            numero_operacion: numeroOperacion.trim() || undefined,
            cod_operacion: numeroOperacion.trim() || undefined,
            detalle: detalle.trim() || undefined
          };

      const endpoint = codSeguridad
        ? `${API_BASE_URL}/api/sales/pagos/completar/${encodeURIComponent(codSeguridad)}/`
        : `${API_BASE_URL}/api/sales/pagos/completar/`;

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = response.data;
      dispararMensaje('success', data.mensaje || '¡Cobro registrado con éxito! Factura generada.');

      const resumenMedios = esMixto
        ? tramosMixtos.map((t) => `${t.medio_pago} ($${parseFloat(t.monto_pagado).toFixed(2)})`).join(' + ')
        : medioPago;

      // Transición al ticket de éxito con comprobante
      setTicketExito({
        cliente:
          operacionSeleccionada.cliente?.nombre ||
          desgloseOperacion?.cliente?.nombre ||
          'Consumidor',
        montoPagado: esMixto ? totalAdeudadoNum.toFixed(2) : montoAbonado,
        medioPago: resumenMedios,
        tipoOperacion: operacionSeleccionada.tipo_operacion,
        codigoSeguridad: codSeguridad,
        rutaComprobante: data.ruta_comprobante || data.pago?.ruta_comprobante || ''
      });
    } catch (error) {
      console.error('Error al registrar cobro:', error);
      const msg =
        error.response?.data?.error ||
        error.response?.data?.detail ||
        error.response?.data?.mensaje ||
        'Error al procesar el cobro.';
      dispararMensaje('error', typeof msg === 'object' ? JSON.stringify(msg) : msg);
    } finally {
      setProcesandoPago(false);
    }
  };

  const handleConfirmarCobro = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (cobroMixto) {
      if (!configuracionMixtaValida) {
        dispararMensaje('error', 'Verifica los medios de pago (sin repetir) y que la suma de montos coincida con el total.');
        return;
      }
      // Iniciar flujo paso a paso uno a uno
      setIndiceTramoActual(0);
      setEjecutandoMixto(true);
      return;
    }

    if (!esFormularioValido) {
      if (esTransferencia && !numeroOperacion.trim()) {
        dispararMensaje('error', 'El número de operación es obligatorio para cobros por transferencia bancaria.');
        return;
      }
      dispararMensaje('error', 'Por favor verifica el monto ingresado. Debe cubrir exactamente el total a cobrar.');
      return;
    }

    await enviarCobroAlBackend({ esMixto: false });
  };

  const handleAvanzarTramoMixto = async () => {
    const tramoActual = tramosMixtos[indiceTramoActual];
    if (!tramoActual) return;
    if (esMedioTransferencia(tramoActual.medio_pago) && !String(tramoActual.numero_operacion || '').trim()) {
      dispararMensaje('error', `Ingresa el número de operación para el tramo ${indiceTramoActual + 1} (${tramoActual.medio_pago}).`);
      return;
    }

    if (indiceTramoActual < tramosMixtos.length - 1) {
      setIndiceTramoActual((prev) => prev + 1);
    } else {
      await enviarCobroAlBackend({ esMixto: true });
    }
  };

  const handleDescargarFactura = () => {
    if (!ticketExito?.rutaComprobante) {
      dispararMensaje('warning', 'La factura aún no se encuentra disponible para descarga.');
      return;
    }
    const url = ticketExito.rutaComprobante.startsWith('http')
      ? ticketExito.rutaComprobante
      : `${API_BASE_URL}${ticketExito.rutaComprobante}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      {/* Alerta flotante local Cyber-Tech (Fixed, Zero CLS) */}
      <AnimatePresence>
        {alertaLocal && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className={`fixed bottom-6 left-6 z-50 max-w-md px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md flex items-center gap-3 text-sm pointer-events-auto ${
              alertaLocal.tipo === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-emerald-950/50'
                : alertaLocal.tipo === 'warning'
                ? 'bg-amber-950/90 border-amber-500/50 text-amber-200 shadow-amber-950/50'
                : 'bg-rose-950/90 border-rose-500/50 text-rose-200 shadow-rose-950/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base flex-shrink-0">
                {alertaLocal.tipo === 'success' ? '⚡' : alertaLocal.tipo === 'warning' ? '🔔' : '⚠️'}
              </span>
              <span className="font-medium text-xs leading-relaxed">{alertaLocal.mensaje}</span>
            </div>
            <button
              type="button"
              onClick={() => setAlertaLocal(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-colors ml-2"
              aria-label="Cerrar notificación"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cabecera Principal */}
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
              Localiza órdenes de servicio y ventas mediante filtros contables precisos por estado, medio de pago o fechas, asienta el ingreso en caja y emite automáticamente el comprobante fiscal.
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
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-sm font-bold tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
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
                    <span className="text-xs font-mono text-slate-400">
                      {operacionSeleccionada.codigo_seguridad && `Código: ${operacionSeleccionada.codigo_seguridad}`}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mt-1">
                    Cobro a: {operacionSeleccionada.cliente?.nombre || 'Consumidor Final'}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {operacionSeleccionada.cliente?.email || 'Sin correo asociado'}
                    {operacionSeleccionada.cliente?.dni && ` • DNI: ${operacionSeleccionada.cliente.dni}`}
                  </p>
                  {desgloseOperacion?.concepto_resumen && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-200 text-xs font-semibold">
                      <span>🧾</span>
                      <span>{desgloseOperacion.concepto_resumen}</span>
                    </div>
                  )}
                </div>

                <div className="bg-[#0F172A] border border-cyan-500/40 rounded-2xl px-6 py-3 text-right">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-semibold">
                    Total a Liquidar
                  </span>
                  <span className="text-3xl font-black text-[#06B6D4] font-mono">
                    ${totalAdeudadoNum.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Renglones de la Operación (Productos o Diagnóstico/Reparación) */}
              {cargandoDesglose ? (
                <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-mono">Cargando desglose de conceptos...</span>
                </div>
              ) : desgloseOperacion?.items && desgloseOperacion.items.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-mono uppercase text-slate-400 font-bold">
                    Detalle de lo que se cobra al cliente
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h4 className="text-xs font-mono uppercase text-purple-400 font-bold tracking-wider">
                    Definición del Pago y Liquidación
                  </h4>

                  {!ejecutandoMixto && (
                    <label className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-cyan-500/30 hover:border-cyan-400/60 cursor-pointer select-none transition-colors">
                      <input
                        type="checkbox"
                        checked={cobroMixto}
                        onChange={(e) => handleToggleCobroMixto(e.target.checked)}
                        className="w-4 h-4 rounded accent-cyan-400 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-cyan-300">Cobro mixto (varios medios)</span>
                    </label>
                  )}
                </div>

                {!cobroMixto ? (
                  /* ========================================================== */
                  /* MODO COBRO ÚNICO (MONTO BLOQUEADO, NO MODIFICABLE)         */
                  /* ========================================================== */
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Medio de Pago dinámico */}
                      <div>
                        <label className="block text-xs font-mono uppercase text-slate-300 font-bold mb-1.5">
                          Medio de Pago <span className="text-cyan-400">*</span>
                        </label>
                        <select
                          value={medioPago}
                          onChange={(e) => setMedioPago(e.target.value)}
                          className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]"
                        >
                          {listaNombresMedios.map((nombreMedio) => {
                            const meta = catalogoMediosPago.find((m) => m.nombre_medio_pago === nombreMedio);
                            const recargo = Number(meta?.recargo || 0);
                            return (
                              <option key={meta?.id_mediopago || nombreMedio} value={nombreMedio}>
                                {nombreMedio} {recargo > 0 ? `(+${recargo}%)` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Monto Abonado (Bloqueado en cobro simple) */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-mono uppercase text-slate-300 font-bold">
                            Monto a Percibir ($)
                          </label>
                          <span className="text-[10px] font-mono text-slate-400">🔒 Monto fijo</span>
                        </div>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">
                            $
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={totalAdeudadoNum.toFixed(2)}
                            readOnly
                            disabled
                            className="w-full bg-slate-900/70 border border-slate-700/70 rounded-xl pl-8 pr-4 py-3 text-sm text-slate-300 font-mono cursor-not-allowed select-none opacity-90"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Número de Operación: Obligatorio si es Transferencia */}
                    {esTransferencia && (
                      <div className="space-y-1.5">
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
                      </div>
                    )}
                  </>
                ) : !ejecutandoMixto ? (
                  /* ========================================================== */
                  /* MODO COBRO MIXTO - PASO A: CONFIGURACIÓN DE MEDIOS Y MONTOS*/
                  /* ========================================================== */
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-200 flex items-center justify-between gap-2">
                      <span>
                        Define los medios de pago y montos para esta operación. No puedes repetir el mismo medio de pago; luego procederás a cobrarlos <strong>uno a uno</strong>.
                      </span>
                    </div>

                    <div className="space-y-3">
                      {tramosMixtos.map((tramo, idx) => {
                        const mediosOcupadosOtros = new Set(
                          tramosMixtos.filter((_, i) => i !== idx).map((t) => t.medio_pago)
                        );
                        const opcionesDisponibles = listaNombresMedios.filter(
                          (m) => m === tramo.medio_pago || !mediosOcupadosOtros.has(m)
                        );

                        return (
                          <div
                            key={tramo.id || idx}
                            className="p-4 rounded-xl bg-[#0F172A] border border-slate-700/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                          >
                            <div className="sm:col-span-6">
                              <label className="block text-[11px] font-mono uppercase text-slate-400 font-bold mb-1">
                                Medio de Pago #{idx + 1}
                              </label>
                              <select
                                value={tramo.medio_pago}
                                onChange={(e) => handleActualizarTramoMixto(idx, 'medio_pago', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-400"
                              >
                                {opcionesDisponibles.map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="sm:col-span-5">
                              <label className="block text-[11px] font-mono uppercase text-slate-400 font-bold mb-1">
                                Monto tramo #{idx + 1} ($)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={totalAdeudadoNum}
                                value={tramo.monto_pagado}
                                onChange={(e) => handleActualizarTramoMixto(idx, 'monto_pagado', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                                required
                              />
                            </div>

                            <div className="sm:col-span-1 flex justify-end">
                              {tramosMixtos.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => handleQuitarTramoMixto(idx)}
                                  className="px-2.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold cursor-pointer"
                                  title="Quitar tramo"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      {tramosMixtos.length < listaNombresMedios.length ? (
                        <button
                          type="button"
                          onClick={handleAgregarTramoMixto}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer self-start"
                        >
                          + Agregar otro medio de pago
                        </button>
                      ) : <span />}

                      <div className="text-xs font-mono text-right">
                        <span className="text-slate-400">Asignado: </span>
                        <span
                          className={`font-bold ${
                            Math.abs(sumaTramosMixtos - totalAdeudadoNum) <= 0.01
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          ${sumaTramosMixtos.toFixed(2)}
                        </span>
                        <span className="text-slate-500"> / ${totalAdeudadoNum.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ========================================================== */
                  /* MODO COBRO MIXTO - PASO B: EJECUCIÓN SECUENCIAL UNO A UNO  */
                  /* ========================================================== */
                  (() => {
                    const tramoActivo = tramosMixtos[indiceTramoActual] || {};
                    const reqNumOp = esMedioTransferencia(tramoActivo.medio_pago);
                    const esUltimoTramo = indiceTramoActual === tramosMixtos.length - 1;

                    return (
                      <div className="p-5 rounded-2xl bg-[#0F172A] border border-cyan-500/40 space-y-4">
                        {/* Indicador de progreso uno a uno */}
                        <div className="flex flex-wrap items-center gap-2">
                          {tramosMixtos.map((t, i) => {
                            const completado = i < indiceTramoActual;
                            const activo = i === indiceTramoActual;
                            return (
                              <div
                                key={t.id || i}
                                className={`px-3 py-1.5 rounded-lg text-xs font-mono border flex items-center gap-1.5 ${
                                  completado
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                    : activo
                                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                                    : 'bg-slate-900 border-slate-800 text-slate-500'
                                }`}
                              >
                                <span>{completado ? '✓' : `${i + 1}.`}</span>
                                <span>{t.medio_pago}</span>
                                <span>(${parseFloat(t.monto_pagado || 0).toFixed(2)})</span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-mono uppercase text-cyan-400 font-bold">
                              Cobro {indiceTramoActual + 1} de {tramosMixtos.length}
                            </p>
                            <h5 className="text-lg font-extrabold text-white mt-0.5">
                              {tramoActivo.medio_pago}
                            </h5>
                          </div>
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] font-mono uppercase text-slate-400 block">
                              Monto de este tramo
                            </span>
                            <span className="text-2xl font-black font-mono text-cyan-400">
                              ${parseFloat(tramoActivo.monto_pagado || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {reqNumOp && (
                          <div className="space-y-1.5">
                            <label className="block text-xs font-mono uppercase text-cyan-400 font-bold">
                              Número de Operación / Transferencia (Tramo {indiceTramoActual + 1}) <span className="text-rose-400">*</span>
                            </label>
                            <input
                              type="text"
                              placeholder="Ej. TRANSF-123456789 / CBU comprobante"
                              value={tramoActivo.numero_operacion || ''}
                              onChange={(e) =>
                                handleActualizarTramoMixto(indiceTramoActual, 'numero_operacion', e.target.value)
                              }
                              className="w-full bg-slate-900 border border-cyan-500/40 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                          <button
                            type="button"
                            disabled={procesandoPago}
                            onClick={() => {
                              if (indiceTramoActual > 0) {
                                setIndiceTramoActual((prev) => prev - 1);
                              } else {
                                setEjecutandoMixto(false);
                              }
                            }}
                            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            {indiceTramoActual > 0 ? '← Volver al pago anterior' : '← Editar distribución'}
                          </button>

                          <button
                            type="button"
                            disabled={procesandoPago}
                            onClick={handleAvanzarTramoMixto}
                            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-bold tracking-wide shadow-lg shadow-cyan-500/25 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
                          >
                            {procesandoPago ? (
                              <>
                                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                <span>Registrando cobro mixto...</span>
                              </>
                            ) : esUltimoTramo ? (
                              <span>✓ Registrar Pago {indiceTramoActual + 1} y Emitir Comprobante</span>
                            ) : (
                              <span>Registrar Pago {indiceTramoActual + 1} y continuar →</span>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })()
                )}

                {/* Detalle / Observaciones */}
                {!ejecutandoMixto && (
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
                )}

                {/* Botón de Confirmación Principal (oculto durante la ejecución secuencial mixta) */}
                {!ejecutandoMixto && (
                  <button
                    type="submit"
                    disabled={!esFormularioValido || procesandoPago}
                    className="w-full py-3.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-sm font-bold tracking-wide shadow-lg shadow-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
                  >
                    {procesandoPago ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Procesando pago y generando factura fiscal...</span>
                      </>
                    ) : cobroMixto ? (
                      <span>Iniciar Cobro Mixto (Paso 1 de {tramosMixtos.length}) →</span>
                    ) : (
                      <span>Confirmar Cobro y Emitir Comprobante</span>
                    )}
                  </button>
                )}
              </form>
            </div>
          </motion.div>
        ) : (
          /* ================================================================== */
          /* VISTA 3: FILTRAR Y LOCALIZAR OPERACIONES (CU-38)                   */
          /* ================================================================== */
          <div className="space-y-6">
            {/* Panel de Filtros Multicriterio con Medio de Pago integrado */}
            <motion.div
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🔍</span>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    Parámetros de Búsqueda y Filtros Contables
                  </h3>
                </div>

                {/* Atajos Rápidos Temporales */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-mono text-slate-400 mr-1">Rango rápido:</span>
                  <button
                    type="button"
                    onClick={handleArqueoHoy}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 transition-colors cursor-pointer"
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={handleUltimos7Dias}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                  >
                    7 días
                  </button>
                  <button
                    type="button"
                    onClick={handleMesActual}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                  >
                    Mes actual
                  </button>
                  <button
                    type="button"
                    onClick={handleLimpiarFiltros}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer ml-1"
                    title="Restablecer todos los filtros"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <form onSubmit={handleBuscar} className="space-y-4">
                {/* Cuadrícula Principal: Búsqueda exacta, Estado y MEDIO DE PAGO */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  {/* Búsqueda Exacta */}
                  <div className="md:col-span-5 relative">
                    <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                      Búsqueda Exacta
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                        🔎
                      </span>
                      <input
                        type="text"
                        value={busquedaExacta}
                        onChange={(e) => setBusquedaExacta(e.target.value)}
                        placeholder="Código de Seguridad o Correo del Cliente..."
                        className="w-full bg-[#0F172A] border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6]/30 transition-all font-sans"
                      />
                    </div>
                  </div>

                  {/* Estado del Pago */}
                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                      Estado del Pago
                    </label>
                    <select
                      value={estadoFiltro}
                      onChange={(e) => setEstadoFiltro(e.target.value)}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#8B5CF6] font-sans"
                    >
                      <option value="PENDIENTE">Pendientes (Por Cobrar)</option>
                      <option value="PAGADO">Pagados (Liquidados)</option>
                      <option value="ANULADO">Anulados / Cancelados</option>
                      <option value="TODOS">Todos los Estados</option>
                    </select>
                  </div>

                  {/* MEDIO DE PAGO (Nuevo filtro integrado de primer orden) */}
                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1 flex items-center justify-between">
                      <span>Medio de Pago</span>
                      {cargandoMedios && (
                        <span className="text-[10px] text-cyan-400 lowercase">cargando...</span>
                      )}
                    </label>
                    <select
                      value={medioPagoFiltro}
                      onChange={(e) => handleCambioMedioPago(e.target.value)}
                      className={`w-full bg-[#0F172A] border rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none font-sans transition-all ${
                        medioPagoFiltro
                          ? 'border-purple-500 ring-1 ring-purple-500/30'
                          : 'border-slate-700 focus:border-[#8B5CF6]'
                      }`}
                    >
                      <option value="">Todos los Medios de Pago</option>
                      {catalogoMediosPago.length > 0 ? (
                        catalogoMediosPago.map((m) => (
                          <option key={m.id_mediopago || m.nombre_medio_pago} value={m.nombre_medio_pago}>
                            {m.nombre_medio_pago}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="Efectivo">Efectivo</option>
                          <option value="Transferencia">Transferencia Virtual</option>
                          <option value="Tarjeta">Tarjeta de Débito / Crédito</option>
                          <option value="Mercado Pago">Mercado Pago / QR</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* Fila 2: Filtros Temporales (Fecha Desde / Hasta) y Acción */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-800 items-end">
                  <div className="sm:col-span-4">
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

                  <div className="sm:col-span-4">
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

                  <div className="sm:col-span-4 flex items-center justify-end gap-2">
                    <button
                      type="submit"
                      disabled={cargandoLista}
                      className="w-full py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs font-bold tracking-wide shadow-lg shadow-cyan-500/25 disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer font-mono"
                    >
                      {cargandoLista ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Filtrando...</span>
                        </>
                      ) : (
                        <>
                          <span>⚡</span>
                          <span>Filtrar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Píldora de estado de filtro de medio de pago activo */}
                {medioPagoFiltro && (
                  <div className="pt-2 flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400">Filtro de canal activo:</span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      <span>💳 {medioPagoFiltro}</span>
                      <button
                        type="button"
                        onClick={() => handleCambioMedioPago('')}
                        className="hover:text-white transition-colors cursor-pointer ml-1"
                        title="Quitar filtro de medio de pago"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                )}
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
                    Prueba modificando el rango de fechas, el estado del pago o el medio de pago.
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
                    const nomMedio = (t.medio_pago || '').toLowerCase();
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

                            {/* Badge Interactivo de Medio de Pago */}
                            {t.medio_pago ? (
                              <button
                                type="button"
                                onClick={() => handleCambioMedioPago(t.medio_pago)}
                                title={`Filtrar operaciones por ${t.medio_pago}`}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                                  nomMedio.includes('efectivo')
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20'
                                    : nomMedio.includes('transf')
                                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/20'
                                    : nomMedio.includes('tarjet')
                                    ? 'bg-violet-500/10 text-violet-300 border-violet-500/40 hover:bg-violet-500/20'
                                    : nomMedio.includes('mercado') || nomMedio.includes('qr')
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20'
                                    : 'bg-purple-500/10 text-purple-300 border-purple-500/40 hover:bg-purple-500/20'
                                }`}
                              >
                                <span>💳</span>
                                <span>{t.medio_pago}</span>
                              </button>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-500 bg-slate-800/80 border border-slate-700">
                                Sin liquidar
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
                              className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs font-bold tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer font-mono"
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
                              className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-700 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer font-mono"
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
