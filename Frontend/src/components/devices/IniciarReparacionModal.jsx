import { useState, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { formatearEstadoReparacion } from '../../utils/repairStatus';
import { API_BASE_URL } from '../../config/api';
import { extraerMensajeError, useMensajeTemporal } from '../../utils/errores';
import { obtenerCatalogoCacheado, esErrorCancelacion } from '../../utils/cacheCatalogos';
import { useAccesibilidadModal } from '../../hooks/useAccesibilidadModal';
import { useMediosPagoActivos } from '../../hooks/useMediosPagoActivos';
import { TIPOS_MODAL_PAGO } from '../../utils/mediosPago';
import PaymentMethodModalDispatcher from '../payments/PaymentMethodModalDispatcher';

/**
 * Modal Inteligente para Iniciar Reparación de un Dispositivo (React + Vite + Tailwind v4).
 * Cobro de Diagnóstico por Adelantado / Pasarela de Pagos (Mercado Pago QR & Presencial).
 * Estética Cyber-Tech: Fondo #0F172A, Tarjetas #1E293B, Acentos #06B6D4 y #8B5CF6.
 * Flujo wizard: 'FORM' -> 'CONFIRM' -> 'QR_PAGO' (si MP) -> 'SUCCESS'.
 */
export default function IniciarReparacionModal({
  isOpen,
  onClose,
  dispositivo,
  onSuccess
}) {
  const { token } = useAuth();

  // Paso del wizard: 'FORM' | 'CONFIRM' | 'QR_PAGO' | 'SUCCESS'
  const [paso, setPaso] = useState('FORM');

  // Catálogo de categorías disponibles
  const [categorias, setCategorias] = useState([]);
  const [cargandoCategorias, setCargandoCategorias] = useState(false);

  // Parámetro institucional: Costo Base de Diagnóstico desde ConfiguracionSistema (sin importe falso hardcodeado - Fase 3 F5)
  const [costoDiagnostico, setCostoDiagnostico] = useState(null);
  const [cargandoCostoDiag, setCargandoCostoDiag] = useState(false);

  // Campos del formulario
  const [selectedCategorias, setSelectedCategorias] = useState([]);
  const [descripcion, setDescripcion] = useState('');
  const [credencial, setCredencial] = useState('');
  const [sinCredencial, setSinCredencial] = useState(false);
  const [aceptoTerminos, setAceptoTerminos] = useState(false);

  // Medios de pago dinámicos desde la base de datos (/api/sales/medios-pago/)
  const {
    mediosPago,
    medioSeleccionado,
    idMedioSeleccionado,
    setIdMedioSeleccionado,
    cargandoMediosPago,
    errorMediosPago,
    recargarMediosPago
  } = useMediosPagoActivos({
    habilitado: isOpen,
    metodoEntrega: 'PRESENCIAL',
    tipoPreferidoInicial: TIPOS_MODAL_PAGO.EFECTIVO
  });

  // Control del modal reutilizable de pasarela/instrucciones según el medio de pago seleccionado
  const [modalPagoAbierto, setModalPagoAbierto] = useState(false);
  const [pagoAcreditadoOnline, setPagoAcreditadoOnline] = useState(false);

  // Estados de control (useMensajeTemporal aplica auto-descarte a los 6 segundos - Regla Global 6)
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useMensajeTemporal();
  const [formTocado, setFormTocado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Estados para el buscador desplegable de categorías
  const [busquedaCategoria, setBusquedaCategoria] = useState('');
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const dropdownRef = useRef(null);

  // Respuesta de orden exitosa
  const [resultado, setResultado] = useState(null);

  // Carga de categorías y costo base al abrir el modal
  useEffect(() => {
    if (!isOpen) {
      // Reset de estados al cerrarse
      setPaso('FORM');
      setSelectedCategorias([]);
      setDescripcion('');
      setCredencial('');
      setSinCredencial(false);
      setAceptoTerminos(false);
      setModalPagoAbierto(false);
      setPagoAcreditadoOnline(false);
      setSubmitting(false);
      setErrorMessage('');
      setFormTocado(false);
      setCopiado(false);
      setResultado(null);
      setBusquedaCategoria('');
      setDropdownAbierto(false);
      return;
    }

    const controller = new AbortController();
    setCargandoCategorias(true);
    setCargandoCostoDiag(true);

    // 1. Obtener categorías activas (con caché en memoria y AbortController - Fase 2 F8)
    obtenerCatalogoCacheado(
      'workshop:categorias-reparacion-activas',
      '/api/workshop/categorias-reparacion/?estado=true',
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      }
    )
      .then((datos) => {
        const lista = Array.isArray(datos) ? datos : [];
        const activas = lista.filter((c) => c.estado_activo !== false);
        setCategorias(activas);
      })
      .catch((err) => {
        if (esErrorCancelacion(err)) return;
        console.error('Error al cargar categorías de reparación:', err);
        setErrorMessage(
          extraerMensajeError(err, 'No fue posible cargar las categorías de reparación activas.')
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoCategorias(false);
      });

    // 2. Obtener costo de diagnóstico base parametrizable (con caché en memoria)
    obtenerCatalogoCacheado(
      'workshop:configuracion-diagnostico',
      '/api/workshop/configuracion-diagnostico/',
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      }
    )
      .then((datos) => {
        if (datos?.costo_diagnostico_base !== undefined) {
          setCostoDiagnostico(Number(datos.costo_diagnostico_base));
        }
      })
      .catch((err) => {
        if (!esErrorCancelacion(err)) {
          console.warn('No se pudo obtener el costo oficial de diagnóstico:', err);
          setCostoDiagnostico(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoCostoDiag(false);
      });

    return () => {
      controller.abort();
    };
  }, [isOpen, token]);

  // Cerrar el dropdown al hacer clic fuera del componente
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Categorías filtradas en tiempo real según el texto escrito
  const categoriasFiltradas = useMemo(() => {
    const q = busquedaCategoria.toLowerCase().trim();
    if (!q) return categorias;
    return categorias.filter((c) => (c.nombre || '').toLowerCase().includes(q));
  }, [categorias, busquedaCategoria]);

  // Toggle de selección de categoría
  const handleToggleCategoria = (idCat) => {
    setSelectedCategorias((prev) =>
      prev.includes(idCat) ? prev.filter((id) => id !== idCat) : [...prev, idCat]
    );
  };

  // Toggle del checkbox "Sin contraseña / Ninguna"
  const handleToggleSinCredencial = (e) => {
    const checked = e.target.checked;
    setSinCredencial(checked);
    if (checked) {
      setCredencial('Ninguna');
    } else {
      setCredencial('');
    }
  };

  // Validación para avanzar de 'FORM' a 'CONFIRM'
  const handleAvanzarAConfirmacion = (e) => {
    e.preventDefault();
    setFormTocado(true);

    if (selectedCategorias.length === 0) {
      setErrorMessage('Debes seleccionar al menos una categoría de reparación.');
      return;
    }

    const descLimpia = descripcion.trim();
    if (descLimpia.length < 10) {
      setErrorMessage('La descripción del problema debe contener al menos 10 caracteres.');
      return;
    }

    const credencialLimpia = credencial.trim();
    if (!credencialLimpia) {
      setErrorMessage(
        'Por favor indica una credencial de acceso para pruebas o marca la opción "Sin contraseña / Ninguna".'
      );
      return;
    }

    if (!aceptoTerminos) {
      setErrorMessage('Debes aceptar los términos y condiciones para continuar.');
      return;
    }

    if (cargandoCostoDiag || costoDiagnostico === null) {
      setErrorMessage(
        'Aguarda a que se cargue la tarifa oficial de diagnóstico del sistema antes de continuar.'
      );
      return;
    }

    // Todo válido, pasar al paso de confirmación y selección de pago
    setErrorMessage('');
    setPaso('CONFIRM');
  };

  // Envío final del servicio al confirmar y apertura del modal del medio de pago elegido
  const handleConfirmarReparacion = async () => {
    if (!dispositivo?.id_dispositivo) {
      setErrorMessage('No se encontró el identificador del equipo seleccionado.');
      setPaso('FORM');
      return;
    }

    if (!medioSeleccionado) {
      setErrorMessage('Debes seleccionar un medio de pago habilitado para continuar.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const payload = {
        id_dispositivo: dispositivo.id_dispositivo,
        descripcion_problema: descripcion.trim(),
        credencial_acceso: credencial.trim() || 'Ninguna',
        ids_categorias: selectedCategorias,
        medio_pago: String(
          medioSeleccionado.id_mediopago ||
            medioSeleccionado.codigo ||
            medioSeleccionado.nombre_medio_pago
        )
      };

      const res = await axios.post(
        `${API_BASE_URL}/api/workshop/reparaciones/iniciar/`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        }
      );

      const ordenCreada = res.data;
      setResultado(ordenCreada);
      // Abrir el modal específico del medio de pago seleccionado (Mercado Pago, Transferencia, Tarjeta o Efectivo)
      setModalPagoAbierto(true);
    } catch (err) {
      console.error('Error al iniciar la reparación:', err);
      setPaso('FORM');
      setErrorMessage(
        extraerMensajeError(
          err,
          'No fue posible iniciar la reparación. Verifica que el equipo no posea otra orden activa.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Callbacks del modal reutilizable de medio de pago
  const handlePagoModalConfirmado = (datosPago) => {
    if (datosPago?.tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO) {
      setResultado((prev) => (prev ? { ...prev, estado_pago: 'PAGADA' } : prev));
      setPagoAcreditadoOnline(true);
    }
    setModalPagoAbierto(false);
    setPaso('SUCCESS');
  };

  const handlePagoModalPendiente = () => {
    setModalPagoAbierto(false);
    setPaso('SUCCESS');
  };

  // Copiar código de seguridad al portapapeles
  const handleCopiarCodigo = () => {
    if (!resultado?.codigo_seguridad) return;
    navigator.clipboard.writeText(resultado.codigo_seguridad);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  // Cierre final del modal y notificación al componente padre
  const handleCerrarFinal = () => {
    const ordenCreada = resultado;
    onClose();
    if (ordenCreada && typeof onSuccess === 'function') {
      onSuccess(ordenCreada);
    }
  };

  const { contenedorRef: modalAccesibilidadRef } = useAccesibilidadModal(
    isOpen,
    onClose,
    submitting
  );

  if (!isOpen) return null;

  // Cálculos reactivos de validación
  const descCaracteres = descripcion.trim().length;
  const descValida = descCaracteres >= 10;
  const categoriasSeleccionadasInfo = categorias.filter((c) =>
    selectedCategorias.includes(c.id_categoria)
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          ref={modalAccesibilidadRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-iniciar-reparacion-titulo"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl shadow-cyan-950/50 text-[#F8FAFC] my-8 overflow-hidden font-sans"
        >
          {/* ============================================================== */}
          {/* CABECERA DINÁMICA DEL MODAL SEGÚN EL PASO                      */}
          {/* ============================================================== */}
          <div className="flex items-center justify-between p-5 border-b border-slate-700/70 bg-[#162032]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div>
                <h3 id="modal-iniciar-reparacion-titulo" className="text-base sm:text-lg font-black text-white tracking-tight">
                  Iniciar Orden de Reparación
                </h3>
                <p className="text-xs text-slate-300 font-medium">
                  {dispositivo?.marca} {dispositivo?.modelo} • N/S: {dispositivo?.numero_serie || 'S/N'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
              title="Cerrar modal (Esc)"
            >
              ✕
            </button>
          </div>

          {/* ============================================================== */}
          {/* ALERTA DE ERROR GLOBAL CON TRANSICIÓN SUAVE (REGLA 6 UX)       */}
          {/* ============================================================== */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                role="alert"
                aria-live="assertive"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="mx-6 mt-4 p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2.5 shadow-lg"
              >
                <span className="text-base leading-none">⚠️</span>
                <span className="flex-1 font-medium">{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  aria-label="Cerrar alerta de error"
                  className="text-rose-400 hover:text-rose-100 font-bold ml-1"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ============================================================== */}
          {/* PASO 1: FORMULARIO TÉCNICO ('FORM')                            */}
          {/* ============================================================== */}
          {paso === 'FORM' && (
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Tarifa Oficial de Diagnóstico Técnico Destacada */}
              <div className="bg-gradient-to-r from-cyan-950/60 to-slate-900 border border-cyan-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                <div>
                  <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 uppercase tracking-wide">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    Tarifa Base de Diagnóstico Técnico
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5 max-w-sm">
                    Se abona una sola vez por cada ciclo de servicio. Cubre la revisión exhaustiva en banco de trabajo y la emisión del presupuesto oficial.
                  </p>
                </div>
                <div className="text-left sm:text-right shrink-0 bg-slate-950/70 px-3.5 py-2 rounded-xl border border-cyan-500/30 min-w-[140px]">
                  {cargandoCostoDiag ? (
                    <div className="space-y-1.5 py-0.5" aria-busy="true">
                      <div className="h-5 w-24 bg-slate-800 rounded animate-pulse sm:ml-auto" />
                      <div className="h-3 w-20 bg-slate-800/70 rounded animate-pulse sm:ml-auto" />
                    </div>
                  ) : costoDiagnostico !== null ? (
                    <>
                      <span className="text-lg font-black text-white font-mono block">
                        ${costoDiagnostico.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-cyan-400 font-mono font-bold tracking-wider">
                        ARS • PAGO ÚNICO
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-semibold text-amber-300 font-mono block">
                      Sincronizando tarifa...
                    </span>
                  )}
                </div>
              </div>

              <form onSubmit={handleAvanzarAConfirmacion} className="space-y-5">
                {/* 1. Selector Multicategoría */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      Categorías de Falla
                    </label>
                    <span className="text-[11px] font-mono text-cyan-400 font-semibold">
                      {selectedCategorias.length} seleccionada(s)
                    </span>
                  </div>

                  <div ref={dropdownRef} className="relative">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setDropdownAbierto((prev) => !prev)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setDropdownAbierto((prev) => !prev);
                        }
                      }}
                      className={`w-full min-h-[46px] p-2.5 rounded-xl bg-slate-900 border text-xs cursor-pointer flex items-center justify-between gap-2 transition-all ${
                        dropdownAbierto
                          ? 'border-[#06B6D4] ring-2 ring-[#06B6D4]/30 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex flex-wrap gap-1.5 flex-1 items-center">
                        {selectedCategorias.length === 0 ? (
                          <span className="text-slate-400 text-xs">
                            {cargandoCategorias
                              ? 'Cargando categorías activas...'
                              : 'Selecciona una o más categorías de falla...'}
                          </span>
                        ) : (
                          categoriasSeleccionadasInfo.map((cat) => (
                            <span
                              key={cat.id_categoria}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold"
                            >
                              {cat.nombre}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleCategoria(cat.id_categoria);
                                }}
                                className="text-cyan-400 hover:text-white ml-0.5 font-bold"
                              >
                                ×
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      <span className="text-slate-400 text-xs shrink-0 px-1">
                        {dropdownAbierto ? '▲' : '▼'}
                      </span>
                    </div>

                    {dropdownAbierto && (
                      <div className="absolute z-30 left-0 right-0 mt-1.5 p-2 rounded-xl bg-[#0F172A] border border-slate-700 shadow-2xl max-h-60 overflow-y-auto space-y-1">
                        <input
                          type="text"
                          value={busquedaCategoria}
                          onChange={(e) => setBusquedaCategoria(e.target.value)}
                          placeholder="Buscar categoría..."
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4] mb-1.5"
                        />

                        {categoriasFiltradas.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            No se encontraron categorías coincidentes.
                          </div>
                        ) : (
                          categoriasFiltradas.map((cat) => {
                            const isSelected = selectedCategorias.includes(cat.id_categoria);
                            return (
                              <button
                                key={cat.id_categoria}
                                type="button"
                                onClick={() => handleToggleCategoria(cat.id_categoria)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                                  isSelected
                                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                                    : 'text-slate-300 hover:bg-slate-800'
                                }`}
                              >
                                <span>{cat.nombre}</span>
                                {isSelected && <span className="text-cyan-400 font-bold">✓</span>}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                  {formTocado && selectedCategorias.length === 0 && (
                    <p className="text-[11px] text-amber-400 font-medium">
                      Debes seleccionar al menos una categoría de reparación.
                    </p>
                  )}
                </div>

                {/* 2. Descripción del Problema */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="descripcion_problema"
                      className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      Descripción del Problema o Falla
                    </label>
                    <span
                      className={`text-[11px] font-mono ${
                        descValida ? 'text-cyan-400 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {descCaracteres}/1000 caract. {descCaracteres < 10 && '(mín. 10)'}
                    </span>
                  </div>

                  <textarea
                    id="descripcion_problema"
                    rows={3}
                    maxLength={1000}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Describe en detalle qué falla presenta el dispositivo (ej: 'El equipo se reinicia solo al abrir juegos y recalienta la parte trasera...')"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-[#F8FAFC] placeholder-slate-500 text-xs font-medium transition-all focus:outline-none focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 resize-none"
                  />
                  {descripcion.length > 0 && !descValida && (
                    <p className="text-[11px] text-amber-400 font-medium">
                      La descripción debe contener al menos 10 caracteres (faltan {10 - descCaracteres}).
                    </p>
                  )}
                </div>

                {/* 3. Credencial de Acceso para Pruebas */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <label
                        htmlFor="credencial_acceso"
                        className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-1.5"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        Credencial de Acceso para Pruebas
                      </label>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        PIN, patrón o contraseña requerida para testear componentes (cámaras, sensores, pantalla) tras reparar.
                      </p>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none shrink-0 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-cyan-500/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={sinCredencial}
                        onChange={handleToggleSinCredencial}
                        className="rounded border-slate-700 text-[#06B6D4] focus:ring-[#06B6D4]/30 w-3.5 h-3.5 accent-[#06B6D4] cursor-pointer"
                      />
                      <span className="text-[11px] font-medium text-slate-300">
                        Sin contraseña / Ninguna
                      </span>
                    </label>
                  </div>

                  <input
                    id="credencial_acceso"
                    type="text"
                    disabled={sinCredencial}
                    value={credencial}
                    onChange={(e) => setCredencial(e.target.value)}
                    placeholder="Ej: PIN 1234, Patrón en forma de 'L', o Contraseña"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-[#F8FAFC] placeholder-slate-500 text-xs font-medium transition-all focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Checkbox Obligatorio Términos y Condiciones */}
                <div className="pt-2 pb-1 flex items-start gap-2.5 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    id="acepto_terminos"
                    checked={aceptoTerminos}
                    onChange={(e) => setAceptoTerminos(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded bg-slate-900 border-slate-700 text-[#06B6D4] focus:ring-[#06B6D4]/40 cursor-pointer"
                  />
                  <label htmlFor="acepto_terminos" className="text-xs text-slate-300 leading-relaxed cursor-pointer select-none">
                    Acepto los <a href="/terminos" target="_blank" rel="noopener noreferrer" className="text-[#06B6D4] underline font-semibold hover:text-cyan-300">términos y condiciones</a> del servicio técnico y diagnóstico de IFixPos.
                  </label>
                </div>

                {/* Botones de Acción */}
                <div className="pt-4 border-t border-slate-700/60 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={cargandoCostoDiag || costoDiagnostico === null}
                    className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.35)] hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>Continuar al Pago</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ============================================================== */}
          {/* PASO 2: PASARELA DE PAGO Y CONFIRMACIÓN ('CONFIRM')            */}
          {/* ============================================================== */}
          {paso === 'CONFIRM' && (
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="border-b border-slate-700/60 pb-3">
                <span className="px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/30 text-[10px] font-mono font-semibold uppercase tracking-wider">
                  Paso 2 • Modalidad de Pago
                </span>
                <h4 className="text-lg font-black text-white tracking-tight mt-1.5">
                  Selecciona cómo abonar el Diagnóstico
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  El importe es de{' '}
                  <strong className="text-white">${costoDiagnostico.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS</strong>.
                  Selecciona cualquiera de los medios de pago habilitados.
                </p>
              </div>

              {/* Selector Dinámico de Medios de Pago desde Base de Datos */}
              {cargandoMediosPago ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2].map((idx) => (
                    <div
                      key={idx}
                      className="h-32 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse p-4"
                    />
                  ))}
                </div>
              ) : errorMediosPago ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-center justify-between gap-3">
                  <span>{errorMediosPago}</span>
                  <button
                    type="button"
                    onClick={recargarMediosPago}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 font-bold transition-colors cursor-pointer"
                  >
                    Reintentar
                  </button>
                </div>
              ) : mediosPago.length === 0 ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                  No hay medios de pago activos configurados en el sistema en este momento.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {mediosPago.map((medio) => {
                    const seleccionado =
                      String(medio.id_mediopago) === String(idMedioSeleccionado);
                    const icono =
                      medio.tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO
                        ? '📱'
                        : medio.tipoModal === TIPOS_MODAL_PAGO.TRANSFERENCIA
                        ? '🏦'
                        : medio.tipoModal === TIPOS_MODAL_PAGO.TARJETA
                        ? '💳'
                        : '💵';

                    return (
                      <div
                        key={medio.id_mediopago}
                        role="button"
                        tabIndex={0}
                        onClick={() => setIdMedioSeleccionado(medio.id_mediopago)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setIdMedioSeleccionado(medio.id_mediopago);
                          }
                        }}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer select-none space-y-2 ${
                          seleccionado
                            ? 'bg-slate-900/90 border-[#06B6D4] shadow-[0_0_20px_rgba(6,182,212,0.22)]'
                            : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 opacity-85 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">{icono}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
                              {medio.etiquetaBadge}
                            </span>
                            <span
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                seleccionado
                                  ? 'border-cyan-400 bg-cyan-400'
                                  : 'border-slate-600'
                              }`}
                            >
                              {seleccionado && (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                              )}
                            </span>
                          </div>
                        </div>
                        <div>
                          <h5 className="text-sm font-bold text-white">
                            {medio.nombre_medio_pago}
                          </h5>
                          <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                            {medio.descripcionCorta}
                          </p>
                        </div>
                        {Number(medio.recargo) > 0 && (
                          <div className="text-[10px] text-amber-300 font-medium bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                            Recargo financiero: {Number(medio.recargo)}%
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Aviso dinámico según la modalidad elegida */}
              {medioSeleccionado && (
                <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-xs flex items-start gap-3">
                  <span className="text-xl">
                    {medioSeleccionado.esPasarelaOnline ? '📲' : '🔔'}
                  </span>
                  <div className="space-y-1">
                    <p className="font-bold text-white">
                      Modalidad seleccionada: {medioSeleccionado.nombre_medio_pago}
                    </p>
                    <p className="leading-relaxed text-cyan-200/90">
                      {medioSeleccionado.tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO
                        ? 'Al confirmar se abrirá el modal de Mercado Pago con el código QR oficial y enlace directo para abonar tu diagnóstico.'
                        : medioSeleccionado.tipoModal === TIPOS_MODAL_PAGO.TRANSFERENCIA
                        ? 'Al confirmar se abrirá el modal con los datos bancarios (CBU / Alias) para realizar la transferencia.'
                        : `Al confirmar se abrirá el detalle de confirmación para abonar $${costoDiagnostico.toLocaleString('es-AR')} ARS mediante ${medioSeleccionado.nombre_medio_pago}.`}
                    </p>
                  </div>
                </div>
              )}

              {/* Resumen Compacto de la Orden */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 text-xs space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>Dispositivo:</span>
                  <span className="text-white font-semibold">{dispositivo?.marca} {dispositivo?.modelo}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Categorías:</span>
                  <span className="text-cyan-300 font-medium">
                    {categoriasSeleccionadasInfo.map((c) => c.nombre).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400 border-t border-slate-800/80 pt-2 font-bold">
                  <span className="text-white">Importe Diagnóstico:</span>
                  <span className="text-cyan-400 font-mono text-sm">
                    ${costoDiagnostico.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                  </span>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="pt-3 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setPaso('FORM')}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50"
                >
                  Volver a editar
                </button>

                <button
                  type="button"
                  disabled={submitting || !medioSeleccionado || cargandoMediosPago}
                  onClick={handleConfirmarReparacion}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Generando orden...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {medioSeleccionado?.tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO
                          ? 'Continuar y Abrir Mercado Pago'
                          : 'Confirmar y Abrir Modal de Pago'}
                      </span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* PASO FINAL: TICKET DE ÉXITO ('SUCCESS')                        */}
          {/* ============================================================== */}
          {paso === 'SUCCESS' && resultado && (
            <div className="p-6 sm:p-8 text-center space-y-6">
              {/* Ícono de Confirmación */}
              <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-500 to-emerald-400 p-1 shadow-[0_0_35px_rgba(6,182,212,0.5)]">
                <div className="w-full h-full rounded-full bg-[#1E293B] flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-cyan-400 animate-[bounce_1s_ease-in-out_1]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
              </div>

              {/* Título de la Orden */}
              <div>
                <h4 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  ¡Orden de Servicio Creada!
                </h4>
                <p className="text-xs text-slate-300 mt-1">
                  La orden se ha registrado formalmente para{' '}
                  <span className="font-semibold text-cyan-300">
                    {dispositivo?.marca} {dispositivo?.modelo}
                  </span>
                  .
                </p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-xs font-semibold">
                    Servicio Técnico Registrado
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30 text-xs font-medium">
                    {formatearEstadoReparacion(resultado.etapa)}
                  </span>
                </div>
              </div>

              {/* Token de Seguridad para Presentar en Mostrador */}
              <div className="p-6 rounded-2xl bg-gradient-to-b from-[#090D16] to-[#0F172A] border-2 border-[#06B6D4] shadow-[0_0_30px_rgba(6,182,212,0.25)] relative overflow-hidden group">
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400 block mb-1">
                  CÓDIGO PARA PRESENTAR EN MOSTRADOR
                </span>

                <div className="flex items-center justify-center gap-3 my-2">
                  <span className="font-mono text-3xl sm:text-4xl font-black text-cyan-300 tracking-[0.25em] drop-shadow-[0_2px_12px_rgba(6,182,212,0.6)] select-all">
                    {resultado.codigo_seguridad}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopiarCodigo}
                    title="Copiar Código"
                    className="p-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-all hover:scale-105 active:scale-95 text-xs font-mono flex items-center gap-1"
                  >
                    {copiado ? (
                      <>
                        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span className="text-emerald-400 text-[11px] font-bold">¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                          />
                        </svg>
                        <span className="text-[11px]">Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Banner de Estado Financiero de la Orden */}
                {pagoAcreditadoOnline || resultado.estado_pago === 'PAGADA' ? (
                  <div className="mt-3 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300">
                    ✓ Diagnóstico abonado online exitosamente (${costoDiagnostico.toLocaleString('es-AR')} ARS). Presenta este código al entregar el equipo.
                  </div>
                ) : (
                  <div className="mt-3 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200">
                    ⚠️ Debe asistir con su DNI y abonar el costo del diagnóstico (${costoDiagnostico.toLocaleString('es-AR')} ARS) para iniciar el proceso.
                  </div>
                )}
              </div>

              {/* Nota sobre el Remito Oficial por Correo */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-center justify-center gap-2">
                <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  Se ha generado automáticamente la <strong>Orden de Servicio (Remito de Ingreso) en PDF</strong> y fue remitida a su casilla de correo.
                </span>
              </div>

              {/* Botón de Cierre */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleCerrarFinal}
                  className="w-full sm:w-auto min-w-[200px] px-6 py-3 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-sm font-bold transition-all shadow-[0_0_25px_rgba(6,182,212,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  Entendido y Finalizar
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Modal reutilizable del medio de pago seleccionado */}
        <PaymentMethodModalDispatcher
          isOpen={modalPagoAbierto}
          onClose={handlePagoModalPendiente}
          medioPago={medioSeleccionado}
          idVenta={resultado?.id_venta || null}
          montoTotal={costoDiagnostico || 0}
          concepto={`Diagnóstico Técnico • ${dispositivo?.marca || ''} ${dispositivo?.modelo || ''}`.trim()}
          codigoSeguridad={resultado?.codigo_seguridad || null}
          permitirContinuarPendiente={true}
          textoBotonPendiente="Continuar y abonar al entregar el equipo"
          textoConfirmar="Confirmar compromiso de pago y ver Token"
          onPagoConfirmado={handlePagoModalConfirmado}
          onContinuarPendiente={handlePagoModalPendiente}
        />
      </div>
    </AnimatePresence>
  );
}

IniciarReparacionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  dispositivo: PropTypes.shape({
    id_dispositivo: PropTypes.number,
    marca: PropTypes.string,
    modelo: PropTypes.string,
    tipo: PropTypes.string,
    numero_serie: PropTypes.string,
    imagen: PropTypes.string
  }),
  onSuccess: PropTypes.func
};
