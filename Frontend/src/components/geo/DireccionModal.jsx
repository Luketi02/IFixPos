import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function DireccionModal({
  isOpen,
  onClose,
  direccionData = null,
  onSaved
}) {
  const { token } = useAuth();
  const isEditing = Boolean(direccionData && direccionData.id_direccion);

  // Estados de catálogos en cascada
  const [paises, setPaises] = useState([]);
  const [provincias, setProvincias] = useState([]);
  const [ciudades, setCiudades] = useState([]);

  // Estados de carga de datos
  const [isLoadingPaises, setIsLoadingPaises] = useState(false);
  const [isLoadingProvincias, setIsLoadingProvincias] = useState(false);
  const [isLoadingCiudades, setIsLoadingCiudades] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtro de búsqueda rápida para ciudades
  const [filtroCiudad, setFiltroCiudad] = useState('');

  // Mensaje de error general con fade-out a los 6 segundos
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Datos del formulario
  const [formData, setFormData] = useState({
    alias: '',
    calle: '',
    numero: '',
    piso: '',
    nro_dpto: '',
    barrio: '',
    id_pais: '',
    id_provincia: '',
    id_ciudad: ''
  });

  // Temporizador para desvanecer mensaje de error a los 6 segundos
  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => {
      setErrorMessage('');
    }, 6000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  // Parsear calle y número si viene como string combinado (ej: "Av. San Martín 1234")
  const parsearCalleYNumero = (textoCalle = '') => {
    if (!textoCalle) return { calle: '', numero: '' };
    const regex = /^(.*?)(?:\s+(\d+[a-zA-Z0-9\-\/]*))$/;
    const match = textoCalle.trim().match(regex);
    if (match) {
      return { calle: match[1].trim(), numero: match[2].trim() };
    }
    return { calle: textoCalle.trim(), numero: '' };
  };

  // Carga inicial al abrir el modal
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage('');
    setFieldErrors({});
    setFiltroCiudad('');

    const inicializarModal = async () => {
      setIsLoadingPaises(true);
      try {
        // Cargar países disponibles
        const resPaises = await axios.get(`${API_BASE_URL}/api/geo/paises/?todas=true`);
        const listaPaises = Array.isArray(resPaises.data) ? resPaises.data : [];
        setPaises(listaPaises);

        if (direccionData) {
          // MODO EDICIÓN
          const calleOriginal = direccionData.nro_calle || direccionData.calle_numero || '';
          const { calle: parsedCalle, numero: parsedNumero } = parsearCalleYNumero(calleOriginal);

          const idPais = direccionData.id_pais ||
            direccionData.ciudad_info?.provincia?.pais?.id_pais ||
            (listaPaises.length > 0 ? listaPaises[0].id_pais : '');

          const idProv = direccionData.id_provincia ||
            direccionData.ciudad_info?.provincia?.id_provincia || '';

          const idCiud = direccionData.id_ciudad ||
            direccionData.ciudad_info?.id_ciudad || '';

          setFormData({
            alias: direccionData.alias || '',
            calle: parsedCalle,
            numero: parsedNumero,
            piso: direccionData.piso !== null && direccionData.piso !== undefined ? String(direccionData.piso) : '',
            nro_dpto: direccionData.nro_dpto || '',
            barrio: direccionData.nombre_barrio || direccionData.barrio || '',
            id_pais: idPais ? String(idPais) : '',
            id_provincia: idProv ? String(idProv) : '',
            id_ciudad: idCiud ? String(idCiud) : ''
          });

          // Cargar provincias del país
          if (idPais) {
            setIsLoadingProvincias(true);
            const resProv = await axios.get(`${API_BASE_URL}/api/geo/provincias/?pais_id=${idPais}&todas=true`);
            const listaProv = Array.isArray(resProv.data) ? resProv.data : [];
            setProvincias(listaProv);
            setIsLoadingProvincias(false);
          }

          // Cargar ciudades de la provincia
          if (idProv) {
            setIsLoadingCiudades(true);
            const resCiud = await axios.get(`${API_BASE_URL}/api/geo/ciudades/?provincia_id=${idProv}&todas=true`);
            const listaCiud = Array.isArray(resCiud.data) ? resCiud.data : [];
            setCiudades(listaCiud);
            setIsLoadingCiudades(false);
          }
        } else {
          // MODO CREACIÓN: Argentina por defecto si existe
          let defaultPaisId = '';
          if (listaPaises.length > 0) {
            const arg = listaPaises.find((p) => p.nombre_pais.toLowerCase().includes('argentina')) || listaPaises[0];
            defaultPaisId = String(arg.id_pais);
          }

          setFormData({
            alias: '',
            calle: '',
            numero: '',
            piso: '',
            nro_dpto: '',
            barrio: '',
            id_pais: defaultPaisId,
            id_provincia: '',
            id_ciudad: ''
          });

          if (defaultPaisId) {
            setIsLoadingProvincias(true);
            const resProv = await axios.get(`${API_BASE_URL}/api/geo/provincias/?pais_id=${defaultPaisId}&todas=true`);
            setProvincias(Array.isArray(resProv.data) ? resProv.data : []);
            setIsLoadingProvincias(false);
          }
        }
      } catch (err) {
        console.error('Error al inicializar formulario geográfico:', err);
        setErrorMessage('No fue posible cargar el catálogo geográfico inicial.');
      } finally {
        setIsLoadingPaises(false);
      }
    };

    inicializarModal();
  }, [isOpen, direccionData]);

  // Cascada: Cambio de País
  const handlePaisChange = async (e) => {
    const nuevoPaisId = e.target.value;
    setFormData((prev) => ({
      ...prev,
      id_pais: nuevoPaisId,
      id_provincia: '',
      id_ciudad: ''
    }));
    setProvincias([]);
    setCiudades([]);
    setFiltroCiudad('');
    setFieldErrors((prev) => ({ ...prev, id_pais: '', id_provincia: '', id_ciudad: '' }));

    if (nuevoPaisId) {
      setIsLoadingProvincias(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/geo/provincias/?pais_id=${nuevoPaisId}&todas=true`);
        setProvincias(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error al cargar provincias:', err);
        setErrorMessage('Error al cargar las provincias del país seleccionado.');
      } finally {
        setIsLoadingProvincias(false);
      }
    }
  };

  // Cascada: Cambio de Provincia
  const handleProvinciaChange = async (e) => {
    const nuevaProvId = e.target.value;
    setFormData((prev) => ({
      ...prev,
      id_provincia: nuevaProvId,
      id_ciudad: ''
    }));
    setCiudades([]);
    setFiltroCiudad('');
    setFieldErrors((prev) => ({ ...prev, id_provincia: '', id_ciudad: '' }));

    if (nuevaProvId) {
      setIsLoadingCiudades(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/geo/ciudades/?provincia_id=${nuevaProvId}&todas=true`);
        setCiudades(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error al cargar ciudades:', err);
        setErrorMessage('Error al cargar las ciudades de la provincia seleccionada.');
      } finally {
        setIsLoadingCiudades(false);
      }
    }
  };

  // Validación local del formulario
  const validarFormulario = () => {
    const errors = {};

    if (!formData.calle || !formData.calle.trim()) {
      errors.calle = 'La calle es obligatoria.';
    }

    if (!formData.numero || !formData.numero.trim()) {
      errors.numero = 'El número es obligatorio.';
    }

    if (!formData.barrio || !formData.barrio.trim()) {
      errors.barrio = 'El barrio es obligatorio.';
    }

    if (!formData.id_ciudad) {
      errors.id_ciudad = 'Debe seleccionar una ciudad.';
    }

    if (formData.piso && isNaN(Number(formData.piso))) {
      errors.piso = 'El piso debe ser numérico.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Envío del formulario (Creación o Edición)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validarFormulario()) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const calleCompleta = `${formData.calle.trim()} ${formData.numero.trim()}`;

    const payload = {
      id_ciudad: Number(formData.id_ciudad),
      alias: formData.alias?.trim() || null,
      nro_calle: calleCompleta,
      calle_numero: calleCompleta,
      nombre_barrio: formData.barrio.trim(),
      barrio: formData.barrio.trim(),
      piso: formData.piso ? Number(formData.piso) : null,
      nro_dpto: formData.nro_dpto?.trim() || null
    };

    try {
      let response;
      if (isEditing) {
        // PUT /api/geo/mis-direcciones/<id>/
        response = await axios.put(
          `${API_BASE_URL}/api/geo/mis-direcciones/${direccionData.id_direccion}/`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
      } else {
        // POST /api/geo/mis-direcciones/
        response = await axios.post(
          `${API_BASE_URL}/api/geo/mis-direcciones/`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
      }

      if (response.status === 200 || response.status === 201) {
        if (onSaved) {
          onSaved(response.data?.mensaje || 'Dirección guardada con éxito.');
        }
        onClose();
      }
    } catch (err) {
      console.error('Error al guardar dirección:', err);
      const dataErr = err.response?.data;
      if (typeof dataErr === 'string') {
        setErrorMessage(dataErr);
      } else if (dataErr?.error) {
        setErrorMessage(dataErr.error);
      } else if (dataErr && typeof dataErr === 'object') {
        const firstKey = Object.keys(dataErr)[0];
        const msg = Array.isArray(dataErr[firstKey]) ? dataErr[firstKey][0] : dataErr[firstKey];
        setErrorMessage(`${firstKey}: ${msg}`);
      } else {
        setErrorMessage('Ocurrió un error inesperado al guardar la dirección.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtrado dinámico de ciudades para facilitar la selección
  const ciudadesFiltradas = ciudades.filter((c) =>
    c.nombre_ciudad.toLowerCase().includes(filtroCiudad.trim().toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-xl bg-[#1E293B] border border-cyan-500/30 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 my-8 text-[#F8FAFC]"
        >
          {/* Encabezado del Modal */}
          <div className="flex items-start justify-between pb-4 border-b border-slate-700/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#06B6D4]/20 to-[#8B5CF6]/20 border border-cyan-500/30 flex items-center justify-center text-[#06B6D4] shadow-inner">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight text-[#F8FAFC]">
                  {isEditing ? 'Modificar Dirección' : 'Nueva Dirección'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isEditing
                    ? 'Actualiza los datos de tu domicilio registrado en el sistema.'
                    : 'Registra una nueva ubicación para envíos, recepción de equipos y facturación.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Alerta de Error con Auto Fade-out */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-red-200 text-xs flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="flex-1">{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  className="text-red-400 hover:text-red-200 font-mono text-xs"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Campo: Alias (Opcional) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Alias de Referencia <span className="text-slate-500 font-normal">(Opcional)</span>
              </label>
              <input
                type="text"
                value={formData.alias}
                onChange={(e) => setFormData((prev) => ({ ...prev, alias: e.target.value }))}
                placeholder="Ej. Casa, Taller, Oficina Central"
                maxLength={100}
                disabled={isSubmitting}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-[#F8FAFC] text-sm placeholder-slate-500 transition-all focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/40 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)]"
              />
            </div>

            {/* Cascada Geográfica: País & Provincia */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  País <span className="text-cyan-400">*</span>
                </label>
                <select
                  value={formData.id_pais}
                  onChange={handlePaisChange}
                  disabled={isLoadingPaises || isSubmitting}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-[#F8FAFC] text-sm transition-all focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/40 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)]"
                >
                  <option value="">-- Seleccionar País --</option>
                  {paises.map((p) => (
                    <option key={p.id_pais} value={p.id_pais}>
                      {p.nombre_pais}
                    </option>
                  ))}
                </select>
                {fieldErrors.id_pais && (
                  <p className="text-[10px] text-red-400">{fieldErrors.id_pais}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Provincia <span className="text-cyan-400">*</span>
                  {isLoadingProvincias && (
                    <span className="text-[10px] text-cyan-400 font-mono ml-2">Cargando...</span>
                  )}
                </label>
                <select
                  value={formData.id_provincia}
                  onChange={handleProvinciaChange}
                  disabled={!formData.id_pais || isLoadingProvincias || isSubmitting}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-[#F8FAFC] text-sm transition-all focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/40 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)] disabled:opacity-50"
                >
                  <option value="">-- Seleccionar Provincia --</option>
                  {provincias.map((prov) => (
                    <option key={prov.id_provincia} value={prov.id_provincia}>
                      {prov.nombre_provincia}
                    </option>
                  ))}
                </select>
                {fieldErrors.id_provincia && (
                  <p className="text-[10px] text-red-400">{fieldErrors.id_provincia}</p>
                )}
              </div>
            </div>

            {/* Cascada Geográfica: Ciudad con buscador integrado */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-300">
                  Ciudad <span className="text-cyan-400">*</span>
                  {isLoadingCiudades && (
                    <span className="text-[10px] text-cyan-400 font-mono ml-2">Cargando...</span>
                  )}
                </label>
                {ciudades.length > 8 && (
                  <input
                    type="text"
                    value={filtroCiudad}
                    onChange={(e) => setFiltroCiudad(e.target.value)}
                    placeholder="Filtrar ciudad..."
                    className="text-[11px] bg-slate-900/90 border border-slate-700/80 rounded-lg px-2.5 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6]"
                  />
                )}
              </div>
              <select
                value={formData.id_ciudad}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, id_ciudad: e.target.value }));
                  setFieldErrors((prev) => ({ ...prev, id_ciudad: '' }));
                }}
                disabled={!formData.id_provincia || isLoadingCiudades || isSubmitting}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-[#F8FAFC] text-sm transition-all focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/40 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)] disabled:opacity-50"
              >
                <option value="">-- Seleccionar Ciudad --</option>
                {ciudadesFiltradas.map((c) => (
                  <option key={c.id_ciudad} value={c.id_ciudad}>
                    {c.nombre_ciudad}
                  </option>
                ))}
              </select>
              {fieldErrors.id_ciudad && (
                <p className="text-[10px] text-red-400">{fieldErrors.id_ciudad}</p>
              )}
            </div>

            {/* Fila: Calle (Requerido) y Número (Requerido) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Calle <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.calle}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, calle: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, calle: '' }));
                  }}
                  placeholder="Ej. Av. Colón, San Martín"
                  disabled={isSubmitting}
                  className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-[#F8FAFC] text-sm placeholder-slate-500 transition-all focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/40 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)] ${
                    fieldErrors.calle ? 'border-red-500 ring-1 ring-red-500/50' : 'border-slate-700'
                  }`}
                />
                {fieldErrors.calle && (
                  <p className="text-[10px] text-red-400">{fieldErrors.calle}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Número <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.numero}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, numero: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, numero: '' }));
                  }}
                  placeholder="Ej. 1234, 450 Bis"
                  disabled={isSubmitting}
                  className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-[#F8FAFC] text-sm placeholder-slate-500 transition-all focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/40 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)] ${
                    fieldErrors.numero ? 'border-red-500 ring-1 ring-red-500/50' : 'border-slate-700'
                  }`}
                />
                {fieldErrors.numero && (
                  <p className="text-[10px] text-red-400">{fieldErrors.numero}</p>
                )}
              </div>
            </div>

            {/* Fila: Piso (Opcional) y Dpto (Opcional) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Piso <span className="text-slate-500 font-normal">(Opcional)</span>
                </label>
                <input
                  type="number"
                  value={formData.piso}
                  onChange={(e) => setFormData((prev) => ({ ...prev, piso: e.target.value }))}
                  placeholder="Ej. 2, 4"
                  disabled={isSubmitting}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-[#F8FAFC] text-sm font-mono placeholder-slate-500 transition-all focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/40 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Departamento / Oficina <span className="text-slate-500 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={formData.nro_dpto}
                  onChange={(e) => setFormData((prev) => ({ ...prev, nro_dpto: e.target.value }))}
                  placeholder="Ej. 2B, Oficina 401"
                  maxLength={50}
                  disabled={isSubmitting}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-[#F8FAFC] text-sm placeholder-slate-500 transition-all focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/40 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)]"
                />
              </div>
            </div>

            {/* Campo: Barrio (Requerido) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Barrio <span className="text-cyan-400">*</span>
              </label>
              <input
                type="text"
                value={formData.barrio}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, barrio: e.target.value }));
                  setFieldErrors((prev) => ({ ...prev, barrio: '' }));
                }}
                placeholder="Ej. Centro, Nueva Córdoba, Alberdi"
                maxLength={150}
                disabled={isSubmitting}
                className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-[#F8FAFC] text-sm placeholder-slate-500 transition-all focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/40 focus:shadow-[0_0_15px_rgba(139,92,246,0.25)] ${
                  fieldErrors.barrio ? 'border-red-500 ring-1 ring-red-500/50' : 'border-slate-700'
                }`}
              />
              {fieldErrors.barrio && (
                <p className="text-[10px] text-red-400">{fieldErrors.barrio}</p>
              )}
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700/60">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] hover:opacity-90 text-white transition-opacity text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Guardando Dirección...</span>
                  </>
                ) : (
                  <span>{isEditing ? 'Guardar Cambios' : 'Registrar Dirección'}</span>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
