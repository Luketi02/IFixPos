import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function RegisterDeviceScreen() {
  const navigate = useNavigate();
  const { user, token } = useAuth();

  // Estados de catálogos en cascada
  const [tiposDispositivos, setTiposDispositivos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);

  // Estados de selección del formulario
  const [selectedTipoId, setSelectedTipoId] = useState('');
  const [selectedMarcaId, setSelectedMarcaId] = useState('');
  const [selectedModeloId, setSelectedModeloId] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');

  // Estados para opción 'Otro' (Homologación manual)
  const [tipoPersonalizado, setTipoPersonalizado] = useState('');
  const [marcaPersonalizada, setMarcaPersonalizada] = useState('');
  const [modeloPersonalizado, setModeloPersonalizado] = useState('');

  // Estados para imagen (Drag & Drop y archivo)
  const [imagenFile, setImagenFile] = useState(null);
  const [imagenPreview, setImagenPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Estados de carga y feedback
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);
  const [isLoadingModelos, setIsLoadingModelos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [nuevoDispositivoId, setNuevoDispositivoId] = useState(null);

  // Auto-ocultamiento de alertas de error a los 6 segundos (Regla de UX)
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage('');
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // 1. Carga inicial de catálogos (Tipos de Dispositivo y Marcas)
  useEffect(() => {
    let isMounted = true;
    const cargarCatalogosIniciales = async () => {
      setIsLoadingCatalogs(true);
      try {
        const [resTipos, resMarcas] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/workshop/tipos-dispositivos/`),
          axios.get(`${API_BASE_URL}/api/workshop/marcas/`)
        ]);

        if (isMounted) {
          setTiposDispositivos(Array.isArray(resTipos.data) ? resTipos.data : []);
          setMarcas(Array.isArray(resMarcas.data) ? resMarcas.data : []);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error al cargar catálogos iniciales:', err);
          setErrorMessage('No fue posible cargar el catálogo de equipos del sistema.');
        }
      } finally {
        if (isMounted) setIsLoadingCatalogs(false);
      }
    };

    cargarCatalogosIniciales();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Cascada: Al cambiar de Marca, cargar los modelos correspondientes
  const handleMarcaChange = async (e) => {
    const idMarca = e.target.value;
    setSelectedMarcaId(idMarca);

    if (idMarca === 'OTRO') {
      setModelos([]);
      // Si la marca es nueva, el modelo forzosamente es nuevo
      setSelectedModeloId('OTRO');
      return;
    }

    setMarcaPersonalizada('');
    if (selectedModeloId === 'OTRO') {
      setSelectedModeloId('');
    } else {
      setSelectedModeloId('');
    }
    setModelos([]);

    if (!idMarca) return;

    setIsLoadingModelos(true);
    try {
      const resModelos = await axios.get(`${API_BASE_URL}/api/workshop/marcas/${idMarca}/modelos/`);
      const listaModelos = Array.isArray(resModelos.data) ? resModelos.data : [];
      setModelos(listaModelos);
    } catch (err) {
      console.error('Error al cargar modelos de la marca:', err);
      setErrorMessage('No fue posible obtener los modelos disponibles para la marca seleccionada.');
    } finally {
      setIsLoadingModelos(false);
    }
  };

  const handleTipoChange = (e) => {
    const val = e.target.value;
    setSelectedTipoId(val);
    if (val !== 'OTRO') {
      setTipoPersonalizado('');
    }
  };

  const handleModeloChange = (e) => {
    const val = e.target.value;
    setSelectedModeloId(val);
    if (val !== 'OTRO') {
      setModeloPersonalizado('');
    }
  };

  // Filtrado reactivo de modelos si el usuario eligió un tipo específico
  const modelosFiltrados = selectedTipoId && selectedTipoId !== 'OTRO'
    ? modelos.filter((m) => String(m.id_tipo_dispositivo) === String(selectedTipoId))
    : modelos;

  // Manejo de selección de archivo de imagen
  const handleFileSelect = (file) => {
    if (!file) return;

    const extensionesValidas = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/jfif', 'image/avif', 'image/heic', 'image/heif'];
    const extensionValida = /\.(png|jpe?g|webp|jfif|avif|heic|heif)$/i.test(file.name);
    if (!extensionValida || (!extensionesValidas.includes(file.type) && !file.type.startsWith('image/'))) {
      setErrorMessage('Formato de imagen no permitido. Se admiten: PNG, JPG, JPEG, WEBP, JFIF, AVIF, HEIC/HEIF.');
      return;
    }

    // Validar peso máximo (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('El tamaño de la imagen supera el límite permitido de 5 MB.');
      return;
    }

    setImagenFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImagenPreview(previewUrl);
    setErrorMessage('');
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleRemoveImage = () => {
    setImagenFile(null);
    if (imagenPreview) {
      URL.revokeObjectURL(imagenPreview);
      setImagenPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Determinar si está en modo personalizado ('Otro')
  const isModoOtro = selectedModeloId === 'OTRO' || selectedMarcaId === 'OTRO' || selectedTipoId === 'OTRO';

  // 3. Envío del formulario utilizando FormData nativo (sin JSON.stringify)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    // Validaciones visuales previas
    if (!selectedMarcaId) {
      setErrorMessage('Por favor selecciona o especifica una marca para el equipo.');
      return;
    }

    if (selectedMarcaId === 'OTRO' && !marcaPersonalizada.trim()) {
      setErrorMessage('Por favor escribe el nombre de la marca del fabricante.');
      return;
    }

    if (!selectedModeloId) {
      setErrorMessage('Por favor selecciona o especifica el modelo comercial del equipo.');
      return;
    }

    if (selectedModeloId === 'OTRO' && !modeloPersonalizado.trim()) {
      setErrorMessage('Por favor escribe el nombre del modelo comercial.');
      return;
    }

    if (selectedTipoId === 'OTRO' && !tipoPersonalizado.trim()) {
      setErrorMessage('Por favor escribe el tipo de dispositivo que deseas registrar.');
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      const clienteId = user?.id_usuario || user?.id || '';
      if (clienteId) {
        formData.append('id_cliente', clienteId);
      }

      if (isModoOtro || selectedModeloId === 'OTRO') {
        formData.append('es_otro', 'true');
        formData.append('nombre_modelo_otro', modeloPersonalizado.trim());

        if (selectedMarcaId === 'OTRO') {
          formData.append('nombre_marca_otro', marcaPersonalizada.trim());
        } else {
          formData.append('id_marca', selectedMarcaId);
        }

        if (selectedTipoId === 'OTRO') {
          formData.append('nombre_tipo_otro', tipoPersonalizado.trim());
        } else if (selectedTipoId) {
          formData.append('id_tipo', selectedTipoId);
        }
      } else {
        formData.append('id_modelo', selectedModeloId);
      }

      if (numeroSerie.trim()) {
        formData.append('nro_serie', numeroSerie.trim());
      }

      if (imagenFile) {
        formData.append('imagen', imagenFile);
      }

      // POST autenticado con JWT dejando que el navegador defina el boundary de multipart/form-data
      const res = await axios.post(`${API_BASE_URL}/api/workshop/dispositivos/registrar/`, formData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.status === 201 || res.status === 200) {
        const idGenerado = res.data?.id_dispositivo || res.data?.dispositivo?.id_dispositivo;
        setNuevoDispositivoId(idGenerado);
        setSuccessMessage('¡Dispositivo registrado correctamente en el sistema!');

        // Limpiar campos del formulario
        setSelectedTipoId('');
        setSelectedMarcaId('');
        setSelectedModeloId('');
        setTipoPersonalizado('');
        setMarcaPersonalizada('');
        setModeloPersonalizado('');
        setNumeroSerie('');
        handleRemoveImage();
      }
    } catch (err) {
      console.error('Error al registrar dispositivo:', err);
      const backendError = err.response?.data?.error || err.response?.data?.detail;
      setErrorMessage(
        typeof backendError === 'string'
          ? backendError
          : 'Ocurrió un inconveniente al registrar el dispositivo. Por favor verifica los datos.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = (() => {
    if (!selectedMarcaId) return false;
    if (selectedMarcaId === 'OTRO' && !marcaPersonalizada.trim()) return false;
    if (!selectedModeloId) return false;
    if (selectedModeloId === 'OTRO' && !modeloPersonalizado.trim()) return false;
    if (selectedTipoId === 'OTRO' && !tipoPersonalizado.trim()) return false;
    return true;
  })();

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* 1. BARRA LATERAL DINÁMICA */}
      <AdminSidebar activeMenu="client-devices-new" />

      {/* 2. ÁREA DE CONTENIDO */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* Header Superior Cyber-Tech */}
        <header className="h-16 border-b border-slate-800 bg-[#1E293B]/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <img
              src={logoEmpresa}
              alt="Logo IFixPos"
              className="w-8 h-8 object-contain drop-shadow-[0_2px_8px_rgba(6,182,212,0.4)]"
            />
            {/* Migas de pan */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">Mis Dispositivos</span>
              <span className="text-slate-600">/</span>
              <span className="text-cyan-400 font-semibold">Registrar Dispositivo</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (window.history.state && window.history.state.idx > 0) {
                  navigate(-1);
                } else {
                  navigate('/tienda');
                }
              }}
              className="px-3.5 py-1.5 rounded-lg border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver</span>
            </button>

            <UserProfileDropdown align="right" />
          </div>
        </header>

        {/* Contenido Central */}
        <main className="flex-1 p-6 sm:p-10 max-w-4xl mx-auto w-full">
          
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-6"
          >
            
            {/* Encabezado Principal */}
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[11px] font-mono font-semibold tracking-wider uppercase">
                  Gestión de Equipos
                </span>
                <span className="text-xs font-mono text-slate-400">
                  • Empadronamiento de Activos
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Registrar Nuevo Dispositivo
              </h1>
              <p className="text-slate-300 text-sm mt-1 leading-relaxed">
                Asocia tu equipo al catálogo de tu cuenta para solicitar presupuestos técnicos, revisiones o aperturas de garantías en IFixPos.
              </p>
            </div>

            {/* Alerta de Error con auto-ocultamiento de 6 segundos */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3 shadow-lg shadow-rose-950/20"
                >
                  <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-semibold text-rose-200">Atención</p>
                    <p className="text-xs text-rose-300/90 mt-0.5">{errorMessage}</p>
                  </div>
                  <button
                    onClick={() => setErrorMessage('')}
                    className="text-rose-400 hover:text-rose-200 text-xs font-mono"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Alerta de Éxito Cyber-Tech */}
            <AnimatePresence>
              {successMessage && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                  className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#1E293B] to-cyan-950/40 border border-emerald-500/40 text-emerald-300 shadow-xl shadow-emerald-950/20 flex flex-col sm:flex-row items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-white text-base">{successMessage}</p>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Identificador único del equipo en taller: <span className="text-cyan-400 font-mono font-bold">#{nuevoDispositivoId}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setSuccessMessage('')}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-semibold border border-slate-700 transition-colors"
                    >
                      Registrar otro
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/tienda')}
                      className="px-4 py-2 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                    >
                      Ir a mi panel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tarjeta Principal del Formulario */}
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl relative backdrop-blur-sm">
              
              <form onSubmit={handleSubmit} className="space-y-6">

                {/* Sección 1: Selección en Cascada (Tipo, Marca, Modelo) */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                      Especificaciones del Hardware
                    </h2>
                    {isLoadingCatalogs && (
                      <span className="text-xs font-mono text-cyan-400 flex items-center gap-1.5 animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        Cargando catálogo...
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    
                    {/* Selector 1: Tipo de Dispositivo */}
                    <div className="flex flex-col">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>Tipo de Dispositivo</span>
                        {selectedTipoId === 'OTRO' && (
                          <span className="text-[10px] text-cyan-400 font-mono font-bold">Personalizado</span>
                        )}
                      </label>
                      <select
                        value={selectedTipoId}
                        onChange={handleTipoChange}
                        disabled={isLoadingCatalogs}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-medium transition-all duration-200 focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Todos los tipos --</option>
                        {tiposDispositivos.map((tipo) => (
                          <option key={tipo.id_tipo_dispositivo} value={tipo.id_tipo_dispositivo}>
                            {tipo.nombre}
                          </option>
                        ))}
                        <option value="OTRO" className="text-cyan-400 font-semibold bg-slate-950">
                          + Otro Tipo (Especificar)
                        </option>
                      </select>

                      <AnimatePresence>
                        {selectedTipoId === 'OTRO' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0, y: -4 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
                            className="mt-2"
                          >
                            <label className="block text-[11px] font-semibold text-cyan-300 mb-1">
                              Nombre del Tipo <span className="text-cyan-400">*</span>
                            </label>
                            <input
                              type="text"
                              value={tipoPersonalizado}
                              onChange={(e) => setTipoPersonalizado(e.target.value)}
                              placeholder="Ej: Consola portátil, Drone, Smartwatch..."
                              maxLength={100}
                              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-cyan-500/40 text-slate-100 placeholder-slate-500 text-xs font-medium focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        {selectedTipoId === 'OTRO' ? 'Se creará una categoría personalizada.' : 'Filtro opcional de categoría.'}
                      </p>
                    </div>

                    {/* Selector 2: Marca */}
                    <div className="flex flex-col">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>Marca del Fabricante <span className="text-cyan-400">*</span></span>
                        {selectedMarcaId === 'OTRO' && (
                          <span className="text-[10px] text-cyan-400 font-mono font-bold">Nueva Marca</span>
                        )}
                      </label>
                      <select
                        value={selectedMarcaId}
                        onChange={handleMarcaChange}
                        disabled={isLoadingCatalogs}
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-medium transition-all duration-200 focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Seleccione una Marca --</option>
                        {marcas.map((marca) => (
                          <option key={marca.id_marca} value={marca.id_marca}>
                            {marca.nombre}
                          </option>
                        ))}
                        <option value="OTRO" className="text-cyan-400 font-semibold bg-slate-950">
                          + Otra Marca (No listada)
                        </option>
                      </select>

                      <AnimatePresence>
                        {selectedMarcaId === 'OTRO' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0, y: -4 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
                            className="mt-2"
                          >
                            <label className="block text-[11px] font-semibold text-cyan-300 mb-1">
                              Nombre de la Marca <span className="text-cyan-400">*</span>
                            </label>
                            <input
                              type="text"
                              value={marcaPersonalizada}
                              onChange={(e) => setMarcaPersonalizada(e.target.value)}
                              placeholder="Ej: Valve, DJI, Nothing, Alienware..."
                              maxLength={150}
                              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-cyan-500/40 text-slate-100 placeholder-slate-500 text-xs font-medium focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        {selectedMarcaId === 'OTRO' ? 'Permite especificar un fabricante nuevo.' : 'Habilita la lista de modelos.'}
                      </p>
                    </div>

                    {/* Selector 3: Modelo en Cascada */}
                    <div className="flex flex-col">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>Modelo Comercial <span className="text-cyan-400">*</span></span>
                        {isLoadingModelos && (
                          <span className="text-[10px] text-cyan-400 font-mono animate-pulse">
                            Consultando...
                          </span>
                        )}
                        {(selectedModeloId === 'OTRO' || selectedMarcaId === 'OTRO') && (
                          <span className="text-[10px] text-cyan-400 font-mono font-bold">Personalizado</span>
                        )}
                      </label>
                      <select
                        value={selectedModeloId}
                        onChange={handleModeloChange}
                        disabled={!selectedMarcaId || isLoadingModelos || selectedMarcaId === 'OTRO'}
                        required
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all duration-200 focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)] ${
                          !selectedMarcaId
                            ? 'bg-slate-900/50 border-slate-800 text-slate-500 cursor-not-allowed'
                            : selectedMarcaId === 'OTRO'
                            ? 'bg-slate-950 border-cyan-500/40 text-cyan-300 font-semibold'
                            : 'bg-slate-900 border-slate-700 text-slate-100'
                        }`}
                      >
                        <option value="">
                          {!selectedMarcaId
                            ? '-- Primero elija una marca --'
                            : selectedMarcaId === 'OTRO'
                            ? '-- Especificar modelo abajo --'
                            : isLoadingModelos
                            ? '-- Cargando modelos... --'
                            : modelosFiltrados.length === 0
                            ? '-- Sin modelos en catálogo --'
                            : '-- Seleccione un Modelo --'}
                        </option>
                        {selectedMarcaId !== 'OTRO' && modelosFiltrados.map((modelo) => (
                          <option key={modelo.id_modelo} value={modelo.id_modelo}>
                            {modelo.nombre}
                          </option>
                        ))}
                        {selectedMarcaId && (
                          <option value="OTRO" className="text-cyan-400 font-semibold bg-slate-950">
                            + Otro Modelo (No listado)
                          </option>
                        )}
                      </select>

                      <AnimatePresence>
                        {(selectedModeloId === 'OTRO' || selectedMarcaId === 'OTRO') && (
                          <motion.div
                            initial={{ opacity: 0, height: 0, y: -4 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
                            className="mt-2"
                          >
                            <label className="block text-[11px] font-semibold text-cyan-300 mb-1">
                              Nombre del Modelo <span className="text-cyan-400">*</span>
                            </label>
                            <input
                              type="text"
                              value={modeloPersonalizado}
                              onChange={(e) => setModeloPersonalizado(e.target.value)}
                              placeholder="Ej: Steam Deck OLED, Mavic Air 2, ROG Ally X..."
                              maxLength={150}
                              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-cyan-500/40 text-slate-100 placeholder-slate-500 text-xs font-medium focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        {!selectedMarcaId
                          ? 'Selecciona una marca para habilitar.'
                          : selectedMarcaId === 'OTRO' || selectedModeloId === 'OTRO'
                          ? 'Ingresa la denominación comercial exacta.'
                          : `${modelosFiltrados.length} modelo(s) disponibles.`}
                      </p>
                    </div>

                  </div>

                  {/* Panel Informativo Cyber-Tech: Homologación Inteligente (8 Usos) */}
                  <AnimatePresence>
                    {isModoOtro && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-cyan-200 text-xs flex items-start gap-3 shadow-md shadow-cyan-950/20 backdrop-blur-sm"
                      >
                        <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 text-[11px] leading-relaxed text-slate-300">
                          <strong className="text-cyan-300 font-semibold font-mono uppercase tracking-wide">
                            Homologación Automática del Sistema:
                          </strong>{' '}
                          Tu equipo quedará empadronado de inmediato en tu perfil. Para salvaguardar la calidad del catálogo público, los tipos, marcas y modelos cargados manualmente se conservarán aislados hasta alcanzar <span className="text-cyan-400 font-bold font-mono">8 registros</span> en el taller, momento en el cual el sistema los promoverá de forma automática a la lista oficial para todos los clientes y técnicos.
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Sección 2: Número de Serie / IMEI */}
                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Número de Serie / IMEI <span className="text-slate-400 font-normal font-mono">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={numeroSerie}
                      onChange={(e) => setNumeroSerie(e.target.value)}
                      placeholder="Ej: SN-9876543210 / 358912345678901"
                      maxLength={100}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs font-mono transition-all duration-200 focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/30 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)]"
                    />
                    <div className="absolute right-3 top-2.5 text-slate-500 pointer-events-none">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    El número de serie o IMEI facilita la identificación exacta de componentes originales y agiliza las aperturas de órdenes en el taller.
                  </p>
                </div>

                {/* Sección 3: Subida de Imagen con Drag & Drop Estilizado */}
                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Fotografía del Equipo <span className="text-slate-400 font-normal font-mono">(Opcional)</span>
                  </label>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleInputChange}
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/jfif,image/avif,image/heic,image/heif,.jfif,.avif,.heic,.heif"
                    className="hidden"
                  />

                  {!imagenPreview ? (
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                        isDragging
                          ? 'border-[#06B6D4] bg-cyan-500/10 scale-[1.01]'
                          : 'border-slate-700 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-900'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-xl bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center text-[#06B6D4] shadow-sm">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-slate-200">
                          Arrastra y suelta una imagen aquí, o{' '}
                          <span className="text-[#06B6D4] font-bold hover:underline">
                            explora tus archivos
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1 font-mono">
                          Formatos admitidos: PNG, JPG, JPEG, WEBP, JFIF, AVIF, HEIC (Hasta 5 MB)
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="px-4 py-2 rounded-xl bg-[#06B6D4]/15 hover:bg-[#06B6D4]/25 text-[#06B6D4] border border-[#06B6D4]/30 text-xs font-bold transition-all"
                      >
                        Seleccionar Imagen
                      </button>
                    </div>
                  ) : (
                    /* Tarjeta con Preview de Imagen Cargada */
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={imagenPreview}
                          alt="Preview del equipo"
                          className="w-16 h-16 rounded-xl object-cover border border-slate-700 shadow-md shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate max-w-xs">
                            {imagenFile?.name}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {(imagenFile?.size / 1024 / 1024).toFixed(2)} MB • Archivo listo para adjuntar
                          </p>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono">
                            ✓ Imagen validada
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-semibold border border-slate-700 transition-colors"
                        >
                          Cambiar
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold border border-rose-500/30 transition-colors"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Barra Inferior de Acciones */}
                <div className="pt-6 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-slate-400 font-mono">
                    {!isFormValid ? (
                      <span className="text-amber-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Selecciona marca y modelo para continuar
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Formulario listo para registrar
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => navigate('/tienda')}
                      disabled={isSubmitting}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors"
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={!isFormValid || isSubmitting}
                      className={`w-full sm:w-auto px-7 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 ${
                        !isFormValid || isSubmitting
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                          : 'bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-[0.98]'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                          <span>Guardando equipo...</span>
                        </>
                      ) : (
                        <>
                          <span>Registrar Equipo</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </form>

            </div>

          </motion.div>

        </main>

      </div>

    </div>
  );
}
