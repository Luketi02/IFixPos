import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { resolverUrlImagen } from '../../utils/imagenes';

import { API_BASE_URL } from '../../config/api';
const INPUT_CLASS =
  'w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-[#F8FAFC] placeholder-slate-500 text-xs font-medium transition-all duration-200 focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)] disabled:opacity-50 disabled:cursor-not-allowed';
const INPUT_OTRO_CLASS =
  'w-full px-3 py-2 rounded-xl bg-slate-950 border border-cyan-500/40 text-[#F8FAFC] placeholder-slate-500 text-xs font-medium focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30';


/** Extrae un mensaje legible de las distintas formas de error que devuelve DRF. */
const extraerMensajeError = (err, porDefecto) => {
  const data = err?.response?.data;
  if (!data) return porDefecto;
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(String).join(' ');
  if (typeof data.error === 'string') return data.error;
  if (typeof data.detail === 'string') return data.detail;
  const valores = Object.values(data).flat().map(String);
  return valores.length ? valores.join(' ') : porDefecto;
};

export default function DispositivoModal({ isOpen, onClose, dispositivoData = null, onSaved }) {
  const { user, token } = useAuth();
  const esEdicion = Boolean(dispositivoData);
  const noEsEditable = esEdicion && dispositivoData?.editable === false;

  // Catálogos
  const [tipos, setTipos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);
  const [isLoadingModelos, setIsLoadingModelos] = useState(false);

  // Formulario (se inicializa con los datos del equipo; el padre remonta el modal con `key` en cada apertura)
  const [tipoId, setTipoId] = useState(dispositivoData ? String(dispositivoData.id_tipo ?? '') : '');
  const [marcaId, setMarcaId] = useState(dispositivoData ? String(dispositivoData.id_marca ?? '') : '');
  const [modeloId, setModeloId] = useState(dispositivoData ? String(dispositivoData.id_modelo ?? '') : '');
  const [numeroSerie, setNumeroSerie] = useState(dispositivoData?.numero_serie || '');
  const [tipoOtro, setTipoOtro] = useState('');
  const [marcaOtra, setMarcaOtra] = useState('');
  const [modeloOtro, setModeloOtro] = useState('');

  // Imagen
  const [imagenFile, setImagenFile] = useState(null);
  const [imagenPreview, setImagenPreview] = useState(
    dispositivoData?.imagen ? resolverUrlImagen(dispositivoData.imagen) : null
  );
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Alertas de error: se ocultan solas a los 15 segundos
  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(''), 15000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  const cargarModelos = useCallback(async (idMarca) => {
    if (!idMarca || idMarca === 'OTRO') {
      setModelos([]);
      return [];
    }
    setIsLoadingModelos(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/workshop/marcas/${idMarca}/modelos/`);
      const lista = Array.isArray(res.data) ? res.data : [];
      setModelos(lista);
      return lista;
    } catch (err) {
      console.error('Error al cargar modelos:', err);
      setErrorMessage('No fue posible obtener los modelos disponibles para la marca seleccionada.');
      return [];
    } finally {
      setIsLoadingModelos(false);
    }
  }, []);

  // Al abrir: carga catálogos y, en edición, precarga los modelos de la marca del equipo
  useEffect(() => {
    if (!isOpen) return undefined;
    let activo = true;

    const iniciar = async () => {
      try {
        const [resTipos, resMarcas] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/workshop/tipos-dispositivos/`),
          axios.get(`${API_BASE_URL}/api/workshop/marcas/`)
        ]);
        if (!activo) return;
        setTipos(Array.isArray(resTipos.data) ? resTipos.data : []);
        let listaMarcas = Array.isArray(resMarcas.data) ? resMarcas.data : [];
        // La marca actual del equipo puede estar inactiva (catálogo personalizado): se incluye igual
        if (dispositivoData && !listaMarcas.some((m) => m.id_marca === dispositivoData.id_marca)) {
          listaMarcas = [
            ...listaMarcas,
            { id_marca: dispositivoData.id_marca, nombre: dispositivoData.marca }
          ];
        }
        setMarcas(listaMarcas);
      } catch (err) {
        console.error('Error al cargar catálogos:', err);
        if (activo) setErrorMessage('No fue posible cargar el catálogo de equipos del sistema.');
      } finally {
        if (activo) setIsLoadingCatalogs(false);
      }

      // Cascada en edición: precarga los modelos de la marca del equipo
      if (dispositivoData?.id_marca && activo) {
        const lista = await cargarModelos(dispositivoData.id_marca);
        if (activo && !lista.some((m) => m.id_modelo === dispositivoData.id_modelo)) {
          setModelos([...lista, { id_modelo: dispositivoData.id_modelo, nombre: dispositivoData.modelo }]);
        }
      }
    };

    iniciar();
    return () => {
      activo = false;
    };
  }, [isOpen, dispositivoData, cargarModelos]);

  // Cierre con tecla Escape
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && !isSubmitting && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isSubmitting, onClose]);

  const modelosFiltrados = useMemo(
    () =>
      !esEdicion && tipoId && tipoId !== 'OTRO'
        ? modelos.filter((m) => String(m.id_tipo_dispositivo) === String(tipoId))
        : modelos,
    [modelos, tipoId, esEdicion]
  );

  const handleMarcaChange = async (e) => {
    const val = e.target.value;
    setMarcaId(val);
    setMarcaOtra('');
    setModeloOtro('');
    if (val === 'OTRO') {
      setModelos([]);
      setModeloId('OTRO');
      return;
    }
    setModeloId('');
    await cargarModelos(val);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    const extensionValida = /\.(png|jpe?g|webp|jfif|avif|heic|heif)$/i.test(file.name);
    const mimeValido =
      file.type.startsWith('image/') ||
      ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/jfif', 'image/avif', 'image/heic', 'image/heif'].includes(file.type);

    if (!extensionValida || (!mimeValido && file.type !== '')) {
      setErrorMessage('Formato de imagen no permitido. Se admiten: PNG, JPG, JPEG, WEBP, JFIF, AVIF, HEIC/HEIF.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('El tamaño de la imagen supera el límite permitido de 5 MB.');
      return;
    }
    if (imagenPreview?.startsWith('blob:')) URL.revokeObjectURL(imagenPreview);
    setImagenFile(file);
    setImagenPreview(URL.createObjectURL(file));
    setErrorMessage('');
  };

  const handleRemoveImage = () => {
    if (imagenPreview?.startsWith('blob:')) URL.revokeObjectURL(imagenPreview);
    setImagenFile(null);
    setImagenPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const esModoOtro = !esEdicion && (modeloId === 'OTRO' || marcaId === 'OTRO' || tipoId === 'OTRO');

  const validar = () => {
    if (!marcaId) return 'Por favor selecciona o especifica una marca para el equipo.';
    if (marcaId === 'OTRO' && !marcaOtra.trim()) return 'Por favor escribe el nombre de la marca del fabricante.';
    if (!modeloId) return 'Por favor selecciona o especifica el modelo comercial del equipo.';
    if (modeloId === 'OTRO' && !modeloOtro.trim()) return 'Por favor escribe el nombre del modelo comercial.';
    if (tipoId === 'OTRO' && !tipoOtro.trim()) return 'Por favor escribe el tipo de dispositivo que deseas registrar.';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (noEsEditable) {
      setErrorMessage('La edición está prohibida: este dispositivo ya posee historial técnico o se encuentra en proceso de reparación.');
      return;
    }

    const errorValidacion = validar();
    if (errorValidacion) {
      setErrorMessage(errorValidacion);
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      const headers = { Authorization: `Bearer ${token}` };

      if (esEdicion) {
        // CU-07: solo marca, modelo, nro de serie e imagen (opcional)
        formData.append('id_marca', marcaId);
        formData.append('id_modelo', modeloId);
        formData.append('nro_serie', numeroSerie.trim());
        if (imagenFile) formData.append('imagen', imagenFile);

        await axios.put(
          `${API_BASE_URL}/api/workshop/mis-dispositivos/${dispositivoData.id_dispositivo}/`,
          formData,
          { headers }
        );
        onSaved?.('Dispositivo actualizado correctamente.');
      } else {
        // CU-06: registro (con soporte de catálogo personalizado "Otro")
        const clienteId = user?.id_usuario || user?.id || '';
        if (clienteId) formData.append('id_cliente', clienteId);

        if (esModoOtro) {
          formData.append('es_otro', 'true');
          formData.append('nombre_modelo_otro', modeloOtro.trim());
          if (marcaId === 'OTRO') formData.append('nombre_marca_otro', marcaOtra.trim());
          else formData.append('id_marca', marcaId);
          if (tipoId === 'OTRO') formData.append('nombre_tipo_otro', tipoOtro.trim());
          else if (tipoId) formData.append('id_tipo', tipoId);
        } else {
          formData.append('id_modelo', modeloId);
        }
        if (numeroSerie.trim()) formData.append('nro_serie', numeroSerie.trim());
        if (imagenFile) formData.append('imagen', imagenFile);

        await axios.post(`${API_BASE_URL}/api/workshop/dispositivos/registrar/`, formData, { headers });
        onSaved?.('¡Dispositivo registrado correctamente!');
      }
      onClose();
    } catch (err) {
      console.error('Error al guardar dispositivo:', err);
      setErrorMessage(
        extraerMensajeError(
          err,
          esEdicion
            ? 'No fue posible actualizar el dispositivo. Verifica los datos.'
            : 'Ocurrió un inconveniente al registrar el dispositivo. Verifica los datos.'
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const nombreTipoActual =
    dispositivoData?.tipo || tipos.find((t) => String(t.id_tipo_dispositivo) === tipoId)?.nombre || '—';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="dispositivo-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md"
          onMouseDown={(e) => e.target === e.currentTarget && !isSubmitting && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dispositivo-modal-titulo"
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/50"
          >
            {/* Cabecera */}
            <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-700/60">
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[11px] font-mono font-semibold tracking-wider uppercase">
                  {esEdicion ? 'Edición' : 'Nuevo equipo'}
                </span>
                <h2 id="dispositivo-modal-titulo" className="text-xl font-black text-[#F8FAFC] mt-2">
                  {esEdicion ? 'Editar Dispositivo' : 'Registrar Dispositivo'}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {esEdicion
                    ? 'Solo es posible editar equipos que no poseen historial de reparaciones.'
                    : 'Asocia tu equipo a tu cuenta para solicitar presupuestos y reparaciones.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors shrink-0"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Alerta de error (fade-out a los 6 s) */}
              <AnimatePresence>
                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    role="alert"
                    className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3"
                  >
                    <span className="text-rose-400 font-bold mt-px">!</span>
                    <div className="flex-1">
                      <p className="font-semibold text-rose-200">Atención</p>
                      <p className="mt-0.5 text-rose-300/90">{errorMessage}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setErrorMessage('')}
                      className="text-rose-400 hover:text-rose-200 font-mono"
                    >
                      ✕
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Alerta si el dispositivo no es editable */}
              {noEsEditable && (
                <div className="p-3.5 rounded-xl bg-violet-500/10 border border-violet-500/40 text-violet-200 text-xs flex items-start gap-3">
                  <span className="text-violet-400 font-bold mt-px text-sm">🔒</span>
                  <div className="flex-1">
                    <p className="font-semibold text-violet-100">Edición Prohibida</p>
                    <p className="mt-0.5 text-violet-300">
                      Este dispositivo posee historial técnico o se encuentra en proceso de reparación. Por normativas de auditoría no puede ser modificado.
                    </p>
                  </div>
                </div>
              )}

              {/* Tipo / Marca / Modelo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Tipo */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-300 mb-1.5">Tipo de Dispositivo</label>
                  {esEdicion ? (
                    <input
                      type="text"
                      value={nombreTipoActual}
                      disabled
                      readOnly
                      title="El tipo no puede modificarse al editar"
                      className={INPUT_CLASS}
                    />
                  ) : (
                    <select
                      value={tipoId}
                      onChange={(e) => {
                        setTipoId(e.target.value);
                        if (e.target.value !== 'OTRO') setTipoOtro('');
                      }}
                      disabled={isLoadingCatalogs}
                      className={INPUT_CLASS}
                    >
                      <option value="">-- Todos los tipos --</option>
                      {tipos.map((t) => (
                        <option key={t.id_tipo_dispositivo} value={t.id_tipo_dispositivo}>
                          {t.nombre}
                        </option>
                      ))}
                      <option value="OTRO">+ Otro Tipo (Especificar)</option>
                    </select>
                  )}
                  <AnimatePresence>
                    {tipoId === 'OTRO' && !esEdicion && (
                      <motion.input
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        type="text"
                        value={tipoOtro}
                        onChange={(e) => setTipoOtro(e.target.value)}
                        placeholder="Ej: Consola portátil, Drone..."
                        maxLength={100}
                        className={`${INPUT_OTRO_CLASS} mt-2`}
                      />
                    )}
                  </AnimatePresence>
                </div>

                {/* Marca */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-300 mb-1.5">
                    Marca <span className="text-cyan-400">*</span>
                  </label>
                  <select
                    value={marcaId}
                    onChange={handleMarcaChange}
                    disabled={isLoadingCatalogs}
                    className={INPUT_CLASS}
                  >
                    <option value="">-- Seleccione una Marca --</option>
                    {marcas.map((m) => (
                      <option key={m.id_marca} value={m.id_marca}>
                        {m.nombre}
                      </option>
                    ))}
                    {!esEdicion && <option value="OTRO">+ Otra Marca (No listada)</option>}
                  </select>
                  <AnimatePresence>
                    {marcaId === 'OTRO' && !esEdicion && (
                      <motion.input
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        type="text"
                        value={marcaOtra}
                        onChange={(e) => setMarcaOtra(e.target.value)}
                        placeholder="Ej: Valve, DJI, Nothing..."
                        maxLength={150}
                        className={`${INPUT_OTRO_CLASS} mt-2`}
                      />
                    )}
                  </AnimatePresence>
                </div>

                {/* Modelo */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>
                      Modelo <span className="text-cyan-400">*</span>
                    </span>
                    {isLoadingModelos && (
                      <span className="text-[10px] text-cyan-400 font-mono animate-pulse">Consultando...</span>
                    )}
                  </label>
                  <select
                    value={modeloId}
                    onChange={(e) => {
                      setModeloId(e.target.value);
                      if (e.target.value !== 'OTRO') setModeloOtro('');
                    }}
                    disabled={!marcaId || isLoadingModelos || marcaId === 'OTRO'}
                    className={INPUT_CLASS}
                  >
                    <option value="">
                      {!marcaId
                        ? '-- Primero elija una marca --'
                        : marcaId === 'OTRO'
                        ? '-- Especificar modelo abajo --'
                        : '-- Seleccione un Modelo --'}
                    </option>
                    {marcaId !== 'OTRO' &&
                      modelosFiltrados.map((m) => (
                        <option key={m.id_modelo} value={m.id_modelo}>
                          {m.nombre}
                        </option>
                      ))}
                    {!esEdicion && marcaId && marcaId !== 'OTRO' && (
                      <option value="OTRO">+ Otro Modelo (No listado)</option>
                    )}
                    {marcaId === 'OTRO' && <option value="OTRO">Modelo personalizado</option>}
                  </select>
                  <AnimatePresence>
                    {(modeloId === 'OTRO' || marcaId === 'OTRO') && !esEdicion && (
                      <motion.input
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        type="text"
                        value={modeloOtro}
                        onChange={(e) => setModeloOtro(e.target.value)}
                        placeholder="Ej: Steam Deck OLED..."
                        maxLength={150}
                        className={`${INPUT_OTRO_CLASS} mt-2`}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Número de serie */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Número de Serie / IMEI <span className="text-slate-400 font-normal font-mono">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={numeroSerie}
                  onChange={(e) => setNumeroSerie(e.target.value)}
                  placeholder="Ej: SN-9876543210 / 358912345678901"
                  maxLength={100}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>

              {/* Imagen */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Fotografía del Equipo <span className="text-slate-400 font-normal font-mono">(Opcional)</span>
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/jfif,image/avif,image/heic,image/heif,.jfif,.avif,.heic,.heif"
                  className="hidden"
                />
                {!imagenPreview ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      handleFileSelect(e.dataTransfer.files?.[0]);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
                      isDragging
                        ? 'border-[#06B6D4] bg-cyan-500/10'
                        : 'border-slate-700 bg-slate-900/60 hover:border-slate-600'
                    }`}
                  >
                    <p className="text-xs font-semibold text-slate-200">
                      Arrastra una imagen aquí, o <span className="text-[#06B6D4] font-bold">explora tus archivos</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 font-mono">
                      PNG, JPG, JPEG, WEBP, JFIF, AVIF, HEIC (hasta 5 MB)
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={imagenPreview}
                        alt="Vista previa del equipo"
                        className="w-16 h-16 rounded-xl object-cover border border-slate-700 shrink-0"
                      />
                      <p className="text-xs text-slate-300 truncate">
                        {imagenFile ? imagenFile.name : 'Imagen actual del equipo'}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 transition-colors"
                      >
                        Cambiar
                      </button>
                      {!esEdicion && (
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] font-semibold border border-rose-500/30 transition-colors"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isLoadingCatalogs || noEsEditable}
                  className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Guardando...' : esEdicion ? 'Guardar Cambios' : 'Registrar Dispositivo'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
