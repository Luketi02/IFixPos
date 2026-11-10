import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { formatearMoneda } from '../../utils/productImages';
import { obtenerCatalogoCacheado } from '../../utils/cacheCatalogos';
import { procesarMediosPagoActivos, TIPOS_MODAL_PAGO } from '../../utils/mediosPago';

import { API_BASE_URL } from '../../config/api';
export default function GuestCheckoutModal({
  isOpen,
  onClose,
  items = [],
  onCompraExitosa
}) {
  // Estados del Formulario de Contacto y Facturación
  const [nombreContacto, setNombreContacto] = useState('');
  const [emailContacto, setEmailContacto] = useState('');
  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [dniContacto, setDniContacto] = useState('');

  // Modalidad de Entrega
  const [metodoEntrega, setMetodoEntrega] = useState('RETIRO'); // 'RETIRO' | 'ENVIO'
  const [calle, setCalle] = useState('');
  const [numero, setNumero] = useState('');
  const [pisoDepto, setPisoDepto] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');

  // Catálogos geográficos en cascada: País -> Provincia -> Ciudad
  const [idPais, setIdPais] = useState('');
  const [idProvincia, setIdProvincia] = useState('');
  const [idCiudad, setIdCiudad] = useState('');

  const [paises, setPaises] = useState([]);
  const [provincias, setProvincias] = useState([]);
  const [ciudades, setCiudades] = useState([]);

  const [isLoadingPaises, setIsLoadingPaises] = useState(false);
  const [isLoadingProvincias, setIsLoadingProvincias] = useState(false);
  const [isLoadingCiudades, setIsLoadingCiudades] = useState(false);
  const [isLoadingCostoEnvio, setIsLoadingCostoEnvio] = useState(false);

  // Medios de Pago registrados, permitidos y activos por el Administrador
  const [mediosPago, setMediosPago] = useState([]);
  const [idMedioPago, setIdMedioPago] = useState(null);
  const [isLoadingMedios, setIsLoadingMedios] = useState(false);

  // Estados de cálculo y respuesta
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [ordenCompletada, setOrdenCompletada] = useState(null);

  // 1. Cargar Países y Medios de Pago activos al abrir el modal
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage('');
    setOrdenCompletada(null);

    const cargarCatalogosIniciales = async () => {
      // Cargar lista de Países (solo si no están cargados en memoria)
      if (paises.length === 0) {
        setIsLoadingPaises(true);
        try {
          const resPaises = await axios.get(`${API_BASE_URL}/api/geo/paises/`);
          const listaPaises = Array.isArray(resPaises.data) ? resPaises.data : (resPaises.data?.results || []);
          setPaises(listaPaises);

          // Preseleccionar Argentina o el primer país habilitado
          if (listaPaises.length > 0) {
            const predeterminado = listaPaises.find((p) =>
              (p.nombre_pais || p.nombre || '').toLowerCase().includes('arg')
            ) || listaPaises[0];
            setIdPais(String(predeterminado.id_pais));
          }
        } catch (err) {
          console.warn('Inconveniente al cargar países:', err);
        } finally {
          setIsLoadingPaises(false);
        }
      }

      // Cargar Medios de Pago registrados y habilitados en el sistema (con caché y filtrado activo)
      if (mediosPago.length === 0) {
        setIsLoadingMedios(true);
        try {
          const resMedios = await obtenerCatalogoCacheado(
            'sales:medios-pago',
            '/api/sales/medios-pago/'
          );
          const listaMedios = Array.isArray(resMedios) ? resMedios : (resMedios?.results || []);
          const activos = listaMedios.filter((m) => Boolean(m.estado));
          setMediosPago(activos);
          if (activos.length > 0) {
            setIdMedioPago((prev) => (prev && activos.some(a => a.id_mediopago === prev) ? prev : activos[0].id_mediopago));
          }
        } catch (err) {
          console.warn('Inconveniente al cargar medios de pago:', err);
        } finally {
          setIsLoadingMedios(false);
        }
      }
    };

    cargarCatalogosIniciales();
  }, [isOpen]);

  // 2. Cargar Provincias en cascada al cambiar País
  useEffect(() => {
    if (!idPais) {
      setProvincias([]);
      setIdProvincia('');
      setCiudades([]);
      setIdCiudad('');
      return;
    }

    const cargarProvincias = async () => {
      setIsLoadingProvincias(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/geo/paises/${idPais}/provincias/`);
        const listaP = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        setProvincias(listaP);
        setIdProvincia('');
        setCiudades([]);
        setIdCiudad('');
      } catch (err) {
        console.warn('Error al cargar provincias del país seleccionado:', err);
        setProvincias([]);
      } finally {
        setIsLoadingProvincias(false);
      }
    };

    cargarProvincias();
  }, [idPais]);

  // 3. Cargar Ciudades en cascada al cambiar Provincia
  useEffect(() => {
    if (!idProvincia) {
      setCiudades([]);
      setIdCiudad('');
      setCostoEnvio(0);
      return;
    }

    const cargarCiudades = async () => {
      setIsLoadingCiudades(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/geo/provincias/${idProvincia}/ciudades/`);
        const listaC = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        setCiudades(listaC);
        setIdCiudad('');
        setCostoEnvio(0);
      } catch (err) {
        console.warn('Error al cargar ciudades de la provincia:', err);
        setCiudades([]);
      } finally {
        setIsLoadingCiudades(false);
      }
    };

    cargarCiudades();
  }, [idProvincia]);

  // 4. Cotización dinámica de flete al seleccionar Ciudad para entrega a domicilio
  useEffect(() => {
    if (metodoEntrega !== 'ENVIO' || !idCiudad) {
      setCostoEnvio(0);
      return;
    }

    const cotizarEnvio = async () => {
      setIsLoadingCostoEnvio(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/sales/compras/costo-envio/?id_ciudad=${idCiudad}`);
        if (res.data && res.data.costo !== undefined) {
          setCostoEnvio(Number(res.data.costo));
        }
      } catch (err) {
        console.warn('Inconveniente al cotizar costo de flete:', err);
      } finally {
        setIsLoadingCostoEnvio(false);
      }
    };

    cotizarEnvio();
  }, [idCiudad, metodoEntrega]);

  // Subtotal de productos
  const subtotalProductos = useMemo(() => {
    return items.reduce((acc, it) => {
      const precio = parseFloat(it.precio_venta || 0);
      const cant = parseInt(it.cantidad || 1, 10);
      return acc + precio * cant;
    }, 0);
  }, [items]);

  const totalCalculado = useMemo(() => {
    return subtotalProductos + (metodoEntrega === 'ENVIO' ? parseFloat(costoEnvio || 0) : 0);
  }, [subtotalProductos, metodoEntrega, costoEnvio]);

  // Memoización de opciones de selectores para acelerar el renderizado en escritura
  const opcionesPaises = useMemo(() => {
    return paises.map((pa) => (
      <option key={pa.id_pais} value={pa.id_pais}>
        {pa.nombre_pais || pa.nombre}
      </option>
    ));
  }, [paises]);

  const opcionesProvincias = useMemo(() => {
    return provincias.map((p) => (
      <option key={p.id_provincia} value={p.id_provincia}>
        {p.nombre_provincia || p.nombre}
      </option>
    ));
  }, [provincias]);

  const opcionesCiudades = useMemo(() => {
    return ciudades.map((c) => (
      <option key={c.id_ciudad} value={c.id_ciudad}>
        {c.nombre_ciudad || c.nombre}
      </option>
    ));
  }, [ciudades]);

  const mediosPagoProcesados = useMemo(() => {
    return procesarMediosPagoActivos(mediosPago, { metodoEntrega });
  }, [mediosPago, metodoEntrega]);

  // Si el usuario cambia a ENVIO y tenía seleccionado EFECTIVO, reajustar automáticamente al primer medio compatible
  useEffect(() => {
    if (mediosPagoProcesados.length === 0) return;
    const medioActual = mediosPagoProcesados.find((m) => m.id_mediopago === idMedioPago);
    if (!medioActual || medioActual.deshabilitado) {
      const primeroHabilitado = mediosPagoProcesados.find((m) => !m.deshabilitado);
      if (primeroHabilitado) {
        setIdMedioPago(primeroHabilitado.id_mediopago);
      }
    }
  }, [mediosPagoProcesados, idMedioPago]);

  const listaMediosPagoRender = useMemo(() => {
    return mediosPagoProcesados.map((m) => {
      const nombre = m.nombre_medio_pago || m.nombre || 'Medio de Pago';
      const esMP = m.tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO;
      const esEfectivo = m.tipoModal === TIPOS_MODAL_PAGO.EFECTIVO;
      const esTarjeta = m.tipoModal === TIPOS_MODAL_PAGO.TARJETA;
      const recargo = parseFloat(m.recargo || 0);
      const isSelected = idMedioPago === m.id_mediopago;
      const deshabilitado = Boolean(m.deshabilitado);

      return (
        <button
          key={m.id_mediopago}
          type="button"
          disabled={deshabilitado}
          onClick={() => {
            if (!deshabilitado) setIdMedioPago(m.id_mediopago);
          }}
          title={deshabilitado ? m.motivoDeshabilitado : nombre}
          className={`p-3 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-colors ${
            deshabilitado
              ? 'bg-slate-900/30 border-slate-800 text-slate-500 opacity-50 cursor-not-allowed'
              : isSelected
              ? 'bg-[#06B6D4]/10 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.2)] cursor-pointer'
              : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600 cursor-pointer'
          }`}
        >
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span>
                {esMP ? '💳' : esEfectivo ? '💵' : esTarjeta ? '💳' : '🏦'}
              </span>
              <span>{nombre}</span>
              {m.etiquetaBadge && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 border border-slate-700 font-mono uppercase">
                  {m.etiquetaBadge}
                </span>
              )}
            </div>
            {deshabilitado ? (
              <span className="text-[10px] text-amber-400 font-mono block">
                No disponible para envíos a domicilio
              </span>
            ) : recargo > 0 ? (
              <span className="text-[10px] text-amber-400 font-mono block">
                +{recargo}% recargo
              </span>
            ) : null}
          </div>
          {isSelected && (
            <span className="text-cyan-400 font-bold text-sm">✔</span>
          )}
        </button>
      );
    });
  }, [mediosPagoProcesados, idMedioPago]);

  // 5. Procesar Compra como Invitado
  const handleSubmitOrden = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    // Validaciones estrictas
    if (!nombreContacto.trim()) {
      setErrorMessage('Debe indicar su nombre completo o razón social.');
      return;
    }
    if (!emailContacto.trim() || !emailContacto.includes('@')) {
      setErrorMessage('Debe indicar un correo electrónico válido para recibir su factura.');
      return;
    }
    if (!telefonoContacto.trim()) {
      setErrorMessage('Debe indicar un teléfono o WhatsApp de contacto.');
      return;
    }
    if (!dniContacto.trim()) {
      setErrorMessage('El DNI / CUIL es obligatorio para la emisión del comprobante fiscal.');
      return;
    }
    if (!idMedioPago) {
      setErrorMessage('Debe seleccionar un medio de pago habilitado por la administración.');
      return;
    }

    const medioSeleccionado = mediosPagoProcesados.find((m) => m.id_mediopago === idMedioPago);
    if (!medioSeleccionado) {
      setErrorMessage('Debe seleccionar un medio de pago habilitado por la administración.');
      return;
    }
    if (medioSeleccionado.deshabilitado) {
      setErrorMessage(
        medioSeleccionado.motivoDeshabilitado ||
        'El medio de pago seleccionado no está disponible para envíos a domicilio.'
      );
      return;
    }

    if (metodoEntrega === 'ENVIO') {
      if (!idPais) {
        setErrorMessage('Debe seleccionar el país de entrega.');
        return;
      }
      if (!idProvincia) {
        setErrorMessage('Debe seleccionar la provincia de entrega.');
        return;
      }
      if (!idCiudad) {
        setErrorMessage('Debe seleccionar la ciudad de entrega.');
        return;
      }
      if (!calle.trim() || !numero.trim()) {
        setErrorMessage('Debe ingresar la calle y número para el envío a domicilio.');
        return;
      }
    }

    setIsSubmitting(true);

    const payload = {
      items: items.map((it) => ({
        id_producto: it.id_producto,
        cantidad: it.cantidad
      })),
      metodo_entrega: metodoEntrega,
      metodo_pago: parseInt(idMedioPago, 10),
      nombre_contacto: nombreContacto.trim(),
      email_contacto: emailContacto.trim(),
      telefono_contacto: telefonoContacto.trim(),
      dni_contacto: dniContacto.trim(),
      ...(metodoEntrega === 'ENVIO' ? {
        direccion_envio: {
          calle: calle.trim(),
          numero: numero.trim(),
          piso_depto: pisoDepto.trim(),
          codigo_postal: codigoPostal.trim() || 'S/N',
          id_ciudad: parseInt(idCiudad, 10)
        }
      } : {})
    };

    try {
      const response = await axios.post(`${API_BASE_URL}/api/sales/compras/invitado/`, payload);
      if (response.status === 201) {
        setOrdenCompletada(response.data.venta);
        if (onCompraExitosa) {
          onCompraExitosa(response.data.venta);
        }
      }
    } catch (err) {
      console.error('Error al procesar compra de invitado:', err);
      const detail = err.response?.data?.detail 
        || (typeof err.response?.data === 'string' ? err.response?.data : null)
        || err.response?.data?.items
        || err.response?.data?.dni_contacto
        || 'Ocurrió un inconveniente al procesar tu compra. Por favor verifica los datos.';
      setErrorMessage(Array.isArray(detail) ? detail.join(' ') : String(detail));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
        
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-3xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 text-slate-100 font-['Lexend'] my-8 transform-gpu will-change-transform"
        >
          {/* Botón de Cierre */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Cerrar ventana"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* VISTA 1: CONFIRMACIÓN EXITOSA */}
          {ordenCompletada ? (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center text-3xl text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.25)]">
                ✔
              </div>

              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  ¡Orden de Compra Generada con Éxito!
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
                  Hemos registrado tu pedido y despacharemos el comprobante y factura oficial en PDF a <strong className="text-cyan-400">{emailContacto}</strong>.
                </p>
              </div>

              {/* Código de Seguridad */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/80 max-w-md mx-auto space-y-1">
                <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase block">
                  {ordenCompletada.metodo_entrega === 'RETIRO' ? 'Código de Seguridad & Retiro' : 'Código de Seguridad & Envío'}
                </span>
                <span className="text-xl font-mono font-black text-cyan-400 tracking-widest block">
                  {ordenCompletada.codigo_sec}
                </span>
                <span className="text-[11px] text-slate-400 block pt-1">
                  {ordenCompletada.metodo_entrega === 'RETIRO'
                    ? 'Presenta este código al retirar en Sede Central.'
                    : 'Conserva este código para el seguimiento de tu envío.'}
                </span>
              </div>

              {/* Botón de Pago si aplica Mercado Pago */}
              {ordenCompletada.init_point && (
                <div className="pt-2">
                  <a
                    href={ordenCompletada.init_point}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-[#009EE3] hover:bg-[#0082ba] text-white font-bold text-sm shadow-[0_0_25px_rgba(0,158,227,0.35)] transition-all transform active:scale-95"
                  >
                    <span>Pagar con Mercado Pago</span>
                    <span>→</span>
                  </a>
                  {ordenCompletada.modo_simulacion && (
                    <span className="block text-[11px] text-amber-400/90 font-mono mt-2">
                      (Modo Simulación de Mercado Pago Activado)
                    </span>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
                >
                  Cerrar y Volver a la Tienda
                </button>
              </div>
            </div>
          ) : (
            /* VISTA 2: FORMULARIO DE CHECKOUT */
            <form onSubmit={handleSubmitOrden} className="space-y-6">
              
              {/* Encabezado */}
              <div className="border-b border-slate-700/60 pb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    Checkout de Invitado (Sin Cuenta)
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Completa tus datos obligatorios de contacto y facturación para emitir el comprobante y coordinar tu entrega.
                </p>
              </div>

              {/* Alerta de Error */}
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Columna 1: Datos de Contacto y Facturación */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider">
                    1. Datos de Contacto y Facturación
                  </h3>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Nombre y Apellido / Razón Social <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={nombreContacto}
                      onChange={(e) => setNombreContacto(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-cyan-400 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Correo Electrónico <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={emailContacto}
                      onChange={(e) => setEmailContacto(e.target.value)}
                      placeholder="tuemail@ejemplo.com"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-cyan-400 focus:outline-none transition-colors"
                    />
                    <span className="text-[10px] text-slate-400">Aquí enviaremos el comprobante y factura oficial.</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">
                        Teléfono <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={telefonoContacto}
                        onChange={(e) => setTelefonoContacto(e.target.value)}
                        placeholder="+54 9 379 4000000"
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-cyan-400 focus:outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">
                        DNI / CUIL <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={dniContacto}
                        onChange={(e) => setDniContacto(e.target.value)}
                        placeholder="Ej. 35123456"
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-cyan-400 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Modalidad de Entrega */}
                  <div className="pt-2 space-y-2">
                    <h3 className="text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider">
                      2. Modalidad de Entrega
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setMetodoEntrega('RETIRO');
                          setCostoEnvio(0);
                        }}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          metodoEntrega === 'RETIRO'
                            ? 'bg-cyan-500/10 border-cyan-500/60 text-white shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="text-sm font-bold block">🏬 Retiro en Local</div>
                        <span className="text-[10px] text-cyan-300 font-mono">Sin costo ($0.00)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMetodoEntrega('ENVIO')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          metodoEntrega === 'ENVIO'
                            ? 'bg-cyan-500/10 border-cyan-500/60 text-white shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="text-sm font-bold block">🚚 Envío a Domicilio</div>
                        <span className="text-[10px] text-slate-400 font-mono">Flete calculado</span>
                      </button>
                    </div>

                    {metodoEntrega === 'RETIRO' && (
                      <p className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                        📍 Podrás retirar tus productos inmediatamente en nuestra Sede Central presentando tu código de seguridad.
                      </p>
                    )}
                  </div>

                </div>

                {/* Columna 2: Dirección (si es Envío), Medio de Pago y Resumen */}
                <div className="space-y-4">
                  
                  {metodoEntrega === 'ENVIO' && (
                    <div className="space-y-3 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                      <h4 className="text-xs font-bold text-white flex items-center justify-between">
                        <span>Dirección de Entrega</span>
                        {isLoadingCostoEnvio && (
                          <span className="text-[10px] text-cyan-400 font-mono animate-pulse">Cotizando flete...</span>
                        )}
                      </h4>

                      {/* Selector de País */}
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400">
                          País <span className="text-rose-400">*</span>
                        </label>
                        <select
                          value={idPais}
                          onChange={(e) => setIdPais(e.target.value)}
                          required
                          disabled={isLoadingPaises}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs disabled:opacity-50 focus:border-cyan-400 focus:outline-none"
                        >
                          <option value="">{isLoadingPaises ? 'Cargando países...' : 'Seleccionar País...'}</option>
                          {opcionesPaises}
                        </select>
                      </div>

                      {/* Selectores de Provincia y Ciudad en Cascada */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400">
                            Provincia <span className="text-rose-400">*</span>
                          </label>
                          <select
                            value={idProvincia}
                            onChange={(e) => setIdProvincia(e.target.value)}
                            disabled={!idPais || isLoadingProvincias}
                            required
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs disabled:opacity-50 focus:border-cyan-400 focus:outline-none"
                          >
                            <option value="">
                              {isLoadingProvincias
                                ? 'Cargando...'
                                : (!idPais ? 'Elija País' : 'Seleccionar Provincia...')}
                            </option>
                            {opcionesProvincias}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400">
                            Ciudad <span className="text-rose-400">*</span>
                          </label>
                          <select
                            value={idCiudad}
                            onChange={(e) => setIdCiudad(e.target.value)}
                            disabled={!idProvincia || isLoadingCiudades}
                            required
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs disabled:opacity-50 focus:border-cyan-400 focus:outline-none"
                          >
                            <option value="">
                              {isLoadingCiudades
                                ? 'Cargando...'
                                : (!idProvincia ? 'Elija Provincia' : 'Seleccionar Ciudad...')}
                            </option>
                            {opcionesCiudades}
                          </select>
                        </div>
                      </div>

                      {/* Calle y Número */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="text-[10px] font-semibold text-slate-400">
                            Calle <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={calle}
                            onChange={(e) => setCalle(e.target.value)}
                            placeholder="Ej. Av. San Martín"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400">
                            Altura / N° <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={numero}
                            onChange={(e) => setNumero(e.target.value)}
                            placeholder="1234"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Piso/Dpto y Código Postal */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400">Piso / Dpto (Opcional)</label>
                          <input
                            type="text"
                            value={pisoDepto}
                            onChange={(e) => setPisoDepto(e.target.value)}
                            placeholder="Ej. 4 B"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400">Código Postal</label>
                          <input
                            type="text"
                            value={codigoPostal}
                            onChange={(e) => setCodigoPostal(e.target.value)}
                            placeholder="Ej. 3300"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. Selección de Medios de Pago Activos y Permitidos */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider">
                      3. Medio de Pago Habilitado
                    </h3>
                    {isLoadingMedios ? (
                      <p className="text-xs text-slate-400 font-mono animate-pulse">Cargando medios de pago autorizados...</p>
                    ) : mediosPago.length === 0 ? (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                        No hay medios de pago activos en el sistema actualmente. Por favor contáctese con la administración.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {listaMediosPagoRender}
                      </div>
                    )}
                  </div>

                  {/* 4. Resumen de la Orden */}
                  <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      Resumen del Pedido ({items.length} {items.length === 1 ? 'artículo' : 'artículos'})
                    </h4>

                    <div className="space-y-1 text-xs text-slate-300">
                      <div className="flex justify-between">
                        <span>Subtotal de productos:</span>
                        <span className="font-mono text-white">{formatearMoneda(subtotalProductos)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Costo de envío:</span>
                        <span className="font-mono text-cyan-400">
                          {metodoEntrega === 'RETIRO' ? 'Gratis ($0.00)' : formatearMoneda(costoEnvio)}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-700 flex justify-between text-sm font-bold text-white">
                        <span>Total Final:</span>
                        <span className="font-mono text-cyan-400 text-base">{formatearMoneda(totalCalculado)}</span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* Botones Inferiores */}
              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || items.length === 0}
                  className="px-7 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <span>Confirmar y Realizar Pedido</span>
                  )}
                </button>
              </div>

            </form>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
}

GuestCheckoutModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id_producto: PropTypes.number.isRequired,
      nombre: PropTypes.string,
      precio_venta: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      cantidad: PropTypes.number
    })
  ).isRequired,
  onCompraExitosa: PropTypes.func
};
