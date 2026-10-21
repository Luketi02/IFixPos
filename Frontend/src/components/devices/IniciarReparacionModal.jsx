import { useState, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { formatearEstadoReparacion } from '../../utils/repairStatus';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Extrae un mensaje legible ante distintas respuestas de error de Django REST Framework.
 */
const extraerMensajeError = (err, porDefecto = 'Ocurrió un error al procesar la solicitud.') => {
  const data = err?.response?.data;
  if (!data) return porDefecto;
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(String).join(' ');
  if (typeof data.error === 'string') return data.error;
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data === 'object') {
    const valores = Object.entries(data).map(([k, v]) => {
      const txt = Array.isArray(v) ? v.join(' ') : String(v);
      return k !== 'non_field_errors' && k !== 'error' ? `${k}: ${txt}` : txt;
    });
    return valores.length ? valores.join(' | ') : porDefecto;
  }
  return porDefecto;
};

/**
 * Modal para Iniciar Reparación de un Dispositivo (React + Vite + Tailwind v4).
 * Estética Cyber-Tech: Fondo #0F172A, Tarjetas #1E293B, Acentos #06B6D4 y #8B5CF6.
 * Flujo wizard: 'FORM' -> 'CONFIRM' -> 'SUCCESS'.
 */
export default function IniciarReparacionModal({
  isOpen,
  onClose,
  dispositivo,
  onSuccess
}) {
  const { token } = useAuth();

  // Paso del wizard: 'FORM' | 'CONFIRM' | 'SUCCESS'
  const [paso, setPaso] = useState('FORM');

  // Catálogo de categorías disponibles
  const [categorias, setCategorias] = useState([]);
  const [cargandoCategorias, setCargandoCategorias] = useState(false);

  // Campos del formulario
  const [selectedCategorias, setSelectedCategorias] = useState([]);
  const [descripcion, setDescripcion] = useState('');
  const [credencial, setCredencial] = useState('');
  const [sinCredencial, setSinCredencial] = useState(false);

  // Estados de control
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formTocado, setFormTocado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Estados para el buscador desplegable de categorías
  const [busquedaCategoria, setBusquedaCategoria] = useState('');
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const dropdownRef = useRef(null);

  // Respuesta de orden exitosa
  const [resultado, setResultado] = useState(null);

  // Auto-ocultamiento de alertas de error a los 6 segundos (Regla Global 6)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  // Carga de categorías activas al abrir el modal
  useEffect(() => {
    if (!isOpen) {
      // Reset de estados al cerrarse
      setPaso('FORM');
      setSelectedCategorias([]);
      setDescripcion('');
      setCredencial('');
      setSinCredencial(false);
      setSubmitting(false);
      setErrorMessage('');
      setFormTocado(false);
      setCopiado(false);
      setResultado(null);
      setBusquedaCategoria('');
      setDropdownAbierto(false);
      return;
    }

    let activo = true;
    setCargandoCategorias(true);

    axios
      .get(`${API_BASE_URL}/api/workshop/categorias-reparacion/?estado=true`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (!activo) return;
        const lista = Array.isArray(res.data) ? res.data : [];
        // Filtrar activas por seguridad adicional en cliente
        const activas = lista.filter((c) => c.estado_activo !== false);
        setCategorias(activas);
      })
      .catch((err) => {
        if (!activo) return;
        console.error('Error al cargar categorías de reparación:', err);
        setErrorMessage(
          extraerMensajeError(err, 'No fue posible cargar las categorías de reparación activas.')
        );
      })
      .finally(() => {
        if (activo) setCargandoCategorias(false);
      });

    return () => {
      activo = false;
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

    // Todo válido, pasar al paso de confirmación
    setErrorMessage('');
    setPaso('CONFIRM');
  };

  // Envío final del servicio al confirmar
  const handleConfirmarReparacion = async () => {
    if (!dispositivo?.id_dispositivo) {
      setErrorMessage('No se encontró el identificador del equipo seleccionado.');
      setPaso('FORM');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const payload = {
        id_dispositivo: dispositivo.id_dispositivo,
        descripcion_problema: descripcion.trim(),
        credencial_acceso: credencial.trim() || 'Ninguna',
        ids_categorias: selectedCategorias
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

      // Respuesta exitosa 201 Created
      setResultado(res.data);
      setPaso('SUCCESS');
    } catch (err) {
      console.error('Error al iniciar la reparación:', err);
      // En caso de error (400 u otro), volver al paso del formulario y mostrar alerta de error con fade-out
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

  // Copiar código de seguridad al portapapeles
  const handleCopiarCodigo = () => {
    if (!resultado?.codigo_seguridad) return;
    navigator.clipboard.writeText(resultado.codigo_seguridad);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  // Cierre final del modal y notificación al padre
  const handleCerrarFinal = () => {
    const ordenCreada = resultado;
    onClose();
    if (ordenCreada && typeof onSuccess === 'function') {
      onSuccess(ordenCreada);
    }
  };

  // Nombres de categorías seleccionadas para el resumen
  const categoriasSeleccionadasInfo = useMemo(() => {
    return categorias.filter((c) => selectedCategorias.includes(c.id_categoria));
  }, [categorias, selectedCategorias]);

  const descCaracteres = descripcion.trim().length;
  const descValida = descCaracteres >= 10;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        {/* Backdrop con Blur y Oscuridad Cyber-Tech */}
        <motion.div
          key="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => !submitting && paso !== 'SUCCESS' && onClose()}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
        />

        {/* Contenedor Modal */}
        <motion.div
          key={`modal-container-${paso}`}
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          role="dialog"
          aria-modal="true"
          className="relative w-full max-w-2xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden my-auto z-10"
        >
          {/* Alerta de Error flotante (Fade-out a los 6 segundos) */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                role="alert"
                className="mx-6 mt-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3 shadow-lg shadow-rose-950/20"
              >
                <div className="w-5 h-5 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 font-bold shrink-0 mt-0.5">
                  !
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-rose-200">Atención al procesar orden</p>
                  <p className="mt-0.5 text-rose-300/90 leading-relaxed">{errorMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  aria-label="Cerrar alerta"
                  className="text-rose-400 hover:text-rose-200 text-sm font-mono shrink-0 transition-colors"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ============================================================== */}
          {/* PASO 1: FORMULARIO ('FORM')                                    */}
          {/* ============================================================== */}
          {paso === 'FORM' && (
            <div>
              {/* Cabecera del Modal */}
              <div className="p-6 border-b border-slate-700/60 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono font-semibold uppercase tracking-wider">
                      Servicio Técnico
                    </span>
                    </div>
                  <h2 className="text-xl font-black text-[#F8FAFC] tracking-tight mt-1.5">
                    Iniciar reparación para:{' '}
                    <span className="text-[#06B6D4]">
                      {dispositivo?.marca || 'Dispositivo'} {dispositivo?.modelo || ''}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Describe la falla y selecciona las áreas afectadas para habilitar el diagnóstico en taller.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar modal"
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center justify-center shrink-0"
                >
                  ✕
                </button>
              </div>

              {/* Formulario */}
              <form onSubmit={handleAvanzarAConfirmacion} className="p-6 space-y-6 max-h-[72vh] overflow-y-auto">
                {/* 1. Categorías de Reparación (Multi-select) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#06B6D4]" />
                      Categorías del Problema <span className="text-rose-400">*</span>
                    </label>
                    <span className="text-[11px] font-mono text-cyan-400">
                      {selectedCategorias.length} seleccionada(s)
                    </span>
                  </div>

                  {cargandoCategorias ? (
                    <div className="h-10 bg-slate-900 rounded-xl border border-slate-800 animate-pulse" />
                  ) : categorias.length === 0 ? (
                    <div className="p-3 rounded-xl bg-slate-900 border border-dashed border-slate-700 text-center text-xs text-slate-400">
                      No hay categorías de reparación activas disponibles en este momento.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {/* Campo buscador con lista desplegable interactiva (Combobox) */}
                      <div ref={dropdownRef} className="relative">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Escribe para buscar categoría (ej. Pantalla, Batería, Conector)..."
                            value={busquedaCategoria}
                            onFocus={() => setDropdownAbierto(true)}
                            onChange={(e) => {
                              setBusquedaCategoria(e.target.value);
                              setDropdownAbierto(true);
                            }}
                            className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-[#F8FAFC] placeholder-slate-500 text-xs font-medium focus:outline-none focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 transition-all duration-200"
                          />
                          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">
                            🔍
                          </span>
                          <button
                            type="button"
                            onClick={() => setDropdownAbierto(!dropdownAbierto)}
                            className="absolute right-2.5 top-2 text-cyan-400 hover:text-cyan-300 p-1 text-xs"
                            title="Desplegar categorías"
                          >
                            {dropdownAbierto ? '▲' : '▼'}
                          </button>
                        </div>

                        {/* Menú flotante desplegable */}
                        <AnimatePresence>
                          {dropdownAbierto && (
                            <motion.div
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              transition={{ duration: 0.15 }}
                              className="absolute z-30 left-0 right-0 mt-1 bg-[#0F172A] border border-cyan-500/40 rounded-xl shadow-2xl shadow-cyan-950/60 max-h-56 overflow-y-auto overflow-x-hidden custom-scrollbar divide-y divide-slate-800/60"
                            >
                              {categoriasFiltradas.length === 0 ? (
                                <div className="p-3 text-center text-xs text-slate-400 italic">
                                  No se encontraron categorías que coincidan con &ldquo;{busquedaCategoria}&rdquo;.
                                </div>
                              ) : (
                                categoriasFiltradas.map((cat) => {
                                  const yaSeleccionada = selectedCategorias.includes(cat.id_categoria);
                                  return (
                                    <button
                                      key={cat.id_categoria}
                                      type="button"
                                      onClick={() => {
                                        handleToggleCategoria(cat.id_categoria);
                                        setErrorMessage('');
                                      }}
                                      className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                                        yaSeleccionada
                                          ? 'bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                                      }`}
                                    >
                                      <span className="font-medium truncate">{cat.nombre}</span>
                                      {yaSeleccionada ? (
                                        <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/40 shrink-0">
                                          ✓ Agregada
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-mono text-slate-500 hover:text-cyan-400">
                                          + Agregar
                                        </span>
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Chips / Etiquetas de Categorías Seleccionadas */}
                      {selectedCategorias.length > 0 ? (
                        <div className="flex flex-wrap gap-2 p-2.5 bg-slate-900/60 border border-slate-800 rounded-xl">
                          {categoriasSeleccionadasInfo.map((cat) => (
                            <span
                              key={cat.id_categoria}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500/15 border border-[#06B6D4]/40 text-cyan-200 text-xs font-semibold shadow-sm"
                            >
                              <span>{cat.nombre}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleCategoria(cat.id_categoria)}
                                className="text-cyan-400 hover:text-white hover:bg-cyan-500/30 rounded-full w-4 h-4 flex items-center justify-center text-[10px] transition-colors cursor-pointer"
                                title={`Quitar ${cat.nombre}`}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          Escribe en el campo o abre la lista para seleccionar las categorías aplicables al problema de tu equipo.
                        </p>
                      )}
                    </div>
                  )}

                  {formTocado && selectedCategorias.length === 0 && (
                    <p className="mt-1.5 text-[11px] text-rose-400 font-medium">
                      Debes seleccionar al menos una categoría de reparación.
                    </p>
                  )}
                </div>

                {/* 2. Descripción del Problema */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="descripcion_problema"
                      className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]" />
                      Descripción del Problema o Falla <span className="text-rose-400">*</span>
                    </label>
                    <span
                      className={`text-[11px] font-mono ${
                        descValida ? 'text-emerald-400' : descCaracteres > 0 ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    >
                      {descCaracteres} {descCaracteres === 1 ? 'carácter' : 'caracteres'} (mínimo 10)
                    </span>
                  </div>

                  <textarea
                    id="descripcion_problema"
                    rows={4}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Describe los síntomas observados: caídas previas, fallas intermitentes, problemas de carga, reinicios imprevistos o roturas..."
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-[#F8FAFC] placeholder-slate-500 text-xs font-medium transition-all duration-200 focus:outline-none focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 focus:shadow-[0_0_15px_rgba(6,182,212,0.25)] resize-none"
                  />

                  {descripcion.length > 0 && !descValida && (
                    <p className="mt-1 text-[11px] text-amber-400 flex items-center gap-1 font-medium">
                      <span>⚠</span>
                      La descripción debe contener al menos 10 caracteres (faltan {10 - descCaracteres}).
                    </p>
                  )}
                </div>

                {/* 3. Credencial de Acceso */}
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

                    {/* Checkbox Rápido: "Sin contraseña / Ninguna" */}
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
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-[#F8FAFC] placeholder-slate-500 text-xs font-medium transition-all duration-200 focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
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
                    className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.35)] hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                  >
                    <span>Continuar a Confirmación</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ============================================================== */}
          {/* PASO 2: CONFIRMACIÓN ('CONFIRM')                               */}
          {/* ============================================================== */}
          {paso === 'CONFIRM' && (
            <div>
              {/* Cabecera */}
              <div className="p-6 border-b border-slate-700/60">
                <span className="px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/30 text-[10px] font-mono font-semibold uppercase tracking-wider">
                  Paso 2 • Verificación
                </span>
                <h2 className="text-xl font-black text-[#F8FAFC] tracking-tight mt-1.5">
                  Confirmar Apertura de Servicio
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  Revisa los datos técnicos declarados antes de instanciar la orden en el sistema.
                </p>
              </div>

              {/* Contenido Resumen */}
              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                {/* Pregunta Central Destacada */}
                <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-center">
                  <p className="text-sm sm:text-base font-bold text-cyan-200">
                    ¿Está seguro de iniciar el proceso de reparación para este equipo?
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Se generará el Remito de Ingreso y el Código de Seguridad indispensable para la entrega.
                  </p>
                </div>

                {/* Tarjeta de Resumen */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
                  {/* Fila Equipo */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider block">
                        Dispositivo
                      </span>
                      <span className="text-sm font-bold text-white">
                        {dispositivo?.marca} {dispositivo?.modelo}
                      </span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-xs font-mono">
                      Serie: {dispositivo?.numero_serie || 'S/N'}
                    </span>
                  </div>

                  {/* Fila Categorías */}
                  <div>
                    <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider block mb-1.5">
                      Categorías de Falla
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {categoriasSeleccionadasInfo.map((cat) => (
                        <span
                          key={cat.id_categoria}
                          className="px-2.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-xs font-medium"
                        >
                          {cat.nombre}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Fila Falla Declarada */}
                  <div>
                    <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider block mb-1">
                      Descripción del Problema
                    </span>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/80 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed italic">
                      &ldquo;{descripcion.trim()}&rdquo;
                    </div>
                  </div>

                  {/* Fila Credencial */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">
                      Credencial de Desbloqueo:
                    </span>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                      {credencial.trim() || 'Ninguna'}
                    </span>
                  </div>
                </div>

                {/* Botones de Confirmación */}
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
                    disabled={submitting}
                    onClick={handleConfirmarReparacion}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span>Procesando orden...</span>
                      </>
                    ) : (
                      <>
                        <span>Confirmar e Iniciar Reparación</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* PASO 3: TICKET DE ÉXITO ('SUCCESS')                            */}
          {/* ============================================================== */}
          {paso === 'SUCCESS' && resultado && (
            <div className="p-6 sm:p-8 text-center space-y-6">
              {/* Ícono Gigante de Check (✔) */}
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

              {/* Título Grande */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  ¡Orden de Servicio Creada!
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  La orden se ha registrado formalmente para{' '}
                  <span className="font-semibold text-cyan-300">
                    {dispositivo?.marca} {dispositivo?.modelo}
                  </span>
                  .
                </p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-mono text-xs font-semibold">
                    Orden #{resultado.id_reparacion}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30 font-mono text-xs">
                    {formatearEstadoReparacion(resultado.etapa)}
                  </span>
                </div>
              </div>

              {/* CRÍTICO: Bloque del Código de Seguridad (Token de Entrega) */}
              <div className="p-6 rounded-2xl bg-gradient-to-b from-[#090D16] to-[#0F172A] border-2 border-[#06B6D4] shadow-[0_0_30px_rgba(6,182,212,0.25)] relative overflow-hidden group">
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400 block mb-1">
                  CÓDIGO DE SEGURIDAD (TOKEN DE ENTREGA)
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

                <div className="mt-3 p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/20 text-xs text-cyan-200/90 leading-relaxed">
                  <p className="font-semibold text-cyan-100">
                    Guarde este Código de Seguridad. Es su Token de Entrega indispensable para presentar en el mostrador.
                  </p>
                </div>
              </div>

              {/* Nota sobre el Remito PDF */}
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
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </motion.div>
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
